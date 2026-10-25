// Composes the concept sheets from the real table geometry and part data, then renders them to PNG.
//   npx vite-node tools/concept/scenes.ts [outDir]      (default docs/concept)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PARTS, type PartId } from '../../src/data/parts';
import { LANE_WALL_X, TABLE_H, TABLE_W } from '../../src/sim/constants';
import { FLIPPER_PIVOTS, tableOutline, tableSegments } from '../../src/sim/table';
import {
  box, coin, curl, debris, esc, f, groundRing, impact, line, P, poly, Prop, puff, ribbon, ring, scoreSticker, shadow, sparkle, stamp, type Pt, type View,
} from './draw';
import { ball, drawPart, flipper, glowDisk, type PartState } from './props';
import { CASTLE, DINER, FACTORY, mat, mix, THEMES, type Theme } from './themes';

const OUT = process.argv[2] || 'docs/concept';

// ------------------------------------------------------------------ the playfield
interface Placed { id: PartId; x: number; y: number; a?: number; st?: PartState }

/** A mid-run build on the real table: the three starter pops plus a dozen bought parts. */
const BUILD: Placed[] = [
  { id: 'lane', x: 9.6, y: 48.4, st: { lit: true } }, { id: 'lane', x: 13, y: 48.9, st: { lit: true } }, { id: 'lane', x: 16.4, y: 48.4 },
  { id: 'pop', x: 17, y: 44.5, st: { value: '115' } }, { id: 'pop', x: 11, y: 45.5, st: { value: '115', hit: true } }, { id: 'pop', x: 6, y: 42, st: { value: '115' } },
  { id: 'printer', x: 19.8, y: 39.6, a: 0, st: { smoke: true, value: '200' } },
  { id: 'coin', x: 18.6, y: 33.6 }, { id: 'coin', x: 5.6, y: 35.4 },
  { id: 'mega', x: 12, y: 34.2, st: { value: '275', face: 'oof', hit: true } },
  { id: 'deflector', x: 2.6, y: 30.5, a: 1.0 },
  { id: 'lamp', x: 16.8, y: 27.6, st: { lit: true, glow: 5 } },
  { id: 'uplight', x: 3.4, y: 25.4, st: { lit: true } }, { id: 'uplight', x: 7.6, y: 27.2 },
  { id: 'spinner', x: 21.4, y: 24.5, a: 1.35 },
  { id: 'bank', x: 12, y: 22.4, a: 0, st: { down: [1] } },
  { id: 'sling', x: 4.4, y: 17.6, a: -1.05 }, { id: 'sling', x: 19.6, y: 17.6, a: 1.05 },
];

const floorPoly = (): [number, number][] => [...tableOutline(), [TABLE_W, 0], [0, 0]];
const apronPoly = (): [number, number][] => [
  [0, 0], [0, 14], [FLIPPER_PIVOTS.L.x + 0.36, FLIPPER_PIVOTS.L.y + 0.62], [8.6, 3.2], [15.4, 3.2],
  [FLIPPER_PIVOTS.R.x - 0.36, FLIPPER_PIVOTS.R.y + 0.62], [LANE_WALL_X, 14], [LANE_WALL_X, 0],
];

