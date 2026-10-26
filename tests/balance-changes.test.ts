import { describe, expect, it } from 'vitest';
import { makePart, PARTS, zappable, type PartInstance } from '../src/data/parts';
import { DECALS, rollDecalPick } from '../src/data/decals';
import { Scorer, SCORE_CEIL } from '../src/game/scoring';
import { fmt } from '../src/ui/html';
import type { SimEvent } from '../src/sim/sim';

/** The balance changes plan (docs/balance-changes-plan.md): one block per phase. */
const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const scorer = (parts: PartInstance[], opts = {}) => {
  const s = new Scorer(1e18, () => parts, opts);
  s.resetRound();
  return s;
};

describe('phase 1: the ceilings', () => {
  it('Disco Balls: ×1.5 each, all of them together at most ×3 a ball', () => {
    const parts = [1, 2, 3].map((uid) => makePart('disco', uid, 4 * uid, 30, true));
    const s = scorer(parts);
    s.consume(hit(1));
    expect(s.mult).toBeCloseTo(1.5);
    s.consume(hit(2));
    expect(s.mult).toBeCloseTo(2.25);
    s.consume(hit(3));
    expect(s.mult).toBeCloseTo(3); // the third only reaches the cap
  });

  it('Halls of Fame share one ×3 cap a ball', () => {
    const parts: PartInstance[] = [makePart('fame', 1, 4, 30, true), makePart('fame', 2, 8, 30, true)];
    const kinds = ['pop', 'sling', 'lane', 'lamp', 'vari', 'spinner', 'coin', 'ding', 'bank', 'thunder', 'golden', 'tesla', 'keg', 'gong'] as const;
    kinds.forEach((id, i) => parts.push(makePart(id, 10 + i, 1 + i, 20, true)));
    const s = scorer(parts);
    s.consume(hit(1));
    expect(s.mult).toBeCloseTo(3); // 15 types: ×4.18 alone, capped
    s.consume(hit(2));
    expect(s.mult).toBeCloseTo(3);
  });

  it('the score guard: an absurd Mult never makes the score infinite', () => {
    const s = scorer([makePart('pop', 1, 4, 30, true)]);
    s.mult = 1e300;
    s.consume(hit(1));
    s.consume(hit(1));
    expect(Number.isFinite(s.score)).toBe(true);
    expect(s.score).toBe(SCORE_CEIL);
    expect(s.mult).toBeLessThanOrEqual(SCORE_CEIL);
    expect(fmt(s.score)).toBe('MAXED');
  });
});

describe('phase 2: Big Boi and stacking', () => {
  it('a zap scores its points but never raises the Mult', () => {
    const boi = makePart('mega', 1, 12, 34, true);
    const s = scorer([boi]);
    s.consume(hit(1, { zap: true }));
    expect(s.mult).toBeCloseTo(1);
    expect(s.score).toBeGreaterThan(0);
    s.consume(hit(1));
    expect(s.mult).toBeGreaterThan(1);
  });

  it('Fan Club pays ×2, and Overclock and Level Up never aim at Big Boi', () => {
    const m = { ...DECALS.fanClub };
    expect(m.text()).toContain('2×');
    const owned = [makePart('mega', 1, 12, 34, true), makePart('pop', 2, 4, 30, true)];
    for (let seed = 1; seed < 200; seed++) for (const o of rollDecalPick(seed, { owned, decals: [], round: 3 }, 1)) expect(o.target).not.toBe('mega');
  });

  it('a part counts at most 2 Power Plates and 2 Spotlights', () => {
    const pop = makePart('pop', 1, 12, 30, true);
    const plates = [2, 3, 4, 5].map((uid) => makePart('plate', uid, 12 + (uid - 3.5) * 0.5, 30, true));
    const spots = [6, 7, 8].map((uid) => makePart('spot', uid, 12, 31 + uid - 6, true));
    const s = scorer([pop, ...plates, ...spots]);
    expect(s.plateXAt(pop)).toBeCloseTo(2.25);
    expect(s.spotXAt(pop)).toBeCloseTo(2.25);
  });

  it('Level Lights cannot be zapped', () => {
    expect(zappable('uplight')).toBe(false);
    expect(zappable('lane')).toBe(true);
    expect(PARTS.uplight.recipe.levelUp).toBe(true);
  });
});
