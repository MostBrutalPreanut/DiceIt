// The machine's fixed layers (ported from tools/concept/scenes.ts): the surround the table stands in,
// the cabinet rim, the floor art, the apron with its decal slots, and the rails. They depend only on the
// theme, the view and the decals, so the renderer builds them once and caches them as a texture.
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { DECALS, type DecalIcon, type DecalLook, type DecalShape } from '../data/decals';
import type { Rarity } from '../data/parts';
import { LANE_WALL_X, TABLE_H, TABLE_W } from '../sim/constants';
import { BIG_BOI_AT } from '../sim/layout';
import { FLIPPER_PIVOTS, tableSegments } from '../sim/table';
import { APRON_Z, apronPoly, DECAL_SLOT_POS, DECOR_SLOT, decorPanel, floorPoly, RIM, WALL_TOP } from '../sim/cabinet';
import { box, flat, hull, label, P, Prop, ribbon, ring, shadow, shadowPoly, star, type Pt, type View } from './draw';
import { mat, mix, WHITE, type Theme } from './theme';

export { APRON_Z, apronPoly, DECAL_SLOT_POS, floorPoly, RIM } from '../sim/cabinet';
export const DECAL_TILT = [-8, 5, -4, 7];

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export interface StuckDecal { look: DecalLook; rarity: Rarity }

/**
 * The cabinet as a diorama object (docs/concept/cabinet-a.png): the playfield sunk into a cabinet with thick
 * walls, a backbox carrying the DMD, the machine standing on little legs. Heights in sim units (ball diameters).
 */
export const CAB = { wallH: WALL_TOP, bottom: -6.5, legBottom: -10.5, boxScreenH: 6.8, boxY: 55, boxHH: 1.1 };
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
export function buildMachine(v: View, t: Theme, decals: (StuckDecal | null)[], ledge?: number): Container {
  const root = new Container();
  // the machine's shadow on the ground, and the surround standing on the same ground (Castle Crash first lays
  // out the land it stands in; that is kept between rebuilds, since decals and the ledge never change it)
  const ground = (gg: Graphics) => {
    gg.poly(flat(box(RIM.cx + 1, RIM.cy - 0.7, RIM.hw + 0.8, RIM.hh + 1.1, 0, 3).map(([x, y]) => P(v, x + 0.8, y - 0.8, CAB.legBottom)))).fill({ color: t.shadeTint, alpha: 0.2 });
    surround(gg, { ...v, oy: v.oy - CAB.legBottom * v.kz * v.S }, t);
  };
  const land = t.surround === 'castle';
  if (land) root.addChild(new Graphics(kept('land', v, t, (gg) => { castleLand(gg, v, t); ground(gg); })));
  const g = new Graphics();
  root.addChild(g);
  const wood = mat(t, t.rim);
  if (!land) ground(g);
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
  const meadow = t.floorArt === 'meadow';
  const fg = meadow ? new Graphics(kept('floor', v, t, (gg) => floorArt(gg, v, t))) : new Graphics();
  art.addChild(fg);
  if (!meadow) floorArt(fg, v, t);
  const mask = new Graphics().poly(floorPts).fill(WHITE);
  art.mask = mask;
  well.addChild(mask, art);
  const top = new Graphics();
  well.addChild(top);
  top.poly(floorPts).stroke({ width: v.lw, color: t.ink, join: 'round' });
  decorScreenFrame(top, v, t);
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
  rails(rg, v, t, ledge);
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

/**
 * The geometry of a layer that depends only on the theme and the view, kept so a rebuild of the machine (a new
 * decal, a moved ledge) reuses it instead of triangulating it again. A context handed to a Graphics outlives
 * the Graphics, so the baked container can be destroyed as usual. The renderer keeps two tips; so do we, per layer.
 */
const keptLayers = new Map<string, GraphicsContext>();
function kept(layer: string, v: View, t: Theme, draw: (g: Graphics) => void): GraphicsContext {
  const key = [layer, t.id, v.S, v.k, v.kz, v.ox, v.oy, v.lw].join();
  let c = keptLayers.get(key);
  if (!c) {
    c = new GraphicsContext();
    const g = new Graphics(c);
    draw(g);
    g.destroy();
    const same = [...keptLayers.keys()].filter((k) => k.startsWith(layer + ','));
    for (const k of same.slice(0, -1)) { keptLayers.get(k)!.destroy(); keptLayers.delete(k); }
    keptLayers.set(key, c);
  }
  return c;
}

/**
 * The decor screen at the head of the table, empty: a metal bezel round dark glass dotted like the DMD, with a faint
 * plus in the middle. Decor put in it draws its own picture over the glass (props.ts decorScreen).
 */
function decorScreenFrame(g: Graphics, v: View, t: Theme) {
  const pts = (inset: number) => flat(decorPanel(undefined, undefined, inset).map(([x, y]) => P(v, x, y, 0.005)));
  g.poly(pts(-0.3)).fill(mix(t.metal, t.shadeTint, 0.15)).stroke({ width: v.lw * 0.9, color: t.ink, join: 'round' });
  g.poly(pts(0.12)).fill(t.screen).stroke({ width: v.lw * 0.6, color: t.ink, join: 'round' });
  for (let x = DECOR_SLOT.x - 7; x <= DECOR_SLOT.x + 7; x += 0.55) for (let y = DECOR_SLOT.y - 1.4; y <= DECOR_SLOT.y + 2; y += 0.55) {
    if (Math.hypot((x - DECOR_SLOT.x) / 11.75, (y - (DECOR_SLOT.y - 9.7)) / 11.2) > 1 || y < DECOR_SLOT.y - 1.0) continue;
    const [X, Y] = P(v, x, y, 0.01);
    g.circle(X, Y, Math.max(0.6, v.S * 0.07)).fill({ color: t.dmd, alpha: 0.16 });
  }
  const [cx, cy] = P(v, DECOR_SLOT.x, DECOR_SLOT.y + 0.05, 0.01), r = v.S * 0.45;
  g.moveTo(cx - r, cy).lineTo(cx + r, cy).moveTo(cx, cy - r * v.k).lineTo(cx, cy + r * v.k).stroke({ width: v.S * 0.14, color: t.dmd, alpha: 0.35, cap: 'round' });
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
    // a funfair rosette painted under Big Boi: twelve round pink petals, a ring of marquee bulbs, a sunburst inside;
    // and hazard stripes leading to the drain
    const { x: cx, y: cy } = BIG_BOI_AT, around = (r: (a: number) => number, n = 96) => flat(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return at(cx + Math.cos(a) * r(a), cy + Math.sin(a) * r(a)); }));
    g.poly(around((a) => 6.5 + 1.05 * Math.abs(Math.cos(a * 6)))).fill(mix(t.accent, t.paper, 0.45)).stroke({ width: v.lw * 0.6, color: t.ink, join: 'round' });
    g.poly(around(() => 5.7)).fill(t.floor).stroke({ width: v.lw * 0.6, color: t.ink });
    for (let i = 0; i < 16; i += 2) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2, wedge: Pt[] = [at(cx, cy)];
      for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; wedge.push(at(cx + Math.cos(a) * 5.7, cy + Math.sin(a) * 5.7)); }
      g.poly(flat(wedge)).fill(mix(t.floor2, t.glow, 0.25));
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, [X, Y] = at(cx + Math.cos(a) * 6.45, cy + Math.sin(a) * 6.45);
      g.circle(X, Y, v.S * 0.24).fill(i % 2 ? t.paper : t.glow).stroke({ width: v.lw * 0.45, color: t.ink });
    }
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
      g.poly(flat(ring(BIG_BOI_AT.x, BIG_BOI_AT.y, rr, 48).map(([x, y]) => at(x, y)))).fill(c).stroke({ width: v.lw * 0.5, color: t.ink });
  } else {
    const rnd = rng(7);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * TABLE_W, y = rnd() * TABLE_H, r = 0.8 + rnd() * 2;
      g.poly(flat(ring(x, y, r, 14, r * 0.7).map(([a, b]) => at(a, b)))).fill(t.floor2);
    }
    flagstones(g, v, t, rnd);
    for (let i = 0; i < 40; i++) {
      const [X, Y] = at(rnd() * TABLE_W, rnd() * TABLE_H);
      g.circle(X, Y, v.S * 0.12).fill(i % 3 ? t.art.twinkle[0] : t.art.twinkle[1]);
    }
  }
}

