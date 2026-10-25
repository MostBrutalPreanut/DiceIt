// SVG drawing kit for the concept art: an oblique 3/4 projection over the sim's own coordinates,
// sticker-style props (thick outer contour, thin inner lines, flat cel shading) and the particle set.
import { mat, mix, type Mat, type Theme } from './themes';

/** Sim units → pixels. Ground plane squashed by k and sheared by shx; height z drawn straight up, scaled by kz. */
export interface View { S: number; ox: number; oy: number; k: number; kz: number; shx: number; lw: number }
export type Pt = [number, number];

export const f = (n: number) => (Math.round(n * 10) / 10).toString();
export const P = (v: View, x: number, y: number, z = 0): Pt => [v.ox + (x + y * v.shx) * v.S, v.oy - (y * v.k + z * v.kz) * v.S];
export const poly = (pts: Pt[]) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
export const line = (pts: Pt[]) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L');
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export const ring = (x: number, y: number, r: number, n = 36, ry = r): [number, number][] =>
  Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * ry]);
export const box = (x: number, y: number, hw: number, hh: number, a: number, round = 0): [number, number][] => {
  const c = Math.cos(a), s = Math.sin(a);
  const local: [number, number][] = round > 0
    ? [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sy], q) => Array.from({ length: 5 }, (_, i) => {
      const t = (q * Math.PI) / 2 + (i / 4) * (Math.PI / 2);
      return [sx * (hw - round) + Math.cos(t) * round, sy * (hh - round) + Math.sin(t) * round] as [number, number];
    }))
    : [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
  return local.map(([u, w]) => [x + u * c - w * s, y + u * s + w * c]);
};

/**
 * A prop is drawn in two passes so it reads like a sticker: first every face in ink with a thick
 * stroke (the outer contour), then the coloured faces with a thin ink line.
 */
export class Prop {
  sil: string[] = [];
  body: string[] = [];
  constructor(public v: View, public t: Theme) {}
  face(d: string, fill: string, opts: { line?: number; sil?: boolean; extra?: string } = {}) {
    if (opts.sil !== false) this.sil.push(d);
    const w = (opts.line ?? 0.45) * this.v.lw;
    this.body.push(`<path d="${d}" fill="${fill}"${w > 0 ? ` stroke="${this.t.ink}" stroke-width="${f(w)}" stroke-linejoin="round"` : ''}${opts.extra ?? ''}/>`);
  }
  raw(svg: string) { this.body.push(svg); }
  svg() {
    const lw = this.v.lw;
    return `<g>${this.sil.map((d) => `<path d="${d}" fill="${this.t.ink}" stroke="${this.t.ink}" stroke-width="${f(lw * 2)}" stroke-linejoin="round"/>`).join('')}${this.body.join('')}</g>`;
  }

  /** Vertical cylinder of radius r standing on z0, height h, with a cel shade band and a highlight. */
  cyl(x: number, y: number, r: number, z0: number, h: number, m: Mat, opts: { top?: string; ry?: number } = {}) {
    const v = this.v, ry = opts.ry ?? r;
    const bot = ring(x, y, r, 40, ry).map(([a, b]) => P(v, a, b, z0));
    const top = ring(x, y, r, 40, ry).map(([a, b]) => P(v, a, b, z0 + h));
    if (h > 0.001) {
      const cx = P(v, x, y, z0)[0], rx = r * v.S;
      this.face(poly(hull([...bot, ...top])), m.base);
      const band = (lo: number, hi: number) => hull([...bot, ...top].filter((p) => p[0] >= cx + lo * rx && p[0] <= cx + hi * rx));
      this.face(poly(band(0.35, 1.01)), m.shade, { line: 0, sil: false });
      this.face(poly(band(-0.72, -0.48)), m.light, { line: 0, sil: false });
      this.face(poly(hull([...bot, ...top])), 'none', { sil: false });
    }
    this.face(poly(top), opts.top ?? m.base);
    return top;
  }

