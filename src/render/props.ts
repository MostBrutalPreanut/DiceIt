// One drawing per part type (ported from tools/concept/props.ts). The silhouette is fixed (it is how a
// player recognises the part); the theme only supplies colours and one motif, so every machine gets
// every part for free. Things that change every frame (glows, value tags, smoke) are drawn by the
// renderer; what is drawn here is baked once per part x state x theme into a texture.
import { Container, Graphics } from 'pixi.js';
import { MAX_LEVEL, PARTS, type PartId } from '../data/parts';
import { BALL_R, FLIPPER_LENGTH } from '../sim/constants';
import { box, flat, hull, label, P, Prop, ring, shadow, shadowPoly, star, type Pt, type View } from './draw';
import { mat, mix, mixHue, WHITE, type Theme } from './theme';

export interface PartState {
  /** Lane Rollover: its letter of the theme's word, and whether it is lit. */
  letter?: string;
  lit?: boolean;
  /** Level Light: the part type it levels up (its dome wears that colour). */
  target?: PartId;
  /** Drop-target bank: which of the three targets are down. */
  down?: boolean[];
  /** Just hit: bumpers flash their cap, Big Boi says oof. */
  hit?: boolean;
  /** Spinner: which of 8 frames of the plate's turn. */
  spin?: number;
  /** Vari-target: how many of its four segments are lit. */
  seg?: number;
  /** Kickback armed, Ball Saver ready. */
  armed?: boolean;
  /** Ball Printer holding a ball. */
  busy?: boolean;
  /** Big Boi: bake only the whites of his eyes; the renderer draws pupils that follow the ball. */
  follow?: boolean;
  /** Big Boi's mood: happy, oof (just hit), sad (a bad shot), shocked (a nice combo), cool (a seriously high Mult). */
  mood?: Mood;
  /** The part type's level (0 to 5): its colour steps towards gold with each level, like Space Cadet's bumpers. */
  level?: number;
}
export type Mood = 'happy' | 'oof' | 'sad' | 'shocked' | 'cool';

export const stateKey = (st: PartState) =>
  [st.letter ?? '', st.lit ? 1 : 0, st.target ?? '', st.down ? st.down.map((d) => (d ? 1 : 0)).join('') : '', st.hit ? 1 : 0, st.spin ?? '', st.seg ?? '', st.armed === false ? 0 : 1, st.busy ? 1 : 0, st.follow ? 1 : 0, st.mood ?? '', st.level ?? 0].join('.');

const ringS = (cx: number, cy: number, r: number, n = 20, ry = r): Pt[] => ring(cx, cy, r, n, ry);

