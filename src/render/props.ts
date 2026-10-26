// One drawing per part type (ported from tools/concept/props.ts). The silhouette is fixed (it is how a
// player recognises the part); the theme only supplies colours and one motif, so every machine gets
// every part for free. Things that change every frame (glows, value tags, smoke) are drawn by the
// renderer; what is drawn here is baked once per part x state x theme into a texture.
import { Container, Graphics } from 'pixi.js';
import { MAX_LEVEL, PARTS, type PartId } from '../data/parts';
import { BALL_R, FLIPPER_LENGTH } from '../sim/constants';
import { box, flat, hull, label, P, Prop, ring, shadow, shadowPoly, star, type Pt, type View } from './draw';
import { mat, mix, mixHue, WHITE, type Mat, type Theme } from './theme';

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
  /** The part's level (0 to 5): its colour steps towards gold with each level, like Space Cadet's bumpers. */
  level?: number;
  /** A part with a sliding piece: draw only its rail ('base'), only the piece ('mover'), or both (an icon). */
  part?: 'base' | 'mover';
  /** A Lamp's brightness (0 to 5 steps). */
  bright?: number;
  /** The gem set into the part (an inlay): a little stone at its front. */
  gem?: PartId;
}
export type Mood = 'happy' | 'oof' | 'sad' | 'shocked' | 'cool' | 'blink';

export const stateKey = (st: PartState) =>
  [st.letter ?? '', st.lit ? 1 : 0, st.target ?? '', st.down ? st.down.map((d) => (d ? 1 : 0)).join('') : '', st.hit ? 1 : 0, st.spin ?? '', st.seg ?? '', st.armed === false ? 0 : 1, st.busy ? 1 : 0, st.follow ? 1 : 0, st.mood ?? '', st.level ?? 0, st.part ?? '', st.bright ?? '', st.gem ?? ''].join('.');

const ringS = (cx: number, cy: number, r: number, n = 20, ry = r): Pt[] => ring(cx, cy, r, n, ry);

