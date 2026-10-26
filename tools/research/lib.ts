/**
 * Research harness (balance study, no game changes): human-like players, a traced round runner, a clock switch and
 * an auto-placer that takes any player. Everything drives the real Game; nothing in src/ is modified.
 */
import { neutralMods, type Mods } from '../../src/data/mods';
import { computeMods, decalGrowth, type DecalPick } from '../../src/data/decals';
import { BOSSES, type BossId } from '../../src/data/bosses';
import type { MachineId } from '../../src/data/bigboi';
import { footprint, makePart, PARTS, type PartId, type PartInstance } from '../../src/data/parts';
import { Game } from '../../src/game/game';
import { Bot } from '../../src/sim/bot';
import { DECOR_SLOT } from '../../src/sim/cabinet';
import { BUILD_AREA } from '../../src/sim/constants';
import { canPlace, cloneLayout, starterLayout, type Layout } from '../../src/sim/layout';
import { Rng } from '../../src/sim/rng';
import type { Input, Sim } from '../../src/sim/sim';

// ---- players -------------------------------------------------------------------------------------------------

export interface Profile {
  name: string;
  /** Chance an approach to a flipper is not reacted to at all. */
  miss: number;
  /** Reaction delay range (s) from the ball entering reach to the press. */
  react: [number, number];
  /** Holds and cradles a slow ball before shooting it. */
  cradle: boolean;
  /** Random panic presses per second while balls are in play. */
  flail: number;
  /** Crossed Wires: chance a press goes to the old (wrong) hand while the buttons are swapped. */
  confuse?: number;
}

export const PROFILES: Record<string, Profile> = {
  pro: { name: 'pro', miss: 0.01, react: [0.0, 0.015], cradle: true, flail: 0 },
  avg: { name: 'avg', miss: 0.06, react: [0.01, 0.04], cradle: true, flail: 0.1 },
  poor: { name: 'poor', miss: 0.15, react: [0.03, 0.07], cradle: false, flail: 0.4 },
  avgConfused: { name: 'avgConfused', miss: 0.06, react: [0.01, 0.04], cradle: true, flail: 0.1, confuse: 0.3 },
};

export interface Player { decide(sim: Sim): Input; presses: number }

/**
 * A human-like flipper player. Per flipper side: when a ball comes into reach and the flipper is free, one decision:
 * miss it (ignored for a moment: usually a drain) or press after a reaction delay. A cradling player keeps holding
 * while the ball sits on the flipper, then lets it roll and shoots; a non-cradler releases after a tap and re-decides.
 */
export class Human implements Player {
  private rng: Rng;
  private hold = { L: 0, R: 0 };
  private pending = { L: -1, R: -1 };
  private ignore = { L: false, R: false };
  private lastReach = { L: -9, R: -9 };
  private cradle = { L: -1, R: -1 };
  private cradleFor = { L: 0, R: 0 };
  private dropUntil = { L: 0, R: 0 };
  private plungeFor = 0;
  private plungeStart = -1;
  private wasDown = { L: false, R: false };
  private wrong = { L: false, R: false };
  private wheelPlan = new Map<string, number>();
  private wheelSeg = 0;
  presses = 0;
  constructor(seed: number, public p: Profile) { this.rng = new Rng(seed * 7 + 3); }