/** Catmull-Rom through the points, n samples per span: a smooth path from a few control points. */
function smooth(pts: Pt[], n = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u;
      const f = (j: 0 | 1) => 0.5 * (2 * b[j] + (c[j] - a[j]) * u + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * u2 + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * u3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The centroid of a polygon's vertices (good enough for the near-convex stones). */
const centre = (pts: Pt[]): Pt => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
/** A polygon pulled towards c by k and moved by (dx, dy). */
const shrink = (pts: Pt[], c: Pt, k: number, dx = 0, dy = 0): Pt[] => pts.map(([x, y]) => [c[0] + (x - c[0]) * k + dx, c[1] + (y - c[1]) * k + dy]);

/**
 * Castle Crash's path from the flippers to the keep: irregular flagstones on a soil bed with a shadow along
 * its lower edge. Each stone is a sticker in a grey-brown rock tone: cool shade on the lower right, a light
 * chip on the upper left, the odd crack, moss in the joints. Mid values, so the ball stays on top. Shapes of
 * one colour share one fill, so the bake stays cheap.
 */
function flagstones(g: Graphics, v: View, t: Theme, rnd: () => number) {
  const tones = t.art.rock ?? [t.rail];
  const scr = (pts: Pt[]) => flat(pts.map(([x, y]) => P(v, x, y)));
  const mid = smooth([[12, 1.5], [11.4, 9], [12.8, 15], [11.6, 21], [12.4, 28], [BIG_BOI_AT.x, BIG_BOI_AT.y]], 12); // the path leads up to Big Boi
  const len = [0];
  for (let i = 1; i < mid.length; i++) len.push(len[i - 1] + Math.hypot(mid[i][0] - mid[i - 1][0], mid[i][1] - mid[i - 1][1]));
  const L = len[len.length - 1], HW = 1.75;
  /** (u along the path, s across it, positive to the right) -> sim point */
  const to = (u: number, sx: number): Pt => {
    let i = 1;
    while (i < len.length - 1 && len[i] < u) i++;
    const a = mid[i - 1], b = mid[i], f = Math.max(0, Math.min(1, (u - len[i - 1]) / (len[i] - len[i - 1] || 1)));
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    return [a[0] + dx * f + (dy / d) * sx, a[1] + dy * f - (dx / d) * sx];
  };
  // the bed: a ragged band of soil, its shadow first (down and to the right, in the theme's shadow hue)
  const edgeL: Pt[] = [], edgeR: Pt[] = [];
  for (let u = 0; u <= L + 0.01; u += 0.6) {
    edgeL.push(to(u, -(HW + 0.16 + rnd() * 0.14)));
    edgeR.push(to(u, HW + 0.16 + rnd() * 0.14));
  }
  const bed = [...edgeL, ...[...edgeR].reverse()];
  shadowPoly(g, v, t, bed, 0.3);
  g.poly(scr(bed)).fill(mix(mix(t.art.trunk, tones[tones.length - 1], 0.5), t.shadeTint, 0.12)).stroke({ width: v.lw * 0.5, color: t.ink, join: 'round' });
  // the stones, row by row in a running bond: three then two across, jittered, the outer edges ragged
  const stones: { pts: Pt[]; tone: number; c: Pt }[] = [], joints: Pt[] = [], cracks: Pt[][] = [];
  let u0 = 0.15, row = 0;
  while (u0 < L - 0.4) {
    const u1 = Math.min(L - 0.05, u0 + 1.2 + rnd() * 0.55);
    const n = row % 2 ? 2 : 3, cuts = [-HW];
    for (let k = 1; k < n; k++) cuts.push(-HW + (2 * HW * k) / n + (rnd() - 0.5) * 0.5);
    cuts.push(HW);
    for (let k = 0; k < n; k++) {
      const gap = 0.07, s0 = cuts[k] + gap, s1 = cuts[k + 1] - gap, a = u0 + gap, b = u1 - gap;
      const j = (outer: boolean) => (rnd() - 0.5) * (outer ? 0.36 : 0.16);
      const corners: Pt[] = [[a + j(false), s0 + j(k === 0)], [b + j(false), s0 + j(k === 0)], [b + j(false), s1 + j(k === n - 1)], [a + j(false), s1 + j(k === n - 1)]];
      const local: Pt[] = [];
      corners.forEach((cn, i) => {
        const d = corners[(i + 1) % 4];
        for (const f of [0.2, 0.5, 0.8]) {
          const bulge = f === 0.5 ? (rnd() - 0.3) * 0.1 : 0;
          local.push([cn[0] + (d[0] - cn[0]) * f + (i % 2 ? bulge : 0), cn[1] + (d[1] - cn[1]) * f + (i % 2 ? 0 : bulge)]);
        }
      });
      const pts = local.map(([uu, ss]) => to(uu, ss)), c = centre(pts);
      stones.push({ pts, tone: Math.floor(rnd() * tones.length), c });
      if (rnd() < 0.3) {
        // a crack from one edge part-way across
        const e = pts[Math.floor(rnd() * pts.length)], cr: Pt[] = [e];
        for (let q = 1; q <= 3; q++) cr.push([e[0] + (c[0] - e[0]) * q * 0.22 + (rnd() - 0.5) * 0.22, e[1] + (c[1] - e[1]) * q * 0.22 + (rnd() - 0.5) * 0.22]);
        cracks.push(cr);
      }
      if (k > 0) joints.push(to(u0, cuts[k]));
    }
    if (rnd() < 0.5) joints.push(to(u1, (rnd() - 0.5) * HW * 1.6));
    u0 = u1;
    row++;
  }
  // shade, then the lit top (pulled in and up-left, so the shade shows on the lower right), then the chip
  tones.forEach((tone, i) => {
    const mine = stones.filter((st) => st.tone === i);
    if (!mine.length) return;
    for (const st of mine) g.poly(scr(st.pts));
    g.fill(mat(t, tone).shade);
    for (const st of mine) g.poly(scr(shrink(st.pts, st.c, 0.84, -0.05, 0.07)));
    g.fill(tone);
    let chips = 0;
    for (const st of mine) {
      const top = shrink(st.pts, st.c, 0.84, -0.05, 0.07), lit = top.filter(([x, y]) => y - st.c[1] - (x - st.c[0]) > 0.25);
      if (lit.length >= 2) { g.poly(scr([...lit, ...shrink(lit, st.c, 0.62).reverse()])); chips++; }
    }
    if (chips) g.fill(mix(tone, WHITE, 0.32));
  });
  for (const st of stones) g.poly(scr(st.pts));
  g.stroke({ width: v.lw * 0.42, color: t.ink, join: 'round' });
  for (const cr of cracks) {
    const sp = cr.map(([x, y]) => P(v, x, y));
    g.moveTo(sp[0][0], sp[0][1]);
    for (const q of sp.slice(1)) g.lineTo(q[0], q[1]);
  }
  if (cracks.length) g.stroke({ width: v.lw * 0.32, color: mix(t.ink, mat(t, tones[0]).shade, 0.25), cap: 'round', join: 'round' });
  // moss in some of the joints, and grass tufts along both edges
  const moss = mat(t, mix(t.art.foliage, t.floor, 0.35)), blobs: [number, number, number][] = [];
  for (const [x, y] of joints) if (rnd() < 0.45) blobs.push([x, y, 0.2 + rnd() * 0.16]);
  for (const [x, y, r] of blobs) g.poly(scr(star(x, y, r, r * 0.72, 5, x * 7)));
  if (blobs.length) {
    g.fill(moss.base).stroke({ width: v.lw * 0.3, color: t.ink, join: 'round' });
    for (const [x, y, r] of blobs) { const [X, Y] = P(v, x - r * 0.25, y + r * 0.25); g.circle(X, Y, r * 0.3 * v.S); }
    g.fill(moss.light);
  }
  tufts(g, v, [...edgeL, ...edgeR].filter((_, i) => i % 2 === 0 && rnd() < 0.65).map(([x, y]) => P(v, x, y)), mat(t, t.art.foliage).base, rnd);
}

/** Grass tufts at screen points: three blades each, all in one fill. */
function tufts(g: Graphics, v: View, at: Pt[], color: string, rnd: () => number, size = 1) {
  if (!at.length) return;
  for (const [X, Y] of at) {
    const h = v.S * (0.45 + rnd() * 0.25) * size, w = v.S * 0.12 * size;
    for (const lean of [-0.5, 0, 0.55]) g.poly([X - w + lean * v.S * 0.2, Y, X + w + lean * v.S * 0.2, Y, X + lean * h * 0.8, Y - h]);
  }
  g.fill(color);
}

/** The arrow inserts up the middle: the playfield's own "where to shoot" language. `on` is the lit one (-1 none). */
export function arrowInserts(g: Graphics, v: View, t: Theme, on: number) {
  for (let i = 0; i < 3; i++) {
    const y = 10.5 + i * 1.6, pts: Pt[] = [[12, y + 0.9], [12.9, y], [12.5, y], [12.5, y - 0.4], [11.5, y - 0.4], [11.5, y], [11.1, y]];
    g.poly(flat(pts.map(([x, yy]) => P(v, x, yy, 0.01)))).fill(i === on ? t.accent : mix(t.accent, t.shadeTint, 0.5)).stroke({ width: v.lw * 0.4, color: t.ink });
  }
}

/** The walls as continuous rails: stacked strokes from the floor to the rail top, ink first. */
function rails(g: Graphics, v: View, t: Theme, ledge?: number) {
  const segs = tableSegments(ledge), m = mat(t, t.rail), w = 0.48 * v.S, h = 0.75, steps = 5;
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
    // a forest edge: pines, round oaks, bushes and rocks on the meadow either side of the machine
    const pines: [number, number, number][] = [[-5, 44, 1.2], [-6.4, 36, 0.9], [-9.6, 24, 1], [31, 42, 1.3], [32.4, 32, 0.85], [35.6, 16, 1]];
    const oaks: [number, number, number][] = [[-9.2, 40, 1.05], [-4.6, 27, 1], [-6.8, 11, 1.2], [35.2, 38, 1], [30.8, 22, 1.1], [31.2, 6, 0.9]];
    const bushes: [number, number, number][] = [[-3.4, 19, 0.8], [-10.2, 33, 0.7], [-3.6, 3, 0.75], [29.6, 13, 0.8], [36.4, 27, 0.7]];
    const rocks: [number, number, number][] = [[-7.8, 30, 0.9], [-10.4, 15, 0.7], [-2.9, 9, 0.55], [34, 31, 0.8], [29.4, 30, 0.5], [34.8, 9, 0.9]];
    for (const [x, y, sc] of pines) add(y, (gg) => pine(gg, v, t, x, y, sc));
    for (const [x, y, sc] of oaks) add(y, (gg) => oak(gg, v, t, x, y, sc));
    for (const [x, y, sc] of bushes) add(y, (gg) => bush(gg, v, t, x, y, sc));
    rocks.forEach(([x, y, sc], i) => add(y, (gg) => boulder(gg, v, t, x, y, sc, 11 + i)));
  }
  items.sort((a, b) => b.y - a.y).forEach((i) => i.draw(g));
}

// ---------------------------------------------------------------- Castle Crash: the land around the machine
function pine(g: Graphics, v: View, t: Theme, x: number, y: number, s: number) {
  const green = mat(t, t.art.foliage);
  shadow(g, v, t, x, y, 1.6 * s, 1.6 * s, 0.25);
  const p = new Prop(v, t);
  p.cyl(x, y, 0.35 * s, 0, 1.2 * s, mat(t, t.art.trunk));
  for (let k = 0; k < 3; k++) {
    const z = (1 + k * 1.5) * s, r = (2 - k * 0.5) * s;
    const base = ring(x, y, r, 20).map(([a, b]) => P(v, a, b, z)), apex = P(v, x, y, z + 2.4 * s);
    p.face(hull([...base, apex]), green.base);
    const right = hull([...base.filter((q) => q[0] > P(v, x, y)[0]), apex]);
    if (right.length > 2) p.face(right, green.shade, { sil: false, line: 0 });
  }
  p.draw(g);
}

/** A round lump of canopy in screen space: base, a shade on the lower right, a light patch on the upper left. */
function lump(p: Prop, X: number, Y: number, r: number, m: { base: string; shade: string; light: string }, ry = r) {
  const o = ring(X, Y, r, 16, ry);
  p.face(o, m.base, { line: 0 });
  const sh = hull([...o.filter((q) => q[0] > X + r * 0.18 || q[1] > Y + ry * 0.55), [X + r * 0.25, Y + ry * 0.2]]);
  p.face(sh, m.shade, { sil: false, line: 0 });
  p.face(ring(X - r * 0.38, Y - ry * 0.4, r * 0.26, 8, ry * 0.18), m.light, { sil: false, line: 0 });
  p.face(o, null, { sil: false, line: 0.35 });
}

/** A round oak: a trunk and three lumps of canopy (the theme's second green). */
function oak(g: Graphics, v: View, t: Theme, x: number, y: number, s: number) {
  const green = mat(t, t.art.props[1] ?? t.art.foliage), S = v.S;
  shadow(g, v, t, x, y, 1.5 * s, 1.5 * s, 0.18);
  const p = new Prop(v, t);
  p.cyl(x, y, 0.4 * s, 0, 2.2 * s, mat(t, t.art.trunk));
  const [X, Y] = P(v, x, y, 2.2 * s + 1.6 * s);
  lump(p, X - 0.9 * s * S, Y + 0.25 * s * S, 1.35 * s * S, green);
  lump(p, X + 1.0 * s * S, Y + 0.35 * s * S, 1.25 * s * S, green);
  lump(p, X, Y - 0.75 * s * S, 1.55 * s * S, green);
  p.draw(g);
}

function bush(g: Graphics, v: View, t: Theme, x: number, y: number, s: number) {
  const green = mat(t, mix(t.art.foliage, t.art.props[1] ?? t.art.foliage, 0.5)), S = v.S;
  shadow(g, v, t, x, y, 1.1 * s, 0.9 * s, 0.18);
  const p = new Prop(v, t);
  const [X, Y] = P(v, x, y, 0.8 * s);
  lump(p, X - 0.6 * s * S, Y + 0.1 * s * S, 0.8 * s * S, green, 0.72 * s * S);
  lump(p, X + 0.6 * s * S, Y + 0.15 * s * S, 0.75 * s * S, green, 0.68 * s * S);
  lump(p, X, Y - 0.35 * s * S, 0.9 * s * S, green, 0.8 * s * S);
  p.draw(g);
}

/** A boulder in the castle's rock tones: a faceted lump with a cool shaded side, a light top and a crack. */
function boulder(g: Graphics, v: View, t: Theme, x: number, y: number, s: number, seed: number) {
  const rnd = rng(seed), S = v.S, tones = t.art.rock ?? [t.metal], tone = tones[seed % tones.length], m = mat(t, tone);
  shadow(g, v, t, x, y, 1.3 * s, 1 * s, 0.25);
  const [X, Y] = P(v, x, y);
  const w = 1.25 * s * S, h = 1.1 * s * S;
  const out: Pt[] = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI + (i / 8) * Math.PI, r = 0.85 + rnd() * 0.25;
    return [X + Math.cos(a) * w * r, Y - 0.1 * h + Math.sin(a) * h * r];
  });
  out.push([X + w * 0.95, Y + h * 0.1], [X - w * 0.95, Y + h * 0.1]);
  const p = new Prop(v, t);
  p.face(out, m.base);
  p.face([[X + w * 0.1, Y - h * 0.9], ...out.slice(5, 9), [X + w * 0.95, Y + h * 0.1], [X + w * 0.05, Y + h * 0.1]], m.shade, { sil: false, line: 0.3 });
  p.face([[X - w * 0.55, Y - h * 0.55], [X - w * 0.1, Y - h * 0.85], [X + w * 0.05, Y - h * 0.55], [X - w * 0.35, Y - h * 0.35]], mix(tone, WHITE, 0.3), { sil: false, line: 0 });
  p.op((gg) => {
    gg.moveTo(X - w * 0.5, Y - h * 0.05).lineTo(X - w * 0.3, Y - h * 0.3).lineTo(X - w * 0.38, Y - h * 0.5)
      .stroke({ width: v.lw * 0.35, color: t.ink, cap: 'round', join: 'round' });
  });
  p.draw(g);
}

