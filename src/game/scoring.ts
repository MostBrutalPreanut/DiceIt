import { dialFactor, dialValue, effectiveLevel, footprint, GARNET_X, grownPoints, hasTag, HOT_WINDOW, INFERNO_REACH, infernoReach, isDecor, lampStats, LEAF_CAP, LEVEL_RADIUS, MAX_LEVEL, MAX_STRENGTH, modFactor, PARTS, RANK_NAMES, RITUAL_NAMES, RITUALS, RUBY_X, SEAL_DARK, swarmSparks, tempestRate, tierOf, TOPAZ_CHANCE, wizardNeed, ZAP_COOLDOWN, zappable, type PartId, type PartInstance, type Recipe, type Ritual } from '../data/parts';
import { neutralMods, type Mods } from '../data/mods';
import { bigBoiOf, DRAGON, ORDER, type BigBoiId, type MachineId } from '../data/bigboi';
import { TABLE_H, TABLE_W } from '../sim/constants';
import { Rng } from '../sim/rng';
import type { SimEvent } from '../sim/sim';

/**
 * One attributed scoring event. The HUD, ledger, popups and sounds all read this and nothing else,
 * so what the player sees is exactly what happened.
 */
export interface ScoreEvent {
  t: number;
  uid: number;
  def: PartId;
  x: number;
  y: number;
  kind: 'hit' | 'bonus' | 'light';
  /** Points before Mult (already includes growth, dials, lamps and every multiplier). */
  base: number;
  /** Points added to the score: base x Mult. */
  points: number;
  multBefore: number;
  multAfter: number;
  money: number;
  /** The pieces of `base`, in plain words, e.g. "100 base", "+15 grown", "+25% lamp". */
  notes: string[];
  label?: string;
  spins?: number;
  /** Vari-target: index of the tier this hit reached. */
  tier?: number;
  /** This hit was a Hot Shot (the ball was hot). */
  hot?: boolean;
  /** A zap: no ball touched the part; something at (x, y) made it score: a Tesla Coil's arc, a keg's blast, a beam, the gong's boom. */
  zap?: { x: number; y: number; by: ZapKind };
  /** A Laser Turret fired: the beam, end to end. */
  beam?: { x1: number; y1: number; x2: number; y2: number };
  /** A blast or a boom went off here: how far its shockwave reaches. */
  blast?: number;
  /** Sparks to shoot out (the game hands them to the sim): a burst round the part, or rain from the top later. */
  sparks?: SparkBurst[];
  /** More balls fly out from here (WIZARD MODE). */
  balls?: { n: number; x: number; y: number; uid: number };
  /** A Firecracker's rocket left from here. */
  rocket?: { x: number; y: number };
  /** Scored by a spark, not by the ball itself. */
  spark?: boolean;
}

/** `n` sparks, scoring as ball `parent`: from a ring of radius `r` round (x, y), or falling from the top, after `delay` s. */
export interface SparkBurst {
  n: number;
  x: number;
  y: number;
  r: number;
  parent: number;
  top?: boolean;
  delay?: number;
}

/** Where a zap came from: a coil's arc, a keg's blast, a laser's beam, a gong's boom, the Altar's Tempest or Inferno. */
export type ZapKind = 'arc' | 'blast' | 'beam' | 'boom' | 'storm' | 'fire';

/** What a zap needs to know about the moment: when, whose ball, how fast it was, how far down a chain of kegs. */
interface ZapCause {
  t: number;
  ballId: number;
  speed: number;
  depth?: number;
}

export interface LedgerRow {
  uid: number;
  def: PartId;
  hits: number;
  points: number;
  money: number;
  multAdded: number;
}

/**
 * Points x Mult with full attribution. Pure logic: no physics, no rendering, so the rules can be
 * unit-tested and balanced headless. `getParts` returns every part the player owns.
 */
export interface ScorerOpts {
  /**
   * Called when a lit group of Level Lights levels up a part, for real (the part's `level` is the owner's to
   * change). Without it the scorer keeps the levels to itself, so a free test ball never levels up a machine.
   */
  onLevelUp?: (inst: PartInstance, levels: number) => void;
  /** Called when a Trophy Cup is polished, for real (like onLevelUp). Returns its polish now. */
  onPolish?: (inst: PartInstance, by: number, cap: number) => number;
  /** Called when an Old Bell gets its notch for the round, for real (like onLevelUp). Returns true if that notch rang it. */
  onNotch?: (inst: PartInstance, notches: number) => boolean;
  /** Called when Gold Leaf adds +1 to its part, for real (like onPolish). Returns what it adds now. */
  onLeaf?: (inst: PartInstance, cap: number) => number;
  /** Called when the scorer keeps something on a part for the run, for real (the Ritual Altar's count): the game writes it on the part. */
  onKeep?: (inst: PartInstance, patch: Partial<PartInstance>) => void;
  /** Old Bell rings so far this run: every ball's Mult is ×1.2 for each (default none). */
  rings?: number;
  /** The run's decals and the boss (neutral if absent). */
  mods?: Mods;
  /** Overrides the Mult every ball starts with (default: the mods' `startMult`). */
  baseMult?: number;
  /** The machine: decides what Big Boi does. */
  machine?: MachineId;
  /** Seed for the Cook's orders and the Overlord's picks. */
  seed?: number;
  /** Balls on the table right now (Multiball Madness). */
  balls?: () => number;
  /** Is the ball in play the round's last? (Last Call) */
  lastBall?: () => boolean;
  /** The money you hold (Thrifty). */
  cash?: () => number;
  /** A boss jams part types: the most numerous one for the round, or a random one every ball. */
  jam?: 'mostNumerous' | 'randomEachBall';
  /** The Auditor: these mods (with the decals) take over once the score reaches `at`. */
  later?: { mods: Mods; at: number; baseMult: number };
}

