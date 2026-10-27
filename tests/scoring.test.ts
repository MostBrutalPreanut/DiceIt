import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, MAX_LEVEL, PARTS, type PartInstance } from '../src/data/parts';
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
    expect(s.consume(hit(1))[0].base).toBe(20);
    expect(s.consume(hit(2))[0].base).toBe(21);
    expect(s.consume(hit(1))[0].base).toBe(22);
    expect(s.hitsOf('pop')).toBe(3);
  });

  it('explains itself: the event lists where its points came from', () => {
    const { s } = setup();
    s.consume(hit(1));
    const e = s.consume(hit(2))[0];
    expect(e.notes).toEqual(['20 base', '+1 grown']);
    expect(e.base).toBe(21);
    expect(e.points).toBe(21); // Mult is still x1
  });

  it('forgets its growth every ball, and the label on the part tracks it', () => {
    const { s, parts } = setup();
    s.consume(hit(1));
    s.consume(hit(2));
    expect(s.label(parts[0])).toBe('22');
    s.startBall();
    expect(s.label(parts[0])).toBe('20');
  });
});

describe('Mult, dials, money', () => {
  it('multiplies base points by Mult, and Big Boi raises Mult', () => {
    const { s } = setup([makePart('mega', 10, 10, 30, true)]);
    const mega = s.consume(hit(10))[0];
    expect(mega.base).toBe(50);
    expect(mega.multAfter).toBeCloseTo(1.15);
    const pop = s.consume(hit(1))[0];
    expect(pop.base).toBe(20);
    expect(pop.points).toBe(23); // 100 x 1.15
    expect(pop.multBefore).toBeCloseTo(1.15);
  });

  it('Kick trades against payout: 0 pays +50%, 4 pays -50%', () => {
    const { s, parts } = setup();
    parts[0].dials.kick = 4;
    parts[1].dials.kick = 0;
    expect(s.consume(hit(1))[0].base).toBe(10);
    expect(s.consume(hit(2))[0].base).toBe(32); // (20 + 1 grown) x 1.5
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
  it('a Lamp brightens a step a hit: +10% a step to parts inside its glow, nothing outside, up to five steps', () => {
    const lamp = makePart('lamp', 10, 17, 40, true); // pop 1 is at (17, 44.5): 4.5 away, inside radius 5
    const { s } = setup([lamp]);
    expect(s.consume(hit(1))[0].base).toBe(20); // lamp not lit yet
    s.startBall();
    const first = s.consume(hit(10))[0];
    expect(first.label).toBe('LAMP 1/5');
    expect(first.base).toBe(10);
    expect(s.consume(hit(1))[0].notes).toContain('+10% lamp');
    s.consume(hit(10));
    expect(s.consume(hit(1))[0].notes).toContain('+20% lamp');
    for (let i = 0; i < 5; i++) s.consume(hit(10));
    expect(s.lampLevel(10)).toBe(5); // as bright as it gets
    expect(s.consume(hit(3))[0].notes.join()).not.toContain('lamp'); // pop 3 at (6,42) is 11 away
    s.startBall();
    expect(s.lampLevel(10)).toBe(0); // dark again on the next ball
  });

  it('a wider glow gives a smaller step', () => {
    const lamp = makePart('lamp', 10, 17, 40, true);
    lamp.dials.radius = 8;
    const { s } = setup([lamp]);
    s.consume(hit(10));
    expect(s.consume(hit(1))[0].base).toBe(21); // 0.2 - 0.02 x 8 = +4% a step
  });

  it('a full drop-target set lights every Lamp at full glow for a few seconds', () => {
    const lamp = makePart('lamp', 10, 17, 40, true);
    const { s } = setup([lamp, makePart('bank', 11, 12, 25, true)]);
    s.consume(hit(11, { bankComplete: true, t: 1 }));
    expect(s.consume(hit(1, { t: 2 }))[0].notes).toContain('+50% lamp');
    expect(s.consume(hit(1, { t: 7 }))[0].notes.join()).not.toContain('lamp');
  });

  it('every three lit lanes make a set: it pays, and those lanes go dark', () => {
    const { s } = setup([makePart('lane', 10, 8, 30, true), makePart('lane', 11, 12, 30, true), makePart('lane', 12, 16, 30, true), makePart('lane', 13, 20, 30, true)]);
    expect(s.consume(hit(10))).toHaveLength(1);
    expect(s.isLit(10)).toBe(true);
    s.consume(hit(10)); // an already lit lane adds nothing
    s.consume(hit(11));
    const third = s.consume(hit(13));
    expect(third).toHaveLength(2);
    expect(third[1].label).toBe('LANES COMPLETE');
    expect(third[1].base).toBe(40);
    expect(third[1].multAfter).toBeCloseTo(1.5);
    expect([10, 11, 13].some((u) => s.isLit(u))).toBe(false);
  });

  it('spinner pays per spin', () => {
    const spin = makePart('spinner', 10, 8, 30, true);
    spin.dials.drag = 0;
    const { s } = setup([spin]);
    const e = s.consume(hit(10, { spins: 5 }))[0];
    expect(e.base).toBe(10);
    expect(s.label(spin)).toBe('2/spin');
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
    const s = new Scorer(30, () => parts);
    expect(s.consume(hit(2))).toHaveLength(0); // stored: cannot score
    s.consume(hit(1));
    expect(s.goalReached).toBe(false);
    s.consume(hit(1));
    expect(s.goalReached).toBe(true);
  });
});

describe('levels, Level Lights and drop-target banks', () => {
  // two lights 5 apart, by the three starter Pops and the Big Boi
  const lights = () => [makePart('uplight', 20, 9, 41, true), makePart('uplight', 21, 14, 41, true)];

  it('a levelled part scores more, and says why', () => {
    const parts = [...starterLayout().parts];
    parts[0] = { ...parts[0], level: 2 };
    const s = new Scorer(1e9, () => parts);
    s.startBall();
    const e = s.consume(hit(1))[0];
    expect(e.base).toBe(30); // 20 + 2 levels x 5
    expect(e.notes).toContain('+10 level');
    expect(s.label(parts[0])).toBe('31'); // next hit: 20 + 10 level + 1 grown from the hit just made
  });

  it('a Level Light toggles: lit on the first pass, out on the second', () => {
    const parts = [...starterLayout().parts, ...lights()];
    const s = new Scorer(1e9, () => parts);
    s.consume(hit(20));
    expect(s.isLit(20)).toBe(true);
    s.consume(hit(20));
    expect(s.isLit(20)).toBe(false);
  });

  it('lighting a whole group levels up every bumper near it, then the lights go out', () => {
    const parts = [...starterLayout().parts, ...lights()];
    const calls: [number, number][] = [];
    const s = new Scorer(1e9, () => parts, { onLevelUp: (p, n) => { calls.push([p.uid, n]); } });
    s.consume(hit(20));
    expect(calls).toEqual([]);
    const done = s.consume(hit(21));
    expect(calls.map((c) => c[0]).sort()).toEqual([1, 2, 3, 4]); // three Pops and the Big Boi
    expect(calls.every((c) => c[1] === 1)).toBe(true);
    expect(done.find((e) => e.kind === 'bonus')!.label).toBe('4 BUMPERS +1 LEVEL!');
    expect([20, 21].some((u) => s.isLit(u))).toBe(false);
  });

  it('lights stay lit across balls within a round, but go dark on a new round', () => {
    const parts = [...starterLayout().parts, ...lights()];
    const s = new Scorer(1e9, () => parts);
    s.consume(hit(20));
    s.startBall();
    expect(s.isLit(20)).toBe(true);
    s.resetRound();
    expect(s.isLit(20)).toBe(false);
  });

  it('a lone Level Light, or two too far apart, never level anything up', () => {
    const calls: number[] = [];
    const solo = new Scorer(1e9, () => [...starterLayout().parts, lights()[0]], { onLevelUp: (p) => { calls.push(p.uid); } });
    solo.consume(hit(20));
    const apart = [makePart('uplight', 20, 4, 41, true), makePart('uplight', 21, 20, 41, true)];
    const far = new Scorer(1e9, () => [...starterLayout().parts, ...apart], { onLevelUp: (p) => { calls.push(p.uid); } });
    far.consume(hit(20));
    far.consume(hit(21));
    expect(calls).toEqual([]);
  });

  it('reports maxed-out bumpers instead of levelling past the cap', () => {
    const parts = [...starterLayout().parts.map((p) => ({ ...p, level: MAX_LEVEL })), ...lights()];
    const s = new Scorer(1e9, () => parts);
    s.consume(hit(20));
    expect(s.consume(hit(21)).find((e) => e.kind === 'bonus')!.label).toContain('MAXED');
  });

  it('a drop-target bank scores each target, then a bonus when all three are down', () => {
    const bank = makePart('bank', 30, 12, 30, true);
    const parts = [...starterLayout().parts, bank];
    const s = new Scorer(1e9, () => parts);
    expect(s.consume(hit(30, { index: 0 }))[0].base).toBe(10);
    s.consume(hit(30, { index: 1 }));
    const last = s.consume(hit(30, { index: 2 }));
    expect(last).toHaveLength(1);
    const done = s.consume(hit(30, { bankComplete: true }));
    expect(done[0].label).toBe('BANK COMPLETE');
    expect(done[0].base).toBe(60);
    expect(done[0].multAfter).toBeCloseTo(1.3);
  });
});

describe('Kickback and Ball Saver', () => {
  it('a kick pays 150 times Mult and explains itself; the saver scores nothing and remembers it was used', () => {
    const { s, parts } = setup([makePart('kickback', 10, 10, 30, true), makePart('saver', 11, 14, 30, true)]);
    const kick = s.consume(hit(10, { kicked: true }))[0];
    expect(kick.base).toBe(30);
    expect(kick.notes).toEqual(['30 base']);
    expect(s.label(parts.find((p) => p.uid === 10)!)).toBe('30');
    expect(s.consume({ type: 'ballSaved', t: 0, uid: 11, ballId: 2 })).toEqual([]);
    expect(s.saversUsed.has(11)).toBe(true);
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
    expect([5, 15, 35, 70].map((sp) => score(v, sp).base)).toEqual([10, 20, 40, 80]);
    expect(score(v, 70).notes).toEqual(['10 base', 'x8 smash hit']);
    expect(score(v, 70).tier).toBe(3);
    expect(score(v, 5).tier).toBe(0);
  });

  it('a stiffer target needs a harder hit per tier but pays more', () => {
    const stiff = vari(2); // thresholds x2, payout x1.5
    expect(score(stiff, 35).base).toBe(Math.round(10 * 2 * 1.5)); // 35 is only "firm" at stiffness 2 (needs 56 for hard)
    expect(score(stiff, 120).base).toBe(Math.round(10 * 8 * 1.5));
    const soft = vari(0.5); // thresholds x0.5, payout x0.75
    expect(score(soft, 35).base).toBe(Math.round(10 * 8 * 0.75)); // 25 is already a smash
  });

  it('the label on the part is the soft-to-smash range, and the description matches the dial', () => {
    const { s } = setup([vari()]);
    const part = vari();
    expect(s.label(part)).toBe('10-80');
    const text = describePart(PARTS.vari, part).map((l) => l.text).join(' ');
    expect(text).toContain('×8 at 50 (a smash)');
    part.dials.stiff = 2;
    expect(describePart(PARTS.vari, part).map((l) => l.text).join(' ')).toContain('×8 at 100 (a smash)');
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
