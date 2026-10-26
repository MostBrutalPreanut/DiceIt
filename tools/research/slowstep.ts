import { Game } from '../../src/game/game';
import { cloneLayout } from '../../src/sim/layout';
import { buildLayout, loadSpecs } from './buildlib';
import { makePlayer } from './lib';
/** Find the slowest sim steps on a build and what happened in them. npx vite-node tools/research/slowstep.ts <dir> <id> [rounds] */
const spec = loadSpecs(process.argv[2], [process.argv[3]])[0];
const { layout } = buildLayout(spec);
const g = new Game();
g.machine = spec.machine; g.layout = cloneLayout(layout); g.decals = spec.decals.map((d) => ({ ...d, grown: d.id === 'momentum' ? 2 : undefined })); g.round = 13; g.pending = null; g.toWorkshop();
const worst: { ms: number; t: number; score: number; events: number; kinds: string; parts: number }[] = [];
for (let r = 0; r < Number(process.argv[4] ?? 3); r++) {
  g.goalOverride = Infinity; g.seed = 1 + r; g.startRound();
  const p = makePlayer('avg', 7 + r);
  while (g.mode === 'round') {
    const t0 = performance.now();
    const res = g.step(p.decide(g.sim));
    const ms = performance.now() - t0;
    if (ms > 15) { const k: Record<string, number> = {}; for (const s of res.score) { const key = s.def + (s.zap ? ':zap' : ''); k[key] = (k[key] ?? 0) + 1; } worst.push({ ms, t: g.sim.time, score: g.scorer.score, events: res.score.length, kinds: JSON.stringify(k), parts: g.placed.length }); }
  }
  g.toWorkshop();
}
worst.sort((a, b) => b.ms - a.ms);
console.log(`steps over 15 ms: ${worst.length}`);
for (const w of worst.slice(0, 8)) console.log(`${w.ms.toFixed(0)} ms at t=${w.t.toFixed(1)} score ${w.score.toExponential(2)} score events ${w.events} ${w.kinds}`);