/** Draws one part at sim position (x, y). The returned container holds a Graphics and any lettering. */
export function drawPart(v: View, t: Theme, id: PartId, x: number, y: number, angle = 0, st: PartState = {}): Container {
  const def = PARTS[id], role = mat(t, levelColour(t, id, def.recipe.perLevel ? st.level ?? 0 : 0)), metal = mat(t, t.metal);
  const out = new Container();
  const under = new Graphics(), body = new Graphics(), over = new Graphics();
  out.addChild(under, body);
  const p = new Prop(v, t);
  const r = def.shape.type === 'circle' ? def.shape.r : 0;
  const S = v.S;

  switch (id) {
    case 'pop': case 'coin': {
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const skirt = mat(t, id === 'coin' ? mix(t.role.coin, t.shadeTint, 0.25) : t.paper);
      const cap = st.hit ? mat(t, mix(t.role[id], WHITE, 0.4)) : role;
      p.cyl(x, y, r, 0, 0.16, skirt);
      p.cyl(x, y, r * 0.62, 0.16, 0.5, metal);
      const top = p.cyl(x, y, r * 0.88, 0.66, 0.24, cap);
      if (id === 'pop') motif(p, v, t, x, y, r * 0.88, 0.9, top, cap);
      else { // the coin bumper's cap is a coin, whatever the theme
        p.face(ring(x, y, r * 0.62).map(([a, b]) => P(v, a, b, 0.9)), cap.light, { sil: false, line: 0.35 });
        const [cx, cy] = P(v, x, y, 0.9);
        const d = label('$', S * 0.62, t.ink);
        d.position.set(cx, cy);
        d.scale.y = v.k;
        out.addChild(body, d);
      }
      break;
    }
    case 'mega': {
      shadow(under, v, t, x, y, r * 1.05, r * 1.05, 0.24);
      const skin = st.hit ? mat(t, mix(t.role.mega, WHITE, 0.3)) : role;
      p.cyl(x, y, r, 0, 0.22, mat(t, t.rim));
      p.cyl(x, y, r * 0.86, 0.22, 0.9, skin);
      // dome: a stack of rings hulled together reads as a soft bun / boulder / boss
      const domePts = [0, 0.3, 0.55, 0.78, 0.92, 1].flatMap((u) => ring(x, y, r * 0.86 * Math.cos((u * Math.PI) / 2), 28).map(([a, b]) => P(v, a, b, 1.12 + u * 0.75)));
      p.face(hull(domePts), skin.base);
      p.face(ring(x - r * 0.25, y + r * 0.2, r * 0.32, 20).map(([a, b]) => P(v, a, b, 1.75)), skin.light, { line: 0, sil: false });
      face(p, v, t, x, y - r * 0.82, 0.78, r, st.mood ?? (st.hit ? 'oof' : 'happy'), st.follow);
      break;
    }
    case 'sling': case 'deflector': {
      const hw = def.shape.type === 'box' ? def.shape.hw : 1, hh = def.shape.type === 'box' ? def.shape.hh : 0.3;
      shadowPoly(under, v, t, box(x, y, hw + 0.1, hh + 0.1, angle, hh));
      if (id === 'sling') {
        p.prism(box(x, y, hw + 0.06, hh + 0.06, angle, hh), 0, 0.34, mat(t, t.paper));
        p.prism(box(x, y, hw - 0.2, hh - 0.1, angle, hh * 0.6), 0.34, 0.22, st.hit ? mat(t, mix(t.role.sling, WHITE, 0.45)) : role);
        for (const s of [-1, 1]) p.cyl(x + Math.cos(angle) * hw * 0.92 * s, y + Math.sin(angle) * hw * 0.92 * s, 0.2, 0.34, 0.36, metal);
      } else {
        p.prism(box(x, y, hw, hh, angle, hh * 0.95), 0, 0.42, role);
        for (const s of [-1, 1]) p.cyl(x + Math.cos(angle) * hw * 0.85 * s, y + Math.sin(angle) * hw * 0.85 * s, 0.17, 0.42, 0.2, metal);
      }
      break;
    }
    case 'spinner': {
      const hw = def.shape.type === 'box' ? def.shape.hw : 1.4, c = Math.cos(angle), s = Math.sin(angle);
      shadowPoly(under, v, t, box(x, y, hw, 0.25, angle));
      const ends: Pt[] = [-1, 1].map((k) => [x + c * hw * k, y + s * hw * k]);
      // the plate turns about the axle between the posts: 8 frames of its half-turn
      const ph = ((st.spin ?? 0) / 8) * Math.PI, half = Math.max(0.05, 0.35 * Math.abs(Math.cos(ph))), zc = 0.7;
      const back = Math.sin(ph) > 0;
      const drawPost = (e: Pt) => p.cyl(e[0], e[1], 0.22, 0, 1.25, metal);
      drawPost(back ? ends[1] : ends[0]);
      const mid = (a: number, z: number) => P(v, ends[0][0] + (ends[1][0] - ends[0][0]) * a, ends[0][1] + (ends[1][1] - ends[0][1]) * a, z);
      p.face([mid(0, zc - half), mid(1, zc - half), mid(1, zc + half), mid(0, zc + half)], Math.cos(ph) >= 0 ? role.base : role.shade);
      if (half > 0.14) for (const a of [0.25, 0.5, 0.75]) p.face([mid(a - 0.06, zc - half), mid(a + 0.06, zc - half), mid(a + 0.06, zc + half), mid(a - 0.06, zc + half)], role.light, { sil: false, line: 0 });
      drawPost(back ? ends[0] : ends[1]);
      break;
    }
    case 'lane': {
      // a real lane: two guide posts, a wire switch and a lit letter; the lanes spell a word per theme
      const lit = !!st.lit, c = t.role.lane;
      p.face(box(x, y, r * 0.62, r * 0.9, 0, r * 0.55).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(box(x, y, r * 0.5, r * 0.78, 0, r * 0.45).map(([a, b]) => P(v, a, b, 0.02)), lit ? mix(c, WHITE, 0.3) : mix(c, t.shadeTint, 0.6), { line: 0.4, sil: false });
      const wire = [P(v, x - r * 0.34, y + r * 0.55, 0), P(v, x - r * 0.2, y + r * 0.55, 0.4), P(v, x + r * 0.2, y + r * 0.55, 0.4), P(v, x + r * 0.34, y + r * 0.55, 0)];
      p.op((g) => {
        for (const [w, col] of [[v.lw * 1.5, t.ink], [v.lw * 0.55, t.metal]] as const) {
          g.moveTo(wire[0][0], wire[0][1]);
          for (const q of wire.slice(1)) g.lineTo(q[0], q[1]);
          g.stroke({ width: w, color: col, join: 'round', cap: 'round' });
        }
      });
      for (const s of [-1, 1]) p.cyl(x + s * r * 0.95, y, 0.17, 0, 0.55, metal);
      p.draw(body);
      const [LX, LY] = P(v, x, y - r * 0.18, 0.02);
      const L = label(st.letter ?? 'A', S * 1.05, lit ? t.ink : mix(c, t.shadeTint, 0.9), lit ? { stroke: t.paper, strokeW: v.lw * 0.9 } : {});
      L.position.set(LX, LY);
      L.scale.y = Math.max(0.6, v.k);
      out.addChild(L);
      return out;
    }
    case 'uplight': {
      // a glass dome over a bulb, tinted by the part type it levels up, with rank chevrons on the floor
      const lit = !!st.lit, c = t.role[st.target ?? 'pop'];
      for (let k = 0; k < 3; k++) {
        const yy = y - r * 0.9 - k * 0.42;
        const chev = ([[-0.42, 0], [0, 0.3], [0.42, 0], [0.42, -0.16], [0, 0.14], [-0.42, -0.16]] as Pt[]).map(([a, b]) => P(v, x + a, yy + b, 0.02));
        p.face(chev, lit && k < 2 ? mix(c, WHITE, 0.2) : mix(c, t.shadeTint, 0.6), { line: 0.3, sil: false });
      }
      shadow(under, v, t, x, y, r * 0.8, r * 0.8);
      p.cyl(x, y, r * 0.78, 0, 0.18, metal);
      const glass = lit ? mix(c, WHITE, 0.35) : mix(c, t.shadeTint, 0.45);
      const dome = [0, 0.35, 0.6, 0.8, 0.93, 1].flatMap((u) => ring(x, y, r * 0.6 * Math.cos((u * Math.PI) / 2), 24).map(([a, b]) => P(v, a, b, 0.18 + u * 0.85)));
      p.face(hull(dome), glass);
      const [BX, BY] = P(v, x, y, 0.55);
      p.op((g) => {
        g.circle(BX, BY, S * 0.2).fill(lit ? WHITE : mix(c, t.shadeTint, 0.7)).stroke({ width: v.lw * 0.4, color: t.ink });
        g.moveTo(BX - S * 0.34, BY - S * 0.2).quadraticCurveTo(BX - S * 0.29, BY - S * 0.52, BX - S * 0.04, BY - S * 0.6).stroke({ width: v.lw * 0.8, color: WHITE, cap: 'round', alpha: 0.9 });
      });
      if (lit) {
        const [TX, TY] = P(v, x, y, 1.1);
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k - 2.5) * 0.5, r0 = S * 0.75, r1 = S * 1.15;
          over.moveTo(TX + Math.cos(a) * r0, TY + Math.sin(a) * r0).lineTo(TX + Math.cos(a) * r1, TY + Math.sin(a) * r1).stroke({ width: v.lw * 0.9, color: t.ink, cap: 'round' });
        }
      }
      break;
    }
    case 'lamp': {
      shadow(under, v, t, x, y, 0.6, 0.6);
      p.cyl(x, y, 0.55, 0, 0.14, metal);
      p.cyl(x, y, 0.13, 0.14, 1.5, mat(t, t.ink));
      const [BX, BY] = P(v, x, y, 1.95);
      p.face(ringS(BX, BY, 0.5 * S, 24), st.lit ? t.role.lamp : mix(t.role.lamp, t.shadeTint, 0.5));
      p.op((g) => { g.circle(BX - 0.16 * S, BY - 0.18 * S, 0.11 * S).fill(WHITE); });
      p.cyl(x, y, 0.42, 2.2, 0.16, mat(t, t.accent));
      break;
    }
    case 'printer': {
      const c = Math.cos(angle), s = Math.sin(angle);
      aimArrow(p, v, t, x, y, angle, 1.75, t.role.printer);
      shadowPoly(under, v, t, box(x, y, 1.25, 1.0, angle, 0.25), 0.24);
      const bodyM = mat(t, t.role.printer);
      p.prism(box(x, y, 1.2, 0.95, angle, 0.28), 0, 1.25, bodyM);
      // the mouth on the front face, where balls go in and come out
      const fy = y - 0.96 * Math.cos(angle);
      p.face(ring(x, fy, 0.5, 24, 0.32).map(([a, b]) => P(v, a, b, 0.45)), st.busy ? mix(t.role.printer, WHITE, 0.6) : t.ink, { sil: false, line: st.busy ? 0.4 : 0 });
      eyes(p, v, t, x, fy, 0.95, 0.42, st.busy);
      if (t.popMotif === 'cone') { // castle: a gatehouse with crenels
        for (const k of [-0.8, 0, 0.8]) p.prism(box(x + k * c, y + k * s, 0.28, 0.75, angle), 1.25, 0.35, bodyM);
      } else if (t.popMotif === 'awning') { // diner: a toaster with two slots
        for (const k of [-0.35, 0.35]) p.face(box(x + k, y + 0.1, 0.16, 0.6, 0).map(([a, b]) => P(v, a, b, 1.26)), t.ink, { sil: false, line: 0 });
      } else { // factory: a press with a striped chimney
        p.cyl(x + 0.55 * c - 0.4 * s, y + 0.4 * c + 0.55 * s, 0.32, 1.25, 0.9, mat(t, t.accent));
        p.cyl(x + 0.55 * c - 0.4 * s, y + 0.4 * c + 0.55 * s, 0.34, 1.6, 0.18, mat(t, t.paper));
      }
      break;
    }
    case 'bank': {
      const c = Math.cos(angle), s = Math.sin(angle);
      shadowPoly(under, v, t, box(x, y, 2.7, 0.5, angle));
      p.prism(box(x, y, 2.7, 0.5, angle, 0.2), 0, 0.16, metal);
      // the far targets first, so a nearer one overlaps it
      const order = [0, 1, 2].sort((a, b) => ((b - 1) * s) - ((a - 1) * s));
      for (const i of order) {
        const k = (i - 1) * 1.75, down = st.down?.[i];
        p.prism(box(x + k * c, y + k * s, 0.7, 0.18, angle), 0.16, down ? 0.05 : 0.95, down ? mat(t, mix(t.role.bank, t.shadeTint, 0.5)) : role);
        if (!down) p.face(box(x + k * c + 0.19 * s, y + k * s - 0.19 * c, 0.42, 0.01, angle).map(([a, b]) => P(v, a, b, 0.7)), t.paper, { sil: false, line: 0.3 });
      }
      break;
    }
    case 'kickback': {
      // a floor insert with an arrow along its aim and a piston at the back: lit while armed
      const on = st.armed !== false, c = t.role.kickback;
      const dx = -Math.sin(angle), dy = Math.cos(angle);
      p.face(ring(x, y, r, 28).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, r * 0.8, 28).map(([a, b]) => P(v, a, b, 0.02)), on ? mix(c, WHITE, 0.3) : mix(c, t.shadeTint, 0.6), { line: 0.35, sil: false });
      for (const back of [0.05, -0.45]) {
        const tip: Pt = [x + dx * (r * 0.62 + back), y + dy * (r * 0.62 + back)], px = -dy, py = dx;
        const chev: Pt[] = [tip, [tip[0] - dx * 0.5 + px * 0.5, tip[1] - dy * 0.5 + py * 0.5], [tip[0] - dx * 0.72 + px * 0.5, tip[1] - dy * 0.72 + py * 0.5],
          [tip[0] - dx * 0.22, tip[1] - dy * 0.22], [tip[0] - dx * 0.72 - px * 0.5, tip[1] - dy * 0.72 - py * 0.5], [tip[0] - dx * 0.5 - px * 0.5, tip[1] - dy * 0.5 - py * 0.5]];
        p.face(chev.map(([a, b]) => P(v, a, b, 0.03)), on ? t.paper : mix(c, t.shadeTint, 0.75), { line: 0.3, sil: false });
      }
      p.cyl(x - dx * r * 0.95, y - dy * r * 0.95, 0.26, 0, 0.42, metal);
      p.cyl(x - dx * r * 0.95, y - dy * r * 0.95, 0.2, 0.42, 0.14, mat(t, on ? c : mix(c, t.shadeTint, 0.5)));
      break;
    }
    case 'saver': {
      // a SHOOT AGAIN insert: a looping arrow round a ball, lit while a save is ready
      const on = st.armed !== false, c = t.role.saver;
      p.face(ring(x, y, r, 28).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, r * 0.8, 28).map(([a, b]) => P(v, a, b, 0.02)), on ? mix(c, WHITE, 0.25) : mix(c, t.shadeTint, 0.6), { line: 0.35, sil: false });
      const arc: Pt[] = Array.from({ length: 16 }, (_, i) => { const a = 0.6 + (i / 15) * Math.PI * 1.5; return P(v, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, 0.03); });
      const col = on ? t.ink : mix(c, t.shadeTint, 0.85);
      p.op((g) => {
        g.moveTo(arc[0][0], arc[0][1]);
        for (const q of arc.slice(1)) g.lineTo(q[0], q[1]);
        g.stroke({ width: v.lw * 0.9, color: col, cap: 'round', join: 'round' });
        const e = arc[arc.length - 1], d = arc[arc.length - 3], ang = Math.atan2(e[1] - d[1], e[0] - d[0]), h = S * 0.28;
        g.poly([e[0] + Math.cos(ang) * h * 0.7, e[1] + Math.sin(ang) * h * 0.7, e[0] + Math.cos(ang + 2.2) * h, e[1] + Math.sin(ang + 2.2) * h, e[0] + Math.cos(ang - 2.2) * h, e[1] + Math.sin(ang - 2.2) * h]).fill(col);
        const [BX, BY] = P(v, x, y, 0.03);
        g.circle(BX, BY, S * 0.18).fill(on ? WHITE : mix(c, t.shadeTint, 0.5)).stroke({ width: v.lw * 0.4, color: t.ink });
      });
      break;
    }
    case 'vari': {
      // four blocks stepping up like a power meter: the harder the hit, the more of them light
      const hw = def.shape.type === 'box' ? def.shape.hw : 1.3, c = Math.cos(angle), s = Math.sin(angle);
      shadowPoly(under, v, t, box(x, y, hw + 0.1, 0.45, angle));
      p.prism(box(x, y, hw + 0.12, 0.42, angle, 0.15), 0, 0.12, metal);
      const seg = hw / 2, n = st.seg ?? 0;
      const order = [0, 1, 2, 3].sort((a, b) => (b - a) * s);
      for (const i of order) {
        const off = -hw + seg * (i + 0.5);
        const lit = i < n;
        p.prism(box(x + c * off, y + s * off, seg * 0.42, 0.26, angle), 0.12, 0.35 + i * 0.16, lit ? mat(t, mix(t.role.vari, WHITE, 0.5)) : role);
      }
      break;
    }
    case 'flipper': {
      // the extra flipper itself is drawn live from the sim; the part shows its mounting plate
      p.cyl(x, y, 0.55, 0, 0.08, metal);
      break;
    }
  }
  p.draw(body);
  out.addChild(over);
  return out;
}

