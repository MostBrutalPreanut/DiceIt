import { readFileSync } from 'node:fs';
import { mean, median, quant } from './lib';
import type { BuildResult } from './buildlib';

/** npx vite-node tools/research/report-builds.ts builds-result.json [clock-result.json] */
const res = (JSON.parse(readFileSync(process.argv[2], 'utf8')) as BuildResult[]).filter(Boolean);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ids = [...new Set(res.map((r) => r.task.id))];
console.log('\nBUILDS: rounds 13-15 judged (final boss in 15), then endless until a loss. Per variant and player: beat r15 (n), last round won (median, max), r15 score/goal p50');
console.log('build                               $    variant  pro                         avg                         poor');
for (const id of ids) {
  for (const variant of ['full', 'auto', 'partial']) {
    const rs = res.filter((r) => r.task.id === id && r.task.variant === variant);
    if (!rs.length) continue;
    const cell = (p: string) => {
      const x = rs.filter((r) => r.task.profile === p);
      if (!x.length) return ''.padEnd(28);
      const r15 = x.flatMap((r) => r.rounds.filter((q) => q.round === 15).map((q) => q.ratio));
      return `${pct(mean(x.map((r) => (r.beatFinal ? 1 : 0)))).padStart(4)}(${x.length}) last ${String(median(x.map((r) => r.lastWon))).padStart(4)}/${String(Math.max(...x.map((r) => r.lastWon))).padEnd(3)} x${r15.length ? quant(r15, 0.5).toFixed(1) : '-'}`.padEnd(28);
    };
    console.log(`${id.slice(0, 34).padEnd(34)} ${String(rs[0].cost).padStart(4)}  ${variant.padEnd(8)} ${cell('pro')}${cell('avg')}${cell('poor')}`);
  }
}
console.log('\nWHERE THE POINTS COME FROM (round 13-15, full variant, all players): top parts and spark/zap shares');
for (const id of ids) {
  const rr = res.filter((r) => r.task.id === id && r.task.variant === 'full').flatMap((r) => r.rounds.filter((q) => q.round >= 13 && q.round <= 15));
  const share = new Map<string, number[]>();
  for (const q of rr) for (const [k, v] of q.top) share.set(k, [...(share.get(k) ?? []), v]);
  console.log(`${id.slice(0, 34).padEnd(34)} ${[...share].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / rr.length] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v.toFixed(0)}%`).join(', ').padEnd(60)} sparks ${pct(mean(rr.map((q) => q.sparkShare)))} zaps ${pct(mean(rr.map((q) => q.zapShare)))} peakMult p50 ${median(rr.map((q) => q.peak)).toFixed(0)}`);
}
console.log('\nPERFORMANCE (sim only, Node): wall ms per sim second, worst single step, max sparks / balls');
for (const id of ids) {
  const rr = res.filter((r) => r.task.id === id).flatMap((r) => r.rounds);
  const msPerSimSec = rr.map((q) => q.wallMs / Math.max(1, q.ballSeconds.reduce((a, b) => a + b, 0)));
  console.log(`${id.slice(0, 34).padEnd(34)} ${quant(msPerSimSec, 0.5).toFixed(1).padStart(6)} ms/s (p90 ${quant(msPerSimSec, 0.9).toFixed(1)})  worst step ${Math.max(...rr.map((q) => q.worstStepMs)).toFixed(1)} ms  sparks ${Math.max(...rr.map((q) => q.maxSparks))}  balls ${Math.max(...rr.map((q) => q.maxBalls))}`);
}
console.log('\nBY FINAL BOSS (all builds, full+auto): beat rate');
for (const b of ['auditor', 'overlord', 'whirlpool']) for (const p of ['pro', 'avg', 'poor']) {
  const x = res.filter((r) => r.task.final === b && r.task.profile === p && r.task.variant !== 'partial' && r.rounds.some((q) => q.round === 15));
  if (x.length) console.log(`${b.padEnd(10)} ${p.padEnd(5)} beat ${pct(mean(x.map((r) => (r.beatFinal ? 1 : 0))))} of ${x.length} that reached it; r15 score/goal p50 ${quant(x.map((r) => r.rounds.find((q) => q.round === 15)!.ratio), 0.5).toFixed(2)}`);
}

if (process.argv[3]) {
  const clk = (JSON.parse(readFileSync(process.argv[3], 'utf8')) as BuildResult[]).filter(Boolean);
  console.log('\nCLOCK OFF: same build, same seeds, every ball out; clock on vs off (ball cut at 10 min)');
  console.log('build                               player  score on p50    off p50    off/on   ball s on mean/max   off mean/max   score at 1/2/5/10 min (off, mean)');
  for (const r of clk) {
    const c = r.clock!;
    const at = (i: number) => Math.round(mean(c.offMarks.map((m) => m[i] ?? m.at(-1) ?? 0)));
    console.log(`${r.task.id.slice(0, 34).padEnd(34)} ${r.task.profile.padEnd(6)} ${Math.round(median(c.on)).toLocaleString().padStart(12)} ${Math.round(median(c.off)).toLocaleString().padStart(12)}   x${(median(c.off) / Math.max(1, median(c.on))).toFixed(1).padEnd(5)}  ${mean(c.onBalls).toFixed(0).padStart(5)}/${Math.max(...c.onBalls).toFixed(0).padEnd(5)}         ${mean(c.offBalls).toFixed(0).padStart(5)}/${Math.max(...c.offBalls).toFixed(0).padEnd(5)}   ${[1, 2, 4, 6].map(at).map((v) => v.toLocaleString()).join(' / ')}`);
  }
}
