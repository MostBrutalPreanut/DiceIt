import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, PARTS, type PartInstance } from '../src/data/parts';
import { neutralMods } from '../src/data/mods';
import { Game, parseRun } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });

/** A pack of three Rank Lights (uids 1-3) and a Pop Bumper (uid 9) to score with. */
function rankTable(): PartInstance[] {
  const lights = [1, 2, 3].map((uid, i) => ({ ...makePart('rank', uid, 8 + i * 3, 40, true), group: 1 }));
  return [...lights, makePart('pop', 9, 12, 30, true)];
}
const lightAll = (s: Scorer, t = 0, ballId = 1) => [1, 2, 3].flatMap((uid) => s.consume(hit(uid, { t, ballId })));

describe('Rank Lights', () => {
  it('light all three of a pack and the ball ranks up: Silver, Gold, Diamond, then Diamond again', () => {
    const s = new Scorer(1e9, rankTable);
    s.resetRound();
    const plain = s.consume(hit(9))[0].base;
    expect(lightAll(s).map((e) => e.label).filter(Boolean)).toEqual(['SILVER RANK!']);
    expect(s.rankOf(1, 1)?.name).toBe('Silver');
    expect(lightAll(s, 1).at(-1)!.label).toBe('GOLD RANK!');
    expect(lightAll(s, 2).at(-1)!.label).toBe('DIAMOND RANK!');
    expect(lightAll(s, 3).at(-1)!.label).toBe('DIAMOND AGAIN!');
    const [silver, gold, diamond] = PARTS.rank.recipe.rank!.steps;
    expect(s.rankOf(1, 3)?.x).toBe(diamond);
    expect(silver).toBe(1.2);
    expect(gold).toBe(1.4);
    // every hit the ranked ball makes pays ×1.6 (the Pop has grown one step since its first hit)
    const e = s.consume(hit(9, { t: 4 }))[0];
    expect(e.notes).toContain('x1.6 diamond rank');
    expect(e.base).toBe(Math.round((plain + PARTS.pop.recipe.grow!) * 1.6));
  });

  it('only the ball that lit the last light ranks up; the others pay as usual', () => {
    const s = new Scorer(1e9, rankTable);
    s.resetRound();
    s.consume(hit(1, { ballId: 2 }));
    s.consume(hit(2, { ballId: 2 }));
    s.consume(hit(3, { ballId: 1 }));
    expect(s.rankOf(1)?.name).toBe('Silver');
    expect(s.rankOf(2)).toBeNull();
    expect(s.consume(hit(9, { ballId: 2 }))[0].notes.some((n) => n.includes('rank'))).toBe(false);
  });

  it('a rank lasts 40 s, a drain loses it, and a new ball starts unranked with the lights dark', () => {
    const s = new Scorer(1e9, rankTable);
    s.resetRound();
    lightAll(s, 0);
    expect(s.rankOf(1, 39.9)).not.toBeNull();
    expect(s.rankOf(1, 40)).toBeNull();
    expect(s.consume(hit(9, { t: 41 }))[0].notes.some((n) => n.includes('rank'))).toBe(false);
    lightAll(s, 50);
    expect(s.rankOf(1, 51)?.name).toBe('Silver'); // it had run out: back to the first rank
    s.consume({ type: 'drain', t: 52, ballId: 1, reason: 'drain' });
    expect(s.rankOf(1, 53)).toBeNull();
    s.consume(hit(1, { t: 60 }));
    s.startBall();
    expect(s.isLit(1)).toBe(false);
    expect(lightAll(s, 61).filter((e) => e.label).length).toBe(1);
  });

  it('Flat Rate shrinks the rank like any other Mult gain', () => {
    const s = new Scorer(1e9, rankTable, { mods: { ...neutralMods(), multGain: 0.7 } });
    s.resetRound();
    lightAll(s);
    expect(s.rankOf(1)?.x).toBe(1.14);
  });

  it('its card says what each rank pays, after Flat Rate too', () => {
    const text = describePart(PARTS.rank).map((l) => l.text).join(' ');
    expect(text).toContain('Silver (×1.2), then Gold (×1.4), then Diamond (×1.6)');
    expect(describePart(PARTS.rank, undefined, { mods: { ...neutralMods(), multGain: 0.7 } }).map((l) => l.text).join(' ')).toContain('Silver (×1.14)');
    const bellText = describePart(PARTS.bell).map((l) => l.text).join(' ');
    expect(bellText).toContain('Its first hit each round pays 150 instead');
    expect(bellText).toContain('At 3 notches it rings');
  });
});

