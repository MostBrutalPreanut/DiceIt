import { Application, Container, Graphics, Rectangle, Sprite, Texture, type Text } from 'pixi.js';
import { dialValue, footprint, gemFits, isInlay, lampStats, LEVEL_RADIUS, PARTS, SMALL_FLIPPER, type PartId, type PartInstance } from '../data/parts';
import { HEAT_H, HEAT_W, type Game } from '../game/game';
import type { ScoreEvent } from '../game/scoring';
import { BALL_R, BUILD_AREA, FLIPPER_LENGTH, FLIPPER_REST, TABLE_W } from '../sim/constants';
import { FLIPPER_PIVOTS, ledgeSeg } from '../sim/table';
import { flat, label, P, Prop, ribbon, unP, type Pt, type View } from './draw';
import { Particles } from './particles';
import { ballShadow, bigBoiEyes, drawBall, drawFlipper, drawPart, EYE, groundRing, stateKey, type BallWear, type Mood, type PartState } from './props';
import { DotMatrix } from './dmd';
import { APRON_Z, arrowInserts, buildMachine, CAB, DECAL_SLOT_POS, decalSprite, dmdRect, machineExtent, RIM, type StuckDecal } from './scene';
import { BALL_WEAR, mat, mix, num, roleFill, WHITE, type Theme } from './theme';

export interface DrawState {
  /** A part following the pointer, about to be placed. */
  ghost: { def: PartId; x: number; y: number; angle: number; valid: boolean } | null;
  selectedUid: number | null;
  hoverUid: number | null;
  showHeat: boolean;
  /** The decal slot under the pointer, if any. */
  hoverDecal?: number | null;
  /** The wall ledge under the pointer or being dragged: where it would go, and whether it fits there. */
  ledge?: { y: number; valid: boolean; moving: boolean } | null;
}

/**
 * How far the machine is tipped towards you (art-direction §3). Playtest feedback: the machine must keep one
 * size between building and playing, so it stays at one tip in every mode; TILT leans and goes dark instead.
 */
export const TIP_K = 0.9;
/** At this Mult Big Boi puts his sunglasses on. */
export const COOL_MULT = 3;
/** A ranked ball's ring and ribbon (Rank Lights): Silver, Gold, Diamond, the same on every machine. */
const RANK_COLOURS = ['#dfe6ee', '#ffd23f', '#8ff0ff'] as const;
/** Zaps: how long an arc of lightning stays on screen, and how many are drawn in one frame (the score counts them all). */
const ARC_LIFE = 0.22;
const ARCS_DRAWN = 12;
/** A cheap repeatable 0..1 noise for the lightning's zigzag. */
const jit = (a: number, b: number, c: number) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); };
/** k is quantised so the baked textures can be shared between frames of the tip animation. */
const K_STEP = 0.02;
const quantK = (k: number) => Math.round(k / K_STEP) * K_STEP;
/** Height scale follows the tip: low when flat (the footprint is the collision), taller once tipped. */
const kzFor = (k: number) => 0.3 + 0.3 * Math.min(1, Math.max(0, (1 - k) / 0.14));

interface Baked { tex: Texture; ax: number; ay: number }
interface PartView { sprite: Sprite }
interface Tag { c: Container; g: Graphics; txt: Text; text: string }

/** Draws the latest sim state. It reads the sim and never writes to it. */
export class Renderer {
  app = new Application();
  theme: Theme;
  calm = false;
  private world = new Container(); // screen shake
  private machine = new Container(); // nudge shove and lean, the machine's own transform
  private staticSprite = new Sprite();
  private floorFx = new Graphics();
  private glowLayer = new Container();
  private partLayer = new Container();
  private ballG = new Graphics();
  private tagLayer = new Container();
  private topG = new Graphics();
  /** Zaps: lightning from a Tesla Coil to each part it made score, for a moment. */
  private arcs: { x1: number; y1: number; x2: number; y2: number; age: number; seed: number }[] = [];
  /** Laser Turret beams and the shockwave rings of blasts and booms, for a moment each. */
  private beams: { x1: number; y1: number; x2: number; y2: number; age: number }[] = [];
  private rings: { x: number; y: number; r: number; age: number; color: string }[] = [];
  private tiltLayer = new Container();
  particles!: Particles;
  dmd!: DotMatrix;
  private eyes = new Map<number, Graphics>();
  /** Big Boi's mood for a while (sad after a bad shot, shocked at a combo); otherwise happy, or cool at a high Mult. */
  private mood: { m: Mood; until: number } | null = null;
  /** Every hit shakes the part that was hit for a moment. */
  private shakes = new Map<number, { t: number; amp: number }>();
  private glowTex!: Texture;
  private glowPool: Sprite[] = [];
  private glowUsed = 0;
  private w = 0;
  private h = 0;
  /** The view at the current tip. */
  view: View = { S: 10, ox: 0, oy: 0, k: 1, kz: 0.3, shx: 0, lw: 1.4 };
  private k = TIP_K;
  private cache = new Map<string, Baked>();
  private statics = new Map<string, { tex: Texture; x: number; y: number }>();
  private staticKey = '';
  private decalKey = '';
  private parts = new Map<number, PartView>();
  /** The sliding pieces (duck, goalie, roller), one sprite each, drawn where the sim has them. */
  private movers = new Map<number, PartView>();
  private flippers = new Map<string, Graphics>();
  private plungerG = new Graphics();
  private tags = new Map<number, Tag>();
  private pulses = new Map<number, number>();
  private lastTier = new Map<number, { tier: number; glow: number }>();
  private spin = new Map<number, { angle: number; speed: number }>();
  private trails = new Map<number, { x: number; y: number }[]>();
  private trauma = 0;
  /** The nudge spring: sideways offset (sim units) and its velocity; plus a rattle timer for tilt warnings. */
  private shove = 0;
  private shoveV = 0;
  private rattle = 0;
  private time = 0;
  private twinkleClock = 0;
  private tiltStamp: Container | null = null;

  constructor(theme: Theme) { this.theme = theme; }

