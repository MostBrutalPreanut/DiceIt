// The scoreboard's instruments and the page's backdrop, as small DOM builders. They take their colours
// from the theme's CSS custom properties (or the theme row, for the SVG ones), so a theme switch is a
// matter of setting the variables and rebuilding the few SVGs.
import { mix, roleFill, type Theme } from '../render/theme';

/** Score on rolling odometer drums: one drum per character, digits roll on a strip, the width never wobbles. */
export class Odometer {
  private text = '';
  constructor(private el: HTMLElement) {}
  set(text: string) {
    if (text === this.text) return;
    const old = this.text;
    this.text = text;
    if (old.length !== text.length) {
      this.el.style.setProperty('--dw', `${Math.max(22, Math.min(38, Math.floor(240 / Math.max(1, text.replace(/,/g, '').length + text.split(',').length * 0.3))))}px`);
      this.el.innerHTML = [...text].map((ch) => /\d/.test(ch)
        ? `<span class="drum"><span class="strip">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`
        : `<span class="drum sep"><span>${ch}</span></span>`).join('');
    }
    [...text].forEach((ch, i) => {
      if (!/\d/.test(ch)) return;
      const strip = this.el.children[i]?.querySelector('.strip') as HTMLElement | null;
      if (strip) strip.style.transform = `translateY(${-Number(ch) * 52}px)`;
    });
  }
}

/** Mult as a pressure dial: face, zones, ticks and needle all share one centre, the pivot. */
export class MultDial {
  private max = 3;
  private value = 1;
  constructor(private el: HTMLElement) {}
  build(t: Theme) {
    const cx = 50, cy = 50, R = 44, max = this.max;
    const a = (v: number) => Math.PI + ((Math.min(v, max) - 1) / (max - 1)) * Math.PI;
    const arc = (v0: number, v1: number, r0: number, r1: number) => {
      const pts: string[] = [];
      for (let i = 0; i <= 16; i++) { const q = a(v0 + ((v1 - v0) * i) / 16); pts.push(`${(cx + Math.cos(q) * r1).toFixed(1)} ${(cy + Math.sin(q) * r1).toFixed(1)}`); }
      for (let i = 16; i >= 0; i--) { const q = a(v0 + ((v1 - v0) * i) / 16); pts.push(`${(cx + Math.cos(q) * r0).toFixed(1)} ${(cy + Math.sin(q) * r0).toFixed(1)}`); }
      return 'M' + pts.join('L') + 'Z';
    };
    const z1 = 1 + (max - 1) * 0.3, z2 = 1 + (max - 1) * 0.65;
    const zones = ([[1, z1, roleFill(t, 'lane')], [z1, z2, t.role.coin], [z2, max, t.accent]] as const)
      .map(([v0, v1, c]) => `<path d="${arc(v0, v1, R * 0.66, R * 0.86)}" fill="${c}" stroke="${t.ink}" stroke-width="1.8"/>`).join('');
    let ticks = '';
    const stepV = max <= 3 ? 0.5 : max <= 5 ? 1 : 2;
    for (let v = 1; v <= max + 1e-9; v += stepV) { const q = a(v); ticks += `<path d="M${(cx + Math.cos(q) * R * 0.5).toFixed(1)} ${(cy + Math.sin(q) * R * 0.5).toFixed(1)}L${(cx + Math.cos(q) * R * 0.6).toFixed(1)} ${(cy + Math.sin(q) * R * 0.6).toFixed(1)}" stroke="${t.ink}" stroke-width="2" stroke-linecap="round"/>`; }
    this.el.innerHTML = `<svg viewBox="0 0 100 60"><path d="M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}V${cy + 9}H${cx - R}Z" fill="${t.paper}" stroke="${t.ink}" stroke-width="2.5" stroke-linejoin="round"/>${zones}${ticks}
      <g class="needle"><path d="M${cx} ${cy - 4.5}L${cx - R * 0.8} ${cy}L${cx} ${cy + 4.5}Z" fill="${t.ink}"/></g><circle cx="${cx}" cy="${cy}" r="7" fill="${t.accent}" stroke="${t.ink}" stroke-width="1.8"/></svg>`;
    this.apply();
  }
  set(v: number, t: Theme) {
    const max = v <= 3 ? 3 : v <= 5 ? 5 : 10;
    this.value = v;
    if (max !== this.max) { this.max = max; this.build(t); }
    else this.apply();
  }
  private apply() {
    const deg = ((Math.min(this.value, this.max) - 1) / (this.max - 1)) * 180;
    const n = this.el.querySelector('.needle') as SVGGElement | null;
    if (n) { n.style.transform = `rotate(${deg}deg)`; this.el.style.setProperty('--needle', `rotate(${deg}deg)`); }
  }
  kick() {
    this.el.classList.remove('kick');
    void this.el.offsetWidth;
    this.el.classList.add('kick');
  }
}

