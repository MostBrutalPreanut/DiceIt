import { describe, expect, it } from 'vitest';
import { makePart, PARTS, WHEEL, type PartInstance } from '../src/data/parts';
import { Game } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import type { Layout } from '../src/sim/layout';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';

const layoutOf = (...parts: PartInstance[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const run = (sim: ReturnType<typeof createSim>, seconds: number, input = NO_INPUT) => {
  const evs: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 240); i++) evs.push(...sim.step(input));
  return evs;
};
const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });

describe('Gumball Machine', () => {
  it('locks a ball and sends a new one to the plunger; the third lock lets all three loose', () => {
    const sim = createSim(layoutOf(makePart('gumball', 1, 12, 30, true)), { seed: 1 });
    for (let k = 1; k <= 3; k++) {
      sim.addBall(12, 31.5, 0, -6);
      const evs = run(sim, 0.4);
      const lock = evs.find((e) => e.type === 'partHit' && e.caught) as Extract<SimEvent, { type: 'partHit' }>;
      expect(lock?.index).toBe(k);
      if (k < 3) {
        expect(sim.locksOf(1)).toBe(k);
        expect(sim.awaitingPlunge).toBe(true);
        for (const b of sim.ballStates().filter((x) => x.inLane)) sim.retireBall(b.id); // (keep the table clear for the next shot)
      }
    }
    expect(sim.locksOf(1)).toBe(0);
    expect(sim.ballStates().filter((b) => !b.inLane).length).toBeGreaterThanOrEqual(3);
    const s = new Scorer(1e9, () => [makePart('gumball', 1, 12, 30, true)]);
    s.resetRound();
    expect(s.consume(hit(1, { caught: true, index: 1 }))[0].label).toBe('LOCK 1/3');
    expect(s.consume(hit(1, { caught: true, index: 3 }))[0].label).toBe('MULTIBALL!');
  });

  it('locks nothing in multiball, and lets go only once a round', () => {
    const sim = createSim(layoutOf(makePart('gumball', 1, 12, 30, true)), { seed: 1 });
    const only = (x: number, y: number, vy: number) => { const id = sim.addBall(x, y, 0, vy); for (const b of sim.ballStates()) if (b.id !== id) sim.retireBall(b.id); };
    sim.addBall(3, 40, 0, 0);
    sim.addBall(12, 31.5, 0, -6);
    let evs = run(sim, 0.4);
    expect(evs.some((e) => e.type === 'partHit' && e.uid === 1 && !e.caught)).toBe(true); // two in play: it rolled through for its points
    expect(sim.locksOf(1)).toBe(0);
    let caught = 0;
    for (let k = 1; k <= 3; k++) {
      only(12, 31.5, -6);
      caught += run(sim, 0.4).filter((e) => e.type === 'partHit' && e.caught).length;
    }
    expect(caught).toBe(3);
    run(sim, 1.2);
    only(12, 31.5, -6);
    evs = run(sim, 0.4);
    expect(evs.some((e) => e.type === 'partHit' && e.caught)).toBe(false); // spent for the round
  });
});

describe('Bank Ring', () => {
  it('holds 30% of every hit back as heat; rolling through banks it at x1.5; a drain loses it', () => {
    const parts = [makePart('ring', 1, 12, 40, true), makePart('pop', 2, 12, 30, true)];
    const s = new Scorer(1e9, () => parts);
    s.resetRound();
    const e = s.consume(hit(2))[0];
    const full = Math.round(e.base * e.multBefore);
    expect(e.points).toBe(full - Math.round(full * 0.3));
    expect(s.heatOf(1)).toBe(Math.round(full * 0.3));
    const heat = s.heatOf(1);
    expect(s.consume(hit(1, { zap: true }))).toEqual([]); // a zap never banks
    const bank = s.consume(hit(1))[0];
    expect(bank.points).toBe(Math.round(heat * 1.5));
    expect(bank.label).toBe(`BANKED ${Math.round(heat * 1.5).toLocaleString('en-US')}!`);
    expect(s.heatOf(1)).toBe(0);
    s.consume(hit(2));
    s.consume({ type: 'drain', t: 1, ballId: 1, reason: 'drain' });
    expect(s.heatOf(1)).toBe(0);
  });
});

