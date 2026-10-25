import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, PARTS, type PartInstance } from '../src/data/parts';
import { Scorer } from '../src/game/scoring';
import { starterLayout } from '../src/sim/layout';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });

function setup(extra: PartInstance[] = []) {
  const parts = [...starterLayout().parts, ...extra]; // pops are uid 1..3
  const s = new Scorer(1e9, () => parts);
  s.startBall();
  return { s, parts };
}

describe('Pop Bumper: 100, +5 for every Pop hit this ball', () => {
  it('scores 100 first, then 105, then 110, no matter which pop is hit', () => {
    const { s } = setup();
    expect(s.consume(hit(1))[0].base).toBe(100);
    expect(s.consume(hit(2))[0].base).toBe(105);
    expect(s.consume(hit(1))[0].base).toBe(110);
    expect(s.hitsOf('pop')).toBe(3);
  });

  it('explains itself: the event lists where its points came from', () => {
    const { s } = setup();
    s.consume(hit(1));
    const e = s.consume(hit(2))[0];
    expect(e.notes).toEqual(['100 base', '+5 grown']);
    expect(e.base).toBe(105);
    expect(e.points).toBe(105); // Mult is still x1
  });

  it('forgets its growth every ball, and the label on the part tracks it', () => {
    const { s, parts } = setup();
    s.consume(hit(1));
    s.consume(hit(2));
    expect(s.label(parts[0])).toBe('110');
    s.startBall();
    expect(s.label(parts[0])).toBe('100');
  });
});

describe('Mult, dials, money', () => {
  it('multiplies base points by Mult, and Big Boi raises Mult', () => {
    const { s } = setup([makePart('mega', 10, 10, 30, true)]);
    const mega = s.consume(hit(10))[0];
    expect(mega.base).toBe(250);
    expect(mega.multAfter).toBeCloseTo(1.15);
    const pop = s.consume(hit(1))[0];
    expect(pop.base).toBe(100);
    expect(pop.points).toBe(115); // 100 x 1.15
    expect(pop.multBefore).toBeCloseTo(1.15);
  });

  it('Kick trades against payout: 0 pays +50%, 4 pays -50%', () => {
    const { s, parts } = setup();
    parts[0].dials.kick = 4;
    parts[1].dials.kick = 0;
    expect(s.consume(hit(1))[0].base).toBe(50);
    expect(s.consume(hit(2))[0].base).toBe(158); // (100 + 5 grown) x 1.5
  });

  it('Cha-Ching pays $1 per hit', () => {
    const { s } = setup([makePart('coin', 10, 10, 30, true)]);
    s.consume(hit(10));
    s.consume(hit(10));
    expect(s.money).toBe(2);
  });

  it('resets Mult every ball', () => {
    const { s } = setup([makePart('mega', 10, 10, 30, true)]);
    s.consume(hit(10));
    s.startBall();
    expect(s.mult).toBe(1);
  });
});

