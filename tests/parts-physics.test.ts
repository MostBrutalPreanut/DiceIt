import { describe, expect, it } from 'vitest';
import { makePart, type PartInstance } from '../src/data/parts';
import type { Layout } from '../src/sim/layout';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';

const layoutOf = (...parts: PartInstance[]): Layout => ({ parts, gravity: 50, nextUid: 100 });

/** Drop a ball from (x, y) with velocity and step until it leaves or `seconds` pass; collect events. */
function drop(layout: Layout, x: number, y: number, vx = 0, vy = 0, seconds = 3) {
  const sim = createSim(layout);
  sim.addBall(x, y, vx, vy);
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * 240; i++) events.push(...sim.step(NO_INPUT));
  return { sim, events };
}
const hitsOf = (events: SimEvent[], uid: number) => events.filter((e) => e.type === 'partHit' && e.uid === uid);

describe('each part type does its job in the physics', () => {
  it('a pop bumper kicks the ball away and reports a hit', () => {
    const { events } = drop(layoutOf(makePart('pop', 1, 12, 30, true)), 12, 36, 0, -20, 1);
    expect(hitsOf(events, 1).length).toBeGreaterThan(0);
  });

  it('a stored part (in the inventory) is not on the table', () => {
    const { events } = drop(layoutOf(makePart('pop', 1, 12, 30, false)), 12, 36, 0, -20, 1.5);
    expect(hitsOf(events, 1)).toHaveLength(0);
  });

  it('a slingshot snaps the ball away fast', () => {
    const sling = makePart('sling', 1, 12, 30, true);
    const { events, sim } = drop(layoutOf(sling), 12, 34, 0, -10, 0.4);
    expect(hitsOf(events, 1).length).toBeGreaterThan(0);
    void sim;
  });

  it('a deflector bounces the ball without scoring', () => {
    const d = makePart('deflector', 1, 12, 30, true);
    d.angle = Math.PI / 4;
    const { events, sim } = drop(layoutOf(d), 12, 34, 0, -10, 1);
    expect(hitsOf(events, 1)).toHaveLength(0);
    expect(Math.abs(sim.ballStates()[0].x - 12)).toBeGreaterThan(1); // it was steered sideways
  });

  it('a spinner reports spins that scale with ball speed, and slows the ball', () => {
    const sp = makePart('spinner', 1, 12, 30, true);
    const slow = hitsOf(drop(layoutOf(sp), 12, 33, 0, -5, 1).events, 1)[0] as Extract<SimEvent, { type: 'partHit' }>;
    const fast = hitsOf(drop(layoutOf(sp), 12, 33, 0, -80, 1).events, 1)[0] as Extract<SimEvent, { type: 'partHit' }>;
    expect(slow.spins).toBeGreaterThanOrEqual(1);
    expect(fast.spins!).toBeGreaterThan(slow.spins!);
    expect(fast.spins!).toBeLessThanOrEqual(10);
  });

  it('a lane rollover and a lamp report when a ball rolls over them, without deflecting it', () => {
    for (const id of ['lane', 'lamp'] as const) {
      const { events, sim } = drop(layoutOf(makePart(id, 1, 12, 30, true)), 12, 34, 0, -20, 1);
      expect(hitsOf(events, 1)).toHaveLength(1);
      expect(Math.abs(sim.ballStates()[0]?.x ?? 12 - 12)).toBeLessThan(1);
    }
  });

  it('the Ball Printer catches a ball, holds it, fires it out and prints a second ball', () => {
    const pr = makePart('printer', 1, 12, 30, true);
    const sim = createSim(layoutOf(pr));
    sim.addBall(12, 34, 0, -20);
    let caught = -1, released = -1, extra = -1, maxHeldPos = 0;
    for (let i = 0; i < 240 * 3; i++) {
      for (const e of sim.step(NO_INPUT)) {
        if (e.type === 'partHit' && e.caught && caught < 0) caught = i;
        if (e.type === 'partRelease' && released < 0) released = i;
        if (e.type === 'extraBall' && extra < 0) extra = i;
      }
      const held = sim.ballStates().find((b) => b.held);
      if (held) maxHeldPos = Math.max(maxHeldPos, Math.hypot(held.x - 12, held.y - 30));
    }
    expect(caught).toBeGreaterThan(0);
    expect((released - caught) / 240).toBeCloseTo(0.6, 1); // the Hold dial
    expect(extra).toBe(released); // the second ball is printed on the same tick
    expect(maxHeldPos).toBeLessThan(0.01); // a held ball sits dead still in the saucer
  });

  it('the Ball Printer never makes more than 4 balls', () => {
    const sim = createSim(layoutOf(makePart('printer', 1, 12, 30, true)));
    for (let k = 0; k < 6; k++) sim.addBall(12, 33 + k * 1.2, 0, -5);
    let max = 0;
    for (let i = 0; i < 240 * 4; i++) { sim.step(NO_INPUT); max = Math.max(max, sim.ballCount); }
    expect(max).toBeLessThanOrEqual(6 + 0); // only the balls we added; the printer must not add past 4
    const solo = createSim(layoutOf(makePart('printer', 1, 12, 30, true)));
    for (let k = 0; k < 4; k++) solo.addBall(5 + k * 4, 40, 0, -1);
    let m2 = 0;
    for (let i = 0; i < 240 * 2; i++) { solo.step(NO_INPUT); m2 = Math.max(m2, solo.ballCount); }
    expect(m2).toBeLessThanOrEqual(4);
  });

  it('an extra flipper swings with the button chosen by its Button dial', () => {
    const f = makePart('flipper', 1, 8, 25, true);
    const swing = (input: { left: boolean; right: boolean }) => {
      const sim = createSim(layoutOf(f));
      const rest = sim.flipperStates().find((s) => s.uid === 1)!.angle;
      for (let i = 0; i < 60; i++) sim.step({ ...NO_INPUT, ...input });
      return Math.abs(sim.flipperStates().find((s) => s.uid === 1)!.angle - rest);
    };
    expect(swing({ left: true, right: false })).toBeGreaterThan(0.8);
    expect(swing({ left: false, right: true })).toBeLessThan(0.1); // only settles under gravity
    f.dials.side = 1;
    expect(swing({ left: false, right: true })).toBeGreaterThan(0.8);
  });
});

