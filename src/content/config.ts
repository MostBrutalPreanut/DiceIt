import type { GameConfig } from "../core/types.js";

/** All numbers a designer will want to tweak live here (and in specials.ts). */
export const DEFAULT_CONFIG: GameConfig = {
  stages: 5,
  roundsPerStage: 3,
  rollsPerRound: 6,
  startDice: 1,
  maxDice: 16,
  sides: 6,

  targetBase: 14,
  targetGrowth: 1.25,
  bossTargetMult: 1.3,

  payoutFrac: 2.0,
  sparePerRollFrac: 0.12,
  overkillRateFrac: 0.4,
  overkillCapFrac: 0.4,

  upgradeCostPerValue: 6,
  upgradeDieDiscount: 0.85,
  dieBasePrice: 20,
  dieGrowth: 1.25,
  volatileDiscount: 0.4,
  boomValue: 30,
  shopSpecialOffers: 3,
};
