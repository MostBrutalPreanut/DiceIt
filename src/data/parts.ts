/**
 * Content as data: every part is a row here. The sim reads shape, kind and kick, the scorer reads
 * the recipe, the renderer reads color, and the UI reads `describe()`, which turns the same recipe
 * into plain sentences so "how does this thing score?" can never drift from what it actually does.
 */
import { SAVER_WINDOW } from '../sim/constants';

export type PartId = 'pop' | 'coin' | 'mega' | 'sling' | 'spinner' | 'lane' | 'printer' | 'flipper' | 'lamp' | 'deflector' | 'uplight' | 'bank' | 'kickback' | 'saver';
export type PartKind = 'bumper' | 'kicker' | 'deflector' | 'spinner' | 'rollover' | 'saucer' | 'flipper' | 'lamp' | 'bank' | 'kickback' | 'saver';

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
  /** +Mult per event. */
  mult?: number;
  money?: number;
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
}

export type Shape = { type: 'circle'; r: number } | { type: 'box'; hw: number; hh: number };

export interface PartDef {
  id: PartId;
  name: string;
  blurb: string;
  kind: PartKind;
  color: number;
  cost: number;
  /** Relative chance of appearing in the shop. */
  weight: number;
  shape: Shape;
  rotatable: boolean;
  /** Ball speed added per point of the Kick dial (bumpers and kickers). */
  kickUnit: number;
  recipe: Recipe;
  dials: DialDef[];
}

const kickDial = (def: number, tradeoff = 'A harder kick sends the ball farther, but pays less.'): DialDef => ({
  id: 'kick', label: 'Kick', min: 0, max: 4, step: 0.25, default: def, tradeoff,
  // neutral at the default, so the numbers printed in the recipe are the numbers you get
  payoff: (v) => 1 + 0.25 * (def - v),
  fmt: (v) => v.toFixed(2),
});

