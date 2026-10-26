import { writeFileSync } from 'node:fs';
import { RUNOUT_MAX } from '../../src/sim/constants';
import { PARTS } from '../../src/data/parts';
import { buildLayout, loadSpecs } from './buildlib';
import { gameFor, makePlayer, mean, pool, quant, type Setup } from './lib';
import { TABLES } from './tables';

/**
 * The ball run-out (the clock runs out: hands off, balls roll out, at most RUNOUT_MAX s, then what is left is taken).
 * For every table and player, with the real clock: how often the clock runs out, how long run-outs last, how they end
 * (every ball rolled out by itself, a stuck ball taken, or the cut taking balls), what the run-out scores, and whether a
 * ball comes back on a fresh clock after a run-out (a Free Ball Bucket catch sends it to the lane).
 *   npx vite-node tools/research/runout.ts --builds=<dir> --out=runout.json
 */
interface Runout { dur: number; end: 'rolled' | 'cut' | 'stuck' | 'lane'; taken: number; points: number; parts: Record<string, number> }
interface Out { variant: string; table: string; profile: string; rounds: number; balls: number; ballSeconds: number[]; score: number[]; runouts: Runout[]; freshClocks: number; scoreDuring: number }

function setupOf(table: string, dir: string): Setup {
  if (TABLES[table]) return TABLES[table]();
  const spec = loadSpecs(dir, [table])[0];
  const { layout } = buildLayout(spec);
  return { layout, machine: spec.machine, decals: spec.decals.slice(0, 4).map((d) => ({ ...d, grown: d.id === 'momentum' ? 2 : d.id === 'afterglow' ? 1.5 : undefined })), rings: layout.parts.filter((p) => p.def === 'bell').length };
}

/**
 * Run-out variants, tried from the harness (the game is not changed): at time up,
 *   v0  as the game does it now
 *   v1  power down: bumpers and slings stop kicking, a caught ball is let go at once, Kickbacks and the Bucket switch off
 *   v2  drain pull: a pull towards the drain that grows over 5 s
 *   v3  both
 *   v4  power down, and catchers (Mag-Grab, scoops, the Wheel, locks) stop catching: a ball rolls over them for its points
 */
type Variant = 'v0' | 'v1' | 'v2' | 'v3' | 'v4';
interface SimHack { mods: { kickFactor: number; magnet: { x: number; y: number; strength: number; radius: number } | null }; balls: { held: { until: number } | null }[]; parts: Map<number, { inst: { def: string }; armed?: boolean; readyAt?: number }>; tick: number }
function runoutStart(sim: SimHack, v: Variant) {
  const saucers = (Object.keys(PARTS) as (keyof typeof PARTS)[]).filter((id) => PARTS[id].kind === 'saucer');
  const saved = { kick: sim.mods.kickFactor, magnet: sim.mods.magnet, bucket: PARTS.bucket.recipe.bucket, saucers: v === 'v4' ? saucers : [] };
  if (v === 'v4') for (const id of saucers) (PARTS[id] as { kind: string }).kind = 'rollover';
  if (v === 'v1' || v === 'v3' || v === 'v4') {
    sim.mods.kickFactor = 0;
    for (const p of sim.parts.values()) if (p.inst.def === 'kickback') { p.armed = false; p.readyAt = Infinity; }
    (PARTS.bucket.recipe as { bucket?: boolean }).bucket = undefined;
  }
  return saved;
}
function runoutStep(sim: SimHack, v: Variant, since: number) {
  if (v === 'v1' || v === 'v3' || v === 'v4') for (const b of sim.balls) if (b.held) b.held.until = sim.tick;
  if (v === 'v2' || v === 'v3') sim.mods.magnet = { x: 12, y: 6, strength: Math.min(50, 10 * since), radius: 45 };
}
function runoutEnd(sim: SimHack, saved: ReturnType<typeof runoutStart>) {
  for (const id of saved.saucers) (PARTS[id] as { kind: string }).kind = 'saucer';
  sim.mods.kickFactor = saved.kick;
  sim.mods.magnet = saved.magnet;
  (PARTS.bucket.recipe as { bucket?: boolean }).bucket = saved.bucket;
  for (const p of sim.parts.values()) if (p.inst.def === 'kickback' && p.readyAt === Infinity) { p.readyAt = 0; }
}

