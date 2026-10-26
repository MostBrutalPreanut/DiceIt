import { readFileSync, writeFileSync } from 'node:fs';
import { PARTS, type PartId } from '../../src/data/parts';
import { mean, median } from './lib';
import type { Result } from './census';

/** Read census.json and print (and save as CSV) the per-part table. npx vite-node tools/research/report-census.ts census.json out.csv */
const res = (JSON.parse(readFileSync(process.argv[2], 'utf8')) as Result[]).filter(Boolean);
const csv: string[] = ['context,part,rarity,cost,profile,meanScore,gainPct,gainPerDollar,se,hitsPerRound,zapsPerRound,sparkHitsPerRound,touchedPct,partShare,r1pts,r4pts,ballSecDelta,saves,levels,triggers,place,gone,wallMsPerRound,worstStepMs,maxSparks,maxBalls'];
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

for (const context of ['mid', 'late']) {
  const rows = res.filter((r) => r.task.context === context);
  const base = rows.find((r) => r.task.part === null && !r.task.host)!;
  const hostBase = (host: PartId) => rows.find((r) => r.task.host === host && !r.task.gem);
  console.log(`\n=== ${context.toUpperCase()} table  (base mean: ${Object.entries(base.profiles).map(([p, s]) => `${p} ${Math.round(mean(s.rounds.map((x) => x.score))).toLocaleString()}`).join(', ')})`);
  console.log('part          $   prof   gain%  ±se   per$   hits/r zaps/r spark/r touched share  r1->r4 pts     ballΔs  triggers');
  for (const r of rows.filter((x) => x !== base)) {
    const id = r.task.gem ?? r.task.part ?? r.task.host!;
    const label = r.task.gem ? `${r.task.gem}>${r.task.host}` : r.task.host ? `[${r.task.host}]` : id;
    const ref = r.task.gem ? hostBase(r.task.host!) ?? base : base;
    for (const [prof, st] of Object.entries(r.profiles)) {
      const b = ref.profiles[prof];
      if (!b) continue;
      const sc = st.rounds.map((x) => x.score), bs = b.rounds.map((x) => x.score);
      const gain = mean(sc) / Math.max(1, mean(bs)) - 1;
      const se = Math.sqrt(sd(sc) ** 2 / sc.length + sd(bs) ** 2 / bs.length) / Math.max(1, mean(bs));
      const cost = PARTS[id].cost;
      const perDollar = (mean(sc) - mean(bs)) / cost;
      const n = st.rounds.length;
      const sum = (f: (p: NonNullable<(typeof st.rounds)[0]['part']>) => number) => st.rounds.reduce((a, x) => a + (x.part ? f(x.part) : 0), 0) / n;
      const touched = st.rounds.filter((x) => x.part && (x.part.hits + x.part.zaps + x.part.sparkHits) > 0).length / n;
      const share = st.rounds.reduce((a, x) => a + (x.part?.points ?? 0), 0) / Math.max(1, st.rounds.reduce((a, x) => a + x.score, 0));
      const byIdx = (i: number) => mean(st.rounds.filter((x) => x.idx === i).map((x) => x.part?.points ?? 0));
      const ballD = mean(st.rounds.flatMap((x) => x.ballSeconds)) - mean(b.rounds.flatMap((x) => x.ballSeconds));
      const trig: Record<string, number> = {};
      for (const x of st.rounds) for (const [k, v] of Object.entries(x.part?.triggers ?? {})) trig[k] = (trig[k] ?? 0) + v;
      const zapsOut: Record<string, number> = {};
      for (const x of st.rounds) for (const [k, v] of Object.entries(x.zapBy ?? {})) zapsOut[k] = (zapsOut[k] ?? 0) + v.points;
      const baseZap: Record<string, number> = {};
      for (const x of b.rounds) for (const [k, v] of Object.entries(x.zapBy ?? {})) baseZap[k] = (baseZap[k] ?? 0) + v.points;
      const zapDelta = Object.entries(zapsOut).map(([k, v]) => [k, v / n - (baseZap[k] ?? 0) / b.rounds.length] as [string, number]).filter(([, v]) => Math.abs(v) > 50);
      const sparkD = mean(st.rounds.map((x) => x.sparkPoints ?? 0)) - mean(b.rounds.map((x) => x.sparkPoints ?? 0));
      const trigS = Object.entries(trig).filter(([k]) => !k.startsWith('note:level')).sort((a, c) => c[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${(v / n).toFixed(1)}`).join(' ')
        + (zapDelta.length ? ` | zap pts/r ${zapDelta.map(([k, v]) => `${k}${v > 0 ? '+' : ''}${Math.round(v)}`).join(' ')}` : '') + (Math.abs(sparkD) > 50 ? ` | spark pts/r ${sparkD > 0 ? '+' : ''}${Math.round(sparkD)}` : '');
      const saves = mean(st.rounds.map((x) => x.saves));
      if (prof === 'avg' || ['hand', 'flipper', 'flipperR', 'saver', 'kickback', 'bucket', 'magnet', 'ice'].includes(id) || Math.abs(gain) > 0.3)
        console.log(`${label.padEnd(13)} ${String(cost).padStart(2)}  ${prof.padEnd(5)} ${(gain * 100).toFixed(0).padStart(5)}% ${(se * 100).toFixed(0).padStart(4)}  ${Math.round(perDollar).toString().padStart(6)}  ${sum((p) => p.hits).toFixed(1).padStart(5)} ${sum((p) => p.zaps).toFixed(1).padStart(5)} ${sum((p) => p.sparkHits).toFixed(1).padStart(6)}  ${(touched * 100).toFixed(0).padStart(5)}% ${(share * 100).toFixed(0).padStart(4)}%  ${Math.round(byIdx(0)).toString().padStart(6)}->${Math.round(byIdx(3)).toString().padEnd(7)} ${ballD.toFixed(1).padStart(5)}  ${trigS}${st.gone ? ' [GONE]' : ''}${saves > 0.05 ? ` saves/r ${saves.toFixed(2)}` : ''}${st.levelsGained ? ` levels+${(st.levelsGained / (n / 4)).toFixed(1)}/seg` : ''}`);
      csv.push([context, label, PARTS[id].rarity, cost, prof, Math.round(mean(sc)), (gain * 100).toFixed(1), Math.round(perDollar), (se * 100).toFixed(1), sum((p) => p.hits).toFixed(2), sum((p) => p.zaps).toFixed(2), sum((p) => p.sparkHits).toFixed(2), (touched * 100).toFixed(0), (share * 100).toFixed(1), Math.round(byIdx(0)), Math.round(byIdx(3)), ballD.toFixed(1), saves.toFixed(2), st.levelsGained, JSON.stringify(trigS).replace(/,/g, ';'), JSON.stringify(r.placed).replace(/,/g, ';'), st.gone, Math.round(mean(st.rounds.map((x) => x.wallMs))), Math.max(...st.rounds.map((x) => x.worstStepMs)).toFixed(1), Math.max(...st.rounds.map((x) => x.maxSparks)), Math.max(...st.rounds.map((x) => x.maxBalls))].join(','));
    }
  }
}
if (process.argv[3]) writeFileSync(process.argv[3], csv.join('\n'));
void median;