/**
 * A levelled part wears it in its colour, the way Space Cadet's bumpers change colour as they upgrade: each
 * level moves the part's role colour a step towards gold, and at the top level it is gold. The Cha-Ching
 * bumper, already gold, warms towards the theme's hot accent instead.
 */
export function levelColour(t: Theme, id: PartId, level: number): string {
  const base = t.role[id];
  if (level <= 0) return base;
  const to = id === 'coin' ? t.accent : t.role.coin;
  return mixHue(base, to, Math.min(level, MAX_LEVEL) / MAX_LEVEL);
}

/** A floor arrow insert showing where an eject sends the ball (rotatable ejectors: Ball Printer). */
function aimArrow(p: Prop, v: View, t: Theme, x: number, y: number, angle: number, dist: number, color: string) {
  const dx = -Math.sin(angle), dy = Math.cos(angle), px = -dy, py = dx;
  const tip: Pt = [x + dx * (dist + 0.55), y + dy * (dist + 0.55)];
  const pts: Pt[] = [tip, [tip[0] - dx * 0.6 + px * 0.45, tip[1] - dy * 0.6 + py * 0.45], [tip[0] - dx * 0.6 - px * 0.45, tip[1] - dy * 0.6 - py * 0.45]];
  p.face(pts.map(([a, b]) => P(v, a, b, 0.02)), color, { line: 0.35, sil: false });
}

