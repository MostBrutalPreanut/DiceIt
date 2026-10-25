// Browser smoke test: drives the BUILT game in headless Chromium.
//   npm run build && npx vite preview --port 4173 &   then   node tools/smoke.cjs [outDir] [url]
// Uses the Playwright that is pre-installed in the cloud environment (require resolves globally).
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const url = process.argv[3] || 'http://127.0.0.1:4173/';
let failed = false;
const fail = (m) => { console.error('FAIL: ' + m); failed = true; process.exitCode = 1; };
const check = (cond, m) => { if (!cond) fail(m); else console.log('ok: ' + m); };

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

  const box = await (await page.$('canvas')).boundingBox();
  const at = (x, y) => {
    const sc = Math.max(4, Math.min((box.width - 16) / 26, (box.height - 16) / 52));
    return { x: box.x + (box.width - 26 * sc) / 2 + x * sc, y: box.y + (box.height - 52 * sc) / 2 + (52 - y) * sc };
  };
  const state = () => page.evaluate(() => { const g = window.__pinball.game; return { placed: g.placed.length, inv: g.inventory.length, money: g.money, offers: g.shop.offers.filter(Boolean).length }; });

  // real shop: buy the first affordable offer, place it, then undo and redo both steps
  let s = await state();
  check(s.placed === 3 && s.inv === 0 && s.money === 6, 'starts with 3 bumpers placed, empty inventory, $6');
  await page.click('button[data-buy]:not([disabled])');
  s = await state();
  check(s.inv === 1 && s.money < 6, 'buying puts the part in the inventory and costs money');
  const p = at(12, 28);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  s = await state();
  check(s.placed === 4 && s.inv === 0, 'clicking the table places it');
  check(await page.isVisible('#selected'), 'the part card is shown for the new part');
  const card = await page.innerText('#selected');
  check(/Scores|Prints|flipper|Roll a ball|Scores nothing|Each target/i.test(card), 'the part card explains how it scores');
  await page.click('#btnUndo');
  s = await state();
  check(s.placed === 3 && s.inv === 1, 'undo takes the placement back');
  await page.click('#btnUndo');
  s = await state();
  check(s.inv === 0 && s.money === 6, 'undo takes the purchase back and refunds the money');
  await page.click('#btnRedo');
  await page.click('#btnRedo');
  s = await state();
  check(s.placed === 4, 'redo puts it all back');

  // drag it onto the inventory panel to take it off the board
  const inv = await (await page.$('#inventoryBox')).boundingBox();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 10, { steps: 4 });
  await page.mouse.move(inv.x + inv.width / 2, inv.y + inv.height / 2, { steps: 8 });
  await page.mouse.up();
  s = await state();
  check(s.placed === 3 && s.inv === 1, 'dragging a part onto the inventory stores it');

  // arm it from the inventory and place it again
  await page.click('#inventory .item');
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  s = await state();
  check(s.placed === 4 && s.inv === 0, 'clicking an inventory part then the table places it');

  // test lab: the whole catalog, free
  const moneyBefore = (await state()).money;
  await page.check('#sandbox');
  const adds = await page.locator('button[data-add]').count();
  check(adds >= 12, `the lab catalog lists every part (${adds})`);
  check(await page.isVisible('#labTools'), 'the lab tools appear');
  await page.click('button[data-add="bank"]');
  const bank = at(12, 33);
  await page.mouse.move(bank.x, bank.y);
  await page.mouse.click(bank.x, bank.y);
  const hasBank = await page.evaluate(() => window.__pinball.game.placed.some((q) => q.def === 'bank'));
  check(hasBank, 'a drop-target bank was added free and placed');
  check((await state()).money === moneyBefore, 'the lab cost nothing');
  await page.click('#labBalls12');
  const balls = await page.evaluate(() => window.__pinball.game.sim.ballCount);
  check(balls >= 10, `drop 12 balls rains them onto the table (${balls})`);
  await page.check('#heat');
  await page.evaluate(() => window.__pinball.advance(4, 3));
  const heat = await page.evaluate(() => window.__pinball.game.heat.reduce((a, b) => a + b, 0));
  check(heat > 1, `the heatmap collected ball time (${heat.toFixed(1)} s)`);
  await page.screenshot({ path: `${out}/smoke-2b-lab-heat.png` });
  await page.click('button[data-save="0"]');
  await page.click('#labClear');
  check((await state()).placed === 0, 'clear board stores every part');
  await page.click('button[data-load="0"]');
  check((await state()).placed >= 5, 'loading a layout slot re-arranges the parts');
  await page.uncheck('#sandbox');

  // hover a starter bumper: the tooltip explains its recipe
  const pop = at(17, 44.5);
  await page.mouse.move(pop.x, pop.y);
  await page.mouse.move(pop.x + 2, pop.y + 2);
  check(await page.isVisible('#tip'), 'hovering a part shows its tooltip');
  const tip = await page.innerText('#tip');
  check(tip.includes('Pop Bumper') && tip.includes('100') && tip.includes('+5'), 'the Pop Bumper tooltip says "100" and "+5"');
  await page.screenshot({ path: `${out}/smoke-2-placed.png` });

  // physics cost in the browser's JS engine
  for (const balls of [1, 10, 20]) {
    const r = await page.evaluate((b) => window.__pinball.bench(2000, b), balls);
    console.log(`physics, ${balls} ball(s) dropped in: ${r.msPerStep.toFixed(3)} ms/step (~${(r.msPerStep * 4).toFixed(2)} ms per 60 fps frame), balls alive at end ${r.ballsAtEnd}`);
    if (r.msPerStep > 0.5) fail(`physics too slow with ${balls} balls`);
  }
  await page.evaluate(() => { window.__pinball.game.toWorkshop(); window.__pinball.refresh(); });

  // the between-rounds flow: a boss was just beaten, so an upgrade is owed before the next round
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); g.round = 3; g.continueAfterRound(); window.__pinball.refresh(); });
  check(await page.isVisible('#stepper') && await page.isVisible('#stepUpgrade'), 'the stepper shows the Upgrade step when one is owed');
  check(await page.locator('.ucard').count() === 3, 'three upgrade cards are offered');
  check(await page.isDisabled('#btnStart'), 'Start round is locked while the pick is owed');
  await page.screenshot({ path: `${out}/smoke-2c-upgrade.png` });
  await page.click('.ucard[data-pick="0"]');
  check(!(await page.isDisabled('#btnStart')), 'taking a card unlocks Start round');
  check(!(await page.isVisible('#upgradeBox')) && (await page.locator('.chip').count()) === 1, 'the offer closes and the run lists the upgrade');
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); g.round = 3; g.continueAfterRound(); window.__pinball.refresh(); });
  const cash = await page.evaluate(() => window.__pinball.game.money);
  await page.click('#btnSkip');
  check((await page.evaluate(() => window.__pinball.game.money)) === cash + 4, 'skipping pays $4');
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.refresh(); });

  // a real round with the bot at the controls
  await page.click('#btnStart');
  await page.evaluate(() => window.__pinball.advance(25, 5));
  await page.screenshot({ path: `${out}/smoke-3-round.png` });
  const st = await page.evaluate(() => { const g = window.__pinball.game; return { mode: g.mode, score: Math.round(g.scorer.score), rows: g.scorer.ledgerRows().length }; });
  console.log('after 25s of bot play:', JSON.stringify(st));
  check(st.score > 0 && st.rows > 0, 'the bot scored and the ledger attributes it');

  if (errors.length) fail('console errors:\n' + errors.join('\n'));
  else console.log('ok: no console errors');
  await browser.close();
  if (failed) process.exit(1);
})().catch((e) => { console.error('SMOKE CRASHED', e); process.exit(1); });
