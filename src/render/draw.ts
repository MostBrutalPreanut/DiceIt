// The drawing kit (ported from tools/concept/draw.ts): an oblique 3/4 projection over the sim's own
// coordinates, sticker-style props (thick outer contour, thin inner lines, flat cel shading) drawn with
// Pixi Graphics. Everything takes its colours from the theme.
import { Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { mat, mix, type Mat, type Theme } from './theme';

/** Sim units -> pixels. Ground plane squashed by k and sheared by shx; height z drawn straight up, scaled by kz. */
export interface View { S: number; ox: number; oy: number; k: number; kz: number; shx: number; lw: number }
export type Pt = [number, number];

/** Typography (the goofy pairing): a display face for big bold things, a UI face for reading, a DMD face. */
export const TYPE = { display: 'Luckiest Guy', ui: 'Nunito', dmd: 'DotGothic16' };

export const P = (v: View, x: number, y: number, z = 0): Pt => [v.ox + (x + y * v.shx) * v.S, v.oy - (y * v.k + z * v.kz) * v.S];
/** The inverse of P on the floor plane (z = 0): screen point -> sim point. Pointer picking uses it. */
export const unP = (v: View, sx: number, sy: number): Pt => {
  const y = (v.oy - sy) / (v.k * v.S);
  return [(sx - v.ox) / v.S - y * v.shx, y];
};
export const flat = (pts: Pt[]) => pts.flat();

export function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export const ring = (x: number, y: number, r: number, n = 36, ry = r): Pt[] =>
  Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * ry]);
export const box = (x: number, y: number, hw: number, hh: number, a: number, round = 0): Pt[] => {
  const c = Math.cos(a), s = Math.sin(a);
  const local: Pt[] = round > 0
    ? [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sy], q) => Array.from({ length: 5 }, (_, i) => {
      const t = (q * Math.PI) / 2 + (i / 4) * (Math.PI / 2);
      return [sx * (hw - round) + Math.cos(t) * round, sy * (hh - round) + Math.sin(t) * round] as Pt;
    }))
    : [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
  return local.map(([u, w]) => [x + u * c - w * s, y + u * s + w * c]);
};
export const star = (cx: number, cy: number, R: number, r: number, n: number, rot = 0): Pt[] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });

type Op = (g: Graphics) => void;

/**
 * A prop is drawn in two passes so it reads like a sticker: first every face in ink with a thick
 * stroke (the outer contour), then the coloured faces with a thin ink line.
 */
export class Prop {
  private sil: Pt[][] = [];
  private ops: Op[] = [];
  constructor(public v: View, public t: Theme) {}

  face(pts: Pt[], fill: string | null, opts: { line?: number; sil?: boolean; alpha?: number } = {}) {
    if (opts.sil !== false) this.sil.push(pts);
    const w = (opts.line ?? 0.45) * this.v.lw, ink = this.t.ink;
    this.ops.push((g) => {
      g.poly(flat(pts));
      if (fill) g.fill({ color: fill, alpha: opts.alpha ?? 1 });
      if (w > 0) g.stroke({ width: w, color: ink, join: 'round' });
    });
  }
  /** Anything else (dots, wires, highlights), drawn in order with the faces. */
  op(f: Op) { this.ops.push(f); }
  /** Adds an outline-only silhouette (for raw ops that should still get the sticker contour). */
  silhouette(pts: Pt[]) { this.sil.push(pts); }

  draw(g: Graphics) {
    const lw = this.v.lw, ink = this.t.ink;
    for (const s of this.sil) g.poly(flat(s)).fill(ink).stroke({ width: lw * 2, color: ink, join: 'round' });
    for (const o of this.ops) o(g);
  }

  /** Vertical cylinder of radius r standing on z0, height h, with a cel shade band and a highlight. */
  cyl(x: number, y: number, r: number, z0: number, h: number, m: Mat, opts: { top?: string; ry?: number; n?: number } = {}): Pt[] {
    const v = this.v, ry = opts.ry ?? r, n = opts.n ?? 32;
    const bot = ring(x, y, r, n, ry).map(([a, b]) => P(v, a, b, z0));
    const top = ring(x, y, r, n, ry).map(([a, b]) => P(v, a, b, z0 + h));
    if (h * v.kz * v.S > 0.6) {
      const cx = P(v, x, y, z0)[0], rx = r * v.S;
      const all = [...bot, ...top];
      this.face(hull(all), m.base);
      const band = (lo: number, hi: number) => hull(all.filter((p) => p[0] >= cx + lo * rx && p[0] <= cx + hi * rx));
      const sh = band(0.35, 1.01), li = band(-0.72, -0.48);
      if (sh.length > 2) this.face(sh, m.shade, { line: 0, sil: false });
      if (li.length > 2) this.face(li, m.light, { line: 0, sil: false });
      this.face(hull(all), null, { sil: false });
    }
    this.face(top, opts.top ?? m.base);
    return top;
  }

