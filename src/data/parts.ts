/**
 * Content as data: every part is a row here. The sim reads shape, kind and kick, the scorer reads
 * the recipe, the renderer reads shape and kind (every colour comes from the theme), and the UI reads
 * `describe()`, which turns the same recipe into plain sentences so "how does this thing score?" can
 * never drift from what it actually does.
 */
import { SAVER_WINDOW } from '../sim/constants';
import { neutralMods, type Mods } from './mods';

export type PartId = 'pop' | 'coin' | 'mega' | 'sling' | 'spinner' | 'lane' | 'printer' | 'flipper' | 'lamp' | 'deflector' | 'uplight' | 'bank' | 'kickback' | 'saver' | 'vari';
export type PartKind = 'bumper' | 'kicker' | 'deflector' | 'spinner' | 'rollover' | 'saucer' | 'flipper' | 'lamp' | 'bank' | 'kickback' | 'saver' | 'target';

/** Part types can be levelled up for the rest of the run (Space Cadet's bumper upgrades). */
export const MAX_LEVEL = 5;
/** The part types a Level Light can be aimed at. */
export const LEVEL_TARGETS: PartId[] = ['pop', 'coin', 'mega', 'sling'];

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
  /** +Mult per event. */
  mult?: number;
  /** The most Mult this part type can add in one ball (all parts of the type together). */
  multCap?: number;
  money?: number;
  /** The most $ this part type can pay in one round. */
  moneyCap?: number;
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

/** The tier a ball of this speed reaches on this part (the Stiffness dial scales how fast it must be). */
export function tierOf(inst: PartInstance, speed: number): HitTier | null {
  const tiers = PARTS[inst.def].recipe.tiers;
  if (!tiers) return null;
  const stiff = dialValue(inst, 'stiff');
  let best = tiers[0];
  for (const t of tiers) if (speed >= t.from * stiff) best = t;
  return best;
}

export type Shape = { type: 'circle'; r: number } | { type: 'box'; hw: number; hh: number };

