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
  // there is no default machine: the first visit asks for a theme
  await page.waitForSelector('#themePick .cab');
  check(await page.locator('#themePick .cab').count() === 3, 'the first visit offers three machines to pick from');
  await page.click('#themePick .cab[data-theme="factory"]');
  check(await page.isHidden('#themePick'), 'picking a machine closes the picker');
  check(await page.evaluate(() => localStorage.getItem('pinball-roguelite.theme.v1')) === 'factory', 'the theme choice is saved');
  await page.evaluate(() => window.__pinball.freeze(true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/smoke-1-workshop.png` });
  const shopBox = await (await page.$('#offers')).boundingBox();
  check(shopBox.y + shopBox.height <= 900, 'every shop offer is on screen without scrolling');
  check(await page.locator('#score .drum').count() === 4, 'the score window starts with four drums (0000)');
  await page.click('#machineBox summary'); // undo, the Test Lab and the slots live under Machine & options

  // sim -> screen goes through the projection and the machine's tilt, so ask the game where a point is
  const at = (x, y) => page.evaluate(([px, py]) => window.__pinball.toScreen(px, py), [x, y]);
  const state = () => page.evaluate(() => { const g = window.__pinball.game; return { placed: g.placed.length, inv: g.inventory.length, money: g.money, offers: g.shop.offers.filter(Boolean).length }; });

  // real shop: buy the first affordable offer, place it, then undo and redo both steps
  let s = await state();
  check(s.placed === 4 && s.inv === 0 && s.money === 6, 'starts with 3 bumpers and the fixed Big Boi placed, empty inventory, $6');
  await page.click('button[data-buy]:not([disabled])');
  s = await state();
  check(s.inv === 1 && s.money < 6, 'buying puts the part in the inventory and costs money');
  const p = await at(12, 28);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  s = await state();
  check(s.placed === 5 && s.inv === 0, 'clicking the table places it');
  check(await page.isVisible('#selected'), 'the part card is shown for the new part');
  const card = await page.innerText('#selected');
  check(/pays|flipper|Roll a ball|Scores nothing|Each target/i.test(card), 'the part card says what it pays');
  await page.click('#btnUndo');
  s = await state();
  check(s.placed === 4 && s.inv === 1, 'undo takes the placement back');
  await page.click('#btnUndo');
  s = await state();
  check(s.inv === 0 && s.money === 6, 'undo takes the purchase back and refunds the money');
  await page.click('#btnRedo');
  await page.click('#btnRedo');
  s = await state();
  check(s.placed === 5, 'redo puts it all back');

  // drag it onto the inventory panel to take it off the board
  const inv = await (await page.$('#inventoryBox')).boundingBox();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 10, { steps: 4 });
  await page.mouse.move(inv.x + inv.width / 2, inv.y + inv.height / 2, { steps: 8 });
  await page.mouse.up();
  s = await state();
  check(s.placed === 4 && s.inv === 1, 'dragging a part onto the inventory stores it');

  // arm it from the inventory and place it again
  await page.click('#inventory .item');
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  s = await state();
  check(s.placed === 5 && s.inv === 0, 'clicking an inventory part then the table places it');

  // test lab: the whole catalog, free
  const moneyBefore = (await state()).money;
  await page.check('#sandbox');
  const adds = await page.locator('button[data-add]').count();
  check(adds >= 12, `the lab catalog lists every part (${adds})`);
  check(await page.isVisible('#labTools'), 'the lab tools appear');
  await page.click('button[data-add="bank"]');
  const bank = await at(12, 21);
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
  check((await state()).placed === 1, 'clear board stores every part but the fixed Big Boi');
  await page.click('button[data-load="0"]');
  check((await state()).placed >= 5, 'loading a layout slot re-arranges the parts');
  await page.uncheck('#sandbox');

  // hover a starter bumper: the tooltip explains its recipe
  const pop = await at(17, 44.5);
  await page.mouse.move(pop.x, pop.y);
  await page.mouse.move(pop.x + 2, pop.y + 2);
  check(await page.isVisible('#tip'), 'hovering a part shows its tooltip');
  const tip = await page.innerText('#tip');
  check(tip.includes('Pop Bumper') && tip.includes('100') && tip.includes('+5'), 'the Pop Bumper tooltip says "100" and "+5"');
  check(/Next hit pays \d+/i.test(tip) && /your Mult/i.test(tip), 'the tooltip leads with the next-hit number and its math chips');
  await page.mouse.move(5, 5);

  // the toolbox holds four: buying stops, and storing into a full toolbox sells the part for half
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); g.money = 50; window.__pinball.refresh(); });
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { const g = window.__pinball.game; g.shop.offers = ['pop', 'pop', 'pop', 'pop']; window.__pinball.refresh(); });
    await page.click('button[data-buy="0"]');
  }
  check((await state()).inv === 4 && await page.isDisabled('button[data-buy="1"]'), 'with four parts in the toolbox the Buy buttons are off');
  const before = (await state()).money;
  await page.keyboard.press('Escape'); // the last part bought is still in hand
  const pop2 = await at(11, 45.5);
  await page.mouse.click(pop2.x, pop2.y);
  await page.keyboard.press('Delete');
  const after = await state();
  check(after.money === before + 1 && after.placed === 3 && after.inv === 4, `storing into a full toolbox sells the part for half ($${before} -> $${after.money})`);
  check(await page.isHidden('#toolSell'), 'the toolbox shows no Sell button until a part in it is picked');
  await page.click('#inventory .item[data-uid]');
  check((await page.innerText('#toolSell')) === 'SELL $1', 'picking a toolbox part puts a Sell button with its price on the latch');
  await page.screenshot({ path: `${out}/smoke-2d-toolbox-sell.png`, clip: await (await page.$('#inventoryBox')).boundingBox() });
  await page.click('#toolSell');
  const sold = await state();
  check(sold.inv === 3 && sold.money === after.money + 1, 'Sell sells it for half and frees the slot');
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.refresh(); });

  // buying by dragging: an offer dropped on the table lands on the board without going through the toolbox
  await page.evaluate(() => { const g = window.__pinball.game; g.money = 20; g.shop.offers = ['coin', 'pop', 'pop', 'pop']; window.__pinball.refresh(); });
  const offer = await (await page.$('.offer[data-slot="0"] .plinth')).boundingBox();
  const spot = await at(12, 22);
  const placedBefore = (await state()).placed;
  await page.mouse.move(offer.x + offer.width / 2, offer.y + offer.height / 2);
  await page.mouse.down();
  await page.mouse.move(spot.x - 40, spot.y, { steps: 6 });
  await page.mouse.move(spot.x, spot.y, { steps: 4 });
  await page.mouse.up();
  const dropped = await state();
  check(dropped.placed === placedBefore + 1 && dropped.money === 20 - 4 && dropped.inv === 0, 'dragging an offer onto the table buys it straight onto the board');
  check(await page.isVisible('#selected') && (await page.innerText('#selected')).includes('To toolbox'), 'its card offers To toolbox');
  const boi = await at(12, 36);
  await page.mouse.click(boi.x, boi.y);
  check(!(await page.innerText('#selected')).includes('Sell'), 'the fixed Big Boi cannot be sold or moved');
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.refresh(); });

  // click and drop: click an offer to pick it up, click the table to buy it onto the board; a right-click puts it back unpaid
  await page.evaluate(() => { const g = window.__pinball.game; g.money = 20; g.shop.offers = ['coin', 'pop', 'pop', 'pop']; window.__pinball.refresh(); });
  await page.click('.offer[data-slot="0"] .plinth');
  const spot2 = await at(12, 22);
  await page.mouse.move(spot2.x, spot2.y, { steps: 4 });
  await page.mouse.click(spot2.x, spot2.y, { button: 'right' });
  check((await state()).money === 20, 'a right-click puts a picked-up offer back without paying');
  await page.click('.offer[data-slot="0"] .plinth');
  await page.mouse.move(spot2.x, spot2.y, { steps: 4 });
  await page.mouse.click(spot2.x, spot2.y);
  const clicked = await state();
  check(clicked.money === 16 && clicked.placed === 5, 'click an offer, then click the table: bought and placed in one go');
  // click a part on the table to pick it up, click again to set it down somewhere else
  const from = await at(12, 22), to = await at(8, 26);
  await page.mouse.click(from.x, from.y);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.click(to.x, to.y);
  const moved = await page.evaluate(() => window.__pinball.game.placed.find((p) => p.def === 'coin'));
  check(Math.hypot(moved.x - 8, moved.y - 26) < 0.6, `a clicked part follows the pointer and the next click sets it down (${moved.x.toFixed(1)}, ${moved.y.toFixed(1)})`);
  // 1, 2, 3 switch the theme
  await page.keyboard.press('Digit2');
  check(await page.evaluate(() => localStorage.getItem('pinball-roguelite.theme.v1')) === 'diner', 'key 2 switches to the second machine');
  await page.keyboard.press('Digit1');
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.refresh(); });

  // relic decals: earn one from a Rules card, read it on the apron, peel it off
  await page.evaluate(() => { const g = window.__pinball.game; g.pending = [{ id: 'sponsor' }, { id: 'headStart' }]; window.__pinball.refresh(); });
  check(await page.locator('.ucard.c-rules .decalimg').count() === 1, 'a Rules card shows the decal it would stick on');
  await page.click('.ucard[data-pick="1"]');
  check(await page.evaluate(() => window.__pinball.game.decals.length) === 1, 'taking the Rules card sticks a decal on the apron');
  await page.evaluate(() => window.__pinball.renderer.draw(window.__pinball.game, 0.016, { ghost: null, selectedUid: null, hoverUid: null, showHeat: false }));
  const slot = await page.evaluate(() => window.__pinball.toScreen(2.6, 6.6, 0.5));
  await page.mouse.move(slot.x, slot.y);
  await page.mouse.move(slot.x + 1, slot.y + 1);
  check((await page.innerText('#tip')).includes('Head Start'), 'hovering the decal reads its rule');
  await page.mouse.click(slot.x + 1, slot.y + 1);
  check(await page.isVisible('#btnPeel'), 'clicking a decal between rounds offers to peel it');
  await page.click('#btnPeel');
  check(await page.evaluate(() => window.__pinball.game.decals.length) === 0, 'peeling removes the decal and its rule');
  await page.mouse.move(5, 5);
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
  check(await page.isVisible('#upgradeBox'), 'the upgrade picker shows over the table when one is owed');
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

  // a real round with the bot at the controls: the machine tips towards you while the ball is live
  await page.click('#btnStart');
  await page.evaluate(() => window.__pinball.advance(25, 5));
  await page.screenshot({ path: `${out}/smoke-3-round.png` });
  const st = await page.evaluate(() => { const g = window.__pinball.game; return { mode: g.mode, score: Math.round(g.scorer.score), rows: g.scorer.ledgerRows().length, k: window.__pinball.renderer.view.k }; });
  console.log('after 25s of bot play:', JSON.stringify(st));
  check(st.score > 0 && st.rows > 0, 'the bot scored and the ledger attributes it');
  check(Math.abs(st.k - 0.9) < 0.011, `the machine keeps its one tip in play (k ${st.k})`);
  check(await page.locator('#ledger tbody tr').count() > 0, 'the receipt prints the ledger');
  const ms = await page.evaluate(() => window.__pinball.probe(60));
  console.log(`renderer: ${ms.toFixed(2)} ms per frame (CPU side, software GL)`);
  if (ms > 12) fail(`drawing a frame costs too much (${ms.toFixed(1)} ms)`);

  // visual snapshots: the workshop and a frozen play frame in every theme
  const shots = [];
  for (const theme of ['factory', 'diner', 'castle']) {
    await page.evaluate((t) => { const d = window.__pinball; d.theme(t); d.game.newRun(); d.refresh(); }, theme);
    await page.evaluate(() => window.__pinball.advance(0.5, 1));
    await page.screenshot({ path: `${out}/snap-${theme}-workshop.png` });
    const size0 = await page.evaluate(() => { const v = window.__pinball.renderer.view; return [v.S, v.k, v.oy].join(); });
    await page.click('#btnStart');
    await page.evaluate(() => window.__pinball.advance(8, 7));
    const size1 = await page.evaluate(() => { const v = window.__pinball.renderer.view; return [v.S, v.k, v.oy].join(); });
    check(size0 === size1, `${theme}: the machine is the same size building and playing (${size1})`);
    const buf = await page.screenshot({ path: `${out}/snap-${theme}-play.png`, clip: await (await page.$('#stage')).boundingBox() });
    shots.push(buf.toString('base64').length);
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    check(/^#[0-9a-f]{6}$/.test(bg), `${theme}: the panels take the theme's tokens (${bg})`);
  }
  check(new Set(shots).size === 3, 'the three themes render differently');
  await page.evaluate(() => { const d = window.__pinball; d.theme('factory'); d.game.newRun(); d.refresh(); });

  // losing: the whole page greys out under a summary with the map and the run's points
  await page.evaluate(() => { const d = window.__pinball; d.game.newRun(); d.refresh(); });
  await page.click('#btnStart');
  await page.evaluate(() => { const d = window.__pinball; d.game.scorer.goal = 1e12; d.advance(240, 2); });
  check(await page.evaluate(() => window.__pinball.game.mode) === 'runOver', 'a round against an impossible goal ends the run');
  const ov = await (await page.$('#overlay')).boundingBox();
  check(ov.x <= 1 && ov.y <= 1 && ov.width >= 1430, 'the lose screen greys out the whole page');
  check(await page.locator('#overlay .summary .roundmap svg').count() === 1 && /total points/i.test(await page.innerText('#overlay')), 'the lose screen shows the map and the total points');
  await page.screenshot({ path: `${out}/smoke-4-run-over.png` });

  if (errors.length) fail('console errors:\n' + errors.join('\n'));
  else console.log('ok: no console errors');
  await browser.close();
  if (failed) process.exit(1);
})().catch((e) => { console.error('SMOKE CRASHED', e); process.exit(1); });