function floorArt(v: View, t: Theme, clip: string) {
  const out: string[] = [`<g clip-path="url(#${clip})">`];
  const at = (x: number, y: number) => P(v, x, y);
  const quad = (x0: number, y0: number, x1: number, y1: number) => poly([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]);
  out.push(`<path d="${poly(floorPoly().map(([x, y]) => at(x, y)))}" fill="${t.floor}"/>`);
  if (t.floorArt === 'plates') {
    for (let x = 0; x < TABLE_W; x += 4) for (let y = 0; y < TABLE_H; y += 4) {
      if ((x / 4 + y / 4) % 2 === 0) out.push(`<path d="${quad(x, y, x + 4, y + 4)}" fill="${t.floor2}"/>`);
      const [X, Y] = at(x + 0.4, y + 0.4);
      out.push(`<circle cx="${f(X)}" cy="${f(Y)}" r="${f(v.S * 0.09)}" fill="${mix(t.floor2, t.shadeTint, 0.35)}"/>`);
    }
    // a painted gear behind the centre and hazard stripes leading to the drain
    const gear = ring(12, 34, 7.2, 48).map(([x, y], i) => { const k = i % 4 < 2 ? 1 : 0.86; return at(12 + (x - 12) * k, 34 + (y - 34) * k); });
    out.push(`<path d="${poly(gear)}" fill="none" stroke="${mix(t.floor2, t.shadeTint, 0.25)}" stroke-width="${f(v.S * 0.5)}" stroke-linejoin="round"/>`);
    for (let x = -4; x < TABLE_W; x += 1.6) out.push(`<path d="${poly([at(x, 3.2), at(x + 0.8, 3.2), at(x + 2.2, 6.2), at(x + 1.4, 6.2)])}" fill="${t.ink}" opacity="0.85"/>`);
    for (let x = -4; x < TABLE_W; x += 1.6) out.push(`<path d="${poly([at(x + 0.8, 3.2), at(x + 1.6, 3.2), at(x + 3, 6.2), at(x + 2.2, 6.2)])}" fill="${t.role.coin}"/>`);
  } else if (t.floorArt === 'checker') {
    for (let x = 0; x < TABLE_W; x += 2) for (let y = 0; y < 21; y += 2) if ((x + y) % 4 === 0) out.push(`<path d="${quad(x, y, x + 2, y + 2)}" fill="${t.paper}"/>`);
    for (let x = 0; x < TABLE_W; x += 2) for (let y = 0; y < 21; y += 2) if ((x + y) % 4 !== 0) out.push(`<path d="${quad(x, y, x + 2, y + 2)}" fill="#5e8c8a"/>`);
    // awning stripes just inside the dome, and a giant painted plate in the middle
    const dome = (rr: number, a: number) => at(13 + Math.cos(a) * 13 * rr, 40 + Math.sin(a) * 12 * rr);
    for (let i = 0; i < 18; i++) {
      const a0 = Math.PI * (i / 18), a1 = Math.PI * ((i + 1) / 18);
      out.push(`<path d="${poly([dome(1.02, a0), dome(1.02, a1), dome(0.86, a1), dome(0.86, a0)])}" fill="${i % 2 ? t.paper : t.accent}"/>`);
    }
    for (const [rr, c] of [[7.6, t.paper], [6.4, mix(t.paper, t.shadeTint, 0.12)], [5.9, t.paper]] as const)
      out.push(`<path d="${poly(ring(12, 33.5, rr, 48).map(([x, y]) => at(x, y)))}" fill="${c}" stroke="${t.ink}" stroke-width="${f(v.lw * 0.5)}"/>`);
  } else {
    const rnd = rng(7);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * TABLE_W, y = rnd() * TABLE_H, r = 0.8 + rnd() * 2;
      out.push(`<path d="${poly(ring(x, y, r, 14, r * 0.7).map(([a, b]) => at(a, b)))}" fill="${t.floor2}"/>`);
    }
    // a cobbled path from the flippers to the keep
    const path: Pt[] = [[12, 3], [11.4, 9], [12.8, 15], [11.6, 21], [12.4, 28], [12, 34]];
    for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < 6; k++) {
      const u = k / 6, x = path[i][0] + (path[i + 1][0] - path[i][0]) * u, y = path[i][1] + (path[i + 1][1] - path[i][1]) * u;
      for (const dx of [-0.85, 0.85]) {
        const sx = x + dx + (rnd() - 0.5) * 0.3, sy = y + (rnd() - 0.5) * 0.3;
        out.push(`<path d="${poly(ring(sx, sy, 0.62, 8, 0.46).map(([a, b]) => at(a, b)))}" fill="${t.rail}" stroke="${t.ink}" stroke-width="${f(v.lw * 0.35)}"/>`);
      }
    }
    for (let i = 0; i < 40; i++) {
      const [X, Y] = at(rnd() * TABLE_W, rnd() * TABLE_H);
      out.push(`<circle cx="${f(X)}" cy="${f(Y)}" r="${f(v.S * 0.12)}" fill="${i % 3 ? '#fff6e0' : '#ffd36e'}"/>`);
    }
  }
  // unlit arrow inserts up the middle: the playfield's own "where to shoot" language
  for (let i = 0; i < 3; i++) {
    const y = 10.5 + i * 1.6, pts = [[12, y + 0.9], [12.9, y], [12.5, y], [12.5, y - 0.4], [11.5, y - 0.4], [11.5, y], [11.1, y]] as [number, number][];
    out.push(`<path d="${poly(pts.map(([x, yy]) => at(x, yy)))}" fill="${i === 0 ? t.accent : mix(t.accent, t.shadeTint, 0.5)}" stroke="${t.ink}" stroke-width="${f(v.lw * 0.4)}"/>`);
  }
  out.push('</g>');
  return out.join('');
}

