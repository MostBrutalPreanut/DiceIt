import type { UpgradeId } from './upgrades';

/**
 * Relic decals (docs/art-direction.md §8): the Rules column of the major upgrades are run-long rules you
 * stick onto the apron. The rule, name and rarity live in the upgrade's row; this is only how it looks.
 * The shape is unique per decal so you can tell them apart at a glance; the rim colour shows rarity.
 */
export type DecalShape = 'circle' | 'star' | 'shield' | 'ticket' | 'hex' | 'banner';
export type DecalIcon = 'cup' | 'jar' | 'duck' | 'star' | 'clock' | 'receipt' | 'seven';

export interface DecalLook {
  shape: DecalShape;
  /** The vinyl's colour field (content, like a part's name: the same in every theme). */
  color: string;
  icon: DecalIcon;
}

/** Slots on the apron, two each side, where real machines put their rule and price cards. */
export const DECAL_SLOTS = 4;

export const DECALS: Partial<Record<UpgradeId, DecalLook>> = {
  headStart: { shape: 'ticket', color: '#ffae2b', icon: 'clock' },
  lucky: { shape: 'star', color: '#8a63f2', icon: 'seven' },
  ballHog: { shape: 'hex', color: '#55d08f', icon: 'jar' },
};
