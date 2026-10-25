// The machine's fixed layers (ported from tools/concept/scenes.ts): the surround the table stands in,
// the cabinet rim, the floor art, the apron with its decal slots, and the rails. They depend only on the
// theme, the view and the decals, so the renderer builds them once and caches them as a texture.
import { Container, Graphics } from 'pixi.js';
import { DECALS, type DecalIcon, type DecalLook, type DecalShape } from '../data/decals';
import type { Rarity } from '../data/upgrades';
import { LANE_WALL_X, TABLE_H, TABLE_W } from '../sim/constants';
import { FLIPPER_PIVOTS, tableOutline, tableSegments } from '../sim/table';
import { box, flat, hull, label, P, Prop, ribbon, ring, shadow, star, type Pt, type View } from './draw';
import { mat, mix, WHITE, type Theme } from './theme';

export const floorPoly = (): Pt[] => [...tableOutline(), [TABLE_W, 0], [0, 0]];
export const apronPoly = (): Pt[] => [
  [0, 0], [0, 14], [FLIPPER_PIVOTS.L.x + 0.36, FLIPPER_PIVOTS.L.y + 0.62], [8.6, 3.2], [15.4, 3.2],
  [FLIPPER_PIVOTS.R.x - 0.36, FLIPPER_PIVOTS.R.y + 0.62], [LANE_WALL_X, 14], [LANE_WALL_X, 0],
];
/** The cabinet rim around the field, in sim units. */
export const RIM = { cx: 13, cy: 26.1, hw: 14.6, hh: 27.5 };
/** The four decal slots on the apron (sim x, y; they sit on the apron top, z = APRON_Z). */
export const DECAL_SLOT_POS: Pt[] = [[2.6, 6.6], [5.6, 4.4], [18.4, 4.4], [21.4, 6.6]];
export const APRON_Z = 0.5;
export const DECAL_TILT = [-8, 5, -4, 7];

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export interface StuckDecal { look: DecalLook; rarity: Rarity }

/**
 * The cabinet as a diorama object (docs/concept/cabinet-a.png): the playfield sunk into a cabinet with thick
 * walls, a backbox carrying the DMD, the machine standing on little legs. Heights in sim units (ball diameters).
 */
export const CAB = { wallH: 1.6, bottom: -6.5, legBottom: -10.5, boxScreenH: 6.8, boxY: 55, boxHH: 1.1 };
const legs: Pt[] = [[-0.9, 52.2], [26.9, 52.2], [-0.9, -0.7], [26.9, -0.7]];
const backboxH = (v: View) => CAB.boxScreenH / v.kz;

/** How far the machine reaches above and below the view's origin, in sim units on screen: for fitting it. */
export function machineExtent(k: number, kz: number) {
  const top = (CAB.boxY + CAB.boxHH) * k + (CAB.wallH + CAB.boxScreenH / kz) * kz;
  const bottom = -(legs[2][1] * k + CAB.legBottom * kz);
  return { top, bottom };
}

/** The DMD screen on the backbox's front face (screen pixels in machine space). */
export function dmdRect(v: View) {
  const zTop = CAB.wallH + backboxH(v), y = CAB.boxY - CAB.boxHH;
  const [x0, y0] = P(v, 0.4, y, zTop - 0.35 / v.kz), [x1, y1] = P(v, 25.6, y, CAB.wallH + 0.3 / v.kz);
  const pad = Math.max(8, (y1 - y0) * 0.16);
  return { frame: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, screen: { x: x0 + 14, y: y0 + pad, w: x1 - x0 - 28, h: y1 - y0 - pad * 2 } };
}

