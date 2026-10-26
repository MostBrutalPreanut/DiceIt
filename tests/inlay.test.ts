import { describe, expect, it } from 'vitest';
import { describe as describePart, gemFits, LEAF_CAP, makePart, PARTS, RUBY_X, SEAL_DARK, SHOP_IDS, type PartId, type PartInstance } from '../src/data/parts';
import { Game, rollOffers } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import { Rng } from '../src/sim/rng';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const GEMS: PartId[] = ['ruby', 'garnet', 'opal', 'goldleaf', 'redseal', 'emerald'];
const set = (id: PartId, uid: number, gem: PartId): PartInstance => ({ ...makePart(id, uid, 12, 30, true), inlay: gem });
const scorer = (parts: PartInstance[]) => {
  const s = new Scorer(1e9, () => parts);
  s.resetRound();
  return s;
};

/** A workshop in round 7 with one Pop Bumper on the table (uid 50) and money to spend. */
function workshop(): { g: Game; pop: PartInstance } {
  const g = new Game();
  g.round = 7;
  g.money = 40;
  const pop = makePart('pop', 50, 12, 28, true);
  g.layout.parts.push(pop);
  g.toWorkshop();
  return { g, pop };
}

describe('gems (inlays)', () => {
  it('each gem fits only the parts it can do something for', () => {
    for (const gem of ['ruby', 'goldleaf', 'redseal'] as const) {
      expect(gemFits(gem, 'pop')).toBe(true);
      for (const no of ['flipper', 'saver', 'kickback', 'deflector', 'strip', 'plate', 'mega', 'ruby', 'xlane'] as const) expect(gemFits(gem, no), `${gem} ${no}`).toBe(false);
    }
    expect(['disco', 'fame'].every((id) => gemFits('emerald', id as PartId))).toBe(true);
    expect(gemFits('emerald', 'pop')).toBe(false);
    expect(['xlane', 'goal', 'laser', 'keg', 'sparkler', 'rocks', 'split', 'kickback', 'tesla'].every((id) => gemFits('garnet', id as PartId))).toBe(true);
    expect(gemFits('garnet', 'pop')).toBe(false);
    expect(['pop', 'duck', 'trophy', 'bonsai'].every((id) => gemFits('opal', id as PartId))).toBe(true);
    expect(gemFits('opal', 'coin')).toBe(false);
  });

  it('the shop sells gems from round 7 only', () => {
    const seen = (round: number) => {
      const r = new Set<string>();
      for (let s = 1; s < 500; s++) for (const id of rollOffers(new Rng(s), 5, round)) r.add(id);
      return r;
    };
    for (const gem of GEMS) expect(SHOP_IDS).toContain(gem);
    expect(GEMS.some((g) => seen(6).has(g))).toBe(false);
    expect(GEMS.every((g) => seen(12).has(g))).toBe(true);
  });

  it('dropped from the shop onto a part it fits, a gem is bought and set in; anywhere else nothing happens', () => {
    const { g, pop } = workshop();
    g.shop.offers = ['ruby', 'emerald', null, null];
    expect(g.canDropAt('ruby', 12, 28)).toBe(true);
    expect(g.canDropAt('ruby', 20, 40)).toBe(false); // no part there
    expect(g.canDropAt('emerald', 12, 28)).toBe(false); // an Emerald does nothing for a Pop
    expect(g.buyAndPlace(1, 12, 28)).toBeNull();
    expect(g.money).toBe(40);
    const before = g.inventory.length;
    expect(g.buyAndPlace(0, 12.3, 28.2)?.uid).toBe(50);
    expect(pop.inlay).toBe('ruby');
    expect(g.money).toBe(40 - PARTS.ruby.cost);
    expect(g.inventory.length).toBe(before); // straight into the part, not the toolbox
  });

  it('a new gem sends the old one back to the toolbox; selling the part does too, or sells it if there is no room', () => {
    const { g, pop } = workshop();
    g.shop.offers = ['ruby', 'goldleaf', null, null];
    g.buyAndPlace(0, 12, 28);
    pop.leaf = 7;
    g.buyAndPlace(1, 12, 28);
    expect(pop.inlay).toBe('goldleaf');
    expect(pop.leaf).toBeUndefined();
    expect(g.inventory.map((p) => p.def)).toContain('ruby');
    // a gem from the toolbox goes in the same way (by place): the Gold Leaf comes back out
    const ruby = g.inventory.find((p) => p.def === 'ruby')!;
    expect(g.place(ruby.uid, 12, 28)).toBe(true);
    expect(pop.inlay).toBe('ruby');
    expect(g.lastInlaid).toBe(50);
    expect(g.inventory.map((p) => p.def)).toEqual(['goldleaf']);
    // sell the Pop: its Ruby comes back
    g.sell(50);
    expect(g.inventory.map((p) => p.def).sort()).toEqual(['goldleaf', 'ruby']);
    // with a full toolbox, the gem of a sold part is sold too
    const h = workshop();
    h.pop.inlay = 'opal';
    for (let i = 0; i < h.g.toolboxSlots; i++) h.g.layout.parts.push(makePart('sling', 100 + i));
    const money = h.g.money;
    h.g.sell(50);
    expect(h.g.inventory.some((p) => p.def === 'opal')).toBe(false);
    expect(h.g.money).toBe(money + h.g.removeValue({ ...h.pop, loose: false }) + h.g.sellValue(PARTS.opal));
  });

  it('a gem never goes on the table by itself', () => {
    const { g } = workshop();
    g.sandbox = true;
    const gem = g.grant('garnet')!;
    expect(g.place(gem.uid, 20, 40)).toBe(false);
    expect(g.part(gem.uid)?.placed).toBe(false);
  });
});