  decide(sim: Sim): Input {
    const t = sim.time;
    const input: Input = { left: false, right: false, plunge: false, nudge: 0 };
    if (sim.awaitingPlunge) {
      if (this.plungeStart < 0 || t - this.plungeStart > this.plungeFor + 0.4) { this.plungeStart = t; this.plungeFor = this.rng.range(0.75, 1.0); }
      input.plunge = t - this.plungeStart < this.plungeFor;
    } else this.plungeStart = -1;
    const reach = { L: false, R: false }, slow = { L: false, R: false };
    const balls = sim.ballStates();
    for (const b of balls) {
      if (b.inLane || b.held) continue;
      for (const f of sim.flipperStates()) {
        const sign = f.side === 'L' ? 1 : -1;
        const dx = (b.x - f.pivotX) * sign, dy = b.y - f.pivotY;
        if (dx > 0.3 && dx < f.length + 0.6 && dy > -1 && dy < 2.4 && b.vy < 8) {
          reach[f.side] = true;
          if (Math.hypot(b.vx, b.vy) < 1.5) slow[f.side] = true;
        }
      }
    }
    for (const side of ['L', 'R'] as const) {
      const holding = t < this.hold[side];
      // a new approach (the ball was out of reach a while): one roll, react to it or not at all
      if (reach[side] && t - this.lastReach[side] > 0.3) this.ignore[side] = this.rng.next() < this.p.miss;
      if (reach[side]) this.lastReach[side] = t;
      if (reach[side] && !holding && this.pending[side] < 0 && !this.ignore[side] && t >= this.dropUntil[side]) this.pending[side] = t + this.rng.range(this.p.react[0], this.p.react[1]);
      if (this.pending[side] >= 0 && t >= this.pending[side]) { this.hold[side] = t + 0.18; this.pending[side] = -1; this.wrong[side] = sim.flippersSwapped && this.rng.next() < (this.p.confuse ?? 0); }
      // a cradler keeps the flipper up while the ball is on it, then drops it and shoots
      if (this.p.cradle && holding && reach[side]) this.hold[side] = Math.max(this.hold[side], t + 0.05);
      if (this.p.cradle && holding && slow[side]) {
        if (this.cradle[side] < 0) { this.cradle[side] = t; this.cradleFor[side] = this.rng.range(0.3, 1.2); }
        if (t - this.cradle[side] > this.cradleFor[side]) { this.dropUntil[side] = t + this.rng.range(0.15, 0.3); this.hold[side] = 0; this.cradle[side] = -1; }
      } else this.cradle[side] = -1;
    }
    // a Spider Wheel holding a ball: the pro times the press to land each segment in turn (Wheel Mania), the avg player presses whenever, the poor player waits it out (Zilch)
    const raw = sim as unknown as { balls: { held: { uid: number; since?: number } | null }[]; parts: Map<number, { inst: { def: string } }>; dt: number };
    for (const b of raw.balls ?? []) {
      if (!b.held || b.held.since === undefined || raw.parts?.get(b.held.uid)?.inst.def !== 'wheel') continue;
      const key = `${b.held.uid}:${b.held.since}`;
      if (!this.wheelPlan.has(key)) {
        const t0 = b.held.since * (raw.dt ?? 1 / 240);
        const at = this.p.name === 'pro' ? t0 + ((this.wheelSeg++ % 8) + 0.5) / 5 + this.rng.range(-0.02, 0.02) : this.p.name === 'poor' ? Infinity : t0 + this.rng.range(0.3, 2.5);
        this.wheelPlan.set(key, at);
        if (this.wheelPlan.size > 32) this.wheelPlan.delete(this.wheelPlan.keys().next().value!);
      }
      if (t >= this.wheelPlan.get(key)!) this.hold.L = Math.max(this.hold.L, t + 0.08);
    }
    if (this.p.flail > 0 && balls.length && this.rng.next() < this.p.flail / 240) this.hold[this.rng.next() < 0.5 ? 'L' : 'R'] = t + 0.18;
    input.left = t < this.hold.L;
    input.right = t < this.hold.R;
    for (const side of ['L', 'R'] as const) {
      const down = side === 'L' ? input.left : input.right;
      if (down && !this.wasDown[side]) this.presses++;
      this.wasDown[side] = down;
    }
    if (sim.flippersSwapped) {
      // swap hands, as a player would; a confused press still goes to the old hand
      const L = input.left, R = input.right;
      input.left = (R && !this.wrong.R) || (L && this.wrong.L);
      input.right = (L && !this.wrong.L) || (R && this.wrong.R);
    }
    return input;
  }
}