/**
 * The land Castle Crash stands in (screen space: it is the far backdrop, sized by the view so it scales with
 * the machine). A hilltop with an ink contour like every other sticker: far hills with the castle on them,
 * a forest on the middle ridge, the near meadow the machine and its trees stand on. Low contrast and muted,
 * so the machine, the parts and the ball stay the loudest things on screen.
 */
function castleLand(g: Graphics, v: View, t: Theme) {
  const S = v.S, ext = machineExtent(v.k, v.kz);
  const W = 2 * (v.ox + RIM.cx * S), H = 2 * (v.oy - ((ext.top - ext.bottom) / 2) * S), cx = W / 2;
  const ground = { ...v, oy: v.oy - CAB.legBottom * v.kz * S };
  const gy = (y: number) => P(ground, 0, y)[1];
  const half = Math.min(W / 2 - S * 0.6, S * 27.5), rnd = rng(23);
  /** a rolling ridge line, rounded down at both ends of the land */
  const ridge = (base: number, amp: number, f: number, ph: number, drop: number) => (x: number) => {
    const d = (x - cx) / S;
    let y = base + amp * S * (Math.sin(d / f + ph) * 0.6 + Math.sin(d / (f * 0.43) + ph * 2.1) * 0.4);
    const e = Math.abs(x - cx) - (half - drop * S);
    if (e > 0) y += drop * S * (1 - Math.sqrt(Math.max(0, 1 - (e / (drop * S)) ** 2)));
    return y;
  };
  // the front edge of the land: a cliff beside the machine, dipping out of sight under it
  const front = (x: number) => {
    const d = Math.abs(x - cx) / S, k = Math.max(0, Math.min(1, (d - 15.6) / 3));
    return H + S * 0.5 - k * k * (3 - 2 * k) * S * 3.2 + Math.sin(d * 1.3) * S * 0.25 * k;
  };
  const xs: number[] = [];
  for (let x = cx - half; x < cx + half; x += S * 0.4) xs.push(x);
  xs.push(cx + half);
  const hill = (f: (x: number) => number, fill: string, line: number, bottom = (_x: number) => H + 20) => {
    const pts: number[] = [];
    for (const x of xs) pts.push(x, f(x));
    for (let i = xs.length - 1; i >= 0; i--) pts.push(xs[i], bottom(xs[i]));
    g.poly(pts).fill(fill).stroke({ width: line, color: t.ink, join: 'round' });
  };
  const far = ridge(gy(60), 2.2, 4.6, 0.9, 5), midR = ridge(gy(54.5), 1.1, 3.0, 2.2, 4), near = ridge(gy(49), 0.8, 2.6, 4.1, 3);
  const meadow = mix(t.floor, t.bg, 0.3), rock = t.art.rock ?? [t.metal];
  // the rock under the land first (its face shows below the cliff edge), then the hills from far to near
  hill(far, mat(t, rock[1]).mid, v.lw * 2);
  hill(far, mix(mix(t.floor, t.bg, 0.55), t.shadeTint, 0.12), v.lw * 2, front);
  // a castle on each far hill, where there is room for one beside the machine (not on a phone)
  for (const dir of [-1, 1]) {
    const x = cx + dir * Math.min(21.2 * S, (15.2 * S + half) / 2);
    if (half - Math.abs(x - cx) > 4.6 * S && Math.abs(x - cx) > 16.6 * S) castle(g, v, t, x, Math.max(far(x - 4 * S), far(x), far(x + 4 * S)) + 1.2 * S, dir);
  }
  hill(midR, mix(mix(t.floor, t.bg, 0.42), t.shadeTint, 0.06), v.lw * 0.8, front);
  // a forest along the middle ridge: one sticker, so its contour runs round the whole clump
  const wood = new Prop(v, t), dark = mat(t, mix(t.art.foliage, t.bg, 0.25));
  for (let x = cx - half + 1.4 * S; x < cx + half - 1.2 * S; x += S * (1.1 + rnd() * 0.9)) {
    if (Math.abs(x - cx) < 15 * S) continue; // behind the cabinet
    const r = S * (0.8 + rnd() * 0.65), y = midR(x) + S * (0.3 + rnd() * 0.6);
    if (rnd() < 0.5) {
      const apex: Pt = [x, y - r * 2.6], bl: Pt = [x - r * 0.95, y + r * 0.3], br: Pt = [x + r * 0.95, y + r * 0.3];
      wood.face([apex, br, bl], dark.base);
      wood.face([apex, br, [x, y + r * 0.3]], dark.shade, { sil: false, line: 0 });
    } else lump(wood, x, y - r * 0.5, r, dark);
  }
  wood.draw(g);
  hill(near, meadow, v.lw * 0.8, front);
  // the cliff face: stacked rock blocks in the path's tones, cool shade on their lower right
  const blocks: { pts: Pt[]; tone: number }[] = [];
  for (const dir of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      let x = cx + dir * (16 + (row % 2) * 0.6) * S;
      while (Math.abs(x - cx) < half - 0.2 * S) {
        const w = S * (1.3 + rnd() * 1.4), x2 = x + dir * w, top = Math.max(front(x), front(x2)) + S * (0.12 + row * 1.05), h = S * (0.8 + rnd() * 0.3);
        if (top < H + S) {
          // a rough rock: chamfered corners, a peaked or tilted top, never two alike
          const a = Math.min(x, x2), b = Math.max(x, x2), j = () => (rnd() - 0.5) * S * 0.3;
          blocks.push({ pts: [[a + S * 0.1, top + S * 0.25 + j()], [a + (b - a) * (0.3 + rnd() * 0.4), top + j()], [b - S * 0.1, top + S * 0.2 + j()], [b - S * 0.02, top + h * 0.6], [b - S * 0.25, top + h], [a + S * 0.2, top + h], [a + S * 0.04, top + h * 0.55]], tone: Math.floor(rnd() * rock.length) });
        }
        x = x2;
      }
    }
  }
  rock.forEach((tone, i) => {
    const mine = blocks.filter((b) => b.tone === i);
    if (!mine.length) return;
    for (const b of mine) g.poly(flat(b.pts));
    g.fill(mat(t, tone).shade);
    for (const b of mine) g.poly(flat(shrink(b.pts, centre(b.pts), 0.82, -S * 0.08, -S * 0.08)));
    g.fill(tone);
  });
  for (const b of blocks) g.poly(flat(b.pts));
  if (blocks.length) g.stroke({ width: v.lw * 0.5, color: t.ink, join: 'round' });
  // the meadow's edge over the cliff, with grass tufts along it
  const lip: number[] = [];
  for (const x of xs) lip.push(x, front(x));
  g.poly(lip, false).stroke({ width: v.lw * 1.6, color: t.ink, join: 'round', cap: 'round' });
  tufts(g, v, xs.filter((x, i) => i % 3 === 0 && front(x) < H - S * 0.4 && Math.abs(x - cx) < half - S).map((x): Pt => [x, front(x) + S * 0.1]), mat(t, meadow).shade, rnd, 0.8);
  // flowers and grass tufts on the near meadow (only beside the machine: behind it nobody sees them)
  const spots: Pt[] = [];
  for (let i = 0; i < 64; i++) {
    const side = i % 2 ? 1 : -1, inner = Math.min(15.5 * S, half - 2 * S), x = cx + side * (inner + rnd() * Math.max(S, half - S - inner)), y0 = near(x) + S, y1 = front(x) - S * 0.4;
    if (y1 > y0) spots.push([x, y0 + rnd() * (y1 - y0)]);
  }
  tufts(g, v, spots.filter((_, i) => i % 3), mix(meadow, t.shadeTint, 0.3), rnd);
  for (const pair of [0, 1]) {
    const fl = spots.filter((_, i) => i % 3 === 0 && i % 2 === pair);
    for (const [x, y] of fl) g.circle(x, y, S * 0.16);
    if (fl.length) g.fill(t.art.twinkle[pair]).stroke({ width: v.lw * 0.3, color: t.ink });
  }
}

