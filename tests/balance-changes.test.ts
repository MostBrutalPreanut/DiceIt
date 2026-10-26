import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, PARTS, zappable, type PartInstance } from '../src/data/parts';
import { computeMods, DECALS, rollDecalPick } from '../src/data/decals';
import { Game } from '../src/game/game';
import { CASH_IN, Scorer, SCORE_CEIL } from '../src/game/scoring';
import { fmt } from '../src/ui/html';
import type { Layout } from '../src/sim/layout';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';

/** The balance changes plan (docs/balance-changes-plan.md): one block per phase. */
const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const scorer = (parts: PartInstance[], opts = {}) => {
  const s = new Scorer(1e18, () => parts, opts);
  s.resetRound();
  return s;
};

describe('phase 1: the ceilings', () => {
  it('Disco Balls: ×1.5 each, all of them together at most ×3 a ball', () => {
    const parts = [1, 2, 3].map((uid) => makePart('disco', uid, 4 * uid, 30, true));
    const s = scorer(parts);
    s.consume(hit(1));
    expect(s.mult).toBeCloseTo(1.5);
    s.consume(hit(2));
    expect(s.mult).toBeCloseTo(2.25);
    s.consume(hit(3));
    expect(s.mult).toBeCloseTo(3); // the third only reaches the cap
  });

  it('Halls of Fame share one ×3 cap a ball', () => {
    const parts: PartInstance[] = [makePart('fame', 1, 4, 30, true), makePart('fame', 2, 8, 30, true)];
    const kinds = ['pop', 'sling', 'lane', 'lamp', 'vari', 'spinner', 'coin', 'ding', 'bank', 'thunder', 'golden', 'tesla', 'keg', 'gong'] as const;
    kinds.forEach((id, i) => parts.push(makePart(id, 10 + i, 1 + i, 20, true)));
    const s = scorer(parts);
    s.consume(hit(1));
    expect(s.mult).toBeCloseTo(3); // 15 types: ×4.18 alone, capped
    s.consume(hit(2));
    expect(s.mult).toBeCloseTo(3);
  });

  it('Afterglow measures the gain without the Mult the decals kept: a ×Mult on a big kept Mult does not compound', () => {
    const s = new Scorer(1e18, () => [makePart('xlane', 1, 4, 30, true)], { baseMult: 51, decalKept: 50 });
    s.resetRound();
    s.consume(hit(1));
    expect(s.mult).toBeCloseTo(63.75); // the ball really is at 51 × 1.25
    expect(s.peakGain).toBeCloseTo(0.25); // but Afterglow counts only what a fresh ball would have gained
  });

  it('the score guard: an absurd Mult never makes the score infinite', () => {
    const s = scorer([makePart('pop', 1, 4, 30, true)]);
    s.mult = 1e300;
    s.consume(hit(1));
    s.consume(hit(1));
    expect(Number.isFinite(s.score)).toBe(true);
    expect(s.score).toBe(SCORE_CEIL);
    expect(s.mult).toBeLessThanOrEqual(SCORE_CEIL);
    expect(fmt(s.score)).toBe('MAXED');
  });
});

describe('phase 2: Big Boi and stacking', () => {
  it('a zap scores its points but never raises the Mult', () => {
    const boi = makePart('mega', 1, 12, 34, true);
    const s = scorer([boi]);
    s.consume(hit(1, { zap: true }));
    expect(s.mult).toBeCloseTo(1);
    expect(s.score).toBeGreaterThan(0);
    s.consume(hit(1));
    expect(s.mult).toBeGreaterThan(1);
  });

  it('Fan Club pays ×2, and Overclock and Level Up never aim at Big Boi', () => {
    const m = { ...DECALS.fanClub };
    expect(m.text()).toContain('2×');
    const owned = [makePart('mega', 1, 12, 34, true), makePart('pop', 2, 4, 30, true)];
    for (let seed = 1; seed < 200; seed++) for (const o of rollDecalPick(seed, { owned, decals: [], round: 3 }, 1)) expect(o.target).not.toBe('mega');
  });

  it('a part counts at most 2 Power Plates and 2 Spotlights', () => {
    const pop = makePart('pop', 1, 12, 30, true);
    const plates = [2, 3, 4, 5].map((uid) => makePart('plate', uid, 12 + (uid - 3.5) * 0.5, 30, true));
    const spots = [6, 7, 8].map((uid) => makePart('spot', uid, 12, 31 + uid - 6, true));
    const s = scorer([pop, ...plates, ...spots]);
    expect(s.plateXAt(pop)).toBeCloseTo(2.25);
    expect(s.spotXAt(pop)).toBeCloseTo(2.25);
  });

  it('Level Lights cannot be zapped', () => {
    expect(zappable('uplight')).toBe(false);
    expect(zappable('lane')).toBe(true);
    expect(PARTS.uplight.recipe.levelUp).toBe(true);
  });
});

