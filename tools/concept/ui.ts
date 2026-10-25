// HUD widgets for the concept screens. The panels are objects in the diorama (a scoreboard machine,
// a parts counter) built from the same sticker kit as the table: odometer drums, a Mult dial, a goal
// tube, a ball tray, a receipt for the ledger, shelves with hanging price tags, a toolbox.
import { PARTS, type PartId } from '../../src/data/parts';
import { esc, f, poly, Prop, sparkle, star, TYPE, type Pt, type View } from './draw';
import { ball, drawPart, flipper } from './props';
import { mat, mix, type Theme } from './themes';


export const card = (t: Theme, x: number, y: number, w: number, h: number, fill = t.paper, r = 18) =>
  `<rect x="${f(x + 6)}" y="${f(y + 7)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${t.shadeTint}" opacity="0.28"/>` +
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${fill}" stroke="${t.ink}" stroke-width="3.5"/>`;
/** Big bold text (>= 19 px at weight 700) is set in the display face, everything else in the UI face. */
export const text = (t: Theme, x: number, y: number, s: string, size: number, opts: { w?: number; fill?: string; anchor?: string; stroke?: string; font?: string; spacing?: number } = {}) => {
  const display = !opts.font && (opts.w ?? 600) >= 700 && size >= 19;
  const font = opts.font ?? (display ? TYPE.display : TYPE.ui);
  const w = display ? 400 : opts.w ?? 600;
  const dy = display ? size * 0.06 : 0; // Luckiest Guy sits high on its baseline
  return `<text x="${f(x)}" y="${f(y + dy)}" font-family="'${font}'" font-weight="${w}" font-size="${f(size)}" fill="${opts.fill ?? t.ink}" text-anchor="${opts.anchor ?? 'start'}"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ''}${opts.stroke ? ` stroke="${opts.stroke}" stroke-width="${f(size * 0.14)}" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(s)}</text>`;
};
const faint = (t: Theme) => mix(t.ink, t.paper, 0.4);
const screw = (t: Theme, x: number, y: number) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="${t.metal}" stroke="${t.ink}" stroke-width="2"/><path d="M${f(x - 3.5)} ${f(y + 2)}L${f(x + 3.5)} ${f(y - 2)}" stroke="${t.ink}" stroke-width="1.8"/>`;
/** A UI-space view, so 3D bits of the HUD (buttons, balls, parts) use the same prop code as the table. */
const uiView = (x: number, y: number, S: number): View => ({ S, ox: x, oy: y, k: 0.55, kz: 0.8, shx: 0, lw: 2.4 });

/** The panel body: a coloured machine housing with screws, paper inside. */
export function housing(t: Theme, x: number, y: number, w: number, h: number, color = t.rim) {
  return card(t, x, y, w, h, color, 22) + `<rect x="${f(x + 12)}" y="${f(y + 12)}" width="${f(w - 24)}" height="${f(h - 24)}" rx="14" fill="${t.paper}" stroke="${t.ink}" stroke-width="3"/>` +
    [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]].map(([a, b]) => screw(t, a, b)).join('');
}