  /** Extrudes a ground footprint (sim coords) straight up; only the faces turned towards the viewer are drawn. */
  prism(pts: Pt[], z0: number, h: number, m: Mat, opts: { top?: string } = {}): Pt[] {
    const v = this.v;
    const bot = pts.map(([a, b]) => P(v, a, b, z0));
    const top = pts.map(([a, b]) => P(v, a, b, z0 + h));
    let area = 0;
    for (let i = 0; i < bot.length; i++) { const a = bot[i], b = bot[(i + 1) % bot.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    // outline pass = top face + visible sides (not the hull, which would fill concave notches)
    this.sil.push(top);
    for (let i = 0; i < bot.length; i++) {
      const j = (i + 1) % bot.length, a = bot[i], b = bot[j];
      const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
      const nx = (ey / len) * sgn, ny = (-ex / len) * sgn; // outward normal in screen space
      if (ny <= 0.02 || h * v.kz * v.S < 0.4) continue;
      const fill = nx > 0.35 ? m.shade : nx < -0.35 ? m.light : m.mid;
      const q: Pt[] = [a, b, top[j], top[i]];
      this.sil.push(q);
      this.face(q, fill, { sil: false, line: 0.35 });
    }
    this.face(top, opts.top ?? m.base, { sil: false });
    return top;
  }
}

export const shadow = (g: Graphics, v: View, t: Theme, x: number, y: number, rx: number, ry: number, a = 0.2) => {
  const [X, Y] = P(v, x + 0.25, y - 0.25);
  g.ellipse(X, Y, rx * v.S, ry * v.S * v.k).fill({ color: t.shadeTint, alpha: a });
};
export const shadowPoly = (g: Graphics, v: View, t: Theme, pts: Pt[], a = 0.2) => {
  g.poly(flat(pts.map(([x, y]) => P(v, x + 0.3, y - 0.3)))).fill({ color: t.shadeTint, alpha: a });
};

/** Airy ribbon (smoke, trails): a tapered band along a path, no outline. */
export function ribbon(g: Graphics, pts: Pt[], w0: number, w1: number, fill: string, alpha = 1) {
  if (pts.length < 2) return;
  const L: Pt[] = [], R: Pt[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    L.push([p[0] - (dy / len) * w, p[1] + (dx / len) * w]);
    R.push([p[0] + (dy / len) * w, p[1] - (dx / len) * w]);
  });
  g.poly(flat([...L, ...R.reverse()])).fill({ color: fill, alpha });
}
export const curl = (x: number, y: number, len: number, amp: number, turns: number, n = 24, dir = 1): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return [x + dir * u * len + Math.sin(u * Math.PI * turns) * amp * u, y - u * len * 0.55 - Math.cos(u * Math.PI * turns) * amp * 0.4 * u];
  });

/** A stroked polyline (open), ink underneath and a colour on top: wires, rails, pipes. */
export function inkLine(g: Graphics, pts: Pt[], w: number, color: string, ink: string, lw: number, cap: 'round' | 'butt' = 'round') {
  for (const [width, c] of [[w + lw * 2, ink], [w, color]] as const) {
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke({ width, color: c, cap, join: 'round' });
  }
}

/** A Text in one of the three faces. Luckiest Guy is never bolded: it has one weight. */
export function label(s: string, size: number, fill: string, opts: { face?: 'display' | 'ui' | 'dmd'; weight?: TextStyleOptions['fontWeight']; stroke?: string; strokeW?: number; anchorY?: number; spacing?: number } = {}) {
  const face = opts.face ?? 'display';
  const t = new Text({
    text: s,
    resolution: 2,
    style: {
      fontFamily: TYPE[face], fontSize: size, fill, fontWeight: face === 'ui' ? (opts.weight ?? '700') : '400', letterSpacing: opts.spacing ?? 0,
      ...(opts.stroke ? { stroke: { color: opts.stroke, width: opts.strokeW ?? size * 0.16, join: 'round' as const } } : {}),
    },
  });
  // Luckiest Guy sits high on its baseline: the anchor nudges it down ~6% (art-direction §9)
  t.anchor.set(0.5, opts.anchorY ?? (face === 'display' ? 0.44 : 0.5));
  return t;
}

export { mat, mix };
