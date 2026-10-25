// Theme kits for the concept art. A theme is tokens plus a few motif picks; every part keeps the same
// silhouette in every theme (shape carries identity, colour second), so a new machine is a new row here.
import type { PartId } from '../../src/data/parts';

export type Motif = 'awning' | 'cone' | 'rivets';
export type Debris = 'pea' | 'leaf' | 'bolt';

export interface Theme {
  id: string;
  name: string; // the machine's name on the backglass
  tagline: string;
  /** page behind everything, and the paper used for cards and stickers */
  bg: string;
  paper: string;
  /** outline colour: always a dark hue from the palette, never black */
  ink: string;
  /** shadows lean towards this hue (castle: cool blue under warm light) */
  shadeTint: string;
  floor: string;
  floor2: string;
  rail: string; // the playfield walls
  rim: string; // the cabinet wood or stone around the field
  metal: string;
  rubber: string;
  accent: string;
  glow: string;
  smoke: string;
  dmd: string; // dot-matrix lit colour
  /** each part's role colour; must stay distinguishable within the theme */
  role: Record<PartId, string>;
  popMotif: Motif;
  debris: Debris;
  backdrop: 'squiggle' | 'waves' | 'curls'; // the page behind the machine, drifting slowly
  laneWord: string; // the lane rollovers spell this, one letter each
  floorArt: 'plates' | 'checker' | 'meadow';
  surround: 'factory' | 'diner' | 'castle';
}

export const FACTORY: Theme = {
  id: 'factory', name: 'FREE PLAY', tagline: 'FUNHOUSE FACTORY',
  bg: '#f6d54a', paper: '#fff8e6', ink: '#3b2a4a', shadeTint: '#6a4fa0',
  floor: '#fbe7a1', floor2: '#f2d77a', rail: '#e9e4f0', rim: '#8f7ad6', metal: '#d9dbe6', rubber: '#3b2a4a',
  accent: '#ff5d8f', glow: '#fff4a8', smoke: '#ffffff', dmd: '#ff9a3c',
  role: {
    pop: '#3cc3b1', coin: '#ffae2b', mega: '#8a63f2', sling: '#ff6b6b', spinner: '#a3d143', lane: '#62b8ff',
    printer: '#ff8fc8', flipper: '#ff6b6b', lamp: '#fff1a0', uplight: '#ffffff', bank: '#c2417a', deflector: '#b8b2cc',
    kickback: '#5b8cff', saver: '#c5e84a', vari: '#ff9a3c',
  },
  popMotif: 'rivets', debris: 'bolt', laneWord: 'FUN', backdrop: 'squiggle', floorArt: 'plates', surround: 'factory',
};

export const DINER: Theme = {
  id: 'diner', name: 'FREE PLAY', tagline: 'SHORT ORDER',
  bg: '#d7cfc1', paper: '#f6efdf', ink: '#3a2219', shadeTint: '#7a3a26',
  floor: '#e7b257', floor2: '#d99b3e', rail: '#f6efdf', rim: '#c8553d', metal: '#c3cdd0', rubber: '#3a2219',
  accent: '#d9473b', glow: '#ffe3a0', smoke: '#fbf6ea', dmd: '#ffb347',
  role: {
    pop: '#d9473b', coin: '#f2c14e', mega: '#f6efdf', sling: '#7f9c3c', spinner: '#5e8c8a', lane: '#f08a4b',
    printer: '#b9c6c9', flipper: '#f6efdf', lamp: '#ffe08a', uplight: '#ffffff', bank: '#7a4a2e', deflector: '#a9b4b6',
    kickback: '#4f7f9c', saver: '#9bb84d', vari: '#e07a3f',
  },
  popMotif: 'awning', debris: 'pea', laneWord: 'EAT', backdrop: 'waves', floorArt: 'checker', surround: 'diner',
};

export const CASTLE: Theme = {
  id: 'castle', name: 'FREE PLAY', tagline: 'CASTLE CRASH',
  bg: '#cbbba8', paper: '#f4efe6', ink: '#3d2f2a', shadeTint: '#4f63a6',
  floor: '#9cc25a', floor2: '#bcd776', rail: '#eef1f4', rim: '#b7713e', metal: '#dfe5ec', rubber: '#3d2f2a',
  accent: '#e2704f', glow: '#ffe6a0', smoke: '#ffffff', dmd: '#ffc04d',
  role: {
    pop: '#e2704f', coin: '#f2c14e', mega: '#eef1f4', sling: '#8b5a35', spinner: '#4c86c6', lane: '#7fc0e8',
    printer: '#d8c3a5', flipper: '#eef1f4', lamp: '#f59ad0', uplight: '#ffffff', bank: '#8e6bb0', deflector: '#6f6a64',
    kickback: '#5a6fb5', saver: '#a6d65a', vari: '#d98a3a',
  },
  popMotif: 'cone', debris: 'leaf', laneWord: 'WIN', backdrop: 'curls', floorArt: 'meadow', surround: 'castle',
};

export const THEMES = [FACTORY, DINER, CASTLE];

// ---- colour maths: shading is derived, so a theme only picks base colours ----
const hx = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (v: number[]) => '#' + v.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const A = hx(a), B = hx(b);
  return toHex(A.map((n, i) => n + (B[i] - n) * t));
};
export interface Mat { base: string; shade: string; mid: string; light: string }
/** One material = base + a shade pushed towards the theme's shadow hue + a light tone. Flat cel steps, no gradients. */
export const mat = (t: Theme, base: string): Mat => ({
  base,
  mid: mix(base, t.shadeTint, 0.16),
  shade: mix(base, t.shadeTint, 0.34),
  light: mix(base, '#ffffff', 0.5),
});

/** A role colour that is safe as a thin line or bar on paper: very light colours are pulled towards ink. */
export const legible = (t: Theme, c: string) => {
  const [r, g, b] = hx(c).map((n) => n / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.72 ? mix(c, t.ink, 0.45) : c;
};

/**
 * The per-theme check from the art direction: scoring parts must be told apart by colour within a
 * theme (shape is the first cue, colour the second). Returns the pairs that are too close.
 */
export function roleClashes(t: Theme, min = 70): string[] {
  const ids = ['pop', 'coin', 'mega', 'sling', 'spinner', 'lane', 'printer', 'lamp', 'bank'] as const;
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = hx(t.role[ids[i]]), b = hx(t.role[ids[j]]);
    const d = Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.3, a[2] - b[2]); // green weighted: the eye is most sensitive to it
    if (d < min) out.push(`${t.id}: ${ids[i]} and ${ids[j]} are too close (${Math.round(d)})`);
  }
  return out;
}
