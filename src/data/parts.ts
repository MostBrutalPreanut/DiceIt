/**
 * Content as data: every part is a row here. The sim reads shape, kind and kick, the scorer reads
 * the recipe, the renderer reads shape and kind (every colour comes from the theme), and the UI reads
 * `describe()`, which turns the same recipe into plain sentences so "how does this thing score?" can
 * never drift from what it actually does.
 */
import { SAVER_WINDOW } from '../sim/constants';
import { neutralMods, type Mods } from './mods';
import { bigBoiOf, DRAGON, ORDER, type MachineId } from './bigboi';

export type PartId =
  | 'pop' | 'coin' | 'mega' | 'sling' | 'spinner' | 'lane' | 'printer' | 'flipper' | 'lamp' | 'deflector' | 'uplight' | 'bank' | 'kickback' | 'saver' | 'vari'
  | 'ding' | 'piggy' | 'magnet' | 'thunder' | 'jackpot' | 'xlane' | 'golden' | 'disco';
export type PartKind = 'bumper' | 'kicker' | 'deflector' | 'spinner' | 'rollover' | 'saucer' | 'flipper' | 'lamp' | 'bank' | 'kickback' | 'saver' | 'target';

/**
 * Rarity decides when a part turns up in the shop and how much it does. Commons are there from round 1;
 * the rarer a part, the later it starts to appear, the more it costs, the bigger it is and the more it does.
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' };

/**
 * What a part is, for the decals that care: Bumper Car pays every bumper more, Target Practice every target...
 * A part can carry several tags. Shown on every card, so a build can be read at a glance.
 */
export type PartTag = 'bumper' | 'target' | 'light' | 'kicker' | 'ball' | 'guard' | 'money';
export const TAG_NAMES: Record<PartTag, string> = { bumper: 'Bumper', target: 'Target', light: 'Light', kicker: 'Kicker', ball: 'Ball', guard: 'Guard', money: 'Money' };

/** Part levels (Space Cadet's bumper upgrades): Level Lights and decals raise them, for the rest of the run. */
export const MAX_LEVEL = 5;
/** The part types a Level Light can be aimed at. */
export const LEVEL_TARGETS: PartId[] = ['pop', 'coin', 'mega'];
/** A Hot Shot lasts this long: the ball's next scoring hit within it pays the bonus. */
export const HOT_WINDOW = 1.2;

export interface DialDef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** One plain sentence: what you gain and what you give up. */
  tradeoff: string;
  /** The trade-off in a few words at each end of the dial (the tooltip's dial row). */
  ends: [string, string];
  /** Multiplier this dial puts on the part's points, if any. */
  payoff?: (v: number) => number;
  fmt?: (v: number) => string;
}

export interface Recipe {
  /** Base points per scoring event, before Mult. */
  points?: number;
  /** What one event is: shown in sentences ("per hit", "per spin"). */
  per?: string;
  /** +points per hit of this part TYPE earlier this ball (all parts of the type share it). */
  grow?: number;
  /** The most +points `grow` can ever add. */
  growCap?: number;
  /** Each hit also counts as this many hits of another type, for that type's growth (Thunder Bumper feeds Pops). */
  feeds?: { id: PartId; n: number };
  /** +Mult per event. */
  mult?: number;
  /** The most Mult this part type can add in one ball (all parts of the type together). */
  multCap?: number;
  /** Multiplies the Mult per event (x1.1 = +10% of the Mult you have). */
  xmult?: number;
  /** The most this type's ×Mult can multiply the Mult in one ball. */
  xmultCap?: number;
  /** +Mult per spin (Spinner), up to `spinMultCap` a ball from all of the type. */
  spinMult?: number;
  spinMultCap?: number;
  money?: number;
  /** The most $ this part type can pay in one round. */
  moneyCap?: number;
  /** Pays $1 every `n` hits of this type, up to `cap` a round. */
  moneyEvery?: { n: number; cap: number };
  /** The most set bonuses of this type paid in one ball. */
  setCap?: number;
  /** The most balls a Ball Printer prints in one ball. */
  printCap?: number;
  /** Lights up for the rest of the ball when rolled over. */
  lights?: boolean;
  /** When every light of this type on the board is lit. */
  setBonus?: { points: number; mult: number };
  /** Extra balls printed per catch. */
  spawn?: number;
  /** Extra base points per level of this part type (see MAX_LEVEL). */
  perLevel?: number;
  /** A Level Light: toggles on each pass; lighting every light aimed at one type levels that type up. */
  levelUp?: boolean;
  /** Harder hits pay more: the points are multiplied by the highest tier the ball's speed reaches. */
  tiers?: HitTier[];
  /** Hot Shot: the ball's next scoring hit (within HOT_WINDOW) pays this much more (0.5 = +50%). */
  hot?: number;
  /** Only a hit of at least this tier makes the ball hot (Vari-Target: a smash). */
  hotTier?: number;
  /** +points per different part type the ball has hit this ball, up to `varietyCap`. */
  variety?: number;
  varietyCap?: number;
  /** Jackpot: pays `per` more for every scoring hit this ball (up to `cap`), then starts again. */
  jackpot?: { per: number; cap: number };
  /** Piggy Bank: each hit stores $1 (up to `cap`); a hit of tier `breakTier` or more breaks it and pays `x` times what it holds. */
  piggy?: { cap: number; breakTier: number; x: number };
  /** Lights every Lamp on the table (a completed bank set, the Disco Ball). */
  lightsLamps?: boolean;
  /** X Lane: also lights the next dark Lane Rollover. */
  lightsLane?: boolean;
  /** Seconds this part is dark after it fires (no repeats from a ball rattling over it). */
  cooldown?: number;
  /** Fires at most this many times a ball. */
  perBall?: number;
  /** Ball Saver: $ paid when it saves a ball. */
  saveMoney?: number;
  /** Lamp: what lighting it pays, once a ball. */
  onLight?: { points: number; mult: number };
}

