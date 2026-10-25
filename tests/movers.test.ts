import { describe, expect, it } from 'vitest';
import { makePart, PARTS, type PartInstance } from '../src/data/parts';
import { neutralMods } from '../src/data/mods';
import { Game, payoutFor } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import { canPlace, type Layout } from '../src/sim/layout';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const layoutOf = (...parts: PartInstance[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const scorer = (parts: PartInstance[]) => {
  const s = new Scorer(1e9, () => parts);
  s.startBall();
  return s;
};

describe('the moving parts: Rubber Duck, Roller, Goal', () => {
  it('a sliding piece travels back and forth along its rail and never leaves it', () => {
    for (const id of ['duck', 'roller', 'goal'] as const) {
      const sim = createSim(layoutOf(makePart(id, 1, 12, 30, true)));
      const m = PARTS[id].mover!;
      const xs: number[] = [];
      for (let i = 0; i < 240 * 4; i++) { sim.step(NO_INPUT); xs.push(sim.moverStates().get(1)!.x - 12); }
      expect(Math.max(...xs), id).toBeGreaterThan(m.travel * 0.8);
      expect(Math.min(...xs), id).toBeLessThan(-m.travel * 0.8);
      expect(Math.max(...xs.map(Math.abs)), id).toBeLessThan(m.travel + 0.3);
    }
  });

  it('the duck pays only when the duck itself is hit, and more every hit up to its cap', () => {
    const s = scorer([makePart('duck', 1, 12, 30, true)]);
    expect(s.consume(hit(1))).toEqual([]); // the rail is not the duck
    const pays = Array.from({ length: 12 }, () => s.consume(hit(1, { mover: true }))[0].base);
    expect(pays.slice(0, 3)).toEqual([60, 80, 100]);
    expect(pays[11]).toBe(260); // 300 + the 1000 cap
  });

  it('a hit on the duck makes it paddle faster for the rest of the ball', () => {
    const sim = createSim(layoutOf(makePart('duck', 1, 12, 30, true)));
    const speed = () => {
      const a = sim.moverStates().get(1)!.x;
      sim.step(NO_INPUT);
      return Math.abs(sim.moverStates().get(1)!.x - a) * 240;
    };
    const before = speed();
    let hits = 0;
    for (let n = 0; n < 6 && hits === 0; n++) {
      const x = sim.moverStates().get(1)!.x;
      sim.addBall(x, 32, 0, -8);
      for (let i = 0; i < 240; i++) for (const e of sim.step(NO_INPUT)) if (e.type === 'partHit' && e.mover) hits++;
    }
    expect(hits).toBeGreaterThan(0);
    expect(speed()).toBeGreaterThan(before * 1.1);
  });

  it('the Roller pays ×3 for a hit near either end of its rail', () => {
    const s = scorer([makePart('roller', 1, 12, 30, true)]);
    expect(s.consume(hit(1, { mover: true }))[0].base).toBe(30);
    const edge = s.consume(hit(1, { mover: true, edge: true }))[0];
    expect(edge.base).toBe(90);
    expect(edge.label).toBe('EDGE SHOT!');
  });

  it('the goal pays only for a ball past the goalie: 1500 and Mult ×1.5, then a short cooldown', () => {
    const s = scorer([makePart('goal', 1, 12, 40, true)]);
    expect(s.consume(hit(1, { mover: true }))).toEqual([]); // the goalie saved it
    const g = s.consume(hit(1, { goal: true, t: 1 }))[0];
    expect(g.label).toBe('GOAL!');
    expect(g.base).toBe(300);
    expect(s.mult).toBeCloseTo(1.5);
    expect(s.consume(hit(1, { goal: true, t: 1.5 }))).toEqual([]);
    expect(s.consume(hit(1, { goal: true, t: 3 }))[0].label).toBe('GOAL!');
  });

  it('shots at the goal: some go in, some the goalie blocks', () => {
    let goals = 0, saves = 0;
    for (let n = 0; n < 24; n++) {
      const sim = createSim(layoutOf(makePart('goal', 1, 12, 40, true)));
      for (let i = 0; i < n * 7; i++) sim.step(NO_INPUT); // the goalie is somewhere else every shot
      sim.addBall(12 + ((n % 5) - 2) * 0.8, 35, 0, 32);
      for (let i = 0; i < 240; i++) for (const e of sim.step(NO_INPUT)) if (e.type === 'partHit') { if (e.goal) goals++; else if (e.mover) saves++; }
    }
    expect(goals).toBeGreaterThan(0);
    expect(saves).toBeGreaterThan(0);
  });
});

describe('Glow Strip', () => {
  it('lies under the floor: other parts stand on it', () => {
    const l = layoutOf(makePart('strip', 1, 12, 30, true));
    expect(canPlace(l, 'pop', 12, 30)).toBe(true);
    expect(canPlace(l, 'strip', 12, 30)).toBe(false); // but not on another strip
  });

  it('lights for 5 s whenever anything pays a bonus, and the parts on it pay +50%', () => {
    const parts = [makePart('strip', 1, 12, 30, true), makePart('pop', 2, 12, 30, true), makePart('bank', 3, 6, 20, true)];
    const s = scorer(parts);
    expect(s.consume(hit(2, { t: 0 }))[0].base).toBe(20);
    s.consume(hit(3, { bankComplete: true, t: 1 }));
    const lit = s.consume(hit(2, { t: 2 }))[0];
    expect(lit.base).toBe(Math.round(21 * 1.5));
    expect(lit.notes).toContain('+50% glow strip');
    expect(s.consume(hit(2, { t: 7 }))[0].base).toBe(22);
  });
});

describe('Thunder Bumper', () => {
  it('is a wedge that throws a ball coming in from the side up the table', () => {
    const sim = createSim(layoutOf(makePart('thunder', 1, 12, 30, true)));
    sim.addBall(9.2, 29.6, 14, 0);
    let up = -Infinity;
    for (let i = 0; i < 60; i++) { sim.step(NO_INPUT); up = Math.max(up, sim.ballStates()[0]?.vy ?? up); }
    expect(up).toBeGreaterThan(5);
  });
});

describe('Ball Saver money', () => {
  it('pays $1 at the end of a round for every Ball Saver that never had to save a ball', () => {
    const p = payoutFor({ round: 2, ballsLeft: 0, score: 0, goal: 0, coins: 0, money: 0, mods: neutralMods(), unusedSavers: 2 });
    expect(p.lines.find((l) => l.label.includes('Ball Saver'))!.amount).toBe(2);
  });
});

describe('packs: Lane Rollovers come in threes, Level Lights in twos', () => {
  const offer = (g: Game, id: 'lane' | 'uplight') => {
    g.shop.offers[0] = id;
    g.money = 50;
    return 0;
  };

  it('one offer buys the whole pack into the toolbox, and the pieces know they belong together', () => {
    const g = new Game();
    g.buy(offer(g, 'lane'));
    const lanes = g.inventory.filter((p) => p.def === 'lane');
    expect(lanes).toHaveLength(3);
    expect(new Set(lanes.map((p) => p.group)).size).toBe(1);
    g.buy(offer(g, 'uplight')); // three slots used: no room for two more
    expect(g.inventory.filter((p) => p.def === 'uplight')).toHaveLength(0);
  });

  it('dropped on the table, the rest of the pack lands beside the first piece', () => {
    const g = new Game();
    const first = g.buyAndPlace(offer(g, 'lane'), 12, 30)!;
    const lanes = g.placed.filter((p) => p.def === 'lane');
    expect(lanes).toHaveLength(3);
    for (const p of lanes) expect(Math.hypot(p.x - first.x, p.y - first.y)).toBeLessThan(5);
    expect(g.money).toBe(50 - PARTS.lane.cost);
  });

  it('a set is all three lanes of one pack: three lit lanes from two packs are not a set', () => {
    const a = [1, 2, 3].map((u) => ({ ...makePart('lane', u, 4 + u * 2, 30, true), group: 1 }));
    const b = [4, 5, 6].map((u) => ({ ...makePart('lane', u, 4 + u * 2, 36, true), group: 4 }));
    const s = scorer([...a, ...b]);
    s.consume(hit(1));
    s.consume(hit(2));
    expect(s.consume(hit(4))).toHaveLength(1); // two of one pack and one of the other
    expect(s.consume(hit(3)).find((e) => e.label === 'LANES COMPLETE')).toBeTruthy();
    expect(s.isLit(4)).toBe(true); // the other pack keeps its light
  });

  it('Level Lights only work with the lights inside their own reach', () => {
    const calls: number[] = [];
    // a chain: 1 reaches 2, 2 reaches 3, but 1 does not reach 3
    const lights = [makePart('uplight', 20, 4, 41, true), makePart('uplight', 21, 9, 41, true), makePart('uplight', 22, 14, 41, true)];
    const pop = makePart('pop', 1, 4, 45, true);
    const s = new Scorer(1e9, () => [...lights, pop], { onLevelUp: (p, n) => calls.push(p.uid, n) });
    s.consume(hit(22));
    s.consume(hit(20));
    expect(calls).toEqual([]); // 20's reach holds 20 and 21: 21 is still off
    s.consume(hit(21)); // 21 reaches all three, and all three are on
    expect(calls).toEqual([1, 2]);
  });
});