/** The pop bumper's theme motif: a striped awning (diner), a turret roof (castle), a riveted cap (factory). */
function motif(p: Prop, v: View, t: Theme, x: number, y: number, r: number, z: number, top: Pt[], role: ReturnType<typeof mat>) {
  if (t.popMotif === 'cone') {
    const apex = P(v, x, y, z + 1.25);
    p.face(hull([...top, apex]), role.base);
    const right = hull([...top.filter((q) => q[0] > P(v, x, y)[0] + r * v.S * 0.3), apex]);
    if (right.length > 2) p.face(right, role.shade, { sil: false, line: 0 });
    p.face(hull([...top, apex]), null, { sil: false });
    p.cyl(x, y, 0.12, z + 1.2, 0.28, mat(t, t.rim));
  } else if (t.popMotif === 'awning') {
    const n = 12;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const wedge: Pt[] = [P(v, x, y, z)];
      for (let k = 0; k <= 4; k++) { const a = a0 + ((a1 - a0) * k) / 4; wedge.push(P(v, x + Math.cos(a) * r, y + Math.sin(a) * r, z)); }
      p.face(wedge, t.paper, { sil: false, line: 0 });
    }
    p.face(top, null, { sil: false });
  } else {
    p.face(ring(x, y, r * 0.66).map(([a, b]) => P(v, a, b, z)), role.light, { sil: false, line: 0.35 });
    const dots = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + 0.3; return P(v, x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, z); });
    p.op((g) => { for (const [X, Y] of dots) g.circle(X, Y, v.S * 0.07).fill(t.ink); });
  }
}

