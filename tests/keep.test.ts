import { describe, expect, it } from 'vitest';
import { makePart, PARTS, type PartInstance } from '../src/data/parts';
import { Game, UPKEEP } from '../src/game/game';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });

/** Play a round to its goal at once. */
function clearRound(g: Game, mult = 1) {
  g.startRound();
  g.scorer.mult = mult;
  g.scorer.peakMult = mult;
  g.scorer.score = g.scorer.goal;
  g.scorer.goalReached = true;
  g.cashOut();
  g.continueAfterRound();
}

describe('Mult that is kept from round to round', () => {
  it('a Trophy Cup keeps +0.04 Mult a hit for the rest of the run: every ball after starts that much higher', () => {
    const g = new Game();
    const cup = makePart('trophy', 50, 12, 28, true);
    g.layout.parts.push(cup);
    g.startRound();
    for (let i = 0; i < 10; i++) g.scorer.consume(hit(50));
    expect(cup.polish).toBeCloseTo(0.4);
    expect(g.keptMult).toBeCloseTo(0.4);
    g.toWorkshop();
    g.startRound();
    expect(g.scorer.mult).toBeCloseTo(1.4);
  });

  it('a Trophy Cup stops at its cap, and the polish goes with the cup', () => {
    const g = new Game();
    const cup: PartInstance = { ...makePart('trophy', 50, 12, 28, true), polish: 4.99 };
    g.layout.parts.push(cup);
    g.startRound();
    g.scorer.consume(hit(50));
    g.scorer.consume(hit(50));
    expect(cup.polish).toBe(PARTS.trophy.recipe.keep!.cap);
    g.toWorkshop();
    g.money = 10;
    g.sell(50);
    expect(g.keptMult).toBe(0);
  });

  it('Momentum keeps +0.5 Mult for every round you clear', () => {
    const g = new Game();
    g.decals = [{ id: 'momentum' }];
    clearRound(g);
    expect(g.decals[0].grown).toBeCloseTo(0.5);
    clearRound(g);
    expect(g.keptMult).toBeCloseTo(1);
    g.startRound();
    expect(g.scorer.mult).toBeCloseTo(2);
  });

  it('Afterglow keeps 15% of the best Mult of every round', () => {
    const g = new Game();
    g.decals = [{ id: 'afterglow' }];
    clearRound(g, 8);
    expect(g.decals[0].grown).toBeCloseTo(1.2);
  });

  it('what a decal has kept is written on it, and survives a save', () => {
    const g = new Game();
    g.decals = [{ id: 'momentum', grown: 1.5 }];
    const copy = new Game();
    copy.load(JSON.parse(JSON.stringify(g.save())));
    expect(copy.keptMult).toBeCloseTo(1.5);
  });
});

describe('moving and removing parts costs money', () => {
  it('moving is free while the board is first set up, before round 1', () => {
    const g = new Game();
    g.money = 0;
    const pop = g.part(1)!;
    expect(g.moveFee(pop)).toBe(0);
    expect(g.place(1, pop.x - 1, pop.y)).toBe(true);
    const money = g.money;
    expect(g.store(1)).toBeNull();
    expect(g.money).toBe(money);
    expect(g.place(1, pop.x, pop.y)).toBe(true);
    clearRound(g);
    expect(g.round).toBe(2);
    expect(g.moveFee(g.part(1)!)).toBe(UPKEEP.move); // once round 1 is played, moves cost
  });

  it('moving a part that has played a round costs $1, once a visit', () => {
    const g = new Game();
    g.round = 2;
    g.money = 5;
    const pop = g.part(1)!;
    expect(g.moveFee(pop)).toBe(UPKEEP.move);
    expect(g.place(1, pop.x - 1, pop.y)).toBe(true);
    expect(g.money).toBe(5 - UPKEEP.move);
    expect(g.place(1, pop.x - 1, pop.y)).toBe(true); // already paid this visit
    expect(g.money).toBe(5 - UPKEEP.move);
    clearRound(g);
    expect(g.moveFee(g.part(1)!)).toBe(UPKEEP.move); // the next visit charges again
  });

  it('with no money a part that has played cannot move', () => {
    const g = new Game();
    g.round = 2;
    g.money = 0;
    const pop = g.part(1)!;
    expect(g.place(1, pop.x - 1, pop.y)).toBe(false);
    expect(g.store(1)).toBeNull();
    expect(pop.placed).toBe(true);
  });

  it('a part bought this visit moves freely and goes back for what it cost; a pack refunds its whole price', () => {
    const g = new Game();
    g.money = 20;
    g.shop.offers[0] = 'lane';
    const first = g.buyAndPlace(0, 12, 30)!;
    expect(g.moveFee(first)).toBe(0);
    expect(g.place(first.uid, 12, 28)).toBe(true);
    const lanes = g.layout.parts.filter((p) => p.def === 'lane');
    const back = lanes.reduce((a, p) => a + (g.sell(p.uid) ?? 0), 0);
    expect(back).toBe(PARTS.lane.cost);
    expect(g.money).toBe(20);
  });
});

describe('Power Plate', () => {
  it('bumpers standing near it pay ×1.5, two plates multiply, and other parts are untouched', async () => {
    const { Scorer } = await import('../src/game/scoring');
    const parts = [makePart('plate', 1, 12, 30, true), makePart('pop', 2, 12, 30, true), makePart('lane', 3, 13, 31, true), makePart('pop', 4, 20, 40, true)];
    const s = new Scorer(1e9, () => parts);
    s.startBall();
    const near = s.consume(hit(2))[0];
    expect(near.base).toBe(30); // 20 x 1.5
    expect(near.notes).toContain('x1.5 power plate');
    expect(s.consume(hit(3))[0].base).toBe(10); // a lane is not a bumper
    expect(s.consume(hit(4))[0].base).toBe(21); // far away: 20 + 1 grown
    parts.push(makePart('plate', 5, 13, 30, true));
    expect(s.consume(hit(2))[0].base).toBe(Math.round(22 * 2.25));
  });
});

describe('Hall of Fame', () => {
  it('once a ball, multiplies the Mult by ×1.1 for every different part type on the table', async () => {
    const { Scorer } = await import('../src/game/scoring');
    const parts = [makePart('fame', 1, 12, 30, true), makePart('pop', 2, 6, 30, true), makePart('pop', 3, 18, 30, true), makePart('lane', 4, 12, 40, true)];
    const s = new Scorer(1e9, () => parts);
    s.startBall();
    const e = s.consume(hit(1))[0];
    expect(e.label).toBe(`MULT x${(1.1 ** 3).toFixed(2)}`); // fame, pop and lane
    expect(s.mult).toBeCloseTo(1.1 ** 3, 2);
    expect(s.consume(hit(1))).toEqual([]); // once a ball
    s.startBall();
    expect(s.consume(hit(1))[0].kind).toBe('bonus');
  });
});
