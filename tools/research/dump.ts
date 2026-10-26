import { PARTS, SHOP_IDS, rarityOdds } from '../../src/data/parts';
import { DECALS } from '../../src/data/decals';
import { BOSSES } from '../../src/data/bosses';
for (const id of Object.keys(PARTS)) {
  const p: any = (PARTS as any)[id];
  const r = { ...p.recipe };
  console.log(`${id}|${p.name}|${p.rarity}|$${p.cost}|w${p.weight}|${p.kind}|from${p.from ?? 0}|pack${p.pack ?? 1}|${JSON.stringify(r)}`);
}
console.log('---DECALS');
for (const [id, d] of Object.entries(DECALS as any)) console.log(`${id}|${(d as any).name}|${(d as any).kind}|${(d as any).text ?? (d as any).blurb ?? ''}`);
console.log('---BOSSES');
for (const [id, d] of Object.entries(BOSSES as any)) console.log(`${id}|${(d as any).name}|${(d as any).final ? 'FINAL' : ''}|${(d as any).text ?? (d as any).blurb ?? ''}`);
console.log('---ODDS');
for (const r of [1,3,4,6,7,9,12,15]) console.log(r, JSON.stringify(rarityOdds(r)));
