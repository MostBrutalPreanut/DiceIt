import { Rng } from '../sim/rng';
import { MAX_LEVEL, PARTS, type PartId, type PartInstance } from './parts';
import { neutralMods, type Mods } from './mods';

/**
 * Major upgrades: after every boss you pick one of three. Each is a data row with a one-sentence recipe,
 * so the card text comes from the same numbers as the effect. Three kinds of effect:
 *  - `mods` changes the run's Mods (the physics, the scorer and the economy all read them),
 *  - `instant` happens once, when taken (a part arrives in the inventory, a part type levels up),
 *  - both, or neither (nothing yet).
 */
export type UpgradeId =
  | 'saver' | 'kickbacks' | 'flippers' | 'extraBall' | 'interest' | 'sponsor' | 'coupon' | 'fullRefund' | 'bigShelf'
  | 'rubber' | 'heavy' | 'glass' | 'gold' | 'twin'
  | 'levelUp' | 'overclock' | 'lamps' | 'printerPlus' | 'sets' | 'goldenAge'
  | 'headStart' | 'lucky' | 'ballHog';

export type UpgradeColumn = 'board' | 'balls' | 'parts' | 'rules';
export type Rarity = 'common' | 'rare' | 'legendary';

export const COLUMNS: UpgradeColumn[] = ['board', 'balls', 'parts', 'rules'];
export const COLUMN_NAMES: Record<UpgradeColumn, string> = { board: 'Board', balls: 'Ball', parts: 'Parts', rules: 'Rules' };

/** A major upgrade a run has taken. Targeted upgrades remember which part type they were aimed at. */
export interface UpgradePick {
  id: UpgradeId;
  target?: PartId;
}

/** What the offer rules look at. */
export interface RunView {
  /** Every part the run owns, placed or in the inventory. */
  owned: PartInstance[];
  levels: Partial<Record<PartId, number>>;
  picks: UpgradePick[];
  /** How many offers the run has already had (0 for the first). */
  offersSoFar: number;
}

/** What an instant effect can do to the run. */
export interface UpgradeApi {
  /** Put a new part in the inventory, marked NEW. */
  grant(id: PartId, dials?: Record<string, number>): void;
  levelUp(id: PartId): void;
  /** Part types the run owns that can be levelled up and are not yet at the cap. */
  levelable(): PartId[];
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  column: UpgradeColumn;
  rarity: Rarity;
  /** One sentence, from the same numbers as the effect. `target` is the part type of a targeted upgrade. */
  text: (target?: PartId) => string;
  /** How many times it can be taken (per target, for targeted upgrades). */
  max: number;
  /** Upgrades it cannot be taken with. */
  excludes?: UpgradeId[];
  /** Targeted upgrades: the part types it could be aimed at right now. */
  targets?: (v: RunView) => PartId[];
  /** Extra condition for being worth offering (never offer a dead pick). */
  worth?: (v: RunView) => boolean;
  mods?: (m: Mods, target?: PartId) => void;
  instant?: (api: UpgradeApi, target?: PartId) => void;
}

/** Skipping the pick pays this much. */
export const SKIP_PAY = 4;
/** A pick is owed after every boss: rounds 3, 6, 9, 12, 15. */
export const BOSS_EVERY = 3;

// the numbers behind the effects and their sentences
const N = {
  interestCap: 5, sponsor: 3, coupon: 1, shelf: 1, bounce: 0.3, heavyPoints: 0.25, heavyNudge: 0.6,
  glassGravity: 0.8, glassSpin: 1.5, goldEvery: 10, goldCap: 5, overclock: 0.5, lampRadius: 2, lampBonus: 0.1,
  head: 0.25, lucky: 7, ballHog: 5,
} as const;

