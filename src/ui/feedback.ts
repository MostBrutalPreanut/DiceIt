// Feedback from players: P (anywhere but a text box) or the Feedback buttons in the menus open a small form: a
// name (remembered on this device), what it is about (a part on your machine, one you have found, or a part of the
// game like the shop or the scoring) and the message. It is sent with a snapshot of the run to a Google Sheet,
// through a tiny Apps Script web app (tools/feedback-sheet.gs, set up as docs/feedback.md says). Anything that
// cannot be sent yet (offline, or no sheet set up) waits on this device and goes with the next one.

declare const __BUILD__: string;

/**
 * The Apps Script web app that writes rows into the feedback sheet (Deploy > Web app, "Anyone" can access).
 * Empty: nothing is sent, feedback waits on this device until a build with the address is played.
 */
export const FEEDBACK_URL = '';

export const PLAYER_KEY = 'pinball-roguelite.player.v1';
export const OUTBOX_KEY = 'pinball-roguelite.feedback-outbox.v1';
/** The most messages kept waiting on one device (the oldest go first). */
export const OUTBOX_MAX = 20;
export const MAX_NAME = 40;
export const MAX_MESSAGE = 2000;

/** One row of the sheet. Everything after `message` is the snapshot of where the player was. */
export interface FeedbackEntry {
  id: string;
  sent: string;
  name: string;
  about: string;
  message: string;
  where: string;
  machine?: string;
  round?: number;
  money?: number;
  score?: number;
  goal?: number;
  runScore?: number;
  parts?: string;
  toolbox?: string;
  decals?: string;
  version: string;
  screen: string;
}

/** Where the player is and what their run looks like, for the row (main.ts fills it in). */
export type Snapshot = Omit<FeedbackEntry, 'id' | 'sent' | 'name' | 'about' | 'message' | 'version' | 'screen'>;

/** What the feedback can be about: the parts of the game a player can name without knowing its insides. */
export const TOPICS = [
  'Scoring and Mult', 'Shop and money', 'Building the machine', 'Flippers and physics', 'Balls and the plunger', 'Bosses',
  'Decals', 'Difficulty and balance', 'Controls', 'Sound and music', 'Look and graphics', 'Tutorial', 'Library', 'Menus',
  'A bug: something broke', 'An idea for a new part',
] as const;

export interface TopicGroup { label: string; options: string[] }

type Store = { get(k: string): string | null; set(k: string, v: string): void };

const clip = (s: string, n: number) => s.trim().slice(0, n);
const build = () => (typeof __BUILD__ === 'string' ? __BUILD__ : 'dev');

/** A row ready to send: trimmed, capped, stamped. */
export function makeEntry(f: { name: string; about: string; message: string }, snap: Snapshot, now = new Date(), screen = '?'): FeedbackEntry {
  return {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sent: now.toISOString(),
    name: clip(f.name, MAX_NAME) || 'Anonymous',
    about: clip(f.about, 80) || 'General',
    message: clip(f.message, MAX_MESSAGE),
    ...snap,
    version: build(),
    screen,
  };
}

/** "Pop Bumper ×3, Tesla Coil": a list of names with how many of each, in the order first seen. */
export function countNames(names: string[]): string {
  const n = new Map<string, number>();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k)).join(', ');
}

export function readOutbox(store: Store): FeedbackEntry[] {
  try {
    const v = JSON.parse(store.get(OUTBOX_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.message === 'string') : [];
  } catch { return []; }
}
export function writeOutbox(store: Store, list: FeedbackEntry[]) {
  store.set(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_MAX)));
}

/** Post one row. True when it left the device (the Apps Script answer cannot be read across sites, so that is all we know). */
export async function post(entry: FeedbackEntry, url = FEEDBACK_URL): Promise<boolean> {
  if (!url) return false;
  try {
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(entry) });
    return true;
  } catch { return false; }
}

/** Send everything waiting, oldest first; what fails stays for next time. Returns how many went. */
export async function flush(store: Store, send = post): Promise<number> {
  const list = readOutbox(store);
  if (!list.length) return 0;
  const left: FeedbackEntry[] = [];
  let sent = 0;
  for (const e of list) { if (await send(e)) sent++; else left.push(e); }
  writeOutbox(store, left);
  return sent;
}

