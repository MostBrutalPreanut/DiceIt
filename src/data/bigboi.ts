import type { PartDef, Recipe } from './parts';
import { PARTS } from './parts';

/**
 * Every machine has exactly one Big Boi, fixed in the middle of the table, and he is not for sale. What he does
 * depends on the machine you picked for the run: each one pulls a run towards a different kind of build.
 *  - Funhouse Factory's Foreman raises the Mult with every hit: hit him a lot.
 *  - Short Order's Cook calls orders: he lights one part type you own, and that type pays triple. A focused table
 *    (few types, many of each) fills his orders fast; a table of one-offs rarely does.
 *  - Castle Crash's Dragon wears armour: knock it all off and he pays a jackpot and multiplies your Mult. Aim at
 *    him (deflectors, kickbacks) and he is the biggest thing on the table.
 */
export type MachineId = 'factory' | 'diner' | 'castle';
export type BigBoiId = 'foreman' | 'cook' | 'dragon';

export interface BigBoiDef {
  id: BigBoiId;
  machine: MachineId;
  /** "Big Boi the Foreman" */
  title: string;
  /** The ability's name, as a chip on his card ('' when his plain recipe says it all). */
  ability: string;
  blurb: string;
  recipe: Recipe;
}

/** The Cook: an order pays this many times; this many order hits serve it, which pays +Mult and calls a new one. */
export const ORDER = { x: 3, serves: 3, mult: 0.25, multCap: 2 } as const;
/** The Dragon: armour plates at the start of every ball (and this many more each time he is slain), the jackpot, and the slays a ball can have. */
export const DRAGON = { armour: 5, regrow: 2, jackpotX: 10, xmult: 1.5, maxSlays: 2 } as const;

export const BIG_BOIS: Record<BigBoiId, BigBoiDef> = {
  foreman: {
    id: 'foreman', machine: 'factory', title: 'Big Boi the Foreman', ability: '',
    blurb: 'Heavy, rude, hard to miss.',
    recipe: { points: 250, per: 'hit', mult: 0.15, multCap: 3, perLevel: 25 },
  },
  cook: {
    id: 'cook', machine: 'diner', title: 'Big Boi the Cook', ability: 'Order Up!',
    blurb: 'Calls an order. Fill it and he gets generous.',
    recipe: { points: 150, per: 'hit', perLevel: 15 },
  },
  dragon: {
    id: 'dragon', machine: 'castle', title: 'Big Boi the Dragon', ability: 'Siege',
    blurb: 'Armoured. Knock every plate off and he pays the castle.',
    recipe: { points: 200, per: 'hit', perLevel: 20 },
  },
};

export const BIG_BOI_FOR: Record<MachineId, BigBoiId> = { factory: 'foreman', diner: 'cook', castle: 'dragon' };
export const bigBoiOf = (m: MachineId | undefined): BigBoiDef => BIG_BOIS[BIG_BOI_FOR[m ?? 'factory']];

/** A part's definition on this machine: Big Boi takes his machine's recipe and blurb; everything else is the same everywhere. */
export function defOn(id: PartDef['id'], machine?: MachineId): PartDef {
  if (id !== 'mega') return PARTS[id];
  const b = bigBoiOf(machine);
  return { ...PARTS.mega, blurb: b.blurb, recipe: b.recipe };
}
