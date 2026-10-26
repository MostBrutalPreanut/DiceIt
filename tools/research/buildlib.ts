import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makePart, PARTS, type PartId } from '../../src/data/parts';
import type { DecalPick } from '../../src/data/decals';
import type { BossId } from '../../src/data/bosses';
import type { MachineId } from '../../src/data/bigboi';
import { Game } from '../../src/game/game';
import { DECOR_SLOT } from '../../src/sim/cabinet';
import { cloneLayout, type Layout } from '../../src/sim/layout';
import { gameFor, layoutFrom, mean, place, playRound, pool, type SpecPart } from './lib';


/** Build specs from the build finder: loading, the partial variant, and the layout a spec stands for. */
export interface BuildSpec {
  id: string; archetype?: string; machine: MachineId; kind?: string; parts: SpecPart[]; decor?: PartId | null;
  decals: DecalPick[]; partial?: { dropParts?: PartId[]; keepDecals?: string[] };
}
export interface BuildTask { spec: BuildSpec; variant: 'full' | 'partial' | 'auto'; final: BossId; profile: string; seed: number; mode: 'segment' | 'clock'; endless: number }
export interface SegRound { round: number; goal: number; score: number; won: boolean; clearBall: number; ratio: number; peak: number; top: [string, number][]; sparkShare: number; zapShare: number; wallMs: number; worstStepMs: number; maxSparks: number; maxBalls: number; ballSeconds: number[] }
export interface BuildResult { task: Omit<BuildTask, 'spec'> & { id: string }; moved: number; missing: string[]; cost: number; rounds: SegRound[]; reachedFinal: boolean; beatFinal: boolean; lastWon: number; clock?: { on: number[]; off: number[]; offBalls: number[]; onBalls: number[]; offMarks: number[][] } }

export function variantSpec(spec: BuildSpec, variant: BuildTask['variant']): BuildSpec {
  if (variant !== 'partial') return spec;
  const drop = [...(spec.partial?.dropParts ?? [])];
  const parts = spec.parts.filter((p) => { const i = drop.indexOf(p.def); if (i >= 0) { drop.splice(i, 1); return false; } return true; });
  // a dropped part id named once drops every copy of it (packs and duplicates), as "never found it"
  const gone = new Set(spec.partial?.dropParts ?? []);
  const keep = new Set(spec.partial?.keepDecals ?? []);
  return { ...spec, parts: parts.filter((p) => !gone.has(p.def)), decor: spec.decor && gone.has(spec.decor) ? null : spec.decor, decals: spec.decals.filter((d) => keep.has(d.id)) };
}

/** The build's layout, with what a run would have grown by round 10 (Bonsai age, Trophy polish, well money). */
export function buildLayout(spec: BuildSpec): { layout: Layout; moved: number; missing: string[]; cost: number } {
  const { layout, moved, missing } = layoutFrom(spec.parts);
  if (spec.decor && PARTS[spec.decor]?.kind === 'decor') {
    layout.parts.push(makePart(spec.decor, layout.nextUid++, DECOR_SLOT.x, DECOR_SLOT.y, true));
  }
  for (const p of layout.parts) {
    if (PARTS[p.def].recipe.bonsai) p.age = 5;
    if (PARTS[p.def].recipe.keep) p.polish = 2.5;
    if (PARTS[p.def].recipe.well) p.well = 10;
  }
  const packs = new Map<string, number>();
  let cost = 0;
  for (const sp of spec.parts) {
    const d = PARTS[sp.def];
    if (!d) continue;
    const n = d.pack ?? 1;
    const k = (packs.get(sp.def) ?? 0) + 1;
    packs.set(sp.def, k);
    if ((k - 1) % n === 0) cost += d.cost;
    if (sp.inlay && PARTS[sp.inlay]) cost += PARTS[sp.inlay].cost;
  }
  if (spec.decor && PARTS[spec.decor]) cost += PARTS[spec.decor].cost;
  return { layout, moved, missing, cost };
}

export function loadSpecs(dir: string, ids?: string[]): BuildSpec[] {
  const specs: BuildSpec[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const arr = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as BuildSpec[];
    for (const s of arr) if (!ids || ids.includes(s.id)) specs.push({ ...s, parts: s.parts.filter((p) => PARTS[p.def]) });
  }
  return specs;
}