describe('lamps, lanes and spinners', () => {
  it('a lit lamp makes parts inside its glow score +25%, and nothing outside', () => {
    const lamp = makePart('lamp', 10, 17, 40, true); // pop 1 is at (17, 44.5): 4.5 away, inside radius 5
    const { s } = setup([lamp]);
    expect(s.consume(hit(1))[0].base).toBe(100); // lamp not lit yet
    s.startBall();
    expect(s.consume(hit(10))[0].label).toBe('LAMP LIT');
    const lit = s.consume(hit(1))[0];
    expect(lit.base).toBe(125);
    expect(lit.notes).toContain('+25% lamp');
    expect(s.consume(hit(3))[0].base).toBe(Math.round(105)); // pop 3 at (6,42) is 11 away: no bonus
  });

  it('a wider glow gives a smaller bonus', () => {
    const lamp = makePart('lamp', 10, 17, 40, true);
    lamp.dials.radius = 8;
    const { s } = setup([lamp]);
    s.consume(hit(10));
    expect(s.consume(hit(1))[0].base).toBe(110); // 0.5 - 0.05 x 8 = +10%
  });

  it('lighting every lane pays a set bonus once, then resets', () => {
    const { s } = setup([makePart('lane', 10, 8, 30, true), makePart('lane', 11, 12, 30, true)]);
    const first = s.consume(hit(10));
    expect(first).toHaveLength(1);
    expect(s.isLit(10)).toBe(true);
    const second = s.consume(hit(11));
    expect(second).toHaveLength(2);
    expect(second[1].label).toBe('LANES COMPLETE');
    expect(second[1].base).toBe(200);
    expect(second[1].multAfter).toBeCloseTo(1.5);
    expect(s.isLit(10)).toBe(false);
  });

  it('spinner pays per spin', () => {
    const spin = makePart('spinner', 10, 8, 30, true);
    spin.dials.drag = 0;
    const { s } = setup([spin]);
    const e = s.consume(hit(10, { spins: 5 }))[0];
    expect(e.base).toBe(50);
    expect(s.label(spin)).toBe('10/spin');
  });
});

describe('attribution', () => {
  it('every point in the score is in the ledger', () => {
    const { s } = setup([makePart('mega', 10, 10, 30, true), makePart('coin', 11, 12, 30, true)]);
    for (const uid of [1, 10, 2, 11, 3, 10, 1]) s.consume(hit(uid));
    expect(s.ledgerRows().reduce((a, r) => a + r.points, 0)).toBe(s.score);
  });

  it('flags the goal the moment the score crosses it, and ignores parts in the inventory', () => {
    const parts = [makePart('pop', 1, 10, 30, true), makePart('pop', 2, 10, 20, false)];
    const s = new Scorer(150, () => parts);
    expect(s.consume(hit(2))).toHaveLength(0); // stored: cannot score
    s.consume(hit(1));
    expect(s.goalReached).toBe(false);
    s.consume(hit(1));
    expect(s.goalReached).toBe(true);
  });
});

