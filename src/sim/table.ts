import { LANE_FLOOR_Y, LANE_TOP_Y, LANE_WALL_X, TABLE_H, TABLE_W } from './constants';

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface Post {
  x: number;
  y: number;
  r: number;
}

/** Playfield width excluding the plunger lane; the flippers sit symmetrically in it. */
const MID = LANE_WALL_X / 2;
export const FLIPPER_PIVOTS = {
  L: { x: MID - 4.96, y: 8 },
  R: { x: MID + 4.96, y: 8 },
} as const;

/**
 * Fixed rubber posts in the dome. They are cabinet furniture, not parts: they scatter the ball
 * as it arrives from the plunger lane, so the first landing spot varies from launch to launch.
 */
export const TABLE_POSTS: Post[] = [];

/**
 * The fixed cabinet: outer walls, the dome, the plunger lane and the guide rails.
 * Physics builds static segments from this and the renderer strokes the same list.
 */
export function tableSegments(): Seg[] {
  return buildTable().segs;
}

/** The cabinet outline from the left wall, over the dome, down the right wall: the renderer fills inside it. */
export function tableOutline(): [number, number][] {
  return buildTable().outline;
}

function buildTable(): { segs: Seg[]; outline: [number, number][] } {
  const out: Seg[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => out.push({ x1, y1, x2, y2 });

  // outer left wall, then the dome (an ellipse) which ends in a 45 degree chamfer over the plunger lane.
  // A ball fired up the lane hits the chamfer from below and leaves it horizontally as a free
  // projectile, so plunger strength decides where it lands; a smooth dome instead guides every strong
  // plunge round to the same spot on the left wall.
  const domeY = TABLE_H - 12;
  seg(0, 14, 0, domeY);
  const cx = TABLE_W / 2, cy = domeY, rx = TABLE_W / 2, ry = 12, n = 30;
  const aEnd = 1.0;
  let px = 0, py = domeY;
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - ((Math.PI - aEnd) * i) / n;
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    seg(px, py, x, y);
    px = x;
    py = y;
  }
  const chamferEndY = py - (TABLE_W - px);
  seg(px, py, TABLE_W, chamferEndY);
  const rightTop = chamferEndY;
  const outlineEnd = out.length; // everything so far is the outline chain
  // a ledge on the left wall: a ball sliding down it rolls back into the field instead of hugging the wall
  seg(0, 37.5, 2.2, 36.4);
  seg(TABLE_W, rightTop, TABLE_W, LANE_FLOOR_Y); // outer right wall of the lane
  seg(LANE_WALL_X, LANE_TOP_Y, LANE_WALL_X, LANE_FLOOR_Y); // lane inner wall: reaches the floor, or a ball can wedge in a slot
  seg(LANE_WALL_X, LANE_TOP_Y, LANE_WALL_X - 1.6, LANE_TOP_Y + 2.6); // sloped cap so a falling ball drops into the playfield
  seg(LANE_WALL_X, LANE_FLOOR_Y, TABLE_W, LANE_FLOOR_Y); // plunger floor
  // Guide rails end just outside the swept circle of each flipper's rear corner, so a ball rolls from
  // rail to flipper with no groove narrower than itself to rest in (that was a real stall bug).
  seg(0, 14, FLIPPER_PIVOTS.L.x + 0.36, FLIPPER_PIVOTS.L.y + 0.62);
  seg(LANE_WALL_X, 14, FLIPPER_PIVOTS.R.x - 0.36, FLIPPER_PIVOTS.R.y + 0.62);
  const outline: [number, number][] = [[out[0].x1, out[0].y1], ...out.slice(0, outlineEnd).map((q): [number, number] => [q.x2, q.y2])];
  return { segs: out, outline };
}
