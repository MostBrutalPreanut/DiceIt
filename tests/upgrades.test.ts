import { describe, expect, it } from 'vitest';
import { neutralMods, type Mods } from '../src/data/mods';
import { describe as describePart, makePart, MAX_LEVEL, PARTS, type PartId } from '../src/data/parts';
import {
  candidateTargets, COLUMNS, computeMods, rollUpgradeOffers, SKIP_PAY, UPGRADE_IDS, UPGRADES, type UpgradePick, type RunView, type UpgradeId,
} from '../src/data/upgrades';
import { Game, parseRun, type Payout } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import { starterLayout, type Layout } from '../src/sim/layout';
import { Bot } from '../src/sim/bot';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const layoutOf = (...parts: ReturnType<typeof makePart>[]): Layout => ({ parts, gravity: 50, nextUid: 100 });
const view = (owned: PartId[], over: Partial<RunView> = {}): RunView => ({
  owned: owned.map((d, i) => makePart(d, i + 1, 10, 30, true)), levels: {}, picks: [], offersSoFar: 0, ...over,
});
const modsOf = (...ids: (UpgradeId | UpgradePick)[]): Mods => computeMods(ids.map((i) => (typeof i === 'string' ? { id: i } : i)));
/** A game with a given offer waiting, as if the last boss had just been beaten. */
function gameWith(...ids: UpgradeId[]) {
  const g = new Game();
  g.pending = ids.map((id) => ({ id }));
  return g;
}
function take(g: Game, id: UpgradeId, target?: PartId) {
  g.pending = [{ id, target }];
  expect(g.chooseUpgrade(0)).toBe(true);
  return g;
}
function payoutOf(g: Game, ballsLeft = 2): Payout {
  g.startRound();
  g.scorer.score = g.scorer.goal;
  g.ballsLeft = ballsLeft;
  return (g as unknown as { computePayout: () => Payout }).computePayout();
}

describe('upgrade data', () => {
  it('has at least 20 upgrades covering all four columns', () => {
    expect(UPGRADE_IDS.length).toBeGreaterThanOrEqual(20);
    for (const c of COLUMNS) expect(UPGRADE_IDS.filter((id) => UPGRADES[id].column === c).length).toBeGreaterThan(0);
  });

  it.each(UPGRADE_IDS)('%s has a clean one-sentence recipe and folds into the mods without NaN', (id) => {
    const d = UPGRADES[id];
    const target: PartId | undefined = d.targets ? 'pop' : undefined;
    const text = d.text(target);
    expect(text).not.toMatch(/undefined|NaN|\[object/);
    expect(text.endsWith('.')).toBe(true);
    expect(d.max).toBeGreaterThanOrEqual(1);
    const m = computeMods([{ id, target }]);
    for (const v of Object.values(m)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  });

  it('with no upgrades the mods are neutral, so the game plays exactly as it did', () => {
    expect(computeMods([])).toEqual(neutralMods());
  });
});

describe('offering upgrades', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);

  it('three cards, one per column, and never Rules or a legendary on the first offer', () => {
    for (const s of seeds) {
      const offers = rollUpgradeOffers(s, view(['pop', 'pop', 'pop']));
      expect(offers).toHaveLength(3);
      const cols = offers.map((o) => UPGRADES[o.id].column);
      expect(new Set(cols).size).toBe(3);
      for (const o of offers) {
        expect(UPGRADES[o.id].column).not.toBe('rules');
        expect(UPGRADES[o.id].rarity).not.toBe('legendary');
      }
    }
  });

  it('never offers a dead pick: nothing aimed at a part you do not own, nothing that needs a lamp, printer or lane you lack', () => {
    for (const s of seeds) for (const first of [true, false]) {
      const owned: PartId[] = ['pop', 'pop', 'coin'];
      for (const o of rollUpgradeOffers(s, view(owned, { offersSoFar: first ? 0 : 3 }))) {
        expect(['lamps', 'printerPlus', 'sets']).not.toContain(o.id);
        if (UPGRADES[o.id].targets) expect(owned).toContain(o.target);
      }
    }
  });

  it('offers the conditional upgrades once you own what they need', () => {
    const seen = new Set<UpgradeId>();
    for (const s of seeds) for (const o of rollUpgradeOffers(s, view(['pop', 'lamp', 'printer', 'lane'], { offersSoFar: 2 }))) seen.add(o.id);
    for (const id of ['lamps', 'printerPlus', 'sets'] as const) expect(seen.has(id)).toBe(true);
  });

  it('the Rules column and legendaries open up from the second offer', () => {
    const cols = new Set<string>(), rarities = new Set<string>();
    for (const s of seeds) for (const o of rollUpgradeOffers(s, view(['pop', 'coin', 'lane'], { offersSoFar: 1 }))) {
      cols.add(UPGRADES[o.id].column);
      rarities.add(UPGRADES[o.id].rarity);
    }
    expect(cols.has('rules')).toBe(true);
    expect(rarities.has('legendary')).toBe(true);
    expect(rarities.has('rare')).toBe(true);
    // with four columns open it is still three cards
    for (const s of seeds) expect(rollUpgradeOffers(s, view(['pop'], { offersSoFar: 1 }))).toHaveLength(3);
  });

  it('respects how many times an upgrade can be taken, and what excludes what', () => {
    const v = view(['pop', 'lane'], { offersSoFar: 2, picks: [{ id: 'heavy' }, { id: 'extraBall' }, { id: 'extraBall' }] });
    expect(candidateTargets(UPGRADES.glass, v)).toEqual([]); // heavy and glass exclude each other
    expect(candidateTargets(UPGRADES.extraBall, v)).toEqual([]); // taken twice, the maximum
    expect(candidateTargets(UPGRADES.heavy, v)).toEqual([]); // already taken
    expect(candidateTargets(UPGRADES.sponsor, v)).toEqual([undefined]);
    for (const s of seeds) for (const o of rollUpgradeOffers(s, v)) expect(['glass', 'extraBall', 'heavy']).not.toContain(o.id);
  });

  it('a part type at the level cap is no longer offered a level up', () => {
    const maxed = view(['pop', 'coin'], { levels: { pop: MAX_LEVEL } });
    expect(candidateTargets(UPGRADES.levelUp, maxed)).toEqual(['coin']);
    expect(candidateTargets(UPGRADES.goldenAge, view(['deflector'], { offersSoFar: 3 }))).toEqual([]);
  });

  it('is deterministic for a seed', () => {
    const v = view(['pop', 'coin', 'lamp']);
    expect(rollUpgradeOffers(77, v)).toEqual(rollUpgradeOffers(77, v));
    expect(new Set(seeds.map((s) => JSON.stringify(rollUpgradeOffers(s, v)))).size).toBeGreaterThan(20);
  });
});

