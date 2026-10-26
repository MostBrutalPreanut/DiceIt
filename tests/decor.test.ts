import { describe, expect, it } from 'vitest';
import { describe as describePart, infernoReach, isDecor, makePart, PARTS, SHOP_IDS, swarmSparks, tempestRate, type PartId, type PartInstance } from '../src/data/parts';
import { Game, rollOffers } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import { DECOR_SLOT, onDecorSlot } from '../src/sim/cabinet';
import { canPlace, placedParts, settleDecor } from '../src/sim/layout';
import { Rng } from '../src/sim/rng';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const at = (id: PartId, uid: number, x: number, y: number): PartInstance => makePart(id, uid, x, y, true);
/** The decor screen at the head of the table (decor dropped anywhere over it lands in its middle). */
const CORNER = { x: DECOR_SLOT.x, y: DECOR_SLOT.y };
const scorer = (parts: PartInstance[]) => {
  const s = new Scorer(1e9, () => parts);
  s.resetRound();
  return s;
};

describe('decor: where it stands', () => {
  it('in the decor screen at the head of the table, over the dome, never among the parts or out on the cabinet', () => {
    expect(onDecorSlot(DECOR_SLOT.x, DECOR_SLOT.y)).toBe(true);
    expect(onDecorSlot(DECOR_SLOT.x - 6, DECOR_SLOT.y - 0.5)).toBe(true); // anywhere over the screen
    expect(onDecorSlot(12, 30)).toBe(false); // the playfield
    expect(onDecorSlot(3, 1.5)).toBe(false); // the apron
    expect(onDecorSlot(2, 51)).toBe(false); // the cabinet's corner
    expect(DECOR_SLOT.y - 1.2).toBeGreaterThanOrEqual(48); // clear of the build area
  });

  it('one piece at a time, and decor and table parts never get in each other\'s way', () => {
    const layout = { parts: [at('clock', 1, CORNER.x, CORNER.y)], gravity: 50, nextUid: 10 };
    expect(canPlace(layout, 'bulb', CORNER.x + 3, CORNER.y)).toBe(false); // the screen is taken
    expect(canPlace(layout, 'clock', CORNER.x + 3, CORNER.y, 1)).toBe(true); // the clock itself can move within it
    expect(canPlace({ ...layout, parts: [] }, 'bulb', CORNER.x + 3, CORNER.y)).toBe(true);
    expect(canPlace(layout, 'clock', 12, 30, 1)).toBe(false);
    expect(canPlace(layout, 'pop', CORNER.x, CORNER.y)).toBe(false);
    expect(canPlace(layout, 'pop', 12, 30)).toBe(true);
    expect(placedParts(layout)).toEqual([]); // decor is not on the table
  });

  it('a save from when decor stood all over the cabinet keeps one piece, in the screen, and stores the rest', () => {
    const layout = { parts: [at('clock', 1, 2, 51), at('bulb', 2, 3, 1.5), at('pop', 3, 12, 30)], gravity: 50, nextUid: 10 };
    expect(settleDecor(layout)).toBe(true);
    expect(layout.parts[0]).toMatchObject({ placed: true, x: DECOR_SLOT.x, y: DECOR_SLOT.y });
    expect(layout.parts[1].placed).toBe(false);
    expect(layout.parts[2]).toMatchObject({ placed: true, x: 12, y: 30 });
    expect(settleDecor(layout)).toBe(false);
  });

  it('dropped over the screen it snaps into the middle; a second piece is refused', () => {
    const g = new Game();
    g.round = 9; g.money = 50;
    g.toWorkshop();
    g.shop.offers = ['clock', 'bulb', null, null];
    const c = g.buyAndPlace(0, DECOR_SLOT.x + 4, DECOR_SLOT.y + 0.6)!;
    expect(c).toMatchObject({ placed: true, x: DECOR_SLOT.x, y: DECOR_SLOT.y });
    expect(g.canDropAt('bulb', DECOR_SLOT.x, DECOR_SLOT.y)).toBe(false);
    expect(g.buyAndPlace(1, DECOR_SLOT.x, DECOR_SLOT.y)).toBeNull();
    expect(g.store(c.uid)).toBeNull();
    expect(g.buyAndPlace(1, DECOR_SLOT.x, DECOR_SLOT.y)).not.toBeNull();
  });
});

