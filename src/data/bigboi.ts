import type { PartDef, Recipe } from './parts';
import { PARTS } from './parts';

/**
 * Every machine has exactly one Big Boi, fixed in the middle of the table, and he is not for sale. What he does
 * depends on the machine you picked for the run: each one pulls a run towards a different kind of build.
 *  - Funhouse Factory's Foreman raises the Mult with every hit: hit him a lot.
 *  - Short Order's Cook calls an order every time he is hit: one part on the table lights up, and its next hit
 *    pays triple.
 *  - Castle Crash's Dragon wears armour: every hit knocks a plate off, and when the last one goes he pays 2,000
 *    points; the armour grows back one plate thicker.
 */
export type MachineId = 'factory' | 'diner' | 'castle';
export type BigBoiId = 'foreman' | 'cook' | 'dragon';

export interface BigBoiDef {
  id: BigBoiId;
  machine: MachineId;
  /** "The Foreman" (every one of them is a Big Boi: that is his tag) */
  title: string;
  /** The ability's name, as a chip on his card ('' when his plain recipe says it all). */
  ability: string;
  blurb: string;
  recipe: Recipe;
}

/** The Cook: the part he lights pays this many times on its next hit, then goes dark. */
export const ORDER = { x: 3 } as const;
/** The Dragon: armour plates at the start of every ball, how many more grow back each time it is knocked off, and the jackpot (times his base points). */
export const DRAGON = { armour: 5, regrow: 1, jackpotX: 10 } as const;

export const BIG_BOIS: Record<BigBoiId, BigBoiDef> = {
  foreman: {
    id: 'foreman', machine: 'factory', title: 'The Foreman', ability: '',
    blurb: 'Heavy, rude, hard to miss.',
    recipe: { points: 250, per: 'hit', mult: 0.15, multCap: 3, perLevel: 25 },
  },
  cook: {
    id: 'cook', machine: 'diner', title: 'The Cook', ability: 'Order Up!',
    blurb: 'Calls an order. Fill it and he gets generous.',
    recipe: { points: 150, per: 'hit', perLevel: 15 },
  },
  dragon: {
    id: 'dragon', machine: 'castle', title: 'The Dragon', ability: 'Siege',
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
