import type { SimMods } from '../src/data/mods';
import { DT, FLIPPER_LENGTH, SUBSTEPS, TABLE_H, TABLE_W } from '../src/sim/constants';
import { Bot } from '../src/sim/bot';
import type { Layout } from '../src/sim/layout';
import { Rng } from '../src/sim/rng';
import { createSim, NO_INPUT, type Input } from '../src/sim/sim';

const EMPTY: Layout = { parts: [], gravity: 50, nextUid: 1 };

export interface StressConfig {
  dt: number;
  substeps: number;
  trials: number;
  seed?: number;
  /** Disable the safety net to measure the raw engine. */
  rescue?: boolean;
  /** Ball upgrades to fuzz with (a lighter or bouncier ball is a different physics problem). */
  mods?: Partial<SimMods>;
  /** Called with a per-step trace of the first tunnelled trial. */
  onFirstTunnel?: (trace: string[]) => void;
}
export interface StressResult extends StressConfig {
  /** Trials where the ball still ended up through the flipper (what the player would see). */
  tunnels: number;
  /** Trials where the safety net had to step in (how often the raw physics failed). */
  rescued: number;
  worst?: string;
}

/**
 * Fire fast balls at a flipper from random heights and angles while the flipper fires at a
 * random moment. A trial "tunnels" if the ball's centre crosses from the flipper's top side to
 * its underside within the flipper's length. (Sliding off the tip and falling is a legitimate drain.)
 */
export function flipperTunnelTrials(cfg: StressConfig): StressResult {
  const rng = new Rng(cfg.seed ?? 99);
  let tunnels = 0;
  let rescued = 0;
  let worst: string | undefined;

  for (let i = 0; i < cfg.trials; i++) {
    const side: 'L' | 'R' = rng.next() < 0.5 ? 'L' : 'R';
    const sign = side === 'L' ? 1 : -1;
    const sim = createSim(EMPTY, { dt: cfg.dt, substeps: cfg.substeps, seed: i, rescue: cfg.rescue ?? true, mods: cfg.mods });
    const f = sim.flipperStates().find((q) => q.side === side)!;

    const lx = rng.range(0.6, FLIPPER_LENGTH - 0.4);
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    const surface = { x: f.pivotX + c * sign * lx, y: f.pivotY + s * sign * lx };
    const n = { x: -s, y: c }; // flipper's top-surface normal
    const tangent = { x: c * sign, y: s * sign };

    const h = rng.range(0, 5);
    const speed = rng.next() < 0.15 ? 0 : rng.range(5, 160);
    const phi = rng.range(-0.8, 0.8);
    const vx = (-n.x * Math.cos(phi) + tangent.x * Math.sin(phi)) * speed;
    const vy = (-n.y * Math.cos(phi) + tangent.y * Math.sin(phi)) * speed;
    sim.addBall(surface.x + n.x * (1.2 + h), surface.y + n.y * (1.2 + h), vx, vy);

    const pressAt = rng.next() < 0.3 ? 0 : rng.range(0, 0.6);
    const steps = Math.round(1.6 / cfg.dt);
    let tunneled = false;
    let prev: { lx: number; ly: number } | null = null;
    const trace: string[] = [];
    for (let k = 0; k < steps && !tunneled; k++) {
      const pressed = sim.time >= pressAt;
      const input: Input = { ...NO_INPUT, left: side === 'L' && pressed, right: side === 'R' && pressed };
      sim.step(input);
      const b = sim.ballStates()[0];
      if (!b) break;
      const loc = sim.flipperLocal(side, b.x, b.y);
      if (cfg.onFirstTunnel && tunnels === 0) {
        const fa = sim.flipperStates().find((q) => q.side === side)!.angle;
        trace.push(`t=${sim.time.toFixed(3)} ball=(${b.x.toFixed(2)},${b.y.toFixed(2)}) v=(${b.vx.toFixed(1)},${b.vy.toFixed(1)}) local=(${loc.lx.toFixed(2)},${loc.ly.toFixed(2)}) flipperAngle=${fa.toFixed(3)} pressed=${pressed}`);
      }
      // a tunnel is a crossing of the flipper's own span, from its top side to its underside
      const span = (q: { lx: number }) => q.lx > 0.3 && q.lx < FLIPPER_LENGTH - 0.3;
      const crossed = prev !== null && span(prev) && span(loc) && prev.ly >= 0 && loc.ly < -0.3;
      prev = loc;
      if (crossed) {
        tunneled = true;
        worst = `side ${side} lx ${lx.toFixed(2)} h ${h.toFixed(2)} speed ${speed.toFixed(0)} phi ${phi.toFixed(2)} pressAt ${pressAt.toFixed(2)}`;
      }
    }
    if (sim.rescues > 0) rescued++;
    if (tunneled) {
      if (tunnels === 0) cfg.onFirstTunnel?.(trace.slice(-40));
      tunnels++;
    }
  }
  return { ...cfg, tunnels, rescued, worst };
}

export interface EscapeResult {
  balls: number;
  escapes: number;
  drained: number;
  timeouts: number;
  stuckSearches: number;
  avgSeconds: number;
  avgHits: number;
}

/** Let a bot play many balls on a layout; count anything that leaves the table the wrong way. */
export function escapeFuzz(layout: Layout, balls: number, dt = DT, substeps = SUBSTEPS, mods?: Partial<SimMods>): EscapeResult {
  let escapes = 0, drained = 0, timeouts = 0, searches = 0, seconds = 0, hits = 0;
  for (let i = 0; i < balls; i++) {
    const sim = createSim(layout, { dt, substeps, seed: i + 1, mods });
    const bot = new Bot(i + 1, 0.9);
    sim.spawnBall();
    let over = false;
    while (!over && sim.time < 150) {
      for (const e of sim.step(bot.decide(sim))) {
        if (e.type === 'partHit') hits++;
        if (e.type === 'ballSearch') searches++;
        if (e.type === 'drain') {
          over = true;
          if (e.reason === 'timeout') timeouts++;
          else drained++;
        }
      }
      for (const b of sim.ballStates()) {
        // outside the table's hull above the flippers (below them it is already a drain): an escape
        if (((b.x < -0.6 || b.x > TABLE_W + 0.6) && b.y > 8) || b.y > TABLE_H + 1) escapes++;
      }
    }
    seconds += sim.time;
  }
  return { balls, escapes, drained, timeouts, stuckSearches: searches, avgSeconds: seconds / balls, avgHits: hits / balls };
}
