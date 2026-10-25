/**
 * Content as data: every part is a row here. The sim reads `radius`/`kickUnit`,
 * the scorer reads the payout fields, the renderer reads `color`.
 */
export type PartId = 'pop' | 'coin' | 'mega';

export interface DialDef {
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Plain-language trade-off shown next to the slider. */
  tradeoff: string;
}

export interface PartDef {
  id: PartId;
  name: string;
  blurb: string;
  color: number;
  radius: number;
  basePoints: number;
  multGain: number;
  money: number;
  /** Extra ball speed added per point of the Kick dial. */
  kickUnit: number;
  kick: DialDef;
}

const KICK: DialDef = {
  label: 'Kick',
  min: 0,
  max: 4,
  step: 0.25,
  default: 2,
  tradeoff: 'Harder kick sends the ball flying, but pays less per hit.',
};

export const PARTS: Record<PartId, PartDef> = {
  pop: {
    id: 'pop',
    name: 'Pop Bumper',
    blurb: 'Classic. Goes pop.',
    color: 0xff4fa3,
    radius: 1.2,
    basePoints: 100,
    multGain: 0.05,
    money: 0,
    kickUnit: 14,
    kick: KICK,
  },
  coin: {
    id: 'coin',
    name: 'Cha-Ching Bumper',
    blurb: 'Pays $1 per bonk. Tips in points.',
    color: 0xffd23f,
    radius: 1.0,
    basePoints: 40,
    multGain: 0,
    money: 1,
    kickUnit: 12,
    kick: KICK,
  },
  mega: {
    id: 'mega',
    name: 'Big Boi',
    blurb: 'Heavy, rude, hard to miss.',
    color: 0x5ee7ff,
    radius: 1.9,
    basePoints: 250,
    multGain: 0.1,
    money: 0,
    kickUnit: 18,
    kick: { ...KICK, default: 1.5 },
  },
};

export const PART_IDS = Object.keys(PARTS) as PartId[];

/** Kick trades against payout: 2 is neutral, 0 pays +50%, 4 pays -50%. */
export function payoutFactor(kick: number): number {
  return 1 + 0.25 * (2 - kick);
}