function eyes(p: Prop, v: View, t: Theme, x: number, y: number, z: number, gap: number, wide = false, whites = false) {
  const pts = [-1, 1].map((s) => P(v, x + s * gap * 0.5, y, z));
  if (whites) {
    p.op((g) => { for (const [X, Y] of pts) g.ellipse(X, Y, v.S * EYE.rx, v.S * EYE.ry).fill(WHITE).stroke({ width: v.lw * 0.45, color: t.ink }); });
    return;
  }
  p.op((g) => {
    for (const [X, Y] of pts) {
      g.ellipse(X, Y, v.S * (wide ? 0.13 : 0.1), v.S * (wide ? 0.13 : 0.15)).fill(t.ink);
      g.circle(X - v.S * 0.03, Y - v.S * 0.05, v.S * 0.035).fill(WHITE);
    }
  });
}
/** Big Boi's eyes: where they sit (sim units, relative to his centre) and how big the whites are, for the live pupils. */
export const EYE = { rx: 0.23, ry: 0.27, dy: -0.82, z: 1.03, gap: 0.6 };
export function bigBoiEyes(v: View, x: number, y: number, r: number): Pt[] {
  return [-1, 1].map((s) => P(v, x + s * r * EYE.gap * 0.5, y + r * EYE.dy, EYE.z));
}

