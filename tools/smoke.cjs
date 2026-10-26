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
  // the main menu: the title over a demo machine that plays itself, and nothing to resume on a first visit
  await page.waitForSelector('#menu .mbtn');
  const title = await page.innerText('#menu .mtitle');
  check(/BIG BOI/.test(title) && /PINBALL DESIGNER/.test(title), 'the main menu shows the title');
  check(await page.locator('#menu [data-act="resume"]').count() === 0, 'a first visit has nothing to resume');
  check(await page.evaluate(() => window.__pinball.attract() && window.__pinball.game.mode === 'round' && window.__pinball.game.goalOverride === Infinity), 'the attract table plays a demo round behind the menu');
  check(await page.isHidden('#left') && await page.isHidden('#right'), 'the panels make room for the attract table');
  await page.evaluate(() => window.__pinball.demo(12));
  check(await page.evaluate(() => window.__pinball.game.scorer.score > 0), 'the bot scores on the attract table');
  check(await page.evaluate(() => localStorage.getItem('pinball-roguelite.run.v2')) === null, 'the attract table never saves');
  await page.screenshot({ path: `${out}/smoke-0-menu.png` });
  // there is no default machine: New Game shows the three cabinets, and each machine names its Big Boi
  await page.click('#menu [data-act="new"]');
  await page.waitForSelector('#menu .cab');
  check(await page.locator('#menu .cab').count() === 3, 'New Game offers three machines to pick from');
  const picker = await page.innerText('#menu');
  check(/Foreman/.test(picker) && /Cook/.test(picker) && /Dragon/.test(picker), 'each machine says what its Big Boi does');
  await page.waitForFunction(() => document.querySelectorAll('#menu .cab .art svg').length === 3);
  check(true, 'each card shows its full cabinet');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/smoke-0b-picker.png` });
  await page.keyboard.press('Escape');
  check(await page.isVisible('#menu .mpanel'), 'Esc goes back from the picker to the main menu');
  await page.keyboard.press('Enter'); // New Game has the focus
  await page.waitForSelector('#menu .cab');
  await page.click('#menu .cab[data-theme="factory"]');
  check(await page.isHidden('#menu'), 'picking a machine closes the menu');
  check(!(await page.evaluate(() => window.__pinball.attract())), 'and stops the attract table');
  check(await page.evaluate(() => localStorage.getItem('pinball-roguelite.theme.v1')) === 'factory', 'the machine choice is saved');
  check(await page.evaluate(() => window.__pinball.game.machine) === 'factory', 'the run is on the picked machine');
  check(/Next boss/i.test(await page.innerText('#bossBox')), 'the scoreboard names the next boss');
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
  check(s.placed === 1 && s.inv === 3 && s.money === 6, 'a run starts with Big Boi on the table, the 3 starting bumpers in the toolbox, $6');
  await page.click('#inventory .item');
  const seat = await at(17, 44.5);
  await page.mouse.move(seat.x, seat.y);
  await page.mouse.click(seat.x, seat.y);
  check((await state()).money === 6 && (await state()).placed === 2, 'placing a starting bumper is free');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const g = window.__pinball.game; g.place(1, 17, 44.5); window.__pinball.seatStarters(); });
  s = await state();
  check(s.placed === 4 && s.inv === 0 && s.money === 6, 'with all three placed: 3 bumpers and Big Boi on the table, $6');
  await page.click('button[data-buy]:not([disabled])');
  s = await state();
  check(s.inv === 1 && s.money < 6, 'buying puts the part in the inventory and costs money');
  const p = await at(12, 28);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  s = await state();
  check(s.placed === 5 && s.inv === 0, 'clicking the table places it');
  check(await page.isVisible('#inspect'), 'the part card opens beside the new part');
  const card = await page.innerText('#inspect');
  check(!/your Mult/i.test(card) && /base \d+/i.test(card), 'the picked part\'s card shows the base as a small number, without the Mult chip');
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

  // dragging a part on the table does not move it: a click opens its card, and To toolbox takes it off the board
  const inv = await (await page.$('#inventoryBox')).boundingBox();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 10, { steps: 4 });
  await page.mouse.move(inv.x + inv.width / 2, inv.y + inv.height / 2, { steps: 8 });
  await page.mouse.up();
  s = await state();
  check(s.placed === 5 && s.inv === 0, 'a part on the table cannot be dragged off it');
  check(await page.isVisible('#inspect') && /Move/.test(await page.innerText('#inspect')) && /To toolbox/.test(await page.innerText('#inspect')), 'clicking a part opens its card with Move and To toolbox');
  check(await page.locator('#inspect button', { hasText: '15°' }).count() === 0, 'the card has no rotate buttons');
  await page.keyboard.press('Escape');
  check(await page.isHidden('#inspect') && await page.isHidden('#menu'), 'Esc closes the card (and does not pause)');
  await page.mouse.click(p.x, p.y);
  await page.click('#btnStore');
  s = await state();
  check(s.placed === 4 && s.inv === 1, 'To toolbox stores it');

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
  check(tip.includes('Pop Bumper') && tip.includes('20') && tip.includes('+1'), 'the Pop Bumper tooltip says "20" and "+1"');
  check(/Next hit pays \d+/i.test(tip) && /your Mult/i.test(tip), 'the tooltip leads with the next-hit number and its math chips');
  await page.mouse.move(5, 5);

  // the toolbox holds four: buying stops, and storing into a full toolbox sells the part for half (after the $1 to move it)
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); window.__pinball.seatStarters(); g.money = 50; window.__pinball.refresh(); });
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
  check(after.money === before && after.placed === 3 && after.inv === 4, `storing into a full toolbox costs $1 to move and sells for $1 ($${before} -> $${after.money})`);
  check(await page.isHidden('#toolSell'), 'the toolbox shows no Return button until a part in it is picked');
  await page.click('#inventory .item[data-uid]');
  check((await page.innerText('#toolSell')) === 'RETURN +$3', 'picking a part bought this visit puts a Return button with its price on the latch');
  await page.screenshot({ path: `${out}/smoke-2d-toolbox-sell.png`, clip: await (await page.$('#inventoryBox')).boundingBox() });
  await page.click('#toolSell');
  const sold = await state();
  check(sold.inv === 3 && sold.money === after.money + 3, 'Return gives back what it cost and frees the slot');
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.seatStarters(); window.__pinball.refresh(); });

  // buying by dragging: an offer dropped on the table lands on the board without going through the toolbox
  await page.evaluate(() => { const g = window.__pinball.game; g.money = 20; g.shop.offers = ['coin', 'pop', 'pop', 'pop']; window.__pinball.refresh(); });
  await page.waitForTimeout(800); // the new shelf rolls down first
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
  check(await page.isVisible('#inspect') && (await page.innerText('#inspect')).includes('To toolbox'), 'its card offers To toolbox');
  await page.keyboard.press('Escape');
  const boi = await at(12, 36);
  await page.mouse.click(boi.x, boi.y);
  check(!/Return|Scrap|Move/.test(await page.innerText('#inspect')), 'the fixed Big Boi cannot be sold or moved');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.seatStarters(); window.__pinball.refresh(); });

  // a shelf that is still rolling in cannot be grabbed or bought
  await page.evaluate(() => { const g = window.__pinball.game; g.money = 20; g.shop.offers = ['coin', 'pop', 'pop', 'pop']; window.__pinball.refresh(); });
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.offer[data-slot="0"]')).pointerEvents) === 'none', 'offers ignore the pointer while they roll in');
  await page.waitForTimeout(800);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.offer[data-slot="0"]')).pointerEvents) !== 'none', 'and take it once they have landed');

  // click and drop: click an offer to pick it up, click the table to buy it onto the board; a right-click puts it back unpaid
  await page.evaluate(() => { const g = window.__pinball.game; g.money = 20; g.shop.offers = ['coin', 'pop', 'pop', 'pop']; window.__pinball.refresh(); });
  await page.waitForTimeout(800);
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
  // Move on a part's card picks it up: it follows the pointer and the next click sets it down somewhere else
  const from = await at(12, 22), to = await at(8, 26);
  await page.keyboard.press('Escape');
  await page.mouse.click(from.x, from.y);
  await page.click('#btnMove');
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.click(to.x, to.y);
  const moved = await page.evaluate(() => window.__pinball.game.placed.find((p) => p.def === 'coin'));
  check(Math.hypot(moved.x - 8, moved.y - 26) < 0.6, `Move: the part follows the pointer and the next click sets it down (${moved.x.toFixed(1)}, ${moved.y.toFixed(1)})`);
  // moving a part you did not buy this visit costs $1 once, and the card says so; with no money it cannot move
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const g = window.__pinball.game; for (const q of g.placed) delete q.loose; g.money = 0; window.__pinball.refresh(); });
  await page.mouse.click(to.x, to.y);
  check(/\$1/.test(await page.innerText('#btnMove')) && await page.isDisabled('#btnMove'), 'Move shows its $1 fee, and is off with no money');
  await page.keyboard.press('Escape');
  // an offer picked up from the shop turns with R before it is dropped
  await page.evaluate(() => { const g = window.__pinball.game; g.money = 20; g.shop.offers = ['sling', 'pop', 'pop', 'pop']; window.__pinball.refresh(); });
  await page.waitForTimeout(800);
  await page.click('.offer[data-slot="0"] .plinth');
  const spot3 = await at(14, 30);
  await page.mouse.move(spot3.x, spot3.y, { steps: 4 });
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyR');
  await page.mouse.click(spot3.x, spot3.y);
  const sling = await page.evaluate(() => window.__pinball.game.placed.find((p) => p.def === 'sling'));
  check(sling && Math.abs(sling.angle - Math.PI / 6) < 0.01, `R turns a shop offer while it is carried (${sling?.angle})`);
  // the machine stays for the run: number keys no longer switch it
  await page.keyboard.press('Digit2');
  check(await page.evaluate(() => window.__pinball.game.machine) === 'factory', 'the machine cannot be switched mid-run');
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.seatStarters(); window.__pinball.refresh(); });

  // lock a shop offer: it is marked, and it is still there after a reroll
  const lockedId = await page.evaluate(() => window.__pinball.game.shop.offers[1]);
  await page.click('button[data-lock="1"]');
  check(await page.evaluate(() => window.__pinball.game.isLocked(1)), 'the lock button locks an offer');
  await page.evaluate(() => { const g = window.__pinball.game; g.money += 5; g.reroll(); window.__pinball.refresh(); });
  check(await page.evaluate(() => window.__pinball.game.shop.offers[1]) === lockedId, 'a locked offer survives a reroll');
  await page.click('button[data-lock="1"]');

  // relic decals: pick one after a boss, read it on the apron, peel it off
  await page.evaluate(() => { const g = window.__pinball.game; g.pending = [{ id: 'sponsor' }, { id: 'headStart' }, { id: 'rubber' }]; window.__pinball.refresh(); });
  check(await page.locator('.dp-card .dp-img').count() === 3, 'every decal card shows the decal it would stick on');
  const cardText = await page.innerText('.dp-card[data-pick="1"]');
  check(/Head Start/i.test(cardText) && /Score/i.test(cardText) && /Common/i.test(cardText) && /\+0\.5 Mult/.test(cardText) && /apron slot 1 of 4/i.test(cardText), 'a decal card reads its name, kind, rarity, rule and the apron slot it goes to');
  await page.click('.dp-card[data-pick="1"]'); // waits for the card to land and turn over
  await page.waitForFunction(() => window.__pinball.game.decals.length === 1, null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => window.__pinball.game.decals.length) === 1, 'taking a card sticks its decal on the apron (once it has flown there)');
  await page.waitForSelector('#upgradeBox', { state: 'hidden', timeout: 5000 }).catch(() => {});
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

  // the between-rounds flow: a boss was just beaten, so a decal pick is owed before the next round
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); window.__pinball.seatStarters(); g.round = 3; g.continueAfterRound(); window.__pinball.refresh(); });
  check(await page.isVisible('#upgradeBox'), 'the decal picker shows over the table when one is owed');
  check(await page.locator('.dp-card').count() === 3, 'three decals are offered');
  const bossName = await page.evaluate(() => window.__pinball.game.bossAt(3).name);
  check((await page.innerText('.dp-head')).toLowerCase().includes(bossName.toLowerCase()), `the reveal names the boss that was beaten (${bossName})`);
  check(await page.isDisabled('#btnStart'), 'Start round is locked while the pick is owed');
  await page.screenshot({ path: `${out}/smoke-2c-upgrade.png` });
  await page.waitForSelector('#upgradeBox.dp-settled', { timeout: 5000 });
  await page.screenshot({ path: `${out}/smoke-2c-upgrade-settled.png` });
  // the keyboard: the arrows lift a card, Enter sticks it
  await page.keyboard.press('ArrowRight');
  check(await page.evaluate(() => document.querySelector('.dp-card.is-sel')?.dataset.pick) === '0', 'an arrow key lifts the first card');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__pinball.game.decals.length === 1, null, { timeout: 5000 }).catch(() => {});
  check(!(await page.isDisabled('#btnStart')), 'taking a decal unlocks Start round');
  await page.waitForSelector('#upgradeBox', { state: 'hidden', timeout: 5000 }).catch(() => {});
  check(!(await page.isVisible('#upgradeBox')) && (await page.evaluate(() => window.__pinball.game.decals.length)) === 1, 'the offer closes and the decal is on the apron');
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); window.__pinball.seatStarters(); g.round = 3; g.continueAfterRound(); window.__pinball.refresh(); });
  const cash = await page.evaluate(() => window.__pinball.game.money);
  await page.click('#btnSkip');
  check((await page.evaluate(() => window.__pinball.game.money)) === cash + 4, 'skipping pays $4');
  await page.waitForSelector('#upgradeBox', { state: 'hidden', timeout: 5000 }).catch(() => {});
  // the number keys pick straight away, S skips
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); window.__pinball.seatStarters(); g.round = 3; g.continueAfterRound(); window.__pinball.refresh(); });
  await page.keyboard.press('KeyS');
  check((await page.evaluate(() => window.__pinball.game.money)) === cash + 4 && !(await page.evaluate(() => window.__pinball.game.pending)), 'S skips for the cash');
  await page.waitForSelector('#upgradeBox', { state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { const g = window.__pinball.game; g.newRun(); window.__pinball.seatStarters(); g.round = 3; g.continueAfterRound(); window.__pinball.refresh(); });
  await page.keyboard.press('Digit3');
  await page.waitForFunction(() => window.__pinball.game.decals.length === 1, null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => window.__pinball.game.decals.length) === 1, 'a number key sticks that card');
  await page.waitForSelector('#upgradeBox', { state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { window.__pinball.game.newRun(); window.__pinball.seatStarters(); window.__pinball.refresh(); });

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
  // the effects budget: four balls, a full load of sparks and a burst of zaps at once (borrowed-parts §7)
  const busy = await page.evaluate(() => {
    const P = window.__pinball, g = P.game, sim = g.sim;
    for (let i = 0; i < 3; i++) sim.addBall(6 + i * 5, 40, (i - 1) * 6, -4);
    const id = sim.ballStates()[0]?.id ?? 1;
    sim.addSparks(24, 12, 34, id, { r: 1.5 });
    const ps = g.placed.filter((p) => p.x !== undefined).slice(0, 8);
    for (const p of ps) P.renderer.onScore({ uid: p.uid, def: p.def, kind: 'hit', x: p.x, y: p.y, t: sim.time, points: 12, base: 12, notes: [], money: 0, multBefore: 1, multAfter: 1, zap: { x: 12, y: 30, by: 'arc' } });
    return { balls: sim.ballStates().length, sparks: sim.sparkStates().length, ms: P.probe(60) };
  });
  console.log(`renderer, ${busy.balls} balls + ${busy.sparks} sparks + zaps: ${busy.ms.toFixed(2)} ms per frame`);
  check(busy.sparks >= 24, 'the sparks are on the table');
  if (busy.ms > 12) fail(`drawing a busy frame costs too much (${busy.ms.toFixed(1)} ms)`);

  // visual snapshots: the workshop and a frozen play frame in every theme
  const shots = [];
  for (const theme of ['factory', 'diner', 'castle']) {
    await page.evaluate((t) => { const d = window.__pinball; d.theme(t); d.game.newRun(); window.__pinball.seatStarters(); d.refresh(); }, theme);
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
  await page.evaluate(() => { const d = window.__pinball; d.theme('factory'); d.game.newRun(); window.__pinball.seatStarters(); d.refresh(); });

  // a round cleared: the card counts in, a click skips to the end, then the button takes you on
  await page.evaluate(() => { const d = window.__pinball; d.game.newRun(); window.__pinball.seatStarters(); d.refresh(); });
  await page.click('#btnStart');
  await page.evaluate(() => { const d = window.__pinball; d.game.scorer.goal = 1; d.advance(6, 2); });
  await page.click('#btnCash');
  await page.evaluate(() => window.__pinball.advance(0.1, 2));
  check(await page.isVisible('#overlay .clear'), 'clearing a round shows the round-cleared card');
  await page.mouse.click(720, 200);
  check(await page.isVisible('#overlay .cl-btns.on #btnNext'), 'a click skips the count and shows the button');
  await page.screenshot({ path: `${out}/smoke-3b-cleared.png` });
  await page.click('#btnNext');
  check(await page.evaluate(() => window.__pinball.game.mode) === 'workshop', 'the button goes on to the workshop');

  // losing: the whole page greys out under a summary with the map and the run's points
  await page.evaluate(() => { const d = window.__pinball; d.game.newRun(); window.__pinball.seatStarters(); d.refresh(); });
  await page.click('#btnStart');
  await page.evaluate(() => { const d = window.__pinball; d.game.scorer.goal = 1e12; d.advance(240, 2); });
  check(await page.evaluate(() => window.__pinball.game.mode) === 'runOver', 'a round against an impossible goal ends the run');
  const ov = await (await page.$('#overlay')).boundingBox();
  check(ov.x <= 1 && ov.y <= 1 && ov.width >= 1430, 'the lose screen greys out the whole page');
  check(await page.locator('#overlay .summary .roundmap svg').count() === 1 && /total points/i.test(await page.innerText('#overlay')), 'the lose screen shows the map and the total points');
  await page.screenshot({ path: `${out}/smoke-4-run-over.png` });
  check(await page.evaluate(() => localStorage.getItem('pinball-roguelite.run.v2')) === null, 'a lost run is cleared from storage');

  // the lost run is on the scoreboard, with the machine it ended as
  const lsGet = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
  await page.click('#btnToMenu');
  check(await page.isVisible('#menu .mpanel') && await page.locator('#menu [data-act="resume"]').count() === 0, 'the lose screen goes to the main menu, with nothing to resume');
  await page.click('#menu [data-act="scores"]');
  check(await page.locator('#menu .sbrow').count() === 1 && /lost/i.test(await page.innerText('#menu .sbrow')), 'the scoreboard lists the lost run');
  await page.waitForFunction(() => { const i = document.querySelector('#sbDetail img.thumb'); return i && i.naturalWidth > 0; });
  check(true, 'the picked run shows its final build as a picture');
  check((await lsGet('pinball-roguelite.scoreboard.v1'))[0].parts.length >= 4, 'the record keeps the final build, part by part');
  await page.screenshot({ path: `${out}/smoke-5-scoreboard.png` });
  await page.mouse.click(10, 880);
  check(await page.isVisible('#menu .mpanel'), 'a click outside the scoreboard goes back to the main menu');
  await page.waitForFunction(() => !document.querySelector('#menu .in'));
  await page.click('#menu .mboi', { force: true }); // he breathes, so he is never "stable"
  check(await page.evaluate(() => document.querySelector('#menu .mboi').classList.contains('poked')), 'poking Big Boi on the menu makes him jump');

  // settings: a flipper rebound, a reserved key refused, graphics and volume saved and used at once
  await page.click('#menu [data-act="settings"]');
  await page.click('#menu [data-bind="left"]');
  await page.keyboard.press('KeyM');
  check(/taken/.test(await page.innerText('#bindMsg')), 'a key the game uses cannot be bound');
  await page.keyboard.press('KeyA');
  check((await lsGet('pinball-roguelite.settings.v1')).keys.left === 'KeyA' && (await page.innerText('#menu [data-bind="left"]')) === 'A', 'the left flippers can be moved to another key');
  await page.click('#menu [data-q="low"]');
  check((await lsGet('pinball-roguelite.settings.v1')).quality === 'low' && await page.evaluate(() => window.__pinball.renderer.app.renderer.resolution === 1), 'low graphics is saved and drawn at 1x at once');
  await page.click('#menu [data-q="high"]');
  await page.$eval('#menu input[data-vol="music"]', (el) => { el.value = '35'; el.dispatchEvent(new Event('input')); });
  check((await lsGet('pinball-roguelite.settings.v1')).music === 0.35, 'the music volume is saved');
  await page.screenshot({ path: `${out}/smoke-6-settings.png` });
  await page.mouse.click(10, 880);
  check(await page.isVisible('#menu .mpanel'), 'a click outside the settings card goes back to the main menu');

  // a new run: Esc pauses it, and the sim holds still under the pause menu (the sim runs in real time from here)
  await page.evaluate(() => window.__pinball.freeze(false));
  await page.click('#menu [data-act="new"]');
  await page.click('#menu .cab[data-theme="diner"]');
  await page.click('#btnStart');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  check(await page.isVisible('#menu .pausecard'), 'Esc during a round opens the pause menu');
  const t0 = await page.evaluate(() => window.__pinball.game.sim.time);
  await page.waitForTimeout(500);
  check(await page.evaluate(() => window.__pinball.game.sim.time) === t0, 'the sim holds still while paused');
  await page.screenshot({ path: `${out}/smoke-7-pause.png` });
  await page.click('#menu [data-act="unpause"]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__pinball.game.sim.time) > t0, 'Resume carries on');
  // the rebound key works the flippers
  const leftAngle = () => page.evaluate(() => window.__pinball.game.sim.flipperStates().find((f) => f.side === 'L' && f.uid === undefined).angle);
  const rest = await leftAngle();
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(250);
  const up = await leftAngle();
  await page.keyboard.up('KeyA');
  check(Math.abs(up - rest) > 0.3, `the rebound key raises the left flippers (${rest.toFixed(2)} -> ${up.toFixed(2)})`);
  // the visible pause button, then Quit to Main Menu keeps the run, and Resume brings it back
  await page.click('#btnPause');
  await page.click('#menu [data-act="quit"]');
  check(await page.locator('#menu [data-act="resume"]').count() === 1 && (await lsGet('pinball-roguelite.run.v2')) !== null, 'quitting to the main menu keeps the run saved');
  await page.screenshot({ path: `${out}/smoke-8-menu-resume.png` });
  await page.click('#menu [data-act="resume"]');
  check(await page.isHidden('#menu') && await page.evaluate(() => window.__pinball.game.machine === 'diner' && window.__pinball.game.mode === 'workshop'), 'Resume loads the run back (a round in play starts over)');
  // New Game while a run exists asks first; Keep it keeps it
  await page.keyboard.press('Escape');
  await page.click('#menu [data-act="quit"]');
  await page.click('#menu [data-act="new"]');
  check(await page.isVisible('#menu .mconfirm'), 'New Game over a saved run asks before abandoning it');
  await page.click('#menu .mconfirm [data-no]');
  check(await page.locator('#menu [data-act="resume"]').count() === 1, 'Keep it keeps the run');
  // Abandon Run from the pause menu: confirm, onto the scoreboard as abandoned, the save cleared
  await page.click('#menu [data-act="resume"]');
  await page.evaluate(() => { window.__pinball.game.round = 4; });
  await page.keyboard.press('Escape');
  await page.click('#menu [data-act="abandon"]');
  await page.click('#menu .mconfirm [data-yes]');
  const board = await lsGet('pinball-roguelite.scoreboard.v1');
  check(board.length === 2 && board.some((r) => r.result === 'abandoned' && r.machine === 'diner' && r.cleared === 3), 'an abandoned run goes on the scoreboard');
  check((await lsGet('pinball-roguelite.run.v2')) === null && await page.locator('#menu [data-act="resume"]').count() === 0, 'and the save is cleared');
  // keyboard: arrows move the focus, Enter goes
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check(await page.isVisible('#menu .setcard') || await page.locator('#menu .sbrow').count() > 0, 'the arrows and Enter drive the main menu');

  if (errors.length) fail('console errors:\n' + errors.join('\n'));
  else console.log('ok: no console errors');
  await browser.close();
  if (failed) process.exit(1);
})().catch((e) => { console.error('SMOKE CRASHED', e); process.exit(1); });
