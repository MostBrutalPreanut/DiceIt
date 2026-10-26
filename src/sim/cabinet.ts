import { LANE_WALL_X, TABLE_W } from './constants';
import { FLIPPER_PIVOTS, tableOutline } from './table';

type Pt = [number, number];

// The cabinet round the playfield, in sim units: what the renderer draws, and where decor may stand.

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
/** Decor keeps this far from a decal slot's centre (a slot's sticker is about this wide), and this far from the rim's edge. */
const SLOT_CLEAR = 1.25;
const EDGE = 0.25;
/** The drain's mouth on the apron, between the flippers (its hazard stripes). */
const DRAIN = { x: 12, hw: 4.2, top: 3.4 };

function inside(poly: Pt[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

let floor: Pt[] | null = null, apron: Pt[] | null = null;

/**
 * What a point of the cabinet is, for decor: the apron (z APRON_Z), the top of the cabinet walls round the
 * playfield (z WALL_TOP), or null (the playfield itself, or off the cabinet).
 */
export function decorZ(x: number, y: number): number | null {
  floor ??= floorPoly();
  apron ??= apronPoly();
  if (inside(apron, x, y)) return APRON_Z;
  if (Math.abs(x - RIM.cx) > RIM.hw - EDGE || Math.abs(y - RIM.cy) > RIM.hh - EDGE) return null;
  return inside(floor, x, y) ? null : WALL_TOP;
}

/**
 * Can a piece of decor of footprint `r` stand at (x, y)? All of it on one surface (the apron, or the top of the
 * walls), clear of the decal slots. (Clear of other decor is the layout's check.)
 */
export function decorFits(r: number, x: number, y: number): boolean {
  const z = decorZ(x, y);
  if (z === null) return false;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (decorZ(x + Math.cos(a) * r, y + Math.sin(a) * r) !== z) return false;
  }
  if (z !== APRON_Z) return true;
  // on the apron: not on the drain's hazard stripes between the flippers, nor on a decal slot
  if (Math.abs(x - DRAIN.x) < DRAIN.hw + r && y - r < DRAIN.top) return false;
  return DECAL_SLOT_POS.every(([sx, sy]) => Math.hypot(sx - x, sy - y) >= r + SLOT_CLEAR);
}
