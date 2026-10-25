import { writeFileSync } from 'node:fs';
import { neutralMods, type Mods } from '../src/data/mods';
import { makePart, PARTS, SHOP_IDS, type PartId } from '../src/data/parts';
import { autoBuild, playRounds, type Machine } from '../src/game/autobuild';
import { starterLayout } from '../src/sim/layout';

/**
 * Part power: what one shop offer of each part adds to a typical table, whatever the par player happens to buy.
 *   npx vite-node tools/power.ts [--parts=pop,coin] [--context=mid|late] [--rounds=16] [--out=file.json]
 * The table is a mid-run one (the starter Pops and Big Boi, a lane pack, two Slingshots, a Spinner, a Lamp). In
 * the `late` context every ball starts at ×3 Mult and the parts are level 3, as a late run is. Each part is
 * placed by the auto-builder, then the table is played out; the gain over the bare table is divided by the
 * part's price, so a cheap part and a dear one compare fairly.
 */
const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true'] as [string, string]; }));
const context = args.get('context') ?? 'mid';
const rounds = Number(args.get('rounds') ?? 16);
const ids = (args.get('parts')?.split(',') as PartId[] | undefined) ?? SHOP_IDS;

function baseMachine(): Machine {
  const l = starterLayout();
  const add = (id: PartId, x: number, y: number) => l.parts.push(makePart(id, l.nextUid++, x, y, true));
  add('lane', 9, 48.5); add('lane', 12, 49); add('lane', 15, 48.5);
  for (const p of l.parts.filter((q) => q.def === 'lane')) p.group = 100;
  add('sling', 4.4, 17.6); add('sling', 19.6, 17.6);
  l.parts.find((p) => p.def === 'sling' && p.x > 12)!.angle = 1.05;
  l.parts.find((p) => p.def === 'sling' && p.x < 12)!.angle = -1.05;
  add('spinner', 21.4, 24.5); add('lamp', 15.6, 29.6);
  const mods: Mods = neutralMods();
  if (context === 'late') {
    mods.startMult = 3;
    for (const p of l.parts) if (PARTS[p.def].recipe.perLevel) p.level = 3;
  }
  return { layout: l, mods, machine: 'factory' };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const play = (m: Machine, seed: number) => median(playRounds(m, { rounds, seed, skill: 0.6 }).map((s) => s.cumulative.at(-1)!));

// the bare table is laid out by hand; each part is only placed into it by the auto-builder, so the gain is the part's
const base = baseMachine();
const baseScore = play(base, 7);
const out: { id: PartId; cost: number; score: number; gain: number; perDollar: number }[] = [];
for (const id of ids) {
  const m: Machine = { ...base, layout: { ...base.layout, parts: base.layout.parts.map((p) => ({ ...p, dials: { ...p.dials } })) } };
  const n = PARTS[id].pack ?? 1;
  for (let k = 0; k < n; k++) {
    const p = makePart(id, m.layout.nextUid++);
    if (n > 1) p.group = 200;
    if (context === 'late' && PARTS[id].recipe.perLevel) p.level = 3;
    m.layout.parts.push(p);
  }
  const built = autoBuild(m, { seed: 11, skill: 0.6, evalRounds: 2, steps: 0, placeTries: 8 }).machine;
  const score = play(built, 7);
  const gain = score - baseScore;
  out.push({ id, cost: PARTS[id].cost, score, gain, perDollar: Math.round(gain / PARTS[id].cost) });
  console.log(`${context} ${id.padEnd(9)} $${String(PARTS[id].cost).padStart(2)}  ${String(score).padStart(8)}  gain ${String(gain).padStart(8)}  per $ ${String(Math.round(gain / PARTS[id].cost)).padStart(7)}`);
}
console.log(`${context} base ${baseScore}`);
if (args.get('out')) writeFileSync(args.get('out')!, JSON.stringify({ context, base: baseScore, parts: out }, null, 1));