export interface FeedbackHooks {
  store: Store;
  /** P opens it only when nothing else has the keyboard (Big Boi's tour, a key being rebound). */
  canOpen(): boolean;
  /** The groups for the "About" list, and the one to start on (the part whose card is open). */
  topics(): { groups: TopicGroup[]; pick?: string };
  snapshot(): Snapshot;
  /** Big Boi's face for the thank-you (data URL). */
  face(mood: 'happy' | 'cool'): string;
  opened(): void;
  closed(): void;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export class Feedback {
  private wrap: HTMLElement | null = null;
  private prev: HTMLElement | null = null;
  private timer = 0;

  /** Construct this before anything else listens for keys: while the form is open it takes every key first. */
  constructor(private hooks: FeedbackHooks) {
    addEventListener('keydown', (e) => this.onKey(e), true);
    void flush(hooks.store);
  }

  get open() { return this.wrap !== null; }

  show() {
    if (this.wrap) return;
    this.prev = document.activeElement as HTMLElement | null;
    const { groups, pick } = this.hooks.topics();
    const name = this.hooks.store.get(PLAYER_KEY) ?? '';
    const opts = groups.map((g) => `<optgroup label="${esc(g.label)}">${g.options.map((o) => `<option${o === pick ? ' selected' : ''}>${esc(o)}</option>`).join('')}</optgroup>`).join('');
    const wrap = document.createElement('div');
    wrap.className = 'fbwrap';
    wrap.innerHTML = `<form class="card fbcard housing-lite" role="dialog" aria-modal="true" aria-label="Send feedback" novalidate>
      <header class="marquee"><span class="bulbs">${Array.from({ length: 13 }, (_, i) => `<i class="${i % 2 ? 'on' : ''}"></i>`).join('')}</span><h2 class="disp">FEEDBACK</h2></header>
      <div class="fbbody">
        <p class="fbintro">Loved something? Hated something? Found a bug? Tell us. Every message is read.</p>
        <label class="fbfield"><span>Your name</span><input name="name" maxlength="${MAX_NAME}" autocomplete="nickname" placeholder="So we know who to thank" value="${esc(name)}"></label>
        <label class="fbfield"><span>About</span><select name="about">${opts}</select></label>
        <label class="fbfield"><span>Your feedback</span><textarea name="message" rows="6" maxlength="${MAX_MESSAGE}" placeholder="What happened, what you expected, what would make it better..."></textarea></label>
        <div class="fbhint"><span class="fbcount">0/${MAX_MESSAGE}</span><span>Your machine, round and score are sent along, to help us see what you saw.</span></div>
        <div class="btnrow"><button type="button" data-fb="cancel">Cancel <kbd>Esc</kbd></button><button type="submit" class="primary disp">Send it</button></div>
      </div>
    </form>`;
    document.body.appendChild(wrap);
    this.wrap = wrap;
    const form = wrap.querySelector('form')!;
    const msg = form.querySelector<HTMLTextAreaElement>('textarea')!;
    const count = form.querySelector<HTMLElement>('.fbcount')!;
    msg.oninput = () => { count.textContent = `${msg.value.length}/${MAX_MESSAGE}`; form.classList.remove('empty'); };
    form.querySelector<HTMLButtonElement>('[data-fb="cancel"]')!.onclick = () => this.close();
    form.onsubmit = (e) => { e.preventDefault(); void this.send(form); };
    wrap.onpointerdown = (e) => { if (e.target === wrap) this.close(); };
    this.hooks.opened();
    (name ? msg : form.querySelector<HTMLInputElement>('input[name="name"]')!).focus();
  }

  close() {
    if (!this.wrap) return;
    clearTimeout(this.timer);
    this.wrap.remove();
    this.wrap = null;
    if (this.prev?.isConnected) this.prev.focus({ preventScroll: true });
    this.hooks.closed();
  }

  private async send(form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim(), message = String(data.get('message') ?? '').trim();
    if (!message) { form.classList.add('empty'); form.querySelector<HTMLTextAreaElement>('textarea')!.focus(); return; }
    if (name) this.hooks.store.set(PLAYER_KEY, name.slice(0, MAX_NAME));
    const entry = makeEntry({ name, about: String(data.get('about') ?? ''), message }, this.hooks.snapshot(), new Date(), `${innerWidth}x${innerHeight}`);
    writeOutbox(this.hooks.store, [...readOutbox(this.hooks.store), entry]);
    form.classList.add('sending');
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    await flush(this.hooks.store);
    if (this.wrap?.querySelector('form') !== form) return; // closed meanwhile
    const waiting = readOutbox(this.hooks.store).some((e) => e.id === entry.id);
    const body = form.querySelector<HTMLElement>('.fbbody')!;
    body.innerHTML = `<div class="fbdone"><img alt="" src="${this.hooks.face(waiting ? 'happy' : 'cool')}"><div><h3 class="disp">${waiting ? 'Saved!' : `Thanks${name ? `, ${esc(name)}` : ''}!`}</h3>
      <p>${waiting ? 'It could not be sent just now, so it waits on this device and goes out with the next one.' : 'Your feedback is on its way. Big Boi will read it out loud at the next meeting.'}</p></div></div>
      <div class="btnrow"><button type="button" class="primary disp" data-fb="ok">Back to the game</button></div>`;
    body.querySelector<HTMLButtonElement>('[data-fb="ok"]')!.onclick = () => this.close();
    body.querySelector<HTMLButtonElement>('[data-fb="ok"]')!.focus();
    this.timer = window.setTimeout(() => this.close(), 4000);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.wrap) {
      if (e.code === 'KeyP' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target) && this.hooks.canOpen()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.show();
      }
      return;
    }
    // nothing behind the form sees a key (typing still types)
    e.stopImmediatePropagation();
    if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.code === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.wrap.querySelector('form')?.requestSubmit(); }
  }
}
