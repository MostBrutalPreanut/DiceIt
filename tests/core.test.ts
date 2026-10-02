import { describe, expect, it } from "vitest";
import { COMBOS, matchingCombos, resolveFamilies } from "../src/content/combos.js";
import { DEFAULT_CONFIG } from "../src/content/config.js";
import { Rng } from "../src/core/rng.js";
import { scoreValues } from "../src/core/roll.js";
import { applyPurchase, createRun, finishRound, isBossRound, leaveShop, listPurchases, roll, targetFor } from "../src/core/run.js";
import type { Die } from "../src/core/types.js";
import { makeGreedyPolicy, randomPolicy } from "../src/sim/bots.js";
import { playRun } from "../src/sim/play.js";

const d6 = (id: number): Die => ({ id, faces: [1, 2, 3, 4, 5, 6] });
const dice = (n: number) => Array.from({ length: n }, (_, i) => d6(i));

/** Names of the combos that fire for these values on plain d6s. */
function fired(values: number[]): string[] {
  const res = scoreValues(dice(values.length), values, {});
  return res.combos.map((c) => c.id).sort();
}

describe("rng", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
  });
  it("int stays in range", () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) expect(r.int(6)).toBeLessThan(6);
  });
});

describe("combos", () => {
  it("has unique ids and sane numbers", () => {
    expect(new Set(COMBOS.map((c) => c.id)).size).toBe(COMBOS.length);
    for (const c of COMBOS) {
      expect(c.baseChips).toBeGreaterThan(0);
      expect(c.minDice).toBeGreaterThan(0);
    }
  });
  it("detects sets and keeps only the best in the family", () => {
    expect(fired([3, 3])).toContain("pair");
    expect(fired([3, 3, 3])).toContain("triple");
    expect(fired([3, 3, 3])).not.toContain("pair");
    expect(fired([2, 2, 5, 5])).toContain("two_pair");
    expect(fired([2, 2, 2, 5, 5])).toContain("full_house");
    expect(fired([2, 2, 2, 5, 5])).not.toContain("triple");
    expect(fired([4, 4, 4, 4])).toContain("quad");
  });
  it("detects runs", () => {
    expect(fired([1, 2, 3])).toContain("short_straight");
    expect(fired([1, 2, 3, 4])).toContain("straight");
    expect(fired([1, 2, 3, 4])).not.toContain("short_straight");
    expect(fired([2, 3, 4, 5, 6])).toContain("big_straight");
    expect(fired([1, 2, 4])).not.toContain("short_straight");
  });
  it("detects parity, extremes and sums", () => {
    expect(fired([2, 4])).toContain("even_steven");
    expect(fired([1, 3])).toContain("odd_squad");
    expect(fired([1, 1])).toContain("snake_eyes");
    expect(fired([6, 6])).toContain("box_cars");
    expect(fired([3, 4])).toContain("lucky_seven");
    expect(fired([4, 6])).toContain("perfect_ten");
    expect(fired([6, 6, 6, 3])).toContain("blackjack");
    expect(fired([5])).toContain("prime_time");
    expect(fired([4])).not.toContain("prime_time");
  });
  it("respects dice order for staircases", () => {
    expect(fired([1, 3, 5])).toContain("staircase_up");
    expect(fired([5, 3, 1])).toContain("staircase_down");
    expect(fired([3, 1, 5])).not.toContain("staircase_up");
  });
  it("enforces minimum dice", () => {
    const ctx = { values: [3], maxFaces: [6], total: 3 };
    expect(matchingCombos(ctx).every((c) => c.minDice <= 1)).toBe(true);
  });
  it("resolveFamilies breaks ties by letting equal ranks both fire", () => {
    const parity = COMBOS.filter((c) => c.family === "parity");
    expect(resolveFamilies(parity)).toHaveLength(parity.length);
  });
});

describe("scoring", () => {
  it("is (base + chips) * (1 + mult), floored", () => {
    // [3,3]: pair (3 chips, 0.5 mult). base 6 => (6+3)*1.5 = 13.5 -> 13. Also odd_squad (4, 0.5) + prime? total 6 not prime.
    const res = scoreValues(dice(2), [3, 3], {});
    expect(res.combos.map((c) => c.id).sort()).toEqual(["odd_squad", "pair"]);
    expect(res.chips).toBe(7);
    expect(res.mult).toBe(1);
    expect(res.score).toBe(Math.floor((6 + 7) * 2));
  });
  it("combo levels increase payout", () => {
    const lvl1 = scoreValues(dice(2), [3, 3], {});
    const lvl3 = scoreValues(dice(2), [3, 3], { pair: 3 });
    expect(lvl3.score).toBeGreaterThan(lvl1.score);
  });
  it("emits landed events for each die, then combos, then a final score", () => {
    const { events } = scoreValues(dice(2), [3, 3], {});
    expect(events.slice(0, 2).every((e) => e.type === "landed")).toBe(true);
    expect(events.at(-1)?.type).toBe("score");
  });
});

describe("run", () => {
  it("is deterministic for a seed", () => {
    const a = createRun("s"), b = createRun("s");
    expect(roll(a).values).toEqual(roll(b).values);
  });
  it("boss rounds are every 3rd with a higher target", () => {
    expect(isBossRound(DEFAULT_CONFIG, 2)).toBe(true);
    expect(isBossRound(DEFAULT_CONFIG, 1)).toBe(false);
    expect(targetFor(DEFAULT_CONFIG, 2)).toBeGreaterThan(targetFor(DEFAULT_CONFIG, 1));
  });
  it("loses when rolls run out under the target", () => {
    const run = createRun("lose", { ...DEFAULT_CONFIG, targetBase: 1e9 });
    while (run.phase === "round") roll(run);
    expect(run.phase).toBe("lost");
  });
  it("pays out, opens the shop and lets you buy things", () => {
    const run = createRun("win", { ...DEFAULT_CONFIG, targetBase: 1 });
    roll(run);
    finishRound(run);
    expect(run.phase).toBe("shop");
    expect(run.coins).toBeGreaterThan(0);
    const before = run.coins;
    const buy = listPurchases(run)[0]!;
    applyPurchase(run, buy);
    expect(run.coins).toBe(before - buy.cost);
    leaveShop(run);
    expect(run.phase).toBe("round");
    expect(run.roundIndex).toBe(1);
  });
  it("never offers what you cannot afford", () => {
    const run = createRun("poor", { ...DEFAULT_CONFIG, targetBase: 1 });
    roll(run);
    finishRound(run);
    run.coins = 0;
    expect(listPurchases(run)).toHaveLength(0);
  });
});

describe("bots", () => {
  it("full runs finish and are reproducible", () => {
    const a = playRun("x", randomPolicy), b = playRun("x", randomPolicy);
    expect(a.roundsCleared).toBe(b.roundsCleared);
    expect(a.rolls).toBe(b.rolls);
    expect(["won", "lost"]).toContain(a.run.phase);
  });
  it("greedy beats random on average", () => {
    const g = makeGreedyPolicy(40);
    const avg = (p: typeof g) => Array.from({ length: 12 }, (_, i) => playRun(`t${i}`, p).roundsCleared).reduce((x, y) => x + y, 0) / 12;
    expect(avg(g)).toBeGreaterThan(avg(randomPolicy));
  });
});
