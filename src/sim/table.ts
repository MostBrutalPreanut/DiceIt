import { LANE_FLOOR_Y } from './constants';

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const FLIPPER_PIVOTS = {
  L: { x: 5.05, y: 7 },
  R: { x: 14.95, y: 7 },
} as const;

/**
 * The fixed cabinet: outer walls, the arc over the top, the plunger lane and the guide rails.
 * Physics builds static segments from this and the renderer strokes the same list.
 */
export function tableSegments(): Seg[] {
  const out: Seg[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => out.push({ x1, y1, x2, y2 });

  // outer left wall and top arc (an ellipse sweeping over to the plunger lane)
  seg(0, 12, 0, 34);
  const cx = 11, cy = 34, rx = 11, ry = 10, n = 28;
  let px = 0, py = 34;
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    seg(px, py, x, y);
    px = x;
    py = y;
  }
  seg(22, 34, 22, LANE_FLOOR_Y); // outer right wall of the lane
  seg(20, 33, 20, LANE_FLOOR_Y); // lane inner wall: reaches the floor, or a ball can wedge in a slot
  seg(20, 33, 18.7, 35.6); // sloped top so a falling ball drops into the playfield
  seg(20, LANE_FLOOR_Y, 22, LANE_FLOOR_Y); // plunger floor
  // Guide rails end just outside the swept circle of each flipper's rear corner, so a ball rolls from
  // rail to flipper with no groove narrower than itself to rest in (that was a real stall bug).
  seg(0, 12, 5.4, 7.62);
  seg(20, 12, 14.6, 7.62);
  return out;
}
