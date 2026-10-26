import { readFileSync } from 'node:fs';
import { mean, median, quant } from './lib';
import type { CampaignResult } from './campaign';

/** npx vite-node tools/research/report-campaign.ts campaign.json */
const res = (JSON.parse(readFileSync(process.argv[2], 'utf8')) as CampaignResult[]).filter(Boolean);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const groups = new Map<string, CampaignResult[]>();
for (const r of res) { const k = `${r.task.strategy}/${r.task.profile}`; groups.set(k, [...(groups.get(k) ?? []), r]); }

console.log('\nRUNS: how far each player gets (rounds cleared; 15 = run won; endless rounds after)');
console.log('strategy/profile   runs  won   median reached  reached list                 endless reached');
for (const [k, rs] of [...groups].sort()) console.log(`${k.padEnd(18)} ${String(rs.length).padStart(4)}  ${pct(mean(rs.map((r) => (r.won ? 1 : 0)))).padStart(4)}   ${String(median(rs.map((r) => r.reached))).padStart(6)}          ${rs.map((r) => r.reached).sort((a, b) => a - b).join(',').padEnd(28)} ${rs.filter((r) => r.won).map((r) => r.endlessReached).join(',')}`);

console.log('\nFAIL RATE PER ROUND (rounds played -> lost there), all runs of a profile pooled');
const prof = ['pro', 'avg', 'poor'];
console.log('round  goal       ' + prof.map((p) => `${p}: played lost   score/goal p50 (p10-p90)`.padEnd(44)).join(''));
for (let n = 1; n <= 20; n++) {
  const cells = prof.map((p) => {
    const rr = res.filter((r) => r.task.profile === p).flatMap((r) => r.rounds.filter((x) => x.round === n));
    if (!rr.length) return ''.padEnd(44);
    const ratio = rr.map((x) => x.score / x.goal);
    return `${String(rr.length).padStart(6)} ${pct(rr.filter((x) => !x.won).length / rr.length).padStart(5)}   ${quant(ratio, 0.5).toFixed(2)} (${quant(ratio, 0.1).toFixed(2)}-${quant(ratio, 0.9).toFixed(2)})`.padEnd(44);
  }).join('');
  const goal = res.flatMap((r) => r.rounds.filter((x) => x.round === n))[0]?.goal ?? 0;
  console.log(`${String(n).padStart(4)}   ${goal.toLocaleString().padStart(9)}  ${cells}`);
}

console.log('\nBY STRATEGY: fail rate per round band');
for (const s of ['par', 'seeker', 'casual']) for (const p of prof) {
  const rr = res.filter((r) => r.task.strategy === s && r.task.profile === p).flatMap((r) => r.rounds);
  const band = (a: number, b: number) => { const x = rr.filter((q) => q.round >= a && q.round <= b); return x.length ? `${pct(x.filter((q) => !q.won).length / x.length)} of ${x.length}` : '-'; };
  console.log(`${(s + '/' + p).padEnd(14)} r1-5 ${band(1, 5).padEnd(10)} r6-10 ${band(6, 10).padEnd(10)} r11-15 ${band(11, 15).padEnd(10)} r16+ ${band(16, 30)}`);
}

console.log('\nECONOMY (median over runs): money at shop, spent, bought, rerolls, move fees');
for (let n = 1; n <= 15; n++) {
  const rr = res.flatMap((r) => r.rounds.filter((x) => x.round === n));
  if (!rr.length) continue;
  console.log(`${String(n).padStart(4)}  cash $${median(rr.map((x) => x.moneyStart)).toFixed(0).padStart(3)}  spent $${median(rr.map((x) => x.spent)).toFixed(0).padStart(3)}  bought ${mean(rr.map((x) => x.bought.length)).toFixed(1)}  rerolls ${mean(rr.map((x) => x.rerolls)).toFixed(1)}  fees $${mean(rr.map((x) => x.fees)).toFixed(1)}  end cash $${median(rr.map((x) => x.moneyEnd)).toFixed(0)}  parts on table ${median(rr.map((x) => x.placed))}  types ${median(rr.map((x) => x.types))}  kept Mult ${mean(rr.map((x) => x.keptMult)).toFixed(1)}  levels ${mean(rr.map((x) => x.levels)).toFixed(0)}  peak Mult ${median(rr.map((x) => x.peakMult)).toFixed(1)}  wall s ${mean(rr.map((x) => x.wallSec)).toFixed(0)}`);
}

console.log('\nBOSSES: loss rate on each boss (all runs that reached it)');
const bosses = new Map<string, { n: number; lost: number; ratio: number[] }>();
for (const r of res) for (const x of r.rounds) if (x.boss) { const b = bosses.get(x.boss) ?? { n: 0, lost: 0, ratio: [] }; b.n++; if (!x.won) b.lost++; b.ratio.push(x.score / x.goal); bosses.set(x.boss, b); }
for (const [b, v] of [...bosses].sort((a, c) => c[1].lost / c[1].n - a[1].lost / a[1].n)) console.log(`${b.padEnd(14)} met ${String(v.n).padStart(3)}  lost ${pct(v.lost / v.n).padStart(4)}  score/goal p50 ${quant(v.ratio, 0.5).toFixed(2)}`);

console.log('\nWHAT SCORED: parts most often in the top-1 of a round, rounds 10+');
const tops = new Map<string, number>();
for (const r of res) for (const x of r.rounds) if (x.round >= 10 && x.top[0]) tops.set(x.top[0][0], (tops.get(x.top[0][0]) ?? 0) + 1);
console.log([...tops].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('\nmean share of the top part, rounds 10+: ' + pct(mean(res.flatMap((r) => r.rounds.filter((x) => x.round >= 10).map((x) => (x.top[0]?.[1] ?? 0) / 100)))));

console.log('\nDECALS taken (count) and win rate of runs that had them by round 12');
const dec = new Map<string, { n: number; won: number }>();
for (const r of res) { const d = r.rounds.find((x) => x.round === 12)?.decals ?? []; for (const id of d) { const k = id.split(':')[0]; const v = dec.get(k) ?? { n: 0, won: 0 }; v.n++; if (r.won) v.won++; dec.set(k, v); } }
console.log([...dec].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n} (${pct(v.won / v.n)})`).join(', '));

console.log('\nLOSSES: the round each run ended, with the build');
for (const r of res.filter((x) => !x.won)) { const l = r.rounds.at(-1)!; console.log(`${r.task.strategy}/${r.task.profile}/${r.task.seed} ${r.task.machine} lost r${l.round}${l.boss ? ' (' + l.boss + ')' : ''} ${Math.round(l.score).toLocaleString()}/${l.goal.toLocaleString()} arch ${l.archetype ?? '-'} top ${l.top.map((t) => t.join(' ')).join(', ')} | decals ${l.decals.join(',')}`); }
