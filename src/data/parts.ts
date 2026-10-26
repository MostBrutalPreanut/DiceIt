/**
 * Content as data: every part is a row here. The sim reads shape, kind and kick, the scorer reads
 * the recipe, the renderer reads shape and kind (every colour comes from the theme), and the UI reads
 * `describe()`, which turns the same recipe into plain sentences so "how does this thing score?" can
 * never drift from what it actually does.
 */
import { SAVER_WINDOW, SPARK_FADE, SPARK_GLOW } from '../sim/constants';
import { neutralMods, type Mods } from './mods';
import { bigBoiOf, DRAGON, ORDER, type MachineId } from './bigboi';

/** How long a spark lasts, all told. */
const SPARK_LIFE = SPARK_GLOW + SPARK_FADE;

export type PartId =
  | 'pop' | 'coin' | 'mega' | 'sling' | 'spinner' | 'lane' | 'printer' | 'flipper' | 'lamp' | 'deflector' | 'uplight' | 'bank' | 'kickback' | 'saver' | 'vari'
  | 'ding' | 'piggy' | 'magnet' | 'thunder' | 'jackpot' | 'xlane' | 'golden' | 'disco' | 'trophy' | 'plate' | 'fame'
  | 'flipperR' | 'duck' | 'goal' | 'strip' | 'roller' | 'rank' | 'bell' | 'tesla' | 'keg' | 'laser' | 'gong'
  | 'ruby' | 'garnet' | 'emerald' | 'opal' | 'goldleaf' | 'redseal' | 'topaz'
  | 'sparkler' | 'firecracker' | 'rocks';
export type PartKind = 'bumper' | 'kicker' | 'deflector' | 'spinner' | 'rollover' | 'saucer' | 'flipper' | 'lamp' | 'bank' | 'kickback' | 'saver' | 'target'
  | 'mover' | 'goal' | 'strip' | 'inlay';

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
export type PartTag = 'bigboi' | 'bumper' | 'target' | 'light' | 'kicker' | 'ball' | 'guard' | 'money';
export const TAG_NAMES: Record<PartTag, string> = { bigboi: 'Big Boi', bumper: 'Bumper', target: 'Target', light: 'Light', kicker: 'Kicker', ball: 'Ball', guard: 'Guard', money: 'Money' };

/** Part levels (Space Cadet's bumper upgrades): Level Lights and decals raise them, for the rest of the run. */
export const MAX_LEVEL = 10;
/** A Level Light's reach: lights this close to each other work as one group, and level up the bumpers this close to them. */
export const LEVEL_RADIUS = 5.5;
/** How long a Lamp's +% lasts after a full-table light-up (a drop-target set lights every Lamp for this long; the Disco Ball longer). */
export const LAMP_FLASH = 5;
/** Extra flippers are this much shorter than the two at the bottom. */
export const SMALL_FLIPPER = 0.7;
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
  /** A Level Light: toggles on each pass; a lit group of them levels up the bumpers around it. */
  levelUp?: boolean;
  /** Lane Rollover: this many lit lanes complete a set. */
  setSize?: number;
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
  /** Piggy Bank: each hit stores $1 (up to `cap`); a hit of tier `breakTier` or more breaks it and pays what it holds plus `bonus`. */
  piggy?: { cap: number; breakTier: number; bonus: number };
  /** Lights every Lamp on the table at full glow for this many seconds (a completed bank set, the Disco Ball). */
  lightsLamps?: number;
  /** X Lane: also lights the next dark Lane Rollover. */
  lightsLane?: boolean;
  /** Seconds this part is dark after it fires (no repeats from a ball rattling over it). */
  cooldown?: number;
  /** Fires at most this many times a ball. */
  perBall?: number;
  /** Ball Saver: $ paid at the end of a round it never had to save a ball in. */
  unusedPay?: number;
  /** Lamp: each hit brightens it one step (up to `steps`), paying `points`. */
  brighten?: { points: number; steps: number };
  /** Trophy Cup: every hit polishes it by `per`, up to `cap`; its polish is Mult every ball starts with, for the rest of the run. */
  keep?: { per: number; cap: number };
  /** Duck Gallery: each hit on the duck makes it this much faster for the rest of the ball (up to `max` times its speed). */
  speedUp?: { by: number; max: number };
  /** Goal: what a goal pays on top of its points (×Mult, capped a ball). */
  goal?: { xmult: number; xmultCap: number };
  /** Roller Pop: a hit near either end of its rail (the outer `edge` of its travel) pays `x` times. */
  edgeShot?: { edge: number; x: number };
  /** Glow Strip: lights for `seconds` after any bonus anywhere, and while lit every part standing on it pays +`bonus`. */
  strip?: { seconds: number; bonus: number; reach: number };
  /** Power Plate: a floor plate; every bumper standing within `reach` of it pays `x` times (plates multiply). */
  plate?: { x: number; reach: number };
  /** Hall of Fame: once a ball, the Mult is multiplied by (1 + typeX) for every different part type on the table. */
  typeX?: number;
  /**
   * Rank Lights: light every light of a pack and the ball that lit the last one ranks up a step: every hit it makes
   * pays `steps[rank - 1]` times, for `seconds`. Lighting the set again moves it up (or starts the time again at the
   * top); a drain loses it.
   */
  rank?: { steps: number[]; seconds: number };
  /** Old Bell: its first hit each round pays `first` instead of its points and adds a notch; at `notches` it rings, and every ball's Mult is ×`x` for the rest of the run. */
  bell?: { first: number; notches: number; x: number };
  /**
   * Tesla Coil: every hit arcs lightning to the `arcs` nearest parts that can be zapped (one more every `perLevels`
   * levels, up to `maxArcs`), and each scores as if the ball had hit it. A zap never arcs on.
   */
  zap?: { arcs: number; perLevels: number; maxArcs: number };
  /**
   * Powder Keg: a hit lights the fuse, and `fuse` seconds later it blows: `blast` points, and every part within
   * `radius` is zapped. A blast lights the other kegs it reaches, at most `chain` kegs deep. Spent for `rearm` s after.
   */
  keg?: { fuse: number; radius: number; blast: number; chain: number; rearm: number; sparks?: number };
  /** Sparkler: a ball's hit shoots out `n` sparks, then it needs `cooldown` s. */
  sparks?: { n: number; cooldown: number };
  /** Rock Pile: a ball's hit drops one spark for every rock in the pile, then it needs `cooldown` s. The pile grows a rock every `every` hits (up to `max`), back to one each round. */
  rocks?: { every: number; max: number; cooldown: number };
  /** Firecracker: once a ball, a hit fires a rocket to the top of the table; `delay` s later it bursts into `n` sparks. */
  rocket?: { n: number; delay: number };
  /** Laser Turret: a hit fires a beam right across the table in a random direction; every part on it is zapped. Dark for `cooldown` s after. */
  beam?: { cooldown: number };
  /** Shockwave Gong: every `every`th hit of a ball booms, and every part on the table is zapped. */
  boom?: { every: number };
  /** An inlay (a gem set into a part on the table), and the parts it fits. What each gem does: see the INLAY constants. */
  gem?: GemFit;
}

