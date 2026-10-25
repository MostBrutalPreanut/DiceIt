import { launchSpread } from './spread';

const r = launchSpread(Number(process.argv[2] ?? 300));
console.log(`${r.launches} launches, ${r.weak} fell back (weak plunge), ${r.inPlay} entered play`);
console.log(`x at first crossing y=${r.yMid}, left wall -> right wall (${r.histo.length} bins):`);
console.log(r.histo.map((n) => `${Math.round(100 * n)}%`.padStart(5)).join(' '));
console.log(`busiest bin: ${Math.round(100 * r.busiest)}%   balls that touched a part: ${Math.round(100 * r.touched)}%   avg part hits: ${r.avgHits.toFixed(2)}   avg life: ${r.avgLife.toFixed(1)}s`);