describe('levels, Level Lights and drop-target banks', () => {
  const lights = (target = 0) => {
    const a = makePart('uplight', 20, 6, 30, true);
    const b = makePart('uplight', 21, 10, 30, true);
    const c = makePart('uplight', 22, 14, 30, true);
    for (const l of [a, b, c]) l.dials.target = target;
    return [a, b, c];
  };

  it('a levelled part type scores more, and says why', () => {
    const parts = [...starterLayout().parts];
    const s = new Scorer(1e9, () => parts, { levels: { pop: 2 } });
    s.startBall();
    const e = s.consume(hit(1))[0];
    expect(e.base).toBe(120); // 100 + 2 levels x 10
    expect(e.notes).toContain('+20 level');
    expect(s.label(parts[0])).toBe('125'); // next hit: 100 + 20 level + 5 grown from the hit just made
  });

  it('a Level Light toggles: lit on the first pass, out on the second', () => {
    const [a, b] = lights();
    const parts = [...starterLayout().parts, a, b];
    const s = new Scorer(1e9, () => parts);
    s.consume(hit(20));
    expect(s.isLit(20)).toBe(true);
    s.consume(hit(20));
    expect(s.isLit(20)).toBe(false);
  });

  it('lighting every light aimed at a type levels it up once, then the lights reset', () => {
    const ls = lights();
    const parts = [...starterLayout().parts, ...ls];
    const calls: string[] = [];
    const s = new Scorer(1e9, () => parts, { onLevelUp: (id) => { calls.push(id); return 1; } });
    s.consume(hit(20));
    s.consume(hit(21));
    expect(calls).toEqual([]);
    const done = s.consume(hit(22));
    expect(calls).toEqual(['pop']);
    expect(done.find((e) => e.kind === 'bonus')!.label).toBe('POP BUMPERS LEVEL 1!');
    expect([20, 21, 22].some((u) => s.isLit(u))).toBe(false);
  });

  it('lights stay lit across balls within a round, but go dark on a new round', () => {
    const ls = lights();
    const parts = [...starterLayout().parts, ...ls];
    const s = new Scorer(1e9, () => parts);
    s.consume(hit(20));
    s.startBall();
    expect(s.isLit(20)).toBe(true);
    s.resetRound();
    expect(s.isLit(20)).toBe(false);
  });

  it('a single Level Light can never level anything up, and different targets complete separately', () => {
    const [a, b, c] = lights();
    const calls: string[] = [];
    const solo = new Scorer(1e9, () => [...starterLayout().parts, a], { onLevelUp: (id) => { calls.push(id); return 1; } });
    solo.consume(hit(20));
    expect(calls).toEqual([]);
    b.dials.target = 1; // aimed at Cha-Ching
    c.dials.target = 1;
    const mixed = new Scorer(1e9, () => [...starterLayout().parts, a, b, c], { onLevelUp: (id) => { calls.push(id); return 1; } });
    mixed.consume(hit(20)); // the only light aimed at pop: still not a set
    mixed.consume(hit(21));
    mixed.consume(hit(22));
    expect(calls).toEqual(['coin']);
  });

  it('reports a maxed-out type instead of levelling past the cap', () => {
    const ls = lights();
    const s = new Scorer(1e9, () => [...starterLayout().parts, ...ls], { onLevelUp: () => null });
    s.consume(hit(20));
    s.consume(hit(21));
    expect(s.consume(hit(22)).find((e) => e.kind === 'bonus')!.label).toContain('MAXED');
  });

  it('a drop-target bank scores each target, then a bonus when all three are down', () => {
    const bank = makePart('bank', 30, 12, 30, true);
    const parts = [...starterLayout().parts, bank];
    const s = new Scorer(1e9, () => parts);
    expect(s.consume(hit(30, { index: 0 }))[0].base).toBe(60);
    s.consume(hit(30, { index: 1 }));
    const last = s.consume(hit(30, { index: 2 }));
    expect(last).toHaveLength(1);
    const done = s.consume(hit(30, { bankComplete: true }));
    expect(done[0].label).toBe('BANK COMPLETE');
    expect(done[0].base).toBe(300);
    expect(done[0].multAfter).toBeCloseTo(1.3);
  });
});

describe('Kickback and Ball Saver', () => {
  it('a kick pays 150 times Mult and explains itself; the saver scores nothing but tips $1 when it saves', () => {
    const { s, parts } = setup([makePart('kickback', 10, 10, 30, true), makePart('saver', 11, 14, 30, true)]);
    const kick = s.consume(hit(10, { kicked: true }))[0];
    expect(kick.base).toBe(150);
    expect(kick.notes).toEqual(['150 base']);
    expect(s.label(parts.find((p) => p.uid === 10)!)).toBe('150');
    const saved = s.consume({ type: 'ballSaved', t: 0, uid: 11, ballId: 2 });
    expect(saved.map((e) => [e.points, e.money])).toEqual([[0, 1]]);
    expect(s.label(parts.find((p) => p.uid === 11)!)).toBeNull();
  });
});

