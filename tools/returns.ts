import { neutralMods } from '../src/data/mods';
import { footprint, makePart, PARTS, type PartId, type PartInstance } from '../src/data/parts';
import { Game } from '../src/game/game';
import { Bot } from '../src/sim/bot';
import { BUILD_AREA, LANE_TOP_Y, LANE_WALL_X } from '../src/sim/constants';
import { canPlace, starterLayout, type Layout } from '../src/sim/layout';
import { Rng } from '../src/sim/rng';
import type { BallState } from '../src/sim/sim';

/**
 * Where do balls go back to the plunger, and where do they get stuck? Plays bot rounds on random tables full of
 * the parts that move, hold or throw balls, and logs every way a ball in play ends up at the spawn point:
 *
 *   saver / net    a drain inside the save window, sent back to the plunger (a Ball Saver or the Safety Net decal)
 *   lane           a ball in play that fell into the plunger lane and had to be plunged again
 *   short          a plunge too weak to leave the lane (the ball rolls back to the plunger: expected)
 *   timeout        a ball that ran out of time (its own age, or the ball clock)
 *   search         not a return: a ball that stopped moving, kicked where it is by the ball search
 *   relaunch       a stuck ball the search's kicks could not free, put back in the plunger lane (not lost)
 *   tilt           the player tilted (the bot never nudges, so this should be zero)
 *
 *   npx vite-node tools/stuck.ts [--tables=40] [--rounds=2] [--seed=1] [--skill=0.6] [--verbose]   (the report)
 */

/** The parts that hold, move or throw balls (the suspects), and some ordinary ones to fill the table. */
const SUSPECTS: PartId[] = ['goal', 'duck', 'roller', 'thunder', 'strip', 'magnet', 'printer', 'jackpot', 'kickback', 'bank'];
const FILLERS: PartId[] = ['pop', 'coin', 'sling', 'deflector', 'vari', 'lane', 'spinner', 'saver', 'piggy', 'ding', 'golden', 'lamp'];

/** A random table: the starter machine plus a handful of suspects and fillers wherever they fit. */
export function randomTable(seed: number, suspects = 5, fillers = 3): Layout {
  const rng = new Rng(seed);
  const l = starterLayout();
  const pick = (from: PartId[], n: number) => {
    const pool = [...from];
    const out: PartId[] = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
    return out;
  };
  for (const id of [...pick(SUSPECTS, suspects), ...pick(FILLERS, fillers)]) {
    const r = footprint(PARTS[id]);
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.round(rng.range(BUILD_AREA.x0 + r, BUILD_AREA.x1 - r) * 2) / 2;
      const y = Math.round(rng.range(BUILD_AREA.y0 + r, BUILD_AREA.y1 - r) * 2) / 2;
      if (!canPlace(l, id, x, y)) continue;
      const p: PartInstance = makePart(id, l.nextUid++, x, y, true);
      if (PARTS[id].rotatable) p.angle = Math.round(rng.range(-1.6, 1.6) * 10) / 10;
      l.parts.push(p);
      break;
    }
  }
  return l;
}

export type Cause = 'saver' | 'net' | 'lane' | 'short' | 'timeout' | 'clock' | 'search' | 'relaunch' | 'tilt';
export interface Incident {
  cause: Cause;
  table: number;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** For a lane return: what last threw the ball (a part id and what it did), if anything in the last 2 s. */
  source?: string;
  /** The nearest part and the ball's offset from it. */
  near?: { def: PartId; dx: number; dy: number; d: number };
}
export interface StuckReport {
  balls: number;
  launches: number;
  drains: number;
  seconds: number;
  incidents: Incident[];
}

const inLane = (b: { x: number; y: number }) => b.x > LANE_WALL_X - 0.1 && b.y < LANE_TOP_Y;

function nearest(parts: PartInstance[], x: number, y: number): Incident['near'] {
  let best: Incident['near'];
  for (const p of parts) {
    if (!p.placed || PARTS[p.def].kind === 'strip' || PARTS[p.def].kind === 'saver') continue;
    const d = Math.hypot(p.x - x, p.y - y) - footprint(PARTS[p.def]);
    if (!best || d < best.d) best = { def: p.def, dx: Math.round((x - p.x) * 10) / 10, dy: Math.round((y - p.y) * 10) / 10, d: Math.round(d * 10) / 10 };
  }
  return best;
}