export class Scorer {
  score = 0;
  mult: number;
  money = 0;
  goalReached = false;
  readonly ledger = new Map<number, LedgerRow>();
  /** Per-ball state: hits of each part type, which lights are lit, the types the ball has hit. */
  private hitsByType = new Map<PartId, number>();
  private lit = new Set<number>();
  private typesHit = new Set<PartId>();
  /** Level Lights stay lit for the whole round, not just one ball. */
  private roundLit = new Set<number>();
  /** Levels this scorer gave out itself (a test ball's, which never reach the machine). */
  private gained = new Map<number, number>();
  private onLevelUp?: (inst: PartInstance, levels: number) => void;
  private onPolish?: (inst: PartInstance, by: number, cap: number) => number;
  /** The highest Mult any ball reached this round (Afterglow keeps a share of it). */
  peakMult = 1;
  /** Lamps: how bright each one is this ball, and until when every Lamp is at full glow (a bank set, the Disco Ball). */
  private lampSteps = new Map<number, number>();
  private lampFlashUntil = -1;
  /** Glow Strips: until when each one is lit. */
  private stripUntil = new Map<number, number>();
  /** The time of the latest event (labels and the hover card read lamp and strip state at it). */
  private now = 0;
  /** Ball Savers that saved a ball this round (the ones that do not pay at the end of the round). */
  readonly saversUsed = new Set<number>();
  mods: Mods;
  /** Scoring hits so far this round and this ball (Gold Ball, Lucky Seven and the jackpot count them). */
  private roundHits = 0;
  private ballHits = 0;
  /** Hits of each type this round (Golden Bumper's coins). */
  private roundTypeHits = new Map<PartId, number>();
  /**
   * What the limits in the recipes have let through so far. Every source that compounds (growth, Mult, set
   * bonuses, coins) has a cap: this ledger of what has been paid is how the caps are kept. Per ball: Mult and
   * sets. Per round: money.
   */
  private multPaid = new Map<string, number>();
  private xPaid = new Map<string, number>();
  private setsPaid = new Map<string, number>();
  private moneyPaid = new Map<string, number>();
  /** Hot Shots: each hot ball's bonus on its next scoring hit, and until when. */
  private hot = new Map<number, { until: number; bonus: number }>();
  /** Per part: until when it is dark (X Lane), and how often it fired this ball (Disco Ball). */
  private coolUntil = new Map<number, number>();
  private firedThisBall = new Map<number, number>();
  /** The jackpot pot: ball hits when each scoop last cashed. */
  private potFrom = new Map<number, number>();
  /** Red Seal: until when each sealed part is dark after its double, and whether the double is being scored now. */
  private sealDark = new Map<number, number>();
  private sealing = false;
  /** Gold Leaf a test ball's parts have earned (a real round's goes on the part, through onLeaf). */
  private leafed = new Map<number, number>();
  /** Zaps: until when each part cannot be zapped again. */
  private zapCool = new Map<number, number>();
  /** Powder Kegs this ball: lit (blowing at `at`) or spent (until `at`), whose ball lit it and how far down a chain it is. */
  private kegs = new Map<number, { at: number; spent: boolean; ballId: number; depth: number }>();
  /** Rock Piles: the ball's hits on each this round (the pile grows with them). */
  private rockHits = new Map<number, number>();
  /** Shockwave Gongs: the ball's hits on each. */
  private gongHits = new Map<number, number>();
  /** Per part: how often it fired this round (the Old Bell). */
  private firedThisRound = new Map<number, number>();
  /** Rank Lights: each ranked ball's rank (1 = Silver) and until when it lasts. */
  private ranks = new Map<number, { step: number; until: number }>();
  /** Old Bells: rings so far, what they multiply every ball's Mult by, and the notches a test ball's bells have earned. */
  private rings: number;
  ringX = 1;
  private notched = new Map<number, number>();
  /** Midnight Clock: minutes past 9 PM (scoring hits this round since it last struck), whether it struck this ball, and until when the madness lasts. */
  private clockMin = 0;
  private clockStruck = false;
  private madUntil = -1;
  /** Ritual Altar: what a test ball's altar has kept (a real round's goes on the part, through onKeep), and the ritual under way. */
  private kept = new Map<number, Partial<PartInstance>>();
  private ritual: { kind: Ritual; until: number; s: number; next: number; ballId: number; uid: number } | null = null;
  /** Wizard Lamp: its segments this round, the types the ball itself has hit this ball, whether it fired this round, until when WIZARD MODE lasts. */
  private wizNeed = 0;
  private wizTypes = new Set<PartId>();
  private wizFired = false;
  private wizUntil = -1;
  /** Piggy Banks: the $ inside each one (per round). */
  readonly piggies = new Map<number, number>();
  baseMult: number;
  readonly machine: MachineId;
  readonly bigBoi: BigBoiId;
  /** The Cook's order: the one part (by uid) whose next hit pays triple. */
  order: number | null = null;
  /** The Dragon's armour plates left, and how often it was knocked off this ball. */
  armour: number = DRAGON.armour;
  slays = 0;
  /** Part types a boss has switched off. */
  readonly jammed = new Set<PartId>();
  private rng: Rng;
  private opts: ScorerOpts;

  constructor(public goal: number, private getParts: () => PartInstance[] = () => [], opts: ScorerOpts = {}) {
    this.opts = opts;
    this.mods = { ...neutralMods(), ...opts.mods }; // a saved machine from before a mod existed still scores
    this.baseMult = opts.baseMult ?? this.mods.startMult;
    this.rings = opts.rings ?? 0;
    this.refreshRingX();
    this.mult = this.peakMult = this.ballStartMult();
    this.onLevelUp = opts.onLevelUp;
    this.onPolish = opts.onPolish;
    this.machine = opts.machine ?? 'factory';
    this.bigBoi = bigBoiOf(this.machine).id;
    this.rng = new Rng(opts.seed ?? 1);
  }

  /** The level a part has earned (Level Lights), this round's included. */
  levelOf(inst: PartInstance) {
    return Math.min(MAX_LEVEL, (inst.level ?? 0) + (this.gained.get(inst.uid) ?? 0));
  }

  /** The level the part scores at: its own plus what the decals add. */
  effLevel(inst: PartInstance) {
    return effectiveLevel(inst.def, this.levelOf(inst), this.mods);
  }

  recipe(id: PartId): Recipe {
    return id === 'mega' ? bigBoiOf(this.machine).recipe : PARTS[id].recipe;
  }

  /** The parts on the table (decor stands on the cabinet and is never hit). */
  private placed() {
    return this.getParts().filter((p) => p.placed && !isDecor(p.def));
  }

  /** The decor of this kind on the cabinet, if any (decor is one of a kind). */
  private decor(test: (r: Recipe) => unknown): PartInstance | undefined {
    return this.getParts().find((p) => p.placed && isDecor(p.def) && test(PARTS[p.def].recipe));
  }

  /** Called when a round (not a ball) starts: the Level Lights go dark, the piggies are empty, a jam is decided. */
  resetRound() {
    this.peakMult = this.baseMult;
    this.roundLit.clear();
    this.saversUsed.clear();
    this.roundHits = 0;
    this.roundTypeHits.clear();
    this.moneyPaid.clear();
    this.piggies.clear();
    this.firedThisRound.clear();
    this.rockHits.clear();
    this.clockMin = 0;
    this.wizNeed = wizardNeed(this.getParts());
    this.wizFired = false;
    this.jammed.clear();
    if (this.opts.jam === 'mostNumerous') {
      const n = new Map<PartId, number>();
      for (const p of this.placed()) if (!p.fixed && this.recipe(p.def).points) n.set(p.def, (n.get(p.def) ?? 0) + 1);
      const top = [...n.entries()].sort((a, b) => b[1] - a[1] || PARTS[b[0]].cost - PARTS[a[0]].cost)[0];
      if (top) this.jammed.add(top[0]);
    }
    this.startBall();
  }

  /** How much of `want` a cap lets through (all of it when there is no cap); what passes is recorded against the key. */
  private take(paid: Map<string, number>, key: string, want: number, cap: number | undefined): number {
    if (want <= 0) return 0;
    const used = paid.get(key) ?? 0;
    const got = cap === undefined ? want : Math.max(0, Math.min(want, cap - used));
    paid.set(key, used + got);
    return got;
  }

  /** The same for a ×Mult: how much of `x` the cap on the product lets through. */
  private takeX(key: string, x: number, cap: number | undefined): number {
    if (x <= 1) return 1;
    const used = this.xPaid.get(key) ?? 1;
    if (this.now < this.wizUntil) cap = undefined; // WIZARD MODE: no ×Mult limits
    const got = cap === undefined ? x : Math.max(1, Math.min(x, cap / used));
    this.xPaid.set(key, used * got);
    return got;
  }

  /** The Old Bells' rings, after the boss's Flat Rate: ×1.2 each, on every ball's Mult. */
  private refreshRingX() {
    const x = PARTS.bell.recipe.bell!.x;
    this.ringX = Math.round(this.gainX(x) ** this.rings * 1000) / 1000;
  }

  /** The Mult a ball starts at: the base, times the Old Bells' rings. */
  private ballStartMult() {
    return Math.round(this.baseMult * this.ringX * 1000) / 1000;
  }

  startBall() {
    this.mult = this.ballStartMult();
    this.clockStruck = false;
    this.madUntil = -1;
    this.wizTypes.clear();
    this.wizUntil = -1;
    this.ritual = null;
    this.ranks.clear();
    this.zapCool.clear();
    this.sealDark.clear();
    this.kegs.clear();
    this.gongHits.clear();
    this.ballHits = 0;
    this.multPaid.clear();
    this.xPaid.clear();
    this.setsPaid.clear();
    this.hitsByType.clear();
    this.typesHit.clear();
    this.lit.clear();
    this.lampSteps.clear();
    this.lampFlashUntil = -1;
    this.stripUntil.clear();
    this.hot.clear();
    this.coolUntil.clear();
    this.firedThisBall.clear();
    this.potFrom.clear();
    this.armour = DRAGON.armour;
    this.slays = 0;
    this.order = null;
    if (this.opts.jam === 'randomEachBall') {
      this.jammed.clear();
      const types = [...new Set(this.placed().filter((p) => !p.fixed && this.recipe(p.def).points).map((p) => p.def))].sort();
      if (types.length) this.jammed.add(types[Math.floor(this.rng.next() * types.length)]);
    }
  }

  /** The Cook calls an order: one scoring part on the table other than himself (and not the one already lit). */
  private pickOrder(not: number | null): number | null {
    const parts = this.placed().filter((p) => p.def !== 'mega' && this.recipe(p.def).points && !this.jammed.has(p.def)).sort((a, b) => a.uid - b.uid);
    const pool = parts.length > 1 ? parts.filter((p) => p.uid !== not) : parts;
    return pool.length ? pool[Math.floor(this.rng.next() * pool.length)].uid : null;
  }

