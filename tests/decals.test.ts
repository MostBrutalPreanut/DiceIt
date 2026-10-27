import { describe, expect, it } from 'vitest';
import { neutralMods, type Mods } from '../src/data/mods';
import { describe as describePart, makePart, MAX_LEVEL, PARTS, type PartId } from '../src/data/parts';
import {
  candidateTargets, computeMods, DECAL_IDS, DECAL_KINDS, DECAL_SLOTS, DECALS, rollDecalPick, SKIP_PAY,
  type DecalId, type DecalPick, type RunView,
} from '../src/data/decals';
import { Game, parseRun, type Payout } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import { starterLayout, type Layout } from '../src/sim/layout';
import { Bot } from '../src/sim/bot';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const layoutOf = (...parts: ReturnType<typeof makePart>[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const view = (owned: PartId[], over: Partial<RunView> = {}): RunView => ({
  owned: owned.map((d, i) => makePart(d, i + 1, 10, 30, true)), decals: [], round: 4, ...over,
});
const modsOf = (...ids: (DecalId | DecalPick)[]): Mods => computeMods(ids.map((i) => (typeof i === 'string' ? { id: i } : i)));
function take(g: Game, id: DecalId, target?: PartId) {
  g.pending = [{ id, target }];
  expect(g.chooseDecal(0)).toBe(true);
  return g;
}
function payoutOf(g: Game, ballsLeft = 2): Payout {
  g.startRound();
  g.scorer.score = g.scorer.goal;
  g.ballsLeft = ballsLeft;
  return (g as unknown as { computePayout: () => Payout }).computePayout();
}

describe('decal data', () => {
  it('has at least 40 decals over all four kinds and every rarity, each with a look', () => {
    expect(DECAL_IDS.length).toBeGreaterThanOrEqual(40);
    for (const k of DECAL_KINDS) expect(DECAL_IDS.filter((id) => DECALS[id].kind === k).length, k).toBeGreaterThanOrEqual(6);
    for (const r of ['common', 'uncommon', 'rare', 'legendary']) expect(DECAL_IDS.some((id) => DECALS[id].rarity === r), r).toBe(true);
    for (const id of DECAL_IDS) {
      const d = DECALS[id];
      expect(d.id).toBe(id);
      expect(d.look.icon || d.look.glyph, id).toBeTruthy();
      expect(d.text(d.targets ? 'pop' : undefined).length, id).toBeGreaterThan(10);
    }
  });

  it('with no decals the mods are neutral, so the game plays exactly as it did', () => {
    expect(computeMods([])).toEqual(neutralMods());
    expect(new Game().mods).toEqual(neutralMods());
  });

  it('every decal changes something', () => {
    // (Momentum and Afterglow change nothing at once: they keep Mult from the rounds after)
    for (const id of DECAL_IDS) if (!DECALS[id].grows) expect(modsOf({ id, target: DECALS[id].targets ? 'pop' : undefined }), id).not.toEqual(neutralMods());
  });
});

describe('offering decals', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);

  it('the boss offers three decals of three different kinds, and no legendary after the first boss', () => {
    for (const s of seeds) {
      const offers = rollDecalPick(s, view(['pop', 'pop', 'pop']), 1);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => DECALS[o.id].kind)).size).toBe(3);
      for (const o of offers) expect(DECALS[o.id].rarity).not.toBe('legendary');
    }
    const rarities = new Set(seeds.flatMap((s) => rollDecalPick(s, view(['pop', 'lane', 'lamp']), 3)).map((o) => DECALS[o.id].rarity));
    expect([...rarities].sort()).toEqual(['common', 'legendary', 'rare', 'uncommon']);
  });

  it('never offers a dead pick: nothing aimed at a part you do not own, nothing that needs a part you lack', () => {
    for (const s of seeds) {
      const owned: PartId[] = ['pop', 'pop', 'coin'];
      for (const o of rollDecalPick(s, view(owned), 2)) {
        expect(['lamps', 'printerPlus', 'sets', 'spinDoctor', 'freeKick', 'targetPractice', 'lightShow']).not.toContain(o.id);
        if (DECALS[o.id].targets) expect(owned).toContain(o.target);
      }
    }
  });

  it('never offers a decal already stuck, or one excluded by a stuck one', () => {
    const v = view(['pop', 'lane'], { decals: [{ id: 'heavy' }, { id: 'bumperCar' }] });
    expect(candidateTargets(DECALS.glass, v)).toEqual([]);
    expect(candidateTargets(DECALS.heavy, v)).toEqual([]);
    expect(candidateTargets(DECALS.lightShow, v)).toEqual([]);
    expect(candidateTargets(DECALS.sponsor, v)).toEqual([undefined]);
    for (const s of seeds) for (const o of rollDecalPick(s, v, 3)) expect(['glass', 'heavy', 'bumperCar', 'targetPractice', 'lightShow']).not.toContain(o.id);
  });

  it('Level Up is only aimed at part types that have levels', () => {
    expect(candidateTargets(DECALS.levelUp, view(['pop', 'deflector', 'saver']))).toEqual(['pop']);
  });

  it('is deterministic for a seed', () => {
    const v = view(['pop', 'coin', 'lamp']);
    expect(rollDecalPick(77, v, 2)).toEqual(rollDecalPick(77, v, 2));
    expect(new Set(seeds.map((s) => JSON.stringify(rollDecalPick(s, v, 2)))).size).toBeGreaterThan(50);
  });
});

