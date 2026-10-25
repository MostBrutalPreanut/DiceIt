// One drawing per part type. The silhouette is fixed (it is how a player recognises the part); the
// theme only supplies colours and one motif, so every machine gets every part for free.
import { PARTS, type PartId } from '../../src/data/parts';
import { BALL_R, FLIPPER_LENGTH, FLIPPER_REST } from '../../src/sim/constants';
import { box, curl, f, groundRing, P, poly, Prop, ribbon, ring, shadow, shadowPoly, valueTag, type View } from './draw';
import { mat, mix, type Theme } from './themes';

export interface PartState { lit?: boolean; down?: number[]; value?: string; face?: 'happy' | 'oof'; smoke?: boolean; hit?: boolean; glow?: number }

export function drawPart(v: View, t: Theme, id: PartId, x: number, y: number, angle = 0, st: PartState = {}): string {
  const def = PARTS[id], role = mat(t, t.role[id]), metal = mat(t, t.metal), rubber = mat(t, t.rubber);
  const p = new Prop(v, t);
  let under = '', over = '';
  const r = def.shape.type === 'circle' ? def.shape.r : 0;

  switch (id) {
    case 'pop': case 'coin': {
      under += shadow(v, t, x, y, r * 1.05, r * 1.05);
      if (st.hit) under += groundRing(v, t, x, y, r * 1.55, t.role[id], v.lw * 1.6);
      const skirt = mat(t, id === 'coin' ? mix(t.role.coin, t.shadeTint, 0.25) : t.paper);
      p.cyl(x, y, r, 0, 0.16, skirt);
      p.cyl(x, y, r * 0.62, 0.16, 0.5, metal);
      const top = p.cyl(x, y, r * 0.88, 0.66, 0.24, role);
      if (id === 'pop') motif(p, v, t, x, y, r * 0.88, 0.9, top);
      else { // the coin bumper's cap is a coin, whatever the theme
        const inner = ring(x, y, r * 0.62).map(([a, b]) => P(v, a, b, 0.9));
        p.face(poly(inner), role.light, { sil: false, line: 0.35 });
      }
      if (st.value) over += valueTag(v, t, x, y, id === 'pop' && t.popMotif === 'cone' ? 1.0 : 0.9, st.value);
      else if (id === 'coin') over += valueTag(v, t, x, y, 0.9, '$');
      break;
    }
    case 'mega': {
      under += shadow(v, t, x, y, r * 1.05, r * 1.05, 0.24);
      if (st.hit) under += groundRing(v, t, x, y, r * 1.45, t.accent, v.lw * 2);
      p.cyl(x, y, r, 0, 0.22, mat(t, t.rim));
      p.cyl(x, y, r * 0.86, 0.22, 0.9, role);
      // dome: a stack of rings hulled together reads as a soft bun / boulder / boss
      const domePts = [0, 0.3, 0.55, 0.78, 0.92, 1].flatMap((u) => ring(x, y, r * 0.86 * Math.cos(u * Math.PI / 2), 28).map(([a, b]) => P(v, a, b, 1.12 + u * 0.75)));
      p.face(poly(hullPts(domePts)), role.base);
      const hl = ring(x - r * 0.25, y + r * 0.2, r * 0.32, 20).map(([a, b]) => P(v, a, b, 1.75));
      p.face(poly(hl), role.light, { line: 0, sil: false });
      face(p, v, t, x, y - r * 0.82, 0.78, r, st.face ?? 'happy');
      if (st.value) over += valueTag(v, t, x, y + r * 0.1, 2.05, st.value);
      break;
    }
    case 'sling': case 'deflector': {
      const hw = def.shape.type === 'box' ? def.shape.hw : 1, hh = def.shape.type === 'box' ? def.shape.hh : 0.3;
      under += shadowPoly(v, t, box(x, y, hw + 0.1, hh + 0.1, angle, hh));
      if (id === 'sling') {
        p.prism(box(x, y, hw + 0.06, hh + 0.06, angle, hh), 0, 0.34, mat(t, t.paper));
        p.prism(box(x, y, hw - 0.2, hh - 0.1, angle, hh * 0.6), 0.34, 0.22, role);
        for (const s of [-1, 1]) {
          const c = [x + Math.cos(angle) * hw * 0.92 * s, y + Math.sin(angle) * hw * 0.92 * s];
          p.cyl(c[0], c[1], 0.2, 0.34, 0.36, metal);
        }
      } else {
        p.prism(box(x, y, hw, hh, angle, hh * 0.95), 0, 0.42, role);
        for (const s of [-1, 1]) p.cyl(x + Math.cos(angle) * hw * 0.85 * s, y + Math.sin(angle) * hw * 0.85 * s, 0.17, 0.42, 0.2, metal);
      }
      break;
    }
    case 'spinner': {
      const hw = 1.4, c = Math.cos(angle), s = Math.sin(angle);
      under += shadowPoly(v, t, box(x, y, hw, 0.25, angle));
      const ends = [-1, 1].map((k) => [x + c * hw * k, y + s * hw * k] as [number, number]);
      p.cyl(ends[0][0], ends[0][1], 0.22, 0, 1.25, metal);
      const plate = [P(v, ends[0][0], ends[0][1], 0.35), P(v, ends[1][0], ends[1][1], 0.35), P(v, ends[1][0], ends[1][1], 1.05), P(v, ends[0][0], ends[0][1], 1.05)];
      p.face(poly(plate), role.base);
      const mid = (a: number, z: number) => P(v, ends[0][0] + (ends[1][0] - ends[0][0]) * a, ends[0][1] + (ends[1][1] - ends[0][1]) * a, z);
      for (const a of [0.25, 0.5, 0.75]) p.face(poly([mid(a - 0.06, 0.35), mid(a + 0.06, 0.35), mid(a + 0.06, 1.05), mid(a - 0.06, 1.05)]), role.light, { sil: false, line: 0 });
      p.cyl(ends[1][0], ends[1][1], 0.22, 0, 1.25, metal);
      break;
    }
    case 'lane': case 'uplight': {
      const lit = !!st.lit, c = t.role[id === 'uplight' ? 'pop' : 'lane'];
      if (lit) under += glowDisk(v, t, x, y, r * 2.2, c);
      const outer = ring(x, y, r).map(([a, b]) => P(v, a, b, 0.01));
      p.face(poly(outer), mat(t, t.metal).mid, { line: 0.4 });
      const shape = id === 'lane'
        ? [[0, 0.62], [0.5, 0.05], [0.24, 0.05], [0.24, -0.5], [-0.24, -0.5], [-0.24, 0.05], [-0.5, 0.05]] // arrow insert
        : Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.27 : 0.64; return [Math.cos(a) * rr, Math.sin(a) * rr]; });
      const ins = shape.map(([a, b]) => P(v, x + a * r, y + b * r, 0.02));
      p.face(poly(ins), lit ? mix(c, '#ffffff', 0.25) : mix(c, t.shadeTint, 0.55), { line: 0.4, sil: false });
      if (lit) p.face(poly(ins.map(([a, b]) => [a - v.S * 0.08, b - v.S * 0.08] as [number, number]).slice(0, 3)), '#ffffff', { line: 0, sil: false });
      break;
    }
    case 'lamp': {
      const rad = st.glow ?? 5;
      if (st.lit) under += glowDisk(v, t, x, y, rad, t.role.lamp, 0.42);
      under += shadow(v, t, x, y, 0.6, 0.6);
      p.cyl(x, y, 0.55, 0, 0.14, metal);
      p.cyl(x, y, 0.13, 0.14, 1.5, mat(t, t.ink));
      const [BX, BY] = P(v, x, y, 1.95);
      p.face(`M${f(BX - 0.5 * v.S)} ${f(BY)}a${f(0.5 * v.S)} ${f(0.5 * v.S)} 0 1 0 ${f(v.S)} 0a${f(0.5 * v.S)} ${f(0.5 * v.S)} 0 1 0 ${f(-v.S)} 0Z`, st.lit ? t.role.lamp : mix(t.role.lamp, t.shadeTint, 0.5));
      p.face(`M${f(BX - 0.18 * v.S)} ${f(BY - 0.2 * v.S)}a${f(0.12 * v.S)} ${f(0.12 * v.S)} 0 1 0 0.1 0Z`, '#ffffff', { line: 0, sil: false });
      p.cyl(x, y, 0.42, 2.2, 0.16, mat(t, t.accent));
      break;
    }
    case 'printer': {
      const c = Math.cos(angle), s = Math.sin(angle);
      under += shadowPoly(v, t, box(x, y, 1.25, 1.0, angle, 0.25), 0.24);
      const body = mat(t, t.role.printer);
      p.prism(box(x, y, 1.2, 0.95, angle, 0.28), 0, 1.25, body);
      // the mouth on the front face, where balls go in and come out
      const fy = y - 0.96 * Math.cos(angle);
      p.face(poly(ring(x, fy, 0.5, 24, 0.32).map(([a, b]) => P(v, a, b, 0.45))), t.ink, { sil: false, line: 0 });
      eyes(p, v, t, x, fy, 0.95, 0.42);
      if (t.popMotif === 'cone') { // castle: a gatehouse with crenels
        for (const k of [-0.8, 0, 0.8]) p.prism(box(x + k * c, y + k * s, 0.28, 0.75, angle), 1.25, 0.35, body);
      } else if (t.popMotif === 'awning') { // diner: a toaster with two slots
        for (const k of [-0.35, 0.35]) p.face(poly(box(x + k, y + 0.1, 0.16, 0.6, 0).map(([a, b]) => P(v, a, b, 1.26))), t.ink, { sil: false, line: 0 });
      } else { // factory: a press with a striped chimney
        p.cyl(x + 0.55 * c - 0.4 * s, y + 0.4 * c + 0.55 * s, 0.32, 1.25, 0.9, mat(t, t.accent));
        p.cyl(x + 0.55 * c - 0.4 * s, y + 0.4 * c + 0.55 * s, 0.34, 1.6, 0.18, mat(t, t.paper));
      }
      if (st.smoke) {
        const [SX, SY] = t.popMotif === 'rivets' ? P(v, x + 0.55 * c - 0.4 * s, y + 0.4 * c + 0.55 * s, 2.3) : P(v, x, y + 0.2, 1.7);
        over += ribbon(curl(SX, SY, v.S * 3.2, v.S * 0.9, 2.2), v.S * 0.32, v.S * 0.05, t.smoke, 0.95) + ribbon(curl(SX + v.S * 0.2, SY, v.S * 2.2, v.S * 0.6, 1.6, 20, -1), v.S * 0.22, v.S * 0.04, t.smoke, 0.85);
      }
      if (st.value) over += valueTag(v, t, x, y + 0.2, 1.75, st.value);
      break;
    }
    case 'bank': {
      const c = Math.cos(angle), s = Math.sin(angle);
      under += shadowPoly(v, t, box(x, y, 2.7, 0.5, angle));
      p.prism(box(x, y, 2.7, 0.5, angle, 0.2), 0, 0.16, metal);
      for (let i = 0; i < 3; i++) {
        const k = (i - 1) * 1.7, down = st.down?.includes(i);
        p.prism(box(x + k * c, y + k * s, 0.7, 0.18, angle), 0.16, down ? 0.05 : 0.95, down ? mat(t, mix(t.role.bank, t.shadeTint, 0.5)) : role);
        if (!down) p.face(poly(box(x + k * c, y + k * s - 0.19, 0.42, 0.01, angle).map(([a, b]) => P(v, a, b, 0.7))), t.paper, { sil: false, line: 0.3 });
      }
      break;
    }
    case 'flipper': {
      over += flipper(v, t, x, y, 1, true);
      break;
    }
  }
  return under + p.svg() + over;
}