export const PARTS: Record<PartId, PartDef> = {
  pop: {
    id: 'pop', name: 'Pop Bumper', blurb: 'Classic. Goes pop.', kind: 'bumper', color: 0xff4fa3, cost: 3, weight: 3,
    shape: { type: 'circle', r: 1.2 }, rotatable: false, kickUnit: 14,
    recipe: { points: 100, per: 'hit', grow: 5, perLevel: 10 }, dials: [kickDial(2)],
  },
  coin: {
    id: 'coin', name: 'Cha-Ching Bumper', blurb: 'Pays $1 per bonk. Tips in points.', kind: 'bumper', color: 0xffd23f, cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.0 }, rotatable: false, kickUnit: 12,
    recipe: { points: 40, per: 'hit', money: 1, perLevel: 8 }, dials: [kickDial(2)],
  },
  mega: {
    id: 'mega', name: 'Big Boi', blurb: 'Heavy, rude, hard to miss.', kind: 'bumper', color: 0x5ee7ff, cost: 6, weight: 2,
    shape: { type: 'circle', r: 1.9 }, rotatable: false, kickUnit: 18,
    recipe: { points: 250, per: 'hit', mult: 0.1, perLevel: 25 }, dials: [kickDial(1.5)],
  },
  sling: {
    id: 'sling', name: 'Slingshot', blurb: 'A rubber band with opinions.', kind: 'kicker', color: 0xff8a3d, cost: 4, weight: 2,
    shape: { type: 'box', hw: 1.7, hh: 0.4 }, rotatable: true, kickUnit: 16,
    recipe: { points: 30, per: 'hit', perLevel: 10 }, dials: [kickDial(3, 'A harder snap throws the ball across the table, but pays less.')],
  },
  spinner: {
    id: 'spinner', name: 'Spinner', blurb: 'Whee. Faster ball, more whee.', kind: 'spinner', color: 0x62f08a, cost: 4, weight: 2,
    shape: { type: 'box', hw: 1.4, hh: 0.3 }, rotatable: true, kickUnit: 0,
    recipe: { points: 10, per: 'spin', perLevel: 3 },
    dials: [{
      id: 'drag', label: 'Drag', min: 0, max: 3, step: 0.25, default: 1,
      tradeoff: 'A heavier spinner pays more per spin, but slows the ball down more.',
      payoff: (v) => 1 + 0.25 * v, fmt: (v) => v.toFixed(2),
    }],
  },
  lane: {
    id: 'lane', name: 'Lane Rollover', blurb: 'Roll over it. It lights up. Cheap thrills.', kind: 'rollover', color: 0x9fe8ff, cost: 3, weight: 3,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 50, per: 'roll-over', lights: true, setBonus: { points: 200, mult: 0.5 }, perLevel: 10 }, dials: [],
  },
  printer: {
    id: 'printer', name: 'Ball Printer', blurb: 'Eats one ball. Prints two. Allegedly legal.', kind: 'saucer', color: 0xb67dff, cost: 7, weight: 1,
    shape: { type: 'circle', r: 1.1 }, rotatable: true, kickUnit: 0,
    recipe: { points: 200, per: 'ball caught', spawn: 1, perLevel: 50 },
    dials: [
      {
        id: 'hold', label: 'Hold', min: 0.2, max: 2, step: 0.1, default: 0.6,
        tradeoff: 'Holding longer pays more, but that ball sits out of play meanwhile.',
        payoff: (v) => 1 + 0.5 * (v - 0.6), fmt: (v) => `${v.toFixed(1)} s`,
      },
      {
        id: 'power', label: 'Eject power', min: 30, max: 110, step: 5, default: 70,
        tradeoff: 'Decides where the ball lands. Rotate the part to aim it.', fmt: (v) => String(v),
      },
    ],
  },
  flipper: {
    id: 'flipper', name: 'Extra Flipper', blurb: 'Because two hands were never enough.', kind: 'flipper', color: 0xffb02e, cost: 8, weight: 1,
    shape: { type: 'circle', r: 2.6 }, rotatable: false, kickUnit: 0,
    recipe: {},
    dials: [{
      id: 'side', label: 'Button', min: 0, max: 1, step: 1, default: 0,
      tradeoff: 'Which flipper button works it. Left (Z) or Right (/).', fmt: (v) => (v >= 0.5 ? 'Right' : 'Left'),
    }],
  },
  lamp: {
    id: 'lamp', name: 'Lamp', blurb: 'Light it up and the neighbours score more.', kind: 'lamp', color: 0xfff176, cost: 5, weight: 2,
    shape: { type: 'circle', r: 0.8 }, rotatable: false, kickUnit: 0,
    recipe: { lights: true },
    dials: [{
      id: 'radius', label: 'Glow radius', min: 3, max: 8, step: 0.5, default: 5,
      tradeoff: 'A wider glow reaches more parts, but gives each a smaller bonus.', fmt: (v) => `${v.toFixed(1)}`,
    }],
  },
  uplight: {
    id: 'uplight', name: 'Level Light', blurb: 'Light them all and your bumpers level up. Hit one twice and it goes out.', kind: 'rollover', color: 0xffffff, cost: 5, weight: 2,
    shape: { type: 'circle', r: 0.9 }, rotatable: false, kickUnit: 0,
    recipe: { points: 10, per: 'pass', levelUp: true },
    dials: [{
      id: 'target', label: 'Levels up', min: 0, max: LEVEL_TARGETS.length - 1, step: 1, default: 0,
      tradeoff: 'Which part type this light upgrades. Lights aimed at different types complete separately.',
      fmt: (v) => PARTS[LEVEL_TARGETS[Math.round(v)] ?? 'pop'].name,
    }],
  },
  bank: {
    id: 'bank', name: 'Drop-Target Bank', blurb: 'Three targets. They go down. They come back. Everyone is happy.', kind: 'bank', color: 0xff5d6c, cost: 5, weight: 2,
    shape: { type: 'box', hw: 2.6, hh: 0.45 }, rotatable: true, kickUnit: 0,
    recipe: { points: 60, per: 'target', setBonus: { points: 300, mult: 0.3 }, perLevel: 10 }, dials: [],
  },
  deflector: {
    id: 'deflector', name: 'Deflector', blurb: 'A bouncy bar. Scores nothing, steers everything.', kind: 'deflector', color: 0x8b95c9, cost: 1, weight: 2,
    shape: { type: 'box', hw: 2.2, hh: 0.28 }, rotatable: true, kickUnit: 0, recipe: {}, dials: [],
  },
  kickback: {
    id: 'kickback', name: 'Kickback', blurb: 'Roll over it and it boots the ball right back. Once per ball.', kind: 'kickback', color: 0x4d8bff, cost: 4, weight: 2,
    shape: { type: 'circle', r: 1.1 }, rotatable: true, kickUnit: 0,
    recipe: { points: 150, per: 'kick' },
    dials: [{
      id: 'power', label: 'Power', min: 30, max: 110, step: 5, default: 70,
      tradeoff: 'Decides where the ball lands. Rotate the part to aim it.', fmt: (v) => String(v),
    }],
  },
  saver: {
    id: 'saver', name: 'Ball Saver', blurb: 'Shoot again! If you drain early, the machine pretends it never happened.', kind: 'saver', color: 0xb6ff5c, cost: 5, weight: 1,
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

export function sellPrice(def: PartDef): number {
  return Math.floor(def.cost / 2);
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
export function describe(def: PartDef, inst?: PartInstance, level = 0): DescLine[] {
  const r = def.recipe;
  const lines: DescLine[] = [];
  const factor = inst ? dialFactor(inst) : 1;
  const f = (n: number) => num(Math.round(n * factor * 100) / 100);

  const lvlBonus = (r.perLevel ?? 0) * level;
  if (r.points) lines.push({ tag: 'score', text: `Scores ${f(r.points + lvlBonus)} per ${r.per ?? 'hit'}, times your Mult.` });
  if (r.grow) lines.push({ tag: 'grow', text: `Grows: +${num(r.grow * factor)} for every ${def.name} hit this ball (all ${def.name}s share it).` });
  if (r.perLevel) lines.push({ tag: 'level', text: `Level ${level} of ${MAX_LEVEL}${level ? ` (+${lvlBonus})` : ''}: each level adds +${r.perLevel} per ${r.per ?? 'hit'} for the rest of the run.` });
  if (r.mult) lines.push({ tag: 'mult', text: `Raises your Mult by +${num(r.mult)} per ${r.per ?? 'hit'}.` });
  if (r.money) lines.push({ tag: 'money', text: `Pays $${r.money} per ${r.per ?? 'hit'}.` });
  if (def.kind === 'lamp') {
    const rad = inst ? dialValue(inst, 'radius') : 5;
    lines.push({ tag: 'lamp', text: `Roll a ball over it to light it for this ball. While lit, every scoring part within ${num(rad)} units scores +${Math.round(lampBonus(rad) * 100)}%.` });
  }
  if (r.lights && def.kind === 'rollover') lines.push({ tag: 'note', text: 'Lights up for the rest of this ball.' });
  if (r.setBonus && def.kind === 'rollover') lines.push({ tag: 'set', text: `Light every Lane Rollover on the board: +${r.setBonus.points} points and +${num(r.setBonus.mult)} Mult, then they reset.` });
  if (def.kind === 'bank') lines.push({ tag: 'set', text: `Each target you hit drops. Drop all three: +${r.setBonus!.points} points and +${num(r.setBonus!.mult)} Mult, then they pop back up (and every new ball).` });
  if (r.levelUp) {
    const t = PARTS[LEVEL_TARGETS[Math.round(inst ? dialValue(inst, 'target') : 0)] ?? 'pop'];
    lines.push({ tag: 'level', text: `Roll over it to light it; roll over it again and it goes out. Light every Level Light aimed at ${t.name}s (you need at least two) to level them up for the rest of the run, then the lights reset.` });
  }
  if (r.spawn) lines.push({ tag: 'spawn', text: 'Prints a second ball when it catches one (up to 4 on the table).' });
  if (def.kind === 'saucer') {
    const hold = inst ? dialValue(inst, 'hold') : 0.6, pw = inst ? dialValue(inst, 'power') : 70;
    lines.push({ tag: 'note', text: `Holds the ball ${num(hold)} s, then fires it out with power ${pw}. Rotate to aim.` });
  }
  if (def.kind === 'spinner') lines.push({ tag: 'note', text: 'A faster ball spins it more (1 to 10 spins).' });
  if (def.kind === 'kicker') lines.push({ tag: 'note', text: 'Kicks the ball away from whichever face it hits.' });
  if (def.kind === 'bumper') lines.push({ tag: 'note', text: 'Kicks the ball away from its centre.' });
  if (def.kind === 'flipper') {
    const side = inst ? dialValue(inst, 'side') : 0;
    lines.push({ tag: 'note', text: `A flipper worked by the ${side >= 0.5 ? 'Right (/)' : 'Left (Z)'} button. Scores nothing itself.` });
  }
  if (def.kind === 'deflector') lines.push({ tag: 'note', text: 'Scores nothing. A bouncy bar that bends the ball\'s path.' });
  if (def.kind === 'kickback') {
    const pw = inst ? dialValue(inst, 'power') : 70;
    lines.push({ tag: 'note', text: `Armed at the start of every ball. The first time a ball rolls over it, it fires the ball out with power ${pw} and goes dark until the next ball. Rotate to aim.` });
  }
  if (def.kind === 'saver') {
    lines.push({ tag: 'note', text: `Scores nothing. For ${SAVER_WINDOW} s after you launch a ball, a drain sends it back to the plunger instead, and the ball is not spent. Each Ball Saver on the board saves one drain per ball.` });
  }

  for (const d of def.dials) {
    if (!d.payoff) continue;
    const v = inst ? dialValue(inst, d.id) : d.default;
    lines.push({ tag: 'note', text: `${d.label} ${d.fmt ? d.fmt(v) : v}: payout ×${num(d.payoff(v))}. ${d.tradeoff}` });
  }
  return lines;
}
