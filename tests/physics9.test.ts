import { describe, expect, it } from 'vitest';
import { GREMLIN, makePart, PARTS, type PartInstance } from '../src/data/parts';
import { Scorer } from '../src/game/scoring';
import { BALL_R } from '../src/sim/constants';
import type { Layout } from '../src/sim/layout';
import { createSim, GREMLIN_OUT, NO_INPUT, type SimEvent } from '../src/sim/sim';

const layoutOf = (...parts: PartInstance[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const run = (sim: ReturnType<typeof createSim>, seconds: number, until?: (e: SimEvent[]) => boolean) => {
  const evs: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 240); i++) {
    const e = sim.step(NO_INPUT);
    evs.push(...e);
    if (until?.(evs)) break;
  }
  return evs;
};
const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });

describe('Wrecking Ball', () => {
  it('the ball grows for its seconds, and only where it has room to', () => {
    const sim = createSim(layoutOf(), { seed: 1 });
    const id = sim.addBall(12, 40, 0, 0);
    sim.growBall(id, 1.5, 0.5);
    run(sim, 1 / 60);
    expect(sim.ballStates()[0].r).toBeCloseTo(BALL_R * 1.5);
    run(sim, 0.6);
    expect(sim.ballStates()[0].r).toBeCloseTo(BALL_R);
    // a ball against the wall waits for room
    const s2 = createSim(layoutOf(), { seed: 1 });
    const id2 = s2.addBall(0.55, 30, 0, 0);
    s2.growBall(id2, 1.5, 3);
    run(s2, 1 / 240);
    expect(s2.ballStates()[0].r).toBeCloseTo(BALL_R);
  });

  it('once a ball, a hit makes the ball a wrecking ball: every hit it makes pays ×2', () => {
    const parts = [makePart('wreck', 1, 12, 30, true), makePart('pop', 2, 6, 30, true)];
    const s = new Scorer(1e9, () => parts);
    s.resetRound();
    const plain = s.consume(hit(2))[0].base;
    const w = s.consume(hit(1, { t: 1 }))[0];
    expect(w.grow).toEqual({ ballId: 1, k: 1.5, seconds: 6 });
    expect(w.label).toBe('WRECKING BALL!');
    const big = s.consume(hit(2, { t: 2 }))[0];
    expect(big.notes).toContain('x2 wrecking ball');
    expect(big.wreck).toBe(true);
    expect(big.base).toBe((plain + PARTS.pop.recipe.grow!) * 2);
    expect(s.consume(hit(1, { t: 3 }))[0].grow).toBeUndefined(); // once a ball
    expect(s.consume(hit(2, { t: 7.1 }))[0].wreck).toBeUndefined();
  });
});

describe('Broomstick', () => {
  it('a ball rolling onto it rides the way it points, with no gravity, zapping every part it flies past', () => {
    const broom = makePart('broom', 1, 12, 20, true), pop = makePart('pop', 2, 14, 30, true);
    const sim = createSim(layoutOf(broom, pop), { seed: 1 });
    sim.addBall(12, 22, 0, -8);
    const evs = run(sim, 0.4);
    expect(evs.some((e) => e.type === 'partHit' && e.uid === 1)).toBe(true);
    const b = sim.ballStates()[0];
    expect(b.riding || b.y > 30).toBe(true);
    expect(b.vy).toBeGreaterThan(20); // straight up, not falling
    const pass = evs.find((e) => e.type === 'partHit' && e.uid === 2) as Extract<SimEvent, { type: 'partHit' }> | undefined;
    expect(pass?.ride).toBe(true);
    expect(pass?.zap).toBe(true);
    // and the scorer pays a passed part ×2
    const s = new Scorer(1e9, () => [broom, pop]);
    s.resetRound();
    expect(s.consume(hit(2, { zap: true, ride: true }))[0].notes).toContain('x2 broomstick');
  });

  it('a ride ends at the first thing the ball touches, and never goes through a wall', () => {
    const broom = { ...makePart('broom', 1, 12, 40, true), angle: Math.PI / 2 }; // points left, at the wall
    const sim = createSim(layoutOf(broom), { seed: 1 });
    sim.addBall(12, 42, 0, -8);
    run(sim, 1);
    const b = sim.ballStates()[0];
    expect(b.x).toBeGreaterThan(0);
    expect(b.riding).toBe(false);
  });
});

describe('Free Ball Bucket', () => {
  it('a ball that drops into the bucket from above goes back to the plunger', () => {
    const bucket = makePart('bucket', 1, 12, 25, true);
    const sim = createSim(layoutOf(bucket), { seed: 1 });
    sim.addBall(12.3, 27, 0, -12);
    const evs = run(sim, 0.4, (e) => e.some((x) => x.type === 'partHit' && x.bucket));
    const caught = evs.find((e) => e.type === 'partHit' && e.bucket);
    expect(caught).toBeDefined();
    expect(sim.awaitingPlunge).toBe(true);
    expect(sim.ballStates()[0].inLane).toBe(true);
    const s = new Scorer(1e9, () => [bucket]);
    s.resetRound();
    const e = s.consume(caught!)[0];
    expect(e.base).toBe(PARTS.bucket.recipe.points);
    expect(e.label).toBe('FREE BALL!');
  });

  it('a ball coming up from below passes through it', () => {
    const sim = createSim(layoutOf(makePart('bucket', 1, 12, 25, true)), { seed: 1 });
    sim.addBall(12.3, 22, 0, 16);
    const evs = run(sim, 0.3);
    expect(evs.some((e) => e.type === 'partHit' && e.bucket)).toBe(false);
  });
});

describe('Gremlin Hutch', () => {
  it('two gremlins wander the table; a ball knocks one out for 300 and $1 (up to $5 a round); it is back 10 s later', () => {
    const hutch = makePart('hutch', 1, 2, 51, true);
    const sim = createSim(layoutOf(hutch), { seed: 1 });
    const g = sim.gremlinStates();
    expect(g).toHaveLength(2);
    sim.addBall(g[0].x, g[0].y, 0, 0);
    const evs = run(sim, 0.1, (e) => e.some((x) => x.type === 'gremlin'));
    const knock = evs.find((e) => e.type === 'gremlin')!;
    expect(knock).toBeDefined();
    expect(sim.gremlinStates().filter((x) => x.out)).toHaveLength(1);
    const s = new Scorer(1e9, () => [hutch]);
    s.resetRound();
    const e = s.consume(knock)[0];
    expect(e.label).toBe('GOTCHA!');
    expect(e.base).toBe(GREMLIN.points);
    expect(e.money).toBe(GREMLIN.money);
    let money = e.money;
    for (let i = 0; i < 10; i++) money += s.consume({ ...knock, t: i + 1 })[0].money;
    expect(money).toBe(GREMLIN.moneyCap);
    run(sim, GREMLIN_OUT);
    expect(sim.gremlinStates().some((x) => x.out)).toBe(false);
  });
});