/** The parts a gem fits: any that scores when hit, one that fires once a ball, one that goes dark or recharges, one that grows. */
export type GemFit = 'scoring' | 'onceABall' | 'cooldown' | 'growth';
/** What the gems do: a Ruby's part pays ×1.5; a Garnet halves dark and recharge times; Gold Leaf adds +1 a score (up to 5× the part's points); a Red Seal's part is dark this long after its double. */
export const RUBY_X = 1.5;
export const GARNET_X = 0.5;
export const LEAF_CAP = 5;
export const SEAL_DARK = 0.5;
/** Topaz: the chance that a ball's hit on its part drops a spark. */
export const TOPAZ_CHANCE = 0.15;
/** The kinds of part a gem can be set into (never flippers, savers, the Kickback, bars, floor pieces, gems or Big Boi). */
const INLAY_KINDS = new Set<PartKind>(['bumper', 'kicker', 'spinner', 'rollover', 'lamp', 'target', 'saucer', 'mover', 'goal', 'bank']);
const FIT_TEXT: Record<GemFit, string> = {
  scoring: 'any part that scores when the ball hits it (not Big Boi)',
  onceABall: 'a part that fires once a ball (the Disco Ball, Hall of Fame, the Firecracker)',
  cooldown: 'a part that goes dark or recharges (X Lane, Goal!, the Laser Turret, the Powder Keg, the Sparkler, the Rock Pile)',
  growth: 'a part that grows as it is hit (the Pop Bumper, the Duck Gallery, the Trophy Cup)',
};
const GEM_TEXT: Partial<Record<PartId, string>> = {
  ruby: `Its part pays ×${RUBY_X}.`,
  garnet: 'Its part\'s dark or recharge time is halved (X Lane, Goal!, the Laser Turret\'s recharge, the Powder Keg\'s re-arm).',
  emerald: 'Its part fires twice a ball instead of once.',
  opal: 'Every hit on its part counts twice for its growth (the Pops\' growth, the Duck\'s points, the Trophy\'s polish).',
  goldleaf: `Every time its part scores, it is worth +1 more, for the rest of the run (up to +${LEAF_CAP}× its points).`,
  redseal: `Every hit on its part scores twice; then the part is dark for ${SEAL_DARK} s.`,
  topaz: `Every time the ball hits its part, there is a ${Math.round(TOPAZ_CHANCE * 100)}% chance it drops a spark.`,
};

/** Is this a gem (an inlay), not a part that goes on the table? */
export const isInlay = (id: PartId) => PARTS[id].kind === 'inlay';

/** Does this gem fit into this part? */
export function gemFits(gem: PartId, part: PartId): boolean {
  const g = PARTS[gem].recipe.gem, d = PARTS[part], r = d.recipe;
  if (!g || part === 'mega' || !INLAY_KINDS.has(d.kind)) return false;
  switch (g) {
    case 'scoring': return !!r.points;
    case 'onceABall': return !!(r.perBall || r.rocket);
    case 'cooldown': return !!(r.cooldown || r.beam || r.keg || r.sparks || r.rocks);
    case 'growth': return !!(r.grow || r.keep);
  }
}

/** A zapped part cannot be zapped again for this long (seconds). */
export const ZAP_COOLDOWN = 0.5;
/**
 * The parts a zap can hit: the ones a ball scores on by touching them. Not saucers, the goal or the Kickback (they
 * need the ball itself), not a drop-target bank (a zap never moves anything), nor flippers, savers, bars or floor
 * pieces. And never a ×Mult part (X Lane, the Golden Bumper, the Disco Ball, Hall of Fame, Rank Lights): zaps pay
 * points, and a ×Mult stays a shot the ball has to make.
 */
export const zappable = (id: PartId) => {
  const k = PARTS[id].kind, r = PARTS[id].recipe;
  if (r.xmult || r.typeX || r.rank) return false;
  return k === 'bumper' || k === 'kicker' || k === 'spinner' || k === 'rollover' || k === 'lamp' || k === 'target' || k === 'mover';
};

/** The names of the ranks, lowest first (Rank Lights). */
export const RANK_NAMES = ['Silver', 'Gold', 'Diamond'] as const;

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

/** A tri is a triangle pointing up the table (base at -hh, apex at +hh): it kicks the ball upwards. */
export type Shape = { type: 'circle'; r: number } | { type: 'box'; hw: number; hh: number } | { type: 'tri'; hw: number; hh: number };

/** A part with a piece that slides back and forth along its own long axis (the duck, the goalie, the roller). */
export interface Mover {
  /** How far the piece travels each side of the centre. */
  travel: number;
  /** Units a second. */
  speed: number;
  shape: Shape;
  /** Where the piece slides, relative to the part's centre (along y). */
  y: number;
  restitution: number;
  /** Ball speed a hit on it adds, away from it (a moving bumper). */
  kick?: number;
}

