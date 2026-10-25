// Offline audio check: renders every sound of src/audio.ts in headless Chromium with an OfflineAudioContext and
// reports peak, RMS and length, failing on NaN, on a peak of 0.9 or more, or on a sound that never ends.
//   node tools/audio-check.cjs            (no build or server needed; bundles src/audio.ts with Vite)
// Uses the Playwright that is pre-installed in the cloud environment (require resolves globally).
const path = require('path');
const { chromium } = require('playwright');

const SR = 48000;
// [name, seconds to render, theme, code run with `fx` (an AudioFx); `at(t, fn)` runs fn at render time t]
const CASES = [
  ['pop', 1, 'factory', 'fx.hit("pop", 1)'],
  ['pop (mult 3)', 1, 'factory', 'fx.hit("pop", 3)'],
  ['coin', 1.5, 'factory', 'fx.hit("coin", 1)'],
  ['sling', 1, 'factory', 'fx.hit("sling", 1)'],
  ['spinner 2 spins', 1, 'factory', 'fx.hit("spinner", 1, { spins: 2 })'],
  ['spinner 10 spins', 1.6, 'factory', 'fx.hit("spinner", 1, { spins: 10 })'],
  ['lane', 1, 'factory', 'fx.hit("lane", 1)'],
  ['lamp', 1.5, 'factory', 'fx.hit("lamp", 1, { label: "LAMP 2/5" })'],
  ['lamp full', 1.5, 'factory', 'fx.hit("lamp", 1, { label: "LAMP FULL!" })'],
  ['vari soft', 1, 'factory', 'fx.hit("vari", 1, { tier: 0 })'],
  ['vari smash', 1, 'factory', 'fx.hit("vari", 1, { tier: 3 })'],
  ['bank target', 1, 'factory', 'fx.hit("bank", 1)'],
  ['uplight', 1.5, 'factory', 'fx.hit("uplight", 1)'],
  ['ding', 2.5, 'factory', 'fx.hit("ding", 1)'],
  ['piggy clink', 1, 'factory', 'fx.hit("piggy", 1, { notes: [] })'],
  ['piggy smash', 1.5, 'factory', 'fx.hit("piggy", 1, { notes: ["piggy smashed: $4"] })'],
  ['roller', 1, 'factory', 'fx.hit("roller", 1)'],
  ['thunder', 2, 'factory', 'fx.hit("thunder", 1)'],
  ['duck', 1, 'factory', 'fx.hit("duck", 1)'],
  ['golden', 2, 'factory', 'fx.hit("golden", 1, { money: 1 })'],
  ['Big Boi factory', 1.5, 'factory', 'fx.hit("mega", 1)'],
  ['Big Boi diner', 1.5, 'diner', 'fx.hit("mega", 1, { notes: ["x2 order"] })'],
  ['Big Boi castle', 1.5, 'castle', 'fx.hit("mega", 1)'],
  ['kickback', 1, 'factory', 'fx.contact("kickback", { speed: 20, kicked: true })'],
  ['magnet grab+throw', 1.5, 'factory', 'fx.contact("magnet", { speed: 20, caught: true }); at(0.5, () => fx.release("magnet"))'],
  ['printer whirr+pop', 1.5, 'factory', 'fx.contact("printer", { speed: 20, caught: true }); at(0.6, () => { fx.release("printer"); fx.printed(); })'],
  ['jackpot scoop+eject', 1.5, 'factory', 'fx.contact("jackpot", { speed: 20, caught: true }); at(0.8, () => fx.release("jackpot"))'],
  ['deflector', 1, 'factory', 'fx.contact("deflector", { speed: 30 })'],
  ['goalie', 1, 'factory', 'fx.contact("goal", { speed: 30, mover: true })'],
  ['glow strip', 1.5, 'factory', 'fx.glow()'],
  ['bonus lanes', 1.5, 'factory', 'fx.bonus("lane", "LANES COMPLETE")'],
  ['bonus bank', 1.5, 'factory', 'fx.bonus("bank", "BANK COMPLETE")'],
  ['bonus level up', 1.5, 'factory', 'fx.bonus("uplight", "2 BUMPERS +1 LEVEL!")'],
  ['bonus jackpot', 2.5, 'factory', 'fx.bonus("jackpot", "JACKPOT!")'],
  ['bonus x lane', 1.5, 'factory', 'fx.bonus("xlane", "MULT x1.25")'],
  ['bonus disco', 2, 'factory', 'fx.bonus("disco", "MULT x2.00", true)'],
  ['bonus goal!', 2.5, 'factory', 'fx.bonus("goal", "GOAL!")'],
  ['bonus armour', 3, 'castle', 'fx.bonus("mega", "ARMOUR BROKEN!")'],
  ['bonus default', 1.5, 'factory', 'fx.bonus()'],
  ['flipper up+down', 1, 'factory', 'fx.flipper(true); at(0.2, () => fx.flipper(false))'],
  ['launch full', 1, 'factory', 'fx.launch(110)'],
  ['drain', 1.5, 'factory', 'fx.drain()'],
  ['saved', 1.5, 'factory', 'fx.saved()'],
  ['round goal', 2, 'factory', 'fx.goal()'],
  ['tilt', 1.5, 'factory', 'fx.tilt()'],
  ['nudge', 1, 'factory', 'fx.nudge()'],
  ['stamp', 1, 'factory', 'fx.stamp()'],
  ['coin land', 1, 'factory', 'fx.coinLand()'],
  ['shop roll x4', 1, 'factory', 'for (let i = 0; i < 4; i++) at(0.01 + i * 0.09, () => fx.shopRoll(i))'],
  ['buy', 1, 'factory', 'fx.buy()'],
  ['pick up', 1, 'factory', 'fx.pickUp()'],
  ['place', 1, 'factory', 'fx.place()'],
  ['remove', 1, 'factory', 'fx.remove()'],
  ['print 3', 1, 'factory', 'fx.print(3)'],
  ['game over', 3, 'factory', 'fx.gameOver()'],
  ['decal reveal', 2, 'factory', 'fx.decalReveal()'],
  ['decal pick', 1.5, 'factory', 'fx.decalPick()'],
  // stress: rapid repeats must not pile up
  ['STACK 40 pops in 0.8 s', 2, 'factory', 'for (let i = 0; i < 40; i++) at(0.01 + i * 0.02, () => fx.hit("pop", 1 + i / 20))'],
  ['STACK 30 coins in 0.6 s', 2, 'factory', 'for (let i = 0; i < 30; i++) at(0.01 + i * 0.02, () => fx.hit("coin", 1))'],
  ['STACK multiball flurry', 4.5, 'factory', 'const ids = ["pop","coin","sling","golden","thunder","mega","ding","vari","bank","lane"]; for (let i = 0; i < 120; i++) at(0.01 + i * 0.018, () => { fx.hit(ids[i % ids.length], 1 + i / 30); if (i % 15 === 0) fx.bonus(); })'],
  ['STACK flurry over music', 4, 'diner', 'fx.scheduleMusic(4); const ids = ["pop","coin","sling","golden","thunder","mega"]; for (let i = 0; i < 100; i++) at(0.5 + i * 0.02, () => fx.hit(ids[i % ids.length], 2))'],
  // the music on its own, a full loop of each machine
  ['music factory (loop)', 26, 'factory', 'fx.scheduleMusic(25)'],
  ['music diner (loop)', 22, 'diner', 'fx.scheduleMusic(21)'],
  ['music castle (loop)', 30, 'castle', 'fx.scheduleMusic(29)'],
  ['music at volume 0.5', 8, 'factory', 'fx.setMusicVolume(0.5); fx.scheduleMusic(8)'],
  ['sfx at volume 0', 1, 'factory', 'fx.setSfxVolume(0); fx.hit("pop", 1)'],
];