describe('the decal pick after a boss', () => {
  const after = (clearedRound: number) => {
    const g = new Game();
    g.round = clearedRound;
    g.continueAfterRound();
    return g;
  };

  it('a pick is owed after every boss (rounds 3, 6, 9, 12, 15) and at no other time', () => {
    for (const r of [1, 2, 4, 5, 7, 8]) expect(after(r).pending).toBeNull();
    for (const r of [3, 6, 9, 12, 15]) expect(after(r).pending).toHaveLength(3);
  });

  it('the round cannot start until the pick is made, and then it can', () => {
    const g = after(3);
    expect(g.canStart).toBe(false);
    g.startRound();
    expect(g.mode).toBe('workshop');
    expect(g.chooseDecal(0)).toBe(true);
    expect(g.canStart).toBe(true);
    g.startRound();
    expect(g.mode).toBe('round');
  });

  it('taking one sticks it on the apron, changes the mods, and closes the offer', () => {
    const g = new Game();
    g.pending = [{ id: 'sponsor' }, { id: 'rubber' }, { id: 'headStart' }];
    expect(g.chooseDecal(1)).toBe(true);
    expect(g.decals).toEqual([{ id: 'rubber' }]);
    expect(g.mods.ballBounce).toBeCloseTo(0.3);
    expect(g.pending).toBeNull();
    expect(g.chooseDecal(0)).toBe(false);
  });

  it('skipping pays $4 and leaves the apron as it was', () => {
    const g = new Game();
    g.pending = [{ id: 'sponsor' }];
    const money = g.money;
    expect(g.skipPick()).toBe(true);
    expect(g.money).toBe(money + SKIP_PAY);
    expect(g.decals).toEqual([]);
    expect(g.resolved).toBe('skipped');
    expect(g.skipPick()).toBe(false);
  });

  it(`the apron holds ${DECAL_SLOTS}; another waits until you peel one`, () => {
    const g = new Game();
    const ids: DecalId[] = ['sponsor', 'headStart', 'rubber', 'gold'];
    for (const id of ids) take(g, id);
    expect(g.decals.length).toBe(DECAL_SLOTS);
    g.pending = [{ id: 'lucky' }];
    expect(g.canTake(0)).toBe(false);
    expect(g.chooseDecal(0)).toBe(false);
    expect(g.peel(0)).toBe(true);
    expect(g.chooseDecal(0)).toBe(true);
    expect(g.decals.map((d) => d.id)).toContain('lucky');
  });

  it('peeling destroys the decal: its rule stops, and undo brings it back', () => {
    const g = take(new Game(), 'lucky');
    expect(g.mods.luckyEvery).toBe(7);
    expect(g.peel(0)).toBe(true);
    expect(g.mods.luckyEvery).toBe(0);
    expect(g.undo()).toBe(true);
    expect(g.mods.luckyEvery).toBe(7);
  });

  it('survives a save and load with its decals and a waiting offer', () => {
    const g = after(3);
    const offers = JSON.parse(JSON.stringify(g.pending));
    const loaded = new Game();
    loaded.load(parseRun(JSON.stringify(g.save()))!);
    expect(loaded.pending).toEqual(offers);
    loaded.chooseDecal(0);
    const again = new Game();
    again.load(parseRun(JSON.stringify(loaded.save()))!);
    expect(again.decals).toEqual(loaded.decals);
    expect(again.mods).toEqual(loaded.mods);
    expect(loaded.undo()).toBe(true);
    expect(loaded.decals).toEqual([]);
    expect(loaded.pending).toEqual(offers);
  });

  it('an old save with old upgrade picks keeps the ones that are decals now, and a new run forgets them', () => {
    const g = take(new Game(), 'sponsor');
    const old = JSON.parse(JSON.stringify(g.save()));
    old.picks = [{ id: 'sponsor' }, { id: 'kickbacks' }, { id: 'headStart' }];
    const loaded = new Game();
    loaded.load(parseRun(JSON.stringify(old))!);
    expect(loaded.decals.map((d) => d.id)).toEqual(['sponsor', 'headStart']);
    loaded.newRun();
    expect(loaded.decals).toEqual([]);
    expect(loaded.mods).toEqual(neutralMods());
  });

  it('decals are never for sale: the shop only sells parts, and a run picks four by its final boss', () => {
    const g = new Game();
    for (let r = 1; r < 15; r++) {
      g.round = r;
      g.continueAfterRound();
      expect(Object.keys(g.shop)).not.toContain('decal');
      if (g.pending) expect(g.chooseDecal(0)).toBe(true);
    }
    expect(g.round).toBe(15);
    expect(g.decals).toHaveLength(4);
    expect(DECAL_SLOTS).toBe(4);
  });

  it('the Test Lab sticks any decal for free, and only in the lab', () => {
    const g = new Game();
    expect(g.labDecal('sponsor')).toBe(false);
    g.sandbox = true;
    expect(g.labDecal('sponsor')).toBe(true);
    expect(g.labDecal('overclock')).toBe(true); // aimed at a part type that is on the board
    expect(g.mods.roundBonus).toBe(2);
    g.labClearDecals();
    expect(g.mods).toEqual(neutralMods());
  });
});

