import { DEFAULT_CONFIG } from "../content/config.js";
import type { GameConfig } from "../core/types.js";
import { totalRounds } from "../core/run.js";
import { POLICIES } from "./bots.js";
import { playRun } from "./play.js";
import { summarize } from "./report.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

const runs = Number(arg("runs", "300"));
const seed = arg("seed", "1");
const which = arg("policy", "all");
const bankEarly = arg("bank", "early") === "early";

/** `--set key=value` overrides any config number/array, e.g. --set targetGrowth=1.4 --set dicePrices=[30,90,200]. */
const config = { ...DEFAULT_CONFIG } as Record<string, unknown>;
process.argv.forEach((a, i) => {
  if (a !== "--set") return;
  const [k, v] = (process.argv[i + 1] ?? "").split("=");
  if (!k || v === undefined || !(k in config)) throw new Error(`bad --set ${process.argv[i + 1]}`);
  config[k] = JSON.parse(v);
});
const cfg = config as unknown as GameConfig;
const names = which === "all" ? Object.keys(POLICIES) : [which];

for (const name of names) {
  const make = POLICIES[name];
  if (!make) throw new Error(`unknown policy ${name}; options: ${Object.keys(POLICIES).join(", ")}`);
  const policy = make();
  const t0 = Date.now();
  const results = Array.from({ length: runs }, (_, i) => playRun(`${seed}-${i}`, policy, { bankEarly, config: cfg }));
  console.log(summarize(`${name} (bank ${bankEarly ? "early" : "never"})`, results, totalRounds(cfg)));
  console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s]\n`);
}