/** Score as rolling odometer drums: fixed-width digits, so a ticking score never wobbles. */
export function odometer(t: Theme, x: number, y: number, digits: string, dw = 38, dh = 60) {
  const o: string[] = [`<rect x="${f(x - 8)}" y="${f(y - 8)}" width="${f(digits.length * (dw + 4) + 12)}" height="${f(dh + 16)}" rx="12" fill="${t.ink}"/>`];
  let lead = true;
  [...digits].forEach((d, i) => {
    const X = x + i * (dw + 4);
    if (d !== '0') lead = false;
    const last = i === digits.length - 1;
    o.push(`<rect x="${f(X)}" y="${f(y)}" width="${dw}" height="${dh}" rx="6" fill="${t.paper}"/>`);
    o.push(`<rect x="${f(X)}" y="${f(y)}" width="${dw}" height="${f(dh * 0.18)}" rx="6" fill="${mix(t.paper, t.shadeTint, 0.3)}"/><rect x="${f(X)}" y="${f(y + dh * 0.82)}" width="${dw}" height="${f(dh * 0.18)}" rx="6" fill="${mix(t.paper, t.shadeTint, 0.3)}"/>`);
    if (last) { // the last drum is mid-roll: half of this digit, half of the next
      o.push(`<clipPath id="od${f(x)}"><rect x="${f(X)}" y="${f(y)}" width="${dw}" height="${dh}" rx="6"/></clipPath><g clip-path="url(#od${f(x)})">` +
        text(t, X + dw / 2, y + dh * 0.38, d, dh * 0.72, { w: 700, anchor: 'middle' }) + text(t, X + dw / 2, y + dh * 1.25, String((+d + 1) % 10), dh * 0.72, { w: 700, anchor: 'middle' }) + '</g>');
    } else o.push(text(t, X + dw / 2, y + dh * 0.74, d, dh * 0.72, { w: 700, anchor: 'middle', fill: lead ? mix(t.paper, t.shadeTint, 0.45) : t.ink }));
    o.push(`<rect x="${f(X)}" y="${f(y)}" width="${dw}" height="${dh}" rx="6" fill="none" stroke="${t.ink}" stroke-width="2"/>`);
  });
  o.push(`<rect x="${f(x - 8)}" y="${f(y + dh * 0.47)}" width="${f(digits.length * (dw + 4) + 12)}" height="2" fill="${t.ink}" opacity="0.25"/>`);
  return o.join('');
}

/** Progress to the goal as a glass tube of the pop colour, with bubbles and a flag at the goal. */
export function goalTube(t: Theme, x: number, y: number, w: number, frac: number, color: string) {
  const h = 26, fw = (w - 6) * frac;
  const bubbles = [0.15, 0.32, 0.5, 0.61].map((u, i) => `<circle cx="${f(x + 3 + fw * u)}" cy="${f(y + 9 + (i % 2) * 7)}" r="${3 + (i % 3)}" fill="${mix(color, '#ffffff', 0.55)}"/>`).join('');
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${h}" rx="13" fill="${mix(t.paper, t.shadeTint, 0.12)}" stroke="${t.ink}" stroke-width="3"/>` +
    `<rect x="${f(x + 3)}" y="${f(y + 3)}" width="${f(fw)}" height="${h - 6}" rx="10" fill="${color}"/>${bubbles}` +
    `<path d="M${f(x + 14)} ${f(y + 7)}H${f(x + w - 16)}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.7"/>` +
    `<path d="M${f(x + w - 4)} ${f(y - 22)}V${f(y + h)}" stroke="${t.ink}" stroke-width="3"/><path d="M${f(x + w - 4)} ${f(y - 22)}l-24 7l24 7Z" fill="${t.accent}" stroke="${t.ink}" stroke-width="2.4" stroke-linejoin="round"/>`;
}