/** Draws one part at sim position (x, y). The returned container holds a Graphics and any lettering. */
export function drawPart(v: View, t: Theme, id: PartId, x: number, y: number, angle = 0, st: PartState = {}): Container {
  if (st.gem) {
    // a part with a gem set in it: the part, and the stone at its front edge
    const out = drawPart(v, t, id, x, y, angle, { ...st, gem: undefined });
    const sh = PARTS[id].shape, front = sh.type === 'circle' ? sh.r * 0.82 : sh.hh * 0.9;
    const g = new Graphics(), p = new Prop(v, t);
    gemStone(p, v, t, st.gem, x, y - front, 0.45, 0.32);
    p.draw(g);
    out.addChild(g);
    return out;
  }
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
        // a milled edge round the coin, and a fat dollar sign stamped in it
        p.op((g) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, [X, Y] = P(v, x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, 0.9); g.circle(X, Y, S * 0.04).fill(cap.shade); } });
        const d = label('$', S * 0.95, cap.shade, { stroke: t.ink, strokeW: v.lw * 0.9 });
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
      p.face(ring(x - r * 0.4, y + r * 0.02, r * 0.26, 20).map(([a, b]) => P(v, a, b, 1.55)), skin.light, { line: 0, sil: false });
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
    case 'rank': {
      // a gem-shaped insert with a chevron (a promotion) on a wire switch; lit, it shines
      const lit = !!st.lit, c = t.role.rank;
      const gem = (k: number): Pt[] => [[x, y + r * k], [x + r * 0.8 * k, y], [x, y - r * k], [x - r * 0.8 * k, y]];
      p.face(gem(1).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(gem(0.8).map(([a, b]) => P(v, a, b, 0.02)), lit ? mix(c, WHITE, 0.35) : mix(c, t.shadeTint, 0.6), { line: 0.4, sil: false });
      for (const dy of [-0.3, 0.05]) {
        const ch: Pt[] = [[x - r * 0.4, y + dy * r], [x, y + (dy + 0.3) * r], [x + r * 0.4, y + dy * r], [x + r * 0.4, y + (dy - 0.16) * r], [x, y + (dy + 0.14) * r], [x - r * 0.4, y + (dy - 0.16) * r]];
        p.face(ch.map(([a, b]) => P(v, a, b, 0.03)), lit ? t.paper : mix(c, t.shadeTint, 0.85), { line: 0.3, sil: false });
      }
      for (const sx of [-1, 1]) p.cyl(x + sx * r * 0.98, y, 0.15, 0, 0.5, metal);
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
      // a lamp post: a big glass globe on a short iron post under a little cap; lit, the globe shines in the lamp's colour
      const lit = !!st.lit, c = t.role.lamp, iron = mat(t, mix(t.metal, t.ink, 0.55));
      shadow(under, v, t, x, y, 0.62, 0.62);
      p.cyl(x, y, 0.52, 0, 0.14, metal);
      p.cyl(x, y, 0.3, 0.14, 0.12, iron);
      p.cyl(x, y, 0.09, 0.26, 0.8, iron, { n: 12 });
      p.cyl(x, y, 0.24, 1.02, 0.12, metal);
      egg(p, v, x, y, 1.56, 0.56, 0.56, 0.5, 0, mat(t, lit ? mix(c, WHITE, 0.2) : mix(c, t.shadeTint, 0.55)), lit);
      const [BX, BY] = P(v, x, y - 0.45, 1.5);
      p.op((g) => {
        if (lit) g.circle(BX, BY, S * 0.22).fill(WHITE);
        g.moveTo(BX - S * 0.17, BY + S * 0.06).lineTo(BX - S * 0.08, BY - S * 0.07).lineTo(BX, BY + S * 0.05).lineTo(BX + S * 0.08, BY - S * 0.07).lineTo(BX + S * 0.17, BY + S * 0.06)
          .stroke({ width: v.lw * 0.5, color: lit ? mix(c, t.ink, 0.45) : t.ink, cap: 'round', join: 'round' });
      });
      p.cyl(x, y, 0.16, 2.02, 0.1, iron, { n: 14 });
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
    case 'ding': {
      // a desk bell: a dark round base and a shiny dome with the plunger on top. Ding!
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const dome = st.hit ? mat(t, mix(t.role.ding, WHITE, 0.4)) : role;
      p.cyl(x, y, r * 0.96, 0, 0.28, mat(t, mix(t.rim, t.ink, 0.5)));
      p.cyl(x, y, r * 0.84, 0.28, 0.06, metal);
      const pts = [0, 0.25, 0.5, 0.75, 0.92, 1].flatMap((u) => ring(x, y, r * 0.8 * Math.cos((u * Math.PI) / 2), 26).map(([a, b]) => P(v, a, b, 0.34 + u * 0.92)));
      const H = hull(pts), [cx] = P(v, x, y, 0.34);
      p.face(H, dome.base);
      const sh = hull(pts.filter((q) => q[0] > cx + r * 0.38 * S));
      if (sh.length > 2) p.face(sh, dome.shade, { sil: false, line: 0 });
      p.face(H, null, { sil: false });
      const [hx, hy] = P(v, x - r * 0.38, y, 0.9);
      p.op((g) => g.moveTo(hx, hy + S * 0.18).quadraticCurveTo(hx - S * 0.02, hy - S * 0.2, hx + S * 0.3, hy - S * 0.38).stroke({ width: S * 0.12, color: WHITE, cap: 'round', alpha: 0.85 }));
      p.cyl(x, y, 0.07, 1.24, 0.24, metal, { n: 10 });
      p.cyl(x, y, 0.2, 1.48, 0.1, metal);
      if (st.hit) {
        const [tx, ty] = P(v, x, y, 1.6);
        p.op((g) => { for (const a of [-2.3, -1.57, -0.84]) g.moveTo(tx + Math.cos(a) * S * 0.45, ty + Math.sin(a) * S * 0.45).lineTo(tx + Math.cos(a) * S * 0.8, ty + Math.sin(a) * S * 0.8); g.stroke({ width: v.lw * 0.8, color: t.ink, cap: 'round' }); });
      }
      break;
    }
    case 'ruby': case 'garnet': case 'opal': case 'goldleaf': case 'redseal': case 'emerald': case 'topaz': {
      // a gem as sold: the stone on a little velvet cushion
      shadow(under, v, t, x, y, 0.6, 0.5);
      p.cyl(x, y, 0.62, 0, 0.2, mat(t, mix(t.accent, t.shadeTint, 0.35)));
      gemStone(p, v, t, id, x, y, 0.22, 0.48);
      break;
    }
    case 'keg': {
      // a powder keg: a wooden barrel with two iron hoops and a fuse; lit, the fuse sparks; spent, it is charred
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const spent = st.armed === false;
      const wood = spent ? mat(t, mix(t.role.keg, t.ink, 0.55)) : st.hit ? mat(t, mix(t.role.keg, WHITE, 0.35)) : role;
      const iron = spent ? mat(t, mix(t.metal, t.ink, 0.5)) : metal;
      p.cyl(x, y, r * 0.84, 0, 0.18, wood);
      p.cyl(x, y, r * 0.88, 0.18, 0.06, iron);
      p.cyl(x, y, r * 0.95, 0.24, 0.5, wood);
      p.cyl(x, y, r * 0.88, 0.74, 0.06, iron);
      p.cyl(x, y, r * 0.84, 0.8, 0.2, wood);
      p.face(ring(x, y, r * 0.6, 20).map(([a, b]) => P(v, a, b, 1.0)), wood.shade, { sil: false, line: 0.35 });
      if (!spent) {
        const [fx0, fy0] = P(v, x + r * 0.15, y, 1.0), [fx1, fy1] = P(v, x + r * 0.4, y + r * 0.1, 1.8);
        p.op((g) => {
          g.moveTo(fx0, fy0).quadraticCurveTo(fx0 - v.S * 0.1, (fy0 + fy1) / 2, fx1, fy1).stroke({ width: v.lw * 1.4 + v.S * 0.06, color: t.ink, cap: 'round' });
          g.moveTo(fx0, fy0).quadraticCurveTo(fx0 - v.S * 0.1, (fy0 + fy1) / 2, fx1, fy1).stroke({ width: v.S * 0.06, color: t.paper, cap: 'round' });
          if (st.lit) g.star(fx1, fy1, 7, v.S * 0.38, v.S * 0.16).fill(t.role.coin).stroke({ width: v.lw * 0.6, color: t.ink, join: 'round' });
        });
      }
      break;
    }
    case 'laser': {
      // a laser turret: a domed head on a swivel, its barrel aimed out at you, a lens at the muzzle; dark while it recharges
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r, 0, 0.16, mat(t, t.paper));
      p.cyl(x, y, r * 0.42, 0.16, 0.34, metal);
      const head = st.hit ? mat(t, mix(t.role.laser, WHITE, 0.4)) : role, ready = st.lit !== false, tl = 0.35;
      egg(p, v, x, y + 0.08, 0.86, r * 0.66, r * 0.6, 0.42, 0, head);
      p.prism(box(x, y + 0.2, 0.06, 0.22, 0), 1.2, 0.22, head);
      tube(p, v, x, y - r * 0.55, 0.86, 0.2, r * 0.8, tl, metal, mix(t.metal, t.ink, 0.3));
      p.face(tubeDisc(v, x, y - r * 0.55, 0.86, 0.13, r * 0.41, tl), ready ? t.role.laser : mix(t.role.laser, t.ink, 0.55), { sil: false, line: 0.35 });
      if (ready) p.face(tubeDisc(v, x, y - r * 0.55, 0.86, 0.05, r * 0.42, tl, -0.03, 0.04), WHITE, { sil: false, line: 0 });
      break;
    }
    case 'gong': {
      // a brass gong hung upright in a wooden frame
      shadow(under, v, t, x, y, r * 1.05, r * 0.7);
      const brass = st.hit ? mat(t, mix(t.role.gong, WHITE, 0.45)) : role, wood = mat(t, t.rim);
      p.cyl(x, y, r * 0.9, 0, 0.14, mat(t, t.paper));
      p.cyl(x - r * 0.95, y, 0.13, 0.14, 3.1, wood);
      // the view squashes height, so the upright disc is drawn taller than it is wide to read as round
      const R = r * 0.78, zc = 1.75, tall = 1.9;
      const disc = (k: number): Pt[] => Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; return P(v, x + Math.cos(a) * R * k, y - 0.05, zc + Math.sin(a) * R * k * tall); });
      p.face(disc(1), brass.shade, { line: 0.5 });
      p.face(disc(0.86), brass.base, { sil: false, line: 0.3 });
      p.face(disc(0.32), brass.light, { sil: false, line: 0.3 });
      p.cyl(x + r * 0.95, y, 0.13, 0.14, 3.1, wood);
      p.op((g) => {
        const [ax, ay] = P(v, x - r * 0.95, y, 3.2), [bx, by] = P(v, x + r * 0.95, y, 3.2);
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: v.S * 0.2 + v.lw, color: t.ink, cap: 'round' });
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: v.S * 0.2, color: t.rim, cap: 'round' });
      });
      break;
    }
    case 'sparkler': {
      // a sparkler: a thin wire on a bumper skirt, its tip a fizzing star (dark while it recharges)
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r, 0, 0.16, mat(t, t.paper));
      p.cyl(x, y, r * 0.55, 0.16, 0.22, role);
      p.cyl(x, y, 0.09, 0.38, 2.3, metal);
      const ready = st.lit !== false;
      const fizz = st.hit ? WHITE : ready ? t.role.sparkler : mix(t.role.sparkler, t.ink, 0.5);
      const [sx, sy] = P(v, x, y, 2.75);
      p.op((g) => {
        g.star(sx, sy, 8, S * (ready ? 0.8 : 0.5), S * 0.3).fill(fizz).stroke({ width: v.lw * 0.7, color: t.ink, join: 'round' });
        if (ready) g.circle(sx, sy, S * 0.17).fill(WHITE);
      });
      break;
    }
    case 'firecracker': {
      // a firecracker: a striped rocket on its launch stand, nose up; once it has gone, only the empty stand is left
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r, 0, 0.16, mat(t, t.paper));
      p.cyl(x, y, r * 0.62, 0.16, 0.18, metal);
      if (st.armed === false) {
        p.cyl(x, y, r * 0.3, 0.34, 0.3, mat(t, mix(t.metal, t.ink, 0.5)));
        p.face(ring(x, y, r * 0.22, 14).map(([a, b]) => P(v, a, b, 0.65)), t.ink, { sil: false, line: 0 });
        break;
      }
      const body = st.hit ? mat(t, mix(t.role.firecracker, WHITE, 0.4)) : role, band = mat(t, t.paper);
      p.cyl(x, y, r * 0.4, 0.34, 1.0, body);
      p.cyl(x, y, r * 0.4, 1.34, 0.3, band);
      p.cyl(x, y, r * 0.4, 1.64, 1.0, body);
      p.face(hull([...ring(x, y, r * 0.4, 18).map(([a, b]) => P(v, a, b, 2.64)), P(v, x, y, 3.8)]), band.base);
      // the fuse, out of the bottom
      const [fx0, fy0] = P(v, x + r * 0.3, y, 0.4), [fx1, fy1] = P(v, x + r * 0.62, y - r * 0.2, 0.34);
      p.op((g) => g.moveTo(fx0, fy0).lineTo(fx1, fy1).stroke({ width: v.lw * 1.2, color: t.ink, cap: 'round' }));
      break;
    }
    case 'rocks': {
      // a pile of rocks, one boulder per spark it sheds a hit (1 to 5), on a low base
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r, 0, 0.14, mat(t, t.paper));
      const stone = st.hit ? mat(t, mix(t.role.rocks, WHITE, 0.35)) : role;
      const spots: [number, number, number, number][] = [[0, -0.1, 0.5, 0.14], [-0.42, 0.15, 0.36, 0.14], [0.42, 0.18, 0.38, 0.14], [0.05, 0.32, 0.34, 0.14], [0, 0.05, 0.3, 1.2]];
      const n = Math.max(1, Math.min(5, st.seg ?? 1));
      // farther first, the top stone last
      const order = spots.slice(0, n).map((q, i) => ({ q, i })).sort((a, b) => (a.i === 4 ? 1 : b.i === 4 ? -1 : b.q[1] - a.q[1]));
      for (const { q: [dx, dy, k, z0] } of order) {
        const R = r * k, cx = x + dx * r, cy = y + dy * r;
        const pts = [0, 0.45, 0.8, 1].flatMap((u) => ring(cx, cy, R * Math.cos((u * Math.PI) / 2.3), 9).map(([a, b]) => P(v, a, b, z0 + u * R * 2.6)));
        p.face(hull(pts), stone.base);
        p.face(ring(cx - R * 0.3, cy + R * 0.15, R * 0.3, 7).map(([a, b]) => P(v, a, b, z0 + R * 2.2)), stone.light, { sil: false, line: 0 });
      }
      break;
    }
    case 'split': {
      // a Splitter: a floor insert with a wedge in the middle and an arrow out to each side
      const lit = st.lit !== false, c = t.role.split;
      p.face(ring(x, y, r, 24).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, r * 0.82, 24).map(([a, b]) => P(v, a, b, 0.02)), lit ? mix(c, WHITE, 0.25) : mix(c, t.shadeTint, 0.6), { line: 0.3, sil: false });
      for (const sx of [-1, 1]) p.face([P(v, x + sx * r * 0.75, y, 0.03), P(v, x + sx * r * 0.3, y + r * 0.3, 0.03), P(v, x + sx * r * 0.3, y - r * 0.3, 0.03)], lit ? WHITE : mix(c, t.ink, 0.4), { sil: false, line: 0.3 });
      p.prism(box(x, y, 0.12, r * 0.45, 0), 0, 0.5, mat(t, st.hit ? WHITE : t.metal));
      break;
    }
    case 'whale': {
      // the Whale: a big round blue whale with a white belly, a tail and a blowhole; it spouts when it is full
      shadow(under, v, t, x, y, r * 1.05, r * 0.9);
      const body = mat(t, st.hit ? mix(t.role.whale, WHITE, 0.4) : t.role.whale);
      p.face(hull([0, 0.35, 0.7, 1].flatMap((u) => ring(x, y, r * 0.9 * Math.cos((u * Math.PI) / 2.3), 26, r * 0.75 * Math.cos((u * Math.PI) / 2.3)).map(([a, b]) => P(v, a, b, u * 1.5)))), body.base);
      p.face(ring(x, y - r * 0.55, r * 0.55, 18, r * 0.2).map(([a, b]) => P(v, a, b, 0.45)), WHITE, { sil: false, line: 0.35 });
      p.face([P(v, x + r * 0.8, y, 0.6), P(v, x + r * 1.35, y + r * 0.35, 1.2), P(v, x + r * 1.35, y - r * 0.35, 0.3)], body.shade, { line: 0.45 });
      const [ex, ey] = P(v, x - r * 0.45, y - r * 0.4, 1.0), [hx, hy] = P(v, x, y, 1.55);
      const full = Math.min(6, st.seg ?? 0);
      p.op((g) => {
        g.circle(ex, ey, S * 0.12).fill(t.ink);
        g.ellipse(hx, hy, S * 0.16, S * 0.07).fill(t.ink);
        for (let i = 0; i < full; i++) g.circle(hx + (i - (full - 1) / 2) * S * 0.18, hy - S * (0.35 + (i % 2) * 0.15), S * 0.08).fill(mix(t.role.whale, WHITE, 0.6)).stroke({ width: v.lw * 0.3, color: t.ink });
      });
      break;
    }
    case 'insure': {
      // an Insurance Policy: a striped umbrella, open and ready for a rainy day; once used, it is gone
      shadow(under, v, t, x, y, r * 1.15, r * 1.0);
      const c = st.hit ? mix(t.role.insure, WHITE, 0.4) : t.role.insure, cream = st.hit ? WHITE : t.paper;
      p.cyl(x, y, 0.05, 0, 1.3, mat(t, t.ink), { n: 8 });
      // the hooked handle, at the foot of the shaft
      const [hx, hy] = P(v, x, y, 0.28);
      p.op((g) => {
        for (const [w, col] of [[v.lw * 1.6 + S * 0.1, t.ink], [S * 0.1, t.rim]] as const) g.moveTo(hx, hy - S * 0.15).lineTo(hx, hy + S * 0.05).quadraticCurveTo(hx, hy + S * 0.3, hx + S * 0.2, hy + S * 0.25).quadraticCurveTo(hx + S * 0.34, hy + S * 0.18, hx + S * 0.3, hy).stroke({ width: w, color: col, cap: 'round', join: 'round' });
      });
      const R = r * 1.12, z0 = 1.2, apex = P(v, x, y, 1.85), n = 8;
      const rim = (i: number): Pt => { const a = (i / n) * Math.PI * 2 + 0.2; return [x + Math.cos(a) * R, y + Math.sin(a) * R]; };
      const wedges = Array.from({ length: n }, (_, i) => i).sort((a, b) => (rim(b)[1] + rim(b + 1)[1]) - (rim(a)[1] + rim(a + 1)[1]));
      p.silhouette(hull([apex, ...Array.from({ length: n * 4 }, (_, i) => { const a = (i / (n * 4)) * Math.PI * 2; return P(v, x + Math.cos(a) * R, y + Math.sin(a) * R, z0); })]));
      for (const i of wedges) {
        const a0 = (i / n) * Math.PI * 2 + 0.2, a1 = ((i + 1) / n) * Math.PI * 2 + 0.2, pts: Pt[] = [apex];
        // a scalloped edge: each panel sags between its ribs
        for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6, sag = Math.sin((k / 6) * Math.PI) * 0.16; pts.push(P(v, x + Math.cos(a) * R * (1 - sag * 0.4), y + Math.sin(a) * R * (1 - sag * 0.4), z0 + sag)); }
        p.face(pts, i % 2 ? cream : c, { sil: false, line: 0.35 });
      }
      p.cyl(x, y, 0.06, 1.85, 0.22, mat(t, t.ink), { n: 8 });
      break;
    }
    case 'nest': {
      // a Spider Nest: a silky white web dome with eggs peeking out, and its owner sitting on top, all legs and big eyes
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r, 0, 0.14, mat(t, t.paper));
      const silk = mat(t, st.hit ? WHITE : mix(t.role.nest, WHITE, 0.72)), spider = st.hit ? mix(t.role.nest, WHITE, 0.4) : t.role.nest;
      const dome = [0, 0.4, 0.75, 1].flatMap((u) => ring(x, y, r * 0.88 * Math.cos((u * Math.PI) / 2.2), 24).map(([a, b]) => P(v, a, b, 0.14 + u * 1.0)));
      p.face(hull(dome), silk.base);
      const [ax, ay] = P(v, x, y, 1.14);
      p.op((g) => {
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, [bx, by] = P(v, x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, 0.2); g.moveTo(ax, ay).lineTo(bx, by); }
        for (const q of [0.35, 0.65]) { const pts = ring(x, y, r * 0.86 * Math.sin(q * Math.PI / 1.6 + 0.3), 24).map(([a, b]) => P(v, a, b, 0.14 + (1 - q) * 0.9)); g.poly(flat(pts)); }
        g.stroke({ width: v.lw * 0.35, color: mix(t.role.nest, t.ink, 0.2), alpha: 0.45 });
        for (const [dx, dy] of [[-0.5, -0.45], [0.42, -0.5], [0.05, -0.68]] as const) { const [qx, qy] = P(v, x + dx * r, y + dy * r, 0.35); g.ellipse(qx, qy, S * 0.16, S * 0.13).fill(t.paper).stroke({ width: v.lw * 0.45, color: t.ink }); g.circle(qx - S * 0.05, qy - S * 0.04, S * 0.035).fill(WHITE); }
        // the spider: eight bent legs, a round body, two big eyes
        const [sx, sy] = P(v, x, y, 1.3), L = S * 0.42;
        for (const k of [-1, 1]) for (let l = 0; l < 4; l++) {
          const a = (-0.75 + l * 0.5), kx = sx + k * Math.cos(a) * L * 0.6, ky = sy + Math.sin(a) * L * 0.6 - S * 0.12, ex = sx + k * Math.cos(a) * L, ey = sy + Math.sin(a) * L + S * 0.1;
          for (const [w, col] of [[v.lw * 1.5 + S * 0.05, t.ink], [S * 0.05, spider]] as const) g.moveTo(sx, sy).lineTo(kx, ky).lineTo(ex, ey).stroke({ width: w, color: col, cap: 'round', join: 'round' });
        }
        g.ellipse(sx, sy, S * 0.27, S * 0.23).fill(spider).stroke({ width: v.lw * 0.8, color: t.ink });
        for (const k of [-1, 1]) { g.circle(sx + k * S * 0.1, sy - S * 0.02, S * 0.08).fill(WHITE).stroke({ width: v.lw * 0.35, color: t.ink }); g.circle(sx + k * S * 0.1, sy, S * 0.04).fill(t.ink); }
        g.moveTo(sx - S * 0.07, sy + S * 0.12).quadraticCurveTo(sx, sy + S * 0.17, sx + S * 0.07, sy + S * 0.12).stroke({ width: v.lw * 0.4, color: t.ink, cap: 'round' });
      });
      break;
    }
    case 'jar': {
      // a Marble Jar: a glass jar with a lid, the marbles in it at the bottom
      shadow(under, v, t, x, y, r * 0.95, r * 0.95);
      p.cyl(x, y, r * 0.75, 0, 1.3, mat(t, mix(t.role.jar, WHITE, st.hit ? 0.6 : 0.3)));
      // a screw-top lid with a cloth cover tied on, and a paper label with a marble drawn on it
      p.cyl(x, y, r * 0.66, 1.3, 0.2, metal);
      p.cyl(x, y, r * 0.72, 1.42, 0.12, mat(t, t.accent));
      p.face(ring(x, y, r * 0.5, 18).map(([a, b]) => P(v, a, b, 1.55)), mix(t.accent, WHITE, 0.3), { sil: false, line: 0.3 });
      const n = Math.min(5, st.seg ?? 0), cols = ['#ff5d8f', '#ffd23f', '#55d08f', '#62b8ff', '#8a63f2'];
      const [lx, ly] = P(v, x, y - r * 0.75, 0.82);
      p.op((g) => {
        for (let i = 0; i < n; i++) { const [mx, my] = P(v, x + (i - 2) * r * 0.25, y - r * 0.5, 0.25 + (i % 2) * 0.22); g.circle(mx, my, S * 0.15).fill(cols[i]).stroke({ width: v.lw * 0.4, color: t.ink }); }
        g.roundRect(lx - S * 0.36, ly - S * 0.2, S * 0.72, S * 0.4, S * 0.06).fill(t.paper).stroke({ width: v.lw * 0.45, color: t.ink });
        g.circle(lx, ly, S * 0.12).fill(t.role.jar).stroke({ width: v.lw * 0.35, color: t.ink });
        g.circle(lx - S * 0.04, ly - S * 0.04, S * 0.035).fill(WHITE);
      });
      break;
    }
    case 'wreck': {
      // a wrecking ball: a heavy iron ball hanging on a chain from a little crane at the back
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r * 0.95, 0, 0.14, mat(t, t.paper));
      const iron = mat(t, st.hit ? mix(t.role.wreck, WHITE, 0.4) : t.role.wreck), arm = mat(t, t.role.bucket);
      // the crane: a post at the back and a jib out over the ball
      const px = x + r * 0.78, py = y + r * 0.5, ja = Math.atan2(py - y, px - x) , jl = Math.hypot(px - x, py - y);
      p.prism(box(px, py, 0.15, 0.15, 0), 0.14, 2.9, arm);
      p.prism(box((px + x) / 2, (py + y) / 2, jl / 2 + 0.12, 0.1, ja), 3.04, 0.18, arm);
      p.prism(box(px - 0.3, py - 0.2, 0.08, 0.08, 0), 2.5, 0.54, arm);
      const [jx, jy] = P(v, x, y, 3.04), [bx, by] = P(v, x, y, 1.82);
      p.op((g) => {
        for (const [w, col] of [[v.lw * 1.8 + S * 0.05, t.ink], [S * 0.05, t.metal]] as const) g.moveTo(jx, jy).lineTo(bx, by).stroke({ width: w, color: col, cap: 'round' });
        for (let i = 1; i < 6; i++) { const q = i / 6; g.ellipse(jx + (bx - jx) * q, jy + (by - jy) * q, S * 0.07, S * 0.1).stroke({ width: v.lw * 0.45, color: t.ink }); }
      });
      egg(p, v, x, y, 1.12, r * 0.66, r * 0.66, 0.72, 0, iron);
      p.cyl(x, y, 0.12, 1.8, 0.14, metal, { n: 10 });
      break;
    }
    case 'broom': {
      // a magic broomstick floating over a floor plate, bristles at the back, pointing the way the ball will fly
      const c = Math.cos(angle), sn = Math.sin(angle), dir = (k: number): [number, number] => [x - sn * k, y + c * k], side = (k: number): [number, number] => [c * k, sn * k];
      p.face(ring(x, y, r, 24).map(([a, b]) => P(v, a, b, 0.01)), mix(t.role.broom, t.shadeTint, 0.55), { line: 0.4 });
      p.face(ring(x, y, r * 0.8, 24).map(([a, b]) => P(v, a, b, 0.015)), mix(t.role.broom, t.shadeTint, 0.35), { sil: false, line: 0.25 });
      const [ax, ay] = dir(r * 0.72), [l1x, l1y] = side(r * 0.28);
      p.face([P(v, ...dir(r * 1.0), 0.02), P(v, ax + l1x, ay + l1y, 0.02), P(v, ax - l1x, ay - l1y, 0.02)], t.accent, { sil: false, line: 0.3 });
      const zb = 0.45, [hx, hy] = dir(r * 0.95), [tx, ty] = dir(-r * 0.25), [bx, by] = dir(-r * 1.05), [sx, sy] = side(r * 0.5);
      shadowPoly(under, v, t, [[hx, hy], [tx + sx * 0.3, ty + sy * 0.3], [bx + sx, by + sy], [bx - sx, by - sy], [tx - sx * 0.3, ty - sy * 0.3]].map(([a, b]) => [a - 0.3, b + 0.3] as Pt), 0.18);
      p.op((g) => {
        const a = P(v, hx, hy, zb), b = P(v, tx, ty, zb);
        g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: S * 0.2 + v.lw * 1.4, color: t.ink, cap: 'round' });
        g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: S * 0.2, color: st.hit ? WHITE : t.rim, cap: 'round' });
      });
      const bristle = mat(t, t.role.broom), fan: Pt[] = [P(v, tx + sx * 0.32, ty + sy * 0.32, zb), P(v, bx + sx, by + sy, zb - 0.1), P(v, ...dir(-r * 1.2), zb - 0.12), P(v, bx - sx, by - sy, zb - 0.1), P(v, tx - sx * 0.32, ty - sy * 0.32, zb)];
      p.face(fan, bristle.base, { line: 0.45 });
      p.op((g) => { for (const k of [-0.6, -0.2, 0.2, 0.6]) { const q0 = P(v, tx + sx * 0.3 * k, ty + sy * 0.3 * k, zb), q1 = P(v, bx + sx * k * 0.9, by + sy * k * 0.9, zb - 0.1); g.moveTo(q0[0], q0[1]).lineTo(q1[0], q1[1]); } g.stroke({ width: v.lw * 0.4, color: bristle.shade }); });
      const [w0x, w0y] = dir(-r * 0.33);
      p.face(box(w0x, w0y, r * 0.2, 0.07, angle).map(([a, b]) => P(v, a, b, zb + 0.02)), t.accent, { sil: false, line: 0.35 });
      for (const [k, s2, sz] of [[0.4, 1, 0.22], [-0.1, -1, 0.16], [0.75, -1, 0.14]] as const) { const [qx, qy] = dir(r * k), [ox, oy] = side(r * 0.55 * s2), [X, Y] = P(v, qx + ox, qy + oy, 0.9); p.op((g) => g.star(X, Y, 4, S * sz, S * sz * 0.38).fill(t.role.coin).stroke({ width: v.lw * 0.4, color: t.ink, join: 'round' })); }
      break;
    }
    case 'hutch': {
      // decor: a little wooden hutch with a pitched roof, a round door and two eyes peering out of the dark
      shadow(under, v, t, x, y, r * 1.05, r * 0.85);
      const wood = mat(t, mix(t.role.hutch, t.rim, 0.5)), roof = mat(t, t.role.hutch), hw = r * 0.72, hd = r * 0.55, h = 0.95, top = 1.75;
      p.prism(box(x, y, hw, hd, 0), 0, h, wood);
      // the gable end facing you, then the two slopes of the roof over it
      p.face([P(v, x - hw, y - hd, h), P(v, x + hw, y - hd, h), P(v, x, y - hd, top)], wood.mid, { line: 0.4 });
      for (const sx of [-1, 1]) p.face([P(v, x + sx * (hw + 0.14), y - hd - 0.12, h - 0.06), P(v, x, y - hd - 0.12, top + 0.06), P(v, x, y + hd + 0.12, top + 0.06), P(v, x + sx * (hw + 0.14), y + hd + 0.12, h - 0.06)], sx < 0 ? roof.light : roof.base, { line: 0.4 });
      p.face([P(v, x - hw - 0.14, y - hd - 0.12, h - 0.06), P(v, x, y - hd - 0.12, top + 0.06), P(v, x + hw + 0.14, y - hd - 0.12, h - 0.06), P(v, x + hw + 0.04, y - hd - 0.12, h - 0.16), P(v, x, y - hd - 0.12, top - 0.06), P(v, x - hw - 0.04, y - hd - 0.12, h - 0.16)], roof.shade, { sil: false, line: 0.35 });
      const door: Pt[] = [];
      for (let i = 0; i <= 12; i++) { const a = Math.PI - (i / 12) * Math.PI; door.push([Math.cos(a) * 0.3, 0.42 + Math.sin(a) * 0.3]); }
      door.push([0.3, 0.02], [-0.3, 0.02]);
      p.face(xz(v, x, y - hd - 0.01, door), t.ink, { sil: false, line: 0.35 });
      for (const sx of [-1, 1]) { const [ex, ey] = P(v, x + sx * 0.11, y - hd - 0.02, 0.48); p.op((g) => { g.ellipse(ex, ey, S * 0.07, S * 0.09).fill(t.role.goldleaf); g.circle(ex, ey, S * 0.03).fill(t.ink); }); }
      // a hand-painted warning plank
      const [wx, wy] = P(v, x + hw * 0.62, y - hd - 0.02, 0.62);
      p.op((g) => { g.rect(wx - S * 0.12, wy - S * 0.1, S * 0.24, S * 0.2).fill(t.paper).stroke({ width: v.lw * 0.4, color: t.ink }); g.rect(wx - S * 0.015, wy - S * 0.07, S * 0.03, S * 0.09).fill(t.accent); g.circle(wx, wy + S * 0.05, S * 0.017).fill(t.accent); });
      break;
    }
    case 'grape': {
      // a bunch of grapes on a vine-leaf base; a big enough bunch turns gold
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r, 0, 0.14, mat(t, t.role.bonsai));
      const berry = mat(t, st.lit ? t.role.goldleaf : st.hit ? mix(t.role.grape, WHITE, 0.4) : t.role.grape);
      const dome = (cx: number, cy: number, rr: number, z0: number) => {
        p.face(hull([0, 0.5, 1].flatMap((u) => ring(cx, cy, rr * Math.cos((u * Math.PI) / 2.2), 12).map(([a, b]) => P(v, a, b, z0 + u * rr * 1.6)))), berry.base);
        p.face(ring(cx - rr * 0.3, cy + rr * 0.2, rr * 0.25, 8).map(([a, b]) => P(v, a, b, z0 + rr * 1.3)), berry.light, { sil: false, line: 0 });
      };
      for (const [dx, dy, z] of [[-0.35, 0.25, 0.15], [0.35, 0.25, 0.15], [0, -0.3, 0.15], [-0.18, 0, 0.75], [0.2, 0.05, 0.75], [0, 0, 1.3]] as const) dome(x + dx * r, y + dy * r, r * 0.4, z);
      p.cyl(x, y, 0.06, 1.9, 0.35, mat(t, t.rim), { n: 8 });
      break;
    }
    case 'echo': {
      // a rocky little hill with a dark cave mouth facing you; when the ball rolls in, the echoes ring out of it
      shadow(under, v, t, x, y, r * 1.05, r * 0.85);
      const stone = mat(t, st.hit ? mix(t.role.echo, WHITE, 0.35) : mix(t.role.echo, '#8d8a99', 0.45));
      egg(p, v, x, y + 0.15, 0.1, r * 1.0, r * 0.62, 1.25, 0, stone, false);
      const [cx0, cy0] = P(v, x, y + 0.15, 0.8);
      p.op((g) => {
        g.moveTo(cx0 - S * 0.62, cy0 - S * 0.1).lineTo(cx0 - S * 0.4, cy0 - S * 0.02).lineTo(cx0 - S * 0.3, cy0 - S * 0.2);
        g.moveTo(cx0 + S * 0.35, cy0 - S * 0.32).lineTo(cx0 + S * 0.55, cy0 - S * 0.2).lineTo(cx0 + S * 0.62, cy0 + S * 0.02);
        g.stroke({ width: v.lw * 0.5, color: t.ink, cap: 'round', join: 'round', alpha: 0.6 });
      });
      const mouth: Pt[] = [];
      for (let i = 0; i <= 14; i++) { const a = Math.PI - (i / 14) * Math.PI; mouth.push([Math.cos(a) * 0.5, 0.04 + Math.sin(a) * 0.72]); }
      p.face(xz(v, x, y - r * 0.5, mouth), mix(t.ink, t.role.echo, 0.15), { sil: false, line: 0.5 });
      for (const [dx, dy, k] of [[-0.9, -0.15, 0.18], [0.85, -0.2, 0.15], [0.62, -0.62, 0.12]] as const) egg(p, v, x + dx * r, y + dy * r, 0.12, k, k * 0.8, k * 0.8, 0, stone, false);
      if (st.hit) {
        const [mx, my] = P(v, x, y - r * 0.55, 0.45);
        p.op((g) => { for (let i = 1; i <= 3; i++) g.moveTo(mx - S * 0.22 * i, my + S * 0.05 * i).quadraticCurveTo(mx, my + S * 0.32 * i, mx + S * 0.22 * i, my + S * 0.05 * i); g.stroke({ width: v.lw * 0.7, color: t.ink, cap: 'round' }); });
      }
      break;
    }
    case 'spot': {
      // a stage spotlight: a black can on a yoke, tipped up so its lens faces the table, barn doors over it; dark while it cools down
      shadow(under, v, t, x, y, r * 1.0, r * 0.9);
      const lit = st.lit !== false, can = mat(t, st.hit ? mix(t.ink, WHITE, 0.3) : mix(t.ink, t.metal, 0.3)), zc = 1.0, tl = 0.6;
      p.cyl(x, y, r * 0.8, 0, 0.14, metal);
      p.cyl(x, y, 0.09, 0.14, 0.4, metal, { n: 10 });
      p.prism(box(x, y, 0.52, 0.08, 0), 0.5, 0.1, metal);
      for (const sx of [-1, 1]) p.prism(box(x + sx * 0.48, y, 0.05, 0.08, 0), 0.6, 0.46, metal);
      tube(p, v, x, y + 0.05, zc, 0.4, 0.6, tl, can, mix(t.ink, t.metal, 0.12));
      p.face(tubeDisc(v, x, y + 0.05, zc, 0.29, 0.31, tl), lit ? mix(t.role.spot, WHITE, 0.35) : mix(t.role.spot, t.ink, 0.65), { sil: false, line: 0.4 });
      if (lit) p.face(tubeDisc(v, x, y + 0.05, zc, 0.09, 0.32, tl, -0.1, 0.1), WHITE, { sil: false, line: 0 });
      // the barn doors: a flap over the lens and one each side
      const at = (u: number, w: number, k: number): Pt => P(v, x + u, y + 0.05 - Math.cos(tl) * k + Math.sin(tl) * w, zc + Math.sin(tl) * k + Math.cos(tl) * w);
      p.face([at(-0.32, 0.4, 0.3), at(0.32, 0.4, 0.3), at(0.38, 0.62, 0.52), at(-0.38, 0.62, 0.52)], can.light, { line: 0.35 });
      for (const sx of [-1, 1]) p.face([at(sx * 0.4, 0.3, 0.3), at(sx * 0.4, -0.3, 0.3), at(sx * 0.6, -0.34, 0.5), at(sx * 0.6, 0.34, 0.5)], sx < 0 ? can.light : can.mid, { line: 0.35 });
      for (const sx of [-1, 1]) { const [kx, ky] = P(v, x + sx * 0.54, y, zc); p.op((g) => g.circle(kx, ky, S * 0.09).fill(t.accent).stroke({ width: v.lw * 0.4, color: t.ink })); }
      break;
    }
    case 'bonsai': {
      // a bonsai in a shallow pot: its crown grows a little with every round it stays put
      shadow(under, v, t, x, y, r * 1.05, r * 0.9);
      const grow = Math.min(5, st.seg ?? 0) / 5;
      p.cyl(x, y, r * 0.95, 0, 0.12, mat(t, t.paper));
      p.prism(box(x, y, r * 0.75, r * 0.5, 0, 0.15), 0.12, 0.35, mat(t, mix(t.rim, t.ink, 0.15)));
      p.cyl(x + 0.05, y, 0.12, 0.47, 0.6 + grow * 0.4, mat(t, mix(t.rim, t.ink, 0.35)), { n: 8 });
      const leaf = mat(t, st.hit ? mix(t.role.bonsai, WHITE, 0.35) : t.role.bonsai), k = 0.55 + grow * 0.45;
      for (const [dx, dy, z, rr] of [[-0.35, 0, 1.05, 0.42], [0.4, 0.05, 1.2, 0.38], [0, 0.1, 1.5, 0.48]] as const) {
        const cx = x + dx * r * k, cy = y + dy * r, R = rr * r * k;
        p.face(hull([0, 0.6, 1].flatMap((u) => ring(cx, cy, R * Math.cos((u * Math.PI) / 2.3), 12, R * 0.8).map(([a, b]) => P(v, a, b, z + grow * 0.4 + u * R * 0.9)))), leaf.base);
      }
      break;
    }
    case 'capsule': {
      // a time capsule: a banded steel canister poking out of a dirt mound, a spade stuck in beside it; ripe, it twinkles
      shadow(under, v, t, x, y, r * 1.0, r * 0.9);
      const steel = mat(t, t.role.capsule), dirt = mat(t, mix('#8a5a3b', t.shadeTint, 0.12));
      egg(p, v, x, y, 0.05, r * 0.95, r * 0.8, 0.45, 0, dirt, false);
      for (const [dx, dy] of [[-0.6, -0.35], [0.5, -0.5], [-0.15, -0.65]] as const) { const [cx, cy] = P(v, x + dx * r, y + dy * r, 0.08); p.op((g) => g.circle(cx, cy, S * 0.06).fill(dirt.shade)); }
      // the capsule itself: a steel pill lying half out of the mound, a band round its middle and a hatch on its end
      const cx = x - 0.12, cy = y + 0.05, cz = 0.5;
      egg(p, v, cx, cy, cz, 0.62, 0.3, 0.3, 0, steel);
      p.op((g) => {
        const band = Array.from({ length: 13 }, (_, i) => { const a = Math.PI + (i / 12) * Math.PI; return P(v, cx, cy + Math.cos(a) * 0.3, cz - Math.sin(a) * 0.3); });
        g.moveTo(band[0][0], band[0][1]); for (const q of band.slice(1)) g.lineTo(q[0], q[1]);
        g.stroke({ width: S * 0.1 + v.lw, color: t.ink, cap: 'round' });
        g.moveTo(band[0][0], band[0][1]); for (const q of band.slice(1)) g.lineTo(q[0], q[1]);
        g.stroke({ width: S * 0.1, color: t.accent, cap: 'round' });
        const [hx, hy] = P(v, cx - 0.42, cy - 0.12, cz + 0.12);
        g.circle(hx, hy, S * 0.09).fill(mix(t.role.capsule, WHITE, 0.4)).stroke({ width: v.lw * 0.4, color: t.ink });
      });
      // the spade
      const [s0x, s0y] = P(v, x + r * 0.62, y - r * 0.1, 0.25), [s1x, s1y] = P(v, x + r * 0.78, y - r * 0.1, 1.6);
      p.op((g) => {
        for (const [w, col] of [[v.lw * 1.6 + S * 0.08, t.ink], [S * 0.08, t.rim]] as const) g.moveTo(s0x, s0y).lineTo(s1x, s1y).stroke({ width: w, color: col, cap: 'round' });
        g.roundRect(s1x - S * 0.14, s1y - S * 0.1, S * 0.28, S * 0.12, S * 0.05).fill(t.rim).stroke({ width: v.lw * 0.5, color: t.ink });
        g.poly([s0x - S * 0.17, s0y - S * 0.12, s0x + S * 0.17, s0y - S * 0.12, s0x + S * 0.12, s0y + S * 0.14, s0x, s0y + S * 0.22, s0x - S * 0.12, s0y + S * 0.14]).fill(t.metal).stroke({ width: v.lw * 0.5, color: t.ink, join: 'round' });
      });
      if (st.lit) { const [sx, sy] = P(v, x - r * 0.5, y, 1.6); p.op((g) => { g.star(sx, sy, 4, S * 0.45, S * 0.15).fill(WHITE).stroke({ width: v.lw * 0.5, color: t.ink, join: 'round' }); g.star(sx + S * 0.55, sy - S * 0.35, 4, S * 0.25, S * 0.09).fill(t.role.coin).stroke({ width: v.lw * 0.4, color: t.ink, join: 'round' }); }); }
      break;
    }
    case 'ice': {
      // an ice sculpture: a swan carved from ice on a little tray; it shrinks as it melts, and the puddle round it grows
      const left = 1 - Math.min(4, st.seg ?? 0) / 5, k = 0.65 + 0.65 * left;
      p.face(ring(x, y, r * (1.15 - left * 0.3), 22).map(([a, b]) => P(v, a, b, 0.01)), mix(t.role.ice, t.floor, 0.35), { line: 0.3 });
      p.cyl(x, y, r * 0.7, 0, 0.18, metal);
      const ice = mat(t, st.hit ? WHITE : t.role.ice), z0 = 0.18;
      // the body (a slab with its tail swept up), a wing on its side, then the long S of the neck and the head
      const body: Pt[] = [...blob(0.08 * k, z0 + 0.34 * k, 0.56 * k, 0.32 * k, 22, 2.2).filter(([, z]) => z >= z0 + 0.1 * k), [0.78 * k, z0 + 0.82 * k]];
      slab(p, v, x, y, 0.26 * k, body, mix(ice.base, WHITE, 0.45), ice.base);
      p.face(xz(v, x, y - 0.27 * k, [[-0.12 * k, z0 + 0.5 * k], [0.5 * k, z0 + 0.72 * k], [0.36 * k, z0 + 0.42 * k], [0.05 * k, z0 + 0.3 * k]]), mix(ice.base, WHITE, 0.55), { sil: false, line: 0.3 });
      const neckC = (u: number): Pt => { const q = 1 - u; return [q * q * q * -0.3 + 3 * q * q * u * -0.78 + 3 * q * u * u * 0.06 + u * u * u * -0.36, q * q * q * 0.5 + 3 * q * q * u * 0.95 + 3 * q * u * u * 1.35 + u * u * u * 1.62]; };
      const left2: Pt[] = [], right2: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12, [a, b] = neckC(u), [a2, b2] = neckC(Math.min(1, u + 0.02)), [a1, b1] = neckC(Math.max(0, u - 0.02)), dx = a2 - a1, dz = b2 - b1, L = Math.hypot(dx, dz) || 1, w = (0.11 - u * 0.04);
        left2.push([(a - (dz / L) * w) * k, z0 + (b + (dx / L) * w) * k]); right2.push([(a + (dz / L) * w) * k, z0 + (b - (dx / L) * w) * k]);
      }
      p.face(xz(v, x, y - 0.1 * k, [...left2, ...right2.reverse()]), ice.base, { line: 0.4 });
      const [hu, hz] = neckC(1);
      p.face(xz(v, x, y - 0.1 * k, blob(hu * k, z0 + hz * k, 0.13 * k, 0.11 * k, 14, 2)), ice.base, { line: 0.4 });
      p.face(xz(v, x, y - 0.11 * k, [[(hu - 0.1) * k, z0 + (hz + 0.03) * k], [(hu - 0.36) * k, z0 + (hz - 0.06) * k], [(hu - 0.08) * k, z0 + (hz - 0.06) * k]]), mix(t.role.ice, t.accent, 0.35), { line: 0.35 });
      const [ex, ey] = P(v, x + (hu - 0.03) * k, y - 0.12 * k, z0 + (hz + 0.03) * k);
      p.op((g) => { g.circle(ex, ey, S * 0.035 * k + 0.6).fill(t.ink); const [gx, gy] = P(v, x + 0.25 * k, y - 0.27 * k, z0 + 0.6 * k); g.moveTo(gx, gy).lineTo(gx + S * 0.15 * k, gy + S * 0.12 * k).stroke({ width: v.lw * 0.7, color: WHITE, cap: 'round' }); });
      if (left < 1) for (const [dx, dy] of [[-0.75, -0.55], [0.7, -0.45]] as const) { const [dX, dY] = P(v, x + dx * r, y + dy * r, 0.02); p.op((g) => g.ellipse(dX, dY, S * 0.1, S * 0.05).fill(mix(t.role.ice, WHITE, 0.3)).stroke({ width: v.lw * 0.3, color: t.ink })); }
      break;
    }
    case 'well': {
      // a little stone wishing well: a ring of stones round dark water, the coins in it glinting
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const stone = mat(t, st.hit ? mix(t.role.well, WHITE, 0.35) : t.role.well);
      p.cyl(x, y, r * 0.95, 0, 0.75, stone);
      p.face(ring(x, y, r * 0.72, 24).map(([a, b]) => P(v, a, b, 0.76)), mix(t.role.echo, t.ink, 0.45), { sil: false, line: 0.4 });
      const coins = Math.min(5, st.seg ?? 0);
      for (let i = 0; i < coins; i++) { const a = i * 2.1, [cx, cy] = P(v, x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.3, 0.77); p.op((g) => g.ellipse(cx, cy, S * 0.13, S * 0.08).fill(t.role.coin).stroke({ width: v.lw * 0.3, color: t.ink })); }
      for (const sx of [-1, 1]) p.cyl(x + sx * r * 0.85, y, 0.08, 0.75, 1.1, mat(t, t.rim), { n: 8 });
      p.op((g) => { const [ax, ay] = P(v, x - r * 1.05, y, 1.85), [bx, by] = P(v, x, y, 2.35), [cx, cy] = P(v, x + r * 1.05, y, 1.85); g.poly([ax, ay, bx, by, cx, cy]).fill(t.role.firecracker).stroke({ width: v.lw * 0.8, color: t.ink, join: 'round' }); });
      break;
    }
    case 'pinata': {
      // the classic piñata: a paper donkey in frilly bands of colour, standing on its four stubby legs. Cracks show its
      // damage, and once it has burst only the legs, the bottom of its belly and the sweets are left
      const hitW = (c: string) => (st.hit ? mix(c, WHITE, 0.4) : c);
      const bands = PINATA.map(hitW), head = hitW(t.role.pinata), hoof = mix(t.ink, t.rim, 0.35);
      const bx = x + 0.12, cz = 1.3, a = 0.82, ry = 0.36, rz = 0.42;
      shadow(under, v, t, bx, y, r * 1.1, r * 0.62);
      const legs: [number, number][] = [[-0.36, 0.17], [0.64, 0.17], [-0.56, -0.17], [0.44, -0.17]];
      const leg = (u: number, w: number) => {
        p.cyl(bx + u, y + w, 0.15, 0, 0.18, mat(t, hoof), { n: 14 });
        p.cyl(bx + u, y + w, 0.15, 0.18, 0.4, mat(t, bands[1]), { n: 14 });
        p.cyl(bx + u, y + w, 0.15, 0.58, 0.4, mat(t, bands[0]), { n: 14 });
      };
      if (st.armed === false) {
        for (const [u, w] of legs) leg(u, w);
        barrel(p, v, bx, y, cz, a, ry, rz, bands, 2);
        candy(p, v, t, x - r * 0.8, y - r * 0.55, 0.2, PINATA[0]);
        candy(p, v, t, x + r * 0.9, y - r * 0.3, -0.5, PINATA[2]);
        candy(p, v, t, x + r * 0.15, y - r * 0.85, 0.9, PINATA[3]);
        break;
      }
      for (const [u, w] of legs.slice(0, 2)) leg(u, w);
      // the far ear and the tail behind, then the body: five frilly bands from the belly over the back
      ear(p, v, bx - 0.74, y + 0.1, 2.2, 0.95, 0.34, mix(head, t.shadeTint, 0.25));
      tail(p, v, t, bx + a - 0.04, y, 1.55, bands);
      barrel(p, v, bx, y, cz, a, ry, rz, [...bands].reverse());
      for (const [u, w] of legs.slice(2)) leg(u, w);
      // the neck with a mane of fringe, and a big head with long ears
      const hx = bx - 0.98, hz = 2.12;
      slab(p, v, bx, y - 0.02, 0.17, [[-0.82, 1.2], [-0.42, 1.42], [-0.66, 2.2], [-1.06, 2.02]], mix(bands[1], WHITE, 0.35), bands[1]);
      const mane: Pt[] = [];
      for (let k = 0; k <= 6; k++) { const u = k / 6; mane.push([-0.72 + u * 0.32 + (k % 2 ? 0.13 : 0), 2.32 - u * 0.9]); }
      mane.push([-0.36, 1.4], [-0.5, 1.36]);
      p.face(xz(v, bx, y - 0.19, mane), hitW(t.accent), { line: 0.35 });
      const tilt = -0.42, hd = blob(0, 0, 0.44, 0.29, 28, 2.6).map(([u, z]): Pt => [hx + u * Math.cos(tilt) - z * Math.sin(tilt), hz + u * Math.sin(tilt) + z * Math.cos(tilt)]);
      slab(p, v, 0, y - 0.02, 0.18, hd, mix(head, WHITE, 0.3), head);
      p.face(xz(v, hx - 0.26, y - 0.21, blob(0, hz - 0.16, 0.19, 0.16, 18, 2.4)), mix(head, WHITE, 0.55), { sil: false, line: 0.3 });
      ear(p, v, hx + 0.1, y - 0.18, 2.22, 1.0, 0.2, head);
      // the face: an eye with a lash, a nostril, a smile and a blush
      const at = (u: number, z: number) => P(v, hx + u, y - 0.21, z);
      const [ex, ey] = at(0.06, hz + 0.1), [nx, ny] = at(-0.36, hz - 0.11), [mx, my] = at(-0.2, hz - 0.27), [cx, cy] = at(0.12, hz - 0.12);
      p.op((g) => {
        g.ellipse(cx, cy, S * 0.12, S * 0.07).fill({ color: t.accent, alpha: 0.5 });
        g.circle(ex, ey, S * 0.1).fill(t.ink);
        g.circle(ex - S * 0.035, ey - S * 0.035, S * 0.035).fill(WHITE);
        g.moveTo(ex + S * 0.05, ey - S * 0.08).lineTo(ex + S * 0.14, ey - S * 0.16).stroke({ width: v.lw * 0.45, color: t.ink, cap: 'round' });
        g.circle(nx, ny, S * 0.04).fill(t.ink);
        g.moveTo(mx - S * 0.11, my - S * 0.03).quadraticCurveTo(mx, my + S * 0.07, mx + S * 0.11, my - S * 0.04).stroke({ width: v.lw * 0.45, color: t.ink, cap: 'round' });
      });
      // cracks across its flank, one per fifth of its health gone
      for (let i = 0; i < Math.min(4, st.seg ?? 0); i++) {
        const u0 = -0.45 + i * 0.32, z0 = cz + 0.18 - (i % 2) * 0.3;
        const pts = [0, 1, 2, 3].map((k) => P(v, bx + u0 + k * 0.08, y - ry, z0 - k * 0.11 + (k % 2) * 0.07));
        p.op((g) => { g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.stroke({ width: v.lw * 0.6, color: t.ink, cap: 'round', join: 'round' }); });
      }
      break;
    }
    case 'wizard': {
      // the Wizard Lamp: a round floor insert, a ring of segments (one per part type to hit) round a wizard's hat;
      // a segment lights for each type the ball has hit, and in WIZARD MODE they all blaze in rainbow colours
      const need = Math.max(1, st.bright ?? 6), lit = st.seg ?? 0, c = t.role.wizard, rainbow = ['#ff5d8f', '#ff9f1c', '#ffd23f', '#55d08f', '#3cc3b1', '#62b8ff', '#8a63f2', '#ff7fb0'];
      p.face(ring(x, y, r, 36).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, r * 0.9, 36).map(([a, b]) => P(v, a, b, 0.02)), mix(c, t.shadeTint, 0.55), { line: 0.35, sil: false });
      for (let i = 0; i < need; i++) {
        const a0 = Math.PI / 2 - (i / need) * Math.PI * 2 - 0.05, a1 = a0 - (Math.PI * 2) / need + 0.1;
        const arc = (rr: number, from: number, to: number) => Array.from({ length: 6 }, (_, k) => { const a = from + ((to - from) * k) / 5; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as Pt; });
        const wedge = [...arc(r * 0.84, a0, a1), ...arc(r * 0.5, a1, a0)].map(([a, b]) => P(v, a, b, 0.03));
        const on = st.lit || i < lit;
        p.face(wedge, on ? (st.lit ? rainbow[i % rainbow.length] : mix(c, WHITE, 0.35)) : mix(c, t.ink, 0.35), { line: 0.3, sil: false });
      }
      // the hat: a cone with a star on it
      const hat = mat(t, st.hit ? mix(c, WHITE, 0.35) : c);
      p.face(ring(x, y, r * 0.42, 20, r * 0.36).map(([a, b]) => P(v, a, b, 0.05)), hat.shade, { line: 0.4 });
      p.face(hull([...ring(x, y, r * 0.3, 16).map(([a, b]) => P(v, a, b, 0.08)), P(v, x + r * 0.08, y + r * 0.05, 1.5)]), hat.base);
      const [sx, sy] = P(v, x - r * 0.05, y - r * 0.05, 0.6);
      p.op((g) => g.star(sx, sy, 5, S * 0.18, S * 0.08).fill(t.role.goldleaf).stroke({ width: v.lw * 0.4, color: t.ink, join: 'round' }));
      break;
    }
    case 'clock': {
      // a mantel clock: a wooden case on a plinth, a round face on its front; the hands creep from 9 to midnight
      shadow(under, v, t, x, y, r * 1.0, r * 0.75);
      const wood = mat(t, t.role.clock), hw = r * 0.62, d = r * 0.42;
      p.prism(box(x, y, hw + 0.12, d + 0.1, 0), 0, 0.25, mat(t, mix(t.role.clock, t.ink, 0.25)));
      p.prism(box(x, y, hw, d, 0), 0.25, 2.3, wood);
      // a rounded top
      p.face(hull([0, 0.35, 0.7, 1].flatMap((u) => [P(v, x - hw * Math.cos((u * Math.PI) / 2), y - d, 2.55 + Math.sin((u * Math.PI) / 2) * 0.55), P(v, x + hw * Math.cos((u * Math.PI) / 2), y - d, 2.55 + Math.sin((u * Math.PI) / 2) * 0.55)])), wood.base);
      const R = hw * 0.78, zc = 1.75, tall = 1.9;
      const disc = (k: number): Pt[] => Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return P(v, x + Math.cos(a) * R * k, y - d - 0.02, zc + Math.sin(a) * R * k * tall); });
      p.face(disc(1), st.lit ? mix(t.accent, WHITE, 0.5) : t.paper, { line: 0.5 });
      const seg = st.seg ?? 0, hour = Math.PI - (seg / 12) * (Math.PI / 2), minute = Math.PI / 2 - ((seg % 4) / 4) * Math.PI * 2;
      const hand = (a: number, k: number, w: number) => {
        const [cx, cy] = P(v, x, y - d - 0.03, zc), [hx, hy] = P(v, x + Math.cos(a) * R * k, y - d - 0.03, zc + Math.sin(a) * R * k * tall);
        p.op((g) => g.moveTo(cx, cy).lineTo(hx, hy).stroke({ width: w, color: t.ink, cap: 'round' }));
      };
      hand(seg >= 12 ? Math.PI / 2 : hour, 0.55, v.lw * 1.2);
      hand(minute, 0.85, v.lw * 0.8);
      if (st.lit) { const [sx, sy] = P(v, x + hw * 0.9, y - d, 3.2); p.op((g) => g.star(sx, sy, 8, S * 0.55, S * 0.22).fill(t.accent).stroke({ width: v.lw * 0.6, color: t.ink, join: 'round' })); }
      break;
    }
    case 'altar': {
      // a stone altar: a carved block with eight runes (they light up as sets are completed) and two candles
      shadow(under, v, t, x, y, r * 1.05, r * 0.8);
      const stone = mat(t, t.role.altar), hw = r * 0.85, d = r * 0.5;
      p.prism(box(x, y, hw + 0.1, d + 0.1, 0), 0, 0.3, mat(t, mix(t.role.altar, t.ink, 0.3)));
      p.prism(box(x, y, hw, d, 0), 0.3, 1.25, stone);
      p.prism(box(x, y, hw + 0.15, d + 0.12, 0), 1.55, 0.25, mat(t, mix(t.role.altar, WHITE, 0.15)));
      const on = st.seg ?? 0;
      for (let i = 0; i < 8; i++) {
        const [rx, ry] = P(v, x - hw * 0.8 + (i * hw * 1.6) / 7, y - d - 0.02, 0.92 + (i % 2) * 0.22);
        const lit = st.lit || i < on;
        p.op((g) => g.circle(rx, ry, S * 0.1).fill(lit ? t.accent : mix(t.role.altar, t.ink, 0.45)).stroke({ width: v.lw * 0.4, color: t.ink }));
      }
      for (const dx of [-hw * 0.55, hw * 0.55]) {
        p.cyl(x + dx, y, 0.16, 1.8, 0.75, mat(t, t.paper), { n: 12 });
        const [fx, fy] = P(v, x + dx, y, 2.75);
        const big = st.lit ? 1.6 : 1;
        p.op((g) => {
          g.ellipse(fx, fy - S * 0.12 * big, S * 0.13 * big, S * 0.24 * big).fill(st.lit ? t.accent : t.role.sparkler).stroke({ width: v.lw * 0.5, color: t.ink });
          g.ellipse(fx, fy - S * 0.06 * big, S * 0.05 * big, S * 0.1 * big).fill(WHITE);
        });
      }
      break;
    }
    case 'bulb': {
      // a spare bulb in its cardboard box: the flaps open and the bulb standing up out of it
      shadow(under, v, t, x, y, r * 0.95, r * 0.75);
      const kraft = mat(t, mix('#d9a865', t.shadeTint, 0.08)), hw = 0.6, hd = 0.48, h = 0.72;
      for (const sx of [-1, 1]) p.face([P(v, x + sx * hw, y - hd, h), P(v, x + sx * hw, y + hd, h), P(v, x + sx * (hw + 0.32), y + hd, h + 0.4), P(v, x + sx * (hw + 0.32), y - hd, h + 0.4)], sx < 0 ? kraft.light : kraft.shade, { line: 0.35 });
      p.prism(box(x, y, hw, hd, 0), 0, h, kraft, { top: mix(kraft.base, t.ink, 0.5) });
      p.cyl(x, y, 0.2, h - 0.2, 0.34, metal, { n: 16 });
      for (let i = 0; i < 2; i++) p.cyl(x, y, 0.22, h - 0.08 + i * 0.1, 0.04, mat(t, mix(t.metal, t.ink, 0.3)), { n: 16 });
      egg(p, v, x, y, h + 0.68, 0.46, 0.46, 0.48, 0, mat(t, t.role.bulb));
      p.face([P(v, x - hw, y - hd, 0), P(v, x + hw, y - hd, 0), P(v, x + hw, y - hd, h), P(v, x - hw, y - hd, h)], kraft.mid, { sil: false, line: 0.35 });
      const [LX, LY] = P(v, x, y - hd, h * 0.48);
      p.op((g) => {
        g.roundRect(LX - S * 0.3, LY - S * 0.17, S * 0.6, S * 0.34, S * 0.06).fill(t.paper).stroke({ width: v.lw * 0.4, color: t.ink });
        g.circle(LX, LY - S * 0.03, S * 0.09).fill(t.role.bulb).stroke({ width: v.lw * 0.35, color: t.ink });
        g.rect(LX - S * 0.04, LY + S * 0.06, S * 0.08, S * 0.06).fill(t.ink);
      });
      break;
    }
    case 'feet': {
      // a rubber foot: a fat black stopper with a ribbed rim
      shadow(under, v, t, x, y, r * 0.95, r * 0.95);
      const rubber = mat(t, t.role.feet);
      p.cyl(x, y, r * 0.85, 0, 0.35, rubber);
      p.cyl(x, y, r * 0.7, 0.35, 0.3, mat(t, mix(t.role.feet, WHITE, 0.15)));
      p.cyl(x, y, r * 0.3, 0.65, 0.12, metal);
      break;
    }
    case 'tray': {
      // a coin tray: a shallow brass dish with a little pile of coins in it
      shadow(under, v, t, x, y, r * 1.0, r * 0.8);
      const brass = mat(t, t.role.tray);
      p.prism(box(x, y, r * 0.9, r * 0.6, 0, 0.25), 0, 0.3, brass);
      p.face(box(x, y, r * 0.72, r * 0.45, 0, 0.2).map(([a, b]) => P(v, a, b, 0.3)), brass.shade, { sil: false, line: 0.35 });
      for (const [dx, dy, n] of [[-0.25, 0.05, 3], [0.25, -0.05, 2]] as const) for (let i = 0; i < n; i++) p.cyl(x + dx * r, y + dy * r, r * 0.26, 0.22 + i * 0.1, 0.08, mat(t, t.role.coin), { n: 16 });
      break;
    }
    case 'mirror': {
      // a side mirror on a stalk: a round glass in a frame, catching the light
      shadow(under, v, t, x, y, r * 0.8, r * 0.6);
      p.cyl(x, y, r * 0.55, 0, 0.18, metal);
      p.cyl(x, y, 0.1, 0.18, 1.1, metal, { n: 10 });
      const R = r * 0.7, zc = 2.0, tall = 1.8;
      const disc = (k: number): Pt[] => Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return P(v, x + Math.cos(a) * R * k, y - 0.05, zc + Math.sin(a) * R * k * tall); });
      p.face(disc(1), t.role.mirror === undefined ? t.metal : mix(t.metal, t.ink, 0.2), { line: 0.5 });
      p.face(disc(0.8), t.role.mirror, { sil: false, line: 0.3 });
      const [gx, gy] = P(v, x - R * 0.3, y - 0.06, zc + R * 0.6);
      p.op((g) => g.moveTo(gx, gy).lineTo(gx + S * 0.25, gy + S * 0.3).stroke({ width: v.lw * 0.9, color: WHITE, cap: 'round' }));
      break;
    }
    case 'tesla': {
      // a Tesla coil: a copper winding on a bumper skirt, under a round terminal that crackles when hit
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const top = st.hit ? mat(t, mix(t.role.tesla, WHITE, 0.55)) : role;
      p.cyl(x, y, r, 0, 0.16, mat(t, t.paper));
      p.cyl(x, y, r * 0.5, 0.16, 0.12, metal);
      // the winding: copper turns with a thin dark gap between each
      const copper = mat(t, mix(t.role.coin, t.accent, 0.4));
      for (let i = 0; i < 6; i++) p.cyl(x, y, r * (0.5 - i * 0.025), 0.28 + i * 0.17, 0.13, copper);
      // the terminal: a fat ring (a toroid) in the coil's colour
      const z0 = 1.35;
      const tor = [[0, 0.5], [0.3, 0.78], [0.6, 0.8], [1, 0.55]] as const;
      p.face(hull(tor.flatMap(([u, k]) => ring(x, y, r * k, 26).map(([a, b]) => P(v, a, b, z0 + u * 0.5)))), top.base);
      p.face(ring(x, y, r * 0.3, 18).map(([a, b]) => P(v, a, b, z0 + 0.5)), top.shade, { sil: false, line: 0.35 });
      p.face(ring(x - r * 0.4, y + r * 0.15, r * 0.12, 12).map(([a, b]) => P(v, a, b, z0 + 0.42)), top.light, { sil: false, line: 0 });
      break;
    }
    case 'bell': {
      // an old bronze bell hung in a wooden yoke; three pips on its skirt count the notches. Rung this round, it goes dull
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const quiet = st.lit === false;
      const bronze = st.hit ? mat(t, mix(t.role.bell, WHITE, 0.4)) : quiet ? mat(t, mix(t.role.bell, t.shadeTint, 0.45)) : role;
      p.cyl(x, y, r, 0, 0.16, mat(t, t.paper));
      const wood = mat(t, t.rim);
      p.cyl(x - r * 0.9, y + r * 0.2, 0.14, 0.16, 2.2, wood);
      // a real bell's profile: a flared lip, a waist, a round shoulder
      const H = 1.7, prof = [[0, 0.92], [0.06, 0.8], [0.2, 0.62], [0.5, 0.52], [0.78, 0.5], [0.92, 0.4], [1, 0.22]] as const;
      const pts = prof.flatMap(([u, k]) => ring(x, y, r * k, 26).map(([a, b]) => P(v, a, b, 0.28 + u * H)));
      p.cyl(x, y, r * 0.94, 0.16, 0.14, mat(t, bronze.shade)); // the lip, under the body
      p.face(hull(pts), bronze.base);
      p.face(ring(x - r * 0.22, y + r * 0.1, r * 0.12, 12).map(([a, b]) => P(v, a, b, 0.28 + 0.8 * H)), WHITE, { sil: false, line: 0 });
      p.cyl(x, y, 0.15, 0.28 + H, 0.3, metal);
      p.cyl(x + r * 0.9, y + r * 0.2, 0.14, 0.16, 2.2, wood);
      const notches = PARTS.bell.recipe.bell!.notches;
      p.op((g) => {
        const [ax, ay] = P(v, x - r * 0.9, y + r * 0.2, 2.3), [bx, by] = P(v, x + r * 0.9, y + r * 0.2, 2.3);
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: v.S * 0.2 + v.lw, color: t.ink, cap: 'round' });
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: v.S * 0.2, color: t.rim, cap: 'round' });
        for (let i = 0; i < notches; i++) {
          const a = -Math.PI / 2 + (i - (notches - 1) / 2) * 0.55;
          const [X, Y] = P(v, x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94, 0.17);
          g.circle(X, Y, v.S * 0.15).fill(i < (st.seg ?? 0) ? t.role.golden : mix(t.paper, t.shadeTint, 0.5)).stroke({ width: v.lw * 0.45, color: t.ink });
        }
      });
      break;
    }
    case 'trophy': {
      // a trophy cup on a wooden plinth: a stem, a tall bowl with a star on it and two handles
      shadow(under, v, t, x, y, r * 1.0, r * 0.85);
      const cup = st.hit ? mat(t, mix(t.role.trophy, WHITE, 0.45)) : role, pw = r * 0.62, pd = r * 0.5;
      p.prism(box(x, y, pw, pd, 0, 0.06), 0, 0.4, mat(t, mix(t.rim, t.ink, 0.4)));
      p.cyl(x, y, r * 0.36, 0.4, 0.1, cup);
      p.cyl(x, y, 0.09, 0.5, 0.3, cup, { n: 12 });
      p.cyl(x, y, 0.16, 0.72, 0.08, cup, { n: 14 });
      // the handles first, so the bowl sits over their roots
      p.op((g) => {
        for (const sx of [-1, 1]) {
          const a = P(v, x + sx * r * 0.5, y, 1.86), b = P(v, x + sx * r * 1.02, y, 1.86), c2 = P(v, x + sx * r * 0.9, y, 1.2), d = P(v, x + sx * r * 0.36, y, 1.1);
          for (const [w, col] of [[S * 0.13 + v.lw * 1.6, t.ink], [S * 0.13, cup.mid]] as const) g.moveTo(a[0], a[1]).bezierCurveTo(b[0], b[1], c2[0], c2[1], d[0], d[1]).stroke({ width: w, color: col, cap: 'round' });
        }
      });
      const bowl = [0, 0.15, 0.35, 0.6, 0.8, 1].flatMap((u) => ring(x, y, r * (0.2 + 0.46 * Math.sqrt(u)), 26).map(([a, b]) => P(v, a, b, 0.8 + u * 1.25)));
      const H = hull(bowl), [cx] = P(v, x, y, 1);
      p.face(H, cup.base);
      const sh = hull(bowl.filter((q) => q[0] > cx + r * 0.34 * S));
      if (sh.length > 2) p.face(sh, cup.shade, { sil: false, line: 0 });
      p.face(H, null, { sil: false });
      const lid = [0, 0.4, 0.75, 1].flatMap((u) => ring(x, y, r * 0.68 * Math.cos((u * Math.PI) / 2.2), 24).map(([a, b]) => P(v, a, b, 2.05 + u * 0.38)));
      p.face(hull(lid), cup.light);
      p.face(ring(x, y, r * 0.7, 24).map(([a, b]) => P(v, a, b, 2.05)), null, { sil: false, line: 0.4 });
      p.cyl(x, y, 0.06, 2.4, 0.16, cup, { n: 8 });
      egg(p, v, x, y, 2.66, 0.14, 0.14, 0.12, 0, cup);
      p.face(star(0, 0, 0.24, 0.1, 5, -Math.PI / 2).map(([a, b]) => P(v, x + a, y - r * 0.55, 1.45 - b)), t.role.coin, { sil: false, line: 0.4 });
      const [hx, hy] = P(v, x - r * 0.42, y, 1.4);
      p.op((g) => g.moveTo(hx, hy + S * 0.2).quadraticCurveTo(hx - S * 0.04, hy - S * 0.05, hx + S * 0.04, hy - S * 0.24).stroke({ width: S * 0.09, color: WHITE, cap: 'round', alpha: 0.85 }));
      break;
    }
    case 'thunder': {
      // a big wedge pointing up the table, with a bolt on its face: it throws the ball upwards
      const sh = def.shape.type === 'tri' ? def.shape : { hw: 1.7, hh: 1.4 };
      const tri = (k: number, dz = 0): Pt[] => [[x - sh.hw * k, y - sh.hh * k + dz], [x + sh.hw * k, y - sh.hh * k + dz], [x, y + sh.hh * k + dz]];
      shadowPoly(under, v, t, tri(1.05), 0.24);
      const body = st.hit ? mat(t, mix(t.role.thunder, WHITE, 0.45)) : role;
      p.prism(tri(1), 0, 0.3, mat(t, t.paper));
      p.prism(tri(0.84), 0.3, 0.6, body);
      const bolt: Pt[] = [[-0.25, 0.75], [0.3, 0.75], [0.02, 0.12], [0.4, 0.12], [-0.3, -0.85], [-0.05, -0.12], [-0.42, -0.12]];
      p.face(bolt.map(([a, b]) => P(v, x + a * sh.hh * 0.55, y - sh.hh * 0.15 + b * sh.hh * 0.55, 0.91)), t.role.coin, { sil: false, line: 0.5 });
      break;
    }
    case 'golden': {
      // solid gold with a star
      shadow(under, v, t, x, y, r * 1.05, r * 1.05, 0.24);
      const c = t.role[id];
      const cap = st.hit ? mat(t, mix(c, WHITE, 0.45)) : role;
      p.cyl(x, y, r, 0, 0.2, mat(t, id === 'golden' ? mix(c, t.shadeTint, 0.3) : t.paper));
      p.cyl(x, y, r * 0.66, 0.2, 0.55, id === 'golden' ? mat(t, mix(c, WHITE, 0.2)) : metal);
      const top = p.cyl(x, y, r * 0.9, 0.75, 0.3, cap);
      void top;
      p.face(star(x, y, r * 0.62, r * 0.28, 5, Math.PI / 2).map(([a, b]) => P(v, a, b, 1.06)), WHITE, { sil: false, line: 0.5 });
      break;
    }
    case 'piggy': {
      // a piggy bank: a round pink pig on four trotters, its face turned to you, a coin slot in its back that fills
      // with gold the more it holds
      const c = Math.cos(angle), s = Math.sin(angle), L = (lx: number, ly: number): Pt => [x + lx * c - ly * s, y + lx * s + ly * c];
      const pink = mat(t, st.hit ? mix(t.role.piggy, WHITE, 0.4) : t.role.piggy);
      shadow(under, v, t, x, y, 1.15, 0.62);
      const legs = ([[-0.5, 0.24], [0.52, 0.24], [-0.5, -0.24], [0.52, -0.24]] as Pt[]).map(([a, b]) => L(a, b)).sort((a, b) => b[1] - a[1]);
      for (const [lx, ly] of legs) p.cyl(lx, ly, 0.16, 0, 0.42, mat(t, pink.mid), { n: 14 });
      // a curly tail at the back
      const [tx, ty] = L(1.0, 0), [TX, TY] = P(v, tx, ty, 0.95);
      p.op((g) => {
        for (const [w, col] of [[v.lw * 1.6 + S * 0.07, t.ink], [S * 0.07, pink.base]] as const) {
          g.moveTo(TX - S * 0.1, TY).bezierCurveTo(TX + S * 0.3, TY - S * 0.05, TX + S * 0.25, TY - S * 0.35, TX + S * 0.1, TY - S * 0.28).bezierCurveTo(TX - S * 0.02, TY - S * 0.22, TX + S * 0.12, TY - S * 0.05, TX + S * 0.32, TY - S * 0.12);
          g.stroke({ width: w, color: col, cap: 'round', join: 'round' });
        }
      });
      egg(p, v, x, y, 0.82, 0.95, 0.52, 0.55, angle, pink);
      // the coin slot on its back; as it fills, a gold coin rises out of it
      const full = Math.min(1, (st.seg ?? 0) / 6);
      const slot = box(...L(0.1, 0), 0.07, 0.3, angle).map(([a, b]) => P(v, a, b, 1.37));
      if (full > 0) {
        const [CX, CY] = P(v, ...L(0.1, 0), 1.37 + full * 0.3);
        p.op((g) => g.ellipse(CX, CY, S * 0.2, S * 0.24).fill(t.role.coin).stroke({ width: v.lw * 0.6, color: t.ink }));
      }
      p.face(slot, t.ink, { sil: false, line: 0.3 });
      // the head: ears up, eyes, and a snout with two nostrils, all looking at you
      const [hx, hy] = L(-0.74, -0.08);
      for (const sx of [-1, 1]) p.face(xz(v, hx + sx * 0.24, hy + 0.08, [[-0.2, 1.2], [0.2, 1.24], [sx * 0.16, 1.74]]), pink.mid, { line: 0.4 });
      egg(p, v, hx, hy, 1.0, 0.44, 0.42, 0.4, 0, pink);
      tube(p, v, hx, hy - 0.4, 0.92, 0.24, 0.26, 0.5, pink, mix(pink.base, WHITE, 0.25));
      const [nx, ny] = P(v, hx, hy - 0.4 - 0.13 * Math.cos(0.5), 0.92 + 0.13 * Math.sin(0.5)), [ex, ey] = P(v, hx, hy - 0.34, 1.2), [bx, by] = P(v, hx, hy - 0.4, 0.86);
      p.op((g) => {
        for (const k of [-1, 1]) {
          g.ellipse(nx + k * S * 0.08, ny, S * 0.04, S * 0.065).fill(t.ink);
          g.circle(ex + k * S * 0.17, ey, S * 0.065).fill(t.ink);
          g.circle(ex + k * S * 0.17 - S * 0.02, ey - S * 0.025, S * 0.022).fill(WHITE);
          g.ellipse(bx + k * S * 0.3, by, S * 0.09, S * 0.05).fill({ color: t.accent, alpha: 0.45 });
        }
      });
      break;
    }
    case 'magnet': {
      // a horseshoe magnet on a floor plate, its silver tips aimed where it throws; busy, the field lines crackle
      const c = Math.cos(angle), s = Math.sin(angle), L = (lx: number, ly: number): Pt => [x + lx * c - ly * s, y + lx * s + ly * c];
      aimArrow(p, v, t, x, y, angle, r + 0.2, t.role.magnet);
      p.face(ring(x, y, r, 28).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, r * 0.8, 28).map(([a, b]) => P(v, a, b, 0.02)), st.busy ? mix(t.role.magnet, WHITE, 0.5) : mix(t.role.magnet, t.shadeTint, 0.55), { line: 0.3, sil: false });
      const ro = 0.64, ri = 0.3, cy = -0.05, legY = 0.42, shoe: Pt[] = [];
      shoe.push([ro, legY], [ro, cy]);
      for (let i = 1; i < 12; i++) { const a = -(i / 12) * Math.PI; shoe.push([Math.cos(a) * ro, cy + Math.sin(a) * ro]); }
      shoe.push([-ro, cy], [-ro, legY], [-ri, legY], [-ri, cy]);
      for (let i = 11; i > 0; i--) { const a = -(i / 12) * Math.PI; shoe.push([Math.cos(a) * ri, cy + Math.sin(a) * ri]); }
      shoe.push([ri, cy], [ri, legY]);
      p.prism(shoe.map(([a, b]) => L(a, b)), 0.02, 0.6, mat(t, t.role.magnet));
      for (const sd of [-1, 1]) p.prism(box(...L(sd * (ro + ri) / 2, legY + 0.13), (ro - ri) / 2, 0.13, angle), 0.02, 0.6, metal);
      if (st.busy) {
        const [ax, ay] = P(v, ...L(-0.47, 0.75), 0.4), [bx, by] = P(v, ...L(0.47, 0.75), 0.4), [mx, my] = P(v, ...L(0, 1.2), 0.4);
        p.op((g) => g.moveTo(ax, ay).quadraticCurveTo(mx, my - S * 0.3, bx, by).stroke({ width: v.lw * 0.6, color: t.ink, cap: 'round' }));
      }
      break;
    }
    case 'jackpot': {
      // a scoop: a dark hole in a gold ring, the pot's arrow, and a crown on the back wall
      aimArrow(p, v, t, x, y, angle, r + 0.25, t.role.jackpot);
      shadow(under, v, t, x, y, r, r);
      p.cyl(x, y, r, 0, 0.32, mat(t, t.role.jackpot));
      p.face(ring(x, y, r * 0.72, 26).map(([a, b]) => P(v, a, b, 0.33)), st.busy ? mix(t.role.jackpot, WHITE, 0.6) : t.ink, { sil: false, line: 0.4 });
      p.face(ring(x, y, r * 0.86, 26).map(([a, b]) => P(v, a, b, 0.33)), null, { sil: false, line: 0.3 });
      const back = -Math.sin(angle) * -1, backy = -Math.cos(angle);
      const crown: Pt[] = [[-0.55, 0], [-0.55, 0.45], [-0.28, 0.2], [0, 0.55], [0.28, 0.2], [0.55, 0.45], [0.55, 0]];
      const [CX, CY] = P(v, x + back * r * 0.95, y + backy * r * 0.95, 0.35);
      p.op((g) => {
        g.poly(crown.flatMap(([a, b]) => [CX + a * v.S, CY - b * v.S * 1.1])).fill(t.role.coin).stroke({ width: v.lw * 0.5, color: t.ink, join: 'round' });
      });
      break;
    }
    case 'xlane': {
      // a big rollover insert with an X on it: lit while it is ready to multiply
      const lit = !!st.lit, c = t.role.xlane;
      p.face(ring(x, y, r, 30).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, r * 0.82, 30).map(([a, b]) => P(v, a, b, 0.02)), lit ? mix(c, WHITE, 0.3) : mix(c, t.shadeTint, 0.6), { line: 0.4, sil: false });
      for (const s2 of [-1, 1]) p.cyl(x + s2 * r * 1.0, y, 0.17, 0, 0.55, metal);
      p.draw(body);
      const [LX, LY] = P(v, x, y, 0.02);
      const L = label('×', S * 1.6, lit ? t.ink : mix(c, t.shadeTint, 0.9), lit ? { stroke: t.paper, strokeW: v.lw * 0.9 } : {});
      L.position.set(LX, LY);
      L.scale.y = Math.max(0.6, v.k);
      out.addChild(L);
      return out;
    }
    case 'fame': {
      // a star plaque set in the floor under a little marquee of bulbs: lit until it has fired this ball
      const lit = st.lit !== false, c = t.role.fame;
      p.face(ring(x, y, r, 30).map(([a, b]) => P(v, a, b, 0.01)), lit ? mix(c, WHITE, 0.25) : mix(c, t.shadeTint, 0.6), { line: 0.4 });
      p.face(ring(x, y, r * 0.72, 26).map(([a, b]) => P(v, a, b, 0.015)), lit ? mix(t.paper, c, 0.2) : mix(t.paper, t.shadeTint, 0.5), { line: 0.3, sil: false });
      p.face(star(x, y, r * 0.6, r * 0.26, 5, Math.PI / 2).map(([a, b]) => P(v, a, b, 0.02)), lit ? c : mix(c, t.shadeTint, 0.5), { line: 0.45, sil: false });
      p.op((g) => {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const [X, Y] = P(v, x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, 0.03);
          g.circle(X, Y, v.S * 0.08).fill(lit ? WHITE : mix(c, t.shadeTint, 0.6)).stroke({ width: v.lw * 0.25, color: t.ink });
        }
      });
      break;
    }
    case 'disco': {
      // a mirror ball on a post over a floor insert: it sparkles until it has fired this ball
      const lit = st.lit !== false, c = t.role.disco;
      p.face(ring(x, y, r, 30).map(([a, b]) => P(v, a, b, 0.01)), lit ? mix(t.accent, WHITE, 0.3) : mix(t.accent, t.shadeTint, 0.6), { line: 0.4 });
      p.cyl(x, y, 0.12, 0.01, 1.2, metal);
      const [BX, BY] = P(v, x, y, 2.0), R2 = r * 0.7 * S;
      p.silhouette(ringS(BX, BY, R2, 28));
      p.op((g) => {
        g.circle(BX, BY, R2).fill(lit ? c : mix(c, t.shadeTint, 0.5));
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
          const fx = BX + (i * R2) / 3.6, fy = BY + (j * R2) / 3.6;
          if (Math.hypot(fx - BX, fy - BY) > R2 * 0.86) continue;
          if ((i + j) % 2 === 0) g.rect(fx - R2 * 0.1, fy - R2 * 0.1, R2 * 0.2, R2 * 0.2).fill(lit ? WHITE : mix(c, t.shadeTint, 0.3));
        }
        g.circle(BX, BY, R2).stroke({ width: v.lw * 0.5, color: t.ink });
        g.circle(BX - R2 * 0.35, BY - R2 * 0.35, R2 * 0.16).fill(WHITE);
      });
      break;
    }
    case 'flipper': case 'flipperR': {
      // the extra flipper itself is drawn live from the sim; the part shows its mounting plate
      p.cyl(x, y, 0.55, 0, 0.08, metal);
      break;
    }
    case 'hand': {
      // the Helping Hand is drawn live from the sim too (with its glove, see drawFlipper); its plate is painted its colour
      p.cyl(x, y, 0.55, 0, 0.08, mat(t, t.role.hand));
      break;
    }
    case 'gumball': {
      // a gumball machine: a red cast stand with a coin knob, a glass globe full of gumballs and a red cap; the chute in
      // front is where the ball goes in, and locked balls show as big white balls in the globe
      shadow(under, v, t, x, y, r * 0.9, r * 0.8);
      const red = mat(t, st.hit ? mix(t.role.gumball, WHITE, 0.4) : t.role.gumball);
      p.face(ring(x, y - r * 0.5, r * 0.36, 20, r * 0.28).map(([a, b]) => P(v, a, b, 0.01)), t.ink, { line: 0.4 });
      p.cyl(x, y + 0.12, r * 0.5, 0, 0.18, red);
      p.cyl(x, y + 0.12, r * 0.4, 0.18, 0.78, red);
      const [kx, ky] = P(v, x, y + 0.12 - r * 0.4, 0.62);
      p.op((g) => { g.circle(kx, ky, S * 0.2).fill(t.metal).stroke({ width: v.lw * 0.5, color: t.ink }); g.roundRect(kx - S * 0.05, ky - S * 0.16, S * 0.1, S * 0.32, S * 0.04).fill(mix(t.metal, t.ink, 0.35)); });
      const gz = 1.55, gr = r * 0.6;
      egg(p, v, x, y + 0.12, gz, gr, gr, gr * 0.95, 0, mat(t, mix(t.role.jar, WHITE, 0.55)), false);
      const n = Math.min(3, st.seg ?? 0), cols = ['#ffd23f', '#55d08f', '#62b8ff', '#ff7fb0', '#ff9f1c', '#8a63f2', '#ff5d5d', '#3cc3b1', '#ffd23f'];
      p.op((g) => {
        const spots: [number, number][] = [[-0.45, -0.55], [0, -0.6], [0.45, -0.55], [-0.62, -0.15], [-0.2, -0.2], [0.22, -0.18], [0.62, -0.12], [-0.3, 0.22], [0.3, 0.25]];
        spots.forEach(([a, b], i) => { const [cx, cy] = P(v, x + a * gr, y + 0.12 - gr * 0.5, gz + b * gr); g.circle(cx, cy, S * 0.13).fill(cols[i]).stroke({ width: v.lw * 0.3, color: t.ink }); });
        for (let i = 0; i < n; i++) { const [cx, cy] = P(v, x + (i - (n - 1) / 2) * gr * 0.62, y + 0.12 - gr * 0.6, gz + 0.1); g.circle(cx, cy, S * 0.22).fill(WHITE).stroke({ width: v.lw * 0.6, color: t.ink }); }
        const [hx, hy] = P(v, x - gr * 0.45, y, gz + gr * 0.45);
        g.ellipse(hx, hy, S * 0.12, S * 0.08).fill({ color: WHITE, alpha: 0.9 });
      });
      p.cyl(x, y + 0.12, gr * 0.45, gz + gr * 0.82, 0.18, red);
      p.cyl(x, y + 0.12, 0.08, gz + gr * 0.82 + 0.18, 0.14, red, { n: 10 });
      break;
    }
    case 'ring': {
      // a Bank Ring: a gold hoop standing over the lane; it glows warmer the more heat the ball carries
      const heat = Math.min(5, st.seg ?? 0) / 5, gold = mat(t, mix(t.role.ring, '#ff5d2f', heat * 0.6));
      p.face(ring(x, y, r, 24).map(([a, b]) => P(v, a, b, 0.01)), mix(t.role.ring, t.paper, 0.6), { line: 0.4 });
      p.face(ring(x, y, r * 0.5, 18).map(([a, b]) => P(v, a, b, 0.02)), mix(gold.base, WHITE, 0.25 - heat * 0.25), { line: 0.35 }); // the coin it banks
      const arc = (rr: number) => Array.from({ length: 17 }, (_, i): Pt => { const a = (i / 16) * Math.PI; return P(v, x + Math.cos(a) * rr, y, Math.sin(a) * rr * 2); });
      p.face([...arc(r * 1.0), ...arc(r * 0.68).reverse()], gold.base, { line: 0.5 });
      break;
    }
    case 'wheel': {
      // a Spider Wheel: a scoop under a wheel of eight coloured awards with a spider on the hub; the lit one is where it points
      shadow(under, v, t, x, y, r * 1.0, r * 1.0);
      p.face(ring(x, y - r * 0.5, r * 0.32, 18, r * 0.24).map(([a, b]) => P(v, a, b, 0.01)), t.ink, { line: 0.4 });
      const cols = ['#ff5d8f', '#ffd23f', '#55d08f', '#ff9f1c', '#62b8ff', '#3cc3b1', '#8a63f2', '#b8b2cc'], R = r * 0.85, zc = 1.9, tall = 1.8, on = st.seg ?? -1;
      p.cyl(x - R * 0.9, y + 0.3, 0.1, 0, zc, metal, { n: 8 });
      p.cyl(x + R * 0.9, y + 0.3, 0.1, 0, zc, metal, { n: 8 });
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI / 2 - (i / 8) * Math.PI * 2, a1 = a0 - Math.PI / 4;
        const pts: Pt[] = [P(v, x, y + 0.3, zc)];
        for (let k = 0; k <= 4; k++) { const a = a0 + ((a1 - a0) * k) / 4; pts.push(P(v, x + Math.cos(a) * R, y + 0.3, zc + Math.sin(a) * R * tall)); }
        p.face(pts, st.lit && i === on ? WHITE : i === on ? mix(cols[i], WHITE, 0.4) : cols[i], { line: 0.35 });
      }
      const [hx, hy] = P(v, x, y + 0.3, zc);
      p.op((g) => {
        // the spider on the hub, legs out over the awards
        for (const k of [-1, 1]) for (let l = 0; l < 4; l++) { const a = -0.8 + l * 0.52; g.moveTo(hx, hy).lineTo(hx + k * Math.cos(a) * S * 0.28, hy + Math.sin(a) * S * 0.28 - S * 0.06).lineTo(hx + k * Math.cos(a) * S * 0.45, hy + Math.sin(a) * S * 0.45 + S * 0.05); }
        g.stroke({ width: v.lw * 0.6, color: t.ink, cap: 'round', join: 'round' });
        g.circle(hx, hy, S * 0.2).fill(t.ink);
        for (const k of [-1, 1]) g.circle(hx + k * S * 0.07, hy - S * 0.03, S * 0.05).fill(WHITE);
        g.poly([hx - S * 0.12, hy - R * S * tall * v.kz * 1.05, hx + S * 0.12, hy - R * S * tall * v.kz * 1.05, hx, hy - R * S * tall * v.kz * 0.8]).fill(t.accent).stroke({ width: v.lw * 0.5, color: t.ink }); });
      break;
    }
    case 'duck': case 'roller': case 'goal': case 'bucket': {
      const m = def.mover!, sh = def.shape.type === 'box' ? def.shape : { hw: 3, hh: 0.6 };
      const base = st.part !== 'mover', piece = st.part !== 'base';
      if (base) {
        if (id === 'goal') {
          // a little football goal: posts, a crossbar at the back, the net between
          shadowPoly(under, v, t, box(x, y + 0.45, 2.8, 0.65, 0), 0.2);
          p.face(box(x, y + 0.5, 2.45, 0.42, 0).map(([a, b]) => P(v, a, b, 0.02)), mix(t.paper, t.shadeTint, 0.12), { line: 0.3 });
          p.op((net) => {
            for (let k = -2.2; k <= 2.21; k += 0.55) { const [a, b] = P(v, x + k, y + 0.1, 0.03), [c, d] = P(v, x + k, y + 0.9, 0.03); net.moveTo(a, b).lineTo(c, d); }
            for (let k = 0.2; k <= 0.86; k += 0.22) { const [a, b] = P(v, x - 2.4, y + k, 0.03), [c, d] = P(v, x + 2.4, y + k, 0.03); net.moveTo(a, b).lineTo(c, d); }
            net.stroke({ width: v.lw * 0.35, color: t.ink, alpha: 0.4 });
          });
          p.prism(box(x, y + 0.95, 2.65, 0.14, 0), 0, 0.9, mat(t, WHITE));
          for (const sx of [-1, 1]) p.prism(box(x + sx * 2.55, y + 0.5, 0.14, 0.5, 0), 0, 0.9, mat(t, WHITE));
          p.face(box(x, y - 0.45, m.travel + 0.8, 0.12, 0).map(([a, b]) => P(v, a, b, 0.02)), mix(t.role.goal, t.shadeTint, 0.3), { line: 0.25, sil: false });
        } else {
          // the rail the piece travels: a sunken slot with a bumper stop at each end
          shadowPoly(under, v, t, box(x, y, sh.hw, sh.hh * 0.5, 0, sh.hh * 0.5), 0.15);
          p.face(box(x, y + m.y, sh.hw, sh.hh * 0.55, 0, sh.hh * 0.5).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
          p.face(box(x, y + m.y, sh.hw - 0.2, sh.hh * 0.32, 0, sh.hh * 0.3).map(([a, b]) => P(v, a, b, 0.02)), mix(t.role[id], t.shadeTint, 0.55), { line: 0.3, sil: false });
          for (const sx of [-1, 1]) p.cyl(x + sx * (sh.hw - 0.1), y + m.y, 0.22, 0, 0.45, mat(t, t.rubber));
          if (id === 'duck') for (let k = -2; k <= 2; k++) p.face(ring(x + k * 1.3, y + m.y - sh.hh * 0.75, 0.18, 10).map(([a, b]) => P(v, a, b, 0.02)), t.role.lane, { line: 0.2, sil: false });
        }
      }
      if (piece) {
        const px = x, py = y + m.y;
        if (id === 'duck') {
          // a tin duck: body, head, beak, an eye
          const yel = st.hit ? mat(t, mix(t.role.duck, WHITE, 0.45)) : mat(t, t.role.duck);
          shadow(under, v, t, px, py, 0.65, 0.5);
          p.cyl(px, py, 0.6, 0, 0.55, yel);
          p.cyl(px - 0.12, py + 0.05, 0.34, 0.55, 0.55, yel);
          const [bx, by] = P(v, px - 0.5, py, 0.85);
          const [ex, ey] = P(v, px - 0.2, py, 1.0);
          p.op((g) => {
            g.poly([bx, by - v.S * 0.08, bx - v.S * 0.32, by, bx, by + v.S * 0.1]).fill(t.accent).stroke({ width: v.lw * 0.5, color: t.ink, join: 'round' });
            g.circle(ex, ey, v.S * 0.07).fill(t.ink);
          });
        } else if (id === 'bucket') {
          // a bucket on runners: open at the top, so a ball dropping in is kept
          const pail = mat(t, st.hit ? mix(t.role.bucket, WHITE, 0.4) : t.role.bucket);
          shadow(under, v, t, px, py, 0.9, 0.5);
          p.cyl(px, py, 0.6, 0, 0.75, pail);
          p.cyl(px, py, 0.72, 0.75, 0.12, mat(t, t.metal));
          p.face(ring(px, py, 0.6, 18).map(([a, b]) => P(v, a, b, 0.88)), t.ink, { sil: false, line: 0.3 });
        } else if (id === 'roller') {
          // a pop bumper on wheels
          shadow(under, v, t, px, py, 0.9, 0.9);
          const cap = st.hit ? mat(t, mix(t.role.roller, WHITE, 0.4)) : mat(t, t.role.roller);
          for (const sx of [-1, 1]) p.cyl(px + sx * 0.55, py - 0.45, 0.2, 0, 0.3, mat(t, t.rubber));
          p.cyl(px, py, 0.85, 0.1, 0.16, mat(t, t.paper));
          p.cyl(px, py, 0.5, 0.26, 0.4, metal);
          p.cyl(px, py, 0.75, 0.66, 0.24, cap);
        } else {
          // the goalie: a little keeper in a jersey with big gloves
          const kit = mat(t, t.role.goal);
          shadow(under, v, t, px, py, 0.8, 0.3);
          p.prism(box(px, py, 0.55, 0.2, 0, 0.15), 0, 0.9, kit);
          p.cyl(px, py, 0.26, 0.9, 0.36, mat(t, t.paper));
          for (const sx of [-1, 1]) p.cyl(px + sx * 0.68, py, 0.17, 0.55, 0.3, mat(t, t.accent));
          const [ex, ey] = P(v, px, py - 0.1, 1.1);
          p.op((g) => { for (const k of [-1, 1]) g.circle(ex + k * v.S * 0.09, ey, v.S * 0.045).fill(t.ink); });
        }
      }
      break;
    }
    case 'plate': {
      // a round plate set into the floor: a ring of rivets and a glowing core
      const rr = def.shape.type === 'circle' ? def.shape.r : 1.5;
      p.face(ring(x, y, rr, 30).map(([a, b]) => P(v, a, b, 0.005)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, rr * 0.78, 28).map(([a, b]) => P(v, a, b, 0.01)), mix(t.role.plate, t.shadeTint, 0.35), { line: 0.3, sil: false });
      p.face(ring(x, y, rr * 0.42, 22).map(([a, b]) => P(v, a, b, 0.015)), mix(t.role.plate, WHITE, 0.3), { line: 0.3, sil: false });
      p.op((g) => {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const [X, Y] = P(v, x + Math.cos(a) * rr * 0.9, y + Math.sin(a) * rr * 0.9, 0.02);
          g.circle(X, Y, v.S * 0.07).fill(metal.light).stroke({ width: v.lw * 0.25, color: t.ink });
        }
      });
      break;
    }
    case 'strip': {
      // an LED strip set into the floor: a row of little bulbs, all lit while it parties
      const sh = def.shape.type === 'box' ? def.shape : { hw: 4, hh: 0.45 };
      const lit = !!st.lit;
      p.face(box(x, y, sh.hw, sh.hh, 0, sh.hh).map(([a, b]) => P(v, a, b, 0.005)), metal.mid, { line: 0.4 });
      p.face(box(x, y, sh.hw - 0.15, sh.hh - 0.12, 0, sh.hh - 0.1).map(([a, b]) => P(v, a, b, 0.01)), lit ? mix(t.role.strip, WHITE, 0.25) : mix(t.role.strip, t.shadeTint, 0.65), { line: 0.3, sil: false });
      const hues = [t.role.strip, t.role.coin, t.role.lane, t.role.saver, t.role.printer];
      p.op((g) => {
        for (let i = 0; i < 12; i++) {
          const [X, Y] = P(v, x - sh.hw + 0.45 + i * ((sh.hw * 2 - 0.9) / 11), y, 0.02);
          g.circle(X, Y, v.S * 0.13).fill(lit ? hues[i % hues.length] : mix(hues[i % hues.length], t.shadeTint, 0.7)).stroke({ width: v.lw * 0.3, color: t.ink });
        }
      });
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

/**
 * A gem at (x, y, z), `s` across: a cut stone (an octagon with a bright table), a crinkled square of gold leaf, or
 * a red wax seal with a star pressed in it.
 */
function gemStone(p: Prop, v: View, t: Theme, id: PartId, x: number, y: number, z: number, s: number) {
  const c = t.role[id];
  const at = (pts: Pt[], dz = 0) => pts.map(([a, b]) => P(v, a, b, z + dz));
  if (id === 'goldleaf') {
    const leaf: Pt[] = [[x - s, y - s * 0.7], [x - s * 0.2, y - s * 0.95], [x + s * 0.9, y - s * 0.75], [x + s, y + s * 0.2], [x + s * 0.6, y + s * 0.9], [x - s * 0.5, y + s * 0.8], [x - s * 0.95, y + s * 0.1]];
    p.face(at(leaf), c, { line: 0.4 });
    p.face(at(leaf.map(([a, b]) => [x + (a - x) * 0.45 - s * 0.15, y + (b - y) * 0.45 + s * 0.1] as Pt), 0.01), mix(c, WHITE, 0.55), { sil: false, line: 0 });
  } else if (id === 'redseal') {
    p.face(at(ring(x, y, s, 14).map(([a, b], i) => [x + (a - x) * (i % 2 ? 1 : 0.9), y + (b - y) * (i % 2 ? 1 : 0.9)] as Pt)), c, { line: 0.45 });
    p.face(at(ring(x, y, s * 0.62, 18), 0.01), mix(c, t.ink, 0.25), { sil: false, line: 0.3 });
    p.face(at(star(x, y, s * 0.45, s * 0.2, 5, Math.PI / 2), 0.02), mix(c, WHITE, 0.35), { sil: false, line: 0 });
  } else {
    p.face(at(ring(x, y, s, 8)), mix(c, t.ink, 0.2), { line: 0.45 });
    p.face(at(ring(x, y, s * 0.62, 8), 0.04), c, { sil: false, line: 0.3 });
    p.face(at(ring(x - s * 0.22, y + s * 0.22, s * 0.16, 8), 0.06), WHITE, { sil: false, line: 0 });
  }
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

// ---- cut-out helpers: shapes drawn in the upright x-z plane (a gong, a clock face, a piñata's flank) ----
/** The piñata's paper, the same in every machine (it is a party, not a theme). */
const PINATA = ['#ff5d8f', '#ffd23f', '#3cc3b1', '#62b8ff', '#ff9f1c'];
/** Upright profile points [u, z] standing at depth y, u along x from the anchor. */
const xz = (v: View, x: number, y: number, pts: Pt[]): Pt[] => pts.map(([u, z]) => P(v, x + u, y, z));
/** A rounded box (a superellipse) as a profile: e = 2 is an ellipse, higher is boxier. */
const blob = (cu: number, cz: number, a: number, b: number, n = 24, e = 3): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const q = (i / n) * Math.PI * 2, c = Math.cos(q), s = Math.sin(q);
    return [cu + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), cz + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)];
  });
