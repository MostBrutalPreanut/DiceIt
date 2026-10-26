import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Layout } from '../src/sim/layout';
import { cluster, measure, perHundred, randomTable, type Cause } from './returns';

/**
 * The return-to-plunger report (see returns.ts):
 *   npx vite-node tools/stuck.ts [--tables=40] [--rounds=2] [--seed=1] [--skill=0.6] [--verbose]
 *   --layouts=file.json   play these tables instead (written there first if the file does not exist), so the
 *                         same tables can be compared before and after a change to the placement rules
 */
const args = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true']; }));
const num = (k: string, d: number) => Number(args.get(k) ?? d);
const tables = num('tables', 40), seed = num('seed', 1);
const file = args.get('layouts');
const layouts: Layout[] = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : Array.from({ length: tables }, (_, i) => randomTable(seed * 7919 + i));
if (file && !existsSync(file)) writeFileSync(file, JSON.stringify(layouts));
const t0 = Date.now();
const rep = measure(layouts, { rounds: num('rounds', 2), seed, skill: num('skill', 0.6) });
console.log(`${layouts.length} tables, ${rep.balls} balls (${rep.launches} launches, ${rep.drains} drains), ${(rep.seconds / 60).toFixed(0)} sim minutes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const ph = perHundred(rep);
console.log('returns to the plunger per 100 balls: ' + (['saver', 'net', 'lane', 'short', 'relaunch', 'timeout', 'clock'] as Cause[]).map((c) => `${c} ${ph[c]}`).join(', '));
console.log(`ball searches per 100 balls: ${ph.search}, tilts: ${ph.tilt}`);
for (const c of ['lane', 'search', 'relaunch', 'timeout', 'saver'] as Cause[]) cluster(rep.incidents.filter((i) => i.cause === c), c);
if (args.has('verbose')) for (const i of rep.incidents.filter((q) => q.cause === 'search' || q.cause === 'lane' || q.cause === 'relaunch')) console.log(JSON.stringify(i));