describe('what the decals do: cash', () => {
  it('Extra Ball gives four balls a round; Glass Cannon takes one away', () => {
    const g = take(new Game(), 'extraBall');
    expect(g.ballsPerRound).toBe(4);
    g.startRound();
    expect(g.ballsLeft).toBe(4);
    expect(take(new Game(), 'glassCannon').ballsPerRound).toBe(2);
  });

  it('Sponsor, Interest, Ball Hog, Collector and Savings Bond show up as lines in the payout', () => {
    const base = payoutOf(new Game());
    expect(base.lines.map((l) => l.label.split(' ')[0])).not.toContain('Sponsor');
    const g = new Game();
    g.money = 26;
    for (const id of ['sponsor', 'interest', 'ballHog', 'collector'] as const) take(g, id);
    const p = payoutOf(g, 2);
    const line = (start: string) => p.lines.find((l) => l.label.startsWith(start))!;
    expect(line('Sponsor').amount).toBe(2);
    expect(line('Interest').amount).toBe(5); // $26 held = $5, which is also the cap
    expect(line('2 unused').amount).toBe(6); // $3 each
    expect(line('Collector').amount).toBe(1); // one part type (Pops; Big Boi does not count)
    const bond = take(new Game(), 'savingsBond');
    expect(payoutOf(bond).lines.find((l) => l.label.startsWith('Savings Bond'))!.amount).toBe(1);
    expect(p.total).toBe(p.lines.reduce((a, l) => a + l.amount, 0));
  });

  it('Coupon Book takes $1 off each part (never below $1) and the shop charges it', () => {
    const g = take(new Game(), 'coupon');
    expect(g.priceOf('pop')).toBe(2);
    expect(g.priceOf('deflector')).toBe(1);
    const slot = g.shop.offers.findIndex((id) => id !== null);
    g.money = 20;
    const price = g.priceAt(slot);
    g.buy(slot);
    expect(g.money).toBe(20 - price);
  });

  it('Free Hands makes moving and scrapping free, and a part with no room sells for its full price', () => {
    const g = new Game();
    g.money = 10;
    expect(g.sellValue(PARTS.printer)).toBe(5);
    expect(g.removeValue(g.part(1)!)).toBe(-1); // a Pop Bumper that has played: scrapping it costs
    take(g, 'fullRefund');
    expect(g.sellValue(PARTS.printer)).toBe(10);
    expect(g.moveFee(g.part(1)!)).toBe(0);
    expect(g.sell(1)).toBe(0);
    expect(g.money).toBe(10);
  });

  it('Bargain Bin marks a half-price offer in the shop at once, and peeling it takes the discount back', () => {
    const g = new Game();
    expect(g.shop.bargain ?? null).toBeNull();
    take(g, 'bargain');
    const slot = g.shop.bargain!;
    expect(g.shop.offers[slot]).toBeTruthy();
    expect(g.priceAt(slot)).toBe(Math.max(1, Math.ceil(g.priceOf(g.shop.offers[slot]!) / 2)));
    expect(g.peel(0)).toBe(true);
    expect(g.shop.bargain).toBeNull();
  });

  it('Wide Shelf adds a part to the shop at once, and to every later shop', () => {
    const g = new Game();
    expect(g.shop.offers).toHaveLength(4);
    take(g, 'bigShelf');
    expect(g.shop.offers).toHaveLength(5);
    expect(new Set(g.shop.offers).size).toBe(5);
    g.round = 1;
    g.continueAfterRound();
    expect(g.shop.offers).toHaveLength(5);
    expect(g.reroll()).toBe(true);
    expect(g.shop.offers).toHaveLength(5);
  });

  it('Free Reroll makes the first reroll free; Big Toolbox holds two more', () => {
    const g = take(new Game(), 'freeReroll');
    expect(g.rerollCost).toBe(0);
    g.reroll();
    expect(g.rerollCost).toBe(1);
    expect(take(new Game(), 'bigToolbox').toolboxSlots).toBe(6);
  });

  it('Bargain Bin puts one offer at half price', () => {
    const g = take(new Game(), 'bargain');
    g.round = 1;
    g.continueAfterRound();
    const slot = g.shop.bargain!;
    expect(slot).not.toBeNull();
    const id = g.shop.offers[slot]!;
    expect(g.priceAt(slot)).toBe(Math.max(1, Math.ceil(g.priceOf(id) / 2)));
  });
});