function run(t: { table: string; profile: string; rounds: number; dir: string; variant?: Variant }): Out {
  const v: Variant = t.variant ?? 'v0';
  const s = setupOf(t.table, t.dir);
  const out: Out = { variant: v, table: t.table, profile: t.profile, rounds: t.rounds, balls: 0, ballSeconds: [], score: [], runouts: [], freshClocks: 0, scoreDuring: 0 };
  for (let i = 0; i < t.rounds; i++) {
    const g = gameFor(s);
    g.goalOverride = Infinity;
    g.seed = 4000 + i;
    g.startRound();
    const p = makePlayer(t.profile, 4000 + i);
    let ro: (Runout & { at: number; score0: number }) | null = null;
    let saved: ReturnType<typeof runoutStart> | null = null;
    const sim = () => g.sim as unknown as SimHack;
    let ballStart = 0, afterRunout = false;
    const uidDef = new Map(g.layout.parts.map((q) => [q.uid, q.def as string]));
    for (let guard = 0; g.mode === 'round' && guard < 240 * 60 * 40; guard++) {
      const res = g.step(p.decide(g.sim));
      for (const e of res.sim) {
        if (e.type === 'timeUp') { ro = { at: e.t, score0: g.scorer.score, dur: 0, end: 'rolled', taken: 0, points: 0, parts: {} }; saved = runoutStart(sim(), v); }
        if (ro && e.type === 'drain' && e.reason === 'timeout') { ro.taken++; ro.end = e.t - ro.at > RUNOUT_MAX ? 'cut' : 'stuck'; }
        if (e.type === 'launch' && afterRunout) { out.freshClocks++; afterRunout = false; }
      }
      if (ro && g.sim.timeUp) runoutStep(sim(), v, g.sim.time - ro.at);
      if (saved && !g.sim.timeUp) { runoutEnd(sim(), saved); saved = null; }
      if (ro) for (const sc of res.score) { const d = uidDef.get(sc.uid) ?? sc.def; ro.parts[d] = (ro.parts[d] ?? 0) + sc.points; }
      // the run-out is over when the sim says time is no longer up
      const ballEnded = res.game.some((e) => e.type === 'ballEnd');
      if (ro && !g.sim.timeUp && !ballEnded) {
        // the run-out ended but the ball did not: a ball went back to the lane (a Bucket catch), and a new clock follows
        const laneBall = true;
        if (laneBall) { ro.end = 'lane'; afterRunout = true; }
        ro.dur = g.sim.time - ro.at; ro.points = g.scorer.score - ro.score0; out.scoreDuring += ro.points;
        out.runouts.push({ dur: ro.dur, end: ro.end, taken: ro.taken, points: ro.points, parts: ro.parts });
        ro = null;
      }
      if (res.game.some((e) => e.type === 'ballEnd')) {
        if (ro) { ro.dur = g.sim.time - ro.at; ro.points = g.scorer.score - ro.score0; out.scoreDuring += ro.points; out.runouts.push({ dur: ro.dur, end: ro.end, taken: ro.taken, points: ro.points, parts: ro.parts }); ro = null; }
        out.balls++; out.ballSeconds.push(g.sim.time - ballStart); ballStart = g.sim.time; afterRunout = false;
      }
    }
    out.score.push(g.scorer.score);
  }
  return out;
}