describe('the between-rounds flow', () => {
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
    expect(g.chooseUpgrade(0)).toBe(true);
    expect(g.canStart).toBe(true);
    g.startRound();
    expect(g.mode).toBe('round');
  });

  it('taking a card records it, updates the mods, closes the offer and marks the stop done', () => {
    const g = gameWith('sponsor', 'rubber', 'headStart');
    expect(g.chooseUpgrade(1)).toBe(true);
    expect(g.picks).toEqual([{ id: 'rubber', target: undefined }]);
    expect(g.mods.ballBounce).toBeCloseTo(0.3);
    expect(g.pending).toBeNull();
    expect(g.resolved).toEqual({ id: 'rubber', target: undefined });
    expect(g.chooseUpgrade(0)).toBe(false); // nothing left to choose
  });

  it('skipping pays $4 and leaves the run as it was', () => {
    const g = gameWith('sponsor', 'rubber', 'levelUp');
    const money = g.money;
    expect(g.skipUpgrade()).toBe(true);
    expect(g.money).toBe(money + SKIP_PAY);
    expect(g.picks).toEqual([]);
    expect(g.resolved).toBe('skipped');
    expect(g.canStart).toBe(true);
    expect(g.skipUpgrade()).toBe(false);
  });

  it('physical upgrades arrive in the inventory marked NEW; placing a part, or starting the round, clears it', () => {
    const g = take(new Game(), 'kickbacks');
    expect(g.inventory.map((p) => [p.def, p.fresh])).toEqual([['kickback', true], ['kickback', true]]);
    g.place(g.inventory[0].uid, 12, 28);
    expect(g.inventory).toHaveLength(1);
    expect(g.placed.find((p) => p.def === 'kickback')!.fresh).toBeUndefined();
    expect(g.inventory[0].fresh).toBe(true);
    g.startRound();
    expect(g.inventory[0].fresh).toBeUndefined();
    const bought = new Game();
    bought.money = 20;
    expect(bought.buy(0)!.fresh).toBe(true);
  });

  it('Upper Flippers gives one flipper for each button', () => {
    const g = take(new Game(), 'flippers');
    expect(g.inventory.map((p) => [p.def, p.dials.side])).toEqual([['flipper', 0], ['flipper', 1]]);
  });

  it('Level Up raises the chosen type, and Golden Age raises every type you own', () => {
    const g = take(new Game(), 'levelUp', 'pop');
    expect(g.levels.pop).toBe(1);
    const lab = new Game();
    lab.sandbox = true;
    lab.grant('coin');
    take(lab, 'goldenAge');
    expect(lab.levels).toEqual({ pop: 1, coin: 1 });
  });

  it('survives a save and load with its upgrades and a waiting offer, and an undo gives the offer back', () => {
    const g = after(3);
    const offers = JSON.parse(JSON.stringify(g.pending));
    const loaded = new Game();
    loaded.load(parseRun(JSON.stringify(g.save()))!);
    expect(loaded.pending).toEqual(offers);
    expect(loaded.canStart).toBe(false);
    loaded.chooseUpgrade(0);
    const again = new Game();
    again.load(parseRun(JSON.stringify(loaded.save()))!);
    expect(again.picks).toEqual(loaded.picks);
    expect(again.mods).toEqual(loaded.mods);
    expect(again.pending).toBeNull();
    expect(loaded.undo()).toBe(true);
    expect(loaded.picks).toEqual([]);
    expect(loaded.pending).toEqual(offers);
    expect(loaded.mods).toEqual(neutralMods());
  });

  it('an old save without upgrades loads, and a new run forgets them', () => {
    const g = take(new Game(), 'sponsor');
    const old = JSON.parse(JSON.stringify(g.save()));
    delete old.picks; delete old.pending; delete old.offers;
    const loaded = new Game();
    loaded.load(parseRun(JSON.stringify(old))!);
    expect(loaded.picks).toEqual([]);
    expect(loaded.mods).toEqual(neutralMods());
    g.newRun();
    expect(g.picks).toEqual([]);
    expect(g.mods).toEqual(neutralMods());
    expect(g.pending).toBeNull();
  });

  it('the Test Lab takes any upgrade for free, and only in the lab', () => {
    const g = new Game();
    expect(g.labUpgrade('sponsor')).toBe(false);
    g.sandbox = true;
    expect(g.labUpgrade('sponsor')).toBe(true);
    expect(g.labUpgrade('overclock')).toBe(true); // aimed at a part type that is on the board
    expect(g.mods.roundBonus).toBe(3);
    expect(Object.keys(g.mods.overclock)).toEqual(['pop']);
    g.labClearUpgrades();
    expect(g.mods).toEqual(neutralMods());
  });
});