/** Everything that does not move: surround, legs, backbox, shell, the well with its floor art, apron, decals, rails. */
export function buildMachine(v: View, t: Theme, decals: (StuckDecal | null)[]): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const wood = mat(t, t.rim);
  // the machine's shadow on the ground, and the surround standing on the same ground
  g.poly(flat(box(RIM.cx + 1, RIM.cy - 0.7, RIM.hw + 0.8, RIM.hh + 1.1, 0, 3).map(([x, y]) => P(v, x + 0.8, y - 0.8, CAB.legBottom)))).fill({ color: t.shadeTint, alpha: 0.2 });
  surround(g, { ...v, oy: v.oy - CAB.legBottom * v.kz * v.S }, t);
  // the little legs, far ones first (only the front two peek out under the cabinet)
  for (const [lx, ly] of legs) {
    const leg = new Prop(v, t);
    leg.cyl(lx, ly, 0.5, CAB.legBottom, CAB.bottom - CAB.legBottom, mat(t, t.metal), { n: 20 });
    leg.cyl(lx, ly, 0.62, CAB.legBottom, 0.35, mat(t, t.rubber), { n: 20 });
    leg.draw(g);
  }
  // the backbox rises from the head of the table and carries the DMD (its text is drawn live)
  const bb = new Prop(v, t);
  bb.prism(box(RIM.cx, CAB.boxY, RIM.hw - 0.8, CAB.boxHH, 0, 0.3), CAB.wallH, backboxH(v), wood);
  bb.draw(g);
  const d = dmdRect(v), fr = d.frame, sc = d.screen;
  g.roundRect(fr.x, fr.y, fr.w, fr.h, 10).fill(t.rim).stroke({ width: v.lw * 1.4, color: t.ink });
  const n = Math.max(6, Math.round(fr.w / 22)), pad = sc.y - fr.y, br = Math.min(4.5, pad * 0.3);
  for (let i = 0; i <= n; i++) for (const yy of [fr.y + pad / 2 + 1, fr.y + fr.h - pad / 2 - 1]) {
    g.circle(fr.x + 12 + (i * (fr.w - 24)) / n, yy, br).fill(i % 2 ? t.glow : mix(t.glow, t.shadeTint, 0.45)).stroke({ width: 1.6, color: t.ink });
  }
  g.roundRect(sc.x, sc.y, sc.w, sc.h, 6).fill(t.screen).stroke({ width: v.lw, color: t.ink });
  // the shell: thick walls standing on the legs; its top is the rim
  const shell = new Prop(v, t);
  shell.prism(box(RIM.cx, RIM.cy, RIM.hw, RIM.hh, 0, 1.2), CAB.bottom, CAB.wallH - CAB.bottom, wood, { top: wood.base });
  shell.draw(g);
  // the well: everything inside is seen through the opening at the top of the walls, so the near wall hides the
  // bottom edge of the floor and the inside of the far wall shows above it
  const opening = flat(floorPoly().map(([x, y]) => P(v, x, y, CAB.wallH)));
  const well = new Container();
  const wellMask = new Graphics().poly(opening).fill(WHITE);
  well.mask = wellMask;
  root.addChild(wellMask, well);
  const inside = new Graphics();
  well.addChild(inside);
  inside.poly(opening).fill(mix(t.rim, t.shadeTint, 0.5));
  // a wallpaper stripe on the inside of the far wall, so it reads as a wall and not a shadow
  const band = floorPoly().map(([x, y]) => P(v, x, y, CAB.wallH * 0.55));
  inside.moveTo(band[0][0], band[0][1]);
  for (const q of band.slice(1)) inside.lineTo(q[0], q[1]);
  inside.stroke({ width: v.S * 0.25, color: mix(t.rim, t.shadeTint, 0.3) });
  const floorPts = flat(floorPoly().map(([x, y]) => P(v, x, y)));
  const art = new Container();
  const fg = new Graphics();
  art.addChild(fg);
  floorArt(fg, v, t);
  const mask = new Graphics().poly(floorPts).fill(WHITE);
  art.mask = mask;
  well.addChild(mask, art);
  const top = new Graphics();
  well.addChild(top);
  top.poly(floorPts).stroke({ width: v.lw, color: t.ink, join: 'round' });
  // the apron, with its relic decals: two slots each side, like the rule cards on a real machine
  const apron = new Prop(v, t);
  apron.prism(apronPoly(), 0, APRON_Z, mat(t, t.rim));
  apron.draw(top);
  DECAL_SLOT_POS.forEach(([x, y], i) => {
    const [X, Y] = P(v, x, y, APRON_Z), R = v.S * 1.05;
    const dc = decals[i];
    well.addChild(dc ? decalSprite(t, dc, X, Y, R, v.k, DECAL_TILT[i]) : emptySlot(t, X, Y, R * 0.9, v.k));
  });
  const rg = new Graphics();
  well.addChild(rg);
  rails(rg, v, t);
  // the cut edge round the opening: ink, then the light tone of the wood
  const edge = new Graphics();
  root.addChild(edge);
  edge.poly(opening).stroke({ width: v.lw * 2.4, color: t.ink, join: 'round' });
  edge.poly(opening).stroke({ width: v.lw * 0.9, color: wood.light, join: 'round' });
  // the coin door and the price plate on the front face
  const door = [P(v, 9.5, -1.4, -1.1), P(v, 16.5, -1.4, -1.1), P(v, 16.5, -1.4, -5.5), P(v, 9.5, -1.4, -5.5)];
  edge.poly(flat(door)).fill(mat(t, t.metal).mid).stroke({ width: v.lw, color: t.ink, join: 'round' });
  for (const dx of [11.6, 14.4]) { const [X, Y] = P(v, dx, -1.4, -2.4); edge.roundRect(X - v.S * 0.25, Y - 0.7 * v.S * v.kz, v.S * 0.5, 1.4 * v.S * v.kz, 2).fill(t.ink); }
  const [PX, PY] = P(v, 13, -1.4, -4.1);
  edge.roundRect(PX - 2.2 * v.S, PY - 0.5 * v.S * v.kz, 4.4 * v.S, v.S * v.kz, 3).fill(t.accent).stroke({ width: v.lw * 0.8, color: t.ink });
  return root;
}