/** The repo's own par bot, for comparison. */
export class ParBot implements Player {
  private b: Bot;
  presses = 0;
  constructor(seed: number, skill = 0.6) { this.b = new Bot(seed, skill); }
  private was = { L: false, R: false };
  decide(sim: Sim) {
    const i = this.b.decide(sim);
    if (i.left && !this.was.L) this.presses++;
    if (i.right && !this.was.R) this.presses++;
    this.was = { L: i.left, R: i.right };
    return i;
  }
}

export const makePlayer = (profile: string, seed: number): Player => (profile === 'par' ? new ParBot(seed * 1000 + 1) : new Human(seed, PROFILES[profile]));

// ---- tracing ------------------------------------------------------------------------------------------------------

export interface PartTrace {
  /** Ball hits (the sim saw a ball touch it), zaps (scored by a zap), spark hits (scored by a spark). */
  hits: number; zaps: number; sparkHits: number;
  points: number;
  /** Scoring events of every kind. */
  events: number;
  /** What special things it did: labels, zap kinds, sparks thrown, balls made... counted. */
  triggers: Record<string, number>;
}

export interface RoundTrace {
  /** Score after each ball, and the round's whole score. */
  cumulative: number[];
  score: number;
  coins: number;
  seconds: number;
  ballSeconds: number[];
  drains: number; timeouts: number; saves: number; searches: number; tilts: number;
  presses: number;
  peakMult: number;
  maxBalls: number; maxSparks: number;
  parts: Partial<Record<PartId, PartTrace>>;
  /** Zap points by what made them (tesla, keg, beam, gong...), and every point scored by sparks. */
  zapBy: Record<string, { n: number; points: number }>;
  sparkPoints: number; sparkEvents: number;
  /** Wall-clock ms spent stepping, steps taken, and the slowest step. */
  wallMs: number; steps: number; worstStepMs: number;
  /** A clock-off round cut short by the safety cap. */
  capped: boolean;
  /** Round result in a real round: won/lost and the ball it was cleared on (0 = never). */
  won?: boolean; clearBall?: number; goal?: number;
}