export interface PartDef {
  id: PartId;
  name: string;
  blurb: string;
  kind: PartKind;
  rarity: Rarity;
  tags: PartTag[];
  /** What one shop offer costs (for the whole pack). */
  cost: number;
  /** Sold in packs: one offer gives this many (three Lane Rollovers, two Level Lights). */
  pack?: number;
  /** Relative chance of appearing in the shop, within its rarity. 0 = never sold (Big Boi comes with the machine). */
  weight: number;
  /** The shop sells it from this round on, whatever its rarity (the gems: round 7). */
  from?: number;
  shape: Shape;
  rotatable: boolean;
  /** Ball speed added per point of the Bounce dial (bumpers and kickers). */
  kickUnit: number;
  recipe: Recipe;
  dials: DialDef[];
  /** The sliding piece, for the parts that have one. */
  mover?: Mover;
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
    recipe: { points: 20, per: 'hit', grow: 1, growCap: 20, perLevel: 5 }, dials: [kickDial(2)],
  },
  coin: {
    id: 'coin', name: 'Cha-Ching Bumper', blurb: 'Pays $1 per bonk. Tips in points.', kind: 'bumper', rarity: 'common', tags: ['bumper', 'money'], cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.0 }, rotatable: false, kickUnit: 12,
    recipe: { points: 8, per: 'hit', money: 1, moneyCap: 5, perLevel: 2 }, dials: [kickDial(2)],
  },
  sling: {
    id: 'sling', name: 'Slingshot', blurb: 'A rubber band with opinions.', kind: 'kicker', rarity: 'common', tags: ['kicker'], cost: 3, weight: 2,
    shape: { type: 'box', hw: 1.7, hh: 0.4 }, rotatable: true, kickUnit: 16,
    recipe: { points: 6, per: 'hit', hot: 0.5, perLevel: 2 }, dials: [kickDial(3, 'How hard it snaps the ball away. Softer pays more per hit; harder throws it across the table.')],
  },
  spinner: {
    id: 'spinner', name: 'Spinner', blurb: 'Whee. Faster ball, more whee.', kind: 'spinner', rarity: 'common', tags: ['kicker'], cost: 3, weight: 2,
    shape: { type: 'box', hw: 1.4, hh: 0.3 }, rotatable: true, kickUnit: 0,
    recipe: { points: 2, per: 'spin', spinMult: 0.01, spinMultCap: 1.5, perLevel: 0.5 },
    dials: [{
      id: 'drag', label: 'Drag', min: 0, max: 3, step: 0.25, default: 1,
      tradeoff: 'A heavier spinner pays more per spin, but slows the ball down more.', ends: ['light, pays less', 'heavy, slows the ball'],
      payoff: (v) => 1 + 0.25 * v, fmt: (v) => v.toFixed(2),
    }],
  },
  lane: {
    id: 'lane', name: 'Lane Rollover', blurb: 'Roll over it. It lights up. Cheap thrills.', kind: 'rollover', rarity: 'common', tags: ['light'], cost: 4, pack: 3, weight: 3,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 10, per: 'roll-over', lights: true, setSize: 3, setBonus: { points: 40, mult: 0.5 }, setCap: 5, perLevel: 3 }, dials: [],
  },
  lamp: {
    id: 'lamp', name: 'Lamp', blurb: 'Hit it again and again. The neighbours love it.', kind: 'lamp', rarity: 'common', tags: ['light'], cost: 4, weight: 2,
    shape: { type: 'circle', r: 0.8 }, rotatable: false, kickUnit: 0,
    recipe: { lights: true, brighten: { points: 10, steps: 5 } },
    dials: [{
      id: 'radius', label: 'Glow radius', min: 3, max: 8, step: 0.5, default: 5,
      tradeoff: 'A wider glow reaches more parts, but gives each a smaller bonus.', ends: ['tight, bigger bonus', 'wide, smaller bonus'], fmt: (v) => `${v.toFixed(1)}`,
    }],
  },
  vari: {
    id: 'vari', name: 'Vari-Target', blurb: 'Tap it, get peanuts. Smash it, get paid.', kind: 'target', rarity: 'common', tags: ['target'], cost: 4, weight: 2,
    shape: { type: 'box', hw: 1.3, hh: 0.35 }, rotatable: true, kickUnit: 0,
    recipe: { points: 8, per: 'hit', tiers: VARI_TIERS, hot: 0.5, hotTier: 3, perLevel: 2 },
    dials: [{
      id: 'stiff', label: 'Stiffness', min: 0.5, max: 2, step: 0.25, default: 1,
      tradeoff: 'A stiffer target needs a faster ball for every step, but pays more once you get there.', ends: ['soft, easy steps', 'stiff, pays more'],
      payoff: (v) => 1 + 0.5 * (v - 1), fmt: (v) => v.toFixed(2),
    }],
  },
  deflector: {
    id: 'deflector', name: 'Deflector', blurb: 'A bouncy bar. Steers everything, and a bank shot pays.', kind: 'deflector', rarity: 'common', tags: ['kicker'], cost: 1, weight: 2,
    shape: { type: 'box', hw: 2.2, hh: 0.28 }, rotatable: true, kickUnit: 0, recipe: { hot: 0.25 }, dials: [],
  },
  kickback: {
    id: 'kickback', name: 'Kickback', blurb: 'Roll over it and it boots the ball right back.', kind: 'kickback', rarity: 'common', tags: ['kicker', 'guard'], cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: true, kickUnit: 0,
    recipe: { points: 30, per: 'kick', hot: 0.5, cooldown: 4, perLevel: 8 }, dials: [powerDial('kick')],
  },

  // ---- uncommon: from round 2 ----
  bank: {
    id: 'bank', name: 'Drop-Target Bank', blurb: 'Three targets. They go down. They come back. The lamps cheer.', kind: 'bank', rarity: 'uncommon', tags: ['target'], cost: 5, weight: 2,
    shape: { type: 'box', hw: 2.6, hh: 0.45 }, rotatable: true, kickUnit: 0,
    recipe: { points: 12, per: 'target', setBonus: { points: 60, mult: 0.3 }, lightsLamps: LAMP_FLASH, perLevel: 3 }, dials: [],
  },
  uplight: {
    id: 'uplight', name: 'Level Light', blurb: 'Light them both and the bumpers nearby level up.', kind: 'rollover', rarity: 'uncommon', tags: ['light'], cost: 5, pack: 2, weight: 2,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 2, per: 'pass', levelUp: true }, dials: [],
  },
  saver: {
    id: 'saver', name: 'Ball Saver', blurb: 'Drain early? The machine pretends it never happened.', kind: 'saver', rarity: 'uncommon', tags: ['guard', 'money'], cost: 5, weight: 1,
    shape: { type: 'circle', r: 0.8 }, rotatable: false, kickUnit: 0, recipe: { unusedPay: 1 }, dials: [],
  },
  flipper: {
    id: 'flipper', name: 'Left Flipper', blurb: 'A little extra hand. Left button.', kind: 'flipper', rarity: 'uncommon', tags: ['guard'], cost: 6, weight: 1,
    shape: { type: 'circle', r: 2.0 }, rotatable: false, kickUnit: 0, recipe: {}, dials: [],
  },
  flipperR: {
    id: 'flipperR', name: 'Right Flipper', blurb: 'A little extra hand. Right button.', kind: 'flipper', rarity: 'uncommon', tags: ['guard'], cost: 6, weight: 1,
    shape: { type: 'circle', r: 2.0 }, rotatable: false, kickUnit: 0, recipe: {}, dials: [],
  },
  ding: {
    id: 'ding', name: 'Ding-Dong Bell', blurb: 'Rings louder for a well-travelled ball.', kind: 'bumper', rarity: 'uncommon', tags: ['bumper'], cost: 5, weight: 2,
    shape: { type: 'circle', r: 1.15 }, rotatable: false, kickUnit: 11,
    recipe: { points: 12, per: 'hit', variety: 8, perLevel: 3 }, dials: [kickDial(2)],
  },
  trophy: {
    id: 'trophy', name: 'Trophy Cup', blurb: 'Polish it every round. It never forgets.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 8, weight: 3,
    shape: { type: 'circle', r: 1.05 }, rotatable: false, kickUnit: 9,
    recipe: { points: 20, per: 'hit', keep: { per: 0.04, cap: 5 }, perLevel: 5 }, dials: [kickDial(1.5)],
  },
  piggy: {
    id: 'piggy', name: 'Piggy Bank', blurb: 'Feed it coins. Then smash it.', kind: 'target', rarity: 'uncommon', tags: ['target', 'money'], cost: 5, weight: 2,
    shape: { type: 'box', hw: 1.1, hh: 0.55 }, rotatable: true, kickUnit: 0,
    recipe: { points: 5, per: 'hit', tiers: PIGGY_TIERS, piggy: { cap: 5, breakTier: 1, bonus: 1 }, perLevel: 1 }, dials: [],
  },
  magnet: {
    id: 'magnet', name: 'Mag-Grab', blurb: 'Grabs the ball, charges up, lets go. Very rude.', kind: 'saucer', rarity: 'uncommon', tags: ['ball', 'guard'], cost: 6, weight: 1,
    shape: { type: 'circle', r: 1.3 }, rotatable: true, kickUnit: 0,
    recipe: { points: 24, per: 'grab', mult: 0.25, multCap: 2, perLevel: 6 },
    dials: [
      { id: 'hold', label: 'Hold', min: 0.2, max: 1.5, step: 0.1, default: 0.5, tradeoff: 'Holding longer pays more, but that ball sits out of play meanwhile.', ends: ['quick, back in play', 'long, pays more'], payoff: (v) => 1 + 0.6 * (v - 0.5), fmt: (v) => `${v.toFixed(1)} s` },
      { ...powerDial('throw'), tradeoff: 'How hard it throws the ball, the way it faces (turn it when you place it).' },
    ],
  },
  strip: {
    id: 'strip', name: 'Glow Strip', blurb: 'A light under the floor. It parties whenever anything good happens.', kind: 'strip', rarity: 'uncommon', tags: ['light'], cost: 5, weight: 2,
    shape: { type: 'box', hw: 4, hh: 0.45 }, rotatable: false, kickUnit: 0,
    recipe: { strip: { seconds: 5, bonus: 0.5, reach: 1.6 } }, dials: [],
  },
  plate: {
    id: 'plate', name: 'Power Plate', blurb: 'A humming plate in the floor. Bumpers on it hit harder.', kind: 'strip', rarity: 'uncommon', tags: ['bumper'], cost: 6, weight: 2,
    shape: { type: 'circle', r: 1.5 }, rotatable: false, kickUnit: 0,
    recipe: { plate: { x: 1.5, reach: 3 } }, dials: [],
  },
  roller: {
    id: 'roller', name: 'Roller Pop', blurb: 'A pop bumper on a rail. It will not sit still.', kind: 'mover', rarity: 'uncommon', tags: ['bumper'], cost: 6, weight: 2,
    shape: { type: 'box', hw: 3.6, hh: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 30, per: 'hit', edgeShot: { edge: 0.75, x: 3 }, perLevel: 8 }, dials: [],
    mover: { travel: 2.6, speed: 3.2, shape: { type: 'circle', r: 0.85 }, y: 0, restitution: 0.45, kick: 26 },
  },

  // ---- rare: from round 4 ----
  printer: {
    id: 'printer', name: 'Ball Printer', blurb: 'Eats one ball. Prints two. Allegedly legal.', kind: 'saucer', rarity: 'rare', tags: ['ball'], cost: 9, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: false, kickUnit: 0,
    recipe: { points: 40, per: 'ball caught', spawn: 1, printCap: 3, perLevel: 10 },
    dials: [
      {
        id: 'hold', label: 'Hold', min: 0.2, max: 2, step: 0.1, default: 0.6,
        tradeoff: 'Holding longer pays more, but that ball sits out of play meanwhile.', ends: ['quick, back in play', 'long, pays more'],
        payoff: (v) => 1 + 0.5 * (v - 0.6), fmt: (v) => `${v.toFixed(1)} s`,
      },
      { ...powerDial('eject'), label: 'Eject power', tradeoff: 'How hard it fires the balls out.' },
    ],
  },
  thunder: {
    id: 'thunder', name: 'Thunder Bumper', blurb: 'A big wedge. Every bonk throws the ball up and shakes the Pops awake.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 8, weight: 2,
    shape: { type: 'tri', hw: 1.7, hh: 1.4 }, rotatable: false, kickUnit: 19,
    recipe: { points: 60, per: 'hit', feeds: { id: 'pop', n: 3 }, mult: 0.05, multCap: 2, perLevel: 15 }, dials: [kickDial(2)],
  },
  jackpot: {
    id: 'jackpot', name: 'Jackpot Scoop', blurb: 'Every hit fills the pot. Sink it to cash in.', kind: 'saucer', rarity: 'rare', tags: ['ball'], cost: 8, weight: 2,
    shape: { type: 'circle', r: 1.35 }, rotatable: false, kickUnit: 0,
    recipe: { points: 40, per: 'scoop', jackpot: { per: 8, cap: 3000 }, perLevel: 10 },
    dials: [{ id: 'hold', label: 'Hold', min: 0.4, max: 1.5, step: 0.1, default: 0.8, tradeoff: 'How long it keeps the ball before it fires it back out.', ends: ['quick', 'slow'], fmt: (v) => `${v.toFixed(1)} s` }, { ...powerDial('eject'), tradeoff: 'How hard it fires the ball back out.' }],
  },
  xlane: {
    id: 'xlane', name: 'X Lane', blurb: 'Roll through it and your Mult multiplies.', kind: 'rollover', rarity: 'uncommon', tags: ['light'], cost: 7, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: false, kickUnit: 0,
    recipe: { xmult: 1.25, xmultCap: 3, cooldown: 3, lightsLane: true }, dials: [],
  },
  rank: {
    id: 'rank', name: 'Rank Lights', blurb: 'Light all three and the ball gets a promotion.', kind: 'rollover', rarity: 'rare', tags: ['light'], cost: 8, pack: 3, weight: 2,
    shape: { type: 'circle', r: 0.95 }, rotatable: false, kickUnit: 0,
    recipe: { points: 10, per: 'roll-over', lights: true, setSize: 3, rank: { steps: [1.2, 1.4, 1.6], seconds: 40 }, perLevel: 3 }, dials: [],
  },
  bell: {
    id: 'bell', name: 'Old Bell', blurb: 'Ring it once a round. Three rounds on, it remembers.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 8, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: false, kickUnit: 10,
    recipe: { points: 20, per: 'hit', bell: { first: 150, notches: 3, x: 1.2 }, perLevel: 5 }, dials: [kickDial(1.5)],
  },
  tesla: {
    id: 'tesla', name: 'Tesla Coil', blurb: 'Hit it and everything nearby gets a shock.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 9, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: false, kickUnit: 12,
    recipe: { points: 30, per: 'hit', zap: { arcs: 2, perLevels: 3, maxArcs: 4 }, perLevel: 8 }, dials: [kickDial(2)],
  },
  keg: {
    id: 'keg', name: 'Powder Keg', blurb: 'Light the fuse. Stand back.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 8, weight: 2,
    shape: { type: 'circle', r: 1.0 }, rotatable: false, kickUnit: 8,
    recipe: { points: 10, per: 'hit', keg: { fuse: 2.5, radius: 6, blast: 80, chain: 4, rearm: 6, sparks: 1 }, perLevel: 3 }, dials: [kickDial(1.5)],
  },
  laser: {
    id: 'laser', name: 'Laser Turret', blurb: 'Pew. Somewhere across the table, something scores.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 9, weight: 2,
    shape: { type: 'circle', r: 1.0 }, rotatable: false, kickUnit: 10,
    recipe: { points: 40, per: 'hit', beam: { cooldown: 3 }, perLevel: 10 }, dials: [kickDial(2)],
  },
  gong: {
    id: 'gong', name: 'Shockwave Gong', blurb: 'Bang it eight times. The whole table hears it.', kind: 'bumper', rarity: 'uncommon', tags: ['bumper'], cost: 5, weight: 2,
    shape: { type: 'circle', r: 1.15 }, rotatable: false, kickUnit: 11,
    recipe: { points: 25, per: 'hit', boom: { every: 8 }, perLevel: 6 }, dials: [kickDial(2)],
  },
  duck: {
    id: 'duck', name: 'Duck Gallery', blurb: 'A tin duck paddles back and forth. Knock it over. It gets cross.', kind: 'mover', rarity: 'rare', tags: ['target'], cost: 8, weight: 2,
    shape: { type: 'box', hw: 3.9, hh: 0.75 }, rotatable: false, kickUnit: 0,
    recipe: { points: 60, per: 'duck', grow: 20, growCap: 200, speedUp: { by: 0.15, max: 2 }, perLevel: 15 }, dials: [],
    mover: { travel: 3.1, speed: 3.5, shape: { type: 'circle', r: 0.6 }, y: 0, restitution: 0.6 },
  },

  // ---- legendary: from round 7 ----
  golden: {
    id: 'golden', name: 'Golden Bumper', blurb: 'Solid gold. Pays in points, Mult and cash.', kind: 'bumper', rarity: 'legendary', tags: ['bumper', 'money'], cost: 12, weight: 2,
    shape: { type: 'circle', r: 1.5 }, rotatable: false, kickUnit: 15,
    recipe: { points: 120, per: 'hit', xmult: 1.05, xmultCap: 3, moneyEvery: { n: 5, cap: 5 }, perLevel: 30 }, dials: [kickDial(2)],
  },
  fame: {
    id: 'fame', name: 'Hall of Fame', blurb: 'Every star of your table gets a plaque. The more stars, the louder the crowd.', kind: 'rollover', rarity: 'legendary', tags: ['light'], cost: 13, weight: 2,
    shape: { type: 'circle', r: 1.3 }, rotatable: false, kickUnit: 0,
    recipe: { points: 150, per: 'pass', typeX: 0.1, perBall: 1, perLevel: 40 }, dials: [],
  },
  disco: {
    id: 'disco', name: 'Disco Ball', blurb: 'Once a ball: the lamps go wild and the Mult goes through the roof.', kind: 'rollover', rarity: 'legendary', tags: ['light'], cost: 11, weight: 2,
    shape: { type: 'circle', r: 1.25 }, rotatable: false, kickUnit: 0,
    recipe: { points: 200, per: 'pass', xmult: 2.5, perBall: 1, lightsLamps: 8, perLevel: 50 }, dials: [],
  },
  goal: {
    id: 'goal', name: 'Goal!', blurb: 'A tiny football goal with a very serious goalie.', kind: 'goal', rarity: 'legendary', tags: ['target'], cost: 12, weight: 2,
    shape: { type: 'box', hw: 3.4, hh: 1.1 }, rotatable: false, kickUnit: 0,
    recipe: { points: 300, per: 'goal', goal: { xmult: 1.5, xmultCap: 4 }, cooldown: 1.5, perLevel: 75 }, dials: [],
    mover: { travel: 1.7, speed: 3, shape: { type: 'box', hw: 0.75, hh: 0.22 }, y: -0.45, restitution: 0.55 },
  },

  // ---- sparks: parts that shoot out bonus balls ----
  sparkler: {
    id: 'sparkler', name: 'Sparkler', blurb: 'Fizz. Every bonk throws a spark.', kind: 'bumper', rarity: 'common', tags: ['bumper'], cost: 3, weight: 2,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 10,
    recipe: { points: 8, per: 'hit', sparks: { n: 1, cooldown: 1 }, perLevel: 2 }, dials: [kickDial(2)],
  },
  rocks: {
    id: 'rocks', name: 'Rock Pile', blurb: 'Hit it and it sheds. Hit it more and it grows.', kind: 'bumper', rarity: 'uncommon', tags: ['bumper'], cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: false, kickUnit: 8,
    recipe: { points: 10, per: 'hit', rocks: { every: 5, max: 5, cooldown: 2 }, perLevel: 3 }, dials: [kickDial(1.5)],
  },
  firecracker: {
    id: 'firecracker', name: 'Firecracker', blurb: 'Once a ball: up it goes, and down come the sparks.', kind: 'bumper', rarity: 'rare', tags: ['bumper'], cost: 8, weight: 2,
    shape: { type: 'circle', r: 1.0 }, rotatable: false, kickUnit: 9,
    recipe: { points: 15, per: 'hit', rocket: { n: 6, delay: 0.7 }, perLevel: 4 }, dials: [kickDial(2)],
  },

  // ---- gems: set into a part on the table (one each), sold from round 7 ----
  ruby: {
    id: 'ruby', name: 'Ruby', blurb: 'Set it in a part. The part gets greedy.', kind: 'inlay', rarity: 'uncommon', tags: [], cost: 6, weight: 1, from: 7,
    shape: { type: 'circle', r: 0.5 }, rotatable: false, kickUnit: 0, recipe: { gem: 'scoring' }, dials: [],
  },
  garnet: {
    id: 'garnet', name: 'Garnet', blurb: 'Set it in a part that rests. It rests less.', kind: 'inlay', rarity: 'uncommon', tags: [], cost: 4, weight: 1, from: 7,
    shape: { type: 'circle', r: 0.5 }, rotatable: false, kickUnit: 0, recipe: { gem: 'cooldown' }, dials: [],
  },
  opal: {
    id: 'opal', name: 'Opal', blurb: 'Set it in a part that grows. It grows faster.', kind: 'inlay', rarity: 'uncommon', tags: [], cost: 5, weight: 1, from: 7,
    shape: { type: 'circle', r: 0.5 }, rotatable: false, kickUnit: 0, recipe: { gem: 'growth' }, dials: [],
  },
  goldleaf: {
    id: 'goldleaf', name: 'Gold Leaf', blurb: 'The part is worth a little more every time. For good.', kind: 'inlay', rarity: 'rare', tags: [], cost: 6, weight: 1, from: 7,
    shape: { type: 'circle', r: 0.5 }, rotatable: false, kickUnit: 0, recipe: { gem: 'scoring' }, dials: [],
  },
  redseal: {
    id: 'redseal', name: 'Red Seal', blurb: 'Every hit counts twice. Then it needs a breather.', kind: 'inlay', rarity: 'rare', tags: [], cost: 7, weight: 1, from: 7,
    shape: { type: 'circle', r: 0.5 }, rotatable: false, kickUnit: 0, recipe: { gem: 'scoring' }, dials: [],
  },
  topaz: {
    id: 'topaz', name: 'Topaz', blurb: 'Set it in a part. Now and then it sheds a spark.', kind: 'inlay', rarity: 'uncommon', tags: [], cost: 5, weight: 1, from: 7,
    shape: { type: 'circle', r: 0.5 }, rotatable: false, kickUnit: 0, recipe: { gem: 'scoring' }, dials: [],
  },
  emerald: {
    id: 'emerald', name: 'Emerald', blurb: 'Set it in a once-a-ball part. Twice a ball.', kind: 'inlay', rarity: 'rare', tags: [], cost: 8, weight: 1, from: 7,
    shape: { type: 'circle', r: 0.5 }, rotatable: false, kickUnit: 0, recipe: { gem: 'onceABall' }, dials: [],
  },

  // ---- not for sale: every machine has one Big Boi in the middle, and what he does depends on the machine ----
  mega: {
    id: 'mega', name: 'Big Boi', blurb: 'Heavy, rude, hard to miss.', kind: 'bumper', rarity: 'legendary', tags: ['bigboi', 'bumper'], cost: 6, weight: 0,
    shape: { type: 'circle', r: 1.9 }, rotatable: false, kickUnit: 18,
    recipe: { points: 50, per: 'hit', mult: 0.15, multCap: 3, perLevel: 5 }, dials: [kickDial(1.5)],
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
    case 'rare': return round < 4 ? 0 : Math.min(1, 0.25 + 0.1 * (round - 4));
    case 'legendary': return round < 7 ? 0 : Math.min(0.6, 0.15 + 0.07 * (round - 7));
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
  /** Levels this part has earned this run (Level Lights level up the bumpers near them). */
  level?: number;
  /** Bought together in one pack (the uid of its first piece): the three Lane Rollovers of a pack make a set. */
  group?: number;
  /** Trophy Cup: the Mult it has kept so far this run. */
  polish?: number;
  /** Old Bell: notches towards its next ring (rounds in which it was hit). */
  notches?: number;
  /** The gem set into it (an inlay), if any. */
  inlay?: PartId;
  /** Gold Leaf: what its gem has added to its points so far this run. */
  leaf?: number;
  /**
   * Free to move until the next round: bought in this visit to the workshop, or its move already paid. `paid`
   * is what it cost, refunded if it goes back before a round is played with it.
   */
  loose?: boolean;
  paid?: number;
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

/** The triangle's corners (local, before the part's position): base at -hh, apex at +hh. */
export const triPoints = (hw: number, hh: number): [number, number][] => [[-hw, -hh], [hw, -hh], [0, hh]];

/** Floor inserts that other parts may stand on (a Glow Strip lies under the parts). */
export const underFloor = (id: PartId) => PARTS[id].kind === 'strip';

/** Product of the payoff multipliers of all of the part's dials. */
export function dialFactor(inst: PartInstance): number {
  let f = 1;
  for (const d of PARTS[inst.def].dials) if (d.payoff) f *= d.payoff(inst.dials[d.id] ?? d.default);
  return f;
}

/** What one brightening step of a Lamp adds (a wider glow gives less): +10% at the default radius. */
export function lampBonus(radius: number): number {
  return Math.round((0.2 - 0.02 * radius) * 100) / 100;
}

/** A lamp's reach, what each step adds, and its full glow, for its Glow dial setting and the run's Bright Lamps decals. */
export function lampStats(dialRadius: number, mods: Pick<Mods, 'lampRadius' | 'lampBonus'> = neutralMods()): { radius: number; bonus: number; full: number } {
  const bonus = Math.round((lampBonus(dialRadius) + mods.lampBonus) * 100) / 100;
  return { radius: dialRadius + mods.lampRadius, bonus, full: Math.round(bonus * (PARTS.lamp.recipe.brighten?.steps ?? 5) * 100) / 100 };
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
  return Math.floor((def.cost / (def.pack ?? 1)) * rate); // one piece of a pack sells for its share
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
  /** Different part types on the table (Hall of Fame). */
  types?: number;
}

export function describe(def: PartDef, inst?: PartInstance, ctx: DescribeCtx = {}): DescLine[] {
  const mods = ctx.mods ?? neutralMods();
  const level = effectiveLevel(def.id, ctx.level ?? 0, mods);
  const r = def.id === 'mega' ? bigBoiOf(ctx.machine).recipe : def.recipe;
  const lines: DescLine[] = [];
  if (r.gem) {
    lines.push({ tag: 'combo', text: GEM_TEXT[def.id] ?? '' });
    lines.push({ tag: 'note', text: `A gem: drop it on a part on your table to set it in. It fits ${FIT_TEXT[r.gem]}. One gem a part; a new one sends the old one back to your toolbox, and selling the part does too.` });
    return lines;
  }
  const factor = (inst ? dialFactor(inst) : 1) * modFactor(def.id, mods);
  const setPts = r.setBonus ? r.setBonus.points * mods.setFactor : 0, setMult = r.setBonus ? r.setBonus.mult * mods.setFactor : 0;
  const f = (n: number) => num(Math.round(n * factor * 100) / 100);
  const mg = (n: number) => num(n * mods.multGain);
  const xg = (x: number) => num(1 + (x - 1) * mods.multGain);
  const per = r.per ?? 'hit';
  const one = def.id === 'mega' || def.kind === 'mover' || def.kind === 'goal'; // there is only one of him; moving parts count each one alone

  const lvlBonus = (r.perLevel ?? 0) * level;
  // the Spinner says it all in one line
  if (def.kind === 'spinner') {
    lines.push({ tag: 'score', text: `Scores ${f((r.points ?? 0) + lvlBonus)} and raises your Mult by +${mg((r.spinMult ?? 0) * mods.spinMult)} per spin. Up to ${Math.round(10 * mods.spinBoost)} spins a pass, and +${mg((r.spinMultCap ?? 0) * mods.spinMult)} Mult a ball.` });
  } else if (r.points && def.kind !== 'goal') lines.push({ tag: 'score', text: `Scores ${f(r.points + lvlBonus)} per ${per}.` });
  const upg = modFactor(def.id, mods);
  if (r.points && Math.abs(upg - 1) > 0.001) lines.push({ tag: 'level', text: `Your decals multiply its points by ${num(upg)}.` });
  if (r.grow) lines.push({ tag: 'grow', text: one
    ? `Every hit adds +${num(r.grow * factor)} to the next one this ball, up to +${num((r.growCap ?? 0) * factor)}.`
    : `Grows: +${num(r.grow * factor)} for every ${def.name} hit this ball (all ${def.name}s share it)${r.growCap ? `, up to +${num(r.growCap * factor)}` : ''}.` });
  if (r.feeds) lines.push({ tag: 'grow', text: `Every hit counts as ${r.feeds.n} ${PARTS[r.feeds.id].name} hits for their growth this ball.` });
  if (r.mult) lines.push({ tag: 'mult', text: `Raises your Mult by +${mg(r.mult)} per ${per}${r.multCap ? `, up to +${mg(r.multCap)} a ball${one ? '' : ` from all ${def.name}s`}` : ''}.` });
  if (r.xmult && !r.perBall) lines.push({ tag: 'mult', text: `Multiplies your Mult by ×${xg(r.xmult)} per ${per}${r.xmultCap ? `, up to ×${xg(r.xmultCap)} a ball from all ${def.name}s` : ''}.` });
  if (r.typeX) lines.push({ tag: 'mult', text: `The first time a ball rolls over it each ball: your Mult ×${xg(1 + r.typeX)} for every different part type on your table (Big Boi too)${ctx.types ? `, ×${num(Math.round((1 + (r.typeX) * mods.multGain) ** ctx.types * 100) / 100)} now` : ''}.` });
  if (r.xmult && r.perBall) lines.push({ tag: 'mult', text: `Multiplies your Mult by ×${xg(r.xmult)} the first time a ball rolls over it each ball.` });
  if (r.money && !mods.noCoins) lines.push({ tag: 'money', text: `Pays $${r.money} per ${per}${r.moneyCap ? `, up to $${r.moneyCap} a round from all ${def.name}s` : ''}.` });
  if (r.moneyEvery && !mods.noCoins) lines.push({ tag: 'money', text: `Pays $1 every ${r.moneyEvery.n} hits, up to $${r.moneyEvery.cap} a round.` });
  if (r.variety) lines.push({ tag: 'grow', text: `+${f(r.variety)} for every different part type this ball has hit.` });
  if (r.jackpot) lines.push({ tag: 'set', text: `The pot: +${f(r.jackpot.per)} for every scoring hit this ball (up to +${f(r.jackpot.cap)}). Sink the ball in it to cash the pot, then it starts again.` });
  if (r.piggy) lines.push({ tag: 'money', text: `Every hit drops $1 in the piggy (it holds $${r.piggy.cap}). Smash it (speed ${num(30 * mods.tierEase)}+) to break it: it pays what it holds +$${r.piggy.bonus}. Whatever is left in it at the end of a round is lost.` });
  if (r.hot) {
    const when = r.hotTier !== undefined ? 'A smash hit makes' : r.points ? 'Every hit makes' : 'A ball that bounces off it is';
    lines.push({ tag: 'combo', text: `Hot Shot: ${when}${r.points || r.hotTier !== undefined ? ' the ball hot:' : ' hot:'} its next scoring hit within ${HOT_WINDOW} s pays +${Math.round(r.hot * mods.hotFactor * 100)}%.` });
  }
  if (def.kind === 'lamp') {
    const lamp = lampStats(inst ? dialValue(inst, 'radius') : 5, mods), b = r.brighten!;
    lines.push({ tag: 'lamp', text: `Every hit brightens it a step (up to ${b.steps}) and pays ${f(b.points)}. Each step gives every scoring part within ${num(lamp.radius)} units +${Math.round(lamp.bonus * 100)}%, up to +${Math.round(lamp.full * 100)}%. It goes dark at the end of the ball.` });
  }
  if (def.pack && def.pack > 1) lines.push({ tag: 'note', text: `Comes as a pack of ${def.pack}.` });
  if (r.lights && def.kind === 'rollover') lines.push({ tag: 'note', text: r.rank ? 'Lights up when the ball rolls over it. It goes dark at the end of the ball.' : 'Lights up when the ball rolls over it. The lanes of a pack spell the machine\'s word.' });
  if (r.rank) {
    const steps = r.rank.steps.map((x, i) => `${RANK_NAMES[i]} (×${xg(x)})`);
    lines.push({ tag: 'mult', text: `Light all ${r.setSize} lights of a pack and the ball that lit the last one ranks up: every hit it makes pays more. ${steps.join(', then ')}. A rank lasts ${r.rank.seconds} s; lighting the set again moves it up and starts the time again, and a drain loses it.` });
  }
  if (r.zap) {
    const at = (k: number) => k * r.zap!.perLevels;
    lines.push({ tag: 'combo', text: `Every hit arcs lightning to the ${r.zap.arcs} nearest parts that score when the ball touches them (one more at level ${at(1)}${r.zap.maxArcs - r.zap.arcs > 1 ? ` and ${at(2)}` : ''}): each one scores as if the ball had hit it. A part can be zapped at most once every ${ZAP_COOLDOWN} s, a zap never arcs on, and saucers, the goal, the Kickback, drop targets and ×Mult parts cannot be zapped.` });
  }
  if (r.sparks || r.rocks || r.rocket || r.keg?.sparks) lines.push({ tag: 'note', text: `A spark: a little bonus ball that flies off, scores on what it touches (as the ball that made it), slips through the flippers and fades after ${SPARK_LIFE} s. It never costs a ball.` });
  if (r.sparks) lines.push({ tag: 'spawn', text: `Every hit of the ball shoots out ${r.sparks.n === 1 ? 'a spark' : `${r.sparks.n} sparks`}, then it needs ${r.sparks.cooldown} s.` });
  if (r.rocks) lines.push({ tag: 'spawn', text: `Every hit of the ball drops a spark for each rock in the pile, then it needs ${r.rocks.cooldown} s. The pile grows a rock every ${r.rocks.every} hits (up to ${r.rocks.max}), and is back to one rock each round.` });
  if (r.rocket) lines.push({ tag: 'spawn', text: `Once a ball, a hit fires a rocket to the top of the table: it bursts into ${r.rocket.n} sparks that rain down.` });
  if (r.keg) lines.push({ tag: 'combo', text: `A hit lights the fuse. ${r.keg.fuse} s later it blows: ${f(r.keg.blast)} points, ${r.keg.sparks ? `a spark flies out, ` : ''}and every part within ${r.keg.radius} units is zapped (it scores as if the ball had hit it). A blast lights any other Powder Keg it reaches, up to ${r.keg.chain} kegs in a row. Then it is spent for ${r.keg.rearm} s.` });
  if (r.beam) lines.push({ tag: 'combo', text: `Every hit fires a laser beam through it in a random direction, right across the table: every part on the beam is zapped. Then it needs ${r.beam.cooldown} s to recharge.` });
  if (r.boom) lines.push({ tag: 'combo', text: `Every ${r.boom.every}th hit of a ball, it booms: every part on the table is zapped once. Nothing moves.` });
  if (r.keg || r.beam || r.boom) lines.push({ tag: 'note', text: `A part can be zapped at most once every ${ZAP_COOLDOWN} s; saucers, the goal, the Kickback, drop targets and ×Mult parts cannot be zapped.` });
  if (r.bell) lines.push({ tag: 'mult', text: `Its first hit each round pays ${f(r.bell.first)} instead, and adds a notch${inst?.notches ? ` (${inst.notches} of ${r.bell.notches} now)` : ''}. At ${r.bell.notches} notches it rings: your Mult ×${xg(r.bell.x)} on every ball for the rest of the run (rings stack), and the notches start again. Sell it and its notches go; the rings stay.` });
  if (r.tiers && def.id === 'vari') {
    const stiff = (inst ? dialValue(inst, 'stiff') : 1) * mods.tierEase;
    const [, firm, hard, smash] = r.tiers;
    lines.push({ tag: 'note', text: `The faster the ball is moving when it hits, the more it pays: ×${firm.x} at speed ${num(firm.from * stiff)}, ×${hard.x} at ${num(hard.from * stiff)}, ×${smash.x} at ${num(smash.from * stiff)} (a smash).` });
  }
  if (r.setBonus && def.kind === 'rollover') lines.push({ tag: 'set', text: `Light all ${r.setSize} lanes of a pack to make a set: +${num(setPts)} points and +${mg(setMult)} Mult, and they go dark. At most ${r.setCap} sets a ball.` });
  if (def.kind === 'bank') lines.push({ tag: 'set', text: `Each target you hit drops. Drop all three: +${num(setPts)} points and +${mg(setMult)} Mult, then they pop back up.` });
  if (r.lightsLamps) lines.push({ tag: 'lamp', text: `${def.kind === 'bank' ? 'A full set also' : 'It also'} lights every Lamp at full glow for ${r.lightsLamps} s.` });
  if (r.lightsLane) lines.push({ tag: 'note', text: 'It also lights a Lane Rollover.' });
  if (r.cooldown && def.kind !== 'kickback' && def.kind !== 'goal') lines.push({ tag: 'note', text: `Goes dark for ${r.cooldown} s after it fires.` });
  if (r.keep) lines.push({ tag: 'mult', text: `Every hit polishes it: +${num(r.keep.per)} Mult that it keeps for the rest of the run (up to +${num(r.keep.cap)}). Every ball starts with it added to your Mult.${inst?.polish ? ` Polished so far: +${num(Math.round(inst.polish * 100) / 100)}.` : ''} Sell it and the polish is gone.` });
  if (r.levelUp) lines.push({ tag: 'level', text: `Roll over to switch it on or off. It needs at least one more Level Light within ${LEVEL_RADIUS} of it. When it and every Level Light within ${LEVEL_RADIUS} are on, the bumpers within ${LEVEL_RADIUS} of those lights level up: +1 level for each light past the first.` });
  if (r.spawn) {
    const n = r.spawn + mods.printerExtra;
    lines.push({ tag: 'spawn', text: `Prints ${n === 1 ? 'a second ball' : `${n} more balls`} when it catches one (at most ${r.printCap} printed in one ball, and 4 on the table).` });
  }
  if (def.kind === 'saucer') {
    const hold = inst ? dialValue(inst, 'hold') : PARTS[def.id].dials[0]?.default ?? 0.6;
    lines.push({ tag: 'note', text: def.id === 'magnet'
      ? `Grabs a ball that comes close, holds it ${num(hold)} s, then throws it the way it faces.`
      : `Holds the ball ${num(hold)} s, then fires it out in a random direction.` });
  }
  if (def.kind === 'flipper') lines.push({ tag: 'note', text: `A small flipper worked by the ${def.id === 'flipperR' ? 'Right (→)' : 'Left (←)'} key. Scores nothing itself.` });
  if (def.kind === 'deflector') lines.push({ tag: 'note', text: 'Scores nothing itself. A bouncy bar that bends the ball\'s path.' });
  if (def.kind === 'kickback') {
    const cd = Math.round((r.cooldown ?? 4) * mods.kickbackCooldown * 10) / 10;
    lines.push({ tag: 'note', text: `When a ball rolls over it, it fires the ball out the way it faces, then needs ${cd} s to recharge.` });
  }
  if (def.kind === 'saver') {
    lines.push({ tag: 'note', text: `For ${SAVER_WINDOW} s after you launch a ball, a drain sends it back to the plunger instead, and the ball is not spent. Each Ball Saver on the board saves one drain per ball.` });
    if (r.unusedPay && !mods.noCoins) lines.push({ tag: 'money', text: `Pays $${r.unusedPay} at the end of a round in which it never had to save a ball.` });
  }
  if (r.speedUp) lines.push({ tag: 'combo', text: `The duck paddles along its rail. Every hit makes it ${Math.round(r.speedUp.by * 100)}% faster for the rest of the ball (up to ${r.speedUp.max}× its speed).` });
  if (r.edgeShot) lines.push({ tag: 'combo', text: `It rolls along its rail. Catch it near either end of the rail: ×${r.edgeShot.x}.` });
  if (r.goal) {
    lines.push({ tag: 'score', text: `Score past the goalie: ${f((r.points ?? 0) + lvlBonus)} points and your Mult ×${xg(r.goal.xmult)} (up to ×${xg(r.goal.xmultCap)} a ball).` });
    lines.push({ tag: 'note', text: 'The goalie slides across the mouth of the goal and blocks the ball.' });
  }
  if (r.strip) lines.push({ tag: 'lamp', text: `Lies under the floor: other parts can stand on it. Every time anything pays a bonus (a set, a jackpot, a level up...), it lights for ${r.strip.seconds} s, and every part standing on it pays +${Math.round(r.strip.bonus * 100)}%.` });
  if (r.plate) lines.push({ tag: 'score', text: `Lies in the floor: other parts can stand on it. Every bumper within ${num(r.plate.reach)} of it (Big Boi too) pays ×${num(r.plate.x)}, and plates multiply.` });
  if (def.id === 'mega') lines.push(...bigBoiLines(ctx.machine, factor, mods));
  if (inst?.inlay && PARTS[inst.inlay]) {
    // the gem's own sentence, about "its part", said of this part: "every time it scores..."
    const said = (GEM_TEXT[inst.inlay] ?? '').replace(/its part's/gi, 'its').replace(/its part/gi, 'it').replace(/\.$/, '');
    lines.push({ tag: 'combo', text: `Set with a ${PARTS[inst.inlay].name}: ${said.charAt(0).toLowerCase()}${said.slice(1)}${inst.inlay === 'goldleaf' && inst.leaf ? ` (+${inst.leaf} so far)` : ''}.` });
  }
  return lines;
}

/** Big Boi's ability, in sentences. */
function bigBoiLines(machine: MachineId | undefined, factor: number, mods: Mods): DescLine[] {
  const b = bigBoiOf(machine);
  void mods;
  switch (b.id) {
    case 'foreman': return [];
    case 'cook': return [
      { tag: 'combo', text: `Every hit calls an order: one part on your table lights up. Its next hit pays ×${ORDER.x}, then the light goes out.` },
    ];
    case 'dragon': return [
      { tag: 'combo', text: `Wears ${DRAGON.armour} armour plates, and every hit knocks one off. When the last one goes: ${num(Math.round(b.recipe.points! * DRAGON.jackpotX * factor))} points. Then the armour grows back ${DRAGON.regrow} plate thicker.` },
    ];
  }
}
