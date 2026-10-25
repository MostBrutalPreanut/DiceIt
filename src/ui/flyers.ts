// Points and coins that fly from the part that earned them to where they are counted (art-direction §5.4:
// every effect points at its cause and its consequence). A hit throws a burst of sticker chips in the part's
// colour that arc to the score dock beside the table; the dock's drums count them in as they land and bump.
// Coins fly to the money stack, which bounces and ticks. The chips run in one pooled ParticleContainer on
// the page-wide FX overlay, so multiball with many hits stays cheap.
//
// The score dock sits next to the backbox while you play when there is room for it (wide screens), and
// otherwise on top of the machine like a topper, all the time (so the table keeps one size).
import { Container, Graphics, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import type { PartId } from '../data/parts';
import type { ScoreEvent } from '../game/scoring';
import { flat, label, star } from '../render/draw';
import type { FxOverlay } from '../render/overlay';
import type { Renderer } from '../render/renderer';
import { CAB, RIM } from '../render/scene';
import { mix, roleFill, type Theme } from '../render/theme';

/** What the HUD knows each frame; the dock shows it (the score lags until its chips land). */
export interface DockFeed {
  /** Changes when a new round starts (the scorer): chips still flying from the last one are dropped. */
  round: unknown;
  score: number;
  goal: number;
  mult: number;
  /** Money as the HUD would show it before coins in flight are taken off; null in the Test Lab ($∞). */
  money: number | null;
  playing: boolean;
  theme: Theme;
}

type Pt = { x: number; y: number };

// ---- the toggle a graphics setting can flip ----------------------------------------------------------------
let flyOn = true;
const listeners = new Set<() => void>();
/** Flying points and coins on or off (a "low graphics" setting). Off: the counters update at once, nothing flies. */
export function setFlyEffects(on: boolean) { flyOn = on; for (const f of listeners) f(); }
export const flyEffects = () => flyOn;

const reduceMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

const MAX_CHIPS = 160;
const MAX_COINS = 24;
const MAX_RINGS = 14;
/** The side dock's width range: it takes the room beside the backbox, up to the larger one. */
const DOCK_MIN = 160, DOCK_MAX = 220;
const CELL = 64, R0 = 22;

interface Chip { p: Particle; tr: Particle; on: boolean; age: number; delay: number; dur: number; x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; jx: number; jy: number; size: number; spin: number; pts: number; px: number; py: number }
interface Coin { p: Particle; on: boolean; age: number; delay: number; from: Pt; jx: number }
interface Ring { p: Particle; on: boolean; age: number; life: number; x: number; y: number; size: number }

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
/** The share of a chip's flight spent bursting out of the part. */
const POP = 0.2;

/** A damped spring for the "bump" of a counter: kick() adds velocity, step() returns the scale offset. */
class Bump {
  x = 0; v = 0;
  kick(a: number) { this.v += a; }
  step(dt: number) {
    const h = Math.min(dt, 1 / 30);
    this.v += (-420 * this.x - 20 * this.v) * h;
    this.x = Math.max(-0.1, Math.min(0.24, this.x + this.v * h));
    if (Math.abs(this.x) < 1e-4 && Math.abs(this.v) < 1e-3) { this.x = 0; this.v = 0; }
    return this.x;
  }
}

/** The dock's own drums: one per digit, a strip of 0-9 moved by percent so any drum size works. */
class Drums {
  private text = '';
  constructor(private el: HTMLElement, private width: () => number) {}
  set(score: number) {
    const text = String(Math.max(0, Math.floor(score))).padStart(4, '0');
    if (text === this.text) return;
    const grow = text.length !== this.text.length;
    this.text = text;
    if (grow) {
      const n = text.length, w = this.width();
      const dw = Math.max(13, Math.min(30, Math.floor((w - 12 - (n - 1) * 3) / n)));
      this.el.style.setProperty('--ddw', `${dw}px`);
      this.el.innerHTML = [...text].map(() => `<span class="ddrum"><span class="dstrip">${[...'0123456789'].map((d) => `<span>${d}</span>`).join('')}</span></span>`).join('');
    }
    [...text].forEach((ch, i) => {
      const strip = this.el.children[i]?.firstElementChild as HTMLElement | null;
      if (strip) strip.style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
  }
  reset() { this.text = ''; }
}

export class Flyers {
  private pc: ParticleContainer;
  private atlas: Texture | null = null;
  private tex = new Map<string, Texture>();
  private chips: Chip[] = [];
  private coins: Coin[] = [];
  private rings: Ring[] = [];
  private themeId = '';
  private theme: Theme | null = null;
  private feed: DockFeed | null = null;
  private round: unknown = null;
  /** Points thrown but not landed yet: the dock shows the score without them. */
  private owed = 0;
  private shown = 0;
  private lastMult = 1;
  private live = 0;
  private coinsLive = 0;
  private scoreBump = new Bump();
  private multBump = new Bump();
  private moneyBump = new Bump();
  private stackBump = new Bump();
  // the dock
  readonly dock: HTMLElement;
  private drums: Drums;
  private odoEl: HTMLElement;
  private multEl: HTMLElement;
  private moneyEl: HTMLElement;
  private stackEl: HTMLElement;
  private tickEl: HTMLElement;
  private goalEl: HTMLElement;
  private mode: 'side' | 'top' = innerWidth > 1000 ? 'side' : 'top';
  private dockW = DOCK_MIN;
  private want: { mode: 'side' | 'top'; n: number } = { mode: 'top', n: 0 };
  private sizeKey = '';
  private shownKey = '';
  /** Targets measured once a frame. */
  private aim: { score: Pt | null; money: Pt | null; stackEl: HTMLElement | null } = { score: null, money: null, stackEl: null };
  private tickN = 0;
  /** How wide the drums are: chips land spread across them. */
  private aimW = 60;
  private tickT = 0;

  constructor(private overlay: FxOverlay, private renderer: Renderer, private opts: { coinLand?: () => void } = {}) {
    this.pc = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true } });
    overlay.app.stage.addChildAt(this.pc, 0);
    // the dock: a small scoreboard housing in the centre column
    const d = document.createElement('div');
    d.id = 'scoreDock';
    d.className = innerWidth > 1000 ? 'side' : 'top';
    d.dataset.tip = 'score';
    d.innerHTML = `<div class="dinner"><div class="dhead"><span class="lbl">Score</span><b class="dmult disp">×1.00</b></div>
      <div class="dodo"></div>
      <div class="dgoal"><i></i></div>
      <span class="dmoney"><span class="coins"><i></i><i></i><i></i></span><b class="disp">$0</b><span class="tick"></span></span></div>`;
    const center = document.getElementById('center')!;
    center.insertBefore(d, center.firstChild);
    this.dock = d;
    this.odoEl = d.querySelector('.dodo')!;
    this.multEl = d.querySelector('.dmult')!;
    this.moneyEl = d.querySelector('.dmoney b')!;
    this.stackEl = d.querySelector('.dmoney .coins')!;
    this.tickEl = d.querySelector('.dmoney .tick')!;
    this.goalEl = d.querySelector('.dgoal i')!;
    this.drums = new Drums(this.odoEl, () => (this.mode === 'side' ? this.dockW - 36 : Math.min(230, innerWidth - 200)));
    // the scoreboard's own score label goes when the dock takes over
    document.getElementById('score')?.previousElementSibling?.classList.add('scoreLbl');
    for (let i = 0; i < MAX_CHIPS; i++) {
      const p = new Particle({ texture: Texture.EMPTY, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
      const tr = new Particle({ texture: Texture.EMPTY, anchorX: 0.92, anchorY: 0.5, alpha: 0 });
      this.chips.push({ p, tr, on: false, age: 0, delay: 0, dur: 1, x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, jx: 0, jy: 0, size: 1, spin: 0, pts: 0, px: 0, py: 0 });
    }
    for (let i = 0; i < MAX_RINGS; i++) this.rings.push({ p: new Particle({ texture: Texture.EMPTY, anchorX: 0.5, anchorY: 0.5, alpha: 0 }), on: false, age: 0, life: 0.3, x: 0, y: 0, size: 1 });
    for (let i = 0; i < MAX_COINS; i++) this.coins.push({ p: new Particle({ texture: Texture.EMPTY, anchorX: 0.5, anchorY: 0.5, alpha: 0 }), on: false, age: 0, delay: 0, from: { x: 0, y: 0 }, jx: 0 });
    // trails under chips, rings and coins on top
    for (const c of this.chips) this.pc.addParticle(c.tr);
    for (const c of this.chips) this.pc.addParticle(c.p);
    for (const r of this.rings) this.pc.addParticle(r.p);
    for (const c of this.coins) this.pc.addParticle(c.p);
    overlay.app.ticker.add((tk) => this.update(Math.min(0.05, tk.deltaMS / 1000)));
    listeners.add(() => { if (!this.flying) this.dropAll(); });
    reduceMQ?.addEventListener?.('change', () => { if (!this.flying) this.dropAll(); });
  }

  /** Whether anything flies: off for reduced motion and when a graphics setting turns it off. */
  get flying() { return flyOn && !reduceMQ?.matches; }
  /** Coins on their way to the stack (the balance counts them when they land). */
  get coinsInFlight() { return this.coinsLive; }
  /** The score the dock shows right now (it trails the real score while chips fly). */
  get shownScore() { return this.shown; }

  // ---- the atlas: chips in every part's colour, a soft trail, a ring, a coin --------------------------------
  private bake(t: Theme) {
    this.theme = t;
    this.themeId = t.id;
    this.dropAll();
    for (const tx of this.tex.values()) tx.destroy(false);
    this.tex.clear();
    this.atlas?.destroy(true);
    const roles = Object.keys(t.role) as PartId[];
    const cells: { key: string; draw: (c: Container) => void }[] = [];
    const g = (c: Container) => { const x = new Graphics(); c.addChild(x); return x; };
    for (const r of roles) {
      const col = roleFill(t, r);
      // a four-point spark and a round chip, both stickers: role colour, ink outline, a paper glint
      cells.push({ key: `spark:${r}`, draw: (c) => { const x = g(c); x.poly(flat(star(0, 0, R0, R0 * 0.42, 4, -Math.PI / 2))).fill(col).stroke({ width: 3.4, color: t.ink, join: 'round' }); x.circle(-R0 * 0.08, -R0 * 0.12, R0 * 0.2).fill(t.paper); } });
      cells.push({ key: `chip:${r}`, draw: (c) => { const x = g(c); x.circle(0, 0, R0 * 0.62).fill(col).stroke({ width: 3.4, color: t.ink }); x.circle(-R0 * 0.2, -R0 * 0.2, R0 * 0.2).fill(t.paper); } });
    }
    // the trail is air: soft, white (tinted per chip), no outline
    cells.push({ key: 'trail', draw: (c) => { const x = g(c); for (let i = 0; i < 9; i++) { const u = i / 8; x.ellipse(-R0 * 0.9 * (1 - u) + R0 * 0.2, 0, R0 * (1.25 - u * 0.9), R0 * (0.36 - u * 0.2)).fill({ color: 0xffffff, alpha: 0.11 + u * 0.06 }); } } });
    // where a chip lands: a little twinkle (white, tinted with the chip's colour), not a ring over the digits
    cells.push({ key: 'ring', draw: (c) => { const x = g(c); x.poly(flat(star(0, 0, R0, R0 * 0.3, 4, -Math.PI / 2))).fill(0xffffff).stroke({ width: 3, color: t.ink, join: 'round' }); } });
    cells.push({ key: 'coin', draw: (c) => {
      const x = g(c), r = R0 * 0.62;
      x.ellipse(r * 0.14, 0, r, r).fill(mix(t.role.coin, t.shadeTint, 0.4)).stroke({ width: 2.6, color: t.ink });
      x.ellipse(0, 0, r, r).fill(t.role.coin).stroke({ width: 2.6, color: t.ink });
      c.addChild(label('$', r * 1.15, t.ink));
    } });
    const cols = 12, rows = Math.ceil(cells.length / cols);
    const root = new Container();
    cells.forEach((cell, i) => {
      const c = new Container();
      c.position.set((i % cols) * CELL + CELL / 2, Math.floor(i / cols) * CELL + CELL / 2);
      cell.draw(c);
      root.addChild(c);
    });
    this.atlas = this.overlay.app.renderer.generateTexture({ target: root, frame: new Rectangle(0, 0, cols * CELL, rows * CELL), resolution: 2, antialias: true });
    root.destroy({ children: true });
    cells.forEach((cell, i) => this.tex.set(cell.key, new Texture({ source: this.atlas!.source, frame: new Rectangle((i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL) })));
    this.pc.texture = this.tex.get('ring')!;
    const tr = this.tex.get('trail')!, ring = this.tex.get('ring')!, coin = this.tex.get('coin')!;
    for (const c of this.chips) c.tr.texture = tr;
    for (const r of this.rings) r.p.texture = ring;
    for (const c of this.coins) c.p.texture = coin;
  }

  // ---- the HUD feeds the dock every frame -------------------------------------------------------------------
  hud(f: DockFeed) {
    if (f.theme.id !== this.themeId) this.bake(f.theme);
    if (f.round !== this.round) {
      this.round = f.round;
      this.dropAll();
      this.shown = f.score;
      this.lastMult = f.mult;
    }
    if (f.mult > this.lastMult + 1e-9) this.multBump.kick(f.mult - this.lastMult >= 0.5 ? 2.4 : 1.2);
    this.lastMult = f.mult;
    this.feed = f;
  }

  /** A part scored: chips carry its points to the dock, coins its money to the stack. */
  onScore(s: ScoreEvent) {
    if (!this.feed || !this.theme) return;
    if (!this.flying) {
      if (s.money > 0) this.landCoin(s.money);
      if (s.points > 0) this.scoreBump.kick(1 + Math.log10(Math.max(10, s.points)) * 0.4);
      return;
    }
    const from = this.renderer.toClient(s.x, s.y, 1.1);
    if (s.points > 0) this.throwPoints(s, from);
    for (let i = 0; i < s.money; i++) this.throwCoin(from, i * 0.08);
  }

  private throwPoints(s: ScoreEvent, from: Pt) {
    const to = this.aim.score ?? this.scoreTarget();
    if (!to) return;
    const mag = Math.log10(Math.max(10, s.points)), bonus = s.kind === 'bonus';
    let n = Math.round((1.4 + mag * 1.35) * (bonus ? 1.6 : 1) * (this.overlay.calm ? 0.5 : 1));
    n = Math.max(1, Math.min(16, n, MAX_CHIPS - this.live));
    if (this.live >= MAX_CHIPS) {
      // the pool is full: the points ride on the chip that lands last, so the count still adds up
      let last: Chip | null = null;
      for (const c of this.chips) if (c.on && (!last || c.delay + c.dur - c.age > last.delay + last.dur - last.age)) last = c;
      if (last) { last.pts += s.points; this.owed += s.points; }
      return;
    }
    const size = Math.min(1.3, Math.max(0.5, 0.52 + (mag - 2) * 0.2)) * (bonus ? 1.25 : 1);
    const tint = roleFill(this.theme!, s.def);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const per = Math.floor(s.points / n);
    let rest = s.points - per * n;
    let made = 0;
    for (const c of this.chips) {
      if (made >= n) break;
      if (c.on) continue;
      const i = made++;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, burst = (34 + Math.random() * 46) * (0.7 + size * 0.5);
      c.on = true;
      this.live++;
      c.age = 0;
      c.delay = i * 0.018 + Math.random() * 0.02;
      c.dur = 0.4 + Math.min(0.32, dist / 2200) + Math.random() * 0.08;
      c.x0 = from.x + (Math.random() - 0.5) * 14; c.y0 = from.y + (Math.random() - 0.5) * 10;
      c.x1 = c.x0 + Math.cos(a) * burst; c.y1 = c.y0 + Math.sin(a) * burst;
      // from the top of the burst it swoops to the drums: the handle carries on outwards a little and is
      // pushed sideways, so every chip takes its own arc
      const nx = -(to.y - c.y0) / (dist || 1), ny = (to.x - c.x0) / (dist || 1), side = (Math.random() - 0.5) * Math.min(150, dist * 0.3);
      c.x2 = (c.x1 + to.x) / 2 + nx * side + (c.x1 - c.x0) * 0.7; c.y2 = (c.y1 + to.y) / 2 + ny * side + (c.y1 - c.y0) * 0.7;
      c.jx = (Math.random() - 0.5) * this.aimW * 0.7; c.jy = (Math.random() - 0.5) * 10;
      c.size = size * (i === 0 && (mag >= 3 || bonus) ? 1.45 : 0.8 + Math.random() * 0.35);
      c.spin = (Math.random() - 0.5) * 9;
      c.pts = per + rest; rest = 0;
      c.px = c.x0; c.py = c.y0;
      c.p.texture = this.tex.get(`${i % 3 === 1 ? 'chip' : 'spark'}:${s.def}`) ?? this.tex.get('ring')!;
      c.p.tint = 0xffffff;
      c.tr.tint = tint;
      c.p.alpha = c.tr.alpha = 0;
      this.owed += c.pts;
    }
  }

  private throwCoin(from: Pt, delay: number) {
    const c = this.coins.find((q) => !q.on);
    if (!c) { this.landCoin(1); return; }
    c.on = true;
    c.age = -delay;
    c.from = { x: from.x, y: from.y };
    c.jx = (Math.random() - 0.5) * 10;
    c.p.alpha = 0;
    this.coinsLive++;
  }

  /** The stack bounces and says +$n (a coin landed, or money came in with nothing flying). */
  private landCoin(n: number) {
    this.stackBump.kick(2.2);
    this.moneyBump.kick(1.6);
    this.opts.coinLand?.();
    const el = this.aim.stackEl ?? this.stackTarget().el;
    if (!el) return;
    el.classList.remove('land'); void el.offsetWidth; el.classList.add('land');
    // the +$ tick sits next to the stack the coin landed on, and counts up while coins keep coming
    const tick = el.parentElement?.querySelector<HTMLElement>('.tick');
    if (!tick) return;
    const now = performance.now();
    this.tickN = now - this.tickT < 700 ? this.tickN + n : n;
    this.tickT = now;
    tick.textContent = `+$${this.tickN}`;
    tick.classList.remove('go'); void tick.offsetWidth; tick.classList.add('go');
  }

  /** Where a Mult stamp should fly: the dock's Mult when it shows, else the scoreboard's dial. */
  multTarget(): Pt | null { return this.dockShown ? centre(this.multEl) : centre(document.getElementById('multDial')); }
  /** A stamp landed on the Mult: a big bump. */
  kickMult() { this.multBump.kick(3); }

  private get dockShown() { return this.mode === 'top' || !!this.feed?.playing; }
  private scoreTarget(): Pt | null { return this.dockShown ? centre(this.odoEl) : centre(document.getElementById('score')); }
  private stackTarget(): { at: Pt | null; el: HTMLElement | null } {
    const own = centre(this.stackEl);
    if (own) return { at: own, el: this.stackEl };
    const el = document.getElementById('coinStack');
    return { at: centre(el), el };
  }

  private dropAll() {
    for (const c of this.chips) { c.on = false; c.p.alpha = 0; c.tr.alpha = 0; }
    for (const r of this.rings) { r.on = false; r.p.alpha = 0; }
    for (const c of this.coins) if (c.on) { c.on = false; c.p.alpha = 0; }
    this.live = 0;
    this.owed = 0;
    this.coinsLive = 0;
  }

  // ---- where the dock goes ----------------------------------------------------------------------------------
  /** Beside the backbox when the side room fits it at the machine's full size, otherwise on top of the machine. */
  private place() {
    const center = document.getElementById('center'), stage = document.getElementById('stage');
    if (!center || !stage) return;
    const cr = center.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const key = `${innerWidth}x${innerHeight}|${Math.round(sr.width)}x${Math.round(sr.height)}|${this.renderer.view.S.toFixed(3)}|${this.mode}`;
    if (key === this.sizeKey && this.want.n === 0) { if (this.mode === 'side') this.position(cr); return; }
    this.sizeKey = key;
    let next: 'side' | 'top' = 'top';
    if (innerWidth > 1000) {
      // the machine is fitted to the stage: work out its size with the stage at full height (no topper)
      const S = this.renderer.view.S, wLimit = (sr.width - 12) / (RIM.hw * 2 + 1.6);
      const topH = this.mode === 'top' ? this.dock.offsetHeight + parseFloat(getComputedStyle(this.dock).marginBottom || '0') : 0;
      const heightLimited = S < wLimit - 1e-3;
      const Sfull = heightLimited ? Math.min(wLimit, ((sr.height + topH - 12) * S) / Math.max(1, sr.height - 12)) : S;
      const bbLeft = sr.left + sr.width / 2 - (RIM.hw - 0.8) * Sfull;
      if (bbLeft - 14 - (cr.left - 4) >= DOCK_MIN) next = 'side';
    }
    // a resize lays the machine out a frame later: a new mode has to hold for a few frames first
    if (next !== this.mode) {
      this.want = next === this.want.mode ? { mode: next, n: this.want.n + 1 } : { mode: next, n: 1 };
      if (this.want.n >= 4) { this.mode = next; this.want.n = 0; this.dock.className = next; this.drums.reset(); this.sizeKey = ''; }
    } else this.want.n = 0;
    this.drums.reset();
    if (this.mode === 'side') this.position(cr);
    else { this.dock.style.left = ''; this.dock.style.top = ''; this.dock.style.width = ''; }
  }

  private position(cr: DOMRect) {
    const v = this.renderer.view;
    const tl = this.renderer.toClient(RIM.cx - RIM.hw + 0.8, CAB.boxY + CAB.boxHH, CAB.wallH + CAB.boxScreenH / v.kz);
    const sr = document.getElementById('stage')!.getBoundingClientRect();
    // hug the backbox (not its shove): the machine's centre line is the stage's
    const bbLeft = sr.left + sr.width / 2 - (RIM.hw - 0.8) * v.S;
    const w = Math.max(DOCK_MIN, Math.min(DOCK_MAX, bbLeft - 14 - (cr.left - 4)));
    if (w !== this.dockW) { this.dockW = w; this.drums.reset(); }
    this.dock.style.width = `${Math.round(w)}px`;
    this.dock.style.left = `${Math.round(bbLeft - 14 - w - cr.left)}px`;
    this.dock.style.top = `${Math.round(Math.max(0, tl.y - cr.top))}px`;
  }

  // ---- every frame ------------------------------------------------------------------------------------------
  private update(dt: number) {
    const f = this.feed;
    if (!f) return;
    this.place();
    const shownNow = this.dockShown;
    const key = `${this.mode}|${shownNow}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.dock.classList.toggle('show', shownNow);
      document.body.classList.toggle('dock-on', shownNow);
    }
    // targets, once a frame
    const score = this.scoreTarget(), stack = this.stackTarget();
    this.aimW = (this.dockShown ? this.odoEl : document.getElementById('score'))?.getBoundingClientRect().width || 60;
    this.aim = { score, money: stack.at, stackEl: stack.el };

    // chips: pop out of the part, arc to the drums, land with a ring
    for (const c of this.chips) {
      if (!c.on) continue;
      c.age += dt;
      if (c.age < c.delay) continue;
      const to = score ?? { x: c.x2, y: c.y2 };
      const tx = to.x + c.jx, ty = to.y + c.jy;
      const t = Math.min(1, (c.age - c.delay) / c.dur);
      // two beats: a burst out of the part that slows to a hang, then a swoop that speeds up into the drums
      let x: number, y: number;
      if (t < POP) { const u = easeOut(t / POP); x = c.x0 + (c.x1 - c.x0) * u; y = c.y0 + (c.y1 - c.y0) * u; }
      else {
        const u = Math.pow((t - POP) / (1 - POP), 1.7), a = (1 - u) ** 2, b = 2 * u * (1 - u), d = u * u;
        x = a * c.x1 + b * c.x2 + d * tx; y = a * c.y1 + b * c.y2 + d * ty;
      }
      const vx = (x - c.px) / Math.max(dt, 1e-3), vy = (y - c.py) / Math.max(dt, 1e-3);
      c.px = x; c.py = y;
      // pop in with an overshoot, hold, shrink a little as it lands
      const sc = (t < 0.12 ? 0.45 + (t / 0.12) * 0.75 : t < 0.24 ? 1.2 - ((t - 0.12) / 0.12) * 0.2 : t < 0.8 ? 1 : 1 - ((t - 0.8) / 0.2) * 0.4) * c.size * 0.8;
      c.p.x = x; c.p.y = y;
      c.p.scaleX = c.p.scaleY = sc;
      c.p.rotation += c.spin * dt;
      c.p.alpha = 1;
      const sp = Math.hypot(vx, vy);
      c.tr.x = x; c.tr.y = y;
      c.tr.rotation = Math.atan2(vy, vx);
      c.tr.scaleX = Math.min(2.4, sp / 650) * c.size * 0.9;
      c.tr.scaleY = c.size * 0.55;
      c.tr.alpha = t < POP ? 0.35 : 0.65;
      if (t >= 1) {
        c.on = false;
        this.live--;
        c.p.alpha = c.tr.alpha = 0;
        this.owed = Math.max(0, this.owed - c.pts);
        this.scoreBump.kick(0.5 + c.size * 0.9);
        this.ring(tx, ty, c.size, c.tr.tint);
      }
    }
    for (const r of this.rings) {
      if (!r.on) continue;
      r.age += dt;
      const u = r.age / r.life;
      if (u >= 1) { r.on = false; r.p.alpha = 0; continue; }
      r.p.x = r.x; r.p.y = r.y;
      // pop in, shrink out (a sticker: it never fades)
      r.p.scaleX = r.p.scaleY = (u < 0.35 ? 0.5 + (u / 0.35) * 0.7 : 1.2 * (1 - (u - 0.35) / 0.65)) * r.size;
      r.p.alpha = 1;
    }
    // coins: hop out of the part, then a flipping arc that bows upwards, so they never cut across text
    for (const c of this.coins) {
      if (!c.on) continue;
      c.age += dt;
      if (c.age < 0) continue;
      const to = stack.at ?? c.from, hold = 0.12, dur = 0.6;
      if (c.age < hold) {
        const u = c.age / hold;
        c.p.x = c.from.x; c.p.y = c.from.y - Math.sin((u * Math.PI) / 2) * 18;
        c.p.scaleX = c.p.scaleY = 0.45 + u * 0.7;
        c.p.alpha = 1;
        continue;
      }
      const u = Math.min(1, (c.age - hold) / dur);
      const sx = c.from.x, sy = c.from.y - 18, tx = to.x + c.jx, ty = to.y;
      const cx = (sx + tx) / 2, cy = Math.min(sy, ty) - 80;
      const a = (1 - u) ** 2, b = 2 * u * (1 - u), cc = u * u;
      c.p.x = a * sx + b * cx + cc * tx; c.p.y = a * sy + b * cy + cc * ty;
      const step = Math.floor((c.age * 12) % 4);
      c.p.scaleX = [1, 0.5, 0.12, 0.5][step] * 1.15;
      c.p.scaleY = 1.15;
      if (u >= 1) { c.on = false; c.p.alpha = 0; this.coinsLive = Math.max(0, this.coinsLive - 1); this.landCoin(1); }
    }

    // the dock's numbers: the score counts up to what has landed, quickly but not at once
    const target = Math.max(0, f.score - (this.flying ? this.owed : 0));
    if (!this.flying || target < this.shown) this.shown = target;
    else { this.shown += (target - this.shown) * Math.min(1, dt * 14); if (target - this.shown < 0.5) this.shown = target; }
    this.drums.set(Math.round(this.shown));
    const multTxt = `×${f.mult.toFixed(2)}`;
    if (this.multEl.textContent !== multTxt) this.multEl.textContent = multTxt;
    this.multEl.classList.toggle('hot', f.mult >= 2);
    const money = f.money === null ? '$∞' : `$${Math.max(0, f.money - this.coinsLive)}`;
    if (this.moneyEl.textContent !== money) this.moneyEl.textContent = money;
    this.goalEl.style.width = `${f.playing && f.goal > 0 ? Math.min(100, (this.shown / f.goal) * 100) : 0}%`;
    this.goalEl.parentElement!.classList.toggle('hit', f.playing && this.shown >= f.goal);
    // the bumps (none for reduced motion)
    const still = !!reduceMQ?.matches;
    setScale(this.odoEl, still ? 0 : this.scoreBump.step(dt));
    setScale(this.multEl, still ? 0 : this.multBump.step(dt));
    setScale(this.moneyEl, still ? 0 : this.moneyBump.step(dt));
    const sb = still ? 0 : this.stackBump.step(dt);
    const shop = document.getElementById('shopMoney');
    if (shop) setScale(shop, sb * 0.7, 'translateY(2px) ');
  }

  /** Test hook: move the flights on by dt and draw the overlay now (with its ticker stopped, for frame-by-frame shots). */
  step(dt: number) { this.update(dt); this.overlay.app.render(); }

  private ring(x: number, y: number, size: number, tint: number) {
    let r = this.rings.find((q) => !q.on);
    if (!r) r = this.rings.reduce((a, b) => (a.age > b.age ? a : b));
    r.on = true; r.age = 0; r.life = 0.2; r.x = x; r.y = y; r.size = 0.3 + size * 0.2;
    r.p.tint = tint;
    r.p.rotation = Math.random() * 0.6 - 0.3;
  }
}

function centre(el: Element | null): Pt | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function setScale(el: HTMLElement, x: number, pre = '') {
  const v = Math.abs(x) < 0.002 ? '' : `${pre}scale(${(1 + x).toFixed(3)})`;
  if (el.style.transform !== v) el.style.transform = v;
}