const bump = (o: Record<string, number>, k: string, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const trace = (r: RoundTrace, def: PartId): PartTrace => (r.parts[def] ??= { hits: 0, zaps: 0, sparkHits: 0, points: 0, events: 0, triggers: {} });

export interface PlayOpts {
  profile: string;
  seed: number;
  /** No ball clock and no 60 s ball age limit; a ball is cut at `capSeconds` instead. */
  noClock?: boolean;
  capSeconds?: number;
  /** Play every ball out (no goal), or play a real round against the game's goal. */
  real?: boolean;
  goalOverride?: number;
  /** Trace part hits and triggers (a little slower). */
  detail?: boolean;
  /** Score at these sim seconds of the round (clock-off growth curves). */
  marks?: number[];
  onMark?: (t: number, score: number) => void;
}

/** Play one round on a prepared Game (layout, mods, round, decals already set). Leaves the Game in roundEnd/runOver. */
export function playRound(g: Game, o: PlayOpts): RoundTrace {
  if (!o.real) g.goalOverride = o.goalOverride ?? Infinity;
  else g.goalOverride = o.goalOverride ?? null;
  g.seed = o.seed * 977 + 13;
  if (o.noClock) { if (g.fixedMods) g.fixedMods.ballClock = 1e9; }
  g.startRound();
  const player = makePlayer(o.profile, o.seed);
  const r: RoundTrace = {
    cumulative: [], score: 0, coins: 0, seconds: 0, ballSeconds: [], drains: 0, timeouts: 0, saves: 0, searches: 0, tilts: 0, presses: 0,
    peakMult: 1, maxBalls: 0, maxSparks: 0, parts: {}, zapBy: {}, sparkPoints: 0, sparkEvents: 0, wallMs: 0, steps: 0, worstStepMs: 0, capped: false,
  };
  const cap = o.capSeconds ?? 900;
  const uidDef = new Map<number, PartId>();
  const defOf = (uid: number) => { let d = uidDef.get(uid); if (!d) { d = g.layout.parts.find((p) => p.uid === uid)?.def; if (d) uidDef.set(uid, d); } return d; };
  let ballStart = 0, markI = 0, cutting = false;
  const marks = o.marks ?? [];
  const wall0 = performance.now();
  for (let guard = 0; g.mode === 'round' && guard < 240 * 60 * 60; guard++) {
    if (o.noClock && !cutting) {
      const sim = g.sim as unknown as { balls: { age: number }[] };
      for (const b of sim.balls) b.age = 0;
    }
    const input = player.decide(g.sim);
    const s0 = o.detail ? performance.now() : 0;
    const res = g.step(input);
    if (o.detail) { const d = performance.now() - s0; if (d > r.worstStepMs) r.worstStepMs = d; }
    r.steps++;
    for (const e of res.sim) {
      if (e.type === 'drain') { if (e.reason === 'timeout') r.timeouts++; else r.drains++; }
      else if (e.type === 'ballSaved') r.saves++;
      else if (e.type === 'ballSearch') r.searches++;
      else if (e.type === 'tilt') r.tilts++;
      else if (o.detail) {
        if (e.type === 'partHit' && !e.zap && !e.spark) { const d = defOf(e.uid); if (d) { trace(r, d).hits++; if (e.caught) bump(trace(r, d).triggers, 'caught'); if (e.bucket) bump(trace(r, d).triggers, 'bucket'); if (e.ride) bump(trace(r, d).triggers, 'ride'); if (e.edge) bump(trace(r, d).triggers, 'edge'); if (e.goal) bump(trace(r, d).triggers, 'goal'); if (e.swallow) bump(trace(r, d).triggers, 'swallow'); if (e.bankComplete) bump(trace(r, d).triggers, 'bankSet'); } }
        else if (e.type === 'partHit' && e.spark && !e.zap) { const d = defOf(e.uid); if (d && e.swallow) bump(trace(r, d).triggers, 'swallow'); }
        else if (e.type === 'extraBall') { const d = defOf(e.uid); if (d) bump(trace(r, d).triggers, 'extraBall'); }
        else if (e.type === 'gremlin') { const d = defOf(e.uid); if (d) bump(trace(r, d).triggers, 'gremlinKnock'); }
      }
    }
    if (o.detail) {
      for (const s of res.score) {
        const t = trace(r, s.def);
        t.points += s.points; t.events++;
        if (s.zap) { t.zaps++; bump(t.triggers, 'zappedBy:' + s.zap.by); const z = (r.zapBy[s.zap.by] ??= { n: 0, points: 0 }); z.n++; z.points += s.points; }
        else if (s.spark) { t.sparkHits++; r.sparkPoints += s.points; r.sparkEvents++; }
        if (s.label) bump(t.triggers, s.label.replace(/[0-9.]+/g, '#'));
        if (s.sparks?.length) bump(t.triggers, 'sparksOut', s.sparks.reduce((a, b) => a + b.n, 0));
        if (s.beam) bump(t.triggers, 'beam');
        if (s.blast) bump(t.triggers, 'blast');
        if (s.wheel) bump(t.triggers, 'wheel:' + s.wheel.award);
        if (s.grow) bump(t.triggers, 'grow');
        if (s.balls) bump(t.triggers, 'ballsOut', s.balls.n);
        if (s.rocket) bump(t.triggers, 'rocket');
        if (s.hot) bump(t.triggers, 'hotShotPaid');
        if (s.tier !== undefined) bump(t.triggers, 'tier' + s.tier);
        if (s.money) bump(t.triggers, '$', s.money);
        for (const n of s.notes) { const m = /(lamp|plate|strip|spot|rank|echo|ruby|seal|leaf|order|lucky|midnight|wizard|ritual|heat|overclock|level|lit|golden)/i.exec(n); if (m) bump(t.triggers, 'note:' + m[1].toLowerCase()); }
        if (s.multAfter > r.peakMult) r.peakMult = s.multAfter;
      }
      r.maxBalls = Math.max(r.maxBalls, g.sim.ballCount);
      const sp = g.sim.sparkStates().length;
      if (sp > r.maxSparks) r.maxSparks = sp;
    } else for (const s of res.score) if (s.multAfter > r.peakMult) r.peakMult = s.multAfter;
    while (markI < marks.length && g.sim.time >= marks[markI]) { o.onMark?.(marks[markI], g.scorer.score); markI++; }
    if (res.game.some((e) => e.type === 'ballEnd')) {
      r.cumulative.push(g.scorer.score);
      r.ballSeconds.push(g.sim.time - ballStart);
      ballStart = g.sim.time;
      cutting = false;
    }
    if (o.noClock && g.mode === 'round' && g.sim.time - ballStart > cap) {
      r.capped = true;
      cutting = true;
      // end the ball: drain every ball in play (they time out on the next step)
      const sim = g.sim as unknown as { balls: { age: number }[] };
      for (const b of sim.balls) b.age = 1e15;
    }
  }
  r.wallMs = performance.now() - wall0;
  r.score = g.scorer.score;
  r.coins = g.scorer.money;
  r.seconds = g.sim.time;
  r.presses = player.presses;
  if (o.real) { r.won = g.mode === 'roundEnd'; r.goal = g.scorer.goal; r.clearBall = r.won ? r.cumulative.length : 0; }
  return r;
}

// ---- machines ---------------------------------------------------------------------------------------------------

export interface Setup {
  layout: Layout;
  machine?: MachineId;
  decals?: DecalPick[];
  /** Extra mods on top of the decals (tools: start Mult for a late context). */
  tweak?: (m: Mods) => void;
  boss?: BossId | null;
  round?: number;
  rings?: number;
  money?: number;
}

/** A Game ready to play `s` with fixed mods (decals + boss + tweak), every ball out. */
export function gameFor(s: Setup): Game {
  const g = new Game();
  g.machine = s.machine ?? 'factory';
  g.layout = cloneLayout(s.layout);
  g.decals = (s.decals ?? []).map((d) => ({ ...d }));
  g.round = s.round ?? 1;
  g.rings = s.rings ?? 0;
  g.money = s.money ?? 15;
  refreshMods(g, s);
  g.pending = null;
  return g;
}

/** Recompute the fixed mods from the Game's decals (their growth too), the boss and the tweak. */
export function refreshMods(g: Game, s: Setup) {
  const m = computeMods(g.decals, neutralMods());
  s.tweak?.(m);
  if (s.boss) BOSSES[s.boss].mods?.(m);
  g.fixedMods = m;
  if (s.boss) {
    // the Jammer reads the boss of the round: put it in a boss round of a plan that has it
    g.round = 3;
    g.bossPlan = [s.boss, s.boss, s.boss, s.boss, s.boss];
  } else if (g.round % 3 === 0) g.round += 1;
  g.mods = m;
}

/** After a measured round: age parts, grow Momentum/Afterglow as if cleared, and ready the next round on the same Game. */
export function nextRound(g: Game, s: Setup, cleared = true) {
  for (const d of g.decals) {
    const gr = decalGrowth(d, cleared, g.scorer.peakGain);
    if (gr) d.grown = Math.round(((d.grown ?? 0) + gr) * 100) / 100;
  }
  const r = g.round;
  g.continueAfterRound();
  g.pending = null;
  g.round = r; // keep the measuring round (bosses and offers do not matter here)
  refreshMods(g, s);
  g.toWorkshop();
}

export const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; };
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const quant = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const i = p * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

