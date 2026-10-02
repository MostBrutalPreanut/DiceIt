import { DEFAULT_CONFIG } from "../content/config.js";
import { Rng } from "../core/rng.js";
import { applyPurchase, canBank, createRun, finishRound, leaveShop, roll } from "../core/run.js";
import type { GameConfig, RunState } from "../core/types.js";
import type { Policy } from "./bots.js";

export interface PlayOptions {
  config?: GameConfig;
  /** Bank the round as soon as the target is hit (default true). */
  bankEarly?: boolean;
}

export interface RunResult {
  won: boolean;
  /** Rounds cleared (0..total). */
  roundsCleared: number;
  coins: number;
  dice: number;
  rolls: number;
  /** Dice owned at the start of each round played. */
  diceByRound: number[];
  /** score/target of each round played (>=1 means cleared). */
  ratioByRound: number[];
  run: RunState;
}

/** Play one full run headlessly. Deterministic for (seed, policy, options). */
export function playRun(seed: string | number, policy: Policy, opts: PlayOptions = {}): RunResult {
  const run = createRun(seed, opts.config ?? DEFAULT_CONFIG);
  const botRng = new Rng(run.seed ^ 0x9e3779b9);
  const bankEarly = opts.bankEarly ?? true;
  const diceByRound: number[] = [];
  const ratioByRound: number[] = [];

  while (run.phase === "round" || run.phase === "shop") {
    if (run.phase === "round") {
      diceByRound.push(run.dice.length);
      while (run.phase === "round") {
        roll(run);
        if (run.phase === "round" && bankEarly && canBank(run)) finishRound(run);
      }
      ratioByRound.push(run.round!.score / run.round!.target);
    } else {
      for (let p = policy.chooseShop(run, botRng); p; p = policy.chooseShop(run, botRng)) applyPurchase(run, p);
      leaveShop(run);
    }
  }
  return { won: run.phase === "won", roundsCleared: run.roundIndex, coins: run.coins, dice: run.dice.length, rolls: run.stats.rolls, diceByRound, ratioByRound, run };
}
