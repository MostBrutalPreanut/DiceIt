// A transparent Pixi layer over the whole page, above the HTML panels, for the effects that fly between
// the table and the panels: a coin flies from the bumper that paid it to the money stack, a Mult stamp
// flies to the Mult dial. Every effect points at its cause and its consequence (art-direction §5.4).
import { Application, Container, Graphics } from 'pixi.js';
import { flat, label, star } from './draw';
import { mix, type Theme } from './theme';

interface Flight {
  c: Container;
  from: { x: number; y: number };
  to: () => { x: number; y: number } | null;
  age: number;
  hold: number;
  dur: number;
  coin: boolean;
  onLand?: () => void;
  r: number;
}

/** The centre of an element in client pixels (null if it is not on screen). */
export function rectCentre(el: Element | null): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export class FxOverlay {
  app = new Application();
  private flights: Flight[] = [];
  calm = false;
  ready = false;

  constructor(private theme: Theme) {}

  async init() {
    await this.app.init({ backgroundAlpha: 0, resizeTo: window, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    const cv = this.app.canvas;
    cv.id = 'fxOverlay';
    Object.assign(cv.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '40' });
    document.body.appendChild(cv);
    this.app.ticker.add((tk) => this.update(Math.min(0.05, tk.deltaMS / 1000)));
    this.ready = true;
  }

  setTheme(t: Theme) { this.theme = t; }

  get busy() { return this.flights.length; }

  private coinG(r: number) {
    const t = this.theme, g = new Graphics();
    g.ellipse(r * 0.12, 0, r, r).fill(mix(t.role.coin, t.shadeTint, 0.4)).stroke({ width: 2.2, color: t.ink });
    g.ellipse(0, 0, r, r).fill(t.role.coin).stroke({ width: 2.2, color: t.ink });
    const c = new Container();
    c.addChild(g);
    const d = label('$', r * 1.1, t.ink);
    c.addChild(d);
    return c;
  }

  private stampG(text: string, color: string, R: number) {
    const t = this.theme, g = new Graphics();
    g.poly(flat(star(0, 0, R * 1.25, R * 1.02, 14))).fill(color).stroke({ width: 3, color: t.ink, join: 'round' });
    g.circle(0, 0, R * 0.8).fill(t.paper).stroke({ width: 2.5, color: t.ink });
    const c = new Container();
    c.addChild(g, label(text, R * 0.62, t.ink));
    return c;
  }

  /** A coin pops out of the part (client point) and flies to the money stack, landing with a tick. */
  coin(from: { x: number; y: number }, to: () => { x: number; y: number } | null, onLand?: () => void, delay = 0) {
    if (!this.ready || this.flights.length > 24) { onLand?.(); return; }
    const c = this.coinG(11);
    c.position.set(from.x, from.y);
    c.visible = false;
    this.app.stage.addChild(c);
    this.flights.push({ c, from, to, age: -delay, hold: 0.12, dur: 0.6, coin: true, onLand, r: 11 });
  }

  /** A Mult stamp slaps down by the part, settles, then flies to the Mult dial and kicks its needle. */
  stamp(text: string, color: string, from: { x: number; y: number }, to: () => { x: number; y: number } | null, big: boolean, onLand?: () => void) {
    if (!this.ready || this.flights.length > 24) { onLand?.(); return; }
    const R = big ? 30 : 20;
    const c = this.stampG(text, color, R);
    c.position.set(from.x, from.y);
    c.rotation = ((Math.random() * 16 - 8) * Math.PI) / 180;
    this.app.stage.addChild(c);
    this.flights.push({ c, from, to, age: 0, hold: big ? 0.45 : 0.3, dur: 0.55, coin: false, onLand, r: R });
  }

  clear() {
    for (const f of this.flights) f.c.destroy({ children: true });
    this.flights = [];
  }

  private update(dt: number) {
    for (const f of this.flights) {
      f.age += dt;
      if (f.age < 0) continue;
      f.c.visible = true;
      const to = f.to() ?? f.from;
      if (f.age < f.hold) {
        // pop out: a little hop above where it came from (coins), or a slap down at 1.3x (stamps)
        const u = f.age / f.hold;
        if (f.coin) { f.c.position.set(f.from.x, f.from.y - Math.sin(u * Math.PI / 2) * 18); f.c.scale.set(0.45 + u * 0.7, 0.45 + u * 0.7); }
        else f.c.scale.set(u < 0.3 ? 1.3 - u : 1);
        continue;
      }
      const u = Math.min(1, (f.age - f.hold) / f.dur);
      const sx = f.from.x, sy = f.from.y - (f.coin ? 18 : 0);
      // a quadratic arc that bows upwards, so a coin never cuts straight across the text
      const cx = (sx + to.x) / 2, cy = Math.min(sy, to.y) - 80;
      const a = (1 - u) ** 2, b = 2 * u * (1 - u), c = u * u;
      f.c.position.set(a * sx + b * cx + c * to.x, a * sy + b * cy + c * to.y);
      if (f.coin) {
        // the flip is a squash in x on a 12 fps step
        const step = Math.floor((f.age * 12) % 4);
        f.c.scale.set([1, 0.5, 0.12, 0.5][step] * 1.15, 1.15);
      } else f.c.scale.set(1 - u * 0.55);
      if (u >= 1) {
        f.onLand?.();
        f.onLand = undefined;
        f.age = Infinity;
      }
    }
    this.flights = this.flights.filter((f) => {
      if (f.age === Infinity) { f.c.destroy({ children: true }); return false; }
      return true;
    });
  }
}
