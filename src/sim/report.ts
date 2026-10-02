import type { RunResult } from "./play.js";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function summarize(label: string, results: RunResult[], totalRounds: number): string {
  const n = results.length;
  const wins = results.filter((r) => r.won).length;
  const avg = (f: (r: RunResult) => number) => results.reduce((a, r) => a + f(r), 0) / n;

  const deaths: number[] = Array(totalRounds + 1).fill(0);
  for (const r of results) deaths[r.roundsCleared] = (deaths[r.roundsCleared] ?? 0) + 1;

  const L: string[] = [];
  L.push(`== ${label}: ${n} runs ==`);
  L.push(`win rate:         ${pct(wins / n)}`);
  L.push(`avg rounds won:   ${avg((r) => r.roundsCleared).toFixed(2)} / ${totalRounds}`);
  L.push(`avg dice at end:  ${avg((r) => r.dice).toFixed(2)}   (dice lost to booms/run: ${avg((r) => r.run.stats.diceLost).toFixed(1)})`);
  L.push(`avg rolls/run:    ${avg((r) => r.rolls).toFixed(1)}`);
  L.push("");
  L.push("run ended after N rounds cleared (last bucket = win):");
  for (let i = 0; i <= totalRounds; i++) {
    const d = deaths[i] as number;
    L.push(`  ${String(i).padStart(2)}: ${pct(d / n).padStart(6)} ${"#".repeat(Math.round((d / n) * 60))}`);
  }

  // Growth curve and tension per round (only over runs that reached the round).
  L.push("");
  L.push("per round: runs reaching it | avg dice owned | avg score/target (>=1 = cleared; ~1.0-1.6 is healthy tension)");
  for (let i = 0; i < totalRounds; i++) {
    const reached = results.filter((r) => r.diceByRound[i] !== undefined);
    if (!reached.length) break;
    const dice = reached.reduce((a, r) => a + (r.diceByRound[i] as number), 0) / reached.length;
    const ratio = reached.reduce((a, r) => a + (r.ratioByRound[i] as number), 0) / reached.length;
    L.push(`  r${String(i + 1).padStart(2)}: ${pct(reached.length / n).padStart(6)} | ${dice.toFixed(1).padStart(5)} dice | ${ratio.toFixed(2)}x`);
  }

  const sum = (pick: (r: RunResult) => Record<string, number>) => {
    const t: Record<string, number> = {};
    for (const r of results) for (const [k, v] of Object.entries(pick(r))) t[k] = (t[k] ?? 0) + v;
    return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${(v / n).toFixed(1)}`).join("  ");
  };
  L.push("");
  L.push("avg purchases/run: " + sum((r) => r.run.stats.purchases));
  L.push("avg specials bought/run: " + sum((r) => r.run.stats.specialsBought));
  L.push("avg special faces landed/run: " + sum((r) => r.run.stats.faceLands));
  return L.join("\n");
}
