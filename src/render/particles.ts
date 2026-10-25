// Particles are stickers (docs/art-direction.md §5): solid shapes with an ink outline in the theme's
// palette. They pop in, hold and shrink out (scale 0.45 -> 1.18 -> 1.0 -> 0.68 -> 0), their shape steps on
// a 12 fps clock while their positions move every frame, and only "air" (smoke, trails) is soft. The
// shapes are baked per theme into one atlas and run in a ParticleContainer.
import { Container, Graphics, Particle, ParticleContainer, Rectangle, Texture, type Renderer } from 'pixi.js';
import type { PartId } from '../data/parts';
import { flat, label, P, ribbon, curl, star, type Pt, type View } from './draw';
import { mix, roleFill, type Theme } from './theme';

/** The scale curve over a particle's life: overshoot, settle, shrink out. Stickers never fade. */
const CURVE: [number, number][] = [[0, 0.45], [0.15, 1.18], [0.3, 1], [0.75, 0.68], [1, 0]];
export function popScale(u: number): number {
  if (u <= 0) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [u1, s1] = CURVE[i], [u0, s0] = CURVE[i - 1];
    if (u <= u1) return s0 + ((s1 - s0) * (u - u0)) / (u1 - u0);
  }
  return 0;
}
/** Shape frames advance on twos: a 1/12 s step, whatever the frame rate. */
export const FRAME_STEP = 1 / 12;

export const MAX_PARTICLES = 150;
export const MAX_STICKERS = 16;

const CELL = 64, R0 = 24; // atlas cell size and the radius a shape is drawn at inside it
type Shape = 'impact0' | 'impact1' | 'impact2' | 'debrisA' | 'debrisB' | 'puff' | 'sparkPaper' | 'sparkGold';
const SHAPES: Shape[] = ['impact0', 'impact1', 'impact2', 'debrisA', 'debrisB', 'puff', 'sparkPaper', 'sparkGold'];

interface P3 { p: Particle; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; age: number; life: number; size: number; frames?: Texture[]; bounced: boolean; twinkle?: boolean; gravity: number }
interface Smoke { age: number; life: number; x: number; y: number; z: number; dir: number; w: number }

/** Draws a particle shape centred on (0, 0) at radius R. */
function drawShape(g: Graphics, t: Theme, shape: Shape, R: number, color: string) {
  const lw = R * 0.12;
  if (shape.startsWith('impact')) {
    const rot = 0.2 + Number(shape.slice(-1)) * 0.28;
    g.poly(flat(star(0, 0, R, R * 0.55, 7, rot))).fill(color).stroke({ width: lw, color: t.ink, join: 'round' });
    g.poly(flat(star(0, 0, R * 0.55, R * 0.3, 7, rot + 0.2))).fill(t.paper);
  } else if (shape === 'puff') {
    const r = R * 0.62;
    const blobs: [number, number, number][] = [[0, 0, r], [-r * 0.85, r * 0.25, r * 0.7], [r * 0.85, r * 0.3, r * 0.65], [r * 0.1, -r * 0.6, r * 0.6]];
    for (const [x, y, rr] of blobs) g.circle(x, y, rr + lw).fill(t.ink);
    for (const [x, y, rr] of blobs) g.circle(x, y, rr).fill(t.paper);
    g.moveTo(-r * 1.2, r * 0.5).quadraticCurveTo(-r * 0.05, r * 1.1, r * 1.1, r * 0.5).stroke({ width: lw * 1.2, color: mix(t.paper, t.shadeTint, 0.35), cap: 'round' });
  } else if (shape === 'sparkPaper' || shape === 'sparkGold') {
    g.poly(flat(star(0, 0, R, R * 0.28, 4, -Math.PI / 2))).fill(shape === 'sparkGold' ? t.role.coin : t.paper).stroke({ width: lw * 0.8, color: t.ink, join: 'round' });
  } else {
    const s = R * 0.55, b = shape === 'debrisB';
    if (t.debris === 'bolt') {
      if (b) { g.poly(flat(star(0, 0, s * 1.1, s * 0.75, 6))).fill(t.role.pop).stroke({ width: lw, color: t.ink, join: 'round' }); g.circle(0, 0, s * 0.35).fill(t.ink); }
      else { g.poly(flat(Array.from({ length: 6 }, (_, k): Pt => [Math.cos((k * Math.PI) / 3) * s, Math.sin((k * Math.PI) / 3) * s]))).fill(t.art.debrisA).stroke({ width: lw, color: t.ink, join: 'round' }); g.circle(0, 0, s * 0.4).fill(t.art.debrisB).stroke({ width: lw, color: t.ink }); }
    } else if (t.debris === 'pea') {
      if (b) g.roundRect(-s * 1.2, -s * 0.4, s * 2.4, s * 0.8, s * 0.4).fill(t.role.pop).stroke({ width: lw, color: t.ink });
      else { g.circle(0, 0, s).fill(t.art.debrisA).stroke({ width: lw, color: t.ink }); g.circle(-s * 0.35, -s * 0.35, s * 0.3).fill(t.art.debrisB); }
    } else {
      if (b) g.poly([-s, -s * 0.6, s, -s * 0.8, s * 0.8, s * 0.7, -s * 0.7, s * 0.6]).fill(t.art.debrisB).stroke({ width: lw, color: t.ink, join: 'round' });
      else {
        g.moveTo(-s * 1.3, 0).quadraticCurveTo(0, -s * 1.2, s * 1.3, 0).quadraticCurveTo(0, s * 1.2, -s * 1.3, 0).fill(t.art.debrisA).stroke({ width: lw, color: t.ink, join: 'round' });
        g.moveTo(-s, 0).lineTo(s, 0).stroke({ width: lw * 0.6, color: t.ink });
      }
    }
  }
}

