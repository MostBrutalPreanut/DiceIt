import { buildLayout, loadSpecs, variantSpec } from './buildlib';
import { DECALS } from '../../src/data/decals';
for (const s of loadSpecs(process.argv[2])) {
  const f = buildLayout(s), p = buildLayout(variantSpec(s, 'partial'));
  const badDecals = s.decals.filter((d) => !DECALS[d.id as keyof typeof DECALS]).map((d) => d.id);
  console.log(`${s.id.padEnd(34)} ${s.machine.padEnd(7)} parts ${s.parts.length} placed ${f.layout.parts.filter((x) => x.placed && !x.fixed).length} moved ${f.moved} missing [${f.missing}] cost $${f.cost} | partial $${p.cost} decals ${s.decals.map((d) => d.id + (d.target ? ':' + d.target : '')).join(',')}${badDecals.length ? ' BAD ' + badDecals : ''} decor ${s.decor}`);
}