describe('what the upgrades do: economy', () => {
  it('Extra Ball gives four balls a round', () => {
    const g = take(new Game(), 'extraBall');
    expect(g.ballsPerRound).toBe(4);
    g.startRound();
    expect(g.ballsLeft).toBe(4);
  });

  it('Sponsor, Interest and Ball Hog show up as lines in the payout', () => {
    const base = payoutOf(new Game());
    expect(base.lines.map((l) => l.label.split(' ')[0])).not.toContain('Sponsor');
    const g = new Game();
    g.money = 21;
    take(take(take(g, 'sponsor'), 'interest'), 'ballHog');
    const p = payoutOf(g, 2);
    const line = (start: string) => p.lines.find((l) => l.label.startsWith(start))!;
    expect(line('Sponsor').amount).toBe(3);
    expect(line('Interest').amount).toBe(5); // $21 held = $5, which is also the cap
    expect(line('2 unused').amount).toBe(10); // $5 each
    expect(p.total).toBe(p.lines.reduce((a, l) => a + l.amount, 0));
    const poor = new Game();
    poor.money = 7;
    take(poor, 'interest');
    expect(payoutOf(poor).lines.find((l) => l.label.startsWith('Interest'))!.amount).toBe(1);
  });

  it('Coupon Book takes $1 off each part (never below $1) and the shop charges it', () => {
    const g = take(new Game(), 'coupon');
    expect(g.priceOf('pop')).toBe(2);
    expect(g.priceOf('deflector')).toBe(1);
    const slot = g.shop.offers.findIndex((id) => id !== null);
    const id = g.shop.offers[slot]!;
    g.money = 20;
    g.buy(slot);
    expect(g.money).toBe(20 - g.priceOf(id));
  });

  it('Full Refund returns the whole price when you sell', () => {
    const g = new Game();
    expect(g.sellValue(PARTS.printer)).toBe(3);
    take(g, 'fullRefund');
    expect(g.sellValue(PARTS.printer)).toBe(7);
    const before = g.money;
    expect(g.sell(1)).toBe(3); // a Pop Bumper
    expect(g.money).toBe(before + 3);
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
});

describe('what the upgrades do: the ball', () => {
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
    expect(e.base).toBe(125);
    expect(e.notes).toEqual(['100 base', 'x1.25 ball']);
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
    const spins = (mods: Mods) => {
      const sim = createSim(layoutOf(makePart('spinner', 1, 12, 30, true)), { mods });
      sim.addBall(12, 33, 0, -40);
      const ev: SimEvent[] = [];
      for (let i = 0; i < 120; i++) ev.push(...sim.step(NO_INPUT));
      return (ev.find((e) => e.type === 'partHit') as Extract<SimEvent, { type: 'partHit' }>).spins!;
    };
    expect(spins(m)).toBeGreaterThan(spins(neutralMods()));
    expect(describePart(PARTS.spinner, undefined, { mods: m }).map((l) => l.text).join(' ')).toContain('1 to 15 spins');
  });

  it('Gold Ball pays $1 on every 10th scoring hit of a round', () => {
    const s = new Scorer(1e9, () => starterLayout().parts, { mods: modsOf('gold') });
    s.resetRound();
    const events = Array.from({ length: 20 }, (_, i) => s.consume(hit(1 + (i % 3)))[0]);
    expect(events.map((e) => e.money)).toEqual(events.map((_, i) => ((i + 1) % 10 === 0 ? 1 : 0)));
    expect(events[9].notes).toContain('+$1 gold ball');
    expect(s.money).toBe(2);
    s.startBall(); // a new ball does not reset the round's count
    for (let i = 0; i < 5; i++) s.consume(hit(1));
    expect(s.money).toBe(2);
  });

  it('Twin Ball puts two balls in the lane, each plunged in turn, and the ball only ends when both are gone', () => {
    const sim = createSim(layoutOf(), { mods: modsOf('twin') });
    sim.spawnBall();
    expect(sim.ballCount).toBe(2);
    let launches = 0;
    for (let i = 0; i < 240 * 7; i++) for (const e of sim.step({ ...NO_INPUT, plunge: i % 480 < 230 })) if (e.type === 'launch') launches++;
    expect(launches).toBeGreaterThanOrEqual(2); // the second twin waits in the lane and is plunged in its own turn

    const g = take(new Game(), 'twin');
    g.sandbox = true;
    g.clearBoard();
    g.startRound();
    let ends = 0, launched = 0, liveAtEnd = -1;
    for (let i = 0; i < 240 * 40 && ends === 0; i++) {
      const res = g.step({ ...NO_INPUT, plunge: i % 480 < 230 });
      launched += res.sim.filter((e) => e.type === 'launch').length;
      if (res.game.some((e) => e.type === 'ballEnd')) { ends++; liveAtEnd = g.sim.ballCount; }
    }
    expect(ends).toBe(1);
    expect(launched).toBeGreaterThanOrEqual(2); // both twins were fired before the ball ended
    expect(liveAtEnd).toBe(2); // and the next ball arrives as a pair again
    expect(g.ballsLeft).toBe(2);
  });
});

