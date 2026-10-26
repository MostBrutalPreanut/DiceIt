import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, DEFAULT_SETTINGS, keyLabel, loadSettings, parseSettings, rebind, saveSettings, SETTINGS_KEY } from '../src/ui/settings';
import { MAX_RECORDS, newRunMeta, parseRecords, parseRunMeta, rankOf, recordOf, RUN_META_KEY, Scoreboard, sourceOfSave, upsertRecord, type RunRecord } from '../src/ui/scoreboard';
import { Attract, buildDemo, DEMO_BUILD } from '../src/attract';
import { Game } from '../src/game/game';

const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, m };
};

describe('settings', () => {
  it('defaults: music and sound on, high graphics, calm off, the keys the game always had', () => {
    const s = parseSettings(null);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.keys).toEqual({ left: 'ArrowLeft', right: 'ArrowRight', launch: 'Space' });
  });

  it('reads the old music and calm checkboxes once, when there are no settings yet', () => {
    expect(parseSettings(null, { music: '0', calm: '1' })).toMatchObject({ music: 0, calm: true });
    expect(parseSettings(JSON.stringify({ music: 0.5 }), { music: '0', calm: '1' })).toMatchObject({ music: 0.5, calm: false });
  });

  it('broken, out-of-range or reserved values fall back to the defaults', () => {
    expect(parseSettings('{nope')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(JSON.stringify({ music: 7, sfx: -1, quality: 'ultra', calm: 'yes', keys: { left: 'Escape', right: 42, launch: 'KeyJ' } }));
    expect(s).toMatchObject({ music: 1, sfx: 0, quality: 'high', calm: false });
    expect(s.keys).toEqual({ left: 'ArrowLeft', right: 'ArrowRight', launch: 'KeyJ' });
    // two buttons on one key is not a state the game can be in
    expect(parseSettings(JSON.stringify({ keys: { left: 'KeyA', right: 'KeyA', launch: 'Space' } })).keys).toEqual(DEFAULT_KEYS);
  });

  it('round-trips through storage', () => {
    const st = memStore();
    const s = { ...DEFAULT_SETTINGS, music: 0.25, quality: 'low' as const, keys: { left: 'ShiftLeft', right: 'ShiftRight', launch: 'Space' } };
    saveSettings(st, s);
    expect(st.m.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(st)).toEqual(s);
  });

  it('rebinding swaps a key another button had, and refuses the keys the game uses', () => {
    expect(rebind(DEFAULT_KEYS, 'left', 'KeyA')).toEqual({ ...DEFAULT_KEYS, left: 'KeyA' });
    expect(rebind(DEFAULT_KEYS, 'left', 'ArrowRight')).toEqual({ left: 'ArrowRight', right: 'ArrowLeft', launch: 'Space' });
    for (const k of ['Escape', 'Tab', 'Enter', 'KeyM', 'KeyZ', 'KeyX']) expect(rebind(DEFAULT_KEYS, 'launch', k)).toBeNull();
  });

  it('names keys the way a keycap does', () => {
    expect(['ArrowLeft', 'KeyA', 'Digit3', 'ShiftLeft', 'Space', 'Slash'].map(keyLabel)).toEqual(['←', 'A', '3', 'L Shift', 'Space', '/']);
  });
});

const rec = (id: string, cleared: number, score: number, extra: Partial<RunRecord> = {}): RunRecord => ({
  id, started: 1, ended: 2, machine: 'factory', result: 'lost', round: cleared + 1, cleared, score, best: score / 2, decals: [], parts: [], ...extra,
});

