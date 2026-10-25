import { describe, expect, it } from 'vitest';
import { Game, parseRun } from '../src/game/game';
import { BIG_BOI_AT, starterLayout } from '../src/sim/layout';

const boi = (g: Game) => g.layout.parts.find((p) => p.fixed)!;

describe('the fixed Big Boi', () => {
  it('every new run has one, in the middle', () => {
    const g = new Game();
    g.newRun();
    expect(boi(g)).toMatchObject({ def: 'mega', x: BIG_BOI_AT.x, y: BIG_BOI_AT.y, placed: true });
  });

  it('cannot be moved, stored, sold or rotated, but its dial can be tuned', () => {
    const g = new Game();
    const b = boi(g);
    expect(g.place(b.uid, 12, 26)).toBe(false);
    expect(g.store(b.uid)).toBeNull();
    expect(g.sell(b.uid)).toBeNull();
    expect(g.part(b.uid)?.placed).toBe(true);
    g.setDial(b.uid, 'kick', 3);
    expect(g.part(b.uid)!.dials.kick).toBe(3);
  });

  it('stays on the board through a cleared lab board and a loaded layout slot, and is not saved in slots', () => {
    const g = new Game();
    expect(g.arrangement().parts.some((p) => p.def === 'mega')).toBe(false);
    g.sandbox = true;
    g.clearBoard();
    expect(boi(g).placed).toBe(true);
    g.applyArrangement({ parts: [], gravity: 50 });
    expect(boi(g).placed).toBe(true);
  });

  it('an old save without one gets one where there is room', () => {
    const g = new Game();
    const save = g.save();
    save.layout = { ...starterLayout(), parts: starterLayout().parts.filter((p) => !p.fixed) };
    const again = new Game();
    again.load(parseRun(JSON.stringify(save))!);
    expect(again.layout.parts.filter((p) => p.fixed)).toHaveLength(1);
  });

  it('can be bought straight onto the board too: buying by dragging to the table', () => {
    const g = new Game();
    g.money = 20;
    g.shop.offers = ['coin', null, null, null];
    const p = g.buyAndPlace(0, 12, 26)!;
    expect(p.placed).toBe(true);
    expect(g.money).toBe(20 - g.priceOf('coin'));
    expect(g.shop.offers[0]).toBeNull();
    g.shop.offers = ['coin', null, null, null];
    expect(g.buyAndPlace(0, BIG_BOI_AT.x, BIG_BOI_AT.y)).toBeNull(); // no room there
  });
});