describe('Old Bell', () => {
  const bellTable = (notches?: number) => {
    const bell = { ...makePart('bell', 5, 12, 30, true), notches };
    return { bell, parts: [bell, makePart('mega', 6, 12, 36, true)] };
  };

  it('its first hit each round pays the toll (150) and a notch; every other hit pays 20', () => {
    const { bell, parts } = bellTable();
    const s = new Scorer(1e9, () => parts);
    s.resetRound();
    expect(s.label(bell)).toBe('150');
    const first = s.consume(hit(5));
    expect(first[0].base).toBe(150);
    expect(first[0].notes).toContain('notch 1/3');
    expect(s.label(bell)).toBe('20');
    const second = s.consume(hit(5))[0];
    expect(second.base).toBe(20);
    expect(second.notes.some((n) => n.startsWith('notch'))).toBe(false);
    s.startBall();
    expect(s.consume(hit(5))[0].base).toBe(20); // a new ball, the same round
    expect(s.notchesOf(bell)).toBe(1);
    s.resetRound();
    expect(s.consume(hit(5))[0].base).toBe(150);
    expect(s.notchesOf(bell)).toBe(2);
  });

  it("a test ball's notches never reach the machine", () => {
    const { bell, parts } = bellTable(1);
    const s = new Scorer(1e9, () => parts);
    s.resetRound();
    s.consume(hit(5));
    expect(s.notchesOf(bell)).toBe(2);
    expect(bell.notches).toBe(1);
  });

  it('three rounds of notches ring it: +0.5 Mult on this ball at once, and every ball after starts +0.5 higher', () => {
    const g = new Game();
    const bell = makePart('bell', 50, 12, 28, true);
    g.layout.parts.push(bell);
    for (let round = 1; round <= 3; round++) {
      g.startRound();
      const before = g.scorer.mult;
      const out = g.scorer.consume(hit(50));
      if (round < 3) {
        expect(bell.notches).toBe(round);
        expect(out).toHaveLength(1);
        expect(g.scorer.consume(hit(50))[0].base).toBe(20); // the toll is paid: an ordinary hit now
      } else {
        expect(bell.notches).toBe(0);
        expect(out.at(-1)!.label).toBe('THE BELL RINGS! +0.5');
        expect(g.scorer.mult).toBeCloseTo(before + 0.5, 3);
      }
      g.toWorkshop();
    }
    expect(g.rings).toBe(1);
    g.startRound();
    expect(g.scorer.mult).toBeCloseTo(1.5, 3);
  });

  it('a ring adds to the Mult every ball starts at (it never multiplies what the ball gains)', () => {
    const parts = [makePart('mega', 6, 12, 36, true)];
    const plain = new Scorer(1e9, () => parts);
    const rung = new Scorer(1e9, () => parts, { rings: 1 });
    for (const s of [plain, rung]) { s.resetRound(); s.consume(hit(6)); s.consume(hit(6)); }
    expect(rung.mult).toBeCloseTo(plain.mult + 0.5, 3);
  });

  it('rings stack, Flat Rate shrinks them, and selling the bell keeps them', () => {
    expect(new Scorer(1e9, () => [], { rings: 2 }).ringBonus).toBe(1);
    expect(new Scorer(1e9, () => [], { rings: 1, mods: { ...neutralMods(), multGain: 0.7 } }).ringBonus).toBe(0.35);
    const g = new Game();
    g.layout.parts.push(makePart('bell', 50, 12, 28, true));
    g.rings = 1;
    g.money = 10;
    g.sell(50);
    g.startRound();
    expect(g.scorer.mult).toBeCloseTo(1.5, 3);
  });

  it('the rings are saved with the run', () => {
    const g = new Game();
    g.rings = 2;
    const back = parseRun(JSON.stringify(g.save()))!;
    const h = new Game();
    h.load(back);
    expect(h.rings).toBe(2);
    h.newRun();
    expect(h.rings).toBe(0);
  });
});