/** Mult as a pressure dial: the needle moves, and the zones show how hot the ball is. */
export function multDial(t: Theme, cx: number, cy: number, R: number, value: number, max = 3) {
  const a = (v: number) => Math.PI + (Math.min(v, max) - 1) / (max - 1) * Math.PI;
  const arc = (v0: number, v1: number, r0: number, r1: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) { const q = a(v0 + ((v1 - v0) * i) / 12); pts.push([cx + Math.cos(q) * r1, cy + Math.sin(q) * r1]); }
    for (let i = 12; i >= 0; i--) { const q = a(v0 + ((v1 - v0) * i) / 12); pts.push([cx + Math.cos(q) * r0, cy + Math.sin(q) * r0]); }
    return poly(pts);
  };
  const o: string[] = [`<path d="M${f(cx - R - 6)} ${f(cy + 8)}A${R + 6} ${R + 6} 0 0 1 ${f(cx + R + 6)} ${f(cy + 8)}Z" fill="${t.paper}" stroke="${t.ink}" stroke-width="3.5" stroke-linejoin="round"/>`];
  for (const [v0, v1, c] of [[1, 1.6, t.role.lane], [1.6, 2.3, t.role.coin], [2.3, 3, t.accent]] as const) o.push(`<path d="${arc(v0, v1, R * 0.72, R * 0.92)}" fill="${c}" stroke="${t.ink}" stroke-width="2"/>`);
  for (let v = 1; v <= max + 1e-9; v += 0.5) { const q = a(v); o.push(`<path d="M${f(cx + Math.cos(q) * R * 0.55)} ${f(cy + Math.sin(q) * R * 0.55)}L${f(cx + Math.cos(q) * R * 0.66)} ${f(cy + Math.sin(q) * R * 0.66)}" stroke="${t.ink}" stroke-width="2.4"/>`); }
  const q = a(value);
  o.push(`<path d="M${f(cx + Math.cos(q + Math.PI / 2) * 5)} ${f(cy + Math.sin(q + Math.PI / 2) * 5)}L${f(cx + Math.cos(q) * R * 0.86)} ${f(cy + Math.sin(q) * R * 0.86)}L${f(cx + Math.cos(q - Math.PI / 2) * 5)} ${f(cy + Math.sin(q - Math.PI / 2) * 5)}Z" fill="${t.ink}"/>`);
  o.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="8" fill="${t.accent}" stroke="${t.ink}" stroke-width="2.5"/>`);
  return o.join('');
}

export function ballTray(t: Theme, x: number, y: number, left: number, total = 3) {
  const o: string[] = [`<rect x="${f(x)}" y="${f(y)}" width="${f(total * 34 + 14)}" height="36" rx="18" fill="${mix(t.rim, t.shadeTint, 0.35)}" stroke="${t.ink}" stroke-width="3"/>`];
  for (let i = 0; i < total; i++) {
    const cx = x + 24 + i * 34;
    if (i < left) o.push(ball(uiView(cx, y + 28, 28), t, 0, 0));
    else o.push(`<circle cx="${f(cx)}" cy="${f(y + 18)}" r="12" fill="none" stroke="${t.paper}" stroke-width="2.4" stroke-dasharray="4 4"/>`);
  }
  return o.join('');
}

export function coinStack(t: Theme, x: number, y: number, n: number) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const yy = y - i * 7;
    o += `<ellipse cx="${f(x)}" cy="${f(yy + 4)}" rx="20" ry="8" fill="${mix(t.role.coin, t.shadeTint, 0.4)}" stroke="${t.ink}" stroke-width="2.4"/><ellipse cx="${f(x)}" cy="${f(yy)}" rx="20" ry="8" fill="${t.role.coin}" stroke="${t.ink}" stroke-width="2.4"/>`;
  }
  return o;
}

/** The ledger printed as a receipt coming out of a slot: why this ball scored. */
export function receipt(t: Theme, x: number, y: number, w: number, title: string, rows: [string, string, string][], total: string) {
  const rowH = 30, h = 56 + rows.length * rowH + 44;
  const zig: Pt[] = [];
  for (let i = 0; i <= 14; i++) zig.push([x + w - (i * w) / 14, y + h + (i % 2 ? 7 : 0)]);
  const o: string[] = [`<rect x="${f(x - 12)}" y="${f(y - 10)}" width="${f(w + 24)}" height="14" rx="7" fill="${t.ink}"/>`];
  o.push(`<g transform="rotate(-1.2 ${f(x)} ${f(y)})"><path d="${poly([[x, y], [x + w, y], ...zig, [x, y + h]])}" fill="#fffdf6" stroke="${t.ink}" stroke-width="2.4" stroke-linejoin="round"/>`);
  o.push(text(t, x + w / 2, y + 30, title, 15, { w: 700, anchor: 'middle', spacing: 2 }));
  o.push(`<path d="M${f(x + 14)} ${f(y + 42)}H${f(x + w - 14)}" stroke="${t.ink}" stroke-width="1.6" stroke-dasharray="3 4"/>`);
  rows.forEach(([c, name, pts], i) => {
    const yy = y + 66 + i * rowH;
    o.push(`<circle cx="${f(x + 22)}" cy="${f(yy - 5)}" r="7" fill="${c}" stroke="${t.ink}" stroke-width="2"/>`);
    o.push(text(t, x + 36, yy, name, 15, { w: 500 }) + text(t, x + w - 14, yy, pts, 15, { w: 700, anchor: 'end' }));
  });
  const ty = y + 66 + rows.length * rowH;
  o.push(`<path d="M${f(x + 14)} ${f(ty - 12)}H${f(x + w - 14)}" stroke="${t.ink}" stroke-width="1.6" stroke-dasharray="3 4"/>`);
  o.push(text(t, x + 14, ty + 12, 'BALL TOTAL', 15, { w: 700 }) + text(t, x + w - 14, ty + 12, total, 17, { w: 700, anchor: 'end' }));
  o.push('</g>');
  return o.join('');
}

/** A big arcade push button on a plate; the label plate says what it does and its key. */
export function arcadeButton(t: Theme, x: number, y: number, label: string, key: string, color = t.accent) {
  const p = new Prop(uiView(x + 46, y + 44, 30), t);
  p.cyl(0, 0, 1.15, 0, 0.25, mat(t, t.metal));
  p.cyl(0, 0, 0.9, 0.25, 0.55, mat(t, color));
  return card(t, x, y, 252, 70, mix(t.rim, t.paper, 0.15), 18) + p.svg() + text(t, x + 98, y + 33, label, 22, { w: 700 }) +
    `<rect x="${f(x + 98)}" y="${f(y + 42)}" width="${f(key.length * 9 + 14)}" height="20" rx="5" fill="${t.paper}" stroke="${t.ink}" stroke-width="2"/>` + text(t, x + 105, y + 57, key, 13, { w: 600 });
}

export function awning(t: Theme, x: number, y: number, w: number, n = 9) {
  const sw = w / n, o: string[] = [];
  for (let i = 0; i < n; i++) {
    const X = x + i * sw, c = i % 2 ? t.paper : t.accent;
    o.push(`<path d="M${f(X)} ${f(y)}H${f(X + sw)}V${f(y + 44)}A${f(sw / 2)} ${f(sw / 2)} 0 0 1 ${f(X)} ${f(y + 44)}Z" fill="${c}" stroke="${t.ink}" stroke-width="2.6" stroke-linejoin="round"/>`);
  }
  return `<rect x="${f(x - 8)}" y="${f(y - 10)}" width="${f(w + 16)}" height="16" rx="8" fill="${t.rim}" stroke="${t.ink}" stroke-width="3"/>` + o.join('');
}

export const pegboard = (t: Theme, x: number, y: number, w: number, h: number) => {
  let o = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${mix(t.rim, t.paper, 0.72)}"/>`;
  for (let X = x + 14; X < x + w; X += 22) for (let Y = y + 14; Y < y + h; Y += 22) o += `<circle cx="${f(X)}" cy="${f(Y)}" r="2.6" fill="${mix(t.rim, t.shadeTint, 0.35)}"/>`;
  return o;
};

