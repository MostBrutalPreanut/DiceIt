import { readFileSync } from 'node:fs';
import { DECALS, type DecalId } from '../../src/data/decals';
import { BOSSES, type BossId } from '../../src/data/bosses';
import { mean, median } from './lib';

/** npx vite-node tools/research/report-rules.ts rules.json */
interface Out { task: { kind: string; id: string | null; table: string; profile: string; rounds: number; goal?: number; withDecals: boolean }; scores: number[]; won?: number; balls: number[]; peak: number[]; target?: string }
const { base, res } = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { base: Out[]; res: Out[] };
const all = [...base, ...res].filter(Boolean);
const tables = [...new Set(all.map((o) => o.task.table))];
const baseOf = (table: string, profile: string, withDecals: boolean) => all.find((o) => o.task.kind === 'base' && !o.task.goal && o.task.table === table && o.task.profile === profile && o.task.withDecals === withDecals);
const passOf = (table: string, profile: string) => all.find((o) => o.task.kind === 'base' && o.task.goal && o.task.table === table && o.task.profile === profile);
const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;

console.log('\nDECALS: score with the decal alone vs the same table with no decals (mean of rounds; avg player unless noted)');
console.log('decal            kind    ' + tables.map((t) => t.slice(0, 16).padEnd(17)).join('') + ' late pro / poor    ball s Δ (late avg)');
for (const id of Object.keys(DECALS) as DecalId[]) {
  const cells = tables.map((t) => {
    const o = res.find((x) => x?.task.kind === 'decal' && x.task.id === id && x.task.table === t && x.task.profile === 'avg');
    const b = baseOf(t, 'avg', false);
    if (!o || !b) return ''.padEnd(17);
    return `${pct(mean(o.scores) / mean(b.scores) - 1)}${o.target ? ' ' + o.target : ''}`.slice(0, 16).padEnd(17);
  }).join('');
  const lp = (p: string) => { const o = res.find((x) => x?.task.kind === 'decal' && x.task.id === id && x.task.table === 'late' && x.task.profile === p); const b = baseOf('late', p, false); return o && b ? pct(mean(o.scores) / mean(b.scores) - 1) : '-'; };
  const o = res.find((x) => x?.task.kind === 'decal' && x.task.id === id && x.task.table === 'late' && x.task.profile === 'avg'), b = baseOf('late', 'avg', false);
  console.log(`${id.padEnd(16)} ${DECALS[id].kind.padEnd(7)} ${cells} ${lp('pro').padStart(6)} / ${lp('poor').padEnd(6)}    ${o && b ? (mean(o.balls) - mean(b.balls)).toFixed(1) : ''}`);
}

console.log('\nBOSSES: pass rate against a goal the table (with its decals) clears ~70% of the time without the boss (x the boss goal factor), and the score ratio with every ball out');
console.log('boss           ' + tables.map((t) => t.slice(0, 22).padEnd(23)).join(''));
for (const prof of ['avg', 'pro', 'poor', 'avgConfused']) {
  console.log(`-- ${prof}`);
  const bossIds = prof === 'avgConfused' ? ['crossedWires'] : Object.keys(BOSSES);
  for (const id of bossIds as BossId[]) {
    const cells = tables.map((t) => {
      const o = res.find((x) => x?.task.kind === 'boss' && x.task.id === id && x.task.table === t && x.task.profile === prof);
      const p = passOf(t, prof === 'avgConfused' ? 'avg' : prof), b = baseOf(t, prof === 'avgConfused' ? 'avg' : prof, true);
      if (!o || !p || !b) return ''.padEnd(23);
      return `${Math.round((100 * (o.won ?? 0)) / o.task.rounds)}% (base ${Math.round((100 * (p.won ?? 0)) / p.task.rounds)}%) x${(median(o.scores) / median(b.scores)).toFixed(2)}`.padEnd(23);
    }).join('');
    console.log(`${id.padEnd(14)} ${cells}`);
  }
}