describe('decor: in the shop', () => {
  it('is sold, and never twice: decor the run owns is not offered again', () => {
    for (const id of ['clock', 'altar', 'bulb', 'feet', 'tray', 'mirror'] as const) { expect(isDecor(id)).toBe(true); expect(SHOP_IDS).toContain(id); }
    const g = new Game();
    g.round = 9;
    g.layout.parts.push(makePart('clock', 90));
    for (let s = 0; s < 40; s++) { g.shop.locked = []; g.continueAfterRound(); g.round = 9; expect(g.shop.offers).not.toContain('clock'); }
    const seen = new Set<string>();
    for (let s = 1; s < 300; s++) for (const id of rollOffers(new Rng(s), 5, 9)) seen.add(id);
    expect(seen.has('clock')).toBe(true);
  });

  it('dropped from the shop into the decor screen it sits there, with no body in the sim', () => {
    const g = new Game();
    g.round = 9; g.money = 50;
    g.toWorkshop();
    g.shop.offers = ['clock', null, null, null];
    expect(g.canDropAt('clock', 12, 30)).toBe(false);
    const c = g.buyAndPlace(0, CORNER.x, CORNER.y)!;
    expect(c.placed).toBe(true);
    expect(g.placed.some((p) => p.uid === c.uid)).toBe(false);
    expect((g.sim as unknown as { parts: Map<number, unknown> }).parts.has(c.uid)).toBe(false);
  });
});

describe('cabinet upgrades', () => {
  const game = (id: PartId, placed = true) => {
    const g = new Game();
    g.round = 6;
    g.layout.parts.push({ ...makePart(id, 90, CORNER.x, CORNER.y, placed) });
    g.toWorkshop();
    return g;
  };
  it('Spare Bulb: Lamps glow wider and give more, only while it stands on the cabinet', () => {
    expect(game('bulb').mods.lampRadius).toBe(1);
    expect(game('bulb').mods.lampBonus).toBeCloseTo(0.02);
    expect(game('bulb', false).mods.lampRadius).toBe(0);
  });
  it('Rubber Feet: nudges shove harder', () => {
    expect(game('feet').mods.nudge).toBeCloseTo(1.15);
  });
  it('Coin Tray: a cleared round pays $1 more', () => {
    expect(game('tray').mods.cabinetPay).toBe(1);
  });
  it('Side Mirror: the shop shows one more part every second round', () => {
    const g = game('mirror');
    expect(g.mods.shopSlots).toBe(5); // round 6
    g.continueAfterRound(); // round 7
    expect(g.mods.shopSlots).toBe(4);
    g.continueAfterRound(); // round 8
    expect(g.shop.offers.length).toBe(5);
  });
  it('placing or storing one works at once, in the workshop', () => {
    const g = new Game();
    g.round = 6; g.money = 50; g.sandbox = true;
    g.toWorkshop();
    const b = g.grantAndPlace('bulb', CORNER.x, CORNER.y)!;
    expect(g.mods.lampRadius).toBe(1);
    expect(g.scorer.mods.lampRadius).toBe(1);
    g.store(b.uid);
    expect(g.mods.lampRadius).toBe(0);
  });
});

