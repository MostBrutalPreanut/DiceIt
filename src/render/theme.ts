// Theme kits (docs/art-direction.md §4). A theme is colour tokens plus a few motif picks; every part keeps
// the same silhouette in every theme (shape carries identity, colour second), so a new machine is a new
// row here. Every colour the game draws, on the canvas and in the HTML panels, comes from these rows.
import type { PartId } from '../data/parts';
import type { MachineId } from '../data/bigboi';

export type Motif = 'awning' | 'cone' | 'rivets';
export type Debris = 'pea' | 'leaf' | 'bolt';
export type ThemeId = MachineId;

export interface Theme {
  id: ThemeId;
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
  /** the unlit glass of the dot-matrix display */
  screen: string;
  /** each part's role colour; must stay distinguishable within the theme */
  role: Record<PartId, string>;
  /** the few colours the surround, floor art and debris need beyond the tokens above */
  art: {
    floorAlt: string; debrisA: string; debrisB: string; props: string[]; trunk: string; foliage: string; twinkle: [string, string];
    /** castle: the flagstones of the floor path (grey-brown rock tones) and the castle's wall stone */
    rock?: string[]; stone?: string;
  };
  popMotif: Motif;
  debris: Debris;
  backdrop: 'squiggle' | 'waves' | 'curls'; // the page behind the machine, drifting slowly
  laneWord: string; // the lane rollovers spell this, one letter each
  floorArt: 'plates' | 'checker' | 'meadow';
  surround: 'factory' | 'diner' | 'castle';
}

export const FACTORY: Theme = {
  id: 'factory', name: 'BIG BOI', tagline: 'FUNHOUSE FACTORY',
  bg: '#f6d54a', paper: '#fff8e6', ink: '#3b2a4a', shadeTint: '#6a4fa0',
  floor: '#fbe7a1', floor2: '#f2d77a', rail: '#e9e4f0', rim: '#8f7ad6', metal: '#d9dbe6', rubber: '#3b2a4a',
  accent: '#ff5d8f', glow: '#fff4a8', smoke: '#ffffff', dmd: '#ff9a3c', screen: '#241a26',
  role: {
    pop: '#3cc3b1', coin: '#ffae2b', mega: '#8a63f2', sling: '#ff6b6b', spinner: '#a3d143', lane: '#62b8ff',
    printer: '#ff8fc8', flipper: '#ff6b6b', lamp: '#ffe45c', uplight: '#ffffff', bank: '#c2417a', deflector: '#b8b2cc',
    kickback: '#3050ff', saver: '#c5e84a', vari: '#2c6e49',
    ding: '#ff9a3c', piggy: '#ffa6c9', magnet: '#e04848', thunder: '#4a6cff', jackpot: '#ff5d8f', xlane: '#00a6e6', golden: '#ffd23f', disco: '#d6dcff', trophy: '#c9d6e8',
    flipperR: '#ff6b6b', duck: '#ffd23f', goal: '#3cc3b1', strip: '#ff5d8f', roller: '#62b8ff',
  },
  art: { floorAlt: '#f2d77a', debrisA: '#d9dbe6', debrisB: '#fff8e6', props: ['#3cc3b1', '#8a63f2', '#ff5d8f', '#3cc3b1'], trunk: '#8f7ad6', foliage: '#3cc3b1', twinkle: ['#fff8e6', '#ffae2b'] },
  popMotif: 'rivets', debris: 'bolt', laneWord: 'FUN', backdrop: 'squiggle', floorArt: 'plates', surround: 'factory',
};

export const DINER: Theme = {
  id: 'diner', name: 'BIG BOI', tagline: 'SHORT ORDER',
  bg: '#d7cfc1', paper: '#f6efdf', ink: '#3a2219', shadeTint: '#7a3a26',
  floor: '#e7b257', floor2: '#d99b3e', rail: '#f6efdf', rim: '#c8553d', metal: '#c3cdd0', rubber: '#3a2219',
  accent: '#d9473b', glow: '#ffe3a0', smoke: '#fbf6ea', dmd: '#ffb347', screen: '#2a1a14',
  role: {
    pop: '#d9473b', coin: '#f2c14e', mega: '#f6efdf', sling: '#7f9c3c', spinner: '#5e8c8a', lane: '#f08a4b',
    printer: '#b9c6c9', flipper: '#f6efdf', lamp: '#ffe08a', uplight: '#ffffff', bank: '#7a4a2e', deflector: '#a9b4b6',
    kickback: '#2d4fb3', saver: '#9bb84d', vari: '#2c6e49',
    ding: '#b35d2a', piggy: '#f5a3b8', magnet: '#a8322a', thunder: '#3e6fb0', jackpot: '#e05f8a', xlane: '#4aa3c8', golden: '#e8b600', disco: '#dcd6ff', trophy: '#d6cdbd',
    flipperR: '#f6efdf', duck: '#f2c14e', goal: '#7f9c3c', strip: '#d9473b', roller: '#5e8c8a',
  },
  art: { floorAlt: '#5e8c8a', debrisA: '#8ea547', debrisB: '#c6d77a', props: ['#d9473b', '#f2c14e', '#7f9c3c', '#d9473b', '#f6efdf', '#f2c14e'], trunk: '#7a4a2e', foliage: '#7f9c3c', twinkle: ['#f6efdf', '#f2c14e'] },
  popMotif: 'awning', debris: 'pea', laneWord: 'EAT', backdrop: 'waves', floorArt: 'checker', surround: 'diner',
};