async function bundle() {
  const { build } = await import('vite');
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    root: path.resolve(__dirname, '..'),
    build: { write: false, minify: false, lib: { entry: path.resolve(__dirname, '../src/audio.ts'), name: 'AudioKit', formats: ['iife'], fileName: 'audio' } },
  });
  const res = Array.isArray(out) ? out[0] : out;
  return res.output[0].code;
}

(async () => {
  const code = await bundle();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent('<!doctype html><title>audio check</title>');
  await page.addScriptTag({ content: code });
  const rows = [];
  for (const [name, secs, theme, body] of CASES) {
    const r = await page.evaluate(async ([secs, theme, body, SR]) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(secs * SR), SR);
      const fx = new window.AudioKit.AudioFx();
      fx.attach(ctx);
      fx.setTheme(theme);
      const at = (t, fn) => { ctx.suspend(Math.round(t * SR / 128) * 128 / SR).then(() => { fn(); ctx.resume(); }); };
      new Function('fx', 'at', body)(fx, at);
      const buf = await ctx.startRendering();
      let peak = 0, sum = 0, nan = false, last = 0, first = -1;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          const x = d[i];
          if (!Number.isFinite(x)) { nan = true; continue; }
          const a = Math.abs(x);
          if (a > peak) peak = a;
          sum += x * x;
          if (a > 0.001) { last = Math.max(last, i); if (first < 0 || i < first) first = i; }
        }
      }
      const n = buf.length * buf.numberOfChannels;
      // RMS over the part of the render where the sound is (from its first to its last audible sample)
      let act = 0, cnt = 0;
      if (first >= 0) for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = first; i <= last; i++) { act += d[i] * d[i]; cnt++; } }
      return { peak, rms: Math.sqrt(sum / n), activeRms: cnt ? Math.sqrt(act / cnt) : 0, nan, len: first < 0 ? 0 : (last + 1) / SR, tail: last >= buf.length - 1 };
    }, [secs, theme, body, SR]);
    rows.push({ name, ...r, secs });
  }
  await browser.close();

  const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
  let failed = false;
  console.log('sound'.padEnd(30), 'peak'.padStart(7), 'peak dB'.padStart(8), 'RMS dB'.padStart(8), 'len s'.padStart(7), ' notes');
  for (const r of rows) {
    const bad = [];
    if (r.nan) bad.push('NaN');
    if (r.peak >= 0.9) bad.push('CLIPS');
    if (r.tail && !r.name.startsWith('music') && !r.name.includes('over music')) bad.push('never ends');
    if (r.len === 0 && !r.name.includes('volume 0')) bad.push('SILENT');
    if (bad.length) failed = true;
    console.log(r.name.padEnd(30), r.peak.toFixed(3).padStart(7), db(r.peak).padStart(8), db(r.activeRms).padStart(8), r.len.toFixed(2).padStart(7), bad.length ? ' FAIL: ' + bad.join(', ') : '');
  }
  if (errors.length) { failed = true; console.error('page errors:', errors); }
  console.log(failed ? '\nFAIL' : '\nok: every sound renders, ends, and peaks under 0.9');
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