export interface PartDef {
  id: PartId;
  name: string;
  blurb: string;
  kind: PartKind;
  cost: number;
  /** Relative chance of appearing in the shop. */
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

export const PARTS: Record<PartId, PartDef> = {
  pop: {
    id: 'pop', name: 'Pop Bumper', blurb: 'Classic. Goes pop.', kind: 'bumper', cost: 3, weight: 3,
    shape: { type: 'circle', r: 1.2 }, rotatable: false, kickUnit: 14,
    recipe: { points: 100, per: 'hit', grow: 5, growCap: 100, perLevel: 10 }, dials: [kickDial(2)],
  },
  coin: {
    id: 'coin', name: 'Cha-Ching Bumper', blurb: 'Pays $1 per bonk. Tips in points.', kind: 'bumper', cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.0 }, rotatable: false, kickUnit: 12,
    recipe: { points: 40, per: 'hit', money: 1, moneyCap: 5, perLevel: 8 }, dials: [kickDial(2)],
  },
  mega: {
    id: 'mega', name: 'Big Boi', blurb: 'Heavy, rude, hard to miss.', kind: 'bumper', cost: 6, weight: 2,
    shape: { type: 'circle', r: 1.9 }, rotatable: false, kickUnit: 18,
    recipe: { points: 250, per: 'hit', mult: 0.1, multCap: 3, perLevel: 25 }, dials: [kickDial(1.5)],
  },
  sling: {
    id: 'sling', name: 'Slingshot', blurb: 'A rubber band with opinions.', kind: 'kicker', cost: 4, weight: 2,
    shape: { type: 'box', hw: 1.7, hh: 0.4 }, rotatable: true, kickUnit: 16,
    recipe: { points: 30, per: 'hit', perLevel: 10 }, dials: [kickDial(3, 'How hard it snaps the ball away. Softer pays more per hit; harder throws it across the table.')],
  },
  spinner: {
    id: 'spinner', name: 'Spinner', blurb: 'Whee. Faster ball, more whee.', kind: 'spinner', cost: 4, weight: 2,
    shape: { type: 'box', hw: 1.4, hh: 0.3 }, rotatable: true, kickUnit: 0,
    recipe: { points: 10, per: 'spin', perLevel: 3 },
    dials: [{
      id: 'drag', label: 'Drag', min: 0, max: 3, step: 0.25, default: 1,
      tradeoff: 'A heavier spinner pays more per spin, but slows the ball down more.', ends: ['light, pays less', 'heavy, slows the ball'],
      payoff: (v) => 1 + 0.25 * v, fmt: (v) => v.toFixed(2),
    }],
  },
  lane: {
    id: 'lane', name: 'Lane Rollover', blurb: 'Roll over it. It lights up. Cheap thrills.', kind: 'rollover', cost: 3, weight: 3,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 50, per: 'roll-over', lights: true, setBonus: { points: 200, mult: 0.5 }, setCap: 5, perLevel: 10 }, dials: [],
  },
  printer: {
    id: 'printer', name: 'Ball Printer', blurb: 'Eats one ball. Prints two. Allegedly legal.', kind: 'saucer', cost: 7, weight: 1,
    shape: { type: 'circle', r: 1.1 }, rotatable: true, kickUnit: 0,
    recipe: { points: 200, per: 'ball caught', spawn: 1, printCap: 4, perLevel: 50 },
    dials: [
      {
        id: 'hold', label: 'Hold', min: 0.2, max: 2, step: 0.1, default: 0.6,
        tradeoff: 'Holding longer pays more, but that ball sits out of play meanwhile.', ends: ['quick, back in play', 'long, pays more'],
        payoff: (v) => 1 + 0.5 * (v - 0.6), fmt: (v) => `${v.toFixed(1)} s`,
      },
      {
        id: 'power', label: 'Eject power', min: 30, max: 110, step: 5, default: 70,
        tradeoff: 'Decides where the ball lands. Rotate the part to aim it.', ends: ['gentle eject', 'strong eject'], fmt: (v) => String(v),
      },
    ],
  },
  flipper: {
    id: 'flipper', name: 'Extra Flipper', blurb: 'Because two hands were never enough.', kind: 'flipper', cost: 8, weight: 1,
    shape: { type: 'circle', r: 2.6 }, rotatable: false, kickUnit: 0,
    recipe: {},
    dials: [{
      id: 'side', label: 'Button', min: 0, max: 1, step: 1, default: 0,
      tradeoff: 'Which flipper key works it: Left (←) or Right (→).', ends: ['Left (←)', 'Right (→)'], fmt: (v) => (v >= 0.5 ? 'Right' : 'Left'),
    }],
  },
  lamp: {
    id: 'lamp', name: 'Lamp', blurb: 'Light it up and the neighbours score more.', kind: 'lamp', cost: 5, weight: 2,
    shape: { type: 'circle', r: 0.8 }, rotatable: false, kickUnit: 0,
    recipe: { lights: true },
    dials: [{
      id: 'radius', label: 'Glow radius', min: 3, max: 8, step: 0.5, default: 5,
      tradeoff: 'A wider glow reaches more parts, but gives each a smaller bonus.', ends: ['tight, bigger bonus', 'wide, smaller bonus'], fmt: (v) => `${v.toFixed(1)}`,
    }],
  },
  uplight: {
    id: 'uplight', name: 'Level Light', blurb: 'Light them all and your bumpers level up.', kind: 'rollover', cost: 5, weight: 2,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 10, per: 'pass', levelUp: true },
    dials: [{
      id: 'target', label: 'Levels up', min: 0, max: LEVEL_TARGETS.length - 1, step: 1, default: 0,
      tradeoff: 'Which part type this light upgrades. Lights aimed at different types complete separately.', ends: ['Pop Bumpers', 'Slingshots'],
      fmt: (v) => PARTS[LEVEL_TARGETS[Math.round(v)] ?? 'pop'].name,
    }],
  },
  bank: {
    id: 'bank', name: 'Drop-Target Bank', blurb: 'Three targets. They go down. They come back. Everyone is happy.', kind: 'bank', cost: 5, weight: 2,
    shape: { type: 'box', hw: 2.6, hh: 0.45 }, rotatable: true, kickUnit: 0,
    recipe: { points: 60, per: 'target', setBonus: { points: 300, mult: 0.3 }, setCap: 5, perLevel: 10 }, dials: [],
  },
  vari: {
    id: 'vari', name: 'Vari-Target', blurb: 'Tap it, get peanuts. Smash it, get paid.', kind: 'target', cost: 4, weight: 2,
    shape: { type: 'box', hw: 1.3, hh: 0.35 }, rotatable: true, kickUnit: 0,
    recipe: { points: 40, per: 'hit', tiers: VARI_TIERS },
    dials: [{
      id: 'stiff', label: 'Stiffness', min: 0.5, max: 2, step: 0.25, default: 1,
      tradeoff: 'A stiffer target needs a harder hit for every tier, but pays more once you get there.', ends: ['soft, easy tiers', 'stiff, pays more'],
      payoff: (v) => 1 + 0.5 * (v - 1), fmt: (v) => v.toFixed(2),
    }],
  },
  deflector: {
    id: 'deflector', name: 'Deflector', blurb: 'A bouncy bar. Scores nothing, steers everything.', kind: 'deflector', cost: 1, weight: 2,
    shape: { type: 'box', hw: 2.2, hh: 0.28 }, rotatable: true, kickUnit: 0, recipe: {}, dials: [],
  },
  kickback: {
    id: 'kickback', name: 'Kickback', blurb: 'Roll over it and it boots the ball right back. Once per ball.', kind: 'kickback', cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: true, kickUnit: 0,
    recipe: { points: 150, per: 'kick' },
    dials: [{
      id: 'power', label: 'Power', min: 30, max: 110, step: 5, default: 70,
      tradeoff: 'Decides where the ball lands. Rotate the part to aim it.', ends: ['gentle kick', 'strong kick'], fmt: (v) => String(v),
    }],
  },
  saver: {
    id: 'saver', name: 'Ball Saver', blurb: 'Drain early? The machine pretends it never happened.', kind: 'saver', cost: 5, weight: 1,
    shape: { type: 'circle', r: 0.8 }, rotatable: false, kickUnit: 0, recipe: {}, dials: [],
  },
};