/** The walls as continuous rails: stacked strokes from the floor to the rail top, ink first. */
function rails(v: View, t: Theme) {
  const segs = tableSegments(), m = mat(t, t.rail), w = 0.48 * v.S, h = 0.75, steps = 5;
  const chains: Pt[][] = [];
  for (const s of segs) {
    const last = chains[chains.length - 1];
    if (last && Math.hypot(last[last.length - 1][0] - s.x1, last[last.length - 1][1] - s.y1) < 1e-6) last.push([s.x2, s.y2]);
    else chains.push([[s.x1, s.y1], [s.x2, s.y2]]);
  }
  const st = (z: number, width: number, color: string) => chains.map((c) =>
    `<path d="${line(c.map(([x, y]) => P(v, x, y, z)))}" fill="none" stroke="${color}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  let o = '';
  for (let i = 0; i <= steps; i++) o += st((h * i) / steps, w + v.lw * 2, t.ink);
  for (let i = 0; i < steps; i++) o += st((h * i) / steps, w, m.shade);
  o += st(h, w, m.base) + st(h + 0.04, w * 0.3, m.light);
  return o;
}

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function playfield(v: View, t: Theme, build: Placed[], fx = true): string {
  const clip = 'clip_' + t.id + '_' + Math.round(v.S);
  const out: string[] = [];
  out.push(`<defs><clipPath id="${clip}"><path d="${poly(floorPoly().map(([x, y]) => P(v, x, y)))}"/></clipPath></defs>`);
  // the cabinet rim around the field (ground level)
  const rimPts = box(13, 26.1, 14.6, 27.5, 0, 1.2);
  out.push(`<path d="${poly(rimPts.map(([x, y]) => P(v, x, y)))} ${poly(floorPoly().map(([x, y]) => P(v, x, y)))}" fill-rule="evenodd" fill="${t.rim}" stroke="${t.ink}" stroke-width="${f(v.lw * 1.4)}"/>`);
  out.push(floorArt(v, t, clip));
  out.push(`<path d="${poly(floorPoly().map(([x, y]) => P(v, x, y)))}" fill="none" stroke="${t.ink}" stroke-width="${f(v.lw)}"/>`);
  // apron, with a rule card like a real machine
  const apron = new Prop(v, t);
  apron.prism(apronPoly(), 0, 0.5, mat(t, t.rim));
  out.push(apron.svg());
  const [AX, AY] = P(v, 4.3, 5.4, 0.5);
  out.push(`<g transform="translate(${f(AX)} ${f(AY)}) rotate(-2)"><rect x="${f(-v.S * 3)}" y="${f(-v.S * 1.1)}" width="${f(v.S * 6)}" height="${f(v.S * 2.2)}" rx="${f(v.S * 0.3)}" fill="${t.paper}" stroke="${t.ink}" stroke-width="${f(v.lw * 0.6)}"/>` +
    `<text y="${f(v.S * 0.15)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(v.S * 0.78)}" fill="${t.ink}">${esc(t.tagline.split(' ')[0])}</text></g>`);
  const [BX, BY] = P(v, 19.8, 5.4, 0.5);
  out.push(`<g transform="translate(${f(BX)} ${f(BY)}) rotate(2)"><rect x="${f(-v.S * 3)}" y="${f(-v.S * 1.1)}" width="${f(v.S * 6)}" height="${f(v.S * 2.2)}" rx="${f(v.S * 0.3)}" fill="${t.paper}" stroke="${t.ink}" stroke-width="${f(v.lw * 0.6)}"/>` +
    `<text y="${f(v.S * 0.15)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(v.S * 0.62)}" fill="${t.ink}">3 BALLS · $3 EACH</text></g>`);

  // everything with height goes into one painter's list, far (high y) first
  const items: { y: number; svg: string }[] = [];
  out.push(rails(v, t));
  const plunger = new Prop(v, t);
  plunger.cyl(25, 1.4, 0.45, 0, 0.5, mat(t, t.accent));
  items.push({ y: 1.4, svg: plunger.svg() });
  for (const q of build) items.push({ y: q.y, svg: drawPart(v, t, q.id, q.x, q.y, q.a ?? 0, q.st) });
  items.push({ y: FLIPPER_PIVOTS.L.y, svg: flipper(v, t, FLIPPER_PIVOTS.L.x, FLIPPER_PIVOTS.L.y, 1) });
  items.push({ y: FLIPPER_PIVOTS.R.y, svg: flipper(v, t, FLIPPER_PIVOTS.R.x, FLIPPER_PIVOTS.R.y, -1, true) });

  // balls (multiball from the printer), with their trails under them
  const b1: Pt = [12.9, 42.5], b2: Pt = [9.2, 12.6];
  if (fx) {
    const trail1 = Array.from({ length: 12 }, (_, i) => { const u = i / 11; return P(v, 11.9 + (b1[0] - 11.9) * u + Math.sin(u * 3) * 0.2, 44.2 + (b1[1] - 44.2) * u, 0.5); });
    const trail2 = Array.from({ length: 14 }, (_, i) => { const u = i / 13; return P(v, 13.5 + (b2[0] - 13.5) * u, 19.5 + (b2[1] - 19.5) * u - Math.sin(u * Math.PI) * 0.6, 0.5); });
    items.push({ y: b1[1] + 0.01, svg: ribbon(trail1, v.S * 0.1, v.S * 0.85, t.paper, 0.75) });
    items.push({ y: b2[1] + 0.01, svg: ribbon(trail2, v.S * 0.1, v.S * 0.85, t.paper, 0.75) });
  }
  items.push({ y: b1[1], svg: ball(v, t, b1[0], b1[1]) });
  items.push({ y: b2[1], svg: ball(v, t, b2[0], b2[1]) });
  items.sort((a, b) => b.y - a.y);
  out.push(...items.map((i) => i.svg));

  if (fx) out.push(playfieldFx(v, t));
  return out.join('');
}

/** The frozen moment: a pop just bonked, Big Boi got slapped, a coin is flying to the money counter. */
function playfieldFx(v: View, t: Theme) {
  const o: string[] = [], lw = v.lw;
  const [IX, IY] = P(v, 11.9, 44.6, 0.9);
  o.push(impact(t, IX, IY, v.S * 1.15, t.role.pop, lw * 0.9, 0.3));
  const rnd = rng(11);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.1 - rnd() * Math.PI * 1.1, d = v.S * (1.4 + rnd() * 1.8);
    o.push(debris(t, IX + Math.cos(a) * d, IY + Math.sin(a) * d * 0.8, v.S * (0.17 + rnd() * 0.1), rnd() * 360, lw * 0.55, i));
  }
  o.push(sparkle(t, IX + v.S * 1.6, IY - v.S * 1.4, v.S * 0.5, t.paper, lw));
  o.push(scoreSticker(t, IX - v.S * 3.4, IY - v.S * 2.6, '+165', '115 +50 grown ×1.43', t.role.pop, v.S / 22, -6));
  // Big Boi: puffs and a Mult stamp
  const [MX, MY] = P(v, 12, 34.2, 1.6);
  o.push(puff(t, MX - v.S * 2.3, MY + v.S * 0.4, v.S * 0.45, lw * 0.8));
  o.push(puff(t, MX + v.S * 2.4, MY + v.S * 0.1, v.S * 0.36, lw * 0.8));
  o.push(stamp(t, MX + v.S * 2.9, MY - v.S * 2.2, v.S * 1.05, '×1.5', t.role.mega, 8));
  // a coin popping out of the Cha-Ching bumper
  const [CX, CY] = P(v, 18.6, 33.6, 1.1);
  o.push(coin(t, CX + v.S * 0.4, CY - v.S * 1.4, v.S * 0.42, 0.75, lw * 0.6));
  o.push(sparkle(t, CX + v.S * 1.1, CY - v.S * 2.1, v.S * 0.32, t.role.coin, lw));
  // lit lanes twinkle
  for (const x of [9.6, 13]) { const [LX, LY] = P(v, x, 48.4, 0.1); o.push(sparkle(t, LX + v.S * 0.7, LY - v.S * 0.6, v.S * 0.28, t.paper, lw)); }
  // dust where the drop target fell
  const [DX, DY] = P(v, 12, 22.4, 0.2);
  o.push(puff(t, DX - v.S * 0.4, DY + v.S * 0.1, v.S * 0.3, lw * 0.7));
  return o.join('');
}

// ------------------------------------------------------------------ surroundings (the diorama base)
function surround(v: View, t: Theme): string {
  const items: { y: number; svg: string }[] = [];
  const add = (y: number, svg: string) => items.push({ y, svg });
  if (t.surround === 'factory') {
    for (const [x, y, r, h, c] of [[-5.5, 44, 2.2, 6, t.role.pop], [-4.8, 30, 1.6, 4, t.role.mega], [31.5, 40, 2.4, 7, t.accent], [31, 22, 1.5, 3.5, t.role.pop]] as const) {
      const p = new Prop(v, t);
      add(y, shadow(v, t, x, y, r * 1.1, r * 1.1, 0.25));
      p.cyl(x, y, r, 0, h, mat(t, t.metal));
      p.cyl(x, y, r * 1.02, h * 0.62, h * 0.16, mat(t, c));
      p.cyl(x, y, r * 0.5, h, 0.5, mat(t, t.metal));
      add(y, p.svg());
    }
    const pipe = new Prop(v, t);
    pipe.prism(box(-3, 37, 0.45, 6, 0), 2.2, 0.8, mat(t, t.metal));
    add(36.9, pipe.svg());
  } else if (t.surround === 'diner') {
    for (const [x, y, c, h] of [[-4.5, 42, '#d9473b', 5], [-6.2, 39, '#f2c14e', 4.2], [-4.6, 28, '#7f9c3c', 3.4], [31, 40, '#d9473b', 4.6], [32.5, 37, '#f6efdf', 3], [31.5, 24, '#f2c14e', 3.8]] as const) {
      const p = new Prop(v, t);
      add(y, shadow(v, t, x, y, 1.1, 1.1, 0.25));
      p.cyl(x, y, 1, 0, h, mat(t, c));
      p.cyl(x, y, 0.5, h, 1.0, mat(t, c));
      p.cyl(x, y, 0.56, h + 1, 0.4, mat(t, t.paper));
      add(y, p.svg());
    }
  } else {
    for (const [x, y, s] of [[-5, 44, 1.2], [-6.4, 38, 0.9], [-4.2, 28, 1], [31, 42, 1.3], [32.4, 34, 0.8], [30.8, 22, 1.1]] as const) {
      const p = new Prop(v, t), green = mat(t, '#5b8a3a');
      add(y, shadow(v, t, x, y, 1.6 * s, 1.6 * s, 0.25));
      p.cyl(x, y, 0.35 * s, 0, 1.2 * s, mat(t, '#8b5a35'));
      for (let k = 0; k < 3; k++) {
        const z = (1 + k * 1.5) * s, r = (2 - k * 0.5) * s;
        const base = ring(x, y, r, 20).map(([a, b]) => P(v, a, b, z)), apex = P(v, x, y, z + 2.4 * s);
        p.face(poly(hullOf([...base, apex])), green.base);
        p.face(poly(hullOf([...base.filter((q) => q[0] > P(v, x, y)[0]), apex])), green.shade, { sil: false, line: 0 });
      }
      add(y, p.svg());
    }
  }
  return items.sort((a, b) => b.y - a.y).map((i) => i.svg).join('');
}
const hullOf = (pts: Pt[]) => { // tiny local hull to keep surround self-contained
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};

// ------------------------------------------------------------------ HUD pieces
const card = (t: Theme, x: number, y: number, w: number, h: number, fill = t.paper, r = 18) =>
  `<rect x="${x + 6}" y="${y + 7}" width="${w}" height="${h}" rx="${r}" fill="${t.shadeTint}" opacity="0.28"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${t.ink}" stroke-width="3.5"/>`;
const text = (t: Theme, x: number, y: number, s: string, size: number, opts: { w?: number; fill?: string; anchor?: string; stroke?: string } = {}) =>
  `<text x="${x}" y="${y}" font-family="Fredoka" font-weight="${opts.w ?? 600}" font-size="${size}" fill="${opts.fill ?? t.ink}" text-anchor="${opts.anchor ?? 'start'}"${opts.stroke ? ` stroke="${opts.stroke}" stroke-width="${size * 0.14}" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(s)}</text>`;

function dmd(t: Theme, x: number, y: number, w: number, h: number, msg: string) {
  const id = 'dmd_' + t.id;
  return `<defs><pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#1d1420"/><circle cx="2.5" cy="2.5" r="1.7" fill="#000" opacity="0"/></pattern>` +
    `<mask id="${id}m"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${Array.from({ length: Math.ceil(w / 5) }, (_, i) => `<rect x="${x + i * 5 + 3.6}" y="${y}" width="1.4" height="${h}" fill="#000"/>`).join('')}${Array.from({ length: Math.ceil(h / 5) }, (_, i) => `<rect x="${x}" y="${y + i * 5 + 3.6}" width="${w}" height="1.4" fill="#000"/>`).join('')}</mask></defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#241a26" stroke="${t.ink}" stroke-width="3.5"/>` +
    `<g mask="url(#${id}m)"><text x="${x + w / 2}" y="${y + h * 0.68}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="${h * 0.52}" fill="${t.dmd}" letter-spacing="3">${esc(msg)}</text></g>`;
}

