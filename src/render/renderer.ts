import { Application, Container, Graphics, Text } from 'pixi.js';
import { dialValue, footprint, PARTS, type PartDef, type PartId, type PartInstance } from '../data/parts';
import type { Game } from '../game/game';
import type { ScoreEvent } from '../game/scoring';
import { BALL_R, FLIPPER_LENGTH, TABLE_H, TABLE_W } from '../sim/constants';
import { TABLE_POSTS, tableOutline, tableSegments } from '../sim/table';

export interface DrawState {
  /** A part following the pointer, about to be placed. */
  ghost: { def: PartId; x: number; y: number; angle: number; valid: boolean } | null;
  selectedUid: number | null;
  hoverUid: number | null;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; size: number }
interface Popup { box: Container; x: number; y: number; y0: number; life: number; max: number }

const WALL = 0x4dfcff;
const MAX_PARTICLES = 600;
const MAX_POPUPS = 16;
const hex = (n: number) => n;

/** Draws the latest sim state. It reads the sim and never writes to it. */
export class Renderer {
  app = new Application();
  private world = new Container();
  private g = new Graphics();
  private fx = new Graphics();
  private labels = new Container();
  private popLayer = new Container();
  private s = 1; // pixels per sim unit
  private ox = 0;
  private oy = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private pulses = new Map<number, number>();
  private spin = new Map<number, { angle: number; speed: number }>();
  private trails = new Map<number, { x: number; y: number }[]>();
  private partLabels = new Map<number, Text>();
  private trauma = 0;
  private segs = tableSegments();
  private outline = tableOutline();

  async init(host: HTMLElement) {
    await this.app.init({
      background: '#070b18',
      resizeTo: host,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.g, this.fx, this.labels, this.popLayer);
    this.app.stage.addChild(this.world);
    this.layout();
    new ResizeObserver(() => this.layout()).observe(host);
  }

  private layout() {
    const w = this.app.screen.width, h = this.app.screen.height;
    const pad = 8;
    this.s = Math.max(4, Math.min((w - pad * 2) / TABLE_W, (h - pad * 2) / TABLE_H));
    this.ox = (w - TABLE_W * this.s) / 2;
    this.oy = (h - TABLE_H * this.s) / 2;
  }

  private X(x: number) { return this.ox + x * this.s; }
  private Y(y: number) { return this.oy + (TABLE_H - y) * this.s; }

  /** Pointer position (client px) -> sim units. */
  toSim(clientX: number, clientY: number) {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.s, y: TABLE_H - (clientY - r.top - this.oy) / this.s };
  }

  // ---- reactions to sim events ---------------------------------------------------

