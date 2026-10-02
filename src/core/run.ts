import { SPECIALS, SPECIAL_BY_ID } from "../content/specials.js";
import { DEFAULT_CONFIG } from "../content/config.js";
import { Rng, seedFrom } from "./rng.js";
import { rollDice } from "./roll.js";
import type { Die, Face, GameConfig, Purchase, RollResult, RunState } from "./types.js";

// ---- dice ------------------------------------------------------------------

export function newDie(id: number, sides: number): Die {
  return { id, faces: Array.from({ length: sides }, (_, i) => ({ kind: "num", value: i + 1 }) as Face) };
}

/** Faces 1..sides-1 plus a boom face. */
export function newVolatileDie(id: number, sides: number, boomValue: number): Die {
  const d = newDie(id, sides);
  d.faces[sides - 1] = { kind: "boom", value: boomValue };
  return d;
}

export function dicePrice(c: GameConfig, owned: number): number {
  return Math.round(c.dieBasePrice * Math.pow(c.dieGrowth, Math.max(0, owned - 1)));
}

export function faceUpgradeCost(c: GameConfig, f: Face): number {
  return f.kind === "num" ? c.upgradeCostPerValue * f.value : Infinity;
}

export function dieUpgradeCost(c: GameConfig, d: Die): number {
  const sum = d.faces.reduce((a, f) => a + (f.kind === "num" ? faceUpgradeCost(c, f) : 0), 0);
  return Math.round(sum * c.upgradeDieDiscount);
}

// ---- creation --------------------------------------------------------------

export function createRun(seed: string | number, config: GameConfig = DEFAULT_CONFIG): RunState {
  const dice: Die[] = [];
  for (let i = 0; i < config.startDice; i++) dice.push(newDie(i, config.sides));
  const run: RunState = {
    seed: seedFrom(seed),
    rngState: seedFrom(seed),
    config,
    dice,
    nextDieId: dice.length,
    coins: 0,
    roundIndex: 0,
    phase: "round",
    round: null,
    shopSpecials: [],
    stats: { rolls: 0, diceLost: 0, faceLands: {}, purchases: {}, specialsBought: {} },
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
  run.round = { target: targetFor(c, run.roundIndex), rollsLeft: c.rollsPerRound, rollsTotal: c.rollsPerRound, rollsUsed: 0, score: 0 };
}

/** Throw the dice. Ends the round automatically when rolls run out. */
export function roll(run: RunState): RollResult {
  if (run.phase !== "round" || !run.round) throw new Error("not in a round");
  if (run.round.rollsLeft <= 0) throw new Error("no rolls left");
  const rng = rngOf(run);
  const res = rollDice(run.dice, rng);
  saveRng(run, rng);

  run.round.rollsLeft--;
  run.round.rollsUsed++;
  run.round.score += res.score;

  const s = run.stats;
  s.rolls++;
  for (const f of res.faces) if (f.kind !== "num") s.faceLands[f.kind] = (s.faceLands[f.kind] ?? 0) + 1;
  if (res.destroyed.length) {
    run.dice = run.dice.filter((d) => !res.destroyed.includes(d.id));
    s.diceLost += res.destroyed.length;
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
  const over = Math.min(c.overkillCapFrac, ((r.score - r.target) / r.target) * c.overkillRateFrac);
  run.coins += Math.round(r.target * (c.payoutFrac + c.sparePerRollFrac * r.rollsLeft + over));
  run.roundIndex++;
  if (run.roundIndex >= totalRounds(c)) {
    run.phase = "won";
    return;
  }
  run.phase = "shop";
  const rng = rngOf(run);
  run.shopSpecials = rng.sample(SPECIALS, c.shopSpecialOffers).map((d) => d.id);
  saveRng(run, rng);
}

// ---- shop ------------------------------------------------------------------

/** Every affordable purchase. (A real UI would also let the player choose which face a special replaces.) */
export function listPurchases(run: RunState): Purchase[] {
  if (run.phase !== "shop") return [];
  const c = run.config;
  const out: Purchase[] = [];

  for (const d of run.dice) {
    d.faces.forEach((f, faceIndex) => {
      if (f.kind === "num") out.push({ kind: "upgradeFace", dieId: d.id, faceIndex, cost: faceUpgradeCost(c, f) });
    });
    if (d.faces.some((f) => f.kind === "num")) out.push({ kind: "upgradeDie", dieId: d.id, cost: dieUpgradeCost(c, d) });
    for (const sid of run.shopSpecials) {
      const def = SPECIAL_BY_ID[sid]!;
      d.faces.forEach((_, faceIndex) => out.push({ kind: "buySpecial", specialId: sid, dieId: d.id, faceIndex, cost: def.cost }));
    }
  }
  if (run.dice.length < c.maxDice) {
    const price = dicePrice(c, run.dice.length);
    out.push({ kind: "buyDie", cost: price });
    out.push({ kind: "buyVolatile", cost: Math.round(price * c.volatileDiscount) });
  }
  return out.filter((p) => p.cost <= run.coins);
}

export function applyPurchase(run: RunState, p: Purchase): void {
  if (run.phase !== "shop") throw new Error("not in shop");
  if (p.cost > run.coins) throw new Error("cannot afford");
  const c = run.config;
  run.coins -= p.cost;
  run.stats.purchases[p.kind] = (run.stats.purchases[p.kind] ?? 0) + 1;
  switch (p.kind) {
    case "upgradeFace": {
      const f = run.dice.find((d) => d.id === p.dieId)!.faces[p.faceIndex]!;
      f.value += 1;
      break;
    }
    case "upgradeDie":
      for (const f of run.dice.find((d) => d.id === p.dieId)!.faces) if (f.kind === "num") f.value += 1;
      break;
    case "buyDie":
      run.dice.push(newDie(run.nextDieId++, c.sides));
      break;
    case "buyVolatile":
      run.dice.push(newVolatileDie(run.nextDieId++, c.sides, c.boomValue));
      break;
    case "buySpecial": {
      const def = SPECIAL_BY_ID[p.specialId]!;
      run.dice.find((d) => d.id === p.dieId)!.faces[p.faceIndex] = { ...def.face };
      run.shopSpecials = run.shopSpecials.filter((id) => id !== p.specialId);
      run.stats.specialsBought[p.specialId] = (run.stats.specialsBought[p.specialId] ?? 0) + 1;
      break;
    }
  }
}

export function leaveShop(run: RunState): void {
  if (run.phase !== "shop") throw new Error("not in shop");
  startRound(run);
}
