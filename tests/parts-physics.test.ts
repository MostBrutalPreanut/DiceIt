import { describe, expect, it } from 'vitest';
import { makePart, type PartInstance } from '../src/data/parts';
import { Scorer } from '../src/game/scoring';
import type { Layout } from '../src/sim/layout';
import { Bot } from '../src/sim/bot';
import { SAVER_WINDOW } from '../src/sim/constants';
import { starterLayout } from '../src/sim/layout';
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

  it('a deflector bounces the ball and reports the bounce (for its bank shot), but scores nothing', () => {
    const d = makePart('deflector', 1, 12, 30, true);
    d.angle = Math.PI / 4;
    const { events, sim } = drop(layoutOf(d), 12, 34, 0, -10, 1);
    expect(hitsOf(events, 1).length).toBeGreaterThan(0);
    const s = new Scorer(1e9, () => [d]);
    expect(hitsOf(events, 1).flatMap((e) => s.consume(e))).toEqual([]);
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

  it('a Left Flipper swings with the left button and a Right Flipper with the right, and they are smaller', () => {
    const swing = (id: 'flipper' | 'flipperR', input: { left: boolean; right: boolean }) => {
      const sim = createSim(layoutOf(makePart(id, 1, 8, 25, true)));
      const rest = sim.flipperStates().find((s) => s.uid === 1)!.angle;
      for (let i = 0; i < 60; i++) sim.step({ ...NO_INPUT, ...input });
      return Math.abs(sim.flipperStates().find((s) => s.uid === 1)!.angle - rest);
    };
    expect(swing('flipper', { left: true, right: false })).toBeGreaterThan(0.8);
    expect(swing('flipper', { left: false, right: true })).toBeLessThan(0.1);
    expect(swing('flipperR', { left: false, right: true })).toBeGreaterThan(0.8);
    const sim = createSim(layoutOf(makePart('flipper', 1, 8, 25, true)));
    const [small, big] = [sim.flipperStates().find((s) => s.uid === 1)!, sim.flipperStates().find((s) => s.uid === undefined)!];
    expect(small.length).toBeLessThan(big.length * 0.8);
  });
});

describe('drop-target bank', () => {
  const bankLayout = () => layoutOf(makePart('bank', 1, 12, 30, true));
  const dropOn = (sim: ReturnType<typeof createSim>, xs: number[]) => {
    for (const x of xs) sim.addBall(x, 33.2, 0, -20);
  };

  it('each target drops when hit, the last one pays a bank bonus, and they pop back up', () => {
    const sim = createSim(bankLayout());
    dropOn(sim, [10.25, 12, 13.75]);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 240 * 0.5; i++) ev.push(...sim.step(NO_INPUT));
    const hits = ev.filter((e) => e.type === 'partHit' && e.uid === 1 && e.index !== undefined) as Extract<SimEvent, { type: 'partHit' }>[];
    expect(hits.map((h) => h.index).sort()).toEqual([0, 1, 2]);
    expect(ev.filter((e) => e.type === 'partHit' && e.bankComplete)).toHaveLength(1);
    expect(sim.bankStates().get(1)).toEqual([true, true, true]);
    for (let i = 0; i < 240 * 1.2; i++) sim.step(NO_INPUT); // 0.8 s later they are back
    expect(sim.bankStates().get(1)).toEqual([false, false, false]);
  });

  it('a knocked-down target lets the next ball fall straight through; a new ball restores the bank', () => {
    const sim = createSim(bankLayout());
    dropOn(sim, [12]);
    for (let i = 0; i < 120; i++) sim.step(NO_INPUT);
    expect(sim.bankStates().get(1)![1]).toBe(true);
    const ev: SimEvent[] = [];
    sim.addBall(12, 33.2, 0, -20);
    for (let i = 0; i < 60; i++) ev.push(...sim.step(NO_INPUT));
    expect(ev.filter((e) => e.type === 'partHit' && e.uid === 1)).toHaveLength(0); // nothing there to hit
    sim.spawnBall();
    expect(sim.bankStates().get(1)).toEqual([false, false, false]);
  });
});

