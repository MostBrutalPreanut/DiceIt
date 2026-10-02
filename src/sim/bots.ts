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

function lowestNumFace(d: Die): number {
  let best = -1;
  d.faces.forEach((f, i) => {
    if (f.kind === "num" && (best < 0 || f.value < (d.faces[best]?.value ?? Infinity))) best = i;
  });
  return best;
}

/** Mean roll score, and mean dice lost per roll, with common random numbers so candidates compare fairly. */
function evaluate(dice: readonly Die[], samples: number): { mean: number; lost: number } {
  const rng = new Rng(12345);
  let sum = 0;
  let lost = 0;
  for (let i = 0; i < samples; i++) {
    const r = rollDice(dice, rng);
    sum += r.score;
    lost += r.destroyed.length;
  }
  return { mean: sum / samples, lost: lost / samples };
}

/**
 * "Competent but not clever": picks the purchase with the best gain in expected roll score per coin (Monte Carlo).
 * Self-destructing dice are charged for the dice they are expected to lose (`lossHorizon` rolls of that die's output).
 */
export function makeGreedyPolicy(samples = 60, lossHorizon = 6): Policy {
  const value = (dice: readonly Die[]) => {
    const { mean, lost } = evaluate(dice, samples);
    return mean - lost * (mean / Math.max(1, dice.length)) * lossHorizon;
  };
  return {
    name: "greedy",
    chooseShop(run) {
      const options = listPurchases(run).filter((p) => {
        // Prune: upgrading/replacing anything but a die's lowest number face is never better for the same cost.
        if (p.kind === "upgradeFace" || p.kind === "buySpecial") {
          const d = run.dice.find((x) => x.id === p.dieId)!;
          return p.faceIndex === lowestNumFace(d);
        }
        return true;
      });
      if (!options.length) return null;
      const before = value(run.dice);
      let best: Purchase | null = null;
      let bestRatio = 0;
      for (const p of options) {
        const tmp = structuredClone(run);
        tmp.coins = Number.MAX_SAFE_INTEGER;
        applyPurchase(tmp, p);
        const ratio = (value(tmp.dice) - before) / p.cost;
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
