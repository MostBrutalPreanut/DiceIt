import { gameFor, mean, median, playRound, pool, quant, type RoundTrace } from './lib';
import { TABLES } from './tables';

/**
 * E0: what the player profiles are. Each profile plays each standard table, every ball out (and once with the clock off).
 *   npx vite-node tools/research/calibrate.ts            (the report, using 4 workers)
 *   npx vite-node tools/research/calibrate.ts '{"table":"mid","profile":"avg","rounds":10,"noClock":false}'   (one worker task)
 */
const arg = process.argv[2];
if (arg) {
  const t = JSON.parse(arg);
  const out: RoundTrace[] = [];
  for (let i = 0; i < t.rounds; i++) out.push(playRound(gameFor(TABLES[t.table]()), { profile: t.profile, seed: 100 + i, noClock: t.noClock, capSeconds: 600 }));
  process.stdout.write('RESULT ' + JSON.stringify(out.map((r) => ({ score: r.score, cumulative: r.cumulative, ballSeconds: r.ballSeconds, drains: r.drains, timeouts: r.timeouts, saves: r.saves, presses: r.presses, seconds: r.seconds, capped: r.capped, wallMs: r.wallMs, peak: r.peakMult }))) + '\n');
} else {
  const tasks: { table: string; profile: string; rounds: number; noClock: boolean }[] = [];
  for (const table of ['starter', 'mid', 'late']) for (const profile of ['pro', 'avg', 'poor', 'par']) tasks.push({ table, profile, rounds: 16, noClock: false });
  for (const table of ['mid', 'late']) for (const profile of ['pro', 'avg']) tasks.push({ table, profile, rounds: 6, noClock: true });
  const res = await pool<ReturnType<typeof JSON.parse>[]>('tools/research/calibrate.ts', tasks, 4);
  console.log('table    profile clock  score p10/p50/p90          ball s (median, mean)  timeouts/ball  drains/ball  presses/round  peakMult  wall s/round');
  tasks.forEach((t, i) => {
    const r = res[i];
    if (!r) return;
    const balls = r.flatMap((x: { ballSeconds: number[] }) => x.ballSeconds);
    const sc = r.map((x: { score: number }) => x.score);
    const nb = balls.length;
    console.log(`${t.table.padEnd(8)} ${t.profile.padEnd(7)} ${t.noClock ? 'OFF' : 'on '}  ${[quant(sc, 0.1), quant(sc, 0.5), quant(sc, 0.9)].map((v) => Math.round(v).toLocaleString().padStart(9)).join(' ')}   ${median(balls).toFixed(0).padStart(6)} ${mean(balls).toFixed(0).padStart(6)}         ${(r.reduce((a: number, x: { timeouts: number }) => a + x.timeouts, 0) / nb).toFixed(2).padStart(5)}        ${(r.reduce((a: number, x: { drains: number }) => a + x.drains, 0) / nb).toFixed(2).padStart(5)}        ${mean(r.map((x: { presses: number }) => x.presses)).toFixed(0).padStart(5)}      ${median(r.map((x: { peak: number }) => x.peak)).toFixed(1).padStart(5)}    ${(mean(r.map((x: { wallMs: number }) => x.wallMs)) / 1000).toFixed(1)}${t.noClock ? `  capped balls: ${r.filter((x: { capped: boolean }) => x.capped).length}` : ''}`);
  });
}
