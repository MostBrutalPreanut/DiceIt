import { describe, expect, it } from 'vitest';
import { makePart } from '../src/data/parts';
import { SPARK_CAP, SPARK_FADE, SPARK_GLOW } from '../src/sim/constants';
import type { Layout } from '../src/sim/layout';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';
import { FLIPPER_PIVOTS } from '../src/sim/table';

const layoutOf = (...parts: ReturnType<typeof makePart>[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const run = (sim: ReturnType<typeof createSim>, seconds: number) => {
  const evs: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 240); i++) evs.push(...sim.step(NO_INPUT));
  return evs;
};

describe('sparks in the sim', () => {
  it('balls pass through each other', () => {
    const sim = createSim(layoutOf(), { seed: 1 });
    sim.addBall(9, 30, 20, 0);
    sim.addBall(15, 30, -20, 0);
    run(sim, 0.4);
    const [a, b] = sim.ballStates();
    expect(a.x).toBeGreaterThan(b.x); // they crossed instead of bouncing apart
  });

  it('a spark falls straight through a raised flipper and out', () => {
    const sim = createSim(layoutOf(), { seed: 1 });
    const f = FLIPPER_PIVOTS.L;
    sim.addSparks(1, f.x + 2, f.y + 3, 1, { r: 0 });
    let lowest = Infinity;
    for (let i = 0; i < 240 * 3 && sim.sparkCount; i++) {
      sim.step({ ...NO_INPUT, left: true });
      const s = sim.sparkStates()[0];
      if (s) lowest = Math.min(lowest, s.y);
    }
    expect(lowest).toBeLessThan(f.y - 1);
    expect(sim.sparkCount).toBe(0); // it drained
  });

  it('a spark scores on what it touches, as the ball whose hit made it, and never on a saucer', () => {
    const lane = makePart('lane', 1, 12, 30, true), pop = makePart('pop', 2, 12, 22, true), printer = makePart('printer', 3, 18, 30, true);
    const sim = createSim(layoutOf(lane, pop, printer), { seed: 2 });
    sim.addSparks(1, 12, 32, 7, { r: 0 });
    sim.addSparks(1, 18, 32, 7, { r: 0 });
    const hits = run(sim, 1.5).filter((e): e is Extract<SimEvent, { type: 'partHit' }> => e.type === 'partHit');
    expect(hits.some((e) => e.uid === 1 && e.spark && e.ballId === 7)).toBe(true);
    expect(hits.some((e) => e.uid === 2 && e.spark)).toBe(true);
    expect(hits.some((e) => e.uid === 3)).toBe(false);
  });

  it(`a spark glows ${SPARK_GLOW} s, fades over ${SPARK_FADE} s and is gone; at most ${SPARK_CAP} glow at once`, () => {
    const sim = createSim(layoutOf(), { seed: 3 });
    sim.addSparks(1, 12, 45, 1, { r: 0 });
    run(sim, 0.1);
    expect(sim.sparkStates()[0].left).toBe(1);
    const big = createSim(layoutOf(), { seed: 4 });
    big.addSparks(SPARK_CAP + 6, 12, 40, 1, { top: true });
    run(big, 0.3);
    const states = big.sparkStates();
    expect(states.filter((s) => s.left === 1).length).toBeLessThanOrEqual(SPARK_CAP);
    expect(states.filter((s) => s.left < 1).length).toBe(6); // the oldest six are fading
    big.clearSparks();
    expect(big.sparkCount).toBe(0);
  });

  it('the same seed gives the same sparks, step for step', () => {
    const one = () => {
      const sim = createSim(layoutOf(makePart('pop', 1, 12, 30, true)), { seed: 9 });
      sim.addSparks(8, 12, 30, 1, { r: 1.6 });
      run(sim, 1);
      return sim.fingerprint();
    };
    expect(one()).toBe(one());
  });
});

import { PARTS, TOPAZ_CHANCE, type PartInstance } from '../src/data/parts';
import { Game } from '../src/game/game';
import { Scorer } from '../src/game/scoring';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const at = (id: Parameters<typeof makePart>[0], uid: number, x = 12, y = 30): PartInstance => makePart(id, uid, x, y, true);
const scorer = (parts: PartInstance[]) => {
  const s = new Scorer(1e9, () => parts);
  s.resetRound();
  return s;
};

