import { COMBOS } from "../content/combos.js";
import type { RunResult } from "./play.js";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function summarize(label: string, results: RunResult[], totalRounds: number): string {
  const n = results.length;
  const wins = results.filter((r) => r.won).length;
  const avg = (f: (r: RunResult) => number) => results.reduce((a, r) => a + f(r), 0) / n;

  // Where do losing runs die?
  const deaths: number[] = Array(totalRounds + 1).fill(0);
  for (const r of results) deaths[r.roundsCleared] = (deaths[r.roundsCleared] ?? 0) + 1;

  const lines: string[] = [];
  lines.push(`== ${label}: ${n} runs ==`);
  lines.push(`win rate:        ${pct(wins / n)}`);
  lines.push(`avg rounds won:  ${avg((r) => r.roundsCleared).toFixed(2)} / ${totalRounds}`);
  lines.push(`avg dice owned:  ${avg((r) => r.dice).toFixed(2)}`);
  lines.push(`avg rolls/run:   ${avg((r) => r.rolls).toFixed(1)}  (~${(avg((r) => r.rolls) * 1.0).toFixed(0)} rolls => run length proxy)`);
  lines.push("");
  lines.push("run ended after N rounds cleared (round index of death; last bucket = win):");
  for (let i = 0; i <= totalRounds; i++) {
    const bar = "#".repeat(Math.round(((deaths[i] as number) / n) * 60));
    lines.push(`  ${String(i).padStart(2)}: ${pct((deaths[i] as number) / n).padStart(6)} ${bar}`);
  }

  // Combo reachability: trigger rate per roll, by dice count.
  const rollsByN: Record<number, number> = {};
  const trig: Record<number, Record<string, number>> = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.run.stats.rollsByDiceCount)) rollsByN[+k] = (rollsByN[+k] ?? 0) + v;
    for (const [k, byCombo] of Object.entries(r.run.stats.comboByDiceCount)) {
      const t = (trig[+k] ??= {});
      for (const [id, v] of Object.entries(byCombo)) t[id] = (t[id] ?? 0) + v;
    }
  }
  const ns = Object.keys(rollsByN).map(Number).sort((a, b) => a - b);
  lines.push("");
  lines.push("combo trigger rate per roll, by dice owned ('.' = never, '-' = not enough dice):");
  lines.push(`  ${"combo".padEnd(16)}${ns.map((k) => `${k}d`.padStart(7)).join("")}`);
  for (const c of COMBOS) {
    const cells = ns.map((k) => {
      if (k < c.minDice) return "-".padStart(7);
      const count = trig[k]?.[c.id] ?? 0;
      return (count === 0 ? "." : pct(count / (rollsByN[k] as number))).padStart(7);
    });
    lines.push(`  ${c.name.padEnd(16)}${cells.join("")}`);
  }
  lines.push(`  ${"(rolls sampled)".padEnd(16)}${ns.map((k) => String(rollsByN[k]).padStart(7)).join("")}`);

  // What did bots buy?
  const buys: Record<string, number> = {};
  for (const r of results) for (const [k, v] of Object.entries(r.run.stats.purchases)) buys[k] = (buys[k] ?? 0) + v;
  lines.push("");
  lines.push("avg purchases/run: " + Object.entries(buys).map(([k, v]) => `${k}=${(v / n).toFixed(1)}`).join("  "));
  return lines.join("\n");
}
