import { COMBOS } from "../content/combos.js";
import { DEFAULT_CONFIG } from "../content/config.js";
import { Rng, seedFrom } from "./rng.js";
import { rollDice } from "./roll.js";
import type { Die, GameConfig, Purchase, RollResult, RunState } from "./types.js";

// ---- creation ------------------------------------------------------------

export function newDie(id: number, sides: number): Die {
  return { id, faces: Array.from({ length: sides }, (_, i) => i + 1) };
}

export function createRun(seed: string | number, config: GameConfig = DEFAULT_CONFIG): RunState {
  const dice: Die[] = [];
  for (let i = 0; i < config.startDice; i++) dice.push(newDie(i, config.sides));
  const run: RunState = {
    seed: seedFrom(seed),
    rngState: seedFrom(seed),
    config,
    dice,
    nextDieId: dice.length,
    comboLevels: {},
    coins: 0,
    roundIndex: 0,
    phase: "round",
    round: null,
    shopCombos: [],
    stats: { rolls: 0, comboTriggers: {}, rollsByDiceCount: {}, comboByDiceCount: {}, purchases: {} },
  };
  startRound(run);
  return run;
}

const rngOf = (run: RunState) => new Rng(run.rngState);
const saveRng = (run: RunState, rng: Rng) => {
  run.rngState = rng.state;
};

// ---- rounds ----------------------------------------------------------------

export function totalRounds(c: GameConfig): number {
  return c.stages * c.roundsPerStage;
}

export function isBossRound(c: GameConfig, roundIndex: number): boolean {
  return roundIndex % c.roundsPerStage === c.roundsPerStage - 1;
}

export function targetFor(c: GameConfig, roundIndex: number): number {
  const t = c.targetBase * Math.pow(c.targetGrowth, roundIndex);
  return Math.round(isBossRound(c, roundIndex) ? t * c.bossTargetMult : t);
}

export function startRound(run: RunState): void {
  const c = run.config;
  run.phase = "round";
  run.round = {
    target: targetFor(c, run.roundIndex),
    rollsLeft: c.rollsPerRound,
    rollsTotal: c.rollsPerRound,
    rollsUsed: 0,
    score: 0,
  };
}

/** Throw the dice. Ends the round automatically when rolls run out. */
export function roll(run: RunState): RollResult {
  if (run.phase !== "round" || !run.round) throw new Error("not in a round");
  if (run.round.rollsLeft <= 0) throw new Error("no rolls left");
  const rng = rngOf(run);
  const res = rollDice(run.dice, run.comboLevels, rng);
  saveRng(run, rng);

  run.round.rollsLeft--;
  run.round.rollsUsed++;
  run.round.score += res.score;

  const n = run.dice.length;
  const s = run.stats;
  s.rolls++;
  s.rollsByDiceCount[n] = (s.rollsByDiceCount[n] ?? 0) + 1;
  const byN = (s.comboByDiceCount[n] ??= {});
  for (const c of res.combos) {
    s.comboTriggers[c.id] = (s.comboTriggers[c.id] ?? 0) + 1;
    byN[c.id] = (byN[c.id] ?? 0) + 1;
  }

  if (run.round.rollsLeft === 0) finishRound(run);
  return res;
}

export function canBank(run: RunState): boolean {
  return run.phase === "round" && !!run.round && run.round.score >= run.round.target;
}

/** Resolve the round: pay out and move to shop/won, or lose. Called by roll() when rolls run out, or by the player to bank early. */
export function finishRound(run: RunState): void {
  if (run.phase !== "round" || !run.round) throw new Error("not in a round");
  const c = run.config;
  const r = run.round;
  if (r.score < r.target) {
    run.phase = "lost";
    return;
  }
  const overkill = Math.min(c.overkillCap, Math.floor(((r.score - r.target) / r.target) * c.overkillRate));
  run.coins += c.clearPayoutBase + c.clearPayoutPerRound * run.roundIndex + c.coinPerSpareRoll * r.rollsLeft + overkill;
  run.roundIndex++;
  if (run.roundIndex >= totalRounds(c)) {
    run.phase = "won";
    return;
  }
  run.phase = "shop";
  const rng = rngOf(run);
  run.shopCombos = rng
    .sample(COMBOS.filter((d) => run.dice.length >= Math.min(d.minDice, c.maxDice)), c.shopComboOffers)
    .map((d) => d.id);
  saveRng(run, rng);
}

// ---- shop ------------------------------------------------------------------

export function listPurchases(run: RunState): Purchase[] {
  if (run.phase !== "shop") return [];
  const c = run.config;
  const out: Purchase[] = [];

  for (const d of run.dice) {
    d.faces.forEach((v, faceIndex) => {
      out.push({ kind: "upgradeFace", dieId: d.id, faceIndex, cost: c.upgradeCostPerValue * v });
    });
  }
  if (run.dice.length < c.maxDice) {
    out.push({ kind: "buyDie", cost: c.dicePrices[run.dice.length - 1] ?? Infinity });
  }
  for (const id of run.shopCombos) {
    const def = COMBOS.find((d) => d.id === id)!;
    const level = run.comboLevels[id] ?? 1;
    if (level >= c.maxComboLevel) continue;
    out.push({ kind: "levelCombo", comboId: id, cost: def.trainCost * level });
  }
  return out.filter((p) => Number.isFinite(p.cost) && p.cost <= run.coins);
}

export function applyPurchase(run: RunState, p: Purchase): void {
  if (run.phase !== "shop") throw new Error("not in shop");
  if (p.cost > run.coins) throw new Error("cannot afford");
  run.coins -= p.cost;
  run.stats.purchases[p.kind] = (run.stats.purchases[p.kind] ?? 0) + 1;
  if (p.kind === "upgradeFace") {
    const d = run.dice.find((x) => x.id === p.dieId)!;
    d.faces[p.faceIndex] = (d.faces[p.faceIndex] as number) + 1;
  } else if (p.kind === "buyDie") {
    run.dice.push(newDie(run.nextDieId++, run.config.sides));
  } else {
    run.comboLevels[p.comboId] = (run.comboLevels[p.comboId] ?? 1) + 1;
  }
}

export function leaveShop(run: RunState): void {
  if (run.phase !== "shop") throw new Error("not in shop");
  startRound(run);
}