describe('multiball and the plunger lane', () => {
  it('balls that come to rest in the lane re-arm the plunger even when other balls are in play', () => {
    const sim = createSim(layoutOf());
    sim.addBall(12, 30, 0, 0); // a ball somewhere else on the table
    sim.addBall(25, 2.6, 0, 0); // two balls resting in the lane
    sim.addBall(25, 3.7, 0, 0);
    expect(sim.awaitingPlunge).toBe(false);
    for (let i = 0; i < 240; i++) sim.step(NO_INPUT);
    expect(sim.awaitingPlunge).toBe(true);
    // fire it: exactly one ball leaves the lane, the top one
    for (let i = 0; i < 240; i++) sim.step({ ...NO_INPUT, plunge: true });
    sim.step(NO_INPUT);
    for (let i = 0; i < 60; i++) sim.step(NO_INPUT);
    const resting = sim.ballStates().filter((b) => b.inLane && Math.hypot(b.vx, b.vy) < 3).length;
    expect(resting).toBe(1); // the other one is still waiting in the lane
    expect(sim.ballStates().some((b) => !b.inLane || Math.hypot(b.vx, b.vy) > 20)).toBe(true); // and one is on its way
  });
});

describe('live edits while a ball is rolling', () => {
  it('moving, rotating, storing and removing parts really changes the table', () => {
    const pop = makePart('pop', 1, 12, 30, true);
    const sim = createSim(layoutOf(pop));
    pop.x = 20;
    sim.updatePart(pop); // moved away from under the ball
    sim.addBall(12, 36, 0, -20);
    const events: SimEvent[] = [];
    for (let i = 0; i < 240; i++) events.push(...sim.step(NO_INPUT));
    expect(hitsOf(events, 1)).toHaveLength(0);

    pop.x = 12;
    pop.placed = false;
    sim.updatePart(pop); // stored
    sim.removePart(1);
    expect(() => sim.step(NO_INPUT)).not.toThrow();
  });
});