/**
 * A castle on the far hill: a crenellated curtain wall with a gate and banners, two round towers with pointed
 * roofs and pennants, and a square keep behind. dir = -1 is the left one, 1 the right one (mirrored).
 * Drawn front-on in screen space, scaled down when needed so the pennants stay under the top of the stage.
 */
function castle(g: Graphics, v: View, t: Theme, X: number, Y: number, dir: number) {
  const S = v.S, u = Math.max(S * 0.4, Math.min(S, (Y - S * 0.3) / 10.4)), stone = mat(t, t.art.stone ?? t.paper);
  const roof = mat(t, t.accent), lw = v.lw, p = new Prop(v, t);
  const rect = (x0: number, y0: number, w: number, h: number): Pt[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
  /** a front face standing on the hill, crenellated along its top, with a cel shade strip on its right */
  const block = (x0: number, top: number, w: number) => {
    const n = Math.max(2, Math.round(w / (u * 0.9))), cw = w / (n * 2 - 1), tops: Pt[] = [];
    for (let i = 0; i < n * 2 - 1; i++) {
      const up = i % 2 === 0, x = x0 + i * cw;
      tops.push([x, up ? top - u * 0.55 : top], [x + cw, up ? top - u * 0.55 : top]);
    }
    p.face([...tops, [x0 + w, Y], [x0, Y]], stone.base);
    p.face(rect(x0 + w * 0.84, top, w * 0.16, Y - top), stone.shade, { sil: false, line: 0 });
  };
  const tower = (x: number, w: number, h: number, flag: string | null) => {
    const top = Y - h;
    p.face(rect(x - w / 2, top, w, h), stone.base);
    p.face(rect(x + w * 0.18, top, w * 0.32, h), stone.shade, { sil: false, line: 0 });
    p.face(rect(x - w * 0.42, top, w * 0.14, h), stone.light, { sil: false, line: 0 });
    // the roof: a cone overhanging the wall, shaded on the right
    const eave = top + u * 0.35, apex: Pt = [x, top - u * 3.1];
    p.face([apex, [x + w * 0.68, eave], [x - w * 0.68, eave]], roof.base);
    p.face([apex, [x + w * 0.68, eave], [x + w * 0.08, eave]], roof.shade, { sil: false, line: 0 });
    p.face([[x - u * 0.28, top + u * 1.9], [x - u * 0.28, top + u * 1.35], [x, top + u * 1.05], [x + u * 0.28, top + u * 1.35], [x + u * 0.28, top + u * 1.9]], t.ink, { sil: false, line: 0 });
    if (flag) {
      p.op((gg) => gg.moveTo(apex[0], apex[1]).lineTo(apex[0], apex[1] - u * 1.6).stroke({ width: lw * 0.9, color: t.ink, cap: 'round' }));
      const fy = apex[1] - u * 1.6;
      p.face([[apex[0], fy], [apex[0] + dir * u * 1.6, fy + u * 0.2], [apex[0] + dir * u * 1.2, fy + u * 0.45], [apex[0] + dir * u * 1.6, fy + u * 0.75], [apex[0], fy + u * 0.7]], flag, { line: 0.4 });
    }
  };
  // the keep behind, the wall, then the towers in front of the wall's ends
  const kx = X + dir * u * 0.9;
  block(kx - u * 1.6, Y - u * 6.2, u * 3.2);
  p.face(rect(kx - u * 0.3, Y - u * 5.2, u * 0.6, u * 0.6), t.ink, { sil: false, line: 0 });
  block(X - u * 4, Y - u * 3.2, u * 8);
  const mortar: [Pt, Pt][] = [];
  for (let r = 0; r < 3; r++) {
    mortar.push([[X - u * (3.2 - r * 0.9), Y - u * (0.8 + r * 0.8)], [X - u * (2.4 - r * 0.9), Y - u * (0.8 + r * 0.8)]]);
    mortar.push([[X + u * (1.2 + r * 0.6), Y - u * (1.3 + r * 0.7)], [X + u * (2 + r * 0.6), Y - u * (1.3 + r * 0.7)]]);
  }
  p.op((gg) => {
    for (const [a, b] of mortar) gg.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
    gg.stroke({ width: lw * 0.35, color: stone.shade, cap: 'round' });
  });
  // the gate: an arch with a portcullis, and a banner either side
  const gw = u * 0.9, gt = Y - u * 2;
  p.face([[X - gw, Y], [X - gw, gt + gw * 0.6], [X - gw * 0.6, gt + gw * 0.15], [X, gt], [X + gw * 0.6, gt + gw * 0.15], [X + gw, gt + gw * 0.6], [X + gw, Y]], t.ink, { sil: false, line: 0 });
  p.op((gg) => {
    for (let i = -1; i <= 1; i++) gg.moveTo(X + i * gw * 0.5, gt + gw * 0.3).lineTo(X + i * gw * 0.5, Y);
    gg.moveTo(X - gw * 0.9, gt + gw * 1.1).lineTo(X + gw * 0.9, gt + gw * 1.1);
    gg.stroke({ width: lw * 0.6, color: stone.shade });
  });
  const banners = [t.role.spinner, t.accent];
  [X - u * 2.2, X + u * 2.2].forEach((bx, i) => {
    const bt = Y - u * 3.05, bw = u * 0.55, bh = u * 1.9;
    p.face([[bx - bw, bt], [bx + bw, bt], [bx + bw, bt + bh], [bx, bt + bh - u * 0.45], [bx - bw, bt + bh]], banners[i], { sil: false, line: 0.45 });
    p.face(star(bx, bt + bh * 0.42, u * 0.3, u * 0.14, 5, -Math.PI / 2), t.role.coin, { sil: false, line: 0 });
  });
  tower(X - u * 4.1, u * 2.1, u * 5.2, dir < 0 ? t.accent : null);
  tower(X + u * 4.1, u * 1.9, u * 4.4, dir > 0 ? t.accent : t.role.spinner);
  p.draw(g);
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

/**
 * Every decal's own picture, drawn on its colour field in the sticker style: paper and theme colours, ink lines. Kept
 * to bold, simple silhouettes, because on the apron a decal is only a couple of dozen pixels across.
 */
function decalIcon(g: Graphics, c: Container, t: Theme, icon: DecalIcon, R: number) {
  const s = R * 0.5, lw = R * 0.07, st = { width: lw, color: t.ink, join: 'round' as const, cap: 'round' as const };
  const thin = { ...st, width: lw * 0.7 };
  const P2 = (pts: number[]) => pts.map((q) => q * s);
  const ball = (x: number, y: number, r: number, fill: string) => {
    g.circle(x * s, y * s, r * s).fill(fill).stroke(st);
    g.ellipse((x - r * 0.35) * s, (y - r * 0.38) * s, r * 0.3 * s, r * 0.2 * s).fill(WHITE);
  };
  const text = (str: string, x: number, y: number, size: number, fill = t.ink, stroke?: string) => {
    const L = label(str, size * s, fill, stroke ? { stroke, strokeW: s * 0.14 } : {});
    L.position.set(x * s, y * s);
    c.addChild(L);
  };
  const coin = t.role.coin, paper = t.paper, hot = t.accent;
  switch (icon) {
    // ---- cash ----
    case 'moneybag':
      g.poly(P2([-0.35, -0.55, 0.35, -0.55, 0.15, -0.3, 0.75, 0.15, 0.7, 0.85, -0.7, 0.85, -0.75, 0.15, -0.15, -0.3])).fill(mix('#c9a46a', paper, 0.25)).stroke(st);
      g.poly(P2([-0.5, -0.95, 0.5, -0.95, 0.3, -0.55, -0.3, -0.55])).fill(mix('#c9a46a', paper, 0.25)).stroke(st);
      g.moveTo(-0.32 * s, -0.42 * s).lineTo(0.32 * s, -0.42 * s).stroke({ ...st, width: lw * 1.4, color: hot });
      text('$', 0, 0.3, 0.95, coin, t.ink);
      break;
    case 'shelf':
      g.roundRect(-1.05 * s, 0.35 * s, 2.1 * s, 0.25 * s, 0.06 * s).fill(t.rim).stroke(st);
      for (const [x, w, h, col] of [[-0.75, 0.42, 0.62, t.role.pop], [-0.25, 0.42, 0.9, t.role.sling], [0.25, 0.42, 0.5, t.role.lane]] as const) g.roundRect(x * s - (w / 2) * s, (0.35 - h) * s, w * s, h * s, 0.06 * s).fill(col).stroke(st);
      g.roundRect(0.52 * s, -0.28 * s, 0.46 * s, 0.63 * s, 0.06 * s).fill(paper).stroke({ ...st, width: lw * 0.8 });
      text('+', 0.75, 0.05, 0.7, t.ink);
      break;
    case 'sprout':
      for (let i = 0; i < 3; i++) { g.ellipse(0, (0.75 - i * 0.24) * s, 0.62 * s, 0.2 * s).fill(coin).stroke(st); }
      g.moveTo(0, 0.2 * s).quadraticCurveTo(0.05 * s, -0.3 * s, 0, -0.55 * s).stroke({ ...st, width: lw * 1.2, color: '#3f8f3a' });
      g.poly(P2([0, -0.35, -0.6, -0.75, -0.75, -0.3, -0.25, -0.15])).fill('#5fc25a').stroke(st);
      g.poly(P2([0, -0.55, 0.45, -1.0, 0.7, -0.6, 0.2, -0.35])).fill('#5fc25a').stroke(st);
      break;
    case 'scissors':
      for (const k of [-1, 1]) {
        g.moveTo(k * 0.15 * s, 0.2 * s).lineTo(-k * 0.55 * s, -0.95 * s).stroke({ ...st, width: lw * 3.2 });
        g.moveTo(k * 0.15 * s, 0.2 * s).lineTo(-k * 0.55 * s, -0.95 * s).stroke({ ...st, width: lw * 1.6, color: t.metal });
        g.circle(k * 0.42 * s, 0.6 * s, 0.3 * s).fill(hot).stroke(st);
        g.circle(k * 0.42 * s, 0.6 * s, 0.13 * s).fill(t.ink);
      }
      g.circle(0, -0.08 * s, 0.07 * s).fill(t.ink);
      break;
    case 'glove':
      g.roundRect(-0.6 * s, -0.25 * s, 1.1 * s, 0.95 * s, 0.35 * s).fill(WHITE).stroke(st);
      for (let i = 0; i < 3; i++) g.roundRect((-0.55 + i * 0.36) * s, -0.95 * s, 0.32 * s, 0.85 * s, 0.16 * s).fill(WHITE).stroke(st);
      g.roundRect(0.3 * s, -0.05 * s, 0.6 * s, 0.3 * s, 0.15 * s).fill(WHITE).stroke(st);
      g.roundRect(-0.5 * s, 0.68 * s, 0.9 * s, 0.25 * s, 0.08 * s).fill(hot).stroke(st);
      for (let i = 0; i < 3; i++) g.moveTo((-0.35 + i * 0.25) * s, 0.0).lineTo((-0.35 + i * 0.25) * s, 0.35 * s).stroke(thin);
      break;
    case 'pig': {
      const pink = t.role.piggy;
      for (const k of [-1, 1]) g.poly(P2([k * 0.35, -0.6, k * 0.85, -0.95, k * 0.8, -0.3])).fill(pink).stroke(st);
      g.circle(0, 0, 0.85 * s).fill(pink).stroke(st);
      g.ellipse(0, 0.25 * s, 0.42 * s, 0.3 * s).fill(mix(pink, WHITE, 0.35)).stroke(st);
      for (const k of [-1, 1]) { g.ellipse(k * 0.14 * s, 0.25 * s, 0.07 * s, 0.11 * s).fill(t.ink); g.circle(k * 0.36 * s, -0.28 * s, 0.1 * s).fill(t.ink); }
      break;
    }
    case 'die':
      g.roundRect(-0.8 * s, -0.8 * s, 1.6 * s, 1.6 * s, 0.32 * s).fill(WHITE).stroke(st);
      for (const [a, b] of [[-0.42, -0.42], [0.42, -0.42], [0, 0], [-0.42, 0.42], [0.42, 0.42]]) g.circle(a * s, b * s, 0.15 * s).fill(t.ink);
      g.arc(0, 0, 1.12 * s, -1.25, -0.25).stroke({ ...st, width: lw * 1.1 });
      g.poly(P2([1.12 * Math.cos(-0.25) + 0.22, 1.12 * Math.sin(-0.25) - 0.12, 1.12 * Math.cos(-0.25) - 0.22, 1.12 * Math.sin(-0.25) - 0.1, 1.12 * Math.cos(-0.25) + 0.05, 1.12 * Math.sin(-0.25) + 0.25])).fill(t.ink);
      break;
    case 'padlock':
      g.moveTo(-0.45 * s, -0.1 * s).lineTo(-0.45 * s, -0.45 * s).arc(0, -0.45 * s, 0.45 * s, Math.PI, 0).lineTo(0.45 * s, -0.1 * s).stroke({ ...st, width: lw * 3.4 });
      g.moveTo(-0.45 * s, -0.1 * s).lineTo(-0.45 * s, -0.45 * s).arc(0, -0.45 * s, 0.45 * s, Math.PI, 0).lineTo(0.45 * s, -0.1 * s).stroke({ ...st, width: lw * 1.8, color: t.metal });
      g.roundRect(-0.75 * s, -0.15 * s, 1.5 * s, 1.05 * s, 0.18 * s).fill(coin).stroke(st);
      g.circle(0, 0.25 * s, 0.14 * s).fill(t.ink);
      g.poly(P2([-0.07, 0.3, 0.07, 0.3, 0.1, 0.62, -0.1, 0.62])).fill(t.ink);
      break;
    case 'toolbox':
      g.moveTo(-0.35 * s, -0.35 * s).lineTo(-0.35 * s, -0.7 * s).lineTo(0.35 * s, -0.7 * s).lineTo(0.35 * s, -0.35 * s).stroke({ ...st, width: lw * 2.6 });
      g.moveTo(-0.35 * s, -0.35 * s).lineTo(-0.35 * s, -0.7 * s).lineTo(0.35 * s, -0.7 * s).lineTo(0.35 * s, -0.35 * s).stroke({ ...st, width: lw * 1.2, color: t.metal });
      g.roundRect(-1.0 * s, -0.4 * s, 2.0 * s, 1.2 * s, 0.14 * s).fill(t.role.sling === paper ? hot : t.role.sling).stroke(st);
      g.moveTo(-1.0 * s, 0.05 * s).lineTo(1.0 * s, 0.05 * s).stroke(st);
      g.roundRect(-0.2 * s, -0.08 * s, 0.4 * s, 0.26 * s, 0.05 * s).fill(t.metal).stroke(thin);
      text('+2', 0, 0.5, 0.55, paper, t.ink);
      break;
    case 'tag':
      g.poly(P2([-0.95, -0.25, -0.45, -0.85, 0.95, -0.85, 0.95, 0.85, -0.45, 0.85, -0.95, 0.25])).fill(paper).stroke(st);
      g.circle(-0.5 * s, 0, 0.13 * s).fill(t.ink);
      text('½', 0.3, 0.02, 1.1, hot);
      break;
    case 'shades':
      g.moveTo(-1.0 * s, -0.25 * s).lineTo(1.0 * s, -0.25 * s).stroke({ ...st, width: lw * 1.4 });
      for (const k of [-1, 1]) { g.roundRect((k < 0 ? -0.98 : 0.1) * s, -0.35 * s, 0.88 * s, 0.7 * s, 0.3 * s).fill(t.ink).stroke(st); g.moveTo((k < 0 ? -0.75 : 0.33) * s, -0.15 * s).lineTo((k < 0 ? -0.5 : 0.58) * s, -0.15 * s).stroke({ ...thin, color: WHITE }); }
      g.star(0.75 * s, -0.75 * s, 4, 0.3 * s, 0.1 * s).fill(WHITE).stroke(thin);
      g.moveTo(-0.3 * s, 0.6 * s).quadraticCurveTo(0.1 * s, 0.85 * s, 0.45 * s, 0.5 * s).stroke({ ...st, width: lw * 1.2 });
      break;
    case 'crown':
      g.poly(P2([-0.9, 0.6, -0.95, -0.55, -0.45, -0.05, 0, -0.8, 0.45, -0.05, 0.95, -0.55, 0.9, 0.6])).fill(coin).stroke(st);
      g.rect(-0.9 * s, 0.35 * s, 1.8 * s, 0.25 * s).fill(mix(coin, t.ink, 0.15)).stroke(st);
      for (const [a, b, col] of [[-0.95, -0.6, hot], [0, -0.85, t.role.pop], [0.95, -0.6, hot]] as const) g.circle(a * s, b * s, 0.13 * s).fill(col).stroke(thin);
      break;
    case 'magnifier':
      g.moveTo(0.3 * s, 0.3 * s).lineTo(0.9 * s, 0.9 * s).stroke({ ...st, width: lw * 4 });
      g.moveTo(0.3 * s, 0.3 * s).lineTo(0.9 * s, 0.9 * s).stroke({ ...st, width: lw * 2.2, color: t.rim });
      g.circle(-0.18 * s, -0.18 * s, 0.68 * s).fill(mix(paper, '#9fd6ff', 0.5)).stroke({ ...st, width: lw * 1.6 });
      g.star(-0.18 * s, -0.18 * s, 5, 0.35 * s, 0.15 * s, -Math.PI / 2).fill(coin).stroke(thin);
      break;
    case 'scroll':
      g.roundRect(-0.85 * s, -0.75 * s, 1.7 * s, 1.35 * s, 0.1 * s).fill(paper).stroke(st);
      for (let i = 0; i < 3; i++) g.moveTo(-0.6 * s, (-0.45 + i * 0.25) * s).lineTo(0.55 * s, (-0.45 + i * 0.25) * s).stroke(thin);
      g.poly(P2([0.2, 0.45, 0.1, 1.0, 0.33, 0.85, 0.5, 1.0, 0.45, 0.45])).fill(hot).stroke(thin);
      g.circle(0.33 * s, 0.4 * s, 0.25 * s).fill(t.role.redseal).stroke(st);
      break;
    // ---- score ----
    case 'flag':
      g.moveTo(-0.7 * s, 1.0 * s).lineTo(-0.7 * s, -0.95 * s).stroke({ ...st, width: lw * 1.6 });
      g.rect(-0.7 * s, -0.95 * s, 1.55 * s, 1.0 * s).fill(WHITE).stroke(st);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.rect((-0.7 + i * 0.3875) * s, (-0.95 + j * 0.333) * s, 0.3875 * s, 0.333 * s).fill(t.ink);
      g.rect(-0.7 * s, -0.95 * s, 1.55 * s, 1.0 * s).stroke(st);
      break;
    case 'seven':
      g.roundRect(-0.75 * s, -0.95 * s, 1.5 * s, 1.9 * s, 0.25 * s).fill(paper).stroke(st);
      text('7', 0, 0.02, 1.5, hot, t.ink);
      break;
    case 'gauge':
      g.moveTo(-0.95 * s, 0.35 * s).arc(0, 0.35 * s, 0.95 * s, Math.PI, 0).closePath().fill(paper).stroke(st);
      g.moveTo(0.95 * s * Math.cos(-0.75), 0.35 * s + 0.95 * s * Math.sin(-0.75)).arc(0, 0.35 * s, 0.95 * s, -0.75, 0).lineTo(0, 0.35 * s).closePath().fill(hot).stroke(thin);
      for (let i = 0; i <= 4; i++) { const a = Math.PI + (i / 4) * Math.PI; g.moveTo(Math.cos(a) * 0.7 * s, 0.35 * s + Math.sin(a) * 0.7 * s).lineTo(Math.cos(a) * 0.88 * s, 0.35 * s + Math.sin(a) * 0.88 * s); }
      g.stroke(thin);
      g.moveTo(0, 0.35 * s).lineTo(0.62 * s, -0.25 * s).stroke({ ...st, width: lw * 1.6 });
      g.circle(0, 0.35 * s, 0.14 * s).fill(t.ink);
      break;
    case 'chevrons':
      for (const dy of [0.45, -0.25]) { g.poly(P2([-0.8, dy + 0.3, 0, dy - 0.5, 0.8, dy + 0.3, 0.8, dy + 0.6, 0, dy - 0.2, -0.8, dy + 0.6])).fill(paper).stroke(st); }
      break;
    case 'bulb':
      for (let i = 0; i < 7; i++) { const a = -Math.PI + 0.25 + (i / 6) * (Math.PI - 0.5); g.moveTo(Math.cos(a) * 0.82 * s, -0.2 * s + Math.sin(a) * 0.82 * s).lineTo(Math.cos(a) * 1.05 * s, -0.2 * s + Math.sin(a) * 1.05 * s); }
      g.stroke({ ...st, width: lw * 0.9 });
      g.circle(0, -0.2 * s, 0.6 * s).fill('#ffe45c').stroke(st);
      g.roundRect(-0.3 * s, 0.32 * s, 0.6 * s, 0.5 * s, 0.08 * s).fill(t.metal).stroke(st);
      g.moveTo(-0.3 * s, 0.57 * s).lineTo(0.3 * s, 0.57 * s).stroke(thin);
      g.ellipse(-0.22 * s, -0.4 * s, 0.14 * s, 0.1 * s).fill(WHITE);
      break;
    case 'targets':
      g.roundRect(-1.05 * s, 0.4 * s, 2.1 * s, 0.3 * s, 0.08 * s).fill(t.metal).stroke(st);
      for (const k of [-0.68, 0, 0.68]) { g.roundRect((k - 0.27) * s, -0.6 * s, 0.54 * s, 1.0 * s, 0.08 * s).fill(t.role.bank).stroke(st); g.moveTo((k - 0.15) * s, -0.25 * s).lineTo((k + 0.15) * s, -0.25 * s).stroke({ ...thin, color: paper }); }
      g.circle(0.82 * s, -0.75 * s, 0.26 * s).fill(coin).stroke(thin);
      break;
    case 'laurel':
      for (const k of [-1, 1]) {
        g.moveTo(0, 0.85 * s).quadraticCurveTo(k * 1.0 * s, 0.5 * s, k * 0.6 * s, -0.8 * s).stroke({ ...st, width: lw * 1.2, color: '#3f8f3a' });
        for (let i = 0; i < 4; i++) { const u = 0.2 + i * 0.22, qx = k * (0.85 - 0.25 * u) * s * (1 - (u - 0.5) ** 2), qy = (0.75 - u * 1.5) * s; g.ellipse(qx + k * 0.15 * s, qy, 0.17 * s, 0.1 * s).fill('#5fc25a').stroke(thin); }
      }
      g.star(0, -0.05 * s, 5, 0.38 * s, 0.16 * s, -Math.PI / 2).fill(coin).stroke(st);
      break;
    case 'cannon':
      g.poly(P2([-0.8, -0.55, 0.55, 0.05, 0.4, 0.45, -0.95, -0.15])).fill(mix(t.metal, '#9fd6ff', 0.5)).stroke(st);
      g.moveTo(-0.3 * s, -0.25 * s).lineTo(-0.1 * s, -0.05 * s).lineTo(-0.25 * s, 0.05 * s).stroke({ ...thin, color: WHITE });
      g.circle(0.05 * s, 0.5 * s, 0.4 * s).fill(t.rim).stroke(st);
      g.circle(0.05 * s, 0.5 * s, 0.1 * s).fill(t.ink);
      g.star(-0.95 * s, -0.55 * s, 6, 0.35 * s, 0.15 * s).fill(coin).stroke(thin);
      break;
    case 'flame':
      g.moveTo(0, -1.0 * s).bezierCurveTo(0.35 * s, -0.5 * s, 0.85 * s, -0.25 * s, 0.7 * s, 0.35 * s).bezierCurveTo(0.6 * s, 0.85 * s, -0.6 * s, 0.85 * s, -0.7 * s, 0.35 * s).bezierCurveTo(-0.8 * s, -0.1 * s, -0.4 * s, -0.25 * s, -0.35 * s, -0.55 * s).bezierCurveTo(-0.15 * s, -0.35 * s, -0.05 * s, -0.6 * s, 0, -1.0 * s).closePath().fill('#ff9f1c').stroke(st);
      g.moveTo(0, -0.25 * s).bezierCurveTo(0.2 * s, 0.0, 0.45 * s, 0.2 * s, 0.35 * s, 0.45 * s).bezierCurveTo(0.25 * s, 0.7 * s, -0.3 * s, 0.7 * s, -0.35 * s, 0.4 * s).bezierCurveTo(-0.4 * s, 0.15 * s, -0.1 * s, 0.05 * s, 0, -0.25 * s).closePath().fill('#ffe45c').stroke(thin);
      break;
    case 'swirl': {
      const pts: number[] = [];
      for (let i = 0; i <= 40; i++) { const a = i * 0.32, rr = 0.06 + i * 0.022; pts.push(Math.cos(a) * rr * s, Math.sin(a) * rr * s); }
      g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ ...st, width: lw * 3 });
      g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ ...st, width: lw * 1.4, color: paper });
      break;
    }
    case 'balls':
      ball(-0.5, 0.35, 0.42, WHITE); ball(0.5, 0.35, 0.42, WHITE); ball(0, -0.45, 0.42, WHITE);
      break;
    case 'mug':
      g.roundRect(0.35 * s, -0.35 * s, 0.6 * s, 0.75 * s, 0.3 * s).stroke({ ...st, width: lw * 3 });
      g.roundRect(0.35 * s, -0.35 * s, 0.6 * s, 0.75 * s, 0.3 * s).stroke({ ...st, width: lw * 1.2, color: mix(coin, WHITE, 0.4) });
      g.roundRect(-0.75 * s, -0.55 * s, 1.25 * s, 1.45 * s, 0.15 * s).fill(coin).stroke(st);
      for (const k of [-0.35, 0.1]) g.moveTo(k * s, -0.3 * s).lineTo(k * s, 0.65 * s).stroke({ ...thin, color: mix(coin, WHITE, 0.5) });
      g.circle(-0.55 * s, -0.65 * s, 0.28 * s).fill(WHITE).stroke(st); g.circle(-0.1 * s, -0.75 * s, 0.3 * s).fill(WHITE).stroke(st); g.circle(0.32 * s, -0.62 * s, 0.24 * s).fill(WHITE).stroke(st);
      g.rect(-0.7 * s, -0.66 * s, 1.15 * s, 0.2 * s).fill(WHITE);
      break;
    case 'purse':
      for (const k of [-1, 1]) g.circle(k * 0.18 * s, -0.62 * s, 0.17 * s).fill(t.metal).stroke(st);
      g.moveTo(-0.85 * s, -0.35 * s).lineTo(0.85 * s, -0.35 * s).quadraticCurveTo(1.0 * s, 0.85 * s, 0, 0.85 * s).quadraticCurveTo(-1.0 * s, 0.85 * s, -0.85 * s, -0.35 * s).closePath().fill(hot).stroke(st);
      g.roundRect(-0.9 * s, -0.48 * s, 1.8 * s, 0.22 * s, 0.1 * s).fill(t.metal).stroke(st);
      text('$', 0, 0.28, 0.75, coin, t.ink);
      break;
    case 'bigboi': {
      const bb = t.role.mega === paper ? hot : t.role.mega;
      g.moveTo(-1.0 * s, 0.6 * s).lineTo(-0.95 * s, 0.05 * s).quadraticCurveTo(-0.9 * s, -1.0 * s, 0, -1.0 * s).quadraticCurveTo(0.9 * s, -1.0 * s, 0.95 * s, 0.05 * s).lineTo(1.0 * s, 0.6 * s).closePath().fill(bb).stroke(st);
      g.roundRect(-1.05 * s, 0.5 * s, 2.1 * s, 0.35 * s, 0.12 * s).fill(t.rim).stroke(st);
      for (const k of [-1, 1]) { g.ellipse(k * 0.32 * s, -0.2 * s, 0.18 * s, 0.22 * s).fill(WHITE).stroke(thin); g.circle(k * 0.32 * s, -0.15 * s, 0.09 * s).fill(t.ink); g.ellipse(k * 0.6 * s, 0.15 * s, 0.15 * s, 0.08 * s).fill(hot); }
      g.moveTo(-0.2 * s, 0.15 * s).quadraticCurveTo(0, 0.38 * s, 0.2 * s, 0.15 * s).stroke(st);
      g.ellipse(-0.45 * s, -0.7 * s, 0.18 * s, 0.1 * s).fill({ color: WHITE, alpha: 0.7 });
      break;
    }
    case 'trend':
      g.moveTo(-0.95 * s, 0.75 * s).lineTo(-0.35 * s, 0.15 * s).lineTo(0.0, 0.4 * s).lineTo(0.75 * s, -0.55 * s).stroke({ ...st, width: lw * 3.4 });
      g.moveTo(-0.95 * s, 0.75 * s).lineTo(-0.35 * s, 0.15 * s).lineTo(0.0, 0.4 * s).lineTo(0.75 * s, -0.55 * s).stroke({ ...st, width: lw * 1.6, color: paper });
      g.poly(P2([1.0, -0.9, 0.95, -0.2, 0.35, -0.75])).fill(paper).stroke(st);
      break;
    case 'sunset':
      for (let i = 0; i < 7; i++) { const a = -Math.PI + 0.2 + (i / 6) * (Math.PI - 0.4); g.moveTo(Math.cos(a) * 0.72 * s, 0.25 * s + Math.sin(a) * 0.72 * s).lineTo(Math.cos(a) * 1.0 * s, 0.25 * s + Math.sin(a) * 1.0 * s); }
      g.stroke({ ...st, width: lw * 1.1 });
      g.moveTo(-0.58 * s, 0.25 * s).arc(0, 0.25 * s, 0.58 * s, Math.PI, 0).closePath().fill(coin).stroke(st);
      g.roundRect(-1.0 * s, 0.25 * s, 2.0 * s, 0.18 * s, 0.09 * s).fill(t.ink);
      for (const [w, y] of [[1.3, 0.62], [0.8, 0.86]]) g.moveTo((-w / 2) * s, y * s).lineTo((w / 2) * s, y * s).stroke({ ...st, width: lw * 1.2, color: paper });
      break;
    // ---- ball ----
    case 'bounce':
      g.moveTo(-1.0 * s, 0.85 * s).quadraticCurveTo(-0.75 * s, -0.2 * s, -0.45 * s, 0.85 * s).quadraticCurveTo(-0.2 * s, 0.1 * s, 0.05 * s, 0.85 * s).stroke({ ...thin, width: lw * 1.1 });
      g.moveTo(-1.0 * s, 0.9 * s).lineTo(0.55 * s, 0.9 * s).stroke(st);
      ball(0.45, -0.25, 0.55, WHITE);
      g.moveTo(0.0, -0.05 * s).quadraticCurveTo(0.45 * s, 0.1 * s, 0.95 * s, -0.4 * s).stroke({ ...st, width: lw * 1.2, color: hot });
      break;
    case 'anvil':
      g.poly(P2([-1.0, -0.55, 0.85, -0.55, 0.95, -0.2, 0.45, -0.05, 0.3, 0.35, 0.6, 0.65, 0.6, 0.85, -0.6, 0.85, -0.6, 0.65, -0.3, 0.35, -0.35, -0.1, -0.7, -0.2])).fill(mix(t.ink, t.metal, 0.35)).stroke(st);
      g.moveTo(-0.85 * s, -0.42 * s).lineTo(0.75 * s, -0.42 * s).stroke({ ...thin, color: mix(t.metal, WHITE, 0.4) });
      text('1T', 0.12, 0.62, 0.42, paper);
      break;
    case 'marble':
      g.circle(0, 0, 0.85 * s).fill(mix('#9fd6ff', WHITE, 0.45)).stroke(st);
      g.moveTo(-0.55 * s, 0.4 * s).quadraticCurveTo(0, -0.1 * s, 0.6 * s, 0.35 * s).stroke({ ...st, width: lw * 1.6, color: '#62b8ff' });
      g.ellipse(-0.35 * s, -0.4 * s, 0.25 * s, 0.15 * s).fill(WHITE);
      g.circle(0.4 * s, -0.5 * s, 0.07 * s).fill(WHITE);
      break;
    case 'goldball':
      ball(0, 0.05, 0.8, coin);
      g.star(0.65 * s, -0.7 * s, 4, 0.35 * s, 0.11 * s).fill(WHITE).stroke(thin);
      text('$', 0.05, 0.12, 0.8, mix(coin, t.ink, 0.35));
      break;
    case 'twins':
      for (const k of [-1, 1]) {
        g.circle(k * 0.48 * s, 0.1 * s, 0.55 * s).fill(WHITE).stroke(st);
        for (const e of [-1, 1]) g.circle((k * 0.48 + e * 0.17) * s, 0.0, 0.07 * s).fill(t.ink);
        g.moveTo((k * 0.48 - 0.15) * s, 0.25 * s).quadraticCurveTo(k * 0.48 * s, 0.42 * s, (k * 0.48 + 0.15) * s, 0.25 * s).stroke(thin);
      }
      g.star(0, -0.75 * s, 5, 0.25 * s, 0.1 * s, -Math.PI / 2).fill(hot).stroke(thin);
      break;
    case 'plusball':
      ball(-0.2, 0.15, 0.7, WHITE);
      g.circle(0.6 * s, -0.55 * s, 0.38 * s).fill(t.role.saver).stroke(st);
      g.moveTo(0.4 * s, -0.55 * s).lineTo(0.8 * s, -0.55 * s).moveTo(0.6 * s, -0.75 * s).lineTo(0.6 * s, -0.35 * s).stroke({ ...st, width: lw * 1.3 });
      break;
    case 'net':
      g.moveTo(-1.0 * s, -0.3 * s).quadraticCurveTo(0, 1.2 * s, 1.0 * s, -0.3 * s).closePath().fill(mix(paper, t.ink, 0.06)).stroke(st);
      for (let i = 1; i < 5; i++) { const u = -1 + i * 0.4; g.moveTo(u * s, -0.3 * s).lineTo(u * 0.55 * s, (0.15 + (1 - Math.abs(u)) * 0.45) * s); }
      for (const y of [0.05, 0.35]) g.moveTo(-0.85 * s, y * s).quadraticCurveTo(0, (y + 0.3) * s, 0.85 * s, y * s);
      g.stroke(thin);
      for (const k of [-1, 1]) g.circle(k * 1.0 * s, -0.3 * s, 0.1 * s).fill(t.ink);
      ball(0.0, -0.55, 0.32, WHITE);
      break;
    case 'fuse':
      g.moveTo(-0.85 * s, 0.75 * s).bezierCurveTo(-0.2 * s, 1.0 * s, 0.6 * s, 0.6 * s, 0.1 * s, 0.15 * s).bezierCurveTo(-0.35 * s, -0.25 * s, 0.1 * s, -0.75 * s, 0.6 * s, -0.55 * s).stroke({ ...st, width: lw * 2.6 });
      g.moveTo(-0.85 * s, 0.75 * s).bezierCurveTo(-0.2 * s, 1.0 * s, 0.6 * s, 0.6 * s, 0.1 * s, 0.15 * s).bezierCurveTo(-0.35 * s, -0.25 * s, 0.1 * s, -0.75 * s, 0.6 * s, -0.55 * s).stroke({ ...st, width: lw * 1.1, color: paper });
      g.star(0.65 * s, -0.6 * s, 7, 0.42 * s, 0.18 * s).fill('#ffd23f').stroke(thin);
      g.circle(0.65 * s, -0.6 * s, 0.1 * s).fill(WHITE);
      break;
    case 'boot':
      g.poly(P2([-0.45, -0.9, 0.2, -0.9, 0.25, 0.1, 0.95, 0.3, 1.0, 0.75, -0.55, 0.75])).fill(t.ink).stroke(st);
      g.poly(P2([-0.42, -0.85, 0.17, -0.85, 0.18, -0.55, -0.43, -0.55])).fill(paper);
      for (const k of [-0.3, 0.1, 0.5, 0.85]) g.rect(k * s, 0.75 * s, 0.12 * s, 0.15 * s).fill(t.ink);
      g.moveTo(-0.1 * s, -0.2 * s).lineTo(0.1 * s, -0.1 * s).moveTo(-0.1 * s, 0.05 * s).lineTo(0.1 * s, 0.15 * s).stroke({ ...thin, color: paper });
      break;
    case 'printer':
      g.roundRect(-0.85 * s, -0.75 * s, 1.5 * s, 1.25 * s, 0.2 * s).fill(t.role.printer).stroke(st);
      for (const k of [-1, 1]) { g.circle((-0.1 + k * 0.28) * s, -0.35 * s, 0.13 * s).fill(WHITE).stroke(thin); g.circle((-0.1 + k * 0.28) * s, -0.33 * s, 0.06 * s).fill(t.ink); }
      g.ellipse(-0.1 * s, 0.15 * s, 0.38 * s, 0.18 * s).fill(t.ink);
      ball(0.6, 0.55, 0.32, WHITE);
      ball(0.0, 0.75, 0.25, WHITE);
      break;
    // ---- build ----
    case 'car':
      g.roundRect(-1.0 * s, -0.15 * s, 2.0 * s, 0.75 * s, 0.35 * s).fill(hot).stroke(st);
      g.roundRect(-0.5 * s, -0.75 * s, 0.9 * s, 0.7 * s, 0.25 * s).fill(mix(hot, WHITE, 0.45)).stroke(st);
      g.circle(-0.05 * s, -0.45 * s, 0.18 * s).fill(paper).stroke(thin);
      g.roundRect(-1.08 * s, 0.38 * s, 2.16 * s, 0.32 * s, 0.16 * s).fill(t.ink);
      g.moveTo(0.55 * s, -0.35 * s).lineTo(0.75 * s, -0.95 * s).stroke({ ...st, width: lw * 0.9 });
      g.star(0.78 * s, -0.95 * s, 5, 0.16 * s, 0.07 * s).fill(coin).stroke({ ...thin, width: lw * 0.5 });
      break;
    case 'bullseye':
      for (const [rr, col] of [[0.9, paper], [0.65, hot], [0.4, paper], [0.17, hot]] as const) g.circle(0, 0, rr * s).fill(col).stroke(thin);
      g.moveTo(0.95 * s, -0.95 * s).lineTo(0.05 * s, -0.05 * s).stroke({ ...st, width: lw * 1.4 });
      g.poly(P2([0.95, -0.95, 0.72, -1.0, 1.0, -0.72])).fill(t.ink);
      break;
    case 'beams':
      for (const k of [-1, 1]) {
        g.poly(P2([k * 0.9, 0.7, k * 0.6, 0.6, -k * 0.55, -0.95, -k * 0.05, -0.95])).fill(WHITE).stroke(st);
        g.roundRect((k * 0.75 - 0.25) * s, 0.5 * s, 0.5 * s, 0.38 * s, 0.1 * s).fill(t.ink);
      }
      g.star(0, -0.55 * s, 4, 0.3 * s, 0.1 * s).fill(WHITE).stroke(thin);
      break;
    case 'drop':
      g.moveTo(0, -1.0 * s).bezierCurveTo(0.35 * s, -0.4 * s, 0.75 * s, 0.0, 0.75 * s, 0.35 * s).arc(0, 0.35 * s, 0.75 * s, 0, Math.PI).bezierCurveTo(-0.75 * s, 0.0, -0.35 * s, -0.4 * s, 0, -1.0 * s).closePath().fill('#62b8ff').stroke(st);
      text('4', 0.0, 0.38, 0.85, paper, t.ink);
      g.ellipse(-0.4 * s, -0.05 * s, 0.1 * s, 0.18 * s).fill(WHITE);
      break;
    case 'crowd':
      for (const [x, y, col] of [[-0.62, -0.1, t.role.pop], [0.62, -0.1, t.role.lane], [0, 0.05, coin]] as const) {
        g.roundRect((x - 0.38) * s, (y + 0.42) * s, 0.76 * s, 0.6 * s, 0.3 * s).fill(col).stroke(st);
        g.circle(x * s, y * s, 0.32 * s).fill(paper).stroke(st);
        g.moveTo((x - 0.12) * s, (y + 0.08) * s).quadraticCurveTo(x * s, (y + 0.2) * s, (x + 0.12) * s, (y + 0.08) * s).stroke(thin);
      }
      for (const k of [-1, 1]) g.moveTo(k * 0.95 * s, -0.55 * s).lineTo(k * 1.05 * s, -0.95 * s).stroke({ ...st, width: lw * 1.2 });
      break;
    case 'empty':
      g.roundRect(-0.75 * s, -0.75 * s, 1.5 * s, 1.5 * s, 0.2 * s).fill(mix(paper, t.ink, 0.08));
      for (let i = 0; i < 12; i++) {
        const side = Math.floor(i / 3), k = (i % 3) / 3 + 0.04, L = 0.2;
        const [ax, ay] = [[-0.75 + 1.5 * k, -0.75], [0.75, -0.75 + 1.5 * k], [0.75 - 1.5 * k, 0.75], [-0.75, 0.75 - 1.5 * k]][side];
        const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][side];
        g.moveTo(ax * s, ay * s).lineTo((ax + dx * L) * s, (ay + dy * L) * s);
      }
      g.stroke({ ...st, width: lw * 1.1 });
      break;
  }
}

/** A decal without a drawn icon prints its glyph on a paper disc. */
function glyphIcon(g: Graphics, c: Container, t: Theme, glyph: string, R: number) {
  const s = R * 0.5;
  g.circle(0, 0, s * 1.05).fill(t.paper).stroke({ width: R * 0.07, color: t.ink });
  const size = glyph.length <= 1 ? s * 1.35 : glyph.length === 2 ? s * 1.0 : glyph.length === 3 ? s * 0.78 : s * 0.62;
  const L = label(glyph, size, t.ink);
  c.addChild(L);
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
  if (d.look.icon) decalIcon(g, inner, t, d.look.icon, R);
  else glyphIcon(g, inner, t, d.look.glyph ?? '?', R);
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

/** The look of a decal. */
export const decalLook = (id: string): DecalLook | undefined => (DECALS as Record<string, { look: DecalLook } | undefined>)[id]?.look;

export { ribbon };