describe('Midnight Clock', () => {
  it('every scoring hit is a minute; at midnight every hit pays ×2 for 20 s, once a ball', () => {
    const clock = at('clock', 1, CORNER.x, CORNER.y), pop = at('pop', 2, 12, 30);
    const s = scorer([clock, pop]);
    const c = PARTS.clock.recipe.clock!;
    let t = 0;
    for (let i = 0; i < c.hits - 1; i++) expect(s.consume(hit(2, { t: (t += 0.01) })).some((e) => e.label === 'MIDNIGHT MADNESS!')).toBe(false);
    expect(s.clockState().minutes).toBe(c.hits - 1);
    const strike = s.consume(hit(2, { t: (t += 0.01) }));
    expect(strike.at(-1)!.label).toBe('MIDNIGHT MADNESS!');
    expect(s.clockState()).toEqual({ minutes: 0, struck: true });
    const mad = s.consume(hit(2, { t: t + 1 }))[0];
    expect(mad.notes).toContain(`x${c.x} midnight`);
    expect(s.consume(hit(2, { t: t + c.seconds + 0.1 }))[0].notes).not.toContain(`x${c.x} midnight`);
    // the hands do not move again this ball
    for (let i = 0; i < c.hits; i++) s.consume(hit(2, { t: t + 30 + i * 0.01 }));
    expect(s.clockState().minutes).toBe(0);
    s.startBall();
    expect(s.madnessLeft()).toBe(0);
    s.consume(hit(2, { t: 100 }));
    expect(s.clockState()).toEqual({ minutes: 1, struck: false });
    s.resetRound();
    expect(s.clockState().minutes).toBe(0);
  });

  it('in the toolbox it does nothing', () => {
    const s = scorer([makePart('clock', 1), at('pop', 2, 12, 30)]);
    for (let i = 0; i < 200; i++) s.consume(hit(2, { t: i * 0.01 }));
    expect(s.madnessLeft(2)).toBe(0);
  });
});

describe('Ritual Altar', () => {
  const table = () => {
    const altar = at('altar', 1, CORNER.x, CORNER.y);
    const pops = [0, 1, 2, 3].map((i) => at('pop', 10 + i, 6 + i * 4, 30));
    return { altar, parts: [altar, at('bank', 5, 12, 40), ...pops] };
  };
  const sets = (s: Scorer, n: number, t0 = 0) => [...Array(n)].flatMap((_, i) => s.consume(hit(5, { t: t0 + i * 0.01, bankComplete: true })));

  it('every 8 sets start a ritual: a Tempest strikes random parts a few times a second, for 15 s', () => {
    const { altar, parts } = table();
    const s = scorer(parts);
    expect(sets(s, 7).some((e) => e.label === 'TEMPEST!')).toBe(false);
    expect(s.altarOf(altar).sets).toBe(7);
    const start = sets(s, 1, 1);
    expect(start.at(-1)!.label).toBe('TEMPEST!');
    expect(s.ritualNow(1.1)?.kind).toBe('tempest');
    const strikes = [];
    for (let t = 1.0; t < 2.0; t += 1 / 240) strikes.push(...s.tick(t));
    const zaps = strikes.filter((e) => e.zap?.by === 'storm');
    expect(zaps.length).toBeGreaterThanOrEqual(tempestRate(0));
    expect(zaps.length).toBeLessThanOrEqual(tempestRate(0) + 1);
    s.tick(16.5);
    expect(s.ritualNow(16.5)).toBeNull();
    expect(altar.sets).toBeUndefined(); // a test ball's count stays in its scorer
  });

  it('then an Inferno, a step stronger: every hit of the ball zaps the parts nearest it', () => {
    const { altar, parts } = table();
    altar.rituals = 1;
    const s = scorer(parts);
    sets(s, 8);
    expect(s.ritualNow(0.5)?.kind).toBe('inferno');
    const out = s.consume(hit(11, { t: 1 }));
    expect(out.filter((e) => e.zap?.by === 'fire').length).toBe(infernoReach(1));
    expect(s.consume(hit(11, { t: 1.1, spark: true })).some((e) => e.zap)).toBe(false); // a spark's hit lights nothing
  });

  it('then a Swarm of sparks from the top; in a real round the count is kept on the altar', () => {
    const g = new Game();
    const { altar, parts } = table();
    altar.rituals = 2;
    g.layout.parts.push(...parts.map((p) => ({ ...p, uid: p.uid + 100 })));
    const real = g.layout.parts.find((p) => p.def === 'altar')!;
    g.startRound();
    const out = [...Array(8)].flatMap((_, i) => g.scorer.consume(hit(105, { t: i * 0.01, bankComplete: true })));
    const swarm = out.find((e) => e.label === 'SWARM!')!;
    expect(swarm.sparks?.[0]).toMatchObject({ n: swarmSparks(2), top: true });
    expect(real.rituals).toBe(3);
    expect(real.sets).toBe(0);
    expect(describePart(PARTS.altar, real).map((l) => l.text).join(' ')).toContain('next a Tempest');
  });
});
