import { Rng } from '../sim/rng';
import { PARTS, type PartId, type PartInstance, type Rarity } from './parts';
import { neutralMods, type Mods } from './mods';

/**
 * Relic decals (docs/art-direction.md §8): run-long rules you stick on the apron. Every decal is a data row:
 * a name, a one-sentence rule generated from the same numbers as its effect, and the effect itself as a change
 * to the run's Mods (the physics, the scorer and the economy all read them). A decal works from the moment it is
 * stuck until it is peeled off; there are no one-shot effects, so what the apron shows is what the machine does.
 *
 * Four kinds, so a pick is a choice between different directions:
 *  - Cash: outside the ball, in the shop and the payout (+1 shop offer, +$2 a round...)
 *  - Score: how hits pay (Mult, ×points, levels, combos)
 *  - Ball: the ball and the table's physics
 *  - Build: rules that care about what is on your table, and pull a build one way (Bumper Car, Purist...)
 *
 * Decals are never for sale: you win one after every boss (pick one of three, or skip for cash), so a run
 * has four by its final boss.
 */
export type DecalId =
  // cash
  | 'sponsor' | 'bigShelf' | 'interest' | 'coupon' | 'fullRefund' | 'ballHog' | 'freeReroll' | 'layaway' | 'bigToolbox' | 'bargain'
  | 'overshoot' | 'goldenTicket' | 'collector' | 'savingsBond'
  // score
  | 'headStart' | 'lucky' | 'overclock' | 'levelUp' | 'lamps' | 'sets' | 'goldenAge' | 'glassCannon' | 'comboKing' | 'spinDoctor'
  | 'multiball' | 'lastCall' | 'thrifty' | 'fanClub' | 'momentum' | 'afterglow' | 'nestEgg'
  // ball
  | 'rubber' | 'heavy' | 'glass' | 'gold' | 'twin' | 'extraBall' | 'safetyNet' | 'longFuse' | 'freeKick' | 'printerPlus' | 'suddenDeath'
  // build
  | 'bumperCar' | 'targetPractice' | 'lightShow' | 'purist' | 'crowd' | 'minimalist';

export type DecalKind = 'cash' | 'score' | 'ball' | 'build';
export const DECAL_KINDS: DecalKind[] = ['cash', 'score', 'ball', 'build'];
export const KIND_NAMES: Record<DecalKind, string> = { cash: 'Cash', score: 'Score', ball: 'Ball', build: 'Build' };

export type DecalShape = 'circle' | 'star' | 'shield' | 'ticket' | 'hex' | 'banner';
/** Every decal draws its own picture (scene.ts decalIcon), so no two stickers on the apron look alike. */
export type DecalIcon =
  | 'moneybag' | 'shelf' | 'sprout' | 'scissors' | 'glove' | 'pig' | 'die' | 'padlock' | 'toolbox' | 'tag'
  | 'shades' | 'crown' | 'magnifier' | 'scroll' | 'flag' | 'seven' | 'gauge' | 'chevrons' | 'bulb' | 'targets'
  | 'laurel' | 'cannon' | 'flame' | 'swirl' | 'balls' | 'mug' | 'purse' | 'bigboi' | 'trend' | 'sunset'
  | 'bounce' | 'anvil' | 'marble' | 'goldball' | 'twins' | 'plusball' | 'net' | 'fuse' | 'boot' | 'printer'
  | 'car' | 'bullseye' | 'beams' | 'drop' | 'crowd' | 'empty' | 'nestegg' | 'skull';

export interface DecalLook {
  shape: DecalShape;
  /** The vinyl's colour field (content, like a part's name: the same in every theme). */
  color: string;
  /** Its drawn picture (every decal has its own), or failing that a short glyph printed on a paper disc. */
  icon?: DecalIcon;
  glyph?: string;
}

/** A decal stuck on the apron (targeted decals remember which part type they are aimed at). */
export interface DecalPick {
  id: DecalId;
  target?: PartId;
  /** Momentum and Afterglow: the Mult this decal has kept so far (every ball starts with it). */
  grown?: number;
}
export type DecalOffer = DecalPick;

/** What the offer rules look at. */
export interface RunView {
  /** Every part the run owns, placed or in the inventory. */
  owned: PartInstance[];
  decals: DecalPick[];
  round: number;
}

