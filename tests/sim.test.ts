import { describe, expect, it } from 'vitest';
import { starterLayout } from '../src/sim/layout';
import { createSim, NO_INPUT } from '../src/sim/sim';
import { playBall } from './helpers';

describe('sim basics', () => {
  it('launches a ball from the lane into the playfield and scores part hits', () => {
    const r = playBall(1);
    expect(r.drained).toBe(true);
    expect(r.hits).toBeGreaterThan(0);
  });

  it('a barely-charged plunge falls back instead of entering play', () => {
    const sim = createSim(starterLayout());
    sim.spawnBall();
    for (let i = 0; i < 24; i++) sim.step({ ...NO_INPUT, plunge: true });
    sim.step(NO_INPUT); // release after ~0.1 s of charge
    for (let i = 0; i < 480; i++) sim.step(NO_INPUT);
    expect(sim.ballStates()[0].inLane).toBe(true);
  });

  it('is deterministic: the same inputs give the same state, tick for tick', () => {
    const a = playBall(5, 40);
    const b = playBall(5, 40);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.hits).toBe(b.hits);
  });
});
