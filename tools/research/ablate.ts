import { gameFor, mean, median, playRound, PROFILES, pool } from './lib';
import { mid } from './tables';
const arg = process.argv[2];
if (arg) {
  const t = JSON.parse(arg);
  PROFILES.x = t.p;
  const out = [];
  for (let i = 0; i < 16; i++) { const r = playRound(gameFor(mid()), { profile: t.p.name === 'par' ? 'par' : 'x', seed: 300 + i }); out.push({ s: r.score, b: r.ballSeconds, d: r.drains }); }
  process.stdout.write('RESULT ' + JSON.stringify(out) + '\n');
} else {
  const V = [
    { name: 'par' },
    { name: 'perfect', miss: 0, react: [0, 0], cradle: true, flail: 0 },
    { name: 'perfect-nocradle', miss: 0, react: [0, 0], cradle: false, flail: 0 },
    { name: 'react.03', miss: 0, react: [0, 0.03], cradle: true, flail: 0 },
    { name: 'react.06', miss: 0, react: [0.03, 0.06], cradle: true, flail: 0 },
    { name: 'miss.05', miss: 0.05, react: [0, 0], cradle: true, flail: 0 },
    { name: 'miss.15', miss: 0.15, react: [0, 0], cradle: true, flail: 0 },
    { name: 'flail.5', miss: 0, react: [0, 0], cradle: true, flail: 0.5 },
  ];
  const res = await pool<{ s: number; b: number[]; d: number }[]>('tools/research/ablate.ts', V.map((p) => ({ p })), 4);
  V.forEach((v, i) => { const r = res[i]; console.log(v.name.padEnd(18), 'score p50', Math.round(median(r.map((x) => x.s))), ' ball s mean', mean(r.flatMap((x) => x.b)).toFixed(1)); });
}
