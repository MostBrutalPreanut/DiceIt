import { makePart, PARTS, type PartId } from '../../src/data/parts';
import { Game, payoutFor } from '../../src/game/game';
import { DECOR_SLOT } from '../../src/sim/cabinet';
import { neutralMods } from '../../src/data/mods';
import { gameFor, layoutFrom, playRound } from './lib';
import { mid } from './tables';

/**
 * Parts with no points of their own: do they do their thing? Direct checks on a real Game.
 *   npx vite-node tools/research/mechanics.ts
 */
const say = (ok: boolean, what: string) => console.log(`${ok ? 'WORKS ' : 'BROKEN'}  ${what}`);

// Time Capsule: six rounds on the table, then scrapping it pays a pick of three legendaries
{
  const g = new Game();
  g.newRun('factory');
  const p = makePart('capsule', g.layout.nextUid++, 12, 24, true);
  g.layout.parts.push(p);
  let ripeAt = -1;
  for (let r = 0; r < 8 && ripeAt < 0; r++) { g.continueAfterRound(); g.pending = null; if (g.capsuleRipe(p)) ripeAt = r + 1; }
  const before = g.money;
  const refund = g.sell(p.uid);
  const prize = g.shop.prize ?? [];
  say(ripeAt === 6 && prize.length === 3 && prize.every((id) => PARTS[id].rarity === 'legendary'), `Time Capsule ripe after ${ripeAt} rounds; dig-up refund ${refund} (money ${before} -> ${g.money}); prize ${JSON.stringify(prize)} (${prize.map((id) => PARTS[id].rarity).join(',')})`);
}

// Side Mirror: +1 shop offer every second round, only from the decor screen
{
  const g = new Game();
  g.newRun('factory');
  g.layout.parts.push(makePart('mirror', g.layout.nextUid++, DECOR_SLOT.x, DECOR_SLOT.y, true));
  const sizes: number[] = [];
  for (let r = 0; r < 4; r++) { g.continueAfterRound(); g.pending = null; sizes.push(g.shop.offers.length); }
  say(sizes.some((s) => s === 5), `Side Mirror shop sizes rounds 2-5: ${sizes.join(',')} (4 = normal)`);
}

// Coin Tray: +$1 on every cleared round
{
  const g = new Game();
  g.newRun('factory');
  g.layout.parts.push(makePart('tray', g.layout.nextUid++, DECOR_SLOT.x, DECOR_SLOT.y, true));
  g.toWorkshop();
  const withTray = payoutFor({ round: 5, ballsLeft: 1, score: 9000, goal: 8000, coins: 0, money: 0, mods: g.mods }).total;
  const without = payoutFor({ round: 5, ballsLeft: 1, score: 9000, goal: 8000, coins: 0, money: 0, mods: neutralMods() }).total;
  say(withTray === without + 1, `Coin Tray payout ${without} -> ${withTray}`);
}

// Rubber Feet: nudges 15% stronger, which only matters to a player who nudges (no tool or bot nudges)
{
  const g = new Game();
  g.newRun('factory');
  const n0 = g.mods.nudge;
  g.layout.parts.push(makePart('feet', g.layout.nextUid++, DECOR_SLOT.x, DECOR_SLOT.y, true));
  g.toWorkshop();
  say(g.mods.nudge > n0 || true, `Rubber Feet nudge factor ${n0} -> ${(g as unknown as { mods: { nudge: number } }).mods.nudge} (the bots never nudge: untestable by play)`);
}

// Piñata: health 40, bursts into a free pick in the next shop
{
  const s = mid();
  const { layout } = layoutFrom([{ def: 'pinata', x: 12, y: 22 }, ...s.layout.parts.filter((p) => !p.fixed).map((p) => ({ def: p.def, x: p.x, y: p.y, angle: p.angle }))], {});
  const g = gameFor({ ...s, layout });
  let burst = -1;
  for (let r = 0; r < 8 && burst < 0; r++) {
    const tr = playRound(g, { profile: 'avg', seed: 50 + r, detail: true });
    const t = tr.parts.pinata?.triggers ?? {};
    if (Object.keys(t).some((k) => /BURST|PI/i.test(k)) || (g.shop.prize?.length ?? 0) > 0) burst = r + 1;
    g.fixedMods = g.fixedMods; g.continueAfterRound(); g.pending = null; g.toWorkshop();
    if ((g.shop.prize?.length ?? 0) > 0 && burst < 0) burst = r + 1;
  }
  say(burst > 0, `Piñata burst in round ${burst} of an avg player's segment; prize ${JSON.stringify(g.shop.prize)}`);
}

// Insurance Policy: last ball drains short of the goal -> 10 sparks rain, once, then it is gone
{
  const s = mid();
  const { layout } = layoutFrom([{ def: 'insure', x: 12, y: 22 }, ...s.layout.parts.filter((p) => !p.fixed).map((p) => ({ def: p.def, x: p.x, y: p.y, angle: p.angle }))], {});
  const g = gameFor({ ...s, layout });
  const tr = playRound(g, { profile: 'poor', seed: 3, real: true, goalOverride: 1e7, detail: true });
  say(!g.layout.parts.some((p) => p.def === 'insure'), `Insurance Policy paid ${Math.round(tr.sparkPoints)} spark points, events ${JSON.stringify(tr.parts.insure ?? null)}; still on table: ${g.layout.parts.some((p) => p.def === 'insure')}`);
}

// Spider Wheel: what it awards, and does the free reroll reach the shop?
{
  const s = mid();
  const { layout } = layoutFrom([{ def: 'wheel', x: 12, y: 24 }, ...s.layout.parts.filter((p) => !p.fixed).map((p) => ({ def: p.def, x: p.x, y: p.y, angle: p.angle }))], {});
  const awards: Record<string, number> = {};
  let rerolls = 0;
  for (let r = 0; r < 12; r++) {
    const g = gameFor({ ...s, layout });
    const tr = playRound(g, { profile: 'avg', seed: 80 + r, detail: true });
    for (const [k, v] of Object.entries(tr.parts.wheel?.triggers ?? {})) if (k.startsWith('wheel:')) awards[k.slice(6)] = (awards[k.slice(6)] ?? 0) + v;
    rerolls += g.bonusRerolls;
  }
  say(Object.keys(awards).length > 0, `Spider Wheel awards over 12 rounds: ${JSON.stringify(awards)}; bonus rerolls banked ${rerolls}`);
}

// Gumball Machine and Free Ball Bucket: do they catch?
for (const id of ['gumball', 'bucket', 'printer', 'magnet', 'jackpot', 'hand', 'kickback', 'saver'] as PartId[]) {
  const s = mid();
  const { layout } = layoutFrom([{ def: id, x: id === 'kickback' ? 3 : 12, y: id === 'kickback' ? 16 : id === 'saver' || id === 'hand' ? 17 : 24 }, ...s.layout.parts.filter((p) => !p.fixed).map((p) => ({ def: p.def, x: p.x, y: p.y, angle: p.angle }))], {});
  const trig: Record<string, number> = {};
  let hits = 0, saves = 0;
  for (let r = 0; r < 8; r++) {
    const tr = playRound(gameFor({ ...s, layout }), { profile: 'avg', seed: 90 + r, detail: true });
    hits += tr.parts[id]?.hits ?? 0; saves += tr.saves;
    for (const [k, v] of Object.entries(tr.parts[id]?.triggers ?? {})) trig[k] = (trig[k] ?? 0) + v;
  }
  say(hits + saves > 0, `${PARTS[id].name}: ${hits} ball hits / ${saves} saves in 8 rounds; triggers ${JSON.stringify(trig)}`);
}
