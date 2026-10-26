import type { Mods } from '../../src/data/mods';
import { makePart, PARTS, type PartId } from '../../src/data/parts';
import { starterLayout, type Layout } from '../../src/sim/layout';
import type { Setup } from './lib';

/** The tables every census measures against. */
const add = (l: Layout, id: PartId, x: number, y: number, angle = 0, group?: number) => {
  const p = makePart(id, l.nextUid++, x, y, true);
  p.angle = angle;
  if (group) p.group = group;
  l.parts.push(p);
  return p;
};

/** The starter: three Pops and Big Boi. */
export function starter(): Setup {
  return { layout: starterLayout(), machine: 'factory' };
}

/** A mid-run table (power.ts's): Pops, Big Boi, a lane pack, two Slingshots, a Spinner and a Lamp. Round ~5. */
export function mid(): Setup {
  const l = starterLayout();
  add(l, 'lane', 9, 48.5, 0, 100); add(l, 'lane', 12, 49 - 0.5, 0, 100); add(l, 'lane', 15, 48.5, 0, 100);
  add(l, 'sling', 4.4, 17.6, -1.05); add(l, 'sling', 19.6, 17.6, 1.05);
  add(l, 'spinner', 21.4, 24.5); add(l, 'lamp', 15.6, 29.6);
  return { layout: l, machine: 'factory' };
}

/**
 * A late table (round ~11): the mid table plus a Drop-Target Bank, a Ding-Dong Bell, a fourth Pop, a Sparkler and
 * a Thunder Bumper; parts at level 3; every ball starts at x3 Mult (kept Mult, Head Start-like decals).
 */
export function late(): Setup {
  const s = mid();
  const l = s.layout;
  add(l, 'bank', 6, 30, 0.3); add(l, 'ding', 17.5, 38); add(l, 'pop', 7.5, 37); add(l, 'sparkler', 19, 32); add(l, 'thunder', 12, 26);
  for (const p of l.parts) if (PARTS[p.def].recipe.perLevel && !p.fixed) p.level = 3;
  return { ...s, tweak: (m: Mods) => { m.startMult += 2; } };
}

export const TABLES: Record<string, () => Setup> = { starter, mid, late };