export const PART_IDS = Object.keys(PARTS) as PartId[];

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

/** What the run's upgrades multiply a part's base points by (Overclock for its type, a heavy ball for everything). */
export function modFactor(id: PartId, mods: Pick<Mods, 'overclock' | 'pointsFactor'> = neutralMods()): number {
  return (1 + (mods.overclock[id] ?? 0)) * mods.pointsFactor;
}

export function sellPrice(def: PartDef, rate = 0.5): number {
  return Math.floor(def.cost * rate);
}

export const dialValue = (inst: PartInstance, id: string): number =>
  inst.dials[id] ?? PARTS[inst.def].dials.find((d) => d.id === id)?.default ?? 0;

// ---- plain-language description --------------------------------------------------------------------------

export interface DescLine {
  tag: 'score' | 'grow' | 'mult' | 'money' | 'set' | 'spawn' | 'lamp' | 'level' | 'note';
  text: string;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * How this part scores, in sentences. Reads the same data the scorer reads, and the instance's dials
 * when given, so the numbers always match what will actually happen.
 */
export interface DescribeCtx {
  /** The run's level for this part type. */
  level?: number;
  /** The run's upgrades; the numbers in the sentences include them. */
  mods?: Mods;
}

export function describe(def: PartDef, inst?: PartInstance, ctx: DescribeCtx = {}): DescLine[] {
  const level = ctx.level ?? 0;
  const mods = ctx.mods ?? neutralMods();
  const r = def.recipe;
  const lines: DescLine[] = [];
  const factor = (inst ? dialFactor(inst) : 1) * modFactor(def.id, mods);
  const setPts = r.setBonus ? r.setBonus.points * mods.setFactor : 0, setMult = r.setBonus ? r.setBonus.mult * mods.setFactor : 0;
  const f = (n: number) => num(Math.round(n * factor * 100) / 100);

  const lvlBonus = (r.perLevel ?? 0) * level;
  if (r.points) lines.push({ tag: 'score', text: `Scores ${f(r.points + lvlBonus)} per ${r.per ?? 'hit'}.` });
  const upg = modFactor(def.id, mods);
  if (r.points && Math.abs(upg - 1) > 0.001) lines.push({ tag: 'level', text: `Your upgrades multiply its base points by ${num(upg)}.` });
  if (r.grow) lines.push({ tag: 'grow', text: `Grows: +${num(r.grow * factor)} for every ${def.name} hit this ball (all ${def.name}s share it)${r.growCap ? `, up to +${num(r.growCap * factor)}` : ''}.` });
  if (r.perLevel) lines.push({ tag: 'level', text: `Level ${level}/${MAX_LEVEL}: each level adds +${r.perLevel} for the rest of the run.` });
  if (r.mult) lines.push({ tag: 'mult', text: `Raises your Mult by +${num(r.mult)} per ${r.per ?? 'hit'}${r.multCap ? `, up to +${num(r.multCap)} a ball from all ${def.name}s` : ''}.` });
  if (r.money) lines.push({ tag: 'money', text: `Pays $${r.money} per ${r.per ?? 'hit'}${r.moneyCap ? `, up to $${r.moneyCap} a round from all ${def.name}s` : ''}.` });
  if (def.kind === 'lamp') {
    const lamp = lampStats(inst ? dialValue(inst, 'radius') : 5, mods);
    lines.push({ tag: 'lamp', text: `Roll a ball over it to light it for this ball. While lit, every scoring part within ${num(lamp.radius)} units scores +${Math.round(lamp.bonus * 100)}%.` });
  }
  if (r.lights && def.kind === 'rollover') lines.push({ tag: 'note', text: 'Lights up for the rest of this ball.' });
  if (def.id === 'lane') lines.push({ tag: 'note', text: 'Lane change: each flipper press shifts the lit lanes one lane (← left, → right), so you can steer the dark one.' });
  if (r.tiers) {
    const stiff = inst ? dialValue(inst, 'stiff') : 1;
    lines.push({ tag: 'note', text: `Pays more for a harder hit: ${r.tiers.map((t) => `x${t.x} ${t.name}${t.from ? ` (${num(t.from * stiff)}+ speed)` : ''}`).join(', ')}.` });
  }
  if (r.setBonus && def.kind === 'rollover') lines.push({ tag: 'set', text: `Light every Lane Rollover on the board (you need at least two): +${num(setPts)} points and +${num(setMult)} Mult, then they reset. It pays at most ${r.setCap} times a ball.` });
  if (def.kind === 'bank') lines.push({ tag: 'set', text: `Each target you hit drops. Drop all three: +${num(setPts)} points and +${num(setMult)} Mult, then they pop back up (and every new ball). It pays at most ${r.setCap} times a ball.` });
  if (r.levelUp) {
    const t = PARTS[LEVEL_TARGETS[Math.round(inst ? dialValue(inst, 'target') : 0)] ?? 'pop'];
    lines.push({ tag: 'level', text: `Roll over it to light it; roll over it again and it goes out. Light every Level Light aimed at ${t.name}s (you need at least two) to level them up for the rest of the run, then the lights reset.` });
  }
  if (r.spawn) {
    const n = r.spawn + mods.printerExtra;
    lines.push({ tag: 'spawn', text: `Prints ${n === 1 ? 'a second ball' : `${n} more balls`} when it catches one (at most ${r.printCap} printed in one ball, and 4 on the table).` });
  }
  if (def.kind === 'saucer') {
    const hold = inst ? dialValue(inst, 'hold') : 0.6, pw = inst ? dialValue(inst, 'power') : 70;
    lines.push({ tag: 'note', text: `Holds the ball ${num(hold)} s, then fires it out with power ${pw}. Rotate to aim.` });
  }
  if (def.kind === 'spinner') lines.push({ tag: 'note', text: `A faster ball spins it more (1 to ${Math.round(10 * mods.spinBoost)} spins).` });
  if (def.kind === 'flipper') {
    const side = inst ? dialValue(inst, 'side') : 0;
    lines.push({ tag: 'note', text: `A flipper worked by the ${side >= 0.5 ? 'Right (→)' : 'Left (←)'} key. Scores nothing itself.` });
  }
  if (def.kind === 'deflector') lines.push({ tag: 'note', text: 'Scores nothing. A bouncy bar that bends the ball\'s path.' });
  if (def.kind === 'kickback') {
    const pw = inst ? dialValue(inst, 'power') : 70;
    lines.push({ tag: 'note', text: `Armed at the start of every ball. The first time a ball rolls over it, it fires the ball out with power ${pw} and goes dark until the next ball. Rotate to aim.` });
  }
  if (def.kind === 'saver') {
    lines.push({ tag: 'note', text: `Scores nothing. For ${SAVER_WINDOW} s after you launch a ball, a drain sends it back to the plunger instead, and the ball is not spent. Each Ball Saver on the board saves one drain per ball.` });
  }

  return lines;
}