  isLit(uid: number) {
    if (this.mods.lightsOut) return false;
    return this.lit.has(uid) || this.roundLit.has(uid) || this.lampLevel(uid) > 0 || (this.stripUntil.get(uid) ?? -1) > this.now;
  }

  /** How many steps bright a Lamp is right now (all of them while the lamps flash). */
  lampLevel(uid: number) {
    if (this.mods.lightsOut) return 0;
    if (this.lampFlashUntil > this.now && this.getParts().some((p) => p.uid === uid && p.def === 'lamp')) return PARTS.lamp.recipe.brighten?.steps ?? 5;
    return this.lampSteps.get(uid) ?? 0;
  }

  /** A lit Glow Strip under this part: what it adds (0 if none). */
  stripBonusAt(inst: PartInstance): number {
    if (this.mods.lightsOut) return 0;
    let b = 0;
    for (const st of this.placed()) {
      const r = PARTS[st.def].recipe.strip;
      if (!r || st.uid === inst.uid || (this.stripUntil.get(st.uid) ?? -1) <= this.now) continue;
      const sh = PARTS[st.def].shape;
      if (sh.type !== 'box') continue;
      if (Math.abs(inst.x - st.x) <= sh.hw + 0.3 && Math.abs(inst.y - st.y) <= sh.hh + r.reach) b += r.bonus;
    }
    return b;
  }

  /** Power Plates under this part: what they multiply it by (1 if none, or if it is not a bumper). */
  plateXAt(inst: PartInstance): number {
    if (!hasTag(inst.def, 'bumper') || PARTS[inst.def].recipe.plate) return 1;
    let x = 1;
    for (const pl of this.placed()) {
      const r = PARTS[pl.def].recipe.plate;
      if (r && Math.hypot(pl.x - inst.x, pl.y - inst.y) <= r.reach) x *= r.x;
    }
    return x;
  }

  /** Hall of Fame: ×(1 + per) for every different part type on the table (Big Boi too). */
  typeXNow(per: number): number {
    const types = new Set(this.placed().map((p) => p.def)).size;
    return Math.round(this.gainX(1 + per) ** types * 1000) / 1000;
  }

  /** How often a part has fired this ball (Disco Ball). */
  firedOf(uid: number) {
    return this.firedThisBall.get(uid) ?? 0;
  }

  /** Has this part fired this round already (the Old Bell)? */
  firedThisRoundOf(uid: number) {
    return (this.firedThisRound.get(uid) ?? 0) > 0;
  }

  /** X Lane: is it dark right now (it just fired)? */
  coolingDown(uid: number, t: number) {
    return (this.coolUntil.get(uid) ?? -1) > t;
  }

  hitsOf(id: PartId) {
    return this.hitsByType.get(id) ?? 0;
  }

  /** Different part types the ball has hit this ball (Ding-Dong Bell). */
  get variety() {
    return this.typesHit.size;
  }

  /** What a Jackpot Scoop would add if the ball sank into it now. */
  potOf(inst: PartInstance): number {
    const j = this.recipe(inst.def).jackpot;
    if (!j) return 0;
    return Math.min(j.cap, j.per * (this.ballHits - (this.potFrom.get(inst.uid) ?? 0)));
  }

  /** Sum of the bonuses of every lit lamp whose glow reaches this part (each lamp's bonus grows with its brightness). */
  lampBonusAt(inst: PartInstance): { sum: number; count: number } {
    let sum = 0, count = 0;
    if (this.mods.lightsOut) return { sum, count };
    for (const l of this.placed()) {
      if (PARTS[l.def].kind !== 'lamp') continue;
      const steps = this.lampLevel(l.uid);
      if (!steps) continue;
      const lamp = lampStats(dialValue(l, 'radius'), this.mods);
      if (Math.hypot(l.x - inst.x, l.y - inst.y) <= lamp.radius) {
        sum += lamp.bonus * steps;
        count++;
      }
    }
    return { sum: Math.round(sum * 100) / 100, count };
  }

  /** A ball's rank right now (Rank Lights), after the boss's Flat Rate, or null. */
  rankOf(ballId: number, t = this.now): { step: number; x: number; name: string; left: number } | null {
    const rk = this.ranks.get(ballId);
    if (!rk || rk.until <= t) return null;
    const steps = PARTS.rank.recipe.rank!.steps;
    return { step: rk.step, x: Math.round(this.gainX(steps[rk.step - 1]) * 1000) / 1000, name: RANK_NAMES[rk.step - 1], left: rk.until - t };
  }

  /** Multipliers that depend on the moment, not the part: the ball's rank, Thrifty, Multiball Madness, Last Call, Purist. */
  private situational(ev?: { ballId?: number; t: number }): { x: number; notes: string[] } {
    const m = this.mods, notes: string[] = [];
    let x = 1;
    const rank = ev?.ballId === undefined ? null : this.rankOf(ev.ballId, ev.t);
    if (rank) { x *= rank.x; notes.push(`x${rank.x} ${rank.name.toLowerCase()} rank`); }
    if (m.cashPer > 0 && this.opts.cash) {
      const c = Math.min(m.cashCap, m.cashPer * Math.max(0, this.opts.cash()));
      if (c > 0) { x *= 1 + c; notes.push(`+${Math.round(c * 100)}% thrifty`); }
    }
    if (m.multiballX !== 1 && (this.opts.balls?.() ?? 1) >= 2) { x *= m.multiballX; notes.push(`x${m.multiballX} multiball`); }
    if (m.lastBallX !== 1 && this.opts.lastBall?.()) { x *= m.lastBallX; notes.push(`x${m.lastBallX} last call`); }
    if (m.puristX !== 1 && this.puristOk()) { x *= m.puristX; notes.push(`x${m.puristX} purist`); }
    if (ev && ev.t < this.madUntil) { const c = this.decor((r) => r.clock)?.def; const cx = c ? PARTS[c].recipe.clock!.x : 1; x *= cx; notes.push(`x${cx} midnight`); }
    return { x, notes };
  }

  /** Purist: the table holds few enough part types (Big Boi does not count). */
  puristOk(): boolean {
    return new Set(this.placed().filter((p) => !p.fixed).map((p) => p.def)).size <= this.mods.puristTypes;
  }

  /** What this part would score per event right now, before Mult. Null for parts that do not score. */
  baseNow(inst: PartInstance, spins = 1, tierX = 1, points?: number): number | null {
    const r = this.recipe(inst.def);
    if (!r.points) return null;
    const grown = grownPoints(r, this.hitsOf(inst.def));
    const lvl = (r.perLevel ?? 0) * this.effLevel(inst);
    const variety = r.variety ? r.variety * this.variety : 0;
    const order = this.order === inst.uid ? ORDER.x : 1;
    const leaf = inst.inlay === 'goldleaf' ? this.leafOf(inst) : 0, ruby = inst.inlay === 'ruby' ? RUBY_X : 1;
    return Math.round(((points ?? r.points) + leaf + lvl + grown + variety + this.potOf(inst)) * ruby * spins * tierX * dialFactor(inst) * modFactor(inst.def, this.mods) * (1 + this.lampBonusAt(inst).sum) * (1 + this.stripBonusAt(inst)) * this.plateXAt(inst) * order);
  }