  /** Extrudes a ground footprint (sim coords) straight up; only the faces turned towards the viewer are drawn. */
  prism(pts: [number, number][], z0: number, h: number, m: Mat, opts: { top?: string } = {}) {
    const v = this.v;
    const bot = pts.map(([a, b]) => P(v, a, b, z0));
    const top = pts.map(([a, b]) => P(v, a, b, z0 + h));
    let area = 0;
    for (let i = 0; i < bot.length; i++) { const a = bot[i], b = bot[(i + 1) % bot.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    // outline pass = top face + visible sides (not the hull, which would fill concave notches)
    this.sil.push(poly(top));
    for (let i = 0; i < bot.length; i++) {
      const j = (i + 1) % bot.length, a = bot[i], b = bot[j];
      const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
      const nx = (ey / len) * sgn, ny = (-ex / len) * sgn; // outward normal in screen space
      if (ny <= 0.02) continue;
      const fill = nx > 0.35 ? m.shade : nx < -0.35 ? m.light : m.mid;
      this.sil.push(poly([a, b, top[j], top[i]]));
      this.face(poly([a, b, top[j], top[i]]), fill, { sil: false, line: 0.35 });
    }
    this.face(poly(top), opts.top ?? m.base, { sil: false });
    return top;
  }
}

export const shadow = (v: View, t: Theme, x: number, y: number, rx: number, ry: number, a = 0.2) => {
  const [X, Y] = P(v, x + 0.25, y - 0.25);
  return `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(rx * v.S)}" ry="${f(ry * v.S * v.k)}" fill="${t.shadeTint}" opacity="${a}"/>`;
};
export const shadowPoly = (v: View, t: Theme, pts: [number, number][], a = 0.2) =>
  `<path d="${poly(pts.map(([x, y]) => P(v, x + 0.3, y - 0.3)))}" fill="${t.shadeTint}" opacity="${a}"/>`;

/** A label stuck on the top of a part (the live value). Flat sticker, rotated a hair for life. */
export function valueTag(v: View, t: Theme, x: number, y: number, z: number, text: string, color = t.paper) {
  const [X, Y] = P(v, x, y, z);
  const fs = Math.max(9, v.S * 0.62), w = fs * (0.62 * text.length + 0.9), h = fs * 1.35;
  return `<g transform="translate(${f(X)} ${f(Y)}) rotate(-4)"><rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${color}" stroke="${t.ink}" stroke-width="${f(v.lw * 0.7)}"/>` +
    `<text y="${f(fs * 0.36)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(fs)}" fill="${t.ink}">${esc(text)}</text></g>`;
}

// ---------------------------------------------------------------- particles
// Rules (docs/art-direction.md §5): particles are stickers too. Solid fills and an ink outline, they
// die by shrinking rather than fading, and only "air" (smoke, glow, trails) is soft and outline-free.

export const star = (cx: number, cy: number, R: number, r: number, n: number, rot = 0): Pt[] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });

export function impact(t: Theme, cx: number, cy: number, R: number, color: string, lw: number, rot = 0.2) {
  const outer = star(cx, cy, R, R * 0.55, 7, rot), inner = star(cx, cy, R * 0.55, R * 0.3, 7, rot + 0.2);
  return `<path d="${poly(outer)}" fill="${color}" stroke="${t.ink}" stroke-width="${f(lw)}" stroke-linejoin="round"/>` +
    `<path d="${poly(inner)}" fill="${t.paper}"/>`;
}
export function sparkle(t: Theme, cx: number, cy: number, R: number, color: string, lw: number) {
  const pts = star(cx, cy, R, R * 0.28, 4, -Math.PI / 2);
  return `<path d="${poly(pts)}" fill="${color}" stroke="${t.ink}" stroke-width="${f(lw * 0.8)}" stroke-linejoin="round"/>`;
}
export function puff(t: Theme, cx: number, cy: number, r: number, lw: number, color = t.paper) {
  const blobs: [number, number, number][] = [[0, 0, r], [-r * 0.85, r * 0.25, r * 0.7], [r * 0.85, r * 0.3, r * 0.65], [r * 0.1, -r * 0.6, r * 0.6]];
  const c = (b: [number, number, number], ex = 0) => `<circle cx="${f(cx + b[0])}" cy="${f(cy + b[1])}" r="${f(b[2] + ex)}"`;
  return blobs.map((b) => `${c(b, lw)} fill="${t.ink}"/>`).join('') + blobs.map((b) => `${c(b)} fill="${color}"/>`).join('') +
    `<path d="M${f(cx - r * 1.2)} ${f(cy + r * 0.5)}q${f(r * 1.2)} ${f(r * 0.6)} ${f(r * 2.3)} 0" stroke="${mix(color, t.shadeTint, 0.35)}" stroke-width="${f(lw * 1.4)}" fill="none" stroke-linecap="round"/>`;
}
export function coin(t: Theme, cx: number, cy: number, r: number, squash: number, lw: number) {
  const gold = t.role.coin, rx = Math.max(r * Math.abs(squash), r * 0.12);
  return `<ellipse cx="${f(cx + r * 0.12)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(r)}" fill="${mix(gold, t.shadeTint, 0.4)}" stroke="${t.ink}" stroke-width="${f(lw)}"/>` +
    `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(r)}" fill="${gold}" stroke="${t.ink}" stroke-width="${f(lw)}"/>` +
    (Math.abs(squash) > 0.5 ? `<text x="${f(cx)}" y="${f(cy + r * 0.38)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(r * 1.1)}" fill="${t.ink}" transform="translate(${f(cx)} 0) scale(${f(Math.abs(squash))} 1) translate(${f(-cx)} 0)">$</text>` : '');
}
export function debris(t: Theme, cx: number, cy: number, s: number, rot: number, lw: number, i = 0) {
  const g = (inner: string) => `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)})">${inner}</g>`;
  const st = `stroke="${t.ink}" stroke-width="${f(lw)}" stroke-linejoin="round"`;
  if (t.debris === 'bolt') {
    const hex = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3) * s, Math.sin((k * Math.PI) / 3) * s] as Pt);
    return g(i % 3 === 2
      ? `<path d="${poly(star(0, 0, s * 1.1, s * 0.75, 6))}" fill="${t.role.pop}" ${st}/><circle r="${f(s * 0.35)}" fill="${t.ink}"/>`
      : `<path d="${poly(hex)}" fill="${t.metal}" ${st}/><circle r="${f(s * 0.4)}" fill="${t.paper}" ${st}/>`);
  }
  if (t.debris === 'pea') {
    return g(i % 3 === 2
      ? `<rect x="${f(-s * 1.2)}" y="${f(-s * 0.4)}" width="${f(s * 2.4)}" height="${f(s * 0.8)}" rx="${f(s * 0.4)}" fill="${t.role.pop}" ${st}/>`
      : `<circle r="${f(s)}" fill="#8ea547" ${st}/><circle cx="${f(-s * 0.35)}" cy="${f(-s * 0.35)}" r="${f(s * 0.3)}" fill="#c6d77a"/>`);
  }
  return g(i % 3 === 2
    ? `<path d="${poly([[-s, -s * 0.6], [s, -s * 0.8], [s * 0.8, s * 0.7], [-s * 0.7, s * 0.6]])}" fill="${t.rail}" ${st}/>`
    : `<path d="M${f(-s * 1.3)} 0Q0 ${f(-s * 1.2)} ${f(s * 1.3)} 0Q0 ${f(s * 1.2)} ${f(-s * 1.3)} 0Z" fill="#7aa83f" ${st}/><path d="M${f(-s)} 0H${f(s)}" stroke="${t.ink}" stroke-width="${f(lw * 0.6)}"/>`);
}
/** Airy ribbon (smoke, trails): a tapered stroke along a path, no outline, like the castle reference's smoke. */
export function ribbon(pts: Pt[], w0: number, w1: number, fill: string, opacity = 1) {
  const L: Pt[] = [], R: Pt[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    L.push([p[0] - (dy / len) * w, p[1] + (dx / len) * w]);
    R.push([p[0] + (dy / len) * w, p[1] - (dx / len) * w]);
  });
  return `<path d="${poly([...L, ...R.reverse()])}" fill="${fill}" opacity="${opacity}"/>`;
}
export const curl = (x: number, y: number, len: number, amp: number, turns: number, n = 24, dir = 1): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return [x + dir * u * len + Math.sin(u * Math.PI * turns) * amp * u, y - u * len * 0.55 - Math.cos(u * Math.PI * turns) * amp * 0.4 * u];
  });

