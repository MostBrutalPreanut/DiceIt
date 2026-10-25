import { PARTS, type PartId } from '../data/parts';
import { BUILD_AREA, DEFAULT_GRAVITY } from './constants';

export interface PartInstance {
  uid: number;
  def: PartId;
  x: number;
  y: number;
  kick: number;
}

/** Everything the player builds and tunes. Plain data: serialisable, diffable, replayable. */
export interface Layout {
  parts: PartInstance[];
  gravity: number;
  nextUid: number;
}

export function starterLayout(): Layout {
  const mk = (uid: number, x: number, y: number): PartInstance => ({
    uid,
    def: 'pop',
    x,
    y,
    kick: PARTS.pop.kick.default,
  });
  return {
    parts: [mk(1, 6.5, 26), mk(2, 13.5, 26), mk(3, 10, 21)],
    gravity: DEFAULT_GRAVITY,
    nextUid: 4,
  };
}

export function cloneLayout(l: Layout): Layout {
  return { ...l, parts: l.parts.map((p) => ({ ...p })) };
}

/** Can a part of this type sit at (x, y)? `ignoreUid` lets a part being dragged ignore itself. */
export function canPlace(layout: Layout, def: PartId, x: number, y: number, ignoreUid?: number): boolean {
  const r = PARTS[def].radius;
  if (x - r < BUILD_AREA.x0 || x + r > BUILD_AREA.x1 || y - r < BUILD_AREA.y0 || y + r > BUILD_AREA.y1) {
    return false;
  }
  for (const p of layout.parts) {
    if (p.uid === ignoreUid) continue;
    const min = r + PARTS[p.def].radius + 1.1; // leave room for a ball between parts
    if (Math.hypot(p.x - x, p.y - y) < min) return false;
  }
  return true;
}

export function saveLayout(layout: Layout): string {
  return JSON.stringify(layout);
}

export function loadLayout(json: string): Layout | null {
  try {
    const l = JSON.parse(json) as Layout;
    if (!Array.isArray(l.parts) || typeof l.gravity !== 'number' || typeof l.nextUid !== 'number') return null;
    for (const p of l.parts) if (!(p.def in PARTS)) return null;
    return l;
  } catch {
    return null;
  }
}