/** A hanging price tag on a string. */
export function priceTag(t: Theme, x: number, y: number, price: string, rot = 8) {
  return `<path d="M${f(x)} ${f(y - 34)}L${f(x)} ${f(y - 16)}" stroke="${t.ink}" stroke-width="2"/><g transform="translate(${f(x)} ${f(y)}) rotate(${rot})">` +
    `<path d="${poly([[-14, -18], [14, -18], [30, 0], [14, 18], [-14, 18]])}" transform="rotate(90)" fill="${t.role.coin}" stroke="${t.ink}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<circle cx="0" cy="-20" r="3.5" fill="${t.paper}" stroke="${t.ink}" stroke-width="1.6"/>${text(t, 0, 14, price, 19, { w: 700, anchor: 'middle' })}</g>`;
}

export function crank(t: Theme, x: number, y: number, label: string) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="20" fill="${t.metal}" stroke="${t.ink}" stroke-width="3"/><circle cx="${f(x)}" cy="${f(y)}" r="7" fill="${t.ink}"/>` +
    `<path d="M${f(x)} ${f(y)}L${f(x + 30)} ${f(y - 22)}" stroke="${t.ink}" stroke-width="11" stroke-linecap="round"/><path d="M${f(x)} ${f(y)}L${f(x + 30)} ${f(y - 22)}" stroke="${t.metal}" stroke-width="5" stroke-linecap="round"/>` +
    `<rect x="${f(x + 22)}" y="${f(y - 42)}" width="18" height="26" rx="8" fill="${t.role.coin}" stroke="${t.ink}" stroke-width="3"/>` +
    text(t, x - 28, y + 6, label, 15, { w: 700, anchor: 'end' });
}

export function partIcon(t: Theme, id: PartId, cx: number, cy: number, S: number, k = 0.8) {
  const v: View = { S, ox: cx, oy: cy, k, kz: 0.6, shx: 0, lw: Math.max(1.6, S * 0.12) };
  const a = id === 'sling' ? -0.6 : id === 'spinner' || id === 'deflector' ? 0.5 : 0;
  if (id === 'flipper') return flipper({ ...v, ox: cx - 2 * S }, t, 0, 0, 1);
  return drawPart(v, t, id, 0, 0, a, { lit: true, glow: 2.2, value: id === 'pop' ? '100' : undefined, letter: t.laneWord[0] });
}

/** A shelf with a part standing on it, its price hanging off the shelf, the recipe on a card behind. */
export function shelfItem(t: Theme, id: PartId, x: number, y: number, w: number, recipe: string[]) {
  const def = PARTS[id], o: string[] = [];
  o.push(`<g transform="rotate(-1.5 ${f(x + w / 2)} ${f(y)})">${card(t, x + 100, y - 4, w - 100, 118, t.paper, 10)}</g>`);
  o.push(`<rect x="${f(x + 100 + (w - 100) / 2 - 22)}" y="${f(y - 12)}" width="44" height="14" rx="3" fill="${t.glow}" opacity="0.85" stroke="${t.ink}" stroke-width="1.4" transform="rotate(-6 ${f(x + w / 2)} ${f(y)})"/>`);
  o.push(text(t, x + 114, y + 26, def.name, 19, { w: 700 }));
  o.push(text(t, x + 114, y + 46, def.blurb.length > 25 ? def.blurb.slice(0, 24) + '…' : def.blurb, 12.5, { w: 500, fill: faint(t) }));
  o.push(`<rect x="${f(x + 114)}" y="${f(y + 58)}" width="4" height="${recipe.length * 19}" rx="2" fill="${t.role[id]}"/>`);
  recipe.forEach((r, k) => o.push(text(t, x + 124, y + 72 + k * 19, r, 13.5, { w: 500 })));
  // shelf plank: front face and top, as a little prism
  o.push(`<path d="${poly([[x, y + 104], [x + 96, y + 104], [x + 102, y + 96], [x + 6, y + 96]])}" fill="${mix(t.rim, '#ffffff', 0.25)}" stroke="${t.ink}" stroke-width="2.4" stroke-linejoin="round"/>`);
  o.push(`<rect x="${f(x)}" y="${f(y + 104)}" width="96" height="12" fill="${t.rim}" stroke="${t.ink}" stroke-width="2.4"/>`);
  o.push(partIcon(t, id, x + 50, y + 92, id === 'spinner' ? 15 : id === 'printer' ? 21 : 23, 0.55));
  o.push(priceTag(t, x + 74, y + 150, '$' + def.cost, 10));
  return o.join('');
}

export function toolbox(t: Theme, x: number, y: number, w: number, items: PartId[]) {
  const o: string[] = [];
  const back = mix(t.role.sling, t.shadeTint, 0.2), front = t.role.sling;
  o.push(`<path d="${poly([[x + 10, y - 16], [x + w - 10, y - 16], [x + w, y + 40], [x, y + 40]])}" fill="${mix(back, t.shadeTint, 0.3)}" stroke="${t.ink}" stroke-width="3" stroke-linejoin="round"/>`);
  const cw = (w - 16) / items.length;
  items.forEach((id, i) => {
    const cx = x + 8 + cw * i + cw / 2;
    o.push(`<rect x="${f(x + 8 + cw * i + 3)}" y="${f(y - 10)}" width="${f(cw - 6)}" height="48" rx="6" fill="${mix(back, t.shadeTint, 0.45)}"/>`);
    o.push(partIcon(t, id, cx, y + 26, id === 'deflector' ? 11 : 15, 0.55));
  });
  o.push(`<rect x="${f(x)}" y="${f(y + 36)}" width="${f(w)}" height="54" rx="8" fill="${front}" stroke="${t.ink}" stroke-width="3"/>`);
  o.push(`<rect x="${f(x + w / 2 - 26)}" y="${f(y + 50)}" width="52" height="20" rx="4" fill="${t.metal}" stroke="${t.ink}" stroke-width="2.4"/>`);
  o.push(text(t, x + 16, y + 74, 'TOOLBOX', 15, { w: 700, fill: t.paper, stroke: t.ink }));
  o.push(text(t, x + w - 14, y + 74, `${items.length} parts`, 14, { w: 600, fill: t.paper, anchor: 'end', stroke: t.ink }));
  return o.join('');
}

/** Hover card anchored to a part by a tail: what it is, what it pays right now and why, how to change it. */
export function tooltip(t: Theme, x: number, y: number, w: number, anchor: Pt, c: {
  id: PartId; title: string; chip: string; level: number; now: string; math: [string, string][]; recipe: string[]; stats: string; dial: [string, number, string]; keys: string;
}) {
  const h = 300, o: string[] = [];
  const tail: Pt[] = [[x, y + 92], anchor, [x, y + 124]];
  o.push(`<path d="${poly(tail)}" fill="${t.ink}" stroke="${t.ink}" stroke-width="6" stroke-linejoin="round"/>`);
  o.push(card(t, x, y, w, h, t.paper, 16));
  o.push(`<path d="${poly([[x + 2, y + 95], [anchor[0] + 8, anchor[1]], [x + 2, y + 121]])}" fill="${t.paper}"/>`);
  o.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="54" rx="16" fill="${t.role[c.id]}" stroke="${t.ink}" stroke-width="3.5"/><rect x="${f(x + 2)}" y="${f(y + 36)}" width="${f(w - 4)}" height="16" fill="${t.role[c.id]}"/><path d="M${f(x)} ${f(y + 54)}H${f(x + w)}" stroke="${t.ink}" stroke-width="3"/>`);
  o.push(text(t, x + 18, y + 37, c.title, 23, { w: 700 }));
  o.push(`<rect x="${f(x + w - 136)}" y="${f(y + 15)}" width="64" height="24" rx="12" fill="${t.paper}" stroke="${t.ink}" stroke-width="2"/>` + text(t, x + w - 104, y + 32, c.chip, 13, { w: 600, anchor: 'middle' }));
  for (let i = 0; i < 5; i++) o.push(`<circle cx="${f(x + w - 58 + i * 10)}" cy="${f(y + 27)}" r="4.2" fill="${i < c.level ? t.role.coin : t.paper}" stroke="${t.ink}" stroke-width="1.6"/>`);
  o.push(text(t, x + 18, y + 84, c.now, 20, { w: 700 }));
  let cx = x + 18;
  for (const [v, label] of c.math) {
    const wv = Math.max(v.length * 9.5, label.length * 6.4) + 18;
    o.push(`<rect x="${f(cx)}" y="${f(y + 96)}" width="${f(wv)}" height="40" rx="9" fill="${mix(t.paper, t.shadeTint, 0.08)}" stroke="${t.ink}" stroke-width="2"/>`);
    o.push(text(t, cx + wv / 2, y + 115, v, 16, { w: 700, anchor: 'middle' }) + text(t, cx + wv / 2, y + 130, label, 10.5, { w: 500, anchor: 'middle', fill: faint(t) }));
    cx += wv + 6;
  }
  c.recipe.forEach((r, k) => o.push(text(t, x + 26, y + 164 + k * 20, r, 14.5, { w: 500 })));
  o.push(`<rect x="${f(x + 18)}" y="${f(y + 150)}" width="4" height="${c.recipe.length * 20}" rx="2" fill="${t.role[c.id]}"/>`);
  const sy = y + 164 + c.recipe.length * 20 + 6;
  o.push(text(t, x + 18, sy + 4, c.stats, 14, { w: 600, fill: faint(t) }));
  o.push(text(t, x + 18, sy + 34, c.dial[0], 14, { w: 700 }));
  o.push(`<rect x="${f(x + 70)}" y="${f(sy + 25)}" width="150" height="10" rx="5" fill="${mix(t.paper, t.shadeTint, 0.15)}" stroke="${t.ink}" stroke-width="2"/><circle cx="${f(x + 70 + 150 * c.dial[1])}" cy="${f(sy + 30)}" r="9" fill="${t.role[c.id]}" stroke="${t.ink}" stroke-width="2.4"/>`);
  o.push(text(t, x + 230, sy + 30, c.dial[2].split(',')[0], 11.5, { w: 500, fill: faint(t) }) + text(t, x + 230, sy + 44, (c.dial[2].split(',')[1] ?? '').trim(), 11.5, { w: 500, fill: faint(t) }));
  o.push(`<path d="M${f(x + 14)} ${f(y + h - 30)}H${f(x + w - 14)}" stroke="${t.ink}" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.5"/>`);
  o.push(text(t, x + 18, y + h - 11, c.keys, 12.5, { w: 500, fill: faint(t) }));
  return o.join('');
}

