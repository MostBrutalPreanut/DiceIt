import { Application, Container, Graphics, Text } from 'pixi.js';
import { PARTS, type PartId } from '../data/parts';
import type { ScoreEvent } from '../game/scoring';
import type { Game } from '../game/game';
import { BALL_R, FLIPPER_LENGTH, TABLE_H, TABLE_W } from '../sim/constants';
import { tableSegments } from '../sim/table';

export interface DrawState {
  ghost: { def: PartId; x: number; y: number; valid: boolean } | null;
  selectedUid: number | null;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; size: number }
interface Popup { text: Text; x: number; y: number; life: number; max: number }

const WALL = 0x4dfcff;
const MAX_PARTICLES = 600;
const MAX_POPUPS = 28;

/** Draws the latest sim state. It reads the sim and never writes to it. */
export class Renderer {
  app = new Application();
  private world = new Container();
  private g = new Graphics();
  private fx = new Graphics();
  private labels = new Container();
  private s = 1; // pixels per sim unit
  private ox = 0;
  private oy = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private pulses = new Map<number, number>();
  private trails = new Map<number, { x: number; y: number }[]>();
  private trauma = 0;
  private segs = tableSegments();
  private time = 0;

  async init(host: HTMLElement) {
    await this.app.init({
      background: '#070b18',
      resizeTo: host,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.g, this.fx, this.labels);
    this.app.stage.addChild(this.world);
    this.layout();
    new ResizeObserver(() => this.layout()).observe(host);
  }

  private layout() {
    const w = this.app.screen.width, h = this.app.screen.height;
    const pad = 14;
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
    const n = Math.min(26, 6 + Math.round(Math.log10(Math.max(10, ev.points)) * 5));
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 16;
      this.particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.4, color: def.color, size: 0.08 + Math.random() * 0.14 });
    }
    this.trauma = Math.min(1, this.trauma + 0.12 + Math.log10(Math.max(10, ev.points)) * 0.03);
    this.popup(`+${ev.points}`, ev.x, ev.y + 1.2, def.color, 15 + Math.log10(Math.max(10, ev.points)) * 6);
  }

  onTilt() { this.trauma = 1; }
  onBigMoment() { this.trauma = Math.min(1, this.trauma + 0.5); }

  private popup(str: string, x: number, y: number, color: number, size: number) {
    if (this.popups.length >= MAX_POPUPS) {
      const old = this.popups.shift()!;
      old.text.destroy();
    }
    const text = new Text({ text: str, style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: size, fontWeight: '800', fill: color, stroke: { color: 0x000000, width: 4 } } });
    text.anchor.set(0.5);
    this.labels.addChild(text);
    this.popups.push({ text, x, y, life: 0, max: 0.9 });
  }

  // ---- frame -------------------------------------------------------------------------

  draw(game: Game, dt: number, st: DrawState) {
    this.time += dt;
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
    this.drawFlippers(game);
    this.drawBalls(game);
    this.drawGauge(game);
    this.drawFx(dt);
  }

  private drawTable(game: Game) {
    const g = this.g;
    // playfield fill: a rectangle with the arc on top, following the wall segments
    const pts: number[] = [this.X(0), this.Y(0)];
    const arc = this.segs.slice(1, 29);
    pts.push(this.X(0), this.Y(34));
    for (const sg of arc) pts.push(this.X(sg.x2), this.Y(sg.y2));
    pts.push(this.X(TABLE_W), this.Y(0));
    g.poly(pts).fill({ color: 0x0b1233 });

    // faint concentric rings as playfield art
    const cx = this.X(11), cy = this.Y(24);
    for (let i = 1; i <= 4; i++) g.circle(cx, cy, this.s * (3 + i * 3.2)).stroke({ width: 1, color: 0x1a2860, alpha: 0.55 - i * 0.08 });
    // drain label
    g.rect(this.X(7.2), this.Y(3.2), this.s * 5.6, this.s * 0.12).fill({ color: 0xff5d6c, alpha: 0.5 });

    // neon walls: wide soft stroke then a bright core
    for (const pass of [{ w: 0.9, a: 0.14 }, { w: 0.45, a: 0.3 }, { w: 0.16, a: 1 }]) {
      for (const sg of this.segs) {
        g.moveTo(this.X(sg.x1), this.Y(sg.y1)).lineTo(this.X(sg.x2), this.Y(sg.y2));
      }
      g.stroke({ width: Math.max(1, pass.w * this.s), color: WALL, alpha: pass.a, cap: 'round', join: 'round' });
    }
    if (game.sim.tilted) g.rect(this.X(0), this.Y(TABLE_H), this.s * TABLE_W, this.s * TABLE_H).fill({ color: 0xff2040, alpha: 0.12 });
  }

  private drawGrid() {
    const g = this.g;
    for (let x = 3; x <= 17; x += 1) for (let y = 12; y <= 36; y += 1) {
      g.circle(this.X(x), this.Y(y), 1).fill({ color: 0x6070c0, alpha: 0.35 });
    }
    // protected zone around the flippers
    g.rect(this.X(0), this.Y(12), this.s * 20, this.s * 12).fill({ color: 0xff5d6c, alpha: 0.05 });
  }

  private drawParts(game: Game, dt: number, st: DrawState) {
    const g = this.g;
    for (const p of game.layout.parts) {
      const def = PARTS[p.def];
      const pulse = this.pulses.get(p.uid) ?? 0;
      if (pulse > 0) this.pulses.set(p.uid, Math.max(0, pulse - dt * 4.5));
      const r = def.radius * (1 + pulse * 0.22) * this.s;
      const x = this.X(p.x), y = this.Y(p.y);
      g.circle(x, y, r * 1.55).fill({ color: def.color, alpha: 0.1 + pulse * 0.3 });
      g.circle(x, y, r).fill({ color: 0x0a0f24 }).stroke({ width: this.s * 0.22, color: def.color });
      g.circle(x, y, r * 0.55).fill({ color: def.color, alpha: 0.35 + pulse * 0.65 });
      // kick dial shown as a ring of ticks so tuning is visible on the table itself
      const ticks = Math.round(p.kick * 2);
      for (let i = 0; i < ticks; i++) {
        const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
        g.circle(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, this.s * 0.07).fill({ color: 0xffffff, alpha: 0.8 });
      }
      if (st.selectedUid === p.uid) g.circle(x, y, r + this.s * 0.55).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
    if (st.ghost) {
      const def = PARTS[st.ghost.def];
      const c = st.ghost.valid ? def.color : 0xff5d6c;
      g.circle(this.X(st.ghost.x), this.Y(st.ghost.y), def.radius * this.s).fill({ color: c, alpha: 0.25 }).stroke({ width: 2, color: c, alpha: 0.9 });
    }
  }

  private drawFlippers(game: Game) {
    const g = this.g;
    for (const f of game.sim.flipperStates()) {
      const sign = f.side === 'L' ? 1 : -1;
      const c = Math.cos(f.angle), s = Math.sin(f.angle);
      const local = [[0, -0.5], [sign * FLIPPER_LENGTH, -0.28], [sign * FLIPPER_LENGTH, 0.28], [0, 0.5]];
      const pts: number[] = [];
      for (const [lx, ly] of local) pts.push(this.X(f.x + c * lx - s * ly), this.Y(f.y + s * lx + c * ly));
      g.poly(pts).fill({ color: 0xffb02e }).stroke({ width: this.s * 0.28, color: 0xffd98a, join: 'round' });
      g.circle(this.X(f.x), this.Y(f.y), this.s * 0.28).fill({ color: 0x3a2308 });
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
      for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length;
        g.moveTo(this.X(tr[i - 1].x), this.Y(tr[i - 1].y)).lineTo(this.X(tr[i].x), this.Y(tr[i].y))
          .stroke({ width: this.s * BALL_R * 1.6 * k, color: 0x9fe8ff, alpha: Math.min(0.5, speed / 160) * k, cap: 'round' });
      }
      const x = this.X(b.x), y = this.Y(b.y), r = BALL_R * this.s;
      g.circle(x, y, r * 2).fill({ color: 0xbfeaff, alpha: 0.12 });
      g.circle(x, y, r).fill({ color: 0xe8f4ff }).stroke({ width: 1.5, color: 0x8fb4ff });
      g.circle(x - r * 0.3, y - r * 0.3, r * 0.3).fill({ color: 0xffffff });
    }
    for (const id of [...this.trails.keys()]) if (!live.has(id)) this.trails.delete(id);
  }

  private drawGauge(game: Game) {
    if (!game.sim.awaitingPlunge) return;
    const g = this.g, c = game.sim.plungeCharge;
    const x = this.X(21), y0 = this.Y(2), h = this.s * 8;
    g.roundRect(x - this.s * 0.35, y0 - h, this.s * 0.7, h, 4).fill({ color: 0x0a0f24, alpha: 0.9 }).stroke({ width: 1, color: 0x4dfcff });
    g.roundRect(x - this.s * 0.25, y0 - h * c, this.s * 0.5, h * c, 3).fill({ color: c > 0.4 ? 0x62f08a : 0xffd23f });
    // the line past which a plunge reaches the playfield
    g.moveTo(x - this.s * 0.5, y0 - h * 0.4).lineTo(x + this.s * 0.5, y0 - h * 0.4).stroke({ width: 2, color: 0xffffff });
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
      pop.text.position.set(this.X(pop.x), this.Y(pop.y) - k * this.s * 2.2);
      pop.text.alpha = 1 - k * k;
      pop.text.scale.set(1 + (1 - k) * 0.25);
    }
    this.popups = this.popups.filter((p) => {
      if (p.life >= p.max) { p.text.destroy(); return false; }
      return true;
    });
  }
}