function floorArt(g: Graphics, v: View, t: Theme) {
  const at = (x: number, y: number) => P(v, x, y);
  const quad = (x0: number, y0: number, x1: number, y1: number) => flat([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]);
  g.poly(flat(floorPoly().map(([x, y]) => at(x, y)))).fill(t.floor);
  if (t.floorArt === 'plates') {
    for (let x = 0; x < TABLE_W; x += 4) for (let y = 0; y < TABLE_H; y += 4) {
      if ((x / 4 + y / 4) % 2 === 0) g.poly(quad(x, y, x + 4, y + 4)).fill(t.floor2);
      const [X, Y] = at(x + 0.4, y + 0.4);
      g.circle(X, Y, v.S * 0.09).fill(mix(t.floor2, t.shadeTint, 0.35));
    }
    // a painted gear behind the centre and hazard stripes leading to the drain
    const gear = ring(12, 34, 7.2, 48).map(([x, y], i): Pt => { const k = i % 4 < 2 ? 1 : 0.86; return at(12 + (x - 12) * k, 34 + (y - 34) * k); });
    g.poly(flat(gear)).stroke({ width: v.S * 0.5, color: mix(t.floor2, t.shadeTint, 0.25), join: 'round' });
    for (let x = -4; x < TABLE_W; x += 1.6) g.poly(flat([at(x, 3.2), at(x + 0.8, 3.2), at(x + 2.2, 6.2), at(x + 1.4, 6.2)])).fill({ color: t.ink, alpha: 0.85 });
    for (let x = -4; x < TABLE_W; x += 1.6) g.poly(flat([at(x + 0.8, 3.2), at(x + 1.6, 3.2), at(x + 3, 6.2), at(x + 2.2, 6.2)])).fill(t.role.coin);
  } else if (t.floorArt === 'checker') {
    for (let x = 0; x < TABLE_W; x += 2) for (let y = 0; y < 21; y += 2) g.poly(quad(x, y, x + 2, y + 2)).fill((x + y) % 4 === 0 ? t.paper : t.art.floorAlt);
    // awning stripes just inside the dome, and a giant painted plate in the middle
    const dome = (rr: number, a: number) => at(13 + Math.cos(a) * 13 * rr, 40 + Math.sin(a) * 12 * rr);
    for (let i = 0; i < 18; i++) {
      const a0 = Math.PI * (i / 18), a1 = Math.PI * ((i + 1) / 18);
      g.poly(flat([dome(1.02, a0), dome(1.02, a1), dome(0.86, a1), dome(0.86, a0)])).fill(i % 2 ? t.paper : t.accent);
    }
    for (const [rr, c] of [[7.6, t.paper], [6.4, mix(t.paper, t.shadeTint, 0.12)], [5.9, t.paper]] as const)
      g.poly(flat(ring(12, 33.5, rr, 48).map(([x, y]) => at(x, y)))).fill(c).stroke({ width: v.lw * 0.5, color: t.ink });
  } else {
    const rnd = rng(7);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * TABLE_W, y = rnd() * TABLE_H, r = 0.8 + rnd() * 2;
      g.poly(flat(ring(x, y, r, 14, r * 0.7).map(([a, b]) => at(a, b)))).fill(t.floor2);
    }
    // a cobbled path from the flippers to the keep
    const path: Pt[] = [[12, 3], [11.4, 9], [12.8, 15], [11.6, 21], [12.4, 28], [12, 34]];
    for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < 6; k++) {
      const u = k / 6, x = path[i][0] + (path[i + 1][0] - path[i][0]) * u, y = path[i][1] + (path[i + 1][1] - path[i][1]) * u;
      for (const dx of [-0.85, 0.85]) {
        const sx = x + dx + (rnd() - 0.5) * 0.3, sy = y + (rnd() - 0.5) * 0.3;
        g.poly(flat(ring(sx, sy, 0.62, 8, 0.46).map(([a, b]) => at(a, b)))).fill(t.rail).stroke({ width: v.lw * 0.35, color: t.ink });
      }
    }
    for (let i = 0; i < 40; i++) {
      const [X, Y] = at(rnd() * TABLE_W, rnd() * TABLE_H);
      g.circle(X, Y, v.S * 0.12).fill(i % 3 ? t.art.twinkle[0] : t.art.twinkle[1]);
    }
  }
}

