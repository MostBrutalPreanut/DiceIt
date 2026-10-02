import { COMBO_BY_ID, matchingCombos, resolveFamilies } from "../content/combos.js";
import type { Die, RollEvent, RollResult } from "./types.js";
import type { Rng } from "./rng.js";

/** Throw every die with the given RNG and score it. Pure: no run state touched. */
export function rollDice(dice: readonly Die[], comboLevels: Readonly<Record<string, number>>, rng: Rng): RollResult {
  const values = dice.map((d) => d.faces[rng.int(d.faces.length)] as number);
  return scoreValues(dice, values, comboLevels);
}

/** Score a set of already-decided values (also used by tests and the bot's estimates). */
export function scoreValues(
  dice: readonly Die[],
  values: number[],
  comboLevels: Readonly<Record<string, number>>,
): RollResult {
  const events: RollEvent[] = dice.map((d, i) => ({ type: "landed", dieId: d.id, value: values[i] as number }));
  const base = values.reduce((a, b) => a + b, 0);
  const ctx = {
    values,
    maxFaces: dice.map((d) => Math.max(...d.faces)),
    total: base,
  };

  let chips = 0;
  let mult = 0;
  const combos: { id: string; level: number }[] = [];
  for (const def of resolveFamilies(matchingCombos(ctx))) {
    const level = comboLevels[def.id] ?? 1;
    const c = def.baseChips + def.chipsPerLevel * (level - 1);
    const m = def.baseMult + def.multPerLevel * (level - 1);
    chips += c;
    mult += m;
    combos.push({ id: def.id, level });
    events.push({ type: "combo", comboId: def.id, level, chips: c, mult: m });
  }

  const score = Math.floor((base + chips) * (1 + mult));
  events.push({ type: "score", base, chips, mult, total: score });
  return { values, base, chips, mult, score, combos, events };
}

export function comboName(id: string): string {
  return COMBO_BY_ID[id]?.name ?? id;
}