// ---- placement ---------------------------------------------------------------------------------------------------

/** A legal spot near (x, y) for this part, or null: spiral out from the wanted spot. */
export function nearestSpot(l: Layout, id: PartId, x: number, y: number, ignoreUid?: number): { x: number; y: number } | null {
  if (PARTS[id].kind === 'decor') return canPlace(l, id, DECOR_SLOT.x, DECOR_SLOT.y, ignoreUid) ? { ...DECOR_SLOT } : null;
  const r = footprint(PARTS[id]);
  x = Math.min(BUILD_AREA.x1 - r, Math.max(BUILD_AREA.x0 + r, x));
  y = Math.min(BUILD_AREA.y1 - r, Math.max(BUILD_AREA.y0 + r, y));
  if (canPlace(l, id, x, y, ignoreUid)) return { x, y };
  for (let d = 0.25; d < 12; d += 0.25) {
    const n = Math.max(8, Math.round(d * 8));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = Math.round((x + Math.cos(a) * d) * 10) / 10, py = Math.round((y + Math.sin(a) * d) * 10) / 10;
      if (canPlace(l, id, px, py, ignoreUid)) return { x: px, y: py };
    }
  }
  return null;
}

export interface SpecPart { def: PartId; x?: number; y?: number; angle?: number; dials?: Record<string, number>; inlay?: PartId; level?: number; role?: string }

