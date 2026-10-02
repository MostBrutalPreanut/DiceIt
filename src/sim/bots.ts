import { COMBO_BY_ID } from "../content/combos.js";
import { Rng } from "../core/rng.js";
import { rollDice } from "../core/roll.js";
import { applyPurchase, listPurchases } from "../core/run.js";
import type { Die, Purchase, RunState } from "../core/types.js";

/** A policy decides what to buy in the shop (null = leave). Rolling is handled by the runner. */
export interface Policy {
  name: string;
  chooseShop(run: RunState, rng: Rng): Purchase | null;
}

/** Buys random affordable things until broke. The "floor": if this wins often, the game is too easy. */
export const randomPolicy: Policy = {
  name: "random",
  chooseShop(run, rng) {
    const options = listPurchases(run);
    return options.length ? rng.pick(options) : null;
  },
};

/** Mean score of one roll for a dice/levels configuration, with common random numbers so candidates compare fairly. */
function expectedRoll(dice: readonly Die[], levels: Record<string, number>, samples: number): number {
  const rng = new Rng(12345);
  let sum = 0;
  for (let i = 0; i < samples; i++) sum += rollDice(dice, levels, rng).score;
  return sum / samples;
}

function cloneDice(dice: readonly Die[]): Die[] {
  return dice.map((d) => ({ id: d.id, faces: [...d.faces] }));
}

/** Gain in expected-roll-score per coin, estimated by Monte Carlo. A reasonable "competent but not clever" player. */
export function makeGreedyPolicy(samples = 150): Policy {
  return {
    name: "greedy",
    chooseShop(run) {
      const options = listPurchases(run);
      if (!options.length) return null;
      const before = expectedRoll(run.dice, run.comboLevels, samples);
      let best: Purchase | null = null;
      let bestRatio = 0;
      for (const p of options) {
        const dice = cloneDice(run.dice);
        const levels = { ...run.comboLevels };
        if (p.kind === "upgradeFace") {
          const d = dice.find((x) => x.id === p.dieId)!;
          d.faces[p.faceIndex] = (d.faces[p.faceIndex] as number) + 1;
        } else if (p.kind === "buyDie") {
          dice.push({ id: -1, faces: Array.from({ length: run.config.sides }, (_, i) => i + 1) });
        } else {
          levels[p.comboId] = (levels[p.comboId] ?? 1) + 1;
        }
        const ratio = (expectedRoll(dice, levels, samples) - before) / p.cost;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = p;
        }
      }
      return best;
    },
  };
}

export const POLICIES: Record<string, () => Policy> = {
  random: () => randomPolicy,
  greedy: () => makeGreedyPolicy(),
};

export { applyPurchase, COMBO_BY_ID };
