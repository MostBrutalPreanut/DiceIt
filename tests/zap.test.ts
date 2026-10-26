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
    expect(zapped[0].zap).toEqual({ x: 12, y: 30, by: 'arc' });
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
    const s = new Scorer(1e9, () => parts, { jam: 'randomEachRound' });
    s.resetRound();
    const jammed = [...s.jammed][0];
    expect(jammed).toBeDefined();
    expect(s.consume(hit(1)).filter((e) => e.zap).some((e) => e.def === jammed)).toBe(false);
  });

  it('its card explains the zap and the cooldown', () => {
    const text = describePart(PARTS.tesla).map((l) => l.text).join(' ');
    expect(text).toContain('2 nearest parts');
    expect(text).toContain(`once every ${ZAP_COOLDOWN} s`);
    expect(text).toContain('×Mult parts cannot be zapped');
  });
});

describe('Powder Keg', () => {
  it('a hit lights the fuse; when it has burnt down the keg blows, zapping every part within reach, then it re-arms', () => {
    const parts = [at('keg', 1, 12, 30), at('pop', 2, 15, 30), at('sling', 3, 12, 25), at('pop', 4, 22, 40)];
    const s = scorer(parts);
    const lit = s.consume(hit(1));
    expect(lit[0].label).toBe('FUSE LIT!');
    expect(s.kegState(1)).toBe('lit');
    const fuse = PARTS.keg.recipe.keg!.fuse;
    expect(s.tick(fuse - 0.01)).toEqual([]);
    const boom = s.tick(fuse);
    expect(boom[0].label).toBe('KABOOM!');
    expect(boom[0].base).toBe(PARTS.keg.recipe.keg!.blast);
    expect(boom[0].blast).toBe(PARTS.keg.recipe.keg!.radius);
    expect(boom.filter((e) => e.zap).map((e) => e.uid).sort()).toEqual([2, 3]); // the far Pop is out of reach
    expect(boom.every((e) => !e.zap || e.zap.by === 'blast')).toBe(true);
    const rearm = PARTS.keg.recipe.keg!.rearm;
    expect(s.kegState(1, fuse + 0.1)).toBe('spent');
    expect(s.tick(fuse + 1)).toEqual([]);
    expect(s.consume(hit(1, { t: fuse + 1 }))[0].label).toBeUndefined(); // spent: it scores, but lights no fuse
    expect(s.kegState(1, fuse + rearm)).toBeNull();
    expect(s.consume(hit(1, { t: fuse + rearm }))[0].label).toBe('FUSE LIT!');
    s.startBall();
    expect(s.kegState(1)).toBeNull();
  });

  it('a blast lights the kegs it reaches, at most four kegs in a row; a ball that ends puts the fuses out', () => {
    const kegs = [0, 1, 2, 3, 4].map((i) => at('keg', i + 1, 3 + i * 4, 30));
    const s = scorer(kegs);
    s.consume(hit(1));
    const fuse = PARTS.keg.recipe.keg!.fuse;
    let t = 0;
    const blown: number[] = [];
    for (let i = 0; i < 6; i++) {
      t += fuse;
      for (const e of s.tick(t)) if (e.label === 'KABOOM!') blown.push(e.uid);
    }
    expect(blown).toEqual([1, 2, 3, 4]);
    expect(s.kegState(5)).toBeNull(); // the fifth is out of the chain
    s.consume(hit(5, { t }));
    s.startBall();
    expect(s.tick(t + fuse * 2)).toEqual([]);
  });
});

describe('Laser Turret', () => {
  it('a hit fires a beam across the table; every part on the line is zapped, then it recharges for 3 s', () => {
    const parts = [at('laser', 1, 12, 30)];
    // a ring of Pops around it: whatever the angle, the beam crosses some and misses others
    for (let i = 0; i < 12; i++) parts.push(at('pop', 10 + i, 12 + Math.cos((i / 12) * Math.PI * 2) * 6, 30 + Math.sin((i / 12) * Math.PI * 2) * 6));
    const s = scorer(parts);
    const out = s.consume(hit(1));
    const beam = out[0].beam!;
    expect(beam).toBeDefined();
    const len = Math.hypot(beam.x2 - beam.x1, beam.y2 - beam.y1);
    const off = (p: PartInstance) => Math.abs((p.x - beam.x1) * (beam.y2 - beam.y1) - (p.y - beam.y1) * (beam.x2 - beam.x1)) / len;
    const zapped = new Set(out.filter((e) => e.zap).map((e) => e.uid));
    expect(zapped.size).toBeGreaterThanOrEqual(2); // a line through the middle of a ring meets it twice
    for (const p of parts.slice(1)) expect(zapped.has(p.uid), `pop ${p.uid}`).toBe(off(p) <= 1.2 + 0.3);
    expect(Math.min(beam.x1, beam.x2)).toBeGreaterThanOrEqual(-1e-9);
    expect(s.consume(hit(1, { t: 1 })).some((e) => e.beam || e.zap)).toBe(false);
    expect(s.consume(hit(1, { t: PARTS.laser.recipe.beam!.cooldown })).some((e) => e.beam)).toBe(true);
  });

  it('a zapped turret scores but does not fire', () => {
    const parts = [at('tesla', 1, 12, 30), at('laser', 2, 14, 30)];
    const s = scorer(parts);
    expect(s.consume(hit(1)).some((e) => e.beam)).toBe(false);
  });
});

describe('Shockwave Gong', () => {
  it('every 8th hit of a ball booms: every part on the table that can be zapped is; zaps do not count', () => {
    const parts = [at('gong', 1, 12, 30), at('pop', 2, 4, 20), at('lane', 3, 20, 46), at('jackpot', 4, 12, 40), at('tesla', 5, 14, 30)];
    const s = scorer(parts);
    const every = PARTS.gong.recipe.boom!.every;
    expect(every).toBe(8);
    for (let i = 0; i < every - 1; i++) expect(s.consume(hit(1, { t: i })).some((e) => e.label === 'BOOM!')).toBe(false);
    expect(s.label(parts[0])).toBe(`${every - 1}/${every}`);
    s.consume(hit(5, { t: 9.5 })); // the coil zaps the gong: that is not a hit of the gong
    const out = s.consume(hit(1, { t: 10 }));
    expect(out.some((e) => e.label === 'BOOM!')).toBe(true);
    expect(out.filter((e) => e.zap).map((e) => e.uid).sort()).toEqual([2, 3, 5]);
    expect(out.filter((e) => e.zap).every((e) => e.zap!.by === 'boom')).toBe(true);
    s.startBall();
    for (let i = 0; i < every - 1; i++) s.consume(hit(1, { t: 20 + i }));
    expect(s.consume(hit(1, { t: 30 })).some((e) => e.label === 'BOOM!')).toBe(true);
  });
});
