import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, PARTS, sellPrice } from '../src/data/parts';
import { Game, HEAT_W } from '../src/game/game';
import { NO_INPUT } from '../src/sim/sim';

const lab = () => {
  const g = new Game();
  g.sandbox = true;
  return g;
};

describe('undo and redo', () => {
  it('undoes a purchase including the money, and redoes it', () => {
    const g = new Game();
    const slot = g.shop.offers.findIndex((id) => id && PARTS[id].cost <= g.money);
    const before = g.money;
    const part = g.buy(slot)!;
    expect(g.money).toBeLessThan(before);
    expect(g.undo()).toBe(true);
    expect(g.money).toBe(before);
    expect(g.inventory).toHaveLength(0);
    expect(g.shop.offers[slot]).not.toBeNull();
    expect(g.redo()).toBe(true);
    expect(g.inventory.map((p) => p.uid)).toEqual([part.uid]);
    expect(g.redo()).toBe(false);
  });

  it('undoes a sale, a move, a store and a dial change in order', () => {
    const g = new Game();
    g.sell(1);
    g.checkpoint();
    g.place(2, 12, 30);
    g.store(3);
    expect(g.placed.map((p) => p.uid)).toEqual([2, 4]); // 4 is the fixed Big Boi
    g.undo(); // the store
    expect(g.placed.map((p) => p.uid).sort()).toEqual([2, 3, 4]);
    g.undo(); // the move
    expect(g.part(2)!.x).toBe(11);
    g.undo(); // the sale
    expect(g.part(1)).toBeDefined();
    expect(g.money).toBe(6);
  });

  it('a new change throws away the redo stack, and nothing can be undone mid-round', () => {
    const g = new Game();
    g.store(1);
    g.undo();
    g.store(2);
    expect(g.canRedo).toBe(false);
    g.startRound();
    expect(g.canUndo).toBe(false);
    expect(g.undo()).toBe(false);
  });

  it('survives undoing back to a layout the sim has to rebuild', () => {
    const g = new Game();
    g.store(1);
    g.store(2);
    g.undo();
    g.undo();
    for (let i = 0; i < 240; i++) g.step(NO_INPUT);
    expect(g.placed).toHaveLength(4);
  });
});

describe('layout slots', () => {
  it('re-arranges the parts you own the way a saved layout had them', () => {
    const g = new Game();
    const saved = g.arrangement();
    g.place(1, 5, 25);
    g.place(2, 18, 22);
    g.rotate(1, 1);
    const r = g.applyArrangement(saved);
    expect(r).toEqual({ placed: 3, missing: 0 });
    expect(g.placed.filter((p) => !p.fixed).map((p) => [p.x, p.y]).sort()).toEqual(saved.parts.map((p) => [p.x, p.y]).sort());
    g.undo(); // loading a layout is undoable
    expect(g.part(1)!.x).toBe(5);
  });

  it('skips parts you do not own, and the lab creates them', () => {
    const g = new Game();
    g.layout.parts.push(...[]);
    const lg = lab();
    const coin = lg.grant('coin')!;
    lg.place(coin.uid, 12, 30);
    const saved = lg.arrangement();
    expect(saved.parts).toHaveLength(4);
    const poor = new Game();
    expect(poor.applyArrangement(saved)).toEqual({ placed: 3, missing: 1 });
    const rich = lab();
    expect(rich.applyArrangement(saved)).toEqual({ placed: 4, missing: 0 });
  });
});

describe('heatmap', () => {
  it('records where the balls go, and clears when the machine changes', () => {
    const g = new Game();
    g.labBalls(0);
    g.sim.addBall(12, 40, 0, -10);
    for (let i = 0; i < 240; i++) g.step(NO_INPUT);
    const total = g.heat.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.3);
    // the ball fell down roughly column 12
    const column = Array.from({ length: 52 }, (_, y) => g.heat[y * HEAT_W + 12]).reduce((a, b) => a + b, 0);
    expect(column).toBeGreaterThan(0);
    g.store(1);
    expect(g.heat.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('the test lab', () => {
  it('grants any part for free, only in the lab', () => {
    const g = new Game();
    expect(g.grant('printer')).toBeNull();
    const l = lab();
    const money = l.money;
    expect(l.grant('printer')).not.toBeNull();
    expect(l.money).toBe(money);
    expect(l.inventory).toHaveLength(1);
  });

  it('rains test balls, clears the board and levels everything', () => {
    const l = lab();
    l.labBalls(8);
    expect(l.sim.ballCount).toBe(8);
    l.clearBoard();
    expect(l.placed.map((p) => p.def)).toEqual(['mega']); // the fixed Big Boi stays
    expect(l.inventory).toHaveLength(3);
    l.levelAll(2);
    expect(l.levels.pop).toBe(2);
    l.levelAll(10);
    expect(l.levels.pop).toBe(MAX_LEVEL);
    l.levelAll(-10);
    expect(l.levels.pop).toBe(0);
  });

  it('selling in the lab refunds nothing, selling for real refunds half', () => {
    const l = lab();
    expect(l.sell(1)).toBe(0);
    const g = new Game();
    expect(g.sell(1)).toBe(sellPrice(PARTS.pop));
  });
});
