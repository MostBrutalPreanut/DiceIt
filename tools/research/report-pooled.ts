import { readFileSync, writeFileSync } from 'node:fs';
import { PARTS, type PartId } from '../../src/data/parts';
import { mean } from './lib';
import type { Result } from './census';

/**
 * Two census passes (different seeds and placement), pooled: per part, the gain over its table in each pass and both
 * together, for each table and player, and whether the passes agree.
 *   npx vite-node tools/research/report-pooled.ts census.json census2.json out.md
 */
const passes = process.argv.slice(2, 4).map((f) => (JSON.parse(readFileSync(f, 'utf8')) as Result[]).filter(Boolean));
const key = (r: Result) => `${r.task.context}|${r.task.part}|${r.task.gem ?? ''}|${r.task.host ?? ''}`;
const find = (p: Result[], k: string) => p.find((r) => key(r) === k);
const label = (r: Result) => (r.task.gem ? `${r.task.gem} in ${r.task.host}` : r.task.part ?? `[${r.task.host}]`);
const scores = (r: Result | undefined, prof: string) => r?.profiles[prof]?.rounds.map((x) => x.score) ?? [];
const gain = (a: number[], b: number[]) => (a.length && b.length ? mean(a) / Math.max(1, mean(b)) - 1 : NaN);
const pct = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%` : '–');

const lines: string[] = [];
const rows = passes[0].filter((r) => r.task.part !== null || r.task.gem);
const out: string[] = ['| part | $ | rarity | mid avg (pass 1 / 2) | late avg (1 / 2) | late pro | late poor | agree | touched | what it did (late, avg, per round) |', '|---|---|---|---|---|---|---|---|---|---|'];
const ids = [...new Set(rows.map((r) => `${r.task.part}|${r.task.gem ?? ''}|${r.task.host ?? ''}`))];
for (const id of ids) {
  const [part, gem, host] = id.split('|');
  const cells: Record<string, number[]> = {};
  let agree = true, touched = '', trig = '';
  for (const ctx of ['mid', 'late']) {
    const k = `${ctx}|${part}|${gem}|${host}`;
    const baseK = gem ? `${ctx}|null||${host}` : `${ctx}|null||`;
    for (const prof of ['avg', 'pro', 'poor']) {
      const gs = passes.map((p) => gain(scores(find(p, k), prof), scores(find(p, baseK), prof)));
      const pooledA = passes.flatMap((p) => scores(find(p, k), prof)), pooledB = passes.flatMap((p) => scores(find(p, baseK), prof));
      cells[`${ctx}-${prof}`] = [...gs, gain(pooledA, pooledB)];
      if (prof === 'avg' && gs.length === 2 && Number.isFinite(gs[1]) && Math.abs(gs[0] - gs[1]) > 0.25 && Math.sign(gs[0]) !== Math.sign(gs[1])) agree = false;
    }
    if (ctx === 'late') {
      const rs = passes.map((p) => find(p, k)).filter(Boolean) as Result[];
      const rr = rs.flatMap((r) => r.profiles.avg?.rounds ?? []);
      const n = rr.length || 1;
      const hit = rr.filter((x) => x.part && x.part.hits + x.part.zaps + x.part.sparkHits > 0).length / n;
      touched = rs.some((r) => !r.placed.length && !gem && PARTS[part as PartId]?.kind !== 'decor') ? 'no room' : `${Math.round(hit * 100)}%`;
      const t: Record<string, number> = {};
      for (const x of rr) for (const [a, v] of Object.entries(x.part?.triggers ?? {})) if (!a.startsWith('note:') && a !== 'hotShotPaid') t[a] = (t[a] ?? 0) + v;
      const hits = rr.reduce((a, x) => a + (x.part?.hits ?? 0), 0) / n;
      trig = `${hits.toFixed(0)} hits; ` + Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, v]) => `${a.replace(/\|/g, '/')} ${(v / n).toFixed(1)}`).join(', ');
    }
  }
  const def = PARTS[(gem || part) as PartId];
  const c = (k: string, i: number) => pct(cells[k]?.[i] ?? NaN);
  out.push(`| ${gem ? `${gem} in ${host}` : part} | ${def.cost} | ${def.rarity} | ${c('mid-avg', 0)} / ${c('mid-avg', 1)} | ${c('late-avg', 0)} / ${c('late-avg', 1)} | ${c('late-pro', 2)} | ${c('late-poor', 2)} | ${agree ? 'yes' : 'NO'} | ${touched} | ${trig} |`);
  lines.push([gem ? `${gem}>${host}` : part, def.cost, def.rarity, ...['mid-avg', 'late-avg', 'mid-pro', 'late-pro', 'mid-poor', 'late-poor'].map((k) => (cells[k]?.[2] ?? NaN).toFixed(3)), agree].join(','));
}
writeFileSync(process.argv[4], out.join('\n') + '\n');
writeFileSync(process.argv[4].replace(/\.md$/, '.csv'), 'part,cost,rarity,midAvg,lateAvg,midPro,latePro,midPoor,latePoor,agree\n' + lines.join('\n'));
console.log(out.slice(0, 6).join('\n'));
void label;
