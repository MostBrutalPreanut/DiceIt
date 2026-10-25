// The player's settings: volumes, graphics, calm mode and the three play buttons. Pure data plus a small
// storage wrapper, so the defaults, the parsing and the rebinding rules are tested without a browser.

export type Quality = 'high' | 'low';
export type Action = 'left' | 'right' | 'launch';

export interface Settings {
  /** 0..1 on top of the game's own mix: 0 is off. */
  music: number;
  sfx: number;
  /** low: drawn at 1x, no particle debris, smoke or glow (the score stickers stay) */
  quality: Quality;
  /** no shake, drift or twinkles (art-direction §5) */
  calm: boolean;
  /** KeyboardEvent.code for each play button */
  keys: Record<Action, string>;
}

export const SETTINGS_KEY = 'pinball-roguelite.settings.v1';
/** Where the old Machine & options checkboxes kept music and calm mode: read once, when there are no settings yet. */
export const OLD_MUSIC_KEY = 'pinball-roguelite.music.v1';
export const OLD_CALM_KEY = 'pinball-roguelite.calm.v1';

export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'left', name: 'Left flippers' },
  { id: 'right', name: 'Right flippers' },
  { id: 'launch', name: 'Plunger (hold, release to fire)' },
];

export const DEFAULT_KEYS: Record<Action, string> = { left: 'ArrowLeft', right: 'ArrowRight', launch: 'Space' };
export const DEFAULT_SETTINGS: Settings = { music: 0.8, sfx: 1, quality: 'high', calm: false, keys: { ...DEFAULT_KEYS } };

/** Keys the game already uses for something else (pause, cash out, play, mute, nudges, rotate, store). */
export const RESERVED_KEYS = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter', 'KeyM', 'KeyZ', 'KeyX', 'KeyR', 'Delete', 'Backspace', 'MetaLeft', 'MetaRight']);

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{2,24}$/.test(v) && !RESERVED_KEYS.has(v);

/** Settings from storage: anything missing, broken or out of range falls back to its default; two buttons never share a key. */
export function parseSettings(json: string | null, old: { music?: string | null; calm?: string | null } = {}): Settings {
  let raw: Partial<Settings> = {};
  try { const v = json ? JSON.parse(json) : null; if (v && typeof v === 'object') raw = v; } catch { /* defaults */ }
  const fresh = !json;
  const keys = { ...DEFAULT_KEYS };
  const rk = (raw.keys ?? {}) as Partial<Record<Action, unknown>>;
  for (const a of ACTIONS) { const c = rk[a.id]; if (isCode(c)) keys[a.id] = c; }
  if (new Set(Object.values(keys)).size !== ACTIONS.length) Object.assign(keys, DEFAULT_KEYS);
  return {
    music: fresh && old.music === '0' ? 0 : clamp01(raw.music, DEFAULT_SETTINGS.music),
    sfx: clamp01(raw.sfx, DEFAULT_SETTINGS.sfx),
    quality: raw.quality === 'low' ? 'low' : 'high',
    calm: fresh ? old.calm === '1' : raw.calm === true,
    keys,
  };
}

/**
 * Bind `code` to `action`. A key another button had moves over and that button takes this one's old key,
 * so the three never share a key. Reserved keys are refused (null).
 */
export function rebind(keys: Record<Action, string>, action: Action, code: string): Record<Action, string> | null {
  if (!isCode(code)) return null;
  const out = { ...keys };
  const other = ACTIONS.find((a) => a.id !== action && out[a.id] === code);
  if (other) out[other.id] = out[action];
  out[action] = code;
  return out;
}

/** A key's name as printed on a keycap: ← for ArrowLeft, A for KeyA, L Shift for ShiftLeft. */
export function keyLabel(code: string): string {
  const named: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', Slash: '/', Backslash: '\\', Period: '.', Comma: ',',
    Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', CapsLock: 'Caps',
  };
  if (named[code]) return named[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code) ?? /^Numpad(.+)$/.exec(code);
  return m ? m[1] : code;
}

type Store = { get(k: string): string | null; set(k: string, v: string): void };

export function loadSettings(store: Store): Settings {
  return parseSettings(store.get(SETTINGS_KEY), { music: store.get(OLD_MUSIC_KEY), calm: store.get(OLD_CALM_KEY) });
}
export function saveSettings(store: Store, s: Settings) {
  store.set(SETTINGS_KEY, JSON.stringify(s));
}
