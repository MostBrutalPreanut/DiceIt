import { footprint, makePart, PARTS, type PartId } from '../src/data/parts';
import type { Layout } from '../src/sim/layout';
import { createSim, NO_INPUT } from '../src/sim/sim';

/**
 * Can a ball come to rest on a part? Drops balls on a grid all around one part, alone on the table, and reports every
 * drop that ends with the ball sitting still for `rest` seconds (before the ball search would find it).
 *   npx vite-node tools/probe.ts [part ...]
 */
export interface Rest { id: PartId; angle: number; from: [number, number]; at: [number, number] }

export function restingSpots(id: PartId, opts: { angle?: number; step?: number; rest?: number; at?: [number, number] } = {}): { drops: number; rests: Rest[] } {
  const [cx, cy] = opts.at ?? [12, 30];
  const p = makePart(id, 1, cx, cy, true);
  p.angle = opts.angle ?? 0;
  const layout: Layout = { parts: [p], gravity: 50, nextUid: 2 };
  const r = footprint(PARTS[id]) + 1.2, step = opts.step ?? 0.4, rest = opts.rest ?? 2;
  const rests: Rest[] = [];
  let drops = 0;
  for (let dx = -r; dx <= r + 1e-6; dx += step) {
    for (let dy = -r * 0.5; dy <= r + 1e-6; dy += step) {
      const sim = createSim(layout, { seed: drops + 1 });
      const x = cx + dx, y = cy + dy;
      drops++;
      sim.addBall(x, y, 0, -0.5);
      let still = 0;
      for (let i = 0; i < 240 * 4 && sim.ballCount > 0; i++) {
        sim.step(NO_INPUT);
        const b = sim.ballStates()[0];
        if (!b || b.held) { still = 0; continue; }
        if (Math.hypot(b.vx, b.vy) < 0.6) still += sim.dt; else still = 0;
        if (still >= rest) {
          rests.push({ id, angle: p.angle, from: [Math.round(dx * 10) / 10, Math.round(dy * 10) / 10], at: [Math.round((b.x - cx) * 100) / 100, Math.round((b.y - cy) * 100) / 100] });
          break;
        }
      }
    }
  }
  return { drops, rests };
}

if (process.argv[1]?.endsWith('vite-node') && !process.env.VITEST) {
  const ids = (process.argv.slice(2).filter((a) => !a.startsWith('--')) as PartId[]);
  const list: PartId[] = ids.length ? ids : ['goal', 'duck', 'roller', 'thunder', 'magnet', 'printer', 'jackpot', 'kickback', 'bank', 'mega', 'pop', 'sling', 'vari', 'deflector', 'piggy'];
  for (const id of list) {
    const angles = PARTS[id].rotatable ? [0, 0.4, -0.8, 1.57] : [0];
    for (const angle of angles) {
      const { drops, rests } = restingSpots(id, { angle });
      const spots = new Map<string, number>();
      for (const q of rests) { const k = `(${q.at[0].toFixed(1)},${q.at[1].toFixed(1)})`; spots.set(k, (spots.get(k) ?? 0) + 1); }
      console.log(`${id} angle ${angle}: ${rests.length}/${drops} drops came to rest${spots.size ? ' at ' + [...spots].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} x${n}`).join(' ') : ''}`);
    }
  }
}