function marquee(t: Theme, x: number, y: number, w: number, h: number, msg: string) {
  const bulbs = [] as string[];
  const n = Math.round(w / 26);
  for (let i = 0; i <= n; i++) for (const yy of [y + 9, y + h - 9]) bulbs.push(`<circle cx="${f(x + 14 + (i * (w - 28)) / n)}" cy="${yy}" r="5" fill="${i % 2 ? t.glow : mix(t.glow, t.shadeTint, 0.45)}" stroke="${t.ink}" stroke-width="2"/>`);
  return card(t, x, y, w, h, t.rim, 16) + bulbs.join('') + dmd(t, x + 22, y + 22, w - 44, h - 44, msg);
}

function partIcon(t: Theme, id: PartId, cx: number, cy: number, S: number) {
  const v: View = { S, ox: cx, oy: cy, k: 0.8, kz: 0.6, shx: 0, lw: Math.max(1.6, S * 0.13) };
  const a = id === 'sling' ? -0.6 : id === 'spinner' || id === 'deflector' ? 0.5 : 0;
  if (id === 'flipper') return flipper({ ...v, ox: cx - 2 * S }, t, 0, 0, 1);
  return drawPart(v, t, id, 0, 0, a, { lit: true, glow: 2.2, value: id === 'pop' ? '100' : undefined, smoke: false });
}

