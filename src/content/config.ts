import type { GameConfig } from "../core/types.js";

/** All numbers a designer will want to tweak live here (and in combos.ts). */
export const DEFAULT_CONFIG: GameConfig = {
  stages: 5,
  roundsPerStage: 3,
  rollsPerRound: 6,
  startDice: 1,
  maxDice: 8,
  targetBase: 14,
  targetGrowth: 1.41,
  bossTargetMult: 1.35,
  clearPayoutBase: 40,
  clearPayoutPerRound: 18,
  coinPerSpareRoll: 6,
  overkillRate: 10,
  overkillCap: 40,
  upgradeCostPerValue: 6,
  dicePrices: [30, 80, 180, 400, 900, 2000, 4500],
  shopComboOffers: 3,
  maxComboLevel: 8,
  sides: 6,
};
