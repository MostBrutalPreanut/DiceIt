import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ENDLESS_GOALS, GOAL_GROWTH, GOALS } from '../src/data/goals';
import { niceGoal, payoutFor } from '../src/game/game';
import { clearBall, failRate, fitLogQuadratic, goalCandidate, quantile, type ParOptions, type ParRound, type ParRun } from './par';

/**
 * The balance table. Several par players (see par.ts) each play a whole run's worth of rounds in their own
 * process; their measured scores set the goal curve, and the same samples are then judged against that
 * curve to show how often a par machine clears, what it earns, and how long it all takes.
 *
 *   npm run balance                      the full table (about 15 minutes on 4 cores)
 *   npm run balance -- --quick           a rough look in a couple of minutes
 *   npm run balance -- --write           also write src/data/goals.ts
 *   npm run balance -- --verify          judge the par machines against the goals now in src/data/goals.ts
 *   --cache=file   save the par runs there, and reuse them next time (so the report can be re-read without a 20 minute run)
 *   --player=pro|avg|poor|bot   who plays (default avg: the research player in tools/research/lib.ts; bot is the old per-frame Bot at --skill)
 *   --players=pro,avg,poor      the whole table once per player, one after the other
 *   options: --seed-base=0 --runs=4 --rounds=15 --measure=30 --skill=0.6 --eval=2 --steps=10 --tries=4 --fail-start=0.1 --fail-end=0.4
 */
const args = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true']; }));
const num = (k: string, d: number) => Number(args.get(k) ?? d);
const quick = args.has('quick');
const runs = num('runs', quick ? 2 : 4);
const opts: Omit<ParOptions, 'seed' | 'goals' | 'log'> = { // `player` changes per pass with --players
  rounds: num('rounds', quick ? 6 : 15),
  failStart: num('fail-start', 0.1),
  failEnd: num('fail-end', 0.4),
  skill: num('skill', 0.6),
  player: (args.get('player') ?? 'avg') as ParOptions['player'],
  measure: num('measure', quick ? 10 : 30),
  build: { evalRounds: num('eval', quick ? 1 : 2), steps: num('steps', quick ? 3 : 10), placeTries: num('tries', quick ? 2 : 4) },
};
const verify = args.has('verify');
const seedBase = num('seed-base', 0);

function runWorker(seed: number): Promise<ParRun> {
  return new Promise((resolve, reject) => {
    const payload: ParOptions = { ...opts, seed, goals: verify ? GOALS : undefined };
    const child = spawn('npx', ['vite-node', 'tools/par-run.ts', JSON.stringify(payload)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => process.stderr.write(String(d)));
    child.on('exit', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('RESULT '));
      if (code === 0 && line) resolve(JSON.parse(line.slice(7)));
      else reject(new Error(`par run ${seed} failed (exit ${code})`));
    });
  });
}

const median = (xs: number[]) => quantile(xs, 0.5);
const pad = (s: string | number, n: number) => String(s).padStart(n);
const k = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const pct = (x: number) => `${Math.round(x * 100)}%`;

