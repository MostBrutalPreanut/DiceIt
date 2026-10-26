import { describe, expect, it } from 'vitest';
import { makePart, PARTS, type PartId, type PartInstance } from '../src/data/parts';
import { Game } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const at = (id: PartId, uid: number, x: number, y: number, more: Partial<PartInstance> = {}): PartInstance => ({ ...makePart(id, uid, x, y, true), ...more });
const scorer = (parts: PartInstance[]) => {
  const s = new Scorer(1e9, () => parts);
  s.resetRound();
  return s;
};
const base = (s: Scorer, uid: number, extra = {}) => s.consume(hit(uid, extra))[0].base;

describe('Grape Bunch', () => {
  it('pays once more for every bunch touching it; four or more in a cluster are golden and pay double', () => {
    const g = PARTS.grape.recipe.points!;
    expect(base(scorer([at('grape', 1, 10, 30)]), 1)).toBe(g);
    expect(base(scorer([at('grape', 1, 10, 30), at('grape', 2, 12.6, 30), at('grape', 3, 7.4, 30)]), 1)).toBe(g * 3);
    // a chain of four: the end one touches one, but the bunch is golden
    const four = [0, 1, 2, 3].map((i) => at('grape', i + 1, 6 + i * 2.6, 30));
    expect(base(scorer(four), 1)).toBe(g * 2 * 2);
    expect(scorer(four).grapeBunch(four[0])).toEqual({ touching: 1, golden: true });
    expect(base(scorer([at('grape', 1, 10, 30), at('grape', 2, 16, 30)]), 1)).toBe(g); // too far apart
  });

  it('a pack set down on the table lands snug, the pieces touching', () => {
    const g = new Game();
    g.sandbox = true;
    g.toWorkshop();
    g.shop.offers = ['grape', null, null, null];
    g.money = 50;
    g.sandbox = false;
    g.buyAndPlace(0, 12, 30);
    const grapes = g.placed.filter((p) => p.def === 'grape');
    expect(grapes).toHaveLength(3);
    expect(g.scorer.grapeX(grapes[0])).toBeGreaterThan(1);
  });
});

describe('Echo Cave', () => {
  it('×2 for every other cave the ball went through in a row; another part breaks the chain; zaps and sparks do neither', () => {
    const s = scorer([at('echo', 1, 6, 30), at('echo', 2, 12, 30), at('echo', 3, 18, 30), at('echo', 4, 18, 40), at('pop', 5, 12, 20)]);
    const e = PARTS.echo.recipe.points!;
    expect(base(s, 1)).toBe(e);
    expect(base(s, 2)).toBe(e * 2);
    base(s, 5, { zap: true });
    expect(base(s, 3)).toBe(e * 4);
    expect(base(s, 4)).toBe(e * PARTS.echo.recipe.echo!.cap);
    base(s, 5);
    expect(base(s, 1)).toBe(e);
    expect(s.consume(hit(1, { ballId: 2 }))[0].base).toBe(e); // every ball has its own chain
  });
});

describe('Spotlight', () => {
  it('parts within reach pay ×1.5 while it is lit; a hit of the ball knocks it dark for 10 s', () => {
    const s = scorer([at('spot', 1, 12, 30), at('pop', 2, 14, 30), at('pop', 3, 20, 30)]);
    const p = PARTS.pop.recipe.points!, g = PARTS.pop.recipe.grow!;
    expect(base(s, 2)).toBe(Math.round(p * 1.5));
    expect(base(s, 3)).toBe(p + g); // out of reach (and the Pops have grown)
    expect(s.consume(hit(1, { zap: true }))).toEqual([]); // a zap does not knock it
    expect(s.consume(hit(1, { t: 1 }))[0].label).toBe('LIGHTS OUT');
    expect(base(s, 2, { t: 2 })).toBe(p + 2 * g);
    expect(base(s, 2, { t: 11.1 })).toBe(Math.round((p + 3 * g) * 1.5));
  });
});

describe('Bonsai Bumper and Time Capsule', () => {
  it('a Bonsai pays +4 for every round it stayed put; moving it starts again', () => {
    const g = new Game();
    const b = at('bonsai', 80, 12, 24);
    g.layout.parts.push(b);
    for (let i = 0; i < 3; i++) { g.toWorkshop(); g.continueAfterRound(); }
    expect(b.age).toBe(3);
    g.startRound();
    expect(g.scorer.consume(hit(80))[0].base).toBe(PARTS.bonsai.recipe.points! + 3 * PARTS.bonsai.recipe.bonsai!);
    g.toWorkshop();
    g.money = 50;
    g.place(80, 12, 26);
    expect(b.age).toBeUndefined();
  });

  it('a Time Capsule dug up after 6 rounds pays a free pick of legendary parts; earlier, nothing', () => {
    const g = new Game();
    const c = at('capsule', 81, 12, 24);
    g.layout.parts.push(c);
    for (let i = 0; i < 5; i++) g.continueAfterRound();
    g.money = 50;
    g.sell(81);
    expect(g.shop.prize ?? null).toBeNull();
    const h = new Game();
    const d = at('capsule', 81, 12, 24);
    h.layout.parts.push(d);
    for (let i = 0; i < 6; i++) h.continueAfterRound();
    const money = h.money;
    expect(h.removeValue(d)).toBe(0);
    h.sell(81);
    expect(h.money).toBe(money);
    expect(h.shop.prize).toHaveLength(3);
    expect(h.shop.prize!.every((id) => PARTS[id].rarity === 'legendary')).toBe(true);
    expect(h.shop.prizeFrom).toBe('capsule'); // its pop-up says Time Capsule, not Piñata
  });
});

describe('Ice Sculpture', () => {
  it('pays 250, melts 3 points every flipper press in a round, and at zero is a puddle and gone', () => {
    const g = new Game();
    const ice = at('ice', 82, 12, 24, { ice: 7 });
    g.layout.parts.push(ice);
    g.startRound();
    expect(g.scorer.consume(hit(82))[0].base).toBe(7);
    const press = (on: boolean) => g.step({ left: on, right: false, plunge: false, nudge: 0 });
    let melted = false;
    for (let i = 0; i < 3; i++) { for (const s of press(true).score) if (s.label === 'PUDDLE!') melted = true; for (let k = 0; k < 6; k++) press(false); }
    expect(melted).toBe(true);
    expect(g.part(82)).toBeUndefined();
    expect(new Scorer(1e9, () => [at('ice', 1, 0, 0)]).baseNow(at('ice', 1, 0, 0))).toBe(PARTS.ice.recipe.points);
  });
});

describe('Wishing Well', () => {
  it('in the workshop, $1 at a time up to $5 a visit: each adds +3 to its hits and +0.02 Mult a hit', () => {
    const g = new Game();
    g.money = 20;
    const w = at('well', 83, 12, 24);
    g.layout.parts.push(w);
    g.toWorkshop();
    for (let i = 0; i < 5; i++) expect(g.wish(83)).toBe(true);
    expect(g.wish(83)).toBe(false);
    expect(g.money).toBe(15);
    expect(w.well).toBe(5);
    g.continueAfterRound();
    expect(g.wishesLeft(w)).toBe(5);
    g.startRound();
    const m = g.scorer.mult, e = g.scorer.consume(hit(83))[0];
    expect(e.base).toBe(PARTS.well.recipe.points! + 5 * 3);
    expect(e.multAfter - m).toBeCloseTo(5 * 0.02, 5);
  });
});