export interface DecalDef {
  id: DecalId;
  name: string;
  kind: DecalKind;
  rarity: Rarity;
  /** One sentence, from the same numbers as the effect. `target` is the part type of a targeted decal. */
  text: (target?: PartId) => string;
  /** Decals it cannot be stuck alongside. */
  excludes?: DecalId[];
  /** Targeted decals: the part types it could be aimed at right now. */
  targets?: (v: RunView) => PartId[];
  /**
   * A decal that keeps Mult from round to round: 'cleared' adds `N.momentum` for every round you clear, 'peak'
   * adds a share of the round's highest Mult.
   */
  grows?: 'cleared' | 'peak';
  /** Extra condition for being worth offering (never offer a dead pick). */
  worth?: (v: RunView) => boolean;
  mods: (m: Mods, target?: PartId) => void;
  look: DecalLook;
}

/** Slots on the apron, two each side, where real machines put their rule and price cards: one per boss before the final. */
export const DECAL_SLOTS = 4;
/** Skipping the boss's decal pays this much. */
export const SKIP_PAY = 4;
/** A boss every third round: rounds 3, 6, 9, 12 and the final boss in 15. A decal pick is owed after each. */
export const BOSS_EVERY = 3;

// the numbers behind the effects and their sentences
const N = {
  sponsor: 2, interestPer: 5, interestCap: 5, coupon: 1, ballHog: 3, toolbox: 2, overshoot: 2, ticket: 8, collector: 1, bond: 1,
  head: 0.5, lucky: 7, luckyX: 3, overclock: 0.5, lampRadius: 2, lampBonus: 0.04, glass: 2, combo: 3, spin: 2, spinBoost: 1.5,
  multiball: 2, lastCall: 2, thriftyPer: 0.01, thriftyCap: 0.5, fanClub: 2, momentum: 0.5, afterglow: 0.1,
  bounce: 0.3, heavyPoints: 0.25, heavyNudge: 0.6, glassGravity: 0.8, glassSpin: 1.5, goldEvery: 10, goldCap: 5, fuse: 20,
  nestPer: 0.1, nestCap: 2, sudden: 20, suddenX: 1.5,
  bumper: 1.5, catch: 0.75, target: 2, targetEase: 0.8, lightShow: 1.5, purist: 2, puristTypes: 4, crowd: 0.04, empty: 0.25,
} as const;

const owns = (v: RunView, id: PartId) => v.owned.some((p) => p.def === id);
const ownsAny = (v: RunView, ids: PartId[]) => ids.some((id) => owns(v, id));
const ownedTypes = (v: RunView) => [...new Set(v.owned.map((p) => p.def))];
// Overclock and Level Up never pick Big Boi (Fan Club is his)
const levelableTypes = (v: RunView) => ownedTypes(v).filter((id) => id !== 'mega' && PARTS[id].recipe.perLevel);
const scoringTypes = (v: RunView) => ownedTypes(v).filter((id) => id !== 'mega' && PARTS[id].recipe.points);
const pct = (f: number) => `${Math.round(f * 100)}%`;
const nm = (id?: PartId) => (id ? PARTS[id].name + 's' : 'a part type');
const C = { gold: '#ffc43d', green: '#55d08f', teal: '#3cc3b1', blue: '#62b8ff', purple: '#8a63f2', pink: '#ff7fb0', red: '#ff6b6b', orange: '#ff9a3c', lime: '#a3d143', grey: '#b8b2cc' };