describe('what the decals do: the ball', () => {
  it('Rubber Ball rebounds harder', () => {
    const rebound = (mods: Mods) => {
      const sim = createSim(layoutOf(makePart('vari', 1, 12, 20, true)), { mods });
      sim.addBall(12, 25, 0, 0);
      let best = 0, hitAt = -1;
      for (let i = 0; i < 240 * 1.2; i++) {
        for (const e of sim.step(NO_INPUT)) if (e.type === 'partHit' && hitAt < 0) hitAt = i;
        if (hitAt >= 0 && i > hitAt) best = Math.max(best, sim.ballStates()[0]?.vy ?? 0);
      }
      return best;
    };
    expect(rebound(modsOf('rubber'))).toBeGreaterThan(rebound(neutralMods()) * 1.1);
  });

  it('Heavy Ball pays 25% more per hit and says so, but nudges are weaker', () => {
    const m = modsOf('heavy');
    const s = new Scorer(1e9, () => starterLayout().parts, { mods: m });
    s.startBall();
    const e = s.consume(hit(1))[0];
    expect(e.base).toBe(25);
    expect(e.notes).toEqual(['20 base', 'x1.25 decals']);
    const nudged = (mods: Mods) => {
      const sim = createSim(layoutOf(), { mods });
      sim.addBall(12, 30, 0, 0);
      sim.step({ ...NO_INPUT, nudge: 1 });
      return sim.ballStates()[0].vx;
    };
    expect(nudged(neutralMods())).toBeCloseTo(7, 0);
    expect(nudged(m)).toBeCloseTo(7 * 0.6, 0);
  });

  it('Glass Ball falls 20% slower and gives spinners 50% more spins', () => {
    const m = modsOf('glass');
    const fall = (mods: Mods) => {
      const sim = createSim(layoutOf(), { mods });
      sim.addBall(12, 40, 0, 0);
      for (let i = 0; i < 240 * 0.6; i++) sim.step(NO_INPUT);
      return 40 - sim.ballStates()[0].y;
    };
    expect(fall(m) / fall(neutralMods())).toBeCloseTo(0.8, 1);
    expect(describePart(PARTS.spinner, undefined, { mods: m }).map((l) => l.text).join(' ')).toContain('Up to 15 spins');
  });

  it('Gold Ball pays $1 on every 10th scoring hit of a round', () => {
    const s = new Scorer(1e9, () => starterLayout().parts, { mods: modsOf('gold') });
    s.resetRound();
    const events = Array.from({ length: 20 }, (_, i) => s.consume(hit(1 + (i % 3)))[0]);
    expect(events.map((e) => e.money)).toEqual(events.map((_, i) => ((i + 1) % 10 === 0 ? 1 : 0)));
    expect(s.money).toBe(2);
  });

  it('Twin Ball puts two balls in the lane', () => {
    const sim = createSim(layoutOf(), { mods: modsOf('twin') });
    sim.spawnBall();
    expect(sim.ballCount).toBe(2);
  });

  it('Safety Net saves one early drain per ball with no Ball Saver on the table', () => {
    const run = (mods: Mods) => {
      const sim = createSim(layoutOf(), { mods });
      sim.spawnBall();
      let saved = 0;
      for (let i = 0; i < 240 * 20; i++) {
        const out = sim.step({ ...NO_INPUT, plunge: i < 240 });
        saved += out.filter((e) => e.type === 'ballSaved').length;
        if (i > 240 && out.some((e) => e.type === 'drain' || e.type === 'ballSaved')) break;
      }
      return saved;
    };
    expect(run(neutralMods())).toBe(0);
    expect(run(modsOf('safetyNet'))).toBe(1);
  });

  it('Long Fuse gives every ball 20 more seconds', () => {
    const g = take(new Game(), 'longFuse');
    g.startRound();
    expect(g.sim.clockTotal).toBe(80);
  });

  it('Free Kick makes Kickbacks recharge twice as fast', () => {
    const sim = createSim(layoutOf(makePart('kickback', 1, 12, 25, true)), { mods: modsOf('freeKick') });
    sim.addBall(12, 28, 0, -5);
    for (let i = 0; i < 40; i++) sim.step(NO_INPUT);
    expect(sim.kickbackStates().get(1)).toBe(false);
    for (let i = 0; i < 240 * 2.2; i++) sim.step(NO_INPUT);
    expect(sim.kickbackStates().get(1)).toBe(true); // 2 s instead of 4
  });
});

