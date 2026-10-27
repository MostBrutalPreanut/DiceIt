// Cuts the trailer together: node tools/trailer/assemble.cjs [outDir]
// Needs the shots filmed by tools/trailer/record.cjs in <outDir>/shots. The sound is made here, offline, by the
// game's own sound kit (src/audio.ts): the factory tune as the music bed (driving harder as the cuts get busier, the
// cuts on its beats), and every sound the shots asked for, at the moment they asked. Writes <outDir>/trailer.mp4.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const { ROOT } = require('./film.cjs');
const { timeline } = require('./shots.cjs');

const out = path.resolve(process.argv[2] || 'trailer-out');
const SR = 48000;
/** Sounds the game asks for that are not sounds (the music is made separately). */
const NOT_SOUNDS = new Set(['unlock', 'attach', 'setIntensity', 'setTheme', 'setVolumes', 'setMusic', 'setMusicVolume', 'setSfxVolume', 'toggleMute', 'scheduleMusic']);

async function bundle() {
  const { build } = await import('vite');
  const res = await build({
    configFile: false, logLevel: 'silent', root: ROOT,
    build: { write: false, minify: false, lib: { entry: path.join(ROOT, 'src/audio.ts'), name: 'AudioKit', formats: ['iife'], fileName: 'audio' } },
  });
  return (Array.isArray(res) ? res[0] : res).output[0].code;
}

/** Render in the page: a mono-free stereo buffer back as 16-bit PCM, base64. */
async function render(page, job) {
  const b64 = await page.evaluate(async ([job, SR]) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(job.secs * SR), SR);
    const fx = new window.AudioKit.AudioFx();
    fx.attach(ctx);
    fx.setTheme(job.theme);
    const at = (t, fn) => ctx.suspend(Math.max(1, Math.round((t * SR) / 128)) * 128 / SR).then(() => { fn(); ctx.resume(); });
    if (job.music) {
      // the tune, scheduled ahead the way the game's own scheduler does it, with the energy each step asks for
      fx.energy = job.steps[0].target;
      fx.nextBeat = 0;
      let k = 0;
      const step = fx.factoryStep;
      window.__beats = [];
      fx.factoryStep = function (...a) { if (a[2] % 2 === 0) window.__beats.push([k, a[0]]); const s = job.steps[k++]; this.energyTarget = s ? s.target : 0; return step.apply(this, a); };
      fx.scheduleMusic(0.3);
      for (let t = 0.1; t < job.secs; t += 0.1) at(t, () => fx.scheduleMusic(t + 0.3));
    } else {
      fx.setMusic(false);
      const used = new Set();
      for (const s of job.sounds) {
        // several sounds can share a moment; a suspend can only be set once per moment
        let q = Math.max(1, Math.round((s.t * SR) / 128));
        while (used.has(q)) q++;
        used.add(q);
        ctx.suspend((q * 128) / SR).then(() => { if (s.theme) fx.setTheme(s.theme); else try { fx[s.k](...s.a); } catch (e) { console.log('sound', s.k, e.message); } ctx.resume(); });
      }
    }
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), pcm = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    let s = '';
    const u8 = new Uint8Array(pcm.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, [job, SR]);
  const beats = job.music ? await page.evaluate(() => window.__beats) : [];
  return { pcm: Buffer.from(b64, 'base64'), beats };
}

function wav(file, pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28);
  h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
};

(async () => {
  const plan = timeline();
  const shots = plan.shots.map((s) => ({ ...s, file: path.join(out, 'shots', `${s.id}.mp4`), log: JSON.parse(fs.readFileSync(path.join(out, 'shots', `${s.id}.json`), 'utf8')) }));
  const length = shots.reduce((a, s) => a + s.frames, 0) / 30;
  const title = shots.find((s) => s.title);
  const titleAt = title ? title.start : length;

  // the sounds: each shot's at its place in the cut, each on its own machine, and the film's own (the words land with a stamp)
  const sounds = [];
  for (const s of shots) {
    const t0 = Math.round(s.start * 30) / 30;
    sounds.push({ t: t0 + 0.001, theme: s.machine ?? 'factory' });
    for (const e of s.log.sounds) if (!NOT_SOUNDS.has(e.k) && e.t < s.dur) sounds.push({ t: t0 + e.t + 0.002, k: e.k, a: e.a });
    if (s.text && !s.text.age0) sounds.push({ t: t0 + s.text.from + 0.04, k: 'stamp', a: [] });
  }
  if (title) sounds.push({ t: titleAt + 0.02, k: 'roundWon', a: [true] });
  sounds.sort((a, b) => a.t - b.t);

  const code = await bundle();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (m) => console.log('  page:', m.text()));
  await page.setContent('<!doctype html><title>trailer sound</title>');
  await page.addScriptTag({ content: code });
  const audio = path.join(out, 'audio');
  fs.mkdirSync(audio, { recursive: true });
  // the music in two takes: driving up to the title, then the tune from its top, calm, under the title
  const drive = plan.steps.filter((s) => s.t < titleAt);
  const music = await render(page, { music: true, theme: 'factory', secs: titleAt + 2, steps: drive });
  wav(path.join(audio, 'music-drive.wav'), music.pcm);
  // the cuts were planned on the tune's beats: say how far the tune as played is from that plan
  const drift = Math.max(...music.beats.filter(([k]) => k < drive.length).map(([k, t]) => Math.abs(t - drive[k].t)));
  console.log(`music: ${music.beats.length} beats, at most ${(drift * 1000).toFixed(1)} ms from the cut plan`);
  wav(path.join(audio, 'music-title.wav'), (await render(page, { music: true, theme: 'factory', secs: length - titleAt + 2, steps: [{ target: 0 }] })).pcm);
  wav(path.join(audio, 'sfx.wav'), (await render(page, { music: false, theme: 'factory', secs: length + 2, sounds })).pcm);
  await browser.close();

  // the picture: the shots back to back (they were all encoded alike), the end fading to black
  const list = path.join(out, 'shots.txt');
  fs.writeFileSync(list, shots.map((s) => `file '${s.file}'`).join('\n'));
  const pic = path.join(out, 'picture.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', pic]);

  // the mix: the drive cut off with a short fade where the title lands, the title tune in under it, the sounds on top
  const ms = Math.round(titleAt * 1000);
  const file = path.join(out, 'trailer.mp4');
  ff(['-i', pic, '-i', path.join(audio, 'music-drive.wav'), '-i', path.join(audio, 'music-title.wav'), '-i', path.join(audio, 'sfx.wav'),
    '-filter_complex', [
      `[1]volume=6,afade=t=out:st=${(titleAt - 0.08).toFixed(3)}:d=0.12[m1]`,
      `[2]volume=6,adelay=${ms}|${ms},afade=t=in:st=${titleAt.toFixed(3)}:d=0.4[m2]`,
      '[3]volume=0.75[fx]',
      `[m1][m2][fx]amix=inputs=3:normalize=0,atrim=0:${length.toFixed(3)},afade=t=in:st=0:d=0.15,afade=t=out:st=${(length - 1.2).toFixed(3)}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      `[0]fade=t=in:st=0:d=0.25,fade=t=out:st=${(length - 0.7).toFixed(3)}:d=0.7[v]`,
    ].join(';'),
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', length.toFixed(3), file]);
  console.log(`trailer: ${file} (${length.toFixed(2)} s, ${sounds.length} sounds)`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
