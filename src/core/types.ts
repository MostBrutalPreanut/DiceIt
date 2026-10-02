/**
 * Faces are the unit of content. A die scores on its own: its face value, times any multiplier
 * handed to it by a neighbour. Some faces read other dice (echo, sum, crowd, mult).
 */
export type FaceKind =
  | "num" // scores `value` pips
  | "mult" // scores 0, multiplies the die to its RIGHT by `value`
  | "echo" // scores the final score of the die to its LEFT
  | "crowd" // scores `value` x (number of dice in the tray)
  | "sum" // scores the sum of every OTHER die's plain number face
  | "boom"; // scores `value`, then the die self-destructs (the last die in the tray is spared)

export interface Face {
  kind: FaceKind;
  value: number;
}

export interface Die {
  id: number;
  faces: Face[];
}

export type RollEvent =
  | { type: "landed"; dieId: number; face: Face }
  | { type: "die"; dieId: number; value: number; mult: number; score: number }
  | { type: "destroyed"; dieId: number }
  | { type: "score"; total: number };

export interface RollResult {
  faces: Face[];
  /** Per-die score, tray order. */
  scores: number[];
  score: number;
  destroyed: number[];
  /** Ordered event stream: the contract between core and (future) view. */
  events: RollEvent[];
}

export type SpecialRarity = "common" | "uncommon" | "rare";

export interface SpecialDef {
  id: string;
  name: string;
  rarity: SpecialRarity;
  cost: number;
  face: Face;
  text: string;
}

export type Purchase =
  | { kind: "upgradeFace"; dieId: number; faceIndex: number; cost: number }
  | { kind: "upgradeDie"; dieId: number; cost: number }
  | { kind: "buyDie"; cost: number }
  | { kind: "buyVolatile"; cost: number }
  | { kind: "buySpecial"; specialId: string; dieId: number; faceIndex: number; cost: number };

export type Phase = "round" | "shop" | "won" | "lost";

export interface RunStats {
  rolls: number;
  diceLost: number;
  /** How many times each non-number face kind landed. */
  faceLands: Record<string, number>;
  purchases: Record<string, number>;
  specialsBought: Record<string, number>;
}

export interface RunState {
  seed: number;
  rngState: number;
  config: GameConfig;
  dice: Die[];
  nextDieId: number;
  coins: number;
  /** 0-based index of the current/next round. */
  roundIndex: number;
  phase: Phase;
  round: { target: number; rollsLeft: number; rollsTotal: number; score: number; rollsUsed: number } | null;
  /** Special ids on offer in the current shop (shared across dice, one purchase each). */
  shopSpecials: string[];
  stats: RunStats;
}

export interface GameConfig {
  stages: number;
  roundsPerStage: number;
  rollsPerRound: number;
  startDice: number;
  maxDice: number;
  sides: number;

  /** Round target = round(targetBase * targetGrowth^roundIndex), times bossTargetMult on boss rounds. */
  targetBase: number;
  targetGrowth: number;
  bossTargetMult: number;

  /** Payout on clear, all as fractions of the round target so the economy scales with difficulty. */
  payoutFrac: number;
  sparePerRollFrac: number;
  /** Overkill coins = min(overkillCapFrac, (score-target)/target * overkillRateFrac) * target. */
  overkillRateFrac: number;
  overkillCapFrac: number;

  /** +1 to one face costs upgradeCostPerValue * current value. */
  upgradeCostPerValue: number;
  /** +1 to every number face on a die costs this fraction of buying them one by one. */
  upgradeDieDiscount: number;
  /** Price of a die when you own n dice = round(dieBasePrice * dieGrowth^(n-1)). */
  dieBasePrice: number;
  dieGrowth: number;
  /** Volatile die: faces 1..sides-1 plus a boom face worth boomValue, sold at this fraction of the normal price. */
  volatileDiscount: number;
  boomValue: number;
  shopSpecialOffers: number;
}