/**
 * A convex profile with a thickness of 2d: its far copy shows as the top edge (`top`), its near copy is the face.
 * With `front` null only the solid is drawn, so the caller can paint the face itself.
 */
function slab(p: Prop, v: View, x: number, y: number, d: number, prof: Pt[], top: string, front: string | null, line = 0.4): Pt[] {
  const near = xz(v, x, y - d, prof);
  p.face(hull([...xz(v, x, y + d, prof), ...near]), top);
  if (front) p.face(near, front, { sil: false, line });
  return near;
}
/**
 * A paper barrel lying along x (a piñata's body): a rounded box `a` long each way, its cross-section ry deep and rz
 * tall, wrapped in bands of colour from its belly to its back, each with a frilled lower edge hanging over the band
 * below. Only the side the viewer sees is drawn; `bands` limits it to the lowest few (a burst piñata's belly).
 */
function barrel(p: Prop, v: View, x: number, y: number, cz: number, a: number, ry: number, rz: number, cols: string[], bands = cols.length) {
  const lo = Math.atan2(-rz * v.kz, ry * v.k), step = Math.PI / cols.length, n = 16;
  const sq = (u: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 4)), 0.25);
  const at = (u: number, f: number): Pt => { const s = sq(u); return P(v, x + a * u, y - ry * s * Math.cos(f), cz + rz * s * Math.sin(f)); };
  const all: Pt[] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= 8; j++) all.push(at(-1 + (2 * i) / n, lo + (Math.min(bands, cols.length) * step * j) / 8));
  p.face(hull(all), cols[0]);
  for (let b = 0; b < Math.min(bands, cols.length); b++) {
    const f0 = lo + b * step, f1 = f0 + step + (b === cols.length - 1 ? 0.02 : 0), pts: Pt[] = [];
    const torn = b === bands - 1 && bands < cols.length;
    for (let i = 0; i <= n * 2; i++) { const u = -1 + i / n; pts.push(at(u, b === 0 ? f0 : f0 - (i % 2 ? 0.16 : 0))); }
    for (let i = n * 2; i >= 0; i--) { const u = -1 + i / n; pts.push(at(u, torn ? f1 - (i % 2 ? 0.3 : 0) : f1)); }
    p.face(pts, cols[b], { sil: false, line: 0.3 });
  }
}
/**
 * A rounded solid (an egg, a pig's belly, a bulb): an ellipsoid rx by ry by rz centred at (x, y, z), turned by `a`,
 * cel shaded like a cylinder (a shade crescent on the right, a highlight up on the left).
 */