const owns = (v: RunView, id: PartId) => v.owned.some((p) => p.def === id);
const ownedTypes = (v: RunView) => v.owned.map((p) => p.def);
const levelableTypes = (v: RunView) => ownedTypes(v).filter((id) => PARTS[id].recipe.perLevel && (v.levels[id] ?? 0) < MAX_LEVEL);
const scoringTypes = (v: RunView) => ownedTypes(v).filter((id) => PARTS[id].recipe.points);
const pct = (f: number) => `${Math.round(f * 100)}%`;
const nm = (id?: PartId) => (id ? PARTS[id].name + 's' : 'a part type');

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  // ---- Board: the table and the round rules ----
  saver: { id: 'saver', name: 'Ball Saver', column: 'board', rarity: 'common', max: 2,
    text: () => 'Install a free Ball Saver: it returns one early drain on every ball.', instant: (a) => a.grant('saver') },
  kickbacks: { id: 'kickbacks', name: 'Kickbacks', column: 'board', rarity: 'common', max: 1,
    text: () => 'Install two free Kickbacks.', instant: (a) => { a.grant('kickback'); a.grant('kickback'); } },
  flippers: { id: 'flippers', name: 'Upper Flippers', column: 'board', rarity: 'rare', max: 1,
    text: () => 'Install two free Extra Flippers, one for each button.', instant: (a) => { a.grant('flipper', { side: 0 }); a.grant('flipper', { side: 1 }); } },
  extraBall: { id: 'extraBall', name: 'Extra Ball', column: 'board', rarity: 'rare', max: 2,
    text: () => 'Every round gives you one more ball.', mods: (m) => { m.ballsPerRound += 1; } },
  interest: { id: 'interest', name: 'Interest', column: 'board', rarity: 'common', max: 2,
    text: () => `After every round, earn $1 for every $4 you hold (up to $${N.interestCap}).`,
    mods: (m) => { m.interestPer += 1; m.interestCap += N.interestCap; } },
  sponsor: { id: 'sponsor', name: 'Sponsor', column: 'board', rarity: 'common', max: 3,
    text: () => `Every round pays $${N.sponsor} more.`, mods: (m) => { m.roundBonus += N.sponsor; } },
  coupon: { id: 'coupon', name: 'Coupon Book', column: 'board', rarity: 'common', max: 2,
    text: () => `Every part in the shop costs $${N.coupon} less (never under $1).`, mods: (m) => { m.couponOff += N.coupon; } },
  fullRefund: { id: 'fullRefund', name: 'Full Refund', column: 'board', rarity: 'rare', max: 1,
    text: () => 'Selling a part refunds its full price.', mods: (m) => { m.sellRate = 1; } },
  bigShelf: { id: 'bigShelf', name: 'Wide Shelf', column: 'board', rarity: 'common', max: 2,
    text: () => `The shop shows ${N.shelf} more part.`, mods: (m) => { m.shopSlots += N.shelf; } },

  // ---- Ball: the ball itself, for the rest of the run ----
  rubber: { id: 'rubber', name: 'Rubber Ball', column: 'balls', rarity: 'common', max: 1,
    text: () => 'A bouncy ball: it rebounds harder off walls, parts and flippers, so it stays lively but is harder to cradle.', mods: (m) => { m.ballBounce += N.bounce; } },
  heavy: { id: 'heavy', name: 'Heavy Ball', column: 'balls', rarity: 'common', max: 1, excludes: ['glass'],
    text: () => `Every hit pays ${pct(N.heavyPoints)} more, but your nudges are ${pct(1 - N.heavyNudge)} weaker.`,
    mods: (m) => { m.pointsFactor *= 1 + N.heavyPoints; m.nudge *= N.heavyNudge; } },
  glass: { id: 'glass', name: 'Glass Ball', column: 'balls', rarity: 'common', max: 1, excludes: ['heavy'],
    text: () => `A light ball: it falls ${pct(1 - N.glassGravity)} slower, so it hangs in the air, and spinners spin ${pct(N.glassSpin - 1)} more.`,
    mods: (m) => { m.ballGravity *= N.glassGravity; m.spinBoost *= N.glassSpin; } },
  gold: { id: 'gold', name: 'Gold Ball', column: 'balls', rarity: 'common', max: 1,
    text: () => `Every ${N.goldEvery}th scoring hit of a round pays $1, up to $${N.goldCap} a round.`, mods: (m) => { m.goldEvery = N.goldEvery; m.goldCap = N.goldCap; } },
  twin: { id: 'twin', name: 'Twin Ball', column: 'balls', rarity: 'legendary', max: 1,
    text: () => 'Every ball arrives with a twin: two balls in the plunger lane.', mods: (m) => { m.twin = true; } },

  // ---- Parts: levels and special parts ----
  levelUp: { id: 'levelUp', name: 'Level Up', column: 'parts', rarity: 'common', max: 4, targets: levelableTypes,
    text: (t) => `${nm(t)} go up one level for the rest of the run.`, instant: (a, t) => { if (t) a.levelUp(t); } },
  overclock: { id: 'overclock', name: 'Overclock', column: 'parts', rarity: 'common', max: 3, targets: scoringTypes,
    text: (t) => `${nm(t)} score ${pct(N.overclock)} more base points for the rest of the run.`,
    mods: (m, t) => { if (t) m.overclock[t] = (m.overclock[t] ?? 0) + N.overclock; } },
  lamps: { id: 'lamps', name: 'Bright Lamps', column: 'parts', rarity: 'common', max: 2, worth: (v) => owns(v, 'lamp'),
    text: () => `Lamps glow ${N.lampRadius} units wider and give ${pct(N.lampBonus)} more.`,
    mods: (m) => { m.lampRadius += N.lampRadius; m.lampBonus += N.lampBonus; } },
  printerPlus: { id: 'printerPlus', name: 'Printer Plus', column: 'parts', rarity: 'rare', max: 1, worth: (v) => owns(v, 'printer'),
    text: () => 'Ball Printers print one more ball per catch.', mods: (m) => { m.printerExtra += 1; } },
  sets: { id: 'sets', name: 'Jackpot Sets', column: 'parts', rarity: 'rare', max: 1, worth: (v) => owns(v, 'lane') || owns(v, 'bank'),
    text: () => 'A complete lane or drop-target set pays double points and double Mult.', mods: (m) => { m.setFactor = 2; } },
  goldenAge: { id: 'goldenAge', name: 'Golden Age', column: 'parts', rarity: 'legendary', max: 1, worth: (v) => levelableTypes(v).length > 0,
    text: () => 'Every part type you own goes up one level.',
    instant: (a) => { for (const id of new Set(a.levelable())) a.levelUp(id); } },

  // ---- Rules: relic-style modifiers (from the second pick on) ----
  headStart: { id: 'headStart', name: 'Head Start', column: 'rules', rarity: 'common', max: 4,
    text: () => `Every ball starts at +${N.head} Mult.`, mods: (m) => { m.startMult += N.head; } },
  lucky: { id: 'lucky', name: 'Lucky Seven', column: 'rules', rarity: 'rare', max: 1,
    text: () => `Every ${N.lucky}th scoring hit of a ball pays double.`, mods: (m) => { m.luckyEvery = N.lucky; } },
  ballHog: { id: 'ballHog', name: 'Ball Hog', column: 'rules', rarity: 'common', max: 1,
    text: () => `Every ball you have left when you win a round pays $${N.ballHog} instead of $3.`, mods: (m) => { m.unusedBallPay = N.ballHog; } },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** The run's Mods: the neutral ones with every pick folded in. */
