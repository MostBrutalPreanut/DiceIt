import { expect, it } from 'vitest';
import { playBall } from './helpers';

// Sims share one Box2D world per process (see Sim.reset), so a reset world must behave exactly
// like a fresh one. This file must keep the fresh-world run first.
it('a reset world replays a ball identically to a fresh world', () => {
  const fresh = playBall(11, 60);
  playBall(3, 60); // dirty the world with a different ball
  playBall(4, 60);
  const again = playBall(11, 60);
  expect(again.fingerprint).toBe(fresh.fingerprint);
  expect(again.hits).toBe(fresh.hits);
  expect(again.seconds).toBe(fresh.seconds);
});

it('survives hundreds of resets without leaking or crashing', () => {
  for (let i = 0; i < 300; i++) playBall(i, 3);
});
