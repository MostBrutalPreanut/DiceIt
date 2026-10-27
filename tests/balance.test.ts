import { describe, expect, it } from 'vitest';
import { ENDLESS_GOALS, GOALS, GOAL_GROWTH, LAST_ROUND } from '../src/data/goals';
import { neutralMods } from '../src/data/mods';
import { PARTS, type PartId } from '../src/data/parts';
import type { RoundSample } from '../src/game/autobuild';
import { Game, goalFor, niceGoal, payoutFor } from '../src/game/game';
import { clearBall, failRate, fitLogQuadratic, goalCandidate, parPick, parShop, PART_CAP, PART_VALUE, quantile, runPar, DECAL_PRIORITY } from '../tools/par';
import { DECAL_IDS } from '../src/data/decals';

const round = (total: number): RoundSample => ({ cumulative: [total / 3, (total * 2) / 3, total], coins: [0, 0, 0], seconds: 100, searches: 0, points: {} });

describe('balance statistics', () => {
  it('quantiles interpolate between samples', () => {
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([10, 20], 0.5)).toBe(15);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('the share of rounds a par machine may fail rises from the first round to the last', () => {
    expect(failRate(1, 15, 0.1, 0.4)).toBeCloseTo(0.1);
    expect(failRate(15, 15, 0.1, 0.4)).toBeCloseTo(0.4);
    expect(failRate(8, 15, 0.1, 0.4)).toBeCloseTo(0.25);
    expect(failRate(1, 1, 0.1, 0.4)).toBeCloseTo(0.1);
  });

  it('the goal candidate is the full-round score a machine misses that share of the time', () => {
    const samples = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000].map(round);
    expect(goalCandidate(samples, 3, 0.1)).toBe(2000);
    expect(goalCandidate(samples, 3, 0.5)).toBe(6000);
    // a machine with extra balls is judged on all of them
    const four = samples.map((s) => ({ ...s, cumulative: [...s.cumulative, s.cumulative[2] * 2] }));
    expect(goalCandidate(four, 4, 0.5)).toBe(12000);
  });

  it('a round is cleared on the ball where the total first reaches the goal, or never', () => {
    const s = round(900); // 300, 600, 900
    expect(clearBall(s, 200)).toBe(1);
    expect(clearBall(s, 300)).toBe(1);
    expect(clearBall(s, 301)).toBe(2);
    expect(clearBall(s, 900)).toBe(3);
    expect(clearBall(s, 901)).toBe(0);
  });

  it('a log-quadratic fit recovers an exact curve and calms a noisy one', () => {
    const exact = Array.from({ length: 15 }, (_, i) => Math.exp(8 + 0.4 * (i + 1) - 0.01 * (i + 1) ** 2));
    fitLogQuadratic(exact).forEach((f, i) => expect(f / exact[i]).toBeCloseTo(1, 4));
    const noisy = exact.map((v, i) => v * (i % 2 ? 1.35 : 0.75));
    const smooth = fitLogQuadratic(noisy);
    const off = (xs: number[]) => Math.max(...xs.map((v, i) => Math.abs(Math.log(v / exact[i])))); // how far from the true curve
    expect(off(noisy)).toBeGreaterThan(0.28);
    expect(off(smooth)).toBeLessThan(off(noisy) / 3);
    expect(smooth).toHaveLength(15);
    expect(fitLogQuadratic([5, 9])).toEqual([5, 9]); // too few points to fit
  });

  it('goals read to two significant figures', () => {
    expect(niceGoal(4312)).toBe(4300);
    expect(niceGoal(12345)).toBe(12000);
    expect(niceGoal(987654)).toBe(990000);
    expect(niceGoal(85)).toBe(85);
    expect(niceGoal(7)).toBe(7);
  });
});

describe('the goal table', () => {
  it('rises every round, reads cleanly, and the game uses it, then endless\'s list to round 30', () => {
    expect(GOALS.length).toBeGreaterThanOrEqual(15);
    const all = [...GOALS, ...ENDLESS_GOALS];
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThan(all[i - 1]);
    for (const g of all) expect(niceGoal(g)).toBe(g);
    for (let r = 1; r <= LAST_ROUND; r++) expect(goalFor(r)).toBe(all[r - 1]);
    expect(LAST_ROUND).toBe(30);
    expect(GOALS[GOALS.length - 1]).toBe(600000);
    expect(goalFor(LAST_ROUND + 2)).toBe(niceGoal(all[all.length - 1] * GOAL_GROWTH ** 2)); // tools only
    expect(goalFor(0)).toBe(GOALS[0]);
    expect(GOAL_GROWTH).toBeGreaterThan(1.2);
  });

  it('a round on the real goal ends against the table, and a tool can play against another', () => {
    const g = new Game();
    g.round = 2;
    g.startRound();
    expect(g.goal).toBe(goalFor(2));
    const t = new Game();
    t.goalOverride = Infinity;
    t.startRound();
    expect(t.goal).toBe(Infinity);
  });
});