const arg = process.argv[2];
if (arg && !arg.startsWith('--')) process.stdout.write('RESULT ' + JSON.stringify(run(JSON.parse(arg))) + '\n');
else {
  const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true'] as [string, string]; }));
  const dir = args.get('builds')!;
  const tables = ['starter', 'mid', 'late', ...loadSpecs(dir).map((s) => s.id)];
  const variants = (args.get('variants') ?? 'v0').split(',') as Variant[];
  const tasks = variants.flatMap((variant) => tables.flatMap((table) => ['pro', 'avg', 'poor'].map((profile) => ({ table, profile, rounds: Number(args.get('rounds') ?? 4), dir, variant }))));
  const res = (await pool<Out>('tools/research/runout.ts', tasks, 4)).filter(Boolean);
  writeFileSync(args.get('out') ?? 'runout.json', JSON.stringify(res));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  console.log('table                              player  balls  clock ran out  run-out s p50/max   ended: rolled out / stuck taken / cut taken / back to lane   balls taken  run-out share of score  fresh clocks');
  for (const r of res) {
    const ro = r.runouts, n = ro.length || 1;
    const c = (e: string) => ro.filter((x) => x.end === e).length;
    const total = r.score.reduce((a, b) => a + b, 0) || 1;
    console.log(`${r.table.slice(0, 34).padEnd(34)} ${r.profile.padEnd(6)} ${String(r.balls).padStart(5)}  ${pct(ro.length / Math.max(1, r.balls)).padStart(12)}  ${quant(ro.map((x) => x.dur), 0.5).toFixed(1).padStart(6)}/${Math.max(0, ...ro.map((x) => x.dur)).toFixed(0).padEnd(5)}   ${pct(c('rolled') / n).padStart(5)} / ${pct(c('stuck') / n).padStart(5)} / ${pct(c('cut') / n).padStart(5)} / ${pct(c('lane') / n).padStart(5)}             ${String(ro.reduce((a, x) => a + x.taken, 0)).padStart(4)}        ${pct(r.scoreDuring / total).padStart(6)}               ${r.freshClocks}`);
  }
  for (const variant of variants) {
    const rs = res.filter((r) => r.variant === variant), all = rs.flatMap((r) => r.runouts);
    const durs = all.map((x) => x.dur);
    const share = rs.reduce((a, r) => a + r.scoreDuring, 0) / Math.max(1, rs.reduce((a, r) => a + r.score.reduce((b, c) => b + c, 0), 0));
    const self = rs.filter((r) => /autopilot|elevator|purist|castle|broom|bell-tower|overdrive/.test(r.table)).flatMap((r) => r.runouts);
    console.log(`SUMMARY ${variant}: ${all.length} run-outs; rolled out ${pct(all.filter((x) => x.end === 'rolled').length / all.length)}, cut at ${RUNOUT_MAX} s ${pct(all.filter((x) => x.end === 'cut').length / all.length)} (on the self-playing builds ${pct(self.filter((x) => x.end === 'cut').length / Math.max(1, self.length))}), back to the lane ${pct(all.filter((x) => x.end === 'lane').length / all.length)}, balls taken ${all.reduce((a, x) => a + x.taken, 0)}, fresh clocks ${rs.reduce((a, r) => a + r.freshClocks, 0)}; run-out s p50 ${quant(durs, 0.5).toFixed(1)} p90 ${quant(durs, 0.9).toFixed(1)}; run-out share of all points ${pct(share)}; mean round score ${Math.round(mean(rs.flatMap((r) => r.score))).toLocaleString()}`);
  }
  const all = res.flatMap((r) => r.runouts);
  console.log(`\nall: ${all.length} run-outs; rolled out by themselves ${pct(all.filter((x) => x.end === 'rolled').length / all.length)}, a stuck ball taken ${pct(all.filter((x) => x.end === 'stuck').length / all.length)}, cut at ${RUNOUT_MAX} s ${pct(all.filter((x) => x.end === 'cut').length / all.length)}, back to the lane ${pct(all.filter((x) => x.end === 'lane').length / all.length)}; mean ${mean(all.map((x) => x.dur)).toFixed(1)} s`);
  const cutParts: Record<string, number> = {};
  for (const x of all.filter((q) => q.end === 'cut' || q.end === 'lane')) for (const [k, v] of Object.entries(x.parts)) cutParts[k] = (cutParts[k] ?? 0) + v;
  console.log('what kept balls up in the run-outs that were cut or went back to the lane (points scored during them, by part): ' + Object.entries(cutParts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${Math.round(v).toLocaleString()}`).join(', '));
}
