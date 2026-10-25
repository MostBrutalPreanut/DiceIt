// HUD widgets for the concept screens. The panels are objects in the diorama (a scoreboard machine,
// a parts counter) built from the same sticker kit as the table. Everything sits on one grid, uses
// three line weights, and centres text on measured cap heights, so nothing looks pasted on.
import { PARTS, type PartId } from '../../src/data/parts';
import { esc, f, poly, Prop, sparkle, star, TYPE, type Pt, type View } from './draw';
import { ball, drawPart, flipper } from './props';
import { legible, mat, mix, type Theme } from './themes';

/** Line weights: panel frames, widgets inside panels, fine detail. */
export const LW = { frame: 3.5, widget: 2.5, detail: 1.8 };
/** Cap height / font size, measured in Chromium; used to centre text on a line instead of eyeballing it. */
const CAP: Record<string, number> = { 'Luckiest Guy': 0.71, Nunito: 0.72, DotGothic16: 0.82 };

export const card = (t: Theme, x: number, y: number, w: number, h: number, fill = t.paper, r = 18) =>
  `<rect x="${f(x + 6)}" y="${f(y + 7)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${t.shadeTint}" opacity="0.28"/>` +
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${fill}" stroke="${t.ink}" stroke-width="${LW.frame}"/>`;
/** An inset tile inside a panel: no drop shadow, widget line, a hair darker than paper. */
export const tile = (t: Theme, x: number, y: number, w: number, h: number, fill = mix(t.paper, t.shadeTint, 0.06), r = 14) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${fill}" stroke="${t.ink}" stroke-width="${LW.widget}"/>`;

interface TextOpts { w?: number; fill?: string; anchor?: string; stroke?: string; font?: string; spacing?: number; mid?: boolean }
/**
 * Bold text at 19 px or more is set in the display face, everything else in the UI face.
 * With `mid`, y is the vertical centre of the capitals rather than the baseline.
 */
export const text = (t: Theme, x: number, y: number, s: string, size: number, opts: TextOpts = {}) => {
  const display = !opts.font && (opts.w ?? 600) >= 700 && size >= 19;
  const font = opts.font ?? (display ? TYPE.display : TYPE.ui);
  const w = display ? 400 : opts.w ?? 600;
  const base = opts.mid ? y + ((CAP[font] ?? 0.72) * size) / 2 : y;
  const dx = opts.spacing && opts.anchor === 'middle' ? opts.spacing / 2 : 0; // letter-spacing trails the last glyph
  return `<text x="${f(x + dx)}" y="${f(base)}" font-family="'${font}'" font-weight="${w}" font-size="${f(size)}" fill="${opts.fill ?? t.ink}" text-anchor="${opts.anchor ?? 'start'}"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ''}${opts.stroke ? ` stroke="${opts.stroke}" stroke-width="${f(size * 0.14)}" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(s)}</text>`;
};
/** The one section-label style used everywhere: small caps-ish UI text, tracked out, faint ink. */
export const label = (t: Theme, x: number, y: number, s: string, anchor = 'start') =>
  text(t, x, y, s.toUpperCase(), 13, { w: 800, spacing: 1.6, anchor, fill: faint(t) });
export const faint = (t: Theme) => mix(t.ink, t.paper, 0.42);
const screw = (t: Theme, x: number, y: number) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="${t.metal}" stroke="${t.ink}" stroke-width="${LW.detail}"/><path d="M${f(x - 3.5)} ${f(y + 2)}L${f(x + 3.5)} ${f(y - 2)}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`;
const uiView = (x: number, y: number, S: number): View => ({ S, ox: x, oy: y, k: 0.55, kz: 0.8, shx: 0, lw: 2.4 });

/** The panel body: a coloured machine housing with screws, paper inside. */
export function housing(t: Theme, x: number, y: number, w: number, h: number, color = t.rim) {
  return card(t, x, y, w, h, color, 22) + `<rect x="${f(x + 12)}" y="${f(y + 12)}" width="${f(w - 24)}" height="${f(h - 24)}" rx="14" fill="${t.paper}" stroke="${t.ink}" stroke-width="${LW.widget}"/>` +
    [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]].map(([a, b]) => screw(t, a, b)).join('');
}

