// The Library's locked entries: a part or decal baked as a flat black silhouette, with a little hint cut out of
// its middle (a clock face in the Midnight Clock, a bulb in the Spare Bulb), so look-alikes can be told apart.
// Plain 2D canvas work on the baked icon; the hints are drawn in a 24 x 24 box.
import type { Hint, HintSymbol } from '../data/library';

/** One step of a hint: `add` cuts the shape out of the silhouette, `sub` puts ink back inside a cut. */
type Op = { op: 'add' | 'sub'; d: string; stroke?: number };

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
const poly = (...p: number[]) => `M${p.slice(0, 2).join(' ')}${Array.from({ length: p.length / 2 - 1 }, (_, i) => `L${p[2 + 2 * i]} ${p[3 + 2 * i]}`).join('')}z`;
const star = (n: number, ro: number, ri: number, cx = 12, cy = 12.5) =>
  poly(...Array.from({ length: 2 * n }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }).flat());
const add = (d: string, stroke?: number): Op => ({ op: 'add', d, stroke });
const sub = (d: string, stroke?: number): Op => ({ op: 'sub', d, stroke });

const SYMBOLS: Record<HintSymbol, Op[]> = {
  clock: [add(circle(12, 12, 10)), sub('M12 5.5V12L16.5 14.5', 2.4), sub(circle(12, 12, 1.6))],
  bulb: [add('M12 1.5a7.5 7.5 0 0 0-4.3 13.6V17.5h8.6v-2.4A7.5 7.5 0 0 0 12 1.5z'), add(rect(7.7, 18.6, 8.6, 1.9)), add(rect(9.2, 21.3, 5.6, 1.7))],
  feet: [add(ellipse(7.5, 10, 3.2, 5.2)), add(ellipse(16.5, 14, 3.2, 5.2)), add(circle(6.2, 3.3, 1.2)), add(circle(15.2, 7.3, 1.2)), add(circle(9, 3.6, 1)), add(circle(18, 7.6, 1))],
  coin: [add(circle(12, 12, 10)), sub('M15.5 7.5c-1-1.2-6.5-1.8-6.8 1.4-.3 3.4 7.3 2 7 5.6-.3 3.1-5.6 2.9-7.2 1.4M12 4.5v15', 2.2)],
  eyes: [add(ellipse(7, 12, 4.6, 6.4)), add(ellipse(17, 12, 4.6, 6.4)), sub(circle(8.2, 13.3, 2.2)), sub(circle(15.8, 13.3, 2.2))],
  flame: [add('M12 1.5c1.2 4.2 6.8 6.6 6.8 12.6a6.8 6.8 0 0 1-13.6 0c0-3.2 1.8-5.4 3.2-7.2 0 2.4 1 3.6 2.2 3.8-.4-3.4.2-6.4 1.4-9.2z')],
  shine: [add(ellipse(12, 12, 7.5, 10)), sub('M8 12.5L13 6.5M9.5 17L16.2 9', 1.8)],
  note: [add(circle(6.5, 18, 3.3)), add(circle(17, 16, 3.3)), add(rect(8, 4.5, 2.4, 13.5)), add(rect(18.5, 2.5, 2.4, 13.5)), add(poly(8, 4.5, 20.9, 2.5, 20.9, 6, 8, 8))],
  cup: [add('M5.5 2.5h13v4.5a6.5 6.5 0 0 1-13 0z'), add(rect(10.8, 12.5, 2.4, 5)), add(rect(7, 17.5, 10, 3.5)), add('M5.5 4.5H2.5v1.5a4 4 0 0 0 4 4M18.5 4.5h3v1.5a4 4 0 0 1-4 4', 1.8)],
  bell: [add('M12 2a1.6 1.6 0 0 1 1.6 1.6v.7A6.3 6.3 0 0 1 18.3 10.5v4.3l2.2 2.7H3.5l2.2-2.7v-4.3A6.3 6.3 0 0 1 10.4 4.3v-.7A1.6 1.6 0 0 1 12 2z'), add(circle(12, 20.2, 2.2))],
  bolt: [add(poly(13.5, 1.5, 4, 14, 10.8, 14, 9, 22.5, 20, 9.5, 13.2, 9.5, 15.5, 1.5))],
  crosshair: [add(circle(12, 12, 7), 2.6), add('M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6', 2.6), add(circle(12, 12, 1.8))],
  crown: [add(poly(2.5, 18, 2.5, 6, 8, 11, 12, 3.5, 16, 11, 21.5, 6, 21.5, 18)), add(rect(2.5, 19.3, 19, 2.7))],
  star: [add(star(5, 11, 4.6))],
  sparkle: [add(poly(12, 1, 14.4, 9.6, 23, 12, 14.4, 14.4, 12, 23, 9.6, 14.4, 1, 12, 9.6, 9.6))],
  chevron: [add('M4.5 12.5L12 5l7.5 7.5M4.5 19.5L12 12l7.5 7.5', 3.4)],
  magnet: [add('M6.5 3v9a5.5 5.5 0 0 0 11 0V3', 4.4)],
  egg: [add('M12 2.5c4.2 0 7.3 6.2 7.3 11.4a7.3 7.3 0 0 1-14.6 0C4.7 8.7 7.8 2.5 12 2.5z')],
  moon: [add(circle(12, 12, 10)), sub(circle(17.5, 8.5, 8.4))],
  hat: [add(poly(12, 1.5, 18.5, 17, 5.5, 17)), add(ellipse(12, 18.5, 10.5, 2.6)), sub(star(5, 2.4, 1, 11.5, 11.5))],
  leaf: [add('M3.5 20.5C3.5 9 10.5 3.5 21.5 2.5c-.8 10.6-6.6 18-18 18z'), sub('M5 19L15.5 8.5', 1.7)],
  snow: [add('M12 1.5v21M2.9 6.75l18.2 10.5M2.9 17.25l18.2-10.5', 2.8)],
  drop: [add('M12 1.5S4.8 9.8 4.8 15a7.2 7.2 0 0 0 14.4 0C19.2 9.8 12 1.5 12 1.5z')],
  sun: [add(circle(12, 12, 5)), add(Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a); return `M${12 + 7.5 * c} ${12 + 7.5 * s}L${12 + 11 * c} ${12 + 11 * s}`; }).join(''), 2.4)],
  hourglass: [add(poly(4.5, 1.5, 19.5, 1.5, 19.5, 4, 13.8, 12, 19.5, 20, 19.5, 22.5, 4.5, 22.5, 4.5, 20, 10.2, 12, 4.5, 4))],
  candy: [add(circle(12, 12, 5.6)), add(poly(0.5, 6.5, 7.5, 12, 0.5, 17.5)), add(poly(23.5, 6.5, 16.5, 12, 23.5, 17.5))],
  shield: [add('M12 1.5l8.5 3.2v6.3c0 5.8-3.7 10-8.5 11.6C7.2 21 3.5 16.8 3.5 11V4.7z')],
  fork: [add('M12 22.5V12M12 12.5L4.5 2.5M12 12.5l7.5-10', 3.4)],
  dots: [add(circle(4.5, 12, 3)), add(circle(12, 12, 3)), add(circle(19.5, 12, 3))],
  marbles: [add(circle(12, 6.5, 4.4)), add(circle(6.8, 15.5, 4.4)), add(circle(17.2, 15.5, 4.4))],
  plus: [add(rect(9.2, 2.5, 5.6, 19)), add(rect(2.5, 9.2, 19, 5.6))],
  arrow: [add(poly(12, 1.5, 21.5, 12, 15.5, 12, 15.5, 22.5, 8.5, 22.5, 8.5, 12, 2.5, 12))],
  ring: [add(circle(12, 12, 7.8), 3.6), add(circle(12, 12, 2.4))],
  jar: [add(rect(5.5, 2, 13, 3.2)), add('M7 6.2h10v1.6c2 .9 3.2 2.9 3.2 5v6.2a3 3 0 0 1-3 3H6.8a3 3 0 0 1-3-3v-6.2c0-2.1 1.2-4.1 3.2-5z')],
  duck: [add(ellipse(10.5, 15.5, 8.5, 5.5)), add(circle(16, 8, 4.4)), add(poly(19.6, 6.6, 23.5, 8.6, 19.6, 10.4)), sub(circle(16.8, 7.2, 1.2))],
  receipt: [add('M4.5 1.5h15v21l-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6z'), sub(rect(7.5, 6, 9, 1.8)), sub(rect(7.5, 10, 9, 1.8)), sub(rect(7.5, 14, 6, 1.8))],
};

