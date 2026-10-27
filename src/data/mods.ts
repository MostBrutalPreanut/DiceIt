import type { PartId, PartTag } from './parts';

/**
 * Everything the run's decals and the current boss change, as plain numbers. The neutral values are what the
 * game does with no decals, so every recipe sentence and every test reads the same data whether or not a run
 * has any. The sim reads the ball and table fields, the scorer reads the scoring fields, the Game reads the
 * economy fields, and `describe()` reads all of them so the text on a part matches what the part really does.
 */
export interface Mods {
  // --- round rules and economy (Game) ---
  ballsPerRound: number;
  /** $ earned per $5 held at the end of a round (stacks), up to `interestCap`. */
  interestPer: number;
  interestCap: number;
  /** Extra $ every round pays. */
  roundBonus: number;
  /** Extra $ every round pays from the cabinet (the Coin Tray). */
  cabinetPay: number;
  /** $ paid for each ball left unused when a round is won. */
  unusedBallPay: number;
  /** $ off every part in the shop (a part never costs less than $1). */
  couponOff: number;
  /** Fraction of the price refunded when a part the toolbox has no room for is sold. */
  sellRate: number;
  /** Moving and removing parts costs nothing (Free Hands). */
  freeMoves: boolean;
  shopSlots: number;
  toolboxSlots: number;
  /** Shop offers that can be locked for the next round at once. */
  locks: number;
  /** Rerolls each round that cost nothing. */
  freeRerolls: number;
  /** Multiplier on the money overshooting the goal pays. */
  overshootFactor: number;
  /** Extra $ a boss round pays when you clear it. */
  bossBonus: number;
  /** $ at the end of a round for each different part type on the table. */
  perTypePay: number;
  /** $ at the end of a round for each decal on the apron. */
  perDecalPay: number;
  /** One offer in every shop is half price. */
  bargain: boolean;
  /** Boss-only: the round's base pay is lower by this much. */
  payCut: number;
  // --- the ball and the table (Sim) ---
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
  /** Multiplier on how hard bumpers and slingshots kick. */
  kickFactor: number;
  /** Saves per ball that need no Ball Saver part (the same 8 s window). */
  extraSaves: number;
  /** Multiplier on how long a Kickback takes to recharge. */
  kickbackCooldown: number;
  /** Seconds each ball's clock lasts. */
  ballClock: number;
  /** The flipper buttons work the other side's flippers. */
  swapFlippers: boolean;
  /** A pull towards a point of the table (a boss's magnet), or none. */
  magnet: { x: number; y: number; strength: number; radius: number } | null;
  // --- scoring (Scorer) ---
  /** Multiplier on every scoring hit. */
  pointsFactor: number;
  /** Every Nth scoring hit of a round pays $1 (0 = never), up to `goldCap` $ a round. */
  goldEvery: number;
  goldCap: number;
  /** Every Nth scoring hit of a ball pays `luckyX` times (0 = never). */
  luckyEvery: number;
  luckyX: number;
  /** +fraction of base points for each part type (0.5 = +50%). */
  overclock: Partial<Record<PartId, number>>;
  /** Levels each part type counts as having on top of its own (Level Up decals). */
  levelBonus: Partial<Record<PartId, number>>;
  /** Levels every part type counts as having on top of its own (Golden Age). */
  levelAll: number;
  /** Extra glow radius and extra bonus (as a fraction) every Lamp gets. */
  lampRadius: number;
  lampBonus: number;
  /** Multiplier on the points and Mult a complete lane or drop-target set pays. */
  setFactor: number;
  /** Mult every ball starts with. */
  startMult: number;
  /** Extra starting Mult for each part on the table (Crowd Pleaser). */
  startMultPerPart: number;
  /** Extra starting Mult for each empty toolbox slot (Minimalist). */
  startMultPerEmpty: number;
  /** Extra starting Mult for every $5 you hold, up to the cap (Nest Egg). */
  startMultPerFive: number;
  startMultPerFiveCap: number;
  /** Multiplier on what a Hot Shot adds to the next hit. */
  hotFactor: number;
  /** Multiplier on the Mult a Spinner gives per spin. */
  spinMult: number;
  /** Every hit pays this many times while two or more balls are on the table. */
  multiballX: number;
  /** The last ball of a round pays this many times. */
  lastBallX: number;
  /** +fraction of points per $1 you hold, up to `cashCap` (Thrifty). */
  cashPer: number;
  cashCap: number;
  /** Multiplier on the points of every part with this tag. */
  tagFactor: Partial<Record<PartTag, number>>;
  /** Multiplier on the points of every part with none of `tagFactor`'s tags (Bumper Car's catch). */
  untaggedFactor: number;
  /** Every hit pays this many times if the table holds at most `puristTypes` part types (0 = off). */
  puristX: number;
  puristTypes: number;
  /** Multiplier on the speed a Vari-Target or Piggy Bank needs for each tier. */
  tierEase: number;
  /** Multiplier on everything Big Boi pays. */
  bigBoiX: number;
  // --- boss rules (Scorer) ---
  /** Multiplier on every Mult gain. */
  multGain: number;
  /** Parts pay no money this round. */
  noCoins: boolean;
  /** Night Shift: every light (Lamps, lanes, Level Lights, X Lanes, Disco Balls, Spotlights...) pays this much (1 = in full). */
  lightsDim: number;
}

export function neutralMods(): Mods {
  return {
    ballsPerRound: 3, interestPer: 0, interestCap: 0, roundBonus: 0, cabinetPay: 0, unusedBallPay: 1, couponOff: 0, sellRate: 0.5, freeMoves: false, shopSlots: 4,
    toolboxSlots: 4, locks: 1, freeRerolls: 0, overshootFactor: 1, bossBonus: 0, perTypePay: 0, perDecalPay: 0, bargain: false, payCut: 0,
    ballBounce: 0, ballGravity: 1, nudge: 1, spinBoost: 1, twin: false, printerExtra: 0, kickFactor: 1, extraSaves: 0, kickbackCooldown: 1,
    ballClock: 60, swapFlippers: false, magnet: null,
    pointsFactor: 1, goldEvery: 0, goldCap: 0, luckyEvery: 0, luckyX: 2, overclock: {}, levelBonus: {}, levelAll: 0, lampRadius: 0, lampBonus: 0,
    setFactor: 1, startMult: 1, startMultPerPart: 0, startMultPerEmpty: 0, startMultPerFive: 0, startMultPerFiveCap: 0, hotFactor: 1, spinMult: 1, multiballX: 1, lastBallX: 1, cashPer: 0, cashCap: 0,
    tagFactor: {}, untaggedFactor: 1, puristX: 1, puristTypes: 0, tierEase: 1, bigBoiX: 1,
    multGain: 1, noCoins: false, lightsDim: 1,
  };
}

/** The slice of the mods the physics simulation needs. */
export type SimMods = Pick<Mods, 'ballBounce' | 'ballGravity' | 'nudge' | 'spinBoost' | 'twin' | 'printerExtra' | 'kickFactor' | 'extraSaves' | 'kickbackCooldown' | 'swapFlippers' | 'magnet'>;
export const SIM_MOD_KEYS: (keyof SimMods)[] = ['ballBounce', 'ballGravity', 'nudge', 'spinBoost', 'twin', 'printerExtra', 'kickFactor', 'extraSaves', 'kickbackCooldown', 'swapFlippers', 'magnet'];
export const simModsOf = (m: Mods): SimMods => Object.fromEntries(SIM_MOD_KEYS.map((k) => [k, m[k]])) as unknown as SimMods;