/** Play `rounds` full rounds (every ball out) on each layout with the bot, and log every incident. */
export function measure(layouts: Layout[], o: { rounds: number; seed: number; skill: number }): StuckReport {
  const rep: StuckReport = { balls: 0, launches: 0, drains: 0, seconds: 0, incidents: [] };
  layouts.forEach((layout, table) => {
    for (let r = 0; r < o.rounds; r++) {
      const g = new Game();
      g.layout = structuredClone(layout);
      g.fixedMods = neutralMods();
      g.goalOverride = Infinity;
      g.seed = o.seed * 1000 + table * 31 + r * 7 + 1;
      g.startRound();
      const bot = new Bot(o.seed * 1000 + table * 31 + r + 1, o.skill);
      /** Per ball: has it left the lane since it was last plunged, and what last threw it. */
      const left = new Map<number, boolean>();
      const lastThrow = new Map<number, { t: number; what: string }>();
      /** Per ball: where it last came down through the top of the lane (from the playfield side). */
      const entry = new Map<number, BallState>();
      let prev: BallState[] = [];
      let awaiting = g.sim.awaitingPlunge;
      const log = (cause: Cause, b: BallState, extra: Partial<Incident> = {}) =>
        rep.incidents.push({ cause, table, t: g.sim.time, x: b.x, y: b.y, vx: b.vx, vy: b.vy, near: nearest(g.layout.parts, b.x, b.y), ...extra });
      for (let guard = 0; g.mode === 'round' && guard < 240 * 60 * 30; guard++) {
        const input = bot.decide(g.sim);
        const res = g.step(input);
        const now = g.sim.ballStates();
        const gone = prev.filter((b) => !now.some((q) => q.id === b.id));
        let spawned = false;
        for (const e of res.sim) {
          if (e.type === 'launch') { rep.launches++; left.set(e.ballId, false); }
          if (e.type === 'ballSpawn') spawned = true;
          if (e.type === 'ballSaved') {
            spawned = true;
            const b = gone.shift();
            if (b) log(e.uid === -1 ? 'net' : 'saver', b);
          }
          if (e.type === 'drain') {
            rep.drains++;
            const b = prev.find((q) => q.id === e.ballId);
            if (b && e.reason === 'timeout') log(g.sim.clockLeft === null ? 'clock' : 'timeout', b);
          }
          if (e.type === 'ballSearch') {
            const b = prev.find((q) => q.id === e.ballId);
            const relaunch = 'relaunch' in e && !!e.relaunch; // the search gave up and put the ball back in the lane
            if (b) log(relaunch ? 'relaunch' : 'search', b);
            if (relaunch) { spawned = true; left.set(e.ballId, false); }
          }
          if (e.type === 'tilt') { const b = now[0]; if (b) log('tilt', b); }
          if (e.type === 'partRelease') lastThrow.set(e.ballId, { t: e.t, what: `${g.layout.parts.find((p) => p.uid === e.uid)?.def} eject` });
          if (e.type === 'extraBall') lastThrow.set(e.ballId, { t: e.t, what: `${g.layout.parts.find((p) => p.uid === e.uid)?.def} print` });
          if (e.type === 'partHit') {
            const def = g.layout.parts.find((p) => p.uid === e.uid)?.def;
            lastThrow.set(e.ballId, { t: e.t, what: `${def}${e.kicked ? ' kick' : e.mover ? ' mover' : ''}` });
          }
          if (e.type === 'flipper' && e.on) for (const b of now) if (!inLane(b)) lastThrow.set(b.id, { t: e.t, what: `flipper ${e.side}` });
        }
        for (const b of now) {
          if (!inLane(b) || b.y > LANE_TOP_Y) { if (!left.get(b.id)) left.set(b.id, true); }
          const pb = prev.find((q) => q.id === b.id);
          if (pb && pb.y >= LANE_TOP_Y && b.y < LANE_TOP_Y && b.x > LANE_WALL_X - 0.1) entry.set(b.id, pb);
        }
        if (!awaiting && g.sim.awaitingPlunge && !spawned) {
          // the plunger re-armed without a new ball: some ball came to rest in the lane
          for (const b of now) {
            if (!inLane(b)) continue;
            const src = lastThrow.get(b.id);
            const pb = prev.find((q) => q.id === b.id) ?? b;
            if (left.get(b.id)) {
              // where did it come in? walk back is not kept; report the throw that sent it, and the rest spot
              const at = entry.get(b.id) ?? pb;
              log('lane', at, { source: src && g.sim.time - src.t < 4 ? src.what : 'none' });
            } else log('short', pb);
            entry.delete(b.id);
            left.set(b.id, false);
          }
        }
        if (res.game.some((e) => e.type === 'ballEnd')) rep.balls++;
        awaiting = g.sim.awaitingPlunge;
        prev = now;
      }
      rep.seconds += g.sim.time;
    }
  });
  return rep;
}

/** Returns per 100 balls, by cause. */
export function perHundred(rep: StuckReport): Record<Cause, number> {
  const out = {} as Record<Cause, number>;
  for (const c of ['saver', 'net', 'lane', 'short', 'timeout', 'clock', 'search', 'relaunch', 'tilt'] as Cause[]) {
    out[c] = Math.round((rep.incidents.filter((i) => i.cause === c).length / Math.max(1, rep.balls)) * 1000) / 10;
  }
  return out;
}

export function cluster(list: Incident[], title: string) {
  if (!list.length) return;
  console.log(`\n${title} (${list.length}):`);
  const byPart = new Map<string, number>();
  for (const i of list) {
    const k = i.near && i.near.d < 1.2 ? `${i.near.def}` : i.x < 1.5 || i.x > 22.5 || i.y > 44 ? 'cabinet wall' : i.y < 12 ? 'flippers / inlanes' : 'open table';
    byPart.set(k, (byPart.get(k) ?? 0) + 1);
  }
  console.log('  by what it touches: ' + [...byPart].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
  const bins = new Map<string, number>();
  for (const i of list) {
    const k = `(${Math.round(i.x)},${Math.round(i.y)})`;
    bins.set(k, (bins.get(k) ?? 0) + 1);
  }
  console.log('  hottest spots: ' + [...bins].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} x${n}`).join('  '));
  const byLocal = new Map<string, number>();
  for (const i of list) {
    if (!i.near || i.near.d > 1.2) continue;
    const k = `${i.near.def} at (${Math.round(i.near.dx * 2) / 2},${Math.round(i.near.dy * 2) / 2})`;
    byLocal.set(k, (byLocal.get(k) ?? 0) + 1);
  }
  if (byLocal.size) console.log('  relative to the part: ' + [...byLocal].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} x${n}`).join('  '));
  const src = new Map<string, number>();
  for (const i of list) if (i.source) src.set(i.source, (src.get(i.source) ?? 0) + 1);
  if (src.size) console.log('  last thrown by: ' + [...src].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(', '));
}