  async init(host: HTMLElement) {
    await this.app.init({
      backgroundAlpha: 0,
      resizeTo: host,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.partLayer.sortableChildren = true;
    this.particles = new Particles(this.app.renderer, this.theme);
    this.dmd = new DotMatrix(this.theme);
    this.machine.addChild(this.staticSprite, this.dmd.view, this.glowLayer, this.floorFx, this.partLayer, this.ballG, this.particles.layer, this.tagLayer, this.topG);
    this.world.addChild(this.machine);
    this.app.stage.addChild(this.world, this.tiltLayer);
    this.glowTex = makeGlowTexture();
    this.partLayer.addChild(this.plungerG);
    this.layout();
    // Pixi only follows window resizes on its own; the stage can also change size with the page (the score dock)
    new ResizeObserver(() => { this.app.resize(); this.layout(); }).observe(host);
  }

  setTheme(t: Theme) {
    this.theme = t;
    this.flush();
    this.particles.bake(t);
    this.dmd.setTheme(t);
    for (const tag of this.tags.values()) tag.c.destroy({ children: true });
    this.tags.clear();
  }

  setCalm(on: boolean) {
    this.calm = on;
    this.particles.calm = on;
    this.dmd.calm = on;
  }

  /** Graphics quality (settings): low draws at 1x with no particle debris, smoke or glow; high is the full look. */
  setQuality(low: boolean) {
    this.particles.lite = low;
    this.glowLayer.visible = !low;
    const res = low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    if (this.app.renderer.resolution === res) return;
    this.app.renderer.resolution = res;
    this.flush(); // every baked texture was made at the old resolution
  }

  /** The backbox's dot-matrix display: a comment scrolls in from the right, holds, then clears. */
  say(text: string) { this.dmd.say(text.toUpperCase()); }
  /** A hit flashes up on the display at once. */
  pop(text: string) { this.dmd.pop(text.toUpperCase()); }
  /** What the display shows between comments (the score while you play). */
  idle(text: string) { this.dmd.idle(text.toUpperCase()); }
  /** Big Boi pulls a face for a while. */
  bigBoiMood(m: Mood, seconds: number) { this.mood = { m, until: this.time + seconds }; }
  flashDmd() { this.dmd.flash(); }

  /** Drop every baked texture (theme change, resize). */
  private flush() {
    for (const b of this.cache.values()) b.tex.destroy(true);
    this.cache.clear();
    for (const s of this.statics.values()) s.tex.destroy(true);
    this.statics.clear();
    this.staticKey = '';
  }

  private layout() {
    const w = this.app.screen.width, h = this.app.screen.height;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    // fit the machine (rim and a little air) at its tallest, flat; the surround may crop on narrow screens
    const ext = machineExtent(TIP_K, kzFor(TIP_K));
    const S = Math.max(4, Math.min((w - 12) / (RIM.hw * 2 + 1.6), (h - 12) / (ext.top + ext.bottom)));
    this.view.S = S;
    this.view.lw = Math.max(1, S * 0.14);
    this.flush();
    this.applyK(this.k);
  }

  private applyK(k: number) {
    const v = this.view;
    v.k = k;
    v.kz = kzFor(k);
    v.ox = this.w / 2 - RIM.cx * v.S;
    // the whole object (backbox to legs) is centred in the stage
    const ext = machineExtent(k, v.kz);
    v.oy = this.h / 2 + ((ext.top - ext.bottom) / 2) * v.S;
    // the machine leans and shoves about its bottom centre
    const [px, py] = P(v, RIM.cx, RIM.cy - RIM.hh);
    this.machine.pivot.set(px, py);
    this.machine.position.set(px, py);
    this.dmd?.layout(dmdRect(v).screen);
  }

  /** Pointer position (client px) -> sim units, through the machine's transform and the tip. */
  toSim(clientX: number, clientY: number) {
    const r = this.app.canvas.getBoundingClientRect();
    const local = this.machine.toLocal({ x: clientX - r.left, y: clientY - r.top });
    const [x, y] = unP(this.view, local.x, local.y);
    return { x, y };
  }

  /** Sim point (with height) -> client px, for the HTML overlay effects and the smoke test. */
  toClient(x: number, y: number, z = 0) {
    const r = this.app.canvas.getBoundingClientRect();
    const [sx, sy] = P(this.view, x, y, z);
    const g = this.machine.toGlobal({ x: sx, y: sy });
    return { x: r.left + g.x, y: r.top + g.y };
  }

  /** The decal slot under a client point (null if none). */
  decalAt(clientX: number, clientY: number): number | null {
    const r = this.app.canvas.getBoundingClientRect();
    const local = this.machine.toLocal({ x: clientX - r.left, y: clientY - r.top });
    for (let i = 0; i < DECAL_SLOT_POS.length; i++) {
      const [X, Y] = P(this.view, DECAL_SLOT_POS[i][0], DECAL_SLOT_POS[i][1], APRON_Z);
      if (Math.hypot(local.x - X, (local.y - Y) / this.view.k) < this.view.S * 1.3) return i;
    }
    return null;
  }

  // ---- reactions to sim events ---------------------------------------------------

  onScore(ev: ScoreEvent) {
    const t = this.theme, def = PARTS[ev.def], color = roleFill(t, ev.def);
    this.pulses.set(ev.uid, 1);
    if (ev.beam) {
      this.beams.push({ ...ev.beam, age: 0 });
      if (this.beams.length > 6) this.beams.shift();
    }
    if (ev.blast) {
      // a keg's blast or the gong's boom: a shockwave ring across the floor (and, for a keg, the bang itself)
      this.rings.push({ x: ev.x, y: ev.y, r: ev.blast, age: 0, color: roleFill(t, ev.def) });
      if (this.rings.length > 8) this.rings.shift();
      if (ev.def === 'keg') { this.particles.debris(ev.x, ev.y, 10, 1.3); this.particles.smokeAt(ev.x, ev.y + 0.2, 2.2, 1.4); this.particles.puff(ev.x, ev.y, 0.4, 2); }
      if (!this.calm) this.trauma = Math.min(1, this.trauma + (ev.def === 'keg' ? 0.5 : 0.3));
    }
    if (ev.zap) {
      // a zap: a crackle of sparks on the part (and an arc of lightning from a coil); no debris, no shake (there can be many)
      if (ev.zap.by === 'arc') this.arcs.push({ x1: ev.zap.x, y1: ev.zap.y, x2: ev.x, y2: ev.y, age: 0, seed: this.arcs.length + ev.uid * 7 + ev.t });
      if (this.arcs.length > ARCS_DRAWN * 2) this.arcs.shift();
      this.particles.sparkle(ev.x + (Math.random() - 0.5), ev.y + (Math.random() - 0.5) * 0.6, 0.8, 0.7, false, true);
      if (ev.label) this.particles.sticker(ev.label, '', color, ev.x, ev.y, 2.2, 1, 0);
      else this.particles.sticker(ev.points.toLocaleString('en-US'), '', roleFill(t, ev.zap.by === 'arc' ? 'tesla' : ev.zap.by === 'beam' ? 'laser' : ev.zap.by === 'blast' ? 'keg' : 'gong'), ev.x, ev.y, 1.4, 0.55, ev.points);
      return;
    }
    if (ev.tier !== undefined) this.lastTier.set(ev.uid, { tier: ev.tier, glow: 1 });
    if (ev.spins) {
      const sp = this.spin.get(ev.uid) ?? { angle: 0, speed: 0 };
      sp.speed = Math.min(40, sp.speed + ev.spins * 6);
      this.spin.set(ev.uid, sp);
    }
    const mag = Math.log10(Math.max(10, ev.points));
    if (ev.kind === 'hit') {
      this.shakes.set(ev.uid, { t: 0.2, amp: Math.min(1, 0.35 + (mag - 1) * 0.2) });
      if (def.kind === 'bumper' || def.kind === 'kicker' || def.kind === 'target') this.particles.hit(ev.def, ev.x, ev.y, ev.points, 0.8 + mag * 0.12);
      else this.particles.debris(ev.x, ev.y, 3, 0.8);
      if (def.kind === 'bank') this.particles.puff(ev.x, ev.y, 0.2, 1);
      if (def.kind === 'saucer') this.particles.smokeAt(ev.x, ev.y + 0.2, 1.7);
      if (def.kind === 'kickback') this.particles.smokeAt(ev.x, ev.y, 0.4, 0.7);
      // only a strong hit shakes the whole table (a presentation shake: the sim never feels it)
      if (!this.calm && ev.points >= 400) this.trauma = Math.min(1, this.trauma + Math.min(0.45, (mag - 2.5) * 0.3));
    }
    if (ev.kind === 'bonus') for (let i = 0; i < 4; i++) this.particles.sparkle(ev.x + (Math.random() - 0.5) * 3, ev.y + (Math.random() - 0.5) * 2, 1 + Math.random(), 1.2, i % 2 === 0);
    if (ev.label) this.particles.sticker(ev.label, '', color, ev.x, ev.y, 2.2, 1, 0);
    else this.particles.sticker(ev.points.toLocaleString('en-US'), '', color, ev.x, ev.y, 1.6, 0.62 + mag * 0.14, ev.points);
  }

  /** A Ball Saver just returned a ball: sparkles and a shout where it sits. */
  onSaved(x: number, y: number) {
    for (let i = 0; i < 6; i++) this.particles.sparkle(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 2, 0.5 + Math.random(), 1.1, i % 2 === 1);
    this.particles.sticker('SHOOT AGAIN!', '', roleFill(this.theme, 'saver'), x, y, 1.8, 1.05);
  }

  onRelease(x: number, y: number) { this.particles.puff(x, y, 0.6, 1.2); this.particles.smokeAt(x, y + 0.2, 1.6); }
  onTilt() { if (!this.calm) this.trauma = 1; this.particles.smokeAt(13, 20, 1, 1.4); }
  onBigMoment() { if (!this.calm) this.trauma = Math.min(1, this.trauma + 0.5); }
  /** A nudge shoves the cabinet sideways on a damped spring; near the tilt limit it rattles too. */
  onNudge(dir: number, tilt: number) {
    if (this.calm) return;
    this.shoveV += dir * 9;
    if (tilt > 0.55) this.rattle = 0.35;
  }

  // ---- baking ----------------------------------------------------------------------

  /** A part drawn once per theme x view x state into a texture; the anchor is its base point on the floor. */
  private baked(id: PartId, angle: number, st: PartState): Baked {
    const ab = PARTS[id].rotatable ? Math.round((angle * 180) / Math.PI / 5) * 5 : 0;
    const key = `${id}|${ab}|${this.view.k.toFixed(2)}|${stateKey(st)}`;
    let b = this.cache.get(key);
    if (b) return b;
    const v: View = { ...this.view, ox: 0, oy: 0 };
    const c = drawPart(v, this.theme, id, 0, 0, (ab * Math.PI) / 180, st);
    const bounds = c.getLocalBounds();
    const pad = 2;
    const frame = new Rectangle(Math.floor(bounds.x) - pad, Math.floor(bounds.y) - pad, Math.ceil(bounds.width) + pad * 2, Math.ceil(bounds.height) + pad * 2);
    const tex = this.app.renderer.generateTexture({ target: c, frame, resolution: this.app.renderer.resolution, antialias: true });
    c.destroy({ children: true });
    b = { tex, ax: -frame.x / frame.width, ay: -frame.y / frame.height };
    this.cache.set(key, b);
    return b;
  }

  /** The machine's fixed layers at the current tip, kept for the tips we visit most. */
  private updateStatic(game: Game) {
    const decals: (StuckDecal | null)[] = DECAL_SLOT_POS.map((_, i) => {
      const p = game.decals[i];
      return p ? { look: game.decalLook(p.id)!, rarity: game.decalRarity(p.id) } : null;
    });
    const dk = JSON.stringify([game.layout.ledge ?? null, decals.map((d) => d && [d.look.shape, d.look.icon, d.rarity])]);
    if (dk !== this.decalKey) {
      this.decalKey = dk;
      for (const s of this.statics.values()) s.tex.destroy(true);
      this.statics.clear();
      this.staticKey = '';
    }
    const key = this.view.k.toFixed(2);
    if (key === this.staticKey) return;
    this.staticKey = key;
    let s = this.statics.get(key);
    if (!s) {
      const v: View = { ...this.view };
      const c = buildMachine(v, this.theme, decals, game.layout.ledge);
      const frame = new Rectangle(0, 0, Math.ceil(this.w), Math.ceil(this.h));
      const tex = this.app.renderer.generateTexture({ target: c, frame, resolution: this.app.renderer.resolution, antialias: true });
      c.destroy({ children: true });
      s = { tex, x: 0, y: 0 };
      this.statics.set(key, s);
      // keep the flat and the tipped view, and whatever we are passing through now
      const keep = new Set([TIP_K.toFixed(2), key]);
      for (const [k2, s2] of this.statics) if (!keep.has(k2)) { s2.tex.destroy(true); this.statics.delete(k2); }
    }
    this.staticSprite.texture = s.tex;
  }

  // ---- frame -------------------------------------------------------------------------

  draw(game: Game, dt: number, st: DrawState) {
    this.time += dt;
    // the part cache is bounded; it is only ever emptied between frames, never while sprites are being assigned
    if (this.cache.size > 1600) { for (const c of this.cache.values()) c.tex.destroy(true); this.cache.clear(); }
    const qk = quantK(this.k);
    if (Math.abs(qk - this.view.k) > 1e-6) this.applyK(qk);
    this.updateStatic(game);

    // screen shake (trauma model) and the nudge spring
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const shake = this.calm ? 0 : this.trauma * this.trauma * 9;
    this.world.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const K = 140, C = 13;
    this.shoveV += (-K * this.shove - C * this.shoveV) * dt;
    this.shove += this.shoveV * dt;
    this.rattle = Math.max(0, this.rattle - dt);
    const rat = this.rattle > 0 ? (Math.random() - 0.5) * 3 : 0;
    const tiltLean = game.sim.tilted ? -0.06 : 0;
    this.machine.position.x = this.machine.pivot.x + this.shove * this.view.S * 0.5 + rat;
    this.machine.rotation = this.shove * 0.035 + tiltLean + rat * 0.002;

    this.glowUsed = 0;
    const fx = this.floorFx;
    fx.clear();
    this.topG.clear();
    if (st.showHeat) this.drawHeat(game);
    if (game.mode === 'workshop') this.drawGrid();
    // the arrow inserts crawl up the middle (frozen in Calm mode and dark on TILT)
    arrowInserts(fx, this.view, this.theme, game.sim.tilted ? -1 : this.calm ? 0 : Math.floor(this.time * 3) % 3);
    this.drawParts(game, dt, st);
    if (st.ledge) this.drawLedge(st.ledge);
    this.drawFlippers(game);
    this.drawPlunger(game);
    this.drawBalls(game);
    this.drawArcs(dt);
    this.drawBeams(dt);
    this.drawRings(dt);
    for (let i = this.glowUsed; i < this.glowPool.length; i++) this.glowPool[i].visible = false;
    this.particles.update(dt, this.view);
    this.dmd.update(dt);
    this.drawTilt(game);
  }

  private glow(x: number, y: number, r: number, color: string, alpha: number) {
    let s = this.glowPool[this.glowUsed];
    if (!s) { s = new Sprite(this.glowTex); s.anchor.set(0.5); this.glowLayer.addChild(s); this.glowPool.push(s); }
    this.glowUsed++;
    const [X, Y] = P(this.view, x, y);
    s.visible = true;
    s.position.set(X, Y);
    s.tint = num(color);
    s.alpha = alpha;
    s.width = r * 2 * this.view.S;
    s.height = r * 2 * this.view.S * this.view.k;
  }

  /** Where the balls spent their time since the layout last changed: cool is a visit, hot is a hotspot. */
  private drawHeat(game: Game) {
    const g = this.floorFx, t = this.theme, v = this.view;
    let max = 0;
    for (const val of game.heat) if (val > max) max = val;
    if (max <= 0) return;
    const ramp = [t.role.lane, t.role.pop, t.role.coin, t.accent];
    for (let y = 0; y < HEAT_H; y++) for (let x = 0; x < HEAT_W; x++) {
      const val = game.heat[y * HEAT_W + x];
      if (val < max * 0.003) continue;
      const u = Math.sqrt(val / max);
      const f = u * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(f));
      const color = mix(ramp[i], ramp[i + 1], f - i);
      g.poly(flat([P(v, x, y), P(v, x + 1, y), P(v, x + 1, y + 1), P(v, x, y + 1)])).fill({ color, alpha: 0.15 + 0.5 * u });
    }
  }

  /** The workshop's placement grid over the build area, and the protected zone below it shaded. */
  private drawGrid() {
    const g = this.floorFx, v = this.view, t = this.theme;
    g.poly(flat([P(v, 0, 0), P(v, TABLE_W - 2, 0), P(v, TABLE_W - 2, BUILD_AREA.y0), P(v, 0, BUILD_AREA.y0)])).fill({ color: t.shadeTint, alpha: 0.07 });
    for (let x = BUILD_AREA.x0 + 1; x <= BUILD_AREA.x1 - 1; x += 1) for (let y = BUILD_AREA.y0; y <= BUILD_AREA.y1; y += 1) {
      const [X, Y] = P(v, x, y);
      g.circle(X, Y, Math.max(1, v.S * 0.07)).fill({ color: t.ink, alpha: 0.28 });
    }
  }

  /** A pulled face wins; then a flinch when hit; a seriously high Mult makes him cool (and cool does not flinch). */
  private moodFor(game: Game, pulse: number): Mood {
    if (this.mood && this.time < this.mood.until) return this.mood.m;
    const cool = game.mode === 'round' && game.scorer.mult >= COOL_MULT;
    if (cool) return 'cool';
    return pulse > 0.35 ? 'oof' : 'happy';
  }

  private partState(game: Game, p: PartInstance, lanes: Map<number, string>, banks: Map<number, boolean[]>, kick: Map<number, boolean>, savers: Map<number, { armed: boolean; left: number }>, heldNear: (x: number, y: number) => boolean): PartState {
    const tilted = game.sim.tilted;
    const lit = !tilted && game.scorer.isLit(p.uid);
    const pulse = this.pulses.get(p.uid) ?? 0;
    switch (p.def) {
      case 'mega': return { hit: pulse > 0.35, follow: true, mood: this.moodFor(game, pulse) };
      case 'pop': case 'coin': case 'sling': case 'ding': case 'thunder': case 'golden': case 'trophy': case 'tesla': case 'gong': return { hit: pulse > 0.35 };
      case 'keg': { const k = game.scorer.kegState(p.uid, game.sim.time); return { hit: pulse > 0.35, lit: !tilted && k === 'lit', armed: k !== 'spent' }; }
      case 'laser': return { hit: pulse > 0.35, lit: !tilted && !game.scorer.coolingDown(p.uid, game.sim.time) };
      case 'piggy': return { hit: pulse > 0.35, seg: game.scorer.piggies.get(p.uid) ?? 0 };
      case 'xlane': return { lit: !tilted && !game.mods.lightsOut && !game.scorer.coolingDown(p.uid, game.sim.time) };
      case 'fame': return { lit: !tilted && !game.mods.lightsOut && !this.discoFired(game, p.uid) };
      case 'disco': return { lit: !tilted && !game.mods.lightsOut && game.scorer.label(p) !== null && !this.discoFired(game, p.uid) };
      case 'magnet': case 'jackpot': return { busy: heldNear(p.x, p.y) };
      case 'lane': return { lit, letter: lanes.get(p.uid) };
      case 'rank': return { lit };
      case 'bell': return { hit: pulse > 0.35, lit: !game.scorer.firedThisRoundOf(p.uid), seg: game.scorer.notchesOf(p) };
      case 'uplight': return { lit, target: 'pop' };
      case 'lamp': return { lit, bright: tilted ? 0 : game.scorer.lampLevel(p.uid) };
      case 'strip': return { lit };
      case 'duck': case 'roller': case 'goal': return { part: 'base' };
      case 'bank': return { down: banks.get(p.uid) ?? [false, false, false] };
      case 'spinner': { const sp = this.spin.get(p.uid); return { spin: sp ? Math.floor((sp.angle / (Math.PI / 8)) % 8 + 8) % 8 : 0 }; }
      case 'vari': { const lt = this.lastTier.get(p.uid); return { seg: lt && lt.glow > 0.2 ? lt.tier + 1 : 0 }; }
      case 'kickback': return { armed: !tilted && (kick.get(p.uid) ?? true) };
      case 'saver': { const s = savers.get(p.uid); return { armed: !tilted && (s ? s.armed && s.left > 0 : true) }; }
      case 'printer': return { busy: heldNear(p.x, p.y) };
      default: return {};
    }
  }

  /** A Disco Ball that has already fired this ball (its ledger row has a hit since the ball started) goes dark. */
  private discoFired(game: Game, uid: number) {
    return game.scorer.firedOf(uid) > 0;
  }

  private drawParts(game: Game, dt: number, st: DrawState) {
    const t = this.theme, v = this.view, fx = this.floorFx;
    const seen = new Set<number>();
    const banks = game.sim.bankStates();
    const kick = game.sim.kickbackStates();
    const savers = game.sim.saverStates();
    const held = game.sim.ballStates().filter((b) => b.held);
    const heldNear = (x: number, y: number) => held.some((b) => Math.hypot(b.x - x, b.y - y) < 1.8);
    // the lanes spell the theme's word, left to right
    const lanes = new Map<number, string>();
    // each pack of lanes spells the word, left to right (lanes from no pack share one spelling)
    const packs = new Map<number | undefined, PartInstance[]>();
    for (const p of game.placed) if (p.def === 'lane') packs.set(p.group, [...(packs.get(p.group) ?? []), p]);
    for (const ls of packs.values()) ls.sort((a, b) => a.x - b.x || a.y - b.y).forEach((p, i) => lanes.set(p.uid, t.laneWord[i % t.laneWord.length]));
    const tilted = game.sim.tilted;
    const seenEyes = new Set<number>();
    this.twinkleClock -= dt;
    const twinkle = this.twinkleClock <= 0;
    if (twinkle) this.twinkleClock = 0.45;

    for (const p of game.placed) {
      seen.add(p.uid);
      const def = PARTS[p.def];
      let pulse = this.pulses.get(p.uid) ?? 0;
      if (pulse > 0) { pulse = Math.max(0, pulse - dt * 4.5); this.pulses.set(p.uid, pulse); }
      const sp = this.spin.get(p.uid);
      if (sp) {
        sp.angle += sp.speed * dt;
        sp.speed *= Math.exp(-dt * 2.2);
        if (sp.speed < 0.05) this.spin.delete(p.uid);
      }
      const lt = this.lastTier.get(p.uid);
      if (lt) { lt.glow = Math.max(0, lt.glow - dt * 0.7); if (lt.glow === 0) this.lastTier.delete(p.uid); }
      const ps = this.partState(game, p, lanes, banks, kick, savers, heldNear);
      if (def.recipe.perLevel) ps.level = game.scorer.levelOf(p);
      if (p.inlay) ps.gem = p.inlay;
      // glows live on the floor, under every part: lamps, lit inserts, armed kickbacks, a ready saver
      const r = footprint(def);
      if (!tilted) {
        if (p.def === 'lamp' && ps.bright) this.glow(p.x, p.y, lampStats(dialValue(p, 'radius'), game.mods).radius, t.role.lamp, 0.12 + 0.09 * ps.bright);
        if (p.def === 'strip' && ps.lit) this.glow(p.x, p.y, 4.6, t.role.strip, 0.5 + 0.2 * Math.sin(this.time * 10));
        if (p.def === 'lane' && ps.lit) { this.glow(p.x, p.y, r * 2.1, t.role.lane, 0.65); if (twinkle && Math.random() < 0.5) this.particles.sparkle(p.x + 0.7, p.y + 0.5, 0.3, 0.7, false, true); }
        if (p.def === 'uplight' && ps.lit) this.glow(p.x, p.y, r * 2.3, t.role.pop, 0.7);
        if (p.def === 'rank' && ps.lit) { this.glow(p.x, p.y, r * 2.1, t.role.rank, 0.65); if (twinkle && Math.random() < 0.5) this.particles.sparkle(p.x + 0.5, p.y + 0.6, 0.3, 0.6, false, true); }
        if (p.def === 'kickback' && ps.armed) this.glow(p.x, p.y, r * 1.7, t.role.kickback, 0.45);
        if (p.def === 'saver' && ps.armed) this.glow(p.x, p.y, r * 2, t.role.saver, 0.55);
        if ((p.def === 'xlane' || p.def === 'disco') && ps.lit) this.glow(p.x, p.y, r * 2, t.role[p.def], 0.6);
        if (p.def === 'golden') this.glow(p.x, p.y, r * 1.8, t.role.golden, 0.35);
        if (p.def === 'keg' && ps.lit) this.glow(p.x, p.y, r * 2.2, t.role.coin, 0.4 + 0.25 * Math.sin(this.time * 30));
        if (p.def === 'laser' && ps.lit) this.glow(p.x, p.y, r * 1.6, t.role.laser, 0.3);
        // the Cook's order: the one part he lit glows until it is hit
        if (game.scorer.order === p.uid) {
          this.glow(p.x, p.y, r * 2.2, t.accent, 0.55 + 0.25 * Math.sin(this.time * 6));
          dashedRing(fx, v, p.x, p.y, r + 0.45, t.accent, v.lw * 1.3, t.ink);
        }
      }
      if (p.def === 'mega' && game.scorer.bigBoi === 'dragon') this.drawArmour(p, game.scorer.armour, game.scorer.slays);
      if (p.def === 'saver') {
        const s = savers.get(p.uid);
        const left = s ? (s.armed ? s.left : 0) : 0;
        if (left > 0 && left < 1) { // the window closing, as a ring that drains
          const pts = Array.from({ length: 33 }, (_, i): Pt => { const a = Math.PI / 2 - (i / 32) * Math.PI * 2 * left; return P(v, p.x + Math.cos(a) * r * 1.35, p.y + Math.sin(a) * r * 1.35); });
          fx.moveTo(pts[0][0], pts[0][1]);
          for (const q of pts.slice(1)) fx.lineTo(q[0], q[1]);
          fx.stroke({ width: v.lw * 1.1, color: t.ink, cap: 'round' });
        }
      }
      if (pulse > 0.05 && (def.kind === 'bumper' || def.kind === 'kicker')) groundRing(fx, v, t, p.x, p.y, r * (1.1 + (1 - pulse) * 0.7), roleFill(t, p.def), v.lw * 1.6 * pulse + 0.5, Math.min(1, pulse * 2));

      const b = this.baked(p.def, p.angle, ps);
      let pv = this.parts.get(p.uid);
      if (!pv) {
        pv = { sprite: new Sprite() };
        this.partLayer.addChild(pv.sprite);
        this.parts.set(p.uid, pv);
      }
      if (pv.sprite.texture !== b.tex) { pv.sprite.texture = b.tex; pv.sprite.anchor.set(b.ax, b.ay); }
      const [X, Y] = P(v, p.x, p.y);
      const sh = this.shakes.get(p.uid);
      let jx = 0, jy = 0;
      if (sh) {
        sh.t -= dt;
        if (sh.t <= 0 || this.calm) this.shakes.delete(p.uid);
        else { const a = sh.amp * v.S * 0.22 * (sh.t / 0.2); jx = (Math.random() - 0.5) * 2 * a; jy = (Math.random() - 0.5) * a; }
      }
      pv.sprite.position.set(X + jx, Y + jy);
      pv.sprite.zIndex = -p.y * 100;
      const jammed = game.scorer.jammed.has(p.def);
      pv.sprite.alpha = jammed ? 0.45 : 1;
      pv.sprite.tint = jammed ? num(mix(t.shadeTint, '#ffffff', 0.4)) : 0xffffff;
      // a hit squashes a bumper for a moment (presentation only)
      const sq = def.kind === 'bumper' && p.def !== 'mega' ? pulse * 0.12 : 0;
      pv.sprite.scale.set(1 + sq, 1 - sq);

      // selection: a dashed paper ring; hover: a ring in the part's colour
      if (st.selectedUid === p.uid) dashedRing(fx, v, p.x, p.y, r + 0.6, t.paper, v.lw * 1.4, t.ink);
      else if (st.hoverUid === p.uid) dashedRing(fx, v, p.x, p.y, r + 0.5, roleFill(t, p.def), v.lw * 1.1);
      if (def.kind === 'lamp' && (st.selectedUid === p.uid || st.hoverUid === p.uid)) {
        dashedRing(fx, v, p.x, p.y, lampStats(dialValue(p, 'radius'), game.mods).radius, t.role.lamp, v.lw, t.ink);
      }
      if (p.def === 'uplight' && (st.selectedUid === p.uid || st.hoverUid === p.uid)) dashedRing(fx, v, p.x, p.y, LEVEL_RADIUS, t.role.pop, v.lw, t.ink);
      if (def.mover) this.drawMover(game, p, pulse, jx, jy);
      this.drawTag(game, p);
      if (p.def === 'mega') this.drawEyes(game, p, pv.sprite.zIndex + 1, seenEyes, ps.mood ?? 'happy', jx, jy);
    }
    for (const [uid, g] of this.eyes) if (!seenEyes.has(uid)) { g.destroy(); this.eyes.delete(uid); }
    // the dotted link from the hovered part to every lamp that boosts it
    const hov = st.hoverUid != null ? game.part(st.hoverUid) : undefined;
    if (hov && hov.placed && PARTS[hov.def].recipe.points) {
      for (const l of game.placed) {
        if (l.def !== 'lamp') continue;
        const reach = lampStats(dialValue(l, 'radius'), game.mods).radius;
        if (Math.hypot(l.x - hov.x, l.y - hov.y) > reach) continue;
        dottedLine(this.topG, P(v, hov.x, hov.y, 1.1), P(v, l.x, l.y, 1.95), game.scorer.isLit(l.uid) ? t.ink : mix(t.ink, t.paper, 0.5), v.lw);
      }
    }
    if (st.ghost) seen.add(-1);
    for (const [uid, pv] of this.parts) if (!seen.has(uid)) { pv.sprite.destroy(); this.parts.delete(uid); }
    for (const [uid, mv] of this.movers) if (!seen.has(uid)) { mv.sprite.destroy(); this.movers.delete(uid); }
    for (const [uid, tag] of this.tags) if (!seen.has(uid)) { tag.c.destroy({ children: true }); this.tags.delete(uid); }

    if (st.ghost) {
      const def = PARTS[st.ghost.def];
      const b = this.baked(st.ghost.def, st.ghost.angle, st.ghost.def === 'lane' ? { letter: t.laneWord[0] } : {});
      let pv = this.parts.get(-1);
      if (!pv) { pv = { sprite: new Sprite() }; this.partLayer.addChild(pv.sprite); this.parts.set(-1, pv); }
      pv.sprite.texture = b.tex;
      pv.sprite.anchor.set(b.ax, b.ay);
      const [X, Y] = P(v, st.ghost.x, st.ghost.y);
      pv.sprite.position.set(X, Y);
      pv.sprite.zIndex = 100000;
      pv.sprite.alpha = 0.6;
      pv.sprite.scale.set(1);
      pv.sprite.tint = st.ghost.valid ? 0xffffff : num(mix(t.accent, '#ffffff', 0.25));
      if (isInlay(st.ghost.def)) {
        // a gem in hand: every part it fits is ringed in the gem's colour (it goes into the one it is dropped on)
        for (const q of game.placed) if (!q.fixed && gemFits(st.ghost.def, q.def)) dashedRing(fx, v, q.x, q.y, footprint(PARTS[q.def]) + 0.35, t.role[st.ghost.def], v.lw * 1.4, t.ink);
      } else dashedRing(fx, v, st.ghost.x, st.ghost.y, footprint(def), st.ghost.valid ? t.ink : t.accent, v.lw);
    } else {
      const pv = this.parts.get(-1);
      if (pv) { pv.sprite.destroy(); this.parts.delete(-1); }
    }
  }

  /** A part's sliding piece, where the sim has it now (at the centre of its rail when the sim has none). */
  private drawMover(game: Game, p: PartInstance, pulse: number, jx: number, jy: number) {
    const def = PARTS[p.def], m = def.mover!;
    const at = game.sim.moverStates().get(p.uid) ?? { x: p.x, y: p.y + m.y };
    const b = this.baked(p.def, 0, { part: 'mover', hit: pulse > 0.35 });
    let mv = this.movers.get(p.uid);
    if (!mv) { mv = { sprite: new Sprite() }; this.partLayer.addChild(mv.sprite); this.movers.set(p.uid, mv); }
    if (mv.sprite.texture !== b.tex) { mv.sprite.texture = b.tex; mv.sprite.anchor.set(b.ax, b.ay); }
    const [X, Y] = P(this.view, at.x, at.y - m.y);
    mv.sprite.position.set(X + jx, Y + jy);
    mv.sprite.zIndex = -at.y * 100 + 2;
  }

  /**
   * Zaps: every live arc as a jagged bolt (a wide glow in the coil's colour under a white core), the newest
   * ARCS_DRAWN only. The zigzag changes 30 times a second; in Calm mode it holds still.
   */
  private drawArcs(dt: number) {
    for (const a of this.arcs) a.age += dt;
    this.arcs = this.arcs.filter((a) => a.age < ARC_LIFE);
    const v = this.view, g = this.topG, col = this.theme.role.tesla, beat = this.calm ? 0 : Math.floor(this.time * 30);
    for (const a of this.arcs.slice(-ARCS_DRAWN)) {
      const fade = Math.min(1, Math.max(0, 1 - a.age / ARC_LIFE)), n = 8;
      const [x1, y1] = P(v, a.x1, a.y1, 1.9), [x2, y2] = P(v, a.x2, a.y2, 0.9);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const amp = Math.min(v.S * 0.7, len * 0.12);
      const pts: number[] = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, off = i === 0 || i === n ? 0 : (jit(a.seed, i, beat) - 0.5) * 2 * amp * Math.sin(Math.PI * u);
        pts.push(x1 + dx * u + nx * off, y1 + dy * u + ny * off);
      }
      const line = (w: number, color: string, alpha: number) => {
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.stroke({ width: w, color, alpha, cap: 'round', join: 'round' });
      };
      line(v.S * 0.38, col, 0.45 * fade);
      line(v.S * 0.12, WHITE, 0.95 * fade);
    }
  }

