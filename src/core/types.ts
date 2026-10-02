export interface Die {
  id: number;
  /** Face values. M0 has number faces only; specials arrive in a later milestone. */
  faces: number[];
}

export interface ComboContext {
  /** Final rolled values, in tray order (left to right). */
  values: readonly number[];
  /** Highest face value on each die (same order as `values`). */
  maxFaces: readonly number[];
  total: number;
}

export type ComboRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface ComboDef {
  id: string;
  name: string;
  /** Only the highest-`rank` matching combo of a family fires. No family = always fires independently. */
  family?: string;
  rank: number;
  rarity: ComboRarity;
  minDice: number;
  baseChips: number;
  baseMult: number;
  /** Added per level above 1. */
  chipsPerLevel: number;
  multPerLevel: number;
  /** Base coin cost of one "Combo Training" purchase at level 1 -> 2. */
  trainCost: number;
  detect: (ctx: ComboContext) => boolean;
}

export type RollEvent =
  | { type: "landed"; dieId: number; value: number }
  | { type: "combo"; comboId: string; level: number; chips: number; mult: number }
  | { type: "score"; base: number; chips: number; mult: number; total: number };

export interface RollResult {
  values: number[];
  base: number;
  chips: number;
  mult: number;
  score: number;
  combos: { id: string; level: number }[];
  /** Ordered event stream: the contract between core and (future) view. */
  events: RollEvent[];
}

export type Purchase =
  | { kind: "upgradeFace"; dieId: number; faceIndex: number; cost: number }
  | { kind: "buyDie"; cost: number }
  | { kind: "levelCombo"; comboId: string; cost: number };

export type Phase = "round" | "shop" | "won" | "lost";

export interface RunState {
  seed: number;
  rngState: number;
  config: GameConfig;
  dice: Die[];
  nextDieId: number;
  comboLevels: Record<string, number>;
  coins: number;
  /** 0-based index of the current/next round. */
  roundIndex: number;
  phase: Phase;
  round: {
    target: number;
    rollsLeft: number;
    rollsTotal: number;
    score: number;
    rollsUsed: number;
  } | null;
  /** Combo ids offered for training in the current shop. */
  shopCombos: string[];
  stats: RunStats;
}

export interface RunStats {
  rolls: number;
  comboTriggers: Record<string, number>;
  /** comboTriggers bucketed by dice count: diceCount -> comboId -> count; plus rolls per dice count. */
  rollsByDiceCount: Record<number, number>;
  comboByDiceCount: Record<number, Record<string, number>>;
  purchases: Record<string, number>;
}

export interface GameConfig {
  stages: number;
  roundsPerStage: number;
  rollsPerRound: number;
  startDice: number;
  maxDice: number;
  /** Round target = round(targetBase * targetGrowth^roundIndex), times bossTargetMult on boss rounds. */
  targetBase: number;
  targetGrowth: number;
  bossTargetMult: number;
  /** Coins paid on clear. */
  clearPayoutBase: number;
  clearPayoutPerRound: number;
  coinPerSpareRoll: number;
  /** Overkill coins = min(overkillCap, floor((score-target)/target * overkillRate)). */
  overkillRate: number;
  overkillCap: number;
  /** Face upgrade cost = upgradeCostPerValue * current face value. */
  upgradeCostPerValue: number;
  /** Price of the (n+1)th die, indexed by how many dice you own - 1. */
  dicePrices: number[];
  shopComboOffers: number;
  maxComboLevel: number;
  /** Faces on a new die. */
  sides: number;
}
