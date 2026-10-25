// Composes the concept sheets from the real table geometry and part data, then renders them to PNG.
//   npx vite-node tools/concept/scenes.ts [outDir]      (default docs/concept)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PARTS, type PartId } from '../../src/data/parts';
import { LANE_WALL_X, TABLE_H, TABLE_W } from '../../src/sim/constants';
import { FLIPPER_PIVOTS, tableOutline, tableSegments } from '../../src/sim/table';
import {
  TYPE, box, coin, curl, debris, esc, f, groundRing, impact, line, P, poly, Prop, puff, ribbon, ring, scoreSticker, shadow, sparkle, stamp, type Pt, type View,
} from './draw';
import { ball, drawPart, flipper, glowDisk, type PartState } from './props';
import { CASTLE, DINER, FACTORY, mat, mix, roleClashes, THEMES, type Theme } from './themes';
import {
  arcadeButton, ballTray, card, coinStack, decal, DECALS, emptySlot, faint, fitIcon, goalTube, housing, label, LW, marqueeHeader, multDial, odometer, offerCard, pill, receipt, text, tile, toolbox, tooltip,
} from './ui';

const OUT = process.argv[2] || 'docs/concept';
let uidN = 0;
const uid = (p: string) => `${p}${uidN++}`;

// ------------------------------------------------------------------ the playfield
interface Placed { id: PartId; x: number; y: number; a?: number; st?: PartState }

/** A mid-run build on the real table: the three starter pops plus a dozen bought parts. */
const BUILD: Placed[] = [
  { id: 'lane', x: 9.6, y: 48.4, st: { lit: true, letter: '0' } }, { id: 'lane', x: 13, y: 48.9, st: { lit: true, letter: '1' } }, { id: 'lane', x: 16.4, y: 48.4, st: { letter: '2' } },
  { id: 'pop', x: 17, y: 44.5, st: { value: '115' } }, { id: 'pop', x: 11, y: 45.5, st: { value: '115', hit: true } }, { id: 'pop', x: 6, y: 42, st: { value: '115' } },
  { id: 'printer', x: 19.8, y: 39.6, a: 0, st: { smoke: true, value: '200' } },
  { id: 'coin', x: 18.6, y: 33.6 }, { id: 'coin', x: 5.6, y: 35.4 },
  { id: 'mega', x: 12, y: 34.2, st: { value: '275', face: 'oof', hit: true } },
  { id: 'deflector', x: 2.6, y: 30.5, a: 1.0 },
  { id: 'lamp', x: 15.6, y: 29.6, st: { lit: true, glow: 6 } },
  { id: 'uplight', x: 3.4, y: 25.4, st: { lit: true, target: 'pop' } }, { id: 'uplight', x: 7.6, y: 27.6, st: { target: 'pop' } },
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

/**
 * The page behind the machine: hand-drawn squiggles, wavy contour lines or loose smoke curls, a hair
 * darker than the background. u in [0, 1) is the loop phase: everything drifts one tile and wiggles one
 * period per loop, so it animates seamlessly (a 6-8 s loop in game, frozen in Calm mode).
 */
function backdrop(t: Theme, W: number, H: number, u: number, style = t.backdrop): string {
  const ink = mix(t.bg, t.shadeTint, 0.17), TAU = Math.PI * 2, o: string[] = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  const sw = `fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"`;
  if (style === 'waves') {
    for (let y0 = -40; y0 < H + 60; y0 += 54) {
      const pts: Pt[] = [];
      for (let x = -20; x <= W + 20; x += 12) pts.push([x, y0 + Math.sin(x / 120 + TAU * u + y0 * 0.03) * 9 + Math.sin(x / 47 - TAU * u) * 2.5]);
      o.push(`<path d="${line(pts)}" ${sw} stroke-width="3"/>`);
    }
    return o.join('');
  }
  const tile = style === 'curls' ? 260 : 180, rnd = rng(style === 'curls' ? 5 : 3), n = style === 'curls' ? 2 : 4;
  const marks = Array.from({ length: n }, () => ({ x: rnd() * tile, y: rnd() * tile, a: rnd() * 180, len: 50 + rnd() * 40, ph: rnd() * TAU }));
  const dx = u * tile, dy = style === 'curls' ? 0 : -u * tile; // ~40 px/s over a 6 s loop
  for (let X = -tile; X < W + tile; X += tile) for (let Y = -tile; Y < H + tile; Y += tile) for (const m of marks) {
    const cx = X + m.x + dx, cy = Y + m.y + dy, wob = Math.sin(TAU * u + m.ph);
    if (style === 'curls') {
      o.push(ribbon(curl(cx - 70, cy + 30, 150, 26 + wob * 6, 2.3), 14, 2, ink, 1));
    } else {
      const pts: Pt[] = [];
      for (let i = 0; i <= 24; i++) {
        const s = i / 24 - 0.5;
        const px = s * m.len, py = Math.sin(s * TAU * 1.6 + m.ph + TAU * u) * (6 + wob * 1.5);
        const a = (m.a * Math.PI) / 180;
        pts.push([cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)]);
      }
      o.push(`<path d="${line(pts)}" ${sw} stroke-width="3.5"/>`);
    }
  }
  return o.join('');
}