  onScore(ev: ScoreEvent) {
    this.pulses.set(ev.uid, 1);
    const def = PARTS[ev.def];
    if (ev.spins) {
      const sp = this.spin.get(ev.uid) ?? { angle: 0, speed: 0 };
      sp.speed = Math.min(40, sp.speed + ev.spins * 6);
      this.spin.set(ev.uid, sp);
    }
    const mag = Math.log10(Math.max(10, ev.points));
    const n = Math.min(26, 6 + Math.round(mag * 5));
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 16;
      this.particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.4, color: def.color, size: 0.08 + Math.random() * 0.14 });
    }
    if (ev.kind === 'hit') this.trauma = Math.min(1, this.trauma + 0.1 + mag * 0.03);
    if (ev.label) this.popup(ev.label, ev.kind === 'bonus' ? `+${ev.base}  ×${ev.multBefore.toFixed(2)}` : '', ev.x, ev.y + 1.6, def.color, 16);
    else this.popup(`+${ev.points}`, this.mathLine(ev), ev.x, ev.y + 1.2, def.color, 15 + mag * 5);
  }

  /** "100 +5 grown ×1.30": exactly how the points were made. */
  private mathLine(ev: ScoreEvent): string {
    const parts = ev.notes.map((n) => n.replace(' base', ''));
    if (Math.abs(ev.multBefore - 1) > 0.001) parts.push(`×${ev.multBefore.toFixed(2)} Mult`);
    return parts.join('  ');
  }

  onTilt() { this.trauma = 1; }
  onBigMoment() { this.trauma = Math.min(1, this.trauma + 0.5); }

  private popup(main: string, sub: string, x: number, y: number, color: number, size: number) {
    if (this.popups.length >= MAX_POPUPS) this.popups.shift()!.box.destroy({ children: true });
    const box = new Container();
    const t = new Text({ text: main, style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: size, fontWeight: '800', fill: color, stroke: { color: 0x000000, width: 4 } } });
    t.anchor.set(0.5, 1);
    box.addChild(t);
    if (sub) {
      const u = new Text({ text: sub, style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, fontWeight: '600', fill: 0xe8ecff, stroke: { color: 0x000000, width: 3 } } });
      u.anchor.set(0.5, 0);
      u.y = 1;
      box.addChild(u);
    }
    // events that land together stack upwards instead of printing on top of each other
    let stack = 0;
    for (const p of this.popups) if (p.life < 0.6 && Math.hypot(p.x - x, p.y0 - y) < 3) stack++;
    this.popLayer.addChild(box);
    this.popups.push({ box, x, y: y + stack * 1.5, y0: y, life: 0, max: 1.3 });
  }

  // ---- frame -------------------------------------------------------------------------

  draw(game: Game, dt: number, st: DrawState) {
    const g = this.g, fx = this.fx;
    g.clear();
    fx.clear();

    // screen shake (trauma model: shake grows with trauma squared)
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const shake = this.trauma * this.trauma * 9;
    this.world.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    this.drawTable(game);
    if (game.mode === 'workshop') this.drawGrid();
    this.drawParts(game, dt, st);
    this.drawFlippers(game, st);
    this.drawBalls(game);
    this.drawGauge(game);
    this.drawFx(dt);
  }

  private drawTable(game: Game) {
    const g = this.g;
    const pts: number[] = [this.X(0), this.Y(0)];
    for (const [x, y] of this.outline) pts.push(this.X(x), this.Y(y));
    pts.push(this.X(TABLE_W), this.Y(0));
    g.poly(pts).fill({ color: 0x0b1233 });

    // faint concentric rings as playfield art
    const cx = this.X(12), cy = this.Y(28);
    for (let i = 1; i <= 5; i++) g.circle(cx, cy, this.s * (3 + i * 3.6)).stroke({ width: 1, color: 0x1a2860, alpha: 0.55 - i * 0.07 });
    // drain label
    g.rect(this.X(9.2), this.Y(3.2), this.s * 5.6, this.s * 0.12).fill({ color: 0xff5d6c, alpha: 0.5 });

    // neon walls: wide soft stroke then a bright core
    for (const pass of [{ w: 0.9, a: 0.14 }, { w: 0.45, a: 0.3 }, { w: 0.16, a: 1 }]) {
      for (const sg of this.segs) g.moveTo(this.X(sg.x1), this.Y(sg.y1)).lineTo(this.X(sg.x2), this.Y(sg.y2));
      g.stroke({ width: Math.max(1, pass.w * this.s), color: WALL, alpha: pass.a, cap: 'round', join: 'round' });
    }
    for (const q of TABLE_POSTS) g.circle(this.X(q.x), this.Y(q.y), q.r * this.s).fill({ color: 0x0a0f24 }).stroke({ width: 2, color: WALL });
    if (game.sim.tilted) g.rect(this.X(0), this.Y(TABLE_H), this.s * TABLE_W, this.s * TABLE_H).fill({ color: 0xff2040, alpha: 0.12 });
  }

  private drawGrid() {
    const g = this.g;
    for (let x = 3; x <= 21; x += 1) for (let y = 15; y <= 48; y += 1) g.circle(this.X(x), this.Y(y), 1).fill({ color: 0x6070c0, alpha: 0.3 });
    g.rect(this.X(0), this.Y(14), this.s * 24, this.s * 14).fill({ color: 0xff5d6c, alpha: 0.05 });
  }

  /** Corner points of a box part, rotated, in screen space. */
  private boxPts(x: number, y: number, hw: number, hh: number, angle: number, grow = 0): number[] {
    const c = Math.cos(angle), s = Math.sin(angle), out: number[] = [];
    for (const [lx, ly] of [[-hw - grow, -hh - grow], [hw + grow, -hh - grow], [hw + grow, hh + grow], [-hw - grow, hh + grow]]) {
      out.push(this.X(x + lx * c - ly * s), this.Y(y + lx * s + ly * c));
    }
    return out;
  }

  /** One part's body. `alpha` < 1 is used for the ghost. */
  private drawPartShape(def: PartDef, x: number, y: number, angle: number, opts: { pulse?: number; lit?: boolean; spin?: number; alpha?: number; inst?: PartInstance } = {}) {
    const g = this.g, pulse = opts.pulse ?? 0, a = opts.alpha ?? 1, col = hex(def.color);
    const X = this.X(x), Y = this.Y(y);
    if (def.shape.type === 'circle') {
      const r = def.shape.r * (1 + pulse * 0.22) * this.s;
      if (def.kind === 'bumper') {
        g.circle(X, Y, r * 1.55).fill({ color: col, alpha: (0.1 + pulse * 0.3) * a });
        g.circle(X, Y, r).fill({ color: 0x0a0f24, alpha: a }).stroke({ width: this.s * 0.22, color: col, alpha: a });
        g.circle(X, Y, r * 0.55).fill({ color: col, alpha: (0.3 + pulse * 0.7) * a });
        const ticks = Math.round((opts.inst ? dialValue(opts.inst, 'kick') : 2) * 2);
        for (let i = 0; i < ticks; i++) {
          const t = -Math.PI / 2 + (i / 8) * Math.PI * 2;
          g.circle(X + Math.cos(t) * r * 0.82, Y + Math.sin(t) * r * 0.82, this.s * 0.07).fill({ color: 0xffffff, alpha: 0.8 * a });
        }
      } else if (def.kind === 'rollover') {
        g.circle(X, Y, r * 1.5).fill({ color: col, alpha: (opts.lit ? 0.35 : 0.08) * a });
        g.circle(X, Y, r).fill({ color: opts.lit ? col : 0x0a0f24, alpha: a }).stroke({ width: this.s * 0.16, color: col, alpha: a });
      } else if (def.kind === 'lamp') {
        const rad = (opts.inst ? dialValue(opts.inst, 'radius') : 5) * this.s;
        if (opts.lit) g.circle(X, Y, rad).fill({ color: col, alpha: 0.1 + pulse * 0.1 }).stroke({ width: 1.5, color: col, alpha: 0.5 });
        g.circle(X, Y, r * 1.6).fill({ color: col, alpha: (opts.lit ? 0.45 : 0.1) * a });
        g.circle(X, Y, r).fill({ color: opts.lit ? 0xffffff : 0x3a3a1a, alpha: a }).stroke({ width: this.s * 0.14, color: col, alpha: a });
      } else if (def.kind === 'saucer') {
        g.circle(X, Y, r * 1.35).fill({ color: col, alpha: (0.12 + pulse * 0.3) * a });
        g.circle(X, Y, r).fill({ color: 0x05030c, alpha: a }).stroke({ width: this.s * 0.2, color: col, alpha: a });
        // arrow showing where the ball will be fired
        const tip = { x: x - Math.sin(angle) * (def.shape.r + 1.3), y: y + Math.cos(angle) * (def.shape.r + 1.3) };
        const l = { x: x - Math.sin(angle + 0.5) * (def.shape.r + 0.3), y: y + Math.cos(angle + 0.5) * (def.shape.r + 0.3) };
        const rr = { x: x - Math.sin(angle - 0.5) * (def.shape.r + 0.3), y: y + Math.cos(angle - 0.5) * (def.shape.r + 0.3) };
        g.poly([this.X(tip.x), this.Y(tip.y), this.X(l.x), this.Y(l.y), this.X(rr.x), this.Y(rr.y)]).fill({ color: col, alpha: 0.9 * a });
      } else if (def.kind === 'flipper') {
        g.circle(X, Y, r).stroke({ width: 1.5, color: col, alpha: 0.35 * a });
      }
      return;
    }
    // box parts
    const { hw, hh } = def.shape;
    if (def.kind === 'spinner') {
      const squash = 0.25 + 0.75 * Math.abs(Math.cos(opts.spin ?? 0));
      g.poly(this.boxPts(x, y, hw, hh * 1.6, angle)).fill({ color: col, alpha: 0.08 * a });
      g.poly(this.boxPts(x, y, hw, hh * squash, angle)).fill({ color: col, alpha: (0.5 + pulse * 0.5) * a }).stroke({ width: 1.5, color: col, alpha: a });
    } else if (def.kind === 'deflector') {
      g.poly(this.boxPts(x, y, hw, hh, angle)).fill({ color: 0x1a2250, alpha: a }).stroke({ width: this.s * 0.2, color: col, alpha: a, join: 'round' });
    } else {
      g.poly(this.boxPts(x, y, hw, hh, angle, pulse * 0.2)).fill({ color: 0x1a0f08, alpha: a }).stroke({ width: this.s * 0.22, color: col, alpha: a, join: 'round' });
      // chevrons along the kicking face
      for (let i = -1; i <= 1; i++) {
        const c = Math.cos(angle), sn = Math.sin(angle);
        const cx = x + c * i * hw * 0.5, cy = y + sn * i * hw * 0.5;
        g.circle(this.X(cx), this.Y(cy), this.s * 0.12).fill({ color: col, alpha: (0.5 + pulse * 0.5) * a });
      }
    }
  }

  private drawParts(game: Game, dt: number, st: DrawState) {
    const g = this.g;
    const live = new Set<number>();
    const font = Math.max(9, this.s * 0.8);
    for (const p of game.placed) {
      const def = PARTS[p.def];
      live.add(p.uid);
      const pulse = this.pulses.get(p.uid) ?? 0;
      if (pulse > 0) this.pulses.set(p.uid, Math.max(0, pulse - dt * 4.5));
      const sp = this.spin.get(p.uid);
      if (sp) {
        sp.angle += sp.speed * dt;
        sp.speed *= Math.exp(-dt * 2.2);
        if (sp.speed < 0.05) this.spin.delete(p.uid);
      }
      const lit = game.scorer.isLit(p.uid);
      this.drawPartShape(def, p.x, p.y, p.angle, { pulse, lit, spin: sp?.angle ?? 0, inst: p });
      if (st.selectedUid === p.uid) g.circle(this.X(p.x), this.Y(p.y), (footprint(def) + 0.6) * this.s).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      else if (st.hoverUid === p.uid) g.circle(this.X(p.x), this.Y(p.y), (footprint(def) + 0.5) * this.s).stroke({ width: 1.5, color: def.color, alpha: 0.8 });
      if (def.kind === 'lamp' && (st.selectedUid === p.uid || st.hoverUid === p.uid)) {
        g.circle(this.X(p.x), this.Y(p.y), dialValue(p, 'radius') * this.s).stroke({ width: 1.5, color: def.color, alpha: 0.6 });
      }

      // the part's current value, printed on it
      const text = game.scorer.label(p);
      let t = this.partLabels.get(p.uid);
      if (text) {
        if (!t) {
          t = new Text({ text, style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: font, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
          t.anchor.set(0.5);
          this.labels.addChild(t);
          this.partLabels.set(p.uid, t);
        }
        if (t.text !== text) t.text = text;
        t.style.fontSize = font;
        const below = def.kind === 'spinner' || def.kind === 'rollover' || def.kind === 'lamp' || def.kind === 'kicker';
        t.position.set(this.X(p.x), this.Y(p.y) + (below ? this.s * (footprint(def) + 0.9) : 0));
        t.visible = true;
      } else if (t) t.visible = false;
    }
    for (const [uid, t] of this.partLabels) if (!live.has(uid)) { t.destroy(); this.partLabels.delete(uid); }

    if (st.ghost) {
      const def = PARTS[st.ghost.def];
      const c = st.ghost.valid ? def.color : 0xff5d6c;
      this.drawPartShape({ ...def, color: c }, st.ghost.x, st.ghost.y, st.ghost.angle, { alpha: 0.55 });
      g.circle(this.X(st.ghost.x), this.Y(st.ghost.y), footprint(def) * this.s).stroke({ width: 1, color: c, alpha: 0.5 });
    }
  }

  private drawFlippers(game: Game, st: DrawState) {
    const g = this.g;
    for (const f of game.sim.flipperStates()) {
      const sign = f.side === 'L' ? 1 : -1;
      const c = Math.cos(f.angle), s = Math.sin(f.angle);
      const local = [[0, -0.5], [sign * FLIPPER_LENGTH, -0.28], [sign * FLIPPER_LENGTH, 0.28], [0, 0.5]];
      const pts: number[] = [];
      for (const [lx, ly] of local) pts.push(this.X(f.x + c * lx - s * ly), this.Y(f.y + s * lx + c * ly));
      const extra = f.uid !== undefined;
      g.poly(pts).fill({ color: extra ? 0xffc85a : 0xffb02e }).stroke({ width: this.s * 0.28, color: 0xffd98a, join: 'round' });
      g.circle(this.X(f.x), this.Y(f.y), this.s * 0.28).fill({ color: 0x3a2308 });
      if (extra && st.selectedUid === f.uid) g.circle(this.X(f.x), this.Y(f.y), 2.6 * this.s).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
  }

  private drawBalls(game: Game) {
    const g = this.g;
    const live = new Set<number>();
    for (const b of game.sim.ballStates()) {
      live.add(b.id);
      const tr = this.trails.get(b.id) ?? [];
      tr.push({ x: b.x, y: b.y });
      if (tr.length > 26) tr.shift();
      this.trails.set(b.id, tr);
      const speed = Math.hypot(b.vx, b.vy);
      if (!b.held) for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length;
        g.moveTo(this.X(tr[i - 1].x), this.Y(tr[i - 1].y)).lineTo(this.X(tr[i].x), this.Y(tr[i].y))
          .stroke({ width: this.s * BALL_R * 1.6 * k, color: 0x9fe8ff, alpha: Math.min(0.5, speed / 160) * k, cap: 'round' });
      }
      const x = this.X(b.x), y = this.Y(b.y), r = BALL_R * this.s;
      g.circle(x, y, r * 2).fill({ color: 0xbfeaff, alpha: b.held ? 0.3 : 0.12 });
      g.circle(x, y, r).fill({ color: 0xe8f4ff }).stroke({ width: 1.5, color: 0x8fb4ff });
      g.circle(x - r * 0.3, y - r * 0.3, r * 0.3).fill({ color: 0xffffff });
    }
    for (const id of [...this.trails.keys()]) if (!live.has(id)) this.trails.delete(id);
  }

  private drawGauge(game: Game) {
    if (!game.sim.awaitingPlunge) return;
    const g = this.g, c = game.sim.plungeCharge;
    const x = this.X(25), y0 = this.Y(2), h = this.s * 9;
    g.roundRect(x - this.s * 0.35, y0 - h, this.s * 0.7, h, 4).fill({ color: 0x0a0f24, alpha: 0.9 }).stroke({ width: 1, color: 0x4dfcff });
    g.roundRect(x - this.s * 0.25, y0 - h * c, this.s * 0.5, h * c, 3).fill({ color: c > 0.4 ? 0x62f08a : 0xffd23f });
    // the line past which a plunge reaches the playfield
    g.moveTo(x - this.s * 0.5, y0 - h * 0.3).lineTo(x + this.s * 0.5, y0 - h * 0.3).stroke({ width: 2, color: 0xffffff });
  }

  private drawFx(dt: number) {
    const fx = this.fx;
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 22 * dt;
      const k = 1 - p.life / p.max;
      if (k > 0) fx.circle(this.X(p.x), this.Y(p.y), p.size * this.s * (0.4 + k)).fill({ color: p.color, alpha: k });
    }
    this.particles = this.particles.filter((p) => p.life < p.max);

    for (const pop of this.popups) {
      pop.life += dt;
      const k = pop.life / pop.max;
      pop.box.position.set(this.X(pop.x), this.Y(pop.y) - Math.min(1, k * 2) * this.s * 1.6);
      pop.box.alpha = Math.min(1, 2.2 * (1 - k));
    }
    this.popups = this.popups.filter((p) => {
      if (p.life >= p.max) { p.box.destroy({ children: true }); return false; }
      return true;
    });
  }
}