/** How far each solid pixel is from the shape's edge (two-pass chamfer): the deepest one is where a hint fits best. */
function deepest(alpha: Uint8ClampedArray, w: number, h: number): { x: number; y: number; r: number } {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = alpha[i * 4 + 3] > 170 ? INF : 0;
  const D = 1, DD = Math.SQRT2;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + D, at(x, y - 1) + D, at(x - 1, y - 1) + DD, at(x + 1, y - 1) + DD);
  }
  let best = { x: w / 2, y: h / 2, r: 0 };
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + D, at(x, y + 1) + D, at(x + 1, y + 1) + DD, at(x - 1, y + 1) + DD);
    if (d[i] > best.r) best = { x, y, r: d[i] };
  }
  return best;
}

/** The hint drawn white on clear, in a size x size box: what gets cut out of the silhouette. */
function hintMask(hint: Hint, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(1, Math.ceil(size));
  const g = c.getContext('2d')!;
  g.scale(size / 24, size / 24);
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineCap = g.lineJoin = 'round';
  if (typeof hint === 'object') {
    // letters in the display face, as big as fit the box
    const text = hint.text;
    let px = 22;
    g.font = `400 ${px}px "Luckiest Guy", "Arial Black", sans-serif`;
    const wide = g.measureText(text).width;
    if (wide > 22) { px *= 22 / wide; g.font = `400 ${px}px "Luckiest Guy", "Arial Black", sans-serif`; }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 12, 12 + px * 0.08);
    return c;
  }
  for (const o of SYMBOLS[hint]) {
    g.globalCompositeOperation = o.op === 'add' ? 'source-over' : 'destination-out';
    const p = new Path2D(o.d);
    if (o.stroke) { g.lineWidth = o.stroke; g.stroke(p); } else g.fill(p);
  }
  return c;
}

/**
 * A baked icon as a flat silhouette in `ink` (its soft shadow stays soft), with `hint` cut out of the middle of its
 * thickest part. Shapes too thin for a hint (a flipper, a rail) keep only their outline.
 */
export function silhouette(src: HTMLCanvasElement, hint?: Hint, ink = '#1d1822'): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = ink;
  g.fillRect(0, 0, w, h);
  if (!hint) return c;
  const spot = deepest(g.getImageData(0, 0, w, h).data, w, h);
  // the hint fills most of the largest circle that fits inside the shape, and is left off when that is tiny
  const size = Math.min(spot.r * 1.6, Math.min(w, h) * 0.5);
  if (size < Math.min(w, h) * 0.16) return c;
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(hintMask(hint, size), Math.round(spot.x - size / 2), Math.round(spot.y - size / 2));
  return c;
}