/** One step of a vari-target: balls at least `from` fast (scaled by the part's Stiffness) pay `x` times. */
export interface HitTier {
  from: number;
  x: number;
  name: string;
}

export const VARI_TIERS: HitTier[] = [
  { from: 0, x: 1, name: 'soft' },
  { from: 12, x: 2, name: 'firm' },
  { from: 28, x: 4, name: 'hard' },
  { from: 50, x: 8, name: 'smash' },
];
const PIGGY_TIERS: HitTier[] = [
  { from: 0, x: 1, name: 'tap' },
  { from: 30, x: 1, name: 'smash' },
];

/** The tier a ball of this speed reaches on this part (the Stiffness dial and Target Practice scale how fast it must be). */
export function tierOf(inst: PartInstance, speed: number, ease = 1): HitTier | null {
  const tiers = PARTS[inst.def].recipe.tiers;
  if (!tiers) return null;
  const stiff = PARTS[inst.def].dials.some((d) => d.id === 'stiff') ? dialValue(inst, 'stiff') : 1;
  let best = tiers[0];
  for (const t of tiers) if (speed >= t.from * stiff * ease) best = t;
  return best;
}

export type Shape = { type: 'circle'; r: number } | { type: 'box'; hw: number; hh: number };

export interface PartDef {
  id: PartId;
  name: string;
  blurb: string;
  kind: PartKind;
  rarity: Rarity;
  tags: PartTag[];
  cost: number;
  /** Relative chance of appearing in the shop, within its rarity. 0 = never sold (Big Boi comes with the machine). */
  weight: number;
  shape: Shape;
  rotatable: boolean;
  /** Ball speed added per point of the Bounce dial (bumpers and kickers). */
  kickUnit: number;
  recipe: Recipe;
  dials: DialDef[];
}

const kickDial = (def: number, tradeoff = 'How hard it bounces the ball back. Softer pays more per hit; harder sends the ball farther.', ends: [string, string] = ['soft, pays more', 'hard, pays less']): DialDef => ({
  id: 'kick', label: 'Bounce', min: 0, max: 4, step: 0.25, default: def, tradeoff, ends,
  // neutral at the default, so the numbers printed in the recipe are the numbers you get
  payoff: (v) => 1 + 0.25 * (def - v),
  fmt: (v) => v.toFixed(2),
});
const powerDial = (what: string): DialDef => ({
  id: 'power', label: 'Power', min: 30, max: 110, step: 5, default: 70,
  tradeoff: 'Decides where the ball lands. Rotate the part to aim it.', ends: [`gentle ${what}`, `strong ${what}`], fmt: (v) => String(v),
});