/** Three backdrops side by side behind a score card, for the animated preview. */
function backdropPreview(u: number): string {
  const W = 1500, H = 420, o: string[] = [];
  [FACTORY, DINER, CASTLE].forEach((t, i) => {
    const x0 = i * 500, id = 'bp' + i;
    o.push(`<clipPath id="${id}"><rect x="${x0}" y="0" width="500" height="${H}"/></clipPath><g clip-path="url(#${id})"><g transform="translate(${x0} 0)">${backdrop(t, 500, H, u)}`);
    o.push(card(t, 110, 120, 280, 160, t.paper, 18) + text(t, 134, 162, 'SCORE', 14, { w: 700, spacing: 2 }) + text(t, 132, 222, '12,480', 52, { w: 700 }) + text(t, 134, 258, t.tagline.toLowerCase() + ' · ' + t.backdrop, 14, { w: 500 }));
    o.push('</g></g>');
  });
  return svgDoc(W, H, o.join(''));
}

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function playfield(v: View, t: Theme, build: Placed[], fx = true, decals?: typeof DECALS, opts: { noRim?: boolean } = {}): string {
  const clip = uid('clip_' + t.id);
  const out: string[] = [];
  out.push(`<defs><clipPath id="${clip}"><path d="${poly(floorPoly().map(([x, y]) => P(v, x, y)))}"/></clipPath></defs>`);
  // the cabinet rim around the field (ground level)
  const rimPts = box(13, 26.1, 14.6, 27.5, 0, 1.2);
  if (!opts.noRim) out.push(`<path d="${poly(rimPts.map(([x, y]) => P(v, x, y)))} ${poly(floorPoly().map(([x, y]) => P(v, x, y)))}" fill-rule="evenodd" fill="${t.rim}" stroke="${t.ink}" stroke-width="${f(v.lw * 1.4)}"/>`);
  out.push(floorArt(v, t, clip));
  out.push(`<path d="${poly(floorPoly().map(([x, y]) => P(v, x, y)))}" fill="none" stroke="${t.ink}" stroke-width="${f(v.lw)}"/>`);
  // apron, with a rule card like a real machine
  const apron = new Prop(v, t);
  apron.prism(apronPoly(), 0, 0.5, mat(t, t.rim));
  out.push(apron.svg());
  // relic decals stuck on the apron: two slots each side, one still free
  const slots: [number, number][] = [[2.6, 6.6], [5.6, 4.4], [18.4, 4.4], [21.4, 6.6]];
  const stuck = decals ?? [DECALS[0], DECALS[1], DECALS[2]];
  slots.forEach(([x, y], i) => {
    const [X, Y] = P(v, x, y, 0.5), R = v.S * 1.05;
    out.push(stuck[i] ? decal(t, stuck[i], X, Y, R, v.k, [-8, 5, -4, 7][i]) : emptySlot(t, X, Y, R * 0.9, v.k));
  });
  // everything with height goes into one painter's list, far (high y) first
  const items: { y: number; svg: string }[] = [];
  out.push(rails(v, t));
  const plunger = new Prop(v, t);
  plunger.cyl(25, 1.4, 0.45, 0, 0.5, mat(t, t.accent));
  items.push({ y: 1.4, svg: plunger.svg() });
  for (const q of build) {
    const st = q.id === 'lane' ? { ...q.st, letter: t.laneWord[Number(q.st?.letter ?? 0)] } : q.st;
    items.push({ y: q.y, svg: drawPart(v, t, q.id, q.x, q.y, q.a ?? 0, st) });
  }
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
    for (const [x, y, r, h, c] of [[-7, 44, 2.2, 6, t.role.pop], [-6.4, 30, 1.6, 4, t.role.mega], [31.5, 40, 2.4, 7, t.accent], [31, 22, 1.5, 3.5, t.role.pop]] as const) {
      const p = new Prop(v, t);
      add(y, shadow(v, t, x, y, r * 1.1, r * 1.1, 0.25));
      p.cyl(x, y, r, 0, h, mat(t, t.metal));
      p.cyl(x, y, r * 1.02, h * 0.62, h * 0.16, mat(t, c));
      p.cyl(x, y, r * 0.5, h, 0.5, mat(t, t.metal));
      add(y, p.svg());
    }
    add(29.9, pipe(v, t, [[-4.9, 44, 3], [-3.3, 44, 3], [-3.3, 30, 2], [-4.85, 30, 2]], [-3.3, 37, 2.5]));
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
/** A metal pipe through sim points (x, y, z): ink, body, a highlight, round elbows and flanges at the ends. */
function pipe(v: View, t: Theme, pts: [number, number, number][], valve?: [number, number, number]) {
  const sp = pts.map(([x, y, z]) => P(v, x, y, z)), w = v.S * 0.7, m = mat(t, t.metal);
  const d = line(sp), st = (width: number, c: string) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(width)}" stroke-linejoin="round" stroke-linecap="butt"/>`;
  const flange = (a: Pt, b: Pt) => { // a short collar across the pipe at a, facing along a→b
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, ux = dx / L, uy = dy / L, r = w * 0.75, th = v.S * 0.18;
    const q: Pt[] = [[a[0] + nx * r, a[1] + ny * r], [a[0] + nx * r + ux * th, a[1] + ny * r + uy * th], [a[0] - nx * r + ux * th, a[1] - ny * r + uy * th], [a[0] - nx * r, a[1] - ny * r]];
    return `<path d="${poly(q)}" fill="${m.light}" stroke="${t.ink}" stroke-width="${f(v.lw * 0.8)}" stroke-linejoin="round"/>`;
  };
  return st(w + v.lw * 2, t.ink) + st(w, m.mid) + `<path d="${line(sp.map(([x, y]) => [x - w * 0.22, y - w * 0.12] as Pt))}" fill="none" stroke="${m.light}" stroke-width="${f(w * 0.22)}" stroke-linejoin="round"/>` +
    flange(sp[0], sp[1]) + flange(sp[sp.length - 1], sp[sp.length - 2]) + (valve ? valveWheel(t, P(v, ...valve), v.S * 0.85, v.lw) : '');
}
/** A hand wheel on a pipe: the one detail that makes a grey bar read as plumbing. */
function valveWheel(t: Theme, [x, y]: Pt, r: number, lw: number) {
  const spokes = [0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 4 + 0.4; return `M${f(x - Math.cos(a) * r)} ${f(y - Math.sin(a) * r)}L${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}`; }).join('');
  return `<path d="${spokes}" stroke="${t.ink}" stroke-width="${f(lw * 2.2)}" stroke-linecap="round"/><path d="${spokes}" stroke="${t.accent}" stroke-width="${f(lw * 0.9)}" stroke-linecap="round"/>` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${t.ink}" stroke-width="${f(lw * 3)}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${t.accent}" stroke-width="${f(lw * 1.4)}"/>` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.28)}" fill="${t.metal}" stroke="${t.ink}" stroke-width="${f(lw * 0.8)}"/>`;
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
function dmd(t: Theme, x: number, y: number, w: number, h: number, msg: string) {
  const id = uid('dmd_' + t.id), fs = Math.min(h * 0.6, (w - 16) / (msg.length * 0.78));
  // the text is centred on its measured cap height, so it sits mid-panel top to bottom
  return `<defs><mask id="${id}m"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${Array.from({ length: Math.ceil(w / 5) }, (_, i) => `<rect x="${x + i * 5 + 3.6}" y="${y}" width="1.4" height="${h}" fill="#000"/>`).join('')}${Array.from({ length: Math.ceil(h / 5) }, (_, i) => `<rect x="${x}" y="${y + i * 5 + 3.6}" width="${w}" height="1.4" fill="#000"/>`).join('')}</mask></defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#241a26" stroke="${t.ink}" stroke-width="${LW.frame}"/>` +
    `<g mask="url(#${id}m)">${text(t, x + w / 2, y + h / 2, msg, fs, { font: TYPE.dmd, w: 400, anchor: 'middle', mid: true, spacing: 3, fill: t.dmd })}</g>`;
}

