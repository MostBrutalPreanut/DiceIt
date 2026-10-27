import { describe, expect, it } from 'vitest';
import { makePart, PARTS, type PartInstance } from '../src/data/parts';
import { Game } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import type { Layout } from '../src/sim/layout';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';

const layoutOf = (...parts: PartInstance[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const run = (sim: ReturnType<typeof createSim>, seconds: number) => {
  const evs: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 240); i++) evs.push(...sim.step(NO_INPUT));
  return evs;
};
const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const scorer = (parts: PartInstance[]) => { const s = new Scorer(1e9, () => parts); s.resetRound(); return s; };

describe('Splitter', () => {
  it('the ball\'s pass splits two sparks off, one to each side, then it needs 5 s', () => {
    const s = scorer([makePart('split', 1, 12, 30, true)]);
    const e = s.consume(hit(1))[0];
    expect(e.sparks?.[0]).toMatchObject({ n: 2, aim: [Math.PI - 0.35, 0.35] });
    expect(s.consume(hit(1, { t: 1 }))[0].sparks).toBeUndefined();
    expect(s.consume(hit(1, { t: 5 }))[0].sparks).toBeDefined();
    const sim = createSim(layoutOf(), { seed: 1 });
    sim.addSparks(2, 12, 30, 1, { aim: [Math.PI - 0.35, 0.35] });
    const [a, b] = sim.sparkStates();
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });
});

describe('The Whale', () => {
  it('swallows the sparks that touch it; every 6th it spouts 6 sparks and 300 (3 spouts a ball)', () => {
    const sim = createSim(layoutOf(makePart('whale', 1, 12, 30, true)), { seed: 1 });
    sim.addSparks(1, 12, 36, 7, { aim: [-Math.PI / 2] });
    const evs = run(sim, 0.6);
    const gulp = evs.find((e) => e.type === 'partHit' && e.swallow);
    expect(gulp).toMatchObject({ uid: 1, ballId: 7, spark: true });
    expect(sim.sparkStates()).toHaveLength(0);
    const s = scorer([makePart('whale', 1, 12, 30, true)]);
    const w = PARTS.whale.recipe.whale!;
    const out = [...Array(w.every * 4)].flatMap((_, i) => s.consume(hit(1, { t: i, spark: true, swallow: true })));
    expect(out[0].base).toBe(w.swallow);
    const spouts = out.filter((e) => e.label === 'THAR SHE BLOWS!');
    expect(spouts).toHaveLength(4); // no limit a ball: every 6th, a second apart
    // swallowed fast, the rest after a spout holds the next one back
    const quick = scorer([makePart('whale', 1, 12, 30, true)]);
    const fast = [...Array(w.every * 4)].flatMap((_, i) => quick.consume(hit(1, { t: i * 0.1, spark: true, swallow: true })));
    expect(fast.filter((e) => e.label === 'THAR SHE BLOWS!')).toHaveLength(1);
    expect(spouts[0].sparks?.[0].n).toBe(w.sparks);
  });
});

describe('Spider Nest', () => {
  it('a hit sometimes lays an egg; an egg hatches into three sparks on the first part it hits', () => {
    const s = scorer([makePart('nest', 1, 12, 30, true)]);
    const eggs = [...Array(200)].map((_, i) => s.consume(hit(1, { t: i }))[0].sparks?.[0]).filter((b) => b?.egg).length;
    expect(eggs).toBeGreaterThan(70); // half the hits
    expect(eggs).toBeLessThan(130);
    const sim = createSim(layoutOf(makePart('pop', 2, 12, 26, true)), { seed: 1 });
    sim.addSparks(1, 12, 29, 1, { aim: [-Math.PI / 2], egg: true });
    expect(sim.sparkStates()[0].egg).toBe(true);
    const evs = run(sim, 0.5);
    expect(evs.some((e) => e.type === 'partHit' && e.uid === 2 && e.spark)).toBe(true);
    expect(sim.sparkStates().filter((x) => !x.egg).length).toBe(3);
  });
});

describe('Marble Jar', () => {
  it('every 10 hits add a marble for the run (up to 5); every ball launched brings a spark per marble', () => {
    const jar = makePart('jar', 1, 12, 30, true);
    const s = scorer([jar]);
    for (let i = 0; i < 9; i++) s.consume(hit(1, { t: i }));
    expect(s.marblesOf(jar)).toBe(0);
    expect(s.consume(hit(1, { t: 30 }))[0].label).toBe('MARBLE 1!');
    expect(jar.marbles).toBeUndefined(); // a test ball's marbles stay in its scorer
    const g = new Game();
    g.layout.parts.push({ ...makePart('jar', 60, 12, 30, true), marbles: 3 });
    g.startRound();
    let sparks = 0;
    for (let i = 0; i < 240 && !sparks; i++) { g.step({ ...NO_INPUT, plunge: i < 60 }); sparks = g.sim.sparkStates().length; }
    expect(sparks).toBe(3);
  });
});

describe('Insurance Policy', () => {
  it('the last ball drained short of the goal: 10 sparks rain down, once, and the policy is used up', () => {
    const g = new Game();
    g.goalOverride = 1e9;
    g.layout.parts.push(makePart('insure', 61, 12, 30, true));
    g.startRound();
    g.ballsLeft = 1;
    const lane = g.sim.ballStates()[0].id;
    g.sim.addBall(12, 1.5, 0, -5);
    g.sim.retireBall(lane);
    (g.sim as unknown as { awaitingPlunge: boolean }).awaitingPlunge = false; // as if the last ball had been launched
    let claimed = false;
    for (let i = 0; i < 60 && !claimed; i++) claimed = g.step(NO_INPUT).score.some((e) => e.label === 'INSURED!');
    expect(claimed).toBe(true);
    expect(g.mode).toBe('round');
    expect(g.part(61)).toBeUndefined();
    expect(g.sim.sparkStates().length).toBe(PARTS.insure.recipe.insure!.sparks);
    for (let i = 0; i < 240 * 6 && g.mode === 'round'; i++) g.step(NO_INPUT);
    expect(g.mode).not.toBe('round'); // when the sparks are gone, so is the ball
  });
});