function hullPts(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** The pop bumper's theme motif: a striped awning (diner), a turret roof (castle), a riveted cap (factory). */
function motif(p: Prop, v: View, t: Theme, x: number, y: number, r: number, z: number, top: [number, number][]) {
  const role = mat(t, t.role.pop);
  if (t.popMotif === 'cone') {
    const apex = P(v, x, y, z + 1.25);
    p.face(poly(hullPts([...top, apex])), role.base);
    const right = hullPts([...top.filter((q) => q[0] > P(v, x, y)[0] + r * v.S * 0.3), apex]);
    p.face(poly(right), role.shade, { sil: false, line: 0 });
    p.face(poly(hullPts([...top, apex])), 'none', { sil: false });
    p.cyl(x, y, 0.12, z + 1.2, 0.28, mat(t, t.rim));
  } else if (t.popMotif === 'awning') {
    const n = 12;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const wedge: [number, number][] = [P(v, x, y, z)];
      for (let k = 0; k <= 4; k++) { const a = a0 + ((a1 - a0) * k) / 4; wedge.push(P(v, x + Math.cos(a) * r, y + Math.sin(a) * r, z)); }
      p.face(poly(wedge), t.paper, { sil: false, line: 0 });
    }
    p.face(poly(top), 'none', { sil: false });
  } else {
    const inner = ring(x, y, r * 0.66).map(([a, b]) => P(v, a, b, z));
    p.face(poly(inner), role.light, { sil: false, line: 0.35 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, [X, Y] = P(v, x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, z);
      p.raw(`<circle cx="${f(X)}" cy="${f(Y)}" r="${f(v.S * 0.07)}" fill="${t.ink}"/>`);
    }
  }
}

function eyes(p: Prop, v: View, t: Theme, x: number, y: number, z: number, gap: number) {
  for (const s of [-1, 1]) {
    const [X, Y] = P(v, x + s * gap * 0.5, y, z);
    p.raw(`<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(v.S * 0.1)}" ry="${f(v.S * 0.15)}" fill="${t.ink}"/><circle cx="${f(X - v.S * 0.03)}" cy="${f(Y - v.S * 0.05)}" r="${f(v.S * 0.035)}" fill="#fff"/>`);
  }
}
/** Big Boi's face. Goofy tone: a few parts are characters, most are furniture. */
function face(p: Prop, v: View, t: Theme, x: number, y: number, z: number, r: number, mood: 'happy' | 'oof') {
  const s = v.S;
  eyes(p, v, t, x, y, z + 0.25, r * 0.55);
  const [X, Y] = P(v, x, y, z - 0.1);
  for (const k of [-1, 1]) p.raw(`<ellipse cx="${f(X + k * r * 0.5 * s)}" cy="${f(Y + s * 0.12)}" rx="${f(s * 0.2)}" ry="${f(s * 0.11)}" fill="${t.accent}" opacity="0.55"/>`);
  p.raw(mood === 'happy'
    ? `<path d="M${f(X - s * 0.22)} ${f(Y)}q${f(s * 0.22)} ${f(s * 0.28)} ${f(s * 0.44)} 0" fill="none" stroke="${t.ink}" stroke-width="${f(v.lw * 0.6)}" stroke-linecap="round"/>`
    : `<ellipse cx="${f(X)}" cy="${f(Y + s * 0.06)}" rx="${f(s * 0.14)}" ry="${f(s * 0.18)}" fill="${t.ink}"/>`);
}

export function glowDisk(v: View, t: Theme, x: number, y: number, r: number, color: string, a = 0.5) {
  const [X, Y] = P(v, x, y);
  const id = 'g' + Math.round(X) + '_' + Math.round(Y) + '_' + t.id;
  return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset="0.7" stop-color="${color}" stop-opacity="${a * 0.35}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(r * v.S)}" ry="${f(r * v.S * v.k)}" fill="url(#${id})" style="mix-blend-mode:screen"/>`;
}

export function flipper(v: View, t: Theme, px: number, py: number, side: 1 | -1, up = false) {
  const p = new Prop(v, t);
  const a = side === 1 ? (up ? 0.45 : -FLIPPER_REST) : Math.PI - (up ? 0.45 : -FLIPPER_REST);
  const tip: [number, number] = [px + Math.cos(a) * FLIPPER_LENGTH, py + Math.sin(a) * FLIPPER_LENGTH];
  const outline = hullPts([...ring(px, py, 0.58, 20), ...ring(tip[0], tip[1], 0.28, 14)]);
  const rubber = hullPts([...ring(px, py, 0.66, 20), ...ring(tip[0], tip[1], 0.36, 14)]);
  const sh = shadowPoly(v, t, rubber, 0.22);
  p.prism(rubber, 0, 0.28, mat(t, t.role.flipper === t.paper ? t.accent : t.rubber));
  p.prism(outline, 0.28, 0.24, mat(t, t.role.flipper));
  p.cyl(px, py, 0.24, 0.52, 0.12, mat(t, t.metal));
  return sh + p.svg();
}

export function ball(v: View, t: Theme, x: number, y: number) {
  const r = BALL_R, [X, Y] = P(v, x, y, r), R = r * v.S;
  return shadow(v, t, x + 0.15, y - 0.1, r * 0.9, r * 0.7, 0.3) +
    `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R + v.lw)}" fill="${t.ink}"/>` +
    `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R)}" fill="#e8ecf4"/>` +
    `<path d="M${f(X + R * 0.95)} ${f(Y - R * 0.1)}A${f(R)} ${f(R)} 0 0 1 ${f(X - R * 0.5)} ${f(Y + R * 0.85)}A${f(R * 1.2)} ${f(R * 1.2)} 0 0 0 ${f(X + R * 0.95)} ${f(Y - R * 0.1)}Z" fill="#a8b1c6"/>` +
    `<ellipse cx="${f(X - R * 0.35)}" cy="${f(Y - R * 0.38)}" rx="${f(R * 0.3)}" ry="${f(R * 0.22)}" fill="#fff" transform="rotate(-35 ${f(X - R * 0.35)} ${f(Y - R * 0.38)})"/>` +
    `<path d="M${f(X - R * 0.7)} ${f(Y + R * 0.2)}q${f(R * 0.4)} ${f(R * 0.5)} ${f(R)} ${f(R * 0.45)}" fill="none" stroke="${t.accent}" stroke-width="${f(R * 0.14)}" opacity="0.6" stroke-linecap="round"/>`;
}