describe('the payout formula the tool shares with the game', () => {
  it('pays the base, unused balls, overshoot, coins and the run\'s upgrades', () => {
    const lines = (over: object = {}) => payoutFor({ round: 3, ballsLeft: 1, score: 9000, goal: 2000, coins: 2, money: 12, mods: neutralMods(), ...over });
    const p = lines();
    expect(p.lines.map((l) => l.amount)).toEqual([5, 1, 4, 2]); // the flat $5, 1 unused ball, 2 doublings (4.5x), 2 coins
    expect(p.total).toBe(12);
    expect(lines({ ballsLeft: 0, score: 2000, coins: 0 }).total).toBe(5);
    expect(lines({ round: 12, ballsLeft: 0, score: 2000, coins: 0 }).total).toBe(5); // the same in every round
    const rich = lines({ mods: { ...neutralMods(), roundBonus: 3, interestPer: 1, interestCap: 5 } });
    expect(rich.total).toBe(12 + 3 + 2); // sponsor, and $12 held is $2 of interest ($1 per $5)
    expect(lines({ boss: true }).total).toBe(12 + 2); // beating a boss pays $2 more
  });
});

describe('the par player', () => {
  it('has a value and a cap for every part, and a priority for every decal that is not about the build', () => {
    for (const id of Object.keys(PARTS) as PartId[]) {
      expect(PART_VALUE[id]).toBeGreaterThanOrEqual(0);
      expect(PART_CAP[id]).toBeGreaterThanOrEqual(0);
    }
    for (const id of DECAL_PRIORITY) expect(DECAL_IDS).toContain(id);
    expect(new Set(DECAL_PRIORITY).size).toBe(DECAL_PRIORITY.length);
  });

  it('shops by value per dollar within its cash and caps, never buys what it does not want, and rerolls a bare shelf', () => {
    const g = new Game();
    g.money = 20;
    g.shop.offers = ['uplight', 'coin', 'pop', 'deflector'];
    const start = g.money;
    const { bought, rerolls } = parShop(g);
    const ids = bought.map((b) => b.id);
    expect(ids.slice(0, 3)).toEqual(['pop', 'coin', 'deflector']); // value per dollar: pop 1.33, coin 0.63, deflector 0.5
    expect(ids).not.toContain('uplight'); // par never buys Level Lights
    expect(g.money).toBeGreaterThanOrEqual(0);
    const rerollCost = [0, 1, 3][rerolls]; // $1, then $2
    expect(start - g.money).toBe(bought.reduce((a, b) => a + b.price, 0) + rerollCost);
    const have: Partial<Record<PartId, number>> = {};
    for (const p of g.layout.parts) have[p.def] = (have[p.def] ?? 0) + 1;
    for (const id of Object.keys(have) as PartId[]) if (id !== 'mega') expect(have[id]).toBeLessThanOrEqual(PART_CAP[id]); // Big Boi comes with the machine
  });

  it('takes the offered decal that ranks highest in its priority list', () => {
    const g = new Game();
    g.pending = [{ id: 'coupon' }, { id: 'overclock', target: 'pop' }, { id: 'sponsor' }];
    expect(parPick(g)).toBe(1);
    g.pending = [{ id: 'ballHog' }, { id: 'coupon' }, { id: 'bigShelf' }];
    expect(parPick(g)).toBe(1);
  });

  it('plays a whole (tiny) progression: shop, build, measure, pay', () => {
    const run = runPar({ seed: 1, rounds: 1, failStart: 0.1, failEnd: 0.4, skill: 0.6, measure: 2, build: { evalRounds: 1, steps: 1, placeTries: 1 } });
    expect(run.rounds).toHaveLength(1);
    const r = run.rounds[0];
    expect(r.samples).toHaveLength(2);
    expect(r.goalUsed).toBe(r.goalCandidate);
    expect(r.goalUsed).toBeGreaterThan(0);
    expect(r.payout).toBeGreaterThanOrEqual(4);
    expect(r.moneyHeld).toBeLessThanOrEqual(r.moneyStart);
    expect(r.moneyEnd).toBe(r.moneyHeld + r.payout);
    expect(r.buildAfter).toBeGreaterThanOrEqual(r.buildBefore);
    expect(JSON.parse(JSON.stringify(run))).toEqual(run); // it crosses the process boundary as JSON
    const fixed = runPar({ seed: 1, rounds: 1, failStart: 0.1, failEnd: 0.4, skill: 0.6, measure: 2, goals: [1], build: { evalRounds: 1, steps: 0, placeTries: 1 } });
    expect(fixed.rounds[0].goalUsed).toBe(1); // judged against the goal it was given
  });
});