describe('scoreboard', () => {
  it('ranks best first: rounds cleared, then points', () => {
    let list: RunRecord[] = [];
    list = upsertRecord(list, rec('a', 3, 9000));
    list = upsertRecord(list, rec('b', 5, 100));
    list = upsertRecord(list, rec('c', 3, 12000));
    expect(list.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(rankOf(list, 'c')).toBe(2);
    expect(rankOf(list, 'zzz')).toBe(0);
  });

  it('a run is recorded once: updating it replaces the entry, and a won run stays won', () => {
    let list = upsertRecord([], rec('w', 15, 1e6, { result: 'won' }));
    list = upsertRecord(list, rec('w', 18, 3e6, { result: 'lost', best: 1 }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ result: 'won', cleared: 18, score: 3e6, best: 5e5 });
  });

  it('keeps only the best runs', () => {
    let list: RunRecord[] = [];
    for (let i = 0; i < MAX_RECORDS + 10; i++) list = upsertRecord(list, rec(`r${i}`, i % 7, i));
    expect(list).toHaveLength(MAX_RECORDS);
    expect(list[0].cleared).toBe(6);
  });

  it('parsing drops broken entries and unknown parts or decals', () => {
    const good = rec('g', 2, 50, { decals: ['sponsor', 'nope' as never], parts: [{ def: 'pop', x: 1, y: 2, angle: 0 }, { def: 'warpdrive' as never, x: 1, y: 2, angle: 0 }] });
    const list = parseRecords(JSON.stringify([good, { id: 3 }, null, 'x']));
    expect(list).toHaveLength(1);
    expect(list[0].decals).toEqual(['sponsor']);
    expect(list[0].parts.map((p) => p.def)).toEqual(['pop']);
    expect(parseRecords('not json')).toEqual([]);
  });

  it('a record holds the final build with every part where it stood', () => {
    const g = new Game();
    g.newRun('castle');
    g.round = 5;
    g.runScore = 4321;
    const meta = { ...newRunMeta(10), best: 999 };
    const r = recordOf(g, meta, 'abandoned', 20);
    expect(r).toMatchObject({ id: meta.id, machine: 'castle', result: 'abandoned', round: 5, cleared: 4, score: 4321, best: 999, started: 10, ended: 20 });
    expect(r.parts.length).toBe(g.placed.length);
    expect(r.parts.some((p) => p.def === 'mega')).toBe(true);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('the board in storage: an abandoned run that never did anything is not worth a line; a save is read like the game', () => {
    const st = { ...memStore(), del: (k: string) => { st.m.delete(k); } };
    const board = new Scoreboard(st, true);
    expect(st.m.has(RUN_META_KEY)).toBe(true);
    const g = new Game();
    g.newRun('factory');
    board.record(g, 'abandoned', false);
    expect(board.records).toHaveLength(0);
    board.record(g, 'abandoned', true); // Test Lab never counts
    g.round = 3;
    board.noteBest(777);
    board.record(sourceOfSave(g.save()), 'abandoned', false);
    expect(board.records).toHaveLength(1);
    expect(board.records[0]).toMatchObject({ cleared: 2, best: 777, result: 'abandoned', machine: 'factory' });
    expect(new Scoreboard(st, false).records).toEqual(board.records);
    board.endRun();
    expect(st.m.has(RUN_META_KEY)).toBe(false);
  });

  it('the run meta round-trips and rejects junk', () => {
    const m = newRunMeta(5);
    expect(parseRunMeta(JSON.stringify(m))).toEqual(m);
    expect(parseRunMeta('{"id":1}')).toBeNull();
    expect(parseRunMeta(null)).toBeNull();
  });
});

describe('attract mode', () => {
  it('the demo table is the starter machine plus the demo build, on the machine asked for, played to the last ball', () => {
    const g = new Game();
    buildDemo(g, 'diner');
    expect(g.machine).toBe('diner');
    expect(g.sandbox).toBe(false);
    expect(g.goalOverride).toBe(Infinity);
    expect(g.placed.length).toBe(4 + DEMO_BUILD.length); // every demo part fits
  });

  it('the bot plays the demo: it scores, the game ends, and the next machine is dealt', () => {
    const g = new Game();
    const seen: string[] = [];
    let hits = 0;
    const a = new Attract(g, { score: () => { hits++; }, machine: (id) => seen.push(id), gameOver: () => {} });
    a.start('castle');
    for (let f = 0; f < 60 * 240 && seen.length < 2; f++) a.step(1 / 60);
    expect(hits).toBeGreaterThan(10);
    expect(seen).toEqual(['castle', 'factory']);
    a.stop();
    expect(g.goalOverride).toBeNull();
  });
});
