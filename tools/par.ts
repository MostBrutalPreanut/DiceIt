import type { Mods } from '../src/data/mods';
import { PARTS, type PartId } from '../src/data/parts';
import { UPGRADES, type UpgradeId } from '../src/data/upgrades';
import { autoBuild, playRounds, type BuildOptions, type Levels, type RoundSample } from '../src/game/autobuild';
import { Game, payoutFor } from '../src/game/game';
import type { Layout } from '../src/sim/layout';

/**
 * The par player: a sensible, unlucky-proof player that the goal curve is measured against. Each round it
 * takes the upgrade it is owed, shops by a written policy, lets the auto-builder lay the machine out, and
 * is then measured by the bot. Nothing here is a secret formula: the policy is data, so changing what
 * "par" means is a one-line edit, and `npm run balance` shows what that does to the curve.
 */

/** How much the par player wants each part (value per dollar decides what it buys first). */
export const PART_VALUE: Record<PartId, number> = {
  pop: 4, coin: 2.5, mega: 5, sling: 2.5, spinner: 3, lane: 2, printer: 4, flipper: 3, lamp: 2, uplight: 0,
  deflector: 0.5, bank: 3.5, kickback: 1.5, saver: 3, vari: 3.5,
};
/** How many of each it will own. (Level Lights need aiming in sets of two or more, which par does not do.) */
export const PART_CAP: Record<PartId, number> = {
  pop: 4, coin: 3, mega: 2, sling: 2, spinner: 2, lane: 3, printer: 1, flipper: 2, lamp: 2, uplight: 0,
  deflector: 1, bank: 1, kickback: 2, saver: 1, vari: 2,
};
/** The first card of the three it is offered that appears in this list is the one it takes. */
export const UPGRADE_PRIORITY: UpgradeId[] = [
  'goldenAge', 'twin', 'extraBall', 'overclock', 'levelUp', 'headStart', 'sets', 'printerPlus', 'lamps', 'sponsor', 'interest',
  'heavy', 'gold', 'lucky', 'saver', 'kickbacks', 'flippers', 'rubber', 'glass', 'coupon', 'bigShelf', 'fullRefund', 'ballHog',
];
const MAX_REROLLS = 2;

export interface ParOptions {
  /** Which par run this is: different shops, different upgrade offers. */
  seed: number;
  rounds: number;
  /** How often a par machine should fail the round: in round 1, and in the last round (rising in between). */
  failStart: number;
  failEnd: number;
  skill: number;
  /** Simulated rounds the machine is measured over, each round. */
  measure: number;
  build: Omit<BuildOptions, 'seed' | 'skill'>;
  /** Judge payouts against these goals (round 1 first) instead of each round's own measured one. */
  goals?: number[];
  log?: (line: string) => void;
}

export interface ParRound {
  round: number;
  ballsPerRound: number;
  moneyStart: number;
  picked: string | null;
  bought: { id: PartId; price: number }[];
  rerolls: number;
  owned: Partial<Record<PartId, number>>;
  placed: number;
  buildBefore: number;
  buildAfter: number;
  samples: RoundSample[];
  goalCandidate: number;
  goalUsed: number;
  payout: number;
  /** Cash held when the round was won (before the payout): what interest is paid on. */
  moneyHeld: number;
  moneyEnd: number;
  seconds: number;
  /** The run's upgrades that round, so the economy can be re-checked against other goals. */
  mods: Mods;
  /** The machine that was measured, so a runaway score can be replayed and explained (tools/explain.ts). */
  layout: Layout;
  levels: Levels;
}

export interface ParRun {
  seed: number;
  rounds: ParRound[];
  upgrades: string[];
}

// ---- statistics (exported for the tests) --------------------------------------------------------

export function quantile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = p * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/**
 * Fit log(y) = a + b n + c n^2 through (n = 1..y.length, y) by least squares and return the fitted values.
 * Per-round goals measured from a handful of par runs are noisy; the escalation they describe is smooth.
 */
export function fitLogQuadratic(y: number[]): number[] {
  const n = y.length;
  if (n < 3) return [...y];
  const ly = y.map((v) => Math.log(Math.max(1, v)));
  // normal equations for [1, x, x^2], x centred and scaled for conditioning
  const xs = y.map((_, i) => (i - (n - 1) / 2) / ((n - 1) / 2));
  const S = (p: number) => xs.reduce((a, x) => a + x ** p, 0);
  const T = (p: number) => xs.reduce((a, x, i) => a + x ** p * ly[i], 0);
  const A = [[S(0), S(1), S(2), T(0)], [S(1), S(2), S(3), T(1)], [S(2), S(3), S(4), T(2)]];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
    }
  }
  const [a, b, c] = [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
  return xs.map((x) => Math.exp(a + b * x + c * x * x));
}

/** The share of rounds a par machine is allowed to fail in round `n` of `rounds`: easy at first, then more than par can give. */
export function failRate(n: number, rounds: number, start: number, end: number): number {
  return rounds <= 1 ? start : start + ((end - start) * (n - 1)) / (rounds - 1);
}

/**
 * The goal that a machine with these scores fails `fail` of the time: that quantile of the full round's total.
 * (A goal at the 10% quantile means the machine clears 9 rounds in 10.)
 */
