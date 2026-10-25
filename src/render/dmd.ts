// The dot-matrix display on the backbox. Text is rasterised from a bold face into a grid of lit dots (a thin dot
// font was hard to read). Three kinds of line: the idle line (the live score while you play), comments that
// scroll in from the right, hold for a moment and clear, and flashes that blink up at once for hits.
import { Container, Graphics } from 'pixi.js';
import { mix, type Theme } from './theme';

const ROWS = 13;
const SPEED = 70; // dots per second
const HOLD = 1.8; // seconds a comment stays once it has settled
const FLASH_HOLD = 0.55;

interface Line { text: string; bits: Uint8Array; w: number; trimmed: number }

export class DotMatrix {
  readonly view = new Container();
  private unlit = new Graphics();
  private lit = new Graphics();
  private rect = { x: 0, y: 0, w: 0, h: 0 };
  private pitch = 4;
  private cols = 0;
  private idleLine: Line | null = null;
  private msg: { line: Line; kind: 'say' | 'flash'; offset: number; hold: number; age: number } | null = null;
  private drawn = '';
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
    const g = this.unlit, rad = this.pitch * 0.36;
    g.clear();
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < this.cols; c++) g.circle(this.cx(c), this.cy(row), rad);
    g.fill({ color: mix(this.theme.screen, this.theme.dmd, 0.14) });
    this.drawn = '';
  }

  private cx(c: number) { return this.rect.x + (this.rect.w - this.cols * this.pitch) / 2 + (c + 0.5) * this.pitch; }
  private cy(r: number) { return this.rect.y + (r + 0.5) * this.pitch; }

  private raster(text: string): Line {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const font = `800 ${Math.round(ROWS * 0.95)}px Nunito, system-ui, sans-serif`;
    ctx.font = font;
    const w = Math.max(1, Math.ceil(ctx.measureText(text).width + text.length * 1.2) + 2);
    cv.width = w; cv.height = ROWS;
    ctx.font = font;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '1.2px';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 1, ROWS / 2 + 1);
    const data = ctx.getImageData(0, 0, w, ROWS).data;
    const bits = new Uint8Array(w * ROWS);
    let last = 0;
    for (let i = 0; i < w * ROWS; i++) if ((bits[i] = data[i * 4 + 3] > 110 ? 1 : 0)) last = Math.max(last, i % w);
    return { text, bits, w, trimmed: last + 1 };
  }

  private centre(l: Line) { return Math.floor((this.cols - l.trimmed) / 2); }

  /** What the screen shows when nothing is being said (the score while you play). */
  idle(text: string) {
    if (this.idleLine?.text === text) return;
    this.idleLine = this.raster(text);
  }

  /** A comment: it scrolls in from the right, holds for a moment, then the screen goes back to idle. */
  say(text: string) {
    const line = this.raster(text);
    this.msg = { line, kind: 'say', offset: this.calm ? this.centre(line) : this.cols, hold: HOLD, age: 0 };
  }

  /** A hit: the text blinks up at once in the middle. It does not cut off a comment that is still arriving. */
  pop(text: string) {
    if (this.msg?.kind === 'say' && this.msg.age < 1.2) return;
    const line = this.raster(text);
    this.msg = { line, kind: 'flash', offset: this.centre(line), hold: FLASH_HOLD, age: 0 };
  }

  /** The tilt warning: the whole screen flashes. */
  flash() { if (!this.calm) this.flashT = 0.45; }

  get showing() { return this.msg?.line.text ?? this.idleLine?.text ?? ''; }

  update(dt: number) {
    const m = this.msg;
    let line = this.idleLine, off = line ? this.centre(line) : 0, blank = false;
    if (m) {
      m.age += dt;
      const rest = this.centre(m.line), ticker = m.line.trimmed > this.cols - 2;
      if (m.kind === 'say' && ticker) {
        // too long for the screen: it crosses once, right to left, then goes
        m.offset -= SPEED * dt;
        if (m.offset < -m.line.trimmed) this.msg = null;
      } else if (m.offset > rest) m.offset = Math.max(rest, m.offset - SPEED * dt);
      else {
        m.hold -= dt;
        if (m.hold <= 0) this.msg = null;
      }
      if (this.msg) {
        line = m.line; off = Math.round(m.offset);
        // a flash blinks twice as it lands
        if (m.kind === 'flash' && m.age < 0.24) blank = Math.floor(m.age / 0.06) % 2 === 1;
      }
    }
    let flashOn = false;
    if (this.flashT > 0) { this.flashT -= dt; flashOn = Math.floor(this.flashT / 0.075) % 2 === 0; }
    const key = `${line?.text ?? ''}|${off}|${blank}|${flashOn}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const g = this.lit, rad = this.pitch * 0.42;
    g.clear();
    if (flashOn) {
      for (let row = 0; row < ROWS; row++) for (let c = 0; c < this.cols; c++) g.circle(this.cx(c), this.cy(row), rad);
      g.fill({ color: this.theme.dmd, alpha: 0.85 });
      return;
    }
    if (!line || blank) return;
    let any = false;
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < this.cols; c++) {
      const sx = c - off;
      if (sx < 0 || sx >= line.w || !line.bits[row * line.w + sx]) continue;
      g.circle(this.cx(c), this.cy(row), rad);
      any = true;
    }
    if (any) g.fill({ color: this.theme.dmd });
  }
}