// ---------------------------------------------------------------- relic decals
export type DecalShape = 'circle' | 'star' | 'shield' | 'ticket' | 'hex' | 'banner';
export interface Decal { name: string; shape: DecalShape; color: string; icon: 'cup' | 'jar' | 'duck' | 'star' | 'clock' | 'receipt'; effect: string[]; rarity: 'common' | 'rare' | 'wild' }

export const decalPath = (shape: DecalShape, R: number): string => {
  switch (shape) {
    case 'circle': return `M${-R} 0a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z`;
    case 'star': return poly(star(0, 0, R * 1.12, R * 0.62, 5, -Math.PI / 2));
    case 'shield': return `M${-R * 0.9} ${-R * 0.85}H${R * 0.9}V${-R * 0.1}Q${R * 0.9} ${R * 0.7} 0 ${R * 1.05}Q${-R * 0.9} ${R * 0.7} ${-R * 0.9} ${-R * 0.1}Z`;
    case 'ticket': return `M${-R * 1.15} ${-R * 0.7}H${R * 1.15}V${-R * 0.22}a${R * 0.22} ${R * 0.22} 0 0 0 0 ${R * 0.44}V${R * 0.7}H${-R * 1.15}V${R * 0.22}a${R * 0.22} ${R * 0.22} 0 0 0 0 ${-R * 0.44}Z`;
    case 'hex': return poly(Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * R, Math.sin((i * Math.PI) / 3) * R] as Pt));
    case 'banner': return `M${-R * 1.25} ${-R * 0.5}H${R * 1.25}L${R * 0.95} 0L${R * 1.25} ${R * 0.5}H${-R * 1.25}L${-R * 0.95} 0Z`;
  }
};