export const CASTLE: Theme = {
  id: 'castle', name: 'BIG BOI', tagline: 'CASTLE CRASH',
  bg: '#cbbba8', paper: '#f4efe6', ink: '#3d2f2a', shadeTint: '#4f63a6',
  floor: '#9cc25a', floor2: '#bcd776', rail: '#eef1f4', rim: '#b7713e', metal: '#dfe5ec', rubber: '#3d2f2a',
  accent: '#e2704f', glow: '#ffe6a0', smoke: '#ffffff', dmd: '#ffc04d', screen: '#221c22',
  role: {
    pop: '#e2704f', coin: '#f2c14e', mega: '#eef1f4', sling: '#8b5a35', spinner: '#4c86c6', lane: '#7fc0e8',
    printer: '#d8c3a5', flipper: '#eef1f4', lamp: '#f59ad0', uplight: '#ffffff', bank: '#8e6bb0', deflector: '#6f6a64',
    kickback: '#00a890', saver: '#a6d65a', vari: '#38b860',
    ding: '#c98a2e', piggy: '#f0a0b8', magnet: '#b53b3b', thunder: '#5b4fc4', jackpot: '#d0557f', xlane: '#3aa0d8', golden: '#f0c419', disco: '#e6e0ff', trophy: '#cfd3da',
    flipperR: '#eef1f4', duck: '#f2c14e', goal: '#4c86c6', strip: '#e2704f', roller: '#7fc0e8',
  },
  art: {
    floorAlt: '#bcd776', debrisA: '#7aa83f', debrisB: '#eef1f4', props: ['#5b8a3a', '#7aa83f'], trunk: '#8b5a35', foliage: '#5b8a3a', twinkle: ['#fff6e0', '#ffd36e'],
    rock: ['#b8aa96', '#9e8f7b', '#c6bdad', '#918679', '#aaa294'], stone: '#d6ccbc',
  },
  popMotif: 'cone', debris: 'leaf', laneWord: 'WIN', backdrop: 'curls', floorArt: 'meadow', surround: 'castle',
};

export const THEMES: Theme[] = [FACTORY, DINER, CASTLE];
export const themeById = (id: string | null | undefined): Theme | null => THEMES.find((t) => t.id === id) ?? null;

/** The ball is near-white with an ink outline in every theme (the readability budget); upgrades re-skin it. */
export const BALL_WEAR = {
  plain: { core: '#e8ecf4', shade: '#a8b1c6' },
  gold: { core: '#ffe27a', shade: '#c99a1e' },
  steel: { core: '#c3cad8', shade: '#7c869e' },
  glass: { core: '#f2feff', shade: '#9fdcef' },
  rubber: { core: '#ffc2dc', shade: '#ff7fb0' },
} as const;
export const WHITE = '#ffffff';
/** The receipt paper the ledger prints on: a touch whiter than any theme's card paper. */
export const RECEIPT = '#fffdf6';

// ---- colour maths: shading is derived, so a theme only picks base colours ----
const hx = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (v: number[]) => '#' + v.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const A = hx(a), B = hx(b);
  return toHex(A.map((n, i) => n + (B[i] - n) * t));
};
/** Blends two colours round the colour wheel (hue, saturation, lightness), so the steps between stay vivid. */
export const mixHue = (a: string, b: string, t: number) => {
  const toHsl = (c: string) => {
    const [r, g, bb] = hx(c).map((n) => n / 255), max = Math.max(r, g, bb), min = Math.min(r, g, bb), l = (max + min) / 2, d = max - min;
    if (d === 0) return [0, 0, l];
    const sat = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - bb) / d + 6) % 6 : max === g ? (bb - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, sat, l];
  };
  const [h1, s1, l1] = toHsl(a), [h2, s2, l2] = toHsl(b);
  let dh = h2 - h1;
  if (s1 < 0.05) dh = 0; // a grey or white has no hue of its own: take the target's
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const h = (((s1 < 0.05 ? h2 : h1 + dh * t) % 360) + 360) % 360, sat = s1 + (s2 - s1) * t, l = l1 + (l2 - l1) * t;
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([r + m, g + m, bb + m].map((n) => n * 255));
};

/** '#rrggbb' to the 0xrrggbb number Pixi tints take. */
export const num = (c: string) => parseInt(c.slice(1), 16);
export const rgba = (c: string, a: number) => `rgba(${hx(c).join(',')},${a})`;

export interface Mat { base: string; shade: string; mid: string; light: string }
/** One material = base + a shade pushed towards the theme's shadow hue + a light tone. Flat cel steps, no gradients. */
export const mat = (t: Theme, base: string): Mat => ({
  base,
  mid: mix(base, t.shadeTint, 0.16),
  shade: mix(base, t.shadeTint, 0.34),
  light: mix(base, WHITE, 0.5),
});

