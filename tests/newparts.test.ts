import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, PART_IDS, PARTS, RARITIES, rarityChance, SHOP_IDS, type PartId } from '../src/data/parts';
import { BIG_BOIS, DRAGON, defOn } from '../src/data/bigboi';
import { Game, rollOffers } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import { Rng } from '../src/sim/rng';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';
import type { Layout } from '../src/sim/layout';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const layoutOf = (...parts: ReturnType<typeof makePart>[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const scorer = (parts: ReturnType<typeof makePart>[], opts = {}) => {
  const s = new Scorer(1e9, () => parts, opts);
  s.resetRound();
  return s;
};

describe('rarities', () => {
  it('every part has a rarity, the rarer ones cost more and are bigger', () => {
    const order = { common: 0, uncommon: 1, rare: 2, legendary: 3 } as const;
    const avg = (r: keyof typeof order, f: (id: PartId) => number) => {
      const ids = SHOP_IDS.filter((id) => PARTS[id].rarity === r);
      return ids.reduce((a, id) => a + f(id), 0) / ids.length;
    };
    for (const r of ['common', 'uncommon', 'rare', 'legendary'] as const) expect(SHOP_IDS.some((id) => PARTS[id].rarity === r), r).toBe(true);
    expect(avg('legendary', (id) => PARTS[id].cost)).toBeGreaterThan(avg('rare', (id) => PARTS[id].cost));
    expect(avg('rare', (id) => PARTS[id].cost)).toBeGreaterThan(avg('common', (id) => PARTS[id].cost));
  });

  it('the shop rolls rarity as a cascade whose luck climbs every round, and commons never fall under a third', () => {
    for (let round = 1; round <= 20; round++) {
      expect(RARITIES.reduce((a, r) => a + rarityChance(r, round), 0)).toBeCloseTo(1);
      expect(rarityChance('common', round), `round ${round}`).toBeGreaterThanOrEqual(0.35);
      // the chance of an offer at least this rare grows every round (the uncommons' own share levels off as rares take over)
      const atLeast = (r: number, round: number) => RARITIES.slice(r).reduce((a, x) => a + rarityChance(x, round), 0);
      if (round > 1) for (let r = 1; r < RARITIES.length; r++) expect(atLeast(r, round), `${RARITIES[r]} ${round}`).toBeGreaterThanOrEqual(atLeast(r, round - 1));
    }
    expect(rarityChance('common', 1)).toBeGreaterThan(0.85);
    expect(rarityChance('rare', 1)).toBeGreaterThan(0);
    expect(rarityChance('legendary', 15)).toBeGreaterThan(rarityChance('legendary', 8));
  });

  it('the shop shows no legendary before the first boss is beaten, and mostly commons early on', () => {
    const count = (round: number) => {
      const c = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
      for (let s = 1; s < 2000; s++) for (const id of rollOffers(new Rng(s), 4, round)) c[PARTS[id].rarity]++;
      return c;
    };
    for (const round of [1, 2, 3]) expect(count(round).legendary).toBe(0);
    const early = count(1);
    expect(early.common / 7996).toBeGreaterThan(0.8);
    expect(early.uncommon > 0 && early.rare > 0).toBe(true);
    expect(count(5).legendary).toBeGreaterThan(0);
    const late = count(15);
    expect(late.common / 7996).toBeGreaterThan(0.3);
    expect(late.legendary / 7996).toBeCloseTo(rarityChance('legendary', 15), 1);
  });

  it('Big Boi is never for sale: the shop never offers him and the lab cannot grant one', () => {
    expect(SHOP_IDS).not.toContain('mega');
    for (let s = 1; s < 300; s++) for (const round of [1, 5, 12]) expect(rollOffers(new Rng(s), 6, round)).not.toContain('mega');
    const g = new Game();
    g.sandbox = true;
    expect(g.grant('mega')).toBeNull();
  });

  it('every scoring part does at least two things (points plus a second effect, said on its card)', () => {
    for (const id of PART_IDS) {
      // (the Spinner, the Lamp and the Glow Strip say both of their things in one sentence)
      if (id === 'mega' || id === 'spinner' || id === 'lamp' || id === 'strip' || id === 'plate' || PARTS[id].kind === 'flipper') continue;
      const lines = describePart(PARTS[id], makePart(id, 1));
      expect(lines.length, id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('shop locks', () => {
  it('a locked offer stays in its slot for the next round, the rest are new', () => {
    const g = new Game();
    const id = g.shop.offers[2]!;
    expect(g.toggleLock(2)).toBe(true);
    g.round = 1;
    g.continueAfterRound();
    expect(g.shop.offers[2]).toBe(id);
    expect(g.isLocked(2)).toBe(true);
    expect(new Set(g.shop.offers).size).toBe(g.shop.offers.length); // no duplicate of the locked one
  });

  it('only one lock (Layaway adds two more), it survives rerolls, and buying it frees the lock', () => {
    const g = new Game();
    g.money = 50;
    expect(g.toggleLock(0)).toBe(true);
    expect(g.toggleLock(1)).toBe(false);
    const id = g.shop.offers[0];
    expect(g.reroll()).toBe(true);
    expect(g.shop.offers[0]).toBe(id);
    expect(g.buy(0)).not.toBeNull();
    expect(g.isLocked(0)).toBe(false);
    expect(g.toggleLock(1)).toBe(true);
    expect(g.toggleLock(1)).toBe(true); // unlock
    expect(g.isLocked(1)).toBe(false);
  });
});

describe('the new parts', () => {
  it('a Slingshot makes the ball hot: its next hit within the window pays +50%, once', () => {
    const parts = [makePart('sling', 1, 6, 30, true), makePart('coin', 2, 12, 30, true)];
    const s = scorer(parts);
    s.consume(hit(1, { t: 0 }));
    const hot = s.consume(hit(2, { t: 0.5 }))[0];
    expect(hot.base).toBe(12);
    expect(hot.hot).toBe(true);
    expect(s.consume(hit(2, { t: 0.6 }))[0].base).toBe(8); // used up
    s.consume(hit(1, { t: 1 }));
    expect(s.consume(hit(2, { t: 3 }))[0].base).toBe(8); // too late
  });

  it('a Deflector bank shot adds +25% to the next hit, and scores nothing itself', () => {
    const parts = [makePart('deflector', 1, 6, 30, true), makePart('coin', 2, 12, 30, true)];
    const s = scorer(parts);
    expect(s.consume(hit(1))).toEqual([]);
    expect(s.consume(hit(2))[0].base).toBe(10);
  });

  it('only a smash on a Vari-Target makes the ball hot', () => {
    const parts = [makePart('vari', 1, 6, 30, true), makePart('coin', 2, 12, 30, true)];
    const s = scorer(parts);
    s.consume(hit(1, { speed: 20 }));
    expect(s.consume(hit(2))[0].base).toBe(8);
    s.consume(hit(1, { speed: 60 }));
    expect(s.consume(hit(2))[0].base).toBe(12);
  });

  it('a Spinner raises the Mult per spin, up to +1.5 a ball', () => {
    const s = scorer([makePart('spinner', 1, 6, 30, true)]);
    s.consume(hit(1, { spins: 10 }));
    expect(s.mult).toBeCloseTo(1.1);
    for (let i = 0; i < 20; i++) s.consume(hit(1, { spins: 10 }));
    expect(s.mult).toBeCloseTo(2.5);
  });

  it('a Ding-Dong Bell pays more for every different part type the ball has hit', () => {
    const parts = [makePart('ding', 1, 6, 30, true), makePart('pop', 2, 12, 30, true), makePart('coin', 3, 18, 30, true)];
    const s = scorer(parts);
    expect(s.consume(hit(1))[0].base).toBe(12);
    s.consume(hit(2));
    s.consume(hit(3));
    expect(s.consume(hit(1))[0].base).toBe(12 + 3 * 8); // ding, pop and coin
  });

  it('a Thunder Bumper feeds the Pops: each hit counts as three Pop hits for their growth', () => {
    const parts = [makePart('thunder', 1, 6, 30, true), makePart('pop', 2, 14, 30, true)];
    const s = scorer(parts);
    expect(s.consume(hit(1))[0].base).toBe(60);
    expect(s.consume(hit(2))[0].base).toBe(23);
  });

  it('a Piggy Bank stores $1 a hit and a smash breaks it for what it holds +$1', () => {
    const s = scorer([makePart('piggy', 1, 6, 30, true)]);
    for (let i = 0; i < 4; i++) expect(s.consume(hit(1, { speed: 10 }))[0].money).toBe(0);
    expect(s.piggies.get(1)).toBe(4);
    const smash = s.consume(hit(1, { speed: 40 }))[0];
    expect(smash.money).toBe(5);
    expect(s.piggies.get(1)).toBe(0);
    for (let i = 0; i < 10; i++) s.consume(hit(1, { speed: 10 }));
    expect(s.piggies.get(1)).toBe(5); // it holds five
  });

  it('a Jackpot Scoop pays the pot: +8 for every scoring hit this ball, then it starts again', () => {
    const parts = [makePart('jackpot', 1, 6, 30, true), makePart('coin', 2, 12, 30, true)];
    const s = scorer(parts);
    for (let i = 0; i < 10; i++) s.consume(hit(2));
    const jp = s.consume(hit(1, { caught: true }))[0];
    expect(jp.base).toBe(40 + 80);
    expect(jp.label).toBe('JACKPOT!');
    expect(s.consume(hit(1, { caught: true }))[0].base).toBe(40);
  });

  it('an X Lane multiplies the Mult by 1.25, goes dark for 3 s, lights a lane, and stops at x3 a ball', () => {
    const parts = [makePart('xlane', 1, 6, 30, true), makePart('lane', 2, 12, 30, true), makePart('lane', 3, 18, 30, true)];
    const s = scorer(parts);
    s.consume(hit(1, { t: 0 }));
    expect(s.mult).toBeCloseTo(1.25);
    expect(s.isLit(2)).toBe(true);
    s.consume(hit(1, { t: 1 }));
    expect(s.mult).toBeCloseTo(1.25); // still dark
    const alone = scorer([makePart('xlane', 1, 6, 30, true)]);
    for (let i = 0; i < 10; i++) alone.consume(hit(1, { t: i * 4 }));
    expect(alone.mult).toBeCloseTo(3);
  });

  it('a Golden Bumper multiplies the Mult and pays $1 every fifth hit', () => {
    const s = scorer([makePart('golden', 1, 6, 30, true)]);
    const ev = Array.from({ length: 10 }, () => s.consume(hit(1))[0]);
    expect(ev.map((e) => e.money)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(s.mult).toBeCloseTo(1.05 ** 10, 1);
  });

  it('a Disco Ball multiplies the Mult by 2.5 and lights every Lamp, once a ball', () => {
    const parts = [makePart('disco', 1, 6, 30, true), makePart('lamp', 2, 12, 30, true)];
    const s = scorer(parts);
    const e = s.consume(hit(1))[0];
    expect(e.base).toBe(200);
    expect(s.mult).toBeCloseTo(2.5);
    expect(s.isLit(2)).toBe(true);
    expect(s.consume(hit(1))).toEqual([]);
    s.startBall();
    expect(s.consume(hit(1))[0].base).toBe(200);
  });

  it('a full drop-target bank lights every Lamp', () => {
    const parts = [makePart('bank', 1, 6, 30, true), makePart('lamp', 2, 14, 30, true)];
    const s = scorer(parts);
    s.consume(hit(1, { bankComplete: true }));
    expect(s.isLit(2)).toBe(true);
  });

  it('a Mag-Grab catches a passing ball, holds it, throws it, and prints nothing', () => {
    const sim = createSim(layoutOf(makePart('magnet', 1, 12, 30, true)));
    sim.addBall(12, 33.5, 0, -15);
    let caught = 0, released = 0, extra = 0;
    for (let i = 0; i < 240 * 2; i++) for (const e of sim.step(NO_INPUT)) {
      if (e.type === 'partHit' && e.caught) caught++;
      if (e.type === 'partRelease') released++;
      if (e.type === 'extraBall') extra++;
    }
    expect(caught).toBeGreaterThanOrEqual(1);
    expect(released).toBeGreaterThanOrEqual(1);
    expect(extra).toBe(0);
  });
});

describe('Big Boi depends on the machine', () => {
  const table = () => [makePart('mega', 10, 12, 36, true), makePart('pop', 1, 6, 30, true), makePart('pop', 2, 18, 30, true)];

  it('each machine has its own Big Boi, and his card says what he does', () => {
    expect(new Set(Object.values(BIG_BOIS).map((b) => b.machine)).size).toBe(3);
    for (const m of ['factory', 'diner', 'castle'] as const) {
      const text = describePart(defOn('mega', m), makePart('mega', 1), { machine: m }).map((l) => l.text).join(' ');
      expect(text.length).toBeGreaterThan(40);
    }
  });

  it('the Foreman raises the Mult', () => {
    const s = scorer(table(), { machine: 'factory' });
    s.consume(hit(10));
    expect(s.mult).toBeCloseTo(1.15);
  });

  it('the Cook calls an order when he is hit: one part lights up, its next hit pays ×4, then it goes dark', () => {
    const s = scorer(table(), { machine: 'diner', seed: 3 });
    expect(s.order).toBeNull(); // no order until he is hit
    expect(s.consume(hit(10))[0].base).toBe(40);
    const lit = s.order!;
    expect([1, 2]).toContain(lit);
    const other = lit === 1 ? 2 : 1;
    expect(s.consume(hit(other))[0].base).toBe(20); // the other Pop is not the order
    expect(s.consume(hit(lit))[0].base).toBe(84); // (20 + 1 grown) x4
    expect(s.order).toBeNull();
    expect(s.consume(hit(lit))[0].base).toBe(22); // once only
    expect(s.mult).toBe(1); // no Mult from orders
  });

  it('the Dragon loses a plate a hit; when the last goes he pays 2,000, and the armour grows back one plate thicker', () => {
    const s = scorer(table(), { machine: 'castle' });
    const events: ReturnType<typeof s.consume> = [];
    for (let i = 0; i < DRAGON.armour; i++) events.push(...s.consume(hit(10)));
    const broke = events.find((e) => e.label === 'ARMOUR BROKEN!')!;
    expect(broke.base).toBe(400);
    expect(s.mult).toBe(1);
    expect(s.armour).toBe(DRAGON.armour + 1);
    for (let i = 0; i < 30; i++) s.consume(hit(10)); // no limit a ball
    expect(s.slays).toBeGreaterThanOrEqual(4);
  });

  it('a run remembers its machine through a save, and a new run can pick another', () => {
    const g = new Game();
    g.newRun('castle');
    expect(g.scorer.bigBoi).toBe('dragon');
    const copy = new Game();
    copy.load(JSON.parse(JSON.stringify(g.save())));
    expect(copy.machine).toBe('castle');
    copy.newRun('diner');
    expect(copy.machine).toBe('diner');
  });
});