  /** Laser beams: a straight bar of light across the table, a wide glow under a white core, fading fast. */
  private drawBeams(dt: number) {
    const LIFE = 0.3;
    for (const b of this.beams) b.age += dt;
    this.beams = this.beams.filter((b) => b.age < LIFE);
    const v = this.view, g = this.topG, col = this.theme.role.laser;
    for (const b of this.beams) {
      const fade = Math.min(1, Math.max(0, 1 - b.age / LIFE));
      const [x1, y1] = P(v, b.x1, b.y1, 1.2), [x2, y2] = P(v, b.x2, b.y2, 1.2);
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: v.S * 0.55 * fade + v.S * 0.1, color: col, alpha: 0.5 * fade, cap: 'round' });
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: v.S * 0.12, color: WHITE, alpha: fade, cap: 'round' });
    }
  }

  /** Shockwave rings: from a blast or a boom, racing out across the floor to their reach and fading. */
  private drawRings(dt: number) {
    const LIFE = 0.45;
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < LIFE);
    for (const r of this.rings) {
      const u = Math.min(1, Math.max(0, r.age / LIFE)), ease = 1 - (1 - u) * (1 - u);
      groundRing(this.floorFx, this.view, this.theme, r.x, r.y, Math.max(0.3, r.r * ease), r.color, this.view.lw * 3.4, 1 - u);
    }
  }

  /** The Dragon's armour: a ring of shield plates round him, one per plate left. */
  private drawArmour(p: PartInstance, armour: number, slays: number) {
    const v = this.view, t = this.theme, r = footprint(PARTS.mega) + 0.55, n = armour;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + ((i - (n - 1) / 2) * Math.PI * 1.6) / Math.max(6, n);
      const [X, Y] = P(v, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.3);
      const w = v.S * 0.36;
      this.topG.poly([X - w, Y - w * 0.8, X + w, Y - w * 0.8, X + w, Y + w * 0.1, X, Y + w, X - w, Y + w * 0.1]).fill(slays > 0 ? t.role.coin : t.metal).stroke({ width: v.lw * 0.7, color: t.ink, join: 'round' });
    }
  }

  /** The wall ledge's handle: a dashed outline where it is (hover) or would go (drag). */
  private drawLedge(l: { y: number; valid: boolean; moving: boolean }) {
    const v = this.view, t = this.theme, s = ledgeSeg(l.y);
    const a = P(v, s.x1, s.y1, 0.8), b = P(v, s.x2, s.y2, 0.8);
    const color = !l.valid ? t.accent : l.moving ? t.paper : t.role.lane;
    this.topG.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: v.S * 0.62 + v.lw * 2, color: t.ink, cap: 'round', alpha: 0.85 });
    this.topG.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: v.S * 0.62, color, cap: 'round', alpha: 0.9 });
    // grip arrows: it moves up and down the wall
    const [mx, my] = P(v, (s.x1 + s.x2) / 2 + 0.6, (s.y1 + s.y2) / 2, 0.8);
    for (const d of [-1, 1]) this.topG.poly([mx - v.S * 0.3, my + d * v.S * 0.55, mx + v.S * 0.3, my + d * v.S * 0.55, mx, my + d * v.S * 0.95]).fill(t.ink);
  }

  /** Big Boi watches the ball: pupils inside the baked whites, turned towards the nearest ball (or idling). */
  private drawEyes(game: Game, p: PartInstance, z: number, seen: Set<number>, mood: Mood, jx: number, jy: number) {
    seen.add(p.uid);
    let g = this.eyes.get(p.uid);
    if (!g) { g = new Graphics(); this.partLayer.addChild(g); this.eyes.set(p.uid, g); }
    g.clear();
    g.zIndex = z;
    g.position.set(jx, jy);
    if (mood === 'cool') return; // behind the sunglasses
    const v = this.view, r = PARTS.mega.shape.type === 'circle' ? PARTS.mega.shape.r : 1.9;
    const balls = game.sim.ballStates();
    let target: Pt | null = null, best = Infinity;
    for (const b of balls) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < best) { best = d; target = P(v, b.x, b.y, BALL_R); } }
    const maxX = v.S * EYE.rx * 0.45, maxY = v.S * EYE.ry * 0.45;
    for (const [X, Y] of bigBoiEyes(v, p.x, p.y, r)) {
      let dx: number, dy: number;
      if (target) { const ax = target[0] - X, ay = target[1] - Y, l = Math.hypot(ax, ay) || 1; dx = (ax / l) * maxX; dy = (ay / l) * maxY; }
      else { dx = Math.sin(this.time * 0.7) * maxX * 0.8; dy = Math.cos(this.time * 0.45) * maxY * 0.4; }
      g.ellipse(X + dx, Y + dy, v.S * 0.11, v.S * 0.14).fill(this.theme.ink);
      g.circle(X + dx - v.S * 0.03, Y + dy - v.S * 0.04, v.S * 0.03).fill(WHITE);
    }
  }

  /** The live value printed on a part: a paper sticker, a hair rotated (its level is in the part's art). */
  private drawTag(game: Game, p: PartInstance) {
    const t = this.theme, v = this.view, def = PARTS[p.def];
    const text = def.kind === 'saver' || def.kind === 'flipper' || def.kind === 'deflector' ? null : game.scorer.label(p);
    let tag = this.tags.get(p.uid);
    if (!text) { if (tag) tag.c.visible = false; return; }
    const fs = Math.max(9, v.S * 0.62);
    if (!tag) {
      const c = new Container(), g = new Graphics(), txt = label(text, fs, t.ink);
      c.addChild(g, txt);
      c.rotation = (-4 * Math.PI) / 180;
      this.tagLayer.addChild(c);
      tag = { c, g, txt, text: '' };
      this.tags.set(p.uid, tag);
    }
    if (tag.text !== text || tag.txt.style.fontSize !== fs) {
      tag.text = text;
      tag.txt.text = text;
      tag.txt.style.fontSize = fs;
      const w = tag.txt.width + fs * 0.9, h = fs * 1.35;
      tag.g.clear();
      tag.g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill(t.paper).stroke({ width: v.lw * 0.7, color: t.ink });
    }
    tag.c.visible = true;
    const floorTag = def.kind === 'mover' || def.kind === 'goal' || def.kind === 'strip' || def.kind === 'spinner' || def.kind === 'rollover' || def.kind === 'lamp' || def.kind === 'kicker' || def.kind === 'kickback' || def.kind === 'target' || def.kind === 'bank' || p.def === 'magnet' || p.def === 'jackpot';
    const z = p.def === 'mega' ? 2.05 : p.def === 'printer' ? 1.75 : p.def === 'pop' && t.popMotif === 'cone' ? 1.6 : p.def === 'ding' || p.def === 'trophy' ? 1.7 : p.def === 'thunder' || p.def === 'golden' ? 1.2 : 0.95;
    const [X, Y] = floorTag ? P(v, p.x, p.y - footprint(def) - 0.75, 0) : P(v, p.x, p.y, z);
    tag.c.position.set(X, Y);
  }

  private drawFlippers(game: Game) {
    const seen = new Set<string>();
    for (const f of game.sim.flipperStates()) {
      const key = f.uid === undefined ? f.side : `u${f.uid}`;
      seen.add(key);
      let g = this.flippers.get(key);
      if (!g) { g = new Graphics(); this.partLayer.addChild(g); this.flippers.set(key, g); }
      g.clear();
      drawFlipper(g, this.view, this.theme, f.x, f.y, f.angle, f.side === 'L' ? 1 : -1, f.length);
      g.zIndex = -f.y * 100 + 1;
    }
    for (const [k, g] of this.flippers) if (!seen.has(k)) { g.destroy(); this.flippers.delete(k); }
  }

  /** The plunger rod pulls back as you charge, with a paper gauge beside the lane. */
  private drawPlunger(game: Game) {
    const g = this.plungerG, v = this.view, t = this.theme;
    g.clear();
    g.zIndex = -1.4 * 100;
    const c = game.sim.awaitingPlunge ? game.sim.plungeCharge : 0;
    const rod = new Prop(v, t);
    rod.cyl(25, 1.4 - c * 0.9, 0.42, 0, 0.5, mat(t, t.accent), { n: 20 });
    rod.draw(g);
    if (!game.sim.awaitingPlunge) return;
    const x0 = 25, y0 = 2.6, y1 = 11;
    const a = P(v, x0, y0, 0.8), b = P(v, x0, y1, 0.8), w = v.S * 0.55;
    g.roundRect(a[0] - w / 2, b[1], w, a[1] - b[1], w / 2).fill(mix(t.paper, t.shadeTint, 0.12)).stroke({ width: v.lw * 0.8, color: t.ink });
    const fill = (a[1] - b[1] - 4) * c;
    if (fill > 1) g.roundRect(a[0] - w / 2 + 2, a[1] - 2 - fill, w - 4, fill, (w - 4) / 2).fill(c > 0.4 ? t.role.saver : t.role.coin);
    const m = P(v, x0, y0 + (y1 - y0) * 0.3, 0.8);
    g.moveTo(m[0] - w * 0.8, m[1]).lineTo(m[0] + w * 0.8, m[1]).stroke({ width: v.lw * 0.8, color: t.ink });
  }

  /** The ball wears its upgrade: gold, steel, glass or rubber pink. */
  private ballWear(game: Game): BallWear {
    const m = game.mods;
    if (m.goldEvery) return BALL_WEAR.gold;
    if (m.pointsFactor > 1) return BALL_WEAR.steel;
    if (m.ballGravity < 1) return BALL_WEAR.glass;
    if (m.ballBounce > 0) return BALL_WEAR.rubber;
    return BALL_WEAR.plain;
  }

  private drawBalls(game: Game) {
    const g = this.ballG, v = this.view, t = this.theme;
    g.clear();
    const live = new Set<number>();
    const wear = this.ballWear(game);
    const balls = game.sim.ballStates();
    for (const b of balls) {
      live.add(b.id);
      const tr = this.trails.get(b.id) ?? [];
      tr.push({ x: b.x, y: b.y });
      if (tr.length > 14) tr.shift();
      this.trails.set(b.id, tr);
      ballShadow(this.floorFx, v, t, b.x, b.y);
      const speed = Math.hypot(b.vx, b.vy);
      const rank = game.scorer.rankOf(b.id, game.sim.time);
      // a fast ball leaves a tapered paper ribbon (air: soft, no outline); a ranked ball's ribbon wears its rank
      if (!b.held && speed > 18 && tr.length > 3) ribbon(g, tr.map((q) => P(v, q.x, q.y, BALL_R)), v.S * 0.08, v.S * BALL_R * 1.7, rank ? RANK_COLOURS[rank.step - 1] : t.paper, Math.min(0.75, (speed - 18) / 60));
      // and it sheds glitter
      if (rank && Math.random() < 0.08 + 0.06 * rank.step) this.particles.sparkle(b.x + (Math.random() - 0.5) * 0.6, b.y + (Math.random() - 0.5) * 0.6, BALL_R, 0.35 + 0.1 * rank.step, rank.step >= 2, true);
    }
    for (const b of balls) {
      drawBall(g, v, t, b.x, b.y, wear);
      // a ranked ball wears a ring of its rank's colour; it blinks in its last 5 s
      const rank = game.scorer.rankOf(b.id, game.sim.time);
      if (rank && (rank.left > 5 || Math.floor(rank.left * 4) % 2 === 0)) {
        const [X, Y] = P(v, b.x, b.y, BALL_R), R = BALL_R * v.S;
        g.circle(X, Y, R * 1.38).stroke({ width: v.lw * 1.6 + R * 0.32, color: t.ink, alpha: 0.85 });
        g.circle(X, Y, R * 1.38).stroke({ width: R * 0.32, color: RANK_COLOURS[rank.step - 1] });
      }
    }
    for (const id of [...this.trails.keys()]) if (!live.has(id)) this.trails.delete(id);
  }

  /** TILT: every lamp goes out, the field dims, and a stamp says so. */
  private drawTilt(game: Game) {
    const on = game.sim.tilted;
    if (on && !this.tiltStamp) {
      const t = this.theme, c = new Container(), g = new Graphics();
      g.roundRect(-110, -44, 220, 88, 14).stroke({ width: 9, color: t.accent });
      c.addChild(g, label('TILT', 72, t.accent));
      c.rotation = (-12 * Math.PI) / 180;
      this.tiltLayer.addChild(c);
      this.tiltStamp = c;
    }
    if (!on && this.tiltStamp) { this.tiltStamp.destroy({ children: true }); this.tiltStamp = null; }
    if (on) {
      const v = this.view;
      const zt = CAB.wallH;
      const rim = [P(v, RIM.cx - RIM.hw, RIM.cy - RIM.hh, zt), P(v, RIM.cx + RIM.hw, RIM.cy - RIM.hh, zt), P(v, RIM.cx + RIM.hw, RIM.cy + RIM.hh, zt), P(v, RIM.cx - RIM.hw, RIM.cy + RIM.hh, zt)];
      this.topG.poly(flat(rim)).fill({ color: mix(this.theme.ink, '#000000', 0.4), alpha: 0.38 });
      this.tiltStamp!.position.set(this.w / 2, this.h * 0.45);
      this.tiltStamp!.scale.set(Math.min(1, this.w / 320));
    }
  }

  /** Frame-cost probe for the smoke test: ms spent in draw() over n frames of the current state. */
  probe(game: Game, st: DrawState, n = 60) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) this.draw(game, 1 / 60, st);
    return (performance.now() - t0) / n;
  }

  /** Bakes a part (or the ball) fitted and centred in a w x h box by its drawn bounds, for the HTML panels. */
  icon(id: PartId | 'ball' | 'button', w: number, h: number, opts: { k?: number; st?: PartState; scale?: number; theme?: Theme } = {}): HTMLCanvasElement {
    const t = opts.theme ?? this.theme, k = opts.k ?? 0.62;
    const v: View = { S: 10, ox: 0, oy: 0, k, kz: 0.6, shx: 0, lw: 2.2 };
    const make = (S: number) => {
      const vv = { ...v, S, lw: 2.2 };
      if (id === 'ball') { const g = new Graphics(); drawBall(g, vv, t, 0, 0, BALL_WEAR.plain); const c = new Container(); c.addChild(g); return c; }
      if (id === 'button') return drawButton(vv, t);
      if (id === 'flipper' || id === 'flipperR') { const g = new Graphics(); drawFlipper(g, vv, t, 0, 0, id === 'flipper' ? -0.49 : 0.49, id === 'flipper' ? 1 : -1, FLIPPER_LENGTH * SMALL_FLIPPER); const c = new Container(); c.addChild(g); return c; }
      const a = id === 'sling' ? -0.55 : id === 'spinner' ? 0.3 : id === 'deflector' ? 0.4 : id === 'bank' ? 0.15 : id === 'vari' ? 0.2 : id === 'kickback' ? -0.5 : id === 'printer' ? 0.3 : id === 'piggy' ? 0.25 : id === 'magnet' || id === 'jackpot' ? 0.3 : 0;
      return drawPart(vv, t, id, 0, 0, a, { lit: true, letter: t.laneWord[0], target: 'pop', down: [false, false, true], armed: true, seg: 2, ...(opts.st ?? {}) });
    };
    const probe = make(10);
    const b0 = probe.getLocalBounds();
    probe.destroy({ children: true });
    const S = Math.min(w / b0.width, h / b0.height) * 10 * (opts.scale ?? 1);
    const c = make(S);
    const b = c.getLocalBounds();
    const res = 2;
    const holder = new Container();
    holder.addChild(c);
    c.position.set(w / 2 - (b.x + b.width / 2), h / 2 - (b.y + b.height / 2));
    return this.toCanvas(holder, w, h, res);
  }

  /** A relic decal as it looks on the apron (flat, not squashed), for the upgrade cards. */
  decalIcon(look: StuckDecal['look'], rarity: StuckDecal['rarity'], size: number): HTMLCanvasElement {
    const holder = new Container();
    holder.addChild(decalSprite(this.theme, { look, rarity }, size / 2, size / 2, size * 0.33, 1, -6));
    return this.toCanvas(holder, size, size, 2);
  }

  /** A finished build as a small picture of the whole machine, parts where they stood (the scoreboard's thumbnails). */
  tableShot(parts: { def: PartId; x: number; y: number; angle: number; level?: number }[], w: number, h: number, opts: { theme?: Theme; ledge?: number; decals?: (StuckDecal | null)[] } = {}): HTMLCanvasElement {
    const t = opts.theme ?? this.theme, k = TIP_K, kz = kzFor(k), ext = machineExtent(k, kz);
    const S = Math.min((w - 4) / (RIM.hw * 2 + 1.6), (h - 4) / (ext.top + ext.bottom));
    const v: View = { S, ox: w / 2 - RIM.cx * S, oy: h / 2 + ((ext.top - ext.bottom) / 2) * S, k, kz, shx: 0, lw: Math.max(0.8, S * 0.14) };
    const holder = new Container();
    holder.addChild(buildMachine(v, t, opts.decals ?? DECAL_SLOT_POS.map(() => null), opts.ledge));
    const flips = new Graphics();
    for (const [side, f] of [[1, FLIPPER_PIVOTS.L], [-1, FLIPPER_PIVOTS.R]] as const) drawFlipper(flips, v, t, f.x, f.y, -side * FLIPPER_REST, side);
    holder.addChild(flips);
    // far parts first, as on the table; extra flippers are drawn at rest
    for (const p of [...parts].sort((a, b) => b.y - a.y)) {
      if (p.def === 'flipper' || p.def === 'flipperR') {
        const g = new Graphics(), side = p.def === 'flipper' ? 1 : -1;
        drawFlipper(g, v, t, p.x, p.y, -side * FLIPPER_REST, side, FLIPPER_LENGTH * SMALL_FLIPPER);
        holder.addChild(g);
      } else holder.addChild(drawPart(v, t, p.def, p.x, p.y, p.angle, { level: p.level, letter: t.laneWord[0], mood: 'happy' }));
    }
    return this.toCanvas(holder, w, h, 2);
  }

  private toCanvas(holder: Container, w: number, h: number, res: number): HTMLCanvasElement {
    const tex = this.app.renderer.generateTexture({ target: holder, frame: new Rectangle(0, 0, w, h), resolution: res, antialias: true });
    const canvas = this.app.renderer.extract.canvas(tex) as HTMLCanvasElement;
    tex.destroy(true);
    holder.destroy({ children: true });
    return canvas;
  }
}

