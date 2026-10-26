import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makePart, PARTS, type PartId } from '../../src/data/parts';
import type { DecalPick } from '../../src/data/decals';
import type { BossId } from '../../src/data/bosses';
import type { MachineId } from '../../src/data/bigboi';
import { Game } from '../../src/game/game';
import { DECOR_SLOT } from '../../src/sim/cabinet';
import { cloneLayout, type Layout } from '../../src/sim/layout';
import { gameFor, mean, place, playRound, pool } from './lib';
import { buildLayout, loadSpecs, variantSpec, type BuildResult, type BuildTask, type SegRound } from './buildlib';
export * from './buildlib';

/**
 * E4 and E6: the build finder's builds, played. A build is laid out from its spec (spots repaired to the nearest legal
 * one), optionally refined by the auto-placer, then played as a run segment on a real Game: warm-up rounds 10-12 (not
 * judged: levels, polish, Momentum grow), then rounds 13, 14 and the final boss in 15 judged against the real goals, then
 * endless rounds until a round is lost. `clock` mode instead plays every ball out with the clock on and off.
 *   npx vite-node tools/research/builds.ts --dir=builds --out=file.json [--mode=segment|clock] [--ids=a,b]
 */
function segment(t: BuildTask, layout: Layout): SegRound[] {
  const spec = variantSpec(t.spec, t.variant);
  const g = new Game();
  g.machine = spec.machine ?? 'factory';
  g.layout = cloneLayout(layout);
  g.decals = spec.decals.filter((d) => d && d.id).slice(0, 4).map((d) => ({ ...d, grown: d.id === 'momentum' ? 2 : d.id === 'afterglow' ? 1.5 : undefined }));
  g.rings = g.layout.parts.filter((p) => p.def === 'bell').length;
  g.bossPlan = ['taxMan', 'taxMan', 'taxMan', 'taxMan', t.final];
  g.round = 10;
  g.money = 25;
  g.pending = null;
  g.toWorkshop();
  const out: SegRound[] = [];
  for (let n = 10; n <= 15 + t.endless; n++) {
    g.round = n;
    g.money = Math.max(g.money, 25);
    for (const p of g.placed.filter((q) => PARTS[q.def].recipe.well)) for (let k = 0; k < 5; k++) g.wish(p.uid);
    g.pending = null;
    const r = playRound(g, { profile: t.profile, seed: t.seed * 1000 + n, real: true, detail: true });
    const tot = Object.values(r.parts).reduce((a, v) => a + (v?.points ?? 0), 0) || 1;
    const zap = Object.values(r.zapBy).reduce((a, z) => a + z.points, 0);
    out.push({
      round: n, goal: r.goal ?? 0, score: r.score, won: !!r.won, clearBall: r.clearBall ?? 0, ratio: r.score / (r.goal || 1), peak: r.peakMult,
      top: Object.entries(r.parts).map(([k, v]) => [k, Math.round((100 * (v?.points ?? 0)) / tot)] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 4),
      sparkShare: r.sparkPoints / tot, zapShare: zap / tot, wallMs: r.wallMs, worstStepMs: r.worstStepMs, maxSparks: r.maxSparks, maxBalls: r.maxBalls, ballSeconds: r.ballSeconds,
    });
    if (!r.won && n >= 13) break;
    const keepRound = n;
    g.continueAfterRound();
    g.round = keepRound + 1;
  }
  return out;
}

