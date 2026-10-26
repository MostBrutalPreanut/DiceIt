import { writeFileSync } from 'node:fs';
import { buildLayout, loadSpecs } from './buildlib';
/** Write the layouts of some builds for the browser check. npx vite-node tools/research/dump-layouts.ts <dir> <out> id,id */
const specs = loadSpecs(process.argv[2], process.argv[4].split(','));
writeFileSync(process.argv[3], JSON.stringify(specs.map((s) => ({ id: s.id, machine: s.machine, decals: s.decals, layout: buildLayout(s).layout }))));
