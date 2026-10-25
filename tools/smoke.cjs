// Browser smoke test: drives the BUILT game in headless Chromium.
//   npm run build && npx vite preview --port 4173 &   then   node tools/smoke.cjs [outDir] [url]
// Uses the Playwright that is pre-installed in the cloud environment (require resolves globally).
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const url = process.argv[3] || 'http://127.0.0.1:4173/';
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('canvas');
  await page.evaluate(() => window.__pinball.freeze(true));
  await page.screenshot({ path: `${out}/smoke-1-workshop.png` });

  // workshop: place a part by clicking the table
  const box = await (await page.$('canvas')).boundingBox();
  const at = (x, y) => {
    const sc = Math.max(4, Math.min((box.width - 28) / 22, (box.height - 28) / 44));
    return { x: box.x + (box.width - 22 * sc) / 2 + x * sc, y: box.y + (box.height - 44 * sc) / 2 + (44 - y) * sc };
  };
  const before = await page.evaluate(() => window.__pinball.game.layout.parts.length);
  await page.click('button.tool[data-id="mega"]');
  const p = at(10, 31);
  await page.mouse.click(p.x, p.y);
  const after = await page.evaluate(() => window.__pinball.game.layout.parts.length);
  if (after !== before + 1) fail(`placing a part: ${before} -> ${after}`);

  // physics cost in the browser's JS engine
  for (const balls of [1, 10, 20]) {
    const r = await page.evaluate((b) => window.__pinball.bench(2000, b), balls);
    console.log(`physics, ${balls} ball(s) dropped in: ${r.msPerStep.toFixed(3)} ms/step (~${(r.msPerStep * 4).toFixed(2)} ms per 60 fps frame), balls alive at end ${r.ballsAtEnd}`);
    if (r.msPerStep > 0.5) fail(`physics too slow with ${balls} balls`);
  }
  await page.evaluate(() => window.__pinball.game.toWorkshop());

  // a real round with the bot at the controls
  await page.click('#btnStart');
  await page.evaluate(() => window.__pinball.advance(25, 5));
  await page.screenshot({ path: `${out}/smoke-2-round.png` });
  const st = await page.evaluate(() => { const g = window.__pinball.game; return { mode: g.mode, score: Math.round(g.scorer.score), rows: g.scorer.ledgerRows().length }; });
  console.log('after 25s of bot play:', JSON.stringify(st));
  if (!(st.score > 0 && st.rows > 0)) fail('bot scored nothing');

  if (errors.length) fail('console errors:\n' + errors.join('\n'));
  else console.log('no console errors');
  await browser.close();
})().catch((e) => { console.error('SMOKE CRASHED', e); process.exit(1); });
