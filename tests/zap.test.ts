import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, PARTS, ZAP_COOLDOWN, zappable, type PartInstance } from '../src/data/parts';
import { Scorer } from '../src/game/scoring';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const at = (id: Parameters<typeof makePart>[0], uid: number, x: number, y: number): PartInstance => makePart(id, uid, x, y, true);
const scorer = (parts: PartInstance[]) => {
  const s = new Scorer(1e9, () => parts);
  s.resetRound();
  return s;
};

describe('zaps and the Tesla Coil', () => {
  it('a hit arcs to the two nearest parts that can be zapped; each scores as if hit, and says where the zap came from', () => {
    const parts = [at('tesla', 1, 12, 30), at('pop', 2, 14, 30), at('sling', 3, 12, 33.5), at('ding', 4, 20, 30), at('jackpot', 5, 12, 28)];
    const s = scorer(parts);
    const out = s.consume(hit(1));
    expect(out[0].def).toBe('tesla');
    expect(out[0].base).toBe(30);
    const zapped = out.filter((e) => e.zap);
    // the Jackpot Scoop is nearest but needs the ball itself; the far Ding-Dong Bell is third
    expect(zapped.map((e) => e.def)).toEqual(['pop', 'sling']);
    expect(zapped[0].zap).toEqual({ x: 12, y: 30 });
    expect(zapped[0].base).toBe(PARTS.pop.recipe.points);
    expect(s.hitsOf('pop')).toBe(1); // a zap counts for growth
    expect(s.variety).toBe(3); // and for the Ding-Dong Bell's variety: the coil, the Pop, the Slingshot
  });

  it('a part can be zapped once every 0.5 s: the arc goes to the next nearest instead', () => {
    const parts = [at('tesla', 1, 12, 30), at('pop', 2, 14, 30), at('pop', 3, 9, 30), at('pop', 4, 12, 35)];
    const s = scorer(parts);
    expect(s.consume(hit(1, { t: 0 })).filter((e) => e.zap).map((e) => e.uid)).toEqual([2, 3]);
    expect(s.consume(hit(1, { t: 0.2 })).filter((e) => e.zap).map((e) => e.uid)).toEqual([4]);
    expect(s.consume(hit(1, { t: ZAP_COOLDOWN })).filter((e) => e.zap).map((e) => e.uid)).toEqual([2, 3]);
  });

  it('a zap never arcs on: a zapped coil scores, but sends no lightning of its own', () => {
    const parts = [at('tesla', 1, 12, 30), at('tesla', 2, 15, 30), at('pop', 3, 18, 30)];
    const s = scorer(parts);
    const out = s.consume(hit(1));
    expect(out.filter((e) => e.zap).map((e) => e.uid)).toEqual([2, 3]);
    expect(out).toHaveLength(3);
  });

  it('levels add a third arc at level 3 and a fourth at level 6, and no more', () => {
    const coil = at('tesla', 1, 12, 30);
    const s = scorer([coil]);
    expect(s.arcsOf(coil)).toBe(2);
    coil.level = 3;
    expect(s.arcsOf(coil)).toBe(3);
    coil.level = 6;
    expect(s.arcsOf(coil)).toBe(4);
    coil.level = 10;
    expect(s.arcsOf(coil)).toBe(4);
  });

  it('×Mult parts, saucers, the goal, the Kickback and drop targets cannot be zapped', () => {
    for (const id of ['xlane', 'golden', 'disco', 'fame', 'rank', 'printer', 'jackpot', 'magnet', 'goal', 'kickback', 'bank', 'flipper', 'saver', 'deflector', 'strip', 'plate'] as const) {
      expect(zappable(id), id).toBe(false);
    }
    for (const id of ['pop', 'coin', 'sling', 'spinner', 'lane', 'lamp', 'vari', 'ding', 'duck', 'roller', 'bell', 'mega', 'tesla'] as const) {
      expect(zappable(id), id).toBe(true);
    }
  });

  it('a zap neither spends nor earns a Hot Shot, and never pays an Old Bell its toll', () => {
    const parts = [at('tesla', 1, 12, 30), at('sling', 2, 14, 30), at('bell', 3, 9, 30), at('pop', 4, 20, 40)];
    const s = scorer(parts);
    s.consume(hit(2)); // the ball bounces off the Slingshot: it is hot
    const out = s.consume(hit(1));
    expect(out[0].hot).toBe(true); // the coil's own hit is the hot one
    const bell = out.find((e) => e.def === 'bell')!;
    expect(bell.base).toBe(PARTS.bell.recipe.points);
    expect(s.notchesOf(parts[2])).toBe(0);
    expect(s.firedThisRoundOf(3)).toBe(false);
    expect(s.consume(hit(3, { t: 1 }))[0].base).toBe(PARTS.bell.recipe.bell!.first); // the ball still gets the toll
  });

  it('a jammed part type is not zapped', () => {
    const parts = [at('tesla', 1, 12, 30), at('pop', 2, 14, 30), at('sling', 3, 12, 34)];
    const s = new Scorer(1e9, () => parts, { jam: 'mostNumerous' });
    s.resetRound();
    const jammed = [...s.jammed][0];
    expect(s.consume(hit(1)).filter((e) => e.zap).some((e) => e.def === jammed)).toBe(false);
  });

  it('its card explains the zap and the cooldown', () => {
    const text = describePart(PARTS.tesla).map((l) => l.text).join(' ');
    expect(text).toContain('2 nearest parts');
    expect(text).toContain(`once every ${ZAP_COOLDOWN} s`);
    expect(text).toContain('×Mult parts cannot be zapped');
  });
});
