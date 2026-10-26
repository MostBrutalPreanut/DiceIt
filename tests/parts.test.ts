import { describe, expect, it } from 'vitest';
import { describe as describePart, dialFactor, lampBonus, makePart, PART_IDS, PARTS, sellPrice } from '../src/data/parts';

describe('part data', () => {
  it.each(PART_IDS)('%s is well formed and explains itself', (id) => {
    const def = PARTS[id];
    expect(def.cost).toBeGreaterThan(0);
    if (id === 'mega') expect(def.weight).toBe(0); // Big Boi comes with the machine: never for sale
    else expect(def.weight).toBeGreaterThan(0);
    for (const d of def.dials) {
      expect(d.default).toBeGreaterThanOrEqual(d.min);
      expect(d.default).toBeLessThanOrEqual(d.max);
      if (d.payoff) for (let v = d.min; v <= d.max; v += d.step) expect(Number.isFinite(d.payoff(v)) && d.payoff(v) > 0).toBe(true);
    }
    const lines = describePart(def, makePart(id, 1));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.text).not.toMatch(/undefined|NaN|\[object/);
  });

  it('the Pop Bumper says exactly what it does', () => {
    const text = describePart(PARTS.pop, makePart('pop', 1)).map((l) => l.text).join(' ');
    expect(text).toContain('Scores 20 per hit');
    expect(text).toContain('+1 for every Pop Bumper hit this ball');
  });

  it('descriptions follow the dials', () => {
    const p = makePart('pop', 1);
    p.dials.kick = 4;
    expect(dialFactor(p)).toBeCloseTo(0.5);
    expect(describePart(PARTS.pop, p).map((l) => l.text).join(' ')).toContain('Scores 10 per hit');
    expect(describePart(PARTS.flipperR, makePart('flipperR', 2))[0].text).toContain('Right');
    expect(describePart(PARTS.flipper, makePart('flipper', 3))[0].text).toContain('Left');
  });

  it('lamp bonus shrinks as the glow widens; selling refunds half', () => {
    expect(lampBonus(5)).toBe(0.1);
    expect(lampBonus(3)).toBeGreaterThan(lampBonus(8));
    expect(sellPrice(PARTS.pop)).toBe(1);
    expect(sellPrice(PARTS.printer)).toBe(4);
  });
});
