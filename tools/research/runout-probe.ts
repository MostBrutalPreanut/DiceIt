import { PARTS } from '../../src/data/parts';
import { buildLayout, loadSpecs } from './buildlib';
import { gameFor, makePlayer } from './lib';
/** Where are the balls during a run-out that will not end? npx vite-node tools/research/runout-probe.ts <id> */
const spec = loadSpecs('tools/research/builds', [process.argv[2]])[0];
const { layout } = buildLayout(spec);
const g = gameFor({ layout, machine: spec.machine, decals: spec.decals });
g.goalOverride = Infinity; g.seed = 4000; g.startRound();
const p = makePlayer('avg', 4000);
let at = -1, shown = 0;
const sim = g.sim as unknown as { mods: { kickFactor: number }; balls: { held: { until: number } | null }[]; tick: number };
for (let i = 0; g.mode === 'round' && i < 240 * 400 && shown < 3; i++) {
  const res = g.step(p.decide(g.sim));
  if (res.sim.some((e) => e.type === 'timeUp')) { at = g.sim.time; sim.mods.kickFactor = 0; (PARTS.bucket.recipe as { bucket?: boolean }).bucket = undefined; }
  if (at >= 0 && g.sim.timeUp) for (const b of sim.balls) if (b.held) b.held.until = sim.tick;
  if (at >= 0 && g.sim.timeUp && Math.round((g.sim.time - at) * 240) % 480 === 0) {
    const near = (x: number, y: number) => g.placed.map((q) => ({ d: Math.hypot(q.x - x, q.y - y), q })).sort((a, b) => a.d - b.d)[0];
    const bs = g.sim.ballStates().map((b) => { const n = near(b.x, b.y); return `(${b.x.toFixed(1)},${b.y.toFixed(1)} v ${Math.hypot(b.vx, b.vy).toFixed(0)}${b.held ? ' HELD' : ''} near ${n?.q.def}@${n?.q.x},${n?.q.y})`; });
    const hits: Record<string, number> = {};
    for (const s of res.score) hits[s.def] = (hits[s.def] ?? 0) + 1;
    console.log(`t+${(g.sim.time - at).toFixed(0)}s balls ${bs.join(' ')}`);
  }
  if (at >= 0 && !g.sim.timeUp) { console.log('run-out over at', (g.sim.time - at).toFixed(1)); at = -1; shown++; }
}
console.log('parts:', g.placed.map((q) => `${q.def}@${q.x},${q.y}${PARTS[q.def].rotatable ? ' a' + q.angle.toFixed(2) : ''}`).join(' '));
