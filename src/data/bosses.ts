import { Rng } from '../sim/rng';
import type { Mods } from './mods';

/**
 * Bosses: every third round is a boss, a stress test that breaks one assumption your machine makes, so a build
 * that only works one way has to be re-tuned (the idea of Balatro's boss blinds). Each run draws four of the
 * nine regular bosses for rounds 3, 6, 9 and 12, and one of the three final bosses for round 15; the next boss is
 * always shown in advance, so you can prepare for it in the shop. Final bosses stack two problems and are harder.
 *
 * Most bosses are plain Mods (the same numbers the decals change); three need a rule of their own:
 *  - The Jammer switches off your most numerous part type for the round,
 *  - The Overlord switches off a random part type every ball,
 *  - The Auditor switches your decals off until you reach half the goal.
 */
export type BossId =
  | 'taxMan' | 'cheapRubber' | 'slippery' | 'nightShift' | 'crossedWires' | 'shortFuse' | 'jammer' | 'flatRate' | 'magnet'
  | 'auditor' | 'overlord' | 'whirlpool';

export interface BossDef {
  id: BossId;
  name: string;
  /** One sentence: what it does to your machine. */
  text: string;
  final: boolean;
  /** The round's goal is this many times the table's. */
  goalX?: number;
  mods?: (m: Mods) => void;
  /** Rules that are not plain Mods. */
  jam?: 'mostNumerous' | 'randomEachBall';
  decalsOffUntilHalf?: boolean;
  /** Short shout for the dot-matrix display when the round starts. */
  shout: string;
}

/** Where The Magnet and The Whirlpool pull: just above the drain, between the flippers. */
const DRAIN = { x: 12, y: 6 };

export const BOSSES: Record<BossId, BossDef> = {
  // ---- regular bosses (rounds 3, 6, 9, 12) ----
  taxMan: { id: 'taxMan', name: 'The Tax Man', final: false, shout: 'THE TAX MAN COMETH',
    text: 'Parts pay no money this round, and the round pays $3 less.', mods: (m) => { m.noCoins = true; m.payCut += 3; } },
  cheapRubber: { id: 'cheapRubber', name: 'Cheap Rubber', final: false, shout: 'SOMEONE BOUGHT CHEAP RUBBER',
    text: 'Bumpers and Slingshots kick half as hard.', mods: (m) => { m.kickFactor *= 0.5; } },
  slippery: { id: 'slippery', name: 'Slippery Slope', final: false, shout: 'WHO TILTED THE TABLE',
    text: 'The table is steeper: the ball falls 40% faster.', mods: (m) => { m.ballGravity *= 1.4; } },
  nightShift: { id: 'nightShift', name: 'Night Shift', final: false, shout: 'LIGHTS OUT. NIGHT SHIFT',
    text: 'Lights out: Lamps, lanes, Level Lights, X Lanes and Disco Balls do nothing.', mods: (m) => { m.lightsOut = true; } },
  crossedWires: { id: 'crossedWires', name: 'Crossed Wires', final: false, shout: 'WHO WIRED THIS THING',
    text: 'The flipper buttons are swapped: ← works the right flippers, → the left.', mods: (m) => { m.swapFlippers = true; } },
  shortFuse: { id: 'shortFuse', name: 'Short Fuse', final: false, shout: 'SHORT FUSE. HURRY UP',
    text: "Every ball's clock is 30 seconds.", mods: (m) => { m.ballClock = Math.min(m.ballClock, 30); } },
  jammer: { id: 'jammer', name: 'The Jammer', final: false, shout: 'THE JAMMER GOT IN',
    text: 'Your most numerous part type is jammed: it scores nothing this round.', jam: 'mostNumerous' },
  flatRate: { id: 'flatRate', name: 'Flat Rate', final: false, shout: 'FLAT RATE. NO BIG MULTS',
    text: 'Every Mult gain is 30% smaller (and ×Mults move 30% less far).', mods: (m) => { m.multGain *= 0.7; } },
  magnet: { id: 'magnet', name: 'The Magnet', final: false, shout: 'THE MAGNET IS ON',
    text: 'A magnet under the drain pulls every ball towards it.', mods: (m) => { m.magnet = { ...DRAIN, strength: 22, radius: 16 }; } },

  // ---- final bosses (round 15): two problems at once ----
  auditor: { id: 'auditor', name: 'The Auditor', final: true, shout: 'THE AUDITOR WILL SEE YOU NOW',
    text: 'Your decals are switched off until you reach half the goal, and the goal is 10% higher.', goalX: 1.1, decalsOffUntilHalf: true },
  overlord: { id: 'overlord', name: 'The Overlord', final: true, shout: 'KNEEL BEFORE THE OVERLORD',
    text: 'Every ball, a random part type on your table is switched off, and every Mult gain is 30% smaller.', jam: 'randomEachBall', mods: (m) => { m.multGain *= 0.7; } },
  whirlpool: { id: 'whirlpool', name: 'The Whirlpool', final: true, shout: 'HERE COMES THE WHIRLPOOL',
    text: "A whirlpool drags every ball towards the drain, the table is steeper, and every ball's clock is 40 seconds.",
    mods: (m) => { m.magnet = { ...DRAIN, strength: 30, radius: 18 }; m.ballGravity *= 1.2; m.ballClock = Math.min(m.ballClock, 40); } },
};

export const BOSS_IDS = Object.keys(BOSSES) as BossId[];
export const REGULAR_BOSSES = BOSS_IDS.filter((id) => !BOSSES[id].final);
export const FINAL_BOSSES = BOSS_IDS.filter((id) => BOSSES[id].final);
/** The last round of a run: the final boss. Past it the run goes on (endless) with every boss back in the draw. */
export const FINAL_ROUND = 15;

/** A run's bosses: four different regular ones and a final one, from the run's seed. */
export function planBosses(seed: number): BossId[] {
  const rng = new Rng(seed);
  const pool = [...REGULAR_BOSSES];
  const out: BossId[] = [];
  for (let i = 0; i < 4; i++) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  out.push(FINAL_BOSSES[Math.floor(rng.next() * FINAL_BOSSES.length)]);
  return out;
}

/** The boss of round `round` in a run with this plan, or null if it is not a boss round. Endless rounds draw from every boss. */
export function bossOf(plan: BossId[], round: number, every = 3): BossId | null {
  if (round % every !== 0) return null;
  const n = round / every - 1;
  if (n < plan.length) return plan[n];
  return BOSS_IDS[Math.floor(new Rng(round * 7919 + plan.length).next() * BOSS_IDS.length)];
}
