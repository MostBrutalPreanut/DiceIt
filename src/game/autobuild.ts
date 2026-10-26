import { neutralMods, type Mods } from '../data/mods';
import type { MachineId } from '../data/bigboi';
import { PARTS, footprint, type PartId, type PartInstance } from '../data/parts';
import { Bot } from '../sim/bot';
import { BUILD_AREA } from '../sim/constants';
import { canPlace, cloneLayout, type Layout } from '../sim/layout';
import { Rng } from '../sim/rng';
import { Game, migrateParts } from './game';

/**
 * The auto-builder and the machine meter. Given the parts a run owns, find a good layout by simulated
 * play: the same code is the balance tool's "par machine", and later the Lab's estimate and a
 * "suggest a layout" helper. It lives in src/game because it needs the real Game, but nothing in the
 * browser build depends on it.
 */
export type Levels = Partial<Record<PartId, number>>;

/** Everything that decides what a machine scores: the parts as laid out, the run's upgrades and levels. */
export interface Machine {
  layout: Layout;
  mods: Mods;
  /** Old reports: a level per part type (levels now live on each part). */
  levels?: Levels;
  /** The machine (what its Big Boi does); the Factory if absent. */
  machine?: MachineId;
  /** Old Bell rings the run has so far (every ball's Mult ×1.2 each). */
  rings?: number;
}

/** One simulated round with every ball played out (no goal), as the bot plays it. */
export interface RoundSample {
  /** Score after each ball. */
  cumulative: number[];
  /** Coins earned (Cha-Ching bumpers, Gold Ball) after each ball. */
  coins: number[];
  /** Sim seconds the whole round took. */
  seconds: number;
  /** Ball searches: the sim kicked a ball that had stopped moving. A healthy machine has none. */
  searches: number;
  /** Points scored per part type over the round (where the score came from). */
  points: Partial<Record<PartId, number>>;
}

export interface PlayOptions {
  rounds: number;
  seed: number;
  /** The bot's flipper skill (0 to 1). About 0.6 is human-ish. */
  skill: number;
}