/** The arrow inserts up the middle: the playfield's own "where to shoot" language. `on` is the lit one (-1 none). */
export function arrowInserts(g: Graphics, v: View, t: Theme, on: number) {
  for (let i = 0; i < 3; i++) {
    const y = 10.5 + i * 1.6, pts: Pt[] = [[12, y + 0.9], [12.9, y], [12.5, y], [12.5, y - 0.4], [11.5, y - 0.4], [11.5, y], [11.1, y]];
    g.poly(flat(pts.map(([x, yy]) => P(v, x, yy, 0.01)))).fill(i === on ? t.accent : mix(t.accent, t.shadeTint, 0.5)).stroke({ width: v.lw * 0.4, color: t.ink });
  }
}

/** The walls as continuous rails: stacked strokes from the floor to the rail top, ink first. */
function rails(g: Graphics, v: View, t: Theme) {
  const segs = tableSegments(), m = mat(t, t.rail), w = 0.48 * v.S, h = 0.75, steps = 5;
  const chains: Pt[][] = [];
  for (const s of segs) {
    const last = chains[chains.length - 1];
    if (last && Math.hypot(last[last.length - 1][0] - s.x1, last[last.length - 1][1] - s.y1) < 1e-6) last.push([s.x2, s.y2]);
    else chains.push([[s.x1, s.y1], [s.x2, s.y2]]);
  }
  const st = (z: number, width: number, color: string) => {
    for (const c of chains) {
      const pts = c.map(([x, y]) => P(v, x, y, z));
      g.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) g.lineTo(q[0], q[1]);
      g.stroke({ width, color, cap: 'round', join: 'round' });
    }
  };
  for (let i = 0; i <= steps; i++) st((h * i) / steps, w + v.lw * 2, t.ink);
  for (let i = 0; i < steps; i++) st((h * i) / steps, w, m.shade);
  st(h, w, m.base);
  st(h + 0.04, w * 0.3, m.light);
}