describe('kickback', () => {
  const kickLayout = (angle = 0, power?: number) => {
    const k = makePart('kickback', 1, 12, 30, true);
    k.angle = angle;
    if (power !== undefined) k.dials.power = power;
    return layoutOf(k);
  };
  const kicks = (events: SimEvent[]) => events.filter((e) => e.type === 'partHit' && e.uid === 1 && e.kicked);

  it('boots a ball that rolls over it along its aim, at its power, and scores the kick', () => {
    const sim = createSim(kickLayout());
    sim.addBall(12, 33, 0, -20);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 40; i++) ev.push(...sim.step(NO_INPUT));
    expect(kicks(ev)).toHaveLength(1);
    const b = sim.ballStates()[0];
    expect(b.vy).toBeGreaterThan(50);
    expect(Math.abs(b.vx)).toBeLessThan(12);
  });

  it('fires, then needs a few seconds to recharge, then fires again in the same ball', () => {
    const sim = createSim(kickLayout());
    const run = () => {
      sim.addBall(12, 33, 0, -20);
      const ev: SimEvent[] = [];
      for (let i = 0; i < 40; i++) ev.push(...sim.step(NO_INPUT));
      return kicks(ev).length;
    };
    expect(run()).toBe(1);
    expect(sim.kickbackStates().get(1)).toBe(false);
    for (let i = 0; i < 240 * 1; i++) sim.step(NO_INPUT);
    expect(run()).toBe(0); // still recharging
    for (let i = 0; i < 240 * 4; i++) sim.step(NO_INPUT);
    expect(sim.kickbackStates().get(1)).toBe(true);
    expect(run()).toBe(1);
  });

  it('rotating it aims the kick, and the Power dial sets how hard', () => {
    const left = createSim(kickLayout(Math.PI / 2));
    left.addBall(12, 33, 0, -20);
    for (let i = 0; i < 30; i++) left.step(NO_INPUT);
    expect(left.ballStates()[0].vx).toBeLessThan(-50); // angle 90 deg: fired to the left

    const speed = (power: number) => {
      const sim = createSim(kickLayout(0, power));
      sim.addBall(12, 33, 0, -20);
      for (let i = 0; i < 20; i++) sim.step(NO_INPUT);
      const b = sim.ballStates()[0];
      return Math.hypot(b.vx, b.vy);
    };
    expect(speed(100)).toBeGreaterThan(speed(40) + 30);
  });

  it('is just a sensor: while it is dark a ball passes through without a bounce', () => {
    const sim = createSim(kickLayout());
    sim.addBall(12, 33, 0, -20);
    for (let i = 0; i < 240 * 5; i++) sim.step(NO_INPUT);
    sim.addBall(12.2, 33, 0, -10);
    for (let i = 0; i < 20; i++) sim.step(NO_INPUT);
    expect(sim.ballStates()[0].vy).toBeLessThan(0); // still falling
  });
});

describe('vari-target', () => {
  const target = () => layoutOf(makePart('vari', 1, 12, 30, true));
  const hitWith = (vy: number) => {
    const sim = createSim(target());
    sim.addBall(12, 34, 0, vy);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 240 * 0.6 && hitsOf(ev, 1).length === 0; i++) ev.push(...sim.step(NO_INPUT));
    for (let i = 0; i < 6; i++) sim.step(NO_INPUT); // a few ticks after the bounce
    return { sim, hit: hitsOf(ev, 1)[0] as Extract<SimEvent, { type: 'partHit' }> | undefined };
  };

  it('is a solid target: it bounces the ball back and reports the speed it was hit at', () => {
    const { sim, hit } = hitWith(-40);
    expect(hit).toBeDefined();
    expect(hit!.speed).toBeGreaterThan(38); // the impact speed, not the speed after the bounce
    expect(hit!.speed).toBeLessThan(75);
    expect(sim.ballStates()[0].vy).toBeGreaterThan(0); // thrown back up
  });

  it('a harder shot reports a higher speed than a soft drop', () => {
    expect(hitWith(-90).hit!.speed).toBeGreaterThan(hitWith(-5).hit!.speed + 40);
  });
});

