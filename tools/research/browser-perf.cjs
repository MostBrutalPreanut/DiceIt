// Browser frame cost on heavy builds: npm run build && npx vite preview --port 4173 &  then  node tools/research/browser-perf.cjs layouts.json
const { chromium } = require('playwright');
const builds = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/?dev');
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => !!window.__pinball);
  for (const b of builds) {
    const r = await page.evaluate((b) => {
      const P = window.__pinball, g = P.game;
      g.newRun(b.machine);
      g.layout = JSON.parse(JSON.stringify(b.layout));
      g.decals = b.decals.map((d) => ({ ...d }));
      g.goalOverride = Infinity;
      g.round = 13;
      g.pending = null;
      g.toWorkshop();
      g.startRound();
      const out = { probes: [], wallPerSimSec: [], balls: 0, sparks: 0 };
      for (let k = 0; k < 6 && g.mode === 'round'; k++) {
        const t0 = performance.now();
        P.advance(5, k + 1, 0.9, true);
        out.wallPerSimSec.push((performance.now() - t0) / 5);
        out.balls = Math.max(out.balls, g.sim.ballStates().length);
        out.sparks = Math.max(out.sparks, g.sim.sparkStates().length);
        out.probes.push(P.probe(30));
      }
      return out;
    }, b);
    const max = (xs) => Math.max(...xs).toFixed(2), avg = (xs) => (xs.reduce((a, c) => a + c, 0) / xs.length).toFixed(2);
    console.log(`${b.id.padEnd(30)} draw ms/frame avg ${avg(r.probes)} max ${max(r.probes)} | wall ms per sim second (sim+draw at 60 fps, fx on) avg ${avg(r.wallPerSimSec)} max ${max(r.wallPerSimSec)} (16.7 ms/frame budget = 1000) | max balls ${r.balls} sparks ${r.sparks}`);
  }
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
  await browser.close();
})();