describe('Helping Hand', () => {
  it('flips by itself when a ball comes near it from above, and never on TILT', () => {
    const hand = makePart('hand', 1, 6, 22, true);
    const sim = createSim(layoutOf(hand), { seed: 3 });
    const f0 = sim.flipperStates().find((f) => f.uid === 1)!;
    sim.addBall(7.5, 23.2, 0, -2);
    run(sim, 0.08);
    const f1 = sim.flipperStates().find((f) => f.uid === 1)!;
    expect(f1.angle).not.toBeCloseTo(f0.angle, 2);
    expect(sim.flipperStates().filter((f) => f.uid === undefined).every((f) => Math.abs(f.angle) > 0.3)).toBe(true); // the main flippers stay down
  });

  it('half the time it means the shot: the ball goes straight at the nearest scoring part', () => {
    let aimed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const sim = createSim(layoutOf(makePart('hand', 1, 6, 22, true), makePart('pop', 2, 9, 34, true)), { seed });
      sim.addBall(7.5, 23.4, 0, -2);
      const evs = run(sim, 0.8);
      if (evs.some((e) => e.type === 'partHit' && e.uid === 2)) aimed++;
    }
    expect(aimed).toBeGreaterThanOrEqual(5);
    expect(aimed).toBeLessThanOrEqual(17);
  });
});

describe('Spider Wheel', () => {
  it('catches the ball and spins; a flipper press stops it, and it pays where it points', () => {
    const sim = createSim(layoutOf(makePart('wheel', 1, 12, 30, true)), { seed: 1 });
    sim.addBall(12, 31.5, 0, -6);
    const evs = run(sim, 0.3);
    expect(evs.some((e) => e.type === 'partHit' && e.caught)).toBe(true);
    const press = run(sim, 0.4, { ...NO_INPUT, left: true });
    expect(press.some((e) => e.type === 'partRelease')).toBe(true);
    const wheel = makePart('wheel', 1, 12, 30, true);
    const s = new Scorer(1e9, () => [wheel]);
    s.resetRound();
    s.consume(hit(1, { caught: true, t: 0 }));
    expect(s.wheelAt(wheel, 0.25)).toBe(1); // 5 segments a second
    const out = s.consume({ type: 'partRelease', t: 0.25, uid: 1, ballId: 1 })[0];
    expect(out.wheel?.award).toBe(WHEEL[1].id);
    expect(out.money).toBe(3);
  });

  it('all eight awards in a run, and the next spin is Wheel Mania: three more balls, every hit x2', () => {
    const g = new Game();
    const wheel = { ...makePart('wheel', 70, 12, 30, true), spun: [0, 1, 2, 3, 4, 5, 6, 7] };
    g.layout.parts.push(wheel);
    g.startRound();
    g.scorer.consume(hit(70, { caught: true, t: 0 }));
    const out = g.scorer.consume({ type: 'partRelease', t: 0.1, uid: 70, ballId: 1 })[0];
    expect(out.label).toBe('WHEEL MANIA!');
    expect(out.balls?.n).toBe(3);
    expect(wheel.spun).toEqual([]);
    expect(PARTS.wheel.recipe.wheel!.speed).toBe(5);
  });

  it('a free reroll from the wheel is spent before money, and costs the next paid one nothing extra', () => {
    const g = new Game();
    g.bonusRerolls = 1;
    g.money = 10;
    expect(g.rerollCost).toBe(0);
    g.reroll();
    expect(g.money).toBe(10);
    expect(g.bonusRerolls).toBe(0);
    expect(g.rerollCost).toBe(1);
  });
});
