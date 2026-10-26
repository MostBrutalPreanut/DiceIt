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
    case 'ding': {
      // a brass bell on a bumper skirt: it rings louder the more of the table the ball has seen
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const bell = st.hit ? mat(t, mix(t.role.ding, WHITE, 0.4)) : role;
      p.cyl(x, y, r, 0, 0.16, mat(t, t.paper));
      p.cyl(x, y, r * 0.55, 0.16, 0.3, metal);
      const pts = [0, 0.25, 0.5, 0.75, 1].flatMap((u) => ring(x, y, r * (0.92 - 0.5 * u * u), 26).map(([a, b]) => P(v, a, b, 0.46 + u * 1.0)));
      p.face(hull(pts), bell.base);
      p.face(ring(x, y, r * 0.92, 26).map(([a, b]) => P(v, a, b, 0.46)), bell.shade, { sil: false, line: 0.4 });
      p.face(ring(x - r * 0.2, y + r * 0.1, r * 0.18, 14).map(([a, b]) => P(v, a, b, 1.2)), bell.light, { sil: false, line: 0 });
      p.cyl(x, y, 0.14, 1.46, 0.22, metal);
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
      // a little laser turret: a domed head on a post, one big lens on top; dark while it recharges
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      p.cyl(x, y, r, 0, 0.16, mat(t, t.paper));
      p.cyl(x, y, r * 0.42, 0.16, 0.36, metal);
      const head = st.hit ? mat(t, mix(t.role.laser, WHITE, 0.4)) : role;
      const dome = [0, 0.4, 0.75, 1].flatMap((u) => ring(x, y, r * 0.78 * Math.cos((u * Math.PI) / 2.4), 24).map(([a, b]) => P(v, a, b, 0.52 + u * 0.7)));
      p.face(hull(dome), head.base);
      const ready = st.lit !== false;
      p.face(ring(x, y - r * 0.08, r * 0.3, 18).map(([a, b]) => P(v, a, b, 1.2)), ready ? WHITE : mix(t.role.laser, t.ink, 0.5), { sil: false, line: 0.45 });
      if (ready) p.face(ring(x, y - r * 0.08, r * 0.16, 14).map(([a, b]) => P(v, a, b, 1.22)), t.role.laser, { sil: false, line: 0 });
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
      // a stone arch over a dark hole in the floor: the ball rolls through and the cave answers
      const stone = mat(t, st.hit ? mix(t.role.echo, WHITE, 0.35) : t.role.echo);
      p.face(ring(x, y, r * 0.85, 24, r * 0.6).map(([a, b]) => P(v, a, b, 0.02)), mix(t.ink, t.role.echo, 0.25), { line: 0.4 });
      for (const sx of [-1, 1]) p.prism(box(x + sx * r * 0.8, y, 0.22, 0.3, 0), 0, 1.3, stone);
      const arch = Array.from({ length: 13 }, (_, i): Pt => { const a = Math.PI - (i / 12) * Math.PI; return P(v, x + Math.cos(a) * r * 0.8, y - 0.3, 1.3 + Math.sin(a) * 0.8); });
      const inner = Array.from({ length: 13 }, (_, i): Pt => { const a = (i / 12) * Math.PI; return P(v, x + Math.cos(a) * r * 0.55, y - 0.3, 1.3 + Math.sin(a) * 0.5); });
      p.face([...arch, ...inner], stone.base, { line: 0.45 });
      break;
    }
    case 'spot': {
      // a stage spotlight on a little stand, its lens towards the table; dark while knocked out
      shadow(under, v, t, x, y, r * 1.0, r * 1.0);
      p.cyl(x, y, r * 0.75, 0, 0.16, metal);
      p.cyl(x, y, 0.1, 0.16, 0.55, metal, { n: 10 });
      const head = mat(t, st.hit ? mix(t.ink, WHITE, 0.3) : mix(t.ink, t.metal, 0.35));
      p.cyl(x, y, r * 0.55, 0.71, 0.75, head);
      const lit = st.lit !== false;
      p.face(ring(x, y - r * 0.05, r * 0.42, 20).map(([a, b]) => P(v, a, b, 1.47)), lit ? mix(t.role.spot, WHITE, 0.45) : mix(t.role.spot, t.ink, 0.6), { sil: false, line: 0.4 });
      if (lit) p.face(ring(x - r * 0.12, y + r * 0.05, r * 0.14, 10).map(([a, b]) => P(v, a, b, 1.48)), WHITE, { sil: false, line: 0 });
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
      // a time capsule: a banded steel canister half sunk in the floor; once it is ripe, it twinkles
      shadow(under, v, t, x, y, r * 1.0, r * 1.0);
      const steel = mat(t, t.role.capsule);
      p.cyl(x, y, r * 0.8, 0, 0.9, steel);
      for (const z of [0.25, 0.65]) p.cyl(x, y, r * 0.82, z, 0.08, mat(t, mix(t.role.capsule, t.ink, 0.35)));
      p.face(ring(x, y, r * 0.5, 18).map(([a, b]) => P(v, a, b, 0.92)), mix(t.role.capsule, WHITE, 0.3), { sil: false, line: 0.4 });
      if (st.lit) { const [sx, sy] = P(v, x + r * 0.5, y, 1.6); p.op((g) => g.star(sx, sy, 4, S * 0.45, S * 0.15).fill(WHITE).stroke({ width: v.lw * 0.5, color: t.ink, join: 'round' })); }
      break;
    }
    case 'ice': {
      // an ice sculpture: a faceted crystal on a plinth that gets smaller as it melts, with a puddle round it
      const left = 1 - Math.min(4, st.seg ?? 0) / 5;
      p.face(ring(x, y, r * (1.1 - left * 0.3), 20).map(([a, b]) => P(v, a, b, 0.01)), mix(t.role.ice, t.floor, 0.4), { line: 0.3 });
      p.cyl(x, y, r * 0.6, 0, 0.2, metal);
      const ice = st.hit ? WHITE : t.role.ice, h = 0.6 + 1.6 * left, R = r * (0.35 + 0.35 * left);
      const pts = [...ring(x, y, R, 6).map(([a, b]) => P(v, a, b, 0.2)), ...ring(x, y, R * 0.7, 6).map(([a, b]) => P(v, a, b, 0.2 + h * 0.75)), P(v, x, y, 0.2 + h)];
      p.face(hull(pts), ice, { line: 0.45 });
      p.face([P(v, x - R * 0.5, y, 0.4), P(v, x - R * 0.3, y, 0.2 + h * 0.8), P(v, x - R * 0.1, y, 0.5)], WHITE, { sil: false, line: 0 });
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
      // a piñata on a post: a fat paper drum in frilly bands of colour with a pointy hat; cracks show its damage,
      // and once it has burst only the post and a few paper shreds are left
      const stripes = ['#ff5d8f', '#ffd23f', '#3cc3b1', '#62b8ff', '#ff9f1c'], R = r * 0.85;
      shadow(under, v, t, x, y, r * 1.0, r * 1.0);
      p.cyl(x, y, r * 0.55, 0, 0.14, metal);
      p.cyl(x, y, 0.1, 0.14, 0.7, mat(t, t.rim), { n: 10 });
      if (st.armed === false) {
        for (const [dx, dy, c] of [[-0.4, 0.1, 0], [0.35, -0.2, 2], [0.1, 0.4, 3]] as const) p.face(star(x + dx * r, y + dy * r, 0.28, 0.12, 3, dx).map(([a, b]) => P(v, a, b, 0.03)), stripes[c], { line: 0.3 });
        break;
      }
      for (let i = 0; i < 5; i++) p.cyl(x, y, R * (i === 0 || i === 4 ? 0.85 : 1), 0.84 + i * 0.32, 0.32, mat(t, st.hit ? mix(stripes[i], WHITE, 0.4) : stripes[i]));
      p.face(hull([...ring(x, y, R * 0.7, 18).map(([a, b]) => P(v, a, b, 2.44)), P(v, x, y, 3.3)]), t.role.pinata, { line: 0.45 });
      const cracks = st.seg ?? 0;
      for (let i = 0; i < cracks; i++) {
        const a = -0.9 + i * 0.6, z0 = 1.0 + (i % 2) * 0.6;
        const pts = [0, 1, 2, 3].map((k) => P(v, x + Math.cos(a + k * 0.12) * R * 1.01, y - Math.abs(Math.sin(a)) * R * 0.3 - R * 0.75, z0 + k * 0.22 * (k % 2 ? 1 : -0.4)));
        p.op((g) => { g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.stroke({ width: v.lw * 0.7, color: t.ink, cap: 'round', join: 'round' }); });
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
      // a spare bulb on a little stand: a glass globe over a screw base
      shadow(under, v, t, x, y, r * 0.9, r * 0.9);
      p.cyl(x, y, r * 0.75, 0, 0.18, mat(t, t.paper));
      p.cyl(x, y, r * 0.32, 0.18, 0.45, metal);
      for (let i = 0; i < 3; i++) p.cyl(x, y, r * 0.34, 0.3 + i * 0.12, 0.05, mat(t, mix(t.metal, t.ink, 0.3)), { n: 16 });
      const glass = mat(t, t.role.bulb);
      const globe = [0, 0.3, 0.6, 0.85, 1].flatMap((u) => ring(x, y, r * 0.62 * Math.sin(Math.PI * (0.25 + u * 0.75)), 20).map(([a, b]) => P(v, a, b, 0.65 + u * 1.25)));
      p.face(hull(globe), glass.base);
      p.face(ring(x - r * 0.2, y + r * 0.1, r * 0.14, 10).map(([a, b]) => P(v, a, b, 1.45)), WHITE, { sil: false, line: 0 });
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
      // a silver cup on a plinth: the more it is polished, the more it shines
      shadow(under, v, t, x, y, r * 1.05, r * 1.05);
      const cup = st.hit ? mat(t, mix(t.role.trophy, WHITE, 0.45)) : role;
      p.cyl(x, y, r, 0, 0.18, mat(t, t.paper));
      p.cyl(x, y, r * 0.28, 0.18, 0.34, metal);
      const bowl = [0, 0.25, 0.5, 0.75, 1].flatMap((u) => ring(x, y, r * (0.38 + 0.52 * Math.sqrt(u)), 26).map(([a, b]) => P(v, a, b, 0.52 + u * 0.78)));
      p.face(hull(bowl), cup.base);
      for (const sx of [-1, 1]) p.face(ring(x + sx * r * 0.86, y, r * 0.2, 12).map(([a, b]) => P(v, a, b, 1.0)), cup.shade, { sil: false, line: 0.5 });
      p.face(ring(x, y, r * 0.9, 26).map(([a, b]) => P(v, a, b, 1.3)), cup.light, { sil: false, line: 0.45 });
      p.face(ring(x, y, r * 0.66, 22).map(([a, b]) => P(v, a, b, 1.3)), cup.shade, { sil: false, line: 0.3 });
      p.face(star(x, y + r * 0.05, r * 0.3, r * 0.13, 5, Math.PI / 2).map(([a, b]) => P(v, a, b, 1.0 - 0.1)), t.role.coin, { sil: false, line: 0.4 });
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
      // a piggy bank standing on its plate: the coin slot fills as it holds more
      const c = Math.cos(angle), s = Math.sin(angle), hw = 1.1, hh = 0.55;
      shadowPoly(under, v, t, box(x, y, hw + 0.1, hh + 0.1, angle, hh));
      const pink = st.hit ? mat(t, mix(t.role.piggy, WHITE, 0.4)) : mat(t, t.role.piggy);
      p.prism(box(x, y, hw, hh, angle, 0.12), 0, 0.1, metal);
      p.prism(box(x, y, hw * 0.85, hh * 0.85, angle, hh * 0.8), 0.1, 0.95, pink);
      for (const k of [-0.45, 0.45]) p.prism(box(x + k * c - 0.15 * s, y + k * s + 0.15 * c, 0.18, 0.12, angle), 1.05, 0.28, pink);
      p.cyl(x + hw * 0.85 * c, y + hw * 0.85 * s, 0.26, 0.45, 0.3, mat(t, mix(t.role.piggy, t.shadeTint, 0.2)));
      const full = Math.min(1, (st.seg ?? 0) / 6);
      p.face(box(x, y, 0.36, 0.06, angle).map(([a, b]) => P(v, a, b, 1.06)), full > 0 ? t.role.coin : t.ink, { sil: false, line: 0.3 });
      if (full > 0) p.op((g) => { const [X, Y] = P(v, x, y, 1.15 + full * 0.25); g.circle(X, Y, v.S * 0.16).fill(t.role.coin).stroke({ width: v.lw * 0.4, color: t.ink }); });
      break;
    }
    case 'magnet': {
      // a horseshoe magnet on a floor plate, aimed where it throws
      const c = Math.cos(angle), s = Math.sin(angle);
      aimArrow(p, v, t, x, y, angle, r + 0.2, t.role.magnet);
      p.face(ring(x, y, r, 28).map(([a, b]) => P(v, a, b, 0.01)), metal.mid, { line: 0.4 });
      p.face(ring(x, y, r * 0.78, 28).map(([a, b]) => P(v, a, b, 0.02)), st.busy ? mix(t.role.magnet, WHITE, 0.5) : mix(t.role.magnet, t.shadeTint, 0.55), { line: 0.3, sil: false });
      const red = mat(t, t.role.magnet);
      const pt = (lx: number, ly: number): Pt => [x + lx * c - ly * s, y + lx * s + ly * c];
      for (const side of [-1, 1]) {
        const [ax, ay] = pt(side * 0.42, 0.05);
        p.prism(box(ax, ay, 0.17, 0.42, angle), 0.02, 0.6, red);
        const [tx, ty] = pt(side * 0.42, 0.55);
        p.prism(box(tx, ty, 0.17, 0.12, angle), 0.02, 0.6, metal);
      }
      const [bx, by] = pt(0, -0.42);
      p.prism(box(bx, by, 0.59, 0.17, angle), 0.02, 0.6, red);
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
    case 'duck': case 'roller': case 'goal': {
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
export function drawFlipper(g: Graphics, v: View, t: Theme, px: number, py: number, angle: number, sign: 1 | -1, length = FLIPPER_LENGTH) {
  const p = new Prop(v, t);
  const k = length < FLIPPER_LENGTH ? 0.8 : 1;
  const tip: Pt = [px + Math.cos(angle) * length * sign, py + Math.sin(angle) * length * sign];
  const outline = hull([...ring(px, py, 0.58 * k, 16), ...ring(tip[0], tip[1], 0.28 * k, 12)]);
  const rubber = hull([...ring(px, py, 0.66 * k, 16), ...ring(tip[0], tip[1], 0.36 * k, 12)]);
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
