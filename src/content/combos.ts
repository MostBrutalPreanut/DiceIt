import type { ComboContext, ComboDef, ComboRarity } from "../core/types.js";

// ---- helpers -------------------------------------------------------------

function counts(values: readonly number[]): number[] {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.values()].sort((a, b) => b - a);
}

/** Length of the longest run of consecutive distinct values. */
function longestRun(values: readonly number[]): number {
  const s = [...new Set(values)].sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  for (let i = 0; i < s.length; i++) {
    cur = i > 0 && s[i] === (s[i - 1] as number) + 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
  }
  return best;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

function strictly(values: readonly number[], dir: 1 | -1): boolean {
  for (let i = 1; i < values.length; i++) {
    if ((values[i] as number) * dir <= (values[i - 1] as number) * dir) return false;
  }
  return true;
}

// ---- table ---------------------------------------------------------------

type Row = Omit<ComboDef, "chipsPerLevel" | "multPerLevel" | "trainCost"> & {
  trainCost?: number;
};

const TRAIN_BY_RARITY: Record<ComboRarity, number> = {
  common: 30,
  uncommon: 45,
  rare: 70,
  epic: 110,
  legendary: 160,
};

function def(r: Row): ComboDef {
  return {
    ...r,
    chipsPerLevel: Math.max(1, Math.round(r.baseChips * 0.5)),
    multPerLevel: Math.round(r.baseMult * 50) / 100,
    trainCost: r.trainCost ?? TRAIN_BY_RARITY[r.rarity],
  };
}

const isOdd = (v: number) => v % 2 === 1;

export const COMBOS: ComboDef[] = [
  // Sets (family "sets": only the best fires)
  def({ id: "pair", name: "Pair", family: "sets", rank: 1, rarity: "common", minDice: 2, baseChips: 3, baseMult: 0.5,
    detect: (c) => counts(c.values)[0]! >= 2 }),
  def({ id: "two_pair", name: "Two Pair", family: "sets", rank: 2, rarity: "common", minDice: 4, baseChips: 5, baseMult: 1,
    detect: (c) => { const k = counts(c.values); return k[0]! >= 2 && (k[1] ?? 0) >= 2; } }),
  def({ id: "triple", name: "Triple", family: "sets", rank: 3, rarity: "common", minDice: 3, baseChips: 6, baseMult: 1.5,
    detect: (c) => counts(c.values)[0]! >= 3 }),
  def({ id: "full_house", name: "Full House", family: "sets", rank: 4, rarity: "uncommon", minDice: 5, baseChips: 10, baseMult: 2,
    detect: (c) => { const k = counts(c.values); return k[0]! >= 3 && (k[1] ?? 0) >= 2; } }),
  def({ id: "quad", name: "Four of a Kind", family: "sets", rank: 5, rarity: "uncommon", minDice: 4, baseChips: 12, baseMult: 3,
    detect: (c) => counts(c.values)[0]! >= 4 }),
  def({ id: "quint", name: "Five of a Kind", family: "sets", rank: 6, rarity: "rare", minDice: 5, baseChips: 20, baseMult: 5,
    detect: (c) => counts(c.values)[0]! >= 5 }),

  // Runs (family "runs")
  def({ id: "short_straight", name: "Short Straight", family: "runs", rank: 1, rarity: "common", minDice: 3, baseChips: 5, baseMult: 1,
    detect: (c) => longestRun(c.values) >= 3 }),
  def({ id: "straight", name: "Straight", family: "runs", rank: 2, rarity: "uncommon", minDice: 4, baseChips: 8, baseMult: 2,
    detect: (c) => longestRun(c.values) >= 4 }),
  def({ id: "big_straight", name: "Big Straight", family: "runs", rank: 3, rarity: "rare", minDice: 5, baseChips: 14, baseMult: 4,
    detect: (c) => longestRun(c.values) >= 5 }),

  // Parity
  def({ id: "even_steven", name: "Even Steven", family: "parity", rank: 1, rarity: "common", minDice: 2, baseChips: 4, baseMult: 0.5,
    detect: (c) => c.values.every((v) => v % 2 === 0) }),
  def({ id: "odd_squad", name: "Odd Squad", family: "parity", rank: 1, rarity: "common", minDice: 2, baseChips: 4, baseMult: 0.5,
    detect: (c) => c.values.every(isOdd) }),

  // Extremes
  def({ id: "snake_eyes", name: "Snake Eyes", rank: 0, rarity: "common", minDice: 2, baseChips: 3, baseMult: 0.5,
    detect: (c) => c.values.filter((v) => v === 1).length === 2 }),
  def({ id: "box_cars", name: "Box Cars", rank: 0, rarity: "common", minDice: 2, baseChips: 3, baseMult: 0.5,
    detect: (c) => c.values.filter((v, i) => v === c.maxFaces[i]).length === 2 }),

  // Sums (each fires independently)
  def({ id: "lucky_seven", name: "Lucky Seven", rank: 0, rarity: "common", minDice: 2, baseChips: 7, baseMult: 1,
    detect: (c) => c.total === 7 }),
  def({ id: "perfect_ten", name: "Perfect Ten", rank: 0, rarity: "common", minDice: 2, baseChips: 5, baseMult: 0.5,
    detect: (c) => c.total === 10 }),
  def({ id: "blackjack", name: "Blackjack", rank: 0, rarity: "uncommon", minDice: 3, baseChips: 10, baseMult: 2,
    detect: (c) => c.total === 21 }),
  def({ id: "prime_time", name: "Prime Time", rank: 0, rarity: "common", minDice: 1, baseChips: 2, baseMult: 0.25,
    detect: (c) => isPrime(c.total) }),

  // Position / order
  def({ id: "staircase_up", name: "Staircase Up", family: "order", rank: 1, rarity: "rare", minDice: 3, baseChips: 8, baseMult: 2,
    detect: (c) => strictly(c.values, 1) }),
  def({ id: "staircase_down", name: "Staircase Down", family: "order", rank: 1, rarity: "rare", minDice: 3, baseChips: 8, baseMult: 2,
    detect: (c) => strictly(c.values, -1) }),

  // Spectrum
  def({ id: "full_spectrum", name: "Full Spectrum", rank: 0, rarity: "rare", minDice: 4, baseChips: 10, baseMult: 2,
    detect: (c) => new Set(c.values).size === c.values.length }),
];

export const COMBO_BY_ID: Record<string, ComboDef> = Object.fromEntries(COMBOS.map((c) => [c.id, c]));

/** All combos whose detector matches, before family resolution. */
export function matchingCombos(ctx: ComboContext): ComboDef[] {
  const n = ctx.values.length;
  return COMBOS.filter((c) => n >= c.minDice && c.detect(ctx));
}

/** Family resolution: within a family only the highest rank survives (ties all survive). */
export function resolveFamilies(matches: ComboDef[]): ComboDef[] {
  const best = new Map<string, number>();
  for (const m of matches) {
    if (m.family) best.set(m.family, Math.max(best.get(m.family) ?? -Infinity, m.rank));
  }
  return matches.filter((m) => !m.family || m.rank === best.get(m.family));
}