export const PARTS: Record<PartId, PartDef> = {
  // ---- common: from round 1 ----
  pop: {
    id: 'pop', name: 'Pop Bumper', blurb: 'Classic. Goes pop.', kind: 'bumper', rarity: 'common', tags: ['bumper'], cost: 3, weight: 3,
    shape: { type: 'circle', r: 1.2 }, rotatable: false, kickUnit: 14,
    recipe: { points: 100, per: 'hit', grow: 5, growCap: 100, perLevel: 10 }, dials: [kickDial(2)],
  },
  coin: {
    id: 'coin', name: 'Cha-Ching Bumper', blurb: 'Pays $1 per bonk. Tips in points.', kind: 'bumper', rarity: 'common', tags: ['bumper', 'money'], cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.0 }, rotatable: false, kickUnit: 12,
    recipe: { points: 40, per: 'hit', money: 1, moneyCap: 5, perLevel: 8 }, dials: [kickDial(2)],
  },
  sling: {
    id: 'sling', name: 'Slingshot', blurb: 'A rubber band with opinions.', kind: 'kicker', rarity: 'common', tags: ['kicker'], cost: 3, weight: 2,
    shape: { type: 'box', hw: 1.7, hh: 0.4 }, rotatable: true, kickUnit: 16,
    recipe: { points: 30, per: 'hit', hot: 0.5, perLevel: 6 }, dials: [kickDial(3, 'How hard it snaps the ball away. Softer pays more per hit; harder throws it across the table.')],
  },
  spinner: {
    id: 'spinner', name: 'Spinner', blurb: 'Whee. Faster ball, more whee.', kind: 'spinner', rarity: 'common', tags: ['kicker'], cost: 3, weight: 2,
    shape: { type: 'box', hw: 1.4, hh: 0.3 }, rotatable: true, kickUnit: 0,
    recipe: { points: 10, per: 'spin', spinMult: 0.01, spinMultCap: 0.75, perLevel: 2 },
    dials: [{
      id: 'drag', label: 'Drag', min: 0, max: 3, step: 0.25, default: 1,
      tradeoff: 'A heavier spinner pays more per spin, but slows the ball down more.', ends: ['light, pays less', 'heavy, slows the ball'],
      payoff: (v) => 1 + 0.25 * v, fmt: (v) => v.toFixed(2),
    }],
  },
  lane: {
    id: 'lane', name: 'Lane Rollover', blurb: 'Roll over it. It lights up. Cheap thrills.', kind: 'rollover', rarity: 'common', tags: ['light'], cost: 3, weight: 3,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 50, per: 'roll-over', lights: true, setBonus: { points: 200, mult: 0.5 }, setCap: 5, perLevel: 10 }, dials: [],
  },
  lamp: {
    id: 'lamp', name: 'Lamp', blurb: 'Light it up and the neighbours score more.', kind: 'lamp', rarity: 'common', tags: ['light'], cost: 4, weight: 2,
    shape: { type: 'circle', r: 0.8 }, rotatable: false, kickUnit: 0,
    recipe: { lights: true, onLight: { points: 50, mult: 0.1 } },
    dials: [{
      id: 'radius', label: 'Glow radius', min: 3, max: 8, step: 0.5, default: 5,
      tradeoff: 'A wider glow reaches more parts, but gives each a smaller bonus.', ends: ['tight, bigger bonus', 'wide, smaller bonus'], fmt: (v) => `${v.toFixed(1)}`,
    }],
  },
  vari: {
    id: 'vari', name: 'Vari-Target', blurb: 'Tap it, get peanuts. Smash it, get paid.', kind: 'target', rarity: 'common', tags: ['target'], cost: 4, weight: 2,
    shape: { type: 'box', hw: 1.3, hh: 0.35 }, rotatable: true, kickUnit: 0,
    recipe: { points: 40, per: 'hit', tiers: VARI_TIERS, hot: 0.5, hotTier: 3, perLevel: 8 },
    dials: [{
      id: 'stiff', label: 'Stiffness', min: 0.5, max: 2, step: 0.25, default: 1,
      tradeoff: 'A stiffer target needs a harder hit for every tier, but pays more once you get there.', ends: ['soft, easy tiers', 'stiff, pays more'],
      payoff: (v) => 1 + 0.5 * (v - 1), fmt: (v) => v.toFixed(2),
    }],
  },
  deflector: {
    id: 'deflector', name: 'Deflector', blurb: 'A bouncy bar. Steers everything, and a bank shot pays.', kind: 'deflector', rarity: 'common', tags: ['kicker'], cost: 1, weight: 2,
    shape: { type: 'box', hw: 2.2, hh: 0.28 }, rotatable: true, kickUnit: 0, recipe: { hot: 0.25 }, dials: [],
  },
  kickback: {
    id: 'kickback', name: 'Kickback', blurb: 'Roll over it and it boots the ball right back. Once per ball.', kind: 'kickback', rarity: 'common', tags: ['kicker', 'guard'], cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: true, kickUnit: 0,
    recipe: { points: 150, per: 'kick', hot: 0.5, perLevel: 30 }, dials: [powerDial('kick')],
  },

  // ---- uncommon: from round 2 ----
  bank: {
    id: 'bank', name: 'Drop-Target Bank', blurb: 'Three targets. They go down. They come back. The lamps cheer.', kind: 'bank', rarity: 'uncommon', tags: ['target'], cost: 5, weight: 2,
    shape: { type: 'box', hw: 2.6, hh: 0.45 }, rotatable: true, kickUnit: 0,
    recipe: { points: 60, per: 'target', setBonus: { points: 300, mult: 0.3 }, setCap: 5, lightsLamps: true, perLevel: 12 }, dials: [],
  },
  uplight: {
    id: 'uplight', name: 'Level Light', blurb: 'Light them all and your bumpers level up.', kind: 'rollover', rarity: 'uncommon', tags: ['light'], cost: 5, weight: 2,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 10, per: 'pass', levelUp: true },
    dials: [{
      id: 'target', label: 'Levels up', min: 0, max: LEVEL_TARGETS.length - 1, step: 1, default: 0,
      tradeoff: 'Which part type this light upgrades. Lights aimed at different types complete separately.', ends: ['Pop Bumpers', 'Big Bois'],
      fmt: (v) => PARTS[LEVEL_TARGETS[Math.round(v)] ?? 'pop'].name,
    }],
  },
  saver: {
    id: 'saver', name: 'Ball Saver', blurb: 'Drain early? The machine pretends it never happened. And tips you.', kind: 'saver', rarity: 'uncommon', tags: ['guard', 'money'], cost: 5, weight: 1,
    shape: { type: 'circle', r: 0.8 }, rotatable: false, kickUnit: 0, recipe: { saveMoney: 1 }, dials: [],
  },
  flipper: {
    id: 'flipper', name: 'Extra Flipper', blurb: 'Because two hands were never enough.', kind: 'flipper', rarity: 'uncommon', tags: ['guard'], cost: 6, weight: 1,
    shape: { type: 'circle', r: 2.6 }, rotatable: false, kickUnit: 0,
    recipe: {},
    dials: [{
      id: 'side', label: 'Button', min: 0, max: 1, step: 1, default: 0,
      tradeoff: 'Which flipper key works it: Left (←) or Right (→).', ends: ['Left (←)', 'Right (→)'], fmt: (v) => (v >= 0.5 ? 'Right' : 'Left'),
    }],
  },
  ding: {
    id: 'ding', name: 'Ding-Dong Bell', blurb: 'Rings louder for a well-travelled ball.', kind: 'bumper', rarity: 'uncommon', tags: ['bumper'], cost: 5, weight: 2,
    shape: { type: 'circle', r: 1.15 }, rotatable: false, kickUnit: 11,
    recipe: { points: 60, per: 'hit', variety: 40, varietyCap: 400, perLevel: 12 }, dials: [kickDial(2)],
  },
  piggy: {
    id: 'piggy', name: 'Piggy Bank', blurb: 'Feed it coins. Then smash it.', kind: 'target', rarity: 'uncommon', tags: ['target', 'money'], cost: 5, weight: 2,
    shape: { type: 'box', hw: 1.1, hh: 0.55 }, rotatable: true, kickUnit: 0,
    recipe: { points: 25, per: 'hit', tiers: PIGGY_TIERS, piggy: { cap: 6, breakTier: 1, x: 2 }, perLevel: 5 }, dials: [],
  },
  magnet: {
    id: 'magnet', name: 'Mag-Grab', blurb: 'Grabs the ball, charges up, lets go. Very rude.', kind: 'saucer', rarity: 'uncommon', tags: ['ball', 'guard'], cost: 6, weight: 1,
    shape: { type: 'circle', r: 1.3 }, rotatable: true, kickUnit: 0,
    recipe: { points: 120, per: 'grab', mult: 0.2, multCap: 1, perLevel: 25 },
    dials: [
      { id: 'hold', label: 'Hold', min: 0.2, max: 1.5, step: 0.1, default: 0.5, tradeoff: 'Holding longer pays more, but that ball sits out of play meanwhile.', ends: ['quick, back in play', 'long, pays more'], payoff: (v) => 1 + 0.6 * (v - 0.5), fmt: (v) => `${v.toFixed(1)} s` },
      powerDial('throw'),
    ],
  },

  // ---- rare: from round 4 ----
  printer: {
    id: 'printer', name: 'Ball Printer', blurb: 'Eats one ball. Prints two. Allegedly legal.', kind: 'saucer', rarity: 'rare', tags: ['ball'], cost: 7, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: true, kickUnit: 0,
    recipe: { points: 200, per: 'ball caught', spawn: 1, printCap: 4, perLevel: 40 },
    dials: [
      {
        id: 'hold', label: 'Hold', min: 0.2, max: 2, step: 0.1, default: 0.6,
        tradeoff: 'Holding longer pays more, but that ball sits out of play meanwhile.', ends: ['quick, back in play', 'long, pays more'],
        payoff: (v) => 1 + 0.5 * (v - 0.6), fmt: (v) => `${v.toFixed(1)} s`,
      },
      { ...powerDial('eject'), label: 'Eject power' },
    ],
  },
  thunder: {
    id: 'thunder', name: 'Thunder Bumper', blurb: 'The big one. Every bonk shakes the Pops awake.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 8, weight: 2,
    shape: { type: 'circle', r: 1.55 }, rotatable: false, kickUnit: 19,
    recipe: { points: 300, per: 'hit', feeds: { id: 'pop', n: 3 }, mult: 0.05, multCap: 1, perLevel: 50 }, dials: [kickDial(2)],
  },
  jackpot: {
    id: 'jackpot', name: 'Jackpot Scoop', blurb: 'Every hit fills the pot. Sink it to cash in.', kind: 'saucer', rarity: 'rare', tags: ['ball'], cost: 8, weight: 2,
    shape: { type: 'circle', r: 1.35 }, rotatable: true, kickUnit: 0,
    recipe: { points: 500, per: 'scoop', jackpot: { per: 40, cap: 6000 }, perLevel: 100 },
    dials: [{ id: 'hold', label: 'Hold', min: 0.4, max: 1.5, step: 0.1, default: 0.8, tradeoff: 'How long it keeps the ball before it fires it back out.', ends: ['quick', 'slow'], fmt: (v) => `${v.toFixed(1)} s` }, powerDial('eject')],
  },
  xlane: {
    id: 'xlane', name: 'X Lane', blurb: 'Roll through it and your Mult multiplies.', kind: 'rollover', rarity: 'rare', tags: ['light'], cost: 9, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: false, kickUnit: 0,
    recipe: { xmult: 1.25, xmultCap: 2, cooldown: 3, lightsLane: true }, dials: [],
  },

  // ---- legendary: from round 7 ----
  golden: {
    id: 'golden', name: 'Golden Bumper', blurb: 'Solid gold. Pays in points, Mult and cash.', kind: 'bumper', rarity: 'legendary', tags: ['bumper', 'money'], cost: 12, weight: 2,
    shape: { type: 'circle', r: 1.5 }, rotatable: false, kickUnit: 15,
    recipe: { points: 600, per: 'hit', xmult: 1.05, xmultCap: 2, moneyEvery: { n: 5, cap: 5 }, perLevel: 100 }, dials: [kickDial(2)],
  },
  disco: {
    id: 'disco', name: 'Disco Ball', blurb: 'Once a ball: everything lights up and the Mult doubles.', kind: 'rollover', rarity: 'legendary', tags: ['light'], cost: 11, weight: 2,
    shape: { type: 'circle', r: 1.25 }, rotatable: false, kickUnit: 0,
    recipe: { points: 1000, per: 'pass', xmult: 2, perBall: 1, lightsLamps: true, perLevel: 150 }, dials: [],
  },

  // ---- not for sale: every machine has one Big Boi in the middle, and what he does depends on the machine ----
  mega: {
    id: 'mega', name: 'Big Boi', blurb: 'Heavy, rude, hard to miss.', kind: 'bumper', rarity: 'legendary', tags: ['bumper'], cost: 6, weight: 0,
    shape: { type: 'circle', r: 1.9 }, rotatable: false, kickUnit: 18,
    recipe: { points: 250, per: 'hit', mult: 0.15, multCap: 3, perLevel: 25 }, dials: [kickDial(1.5)],
  },
};

