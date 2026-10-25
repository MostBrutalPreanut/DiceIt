import { describe, expect, it } from 'vitest';
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

describe('flippers after the round', () => {
  it('a flipper held as the last ball drains comes back down on the payout screen', async () => {
    const { Game } = await import('../src/game/game');
    const g = new Game();
    g.startRound();
    g.mode = 'roundEnd';
    for (let i = 0; i < 60; i++) g.step({ left: true, right: false, plunge: false, nudge: 0 });
    const up = g.sim.flipperStates().find((f) => f.side === 'L' && f.uid === undefined)!.angle;
    for (let i = 0; i < 60; i++) g.step({ left: false, right: false, plunge: false, nudge: 0 });
    const down = g.sim.flipperStates().find((f) => f.side === 'L' && f.uid === undefined)!.angle;
    expect(up).toBeGreaterThan(0.3);
    expect(down).toBeLessThan(-0.4);
  });
});

describe('the wall ledge', () => {
  it('moves, refuses to sit on a part, and every new run puts it somewhere new', async () => {
    const { Game } = await import('../src/game/game');
    const g = new Game();
    expect(g.moveLedge(30)).toBe(true);
    expect(g.layout.ledge).toBe(30);
    expect(g.moveLedge(55)).toBe(false);
    const seen = new Set<number>();
    for (let i = 0; i < 6; i++) { g.newRun(); seen.add(g.layout.ledge!); }
    expect(seen.size).toBeGreaterThan(3);
  });
});