function egg(p: Prop, v: View, x: number, y: number, z: number, rx: number, ry: number, rz: number, a: number, m: Mat, light = true) {
  const c = Math.cos(a), s = Math.sin(a), pts: Pt[] = [];
  for (let i = 0; i < 24; i++) for (let j = -4; j <= 4; j++) {
    const th = (i / 24) * Math.PI * 2, ph = (j / 4) * (Math.PI / 2), lx = rx * Math.cos(th) * Math.cos(ph), ly = ry * Math.sin(th) * Math.cos(ph);
    pts.push(P(v, x + lx * c - ly * s, y + lx * s + ly * c, z + rz * Math.sin(ph)));
  }
  const H = hull(pts), xs = H.map((q) => q[0]), ys = H.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = x1 - x0, h = y1 - y0;
  p.face(H, m.base);
  const sh = hull(pts.filter((q) => q[0] > x0 + w * 0.72));
  if (sh.length > 2) p.face(sh, m.shade, { sil: false, line: 0 });
  if (light) p.op((g) => g.ellipse(x0 + w * 0.3, y0 + h * 0.28, w * 0.12, h * 0.08).fill(m.light));
  p.face(H, null, { sil: false });
  return H;
}
/**
 * A tube pointing at the viewer (a spotlight's can, a gun barrel, a snout): centred at (x, y, z), `len` long, r round,
 * its axis tipped up from the floor by `tilt` so its near face turns towards the camera. Returns the near face.
 */