function marquee(t: Theme, x: number, y: number, w: number, h: number, msg: string) {
  const bulbs = [] as string[];
  const n = Math.round(w / 26);
  for (let i = 0; i <= n; i++) for (const yy of [y + 10, y + h - 10]) bulbs.push(`<circle cx="${f(x + 16 + (i * (w - 32)) / n)}" cy="${yy}" r="5" fill="${i % 2 ? t.glow : mix(t.glow, t.shadeTint, 0.45)}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
  return card(t, x, y, w, h, t.rim, 16) + bulbs.join('') + dmd(t, x + 22, y + 22, w - 44, h - 44, msg);
}

// Both panels: 320 wide, content on a 30 px margin (x+30 .. x+290), titles on the same baseline.
const PW = 320, M = 30, CW = PW - 2 * M;

function hudLeft(t: Theme, x: number, y: number) {
  const o: string[] = [housing(t, x, y, PW, 880)], L = x + M, R = x + PW - M;
  o.push(marqueeHeader(t, x, y, PW, 'FREE PLAY'));
  // round and stage: Opener · Main · Boss, the current one lit
  o.push(tile(t, L, y + 88, CW, 40));
  o.push(text(t, L + 14, y + 108, 'ROUND 4', 19, { w: 700, mid: true }));
  ['OPEN', 'MAIN', 'BOSS'].forEach((s, i) => {
    const pw = 44, px = R - 12 - (3 - i) * pw - (2 - i) * 5, cur = i === 1, done = i === 0;
    o.push(`<rect x="${px}" y="${y + 98}" width="${pw}" height="20" rx="10" fill="${cur ? t.accent : done ? mix(t.paper, t.shadeTint, 0.25) : t.paper}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
    o.push(text(t, px + pw / 2, y + 108, s, 10.5, { w: 800, anchor: 'middle', mid: true, spacing: 0.6, fill: cur ? t.paper : done ? faint(t) : t.ink }));
  });
  o.push(label(t, L, y + 160, 'Score'));
  o.push(odometer(t, x + PW / 2, y + 174, '12480', 44, 64));
  o.push(label(t, L, y + 280, 'Goal') + text(t, L + 46, y + 280, '18,000', 14, { w: 800 }) + label(t, R, y + 280, '5,520 to go', 'end'));
  o.push(goalTube(t, L, y + 292, CW, 0.69, t.role.pop));
  // two instrument tiles: Mult and Balls, labelled the same way, values on one line
  const ty = y + 340, tw = (CW - 10) / 2, th = 136;
  o.push(tile(t, L, ty, tw, th) + tile(t, L + tw + 10, ty, tw, th));
  o.push(label(t, L + 14, ty + 24, 'Mult') + label(t, L + tw + 24, ty + 24, 'Balls'));
  o.push(multDial(t, L + tw / 2, ty + 84, 44, 1.43));
  o.push(ballTray(t, L + tw + 10 + tw / 2, ty + 72, 2));
  o.push(text(t, L + tw / 2, ty + 114, '×1.43', 22, { w: 700, anchor: 'middle', mid: true }));
  o.push(text(t, L + tw + 10 + tw / 2, ty + 114, '2 LEFT', 22, { w: 700, anchor: 'middle', mid: true }));
  o.push(receipt(t, L, y + 506, CW, 'This ball', [
    [t.role.pop, 'Pop Bumper ×3', '4,210'], [t.role.mega === t.paper ? t.accent : t.role.mega, 'Big Boi', '3,150'], [t.role.bank, 'Drop Targets', '1,880'], [t.role.lane, 'Lanes ' + t.laneWord, '740'], [t.role.coin, 'Cha-Ching', '$5 · 320'],
  ], '10,300'));
  o.push(arcadeButton(t, L, y + 784, CW, 'CASH OUT', 'TAB'));
  return o.join('');
}

function hudRight(t: Theme, x: number, y: number) {
  const o: string[] = [housing(t, x, y, PW, 880)], L = x + M, R = x + PW - M;
  o.push(marqueeHeader(t, x, y, PW, 'PARTS'));
  o.push(pill(t, R - 116, y + 56, 116, 'REROLL  $1', t.paper));
  o.push(tile(t, L, y + 88, CW, 40));
  // money lives with the shop; the coin stack comes first so flying coins land on it without crossing text
  o.push(coinStack(t, L + 30, y + 108, 3) + text(t, L + 58, y + 108, '$6', 22, { w: 700, mid: true }));
  o.push(text(t, R - 14, y + 108, '+$3 per spare ball', 12.5, { w: 600, mid: true, anchor: 'end', fill: faint(t) }));
  const recipes: Record<string, string[]> = { printer: ['Catches a ball: 200,', 'prints a 2nd ball.'], lamp: ['Lit: parts in its', 'glow score +25%.'], spinner: ['10 per spin. Fast', 'balls spin more.'] };
  (['printer', 'lamp', 'spinner'] as PartId[]).forEach((id, i) => o.push(offerCard(t, id, L, y + 146 + i * 182, CW, recipes[id], id !== 'printer', 170)));
  o.push(label(t, L, y + 730, 'Toolbox') + text(t, R, y + 730, 'drag a part in to store it', 12, { w: 600, anchor: 'end', fill: faint(t) }));
  o.push(toolbox(t, L, y + 750, CW, ['coin', 'deflector', 'uplight', null])); // ends at y + 852, level with Cash Out
  return o.join('');
}

function screen(t: Theme): string {
  const W = 1600, H = 1000;
  const v: View = { S: 16, ox: 592, oy: 942, k: 0.9, kz: 0.55, shx: 0, lw: 2.2 };
  const o: string[] = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  o.push(backdrop(t, W, H, 0));
  o.push(`<ellipse cx="800" cy="955" rx="300" ry="26" fill="${t.shadeTint}" opacity="0.22"/>`);
  o.push(surround(v, t));
  o.push(playfield(v, t, BUILD));
  o.push(marquee(t, 560, 22, 480, 112, 'BIG BOI SAYS OOF'));
  o.push(hudLeft(t, 24, 60) + hudRight(t, W - 24 - PW, 60));
  // hovering Big Boi: the card answers what it is, what it pays now and why, and how to change it
  const [MX, MY] = P(v, 12, 34.2, 1.2);
  o.push(`<ellipse cx="${f(MX)}" cy="${f(P(v, 12, 34.2)[1])}" rx="${f(2.5 * v.S)}" ry="${f(2.5 * v.S * v.k)}" fill="none" stroke="${t.paper}" stroke-width="4" stroke-dasharray="10 7"/>`);
  const [LX, LY] = P(v, 15.6, 29.6, 2);
  o.push(`<path d="M${f(LX)} ${f(LY)}Q${f(LX + 10)} ${f(MY - 10)} ${f(MX + 2.2 * v.S)} ${f(MY + 6)}" fill="none" stroke="${t.ink}" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>`);
  o.push(tooltip(t, 900, 330, 330, [MX + 2.1 * v.S, MY + 4], {
    id: 'mega', title: 'Big Boi', chip: 'Bumper', level: 2, now: 'Next hit pays 472',
    math: [['275', 'base + Lv 2'], ['+20%', 'Lamp glow'], ['×1.43', 'your Mult']],
    recipe: ['Scores 250 per hit, times your Mult.', 'Each hit: +0.1 Mult this ball.'],
    stats: 'This ball: 12 hits · 3,150 pts · Mult +1.2', dial: ['Kick', 0.35, 'soft kick, more points', 'hard kick, fewer'],
    keys: 'drag to move · R rotate · Del store · between rounds',
  }));
  // a coin flies from the Cha-Ching bumper to MONEY on the parts side: the effect points at its consequence
  const [CX, CY] = P(v, 18.6, 33.6, 1.1);
  const sx = CX + v.S * 0.4, sy = CY - v.S * 1.4, ex = W - 24 - PW + M + 30, ey = 60 + 100, cx = 1150, cy = 110;
  const arc: Pt[] = Array.from({ length: 30 }, (_, i) => { const u = i / 29, a = (1 - u) ** 2, b = 2 * u * (1 - u), c = u * u; return [a * sx + b * cx + c * ex, a * sy + b * cy + c * ey]; });
  o.push(`<path d="${line(arc)}" fill="none" stroke="${t.ink}" stroke-width="3" stroke-dasharray="2 11" stroke-linecap="round" opacity="0.55"/>`);
  for (const [u, sq] of [[0.22, 0.3], [0.46, 1], [0.7, 0.6]] as const) {
    const p = arc[Math.round(u * 29)];
    o.push(coin(t, p[0], p[1], 11 + u * 5, sq, 2.4));
  }
  o.push(`<text x="${W / 2}" y="${H - 14}" text-anchor="middle" font-family="'${TYPE.ui}'" font-weight="600" font-size="13" fill="${mix(t.ink, t.bg, 0.4)}">concept mock-up · ${esc(t.tagline.toLowerCase())} theme · drawn from the real table geometry</text>`);
  return svgDoc(W, H, o.join(''));
}

