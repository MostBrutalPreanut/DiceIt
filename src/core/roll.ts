import type { Die, Face, RollEvent, RollResult } from "./types.js";
import type { Rng } from "./rng.js";

/** Throw every die and score it. Pure: no run state touched. */
export function rollDice(dice: readonly Die[], rng: Rng): RollResult {
  const faces = dice.map((d) => d.faces[rng.int(d.faces.length)] as Face);
  return resolveFaces(dice, faces);
}

/**
 * Score decided faces. Dice resolve strictly left to right, so tray order matters:
 *  - `mult` hands a multiplier to the die on its right
 *  - `echo` copies the final score of the die on its left
 */
export function resolveFaces(dice: readonly Die[], faces: Face[]): RollResult {
  const n = faces.length;
  const events: RollEvent[] = dice.map((d, i) => ({ type: "landed", dieId: d.id, face: faces[i] as Face }));

  const plainSum = faces.reduce((a, f) => a + (f.kind === "num" ? f.value : 0), 0);
  const mult: number[] = Array(n).fill(1);
  const scores: number[] = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const f = faces[i] as Face;
    let value = 0;
    switch (f.kind) {
      case "num":
      case "boom":
        value = f.value;
        break;
      case "mult":
        if (i + 1 < n) mult[i + 1] = (mult[i + 1] as number) * f.value;
        break;
      case "echo":
        value = i > 0 ? (scores[i - 1] as number) : 0;
        break;
      case "crowd":
        value = f.value * n;
        break;
      case "sum":
        value = plainSum;
        break;
    }
    scores[i] = value * (mult[i] as number);
    events.push({ type: "die", dieId: (dice[i] as Die).id, value, mult: mult[i] as number, score: scores[i] as number });
  }

  // Self-destruct. The last die in the tray is always spared so a run can never go diceless.
  let destroyed = dice.filter((_, i) => (faces[i] as Face).kind === "boom").map((d) => d.id);
  if (destroyed.length === n) destroyed = destroyed.slice(1);
  for (const id of destroyed) events.push({ type: "destroyed", dieId: id });

  const score = scores.reduce((a, b) => a + b, 0);
  events.push({ type: "score", total: score });
  return { faces, scores, score, destroyed, events };
}
