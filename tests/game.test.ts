import { describe, expect, it } from 'vitest';
import { makePart, PARTS, sellPrice } from '../src/data/parts';
import { Game, rollOffers, START_MONEY } from '../src/game/game';
import { Rng } from '../src/sim/rng';
import { NO_INPUT } from '../src/sim/sim';

describe('shop, inventory and money', () => {
  it('starts with three pop bumpers and the fixed Big Boi on the board, an empty inventory and some cash', () => {
    const g = new Game();
    expect(g.placed.map((p) => p.def)).toEqual(['pop', 'pop', 'pop', 'mega']);
    expect(g.placed.filter((p) => p.fixed).map((p) => p.def)).toEqual(['mega']);
    expect(g.inventory).toHaveLength(0);
    expect(g.money).toBe(START_MONEY);
    expect(new Set(g.shop.offers).size).toBe(4);
  });

  it('buying takes the money, empties that slot and puts the part in the inventory', () => {
    const g = new Game();
    const slot = g.shop.offers.findIndex((id) => id && PARTS[id].cost <= g.money);
    const id = g.shop.offers[slot]!;
    const part = g.buy(slot)!;
    expect(part.def).toBe(id);
    expect(part.placed).toBe(false);
    expect(g.money).toBe(START_MONEY - PARTS[id].cost);
    expect(g.shop.offers[slot]).toBeNull();
    expect(g.inventory.map((p) => p.uid)).toContain(part.uid);
    expect(g.buy(slot)).toBeNull(); // already bought
  });

  it('cannot buy what you cannot afford', () => {
    const g = new Game();
    g.money = 0;
    const before = g.shop.offers.slice();
    expect(g.buy(0)).toBeNull();
    expect(g.money).toBe(0);
    expect(g.shop.offers).toEqual(before);
  });

  it('places an inventory part on the board, refuses overlaps and walls, and can store it again', () => {
    const g = new Game();
    g.sandbox = true;
    g.shop.offers = ['coin', 'lane', 'pop', 'lamp'];
    const coin = g.buy(0)!;
    expect(g.place(coin.uid, 17, 44.5)).toBe(false); // on top of a pop bumper
    expect(g.place(coin.uid, 1, 30)).toBe(false); // in the wall
    expect(g.place(coin.uid, 12, 30)).toBe(true);
    expect(g.placed).toHaveLength(5);
    expect(g.inventory).toHaveLength(0);
    g.store(coin.uid);
    expect(g.placed).toHaveLength(4);
    expect(g.inventory.map((p) => p.uid)).toEqual([coin.uid]);
  });

  it('selling refunds half the price and removes the part for good', () => {
    const g = new Game();
    const before = g.money;
    expect(g.sell(1)).toBe(sellPrice(PARTS.pop));
    expect(g.money).toBe(before + sellPrice(PARTS.pop));
    expect(g.part(1)).toBeUndefined();
    expect(g.placed).toHaveLength(3);
  });

  it('rerolls cost more each time, change the offers, and need money', () => {
    const g = new Game();
    g.money = 10;
    const first = g.shop.offers.slice();
    expect(g.rerollCost).toBe(1);
    expect(g.reroll()).toBe(true);
    expect(g.money).toBe(9);
    expect(g.rerollCost).toBe(2);
    expect(g.shop.offers).not.toEqual(first);
    g.money = 1;
    expect(g.reroll()).toBe(false);
  });

  it('sandbox makes everything free', () => {
    const g = new Game();
    g.sandbox = true;
    g.money = 0;
    expect(g.buy(0)).not.toBeNull();
    expect(g.reroll()).toBe(true);
    expect(g.money).toBe(0);
  });

  it('you can only change the machine in the workshop', () => {
    const g = new Game();
    g.startRound();
    expect(g.buy(0)).toBeNull();
    g.store(1);
    expect(g.placed).toHaveLength(4);
    g.setDial(1, 'kick', 4);
    expect(g.part(1)!.dials.kick).toBe(2);
  });

  it('tuning a dial and rotating a part change the instance', () => {
    const g = new Game();
    g.setDial(1, 'kick', 3.5);
    expect(g.part(1)!.dials.kick).toBe(3.5);
    g.layout.parts.push(makePart('deflector', 50, 12, 30, true));
    g.rotate(50, Math.PI / 4);
    g.rotate(50, -Math.PI / 2);
    expect(g.part(50)!.angle).toBeCloseTo((Math.PI * 7) / 4, 2);
    g.rotate(1, 1); // pop bumpers do not rotate
    expect(g.part(1)!.angle).toBe(0);
  });

  it('survives a save and load, inventory included', () => {
    const g = new Game();
    g.money = 9;
    g.shop.offers = ['coin', 'lane', 'pop', 'lamp'];
    g.buy(0);
    const copy = new Game();
    copy.load(JSON.parse(JSON.stringify(g.save())));
    expect(copy.money).toBe(g.money);
    expect(copy.inventory).toHaveLength(1);
    expect(copy.shop.offers).toEqual(g.shop.offers);
  });

  it('offers are weighted, distinct and deterministic per seed', () => {
    expect(rollOffers(new Rng(5))).toEqual(rollOffers(new Rng(5)));
    for (let s = 0; s < 50; s++) expect(new Set(rollOffers(new Rng(s))).size).toBe(4);
  });
});