function tube(p: Prop, v: View, x: number, y: number, z: number, r: number, len: number, tilt: number, m: Mat, face?: string): Pt[] {
  const dy = -Math.cos(tilt), dz = Math.sin(tilt), uy = Math.sin(tilt), uz = Math.cos(tilt);
  const rim = (k: number) => ring(0, 0, r, 22).map(([a, b]) => P(v, x + a, y + dy * k + uy * b, z + dz * k + uz * b));
  const near = rim(len / 2), all = [...rim(-len / 2), ...near], cx = P(v, x, y, z)[0];
  p.face(hull(all), m.mid);
  const sh = hull(all.filter((q) => q[0] > cx + r * v.S * 0.35));
  if (sh.length > 2) p.face(sh, m.shade, { sil: false, line: 0 });
  p.face(near, face ?? m.base, { sil: false, line: 0.4 });
  return near;
}
/** A disc on the near face of a `tube` (a lens, a muzzle, a nostril plate): same axis, `at` along it from the centre. */
const tubeDisc = (v: View, x: number, y: number, z: number, r: number, at: number, tilt: number, du = 0, dw = 0): Pt[] =>
  ring(0, 0, r, 18).map(([a, b]) => P(v, x + du + a, y - Math.cos(tilt) * at + Math.sin(tilt) * (b + dw), z + Math.sin(tilt) * at + Math.cos(tilt) * (b + dw)));