/** A big arcade push button on a plate (the Cash Out button's cap). */
function drawButton(v: View, t: Theme) {
  const c = new Container(), g = new Graphics();
  c.addChild(g);
  const p = new Prop(v, t);
  p.cyl(0, 0, 1.15, 0, 0.25, mat(t, t.metal));
  p.cyl(0, 0, 0.9, 0.25, 0.55, mat(t, t.accent));
  p.draw(g);
  return c;
}

/** A dashed ellipse on the floor round a part (selection, hover, lamp reach). */
function dashedRing(g: Graphics, v: View, x: number, y: number, r: number, color: string, w: number, under?: string) {
  const n = Math.max(12, Math.round(r * 5));
  for (const [width, col] of (under ? [[w + v.lw * 1.2, under], [w, color]] : [[w, color]]) as [number, string][]) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = a0 + ((Math.PI * 2) / n) * 0.55;
      const p0 = P(v, x + Math.cos(a0) * r, y + Math.sin(a0) * r, 0.03), p1 = P(v, x + Math.cos((a0 + a1) / 2) * r, y + Math.sin((a0 + a1) / 2) * r, 0.03), p2 = P(v, x + Math.cos(a1) * r, y + Math.sin(a1) * r, 0.03);
      g.moveTo(p0[0], p0[1]).lineTo(p1[0], p1[1]).lineTo(p2[0], p2[1]);
    }
    g.stroke({ width, color: col, cap: 'round' });
  }
}

/** The dotted link between a part and the part that boosts it. */
function dottedLine(g: Graphics, a: Pt, b: Pt, color: string, lw: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.floor(len / (lw * 4)));
  const bend = Math.min(40, len * 0.2);
  for (let i = 0; i <= n; i++) {
    const u = i / n, k = 1 - u;
    const cx = (a[0] + b[0]) / 2, cy = Math.min(a[1], b[1]) - bend;
    g.circle(k * k * a[0] + 2 * k * u * cx + u * u * b[0], k * k * a[1] + 2 * k * u * cy + u * u * b[1], lw * 0.75).fill(color);
  }
}

/** One soft white radial gradient, tinted per glow: the only soft light on the table. */
function makeGlowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}