export const DECALS: Record<DecalId, DecalDef> = {
  // ---- Cash: the shop and the payout ----
  sponsor: { id: 'sponsor', name: 'Sponsor', kind: 'cash', rarity: 'common', text: () => `Every round you clear pays $${N.sponsor} more.`,
    mods: (m) => { m.roundBonus += N.sponsor; }, look: { shape: 'banner', color: C.gold, icon: 'moneybag' } },
  bigShelf: { id: 'bigShelf', name: 'Wide Shelf', kind: 'cash', rarity: 'common', text: () => 'The shop shows one more part.',
    mods: (m) => { m.shopSlots += 1; }, look: { shape: 'banner', color: C.teal, icon: 'shelf' } },
  interest: { id: 'interest', name: 'Interest', kind: 'cash', rarity: 'uncommon', text: () => `After every round, earn $1 for every $${N.interestPer} you hold (up to $${N.interestCap}).`,
    mods: (m) => { m.interestPer += 1; m.interestCap += N.interestCap; }, look: { shape: 'hex', color: C.green, icon: 'sprout' } },
  coupon: { id: 'coupon', name: 'Coupon Book', kind: 'cash', rarity: 'common', text: () => `Every part in the shop costs $${N.coupon} less (never under $1).`,
    mods: (m) => { m.couponOff += N.coupon; }, look: { shape: 'ticket', color: C.pink, icon: 'scissors' } },
  fullRefund: { id: 'fullRefund', name: 'Free Hands', kind: 'cash', rarity: 'uncommon', text: () => 'Moving and removing parts costs nothing, and a part the toolbox has no room for sells for its full price.',
    mods: (m) => { m.freeMoves = true; m.sellRate = 1; }, look: { shape: 'ticket', color: C.lime, icon: 'glove' } },
  ballHog: { id: 'ballHog', name: 'Ball Hog', kind: 'cash', rarity: 'common', text: () => `Every ball you have left when you clear a round pays $${N.ballHog} instead of $${neutralMods().unusedBallPay}.`,
    mods: (m) => { m.unusedBallPay = N.ballHog; }, look: { shape: 'hex', color: C.orange, icon: 'pig' } },
  freeReroll: { id: 'freeReroll', name: 'Free Reroll', kind: 'cash', rarity: 'common', text: () => 'The first reroll in every shop is free.',
    mods: (m) => { m.freeRerolls += 1; }, look: { shape: 'circle', color: C.blue, icon: 'die' } },
  layaway: { id: 'layaway', name: 'Layaway', kind: 'cash', rarity: 'uncommon', text: () => 'You can lock two more shop offers for the next round.',
    mods: (m) => { m.locks += 2; }, look: { shape: 'shield', color: C.grey, icon: 'padlock' } },
  bigToolbox: { id: 'bigToolbox', name: 'Big Toolbox', kind: 'cash', rarity: 'common', text: () => `Your toolbox holds ${N.toolbox} more parts.`,
    mods: (m) => { m.toolboxSlots += N.toolbox; }, look: { shape: 'hex', color: C.grey, icon: 'toolbox' } },
  bargain: { id: 'bargain', name: 'Bargain Bin', kind: 'cash', rarity: 'uncommon', text: () => 'One part in every shop is half price.',
    mods: (m) => { m.bargain = true; }, look: { shape: 'star', color: C.red, icon: 'tag' } },
  overshoot: { id: 'overshoot', name: 'Show-Off', kind: 'cash', rarity: 'common', text: () => `The bonus cash for scoring double the goal or more is ${N.overshoot}× bigger.`,
    mods: (m) => { m.overshootFactor *= N.overshoot; }, look: { shape: 'star', color: C.orange, icon: 'shades' } },
  goldenTicket: { id: 'goldenTicket', name: 'Golden Ticket', kind: 'cash', rarity: 'rare', text: () => `Every boss you beat pays $${N.ticket} more.`,
    mods: (m) => { m.bossBonus += N.ticket; }, look: { shape: 'ticket', color: C.gold, icon: 'crown' } },
  collector: { id: 'collector', name: 'Collector', kind: 'cash', rarity: 'rare', text: () => `Every round you clear pays $${N.collector} for each different kind of part on your table.`,
    mods: (m) => { m.perTypePay += N.collector; }, look: { shape: 'circle', color: C.purple, icon: 'magnifier' } },
  savingsBond: { id: 'savingsBond', name: 'Savings Bond', kind: 'cash', rarity: 'uncommon', text: () => `Every round you clear pays $${N.bond} for each decal on your apron (this one too).`,
    mods: (m) => { m.perDecalPay += N.bond; }, look: { shape: 'banner', color: C.green, icon: 'scroll' } },

  // ---- Score: how hits pay ----
  headStart: { id: 'headStart', name: 'Head Start', kind: 'score', rarity: 'common', text: () => `Every ball starts at +${N.head} Mult.`,
    mods: (m) => { m.startMult += N.head; }, look: { shape: 'ticket', color: '#ffae2b', icon: 'flag' } },
  lucky: { id: 'lucky', name: 'Lucky Seven', kind: 'score', rarity: 'uncommon', text: () => `Every ${N.lucky}th scoring hit of a ball pays ${N.luckyX}×.`,
    mods: (m) => { m.luckyEvery = N.lucky; m.luckyX = N.luckyX; }, look: { shape: 'star', color: C.purple, icon: 'seven' } },
  overclock: { id: 'overclock', name: 'Overclock', kind: 'score', rarity: 'common', targets: scoringTypes,
    text: (t) => `${nm(t)} score ${pct(N.overclock)} more points.`,
    mods: (m, t) => { if (t) m.overclock[t] = (m.overclock[t] ?? 0) + N.overclock; }, look: { shape: 'hex', color: C.red, icon: 'gauge' } },
  levelUp: { id: 'levelUp', name: 'Level Up', kind: 'score', rarity: 'common', targets: levelableTypes,
    text: (t) => `${nm(t)} count as two levels higher: more points per hit.`,
    mods: (m, t) => { if (t) m.levelBonus[t] = (m.levelBonus[t] ?? 0) + 2; }, look: { shape: 'shield', color: C.gold, icon: 'chevrons' } },
  lamps: { id: 'lamps', name: 'Bright Lamps', kind: 'score', rarity: 'common', worth: (v) => owns(v, 'lamp'),
    text: () => `Lamps glow ${N.lampRadius} units wider, and every step of their glow gives ${pct(N.lampBonus)} more.`,
    mods: (m) => { m.lampRadius += N.lampRadius; m.lampBonus += N.lampBonus; }, look: { shape: 'circle', color: '#ffe45c', icon: 'bulb' } },
  sets: { id: 'sets', name: 'Jackpot Sets', kind: 'score', rarity: 'uncommon', worth: (v) => ownsAny(v, ['lane', 'bank']),
    text: () => 'A complete lane or drop-target set pays double points and double Mult.', mods: (m) => { m.setFactor *= 2; }, look: { shape: 'star', color: C.blue, icon: 'targets' } },
  goldenAge: { id: 'goldenAge', name: 'Golden Age', kind: 'score', rarity: 'legendary',
    text: () => 'Every part counts as one level higher: more points per hit.', mods: (m) => { m.levelAll += 1; }, look: { shape: 'shield', color: C.gold, icon: 'laurel' } },
  glassCannon: { id: 'glassCannon', name: 'Glass Cannon', kind: 'score', rarity: 'rare',
    text: () => `Every hit pays ${N.glass}×, but every round has one ball less.`, mods: (m) => { m.pointsFactor *= N.glass; m.ballsPerRound -= 1; }, look: { shape: 'star', color: C.teal, icon: 'cannon' } },
  comboKing: { id: 'comboKing', name: 'Combo King', kind: 'score', rarity: 'uncommon', worth: (v) => ownsAny(v, ['sling', 'deflector', 'kickback', 'vari']),
    text: () => `After a Slingshot, Deflector, Kickback or smashed Vari-Target, the ball's next hit pays ${N.combo}× the usual extra.`, mods: (m) => { m.hotFactor *= N.combo; }, look: { shape: 'banner', color: C.red, icon: 'flame' } },
  spinDoctor: { id: 'spinDoctor', name: 'Spin Doctor', kind: 'score', rarity: 'uncommon', worth: (v) => owns(v, 'spinner'),
    text: () => `Spinners spin ${pct(N.spinBoost - 1)} more and give ${N.spin}× the Mult per spin.`, mods: (m) => { m.spinBoost *= N.spinBoost; m.spinMult *= N.spin; }, look: { shape: 'circle', color: C.lime, icon: 'swirl' } },
  multiball: { id: 'multiball', name: 'Multiball Madness', kind: 'score', rarity: 'rare', worth: (v) => ownsAny(v, ['printer']) || v.decals.some((d) => d.id === 'twin'),
    text: () => `While two or more balls are on the table, every hit pays ${N.multiball}×.`, mods: (m) => { m.multiballX *= N.multiball; }, look: { shape: 'hex', color: C.pink, icon: 'balls' } },
  lastCall: { id: 'lastCall', name: 'Last Call', kind: 'score', rarity: 'common', text: () => `The last ball of every round pays ${N.lastCall}×.`,
    mods: (m) => { m.lastBallX *= N.lastCall; }, look: { shape: 'ticket', color: C.orange, icon: 'mug' } },
  thrifty: { id: 'thrifty', name: 'Thrifty', kind: 'score', rarity: 'uncommon', text: () => `Every hit pays +${pct(N.thriftyPer)} for every $1 you hold (up to +${pct(N.thriftyCap)}).`,
    mods: (m) => { m.cashPer += N.thriftyPer; m.cashCap = Math.max(m.cashCap, N.thriftyCap); }, look: { shape: 'circle', color: C.green, icon: 'purse' } },
  fanClub: { id: 'fanClub', name: 'Big Boi Fan Club', kind: 'score', rarity: 'uncommon', text: () => `Big Boi pays ${N.fanClub}× (his jackpots too).`,
    mods: (m) => { m.bigBoiX *= N.fanClub; }, look: { shape: 'shield', color: C.teal, icon: 'bigboi' } },
  momentum: { id: 'momentum', name: 'Momentum', kind: 'score', rarity: 'uncommon', grows: 'cleared',
    text: () => `Every round you clear adds +${N.momentum} to the Mult every ball starts at, for as long as this decal stays.`,
    mods: () => {}, look: { shape: 'banner', color: C.lime, icon: 'trend' } },
  afterglow: { id: 'afterglow', name: 'Afterglow', kind: 'score', rarity: 'rare', grows: 'peak',
    text: () => `At the end of every round, this decal keeps ${pct(N.afterglow)} of the Mult you gained that round: every ball after starts that much higher.`,
    mods: () => {}, look: { shape: 'star', color: '#ff8fd0', icon: 'sunset' } },

  nestEgg: { id: 'nestEgg', name: 'Nest Egg', kind: 'score', rarity: 'uncommon', text: () => `Every ball starts at +${N.nestPer} Mult for every $5 you hold (up to +${N.nestCap}).`,
    mods: (m) => { m.startMultPerFive += N.nestPer; m.startMultPerFiveCap += N.nestCap; }, look: { shape: 'circle', color: C.gold, icon: 'nestegg' } },

  // ---- Ball: the ball and the table ----
  rubber: { id: 'rubber', name: 'Rubber Ball', kind: 'ball', rarity: 'common', text: () => 'The ball is bouncier: it rebounds harder off walls, parts and flippers.',
    mods: (m) => { m.ballBounce += N.bounce; }, look: { shape: 'circle', color: C.pink, icon: 'bounce' } },
  heavy: { id: 'heavy', name: 'Heavy Ball', kind: 'ball', rarity: 'uncommon', excludes: ['glass'], text: () => `Every hit pays ${pct(N.heavyPoints)} more, but your nudges are ${pct(1 - N.heavyNudge)} weaker.`,
    mods: (m) => { m.pointsFactor *= 1 + N.heavyPoints; m.nudge *= N.heavyNudge; }, look: { shape: 'hex', color: C.grey, icon: 'anvil' } },
  glass: { id: 'glass', name: 'Glass Ball', kind: 'ball', rarity: 'uncommon', excludes: ['heavy'], text: () => `The ball falls ${pct(1 - N.glassGravity)} slower, and spinners spin ${pct(N.glassSpin - 1)} more.`,
    mods: (m) => { m.ballGravity *= N.glassGravity; m.spinBoost *= N.glassSpin; }, look: { shape: 'circle', color: C.blue, icon: 'marble' } },
  gold: { id: 'gold', name: 'Gold Ball', kind: 'ball', rarity: 'common', text: () => `Every ${N.goldEvery}th scoring hit of a round pays $1, up to $${N.goldCap} a round.`,
    mods: (m) => { m.goldEvery = N.goldEvery; m.goldCap = N.goldCap; }, look: { shape: 'star', color: C.gold, icon: 'goldball' } },
  twin: { id: 'twin', name: 'Twin Ball', kind: 'ball', rarity: 'legendary', text: () => 'The first ball of every round arrives with a twin: two balls in the plunger lane, sharing one clock.',
    mods: (m) => { m.twin = true; }, look: { shape: 'banner', color: C.purple, icon: 'twins' } },
  extraBall: { id: 'extraBall', name: 'Extra Ball', kind: 'ball', rarity: 'rare', text: () => 'Every round gives you one more ball.',
    mods: (m) => { m.ballsPerRound += 1; }, look: { shape: 'circle', color: C.lime, icon: 'plusball' } },
  safetyNet: { id: 'safetyNet', name: 'Safety Net', kind: 'ball', rarity: 'uncommon', text: () => 'Every ball gets one save, as if a Ball Saver were on the table.',
    mods: (m) => { m.extraSaves += 1; }, look: { shape: 'shield', color: C.lime, icon: 'net' } },
  longFuse: { id: 'longFuse', name: 'Long Fuse', kind: 'ball', rarity: 'common', text: () => `Every ball's clock runs ${N.fuse} s longer. One clock per ball you launch: extra balls share it, they never start a new one.`,
    mods: (m) => { m.ballClock += N.fuse; }, look: { shape: 'ticket', color: C.teal, icon: 'fuse' } },
  freeKick: { id: 'freeKick', name: 'Free Kick', kind: 'ball', rarity: 'common', worth: (v) => owns(v, 'kickback'),
    text: () => 'Kickbacks recharge twice as fast.', mods: (m) => { m.kickbackCooldown *= 0.5; }, look: { shape: 'banner', color: '#3050ff', icon: 'boot' } },
  suddenDeath: { id: 'suddenDeath', name: 'Sudden Death', kind: 'ball', rarity: 'rare', text: () => `Every ball's clock is ${N.sudden} s shorter, but every hit pays ${N.suddenX}×.`,
    mods: (m) => { m.ballClock -= N.sudden; m.pointsFactor *= N.suddenX; }, look: { shape: 'shield', color: C.red, icon: 'skull' } },
  printerPlus: { id: 'printerPlus', name: 'Printer Plus', kind: 'ball', rarity: 'rare', worth: (v) => owns(v, 'printer'),
    text: () => 'Ball Printers spit out one more ball every time they catch one.', mods: (m) => { m.printerExtra += 1; }, look: { shape: 'hex', color: C.blue, icon: 'printer' } },

  // ---- Build: rules about what is on your table ----
  bumperCar: { id: 'bumperCar', name: 'Bumper Car', kind: 'build', rarity: 'uncommon', excludes: ['targetPractice', 'lightShow'],
    text: () => `Bumpers pay ${pct(N.bumper - 1)} more, but every part that is not a bumper pays ${pct(1 - N.catch)} less.`,
    mods: (m) => { m.tagFactor.bumper = (m.tagFactor.bumper ?? 1) * N.bumper; m.untaggedFactor *= N.catch; }, look: { shape: 'circle', color: C.teal, icon: 'car' } },
  targetPractice: { id: 'targetPractice', name: 'Target Practice', kind: 'build', rarity: 'uncommon', excludes: ['bumperCar', 'lightShow'], worth: (v) => ownsAny(v, ['vari', 'bank', 'piggy']),
    text: () => `Targets pay ${N.target}× and need ${pct(1 - N.targetEase)} less speed for each tier, but every part that is not a target pays ${pct(1 - N.catch)} less.`,
    mods: (m) => { m.tagFactor.target = (m.tagFactor.target ?? 1) * N.target; m.tierEase *= N.targetEase; m.untaggedFactor *= N.catch; }, look: { shape: 'shield', color: C.red, icon: 'bullseye' } },
  lightShow: { id: 'lightShow', name: 'Light Show', kind: 'build', rarity: 'uncommon', excludes: ['bumperCar', 'targetPractice'], worth: (v) => ownsAny(v, ['lane', 'lamp', 'xlane', 'disco', 'uplight']),
    text: () => `Lights pay ${N.lightShow}×, Lamps glow wider and lane sets pay double, but every part that is not a light pays ${pct(1 - N.catch)} less.`,
    mods: (m) => { m.tagFactor.light = (m.tagFactor.light ?? 1) * N.lightShow; m.lampRadius += 1; m.setFactor *= 2; m.untaggedFactor *= N.catch; }, look: { shape: 'star', color: '#ffe45c', icon: 'beams' } },
  purist: { id: 'purist', name: 'Purist', kind: 'build', rarity: 'rare', excludes: ['crowd'],
    text: () => `Every hit pays ${N.purist}× while your table holds ${N.puristTypes} kinds of part or fewer (Big Boi does not count).`,
    mods: (m) => { m.puristX *= N.purist; m.puristTypes = N.puristTypes; }, look: { shape: 'hex', color: '#ffffff', icon: 'drop' } },
  crowd: { id: 'crowd', name: 'Crowd Pleaser', kind: 'build', rarity: 'uncommon', excludes: ['purist', 'minimalist'],
    text: () => `Every ball starts at +${N.crowd} Mult for each part on your table.`, mods: (m) => { m.startMultPerPart += N.crowd; }, look: { shape: 'banner', color: C.orange, icon: 'crowd' } },
  minimalist: { id: 'minimalist', name: 'Minimalist', kind: 'build', rarity: 'rare', excludes: ['crowd'],
    text: () => `Every ball starts at +${N.empty} Mult for each empty toolbox slot.`, mods: (m) => { m.startMultPerEmpty += N.empty; }, look: { shape: 'ticket', color: '#ffffff', icon: 'empty' } },
};

