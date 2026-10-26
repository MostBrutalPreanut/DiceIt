import { writeFileSync } from 'node:fs';
import { DECALS, type DecalId, type DecalPick } from '../../src/data/decals';
import { BOSSES, type BossId } from '../../src/data/bosses';
import { PARTS, type PartId } from '../../src/data/parts';
import { gameFor, nextRound, playRound, pool, quant, type Setup } from './lib';
import { buildLayout, loadSpecs } from './buildlib';
import { TABLES } from './tables';

/**
 * E2 and E3: every decal and every boss on a set of tables.
 *   decal: the table with no decals vs the table with this one decal (segments of 3 rounds, so Momentum/Afterglow grow)
 *   boss:  the table with its build's decals; pass rate against a goal the bare table clears ~70% of the time (x the
 *          boss's goal factor), and the score ratio with every ball played out
 *   npx vite-node tools/research/rules.ts --builds=dir --ids=a,b --out=file.json
 */
interface Task { kind: 'decal' | 'boss' | 'base'; id: string | null; table: string; profile: string; rounds: number; goal?: number; withDecals: boolean }
interface Out { task: Task; scores: number[]; won?: number; balls: number[]; peak: number[]; target?: string }

let buildsDir = '';
function tableSetup(table: string, withDecals: boolean): Setup {
  if (TABLES[table]) return TABLES[table]();
  const spec = loadSpecs(buildsDir, [table])[0];
  const { layout } = buildLayout(spec);
  return { layout, machine: spec.machine, decals: withDecals ? spec.decals.slice(0, 4).map((d) => ({ ...d })) : [], rings: layout.parts.filter((p) => p.def === 'bell').length };
}

/** The part type a targeted decal goes on: the one that scores most on the table (levelable for Level Up). */
function targetFor(id: DecalId, s: Setup): PartId | undefined {
  if (!DECALS[id].targets) return undefined;
  const r = playRound(gameFor(s), { profile: 'avg', seed: 5, detail: true });
  const ok = Object.entries(r.parts).filter(([k]) => k !== 'mega' && (id !== 'levelUp' || PARTS[k as PartId].recipe.perLevel)).sort((a, b) => (b[1]?.points ?? 0) - (a[1]?.points ?? 0));
  return ok[0]?.[0] as PartId | undefined;
}

function run(t: Task): Out {
  const s = tableSetup(t.table, t.withDecals);
  const out: Out = { task: t, scores: [], balls: [], peak: [] };
  if (t.kind === 'decal' && t.id) {
    const target = targetFor(t.id as DecalId, s);
    out.target = target;
    s.decals = [...(s.decals ?? []), { id: t.id as DecalId, target } as DecalPick];
  }
  if (t.kind === 'boss' && t.id) {
    s.boss = t.id as BossId;
    let won = 0;
    for (let i = 0; i < t.rounds; i++) {
      const g = gameFor(s);
      // the Auditor's decals-off opening only exists in a real (not fixed-mods) round
      if (BOSSES[t.id as BossId].decalsOffUntilHalf) { g.fixedMods = null; }
      const goal = Math.round((t.goal ?? 0) * (BOSSES[t.id as BossId].goalX ?? 1));
      const r = playRound(g, { profile: t.profile, seed: 700 + i, real: true, goalOverride: goal });
      if (r.won) won++;
      const g2 = gameFor(s);
      if (BOSSES[t.id as BossId].decalsOffUntilHalf) g2.fixedMods = null;
      const f = playRound(g2, { profile: t.profile, seed: 700 + i });
      out.scores.push(f.score); out.balls.push(...f.ballSeconds); out.peak.push(f.peakMult);
    }
    out.won = won;
    return out;
  }
  if (t.kind === 'base' && t.goal) {
    let won = 0;
    for (let i = 0; i < t.rounds; i++) { const r = playRound(gameFor(s), { profile: t.profile, seed: 700 + i, real: true, goalOverride: t.goal }); if (r.won) won++; }
    out.won = won;
  }
  // segments of 3 rounds on one Game
  for (let seg = 0; seg < Math.ceil(t.rounds / 3); seg++) {
    const g = gameFor(s);
    for (let i = 0; i < 3 && out.scores.length < t.rounds; i++) {
      const r = playRound(g, { profile: t.profile, seed: 700 + seg * 3 + i });
      out.scores.push(r.score); out.balls.push(...r.ballSeconds); out.peak.push(r.peakMult);
      nextRound(g, s);
    }
  }
  return out;
}

const arg = process.argv[2];
if (arg && !arg.startsWith('--')) {
  const t = JSON.parse(arg);
  buildsDir = t.dir;
  process.stdout.write('RESULT ' + JSON.stringify(run(t.task)) + '\n');
} else {
  const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true'] as [string, string]; }));
  buildsDir = args.get('builds') ?? '';
  const tables = ['late', ...(args.get('ids')?.split(',') ?? [])];
  const decals = Object.keys(DECALS) as DecalId[];
  const bosses = Object.keys(BOSSES) as BossId[];
  const R = Number(args.get('rounds') ?? 9);
  const what = (args.get('what') ?? 'decal,boss').split(',');
  // 1) baselines: every table with no decals (for the decal census) and with its decals (for the boss census)
  const baseTasks: Task[] = [];
  for (const table of tables) for (const profile of ['avg', 'pro', 'poor']) {
    baseTasks.push({ kind: 'base', id: null, table, profile, rounds: R * 2, withDecals: false });
    baseTasks.push({ kind: 'base', id: null, table, profile, rounds: R * 2, withDecals: true });
  }
  const payload = (task: Task) => ({ task, dir: buildsDir });
  const t0 = Date.now();
  const base = await pool<Out>('tools/research/rules.ts', baseTasks.map(payload), 4);
  const goalOf = (table: string, profile: string) => quant(base.find((b) => b?.task.table === table && b.task.profile === profile && b.task.withDecals)!.scores, 0.3);
  const tasks: Task[] = [];
  for (const table of tables) {
    for (const profile of ['avg', 'pro', 'poor']) tasks.push({ kind: 'base', id: null, table, profile, rounds: R, goal: goalOf(table, profile), withDecals: true });
    if (what.includes('decal')) for (const id of decals) for (const profile of table === 'late' ? ['avg', 'pro', 'poor'] : ['avg']) tasks.push({ kind: 'decal', id, table, profile, rounds: R, withDecals: false });
    if (what.includes('boss')) tasks.push({ kind: 'boss', id: 'crossedWires', table, profile: 'avgConfused', rounds: R, goal: goalOf(table, 'avg'), withDecals: true });
    if (what.includes('boss')) for (const id of bosses) for (const profile of ['avg', 'pro', 'poor']) tasks.push({ kind: 'boss', id, table, profile, rounds: R, goal: goalOf(table, profile), withDecals: true });
  }
  let done = 0;
  const res = await pool<Out>('tools/research/rules.ts', tasks.map(payload), 4, () => { if (++done % 20 === 0) console.error(`${done}/${tasks.length} ${((Date.now() - t0) / 60000).toFixed(1)} min`); });
  writeFileSync(args.get('out') ?? 'rules.json', JSON.stringify({ base, res }));
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