export const PART_IDS = Object.keys(PARTS) as PartId[];
/** The parts the shop can sell. */
export const SHOP_IDS = PART_IDS.filter((id) => PARTS[id].weight > 0);
export const hasTag = (id: PartId, tag: PartTag) => PARTS[id].tags.includes(tag);

/**
 * How likely the shop is to show a part of this rarity in this round (times the part's own weight): commons are
 * always there, uncommons from round 2, rares from round 4 and legendaries from round 7, each growing more likely.
 */
export function rarityWeight(r: Rarity, round: number): number {
  switch (r) {
    case 'common': return 1;
    case 'uncommon': return round < 2 ? 0 : Math.min(1, 0.4 + 0.12 * (round - 2));
    case 'rare': return round < 4 ? 0 : Math.min(0.8, 0.2 + 0.08 * (round - 4));
    case 'legendary': return round < 7 ? 0 : Math.min(0.45, 0.1 + 0.05 * (round - 7));
  }
}
/** The round a rarity first shows up in the shop. */
export const RARITY_FROM: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 4, legendary: 7 };

// ---- instances ----------------------------------------------------------------------------------------

export interface PartInstance {
  uid: number;
  def: PartId;
  x: number;
  y: number;
  /** Radians, counter-clockwise. Rotatable parts only. */
  angle: number;
  dials: Record<string, number>;
  /** false = in the inventory, off the board. */
  placed: boolean;
  /** Bought or granted since the round started: the inventory marks it NEW until you place it or start the round. */
  fresh?: boolean;
  /** Part of every machine (the Big Boi in the middle): it cannot be moved, stored or sold. */
  fixed?: boolean;
}

