import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, PARTS, type PartInstance } from '../src/data/parts';
import { Game } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const P = PARTS.pinata.recipe.pinata!;

describe('Piñata', () => {
  it("a hit takes 1 to 4 by the ball's speed, a zap or a spark 1; at zero it bursts: sparks, money, a prize", () => {
    const pin: PartInstance = makePart('pinata', 1, 12, 30, true);
    const s = new Scorer(1e9, () => [pin]);
    s.resetRound();
    const took = (speed: number, extra = {}) => { const before = s.pinataOf(pin).left; s.consume(hit(1, { speed, ...extra })); return before - s.pinataOf(pin).left; };
    expect(took(5)).toBe(1);
    expect(took(15)).toBe(2);
    expect(took(30)).toBe(3);
    expect(took(60)).toBe(4);
    expect(took(60, { zap: true })).toBe(1);
    expect(took(60, { spark: true })).toBe(1);
    expect(s.pinataOf(pin).left).toBe(P.health - 12);
    let burst;
    for (let i = 0; i < 20 && !burst; i++) burst = s.consume(hit(1, { speed: 60, t: i })).find((e) => e.label === 'PIÑATA!');
    expect(burst!.money).toBe(P.money);
    expect(burst!.sparks?.[0].n).toBe(P.sparks);
    expect(s.pinataOf(pin)).toMatchObject({ burst: true, max: P.health + P.grow });
    expect(s.consume(hit(1, { t: 30 }))).toEqual([]); // broken for the rest of the round
    expect(pin.hp).toBeUndefined(); // a test ball's damage stays in its scorer
    s.resetRound();
    expect(s.pinataOf(pin)).toEqual({ left: P.health + P.grow, max: P.health + P.grow, burst: false });
  });

  it('in a real round its damage is kept on it, and a burst puts a free pick of three parts in the next shop', () => {
    const g = new Game();
    g.round = 5;
    const pin = makePart('pinata', 70, 12, 24, true);
    g.layout.parts.push(pin);
    g.startRound();
    g.scorer.consume(hit(70, { speed: 60 }));
    expect(pin.hp).toBe(4);
    for (let i = 0; i < 12; i++) g.scorer.consume(hit(70, { speed: 60, t: i }));
    expect(pin.bursts).toBe(1);
    expect(pin.hp).toBe(0);
    expect(describePart(PARTS.pinata, pin).map((l) => l.text).join(' ')).toContain(`It has ${P.health + P.grow} health`);
    g.continueAfterRound();
    expect(g.shop.prize).toHaveLength(P.pick);
    const prize = [...g.shop.prize!];
    g.money = 50;
    g.reroll();
    expect(g.shop.prize).toEqual(prize); // a reroll keeps the prize
    const money = g.money;
    const got = g.takePrize(1)!;
    expect(got.def).toBe(prize[1]);
    expect(g.inventory.some((p) => p.uid === got.uid)).toBe(true);
    expect(g.money).toBe(money); // free
    expect(g.shop.prize).toBeNull(); // the other two go
    g.continueAfterRound();
    expect(g.shop.prize ?? null).toBeNull(); // no burst, no prize
  });
});
