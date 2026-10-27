// Finds a good take of each shot: node tools/trailer/search.cjs [--only=C2,D1] [--tries=40]
// A shot is played (without drawing) many times, its dropped balls nudged a little and the bot's seed changed each
// time, and scored by what happens on camera while it rolls (what the shot wants: zaps, a printed ball, a blast...).
// The best take is written to tools/trailer/takes.json, which record.cjs plays back: the sim is deterministic, so the
// take filmed is the take found.
const fs = require('fs');
const path = require('path');
const { Film, startServer, FPS } = require('./film.cjs');
const { dress, timeline, ballsOf } = require('./shots.cjs');

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const tries = Number((args.find((a) => a.startsWith('--tries=')) || '--tries=40').slice(8));
const TAKES = path.join(__dirname, 'takes.json');

/** A small seeded random, so a search can be run again and give the same takes. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}


/** Play one take, as record.cjs would film it, and say how good it is. */
async function play(film, shot, arg) {
  await film.run(dress, { machine: shot.machine, parts: shot.parts, clean: true, round: shot.round !== false, seed: arg.seed, skill: shot.skill });
  if (shot.setup) await film.run(shot.setup, arg);
  // write down every scoring event and every sim event, with the shot's time
  await film.run((d, f) => {
    f.seen = [];
    f.now = -1e9;
    const step = d.game.step.bind(d.game);
    if (!d.game.__filmed) {
      d.game.__filmed = true;
      d.game.step = (input) => { const r = step(input); window.__film.seen.push(...r.score.map((s) => ({ t: window.__film.now, s })), ...r.sim.map((e) => ({ t: window.__film.now, e }))); return r; };
    }
  });
  const events = [...(shot.at ?? [])].sort((a, b) => a[0] - b[0]);
  const warm = shot.warm ?? 3;
  let cur = Math.min(-(shot.pre ?? 0) - warm / FPS, events.length ? events[0][0] : 0);
  const skip = (s) => (s > 1e-6 ? film.run((d, f, x) => d.skip(x), s) : null);
  while (events.length && events[0][0] < -warm / FPS) {
    const [t, fn] = events.shift();
    await skip(t - cur);
    await film.run(fn, arg);
    cur = Math.max(cur, t);
  }
  await skip(-warm / FPS - cur);
  const views = [];
  for (let i = -warm; i < shot.frames; i++) {
    const t = i / FPS;
    while (events.length && events[0][0] <= t + 1e-6) await film.run(events.shift()[1], arg);
    if (i >= 0 && shot.cam) views.push(await film.run(`(d, f, s) => { d.camera((${shot.cam})(d, f, s)); const v = d.renderer.view, sc = d.renderer.app.screen; return { x0: -v.ox / v.S, x1: (sc.width - v.ox) / v.S, y0: (v.oy - sc.height) / (v.k * v.S), y1: v.oy / (v.k * v.S) }; }`, { t, u: t / shot.dur, dur: shot.dur }));
    await film.run((d, f, now) => { f.now = now; d.skip(1 / 30); }, t);
  }
  const seen = await film.run((d, f) => f.seen.filter((x) => x.t >= 0).map((x) => (x.s ? { t: x.t, x: x.s.x, y: x.s.y, type: x.s.zap ? 'zap' : x.s.beam ? 'beam' : x.s.blast ? 'blast' : x.s.rocket ? 'rocket' : x.s.grow ? 'grow' : x.s.kind === 'bonus' ? 'bonus' : x.s.spark ? 'spark' : 'hit', def: x.s.def } : { t: x.t, type: x.e.type, x: x.e.x, y: x.e.y })));
  const want = shot.want ?? { hit: 1 };
  const [a, b] = shot.window ?? [0.05, 0.85];
  let score = 0;
  const got = {};
  for (const e of seen) {
    const w = want[`${e.type}:${e.def}`] ?? want[e.type] ?? 0;
    if (!w) continue;
    const v = views[Math.min(views.length - 1, Math.round(e.t * FPS))];
    const inView = !v || e.x === undefined || (e.x > v.x0 + 0.5 && e.x < v.x1 - 0.5 && e.y > v.y0 + 0.5 && e.y < v.y1 - 0.5);
    if (!inView) continue;
    const u = e.t / shot.dur;
    score += w * (u >= a && u <= b ? 1 : 0.3);
    got[e.type] = (got[e.type] ?? 0) + 1;
  }
  return { score, got };
}

(async () => {
  const takes = fs.existsSync(TAKES) ? JSON.parse(fs.readFileSync(TAKES, 'utf8')) : {};
  const server = await startServer();
  const film = await Film.open(server.url);
  try {
    for (const shot of timeline().shots) {
      if (shot.title || shot.ui || shot.clean === false || (only.length && !only.includes(shot.id))) continue;
      const ids = ballsOf(shot);
      const r = rng(shot.id.charCodeAt(0) * 131 + shot.id.charCodeAt(1));
      let best = null;
      for (let k = 0; k < tries; k++) {
        const jit = {};
        // the first try is the shot as written; the rest nudge every ball and change the bot
        for (const n of ids) jit[n] = k ? [(r() - 0.5) * 1.2, (r() - 0.5) * 1.2, (r() - 0.5) * 6, (r() - 0.5) * 6].map((v) => Math.round(v * 100) / 100) : [0, 0, 0, 0];
        const arg = { ...(shot.arg ?? {}), jit, seed: k ? (shot.seed ?? 7) * 1000 + k : shot.seed ?? 7 };
        const res = await play(film, shot, arg);
        if (!best || res.score > best.score) best = { ...res, take: { seed: arg.seed, nudges: ids.map((n) => jit[n]) } };
      }
      takes[shot.id] = best.take;
      console.log(`${shot.id}: best ${best.score.toFixed(1)} ${JSON.stringify(best.got)}`);
      fs.writeFileSync(TAKES, JSON.stringify(takes, null, 1) + '\n');
    }
  } finally {
    if (film.errors.length) console.log('page errors:', film.errors);
    await film.close();
    server.stop();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