/**
 * The particle system of the table: impact stars, debris, puffs and sparkles in one ParticleContainer,
 * smoke ribbons as soft Graphics, and score stickers and Mult stamps as Containers with text.
 */
export class Particles {
  readonly layer = new Container();
  private pc: ParticleContainer;
  private smokeG = new Graphics();
  private stickerLayer = new Container();
  private atlas: Texture | null = null;
  private tex = new Map<string, Texture>();
  private live: P3[] = [];
  private smoke: Smoke[] = [];
  private stickers: { c: Container; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; age: number; life: number; rot: number }[] = [];
  calm = false;

  constructor(private renderer: Renderer, private theme: Theme) {
    this.pc = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true } });
    this.layer.addChild(this.smokeG, this.pc, this.stickerLayer);
    this.bake(theme);
  }

  /** One atlas per theme: every shape, and the impact star in every part's colour. */
  bake(t: Theme) {
    this.theme = t;
    this.clear();
    for (const tx of this.tex.values()) if (tx !== Texture.EMPTY) tx.destroy(false);
    this.tex.clear();
    this.atlas?.destroy(true);
    const roles = Object.keys(t.role) as PartId[];
    const cells: { key: string; draw: (g: Graphics) => void }[] = [];
    for (const s of SHAPES) {
      if (s.startsWith('impact')) for (const r of roles) cells.push({ key: `${s}:${r}`, draw: (g) => drawShape(g, t, s, R0, roleFill(t, r)) });
      else cells.push({ key: s, draw: (g) => drawShape(g, t, s, R0, t.paper) });
    }
    const cols = 12, rows = Math.ceil(cells.length / cols);
    const root = new Container();
    cells.forEach((c, i) => {
      const g = new Graphics();
      g.position.set((i % cols) * CELL + CELL / 2, Math.floor(i / cols) * CELL + CELL / 2);
      c.draw(g);
      root.addChild(g);
    });
    const W = cols * CELL, H = rows * CELL;
    this.atlas = this.renderer.generateTexture({ target: root, frame: new Rectangle(0, 0, W, H), resolution: 2, antialias: true });
    root.destroy({ children: true });
    cells.forEach((c, i) => {
      this.tex.set(c.key, new Texture({ source: this.atlas!.source, frame: new Rectangle((i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL) }));
    });
    this.pc.texture = this.tex.get('puff')!;
  }

  private t(key: string) { return this.tex.get(key) ?? this.tex.get('puff')!; }

  private add(o: Omit<P3, 'p' | 'age' | 'bounced'>, tex: Texture) {
    if (this.live.length >= MAX_PARTICLES) return;
    const p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
    this.pc.addParticle(p);
    this.live.push({ ...o, p, age: 0, bounced: false });
  }

  private n(count: number) { return Math.max(1, Math.round(this.calm ? count / 2 : count)); }

  /** A bumper or sling hit: impact star on the contact point, debris thrown up from it. */
  hit(role: PartId, x: number, y: number, points: number, size: number) {
    const frames = [0, 1, 2].map((i) => this.t(`impact${i}:${role}`));
    this.add({ x, y, z: 0.7, vx: 0, vy: 0, vz: 0, spin: 0, life: 0.18 * 2, size: size * 1.15, frames, gravity: 0 }, frames[0]);
    this.debris(x, y, Math.min(8, 3 + Math.floor(Math.log10(Math.max(10, points)))), size);
  }
  debris(x: number, y: number, count: number, size: number) {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
      this.add({ x, y, z: 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 5 + Math.random() * 6, spin: (Math.random() - 0.5) * 14, life: 0.5 + Math.random() * 0.3, size: size * (0.32 + Math.random() * 0.14), gravity: 26 },
        this.t(i % 3 === 2 ? 'debrisB' : 'debrisA'));
    }
  }
  puff(x: number, y: number, z: number, size: number) {
    this.add({ x, y, z, vx: 0, vy: 0, vz: 1.2, spin: 0, life: 0.35, size: size * 0.6, gravity: 0 }, this.t('puff'));
  }
  sparkle(x: number, y: number, z: number, size: number, gold = false, twinkle = false) {
    if (this.calm && twinkle) return;
    this.add({ x, y, z, vx: 0, vy: 0, vz: 0, spin: 0, life: twinkle ? 0.7 : 0.5, size: size * 0.5, twinkle, gravity: 0 }, this.t(gold ? 'sparkGold' : 'sparkPaper'));
  }
  /** Smoke is air: a soft tapered ribbon, no outline, that curls up and thins, then snaps off. */
  smokeAt(x: number, y: number, z: number, w = 1) {
    if (this.smoke.length > 12) return;
    this.smoke.push({ age: 0, life: 0.6 + Math.random() * 0.4, x, y, z, dir: Math.random() < 0.5 ? -1 : 1, w });
  }

  /**
   * A score pop-up: just the number, in chunky toy lettering (ink outline and a solid drop under it), flying out
   * of the hit in an arc in its own direction, then shrinking away. Bigger numbers are bigger; from 1,000 they
   * turn gold with a burst in the part's colour behind them, from 5,000 they sparkle too.
   */
  sticker(main: string, _sub: string, color: string, x: number, y: number, z: number, scale: number, points = 0) {
    if (this.stickers.length >= MAX_STICKERS) this.stickers.shift()!.c.destroy({ children: true });
    const t = this.theme;
    const big = points >= 1000, huge = points >= 5000, word = /[A-Z]{2}/.test(main);
    const c = new Container();
    const fs = (word ? 20 : 30) * scale * (huge ? 1.3 : big ? 1.12 : 1);
    const fill = word ? t.paper : big ? t.role.coin : color;
    const stroke = fs * 0.2, drop = Math.max(2, fs * 0.09);
    if (big && !word) {
      const R = fs * 1.15;
      const g = new Graphics();
      g.poly(flat(star(0, 0, R, R * 0.68, 11, Math.random()))).fill(color).stroke({ width: Math.max(2, fs * 0.09), color: t.ink, join: 'round' });
      c.addChild(g);
    }
    // the solid drop: the same lettering in ink, nudged down and right, so the number reads as a chunky toy
    for (let i = 2; i >= 1; i--) {
      const d = label(main, fs, t.ink, { stroke: t.ink, strokeW: stroke });
      d.position.set(drop * i * 0.6, drop * i * 0.7);
      c.addChild(d);
    }
    const m = label(main, fs, fill, { stroke: t.ink, strokeW: stroke });
    c.addChild(m);
    // a light glint on the face of the lettering
    const glint = label(main, fs, '#ffffff', {});
    glint.alpha = 0.28;
    glint.scale.set(0.98, 0.5);
    glint.position.set(-fs * 0.02, -fs * 0.16);
    c.addChild(glint);
    this.stickerLayer.addChild(c);
    // each one leaves in its own direction: up and out to one side, falling back in an arc
    const side = Math.random() < 0.5 ? -1 : 1, spread = 1.5 + Math.random() * 3.5;
    this.stickers.push({ c, x, y, z, vx: side * spread, vy: (Math.random() - 0.3) * 2, vz: 7 + Math.random() * 3 + (big ? 2 : 0), spin: side * (0.2 + Math.random() * 0.4), age: 0, life: big ? 1.3 : 1, rot: ((Math.random() - 0.5) * 12 * Math.PI) / 180 });
    if (huge) for (let i = 0; i < 4; i++) this.sparkle(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 2, z + Math.random(), 1.2, true);
  }

  clear() {
    for (const q of this.live) this.pc.removeParticle(q.p);
    this.live = [];
    this.smoke = [];
    this.smokeG.clear();
    for (const s of this.stickers) s.c.destroy({ children: true });
    this.stickers = [];
  }

  get count() { return this.live.length; }

  update(dt: number, v: View) {
    const scale = v.S / R0; // a particle of size 1 is one sim unit across its radius
    for (const q of this.live) {
      q.age += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vz -= q.gravity * dt;
      q.z += q.vz * dt;
      if (q.z < 0 && q.vz < 0) { // debris bounces once on the floor, then slides to a stop
        q.z = 0;
        if (!q.bounced) { q.vz = -q.vz * 0.35; q.bounced = true; } else q.vz = 0;
        q.vx *= 0.6; q.vy *= 0.6;
      }
      const u = q.age / q.life;
      const step = Math.floor(q.age / FRAME_STEP);
      if (q.frames) q.p.texture = q.frames[Math.min(q.frames.length - 1, step)];
      let s = popScale(u) * q.size * scale;
      if (q.twinkle) s *= step % 2 ? 0.7 : 1.05;
      const [X, Y] = P(v, q.x, q.y, q.z);
      q.p.x = X; q.p.y = Y;
      q.p.scaleX = s; q.p.scaleY = s;
      q.p.rotation += q.spin * dt;
    }
    const dead = this.live.filter((q) => q.age >= q.life);
    if (dead.length) {
      for (const q of dead) this.pc.removeParticle(q.p);
      this.live = this.live.filter((q) => q.age < q.life);
    }

    const g = this.smokeG;
    g.clear();
    for (const s of this.smoke) {
      s.age += dt;
      const u = s.age / s.life;
      const [X, Y] = P(v, s.x, s.y, s.z);
      const len = v.S * 3 * Math.min(1, 0.4 + u * 1.2) * s.w;
      ribbon(g, curl(X, Y, len, v.S * 0.8 * s.w, 2.2, 18, s.dir), v.S * 0.36 * s.w * (1 - u * 0.7), v.S * 0.04, this.theme.smoke, 0.9 * (1 - u * u));
    }
    this.smoke = this.smoke.filter((s) => s.age < s.life);

    for (const st of this.stickers) {
      st.age += dt;
      const u = st.age / st.life;
      st.x += st.vx * dt;
      st.y += st.vy * dt;
      st.vz -= 16 * dt;
      st.z += st.vz * dt;
      // slap on big, hold, then shrink away as it falls
      const sc = u < 0.1 ? 1.35 - (u / 0.1) * 0.35 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      const [X, Y] = P(v, st.x, st.y, Math.max(0.5, st.z));
      st.c.position.set(X, Y);
      st.c.scale.set(Math.max(0, sc));
      st.c.rotation = st.rot + st.spin * st.age;
    }
    this.stickers = this.stickers.filter((s) => {
      if (s.age >= s.life) { s.c.destroy({ children: true }); return false; }
      return true;
    });
  }
}