const layoutOf = (...parts: PartInstance[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const run = (sim: ReturnType<typeof createSim>, seconds: number, input = NO_INPUT) => {
  const evs: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 240); i++) evs.push(...sim.step(input));
  return evs;
};

describe('phase 3: the strongest parts', () => {
  it('a Spider Wheel spins once a ball: after its spin the ball rolls over it, until the next ball', () => {
    const sim = createSim(layoutOf(makePart('wheel', 1, 12, 30, true)), { seed: 1 });
    sim.addBall(12, 31.5, 0, -6);
    expect(run(sim, 0.3).some((e) => e.type === 'partHit' && e.caught)).toBe(true);
    expect(run(sim, 0.4, { ...NO_INPUT, left: true }).some((e) => e.type === 'partRelease')).toBe(true);
    run(sim, 3);
    for (const b of sim.ballStates()) void b;
    sim.addBall(12, 31.5, 0, -6);
    const again = run(sim, 0.3).filter((e) => e.type === 'partHit' && e.uid === 1);
    expect(again.length).toBeGreaterThan(0);
    expect(again.some((e) => e.type === 'partHit' && e.caught)).toBe(false); // rolls over, for its points
    sim.rearm();
    sim.addBall(12, 31.5, 0, -6);
    expect(run(sim, 0.3).some((e) => e.type === 'partHit' && e.caught)).toBe(true); // a new ball: it spins again
  });

  it('Wheel Mania at most once a round', () => {
    const g = new Game();
    const wheel = { ...makePart('wheel', 70, 12, 30, true), spun: [0, 1, 2, 3, 4, 5, 6, 7] };
    const w2 = { ...makePart('wheel', 71, 6, 30, true), spun: [0, 1, 2, 3, 4, 5, 6, 7] };
    g.layout.parts.push(wheel, w2);
    g.startRound();
    g.scorer.consume({ type: 'partHit', t: 0, uid: 70, ballId: 1, x: 0, y: 0, speed: 1, caught: true });
    expect(g.scorer.consume({ type: 'partRelease', t: 0.1, uid: 70, ballId: 1 })[0].label).toBe('WHEEL MANIA!');
    g.scorer.consume({ type: 'partHit', t: 1, uid: 71, ballId: 1, x: 0, y: 0, speed: 1, caught: true });
    expect(g.scorer.consume({ type: 'partRelease', t: 1.1, uid: 71, ballId: 1 })[0].label).not.toBe('WHEEL MANIA!');
    expect(describePart(PARTS.wheel).map((l) => l.text).join(' ')).toContain('on ZILCH');
    expect(describePart(PARTS.wheel).map((l) => l.text).join(' ')).toContain('Spins until you flip, or 3 s.');
  });

  it('a Ball Printer prints at most 2 a ball and rests 3 s after printing (balls roll over it)', () => {
    expect(PARTS.printer.recipe.printCap).toBe(2);
    const sim = createSim(layoutOf(makePart('printer', 1, 12, 30, true)), { seed: 1 });
    sim.addBall(12, 31.5, 0, -6);
    const first = run(sim, 1.2);
    expect(first.some((e) => e.type === 'extraBall')).toBe(true);
    sim.addBall(12, 31.5, 0, -6);
    const resting = run(sim, 0.4);
    expect(resting.some((e) => e.type === 'partHit' && e.uid === 1 && !e.caught)).toBe(true);
    expect(resting.some((e) => e.type === 'partHit' && e.caught)).toBe(false);
  });

  it('a Mag-Grab ignores the ball it just threw for 2 s', () => {
    const mg = makePart('magnet', 1, 12, 30, true);
    mg.angle = Math.PI; // it throws the ball straight down, back past itself
    const sim = createSim(layoutOf(mg), { seed: 1 });
    sim.addBall(12, 31.5, 0, -4);
    const evs = run(sim, 1.5);
    expect(evs.filter((e) => e.type === 'partHit' && e.caught)).toHaveLength(1);
    expect(PARTS.magnet.recipe.grabRest).toBe(2);
  });

  it('the twin comes with the first ball of a round only, and Multiball Madness counts balls in play, not one in the lane', () => {
    const g = new Game();
    g.decals = [{ id: 'twin' }, { id: 'multiball' }];
    g.startRound();
    expect(g.sim.ballCount).toBe(2);
    expect(g.sim.ballsInPlay).toBe(0);
    for (let i = 0; i < 600; i++) g.step({ ...NO_INPUT, plunge: i < 230 });
    expect(g.sim.ballsInPlay).toBe(1); // the twin waits in the lane: no ×2 yet
    const pop = g.placed.find((p) => p.def === 'pop')!;
    expect(g.scorer.consume({ type: 'partHit', t: g.sim.time, uid: pop.uid, ballId: 1, x: 0, y: 0, speed: 10 })[0].notes.join()).not.toContain('multiball');
    g.sim.reset(g.layout, { seed: 3, mods: { twin: true } });
    g.sim.spawnBall(false);
    expect(g.sim.ballCount).toBe(1); // the next balls of the round come alone
  });

  it('X Lane is rare, $8', () => {
    expect(PARTS.xlane.rarity).toBe('rare');
    expect(PARTS.xlane.cost).toBe(8);
  });
});

