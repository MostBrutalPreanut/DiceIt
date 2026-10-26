import { isDecor, isInlay, PART_IDS, PARTS, RARITIES, type PartId, type PartInstance, type Rarity } from './parts';
import { DECAL_IDS, DECALS, type DecalId, type DecalPick } from './decals';

/**
 * The Library: a codex of every part and decal in the game, kept on this device across runs. Everything starts as
 * a black silhouette with ??? for a name; a part shows up the first time a run owns it (bought, won from a Piñata
 * or a Time Capsule), a decal the first time it is stuck on the apron. Big Boi and the Pop Bumper come with every
 * machine, so they are known from the start. The Test Lab hands out everything for free: nothing found there counts.
 *
 * Nothing here is a copy of the game's content: the shelves are PART_IDS and DECAL_IDS, and every picture (the
 * silhouettes too) is baked from the same drawing code as the table each time the game loads. A new part or decal
 * turns up in the Library as a silhouette by itself, a redrawn one shows its new look, and a removed one drops out
 * of the saved Library (parseLibrary).
 */
export const LIBRARY_KEY = 'pinball-roguelite.library.v1';

/** Known from the very first run: every machine starts with them. */
export const ALWAYS_KNOWN: PartId[] = ['mega', 'pop'];

export interface Library {
  /** When each part was first found (ms since 1970). */
  parts: Partial<Record<PartId, number>>;
  decals: Partial<Record<DecalId, number>>;
  /** When the Library was last opened: anything found after it wears a NEW badge. */
  seen: number;
}

export const emptyLibrary = (): Library => ({ parts: {}, decals: {}, seen: 0 });

/** The Library from storage: unknown ids and broken values are dropped, so an old save never breaks it. */
export function parseLibrary(json: string | null): Library {
  const lib = emptyLibrary();
  let raw: unknown;
  try { raw = json ? JSON.parse(json) : null; } catch { return lib; }
  if (!raw || typeof raw !== 'object') return lib;
  const r = raw as { parts?: unknown; decals?: unknown; seen?: unknown };
  const stamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  if (r.parts && typeof r.parts === 'object') {
    for (const [id, v] of Object.entries(r.parts)) { const t = stamp(v); if (t !== null && id in PARTS) lib.parts[id as PartId] = t; }
  }
  if (r.decals && typeof r.decals === 'object') {
    for (const [id, v] of Object.entries(r.decals)) { const t = stamp(v); if (t !== null && id in DECALS) lib.decals[id as DecalId] = t; }
  }
  lib.seen = stamp(r.seen) ?? 0;
  return lib;
}

export const partKnown = (lib: Library, id: PartId) => ALWAYS_KNOWN.includes(id) || lib.parts[id] !== undefined;
export const decalKnown = (lib: Library, id: DecalId) => lib.decals[id] !== undefined;

/** Every part type a run owns: on the table, in the toolbox, and the gems set into parts. */
export function ownedPartIds(parts: PartInstance[]): PartId[] {
  const out = new Set<PartId>();
  for (const p of parts) {
    out.add(p.def);
    if (p.inlay) out.add(p.inlay);
  }
  return [...out];
}

/**
 * Note what a run owns. Returns what was found for the first time (in the order given), and changes `lib` only
 * when there is something new.
 */
export function discover(lib: Library, parts: PartId[], decals: (DecalPick | DecalId)[], now = Date.now()): { parts: PartId[]; decals: DecalId[] } {
  const fresh = { parts: [] as PartId[], decals: [] as DecalId[] };
  for (const id of parts) {
    if (partKnown(lib, id) || !(id in PARTS)) continue;
    lib.parts[id] = now;
    fresh.parts.push(id);
  }
  for (const d of decals) {
    const id = typeof d === 'string' ? d : d.id;
    if (decalKnown(lib, id) || !(id in DECALS)) continue;
    lib.decals[id] = now;
    fresh.decals.push(id);
  }
  return fresh;
}

/** Found since the Library was last opened (the NEW badge). Big Boi and the Pop Bumper never are. */
export const partIsNew = (lib: Library, id: PartId) => (lib.parts[id] ?? -1) > lib.seen;
export const decalIsNew = (lib: Library, id: DecalId) => (lib.decals[id] ?? -1) > lib.seen;

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
const byName = (a: string, b: string) => a.localeCompare(b, 'en');