function hudLeft(t: Theme, x: number, y: number) {
  const o: string[] = [card(t, x, y, 300, 880)];
  o.push(text(t, x + 24, y + 58, 'FREE PLAY', 40, { w: 700, fill: t.accent, stroke: t.ink }));
  o.push(`<g transform="translate(${x + 24} ${y + 78})">${card(t, 0, 0, 200, 34, t.role.coin, 17)}${text(t, 100, 24, 'ROUND 4 · MAIN EVENT', 15, { w: 700, anchor: 'middle' })}</g>`);
  o.push(text(t, x + 24, y + 160, 'SCORE', 16, { w: 600, fill: mix(t.ink, t.paper, 0.35) }));
  o.push(text(t, x + 22, y + 218, '12,480', 58, { w: 700 }));
  o.push(`<rect x="${x + 24}" y="${y + 236}" width="252" height="22" rx="11" fill="${mix(t.paper, t.shadeTint, 0.15)}" stroke="${t.ink}" stroke-width="3"/><rect x="${x + 24}" y="${y + 236}" width="${252 * 0.69}" height="22" rx="11" fill="${t.role.pop}" stroke="${t.ink}" stroke-width="3"/>`);
  o.push(text(t, x + 24, y + 284, 'GOAL 18,000', 17, { w: 600 }) + text(t, x + 276, y + 284, 'BALL 2 / 3', 17, { w: 600, anchor: 'end' }));
  // mult, balls, money as three stickers
  const chip = (cx: number, label: string, val: string, c: string, rot: number) =>
    `<g transform="translate(${cx} ${y + 350}) rotate(${rot})">${card(t, -44, -40, 88, 80, c, 16)}${text(t, 0, -12, label, 13, { w: 600, anchor: 'middle' })}${text(t, 0, 26, val, 28, { w: 700, anchor: 'middle' })}</g>`;
  o.push(chip(x + 66, 'MULT', '×1.43', t.role.mega === t.paper ? t.role.lane : mix(t.role.mega, '#ffffff', 0.45), -3));
  o.push(chip(x + 150, 'BALLS', '●●○', mix(t.role.lane, '#ffffff', 0.4), 2));
  o.push(chip(x + 234, 'MONEY', '$11', t.role.coin, -2));
  // the ledger: why it scored
  o.push(text(t, x + 24, y + 450, 'THIS BALL', 16, { w: 600, fill: mix(t.ink, t.paper, 0.35) }));
  const rows: [PartId, string, string][] = [['pop', 'Pop Bumper ×3', '4,210'], ['mega', 'Big Boi', '3,150'], ['bank', 'Drop-Target Bank', '1,880'], ['lane', 'Lane Rollover', '740'], ['coin', 'Cha-Ching', '$5 · 320']];
  rows.forEach(([id, name, pts], i) => {
    const yy = y + 486 + i * 52;
    o.push(`<rect x="${x + 20}" y="${yy - 22}" width="260" height="44" rx="12" fill="${i % 2 ? t.paper : mix(t.paper, t.shadeTint, 0.07)}"/>`);
    o.push(`<circle cx="${x + 42}" cy="${yy}" r="11" fill="${t.role[id]}" stroke="${t.ink}" stroke-width="2.5"/>`);
    o.push(text(t, x + 62, yy + 6, name, 17, { w: 500 }) + text(t, x + 272, yy + 6, pts, 17, { w: 700, anchor: 'end' }));
  });
  o.push(`<g transform="translate(${x + 24} ${y + 790})">${card(t, 0, 0, 252, 60, t.accent, 18)}${text(t, 126, 40, 'CASH OUT  ⇥', 24, { w: 700, anchor: 'middle', fill: t.paper, stroke: t.ink })}</g>`);
  return o.join('');
}

function hudRight(t: Theme, x: number, y: number) {
  const o: string[] = [card(t, x, y, 330, 880)];
  o.push(text(t, x + 24, y + 52, 'SHOP', 32, { w: 700, fill: t.accent, stroke: t.ink }));
  o.push(`<g transform="translate(${x + 214} ${y + 22})">${card(t, 0, 0, 92, 40, t.paper, 14)}${text(t, 46, 27, 'Reroll $1', 15, { w: 600, anchor: 'middle' })}</g>`);
  const offers: PartId[] = ['printer', 'lamp', 'spinner'];
  offers.forEach((id, i) => {
    const def = PARTS[id], yy = y + 86 + i * 196;
    o.push(card(t, x + 18, yy, 294, 178, mix(t.paper, t.role[id], 0.12), 16));
    o.push(`<circle cx="${x + 76}" cy="${yy + 72}" r="44" fill="${mix(t.paper, t.shadeTint, 0.08)}" stroke="${t.ink}" stroke-width="2.5"/>`);
    o.push(partIcon(t, id, x + 76, yy + 82, id === 'spinner' ? 16 : 22));
    o.push(text(t, x + 134, yy + 40, def.name, 21, { w: 700 }));
    o.push(text(t, x + 134, yy + 64, def.blurb.length > 26 ? def.blurb.slice(0, 25) + '…' : def.blurb, 13.5, { w: 500, fill: mix(t.ink, t.paper, 0.3) }));
    o.push(`<g transform="translate(${x + 244} ${yy + 92}) rotate(6)">${card(t, -32, -20, 64, 40, t.role.coin, 20)}${text(t, 0, 9, '$' + def.cost, 22, { w: 700, anchor: 'middle' })}</g>`);
    const recipe = id === 'printer' ? ['Catches a ball, scores 200,', 'prints a second ball.'] : id === 'lamp' ? ['Lit: parts in its glow', 'score +25%.'] : ['10 per spin. Faster', 'balls spin more.'];
    recipe.forEach((r, k) => o.push(text(t, x + 36, yy + 138 + k * 20, r, 15, { w: 500 })));
    o.push(`<rect x="${x + 28}" y="${yy + 122}" width="4" height="40" rx="2" fill="${t.role[id]}"/>`);
  });
  o.push(text(t, x + 24, y + 712, 'INVENTORY', 16, { w: 600, fill: mix(t.ink, t.paper, 0.35) }));
  (['coin', 'deflector', 'uplight'] as PartId[]).forEach((id, i) => {
    o.push(card(t, x + 24 + i * 96, y + 728, 84, 84, t.paper, 14));
    o.push(partIcon(t, id, x + 66 + i * 96, y + 776, id === 'deflector' ? 13 : 18));
  });
  return o.join('');
}

