import { readFileSync } from 'node:fs';
import { PARTS, type PartId } from '../src/data/parts';
import { Game } from '../src/game/game';
import { cloneLayout } from '../src/sim/layout';
import { Bot } from '../src/sim/bot';
import type { ParRun } from './par';

/**
 * Explain a machine's score: replay one measured round of a par report and say where the points came from.
 *   npx vite-node tools/explain.ts report.json [round] [sample]      (report.json holds a ParRun)
 * Prints the parts, then per ball: seconds, score, the Mult it reached, hits per part type, the biggest single
 * scoring events and how the ball ended. A runaway machine shows up as a huge Mult, one part type taking
 * nearly all the points, or a ball that lasted until the timeout.
 */
const json = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^RESULT /, ''));
// either a par report, or a single machine (tests/fixtures/*.json: { layout, mods, levels }), played with bot seed 1
const run: ParRun = json.rounds ? json : { seed: 0, upgrades: [], rounds: [{ ...json, round: 1, samples: [], goalCandidate: 0 }] };
const n = Number(process.argv[3] ?? run.rounds.length);
const r = run.rounds[n - 1];
const sampleIndex = process.argv[4] !== undefined ? Number(process.argv[4]) : r.samples.length ? r.samples.reduce((best, s, i, all) => (s.cumulative.at(-1)! > all[best].cumulative.at(-1)! ? i : best), 0) : 0;
console.log(`par run ${run.seed}, round ${n}, sample ${sampleIndex}${r.samples.length ? ' (the highest-scoring one unless given)' : ''}, goal candidate ${Math.round(r.goalCandidate)}`);
console.log('parts:', r.layout.parts.filter((p) => p.placed).map((p) => `${p.def}@${p.x},${p.y}`).join('  '));
console.log('levels:', JSON.stringify(r.levels), ' upgrades:', run.upgrades.join(', ') || 'none');

const g = new Game();
g.layout = cloneLayout(r.layout);
g.mods = r.mods;
g.levels = { ...r.levels };
g.goalOverride = Infinity;
// the same bot seeds playRounds used for this sample
const seedBase = json.rounds ? run.seed * 10000 + n : 1; // playRounds' seed for this round
g.seed = seedBase * 1000 + sampleIndex * 7 + 1;
g.startRound();
const bot = new Bot(seedBase * 1000 + sampleIndex + 1, 0.6);

let ball = 1, ballStart = 0, topMult = 1;
const hits: Record<string, number> = {}, points: Record<string, number> = {};
const big: { t: number; def: PartId; points: number; mult: number; notes: string }[] = [];
const endReasons: string[] = [];
const searches: string[] = [];
const report = () => {
  const top = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, p]) => `${d} ${Math.round(p).toLocaleString()} (${hits[d]} hits)`).join(', ');
  console.log(`ball ${ball}: ${(g.sim.time - ballStart).toFixed(0)} s, score now ${Math.round(g.scorer.score).toLocaleString()}, top Mult ${topMult.toFixed(1)}; ${top}; ended by ${endReasons.pop() ?? '?'}`);
};
for (let i = 0; g.mode === 'round' && i < 240 * 60 * 30; i++) {
  const res = g.step(bot.decide(g.sim));
  for (const e of res.sim) {
    if (e.type === 'drain') endReasons.push(e.reason);
    if (e.type === 'ballSearch') {
      // a ball that has not moved for 3.5 s: where is it, and what is it touching?
      const b = g.sim.ballStates().find((q) => q.id === e.ballId);
      if (b) {
        const near = g.placed.map((p) => ({ p, d: Math.hypot(p.x - b.x, p.y - b.y) })).sort((a, c) => a.d - c.d)[0];
        searches.push(`t=${e.t.toFixed(0)}s ball at (${b.x.toFixed(1)}, ${b.y.toFixed(1)}), nearest part ${near ? `${near.p.def}@${near.p.x},${near.p.y} (${near.d.toFixed(1)} away)` : 'none'}`);
      }
    }
  }
  for (const s of res.score) {
    hits[s.def] = (hits[s.def] ?? 0) + 1;
    points[s.def] = (points[s.def] ?? 0) + s.points;
    topMult = Math.max(topMult, s.multAfter);
    big.push({ t: s.t, def: s.def, points: s.points, mult: s.multBefore, notes: s.notes.join(' | ') });
  }
  if (res.game.some((e) => e.type === 'ballEnd')) {
    report();
    ball++; ballStart = g.sim.time; topMult = 1;
    for (const k of Object.keys(hits)) { delete hits[k]; delete points[k]; }
  }
}
console.log(`ball searches: ${searches.length}`);
for (const s of searches.slice(0, 10)) console.log('  ' + s);
console.log('biggest single events:');
for (const e of big.sort((a, b) => b.points - a.points).slice(0, 8)) console.log(`  t=${e.t.toFixed(1)}s ${PARTS[e.def].name}: +${Math.round(e.points).toLocaleString()} at x${e.mult.toFixed(1)} Mult   [${e.notes}]`);