function clockTest(t: BuildTask, layout: Layout): BuildResult['clock'] {
  const spec = variantSpec(t.spec, t.variant);
  const s = { layout, machine: spec.machine, decals: spec.decals.slice(0, 4).map((d) => ({ ...d, grown: d.id === 'momentum' ? 2 : d.id === 'afterglow' ? 1.5 : undefined })), rings: layout.parts.filter((p) => p.def === 'bell').length, round: 13 };
  const on: number[] = [], off: number[] = [], offBalls: number[] = [], onBalls: number[] = [], offMarks: number[][] = [];
  for (let i = 0; i < 3; i++) {
    const a = playRound(gameFor(s), { profile: t.profile, seed: t.seed * 100 + i });
    on.push(a.score); onBalls.push(...a.ballSeconds);
    const marks: number[] = [];
    const b = playRound(gameFor(s), { profile: t.profile, seed: t.seed * 100 + i, noClock: true, capSeconds: 600, marks: [30, 60, 120, 180, 300, 420, 600, 900, 1200, 1500, 1800], onMark: (_, sc) => marks.push(sc) });
    off.push(b.score); offBalls.push(...b.ballSeconds); offMarks.push(marks);
  }
  return { on, off, offBalls, onBalls, offMarks };
}

function run(t: BuildTask): BuildResult {
  const spec = variantSpec(t.spec, t.variant);
  let { layout, moved, missing, cost } = buildLayout(spec);
  if (t.variant === 'auto') {
    const s = { layout, machine: spec.machine, decals: spec.decals.slice(0, 4), round: 13 };
    layout = place(s, { profile: 'avg', seed: 77, evalRounds: 2, tries: 1, steps: 16 }).layout;
  }
  const base = { ...t, spec: undefined, id: t.spec.id } as BuildResult['task'] & { spec?: unknown };
  delete base.spec;
  if (t.mode === 'clock') return { task: base, moved, missing, cost, rounds: [], reachedFinal: false, beatFinal: false, lastWon: 0, clock: clockTest(t, layout) };
  const rounds = segment(t, layout);
  const r15 = rounds.find((r) => r.round === 15);
  const lastWon = Math.max(0, ...rounds.filter((r) => r.won).map((r) => r.round));
  return { task: base, moved, missing, cost, rounds, reachedFinal: rounds.filter((r) => r.round >= 13 && r.round < 15).every((r) => r.won) && !!r15, beatFinal: !!r15?.won, lastWon };
}

const arg = process.argv[2];
if (arg && !arg.startsWith('--')) process.stdout.write('RESULT ' + JSON.stringify(run(JSON.parse(arg))) + '\n');
else {
  const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true'] as [string, string]; }));
  const specs = loadSpecs(args.get('dir')!, args.get('ids')?.split(','));
  const mode = (args.get('mode') ?? 'segment') as BuildTask['mode'];
  const seeds = Number(args.get('seeds') ?? 2);
  const tasks: BuildTask[] = [];
  const finals: BossId[] = ['auditor', 'overlord', 'whirlpool'];
  for (const spec of specs) {
    if (mode === 'clock') { for (const profile of (args.get('profiles') ?? 'pro,avg').split(',')) tasks.push({ spec, variant: 'full', final: 'auditor', profile, seed: 1, mode, endless: 0 }); continue; }
    for (const variant of (args.get('variants') ?? 'full,partial,auto').split(',') as BuildTask['variant'][]) {
      if (variant === 'partial' && !spec.partial) continue;
      for (const profile of ['pro', 'avg', 'poor']) for (let s = 1; s <= seeds; s++) tasks.push({ spec, variant, final: finals[(s + profile.length + spec.id.length) % 3], profile, seed: s, mode, endless: Number(args.get('endless') ?? 7) });
    }
  }
  const t0 = Date.now();
  let done = 0;
  const res = await pool<BuildResult>('tools/research/builds.ts', tasks, Number(args.get('workers') ?? 4), (i, r) => { done++; if (done % 10 === 0) console.error(`[${done}/${tasks.length}] ${((Date.now() - t0) / 60000).toFixed(1)} min`); void r; });
  writeFileSync(args.get('out') ?? 'builds-result.json', JSON.stringify(res));
  console.log(`done ${tasks.length} in ${((Date.now() - t0) / 60000).toFixed(1)} min; beat final ${mean(res.filter(Boolean).map((r) => (r.beatFinal ? 1 : 0))).toFixed(2)}`);
}