export const DECAL_IDS = Object.keys(DECALS) as DecalId[];

/** The run's Mods: the neutral ones with every decal folded in. */
export function computeMods(decals: DecalPick[], base: Mods = neutralMods()): Mods {
  const m = base;
  for (const d of decals) DECALS[d.id]?.mods(m, d.target);
  m.ballsPerRound = Math.max(1, m.ballsPerRound);
  return m;
}

/** The targets (or `undefined` for untargeted decals) this decal could be offered with right now. Empty = do not offer it. */
export function candidateTargets(def: DecalDef, v: RunView): (PartId | undefined)[] {
  if (def.worth && !def.worth(v)) return [];
  if (def.excludes?.some((x) => v.decals.some((p) => p.id === x))) return [];
  const stuck = (t?: PartId) => v.decals.some((p) => p.id === def.id && p.target === t);
  if (!def.targets) return stuck(undefined) ? [] : [undefined];
  return [...new Set(def.targets(v))].filter((t) => !stuck(t));
}

/** How the boss's pick weighs each rarity (legendaries only from the second boss). */
const PICK_WEIGHT: Record<Rarity, number> = { common: 5, uncommon: 4, rare: 2.5, legendary: 1 };

function weighted(rng: Rng, defs: DecalDef[], weight: (d: DecalDef) => number): DecalDef | null {
  const total = defs.reduce((a, d) => a + weight(d), 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  return defs.find((d) => (r -= weight(d)) < 0) ?? defs[defs.length - 1];
}

/**
 * The boss's prize: three decals of three different kinds, never a dead pick or one already stuck, weighted
 * by rarity; a targeted decal is aimed at a part type you own. `bossNo` counts bosses beaten (1 for the first).
 */
export function rollDecalPick(seed: number, v: RunView, bossNo: number, count = 3): DecalOffer[] {
  const rng = new Rng(seed);
  const kinds = [...DECAL_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const offers: DecalOffer[] = [];
  for (const kind of kinds) {
    if (offers.length >= count) break;
    const options = DECAL_IDS.map((id) => DECALS[id]).filter((d) => d.kind === kind && (d.rarity !== 'legendary' || bossNo >= 2) && candidateTargets(d, v).length > 0);
    const def = weighted(rng, options, (d) => PICK_WEIGHT[d.rarity]);
    if (!def) continue;
    const targets = candidateTargets(def, v);
    offers.push({ id: def.id, target: targets[Math.floor(rng.next() * targets.length)] });
  }
  return offers.sort((a, b) => DECAL_KINDS.indexOf(DECALS[a.id].kind) - DECAL_KINDS.indexOf(DECALS[b.id].kind));
}

export const decalTitle = (o: DecalPick) => DECALS[o.id].name + (o.target ? ` · ${PARTS[o.target].name}s` : '');
export const decalText = (o: DecalPick) => DECALS[o.id].text(o.target) + (o.grown ? ` Kept so far: +${Math.round(o.grown * 100) / 100} Mult.` : '');

/**
 * What a growing decal keeps at the end of a round: Momentum for a cleared round, Afterglow a share of the Mult gained
 * that round (`peakGain`: the scorer's best gain in a ball, measured without the Mult the decals had already kept, so
 * it is never counted again and cannot compound).
 */
export function decalGrowth(o: DecalPick, cleared: boolean, peakGain: number): number {
  const g = DECALS[o.id].grows;
  if (g === 'cleared') return cleared ? N.momentum : 0;
  if (g === 'peak') return Math.round(N.afterglow * Math.max(0, peakGain) * 100) / 100;
  return 0;
}