export function defaultDials(def: PartDef): Record<string, number> {
  return Object.fromEntries(def.dials.map((d) => [d.id, d.default]));
}

export function makePart(id: PartId, uid: number, x = 0, y = 0, placed = false): PartInstance {
  return { uid, def: id, x, y, angle: 0, dials: defaultDials(PARTS[id]), placed };
}

/** Radius of the circle that covers the part, for overlap checks. */
export function footprint(def: PartDef): number {
  return def.shape.type === 'circle' ? def.shape.r : Math.hypot(def.shape.hw, def.shape.hh);
}

/** Product of the payoff multipliers of all of the part's dials. */
export function dialFactor(inst: PartInstance): number {
  let f = 1;
  for (const d of PARTS[inst.def].dials) if (d.payoff) f *= d.payoff(inst.dials[d.id] ?? d.default);
  return f;
}

export function lampBonus(radius: number): number {
  return Math.round((0.5 - 0.05 * radius) * 100) / 100;
}

/** A lamp's reach and bonus for its Glow dial setting, with the run's Bright Lamps upgrades. */
export function lampStats(dialRadius: number, mods: Pick<Mods, 'lampRadius' | 'lampBonus'> = neutralMods()): { radius: number; bonus: number } {
  return { radius: dialRadius + mods.lampRadius, bonus: Math.round((lampBonus(dialRadius) + mods.lampBonus) * 100) / 100 };
}