// ------------------------------------------------------------------ surroundings (the diorama base)
function surround(g: Graphics, v: View, t: Theme) {
  const items: { y: number; draw: (g: Graphics) => void }[] = [];
  const add = (y: number, draw: (g: Graphics) => void) => items.push({ y, draw });
  const props = t.art.props;
  if (t.surround === 'factory') {
    const tanks: [number, number, number, number, string][] = [[-7, 44, 2.2, 6, props[0]], [-6.4, 30, 1.6, 4, props[1]], [31.5, 40, 2.4, 7, props[2]], [31, 22, 1.5, 3.5, props[3]]];
    for (const [x, y, r, h, c] of tanks) {
      add(y, (gg) => {
        shadow(gg, v, t, x, y, r * 1.1, r * 1.1, 0.25);
        const p = new Prop(v, t);
        p.cyl(x, y, r, 0, h, mat(t, t.metal));
        p.cyl(x, y, r * 1.02, h * 0.62, h * 0.16, mat(t, c));
        p.cyl(x, y, r * 0.5, h, 0.5, mat(t, t.metal));
        p.draw(gg);
      });
    }
    add(29.9, (gg) => pipe(gg, v, t, [[-4.9, 44, 3], [-3.3, 44, 3], [-3.3, 30, 2], [-4.85, 30, 2]], [-3.3, 37, 2.5]));
  } else if (t.surround === 'diner') {
    const bottles: [number, number, number][] = [[-4.5, 42, 5], [-6.2, 39, 4.2], [-4.6, 28, 3.4], [31, 40, 4.6], [32.5, 37, 3], [31.5, 24, 3.8]];
    bottles.forEach(([x, y, h], i) => add(y, (gg) => {
      const c = props[i % props.length];
      shadow(gg, v, t, x, y, 1.1, 1.1, 0.25);
      const p = new Prop(v, t);
      p.cyl(x, y, 1, 0, h, mat(t, c));
      p.cyl(x, y, 0.5, h, 1.0, mat(t, c));
      p.cyl(x, y, 0.56, h + 1, 0.4, mat(t, t.paper));
      p.draw(gg);
    }));
  } else {
    const trees: [number, number, number][] = [[-5, 44, 1.2], [-6.4, 38, 0.9], [-4.2, 28, 1], [31, 42, 1.3], [32.4, 34, 0.8], [30.8, 22, 1.1]];
    for (const [x, y, s] of trees) add(y, (gg) => {
      const green = mat(t, t.art.foliage);
      shadow(gg, v, t, x, y, 1.6 * s, 1.6 * s, 0.25);
      const p = new Prop(v, t);
      p.cyl(x, y, 0.35 * s, 0, 1.2 * s, mat(t, t.art.trunk));
      for (let k = 0; k < 3; k++) {
        const z = (1 + k * 1.5) * s, r = (2 - k * 0.5) * s;
        const base = ring(x, y, r, 20).map(([a, b]) => P(v, a, b, z)), apex = P(v, x, y, z + 2.4 * s);
        p.face(hull([...base, apex]), green.base);
        const right = hull([...base.filter((q) => q[0] > P(v, x, y)[0]), apex]);
        if (right.length > 2) p.face(right, green.shade, { sil: false, line: 0 });
      }
      p.draw(gg);
    });
  }
  items.sort((a, b) => b.y - a.y).forEach((i) => i.draw(g));
}

/** A metal pipe through sim points (x, y, z): ink, body, a highlight, flanges at the ends, and a valve wheel. */
function pipe(g: Graphics, v: View, t: Theme, pts: [number, number, number][], valve?: [number, number, number]) {
  const sp = pts.map(([x, y, z]) => P(v, x, y, z)), w = v.S * 0.7, m = mat(t, t.metal);
  const st = (q: Pt[], width: number, c: string) => { g.moveTo(q[0][0], q[0][1]); for (const p of q.slice(1)) g.lineTo(p[0], p[1]); g.stroke({ width, color: c, join: 'round', cap: 'butt' }); };
  st(sp, w + v.lw * 2, t.ink);
  st(sp, w, m.mid);
  st(sp.map(([x, y]): Pt => [x - w * 0.22, y - w * 0.12]), w * 0.22, m.light);
  const flange = (a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, ux = dx / L, uy = dy / L, r = w * 0.75, th = v.S * 0.18;
    g.poly([a[0] + nx * r, a[1] + ny * r, a[0] + nx * r + ux * th, a[1] + ny * r + uy * th, a[0] - nx * r + ux * th, a[1] - ny * r + uy * th, a[0] - nx * r, a[1] - ny * r])
      .fill(m.light).stroke({ width: v.lw * 0.8, color: t.ink, join: 'round' });
  };
  flange(sp[0], sp[1]);
  flange(sp[sp.length - 1], sp[sp.length - 2]);
  if (valve) {
    const [x, y] = P(v, ...valve), r = v.S * 0.85, lw = v.lw;
    for (const [width, c] of [[lw * 2.2, t.ink], [lw * 0.9, t.accent]] as const) {
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4 + 0.4; g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r).lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.stroke({ width, color: c, cap: 'round' });
    }
    g.circle(x, y, r).stroke({ width: lw * 3, color: t.ink });
    g.circle(x, y, r).stroke({ width: lw * 1.4, color: t.accent });
    g.circle(x, y, r * 0.28).fill(t.metal).stroke({ width: lw * 0.8, color: t.ink });
  }
}