/** Play `rounds` full rounds with the real Game loop, every ball out, and record the scores. */
export function playRounds(m: Machine, o: PlayOptions): RoundSample[] {
  const out: RoundSample[] = [];
  for (let i = 0; i < o.rounds; i++) {
    const g = new Game();
    g.layout = cloneLayout(m.layout);
    g.fixedMods = { ...neutralMods(), ...m.mods };
    if (m.machine) g.machine = m.machine;
    g.rings = m.rings ?? 0;
    migrateParts(g.layout, m.levels);
    g.goalOverride = Infinity;
    g.seed = o.seed * 1000 + i * 7 + 1;
    g.startRound();
    const bot = new Bot(o.seed * 1000 + i + 1, o.skill);
    const cumulative: number[] = [], coins: number[] = [];
    let searches = 0;
    for (let guard = 0; g.mode === 'round' && guard < 240 * 60 * 30; guard++) {
      const res = g.step(bot.decide(g.sim));
      for (const e of res.sim) if (e.type === 'ballSearch') searches++;
      if (res.game.some((e) => e.type === 'ballEnd')) {
        cumulative.push(g.scorer.score);
        coins.push(g.scorer.money);
      }
    }
    const points: RoundSample['points'] = {};
    for (const row of g.scorer.ledgerRows()) points[row.def] = (points[row.def] ?? 0) + row.points;
    out.push({ cumulative, coins, seconds: g.sim.time, searches, points });
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * The auto-builder maximises this: half the mean round total and half the mean of the worse half of rounds
 * (a machine that clears a goal reliably beats one that is lucky now and then), discounted 3% for every
 * ball search per round. A search means a ball sat still for 3.5 s: usually a pile of balls resting at a
 * flipper's pivot in multiball, sometimes a real trap, and either way time the machine is not scoring.
 */
export function objective(samples: RoundSample[]): number {
  const totals = samples.map((s) => s.cumulative[s.cumulative.length - 1] ?? 0).sort((a, b) => a - b);
  const worse = totals.slice(0, Math.max(1, Math.ceil(totals.length / 2)));
  return (0.5 * mean(totals) + 0.5 * mean(worse)) * Math.pow(0.97, mean(samples.map((s) => s.searches)));
}

export interface BuildOptions {
  seed: number;
  skill: number;
  /** Rounds simulated to score one candidate layout (each is several balls). */
  evalRounds: number;
  /** Hill-climbing moves after the new parts are placed. */
  steps: number;
  /** Random spots tried for each part that is not on the board yet. */
  placeTries: number;
}

export interface BuildResult {
  machine: Machine;
  /** The objective before and after, on the same bot seeds. `after` is never below `before`. */
  before: number;
  after: number;
  evaluations: number;
}

const ANGLE_STEP = Math.PI / 12;

/** A random valid spot for a part, or null if the board has no room for it. */
function randomSpot(layout: Layout, part: PartInstance, rng: Rng): { x: number; y: number } | null {
  const r = footprint(PARTS[part.def]);
  const decor = PARTS[part.def].kind === 'decor'; // decor goes on the cabinet round the table
  for (let i = 0; i < (decor ? 400 : 80); i++) {
    const x = decor ? rng.range(-1.5, 27.5) : rng.range(BUILD_AREA.x0 + r, BUILD_AREA.x1 - r), y = decor ? rng.range(-1, 54) : rng.range(BUILD_AREA.y0 + r, BUILD_AREA.y1 - r);
    if (canPlace(layout, part.def, x, y, part.uid)) return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }
  return null;
}

const randomAngle = (rng: Rng) => Math.round(rng.range(0, 24)) * ANGLE_STEP % (Math.PI * 2);

/**
 * Lay out the parts a machine owns. New (unplaced) parts go to the best of `placeTries` random spots, then
 * `steps` hill-climbing moves (move, nudge, rotate, turn a dial, swap two parts, bench or place a part) are
 * kept when they do not lower the score. Every candidate is played on the same bot seeds, so the comparison
 * is fair; the result is validated by `canPlace` at every step, so no part ever overlaps or leaves the board.
 */
export function autoBuild(m: Machine, o: BuildOptions): BuildResult {
  const rng = new Rng(o.seed);
  const layout = cloneLayout(m.layout);
  const evalSeed = o.seed + 17;
  let evaluations = 0;
  const score = () => {
    evaluations++;
    return objective(playRounds({ ...m, layout }, { rounds: o.evalRounds, seed: evalSeed, skill: o.skill }));
  };

  const before = score();
  let current = before;

  // phase A: put every part that is not on the board somewhere good
  for (const part of layout.parts.filter((p) => !p.placed)) {
    let best: { x: number; y: number; angle: number; score: number } | null = null;
    for (let t = 0; t < o.placeTries; t++) {
      const spot = randomSpot(layout, part, rng);
      if (!spot) break;
      part.x = spot.x;
      part.y = spot.y;
      part.angle = PARTS[part.def].rotatable ? randomAngle(rng) : 0;
      part.placed = true;
      const s = score();
      if (!best || s > best.score) best = { ...spot, angle: part.angle, score: s };
      part.placed = false;
    }
    if (best && best.score >= current) {
      part.x = best.x;
      part.y = best.y;
      part.angle = best.angle;
      part.placed = true;
      current = best.score;
    }
  }

  // phase B: hill-climb
  for (let step = 0; step < o.steps; step++) {
    // the Big Boi is part of the machine: never moved, swapped or benched
    const placed = layout.parts.filter((p) => p.placed && !p.fixed);
    const loose = layout.parts.filter((p) => !p.placed && !p.fixed);
    const part = placed.length ? placed[Math.floor(rng.next() * placed.length)] : undefined;
    const roll = rng.next();
    const undo: (() => void)[] = [];
    const set = <K extends keyof PartInstance>(p: PartInstance, k: K, v: PartInstance[K]) => {
      const old = p[k];
      p[k] = v;
      undo.push(() => { p[k] = old; });
    };
    let changed = false;

    if (roll < 0.35 && part) {
      // nudge a part, or jump it somewhere new
      const jump = rng.next() < 0.3;
      const spot = jump ? randomSpot(layout, part, rng) : { x: part.x + rng.range(-2, 2), y: part.y + rng.range(-2, 2) };
      if (spot && canPlace(layout, part.def, spot.x, spot.y, part.uid)) {
        set(part, 'x', Math.round(spot.x * 10) / 10);
        set(part, 'y', Math.round(spot.y * 10) / 10);
        changed = true;
      }
    } else if (roll < 0.55 && part && PARTS[part.def].rotatable) {
      set(part, 'angle', randomAngle(rng));
      changed = true;
    } else if (roll < 0.75 && part && PARTS[part.def].dials.length) {
      const d = PARTS[part.def].dials[Math.floor(rng.next() * PARTS[part.def].dials.length)];
      const n = Math.round((d.max - d.min) / d.step);
      const v = Math.round((d.min + d.step * Math.floor(rng.next() * (n + 1))) * 1000) / 1000;
      const old = part.dials[d.id];
      part.dials[d.id] = v;
      undo.push(() => { part.dials[d.id] = old; });
      changed = v !== old;
    } else if (roll < 0.87 && placed.length >= 2) {
      // swap two parts' places
      const other = placed[Math.floor(rng.next() * placed.length)];
      if (part && other !== part) {
        const [ax, ay, bx, by] = [part.x, part.y, other.x, other.y];
        part.placed = other.placed = false; // so neither blocks the other's new spot
        if (canPlace(layout, part.def, bx, by, part.uid) && canPlace(layout, other.def, ax, ay, other.uid)) {
          part.x = bx; part.y = by; other.x = ax; other.y = ay;
          undo.push(() => { part.x = ax; part.y = ay; other.x = bx; other.y = by; });
          changed = true;
        }
        part.placed = other.placed = true;
      }
    } else if (loose.length && rng.next() < 0.7) {
      // bring a benched part back
      const p = loose[Math.floor(rng.next() * loose.length)];
      const spot = randomSpot(layout, p, rng);
      if (spot) {
        set(p, 'x', spot.x);
        set(p, 'y', spot.y);
        set(p, 'placed', true);
        changed = true;
      }
    } else if (part && placed.length > 3) {
      set(part, 'placed', false); // bench a part that is in the way
      changed = true;
    }
    if (!changed) continue;
    const s = score();
    if (s >= current) current = s;
    else for (const u of undo.reverse()) u();
  }

  return { machine: { ...m, layout }, before, after: current, evaluations };
}

/** Is every placed part somewhere `canPlace` allows? (The auto-builder's own invariant, for tests and tools.) */
export function layoutIsValid(layout: Layout): boolean {
  return layout.parts.every((p) => !p.placed || canPlace(layout, p.def, p.x, p.y, p.uid));
}
