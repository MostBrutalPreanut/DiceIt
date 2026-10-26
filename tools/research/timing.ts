import { playRounds } from '../../src/game/autobuild';
import { starterLayout } from '../../src/sim/layout';
import { neutralMods } from '../../src/data/mods';
const l = starterLayout();
const t0 = performance.now();
const s = playRounds({ layout: l, mods: neutralMods(), machine: 'factory' }, { rounds: 4, seed: 1, skill: 0.6 });
const dt = performance.now() - t0;
const simSec = s.reduce((a, x) => a + x.seconds, 0);
console.log('wall ms', dt.toFixed(0), 'sim s', simSec.toFixed(0), 'speedup', (simSec * 1000 / dt).toFixed(1), 'scores', s.map(x => x.cumulative.join('/')).join(' '));
