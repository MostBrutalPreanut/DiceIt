import { PARTS, footprint } from '../../src/data/parts';
import { starterLayout } from '../../src/sim/layout';
import { DECOR_SLOT } from '../../src/sim/cabinet';
const l = starterLayout();
console.log('starter', JSON.stringify(l.parts.map(p => [p.def, p.x, p.y])), 'decor', JSON.stringify(DECOR_SLOT));
console.log(Object.values(PARTS).map(p => `${p.id}:${footprint(p).toFixed(2)}${p.rotatable ? 'R' : ''}${p.kind==='strip'?'F':''}${p.dials.length ? '[' + p.dials.map(d => d.id + ' ' + d.min + '-' + d.max).join(';') + ']' : ''}`).join('  '));