function decalIcon(t: Theme, icon: Decal['icon'], R: number) {
  const st = `stroke="${t.ink}" stroke-width="${f(R * 0.07)}" stroke-linejoin="round" stroke-linecap="round"`;
  const s = R * 0.5;
  switch (icon) {
    case 'cup': return `<path d="M${-s * 0.7} ${-s * 0.6}H${s * 0.7}L${s * 0.5} ${s}H${-s * 0.5}Z" fill="${t.paper}" ${st}/><path d="M${s * 0.1} ${-s * 0.6}L${s * 0.45} ${-s * 1.3}" fill="none" ${st}/><circle cx="${-s * 0.15}" cy="${s * 0.1}" r="${s * 0.14}" fill="${t.role.lane}" ${st}/>`;
    case 'jar': return `<rect x="${-s * 0.7}" y="${-s * 0.55}" width="${s * 1.4}" height="${s * 1.5}" rx="${s * 0.3}" fill="${mix(t.paper, t.role.lane, 0.25)}" ${st}/><rect x="${-s * 0.8}" y="${-s * 0.85}" width="${s * 1.6}" height="${s * 0.35}" rx="${s * 0.1}" fill="${t.metal}" ${st}/><circle cx="0" cy="${s * 0.25}" r="${s * 0.38}" fill="${t.role.coin}" ${st}/>`;
    case 'duck': return `<ellipse cx="${s * 0.05}" cy="${s * 0.45}" rx="${s * 0.95}" ry="${s * 0.55}" fill="#ffd34d" ${st}/><circle cx="${-s * 0.25}" cy="${-s * 0.3}" r="${s * 0.5}" fill="#ffd34d" ${st}/><path d="M${-s * 0.72} ${-s * 0.3}l${-s * 0.45} ${s * 0.12}l${s * 0.45} ${s * 0.16}Z" fill="#ff8a3d" ${st}/><circle cx="${-s * 0.3}" cy="${-s * 0.42}" r="${s * 0.09}" fill="${t.ink}"/>`;
    case 'star': return `<path d="${poly(star(0, 0, s * 1.05, s * 0.45, 5, -Math.PI / 2))}" fill="${t.role.coin}" ${st}/>`;
    case 'clock': return `<circle r="${s}" fill="${t.paper}" ${st}/><path d="M0 0V${-s * 0.65}M0 0L${s * 0.45} ${s * 0.2}" fill="none" ${st}/>`;
    case 'receipt': return `<path d="M${-s * 0.6} ${-s}H${s * 0.6}V${s}l${-s * 0.3} ${-s * 0.2}l${-s * 0.3} ${s * 0.2}l${-s * 0.3} ${-s * 0.2}l${-s * 0.3} ${s * 0.2}Z" fill="${t.paper}" ${st}/><text y="${s * 0.2}" text-anchor="middle" font-family="'${TYPE.display}'" font-weight="400" font-size="${s * 0.42}" fill="${t.accent}">100%</text>`;
  }
}