function screen(t: Theme): string {
  const W = 1600, H = 1000;
  const v: View = { S: 16, ox: 592, oy: 942, k: 0.9, kz: 0.55, shx: 0, lw: 2.2 };
  const o: string[] = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  for (let x = 20; x < W; x += 28) for (let y = 20; y < H; y += 28) o.push(`<circle cx="${x}" cy="${y}" r="2" fill="${mix(t.bg, t.shadeTint, 0.18)}"/>`);
  o.push(`<ellipse cx="800" cy="955" rx="300" ry="26" fill="${t.shadeTint}" opacity="0.22"/>`);
  o.push(surround(v, t));
  o.push(playfield(v, t, BUILD));
  o.push(marquee(t, 560, 22, 480, 112, 'BIG BOI SAYS OOF'));
  o.push(hudLeft(t, 22, 60) + hudRight(t, 1248, 60));
  // the coin's flight path to the money counter: the effect points at its consequence
  const [CX, CY] = P(v, 18.6, 33.6, 1.1);
  const arc: Pt[] = Array.from({ length: 30 }, (_, i) => { const u = i / 29; return [CX + (250 - CX) * u, CY - v.S * 1.6 + (410 - CY + v.S * 1.6) * u - Math.sin(u * Math.PI) * 260]; });
  o.push(`<path d="${line(arc)}" fill="none" stroke="${t.ink}" stroke-width="3" stroke-dasharray="2 11" stroke-linecap="round" opacity="0.55"/>`);
  for (const [u, sq] of [[0.3, 0.3], [0.55, 1], [0.8, 0.6]] as const) {
    const p = arc[Math.round(u * 29)];
    o.push(coin(t, p[0], p[1], 12 + u * 6, sq, 2.4));
  }
  o.push(`<text x="${W - 26}" y="${H - 14}" text-anchor="end" font-family="Fredoka" font-weight="500" font-size="14" fill="${mix(t.ink, t.bg, 0.4)}">concept mock-up · ${esc(t.tagline.toLowerCase())} theme · drawn from the real table geometry</text>`);
  return svgDoc(W, H, o.join(''));
}

// ------------------------------------------------------------------ parts sheet
function partsSheet(): string {
  const ids: PartId[] = ['pop', 'coin', 'mega', 'sling', 'spinner', 'bank', 'lane', 'uplight', 'lamp', 'printer', 'deflector', 'flipper'];
  const W = 1560, rowH = 156, blockH = 2 * rowH + 64, H = 90 + THEMES.length * blockH;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#efe8dc"/>`];
  o.push(`<text x="40" y="58" font-family="Fredoka" font-weight="700" font-size="34" fill="#3b2a4a">One silhouette per part · three theme kits</text>`);
  THEMES.forEach((t, b) => {
    const y0 = 90 + b * blockH;
    o.push(card(t, 24, y0, W - 48, blockH - 20, t.bg, 22));
    o.push(text(t, 48, y0 + 40, t.tagline, 24, { w: 700, fill: t.paper, stroke: t.ink }));
    ids.forEach((id, i) => {
      const col = i % 6, row = Math.floor(i / 6), cx = 140 + col * 252, cy = y0 + 70 + row * rowH;
      o.push(card(t, cx - 104, cy, 208, rowH - 16, t.floor, 16));
      const S = id === 'mega' ? 20 : id === 'bank' ? 17 : id === 'flipper' ? 19 : 26;
      const v: View = { S, ox: cx, oy: cy + 86, k: 0.85, kz: 0.6, shx: 0, lw: 2.2 };
      const a = id === 'sling' ? -0.55 : id === 'spinner' ? 0.25 : id === 'deflector' ? 0.4 : 0;
      o.push(id === 'flipper' ? flipper({ ...v, ox: cx - 2.1 * S }, t, 0, 0.6, 1)
        : drawPart(v, t, id, 0, 0, a, { lit: id !== 'uplight', glow: 2.2, value: id === 'pop' ? '100' : id === 'mega' ? '250' : undefined, down: [2], smoke: id === 'printer' }));
      o.push(text(t, cx, cy + rowH - 26, PARTS[id].name, 14, { w: 600, anchor: 'middle' }));
    });
  });
  return svgDoc(W, H, o.join(''));
}

