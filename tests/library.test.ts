import { describe, expect, it } from 'vitest';
import { ALWAYS_KNOWN, decalIsNew, decalKnown, discover, emptyLibrary, LIBRARY_DECALS, LIBRARY_PARTS, ownedPartIds, PART_HINTS, partHint, parseLibrary, partIsNew, partKnown, progress } from '../src/data/library';
import { PART_IDS, PARTS, RARITIES, makePart, isDecor, isInlay } from '../src/data/parts';
import { DECAL_IDS } from '../src/data/decals';
import { countNames, flush, makeEntry, MAX_MESSAGE, OUTBOX_MAX, readOutbox, writeOutbox, type FeedbackEntry } from '../src/ui/feedback';
import { DEFAULT_KEYS, rebind } from '../src/ui/settings';

const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, m };
};

describe('the Library', () => {
  it('starts with Big Boi and the Pop Bumper, and nothing else', () => {
    const lib = emptyLibrary();
    expect(ALWAYS_KNOWN).toEqual(['mega', 'pop']);
    expect(PART_IDS.filter((id) => partKnown(lib, id))).toEqual(['pop', 'mega']);
    expect(DECAL_IDS.some((id) => decalKnown(lib, id))).toBe(false);
    const p = progress(lib);
    expect(p.parts).toEqual({ known: 1, total: PART_IDS.length - 1 });
    expect(p.decals).toEqual({ known: 0, total: DECAL_IDS.length });
  });

  it('lists every part but Big Boi and every decal, commons first and A to Z within a rarity', () => {
    expect(new Set(LIBRARY_PARTS)).toEqual(new Set(PART_IDS.filter((id) => id !== 'mega')));
    expect(new Set(LIBRARY_DECALS)).toEqual(new Set(DECAL_IDS));
    const rank = (r: string) => RARITIES.indexOf(r as never);
    for (let i = 1; i < LIBRARY_PARTS.length; i++) {
      const a = PARTS[LIBRARY_PARTS[i - 1]], b = PARTS[LIBRARY_PARTS[i]];
      expect(rank(a.rarity) < rank(b.rarity) || (a.rarity === b.rarity && a.name.localeCompare(b.name, 'en') <= 0)).toBe(true);
    }
  });

  it('finds what a run owns once: table, toolbox and the gems set into parts', () => {
    const tesla = makePart('tesla', 1, 5, 20, true);
    tesla.inlay = 'ruby';
    const parts = [makePart('pop', 2), tesla, makePart('clock', 3), makePart('tesla', 4)];
    expect(ownedPartIds(parts).sort()).toEqual(['clock', 'pop', 'ruby', 'tesla']);
    const lib = emptyLibrary();
    const fresh = discover(lib, ownedPartIds(parts), [{ id: 'lucky' }], 1000);
    expect(fresh.parts.sort()).toEqual(['clock', 'ruby', 'tesla']); // the Pop Bumper was always known
    expect(fresh.decals).toEqual(['lucky']);
    expect(discover(lib, ownedPartIds(parts), ['lucky'], 2000)).toEqual({ parts: [], decals: [] });
    expect(lib.parts.tesla).toBe(1000);
  });

  it('marks what was found since the Library was last opened as new', () => {
    const lib = emptyLibrary();
    discover(lib, ['tesla'], ['gold'], 500);
    lib.seen = 1000;
    discover(lib, ['keg'], [], 1500);
    expect(partIsNew(lib, 'tesla')).toBe(false);
    expect(partIsNew(lib, 'keg')).toBe(true);
    expect(partIsNew(lib, 'pop')).toBe(false);
    expect(decalIsNew(lib, 'gold')).toBe(false);
  });

  it('survives storage: unknown ids, broken values and broken JSON are dropped', () => {
    expect(parseLibrary(null)).toEqual(emptyLibrary());
    expect(parseLibrary('{nope')).toEqual(emptyLibrary());
    const lib = parseLibrary(JSON.stringify({ parts: { tesla: 5, nonsense: 3, keg: 'x', clock: -1 }, decals: { lucky: 9, fake: 1 }, seen: 7 }));
    expect(lib).toEqual({ parts: { tesla: 5 }, decals: { lucky: 9 }, seen: 7 });
    const back = parseLibrary(JSON.stringify(lib));
    expect(back).toEqual(lib);
  });

  it('gives every decor part and gem a hint to cut out of its silhouette, a part added later included', () => {
    for (const id of PART_IDS.filter((id) => isDecor(id) || isInlay(id))) expect(partHint(id), id).toBeTruthy();
    // without its own hint, decor or a gem falls back to its first letter; other parts keep a plain shadow
    const plain = PART_IDS.find((id) => !isDecor(id) && !isInlay(id) && !PART_HINTS[id])!;
    expect(partHint(plain)).toBeUndefined();
    expect(partHint('clock')).toBe('clock');
  });
});

describe('feedback', () => {
  const snap = { where: 'workshop', machine: 'CASTLE CRASH', round: 4, money: 7 };

  it('makes a row: trimmed, capped, anonymous when nameless, with the snapshot', () => {
    const e = makeEntry({ name: '  ', about: '', message: `  ${'x'.repeat(MAX_MESSAGE + 50)}  ` }, snap, new Date('2026-01-02T03:04:05Z'), '800x600');
    expect(e).toMatchObject({ name: 'Anonymous', about: 'General', where: 'workshop', round: 4, sent: '2026-01-02T03:04:05.000Z', screen: '800x600' });
    expect(e.message.length).toBe(MAX_MESSAGE);
    expect(e.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    expect(makeEntry({ name: 'Pat', about: 'Part: Tesla Coil', message: 'zap' }, snap).name).toBe('Pat');
  });

  it('lists parts with counts', () => {
    expect(countNames(['Pop Bumper', 'Tesla Coil', 'Pop Bumper', 'Pop Bumper'])).toBe('Pop Bumper ×3, Tesla Coil');
    expect(countNames([])).toBe('');
  });

  it('keeps what could not be sent, at most OUTBOX_MAX, and sends it later oldest first', async () => {
    const st = memStore();
    const many = Array.from({ length: OUTBOX_MAX + 5 }, (_, i) => makeEntry({ name: 'A', about: 'General', message: `m${i}` }, snap));
    writeOutbox(st, many);
    expect(readOutbox(st).map((e) => e.message)).toEqual(many.slice(5).map((e) => e.message));
    const sent: string[] = [];
    // the third one fails and stays
    const n = await flush(st, async (e: FeedbackEntry) => { if (e.message === 'm7') return false; sent.push(e.message); return true; });
    expect(n).toBe(OUTBOX_MAX - 1);
    expect(sent[0]).toBe('m5');
    expect(readOutbox(st).map((e) => e.message)).toEqual(['m7']);
    expect(readOutbox(memStore({ 'pinball-roguelite.feedback-outbox.v1': '{broken' }))).toEqual([]);
  });

  it('with no inbox set up, nothing is sent and it all waits', async () => {
    const st = memStore();
    writeOutbox(st, [makeEntry({ name: 'A', about: 'General', message: 'hi' }, snap)]);
    expect(await flush(st)).toBe(0);
    expect(readOutbox(st)).toHaveLength(1);
  });

  it('P is the feedback key: it cannot be bound to a flipper', () => {
    expect(rebind(DEFAULT_KEYS, 'left', 'KeyP')).toBeNull();
  });
});