// ---------------------------------------------------------------- relic decals
const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 8): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const quadPts = (a: Pt, c: Pt, b: Pt, n = 8): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const u = i / n, k = 1 - u; return [k * k * a[0] + 2 * k * u * c[0] + u * u * b[0], k * k * a[1] + 2 * k * u * c[1] + u * u * b[1]]; });

export function decalOutline(shape: DecalShape, R: number): Pt[] {
  switch (shape) {
    case 'circle': return ring(0, 0, R, 36);
    case 'star': return star(0, 0, R * 1.12, R * 0.62, 5, -Math.PI / 2);
    case 'shield': return [[-R * 0.9, -R * 0.85], [R * 0.9, -R * 0.85], [R * 0.9, -R * 0.1], ...quadPts([R * 0.9, -R * 0.1], [R * 0.9, R * 0.7], [0, R * 1.05]).slice(1), ...quadPts([0, R * 1.05], [-R * 0.9, R * 0.7], [-R * 0.9, -R * 0.1]).slice(1)];
    case 'ticket': {
      const n = R * 0.22;
      return [[-R * 1.15, -R * 0.7], [R * 1.15, -R * 0.7], [R * 1.15, -n], ...arcPts(R * 1.15, 0, n, -Math.PI / 2, -Math.PI * 1.5).slice(1, -1), [R * 1.15, n], [R * 1.15, R * 0.7],
        [-R * 1.15, R * 0.7], [-R * 1.15, n], ...arcPts(-R * 1.15, 0, n, Math.PI / 2, -Math.PI / 2).slice(1, -1), [-R * 1.15, -n]];
    }
    case 'hex': return Array.from({ length: 6 }, (_, i): Pt => [Math.cos((i * Math.PI) / 3) * R, Math.sin((i * Math.PI) / 3) * R]);
    case 'banner': return [[-R * 1.25, -R * 0.5], [R * 1.25, -R * 0.5], [R * 0.95, 0], [R * 1.25, R * 0.5], [-R * 1.25, R * 0.5], [-R * 0.95, 0]];
  }
}