/** Score popup: a paper sticker with the points in the part's colour and the math line under it. */
export function scoreSticker(t: Theme, x: number, y: number, main: string, sub: string, color: string, scale: number, rot: number) {
  const fs = 30 * scale, fs2 = 13 * scale;
  const w = Math.max(main.length * fs * 0.6, sub.length * fs2 * 0.55) + 26 * scale, h = fs + fs2 + 22 * scale;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">` +
    `<rect x="${f(-w / 2 + 4 * scale)}" y="${f(-h / 2 + 5 * scale)}" width="${f(w)}" height="${f(h)}" rx="${f(12 * scale)}" fill="${t.shadeTint}" opacity="0.25"/>` +
    `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(12 * scale)}" fill="${t.paper}" stroke="${t.ink}" stroke-width="${f(3 * scale)}"/>` +
    `<text y="${f(-h / 2 + fs + 4 * scale)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(fs)}" fill="${color}" stroke="${t.ink}" stroke-width="${f(2.4 * scale)}" paint-order="stroke">${esc(main)}</text>` +
    `<text y="${f(h / 2 - 9 * scale)}" text-anchor="middle" font-family="Fredoka" font-weight="500" font-size="${f(fs2)}" fill="${t.ink}">${esc(sub)}</text></g>`;
}
export function stamp(t: Theme, x: number, y: number, R: number, text: string, color: string, rot: number) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})"><path d="${poly(star(0, 0, R * 1.25, R * 1.02, 14))}" fill="${color}" stroke="${t.ink}" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle r="${f(R * 0.8)}" fill="${t.paper}" stroke="${t.ink}" stroke-width="2.5"/>` +
    `<text y="${f(R * 0.28)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(R * 0.78)}" fill="${t.ink}">${esc(text)}</text></g>`;
}
/** A ground ring under a hit part: sells the contact and stays in the playfield plane. */
export function groundRing(v: View, t: Theme, x: number, y: number, r: number, color: string, w: number) {
  const pts = ring(x, y, r, 48).map(([a, b]) => P(v, a, b, 0.02));
  return `<path d="${poly(pts)}" fill="none" stroke="${t.ink}" stroke-width="${f(w + v.lw * 1.4)}" opacity="0.9"/><path d="${poly(pts)}" fill="none" stroke="${color}" stroke-width="${f(w)}"/>`;
}

export { mat };