// ------------------------------------------------------------------ parts sheet
function partsSheet(): string {
  const ids: PartId[] = ['pop', 'coin', 'mega', 'sling', 'spinner', 'bank', 'lane', 'uplight', 'lamp', 'printer', 'deflector', 'flipper'];
  // a strict grid: 24 px padding in every block, 16 px gutters, one shared scale so sizes stay true
  const W = 1560, pad = 24, gut = 16, head = 58, cellH = 150, cols = 6;
  const bx = 24, bw = W - 48, cellW = (bw - pad * 2 - gut * (cols - 1)) / cols, blockH = head + cellH * 2 + gut + pad;
  const H = 96 + THEMES.length * (blockH + 20);
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#efe8dc"/>`];
  o.push(text(FACTORY, bx, 62, 'ONE SILHOUETTE PER PART · THREE THEME KITS', 32, { w: 700 }));
  THEMES.forEach((t, b) => {
    const y0 = 96 + b * (blockH + 20);
    o.push(card(t, bx, y0, bw, blockH, t.bg, 22));
    o.push(text(t, bx + pad, y0 + head / 2 + 4, t.tagline, 24, { w: 700, fill: t.paper, stroke: t.ink, mid: true }));
    ids.forEach((id, i) => {
      const col = i % cols, row = Math.floor(i / cols), x = bx + pad + col * (cellW + gut), y = y0 + head + row * (cellH + gut);
      o.push(card(t, x, y, cellW, cellH, t.floor, 16));
      o.push(fitIcon(t, id, x + cellW / 2, y + 62, cellW - 30, 90, { fixedS: 23, k: 0.8, st: { value: id === 'pop' ? '100' : id === 'mega' ? '250' : undefined, smoke: false } }));
      o.push(text(t, x + cellW / 2, y + cellH - 20, PARTS[id].name, 14, { w: 700, anchor: 'middle', mid: true }));
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
  ['spawn', 'overshoot', 'hold', 'shrink', 'end'].forEach((s, i) => o.push(text(t, fx0 + i * 190, 134, s, 15, { w: 600, anchor: 'middle', fill: mix(t.ink, t.bg, 0.3) })));
  rows.forEach((r, j) => {
    const y = 150 + j * rowH;
    o.push(card(t, 24, y, W - 48, rowH - 12, r.name === 'Smoke ribbon' ? t.rim : j % 2 ? t.paper : mix(t.paper, t.floor, 0.5), 16));
    const cy = y + (rowH - 12) / 2;
    o.push(text(t, 48, cy, r.name, 22, { w: 700, mid: true }));
    r.spec.forEach((s, k) => o.push(text(t, 250, cy + (k - 1) * 21, s, 14.5, { w: 500, mid: true })));
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
  o.push(`<text x="${f(cx + 5)}" y="${f(y + h * 0.27 + 6)}" text-anchor="middle" font-family="'${TYPE.display}'" font-weight="400" font-size="${f(w * 0.16)}" fill="${t.ink}">${esc(t.name)}</text>`);
  o.push(`<text x="${f(cx)}" y="${f(y + h * 0.27)}" text-anchor="middle" font-family="'${TYPE.display}'" font-weight="400" font-size="${f(w * 0.16)}" fill="${t.paper}" stroke="${t.ink}" stroke-width="${f(w * 0.014)}" paint-order="stroke" stroke-linejoin="round">${esc(t.name)}</text>`);
  const bw = w * 0.62, by = y + h * 0.31;
  o.push(`<g transform="rotate(-3 ${f(cx)} ${f(by)})"><rect x="${f(cx - bw / 2)}" y="${f(by)}" width="${f(bw)}" height="${f(h * 0.1)}" rx="6" fill="${t.accent}" stroke="${t.ink}" stroke-width="3"/>` +
    `<text x="${f(cx)}" y="${f(by + h * 0.075)}" text-anchor="middle" font-family="'${TYPE.display}'" font-weight="400" font-size="${f(h * 0.065)}" fill="${t.paper}">${esc(t.tagline)}</text></g>`);
  const n = 14;
  for (let i = 0; i <= n; i++) for (const yy of [y + 7, y + h - 7]) o.push(`<circle cx="${f(x + 12 + (i * (w - 24)) / n)}" cy="${f(yy)}" r="4" fill="${i % 2 ? t.glow : mix(t.glow, t.shadeTint, 0.4)}" stroke="${t.ink}" stroke-width="1.6"/>`);
  return o.join('');
}

function keyArt(): string {
  const W = 2400, H = 1400;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#e9e1d3"/>`];
  o.push(backdrop({ ...FACTORY, bg: '#e9e1d3', shadeTint: '#8a7a64' }, W, H, 0, 'squiggle'));
  [DINER, FACTORY, CASTLE].forEach((t, i) => o.push(cabinet(t, 130 + i * 760, 930 - (i === 1 ? 30 : 0), 14.5)));
  o.push(`<text x="${W / 2}" y="1375" text-anchor="middle" font-family="'${TYPE.display}'" font-weight="400" font-size="40" fill="#3b2a4a">three machines, one kit: same parts, same physics, new tokens</text>`);
  return svgDoc(W, H, o.join(''));
}


// ------------------------------------------------------------------ relics as decals
function relicSheet(): string {
  const t = FACTORY, W = 1560, H = 1020;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  o.push(text(t, 40, 62, 'Relics are decals', 36, { w: 700, fill: t.paper, stroke: t.ink }));
  o.push(text(t, 40, 98, 'rules you win from major upgrades, stuck on the apron · the rim colour shows rarity · hover any decal for its card', 18, { w: 500 }));
  const rar: Record<string, string> = { common: 'Common', rare: 'Rare', wild: 'Wild' };
  DECALS.forEach((d, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 40 + col * 300, y = 130 + row * 300;
    o.push(card(t, x, y, 280, 280, t.paper, 18));
    o.push(decal(t, d, x + 140, y + 100, 58, 1, [-6, 4, -3, 5, -4, 6][i]));
    o.push(text(t, x + 140, y + 196, d.name, 22, { w: 700, anchor: 'middle' }));
    const rc = d.rarity === 'wild' ? t.accent : d.rarity === 'rare' ? t.role.coin : mix(t.paper, t.shadeTint, 0.15);
    o.push(`<rect x="${x + 106}" y="${y + 206}" width="68" height="22" rx="11" fill="${rc}" stroke="${t.ink}" stroke-width="2"/>` + text(t, x + 140, y + 222, rar[d.rarity], 12.5, { w: 700, anchor: 'middle' }));
    d.effect.forEach((e, k) => o.push(text(t, x + 140, y + 250 + k * 18, e, 14, { w: 500, anchor: 'middle' })));
  });
  // how they arrive: the Rules column of a major upgrade
  o.push(card(t, 40, 730, 880, 270, t.rim, 18));
  o.push(text(t, 64, 772, 'MAJOR UPGRADE · RULES', 22, { w: 700, fill: t.paper, stroke: t.ink }) + text(t, 896, 772, 'pick one', 17, { w: 600, fill: t.paper, anchor: 'end' }));
  [DECALS[4], DECALS[3], DECALS[5]].forEach((d, i) => {
    const x = 64 + i * 284, y = 792;
    o.push(card(t, x, y, 264, 186, i === 1 ? '#fff4c9' : t.paper, 14));
    o.push(decal(t, d, x + 60, y + 62, 34, 1, -5 + i * 4));
    o.push(text(t, x + 112, y + 46, d.name, 19, { w: 700 }) + text(t, x + 112, y + 68, d.rarity === 'wild' ? 'Wild' : d.rarity === 'rare' ? 'Rare' : 'Common', 13, { w: 600, fill: t.accent }));
    d.effect.forEach((e, k) => o.push(text(t, x + 18, y + 114 + k * 18, e, 13.5, { w: 600 })));
    o.push(pill(t, x + 18, y + 162, 100, 'STICK IT', i === 1 ? t.accent : t.paper, '', 30));
  });
  // where they live: the apron, cropped from the real table
  const v: View = { S: 24, ox: 1000, oy: 1010 + 0, k: 0.9, kz: 0.55, shx: 0, lw: 2.4 };
  const cid = uid('apron');
  o.push(`<defs><clipPath id="${cid}"><rect x="980" y="560" width="560" height="430" rx="18"/></clipPath></defs>`);
  o.push(card(t, 980, 560, 560, 430, t.floor, 18));
  o.push(`<g clip-path="url(#${cid})">${playfield({ ...v, ox: 968, oy: 1000 }, t, BUILD.filter((b) => b.y < 20), false, [DECALS[0], DECALS[3], DECALS[2]])}</g>`);
  o.push(`<rect x="980" y="560" width="560" height="430" rx="18" fill="none" stroke="${t.ink}" stroke-width="3.5"/>`);
  o.push(card(t, 980, 130, 560, 410, t.paper, 18));
  const notes = [
    ['Where', 'Four slots on the apron, two each side, like the rule cards on a real machine. Upgrades can add slots (Apron Extension) or new places (side rails, backglass).'],
    ['When', 'You win them from the Rules column of a major upgrade, and some shops sell them. They take effect at once.'],
    ['Swap', 'Between rounds, peel one off to make room. A peeled decal is gone, so choosing is the game.'],
    ['Read', 'Hover a decal for the same card as a part: what it does, what it did this ball.'],
  ];
  let ny = 176; // flow layout: every block is followed by the same gap, whatever its length
  notes.forEach(([h, b]) => {
    o.push(text(t, 1004, ny, h, 19, { w: 700, fill: t.accent }));
    const lines = wrap(b, 58);
    lines.forEach((ln, k) => o.push(text(t, 1004, ny + 24 + k * 20, ln, 15, { w: 500 })));
    ny += 24 + lines.length * 20 + 26;
  });
  return svgDoc(W, H, o.join(''));
}
const wrap = (s: string, n: number) => s.split(' ').reduce<string[]>((a, w) => {
  if (!a.length || (a[a.length - 1] + ' ' + w).length > n) a.push(w); else a[a.length - 1] += ' ' + w;
  return a;
}, []);

// ------------------------------------------------------------------ font options
const FONTS: { family: string; role: string; note: string; weight: number; ui?: number }[] = [
  { family: 'Fredoka', role: 'display + UI', note: 'rounded geometric, 5 weights, calm and friendly', weight: 700, ui: 500 },
  { family: 'Baloo 2', role: 'display + UI', note: 'rounder and chunkier, 5 weights, great numbers', weight: 800, ui: 500 },
  { family: 'Lilita One', role: 'display only', note: 'one heavy weight, poster-like, pair with Nunito', weight: 400 },
  { family: 'Titan One', role: 'display only', note: 'bubbly and loud, best for the backglass and stamps', weight: 400 },
  { family: 'Luckiest Guy', role: 'chosen · display', note: 'comic-book caps, the goofiest option', weight: 400 },
  { family: 'Bungee', role: 'display only', note: 'arcade signage caps, very "machine"', weight: 400 },
  { family: 'Nunito', role: 'UI and body', note: 'rounded sans for recipes and tooltips', weight: 800, ui: 500 },
];
function fontSheet(): string {
  const t = FACTORY, W = 1560, rowH = 118, H = 150 + FONTS.length * rowH + 250;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#efe8dc"/>`];
  o.push(text(t, 40, 60, 'Font options (all free, OFL, on Google Fonts)', 34, { w: 700 }));
  o.push(text(t, 40, 94, 'each row sets the same game text: the title, the numbers, a score sticker and a recipe line', 17, { w: 500, fill: mix(t.ink, t.paper, 0.3) }));
  FONTS.forEach((fo, i) => {
    const y = 120 + i * rowH, F = fo.family;
    o.push(card(t, 24, y, W - 48, rowH - 14, fo.family === 'Luckiest Guy' || fo.family === 'Nunito' ? '#fff4c9' : t.paper, 16));
    o.push(text(t, 48, y + 38, F, 22, { w: 700, font: 'Fredoka' }));
    o.push(text(t, 48, y + 62, fo.role, 14, { w: 600, font: 'Fredoka', fill: t.accent }));
    o.push(text(t, 48, y + 82, fo.note, 13, { w: 500, font: 'Fredoka', fill: mix(t.ink, t.paper, 0.3) }));
    o.push(text(t, 400, y + 70, 'FREE PLAY', 46, { w: fo.weight, font: F, fill: t.accent, stroke: t.ink }));
    o.push(text(t, 700, y + 66, '12,480  ×1.43  $11', 34, { w: fo.weight, font: F }));
    o.push(`<g transform="translate(1100 ${y + 52}) rotate(-5)"><rect x="-58" y="-30" width="116" height="60" rx="12" fill="${t.paper}" stroke="${t.ink}" stroke-width="3"/>${text(t, 0, 12, '+165', 32, { w: fo.weight, font: F, fill: t.role.pop, stroke: t.ink, anchor: 'middle' })}</g>`);
    o.push(text(t, 1190, y + 46, 'Pop Bumper', 19, { w: fo.ui ?? fo.weight, font: F }));
    o.push(text(t, 1190, y + 70, 'Scores 100 per hit, times', 15, { w: fo.ui ?? fo.weight, font: F }));
    o.push(text(t, 1190, y + 90, 'your Mult.', 15, { w: fo.ui ?? fo.weight, font: F }));
  });
  const y = 140 + FONTS.length * rowH;
  o.push(card(t, 24, y, 740, 220, '#241a26', 16));
  o.push(text(t, 48, y + 40, 'DMD (dot-matrix) faces', 20, { w: 700, font: 'Fredoka', fill: t.paper }));
  [['DotGothic16', 'BIG BOI SAYS OOF'], ['Silkscreen', 'BIG BOI SAYS OOF'], ['VT323', 'BIG BOI SAYS OOF']].forEach(([F, m], i) => {
    o.push(text(t, 48, y + 92 + i * 46, m, 34, { w: 400, font: F, fill: t.dmd, spacing: 2 }) + text(t, 740, y + 92 + i * 46, F, 15, { w: 500, font: 'Fredoka', fill: mix(t.paper, t.ink, 0.3), anchor: 'end' }));
  });
  o.push(card(t, 790, y, 746, 220, t.paper, 16));
  o.push(text(t, 814, y + 40, 'Suggested pairings', 20, { w: 700, font: 'Fredoka' }));
  [['A · Safe', 'Fredoka 700 titles · Fredoka 500 UI · DotGothic16 DMD'], ['B · Chunky toy', 'Baloo 2 800 titles and numbers · Nunito UI · Silkscreen DMD'],
    ['C · Goofy (chosen)', 'Luckiest Guy stickers and backglass · Nunito UI · DotGothic16 DMD'], ['D · Arcade', 'Bungee marquee and buttons · Baloo 2 numbers · Nunito UI']].forEach(([h, b], i) => {
    o.push(text(t, 814, y + 78 + i * 36, h, 16, { w: 700, font: 'Fredoka', fill: t.accent }) + text(t, 990, y + 78 + i * 36, b, 15, { w: 500, font: 'Fredoka' }));
  });
  return svgDoc(W, H, o.join(''));
}

// ------------------------------------------------------------------ the machine tilts
function tiltSheet(): string {
  const t = FACTORY, W = 1600, H = 900, S = 10.5;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  o.push(text(t, 40, 58, 'The machine tilts, not the camera', 34, { w: 700, fill: t.paper, stroke: t.ink }));
  const unlit = BUILD.map((b) => ({ ...b, st: { ...b.st, lit: false, hit: false, smoke: false } }));
  const panels: { title: string; lines: string[]; k: number; kz: number; rot: number; dx: number; build: Placed[]; fx?: boolean; dmdMsg: string; dark?: boolean }[] = [
    { title: 'Workshop: flat', lines: ['Lies flat for exact placement:', 'the footprint is the collision.'], k: 1, kz: 0.3, rot: 0, dx: 0, build: BUILD, dmdMsg: 'WORKSHOP' },
    { title: 'Play: tips towards you', lines: ['Eases to k 0.86 over 0.4 s at', 'Start round. Parts show sides.'], k: 0.86, kz: 0.6, rot: 0, dx: 0, build: BUILD, fx: true, dmdMsg: 'BALL 2' },
    { title: 'Nudge: the cabinet shoves', lines: ['A spring on offset and lean.', 'Only the sim gets the impulse.'], k: 0.86, kz: 0.6, rot: 2.2, dx: 16, build: BUILD, dmdMsg: 'CAREFUL' },
    { title: 'TILT: lights out', lines: ['Tips hard, every lamp goes out,', 'flippers die, the ball drains.'], k: 0.8, kz: 0.6, rot: -5, dx: -10, build: unlit, dmdMsg: 'TILT', dark: true },
  ];
  panels.forEach((pn, i) => {
    const x0 = 24 + i * 392, cx = x0 + 186;
    o.push(card(t, x0, 90, 372, 790, t.paper, 18));
    const v: View = { S, ox: cx - 13 * S, oy: 735, k: pn.k, kz: pn.kz, shx: 0, lw: 1.7 };
    const pivot = P(v, 13, 0);
    if (i === 2) { // resting outline and shove lines
      o.push(`<path d="${poly(box(13, 26.1, 14.6, 27.5, 0, 1.2).map(([x, y]) => P(v, x, y)))}" fill="none" stroke="${t.ink}" stroke-width="2.4" stroke-dasharray="6 6" opacity="0.5"/>`);
      for (const yy of [260, 330, 400]) o.push(`<path d="M${x0 + 18} ${yy}h26" stroke="${t.ink}" stroke-width="4" stroke-linecap="round"/>`);
    }
    o.push(`<g transform="translate(${pn.dx} 0) rotate(${pn.rot} ${f(pivot[0])} ${f(pivot[1])})">`);
    o.push(playfield(v, t, pn.build, pn.fx ?? false));
    if (i === 0) for (let x = 2; x <= 22; x += 2) for (let y = 15; y <= 48; y += 2) { const [X, Y] = P(v, x, y); o.push(`<circle cx="${f(X)}" cy="${f(Y)}" r="1.5" fill="${t.ink}" opacity="0.35"/>`); }
    if (pn.dark) o.push(`<path d="${poly(box(13, 26.1, 14.6, 27.5, 0, 1.2).map(([x, y]) => P(v, x, y)))}" fill="#1d1420" opacity="0.38"/>`);
    o.push(dmd(t, cx - 110, P(v, 13, 53)[1] - 64, 220, 50, pn.dmdMsg));
    o.push('</g>');
    if (pn.dark) o.push(stampText(t, cx, 430, 'TILT'));
    o.push(text(t, x0 + 22, 790, pn.title, 21, { w: 700 }));
    pn.lines.forEach((ln, k) => o.push(text(t, x0 + 22, 816 + k * 20, ln, 15, { w: 500 })));
  });
  return svgDoc(W, H, o.join(''));
}
const stampText = (t: Theme, x: number, y: number, s: string) =>
  `<g transform="translate(${x} ${y}) rotate(-12)"><rect x="-110" y="-44" width="220" height="88" rx="14" fill="none" stroke="${t.accent}" stroke-width="9"/>${text(t, 0, 26, s, 72, { w: 700, anchor: 'middle', fill: t.accent })}</g>`;

// ------------------------------------------------------------------ the cabinet as a diorama object (options A and B)
// A: the playfield sunk into a tray with thick walls, a backbox carrying the DMD, legs and a base, same angle as today.
// B: A, tipped a little more (k 0.8, taller heights) and leaned sideways so the cabinet's right side shows too.
interface CabOpt { name: string; k: number; kz: number; shx: number; diorama: boolean }
const CAB_NOW: CabOpt = { name: 'Today', k: 0.9, kz: 0.51, shx: 0, diorama: false };
const CAB_A: CabOpt = { name: 'A · Tray and backbox', k: 0.9, kz: 0.51, shx: 0, diorama: true };
const CAB_B: CabOpt = { name: 'B · A + the angle', k: 0.78, kz: 0.72, shx: 0.15, diorama: true };
const WALL_H = 1.6, SHELL_BOTTOM = -7, LEG_BOTTOM = -9.5;

/** The DMD panel: the rim-coloured frame, a row of bulbs top and bottom, the dot-matrix screen. */
function dmdPanel(t: Theme, x: number, y: number, w: number, h: number, msg: string) {
  const bulbs: string[] = [], n = Math.max(6, Math.round(w / 22)), pad = Math.max(8, h * 0.16);
  for (let i = 0; i <= n; i++) for (const yy of [y + pad / 2 + 1, y + h - pad / 2 - 1]) bulbs.push(`<circle cx="${f(x + 12 + (i * (w - 24)) / n)}" cy="${f(yy)}" r="${f(Math.min(4.5, pad * 0.3))}" fill="${i % 2 ? t.glow : mix(t.glow, t.shadeTint, 0.45)}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="10" fill="${t.rim}" stroke="${t.ink}" stroke-width="${LW.frame}"/>` + bulbs.join('') + dmd(t, x + 14, y + pad, w - 28, h - pad * 2, msg);
}
const OUTER = () => box(13, 26.1, 14.6, 27.5, 0, 1.2);

/** The machine standing on its base: centred on cx, with the bottom of its base at baseY. */
function dioramaMachine(t: Theme, cx: number, baseY: number, S: number, o: CabOpt, msg: string): string {
  const lowZ = o.diorama ? LEG_BOTTOM : 0, frontY = -1.4;
  const oy = baseY - (-frontY * o.k - lowZ * o.kz) * S;
  const v: View = { S, ox: cx - (13 + 26 * o.shx) * S, oy, k: o.k, kz: o.kz, shx: o.shx, lw: 2 };
  const out: string[] = [];
  if (!o.diorama) {
    // today: a flat machine on the page, the DMD floating above it as an HTML card
    out.push(surround(v, t), playfield(v, t, BUILD, false));
    const [, top] = P(v, 13, 53.6);
    out.push(dmdPanel(t, cx - 12 * S, top - 7.4 * S, 24 * S, 5.6 * S, msg));
    return out.join('');
  }
  const wood = mat(t, t.rim);
  // the machine's shadow on the ground, and the surround standing on the same ground
  const shadowPts = box(14, 25.4, 15.4, 28.6, 0, 3).map(([x, y]) => P(v, x + 0.8, y - 0.8, LEG_BOTTOM));
  out.push(`<path d="${poly(shadowPts)}" fill="${t.shadeTint}" opacity="0.2"/>`);
  out.push(surround({ ...v, oy: v.oy + -LEG_BOTTOM * o.kz * S }, t));
  // legs, far ones first
  for (const [lx, ly] of [[0.2, 52], [25.8, 52], [0.2, 0.4], [25.8, 0.4]] as const) {
    const leg = new Prop(v, t);
    leg.cyl(lx, ly, 0.55, LEG_BOTTOM, SHELL_BOTTOM - LEG_BOTTOM, mat(t, t.metal));
    out.push(leg.svg());
  }
  // the backbox rises from the head of the table and carries the DMD: the text bar becomes part of the machine
  // its height is set so the panel stands about 6.5 units tall on screen whatever the angle
  const boxH = 6.8 / o.kz;
  const bb = new Prop(v, t);
  bb.prism(box(13, 55, 13.8, 1.1, 0, 0.3), WALL_H, boxH, wood);
  out.push(bb.svg());
  const [x0, y0] = P(v, 0.4, 53.9, WALL_H + boxH - 0.35 / o.kz), [x1, y1] = P(v, 25.6, 53.9, WALL_H + 0.3 / o.kz);
  out.push(dmdPanel(t, x0, y0, x1 - x0, y1 - y0, msg));
  // the shell: thick walls standing on the legs, its top is the rim
  const shell = new Prop(v, t);
  shell.prism(OUTER(), SHELL_BOTTOM, WALL_H - SHELL_BOTTOM, wood, { top: wood.base });
  out.push(shell.svg());
  // the well: everything inside is seen through the opening at the top of the walls, so the near wall hides
  // the bottom of the floor and the inside of the far wall shows above it
  const opening = floorPoly().map(([x, y]) => P(v, x, y, WALL_H));
  const cid = uid('well');
  out.push(`<defs><clipPath id="${cid}"><path d="${poly(opening)}"/></clipPath></defs><g clip-path="url(#${cid})">`);
  out.push(`<path d="${poly(opening)}" fill="${mix(t.rim, t.shadeTint, 0.5)}"/>`);
  // the inside of the far wall gets a wallpaper stripe, so it reads as a wall and not a shadow
  const band = floorPoly().map(([x, y]) => P(v, x, y, WALL_H * 0.55));
  out.push(`<path d="${line(band)}" fill="none" stroke="${mix(t.rim, t.shadeTint, 0.3)}" stroke-width="${f(S * 0.25)}"/>`);
  out.push(playfield(v, t, BUILD, false, undefined, { noRim: true }));
  out.push('</g>');
  // the cut edge round the opening: ink, then the light tone of the wood, like the carton flaps in the references
  out.push(`<path d="${poly(opening)}" fill="none" stroke="${t.ink}" stroke-width="${f(v.lw * 2.4)}" stroke-linejoin="round"/>`);
  out.push(`<path d="${poly(opening)}" fill="none" stroke="${wood.light}" stroke-width="${f(v.lw * 0.9)}" stroke-linejoin="round"/>`);
  // the coin door on the front face
  const door = [P(v, 9.5, -1.4, -1.2), P(v, 16.5, -1.4, -1.2), P(v, 16.5, -1.4, -5.8), P(v, 9.5, -1.4, -5.8)];
  out.push(`<path d="${poly(door)}" fill="${mat(t, t.metal).mid}" stroke="${t.ink}" stroke-width="2.2" stroke-linejoin="round"/>`);
  for (const dx of [11.6, 14.4]) { const [X, Y] = P(v, dx, -1.4, -2.6); out.push(`<rect x="${f(X - 3)}" y="${f(Y - 0.7 * S * o.kz)}" width="6" height="${f(1.4 * S * o.kz)}" rx="2.5" fill="${t.ink}"/>`); }
  const [PX, PY] = P(v, 13, -1.4, -4.3);
  out.push(`<rect x="${f(PX - 2.2 * S)}" y="${f(PY - 0.5 * S * o.kz)}" width="${f(4.4 * S)}" height="${f(1 * S * o.kz)}" rx="3" fill="${t.accent}" stroke="${t.ink}" stroke-width="1.8"/>`);
  if (o.shx > 0) {
    // the right side shows: side art and the right flipper button
    const side = (y: number, z: number) => P(v, 27.6, y, z);
    out.push(`<path d="${poly([side(5, 0.4), side(48, 0.4), side(42, -6.4), side(11, -6.4)])}" fill="${t.accent}" stroke="${t.ink}" stroke-width="2" stroke-linejoin="round"/>`);
    out.push(`<path d="${poly([side(14, -1.6), side(39, -1.6), side(36, -4.6), side(17, -4.6)])}" fill="${t.paper}" stroke="${t.ink}" stroke-width="1.8" stroke-linejoin="round"/>`);
    const [BX, BY] = side(3, -0.6);
    out.push(`<ellipse cx="${f(BX + 2)}" cy="${f(BY)}" rx="${f(0.3 * S)}" ry="${f(0.5 * S)}" fill="${t.ink}"/><ellipse cx="${f(BX)}" cy="${f(BY)}" rx="${f(0.3 * S)}" ry="${f(0.5 * S)}" fill="${t.accent}" stroke="${t.ink}" stroke-width="1.8"/>`);
  }
  return out.join('');
}

/** Three machines side by side, each with a caption card under it. */
function cabinetSheet(title: string, sub: string, cols: { t: Theme; o: CabOpt; label: string; lines: string[] }[]): string {
  const W = 1800, H = 1120, colW = W / cols.length, S = 11.5;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="${cols[0].t.bg}"/>`, backdrop(cols[0].t, W, H, 0)];
  o.push(text(cols[0].t, 40, 62, title, 34, { w: 700, fill: cols[0].t.paper, stroke: cols[0].t.ink }));
  o.push(text(cols[0].t, 40, 96, sub, 17, { w: 600 }));
  cols.forEach((c, i) => {
    const cx = colW * i + colW / 2;
    if (i > 0 && cols[i].t !== cols[i - 1].t) o.push(`<rect x="${colW * i}" y="120" width="${colW}" height="${H - 120}" fill="${c.t.bg}"/>${''}`);
    o.push(dioramaMachine(c.t, cx, 925, S, c.o, c.o.diorama ? 'BIG BOI SAYS OOF' : 'BIG BOI SAYS OOF'));
    o.push(card(c.t, cx - 270, 950, 540, 150, c.t.paper, 16));
    o.push(text(c.t, cx - 248, 986, c.label, 22, { w: 700 }));
    c.lines.forEach((ln, k) => o.push(text(c.t, cx - 248, 1018 + k * 22, ln, 15, { w: 600 })));
  });
  return svgDoc(W, H, o.join(''));
}

// ------------------------------------------------------------------ output
function svgDoc(w: number, h: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const w of THEMES.flatMap((t) => roleClashes(t))) console.warn('colour check:', w);
  const sheets: Record<string, string> = {
    'screen-factory': screen(FACTORY), 'screen-diner': screen(DINER), 'screen-castle': screen(CASTLE),
    'parts-sheet': partsSheet(), 'particles': particleSheet(), 'key-art-lineup': keyArt(),
    'relics': relicSheet(), 'fonts': fontSheet(), 'tilt': tiltSheet(),
    'cabinet-compare': cabinetSheet('From a screen to a machine', 'the same table and build, three ways to draw the cabinet', [
      { t: FACTORY, o: CAB_NOW, label: 'Today', lines: ['A flat field on the page; the DMD is a', 'separate card floating above it.'] },
      { t: FACTORY, o: CAB_A, label: CAB_A.name, lines: ['The field sinks into a cabinet with thick walls;', 'the DMD lives on a backbox; the cabinet stands', 'on legs. Same angle as today: aiming unchanged.'] },
      { t: FACTORY, o: CAB_B, label: CAB_B.name, lines: ['Tipped a little more (k 0.78, taller heights)', 'and leaned sideways (0.15): the right side shows,', 'with side art and the flipper button.'] },
    ]),
    'cabinet-a': cabinetSheet('Option A · tray and backbox', 'the playfield sunk into the cabinet, the DMD on a backbox, the machine on legs · same angle as today', THEMES.map((t) => ({ t, o: CAB_A, label: t.tagline, lines: ['the inside of the far wall shows above', 'the floor; the near wall hides its edge'] }))),
    'cabinet-b': cabinetSheet('Option B · tray, backbox and the angle', 'A, tipped to k 0.78 with taller heights and a 0.15 sideways lean, so two faces of the machine show', THEMES.map((t) => ({ t, o: CAB_B, label: t.tagline, lines: ['the right side carries the side art and', 'the flipper button; the lean is adjustable'] }))),
  };
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const only = process.env.ONLY?.split(','); // e.g. ONLY=screen-factory,parts-sheet for a quick look
  for (const [name, svg] of Object.entries(sheets)) {
    if (only && !only.includes(name)) continue;
    const m = svg.match(/width="(\d+)" height="(\d+)"/)!;
    const page = await browser.newPage({ viewport: { width: +m[1], height: +m[2] } });
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Baloo+2:wght@500;700;800&family=Lilita+One&family=Titan+One&family=Luckiest+Guy&family=Bungee&family=Nunito:wght@500;600;700;800&family=DotGothic16&family=Silkscreen&family=VT323&display=swap"><style>html,body{margin:0}</style></head><body>${svg}</body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.close();
    console.log('wrote', `${OUT}/${name}.png`);
  }
  if (only && !only.includes('backdrops')) { await browser.close(); return; }
  // the drifting backdrops as a looping GIF: 6 s at 12 fps
  const frames = `${OUT}/.frames`, N = 72;
  mkdirSync(frames, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 420 } });
  for (let i = 0; i < N; i++) {
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Nunito:wght@500;600;700;800&display=swap"><style>html,body{margin:0}</style></head><body>${backdropPreview(i / N)}</body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${frames}/${String(i).padStart(3, '0')}.png` });
  }
  await browser.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', `${frames}/%03d.png`, '-vf', 'scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none', `${OUT}/backdrops.gif`]);
  rmSync(frames, { recursive: true });
  console.log('wrote', `${OUT}/backdrops.gif`);
}

main();
