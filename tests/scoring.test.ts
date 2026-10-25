import { describe, expect, it } from 'vitest';
import { makePart, type PartInstance } from '../src/data/parts';
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
    expect(mega.multAfter).toBeCloseTo(1.1);
    const pop = s.consume(hit(1))[0];
    expect(pop.base).toBe(100);
    expect(pop.points).toBe(110); // 100 x 1.1
    expect(pop.multBefore).toBeCloseTo(1.1);
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
