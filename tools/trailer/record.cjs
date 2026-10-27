// Films the trailer's shots: node tools/trailer/record.cjs [outDir] [--only=A1,C2] [--preview]
// Each shot is played in the real game (?trailer) and filmed frame by frame at 30 fps into <outDir>/shots/<id>.mp4,
// with the sounds it asked for (and when) in <outDir>/shots/<id>.json. tools/trailer/assemble.cjs cuts them together.
// --preview draws at a lower resolution and also writes a contact sheet per shot (<id>.jpg), to check a shot quickly.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Film, startServer, W, H, FPS } = require('./film.cjs');
const { dress, timeline, jitOf } = require('./shots.cjs');

const args = process.argv.slice(2);
const out = path.resolve(args.find((a) => !a.startsWith('--')) || 'trailer-out');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const preview = args.includes('--preview');
const dir = path.join(out, 'shots');
fs.mkdirSync(dir, { recursive: true });

/** ffmpeg takes the frames (JPEG) on stdin and writes the shot. */
function encoder(file) {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '24' : '12', '-pix_fmt', 'yuv420p', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r, j) => ff.on('exit', (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
  return {
    write: (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r))),
    end: () => { ff.stdin.end(); return done; },
  };
}

const TAKES = path.join(__dirname, 'takes.json');
const takes = fs.existsSync(TAKES) ? JSON.parse(fs.readFileSync(TAKES, 'utf8')) : {};

async function shoot(film, shot) {
  // the take found by search.cjs: its bot seed and the nudges to its balls
  const take = takes[shot.id] ?? {};
  shot = { ...shot, seed: take.seed ?? shot.seed, arg: { ...(shot.arg ?? {}), jit: jitOf(shot, take) } };
  const frames = shot.frames ?? Math.round(shot.dur * FPS);
  const t0 = Date.now();
  await film.page.evaluate(() => document.body.classList.remove('filmEnd'));
  const missed = shot.title ? [] : await film.run(dress, { machine: shot.machine, parts: shot.parts, clean: shot.clean !== false, round: shot.round !== false, seed: shot.seed, skill: shot.skill, workshop: shot.workshop });
  if (missed.length) console.log(`  ${shot.id}: did not fit ${JSON.stringify(missed)}`);
  await film.run((d, f, r) => d.resolution(r), preview ? 0.6 : shot.res ?? 1.5);
  if (shot.setup) await film.run(shot.setup, shot.arg);
  const events = [...(shot.at ?? [])].sort((a, b) => a[0] - b[0]);
  // the run-up: played without drawing (events before the camera rolls happen on time), then a few frames drawn
  // before it rolls, so the textures are baked and the panels have laid out
  const warm = shot.warm ?? 3;
  let cur = Math.min(-(shot.pre ?? 0) - warm / FPS, events.length ? events[0][0] : 0);
  const skip = (s) => (s > 1e-6 ? film.run((d, f, x) => d.skip(x), s) : null);
  while (events.length && events[0][0] < -warm / FPS) {
    const [t, fn] = events.shift();
    await skip(t - cur);
    await film.run(fn, shot.arg);
    cur = Math.max(cur, t);
  }
  await skip(-warm / FPS - cur);
  const frame = async (i, film) => {
    const t = i / FPS;
    while (events.length && events[0][0] <= t + 1e-6) await film.run(events.shift()[1], shot.arg);
    if (shot.cam) await film.run(`(d, f, s) => d.camera((${shot.cam})(d, f, s))`, { t, u: t / shot.dur, dur: shot.dur });
    if (shot.ui && t >= 0) await shot.ui(film, t, shot);
    await film.run((d, f, a) => d.frame(1000 / 30, a[0], a[1]), [t, shot.clean === false]);
    await film.syncAnimations(t);
    const txt = shot.text && t >= shot.text.from - 1e-6 && t < (shot.text.to ?? shot.dur) ? { ...shot.text, to: shot.text.to ?? shot.dur } : null;
    await film.text(txt, t);
  };
  for (let i = -warm; i < 0; i++) await frame(i, film);
  await film.run((d) => d.soundLog(true));
  const enc = encoder(path.join(dir, `${shot.id}.mp4`));
  const sheet = [];
  for (let i = 0; i < frames; i++) {
    await frame(i, film);
    const buf = await film.page.screenshot({ type: 'jpeg', quality: preview ? 80 : 96 });
    await enc.write(buf);
    if (preview && i % 6 === 0) sheet.push(buf);
  }
  await enc.end();
  const sounds = await film.run((d) => d.soundLog(false));
  await film.text(null, 0);
  await film.cursor(null);
  fs.writeFileSync(path.join(dir, `${shot.id}.json`), JSON.stringify({ id: shot.id, dur: frames / FPS, sounds }));
  if (preview) await contactSheet(sheet, path.join(dir, `${shot.id}.jpg`));
  console.log(`  ${shot.id}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${sounds.length} sounds`);
}

/** Every 6th frame of a shot, small, in a grid. */
function contactSheet(bufs, file) {
  const tmp = fs.mkdtempSync(path.join(out, 'sheet-'));
  bufs.forEach((b, i) => fs.writeFileSync(path.join(tmp, `${String(i).padStart(3, '0')}.jpg`), b));
  const cols = 4, rows = Math.ceil(bufs.length / cols);
  return new Promise((r) => spawn('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, '%03d.jpg'), '-vf', `scale=480:-1,tile=${cols}x${rows}`, '-frames:v', '1', file], { stdio: 'inherit' })
    .on('exit', () => { fs.rmSync(tmp, { recursive: true }); r(); }));
}

(async () => {
  const server = await startServer();
  const film = await Film.open(server.url);
  try {
    const plan = timeline();
    for (const shot of plan.shots) {
      if (only.length && !only.includes(shot.id)) continue;
      await shoot(film, shot);
      if (film.errors.length) { console.log('  page errors:', film.errors.splice(0)); }
    }
    fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(plan, (k, v) => (typeof v === 'function' ? undefined : v), 1));
  } finally {
    await film.close();
    server.stop();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
