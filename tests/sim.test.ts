import { describe, expect, it } from 'vitest';
import { Scorer } from '../src/game/scoring';
import { starterLayout } from '../src/sim/layout';
import { createSim, NO_INPUT } from '../src/sim/sim';
import { playBall } from './helpers';

describe('sim basics', () => {
  it('launches a ball from the lane into the playfield and scores bumper hits', () => {
    const r = playBall(1);
    expect(r.drained).toBe(true);
    expect(r.hits).toBeGreaterThan(0);
  });

  it('a barely-charged plunge falls back instead of entering play', () => {
    const sim = createSim(starterLayout());
    sim.spawnBall();
    for (let i = 0; i < 12; i++) sim.step({ ...NO_INPUT, plunge: true });
    sim.step(NO_INPUT); // release after ~0.1 s of charge
    for (let i = 0; i < 240; i++) sim.step(NO_INPUT);
    const b = sim.ballStates()[0];
    expect(b.inLane).toBe(true);
  });

  it('is deterministic: the same inputs give the same state, tick for tick', () => {
    const a = playBall(5, 40);
    const b = playBall(5, 40);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.hits).toBe(b.hits);
  });
});

describe('scorer', () => {
  const layout = starterLayout();
  const lookup = (uid: number) => layout.parts.find((p) => p.uid === uid);
  const hit = (uid: number, t = 0) => ({ type: 'partHit' as const, t, uid, ballId: 1, x: 0, y: 0, speed: 10 });

  it('multiplies points by the current Mult and then raises Mult', () => {
    const s = new Scorer(1e9);
    const a = s.consume(hit(1), lookup)!;
    expect(a.points).toBe(100);
    expect(a.multAfter).toBeCloseTo(1.05);
    const b = s.consume(hit(1), lookup)!;
    expect(b.points).toBe(105);
    expect(s.score).toBe(205);
  });

  it('attributes every point to the part that earned it', () => {
    const s = new Scorer(1e9);
    s.consume(hit(1), lookup);
    s.consume(hit(2), lookup);
    s.consume(hit(1), lookup);
    const rows = s.ledgerRows();
    expect(rows.reduce((a, r) => a + r.points, 0)).toBe(s.score);
    expect(rows.find((r) => r.uid === 1)!.hits).toBe(2);
  });

  it('Kick trades against payout and Mult resets each ball', () => {
    const l = starterLayout();
    l.parts[0].kick = 4;
    const s = new Scorer(1e9);
    expect(s.consume(hit(1), (u) => l.parts.find((p) => p.uid === u))!.points).toBe(50);
    s.startBall();
    expect(s.mult).toBe(1);
  });

  it('flags the goal the moment the score crosses it', () => {
    const s = new Scorer(150);
    s.consume(hit(1), lookup);
    expect(s.goalReached).toBe(false);
    s.consume(hit(1), lookup);
    expect(s.goalReached).toBe(true);
  });
});