// ------------------------------------------------------------------ particle sheet
function particleSheet(): string {
  const t = FACTORY, W = 1560;
  const frames = [0.45, 1.18, 1, 0.68, 0.3]; // pop in with overshoot, hold, shrink out: stickers never fade
  const rows: { name: string; spec: string[]; draw: (cx: number, cy: number, k: number, i: number) => string }[] = [
    { name: 'Impact star', spec: ['every bumper / sling hit · 1 per hit', 'life 0.18 s · 3 drawn frames', 'part colour + paper core, ink line'],
      draw: (cx, cy, k, i) => impact(t, cx, cy, 34 * k, t.role.pop, 3, i * 0.25) },
    { name: 'Debris', spec: ['3–8 per hit, more with points', 'ballistic arc, spin, bounce once', 'theme shape: bolt · pea · leaf'],
      draw: (cx, cy, k, i) => [FACTORY, DINER, CASTLE].map((th, j) => debris(th, cx - 30 + j * 30, cy - (i === 1 ? 20 : i * 4) + j * 6, 9 * Math.min(1, k + 0.3), i * 50 + j * 40, 2, 0)).join('') },
    { name: 'Puff', spec: ['landing, drop target falls, eject', 'life 0.35 s · grows then shrinks', 'paper fill with a shade crescent'],
      draw: (cx, cy, k) => puff(t, cx, cy, 20 * k, 2.4) },
    { name: 'Coin', spec: ['each $ earned · flies to MONEY', 'flip = squash x: 1 → 0.1 → 1', 'lands with a +$1 tick on the HUD'],
      draw: (cx, cy, _k, i) => coin(t, cx, cy - [0, 18, 26, 18, 0][i], 20, [1, 0.5, 0.12, 0.5, 1][i], 2.6) },
    { name: 'Score sticker', spec: ['every scoring event · size by points', 'slaps on rotated, holds, drifts up', 'shows the math line under the points'],
      draw: (cx, cy, k, i) => scoreSticker(t, cx, cy - i * 4, '+165', '115 +50 ×1.43', t.role.pop, 0.62 * Math.min(1.1, k + 0.2), -6 + i * 1.5) },
    { name: 'Mult stamp', spec: ['Mult goes up · big and rare', 'stamp in at 1.3×, settle, then fly to MULT', 'starburst in the source part colour'],
      draw: (cx, cy, k, i) => stamp(t, cx, cy, 30 * k, '×1.5', t.role.mega, 10 - i * 3) },
    { name: 'Ground ring', spec: ['under every hit part · in the floor plane', 'expands 1 → 1.8 r, line thins', 'sells contact without covering the ball'],
      draw: (cx, cy, k, i) => groundRing({ S: 20, ox: cx, oy: cy, k: 0.55, kz: 0.6, shx: 0, lw: 2 }, t, 0, 0, 0.8 + i * 0.35, t.role.pop, 6 - i) },
    { name: 'Smoke ribbon', spec: ['Ball Printer, kickouts, tilt', 'tapered ribbon, no outline: air is soft', 'curls up and thins, then snaps off'],
      draw: (cx, cy, k, i) => ribbon(curl(cx - 26, cy + 18, 60 * Math.min(1, 0.4 + i * 0.25), 16, 2), 12 * Math.max(0.3, 1 - i * 0.18), 2, '#ffffff', 0.95) + (i === 4 ? '' : `<circle cx="${cx - 26}" cy="${cy + 20}" r="5" fill="${t.ink}" opacity="0"/>`) },
    { name: 'Sparkle', spec: ['lit inserts, level-ups, idle glints', '4-point star, twinkles on twos', 'paper or gold, never a soft dot'],
      draw: (cx, cy, k) => sparkle(t, cx, cy, 22 * k, t.paper, 3) + sparkle(t, cx + 26, cy - 18, 11 * k, t.role.coin, 3) },
  ];
  const rowH = 104, H = 150 + rows.length * rowH;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  o.push(text(t, 40, 60, 'Particles are stickers', 36, { w: 700, fill: t.paper, stroke: t.ink }));
  o.push(text(t, 40, 96, 'solid shapes, ink outline, theme palette · they pop in, hold, and shrink out on a 12 fps step · only air (smoke, glow, trails) is soft', 18, { w: 500 }));
  const fx0 = 640;
  ['spawn', 'overshoot', 'hold', 'shrink', 'gone'].forEach((s, i) => o.push(text(t, fx0 + i * 190, 134, s, 15, { w: 600, anchor: 'middle', fill: mix(t.ink, t.bg, 0.3) })));
  rows.forEach((r, j) => {
    const y = 150 + j * rowH;
    o.push(card(t, 24, y, W - 48, rowH - 12, r.name === 'Smoke ribbon' ? t.rim : j % 2 ? t.paper : mix(t.paper, t.floor, 0.5), 16));
    o.push(text(t, 48, y + 38, r.name, 22, { w: 700 }));
    r.spec.forEach((s, k) => o.push(text(t, 250, y + 26 + k * 21, s, 14.5, { w: 500 })));
    frames.forEach((k, i) => o.push(r.draw(fx0 + i * 190, y + rowH / 2 - 6, k, i)));
  });
  return svgDoc(W, H, o.join(''));
}

