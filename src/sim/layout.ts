import { footprint, makePart, PARTS, type PartId, type PartInstance } from '../data/parts';
import { BUILD_AREA, DEFAULT_GRAVITY } from './constants';
import { clampLedge, LEDGE, ledgeSeg, tableSegments } from './table';

export type { PartInstance };

/**
 * Everything the player owns and has tuned. Plain data: serialisable, diffable, replayable.
 * `parts` holds the whole collection; the ones with `placed: false` are in the inventory.
 */
export interface Layout {
  parts: PartInstance[];
  gravity: number;
  nextUid: number;
  /** Where the wall ledge meets the left wall (absent: the default spot). See LEDGE. */
  ledge?: number;
}

/** Every machine has a Big Boi in the middle that cannot be moved: the mascot, and the table's anchor. */
export const BIG_BOI_AT = { x: 12, y: 36 };
export function bigBoi(uid: number): PartInstance {
  return { ...makePart('mega', uid, BIG_BOI_AT.x, BIG_BOI_AT.y, true), fixed: true };
}

/** Old layouts from before the fixed Big Boi get one, where there is room for it. */
export function ensureBigBoi(l: Layout): boolean {
  if (l.parts.some((p) => p.fixed)) return false;
  if (!canPlace(l, 'mega', BIG_BOI_AT.x, BIG_BOI_AT.y)) return false;
  l.parts.push(bigBoi(l.nextUid++));
  return true;
}

export function starterLayout(): Layout {
  return {
    parts: [makePart('pop', 1, 17, 44.5, true), makePart('pop', 2, 11, 45.5, true), makePart('pop', 3, 6, 42, true), bigBoi(4)],
    gravity: DEFAULT_GRAVITY,
    nextUid: 5,
  };
}

export const placedParts = (l: Layout) => l.parts.filter((p) => p.placed);
export const inventoryParts = (l: Layout) => l.parts.filter((p) => !p.placed);

export function cloneLayout(l: Layout): Layout {
  return { ...l, parts: l.parts.map((p) => ({ ...p, dials: { ...p.dials } })) };
}

const segCache = new Map<number, ReturnType<typeof tableSegments>>();
const segsFor = (ledge: number = LEDGE.default) => {
  let s = segCache.get(ledge);
  if (!s) { s = tableSegments(ledge); segCache.set(ledge, s); }
  return s;
};
function distToSegment(px: number, py: number, s: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

/** Can a part of this type sit at (x, y)? `ignoreUid` lets a part being dragged ignore itself. */
export function canPlace(layout: Layout, id: PartId, x: number, y: number, ignoreUid?: number): boolean {
  const r = footprint(PARTS[id]);
  if (x - r < BUILD_AREA.x0 || x + r > BUILD_AREA.x1 || y - r < BUILD_AREA.y0 || y + r > BUILD_AREA.y1) return false;
  // keep clear of the cabinet walls (the dome and chamfer are not rectangles)
  for (const s of segsFor(layout.ledge)) if (distToSegment(x, y, s) < r + 0.3) return false;
  for (const p of layout.parts) {
    if (!p.placed || p.uid === ignoreUid) continue;
    const min = r + footprint(PARTS[p.def]) + 0.9; // leave room for a ball between parts
    if (Math.hypot(p.x - x, p.y - y) < min) return false;
  }
  return true;
}

/** Can the wall ledge sit at `y`? It must stay on the wall and clear of every placed part. */
export function canPlaceLedge(layout: Layout, y: number): boolean {
  if (y !== clampLedge(y)) return false;
  const s = ledgeSeg(y);
  for (const p of layout.parts) if (p.placed && distToSegment(p.x, p.y, s) < footprint(PARTS[p.def]) + 1.1) return false;
  return true;
}

export function saveLayout(layout: Layout): string {
  return JSON.stringify(layout);
}

export function loadLayout(json: string): Layout | null {
  try {
    const l = JSON.parse(json) as Layout;
    if (!Array.isArray(l.parts) || typeof l.gravity !== 'number' || typeof l.nextUid !== 'number') return null;
    for (const p of l.parts) {
      if (!(p.def in PARTS) || typeof p.placed !== 'boolean' || typeof p.angle !== 'number' || typeof p.dials !== 'object') return null;
    }
    return l;
  } catch {
    return null;
  }
}