/** A long donkey ear standing up from (x, y, z): a leaf `len` tall, leaning by `lean`, with a paler inside. */
function ear(p: Prop, v: View, x: number, y: number, z: number, len: number, lean: number, c: string) {
  const leaf = (w: number, k: number): Pt[] => [
    ...Array.from({ length: 7 }, (_, i): Pt => { const u = i / 6; return [-w * Math.sin(u * Math.PI) + lean * u * k, z + len * u * k]; }),
    ...Array.from({ length: 5 }, (_, i): Pt => { const u = 1 - (i + 1) / 6; return [w * Math.sin(u * Math.PI) + lean * u * k, z + len * u * k]; }),
  ];
  p.face(xz(v, x, y, leaf(0.16, 1)), c, { line: 0.4 });
  p.face(xz(v, x, y - 0.01, leaf(0.08, 0.8)).map(([a, b]) => [a, b - 0.06 * v.kz * v.S]), mix(c, WHITE, 0.45), { sil: false, line: 0 });
}
/** The piñata's tail: a short stalk and a tassel of paper strips. */
function tail(p: Prop, v: View, t: Theme, x: number, y: number, z: number, cols: string[]) {
  p.face(xz(v, x, y, [[0, z], [0.18, z + 0.04], [0.22, z - 0.12], [0.04, z - 0.14]]), cols[2], { line: 0.35 });
  for (let i = 0; i < 4; i++) {
    const u = 0.16 + i * 0.05;
    p.face(xz(v, x, y - 0.02 * i, [[u - 0.05, z - 0.1], [u + 0.05, z - 0.1], [u + 0.08 + i * 0.02, z - 0.6], [u - 0.01 + i * 0.02, z - 0.62]]), cols[(i + 3) % cols.length], { line: 0.3 });
  }
}
/** A wrapped sweet lying on the floor: a round middle and a twist of paper each side. */
function candy(p: Prop, v: View, t: Theme, x: number, y: number, a: number, c: string) {
  const c0 = Math.cos(a), s0 = Math.sin(a), at = (u: number, w: number) => P(v, x + u * c0 - w * s0, y + u * s0 + w * c0, 0.12);
  p.face([at(-0.2, 0), at(-0.42, 0.14), at(-0.42, -0.14)], mix(c, WHITE, 0.3), { line: 0.35 });
  p.face([at(0.2, 0), at(0.42, 0.14), at(0.42, -0.14)], mix(c, WHITE, 0.3), { line: 0.35 });
  p.face(ring(0, 0, 0.2, 14, 0.15).map(([u, w]) => at(u, w)), c, { line: 0.4 });
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
  } else if (mood === 'blink') {
    // eyes shut for a moment (the menu's Big Boi blinks)
    p.op((g) => { for (const [X, Y] of eyePts) g.moveTo(X - s * 0.17, Y).quadraticCurveTo(X, Y + s * 0.13, X + s * 0.17, Y).stroke({ width: lw * 0.7, color: t.ink, cap: 'round' }); });
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
      case 'happy': case 'blink': g.moveTo(X - s * 0.22, Y).quadraticCurveTo(X, Y + s * 0.28, X + s * 0.22, Y).stroke({ width: lw * 0.6, color: t.ink, cap: 'round' }); break;
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
export function drawFlipper(g: Graphics, v: View, t: Theme, px: number, py: number, angle: number, sign: 1 | -1, length = FLIPPER_LENGTH, hand = false) {
  const p = new Prop(v, t);
  const k = length < FLIPPER_LENGTH ? 0.8 : 1;
  const tip: Pt = [px + Math.cos(angle) * length * sign, py + Math.sin(angle) * length * sign];
  const outline = hull([...ring(px, py, 0.58 * k, 16), ...ring(tip[0], tip[1], 0.28 * k, 12)]);
  const rubber = hull([...ring(px, py, 0.66 * k, 16), ...ring(tip[0], tip[1], 0.36 * k, 12)]);
  shadowPoly(g, v, t, rubber, 0.22);
  p.prism(rubber, 0, 0.28, mat(t, t.role.flipper === t.paper ? t.accent : t.rubber));
  p.prism(outline, 0.28, 0.24, mat(t, hand ? t.role.hand : t.role.flipper));
  p.cyl(px, py, 0.24, 0.52, 0.12, mat(t, t.metal), { n: 16 });
  // a Helping Hand wears a little white glove on its pivot: it flips by itself
  if (hand) {
    const [gx, gy] = P(v, px, py, 0.7), S = v.S;
    p.op((q) => {
      q.roundRect(gx - S * 0.3, gy - S * 0.26, S * 0.5, S * 0.44, S * 0.16).fill(WHITE).stroke({ width: v.lw * 0.6, color: t.ink });
      q.circle(gx + S * 0.3 * sign, gy - S * 0.02, S * 0.13).fill(WHITE).stroke({ width: v.lw * 0.6, color: t.ink });
      for (let i = 0; i < 3; i++) q.moveTo(gx - S * 0.18 + i * S * 0.13, gy - S * 0.24).lineTo(gx - S * 0.18 + i * S * 0.13, gy - S * 0.08).stroke({ width: v.lw * 0.5, color: t.ink });
    });
  }
  p.draw(g);
}

export interface BallWear { core: string; shade: string }
/** The ball: near-white with an ink outline in every theme, the most readable thing on screen. */
export function drawBall(g: Graphics, v: View, t: Theme, x: number, y: number, wear: BallWear, r = BALL_R) {
  const [X, Y] = P(v, x, y, r), R = r * v.S;
  g.circle(X, Y, R + v.lw * 0.8).fill(t.ink);
  g.circle(X, Y, R).fill(wear.shade);
  g.circle(X - R * 0.18, Y - R * 0.18, R * 0.74).fill(wear.core);
  g.ellipse(X - R * 0.35, Y - R * 0.38, R * 0.3, R * 0.2).fill(WHITE);
  g.moveTo(X - R * 0.7, Y + R * 0.2).quadraticCurveTo(X - R * 0.3, Y + R * 0.7, X + R * 0.3, Y + R * 0.65).stroke({ width: R * 0.14, color: t.accent, alpha: 0.6, cap: 'round' });
}
export function ballShadow(g: Graphics, v: View, t: Theme, x: number, y: number, r = BALL_R) {
  shadow(g, v, t, x + 0.15, y - 0.1, r * 0.9, r * 0.7, 0.3);
}

/** A gremlin: a little green imp with big ears and a grin, bobbing as it wanders (drawn live, it moves). */
export function drawGremlin(g: Graphics, v: View, t: Theme, x: number, y: number, bob: number) {
  const z = 0.5 + Math.sin(bob) * 0.15, [X, Y] = P(v, x, y, z), R = 0.55 * v.S, c = t.role.hutch;
  shadow(g, v, t, x, y, 0.5, 0.4, 0.25);
  g.poly([X - R * 0.7, Y - R * 0.3, X - R * 1.5, Y - R * 0.9, X - R * 0.5, Y - R * 0.75]).fill(c).stroke({ width: v.lw * 0.6, color: t.ink, join: 'round' });
  g.poly([X + R * 0.7, Y - R * 0.3, X + R * 1.5, Y - R * 0.9, X + R * 0.5, Y - R * 0.75]).fill(c).stroke({ width: v.lw * 0.6, color: t.ink, join: 'round' });
  g.circle(X, Y, R).fill(c).stroke({ width: v.lw * 0.9, color: t.ink });
  for (const sx of [-1, 1]) { g.circle(X + sx * R * 0.35, Y - R * 0.2, R * 0.26).fill(WHITE).stroke({ width: v.lw * 0.4, color: t.ink }); g.circle(X + sx * R * 0.3, Y - R * 0.15, R * 0.11).fill(t.ink); }
  g.moveTo(X - R * 0.4, Y + R * 0.3).quadraticCurveTo(X, Y + R * 0.65, X + R * 0.4, Y + R * 0.3).stroke({ width: v.lw * 0.6, color: t.ink, cap: 'round' });
}

/** The ground ring under a hit part: sells the contact and stays in the floor plane. */
export function groundRing(g: Graphics, v: View, t: Theme, x: number, y: number, r: number, color: string, w: number, alpha = 1) {
  const pts = flat(ring(x, y, r, 40).map(([a, b]) => P(v, a, b, 0.02)));
  g.poly(pts).stroke({ width: w + v.lw * 1.4, color: t.ink, alpha: 0.9 * alpha });
  g.poly(pts).stroke({ width: w, color, alpha });
}

export { star };