describe('what the upgrades do: parts and rules', () => {
  it('Overclock adds 50% to one type, and the sentence on the part says the same number the scorer pays', () => {
    const m = computeMods([{ id: 'overclock', target: 'pop' }]);
    const pop = makePart('pop', 1, 17, 44.5, true);
    const text = describePart(PARTS.pop, pop, { mods: m }).map((l) => l.text).join(' ');
    expect(text).toContain('Scores 150 per hit');
    expect(text).toContain('multiply its base points by 1.5');
    const s = new Scorer(1e9, () => starterLayout().parts, { mods: m });
    s.startBall();
    const e = s.consume(hit(1))[0];
    expect(e.base).toBe(150);
    expect(e.notes).toEqual(['100 base', '+50% overclock']);
    expect(s.label(starterLayout().parts[0])).toBe('158'); // the next Pop hit: (100 + 5 grown) x 1.5, rounded
    const coin = new Scorer(1e9, () => [makePart('coin', 9, 12, 30, true)], { mods: m });
    expect(coin.consume(hit(9))[0].base).toBe(40); // other types are untouched
  });

  it('descriptions follow every upgrade that changes a number', () => {
    const text = (id: PartId, m: Mods, inst = makePart(id, 1)) => describePart(PARTS[id], inst, { mods: m }).map((l) => l.text).join(' ');
    expect(text('lamp', modsOf('lamps'))).toContain('within 7 units scores +35%');
    expect(text('lamp', neutralMods())).toContain('within 5 units scores +25%');
    expect(text('printer', modsOf('printerPlus'))).toContain('Prints 2 more balls');
    expect(text('printer', neutralMods())).toContain('Prints a second ball');
    expect(text('lane', modsOf('sets'))).toContain('+400 points and +1 Mult');
    expect(text('bank', modsOf('sets'))).toContain('+600 points and +0.6 Mult');
    expect(text('spinner', modsOf('glass'))).toContain('1 to 15 spins');
  });

  it('Bright Lamps widen the glow and raise the bonus, in the scorer too', () => {
    const lamp = makePart('lamp', 1, 12, 30, true);
    const pop = makePart('pop', 2, 12, 36.5, true); // 6.5 units away: outside a 5-unit glow, inside 7
    const run = (m: Mods) => {
      const s = new Scorer(1e9, () => [lamp, pop], { mods: m });
      s.startBall();
      s.consume(hit(1));
      return s.consume(hit(2))[0];
    };
    expect(run(neutralMods()).base).toBe(100);
    const bright = run(modsOf('lamps'));
    expect(bright.base).toBe(135);
    expect(bright.notes).toContain('+35% lamp');
  });

  it('Printer Plus prints two balls per catch', () => {
    const sim = createSim(layoutOf(makePart('printer', 1, 12, 30, true)), { mods: modsOf('printerPlus') });
    sim.addBall(12, 34, 0, -20);
    let releasedAt = -1, extras = 0;
    for (let i = 0; i < 240 * 3 && releasedAt < 0; i++) {
      const ev = sim.step(NO_INPUT);
      if (ev.some((e) => e.type === 'partRelease')) { releasedAt = i; extras = ev.filter((e) => e.type === 'extraBall').length; }
    }
    expect(releasedAt).toBeGreaterThan(0);
    expect(extras).toBe(2); // two printed balls on the tick the first is fired out
  });

  it('Jackpot Sets doubles the points and the Mult of a lane set and a bank set', () => {
    const lanes = [makePart('lane', 1, 6, 30, true), makePart('lane', 2, 12, 30, true)];
    const s = new Scorer(1e9, () => lanes, { mods: modsOf('sets') });
    s.startBall();
    s.consume(hit(1));
    const done = s.consume(hit(2)).find((e) => e.kind === 'bonus')!;
    expect(done.base).toBe(400);
    expect(done.multAfter - done.multBefore).toBeCloseTo(1);
    const bank = new Scorer(1e9, () => [makePart('bank', 5, 12, 30, true)], { mods: modsOf('sets') });
    const b = bank.consume(hit(5, { bankComplete: true }))[0];
    expect(b.base).toBe(600);
  });

  it('Head Start raises the Mult every ball starts at, in a real round', () => {
    const g = take(take(new Game(), 'headStart'), 'headStart');
    g.startRound();
    expect(g.scorer.mult).toBeCloseTo(1.5);
    g.scorer.startBall();
    expect(g.scorer.mult).toBeCloseTo(1.5);
  });

  it('Lucky Seven doubles every 7th scoring hit of a ball and starts over with each ball', () => {
    const s = new Scorer(1e9, () => [makePart('coin', 9, 12, 30, true)], { mods: modsOf('lucky') });
    s.startBall();
    const bases = Array.from({ length: 8 }, () => s.consume(hit(9))[0].base);
    expect(bases).toEqual([40, 40, 40, 40, 40, 40, 80, 40]);
    s.startBall();
    expect(Array.from({ length: 7 }, () => s.consume(hit(9))[0].base).at(-1)).toBe(80);
  });

  it('every upgrade can be taken in the lab without breaking a round', () => {
    for (const id of UPGRADE_IDS) {
      const g = new Game();
      g.sandbox = true;
      for (const part of ['lamp', 'printer', 'lane', 'bank'] as const) g.grant(part);
      expect(g.labUpgrade(id)).toBe(true);
      g.sandbox = false;
      g.startRound();
      for (let i = 0; i < 240 * 3; i++) g.step({ ...NO_INPUT, plunge: i < 230 });
      expect(Number.isFinite(g.scorer.score)).toBe(true);
    }
  });

  it('a bot plays a whole round with every upgrade at once and a busy board, and nothing goes wrong', () => {
    const g = new Game();
    g.sandbox = true;
    const spots: [PartId, number, number][] = [
      ['lamp', 8, 30], ['printer', 12, 27], ['lane', 6, 38], ['lane', 12, 40], ['bank', 17, 33], ['kickback', 4.5, 20],
      ['saver', 12, 18], ['vari', 18, 26], ['spinner', 8, 35],
    ];
    for (const [id, x, y] of spots) expect(g.place(g.grant(id)!.uid, x, y)).toBe(true);
    for (const id of UPGRADE_IDS) expect(g.labUpgrade(id)).toBe(true);
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
});