describe('what the decals do: scoring and builds', () => {
  it('Overclock adds 50% to one type, and the sentence on the part says the same number the scorer pays', () => {
    const m = computeMods([{ id: 'overclock', target: 'pop' }]);
    const pop = makePart('pop', 1, 17, 44.5, true);
    const text = describePart(PARTS.pop, pop, { mods: m }).map((l) => l.text).join(' ');
    expect(text).toContain('Scores 30 per hit');
    const s = new Scorer(1e9, () => starterLayout().parts, { mods: m });
    s.startBall();
    expect(s.consume(hit(1))[0].base).toBe(30);
    const coin = new Scorer(1e9, () => [makePart('coin', 9, 12, 30, true)], { mods: m });
    expect(coin.consume(hit(9))[0].base).toBe(10); // other types are untouched
  });

  it('Level Up counts a type two levels higher; Golden Age counts every type one higher', () => {
    const s = new Scorer(1e9, () => starterLayout().parts, { mods: computeMods([{ id: 'levelUp', target: 'pop' }]) });
    s.startBall();
    expect(s.consume(hit(1))[0].base).toBe(30); // 20 + 2 levels x 5
    const g = new Scorer(1e9, () => starterLayout().parts, { mods: modsOf('goldenAge') });
    g.startBall();
    expect(g.consume(hit(1))[0].base).toBe(25);
  });

  it('descriptions follow every decal that changes a number', () => {
    const text = (id: PartId, m: Mods, inst = makePart(id, 1)) => describePart(PARTS[id], inst, { mods: m }).map((l) => l.text).join(' ');
    expect(text('lamp', modsOf('lamps'))).toContain('within 7 units +14%');
    expect(text('printer', modsOf('printerPlus'))).toContain('Prints 2 more balls');
    expect(text('lane', modsOf('sets'))).toContain('+80 points and +1 Mult');
    expect(text('bank', modsOf('sets'))).toContain('+120 points and +0.6 Mult');
    expect(text('sling', modsOf('comboKing'))).toContain('+150%');
  });

  it('Jackpot Sets doubles the points and the Mult of a lane set and a bank set', () => {
    const lanes = [makePart('lane', 1, 6, 30, true), makePart('lane', 2, 12, 30, true), makePart('lane', 3, 18, 30, true)];
    const s = new Scorer(1e9, () => lanes, { mods: modsOf('sets') });
    s.startBall();
    s.consume(hit(1));
    s.consume(hit(2));
    const done = s.consume(hit(3)).find((e) => e.kind === 'bonus')!;
    expect(done.base).toBe(80);
    expect(done.multAfter - done.multBefore).toBeCloseTo(1);
    const bank = new Scorer(1e9, () => [makePart('bank', 5, 12, 30, true)], { mods: modsOf('sets') });
    expect(bank.consume(hit(5, { bankComplete: true }))[0].base).toBe(120);
  });

  it('Head Start, Crowd Pleaser and Minimalist raise the Mult every ball starts at, in a real round', () => {
    const g = take(new Game(), 'headStart');
    g.startRound();
    expect(g.scorer.mult).toBeCloseTo(1.5);
    const c = take(new Game(), 'crowd'); // three Pops on the table (Big Boi does not count)
    c.startRound();
    expect(c.scorer.mult).toBeCloseTo(1.12);
    const m = take(new Game(), 'minimalist'); // an empty toolbox: four slots
    m.startRound();
    expect(m.scorer.mult).toBeCloseTo(2);
  });

  it('Lucky Seven triples every 7th scoring hit of a ball', () => {
    const s = new Scorer(1e9, () => [makePart('coin', 9, 12, 30, true)], { mods: modsOf('lucky') });
    s.startBall();
    expect(Array.from({ length: 8 }, () => s.consume(hit(9))[0].base)).toEqual([10, 10, 10, 10, 10, 10, 30, 10]);
  });

  it('Bumper Car pays bumpers 50% more and everything else 25% less', () => {
    const parts = [makePart('pop', 1, 6, 30, true), makePart('sling', 2, 12, 30, true)];
    const s = new Scorer(1e9, () => parts, { mods: modsOf('bumperCar') });
    s.startBall();
    expect(s.consume(hit(1))[0].base).toBe(30);
    expect(s.consume(hit(2))[0].base).toBe(4); // 5 x 0.75
  });

  it('Purist doubles every hit while the table holds four part types or fewer', () => {
    const parts = [makePart('pop', 1, 6, 30, true), makePart('coin', 2, 12, 30, true)];
    const s = new Scorer(1e9, () => parts, { mods: modsOf('purist') });
    s.startBall();
    expect(s.consume(hit(1))[0].base).toBe(40);
    for (const [i, id] of (['sling', 'lane', 'vari'] as PartId[]).entries()) parts.push(makePart(id, 10 + i, 4 + i * 4, 40, true));
    expect(s.consume(hit(2))[0].base).toBe(10); // five types now: no bonus
  });

  it('Multiball Madness and Last Call pay double when they apply', () => {
    let balls = 1, last = false;
    const s = new Scorer(1e9, () => [makePart('coin', 9, 12, 30, true)], { mods: modsOf('multiball', 'lastCall'), balls: () => balls, lastBall: () => last });
    s.startBall();
    expect(s.consume(hit(9))[0].base).toBe(10);
    balls = 2;
    expect(s.consume(hit(9))[0].base).toBe(20);
    last = true;
    expect(s.consume(hit(9))[0].base).toBe(40);
  });

  it('Thrifty pays 1% more per $1 held, up to 50%', () => {
    let cash = 20;
    const s = new Scorer(1e9, () => [makePart('coin', 9, 12, 30, true)], { mods: modsOf('thrifty'), cash: () => cash });
    s.startBall();
    expect(s.consume(hit(9))[0].base).toBe(12); // 10 x 1.2
    cash = 500;
    expect(s.consume(hit(9))[0].base).toBe(15);
  });

  it('a bot plays a whole round with a busy board and a full apron of decals, and nothing goes wrong', () => {
    const g = new Game();
    g.sandbox = true;
    const spots: [PartId, number, number][] = [
      ['lamp', 8, 30], ['printer', 12, 27], ['lane', 6, 38], ['lane', 12, 40], ['bank', 17, 33], ['kickback', 4.5, 20],
      ['saver', 12, 18], ['vari', 18, 26], ['spinner', 7, 34], ['xlane', 18, 40],
    ];
    for (const [id, x, y] of spots) expect(g.place(g.grant(id)!.uid, x, y), id).toBe(true);
    for (const id of ['twin', 'multiball', 'printerPlus', 'goldenAge'] as const) expect(g.labDecal(id), id).toBe(true);
    g.sandbox = false;
    g.startRound();
    const bot = new Bot(3, 0.85);
    let maxBalls = 0;
    for (let i = 0; i < 240 * 90 && g.mode === 'round'; i++) {
      g.step(bot.decide(g.sim));
      maxBalls = Math.max(maxBalls, g.sim.ballCount);
      if (i % 240 === 0) expect(Number.isFinite(g.scorer.score) && Number.isFinite(g.scorer.mult)).toBe(true);
    }
    expect(g.scorer.score).toBeGreaterThan(0);
    expect(maxBalls).toBeLessThanOrEqual(12);
  });

  it('every decal can be stuck in the lab without breaking a round', () => {
    for (const id of DECAL_IDS) {
      const g = new Game();
      g.sandbox = true;
      for (const part of ['lamp', 'printer', 'lane', 'bank', 'spinner', 'kickback', 'vari'] as const) g.grant(part);
      expect(g.labDecal(id), id).toBe(true);
      g.sandbox = false;
      g.startRound();
      for (let i = 0; i < 240 * 2; i++) g.step({ ...NO_INPUT, plunge: i < 230 });
      expect(Number.isFinite(g.scorer.score), id).toBe(true);
    }
  });
});