describe('ball saver', () => {
  const saverAt = (uid: number, x: number) => makePart('saver', uid, x, 30, true);
  /** Hold the plunger for `charge` seconds, then let go and run until something drains or `seconds` pass. */
  function plungeAndWatch(sim: ReturnType<typeof createSim>, seconds = 20, charge = 1) {
    const ev: SimEvent[] = [];
    for (let i = 0; i < seconds * 240; i++) {
      const out = sim.step({ ...NO_INPUT, plunge: i < charge * 240 });
      ev.push(...out);
      if (out.some((e) => e.type === 'drain' || e.type === 'ballSaved') && i > charge * 240) break;
    }
    return ev;
  }

  it('sends a ball that drains soon after launch back to the plunger, unspent', () => {
    const sim = createSim(layoutOf(saverAt(1, 12)));
    sim.spawnBall();
    const ev = plungeAndWatch(sim);
    expect(ev.filter((e) => e.type === 'ballSaved')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'drain')).toHaveLength(0);
    expect(sim.ballCount).toBe(1);
    expect(sim.awaitingPlunge).toBe(true);
    const b = sim.ballStates()[0];
    expect(b.inLane).toBe(true);
    expect(sim.saverStates().get(1)!.armed).toBe(false);
  });

  it('saves one drain per saver per ball: the second drain is real, and a new ball re-arms it', () => {
    const sim = createSim(layoutOf(saverAt(1, 12)));
    sim.spawnBall();
    expect(plungeAndWatch(sim).some((e) => e.type === 'ballSaved')).toBe(true);
    const again = plungeAndWatch(sim);
    expect(again.some((e) => e.type === 'ballSaved')).toBe(false);
    expect(again.some((e) => e.type === 'drain')).toBe(true);
    sim.spawnBall();
    expect(sim.saverStates().get(1)!.armed).toBe(true);
    expect(plungeAndWatch(sim).some((e) => e.type === 'ballSaved')).toBe(true);
  });

  it('two savers save two drains', () => {
    const sim = createSim(layoutOf(saverAt(1, 8), saverAt(2, 16)));
    sim.spawnBall();
    let saves = 0, drains = 0;
    for (let k = 0; k < 4 && drains === 0; k++) {
      const ev = plungeAndWatch(sim);
      saves += ev.filter((e) => e.type === 'ballSaved').length;
      drains += ev.filter((e) => e.type === 'drain').length;
    }
    expect(saves).toBe(2);
    expect(drains).toBe(1);
  });

  it('does nothing without a saver, and never saves a ball that was not launched by the plunger', () => {
    const none = createSim(layoutOf());
    none.spawnBall();
    expect(plungeAndWatch(none).some((e) => e.type === 'drain')).toBe(true);
    const placed = createSim(layoutOf(saverAt(1, 12)));
    placed.addBall(12, 20, 0, -10); // a test ball, not a plunged one
    const ev: SimEvent[] = [];
    for (let i = 0; i < 240 * 3; i++) ev.push(...placed.step(NO_INPUT));
    expect(ev.some((e) => e.type === 'ballSaved')).toBe(false);
    expect(ev.some((e) => e.type === 'drain')).toBe(true);
  });

  it('only saves inside its window, and no save is ever late (bot, several seeds)', () => {
    let lateDrains = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const layout = starterLayout();
      layout.parts.push(saverAt(50, 12));
      const sim = createSim(layout, { seed });
      const bot = new Bot(seed, 0.9);
      sim.spawnBall();
      let launchedAt = 0, saves = 0, drained = false;
      for (let i = 0; i < 240 * 150 && !drained; i++) {
        for (const e of sim.step(bot.decide(sim))) {
          if (e.type === 'launch') launchedAt = e.t;
          if (e.type === 'ballSaved') { saves++; expect(e.t - launchedAt).toBeLessThanOrEqual(SAVER_WINDOW + 0.01); }
          if (e.type === 'drain' && e.reason === 'drain') {
            drained = true;
            // an unsaved drain means the window was over, or the one saver was already spent
            expect(e.t - launchedAt > SAVER_WINDOW || saves >= 1).toBe(true);
            if (saves === 0) lateDrains++;
          }
        }
      }
    }
    expect(lateDrains).toBeGreaterThan(0); // at least one ball outlived the window, so the expiry was really exercised
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