// ------------------------------------------------------------------ key art: three themed cabinets
function cabinet(t: Theme, ox: number, oy: number, S: number): string {
  const v: View = { S, ox, oy, k: 0.42, kz: 1, shx: 0.2, lw: 2.4 };
  const o: string[] = [];
  const [GX, GY] = P(v, 13, 26, -27);
  o.push(`<ellipse cx="${f(GX + S * 4)}" cy="${f(GY + S * 2)}" rx="${f(S * 21)}" ry="${f(S * 4.5)}" fill="${t.shadeTint}" opacity="0.25"/>`);
  const body = new Prop(v, t), wood = mat(t, t.rim);
  for (const [lx, ly] of [[-0.4, -0.2], [26.4, -0.2], [26.4, 52.4]] as const) body.cyl(lx, ly, 0.55, -27, 12, mat(t, t.metal));
  o.push(body.svg());
  const cab = new Prop(v, t);
  cab.prism(box(13, 26.1, 14.6, 27.5, 0, 0.6), -15.5, 15.5, wood, { top: wood.base });
  o.push(cab.svg());
  // coin door and flipper button on the front face
  const door = [P(v, 9.5, -1.4, -4), P(v, 16.5, -1.4, -4), P(v, 16.5, -1.4, -12), P(v, 9.5, -1.4, -12)];
  o.push(`<path d="${poly(door)}" fill="${mat(t, t.metal).mid}" stroke="${t.ink}" stroke-width="2.4"/>`);
  for (const dx of [11.5, 14.5]) { const [X, Y] = P(v, dx, -1.4, -7); o.push(`<rect x="${f(X - 4)}" y="${f(Y - 14)}" width="8" height="28" rx="3" fill="${t.ink}"/>`); }
  // side art decal on the right face
  const side = (y: number, z: number) => P(v, 27.6, y, z);
  o.push(`<path d="${poly([side(4, -3), side(48, -3), side(40, -12), side(10, -12)])}" fill="${t.accent}" stroke="${t.ink}" stroke-width="2.4" opacity="0.95"/>`);
  o.push(`<path d="${poly([side(10, -6), side(42, -6), side(37, -9.5), side(14, -9.5)])}" fill="${t.paper}" stroke="${t.ink}" stroke-width="2"/>`);
  o.push(playfield(v, t, BUILD, false));
  // glass sheen over the playfield
  o.push(`<path d="${poly([P(v, 2, 50, 0.9), P(v, 9, 50, 0.9), P(v, 1, 4, 0.9), P(v, -1, 12, 0.9)])}" fill="#ffffff" opacity="0.13"/>`);
  // the backbox and its backglass: a world inside the object
  const bb = new Prop(v, t);
  bb.prism(box(13, 54.6, 14.6, 1.4, 0, 0.3), 0, 21, wood);
  o.push(bb.svg());
  const [x0, yTop] = P(v, -1.6 + 1.4, 53.2, 20), [x1, yBot] = P(v, 27.6 - 1.4, 53.2, 1.4);
  o.push(backglass(t, x0, yTop, x1 - x0, yBot - yTop));
  return o.join('');
}

function backglass(t: Theme, x: number, y: number, w: number, h: number) {
  const o: string[] = [];
  const cx = x + w / 2, cy = y + h * 0.56;
  o.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="10" fill="${t.bg}" stroke="${t.ink}" stroke-width="3"/>`);
  o.push(`<clipPath id="bg_${t.id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="10"/></clipPath><g clip-path="url(#bg_${t.id})">`);
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 0.5) / 16) * Math.PI * 2, R = w;
    o.push(`<path d="${poly([[cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]])}" fill="${mix(t.bg, '#ffffff', 0.28)}"/>`);
  }
  // the mascot (Big Boi, in this theme's skin) drawn big with the same prop code
  const mv: View = { S: w / 7.5, ox: cx, oy: cy + h * 0.34, k: 0.45, kz: 0.8, shx: 0, lw: 3 };
  o.push(drawPart(mv, t, 'mega', 0, 0, 0, { face: 'happy' }));
  for (const [dx, dy, s] of [[-0.36, -0.12, 0.08], [0.38, 0.02, 0.06], [0.3, -0.3, 0.045]] as const) o.push(sparkle(t, cx + dx * w, cy + dy * h, s * w, t.paper, 2.5));
  o.push('</g>');
  o.push(`<text x="${f(cx + 5)}" y="${f(y + h * 0.27 + 6)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(w * 0.16)}" fill="${t.ink}">${esc(t.name)}</text>`);
  o.push(`<text x="${f(cx)}" y="${f(y + h * 0.27)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(w * 0.16)}" fill="${t.paper}" stroke="${t.ink}" stroke-width="${f(w * 0.014)}" paint-order="stroke" stroke-linejoin="round">${esc(t.name)}</text>`);
  const bw = w * 0.62, by = y + h * 0.31;
  o.push(`<g transform="rotate(-3 ${f(cx)} ${f(by)})"><rect x="${f(cx - bw / 2)}" y="${f(by)}" width="${f(bw)}" height="${f(h * 0.1)}" rx="6" fill="${t.accent}" stroke="${t.ink}" stroke-width="3"/>` +
    `<text x="${f(cx)}" y="${f(by + h * 0.075)}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${f(h * 0.065)}" fill="${t.paper}">${esc(t.tagline)}</text></g>`);
  const n = 14;
  for (let i = 0; i <= n; i++) for (const yy of [y + 7, y + h - 7]) o.push(`<circle cx="${f(x + 12 + (i * (w - 24)) / n)}" cy="${f(yy)}" r="4" fill="${i % 2 ? t.glow : mix(t.glow, t.shadeTint, 0.4)}" stroke="${t.ink}" stroke-width="1.6"/>`);
  return o.join('');
}

function keyArt(): string {
  const W = 2400, H = 1400;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#e9e1d3"/>`];
  for (let x = 30; x < W; x += 36) for (let y = 30; y < H; y += 36) o.push(`<circle cx="${x}" cy="${y}" r="2.2" fill="#d8cdbb"/>`);
  [DINER, FACTORY, CASTLE].forEach((t, i) => o.push(cabinet(t, 130 + i * 760, 930 - (i === 1 ? 30 : 0), 14.5)));
  o.push(`<text x="${W / 2}" y="1375" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="40" fill="#3b2a4a">three machines, one kit: same parts, same physics, new tokens</text>`);
  return svgDoc(W, H, o.join(''));
}

// ------------------------------------------------------------------ output
function svgDoc(w: number, h: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sheets: Record<string, string> = {
    'screen-factory': screen(FACTORY), 'screen-diner': screen(DINER), 'screen-castle': screen(CASTLE),
    'parts-sheet': partsSheet(), 'particles': particleSheet(), 'key-art-lineup': keyArt(),
  };
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  for (const [name, svg] of Object.entries(sheets)) {
    const m = svg.match(/width="(\d+)" height="(\d+)"/)!;
    const page = await browser.newPage({ viewport: { width: +m[1], height: +m[2] } });
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap"><style>html,body{margin:0}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.close();
    console.log('wrote', `${OUT}/${name}.png`);
  }
  await browser.close();
}

main();