/** The Library's parts: every part but Big Boi (he has his own shelf), commons first, A to Z within a rarity. */
export const LIBRARY_PARTS: PartId[] = PART_IDS.filter((id) => id !== 'mega')
  .sort((a, b) => RANK[PARTS[a].rarity] - RANK[PARTS[b].rarity] || byName(PARTS[a].name, PARTS[b].name));
/** The Library's decals, the same way round. */
export const LIBRARY_DECALS: DecalId[] = [...DECAL_IDS]
  .sort((a, b) => RANK[DECALS[a].rarity] - RANK[DECALS[b].rarity] || byName(DECALS[a].name, DECALS[b].name));

export interface Progress { known: number; total: number }
/** How much of the Library is found, all told and by rarity. */
export function progress(lib: Library): { parts: Progress; decals: Progress; byRarity: Record<'parts' | 'decals', Record<Rarity, Progress>> } {
  const tally = <T extends string>(ids: T[], rarity: (id: T) => Rarity, known: (id: T) => boolean) => {
    const all: Progress = { known: 0, total: 0 };
    const by = Object.fromEntries(RARITIES.map((r) => [r, { known: 0, total: 0 }])) as Record<Rarity, Progress>;
    for (const id of ids) {
      const k = known(id) ? 1 : 0;
      all.total++; all.known += k;
      by[rarity(id)].total++; by[rarity(id)].known += k;
    }
    return { all, by };
  };
  const p = tally(LIBRARY_PARTS, (id) => PARTS[id].rarity, (id) => partKnown(lib, id));
  const d = tally(LIBRARY_DECALS, (id) => DECALS[id].rarity, (id) => decalKnown(lib, id));
  return { parts: p.all, decals: d.all, byRarity: { parts: p.by, decals: d.by } };
}

/**
 * The little shape cut out of a part's silhouette, so parts that look alike in black can still be told apart: the
 * Clock shows a clock face, the Spare Bulb a bulb. A symbol (drawn by src/ui/silhouette.ts) or a few letters.
 * (A locked decal needs none of these: its own picture is cut out of its shadow.)
 */
export type HintSymbol =
  | 'clock' | 'bulb' | 'feet' | 'coin' | 'eyes' | 'flame' | 'shine' | 'note' | 'cup' | 'bell' | 'bolt' | 'crosshair' | 'crown' | 'star'
  | 'sparkle' | 'chevron' | 'magnet' | 'egg' | 'moon' | 'hat' | 'leaf' | 'snow' | 'drop' | 'sun' | 'hourglass' | 'candy' | 'shield'
  | 'fork' | 'dots' | 'marbles' | 'plus' | 'arrow' | 'ring';
export type Hint = HintSymbol | { text: string };

export const PART_HINTS: Partial<Record<PartId, Hint>> = {
  // decor stands on the cabinet, and most of it is a lump in black
  clock: 'clock', altar: 'flame', hutch: 'eyes', bulb: 'bulb', feet: 'feet', tray: 'coin', mirror: 'shine',
  // bumpers and the other round lumps
  coin: 'coin', ding: 'note', trophy: 'cup', bell: 'bell', tesla: 'bolt', keg: 'flame', laser: 'crosshair', golden: 'crown',
  nest: 'egg', ice: 'snow', well: 'drop', bonsai: 'leaf', wreck: { text: 'XL' }, gumball: 'marbles', whale: 'drop',
  fame: 'star', disco: 'sparkle', xlane: { text: '×' }, rank: 'chevron', jackpot: { text: '7' }, magnet: 'magnet',
  saver: 'plus', kickback: 'arrow', plate: 'ring', ring: { text: '%' }, split: 'fork', echo: { text: ')))' }, spot: 'sun',
  capsule: 'hourglass', pinata: 'candy', insure: 'shield', jar: 'dots', broom: 'moon', wizard: 'hat', piggy: 'coin',
  // every gem is the same oval in black: its first letter
  ruby: { text: 'R' }, garnet: { text: 'G' }, opal: { text: 'O' }, goldleaf: 'leaf', redseal: { text: 'S' }, topaz: 'sparkle', emerald: { text: 'E' },
};

/**
 * A part's hint: its own from PART_HINTS, else, for the kinds that all look alike in black (decor in its little
 * screen, the gems), its first letter, so a part added later is never an anonymous blob.
 */
export function partHint(id: PartId): Hint | undefined {
  return PART_HINTS[id] ?? (isDecor(id) || isInlay(id) ? { text: PARTS[id].name[0] } : undefined);
}