/** The +points a part's `grow` has added after `hits` hits of its type this ball (never more than its `growCap`). */
export function grownPoints(r: Recipe, hits: number): number {
  const g = (r.grow ?? 0) * hits;
  return r.growCap !== undefined ? Math.min(g, r.growCap) : g;
}

/**
 * What the run's decals (and the boss) multiply a part's base points by: Overclock for its type, a heavy ball for
 * everything, a tag bonus (Bumper Car, Target Practice) or its catch, and Big Boi's fan club.
 */
export function modFactor(id: PartId, mods: Pick<Mods, 'overclock' | 'pointsFactor' | 'tagFactor' | 'untaggedFactor' | 'bigBoiX'> = neutralMods()): number {
  let f = (1 + (mods.overclock[id] ?? 0)) * mods.pointsFactor;
  let tagged = false;
  for (const t of PARTS[id].tags) {
    const x = mods.tagFactor[t];
    if (x !== undefined) { f *= x; tagged = true; }
  }
  if (!tagged) f *= mods.untaggedFactor;
  if (id === 'mega') f *= mods.bigBoiX;
  return f;
}

/** The level a part type counts as: its own (Level Lights) plus what the decals add. */
export function effectiveLevel(id: PartId, own: number, mods: Pick<Mods, 'levelBonus' | 'levelAll'> = neutralMods()): number {
  return own + (mods.levelBonus[id] ?? 0) + mods.levelAll;
}

export function sellPrice(def: PartDef, rate = 0.5): number {
  return Math.floor(def.cost * rate);
}

export const dialValue = (inst: PartInstance, id: string): number =>
  inst.dials[id] ?? PARTS[inst.def].dials.find((d) => d.id === id)?.default ?? 0;

// ---- plain-language description --------------------------------------------------------------------------

