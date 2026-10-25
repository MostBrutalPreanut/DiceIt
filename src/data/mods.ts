import type { PartId } from './parts';

/**
 * Everything the run's upgrades change, as plain numbers. The neutral values are what the game does with
 * no upgrades, so every recipe sentence and every test reads the same data whether or not a run has any.
 * The sim reads the ball and nudge fields, the scorer reads the scoring fields, the Game reads the economy
 * fields, and `describe()` reads all of them so the text on a part matches what the part really does.
 */
export interface Mods {
  // --- round rules and economy (Game) ---
  ballsPerRound: number;
  /** $ earned per $4 held at the end of a round (stacks), up to `interestCap`. */
  interestPer: number;
  interestCap: number;
  /** Extra $ every round pays. */
  roundBonus: number;
  /** $ paid for each ball left unused when a round is won. */
  unusedBallPay: number;
  /** $ off every part in the shop (a part never costs less than $1). */
  couponOff: number;
  /** Fraction of the price refunded when you sell a part. */
  sellRate: number;
  shopSlots: number;
  // --- the ball itself (Sim) ---
  /** Added to the ball's restitution (0.3 base). */
  ballBounce: number;
  /** Multiplier on gravity for the ball (a light ball falls slower and hangs in the air). */
  ballGravity: number;
  /** Multiplier on how hard a nudge shoves the ball. */
  nudge: number;
  /** Multiplier on how many spins a spinner gives. */
  spinBoost: number;
  /** Every ball arrives with a twin. */
  twin: boolean;
  /** Extra balls a Ball Printer makes per catch, on top of its own. */
  printerExtra: number;
  // --- scoring (Scorer) ---
  /** Multiplier on every scoring hit. */
  pointsFactor: number;
  /** Every Nth scoring hit of a round pays $1 (0 = never), up to `goldCap` $ a round. */
  goldEvery: number;
  goldCap: number;
  /** Every Nth scoring hit of a ball pays double (0 = never). */
  luckyEvery: number;
  /** +fraction of base points for each part type (0.5 = +50%). */
  overclock: Partial<Record<PartId, number>>;
  /** Extra glow radius and extra bonus (as a fraction) every Lamp gets. */
  lampRadius: number;
  lampBonus: number;
  /** Multiplier on the points and Mult a complete lane or drop-target set pays. */
  setFactor: number;
  /** Mult every ball starts with. */
  startMult: number;
}

export function neutralMods(): Mods {
  return {
    ballsPerRound: 3, interestPer: 0, interestCap: 0, roundBonus: 0, unusedBallPay: 3, couponOff: 0, sellRate: 0.5, shopSlots: 4,
    ballBounce: 0, ballGravity: 1, nudge: 1, spinBoost: 1, twin: false, printerExtra: 0,
    pointsFactor: 1, goldEvery: 0, goldCap: 0, luckyEvery: 0, overclock: {}, lampRadius: 0, lampBonus: 0, setFactor: 1, startMult: 1,
  };
}

/** The slice of the mods the physics simulation needs. */
export type SimMods = Pick<Mods, 'ballBounce' | 'ballGravity' | 'nudge' | 'spinBoost' | 'twin' | 'printerExtra'>;