  /** The short number drawn on the part itself ("100", "10/spin", "+25%", "x1.25"). */
  label(inst: PartInstance): string | null {
    const def = PARTS[inst.def];
    if (this.jammed.has(inst.def)) return 'JAMMED';
    if (def.kind === 'lamp') return this.mods.lightsOut ? 'OFF' : `+${Math.round(lampStats(dialValue(inst, 'radius'), this.mods).bonus * this.lampLevel(inst.uid) * 100)}%`;
    if (def.recipe.plate) return `x${def.recipe.plate.x}`;
    if (def.kind === 'strip') return this.mods.lightsOut ? 'OFF' : `+${Math.round((def.recipe.strip?.bonus ?? 0) * 100)}%`;
    const r = this.recipe(inst.def);
    if (r.clock) {
      // the clock's face: the time (9 PM to midnight), MIDNIGHT while it strikes
      if (this.madnessLeft() > 0) return 'MIDNIGHT';
      if (this.clockStruck) return '12:00';
      const m = Math.floor((this.clockMin / r.clock.hits) * 180);
      return `${9 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    }
    if (r.altar) {
      const now = this.ritualNow();
      return now ? RITUAL_NAMES[now.kind].toUpperCase() : `${this.altarOf(inst).sets}/${r.altar.sets}`;
    }
    if (r.boom && !this.jammed.has(inst.def)) return `${(this.gongHits.get(inst.uid) ?? 0) % r.boom.every}/${r.boom.every}`; // hits towards the boom
    if (r.bell && !this.firedThisRoundOf(inst.uid) && !this.jammed.has(inst.def)) return String(this.baseNow(inst, 1, 1, r.bell.first)); // its toll is waiting
    if (r.typeX) return this.mods.lightsOut ? 'OFF' : `x${this.typeXNow(r.typeX).toFixed(2)}`;
    if (r.xmult && !r.points) return this.mods.lightsOut ? 'OFF' : `x${(1 + (r.xmult - 1) * this.mods.multGain).toFixed(2)}`;
    const n = this.baseNow(inst);
    if (n === null) return null;
    const tiers = r.tiers;
    if (tiers && inst.def === 'vari') return `${n}-${this.baseNow(inst, 1, tiers[tiers.length - 1].x)}`; // soft hit to smash
    if (r.piggy) return `${n} · $${this.piggies.get(inst.uid) ?? 0}`;
    return r.per === 'spin' ? `${n}/spin` : String(n);
  }

  private addLedger(inst: PartInstance, points: number, money: number, multAdded: number) {
    const row = this.ledger.get(inst.uid) ?? { uid: inst.uid, def: inst.def, hits: 0, points: 0, money: 0, multAdded: 0 };
    row.hits++;
    row.points += points;
    row.money += money;
    row.multAdded += multAdded;
    this.ledger.set(inst.uid, row);
  }

  private award(inst: PartInstance, t: number, x: number, y: number, kind: ScoreEvent['kind'], base: number, multGain: number, money: number, notes: string[], label?: string, spins?: number, xmult = 1): ScoreEvent {
    const multBefore = this.mult;
    const points = Math.round(base * multBefore);
    // the Old Bells' rings multiply the whole Mult, so every +Mult a ball gains counts ×ringX too
    this.mult = Math.round((this.mult + multGain * this.ringX) * xmult * 1000) / 1000;
    this.peakMult = Math.max(this.peakMult, this.mult);
    this.score += points;
    this.money += money;
    if (this.score >= this.goal) this.goalReached = true;
    if (kind === 'bonus') this.flashStrips(t);
    this.addLedger(inst, points, money, this.mult - multBefore);
    this.checkLater();
    return { t, uid: inst.uid, def: inst.def, x, y, kind, base, points, multBefore, multAfter: this.mult, money, notes, label, spins };
  }

  /** Anything paid a bonus: every Glow Strip lights up for a while. */
  private flashStrips(t: number) {
    for (const p of this.placed()) {
      const r = PARTS[p.def].recipe.strip;
      if (r) this.stripUntil.set(p.uid, t + r.seconds);
    }
  }

  /** The Auditor: the decals come back once the score reaches the mark. */
  private laterDone = false;
  private checkLater() {
    const l = this.opts.later;
    if (!l || this.laterDone || this.score < l.at) return;
    this.laterDone = true;
    this.mods = l.mods;
    this.baseMult = l.baseMult;
    this.refreshRingX();
    this.pending.push('DECALS BACK ON!');
  }
  /** Shouts the scorer owes the next event (the Auditor letting go). */
  private pending: string[] = [];

  /** A Mult gain after the boss's Flat Rate. */
  private gain(n: number) { return n * this.mods.multGain; }
  private gainX(x: number) { return 1 + (x - 1) * this.mods.multGain; }

  /** Turn one physical event into zero or more attributed score events. */
  consume(ev: SimEvent): ScoreEvent[] {
    if (ev.type === 'drain') {
      this.ranks.delete(ev.ballId); // a drain loses the rank
      return [];
    }
    if (ev.type === 'ballSaved') {
      this.saversUsed.add(ev.uid);
      return [];
    }
    if (ev.type !== 'partHit') return [];
    this.now = ev.t;
    const inst = this.getParts().find((p) => p.uid === ev.uid && p.placed);
    if (!inst) return [];
    const out = this.hit(inst, ev);
    if (ev.spark) for (const e of out) if (!e.zap) e.spark = true;
    if (this.pending.length && out.length) out[out.length - 1].label ??= this.pending.shift();
    return out;
  }

  private hit(inst: PartInstance, ev: Extract<SimEvent, { type: 'partHit' }>): ScoreEvent[] {
    const def = PARTS[inst.def];
    const r = this.recipe(inst.def);
    const m = this.mods;
    const out: ScoreEvent[] = [];
    if (this.jammed.has(inst.def)) return out;
    if (m.lightsOut && def.tags.includes('light')) return out;

    // lamps only light up
    if (def.kind === 'lamp') {
      const b = r.brighten!, steps = this.lampSteps.get(inst.uid) ?? 0;
      if (steps >= b.steps) return out; // as bright as it gets
      this.lampSteps.set(inst.uid, steps + 1);
      const pts = Math.round(b.points * modFactor(inst.def, m));
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'light', pts, 0, 0, [`${pts} brighter`], steps + 1 >= b.steps ? 'LAMP FULL!' : `LAMP ${steps + 1}/${b.steps}`));
      return out;
    }

    // a drop-target bank with every target down pays its set bonus (the individual hits scored already)
    if (def.kind === 'bank' && ev.bankComplete) {
      const situ = this.situational(ev);
      const pts = Math.round(r.setBonus!.points * m.setFactor * modFactor(inst.def, m) * situ.x);
      if (r.lightsLamps) this.flashLamps(ev.t, r.lightsLamps);
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, this.gain(r.setBonus!.mult * m.setFactor), 0, [`${pts} bank bonus`, ...situ.notes], 'BANK COMPLETE'));
      out.push(...this.setDone(ev));
      return out;
    }

    // the goal: a ball past the goalie (the goalie and the posts score nothing)
    if (def.kind === 'goal') {
      if (!ev.goal || this.coolingDown(inst.uid, ev.t)) return out;
      this.coolUntil.set(inst.uid, ev.t + (r.cooldown ?? 1.5) * this.coolX(inst));
      const situ = this.situational(ev);
      const pts = Math.round(((r.points ?? 0) + (r.perLevel ?? 0) * this.effLevel(inst)) * modFactor(inst.def, m) * (1 + this.lampBonusAt(inst).sum) * situ.x);
      const x = this.takeX(inst.def, this.gainX(r.goal!.xmult), this.gainX(r.goal!.xmultCap));
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, 0, 0, [`${pts} goal`, ...situ.notes], 'GOAL!', undefined, x));
      return out;
    }
    // a moving part scores only when its moving piece is hit (the duck, the roller), not its rail
    if (def.kind === 'mover' && !ev.mover) return out;

    // a part that scores nothing itself can still make the ball hot (a Deflector's bank shot)
    if (!r.points && r.hot && !r.xmult) {
      this.hot.set(ev.ballId, { until: ev.t + HOT_WINDOW, bonus: r.hot * m.hotFactor });
      return out;
    }

    // X Lane and other ×Mult lights without points
    if (!r.points && r.xmult) {
      if (this.coolingDown(inst.uid, ev.t)) return out;
      if (r.cooldown) this.coolUntil.set(inst.uid, ev.t + r.cooldown * this.coolX(inst));
      const x = this.takeX(inst.def, this.gainX(r.xmult), r.xmultCap ? this.gainX(r.xmultCap) : undefined);
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [], x > 1.0001 ? `MULT x${x.toFixed(2)}` : 'X LANE MAXED', undefined, x));
      if (r.lightsLane) { const lane = this.lightNextLane(); if (lane) out.push(...this.checkLaneSet(lane, ev, inst)); }
      return out;
    }

    if (r.points) {
      const gem = inst.inlay;
      if (gem === 'redseal' && !this.sealing && (this.sealDark.get(inst.uid) ?? -1) > ev.t) return out; // dark after its double
      if (r.perBall && (this.firedThisBall.get(inst.uid) ?? 0) >= r.perBall * (gem === 'emerald' ? 2 : 1)) return out;
      // an Old Bell's first hit of the round pays its toll instead of its points (and earns the round's notch)
      const toll = r.bell && !ev.zap && !ev.spark && !this.firedThisRoundOf(inst.uid) ? r.bell.first : 0; // only the ball itself rings it
      const pts = toll || r.points;
      const leaf = gem === 'goldleaf' ? this.leafOf(inst) : 0;
      const ruby = gem === 'ruby' ? RUBY_X : 1;
      const spins = ev.spins ?? 1;
      const grown = grownPoints(r, this.hitsOf(inst.def));
      const level = (r.perLevel ?? 0) * this.effLevel(inst);
      const variety = r.variety ? r.variety * this.variety : 0;
      const pot = r.jackpot ? this.potOf(inst) : 0;
      const factor = dialFactor(inst);
      const lamp = this.lampBonusAt(inst);
      const tier = tierOf(inst, ev.speed, m.tierEase);
      const tierX = inst.def === 'vari' ? tier?.x ?? 1 : 1;
      const notes = [`${pts}${spins > 1 ? ` x${spins} spins` : ''} ${toll ? 'toll' : 'base'}`];
      if (level) notes.push(`+${level} level`);
      if (grown) notes.push(`+${grown} grown`);
      if (variety) notes.push(`+${variety} variety`);
      if (pot) notes.push(`+${pot} pot`);
      if (tier && inst.def === 'vari') notes.push(`x${tier.x} ${tier.name} hit`);
      if (Math.abs(factor - 1) > 0.001) notes.push(`x${Math.round(factor * 100) / 100} dial`);
      const mf = modFactor(inst.def, m);
      if (leaf) notes.push(`+${leaf} gold leaf`);
      if (ruby > 1) notes.push(`x${ruby} ruby`);
      if (Math.abs(mf - 1) > 0.001) notes.push(`x${Math.round(mf * 100) / 100} decals`);
      if (lamp.sum) notes.push(`+${Math.round(lamp.sum * 100)}% lamp`);
      const strip = this.stripBonusAt(inst);
      if (strip) notes.push(`+${Math.round(strip * 100)}% glow strip`);
      const plate = this.plateXAt(inst);
      if (plate > 1) notes.push(`x${Math.round(plate * 100) / 100} power plate`);
      const edge = r.edgeShot && ev.edge ? r.edgeShot.x : 1;
      if (edge > 1) notes.push(`x${edge} edge shot`);
      this.roundHits++;
      this.ballHits++;
      const midnight = this.clockHit(ev);
      this.roundTypeHits.set(inst.def, (this.roundTypeHits.get(inst.def) ?? 0) + 1);
      const lucky = m.luckyEvery > 0 && this.ballHits % m.luckyEvery === 0;
      if (lucky) notes.push(`x${m.luckyX} lucky seven`);
      // a Hot Shot is the ball's: a zap neither spends it nor earns one
      const hot = ev.zap || ev.spark ? undefined : this.hot.get(ev.ballId);
      const hotBonus = hot && hot.until >= ev.t ? hot.bonus : 0;
      if (hot) this.hot.delete(ev.ballId);
      if (hotBonus) notes.push(`+${Math.round(hotBonus * 100)}% hot shot`);
      const order = this.order === inst.uid ? ORDER.x : 1;
      if (order > 1) { notes.push(`x${order} order`); this.order = null; }
      const situ = this.situational(ev);
      notes.push(...situ.notes);
      // money
      let money = 0;
      if (!m.noCoins) {
        const goldDue = m.goldEvery > 0 && this.roundHits % m.goldEvery === 0 ? 1 : 0;
        const gold = this.take(this.moneyPaid, 'gold', goldDue, m.goldCap || undefined);
        if (gold) notes.push('+$1 gold ball');
        const coins = this.take(this.moneyPaid, inst.def, r.money ?? 0, r.moneyCap);
        if (r.money && coins < r.money) notes.push('coin limit reached');
        let every = 0;
        if (r.moneyEvery && (this.roundTypeHits.get(inst.def) ?? 0) % r.moneyEvery.n === 0) every = this.take(this.moneyPaid, `${inst.def}:every`, 1, r.moneyEvery.cap);
        let piggy = 0;
        if (r.piggy) {
          const held = this.piggies.get(inst.uid) ?? 0;
          if (tier && r.tiers!.indexOf(tier) >= r.piggy.breakTier && held > 0) {
            piggy = held + r.piggy.bonus;
            this.piggies.set(inst.uid, 0);
            notes.push(`piggy smashed: $${piggy}`);
          } else this.piggies.set(inst.uid, Math.min(r.piggy.cap, held + 1));
        }
        money = gold + coins + every + piggy;
      }
      // Mult: plus, times, and per spin
      let multGain = this.gain(this.take(this.multPaid, inst.def, r.mult ?? 0, r.multCap));
      if (r.mult && multGain < this.gain(r.mult) - 1e-9) notes.push('Mult maxed for this ball');
      if (r.spinMult) multGain += this.gain(this.take(this.multPaid, 'spin', r.spinMult * m.spinMult * spins, (r.spinMultCap ?? 0) * m.spinMult));
      const xmult = r.typeX ? this.typeXNow(r.typeX) : r.xmult ? this.takeX(inst.def, this.gainX(r.xmult), r.xmultCap ? this.gainX(r.xmultCap) : undefined) : 1;
      const base = Math.round((pts + leaf + level + grown + variety + pot) * spins * tierX * factor * mf * ruby * (1 + lamp.sum) * (1 + strip) * plate * edge * (lucky ? m.luckyX : 1) * (1 + hotBonus) * order * situ.x);
      const twice = gem === 'opal' ? 2 : 1; // an Opal counts every hit twice for growth
      this.hitsByType.set(inst.def, this.hitsOf(inst.def) + twice);
      if (r.feeds) this.hitsByType.set(r.feeds.id, this.hitsOf(r.feeds.id) + r.feeds.n * twice);
      this.typesHit.add(inst.def);
      if (r.jackpot) this.potFrom.set(inst.uid, this.ballHits);
      if (r.keep) {
        const before = inst.polish ?? 0;
        const now = this.onPolish ? this.onPolish(inst, r.keep.per * twice, r.keep.cap) : Math.min(r.keep.cap, before + r.keep.per * twice);
        notes.push(now > before ? `+${Math.round((now - before) * 100) / 100} kept Mult` : 'fully polished');
      }
      if (r.perBall) this.firedThisBall.set(inst.uid, (this.firedThisBall.get(inst.uid) ?? 0) + 1);
      if (toll) this.firedThisRound.set(inst.uid, (this.firedThisRound.get(inst.uid) ?? 0) + 1);
      const rang = toll && r.bell ? this.notch(inst, r.bell.notches) : false;
      if (toll && r.bell) notes.push(rang ? 'the bell rings' : `notch ${this.notchesOf(inst)}/${r.bell.notches}`);
      if (r.lightsLamps) this.flashLamps(ev.t, r.lightsLamps);
      const label = r.perBall && xmult > 1 ? `MULT x${xmult.toFixed(2)}` : r.jackpot && pot ? 'JACKPOT!' : edge > 1 ? 'EDGE SHOT!' : undefined;
      const scored = this.award(inst, ev.t, ev.x, ev.y, r.perBall || (r.jackpot && pot) ? 'bonus' : 'hit', base, multGain, money, notes, label, ev.spins, xmult);
      if (tier && inst.def === 'vari') scored.tier = r.tiers!.indexOf(tier);
      if (hotBonus) scored.hot = true;
      out.push(scored);
      // sparks: the ball's own hits shoot them out (sparks and zaps never make sparks)
      if (!ev.zap && !ev.spark) {
        let n = 0;
        if (r.sparks && !this.coolingDown(inst.uid, ev.t)) { this.coolUntil.set(inst.uid, ev.t + r.sparks.cooldown * this.coolX(inst)); n += r.sparks.n; }
        if (r.rocks) {
          const rocks = this.rocksOf(inst);
          this.rockHits.set(inst.uid, (this.rockHits.get(inst.uid) ?? 0) + 1);
          if (!this.coolingDown(inst.uid, ev.t)) { this.coolUntil.set(inst.uid, ev.t + r.rocks.cooldown * this.coolX(inst)); n += rocks; }
        }
        if (gem === 'topaz' && this.rng.next() < TOPAZ_CHANCE) n++;
        const bursts: SparkBurst[] = [];
        if (n) bursts.push({ n, x: inst.x, y: inst.y, r: footprint(PARTS[inst.def]) + 0.45, parent: ev.ballId });
        if (r.rocket && (this.firedThisBall.get(inst.uid) ?? 0) < (gem === 'emerald' ? 2 : 1)) {
          this.firedThisBall.set(inst.uid, (this.firedThisBall.get(inst.uid) ?? 0) + 1);
          scored.rocket = { x: inst.x, y: inst.y };
          scored.label ??= 'WHOOSH!';
          bursts.push({ n: r.rocket.n, x: inst.x, y: inst.y, r: 0, parent: ev.ballId, top: true, delay: r.rocket.delay });
        }
        if (bursts.length) scored.sparks = bursts;
      }
      // a Powder Keg's fuse is lit (by the ball, or by a zap no further down a chain than it allows)
      if (r.keg && !this.kegState(inst.uid, ev.t) && (ev.depth ?? 0) < r.keg.chain) {
        this.kegs.set(inst.uid, { at: ev.t + r.keg.fuse, spent: false, ballId: ev.ballId, depth: ev.depth ?? 0 });
        scored.label ??= 'FUSE LIT!';
      }
      // the third notch rings the bell: ×1.2 on the Mult of this ball and every ball after it, for the rest of the run
      if (rang) out.push(this.ring(inst, ev));
      if (midnight) out.push(midnight);
      // the Wizard Lamp: a segment for every type the ball itself hits; all lit, WIZARD MODE
      if (!ev.zap && !ev.spark) { this.wizTypes.add(inst.def); const w = this.wizardCheck(ev); if (w) out.push(w); }
      // the Altar's Inferno: the ball's every hit also zaps the parts nearest it
      if (this.ritual?.kind === 'inferno' && !ev.zap && !ev.spark && ev.t < this.ritual.until) {
        const near = this.zapTargets(inst, ev.t)
          .map((p) => ({ p, d: Math.hypot(p.x - inst.x, p.y - inst.y) }))
          .filter((a) => a.d <= INFERNO_REACH)
          .sort((a, b) => a.d - b.d || a.p.uid - b.p.uid)
          .slice(0, infernoReach(this.ritual.s))
          .map((a) => a.p);
        out.push(...this.zap(inst, near, ev, 'fire'));
      }
      // this hit makes the ball hot for its next one
      if (!ev.zap && !ev.spark && r.hot && (r.hotTier === undefined || (tier && r.tiers!.indexOf(tier) >= r.hotTier))) this.hot.set(ev.ballId, { until: ev.t + HOT_WINDOW, bonus: r.hot * m.hotFactor });
      // the Cook calls a new order; the Dragon loses a plate
      if (inst.def === 'mega') out.push(...this.bigBoiHit(inst, ev));
      // a Tesla Coil arcs to the parts nearest it (a zapped coil does not: a zap never arcs on)
      if (r.zap && !ev.zap) out.push(...this.arc(inst, ev));
      // a Laser Turret fires across the table; a Shockwave Gong's tenth hit booms (a zap sets off neither)
      if (r.beam && !ev.zap && !this.coolingDown(inst.uid, ev.t)) out.push(...this.fire(inst, scored, ev));
      if (r.boom && !ev.zap) {
        const n = (this.gongHits.get(inst.uid) ?? 0) + 1;
        this.gongHits.set(inst.uid, n);
        if (n % r.boom.every === 0) out.push(...this.boom(inst, ev));
      }
      // Gold Leaf: this part is worth +1 more from now on (up to LEAF_CAP times its points)
      if (gem === 'goldleaf') this.addLeaf(inst, LEAF_CAP * r.points);
      // Red Seal: the hit scores a second time, then the part is dark for a moment
      if (gem === 'redseal' && !this.sealing) {
        this.sealing = true;
        try { out.push(...this.hit(inst, ev)); } finally { this.sealing = false; }
        this.sealDark.set(inst.uid, ev.t + SEAL_DARK);
      }
    }

    // Level Lights (Space Cadet's bumper upgrade lanes): each pass switches the light on or off. When every light
    // in a group (lights within reach of each other) is on, the bumpers within reach of them level up, by one
    // level for each light past the first, and the group goes dark
    if (r.levelUp) {
      if (this.roundLit.has(inst.uid)) this.roundLit.delete(inst.uid);
      else {
        this.roundLit.add(inst.uid);
        const group = this.lightGroup(inst);
        if (group.length >= 2 && group.every((l) => this.roundLit.has(l.uid))) {
          for (const l of group) this.roundLit.delete(l.uid);
          const levels = group.length - 1;
          const near = this.placed().filter((p) => hasTag(p.def, 'bumper') && this.recipe(p.def).perLevel && group.some((l) => Math.hypot(l.x - p.x, l.y - p.y) <= LEVEL_RADIUS));
          let upped = 0;
          for (const p of near) {
            const room = MAX_LEVEL - this.levelOf(p);
            if (room <= 0) continue;
            const n = Math.min(room, levels);
            if (this.onLevelUp) this.onLevelUp(p, n);
            else this.gained.set(p.uid, (this.gained.get(p.uid) ?? 0) + n);
            upped++;
          }
          out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [], upped ? `${upped} BUMPER${upped > 1 ? 'S' : ''} +${levels} LEVEL${levels > 1 ? 'S' : ''}!` : near.length ? 'BUMPERS MAXED OUT' : 'NO BUMPERS NEARBY'));
          out.push(...this.setDone(ev));
        }
      }
    }

    // Rank Lights: light up, and a complete pack ranks the ball up
    if (r.rank) {
      this.lit.add(inst.uid);
      out.push(...this.checkRankSet(inst, ev));
    } else if (r.lights && def.kind === 'rollover') {
      // lane rollovers: light up, and a complete set pays a bonus and resets
      this.lit.add(inst.uid);
      out.push(...this.checkLaneSet(inst, ev));
    }
    return out;
  }

  /**
   * The three Lane Rollovers of a pack make a set: when all three are lit it pays its bonus, and they go dark.
   * (Lanes from no pack, from an old save or the Test Lab, make sets of any three.)
   */
  private checkLaneSet(lane: PartInstance, ev: { t: number; x: number; y: number; ballId?: number }, inst = lane): ScoreEvent[] {
    const r = PARTS.lane.recipe, m = this.mods, size = r.setSize ?? 3;
    const lit = this.placed().filter((p) => p.def === 'lane' && p.group === lane.group && this.lit.has(p.uid));
    if (!r.setBonus || lit.length < size) return [];
    for (const l of lit) this.lit.delete(l.uid);
    if (this.take(this.setsPaid, 'lane', 1, r.setCap) === 0) return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`${r.setCap} sets this ball`], 'LANE SETS MAXED')];
    const situ = this.situational(ev);
    const pts = Math.round(r.setBonus.points * m.setFactor * modFactor('lane', m) * situ.x);
    return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, this.gain(r.setBonus.mult * m.setFactor), 0, [`${pts} set bonus`, ...situ.notes], 'LANES COMPLETE'), ...this.setDone(ev)];
  }

  /**
   * The lights of a Rank Lights pack: when every one is lit, the ball that lit the last one ranks up a step (Silver,
   * Gold, Diamond), and they go dark. At Diamond the set starts its time again.
   */
  private checkRankSet(light: PartInstance, ev: { t: number; x: number; y: number; ballId: number }): ScoreEvent[] {
    const r = this.recipe(light.def), rk = r.rank!, size = r.setSize ?? 3;
    const lit = this.placed().filter((p) => p.def === light.def && p.group === light.group && this.lit.has(p.uid));
    if (lit.length < size) return [];
    for (const l of lit) this.lit.delete(l.uid);
    const was = this.rankOf(ev.ballId, ev.t)?.step ?? 0;
    const step = Math.min(rk.steps.length, was + 1);
    this.ranks.set(ev.ballId, { step, until: ev.t + rk.seconds });
    const now = this.rankOf(ev.ballId, ev.t)!;
    const name = now.name.toUpperCase();
    return [this.award(light, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`every hit x${now.x} for ${rk.seconds} s`], step > was ? `${name} RANK!` : `${name} AGAIN!`), ...this.setDone(ev)];
  }

  /** An Old Bell's notch for the round: the run keeps it (onNotch), a test ball only this scorer. True if it rang. */
  private notch(inst: PartInstance, notches: number): boolean {
    if (this.opts.onNotch) return this.opts.onNotch(inst, notches);
    const n = this.notchesOf(inst) + 1;
    this.notched.set(inst.uid, n >= notches ? 0 : n);
    return n >= notches;
  }

  /** An Old Bell's notches towards its next ring. */
  notchesOf(inst: PartInstance): number {
    return this.notched.get(inst.uid) ?? inst.notches ?? 0;
  }

  /** An Old Bell rings: one more ring for the run, and this ball's Mult takes it at once. */
  private ring(inst: PartInstance, ev: { t: number; x: number; y: number }): ScoreEvent {
    this.rings++;
    const before = this.ringX;
    this.refreshRingX();
    const x = Math.round((this.ringX / before) * 1000) / 1000;
    return this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`Mult x${x} on every ball for the rest of the run`], `THE BELL RINGS! x${x}`, undefined, x);
  }

  /** A Garnet halves its part's dark and recharge times. */
  private coolX(inst: PartInstance) {
    return inst.inlay === 'garnet' ? GARNET_X : 1;
  }

  /** What Gold Leaf adds to this part's points so far. */
  leafOf(inst: PartInstance): number {
    return this.leafed.get(inst.uid) ?? inst.leaf ?? 0;
  }

  /** Gold Leaf: +1 for good (the run's, through onLeaf; a test ball's, in this scorer only). */
  private addLeaf(inst: PartInstance, cap: number) {
    if (this.opts.onLeaf) this.opts.onLeaf(inst, cap);
    else this.leafed.set(inst.uid, Math.min(cap, this.leafOf(inst) + 1));
  }

  /**
   * Midnight Clock: a scoring hit moves the hands on a minute. At midnight it strikes (once a ball): every hit pays
   * its ×, and every Lamp is at full glow, for a while; the hands go back to 9 PM.
   */
  private clockHit(ev: { t: number; x: number; y: number }): ScoreEvent | null {
    const clock = this.decor((r) => r.clock);
    if (!clock || this.clockStruck) return null;
    const c = PARTS[clock.def].recipe.clock!;
    if (++this.clockMin < c.hits) return null;
    this.clockMin = 0;
    this.clockStruck = true;
    this.madUntil = ev.t + c.seconds;
    this.flashLamps(ev.t, c.seconds);
    return this.award(clock, ev.t, clock.x, clock.y, 'bonus', 0, 0, 0, [`every hit x${c.x} for ${c.seconds} s`], 'MIDNIGHT MADNESS!');
  }

  /** All the Wizard Lamp's segments lit (once a round): WIZARD MODE, more balls, no ×Mult limits, every Lamp ablaze. */
  private wizardCheck(ev: { t: number }): ScoreEvent | null {
    const need = this.wizardNeedNow();
    if (this.wizFired || need === 0 || this.wizTypes.size < need) return null;
    const lamp = this.placed().find((p) => this.recipe(p.def).wizard);
    if (!lamp || this.jammed.has(lamp.def)) return null;
    const w = this.recipe(lamp.def).wizard!;
    this.wizFired = true;
    this.wizUntil = ev.t + w.seconds;
    this.flashLamps(ev.t, w.seconds);
    const e = this.award(lamp, ev.t, lamp.x, lamp.y, 'bonus', 0, 0, 0, [`${w.balls} more balls, no ×Mult limits for ${w.seconds} s`], 'WIZARD MODE!');
    e.balls = { n: w.balls, x: lamp.x, y: lamp.y, uid: lamp.uid };
    return e;
  }

  /** The Wizard Lamp: its segments, how many are lit, whether it fired this round, and WIZARD MODE's time left. */
  wizardState(t = this.now): { need: number; lit: number; fired: boolean; left: number } {
    const need = this.wizardNeedNow();
    return { need, lit: Math.min(need, this.wizTypes.size), fired: this.wizFired, left: Math.max(0, this.wizUntil - t) };
  }

  /** The segments, less any a boss has jammed (a jammed type cannot be hit). */
  private wizardNeedNow(): number {
    return this.jammed.size ? Math.min(this.wizNeed, wizardNeed(this.getParts().filter((p) => !this.jammed.has(p.def)))) : this.wizNeed;
  }

  /** The Midnight Clock's hands: minutes past 9 PM, and whether it has struck this ball. */
  clockState(): { minutes: number; struck: boolean } {
    return { minutes: this.clockMin, struck: this.clockStruck };
  }

  /** Seconds of Midnight Madness left (0 when there is none). */
  madnessLeft(t = this.now): number {
    return Math.max(0, this.madUntil - t);
  }

  /** What the scorer keeps on a part for the run: the game's copy (onKeep) or, for a test ball, its own. */
  private keepOf<K extends 'sets' | 'rituals'>(inst: PartInstance, key: K): number {
    return this.kept.get(inst.uid)?.[key] ?? inst[key] ?? 0;
  }

  private keep(inst: PartInstance, patch: Partial<PartInstance>) {
    if (this.opts.onKeep) this.opts.onKeep(inst, patch);
    else this.kept.set(inst.uid, { ...this.kept.get(inst.uid), ...patch });
  }

  /** The Ritual Altar's count: sets towards the next ritual, rituals done, and how strong the next one is. */
  altarOf(inst: PartInstance): { sets: number; rituals: number; next: Ritual; strength: number } {
    const rituals = this.keepOf(inst, 'rituals');
    return { sets: this.keepOf(inst, 'sets'), rituals, next: RITUALS[rituals % RITUALS.length], strength: Math.min(MAX_STRENGTH, rituals) };
  }

  /** The ritual under way, and how long it has left. */
  ritualNow(t = this.now): { kind: Ritual; left: number; strength: number } | null {
    const r = this.ritual;
    return r && r.until > t ? { kind: r.kind, left: r.until - t, strength: r.s } : null;
  }

  /** A set was completed (lanes, a drop-target bank, Level Lights, Rank Lights): the Altar counts it, and every few start a ritual. */
  private setDone(ev: { t: number; ballId?: number }): ScoreEvent[] {
    const altar = this.decor((r) => r.altar);
    if (!altar || this.ritual) return []; // no count while a ritual is under way
    const a = PARTS[altar.def].recipe.altar!, st = this.altarOf(altar);
    if (st.sets + 1 < a.sets) { this.keep(altar, { sets: st.sets + 1 }); return []; }
    this.keep(altar, { sets: 0, rituals: st.rituals + 1 });
    const s = st.strength, kind = st.next;
    this.ritual = { kind, until: ev.t + a.seconds, s, next: ev.t, ballId: ev.ballId ?? 1, uid: altar.uid };
    const what = kind === 'tempest' ? `lightning strikes ${tempestRate(s)} parts a second` : kind === 'inferno' ? `every hit zaps the ${infernoReach(s)} nearest parts` : `${swarmSparks(s)} sparks`;
    const e = this.award(altar, ev.t, altar.x, altar.y, 'bonus', 0, 0, 0, [`${what}, for ${a.seconds} s`], `${RITUAL_NAMES[kind].toUpperCase()}!`);
    if (kind === 'swarm') e.sparks = [{ n: swarmSparks(s), x: 12, y: 45, r: 0, parent: ev.ballId ?? 1, top: true }];
    return [e];
  }

  /** How many parts this Tesla Coil arcs to: its base, one more every few levels, up to its most. */
  arcsOf(inst: PartInstance): number {
    const z = this.recipe(inst.def).zap;
    return z ? Math.min(z.maxArcs, z.arcs + Math.floor(this.effLevel(inst) / z.perLevels)) : 0;
  }

  /**
   * Lightning from a Tesla Coil to the nearest parts that can be zapped (not ones zapped in the last ZAP_COOLDOWN s,
   * nor jammed ones): each scores as if the ball had hit it, as that ball, at that ball's speed.
   */
  private arc(coil: PartInstance, ev: ZapCause): ScoreEvent[] {
    const targets = this.zapTargets(coil, ev.t)
      .map((p) => ({ p, d: Math.hypot(p.x - coil.x, p.y - coil.y) }))
      .sort((a, b) => a.d - b.d || a.p.uid - b.p.uid)
      .slice(0, this.arcsOf(coil))
      .map((a) => a.p);
    return this.zap(coil, targets, ev, 'arc');
  }

  /** The parts a zap from `src` could reach right now: zappable, not jammed, not zapped in the last ZAP_COOLDOWN s. */
  private zapTargets(src: PartInstance, t: number): PartInstance[] {
    return this.placed().filter((p) => p.uid !== src.uid && zappable(p.def) && !this.jammed.has(p.def) && (this.zapCool.get(p.uid) ?? -1) <= t);
  }

  /** Zap these parts: each scores as if the ball of `ev` had hit it, and its events say where the zap came from. */
  private zap(src: PartInstance, targets: PartInstance[], ev: ZapCause, by: ZapKind): ScoreEvent[] {
    const out: ScoreEvent[] = [];
    for (const p of targets) {
      this.zapCool.set(p.uid, ev.t + ZAP_COOLDOWN);
      const zev = { type: 'partHit' as const, t: ev.t, uid: p.uid, ballId: ev.ballId, x: p.x, y: p.y, speed: ev.speed, zap: true, depth: (ev.depth ?? 0) + 1, mover: PARTS[p.def].kind === 'mover' || undefined };
      for (const e of this.hit(p, zev)) out.push({ ...e, zap: { x: src.x, y: src.y, by } });
    }
    return out;
  }

  /**
   * Time passes: a Powder Keg whose fuse has burnt down blows. Called every sim step (the game does); the blast
   * zaps every part within reach, and lights the kegs it reaches one step further down the chain.
   */
  tick(t: number): ScoreEvent[] {
    const out: ScoreEvent[] = [];
    const rit = this.ritual;
    if (rit && t >= rit.until) this.ritual = null;
    else if (rit?.kind === 'tempest') {
      // the Tempest: lightning strikes a random part, a few times a second
      const altar = this.getParts().find((p) => p.uid === rit.uid);
      while (altar && rit.next <= t) {
        rit.next += 1 / tempestRate(rit.s);
        const pool = this.zapTargets(altar, t).sort((a, b) => a.uid - b.uid);
        if (!pool.length) continue;
        const hit = pool[Math.floor(this.rng.next() * pool.length)];
        this.now = t;
        out.push(...this.zap(altar, [hit], { t, ballId: rit.ballId, speed: 20 }, 'storm'));
      }
    }
    for (const [uid, k] of [...this.kegs]) {
      if (k.spent || k.at > t) continue;
      const inst = this.placed().find((p) => p.uid === uid);
      k.spent = true;
      k.at = t + (inst ? (this.recipe(inst.def).keg?.rearm ?? 0) * this.coolX(inst) : 0);
      if (!inst || this.jammed.has(inst.def)) continue;
      const r = this.recipe(inst.def).keg!, m = this.mods;
      this.now = t;
      const situ = this.situational({ ballId: k.ballId, t });
      const pts = Math.round(r.blast * modFactor(inst.def, m) * situ.x);
      const e = this.award(inst, t, inst.x, inst.y, 'bonus', pts, 0, 0, [`${pts} blast`, ...situ.notes], 'KABOOM!');
      e.blast = r.radius;
      if (r.sparks) e.sparks = [{ n: r.sparks, x: inst.x, y: inst.y, r: footprint(PARTS[inst.def]) + 0.45, parent: k.ballId }];
      out.push(e);
      const near = this.zapTargets(inst, t).filter((p) => Math.hypot(p.x - inst.x, p.y - inst.y) <= r.radius + footprint(PARTS[p.def]) * 0.5);
      out.push(...this.zap(inst, near, { t, ballId: k.ballId, speed: 20, depth: k.depth }, 'blast'));
    }
    return out;
  }

  /** How many rocks a Rock Pile holds now: one, and one more for every few hits this round. */
  rocksOf(inst: PartInstance): number {
    const r = this.recipe(inst.def).rocks;
    return r ? Math.min(r.max, 1 + Math.floor((this.rockHits.get(inst.uid) ?? 0) / r.every)) : 0;
  }

  /** Has this Firecracker fired its rocket this ball (as often as it can)? */
  rocketSpent(inst: PartInstance): boolean {
    return (this.firedThisBall.get(inst.uid) ?? 0) >= (inst.inlay === 'emerald' ? 2 : 1);
  }

  /** Is this Powder Keg lit (fuse burning), spent (re-arming), or ready? */
  kegState(uid: number, t = this.now): 'lit' | 'spent' | null {
    const k = this.kegs.get(uid);
    return !k ? null : !k.spent ? 'lit' : k.at > t ? 'spent' : null;
  }

  /** A Laser Turret fires: a beam through it at a random angle, wall to wall; every part on the line is zapped. */
  private fire(laser: PartInstance, scored: ScoreEvent, ev: ZapCause): ScoreEvent[] {
    const r = this.recipe(laser.def).beam!;
    this.coolUntil.set(laser.uid, ev.t + r.cooldown * this.coolX(laser));
    const a = this.rng.next() * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
    // the beam runs until it leaves the table, both ways
    const reach = (sx: number, sy: number) => {
      const tx = sx > 0 ? (TABLE_W - laser.x) / sx : sx < 0 ? -laser.x / sx : Infinity;
      const ty = sy > 0 ? (TABLE_H - laser.y) / sy : sy < 0 ? -laser.y / sy : Infinity;
      return Math.min(tx, ty);
    };
    const f = reach(dx, dy), b = reach(-dx, -dy);
    scored.beam = { x1: laser.x - dx * b, y1: laser.y - dy * b, x2: laser.x + dx * f, y2: laser.y + dy * f };
    scored.label ??= 'PEW!';
    const on = this.zapTargets(laser, ev.t).filter((p) => Math.abs((p.x - laser.x) * dy - (p.y - laser.y) * dx) <= footprint(PARTS[p.def]) + 0.3);
    return this.zap(laser, on, ev, 'beam');
  }

  /** A Shockwave Gong booms: every part on the table that can be zapped is. */
  private boom(gong: PartInstance, ev: ZapCause & { x: number; y: number }): ScoreEvent[] {
    const e = this.award(gong, ev.t, gong.x, gong.y, 'bonus', 0, 0, 0, [], 'BOOM!');
    e.blast = 30;
    return [e, ...this.zap(gong, this.zapTargets(gong, ev.t), ev, 'boom')];
  }

  /** Every Lamp at full glow for a while (a drop-target set, the Disco Ball). */
  private flashLamps(t: number, seconds: number) {
    this.lampFlashUntil = Math.max(this.lampFlashUntil, t + seconds);
  }

  /** This Level Light and the ones within its reach: they work together. */
  lightGroup(inst: PartInstance): PartInstance[] {
    const near = this.placed().filter((p) => p.def === 'uplight' && p.uid !== inst.uid && Math.hypot(p.x - inst.x, p.y - inst.y) <= LEVEL_RADIUS);
    return [inst, ...near];
  }

  /** X Lane: light the next dark Lane Rollover (left to right); it can complete a set. */
  private lightNextLane(): PartInstance | undefined {
    const lanes = this.placed().filter((p) => p.def === 'lane').sort((a, b) => a.x - b.x || a.y - b.y);
    const dark = lanes.find((l) => !this.lit.has(l.uid));
    if (dark) this.lit.add(dark.uid);
    return dark;
  }

  /** Big Boi's own ability on a hit: the Cook calls an order, the Dragon loses a plate. */
  private bigBoiHit(inst: PartInstance, ev: { t: number; x: number; y: number; ballId?: number }): ScoreEvent[] {
    if (this.bigBoi === 'cook') {
      this.order = this.pickOrder(this.order);
      return [];
    }
    if (this.bigBoi !== 'dragon') return [];
    this.armour = Math.max(0, this.armour - 1);
    if (this.armour > 0) return [];
    this.slays++;
    this.armour = DRAGON.armour + DRAGON.regrow * this.slays;
    const r = this.recipe('mega'), m = this.mods;
    const situ = this.situational(ev);
    const pts = Math.round((r.points! + (r.perLevel ?? 0) * this.effLevel(inst)) * DRAGON.jackpotX * modFactor('mega', m) * situ.x);
    return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, 0, 0, [`${pts} armour broken`, ...situ.notes], 'ARMOUR BROKEN!')];
  }

  ledgerRows(): LedgerRow[] {
    return [...this.ledger.values()].sort((a, b) => b.points - a.points);
  }
}