export function goalCandidate(samples: RoundSample[], balls: number, fail: number): number {
  return quantile(samples.map((s) => s.cumulative[Math.min(balls, s.cumulative.length) - 1] ?? 0), fail);
}

/** The ball a round was cleared on (1 = the first), or 0 if it was never cleared. The ball keeps playing after the goal, so the round ends when that ball does. */
export function clearBall(s: RoundSample, goal: number): number {
  const i = s.cumulative.findIndex((c) => c >= goal);
  return i < 0 ? 0 : i + 1;
}

// ---- the policy ------------------------------------------------------------------------------------

const count = (g: Game) => {
  const c: Partial<Record<PartId, number>> = {};
  for (const p of g.layout.parts) c[p.def] = (c[p.def] ?? 0) + 1;
  return c;
};

/** Buy by value per dollar until nothing affordable is left, rerolling a couple of times when the shelf is bare. */
export function parShop(g: Game): { bought: { id: PartId; price: number }[]; rerolls: number } {
  const bought: { id: PartId; price: number }[] = [];
  let rerolls = 0;
  for (let guard = 0; guard < 40; guard++) {
    const have = count(g);
    const options = g.shop.offers
      .map((id, slot) => ({ id, slot }))
      .filter((o): o is { id: PartId; slot: number } => o.id !== null && PART_VALUE[o.id] > 0 && g.priceOf(o.id) <= g.money && (have[o.id] ?? 0) < PART_CAP[o.id])
      .sort((a, b) => PART_VALUE[b.id] / g.priceOf(b.id) - PART_VALUE[a.id] / g.priceOf(a.id));
    if (options.length) {
      const price = g.priceOf(options[0].id);
      g.buy(options[0].slot);
      bought.push({ id: options[0].id, price });
      continue;
    }
    if (rerolls < MAX_REROLLS && g.money - g.rerollCost >= 3 && g.reroll()) { rerolls++; continue; }
    break;
  }
  return { bought, rerolls };
}

/** The index of the offered card the par player takes. */
export function parPick(g: Game): number {
  const offers = g.pending ?? [];
  let best = Math.max(0, offers.findIndex((_, i) => g.canTake(i))), bestRank = Infinity;
  offers.forEach((o, i) => {
    if (!g.canTake(i)) return; // a Rules card with the apron full
    const rank = UPGRADE_PRIORITY.indexOf(o.id);
    if (rank >= 0 && rank < bestRank) { best = i; bestRank = rank; }
  });
  return best;
}

// ---- the run ---------------------------------------------------------------------------------------------

export function runPar(o: ParOptions): ParRun {
  const log = o.log ?? (() => {});
  const g = new Game();
  for (let i = 0; i < o.seed; i++) g.newRun(); // a different shop and set of offers for each par run
  const upgrades: string[] = [];
  const rounds: ParRound[] = [];

  for (let n = 1; n <= o.rounds; n++) {
    const moneyStart = g.money;
    let picked: string | null = null;
    if (g.pending) {
      const index = parPick(g), offer = g.pending[index];
      picked = UPGRADES[offer.id].name + (offer.target ? ` (${PARTS[offer.target].name})` : '');
      upgrades.push(picked);
      g.chooseUpgrade(index);
    }
    const { bought, rerolls } = parShop(g);

    const built = autoBuild({ layout: g.layout, mods: g.mods, levels: g.levels }, { ...o.build, seed: o.seed * 100 + n, skill: o.skill });
    g.layout = built.machine.layout;
    const samples = playRounds({ layout: g.layout, mods: g.mods, levels: g.levels }, { rounds: o.measure, seed: o.seed * 10000 + n, skill: o.skill });

    const balls = g.ballsPerRound;
    const candidate = goalCandidate(samples, balls, failRate(n, o.rounds, o.failStart, o.failEnd));
    const goal = o.goals?.[n - 1] ?? candidate;
    const payouts: number[] = [];
    for (const s of samples) {
      const k = clearBall(s, goal);
      if (!k) continue;
      payouts.push(payoutFor({ round: n, ballsLeft: balls - k, score: s.cumulative[k - 1], goal, coins: s.coins[k - 1], money: g.money, mods: g.mods }).total);
    }
    const payout = Math.round(payouts.length ? payouts.reduce((a, b) => a + b, 0) / payouts.length : 3 + n);
    const moneyHeld = g.money;
    g.money += payout;

    const round: ParRound = {
      round: n, ballsPerRound: balls, moneyStart, picked, bought, rerolls, owned: count(g), placed: g.layout.parts.filter((p) => p.placed).length,
      buildBefore: built.before, buildAfter: built.after, samples, goalCandidate: candidate, goalUsed: goal, payout, moneyHeld, moneyEnd: g.money,
      seconds: samples.reduce((a, s) => a + s.seconds, 0) / samples.length, mods: g.mods,
      layout: JSON.parse(JSON.stringify(g.layout)), levels: { ...g.levels },
    };
    rounds.push(round);
    log(`par ${o.seed} round ${n}: ${g.layout.parts.length} parts (${round.placed} placed), goal ${Math.round(candidate)}, built ${Math.round(built.before)} -> ${Math.round(built.after)}, payout $${payout}, cash $${g.money}`);
    if (n < o.rounds) g.continueAfterRound();
  }
  return { seed: o.seed, rounds, upgrades };
}