describe('phase 4: the clock', () => {
  it('closing time: bumpers stop kicking, catchers let the ball roll over, Kickbacks and the Bucket are off', () => {
    const pop = makePart('pop', 1, 12, 30, true);
    const kick = (afterTime: boolean) => {
      const sim = createSim(layoutOf(pop, makePart('printer', 2, 6, 30, true)), { ballClock: 0.6 });
      sim.spawnBall();
      for (let i = 0; i < 720 && !sim.timeUp; i++) sim.step({ ...NO_INPUT, plunge: i < 120 });
      if (afterTime) expect(sim.timeUp).toBe(true);
      else sim.reset(layoutOf(pop, makePart('printer', 2, 6, 30, true)), {});
      const id = sim.addBall(12, 32, 0, -10);
      let up = 0;
      for (let i = 0; i < 60; i++) { sim.step(NO_INPUT); const b = sim.ballStates().find((q) => q.id === id); if (b) up = Math.max(up, b.vy); }
      return up;
    };
    expect(kick(false)).toBeGreaterThan(kick(true) * 2); // no kick at closing time
    const sim = createSim(layoutOf(makePart('printer', 2, 12, 30, true)), { ballClock: 0.6 });
    sim.spawnBall();
    for (let i = 0; i < 720 && !sim.timeUp; i++) sim.step({ ...NO_INPUT, plunge: i < 120 });
    expect(sim.timeUp).toBe(true);
    sim.addBall(12, 31.5, 0, -6);
    const evs = run(sim, 0.3);
    expect(evs.some((e) => e.type === 'partHit' && e.uid === 2 && !e.caught)).toBe(true);
    expect(evs.some((e) => e.type === 'partHit' && e.caught)).toBe(false);
  });

  it('the cash-in: Big Boi swallows a ball the run-out could not end, for 5% of the ball\'s points', () => {
    const boi = makePart('mega', 1, 12, 34, true), pop = makePart('pop', 2, 4, 30, true);
    const s = scorer([boi, pop]);
    for (let i = 0; i < 10; i++) s.consume(hit(2));
    const ball = s.score;
    const out = s.consume({ type: 'cashIn', t: 1, ballId: 1, x: 12, y: 20 });
    expect(out[0].def).toBe('mega');
    expect(out[0].points).toBe(Math.round((ball * CASH_IN) / 5) * 5);
    expect(s.consume({ type: 'cashIn', t: 1, ballId: 2, x: 12, y: 20 })[0].points).toBe(0); // once a ball
  });

  it('the Hourglass: a flipper shot into it adds +1 s to the ball clock, up to +20 s a ball', () => {
    const hg = makePart('hourglass', 1, 7, 9, true);
    const sim = createSim(layoutOf(hg), { seed: 1 });
    sim.spawnBall();
    const total = sim.clockTotal;
    // a ball that touched no flipper adds nothing
    sim.addBall(7, 11, 0, -5);
    run(sim, 0.4);
    expect(sim.clockTotal).toBe(total);
    expect(PARTS.hourglass.recipe.hourglass).toEqual({ per: 1, cap: 20, window: 1.5 });
    expect(PARTS.hourglass.rarity).toBe('uncommon');
    const s = scorer([hg]);
    expect(s.consume(hit(1, { time: 1 }))[0].label).toBe('+1 S');
  });

  it('Sudden Death: every ball\'s clock 20 s shorter, every hit ×1.5', () => {
    const m = computeMods([{ id: 'suddenDeath' }]);
    expect(m.ballClock).toBe(40);
    expect(m.pointsFactor).toBe(1.5);
    expect(DECALS.suddenDeath.rarity).toBe('rare');
  });
});

