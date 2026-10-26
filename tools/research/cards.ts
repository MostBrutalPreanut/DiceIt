import { writeFileSync } from 'node:fs';
import { describe, PARTS } from '../../src/data/parts';
import { DECALS } from '../../src/data/decals';
import { BOSSES } from '../../src/data/bosses';
/** The in-game card text of every part, decal and boss, as JSON (for the decision board). */
const out: Record<string, { name: string; kind: string; rarity?: string; cost?: number; card: string }> = {};
for (const [id, d] of Object.entries(PARTS)) {
  const lines = describe(d).map((l: unknown) => (typeof l === 'string' ? l : (l as { text?: string }).text ?? JSON.stringify(l)));
  out['part:' + id] = { name: d.name, kind: 'part', rarity: d.rarity, cost: d.cost, card: [d.blurb, ...lines].join(' ') };
}
for (const [id, d] of Object.entries(DECALS)) out['decal:' + id] = { name: d.name, kind: 'decal', rarity: d.rarity, card: d.text(undefined as never) };
for (const [id, d] of Object.entries(BOSSES)) out['boss:' + id] = { name: d.name, kind: 'boss', card: d.text };
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(out['part:wheel'].card, '\n', out['part:deflector'].card, '\n', out['decal:afterglow'].card);