/** Big Boi's face. Goofy tone: a few parts are characters, most are furniture. */
function face(p: Prop, v: View, t: Theme, x: number, y: number, z: number, r: number, mood: Mood, follow = false) {
  const s = v.S, lw = v.lw;
  const eyePts = [-1, 1].map((k) => P(v, x + k * r * EYE.gap * 0.5, y, z + 0.25));
  if (mood === 'cool') {
    // seriously high combo: sunglasses, and a smirk
    p.op((g) => {
      const [[ax, ay], [bx, by]] = eyePts, w = s * 0.34, h = s * 0.24;
      g.moveTo(ax, ay - h * 0.4).lineTo(bx, by - h * 0.4).stroke({ width: lw * 0.9, color: t.ink });
      for (const [X, Y] of eyePts) g.roundRect(X - w, Y - h, w * 2, h * 1.9, h * 0.8).fill(t.ink);
      for (const [X, Y] of eyePts) g.moveTo(X - w * 0.6, Y - h * 0.4).lineTo(X - w * 0.1, Y - h * 0.75).stroke({ width: lw * 0.6, color: WHITE, cap: 'round' });
    });
  } else if (follow) {
    // the whites, baked; the renderer draws the pupils so they can follow the ball
    const big = mood === 'shocked' ? 1.25 : 1;
    p.op((g) => { for (const [X, Y] of eyePts) g.ellipse(X, Y, s * EYE.rx * big, s * EYE.ry * big).fill(WHITE).stroke({ width: lw * 0.45, color: t.ink }); });
  } else eyes(p, v, t, x, y, z + 0.25, r * 0.55, mood === 'oof' || mood === 'shocked');
  const [X, Y] = P(v, x, y, z - 0.1);
  p.op((g) => {
    for (const k of [-1, 1]) g.ellipse(X + k * r * 0.5 * s, Y + s * 0.12, s * 0.2, s * 0.11).fill({ color: t.accent, alpha: mood === 'sad' ? 0.25 : 0.55 });
    const brow = (lift: number, droop: number) => {
      for (const [k, [ex, ey]] of [-1, 1].map((kk, i) => [kk, eyePts[i]] as const)) {
        const by = ey - s * (EYE.ry + 0.12 + lift);
        g.moveTo(ex - s * 0.18, by + k * -droop * s).lineTo(ex + s * 0.18, by + k * droop * s).stroke({ width: lw * 0.7, color: t.ink, cap: 'round' });
      }
    };
    switch (mood) {
      case 'happy': g.moveTo(X - s * 0.22, Y).quadraticCurveTo(X, Y + s * 0.28, X + s * 0.22, Y).stroke({ width: lw * 0.6, color: t.ink, cap: 'round' }); break;
      case 'oof': g.ellipse(X, Y + s * 0.06, s * 0.14, s * 0.18).fill(t.ink); break;
      case 'sad': // a bad shot: droopy brows, a frown
        brow(0, -0.08);
        g.moveTo(X - s * 0.2, Y + s * 0.16).quadraticCurveTo(X, Y - s * 0.08, X + s * 0.2, Y + s * 0.16).stroke({ width: lw * 0.6, color: t.ink, cap: 'round' });
        break;
      case 'shocked': // a nice combo: brows up, mouth wide open
        brow(0.1, 0.04);
        g.ellipse(X, Y + s * 0.08, s * 0.17, s * 0.25).fill(t.ink);
        g.ellipse(X, Y + s * 0.2, s * 0.09, s * 0.07).fill(t.accent);
        break;
      case 'cool': g.moveTo(X - s * 0.16, Y + s * 0.06).quadraticCurveTo(X + s * 0.05, Y + s * 0.2, X + s * 0.22, Y - s * 0.02).stroke({ width: lw * 0.6, color: t.ink, cap: 'round' }); break;
    }
  });
}

