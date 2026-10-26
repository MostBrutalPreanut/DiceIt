import { LANE_WALL_X, TABLE_W } from './constants';
import { FLIPPER_PIVOTS, tableOutline } from './table';

type Pt = [number, number];

// The cabinet round the playfield, in sim units: what the renderer draws, and the decor screen at the head of the table.

/** The cabinet rim around the field. */
export const RIM = { cx: 13, cy: 26.1, hw: 14.6, hh: 27.5 };
/** The playfield floor: the table's outline closed along the bottom. */
export const floorPoly = (): Pt[] => [...tableOutline(), [TABLE_W, 0], [0, 0]];
/** The apron below the flippers, which no ball reaches; the decal slots sit on it. */
export const apronPoly = (): Pt[] => [
  [0, 0], [0, 14], [FLIPPER_PIVOTS.L.x + 0.36, FLIPPER_PIVOTS.L.y + 0.62], [8.6, 3.2], [15.4, 3.2],
  [FLIPPER_PIVOTS.R.x - 0.36, FLIPPER_PIVOTS.R.y + 0.62], [LANE_WALL_X, 14], [LANE_WALL_X, 0],
];
/** The height of the apron's top, and of the cabinet walls' top (the rim). */
export const APRON_Z = 0.5;
export const WALL_TOP = 1.6;
/** The four decal slots on the apron (sim x, y; they sit on the apron top, z = APRON_Z). */
export const DECAL_SLOT_POS: Pt[] = [[2.6, 6.6], [5.6, 4.4], [18.4, 4.4], [21.4, 6.6]];

/**
 * The decor screen: one flat panel built into the head of the playfield, in the strip between the top of the build
 * area and the dome, where a ball only rolls past on its way in from the plunger. Decor goes nowhere else, and only
 * one piece at a time: it is a picture in the floor, so the ball rolls over it and nothing can stand in its way.
 */
export const DECOR_SLOT = { x: 13, y: 49.7 } as const;
/** The screen's outline round (x, y): its top follows the dome, its bottom sags a little, like a smile. */
export function decorPanel(x: number = DECOR_SLOT.x, y: number = DECOR_SLOT.y, inset = 0): Pt[] {
  // the top is the dome, shrunk; the bottom corners sit 1.2 below the centre, the top 1.85 above it
  const ry = 11.55 - inset, rx = 12.1 - inset, dy = -9.7, a0 = Math.asin(Math.min(0.99, 8.5 / ry));
  const top: Pt[] = Array.from({ length: 25 }, (_, i) => { const a = a0 + ((Math.PI - 2 * a0) * i) / 24; return [x + Math.cos(a) * rx, y + dy + Math.sin(a) * ry]; });
  const [lx, ly] = top[top.length - 1], [rx0, ry0] = top[0], sag = 0.55 - inset * 0.3;
  const bottom: Pt[] = Array.from({ length: 13 }, (_, i) => { const u = (i + 1) / 14, k = 1 - u; return [lx + (rx0 - lx) * u, k * k * ly + 2 * k * u * (ly - sag * 2) + u * u * ry0]; });
  return [...top, ...bottom];
}
/** Is (x, y) over the decor screen? (A little generous, so a drop near its edge still lands in it.) */
export function onDecorSlot(x: number, y: number): boolean {
  return Math.abs(x - DECOR_SLOT.x) < 8.6 && y > DECOR_SLOT.y - 2.2 && y < DECOR_SLOT.y + 2.6;
}
/** Where a piece of decor dropped at (x, y) goes: into the screen if it was dropped over it, else where it was dropped. */
export const decorSpot = (x: number, y: number) => (onDecorSlot(x, y) ? { x: DECOR_SLOT.x, y: DECOR_SLOT.y } : { x, y });
