// The dot-matrix display on the backbox. Text is rasterised from a bold face into a grid of lit dots (a thin dot
// font was hard to read), new messages scroll in from the right one dot at a time and settle in the middle,
// and messages too long for the screen keep scrolling right to left like a ticker.
import { Container, Graphics } from 'pixi.js';
import { mix, type Theme } from './theme';

const ROWS = 13;
const SPEED = 60; // dots per second

export class DotMatrix {
  readonly view = new Container();
  private unlit = new Graphics();
  private lit = new Graphics();
  private rect = { x: 0, y: 0, w: 0, h: 0 };
  private pitch = 4;
  private cols = 0;
  private bits = new Uint8Array(0);
  private tw = 0;
  private offset = 0;
  private drawn = NaN;
  private text = '';
  private flashT = 0;
  calm = false;

  constructor(private theme: Theme) {
    this.view.addChild(this.unlit, this.lit);
  }

  setTheme(t: Theme) { this.theme = t; this.layout(this.rect); }

  /** Where the screen is (machine-space pixels); rebuilds the grid of dots. */
  layout(r: { x: number; y: number; w: number; h: number }) {
    this.rect = r;
    this.pitch = r.h / ROWS;
    this.cols = Math.max(1, Math.floor(r.w / this.pitch));
    const g = this.unlit, t = this.theme, rad = this.pitch * 0.36;
    g.clear();
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < this.cols; c++) g.circle(this.cx(c), this.cy(row), rad);
    g.fill({ color: mix(t.screen, t.dmd, 0.14) });
    if (this.text) this.raster(this.text);
    this.drawn = NaN;
  }

  private cx(c: number) { return this.rect.x + (this.rect.w - this.cols * this.pitch) / 2 + (c + 0.5) * this.pitch; }
  private cy(r: number) { return this.rect.y + (r + 0.5) * this.pitch; }

  private raster(text: string) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const font = `800 ${Math.round(ROWS * 0.95)}px Nunito, system-ui, sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width + text.length * 1.2) + 2;
    cv.width = w; cv.height = ROWS;
    ctx.font = font;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '1.2px';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 1, ROWS / 2 + 1);
    const data = ctx.getImageData(0, 0, w, ROWS).data;
    this.bits = new Uint8Array(w * ROWS);
    for (let i = 0; i < w * ROWS; i++) this.bits[i] = data[i * 4 + 3] > 110 ? 1 : 0;
    // trim empty columns at the end so centring is true
    let last = 0;
    for (let x = 0; x < w; x++) for (let y = 0; y < ROWS; y++) if (this.bits[y * w + x]) last = x;
    this.tw = w;
    this.trimmed = last + 1;
  }
  private trimmed = 0;

  /** A new message scrolls in from the right edge. */
  say(text: string) {
    this.text = text;
    this.raster(text);
    this.offset = this.calm ? this.rest() : this.cols;
    this.drawn = NaN;
  }

  /** The tilt warning: the screen flashes. */
  flash() { if (!this.calm) this.flashT = 0.45; }

  private rest() { return Math.floor((this.cols - this.trimmed) / 2); }
  private get ticker() { return this.trimmed > this.cols - 2; }

  update(dt: number) {
    const rest = this.rest();
    if (this.ticker) {
      this.offset -= SPEED * dt;
      if (this.offset < -this.trimmed - 4) this.offset = this.cols;
    } else if (this.offset > rest) this.offset = Math.max(rest, this.offset - SPEED * dt);
    let flashOn = false;
    if (this.flashT > 0) { this.flashT -= dt; flashOn = Math.floor(this.flashT / 0.075) % 2 === 0; }
    const at = Math.round(this.offset) + (flashOn ? 0.5 : 0);
    if (at === this.drawn) return;
    this.drawn = at;
    const g = this.lit, t = this.theme, rad = this.pitch * 0.42, off = Math.round(this.offset);
    g.clear();
    if (flashOn) {
      for (let row = 0; row < ROWS; row++) for (let c = 0; c < this.cols; c++) g.circle(this.cx(c), this.cy(row), rad);
      g.fill({ color: t.dmd, alpha: 0.85 });
      return;
    }
    let any = false;
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < this.cols; c++) {
      const sx = c - off;
      if (sx < 0 || sx >= this.tw || !this.bits[row * this.tw + sx]) continue;
      g.circle(this.cx(c), this.cy(row), rad);
      any = true;
    }
    if (any) g.fill({ color: t.dmd });
  }
}