describe('Vari-Target: harder hits pay more', () => {
  const vari = (stiff?: number) => {
    const v = makePart('vari', 20, 12, 30, true);
    if (stiff !== undefined) v.dials.stiff = stiff;
    return v;
  };
  const score = (v: PartInstance, speed: number) => {
    const { s } = setup([v]);
    return s.consume(hit(20, { speed }))[0];
  };

  it('pays x1, x2, x4 or x8 of 40 by how fast the ball was going, and says which', () => {
    const v = vari();
    expect([5, 15, 35, 70].map((sp) => score(v, sp).base)).toEqual([40, 80, 160, 320]);
    expect(score(v, 70).notes).toEqual(['40 base', 'x8 smash hit']);
    expect(score(v, 70).tier).toBe(3);
    expect(score(v, 5).tier).toBe(0);
  });

  it('a stiffer target needs a harder hit per tier but pays more', () => {
    const stiff = vari(2); // thresholds x2, payout x1.5
    expect(score(stiff, 35).base).toBe(Math.round(40 * 2 * 1.5)); // 35 is only "firm" at stiffness 2 (needs 56 for hard)
    expect(score(stiff, 120).base).toBe(Math.round(40 * 8 * 1.5));
    const soft = vari(0.5); // thresholds x0.5, payout x0.75
    expect(score(soft, 35).base).toBe(Math.round(40 * 8 * 0.75)); // 25 is already a smash
  });

  it('the label on the part is the soft-to-smash range, and the description matches the dial', () => {
    const { s } = setup([vari()]);
    const part = vari();
    expect(s.label(part)).toBe('40-320');
    const text = describePart(PARTS.vari, part).map((l) => l.text).join(' ');
    expect(text).toContain('x8 smash (50+ speed)');
    part.dials.stiff = 2;
    expect(describePart(PARTS.vari, part).map((l) => l.text).join(' ')).toContain('x8 smash (100+ speed)');
  });
});

describe('Lane change: the flipper buttons shift the lit lanes', () => {
  const lanes = () => [makePart('lane', 30, 6, 30, true), makePart('lane', 31, 12, 30, true), makePart('lane', 32, 18, 30, true)];
  const flip = (side: 'L' | 'R', on = true): SimEvent => ({ type: 'flipper', t: 0, side, on });
  const lit = (s: Scorer) => [30, 31, 32].map((u) => s.isLit(u));

  it('moves the lit lane left or right, wrapping round, and never completes the set', () => {
    const { s } = setup(lanes());
    s.consume(hit(31)); // the middle lane lights
    expect(lit(s)).toEqual([false, true, false]);
    s.consume(flip('L'));
    expect(lit(s)).toEqual([true, false, false]);
    s.consume(flip('L'));
    expect(lit(s)).toEqual([false, false, true]); // wrapped round
    s.consume(flip('R'));
    expect(lit(s)).toEqual([true, false, false]);
    s.consume(hit(31));
    expect(lit(s)).toEqual([true, true, false]);
    s.consume(flip('R'));
    expect(lit(s)).toEqual([false, true, true]); // two lit stay two lit
    expect(s.ledger.get(30)).toBeUndefined(); // shifting scored nothing
  });

  it('lets you steer the dark lane: shift it under the ball to finish the set', () => {
    const { s } = setup(lanes());
    s.consume(hit(30));
    s.consume(hit(31));
    expect(lit(s)).toEqual([true, true, false]);
    const done = s.consume(hit(32)).find((e) => e.kind === 'bonus');
    expect(done?.label).toBe('LANES COMPLETE');
  });

  it('ignores a button release and other lit things', () => {
    const { s } = setup(lanes());
    s.consume(hit(31));
    s.consume(flip('L', false));
    expect(lit(s)).toEqual([false, true, false]);
    const mix = setup([...lanes(), makePart('lamp', 41, 9, 36, true)]);
    mix.s.consume(hit(41));
    mix.s.consume(flip('L'));
    expect(mix.s.isLit(41)).toBe(true); // a lamp is not a lane
  });
});

describe('a lone lane is not a set', () => {
  it('one Lane Rollover just scores and lights; it never pays the set bonus by itself', () => {
    const { s } = setup([makePart('lane', 10, 8, 30, true)]);
    for (let i = 0; i < 5; i++) {
      const out = s.consume(hit(10));
      expect(out).toHaveLength(1);
      expect(out[0].kind).toBe('hit');
    }
    expect(s.mult).toBe(1);
    expect(s.isLit(10)).toBe(true);
  });
});