/** Lay out a spec: every part at (or as near as possible to) its spot. Returns the layout and what had to move or did not fit. */
export function layoutFrom(parts: SpecPart[], opts: { starterPops?: boolean } = {}): { layout: Layout; moved: number; missing: PartId[] } {
  const l = starterLayout();
  if (!opts.starterPops) l.parts = l.parts.filter((p) => p.fixed);
  let moved = 0;
  const missing: PartId[] = [];
  const rng = new Rng(5);
  let group = 500;
  const packLeft: Partial<Record<PartId, number>> = {};
  for (const sp of parts) {
    const id = sp.def;
    if (!PARTS[id] || id === 'mega') continue;
    if (PARTS[id].kind === 'inlay') continue;
    const wantX = sp.x ?? rng.range(BUILD_AREA.x0 + 2, BUILD_AREA.x1 - 2), wantY = sp.y ?? rng.range(BUILD_AREA.y0 + 2, BUILD_AREA.y1 - 2);
    const spot = nearestSpot(l, id, wantX, wantY);
    if (!spot) { missing.push(id); continue; }
    if (Math.hypot(spot.x - wantX, spot.y - wantY) > 0.6) moved++;
    const p = makePart(id, l.nextUid++, spot.x, spot.y, true);
    if (sp.angle !== undefined && PARTS[id].rotatable) p.angle = sp.angle;
    if (sp.dials) for (const [k, v] of Object.entries(sp.dials)) if (PARTS[id].dials.some((d) => d.id === k)) p.dials[k] = v;
    if (sp.inlay && PARTS[sp.inlay]?.kind === 'inlay') p.inlay = sp.inlay;
    if (sp.level) p.level = sp.level;
    const pack = PARTS[id].pack ?? 1;
    if (pack > 1) {
      if (!packLeft[id]) { packLeft[id] = pack; group++; }
      p.group = group * 10 + Object.keys(packLeft).indexOf(id);
      packLeft[id]!--;
    }
    l.parts.push(p);
  }
  return { layout: l, moved, missing };
}

/** Objective for the placer: mean and worse-half mean of round totals. */
function objective(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return 0.5 * mean(s) + 0.5 * mean(s.slice(0, Math.max(1, Math.ceil(s.length / 2))));
}

/**
 * Auto-placer with any player: place loose parts at the best of `tries` spots, then hill-climb `steps` moves.
 * Each candidate is scored by `evalRounds` rounds (fixed seeds, so comparisons are fair).
 */