describe('what each gem does', () => {
  it(`Ruby: its part pays ×${RUBY_X}`, () => {
    const s = scorer([set('pop', 1, 'ruby')]);
    const e = s.consume(hit(1))[0];
    expect(e.base).toBe(Math.round(PARTS.pop.recipe.points! * RUBY_X));
    expect(e.notes).toContain(`x${RUBY_X} ruby`);
    expect(s.label(set('pop', 1, 'ruby'))).toBe(String(Math.round((PARTS.pop.recipe.points! + 1) * RUBY_X)));
  });

  it('Gold Leaf: +2 every time its part scores, for the run (a test ball only in its own scorer), up to 5× its points', () => {
    const { g, pop } = workshop();
    pop.inlay = 'goldleaf';
    const test = g.scorer;
    test.resetRound();
    test.consume(hit(50));
    expect(test.leafOf(pop)).toBe(2);
    expect(pop.leaf).toBeUndefined();
    g.startRound();
    const a = g.scorer.consume(hit(50))[0];
    g.scorer.consume(hit(50));
    expect(pop.leaf).toBe(4);
    const b = g.scorer.consume(hit(50))[0];
    expect(b.notes).toContain('+4 gold leaf');
    expect(b.base - a.base).toBe(4 + 2 * PARTS.pop.recipe.grow!); // +4 leaf, and the Pops have grown twice
    pop.leaf = LEAF_CAP * PARTS.pop.recipe.points! - 1;
    g.scorer.consume(hit(50));
    g.scorer.consume(hit(50));
    expect(pop.leaf).toBe(LEAF_CAP * PARTS.pop.recipe.points!);
  });

  it('Opal: every hit on its part counts twice for growth; a Trophy Cup polishes twice as fast', () => {
    const s = scorer([set('pop', 1, 'opal')]);
    s.consume(hit(1));
    expect(s.hitsOf('pop')).toBe(2);
    const { g } = workshop();
    const cup = { ...makePart('trophy', 60, 6, 40, true), inlay: 'opal' as PartId };
    g.layout.parts.push(cup);
    g.startRound();
    g.scorer.consume(hit(60));
    expect(cup.polish).toBeCloseTo(PARTS.trophy.recipe.keep!.per * 2);
  });

  it('Emerald: a once-a-ball part fires twice a ball', () => {
    const s = scorer([set('disco', 1, 'emerald')]);
    expect(s.consume(hit(1))).toHaveLength(1);
    expect(s.consume(hit(1, { t: 1 }))).toHaveLength(1);
    expect(s.consume(hit(1, { t: 2 }))).toEqual([]);
    const plain = scorer([makePart('disco', 1, 12, 30, true)]);
    plain.consume(hit(1));
    expect(plain.consume(hit(1, { t: 1 }))).toEqual([]);
  });

  it('Garnet: dark and recharge times are halved', () => {
    const s = scorer([set('xlane', 1, 'garnet'), set('laser', 2, 'garnet')]);
    s.consume(hit(1));
    expect(s.coolingDown(1, PARTS.xlane.recipe.cooldown! / 2 - 0.01)).toBe(true);
    expect(s.coolingDown(1, PARTS.xlane.recipe.cooldown! / 2)).toBe(false);
    s.consume(hit(2));
    expect(s.coolingDown(2, PARTS.laser.recipe.beam!.cooldown / 2)).toBe(false);
  });

  it(`Red Seal: every hit scores twice, then the part is dark for ${SEAL_DARK} s`, () => {
    const s = scorer([set('pop', 1, 'redseal')]);
    const out = s.consume(hit(1));
    expect(out).toHaveLength(2);
    expect(s.hitsOf('pop')).toBe(2);
    expect(s.consume(hit(1, { t: SEAL_DARK - 0.01 }))).toEqual([]);
    expect(s.consume(hit(1, { t: SEAL_DARK }))).toHaveLength(2);
  });

  it("a part's card says which gem is set in it", () => {
    const text = describePart(PARTS.pop, { ...set('pop', 1, 'goldleaf'), leaf: 4 }).map((l) => l.text).join(' ');
    expect(text).toContain('Set with a Gold Leaf: every time it scores, it is worth +2 more');
    expect(text).toContain('(+4 so far)');
    expect(describePart(PARTS.ruby).map((l) => l.text).join(' ')).toContain('drop it on a part on your table');
  });
});
