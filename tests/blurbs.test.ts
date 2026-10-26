import { describe, expect, it } from 'vitest';
import { GARNET_X, PARTS, type PartId } from '../src/data/parts';
import { BIG_BOIS } from '../src/data/bigboi';

/**
 * The blurb is the first thing a player reads in the shop, so it says plainly what the part does. A blurb is plain
 * text, not built from the recipe, so the ones that name a number are checked against the numbers they name.
 */
describe('part blurbs', () => {
  it('every part and Big Boi has a short blurb', () => {
    for (const id of Object.keys(PARTS) as PartId[]) {
      const b = PARTS[id].blurb;
      expect(b.length, id).toBeGreaterThan(10);
      expect(b.length, id).toBeLessThanOrEqual(70);
    }
    for (const b of Object.values(BIG_BOIS)) expect(b.blurb.length, b.id).toBeLessThanOrEqual(70);
  });

  it('the numbers a blurb names are the numbers in its recipe', () => {
    const r = (id: PartId) => PARTS[id].recipe;
    const says = (id: PartId, word: string) => expect(PARTS[id].blurb, id).toContain(word);
    says('gumball', 'three'); expect(r('gumball').lock!.n).toBe(3);
    says('gong', 'eighth'); expect(r('gong').boom!.every).toBe(8);
    says('capsule', 'six'); expect(r('capsule').capsule!.rounds).toBe(6);
    says('bell', 'three'); expect(r('bell').bell!.notches).toBe(3);
    says('roller', 'triple'); expect(r('roller').edgeShot!.x).toBe(3);
    says('wreck', 'double'); expect(r('wreck').wreck!.x).toBe(2);
    says('clock', 'double'); expect(r('clock').clock!.x).toBe(2);
    says('hutch', 'Two'); expect(r('hutch').gremlins).toBe(2);
    says('split', 'two'); expect(r('split').split!.n).toBe(2);
    says('tray', '$1'); expect(r('tray').cab!.pay).toBe(1);
    says('lane', 'three'); expect(r('lane').setSize).toBe(3);
    says('rank', 'three'); expect(r('rank').setSize).toBe(3);
    says('uplight', 'both'); expect(PARTS.uplight.pack).toBe(2);
    says('garnet', 'twice as fast'); expect(GARNET_X).toBe(0.5);
  });
});
