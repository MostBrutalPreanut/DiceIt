import { describe, expect, it } from 'vitest';
import { makePart, type PartId, type PartInstance } from '../src/data/parts';
import { Bot } from '../src/sim/bot';
import { BALL_SEARCH_AFTER, BALL_SEARCH_KICKS, BALL_SPAWN, LANE_TOP_Y, LANE_WALL_X, SAVER_WINDOW } from '../src/sim/constants';
import { canPlace, starterLayout, type Layout } from '../src/sim/layout';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';
import { FLIPPER_PIVOTS, LANE_GATE, LEDGE } from '../src/sim/table';
import { restingSpots } from '../tools/probe';
import { measure, perHundred, randomTable } from '../tools/returns';

const layoutOf = (...parts: PartInstance[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const inLane = (b: { x: number; y: number }) => b.x > LANE_WALL_X - 0.1 && b.y < LANE_TOP_Y;

describe('the plunger lane: a ball in play never falls back into it', () => {
  it('a ball coming down onto the top of the lane from the playfield rolls back into the playfield', () => {
    let fell = 0, drops = 0;
    for (let x = LANE_GATE.x1 - 0.5; x <= LANE_GATE.x2 - 0.5; x += 0.25) {
      for (const [vx, vy] of [[0, 0], [6, -4], [12, -10], [3, -30], [-4, -20]]) {
        const sim = createSim(layoutOf());
        sim.addBall(x, 44, vx, vy);
        drops++;
        for (let i = 0; i < 240 * 3; i++) {
          sim.step(NO_INPUT);
          if (sim.ballStates().some(inLane)) { fell++; break; }
        }
      }
    }
    expect(fell, `${fell} of ${drops} drops fell into the lane`).toBe(0);
  });

  it('nothing comes to rest on the lane gate', () => {
    const sim = createSim(layoutOf());
    sim.addBall((LANE_GATE.x1 + LANE_GATE.x2) / 2, LANE_GATE.y2 + 0.6, 0, 0);
    for (let i = 0; i < 240 * 2; i++) sim.step(NO_INPUT);
    const b = sim.ballStates()[0];
    expect(b === undefined || b.y < LANE_GATE.y1 - 1).toBe(true);
  });

  it('a plunged ball still goes up through the gate and out into the playfield, and a weak one falls back to the plunger', () => {
    for (const [charge, out] of [[1, true], [0.6, true], [0.05, false]] as const) {
      const sim = createSim(layoutOf(), { seed: 3 });
      sim.spawnBall();
      const hold = Math.round(charge * 240);
      let left = false;
      for (let i = 0; i < 240 * 6; i++) {
        sim.step({ ...NO_INPUT, plunge: i < hold });
        if (sim.ballStates().some((b) => b.x < LANE_WALL_X - 0.6)) left = true;
      }
      expect(left, `charge ${charge}`).toBe(out);
      if (!out) expect(sim.awaitingPlunge).toBe(true);
    }
  });

  it('saucers that throw at random never throw a ball into the lane, however hard and wherever they sit', () => {
    let lane = 0, throws = 0;
    for (const id of ['jackpot', 'printer'] as PartId[]) {
      for (const [x, y] of [[20.5, 40], [20.5, 44], [20.5, 30]]) {
        const p = makePart(id, 1, x, y, true);
        p.dials.power = 110;
        p.dials.hold = 0.4;
        for (let n = 0; n < 12; n++) {
          const sim = createSim(layoutOf(p), { seed: 100 + n });
          sim.addBall(x, y + 0.2, 0, 0);
          for (let i = 0; i < 240 * 2.5; i++) {
            for (const e of sim.step(NO_INPUT)) if (e.type === 'partRelease') throws++;
            if (sim.ballStates().some(inLane)) { lane++; break; }
          }
        }
      }
    }
    expect(throws).toBeGreaterThan(50);
    expect(lane).toBe(0);
  });
});

describe('nothing on the table is a shelf a ball can rest on', () => {
  it('the Goal! frame, the Thunder Bumper wedge and the moving pieces (duck, roller, goalie) never hold a ball', () => {
    for (const id of ['goal', 'thunder', 'duck', 'roller'] as PartId[]) {
      const { rests } = restingSpots(id, { step: 0.5 });
      expect(rests, id).toEqual([]);
    }
  });

  it('a bar laid level or stood on end (Slingshot, Deflector, Vari-Target, Piggy Bank) never holds a ball', () => {
    for (const id of ['deflector', 'vari', 'piggy', 'sling'] as PartId[]) {
      for (const angle of [0, Math.PI / 2, Math.PI]) {
        const { rests } = restingSpots(id, { angle, step: 0.5 });
        expect(rests, `${id} at ${angle.toFixed(2)}`).toEqual([]);
      }
    }
  });

  it('a part cannot be placed so close to a wall, the ledge or another solid part that a ball wedges in the gap', () => {
    const l = layoutOf();
    // a Vari-Target tucked under the wall ledge left a gap narrower than the ball (it held balls for good)
    expect(canPlace({ ...l, ledge: LEDGE.default }, 'vari', 3.5, 38)).toBe(false);
    const a = makePart('vari', 1, 8, 30, true);
    expect(canPlace(layoutOf(a), 'vari', 8 + 2.7 + 0.9, 30)).toBe(false);
    expect(canPlace(layoutOf(a), 'vari', 8 + 2.7 + 1.2, 30)).toBe(true);
    // lights and other floor parts may still sit close: a ball rolls over them
    expect(canPlace(layoutOf(a), 'lane', 8 + 1.35 + 0.9 + 0.9 + 0.05, 30)).toBe(true);
  });
});

describe('the ball search', () => {
  /** A ball no kick can free: a closed cage of four Deflectors (only a test can build one). */
  const trap = () => layoutOf(
    { ...makePart('deflector', 1, 12, 28, true) }, { ...makePart('deflector', 3, 12, 32.6, true) },
    { ...makePart('deflector', 4, 9.7, 30.3, true), angle: Math.PI / 2 }, { ...makePart('deflector', 5, 14.3, 30.3, true), angle: Math.PI / 2 },
  );
  const caged = { x: 12.3, y: 29.2 };

  it('kicks a stuck ball where it is first, and only when kicks do not free it puts it back at the plunger, still in play', () => {
    const sim = createSim(trap(), { seed: 1 });
    sim.addBall(caged.x, caged.y, 0, 0);
    const events: SimEvent[] = [];
    for (let i = 0; i < 240 * 30 && !events.some((e) => e.type === 'ballSearch' && e.relaunch); i++) events.push(...sim.step(NO_INPUT));
    const searches = events.filter((e) => e.type === 'ballSearch');
    expect(searches.length).toBe(BALL_SEARCH_KICKS + 1);
    expect(searches.slice(0, -1).every((e) => e.type === 'ballSearch' && !e.relaunch)).toBe(true);
    expect(searches[0].t).toBeGreaterThan(BALL_SEARCH_AFTER);
    expect(events.some((e) => e.type === 'drain')).toBe(false); // the ball is not lost
    expect(sim.ballCount).toBe(1);
    expect(sim.awaitingPlunge).toBe(true);
    for (let i = 0; i < 240; i++) sim.step(NO_INPUT);
    const b = sim.ballStates()[0];
    expect(Math.abs(b.x - BALL_SPAWN.x)).toBeLessThan(0.2);
    expect(b.inLane).toBe(true);
  });

  it('a ball put back by the search launches like any other, but opens no fresh save window', () => {
    const sim = createSim({ ...trap(), parts: [...trap().parts, makePart('saver', 2, 12, 20, true)] }, { seed: 1 });
    sim.addBall(caged.x, caged.y, 0, 0);
    for (let i = 0; i < 240 * 30 && !sim.awaitingPlunge; i++) sim.step(NO_INPUT);
    expect(sim.awaitingPlunge).toBe(true);
    for (let i = 0; i < 240 * 1.5; i++) sim.step({ ...NO_INPUT, plunge: i < 220 });
    expect(sim.awaitingPlunge).toBe(false);
    expect(sim.saverStates().get(2)!.left).toBe(0);
    void SAVER_WINDOW;
  });

  it('leaves alone a ball the player cradles on a raised flipper', () => {
    const sim = createSim(starterLayout(), { seed: 2 });
    sim.addBall(FLIPPER_PIVOTS.L.x + 2, FLIPPER_PIVOTS.L.y + 2.5, 0, 0);
    const events: SimEvent[] = [];
    for (let i = 0; i < 240 * 8; i++) events.push(...sim.step({ ...NO_INPUT, left: true }));
    const b = sim.ballStates()[0];
    expect(b).toBeDefined();
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.6); // still resting in the cradle
    expect(events.filter((e) => e.type === 'ballSearch')).toEqual([]);
  });

  it('the bot does not cradle forever: it lets the ball roll and shoots it', () => {
    const sim = createSim(starterLayout(), { seed: 2 });
    const bot = new Bot(3, 1);
    sim.addBall(FLIPPER_PIVOTS.L.x + 2, FLIPPER_PIVOTS.L.y + 2.5, 0, 0);
    let shot = false;
    for (let i = 0; i < 240 * 4 && !shot; i++) {
      sim.step(bot.decide(sim));
      if (sim.ballStates().some((b) => b.y > 20)) shot = true;
    }
    expect(shot).toBe(true);
  });

  it('a nudge still works for the balls in play while another ball waits at the plunger', () => {
    const sim = createSim(layoutOf(), { seed: 1 });
    sim.spawnBall();
    sim.addBall(12, 30, 0, 0);
    expect(sim.awaitingPlunge).toBe(true);
    const ev = sim.step({ ...NO_INPUT, nudge: 1 });
    expect(ev.some((e) => e.type === 'nudge')).toBe(true);
    const [lane, free] = [sim.ballStates().find((b) => b.inLane)!, sim.ballStates().find((b) => !b.inLane)!];
    expect(free.vx).toBeGreaterThan(3);
    expect(Math.abs(lane.vx)).toBeLessThan(0.5);
  });
});

describe('returns to the plunger in bot play', () => {
  it('on tables full of goals, ducks, wedges and saucers, balls almost never fall back to the plunger or get stuck', () => {
    const layouts = [1, 2, 3, 4, 5].map((i) => randomTable(7919 * 3 + i, 6, 3));
    const rep = measure(layouts, { rounds: 1, seed: 3, skill: 0.6 });
    const ph = perHundred(rep);
    expect(rep.balls).toBe(15);
    // before the lane gate a ball fell back into the lane about twice a ball, and cradles and pockets made ~70 searches per 100 balls
    expect(ph.lane).toBe(0);
    expect(ph.search + ph.relaunch, JSON.stringify(rep.incidents.filter((i) => i.cause === 'search' || i.cause === 'relaunch'))).toBeLessThan(10);
  }, 60_000);
});