describe('levels', () => {
  it('a test ball in the workshop cannot level up your machine, a real round can', () => {
    const g = new Game();
    g.sandbox = true;
    for (const [i, x] of [6, 10, 14].entries()) {
      g.shop.offers = ['uplight', null, null, null];
      const p = g.buy(0)!;
      expect(g.place(p.uid, x, 30 + i * 0)).toBe(true);
    }
    const lights = g.placed.filter((p) => p.def === 'uplight');
    const hit = (uid: number) => ({ type: 'partHit' as const, t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10 });
    g.testBall();
    for (const l of lights) g.scorer.consume(hit(l.uid));
    expect(g.scorer.levelOf('pop')).toBe(1); // the throwaway copy levelled up...
    expect(g.levels.pop ?? 0).toBe(0); // ...but the run did not

    g.startRound();
    for (const l of lights) g.scorer.consume(hit(l.uid));
    expect(g.levels.pop).toBe(1);
    expect(g.scorer.levelOf('pop')).toBe(1);
  });

  it('levels survive a save and load, stop at the cap, and reset on a new run', () => {
    const g = new Game();
    for (let i = 0; i < 7; i++) g.levelUp('mega');
    expect(g.levels.mega).toBe(5);
    expect(g.levelUp('mega')).toBeNull();
    const copy = new Game();
    copy.load(JSON.parse(JSON.stringify(g.save())));
    expect(copy.levels.mega).toBe(5);
    copy.newRun();
    expect(copy.levels).toEqual({});
  });
});

describe('Level Lights end to end (the Space Cadet bumper upgrade)', () => {
  it('rolling balls over every light levels the bumpers up for the rest of the run, and the lights go out', () => {
    const g = new Game();
    g.sandbox = true;
    for (const x of [6, 10, 14]) {
      g.shop.offers = ['uplight', null, null, null];
      g.place(g.buy(0)!.uid, x, 30); // aimed at Pop Bumpers by default
    }
    g.startRound();
    // launch the real ball so the round is live, then rain a ball over each light
    for (let i = 0; i < 240 * 1.2; i++) g.step({ left: false, right: false, plunge: i < 230, nudge: 0 });
    for (const x of [6, 10, 14]) g.sim.addBall(x, 34, 0, -25);
    const labels: string[] = [];
    for (let i = 0; i < 240 * 2 && (g.levels.pop ?? 0) === 0; i++) {
      for (const e of g.step({ left: false, right: false, plunge: false, nudge: 0 }).score) if (e.label) labels.push(e.label);
    }
    expect(g.levels.pop).toBe(1);
    expect(labels).toContain('POP BUMPERS LEVEL 1!');
    expect(g.placed.filter((p) => p.def === 'uplight').some((p) => g.scorer.isLit(p.uid))).toBe(false);
    // the level now shows on the part and in what it pays
    const pop = g.placed.find((p) => p.def === 'pop')!;
    expect(g.scorer.label(pop)).toBe('110'); // 100 + 10 for level 1 (no hits yet this ball... or +5 per grown hit)
  });
});

describe('a round with several balls on the table', () => {
  it('the ball only ends when the LAST ball drains', () => {
    const g = new Game();
    g.startRound();
    g.sim.addBall(12, 15, 0, -5); // a second ball, already on its way down
    g.sim.addBall(10, 16, 0, -5);
    let ballEnds = 0;
    // plunge the lane ball so the round is live
    for (let i = 0; i < 240 * 90 && g.mode === 'round' && ballEnds === 0; i++) {
      const res = g.step({ ...NO_INPUT, plunge: i < 220 });
      ballEnds += res.game.filter((e) => e.type === 'ballEnd').length;
      if (ballEnds === 0) expect(g.ballsLeft).toBe(3);
    }
    expect(ballEnds).toBe(1);
    expect(g.ballsLeft).toBe(2);
    expect(g.sim.ballCount).toBe(1); // the next ball is waiting in the lane
  });
});

describe('ball saver in a round', () => {
  it('a saved ball does not cost one of the three balls, and the lane is ready for the next shot', () => {
    const g = new Game();
    g.sandbox = true;
    g.clearBoard();
    const saver = g.grant('saver')!;
    expect(g.place(saver.uid, 12, 30)).toBe(true);
    g.startRound();
    let saved = false, drained = false;
    for (let i = 0; i < 240 * 20 && !saved && !drained; i++) {
      const res = g.step({ ...NO_INPUT, plunge: i < 230 });
      saved = res.sim.some((e) => e.type === 'ballSaved');
      drained = res.sim.some((e) => e.type === 'drain');
      expect(res.game.some((e) => e.type === 'ballEnd')).toBe(false);
    }
    expect(saved).toBe(true);
    expect(g.ballsLeft).toBe(3);
    expect(g.mode).toBe('round');
    expect(g.sim.awaitingPlunge).toBe(true);
  });
});

describe('the run total', () => {
  it('adds every round score, and a new run starts it again', () => {
    const g = new Game();
    g.startRound();
    g.scorer.score = 500;
    g.ballsLeft = 1;
    g.scorer.goal = 1e9;
    (g as unknown as { endBall: (f: boolean) => void }).endBall(false);
    expect(g.mode).toBe('runOver');
    expect(g.runScore).toBe(500);
    g.newRun();
    expect(g.runScore).toBe(0);
  });
});

