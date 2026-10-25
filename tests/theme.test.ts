import { describe, expect, it } from 'vitest';
import { PART_IDS } from '../src/data/parts';
import { popScale } from '../src/render/particles';
import { legible, mat, roleClashes, THEMES, themeProblems, themeVars } from '../src/render/theme';

describe('theme kits', () => {
  it('every theme gives every part a role colour', () => {
    for (const t of THEMES) for (const id of PART_IDS) expect(t.role[id], `${t.id} ${id}`).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('no two scoring parts in a theme are too close in colour (shape first, colour second)', () => {
    for (const t of THEMES) expect(roleClashes(t)).toEqual([]);
  });

  it('ink on paper passes WCAG AA, the ball outline stands out on the floor, and no part melts into the floor', () => {
    for (const t of THEMES) expect(themeProblems(t)).toEqual([]);
  });

  it('a theme is only data: unique ids, a lane word, and every token a colour', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      expect(t.laneWord.length).toBeGreaterThanOrEqual(2);
      for (const [k, v] of Object.entries(themeVars(t))) expect(v, `${t.id} ${k}`).toMatch(/^(#[0-9a-f]{6}|rgba\([\d,.]+\))$/);
    }
  });

  it('shading is derived: shade and mid lean to the shadow hue, light to white, light colours get legible', () => {
    const t = THEMES[0], m = mat(t, '#808080');
    expect(m.base).toBe('#808080');
    expect(m.shade).not.toBe(m.mid);
    expect(m.light).toBe('#c0c0c0');
    expect(legible(t, '#ffffff')).not.toBe('#ffffff');
    expect(legible(t, t.ink)).toBe(t.ink);
  });
});

describe('particles are stickers', () => {
  it('pop in, overshoot, settle, shrink out, and never just fade', () => {
    expect(popScale(0)).toBeCloseTo(0.45);
    expect(popScale(0.15)).toBeCloseTo(1.18);
    expect(popScale(0.3)).toBeCloseTo(1);
    expect(popScale(0.75)).toBeCloseTo(0.68);
    expect(popScale(1)).toBe(0);
  });
});
