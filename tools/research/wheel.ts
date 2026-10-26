import { gameFor, layoutFrom, playRound } from './lib';
import { mid } from './tables';
const s = mid();
const { layout } = layoutFrom([{ def: 'wheel', x: 12, y: 24 }, ...s.layout.parts.filter((p) => !p.fixed).map((p) => ({ def: p.def, x: p.x, y: p.y, angle: p.angle }))]);
for (const prof of ['pro', 'avg', 'poor']) {
  const awards: Record<string, number> = {}; let sc = 0;
  for (let r = 0; r < 8; r++) { const tr = playRound(gameFor({ ...s, layout }), { profile: prof, seed: 80 + r, detail: true }); sc += tr.score; for (const [k, v] of Object.entries(tr.parts.wheel?.triggers ?? {})) if (k.startsWith('wheel:')) awards[k.slice(6)] = (awards[k.slice(6)] ?? 0) + v; }
  console.log(prof, 'mean score', Math.round(sc / 8), JSON.stringify(awards));
}