export function place(s: Setup, o: { profile: string; seed: number; evalRounds: number; tries: number; steps: number }): { layout: Layout; before: number; after: number } {
  const rng = new Rng(o.seed);
  const layout = cloneLayout(s.layout);
  const score = () => {
    const xs: number[] = [];
    for (let i = 0; i < o.evalRounds; i++) xs.push(playRound(gameFor({ ...s, layout }), { profile: o.profile, seed: o.seed * 31 + i }).score);
    return objective(xs);
  };
  const before = score();
  let cur = before;
  const spot = (p: PartInstance) => {
    if (PARTS[p.def].kind === 'decor') return canPlace(layout, p.def, DECOR_SLOT.x, DECOR_SLOT.y, p.uid) ? { ...DECOR_SLOT } : null;
    const r = footprint(PARTS[p.def]);
    for (let i = 0; i < 80; i++) {
      const x = Math.round(rng.range(BUILD_AREA.x0 + r, BUILD_AREA.x1 - r) * 10) / 10, y = Math.round(rng.range(BUILD_AREA.y0 + r, BUILD_AREA.y1 - r) * 10) / 10;
      if (canPlace(layout, p.def, x, y, p.uid)) return { x, y };
    }
    return null;
  };
  for (const p of layout.parts.filter((q) => !q.placed && PARTS[q.def].kind !== 'inlay')) {
    let best: { x: number; y: number; a: number; s: number } | null = null;
    for (let t = 0; t < o.tries; t++) {
      const sp = spot(p);
      if (!sp) break;
      Object.assign(p, sp, { placed: true });
      p.angle = PARTS[p.def].rotatable ? Math.round(rng.range(0, 24)) * (Math.PI / 12) : 0;
      const sc = score();
      if (!best || sc > best.s) best = { ...sp, a: p.angle, s: sc };
      p.placed = false;
    }
    if (best) { Object.assign(p, { x: best.x, y: best.y, angle: best.a, placed: true }); cur = best.s; }
  }
  for (let step = 0; step < o.steps; step++) {
    const placed = layout.parts.filter((p) => p.placed && !p.fixed && PARTS[p.def].kind !== 'decor');
    if (!placed.length) break;
    const p = placed[Math.floor(rng.next() * placed.length)];
    const old = { x: p.x, y: p.y, angle: p.angle };
    const roll = rng.next();
    if (roll < 0.55) {
      const sp = rng.next() < 0.3 ? spot(p) : { x: Math.round((p.x + rng.range(-2, 2)) * 10) / 10, y: Math.round((p.y + rng.range(-2, 2)) * 10) / 10 };
      if (!sp || !canPlace(layout, p.def, sp.x, sp.y, p.uid)) continue;
      p.x = sp.x; p.y = sp.y;
    } else if (roll < 0.8 && PARTS[p.def].rotatable) p.angle = Math.round(rng.range(0, 24)) * (Math.PI / 12);
    else {
      const q = placed[Math.floor(rng.next() * placed.length)];
      if (q === p) continue;
      const qo = { x: q.x, y: q.y };
      p.placed = q.placed = false;
      const ok = canPlace(layout, p.def, qo.x, qo.y, p.uid) && canPlace(layout, q.def, old.x, old.y, q.uid);
      p.placed = q.placed = true;
      if (!ok) continue;
      p.x = qo.x; p.y = qo.y; q.x = old.x; q.y = old.y;
      const sc = score();
      if (sc >= cur) cur = sc; else { q.x = qo.x; q.y = qo.y; p.x = old.x; p.y = old.y; }
      continue;
    }
    const sc = score();
    if (sc >= cur) cur = sc; else Object.assign(p, old);
  }
  return { layout, before, after: cur };
}

/** Run tasks over worker processes: each task is a JSON payload for `script`, which prints `RESULT <json>` lines. */
export async function pool<T>(script: string, payloads: unknown[], workers = 4, onDone?: (i: number, r: T) => void): Promise<T[]> {
  const { spawn } = await import('node:child_process');
  const out: T[] = new Array(payloads.length);
  let next = 0;
  const one = (): Promise<void> => {
    const i = next++;
    if (i >= payloads.length) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const child = spawn('npx', ['vite-node', script, JSON.stringify(payloads[i])], { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      child.stdout.on('data', (d) => { buf += d; });
      child.stderr.on('data', (d) => { const s = String(d); if (!/warn|ExperimentalWarning/.test(s)) process.stderr.write(s); });
      child.on('exit', () => {
        const line = buf.split('\n').find((l) => l.startsWith('RESULT '));
        if (line) { out[i] = JSON.parse(line.slice(7)); onDone?.(i, out[i]); } else process.stderr.write(`task ${i} failed\n${buf.slice(-2000)}\n`);
        resolve();
      });
    }).then(one);
  };
  await Promise.all(Array.from({ length: workers }, one));
  return out;
}