/** A die-cut vinyl decal: white cut margin, ink line, colour field, icon. Flat on the apron (squash k). */
export function decal(t: Theme, d: Decal, x: number, y: number, R: number, k = 1, rot = 0) {
  const path = decalPath(d.shape, R);
  const rim = d.rarity === 'wild' ? t.accent : d.rarity === 'rare' ? t.role.coin : t.paper;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(1 ${f(k)}) rotate(${f(rot)})">` +
    `<path d="${path}" fill="${t.shadeTint}" opacity="0.25" transform="translate(${f(R * 0.08)} ${f(R * 0.1)})"/>` +
    `<path d="${path}" fill="#ffffff" stroke="${t.ink}" stroke-width="${f(R * 0.06)}" stroke-linejoin="round" transform="scale(1.16)"/>` +
    `<path d="${path}" fill="${d.color}" stroke="${rim === t.paper ? t.ink : rim}" stroke-width="${f(R * (rim === t.paper ? 0.06 : 0.12))}" stroke-linejoin="round"/>` +
    decalIcon(t, d.icon, R) + `</g>`;
}
export function emptySlot(t: Theme, x: number, y: number, R: number, k = 1) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(1 ${f(k)})"><circle r="${f(R * 1.1)}" fill="${mix(t.rim, t.shadeTint, 0.25)}" stroke="${t.paper}" stroke-width="${f(R * 0.09)}" stroke-dasharray="${f(R * 0.2)} ${f(R * 0.16)}"/>` +
    `<path d="M${f(-R * 0.35)} 0H${f(R * 0.35)}M0 ${f(-R * 0.35)}V${f(R * 0.35)}" stroke="${t.paper}" stroke-width="${f(R * 0.12)}" stroke-linecap="round"/></g>`;
}

export const DECALS: Decal[] = [
  { name: 'Free Refills', shape: 'circle', color: '#62b8ff', icon: 'cup', rarity: 'common', effect: ['Your first drain each round', 'comes back. Once.'] },
  { name: 'Tip Jar', shape: 'hex', color: '#55d08f', icon: 'jar', rarity: 'common', effect: ['+$1 for every 10', 'Pop Bumper hits.'] },
  { name: 'Rubber Ducky', shape: 'shield', color: '#ff8fc8', icon: 'duck', rarity: 'rare', effect: ['Slingshots kick 25% harder', 'and score +20.'] },
  { name: 'Gold Star', shape: 'star', color: '#8a63f2', icon: 'star', rarity: 'rare', effect: ['Lighting a Level Light', 'also gives +0.1 Mult.'] },
  { name: 'Overtime', shape: 'ticket', color: '#ffae2b', icon: 'clock', rarity: 'common', effect: ['Ball clock +20 s. Spinners pay', 'double in the last 10 s.'] },
  { name: 'No Refunds', shape: 'banner', color: '#ff6b6b', icon: 'receipt', rarity: 'wild', effect: ['Selling refunds the full price.', 'Rerolls cost +$1.'] },
];

export { sparkle };