/** A flipper at any angle (the sim's), drawn live: rubber band, coloured bat, metal pivot cap. */
export function drawFlipper(g: Graphics, v: View, t: Theme, px: number, py: number, angle: number, sign: 1 | -1) {
  const p = new Prop(v, t);
  const tip: Pt = [px + Math.cos(angle) * FLIPPER_LENGTH * sign, py + Math.sin(angle) * FLIPPER_LENGTH * sign];
  const outline = hull([...ring(px, py, 0.58, 16), ...ring(tip[0], tip[1], 0.28, 12)]);
  const rubber = hull([...ring(px, py, 0.66, 16), ...ring(tip[0], tip[1], 0.36, 12)]);
  shadowPoly(g, v, t, rubber, 0.22);
  p.prism(rubber, 0, 0.28, mat(t, t.role.flipper === t.paper ? t.accent : t.rubber));
  p.prism(outline, 0.28, 0.24, mat(t, t.role.flipper));
  p.cyl(px, py, 0.24, 0.52, 0.12, mat(t, t.metal), { n: 16 });
  p.draw(g);
}

export interface BallWear { core: string; shade: string }
/** The ball: near-white with an ink outline in every theme, the most readable thing on screen. */
export function drawBall(g: Graphics, v: View, t: Theme, x: number, y: number, wear: BallWear) {
  const r = BALL_R, [X, Y] = P(v, x, y, r), R = r * v.S;
  g.circle(X, Y, R + v.lw * 0.8).fill(t.ink);
  g.circle(X, Y, R).fill(wear.shade);
  g.circle(X - R * 0.18, Y - R * 0.18, R * 0.74).fill(wear.core);
  g.ellipse(X - R * 0.35, Y - R * 0.38, R * 0.3, R * 0.2).fill(WHITE);
  g.moveTo(X - R * 0.7, Y + R * 0.2).quadraticCurveTo(X - R * 0.3, Y + R * 0.7, X + R * 0.3, Y + R * 0.65).stroke({ width: R * 0.14, color: t.accent, alpha: 0.6, cap: 'round' });
}
export function ballShadow(g: Graphics, v: View, t: Theme, x: number, y: number) {
  shadow(g, v, t, x + 0.15, y - 0.1, BALL_R * 0.9, BALL_R * 0.7, 0.3);
}

/** The ground ring under a hit part: sells the contact and stays in the floor plane. */
export function groundRing(g: Graphics, v: View, t: Theme, x: number, y: number, r: number, color: string, w: number, alpha = 1) {
  const pts = flat(ring(x, y, r, 40).map(([a, b]) => P(v, a, b, 0.02)));
  g.poly(pts).stroke({ width: w + v.lw * 1.4, color: t.ink, alpha: 0.9 * alpha });
  g.poly(pts).stroke({ width: w, color, alpha });
}

export { star };