/** Fills each `.bulbs` row with bulbs; the chase is driven by `chase()` (and stops in Calm mode). */
export function makeBulbs(root: ParentNode) {
  for (const row of root.querySelectorAll<HTMLElement>('.bulbs')) {
    const n = Math.max(7, Math.round(row.getBoundingClientRect().width / 22) || 13);
    row.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i % 2 ? 'on' : ''}"></i>`).join('');
  }
}
export function chase(root: ParentNode, phase: number) {
  for (const row of root.querySelectorAll<HTMLElement>('.bulbs')) {
    row.querySelectorAll('i').forEach((b, i) => b.classList.toggle('on', (i + phase) % 2 === 0));
  }
}

// ---- the drifting backdrop (art-direction §10) ----------------------------------------------------------
// Hand-drawn marks one tone darker than the page, in one seamless tile that drifts exactly one tile per loop.
// It is a CSS layer rather than a canvas sprite because it sits behind the HTML panels too.

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function backdropTile(t: Theme): { svg: string; w: number; h: number; dx: number; dy: number } {
  const ink = mix(t.bg, t.shadeTint, 0.17), TAU = Math.PI * 2;
  const line = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L');
  const o: string[] = [];
  let w = 180, h = 180, dx = 180, dy = -180;
  if (t.backdrop === 'waves') {
    w = 240; h = 162; dx = 240; dy = 0;
    for (let y0 = 27; y0 < h; y0 += 54) {
      const pts: [number, number][] = [];
      for (let x = 0; x <= w; x += 6) pts.push([x, y0 + Math.sin((x / w) * TAU + y0 * 0.03) * 9 + Math.sin((x / w) * TAU * 4) * 2.5]);
      o.push(`<path d="${line(pts)}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`);
    }
  } else {
    const curls = t.backdrop === 'curls';
    w = h = curls ? 260 : 180; dx = w; dy = curls ? 0 : -h;
    const rnd = rng(curls ? 5 : 3), n = curls ? 2 : 4;
    const marks = Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h, a: rnd() * 180, len: 50 + rnd() * 40, ph: rnd() * TAU }));
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) for (const m of marks) {
      const cx = m.x + ox, cy = m.y + oy;
      if (curls) {
        // a soft smoke curl: a tapered ribbon, no outline
        const pts: [number, number][] = Array.from({ length: 24 }, (_, i) => { const u = i / 23; return [cx - 70 + u * 150 + Math.sin(u * Math.PI * 2.3) * 26 * u, cy + 30 - u * 150 * 0.55 - Math.cos(u * Math.PI * 2.3) * 26 * 0.4 * u]; });
        const L: [number, number][] = [], R: [number, number][] = [];
        pts.forEach((p, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const ddx = b[0] - a[0], ddy = b[1] - a[1], len = Math.hypot(ddx, ddy) || 1, hw = (14 + (2 - 14) * (i / 23)) / 2;
          L.push([p[0] - (ddy / len) * hw, p[1] + (ddx / len) * hw]);
          R.push([p[0] + (ddy / len) * hw, p[1] - (ddx / len) * hw]);
        });
        o.push(`<path d="${line([...L, ...R.reverse()])}Z" fill="${ink}"/>`);
      } else {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 24; i++) {
          const s = i / 24 - 0.5, px = s * m.len, py = Math.sin(s * TAU * 1.6 + m.ph) * 6, a = (m.a * Math.PI) / 180;
          pts.push([cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)]);
        }
        o.push(`<path d="${line(pts)}" fill="none" stroke="${ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    }
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${o.join('')}</svg>`, w, h, dx, dy };
}

/** Puts the theme's backdrop tile on the page and gives it a drift of exactly one tile per loop. */
export function applyBackdrop(t: Theme) {
  const el = document.getElementById('backdrop')!;
  const tile = backdropTile(t);
  el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(tile.svg)}")`;
  Object.assign(el.style, { left: `${-tile.w}px`, top: `${-tile.h}px`, right: `${-tile.w}px`, bottom: `${-tile.h}px` });
  let st = document.getElementById('driftStyle') as HTMLStyleElement | null;
  if (!st) { st = document.createElement('style'); st.id = 'driftStyle'; document.head.appendChild(st); }
  st.textContent = `@keyframes drift { from { transform: translate(0, 0); } to { transform: translate(${tile.dx}px, ${tile.dy}px); } }`;
}