export function computeMods(picks: UpgradePick[]): Mods {
  const m = neutralMods();
  for (const p of picks) UPGRADES[p.id].mods?.(m, p.target);
  return m;
}

const taken = (picks: UpgradePick[], id: UpgradeId, target?: PartId) => picks.filter((p) => p.id === id && p.target === target).length;

/** The targets (or `undefined` for untargeted upgrades) this upgrade could be offered with right now. Empty = do not offer it. */
export function candidateTargets(def: UpgradeDef, v: RunView): (PartId | undefined)[] {
  if (def.worth && !def.worth(v)) return [];
  if (def.excludes?.some((x) => v.picks.some((p) => p.id === x))) return [];
  if (def.rarity === 'legendary' && v.offersSoFar < 1) return [];
  if (def.column === 'rules' && v.offersSoFar < 1) return [];
  if (!def.targets) return taken(v.picks, def.id) < def.max ? [undefined] : [];
  return [...new Set(def.targets(v))].filter((t) => taken(v.picks, def.id, t) < def.max);
}

export interface UpgradeOffer {
  id: UpgradeId;
  target?: PartId;
}

const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, rare: 3, legendary: 1 };

/**
 * Three cards, one per column (Board, Ball, Parts, and from the second pick on, Rules): never a dead pick,
 * weighted by rarity, and a targeted card is aimed at a part type you own.
 */
export function rollUpgradeOffers(seed: number, v: RunView, count = 3): UpgradeOffer[] {
  const rng = new Rng(seed);
  const columns = COLUMNS.filter((c) => c !== 'rules' || v.offersSoFar >= 1);
  const byColumn = columns
    .map((col) => ({ col, options: UPGRADE_IDS.map((id) => UPGRADES[id]).filter((d) => d.column === col && candidateTargets(d, v).length > 0) }))
    .filter((c) => c.options.length > 0);
  // shuffle the columns so that with four of them a different three show up
  for (let i = byColumn.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [byColumn[i], byColumn[j]] = [byColumn[j], byColumn[i]];
  }
  const offers: UpgradeOffer[] = [];
  for (const { options } of byColumn.slice(0, count)) {
    const total = options.reduce((a, d) => a + RARITY_WEIGHT[d.rarity], 0);
    let r = rng.next() * total;
    const def = options.find((d) => (r -= RARITY_WEIGHT[d.rarity]) < 0) ?? options[options.length - 1];
    const targets = candidateTargets(def, v);
    offers.push({ id: def.id, target: targets[Math.floor(rng.next() * targets.length)] });
  }
  return offers.sort((a, b) => COLUMNS.indexOf(UPGRADES[a.id].column) - COLUMNS.indexOf(UPGRADES[b.id].column));
}

export const offerText = (o: UpgradeOffer) => UPGRADES[o.id].text(o.target);