export interface DescLine {
  tag: 'score' | 'grow' | 'mult' | 'money' | 'set' | 'spawn' | 'lamp' | 'level' | 'note' | 'combo';
  text: string;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * How this part scores, in sentences. Reads the same data the scorer reads, and the instance's dials
 * when given, so the numbers always match what will actually happen.
 */
export interface DescribeCtx {
  /** The run's level for this part type (its own, before decals). */
  level?: number;
  /** The run's decals and boss; the numbers in the sentences include them. */
  mods?: Mods;
  /** The machine, for Big Boi (his ability depends on it). */
  machine?: MachineId;
}

export function describe(def: PartDef, inst?: PartInstance, ctx: DescribeCtx = {}): DescLine[] {
  const mods = ctx.mods ?? neutralMods();
  const level = effectiveLevel(def.id, ctx.level ?? 0, mods);
  const r = def.id === 'mega' ? bigBoiOf(ctx.machine).recipe : def.recipe;
  const lines: DescLine[] = [];
  const factor = (inst ? dialFactor(inst) : 1) * modFactor(def.id, mods);
  const setPts = r.setBonus ? r.setBonus.points * mods.setFactor : 0, setMult = r.setBonus ? r.setBonus.mult * mods.setFactor : 0;
  const f = (n: number) => num(Math.round(n * factor * 100) / 100);
  const mg = (n: number) => num(n * mods.multGain);
  const xg = (x: number) => num(1 + (x - 1) * mods.multGain);

  const lvlBonus = (r.perLevel ?? 0) * level;
  if (r.points) lines.push({ tag: 'score', text: `Scores ${f(r.points + lvlBonus)} per ${r.per ?? 'hit'}.` });
  const upg = modFactor(def.id, mods);
  if (r.points && Math.abs(upg - 1) > 0.001) lines.push({ tag: 'level', text: `Your decals multiply its points by ${num(upg)}.` });
  if (r.grow) lines.push({ tag: 'grow', text: `Grows: +${num(r.grow * factor)} for every ${def.name} hit this ball (all ${def.name}s share it)${r.growCap ? `, up to +${num(r.growCap * factor)}` : ''}.` });
  if (r.feeds) lines.push({ tag: 'grow', text: `Every hit counts as ${r.feeds.n} ${PARTS[r.feeds.id].name} hits for their growth this ball.` });
  if (r.mult) lines.push({ tag: 'mult', text: `Raises your Mult by +${mg(r.mult)} per ${r.per ?? 'hit'}${r.multCap ? `, up to +${mg(r.multCap)} a ball from all ${def.name}s` : ''}.` });
  if (r.xmult && !r.perBall) lines.push({ tag: 'mult', text: `Multiplies your Mult by ×${xg(r.xmult)} per ${r.per ?? 'hit'}${r.xmultCap ? `, up to ×${xg(r.xmultCap)} a ball from all ${def.name}s` : ''}.` });
  if (r.xmult && r.perBall) lines.push({ tag: 'mult', text: `Doubles your Mult (×${xg(r.xmult)}) the first time a ball rolls over it each ball.` });
  if (r.spinMult) lines.push({ tag: 'mult', text: `Every spin raises your Mult by +${mg(r.spinMult * mods.spinMult)}, up to +${mg((r.spinMultCap ?? 0) * mods.spinMult)} a ball from all Spinners.` });
  if (r.money && !mods.noCoins) lines.push({ tag: 'money', text: `Pays $${r.money} per ${r.per ?? 'hit'}${r.moneyCap ? `, up to $${r.moneyCap} a round from all ${def.name}s` : ''}.` });
  if (r.moneyEvery && !mods.noCoins) lines.push({ tag: 'money', text: `Pays $1 every ${r.moneyEvery.n} hits, up to $${r.moneyEvery.cap} a round.` });
  if (r.variety) lines.push({ tag: 'grow', text: `+${f(r.variety)} for every different part type this ball has hit (up to +${f(r.varietyCap ?? 0)}): a varied table rings loudest.` });
  if (r.jackpot) lines.push({ tag: 'set', text: `The pot: +${f(r.jackpot.per)} for every scoring hit this ball (up to +${f(r.jackpot.cap)}). Sink the ball in it to cash the pot, then it starts again.` });
  if (r.piggy) lines.push({ tag: 'money', text: `Every hit drops $1 in the piggy (it holds $${r.piggy.cap}). Smash it (speed ${num(30 * mods.tierEase)}+) to break it: it pays ${r.piggy.x}× what it holds. Whatever is left in it at the end of a round is lost.` });
  if (r.hot) {
    const when = r.hotTier !== undefined ? 'A smash hit makes' : r.points ? 'Every hit makes' : 'A ball that bounces off it is';
    lines.push({ tag: 'combo', text: `Hot Shot: ${when}${r.points || r.hotTier !== undefined ? ' the ball hot:' : ' hot:'} its next scoring hit within ${HOT_WINDOW} s pays +${Math.round(r.hot * mods.hotFactor * 100)}%.` });
  }
  if (def.kind === 'lamp') {
    const lamp = lampStats(inst ? dialValue(inst, 'radius') : 5, mods);
    lines.push({ tag: 'lamp', text: `Roll a ball over it to light it for this ball. While lit, every scoring part within ${num(lamp.radius)} units scores +${Math.round(lamp.bonus * 100)}%.` });
    if (r.onLight) lines.push({ tag: 'mult', text: `Lighting it pays ${f(r.onLight.points)} points and +${mg(r.onLight.mult)} Mult.` });
  }
  if (r.lights && def.kind === 'rollover') lines.push({ tag: 'note', text: 'Lights up for the rest of this ball.' });
  if (def.id === 'lane') lines.push({ tag: 'note', text: 'Lane change: each flipper press shifts the lit lanes one lane (← left, → right), so you can steer the dark one.' });
  if (r.tiers && def.id === 'vari') {
    const stiff = (inst ? dialValue(inst, 'stiff') : 1) * mods.tierEase;
    lines.push({ tag: 'note', text: `Pays more for a harder hit: ${r.tiers.map((t) => `x${t.x} ${t.name}${t.from ? ` (${num(t.from * stiff)}+ speed)` : ''}`).join(', ')}.` });
  }
  if (r.setBonus && def.kind === 'rollover') lines.push({ tag: 'set', text: `Light every Lane Rollover on the board (you need at least two): +${num(setPts)} points and +${mg(setMult)} Mult, then they reset. It pays at most ${r.setCap} times a ball.` });
  if (def.kind === 'bank') lines.push({ tag: 'set', text: `Each target you hit drops. Drop all three: +${num(setPts)} points and +${mg(setMult)} Mult, then they pop back up (and every new ball). It pays at most ${r.setCap} times a ball.` });
  if (r.lightsLamps) lines.push({ tag: 'lamp', text: def.kind === 'bank' ? 'A full set also lights every Lamp on the table.' : 'It also lights every Lamp on the table.' });
  if (r.lightsLane) lines.push({ tag: 'note', text: 'It also lights the next dark Lane Rollover.' });
  if (r.cooldown) lines.push({ tag: 'note', text: `Goes dark for ${r.cooldown} s after it fires.` });
  if (r.levelUp) {
    const t = PARTS[LEVEL_TARGETS[Math.round(inst ? dialValue(inst, 'target') : 0)] ?? 'pop'];
    lines.push({ tag: 'level', text: `Roll over it to light it; roll over it again and it goes out. Light every Level Light aimed at ${t.name}s (you need at least two) to level them up for the rest of the run, then the lights reset.` });
  }
  if (r.spawn) {
    const n = r.spawn + mods.printerExtra;
    lines.push({ tag: 'spawn', text: `Prints ${n === 1 ? 'a second ball' : `${n} more balls`} when it catches one (at most ${r.printCap} printed in one ball, and 4 on the table).` });
  }
  if (def.kind === 'saucer') {
    const hold = inst ? dialValue(inst, 'hold') : PARTS[def.id].dials[0]?.default ?? 0.6, pw = inst ? dialValue(inst, 'power') : 70;
    lines.push({ tag: 'note', text: `${def.id === 'magnet' ? 'Grabs a ball that comes close and holds it' : 'Holds the ball'} ${num(hold)} s, then fires it out with power ${pw}. Rotate to aim.` });
  }
  if (def.kind === 'spinner') lines.push({ tag: 'note', text: `A faster ball spins it more (1 to ${Math.round(10 * mods.spinBoost)} spins), and it slows the ball down.` });
  if (def.kind === 'flipper') {
    const side = inst ? dialValue(inst, 'side') : 0;
    lines.push({ tag: 'note', text: `A flipper worked by the ${side >= 0.5 ? 'Right (→)' : 'Left (←)'} key. Scores nothing itself.` });
  }
  if (def.kind === 'deflector') lines.push({ tag: 'note', text: 'Scores nothing itself. A bouncy bar that bends the ball\'s path.' });
  if (def.kind === 'kickback') {
    const pw = inst ? dialValue(inst, 'power') : 70, n = mods.kickbackCharges;
    lines.push({ tag: 'note', text: `Armed at the start of every ball. The first ${n === 1 ? 'time' : `${n} times`} a ball rolls over it, it fires the ball out with power ${pw}, then goes dark until the next ball. Rotate to aim.` });
  }
  if (def.kind === 'saver') {
    lines.push({ tag: 'note', text: `For ${SAVER_WINDOW} s after you launch a ball, a drain sends it back to the plunger instead, and the ball is not spent. Each Ball Saver on the board saves one drain per ball.` });
    if (r.saveMoney && !mods.noCoins) lines.push({ tag: 'money', text: `Pays $${r.saveMoney} every time it saves a ball.` });
  }
  if (def.id === 'mega') lines.push(...bigBoiLines(ctx.machine, factor, mods));
  return lines;
}

/** Big Boi's ability, in sentences. */
function bigBoiLines(machine: MachineId | undefined, factor: number, mods: Mods): DescLine[] {
  const b = bigBoiOf(machine);
  const xg = (x: number) => num(1 + (x - 1) * mods.multGain);
  switch (b.id) {
    case 'foreman': return [{ tag: 'note', text: 'Overtime: the Foreman is the Mult engine of the Funhouse Factory. Every machine has one Big Boi; he is not for sale.' }];
    case 'cook': return [
      { tag: 'combo', text: `Order Up! He calls an order: one part type on your table (it glows). Hits on that type pay ×${ORDER.x}. Every ${ORDER.serves} order hits serve it: +${num(ORDER.mult * mods.multGain)} Mult (up to +${num(ORDER.multCap * mods.multGain)} a ball) and a new order. Hit him to change the order.` },
      { tag: 'note', text: 'A focused table (few types, many of each) fills orders fastest.' },
    ];
    case 'dragon': return [
      { tag: 'combo', text: `Siege: he wears ${DRAGON.armour} armour plates. Every hit knocks one off; knock off the last and he is slain: ${num(Math.round(b.recipe.points! * DRAGON.jackpotX * factor))}-point jackpot and your Mult ×${xg(DRAGON.xmult)}. His armour grows back ${DRAGON.regrow} plates thicker each time (at most ${DRAGON.maxSlays} slays a ball).` },
      { tag: 'note', text: 'Aim at him: deflectors and kickbacks that point at the middle pay off here.' },
    ];
  }
}