describe('parts that make sparks', () => {
  it('Sparkler: a ball\'s hit shoots out a spark, then it needs a second; a spark\'s hit makes none', () => {
    const s = scorer([at('sparkler', 1)]);
    const e = s.consume(hit(1))[0];
    expect(e.sparks).toEqual([{ n: 1, x: 12, y: 30, r: PARTS.sparkler.shape.type === 'circle' ? PARTS.sparkler.shape.r + 0.45 : 0, parent: 1 }]);
    expect(s.consume(hit(1, { t: 0.5 }))[0].sparks).toBeUndefined();
    expect(s.consume(hit(1, { t: 1.2, spark: true }))[0].sparks).toBeUndefined();
    const fromSpark = s.consume(hit(1, { t: 3, spark: true }))[0];
    expect(fromSpark.spark).toBe(true);
    expect(fromSpark.sparks).toBeUndefined();
  });

  it('Rock Pile: one spark per rock; the pile grows a rock every 5 hits, up to 5, and is back to one each round', () => {
    const pile = at('rocks', 1);
    const s = scorer([pile]);
    expect(s.consume(hit(1))[0].sparks![0].n).toBe(1);
    for (let i = 1; i < 10; i++) s.consume(hit(1, { t: i * 3 }));
    expect(s.rocksOf(pile)).toBe(3);
    expect(s.consume(hit(1, { t: 40 }))[0].sparks![0].n).toBe(3);
    for (let i = 0; i < 40; i++) s.consume(hit(1, { t: 50 + i }));
    expect(s.rocksOf(pile)).toBe(5);
    s.resetRound();
    expect(s.rocksOf(pile)).toBe(1);
  });

  it('Firecracker: once a ball, a rocket; its sparks rain from the top after the flight', () => {
    const s = scorer([at('firecracker', 1)]);
    const e = s.consume(hit(1))[0];
    expect(e.label).toBe('WHOOSH!');
    expect(e.rocket).toEqual({ x: 12, y: 30 });
    expect(e.sparks![0]).toMatchObject({ n: PARTS.firecracker.recipe.rocket!.n, top: true, delay: PARTS.firecracker.recipe.rocket!.delay });
    expect(s.consume(hit(1, { t: 1 }))[0].rocket).toBeUndefined(); // it still scores, but the rocket is spent
    s.startBall();
    expect(s.consume(hit(1, { t: 2 }))[0].rocket).toBeDefined();
  });

  it('a spark scores as its ball, but never spends a Hot Shot or pays the Old Bell its toll', () => {
    const s = scorer([at('sling', 1), at('bell', 2, 18, 30), at('pop', 3, 6, 30)]);
    s.consume(hit(1));
    expect(s.consume(hit(2, { spark: true }))[0].base).toBe(PARTS.bell.recipe.points);
    expect(s.consume(hit(3))[0].hot).toBe(true); // the ball is still hot for its own next hit
  });

  it(`Topaz: about ${TOPAZ_CHANCE * 100}% of the ball's hits drop a spark`, () => {
    const s = scorer([{ ...at('pop', 1), inlay: 'topaz' }]);
    let n = 0;
    for (let i = 0; i < 400; i++) n += s.consume(hit(1, { t: i }))[0].sparks ? 1 : 0;
    expect(n / 400).toBeGreaterThan(TOPAZ_CHANCE * 0.6);
    expect(n / 400).toBeLessThan(TOPAZ_CHANCE * 1.5);
  });

  it('a Powder Keg\'s blast shoots out a spark', () => {
    const s = scorer([at('keg', 1)]);
    s.consume(hit(1));
    expect(s.tick(PARTS.keg.recipe.keg!.fuse)[0].sparks![0].n).toBe(1);
  });

  it('in a real round, the sparks reach the table, the firework bursts later, and they all go out when the ball ends', () => {
    const g = new Game();
    g.layout.parts.push(at('firecracker', 50, 12, 28), at('sparkler', 51, 18, 30));
    g.startRound();
    const id = g.sim.ballStates()[0].id;
    g.scorer.consume(hit(51, { t: g.sim.time, ballId: id })); // (the scorer alone does not spawn: the game does, from its step)
    expect(g.sim.sparkCount).toBe(0);
    const before = g.sim.time;
    const out = g.scorer.consume(hit(50, { t: before, ballId: id }));
    (g as unknown as { spawnSparks(s: unknown[]): void }).spawnSparks(out);
    expect(g.sim.sparkCount).toBe(0); // still in flight
    for (let i = 0; i < 240; i++) g.step();
    expect(g.sim.sparkCount).toBeGreaterThan(0);
    g.scorer.goalReached = true;
    g.cashOut();
    expect(g.sim.sparkCount).toBe(0);
  });
});
