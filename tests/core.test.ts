import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/content/config.js";
import { SPECIALS } from "../src/content/specials.js";
import { Rng } from "../src/core/rng.js";
import { resolveFaces } from "../src/core/roll.js";
import {
  applyPurchase, createRun, dicePrice, finishRound, isBossRound, leaveShop, listPurchases, newDie, newVolatileDie, roll, targetFor,
} from "../src/core/run.js";
import type { Die, Face } from "../src/core/types.js";
import { makeGreedyPolicy, randomPolicy } from "../src/sim/bots.js";
import { playRun } from "../src/sim/play.js";

const num = (value: number): Face => ({ kind: "num", value });
const dice = (n: number): Die[] => Array.from({ length: n }, (_, i) => newDie(i, 6));
const score = (faces: Face[]) => resolveFaces(dice(faces.length), faces);

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

describe("per-die scoring", () => {
  it("plain dice just add their pips", () => {
    expect(score([num(3), num(5), num(6)]).score).toBe(14);
  });
  it("has no global combos: pairs and straights score nothing extra", () => {
    expect(score([num(3), num(3)]).score).toBe(6);
    expect(score([num(1), num(2), num(3)]).score).toBe(6);
  });
  it("mult doubles the die to its right, only", () => {
    const r = score([num(2), { kind: "mult", value: 2 }, num(5), num(1)]);
    expect(r.scores).toEqual([2, 0, 10, 1]);
  });
  it("mult on the last die does nothing", () => {
    expect(score([num(4), { kind: "mult", value: 3 }]).score).toBe(4);
  });
  it("mult chains: x2 into x3 into a die", () => {
    // [x2][x3][4] -> middle die scores 0 but passes x2*? No: x3 gets x2, hands x3 (not x6) to the next.
    const r = score([{ kind: "mult", value: 2 }, { kind: "mult", value: 3 }, num(4)]);
    expect(r.scores).toEqual([0, 0, 12]);
  });
  it("echo copies the final score of the die on its left (multipliers included)", () => {
    const r = score([{ kind: "mult", value: 2 }, num(5), { kind: "echo", value: 1 }]);
    expect(r.scores).toEqual([0, 10, 10]);
  });
  it("echo with nothing to its left scores 0", () => {
    expect(score([{ kind: "echo", value: 1 }, num(4)]).scores).toEqual([0, 4]);
  });
  it("crowd scores per die in the tray", () => {
    expect(score([{ kind: "crowd", value: 1 }, num(1), num(1), num(1)]).scores[0]).toBe(4);
  });
  it("sum scores the other dice's plain numbers", () => {
    const r = score([num(2), { kind: "sum", value: 1 }, num(5)]);
    expect(r.scores[1]).toBe(7);
  });
  it("boom scores, then the die is destroyed", () => {
    const r = score([num(3), { kind: "boom", value: 30 }]);
    expect(r.score).toBe(33);
    expect(r.destroyed).toEqual([1]);
  });
  it("the last die is never destroyed", () => {
    const r = score([{ kind: "boom", value: 30 }, { kind: "boom", value: 30 }]);
    expect(r.destroyed).toHaveLength(1);
    expect(score([{ kind: "boom", value: 30 }]).destroyed).toHaveLength(0);
  });
  it("emits landed events per die, then die scores, then a final score", () => {
    const { events } = score([num(1), num(2)]);
    expect(events.slice(0, 2).every((e) => e.type === "landed")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "score", total: 3 });
  });
});

describe("content", () => {
  it("special ids are unique and priced", () => {
    expect(new Set(SPECIALS.map((s) => s.id)).size).toBe(SPECIALS.length);
    for (const s of SPECIALS) expect(s.cost).toBeGreaterThan(0);
  });
  it("volatile die has one boom face", () => {
    const d = newVolatileDie(0, 6, 30);
    expect(d.faces.filter((f) => f.kind === "boom")).toHaveLength(1);
  });
  it("dice get more expensive as you own more", () => {
    expect(dicePrice(DEFAULT_CONFIG, 5)).toBeGreaterThan(dicePrice(DEFAULT_CONFIG, 1));
  });
});

describe("run", () => {
  it("is deterministic for a seed", () => {
    const a = createRun("s"), b = createRun("s");
    expect(roll(a).faces).toEqual(roll(b).faces);
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
    expect(run.shopSpecials).toHaveLength(DEFAULT_CONFIG.shopSpecialOffers);
    expect(run.coins).toBeGreaterThan(0);
    run.coins = 500;
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
  it("buying a special replaces the face and removes it from the shop", () => {
    const run = createRun("sp", { ...DEFAULT_CONFIG, targetBase: 1 });
    roll(run);
    finishRound(run);
    run.coins = 10_000;
    const sid = run.shopSpecials[0]!;
    const p = listPurchases(run).find((x) => x.kind === "buySpecial" && x.specialId === sid && x.faceIndex === 0)!;
    applyPurchase(run, p);
    expect(run.dice[0]!.faces[0]!.kind).not.toBe("num");
    expect(run.shopSpecials).not.toContain(sid);
  });
  it("upgrading a whole die adds 1 to every number face", () => {
    const run = createRun("ud", { ...DEFAULT_CONFIG, targetBase: 1 });
    roll(run);
    finishRound(run);
    run.coins = 10_000;
    applyPurchase(run, listPurchases(run).find((x) => x.kind === "upgradeDie")!);
    expect(run.dice[0]!.faces.map((f) => f.value)).toEqual([2, 3, 4, 5, 6, 7]);
  });
  it("a destroyed die leaves the tray and makes the next purchase cheaper", () => {
    const run = createRun("boom", { ...DEFAULT_CONFIG, targetBase: 1e9 });
    run.dice = [newDie(0, 6), { id: 1, faces: Array.from({ length: 6 }, () => ({ kind: "boom", value: 30 }) as Face) }];
    const price = dicePrice(DEFAULT_CONFIG, 2);
    roll(run);
    expect(run.dice).toHaveLength(1);
    expect(run.stats.diceLost).toBe(1);
    expect(dicePrice(DEFAULT_CONFIG, run.dice.length)).toBeLessThan(price);
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
    const g = makeGreedyPolicy(30);
    const avg = (p: typeof g) => Array.from({ length: 10 }, (_, i) => playRun(`t${i}`, p).roundsCleared).reduce((x, y) => x + y, 0) / 10;
    expect(avg(g)).toBeGreaterThan(avg(randomPolicy));
  });
});
