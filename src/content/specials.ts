import type { Face, SpecialDef } from "../core/types.js";

const s = (id: string, name: string, rarity: SpecialDef["rarity"], cost: number, face: Face, text: string): SpecialDef => ({
  id, name, rarity, cost, face, text,
});

/** Designer table: add a row (and, for a brand-new FaceKind, one case in core/roll.ts). */
export const SPECIALS: SpecialDef[] = [
  s("x2", "Doubler", "common", 60, { kind: "mult", value: 2 }, "The die to its right scores x2."),
  s("x3", "Tripler", "uncommon", 160, { kind: "mult", value: 3 }, "The die to its right scores x3."),
  s("echo", "Echo", "common", 50, { kind: "echo", value: 1 }, "Scores whatever the die to its left scored."),
  s("crowd", "Crowd", "uncommon", 80, { kind: "crowd", value: 1 }, "Scores 1 per die in the tray."),
  s("sum", "Sum", "rare", 140, { kind: "sum", value: 1 }, "Scores the sum of all the other dice."),
  s("boom", "Boom", "common", 40, { kind: "boom", value: 30 }, "Scores 30, then the die blows up."),
];

export const SPECIAL_BY_ID: Record<string, SpecialDef> = Object.fromEntries(SPECIALS.map((x) => [x.id, x]));