function decalIcon(g: Graphics, c: Container, t: Theme, icon: DecalIcon, R: number) {
  const st = { width: R * 0.07, color: t.ink, join: 'round' as const, cap: 'round' as const };
  const s = R * 0.5;
  switch (icon) {
    case 'cup':
      g.poly([-s * 0.7, -s * 0.6, s * 0.7, -s * 0.6, s * 0.5, s, -s * 0.5, s]).fill(t.paper).stroke(st);
      g.moveTo(s * 0.1, -s * 0.6).lineTo(s * 0.45, -s * 1.3).stroke(st);
      g.circle(-s * 0.15, s * 0.1, s * 0.14).fill(t.role.lane).stroke(st);
      break;
    case 'jar':
      g.roundRect(-s * 0.7, -s * 0.55, s * 1.4, s * 1.5, s * 0.3).fill(mix(t.paper, t.role.lane, 0.25)).stroke(st);
      g.roundRect(-s * 0.8, -s * 0.85, s * 1.6, s * 0.35, s * 0.1).fill(t.metal).stroke(st);
      g.circle(0, s * 0.25, s * 0.38).fill(t.role.coin).stroke(st);
      break;
    case 'duck':
      g.ellipse(s * 0.05, s * 0.45, s * 0.95, s * 0.55).fill(t.role.coin).stroke(st);
      g.circle(-s * 0.25, -s * 0.3, s * 0.5).fill(t.role.coin).stroke(st);
      g.poly([-s * 0.72, -s * 0.3, -s * 1.17, -s * 0.18, -s * 0.72, -s * 0.02]).fill(t.accent).stroke(st);
      g.circle(-s * 0.3, -s * 0.42, s * 0.09).fill(t.ink);
      break;
    case 'star':
      g.poly(flat(star(0, 0, s * 1.05, s * 0.45, 5, -Math.PI / 2))).fill(t.role.coin).stroke(st);
      break;
    case 'clock':
      g.circle(0, 0, s).fill(t.paper).stroke(st);
      g.moveTo(0, 0).lineTo(0, -s * 0.65).moveTo(0, 0).lineTo(s * 0.45, s * 0.2).stroke(st);
      break;
    case 'receipt':
      g.poly([-s * 0.6, -s, s * 0.6, -s, s * 0.6, s, s * 0.3, s * 0.8, 0, s, -s * 0.3, s * 0.8, -s * 0.6, s]).fill(t.paper).stroke(st);
      break;
    case 'seven': {
      g.circle(0, 0, s * 0.95).fill(t.paper).stroke(st);
      const L = label('7', s * 1.5, t.accent, { stroke: t.ink, strokeW: s * 0.14 });
      c.addChild(L);
      break;
    }
  }
}

/** A die-cut vinyl decal: white cut margin, ink line, colour field, icon. Flat on the apron (squashed by k). */
export function decalSprite(t: Theme, d: StuckDecal, x: number, y: number, R: number, k = 1, rot = 0): Container {
  const outer = new Container();
  outer.position.set(x, y);
  outer.scale.y = k;
  const inner = new Container();
  inner.rotation = (rot * Math.PI) / 180;
  outer.addChild(inner);
  const g = new Graphics();
  inner.addChild(g);
  const path = decalOutline(d.look.shape, R);
  const rim = d.rarity === 'legendary' ? t.accent : d.rarity === 'rare' ? t.role.coin : t.paper;
  g.poly(flat(path.map(([a, b]): Pt => [a + R * 0.08, b + R * 0.1]))).fill({ color: t.shadeTint, alpha: 0.25 });
  g.poly(flat(path.map(([a, b]): Pt => [a * 1.16, b * 1.16]))).fill(WHITE).stroke({ width: R * 0.06, color: t.ink, join: 'round' });
  g.poly(flat(path)).fill(d.look.color).stroke({ width: R * (rim === t.paper ? 0.06 : 0.12), color: rim === t.paper ? t.ink : rim, join: 'round' });
  decalIcon(g, inner, t, d.look.icon, R);
  return outer;
}

export function emptySlot(t: Theme, x: number, y: number, R: number, k = 1): Container {
  const c = new Container();
  c.position.set(x, y);
  c.scale.y = k;
  const g = new Graphics();
  c.addChild(g);
  g.circle(0, 0, R * 1.1).fill(mix(t.rim, t.shadeTint, 0.25));
  // a dashed rim: short arcs round the slot
  for (let i = 0; i < 14; i++) {
    const a0 = (i / 14) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / 14 * 0.55;
    g.moveTo(Math.cos(a0) * R * 1.1, Math.sin(a0) * R * 1.1).arc(0, 0, R * 1.1, a0, a1).stroke({ width: R * 0.09, color: t.paper });
  }
  g.moveTo(-R * 0.35, 0).lineTo(R * 0.35, 0).moveTo(0, -R * 0.35).lineTo(0, R * 0.35).stroke({ width: R * 0.12, color: t.paper, cap: 'round' });
  return c;
}

/** The decal look for an upgrade, if it is a Rules decal. */
export const decalLook = (id: string) => (DECALS as Record<string, DecalLook | undefined>)[id];

export { ribbon };