describe('phase 5: money', () => {
  it('Nest Egg: every ball starts at +0.1 Mult for every $5 you hold, up to +2', () => {
    const g = new Game();
    g.decals = [{ id: 'nestEgg' }];
    g.money = 23;
    expect(g.startMult(computeMods(g.decals))).toBeCloseTo(1.4);
    g.money = 500;
    expect(g.startMult(computeMods(g.decals))).toBeCloseTo(3);
  });

  it('the Vault: +1 a hit for every $1 you hold, up to +100', () => {
    const v = makePart('vault', 1, 12, 30, true);
    let cash = 37;
    const s = new Scorer(1e9, () => [v], { cash: () => cash });
    s.resetRound();
    expect(s.consume(hit(1))[0].base).toBe(10 + 37);
    cash = 1000;
    expect(s.consume(hit(1))[0].base).toBe(10 + 100);
  });
});

describe('phase 7: weak parts, gems and decals', () => {
  it('gremlins count as scoring hits (the Midnight Clock, Lucky Seven, the Jackpot pot)', () => {
    const hutch = makePart('hutch', 1, 12, 50, true), jack = makePart('jackpot', 2, 12, 30, true);
    const s = new Scorer(1e9, () => [hutch, jack], { mods: computeMods([{ id: 'lucky' }]) });
    s.resetRound();
    const outs = [...Array(7)].map((_, i) => s.consume({ type: 'gremlin', t: i, uid: 1, ballId: 1, x: 0, y: 0 })[0]);
    expect(outs[6].notes.join()).toContain('lucky seven');
    expect(s.potOf(jack)).toBe(7 * PARTS.jackpot.recipe.jackpot!.per);
  });

  it('a Cook order on Goal! pays triple and is used up', () => {
    const goal = makePart('goal', 1, 12, 40, true);
    const s = new Scorer(1e9, () => [goal], { machine: 'diner' });
    s.resetRound();
    s.order = 1;
    const e = s.consume(hit(1, { goal: true }))[0];
    expect(e.notes.join()).toContain('order');
    expect(s.order).toBeNull();
  });

  it('the numbers', () => {
    expect(PARTS.nest.recipe.nest!.chance).toBe(0.5);
    expect(PARTS.jar.recipe.jar!.every).toBe(10);
    expect(PARTS.bonsai.recipe.bonsai).toBe(6);
    expect(PARTS.clock.recipe.clock!.hits).toBe(120);
    for (const id of ['altar', 'hutch'] as const) expect([PARTS[id].rarity, PARTS[id].cost]).toEqual(['rare', 8]);
    expect(PARTS.capsule.recipe.capsule!.rounds).toBe(4);
    expect(PARTS.spot.recipe.spot!.dark).toBe(4);
    expect(PARTS.deflector.recipe.points).toBe(5);
    expect(PARTS.deflector.recipe.hot).toBe(0.5);
    expect(PARTS.flipper.cost).toBe(4);
    expect(PARTS.flipperR.cost).toBe(4);
    expect(DECALS.glassCannon.text()).toContain('2×');
    for (const id of ['duck', 'goal', 'roller', 'bucket'] as const) expect(PARTS[id].tags).toContain('long');
  });

  it('the Whale has no spout limit a ball, only a 3 s rest after each', () => {
    expect(PARTS.whale.recipe.whale!.rest).toBe(3);
  });
});