const lum = (c: string) => {
  const [r, g, b] = hx(c).map((n) => n / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** A role colour that is safe as a thin line or bar on paper: very light colours are pulled towards ink. */
export const legible = (t: Theme, c: string) => (lum(c) > 0.72 ? mix(c, t.ink, 0.45) : c);
/** A role colour that reads as a fill on paper: role colours that ARE paper (Big Boi in the Diner) use the accent. */
export const roleFill = (t: Theme, id: PartId) => (t.role[id] === t.paper ? t.accent : t.role[id]);

/** WCAG relative luminance and contrast ratio. */
const relLum = (c: string) => {
  const [r, g, b] = hx(c).map((n) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const A = relLum(a), B = relLum(b);
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
};
const dist = (a: string, b: string) => {
  const A = hx(a), B = hx(b);
  return Math.hypot(A[0] - B[0], (A[1] - B[1]) * 1.3, A[2] - B[2]); // green weighted: the eye is most sensitive to it
};

/** The part types that score: these must be told apart by colour within a theme. */
export const SCORING_ROLES = ['pop', 'coin', 'mega', 'sling', 'spinner', 'lane', 'printer', 'lamp', 'bank', 'vari', 'kickback'] as const;

/**
 * The per-theme check from the art direction: scoring parts must be told apart by colour within a
 * theme (shape is the first cue, colour the second). Returns the pairs that are too close.
 */
export function roleClashes(t: Theme, min = 70): string[] {
  const ids = SCORING_ROLES;
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const d = dist(t.role[ids[i]], t.role[ids[j]]);
    if (d < min) out.push(`${t.id}: ${ids[i]} and ${ids[j]} are too close (${Math.round(d)})`);
  }
  return out;
}

/** The other automated checks of §4: ink on paper passes WCAG AA, and the ball's outline stands out on the floor. */
export function themeProblems(t: Theme): string[] {
  const out: string[] = [];
  const ip = contrast(t.ink, t.paper);
  if (ip < 4.5) out.push(`${t.id}: ink on paper is ${ip.toFixed(2)}:1, under WCAG AA`);
  const fl = contrast(t.ink, t.floor);
  if (fl < 4.5) out.push(`${t.id}: the ball's ink outline on the floor is ${fl.toFixed(2)}:1`);
  for (const id of SCORING_ROLES) {
    const d = dist(t.role[id], t.floor);
    if (d < 20) out.push(`${t.id}: ${id} is too close to the floor (${Math.round(d)})`);
  }
  return out;
}

/** The tokens as CSS custom properties, so the HTML panels use the same colours as the canvas. */
export function themeVars(t: Theme): Record<string, string> {
  const v: Record<string, string> = {
    '--bg': t.bg, '--paper': t.paper, '--ink': t.ink, '--shade': t.shadeTint, '--floor': t.floor, '--floor2': t.floor2,
    '--rail': t.rail, '--rim': t.rim, '--metal': t.metal, '--rubber': t.rubber, '--accent': t.accent, '--glow': t.glow,
    '--dmd': t.dmd, '--screen': t.screen, '--white': WHITE, '--receipt': RECEIPT,
    '--band': mix(t.rim, t.shadeTint, 0.3), '--rim-light': mix(t.rim, t.paper, 0.2), '--tray': mix(t.rim, t.shadeTint, 0.35),
    '--tile': mix(t.paper, t.shadeTint, 0.06), '--chip': mix(t.paper, t.shadeTint, 0.08), '--well': mix(t.paper, t.shadeTint, 0.12),
    '--paper-dim': mix(t.paper, t.shadeTint, 0.2), '--faint': mix(t.ink, t.paper, 0.42), '--bulb-off': mix(t.glow, t.shadeTint, 0.45),
    '--drop': rgba(t.shadeTint, 0.28), '--glass': mix(t.paper, t.shadeTint, 0.12), '--accent-dim': mix(t.accent, t.paper, 0.55),
    '--coin': t.role.coin, '--coin-shade': mix(t.role.coin, t.shadeTint, 0.4), '--good': t.role.saver, '--bad': t.accent,
    '--screen-dot': rgba(t.dmd, 0.12),
  };
  // the toolbox is a red tool chest in the Slingshot's colour (or the accent where that is paper)
  const shell = roleFill(t, 'sling'), back = mix(shell, t.shadeTint, 0.45);
  Object.assign(v, { '--toolbox': shell, '--toolbox-back': back, '--toolbox-well': mix(back, t.shadeTint, 0.4), '--toolbox-dash': mix(back, WHITE, 0.35) });
  for (const [id, c] of Object.entries(t.role) as [PartId, string][]) {
    v[`--role-${id}`] = c;
    v[`--role-${id}-fill`] = roleFill(t, id);
    v[`--role-${id}-line`] = legible(t, roleFill(t, id));
    v[`--role-${id}-tint`] = mix(t.paper, t.role[id] === t.paper ? t.shadeTint : t.role[id], 0.16);
  }
  return v;
}
