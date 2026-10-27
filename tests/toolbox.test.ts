import { describe, expect, it } from 'vitest';
import { PARTS } from '../src/data/parts';
import { Game, parseRun, TOOLBOX_SLOTS, UPKEEP } from '../src/game/game';

/** A game with plenty of money and a shelf of cheap Pop Bumpers. */
function rich() {
  const g = new Game();
  g.money = 100;
  return g;
}
const fill = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) { g.shop.offers = ['pop', null, null, null]; expect(g.buy(0)).not.toBeNull(); }
};

describe('the toolbox holds four parts', () => {
  it('buying stops when the toolbox is full', () => {
    const g = rich();
    fill(g, TOOLBOX_SLOTS);
    expect(g.toolboxFull).toBe(true);
    g.shop.offers = ['pop', null, null, null];
    const money = g.money;
    expect(g.buy(0)).toBeNull();
    expect(g.money).toBe(money);
  });

  it('storing a part in a full toolbox sells it for its sell price', () => {
    const g = rich();
    fill(g, TOOLBOX_SLOTS);
    const onBoard = g.placed[0];
    g.round = 2; // past the free moves of the setup before round 1
    const money = g.money;
    expect(g.store(onBoard.uid)).toBe(g.sellValue(PARTS.pop));
    expect(g.money).toBe(money - UPKEEP.move + g.sellValue(PARTS.pop)); // moving it off the table costs, then it sells
    expect(g.part(onBoard.uid)).toBeUndefined();
    expect(g.inventory.length).toBe(TOOLBOX_SLOTS);
    expect(g.soldOverflow).toEqual([{ def: 'pop', refund: g.sellValue(PARTS.pop) }]);
    expect(g.undo()).toBe(true); // and it can be undone
    expect(g.part(onBoard.uid)?.placed).toBe(true);
  });

  it('with room, storing just stores', () => {
    const g = rich();
    const p = g.placed[0];
    expect(g.store(p.uid)).toBeNull();
    expect(g.part(p.uid)?.placed).toBe(false);
  });

  it('peeling a Big Toolbox sells what no longer fits, and says so', () => {
    const g = rich();
    g.pending = [{ id: 'bigToolbox' }];
    expect(g.chooseDecal(0)).toBe(true);
    fill(g, TOOLBOX_SLOTS + 2);
    expect(g.inventory.length).toBe(TOOLBOX_SLOTS + 2);
    const money = g.money;
    expect(g.peel(0)).toBe(true);
    expect(g.inventory.length).toBe(TOOLBOX_SLOTS);
    expect(g.money).toBeGreaterThan(money);
    expect(g.soldOverflow.length).toBe(2);
  });

  it('an old save with too much in the toolbox sells the extra on load', () => {
    const g = rich();
    g.sandbox = true; // the Test Lab has no limit
    for (let i = 0; i < 6; i++) g.grant('pop');
    expect(g.inventory.length).toBe(6);
    g.sandbox = false;
    const save = g.save();
    const again = new Game();
    again.load(parseRun(JSON.stringify(save))!);
    expect(again.inventory.length).toBe(TOOLBOX_SLOTS);
    expect(again.money).toBe(100 + 2 * again.sellValue(PARTS.pop));
  });
});