/** Score on rolling odometer drums, centred in a width: fixed-width digits never wobble as the score ticks. */
export function odometer(t: Theme, cx: number, y: number, digits: string, dw = 44, dh = 64, roll = 0) {
  const gap = 4, total = digits.length * dw + (digits.length - 1) * gap, x = cx - total / 2;
  const o: string[] = [`<rect x="${f(x - 8)}" y="${f(y - 8)}" width="${f(total + 16)}" height="${f(dh + 16)}" rx="12" fill="${t.ink}"/>`];
  const id = 'od' + Math.round(cx) + '_' + Math.round(y);
  o.push(`<defs>${[...digits].map((_, i) => `<clipPath id="${id}_${i}"><rect x="${f(x + i * (dw + gap))}" y="${f(y)}" width="${dw}" height="${dh}" rx="6"/></clipPath>`).join('')}</defs>`);
  [...digits].forEach((d, i) => {
    const X = x + i * (dw + gap), last = i === digits.length - 1, mid = y + dh / 2;
    o.push(`<g clip-path="url(#${id}_${i})"><rect x="${f(X)}" y="${f(y)}" width="${dw}" height="${dh}" fill="${t.paper}"/>`);
    // the last drum is caught a little way into its roll, the next digit peeking in from below
    const off = last ? -roll * dh : 0;
    o.push(text(t, X + dw / 2, mid + off, d, dh * 0.62, { w: 700, anchor: 'middle', mid: true }));
    if (last && roll > 0) o.push(text(t, X + dw / 2, mid + off + dh, String((+d + 1) % 10), dh * 0.62, { w: 700, anchor: 'middle', mid: true }));
    o.push(`<rect x="${f(X)}" y="${f(y)}" width="${dw}" height="${f(dh * 0.16)}" fill="${t.shadeTint}" opacity="0.22"/><rect x="${f(X)}" y="${f(y + dh * 0.84)}" width="${dw}" height="${f(dh * 0.16)}" fill="${t.shadeTint}" opacity="0.22"/></g>`);
    o.push(`<rect x="${f(X)}" y="${f(y)}" width="${dw}" height="${dh}" rx="6" fill="none" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
  });
  return o.join('');
}

/** Progress to the goal: a glass tube with a round goal badge on its end cap, both on one centre line. */
export function goalTube(t: Theme, x: number, y: number, w: number, frac: number, color: string) {
  const h = 24, R = 17, cy = y + h / 2, tubeW = w - R, fw = (tubeW - 6) * frac;
  const bubbles = [0.12, 0.3, 0.48, 0.62].map((u, i) => `<circle cx="${f(x + 3 + fw * u)}" cy="${f(cy + (i % 2 ? 3 : -2))}" r="${2.5 + (i % 3)}" fill="${mix(color, '#ffffff', 0.55)}"/>`).join('');
  const bx = x + w - R;
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(tubeW)}" height="${h}" rx="${h / 2}" fill="${mix(t.paper, t.shadeTint, 0.12)}" stroke="${t.ink}" stroke-width="${LW.widget}"/>` +
    `<rect x="${f(x + 3)}" y="${f(y + 3)}" width="${f(fw)}" height="${h - 6}" rx="${(h - 6) / 2}" fill="${color}"/>${bubbles}` +
    `<path d="M${f(x + 12)} ${f(y + 7)}H${f(x + tubeW - 24)}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.65"/>` +
    `<circle cx="${f(bx)}" cy="${f(cy)}" r="${R}" fill="${t.accent}" stroke="${t.ink}" stroke-width="${LW.widget}"/>` +
    `<path d="M${f(bx - 5)} ${f(cy + 8)}V${f(cy - 9)}" stroke="${t.ink}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M${f(bx - 4)} ${f(cy - 9)}L${f(bx + 8)} ${f(cy - 5)}L${f(bx - 4)} ${f(cy - 1)}Z" fill="${t.paper}" stroke="${t.ink}" stroke-width="${LW.detail}" stroke-linejoin="round"/>`;
}

/** Mult as a pressure dial. Face, zones, ticks and needle all share one centre, the pivot. */
export function multDial(t: Theme, cx: number, cy: number, R: number, value: number, max = 3) {
  const a = (v: number) => Math.PI + ((Math.min(v, max) - 1) / (max - 1)) * Math.PI;
  const arc = (v0: number, v1: number, r0: number, r1: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 16; i++) { const q = a(v0 + ((v1 - v0) * i) / 16); pts.push([cx + Math.cos(q) * r1, cy + Math.sin(q) * r1]); }
    for (let i = 16; i >= 0; i--) { const q = a(v0 + ((v1 - v0) * i) / 16); pts.push([cx + Math.cos(q) * r0, cy + Math.sin(q) * r0]); }
    return poly(pts);
  };
  const o: string[] = [`<path d="M${f(cx - R)} ${f(cy)}A${R} ${R} 0 0 1 ${f(cx + R)} ${f(cy)}V${f(cy + 9)}H${f(cx - R)}Z" fill="${t.paper}" stroke="${t.ink}" stroke-width="${LW.widget}" stroke-linejoin="round"/>`];
  for (const [v0, v1, c] of [[1, 1.6, t.role.lane], [1.6, 2.3, t.role.coin], [2.3, 3, t.accent]] as const) o.push(`<path d="${arc(v0, v1, R * 0.66, R * 0.86)}" fill="${c}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
  for (let v = 1; v <= max + 1e-9; v += 0.5) { const q = a(v); o.push(`<path d="M${f(cx + Math.cos(q) * R * 0.5)} ${f(cy + Math.sin(q) * R * 0.5)}L${f(cx + Math.cos(q) * R * 0.6)} ${f(cy + Math.sin(q) * R * 0.6)}" stroke="${t.ink}" stroke-width="2" stroke-linecap="round"/>`); }
  const q = a(value);
  o.push(`<path d="M${f(cx + Math.cos(q + Math.PI / 2) * 4.5)} ${f(cy + Math.sin(q + Math.PI / 2) * 4.5)}L${f(cx + Math.cos(q) * R * 0.8)} ${f(cy + Math.sin(q) * R * 0.8)}L${f(cx + Math.cos(q - Math.PI / 2) * 4.5)} ${f(cy + Math.sin(q - Math.PI / 2) * 4.5)}Z" fill="${t.ink}"/>`);
  o.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="7" fill="${t.accent}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
  return o.join('');
}

/** Balls in a groove, centred on cx; used balls are dashed ghosts. */
export function ballTray(t: Theme, cx: number, cy: number, left: number, total = 3) {
  const pitch = 30, w = total * pitch + 10, x = cx - w / 2;
  const o: string[] = [`<rect x="${f(x)}" y="${f(cy - 17)}" width="${f(w)}" height="34" rx="17" fill="${mix(t.rim, t.shadeTint, 0.35)}" stroke="${t.ink}" stroke-width="${LW.widget}"/>`];
  for (let i = 0; i < total; i++) {
    const bx = x + 5 + pitch / 2 + i * pitch;
    if (i < left) o.push(ball(uiView(bx, cy + 12, 26), t, 0, 0));
    else o.push(`<circle cx="${f(bx)}" cy="${f(cy)}" r="11" fill="none" stroke="${t.paper}" stroke-width="2.2" stroke-dasharray="4 4"/>`);
  }
  return o.join('');
}

export function coinStack(t: Theme, cx: number, cy: number, n: number) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const yy = cy + ((n - 1) * 6) / 2 - i * 6;
    o += `<ellipse cx="${f(cx)}" cy="${f(yy + 4)}" rx="17" ry="7" fill="${mix(t.role.coin, t.shadeTint, 0.4)}" stroke="${t.ink}" stroke-width="${LW.detail}"/><ellipse cx="${f(cx)}" cy="${f(yy)}" rx="17" ry="7" fill="${t.role.coin}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`;
  }
  return o;
}

/** The ledger printed as a receipt out of a slot: why this ball scored. Square, not tilted: it's a fixture. */
export function receipt(t: Theme, x: number, y: number, w: number, title: string, rows: [string, string, string][], total: string) {
  const rowH = 29, h = 50 + rows.length * rowH + 40;
  const zig: Pt[] = [];
  for (let i = 0; i <= 16; i++) zig.push([x + w - (i * w) / 16, y + h + (i % 2 ? 6 : 0)]);
  const o: string[] = [`<rect x="${f(x - 10)}" y="${f(y - 8)}" width="${f(w + 20)}" height="12" rx="6" fill="${t.ink}"/>`];
  o.push(`<path d="${poly([[x, y], [x + w, y], ...zig, [x, y + h]])}" fill="#fffdf6" stroke="${t.ink}" stroke-width="${LW.detail}" stroke-linejoin="round"/>`);
  o.push(label(t, x + w / 2, y + 28, title, 'middle'));
  const rule = (yy: number) => `<path d="M${f(x + 14)} ${f(yy)}H${f(x + w - 14)}" stroke="${t.ink}" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.6"/>`;
  o.push(rule(y + 40));
  rows.forEach(([c, name, pts], i) => {
    const cy = y + 58 + i * rowH;
    o.push(`<circle cx="${f(x + 22)}" cy="${f(cy)}" r="6.5" fill="${c}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
    o.push(text(t, x + 36, cy, name, 15, { w: 600, mid: true }) + text(t, x + w - 14, cy, pts, 15, { w: 800, anchor: 'end', mid: true }));
  });
  const ty = y + 58 + rows.length * rowH;
  o.push(rule(ty - 12));
  o.push(text(t, x + 14, ty + 8, 'BALL TOTAL', 15, { w: 800, mid: true }) + text(t, x + w - 14, ty + 8, total, 20, { w: 700, anchor: 'end', mid: true }));
  return o.join('');
}

/** A big arcade push button on a plate; the label says what it does and its key. */
export function arcadeButton(t: Theme, x: number, y: number, w: number, label: string, key: string, color = t.accent) {
  const h = 68, cy = y + h / 2;
  const p = new Prop(uiView(x + 44, cy + 9, 26), t);
  p.cyl(0, 0, 1.15, 0, 0.25, mat(t, t.metal));
  p.cyl(0, 0, 0.9, 0.25, 0.55, mat(t, color));
  const kw = key.length * 8 + 16;
  return tile(t, x, y, w, h, mix(t.rim, t.paper, 0.2), 16) + p.svg() + text(t, x + 88, cy, label, 24, { w: 700, mid: true }) +
    `<rect x="${f(x + w - kw - 14)}" y="${f(cy - 12)}" width="${kw}" height="24" rx="6" fill="${t.paper}" stroke="${t.ink}" stroke-width="${LW.detail}"/>` + text(t, x + w - 14 - kw / 2, cy, key, 13, { w: 800, anchor: 'middle', mid: true });
}

/**
 * A panel header in the arcade style of the DMD marquee: a darker band across the top of the housing
 * with a row of chasing bulbs and the title, so nothing sticks out of the frame.
 */
export function marqueeHeader(t: Theme, x: number, y: number, w: number, title: string) {
  const x0 = x + 12, x1 = x + w - 12, y0 = y + 12, y1 = y + 80, r = 14, band = mix(t.rim, t.shadeTint, 0.3);
  const o: string[] = [`<path d="M${f(x0)} ${f(y1)}V${f(y0 + r)}A${r} ${r} 0 0 1 ${f(x0 + r)} ${f(y0)}H${f(x1 - r)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y0 + r)}V${f(y1)}Z" fill="${band}" stroke="${t.ink}" stroke-width="${LW.widget}" stroke-linejoin="round"/>`];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const bx = x0 + 18 + (i * (x1 - x0 - 36)) / (n - 1);
    o.push(`<circle cx="${f(bx)}" cy="${f(y0 + 11)}" r="4.5" fill="${i % 2 ? t.glow : mix(t.glow, t.shadeTint, 0.45)}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
  }
  o.push(text(t, x + 30, y + 56, title, 36, { w: 700, fill: t.paper, stroke: t.ink, mid: true }));
  return o.join('');
}

/** A pill button: icon slot on the left, label centred on the cap line. */
export function pill(t: Theme, x: number, cy: number, w: number, s: string, fill: string, icon = '', h = 34) {
  return `<rect x="${f(x)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${t.ink}" stroke-width="${LW.widget}"/>` + icon +
    text(t, x + w / 2 + (icon ? 10 : 0), cy, s, 15, { w: 800, anchor: 'middle', mid: true });
}

/** Rough bbox of a drawn SVG fragment from its absolute coordinates (shadows, glows and tags ignored). */
function bbox(svg: string) {
  const body = svg.replace(/<g transform="[^"]*">[\s\S]*?<\/g>/g, '').replace(/<[^>]*(opacity="|url\(#)[^>]*>/g, '');
  const xs: number[] = [], ys: number[] = [];
  for (const m of body.matchAll(/ d="([^"]+)"/g)) {
    for (const seg of m[1].match(/[ML][^MLAaQqZz]*/g) ?? []) {
      const n = seg.slice(1).trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); }
    }
  }
  for (const m of body.matchAll(/<(?:circle|ellipse) cx="([-\d.]+)" cy="([-\d.]+)" r(?:x)?="([\d.]+)"(?: ry="([\d.]+)")?/g)) {
    const cx = +m[1], cy = +m[2], rx = +m[3], ry = m[4] ? +m[4] : rx;
    xs.push(cx - rx, cx + rx); ys.push(cy - ry, cy + ry);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * Draws a part fitted and centred in a box by its real drawn bounds (not its footprint), at a fixed
 * line weight, so every icon in a shelf, toolbox or sheet sits in the middle at a matching size.
 */
export function fitIcon(t: Theme, id: PartId, cx: number, cy: number, w: number, h: number, opts: { maxS?: number; fixedS?: number; k?: number; st?: Record<string, unknown>; bottom?: boolean } = {}) {
  const k = opts.k ?? 0.62;
  const draw = (S: number, ox: number, oy: number) => {
    const v: View = { S, ox, oy, k, kz: 0.6, shx: 0, lw: 2.2 };
    const a = id === 'sling' ? -0.55 : id === 'spinner' ? 0.3 : id === 'deflector' ? 0.4 : id === 'bank' ? 0.15 : 0;
    if (id === 'flipper') return flipper(v, t, 0, 0, 1);
    return drawPart(v, t, id, 0, 0, a, { lit: true, glow: 2, letter: t.laneWord[0], target: 'pop', down: [2], ...(opts.st ?? {}) });
  };
  const b = bbox(draw(10, 0, 0));
  const s = opts.fixedS ?? Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0), (opts.maxS ?? 30) / 10) * 10;
  // with `bottom`, cy is where the part's base should rest (a plinth, a shelf); otherwise it is the centre
  const k2 = s / 10, ox = cx - ((b.x0 + b.x1) / 2) * k2, oy = opts.bottom ? cy - b.y1 * k2 : cy - ((b.y0 + b.y1) / 2) * k2;
  return draw(s, ox, oy);
}

/** A shop offer: the part on a plinth, name, flavour, recipe, and a Buy button with the price. */
export function offerCard(t: Theme, id: PartId, x: number, y: number, w: number, recipe: string[], affordable = true, h = 160) {
  const def = PARTS[id], o: string[] = [tile(t, x, y, w, h, t.paper)];
  const px = x + 12, pw = 84, cx = px + pw / 2;
  o.push(`<rect x="${f(px)}" y="${f(y + 12)}" width="${pw}" height="${h - 24}" rx="10" fill="${mix(t.paper, t.role[id] === t.paper ? t.shadeTint : t.role[id], 0.16)}"/>`);
  const base = y + h - 34;
  o.push(`<ellipse cx="${f(cx)}" cy="${f(base)}" rx="34" ry="10" fill="${mix(t.paper, t.shadeTint, 0.22)}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
  o.push(fitIcon(t, id, cx, base + 4, 64, 84, { maxS: 24, bottom: true }));
  const tx = px + pw + 12, tw = x + w - 12 - tx;
  o.push(text(t, tx, y + 32, def.name, 19, { w: 700 }));
  wrapText(def.blurb, Math.floor(tw / 6.1)).slice(0, 2).forEach((ln, k) => o.push(text(t, tx, y + 52 + k * 15, ln, 12.5, { w: 600, fill: faint(t) })));
  o.push(`<rect x="${f(tx)}" y="${f(y + 86)}" width="4" height="${recipe.length * 18 - 2}" rx="2" fill="${legible(t, t.role[id] === t.paper ? t.accent : t.role[id])}"/>`);
  recipe.forEach((r, k) => o.push(text(t, tx + 12, y + 98 + k * 18, r, 13.5, { w: 600 })));
  o.push(pill(t, x + w - 12 - 92, y + h - 24, 92, `BUY  $${def.cost}`, affordable ? t.role.coin : mix(t.paper, t.shadeTint, 0.2), '', 30));
  return o.join('');
}

export function toolbox(t: Theme, x: number, y: number, w: number, items: (PartId | null)[]) {
  const o: string[] = [];
  const shell = t.role.sling === t.paper ? t.accent : t.role.sling, back = mix(shell, t.shadeTint, 0.45);
  o.push(`<path d="${poly([[x + 12, y], [x + w - 12, y], [x + w, y + 64], [x, y + 64]])}" fill="${back}" stroke="${t.ink}" stroke-width="${LW.widget}" stroke-linejoin="round"/>`);
  const cw = (w - 20) / items.length;
  items.forEach((id, i) => {
    const bx = x + 10 + cw * i;
    o.push(`<rect x="${f(bx + 3)}" y="${f(y + 8)}" width="${f(cw - 6)}" height="52" rx="7" fill="${mix(back, t.shadeTint, 0.4)}"/>`);
    if (id) o.push(fitIcon(t, id, bx + cw / 2, y + 34, cw - 22, 40, { maxS: 16, k: 0.55 }));
    else o.push(`<rect x="${f(bx + 14)}" y="${f(y + 20)}" width="${f(cw - 28)}" height="28" rx="6" fill="none" stroke="${mix(back, '#ffffff', 0.35)}" stroke-width="2" stroke-dasharray="4 4"/>`);
  });
  o.push(`<rect x="${f(x)}" y="${f(y + 56)}" width="${f(w)}" height="46" rx="10" fill="${shell}" stroke="${t.ink}" stroke-width="${LW.widget}"/>`);
  o.push(`<rect x="${f(x + w / 2 - 24)}" y="${f(y + 70)}" width="48" height="18" rx="4" fill="${t.metal}" stroke="${t.ink}" stroke-width="${LW.detail}"/><circle cx="${f(x + w / 2)}" cy="${f(y + 79)}" r="3" fill="${t.ink}"/>`);
  return o.join('');
}

/** Hover card anchored to a part by a tail: what it is, what it pays right now and why, how to change it. */
export function tooltip(t: Theme, x: number, y: number, w: number, anchor: Pt, c: {
  id: PartId; title: string; chip: string; level: number; now: string; math: [string, string][]; recipe: string[]; stats: string; dial: [string, number, string, string]; keys: string;
}) {
  const h = 306, o: string[] = [], head = 52, pad = 18;
  const tailY = y + head + 44;
  o.push(`<path d="${poly([[x, tailY - 14], anchor, [x, tailY + 14]])}" fill="${t.ink}" stroke="${t.ink}" stroke-width="${LW.frame * 2}" stroke-linejoin="round"/>`);
  o.push(card(t, x, y, w, h, t.paper, 16));
  o.push(`<path d="${poly([[x + 2, tailY - 11], [anchor[0] + 7, anchor[1]], [x + 2, tailY + 11]])}" fill="${t.paper}"/>`);
  const role = t.role[c.id] === t.paper ? t.accent : t.role[c.id];
  o.push(`<path d="M${f(x + 1.75)} ${f(y + head)}V${f(y + 16)}A14.25 14.25 0 0 1 ${f(x + 16)} ${f(y + 1.75)}H${f(x + w - 16)}A14.25 14.25 0 0 1 ${f(x + w - 1.75)} ${f(y + 16)}V${f(y + head)}Z" fill="${role}"/><path d="M${f(x)} ${f(y + head)}H${f(x + w)}" stroke="${t.ink}" stroke-width="${LW.widget}"/>`);
  o.push(text(t, x + pad, y + head / 2, c.title, 24, { w: 700, mid: true }));
  const pipsW = 5 * 11, chipW = 70, chipX = x + w - pad - pipsW - 10 - chipW;
  o.push(`<rect x="${f(chipX)}" y="${f(y + head / 2 - 12)}" width="${chipW}" height="24" rx="12" fill="${t.paper}" stroke="${t.ink}" stroke-width="${LW.detail}"/>` + text(t, chipX + chipW / 2, y + head / 2, c.chip, 13, { w: 800, anchor: 'middle', mid: true }));
  for (let i = 0; i < 5; i++) o.push(`<circle cx="${f(x + w - pad - pipsW + 5 + i * 11)}" cy="${f(y + head / 2)}" r="4.5" fill="${i < c.level ? t.role.coin : t.paper}" stroke="${t.ink}" stroke-width="1.6"/>`);
  o.push(text(t, x + pad, y + head + 26, c.now, 21, { w: 700, mid: true }));
  // the math as chips, spread across the full width
  const gap = 8, cw = (w - pad * 2 - gap * (c.math.length - 1)) / c.math.length;
  c.math.forEach(([v, lab], i) => {
    const cx = x + pad + i * (cw + gap);
    o.push(`<rect x="${f(cx)}" y="${f(y + head + 46)}" width="${f(cw)}" height="44" rx="10" fill="${mix(t.paper, t.shadeTint, 0.08)}" stroke="${t.ink}" stroke-width="${LW.detail}"/>`);
    o.push(text(t, cx + cw / 2, y + head + 63, v, 17, { w: 800, anchor: 'middle', mid: true }) + text(t, cx + cw / 2, y + head + 80, lab, 11, { w: 600, anchor: 'middle', mid: true, fill: faint(t) }));
  });
  const ry = y + head + 112;
  o.push(`<rect x="${f(x + pad)}" y="${f(ry)}" width="4" height="${c.recipe.length * 20 - 4}" rx="2" fill="${role}"/>`);
  c.recipe.forEach((r, k) => o.push(text(t, x + pad + 12, ry + 8 + k * 20, r, 14.5, { w: 600, mid: true })));
  const sy = ry + c.recipe.length * 20 + 14;
  o.push(text(t, x + pad, sy, c.stats, 13.5, { w: 700, mid: true, fill: faint(t) }));
  const dy = sy + 30, sx = x + pad + 44, sw = w - pad * 2 - 44;
  o.push(text(t, x + pad, dy, c.dial[0], 14, { w: 800, mid: true }));
  o.push(`<rect x="${f(sx)}" y="${f(dy - 5)}" width="${f(sw)}" height="10" rx="5" fill="${mix(t.paper, t.shadeTint, 0.15)}" stroke="${t.ink}" stroke-width="${LW.detail}"/><circle cx="${f(sx + sw * c.dial[1])}" cy="${f(dy)}" r="9" fill="${role}" stroke="${t.ink}" stroke-width="${LW.widget}"/>`);
  o.push(text(t, sx, dy + 20, c.dial[2], 11.5, { w: 600, mid: true, fill: faint(t) }) + text(t, sx + sw, dy + 20, c.dial[3], 11.5, { w: 600, mid: true, fill: faint(t), anchor: 'end' }));
  o.push(`<path d="M${f(x + 14)} ${f(y + h - 30)}H${f(x + w - 14)}" stroke="${t.ink}" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.45"/>`);
  o.push(text(t, x + w / 2, y + h - 15, c.keys, 12, { w: 600, mid: true, fill: faint(t), anchor: 'middle' }));
  return o.join('');
}

export const wrapText = (s: string, n: number) => s.split(' ').reduce<string[]>((a, w) => {
  if (!a.length || (a[a.length - 1] + ' ' + w).length > n) a.push(w); else a[a.length - 1] += ' ' + w;
  return a;
}, []);

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