async function main() {
  const t0 = Date.now();
  console.error(`${runs} par runs x ${opts.rounds} rounds, player ${opts.player}${opts.player === 'bot' ? ` (skill ${opts.skill})` : ''}, ${opts.measure} measured rounds each${verify ? ' (verify against src/data/goals.ts)' : ''}`);
  const cache = args.get('cache') && (players.length ? `${args.get('cache')}.${opts.player}` : args.get('cache'));
  let results: ParRun[];
  if (cache && existsSync(cache)) {
    results = JSON.parse(readFileSync(cache, 'utf8'));
    console.error(`reusing ${cache}`);
  } else {
    results = await Promise.all(Array.from({ length: runs }, (_, i) => runWorker(seedBase + i + 1)));
    if (cache) writeFileSync(cache, JSON.stringify(results));
  }
  const rounds = (n: number): ParRound[] => results.map((r) => r.rounds[n - 1]);

  // ---- the goals -----------------------------------------------------------------------------------
  // the score that a pooled par machine fails the target share of the time, round by round: noisy, because four
  // par runs differ in luck. The goal is a smooth curve through them (log-quadratic), never growing less than 12% a round.
  const raw = Array.from({ length: opts.rounds }, (_, i) => goalCandidate(rounds(i + 1).flatMap((r) => r.samples), rounds(i + 1)[0].ballsPerRound, failRate(i + 1, opts.rounds, opts.failStart, opts.failEnd)));
  const smooth = fitLogQuadratic(raw);
  const goals: number[] = [];
  let floor = 0;
  for (const g of smooth) {
    floor = Math.max(g, floor * 1.12);
    goals.push(niceGoal(floor));
  }
  const judged = verify ? GOALS : goals;

  console.log(`\nPAR MACHINES  (${runs} runs; player ${opts.player}${opts.player === 'bot' ? ` at skill ${opts.skill}` : ''}; balls per round ${rounds(1)[0].ballsPerRound}+)`);
  console.log(' rnd  parts placed  cash  bought  autobuild gain   upgrade taken (run 1)');
  for (let n = 1; n <= opts.rounds; n++) {
    const rs = rounds(n);
    const spent = rs.map((r) => r.bought.reduce((a, b) => a + b.price, 0));
    const gain = rs.map((r) => (r.buildBefore > 0 ? r.buildAfter / r.buildBefore : 1));
    console.log(`${pad(n, 4)}  ${pad(median(rs.map((r) => Object.values(r.owned).reduce((a, b) => a + (b ?? 0), 0))), 5)} ${pad(median(rs.map((r) => r.placed)), 6)}  ${pad('$' + Math.round(median(rs.map((r) => r.moneyStart))), 4)}  ${pad(median(rs.map((r) => r.bought.length)), 5)}  ${pad('x' + median(gain).toFixed(2), 9)}      ${rs[0].picked ?? ''}`);
  }

  console.log('\nSCORES  (every ball played out; pooled over all runs)');
  console.log(' rnd   ball1 p50    after 2 balls p10 / p50 / p90      full round p10 / p50 / p90     ball searches');
  for (let n = 1; n <= opts.rounds; n++) {
    const S = rounds(n).flatMap((r) => r.samples);
    const B = rounds(n)[0].ballsPerRound;
    const at = (b: number) => S.map((s) => s.cumulative[Math.min(b, s.cumulative.length) - 1] ?? 0);
    const q = (xs: number[]) => `${pad(k(quantile(xs, 0.1)), 7)} ${pad(k(quantile(xs, 0.5)), 7)} ${pad(k(quantile(xs, 0.9)), 7)}`;
    console.log(`${pad(n, 4)}  ${pad(k(quantile(at(1), 0.5)), 9)}    ${q(at(Math.max(1, B - 1)))}      ${q(at(B))}       ${S.reduce((a, s) => a + s.searches, 0)}`);
  }

  console.log(`\nGOALS  (the full round's score that a par machine fails ${pct(opts.failStart)} of the time in round 1, rising to ${pct(opts.failEnd)} in round ${opts.rounds}; pooled over runs)`);
  console.log(' rnd   fail target   par measure (min-max over runs)   smoothed goal   clears with a ball to spare   clears on the last ball   fails   growth');
  let prev = 0;
  for (let n = 1; n <= opts.rounds; n++) {
    const rs = rounds(n);
    const cands = rs.map((r) => r.goalCandidate);
    const S = rs.flatMap((r) => r.samples);
    const target = failRate(n, opts.rounds, opts.failStart, opts.failEnd);
    const B = rs[0].ballsPerRound;
    const ks = S.map((s) => clearBall(s, judged[n - 1]));
    const spare = ks.filter((x) => x > 0 && x < B).length / ks.length, last = ks.filter((x) => x === B).length / ks.length, fail = ks.filter((x) => x === 0).length / ks.length;
    console.log(`${pad(n, 4)}   ${pad(pct(target), 11)}   ${pad(k(raw[n - 1]), 6)} (${k(Math.min(...cands))}-${k(Math.max(...cands))})`.padEnd(58) + `${pad(judged[n - 1], 11)}   ${pad(pct(spare), 12)}               ${pad(pct(last), 10)}        ${pad(pct(fail), 5)}   ${prev ? 'x' + (judged[n - 1] / prev).toFixed(2) : ''}`);
    prev = judged[n - 1];
  }

  console.log('\nWHERE THE POINTS COME FROM  (share of the score by part type; pooled over runs)');
  for (let n = 1; n <= opts.rounds; n++) {
    const total: Record<string, number> = {};
    for (const s of rounds(n).flatMap((r) => r.samples)) for (const [id, v] of Object.entries(s.points)) total[id] = (total[id] ?? 0) + (v ?? 0);
    const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
    const top = Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => `${id} ${pct(v / sum)}`).join('  ');
    console.log(`${pad(n, 4)}   ${top}`);
  }

  console.log('\nECONOMY  (income judged against these goals; a part costs $1 to $8)');
  console.log(' rnd   income  cash at shop   spent   bought   rerolls   income / cheapest useful part');
  for (let n = 1; n <= opts.rounds; n++) {
    const rs = rounds(n);
    const incomes = rs.map((r) => {
      const ps = r.samples.map((s) => { const kk = clearBall(s, judged[n - 1]); return kk ? payoutFor({ round: n, ballsLeft: r.ballsPerRound - kk, score: s.cumulative[kk - 1], goal: judged[n - 1], coins: s.coins[kk - 1], money: r.moneyHeld, mods: r.mods }).total : null; }).filter((x): x is number => x !== null);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 3 + n;
    });
    const spent = rs.map((r) => r.bought.reduce((a, b) => a + b.price, 0));
    console.log(`${pad(n, 4)}   ${pad('$' + median(incomes).toFixed(1), 6)}  ${pad('$' + Math.round(median(rs.map((r) => r.moneyStart))), 10)}   ${pad('$' + Math.round(median(spent)), 5)}   ${pad(median(rs.map((r) => r.bought.length)), 5)}   ${pad(median(rs.map((r) => r.rerolls)), 6)}       ${(median(incomes) / 3).toFixed(1)}x`);
  }

  console.log('\nPACING  (play time only: the shop and tuning add to it)');
  console.log(' rnd   seconds per ball   minutes in the round   minutes into the run');
  let run = 0;
  for (let n = 1; n <= opts.rounds; n++) {
    const rs = rounds(n);
    const perBall: number[] = [], roundSec: number[] = [];
    for (const r of rs) for (const s of r.samples) {
      const kk = clearBall(s, judged[n - 1]) || r.ballsPerRound;
      perBall.push(s.seconds / r.ballsPerRound);
      roundSec.push((s.seconds / r.ballsPerRound) * kk);
    }
    run += median(roundSec) / 60;
    console.log(`${pad(n, 4)}   ${pad(median(perBall).toFixed(0), 14)}   ${pad((median(roundSec) / 60).toFixed(1), 18)}   ${pad(run.toFixed(0), 18)}`);
  }

  const traps = results.flatMap((r) => r.rounds).reduce((a, r) => a + r.samples.reduce((b, s) => b + s.searches, 0), 0);
  console.log(`\nball searches while measuring (a ball that stopped moving): ${traps}. Upgrades par took: ${results.map((r) => `[run ${r.seed}: ${r.upgrades.join(', ')}]`).join(' ')}`);
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} minutes`);

  if (args.has('write') && !verify && !players.length) {
    const growth = Math.min(1.8, Math.max(1.3, Math.round(((goals[goals.length - 1] / goals[Math.max(0, goals.length - 4)]) ** (1 / Math.min(3, goals.length - 1))) * 20) / 20)) || GOAL_GROWTH;
    writeFileSync('src/data/goals.ts', `/**
 * The goal for each round: the points you need over a round's balls. Generated by the balance bot
 * (\`npm run balance -- --write\`: ${runs} par runs, bot skill ${opts.skill}, ${opts.measure} measured rounds each; a par machine fails ${pct(opts.failStart)} of round 1 rising to ${pct(opts.failEnd)} of round ${opts.rounds});
 * do not edit by hand. See docs/run-flow-and-balance.md §4. Past the table the goal grows by GOAL_GROWTH a round.
 */
export const GOALS: number[] = [${goals.join(', ')}];
/** Endless: rounds 16 to 30 (kept as designed by --write). */
export const ENDLESS_GOALS: number[] = [${ENDLESS_GOALS.join(', ')}];
export const LAST_ROUND = GOALS.length + ENDLESS_GOALS.length;
export const GOAL_GROWTH = ${growth};
`);
    console.log(`wrote src/data/goals.ts (${goals.length} rounds, then x${growth} a round)`);
  }
}

const players = (args.get('players') ?? '').split(',').filter(Boolean) as NonNullable<ParOptions['player']>[];
if (players.length) {
  void (async () => {
    for (const p of players) {
      opts.player = p;
      console.log(`\n================ PLAYER: ${p} ================`);
      await main();
    }
  })();
} else void main();
