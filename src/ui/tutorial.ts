// Big Boi's tour: a run started with the picker's Tutorial switch on (it is on for your very first run) opens with
// the Big Boi in the middle of the table talking to you in speech bubbles. Everything else goes dark and holds still
// while the thing he talks about lights up (he stays lit too); only moving the tour on works: a click anywhere, Enter, Space or the right arrow
// (the first press finishes his sentence), and Esc or Skip ends it. He points things out; he never makes you do any.
import type { Mood } from '../render/props';

/** '1' once the tour has played: from then on the picker's switch starts off. */
export const TUTORIAL_KEY = 'pinball-roguelite.tutorial.v1';

/** A box on screen, in client pixels; `round` draws its light as a circle (a part on the table). */
export interface Box { x: number; y: number; w: number; h: number; round?: boolean }

export interface Step {
  /** What Big Boi says: a line or two of HTML (<b> and <kbd> are welcome). */
  say: string;
  /** The face he pulls while he says it (happy unless asked). */
  mood?: Mood;
  /** What lights up, measured every frame (things move); none leaves Big Boi alone in the dark. */
  at?: () => Box[];
  /** Brought into view first: on a narrow screen the panels stack under the table. */
  scroll?: string;
  /** While the step is up, and after it: a peek at something that is not on screen yet. */
  enter?: () => void;
  leave?: () => void;
}

export interface TutorialHooks {
  /** Where the Big Boi on the table is on screen: the bubbles come out of him. */
  speaker(): Box | null;
  /** His face on the table while he talks (null: back to his own). */
  face(mood: Mood | null): void;
  /** One syllable of his babble. */
  talk(): void;
  /** The bubble popping up. */
  pop(): void;
}

/** One box around all of these elements (hidden ones are left out). */
export function around(...sels: string[]): Box[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sel of sels) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    }
  }
  return x1 > x0 ? [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }] : [];
}

const PAD = 8;
/** The first light is always Big Boi himself; the rest are what he talks about. */
const HOLES = 4;
/** Each letter pops in this long after the one before. */
const CHAR_MS = 17;
const SVG = 'http://www.w3.org/2000/svg';

/** The line as letters that pop in one after another; words stay whole so the bubble wraps them. A <kbd> pops as one. */
function letters(html: string): { frag: DocumentFragment; n: number } {
  const t = document.createElement('template');
  t.innerHTML = html;
  let n = 0;
  const walk = (node: Node) => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        // punctuation straight after a <b> or <kbd> sticks to it, so the line never breaks between them
        let glue = c.previousSibling instanceof HTMLElement ? c.previousSibling : null;
        for (const part of (c.textContent ?? '').split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(' '); n++; glue = null; continue; }
          const w = document.createElement('span');
          w.className = 'w';
          if (glue) { glue.replaceWith(w); w.append(glue); glue = null; }
          for (const ch of part) {
            const i = document.createElement('i');
            i.textContent = ch;
            i.style.setProperty('--d', `${n++ * CHAR_MS}ms`);
            w.append(i);
          }
          frag.append(w);
        }
        c.replaceWith(frag);
      } else if (c instanceof HTMLElement && c.tagName === 'KBD') {
        c.classList.add('ch');
        c.style.setProperty('--d', `${n * CHAR_MS}ms`);
        n += 3;
      } else walk(c);
    }
  };
  walk(t.content);
  return { frag: t.content, n };
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export class Tutorial {
  private root: HTMLElement | null = null;
  private steps: Step[] = [];
  private i = 0;
  private done: ((skipped: boolean) => void) | undefined;
  private holes: { cur: Box; rect: SVGRectElement; ring: HTMLElement }[] = [];
  private raf = 0;
  private last = 0;
  private openedAt = 0;
  /** When the sentence is finished (performance.now()), and the timer that moves his mouth until then. */
  private talkUntil = 0;
  private talkTimer = 0;
  private spk = { x: NaN, y: NaN };

  constructor(private hooks: TutorialHooks) {
    // the tour sees every key first while it is up, and the game sees none of them
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get open() { return this.root !== null; }

  /** Show these steps; `done` hears whether the tour was skipped. */
  start(steps: Step[], done?: (skipped: boolean) => void) {
    if (this.root) this.close(true);
    this.steps = steps;
    this.done = done;
    this.i = -1;
    this.openedAt = performance.now();
    this.spk = { x: NaN, y: NaN };
    const root = document.createElement('div');
    root.className = 'tut';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Big Boi shows you around');
    root.innerHTML = `<svg class="tut-dim" aria-hidden="true"><defs><mask id="tutMask"><rect width="100%" height="100%" fill="#fff"/></mask></defs><rect class="shade" width="100%" height="100%" mask="url(#tutMask)"/></svg>
      <div class="tut-arrow" aria-hidden="true"><svg viewBox="0 0 46 34"><path d="M3 11h22V3l18 14-18 14v-8H3z"/></svg></div>
      <div class="tut-spk"><div class="tut-bub"><div class="tut-txt" aria-live="polite"></div>
        <div class="tut-foot"><button class="tut-skip" data-skip>Skip</button><span class="tut-dots"></span><button class="tut-next disp" data-next>Next</button></div></div></div>`;
    const mask = root.querySelector('mask')!;
    this.holes = Array.from({ length: HOLES }, (_, j) => {
      const rect = document.createElementNS(SVG, 'rect');
      rect.setAttribute('fill', '#000');
      mask.append(rect);
      const ring = document.createElement('div');
      ring.className = j ? 'tut-ring' : 'tut-ring me';
      root.insertBefore(ring, root.querySelector('.tut-arrow'));
      return { cur: { x: 0, y: 0, w: 0, h: 0 }, rect, ring };
    });
    root.querySelector('.tut-dots')!.innerHTML = steps.length > 1 ? steps.map(() => '<i></i>').join('') : '';
    // only a click that started on the tour counts: the press that set a part down and opened it does not
    let down = false;
    root.addEventListener('pointerdown', (e) => { e.stopPropagation(); down = true; });
    root.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!down) return;
      down = false;
      if ((e.target as HTMLElement).closest('[data-skip]')) this.close(true);
      else this.advance();
    });
    // nothing under the tour gets a press or a drag
    for (const ev of ['pointerup', 'contextmenu'] as const) root.addEventListener(ev, (e) => { e.stopPropagation(); e.preventDefault(); });
    document.body.append(root);
    document.body.classList.add('touring');
    this.root = root;
    this.show(0);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** End the tour: the lights come back. */
  close(skipped = false) {
    const root = this.root;
    if (!root) return;
    this.steps[this.i]?.leave?.();
    this.root = null;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.talkTimer);
    this.hooks.face(null);
    document.body.classList.remove('touring');
    root.classList.add('out');
    setTimeout(() => root.remove(), 320);
    const done = this.done;
    this.done = undefined;
    done?.(skipped);
  }

  private get typing() { return performance.now() < this.talkUntil; }

  /** A press: the first one finishes his sentence, the next moves on (and the last one ends the tour). */
  private advance() {
    if (!this.root || performance.now() - this.openedAt < 250) return; // the click that started the run is not a press
    if (this.typing) { this.finishLine(); return; }
    if (this.i < this.steps.length - 1) this.show(this.i + 1);
    else this.close(false);
  }

  private show(i: number) {
    const root = this.root!;
    if (i !== this.i) this.steps[this.i]?.leave?.();
    this.i = i;
    const s = this.steps[i];
    s.enter?.();
    if (s.scroll) {
      const el = document.querySelector(s.scroll);
      const r = el?.getBoundingClientRect();
      if (el && r && (r.top < 0 || r.bottom > innerHeight)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const bub = root.querySelector<HTMLElement>('.tut-bub')!;
    const txt = root.querySelector<HTMLElement>('.tut-txt')!;
    const { frag, n } = letters(s.say);
    txt.replaceChildren(frag);
    bub.classList.remove('pop', 'done');
    void bub.offsetWidth; // restart the pop
    bub.classList.add('pop');
    const last = i === this.steps.length - 1;
    root.querySelector('.tut-next')!.innerHTML = last ? (this.steps.length > 1 ? 'Got it!' : 'Cool!') : 'Next <span aria-hidden="true">▶</span>';
    root.querySelector<HTMLElement>('.tut-skip')!.hidden = last;
    root.querySelectorAll('.tut-dots i').forEach((d, j) => d.classList.toggle('on', j === i));
    this.hooks.pop();
    this.talk(n * CHAR_MS + 200);
  }

  /** His mouth flaps (and he babbles) until the sentence is out. */
  private talk(ms: number) {
    const bub = this.root!.querySelector<HTMLElement>('.tut-bub')!;
    const mood = this.steps[this.i].mood ?? 'happy';
    this.talkUntil = performance.now() + ms;
    clearTimeout(this.talkTimer);
    let open = false;
    const flap = () => {
      if (!this.root) return;
      if (!this.typing) { this.finishLine(); return; }
      open = !open;
      this.hooks.face(open ? 'shocked' : mood);
      bub.classList.toggle('beat', open);
      if (open) this.hooks.talk();
      this.talkTimer = window.setTimeout(flap, 95 + Math.random() * 50);
    };
    flap();
  }

  private finishLine() {
    const root = this.root;
    if (!root) return;
    clearTimeout(this.talkTimer);
    this.talkUntil = 0;
    const bub = root.querySelector('.tut-bub')!;
    bub.classList.add('done');
    bub.classList.remove('beat');
    this.hooks.face(this.steps[this.i].mood ?? 'happy');
  }

  private onKey(e: KeyboardEvent) {
    if (!this.root) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') this.close(true);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'ArrowRight') this.advance();
  }

  // ---- every frame: the lights glide to what he is talking about, and the bubble keeps out of their way --------

  private frame = (now: number) => {
    const root = this.root;
    if (!root) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const s = this.steps[this.i];
    const pad = (b: Box) => ({ x: b.x - PAD, y: b.y - PAD, w: b.w + PAD * 2, h: b.h + PAD * 2, round: b.round });
    const me = this.hooks.speaker();
    const lit = (s.at?.() ?? []).filter((b) => b.w > 0 && b.h > 0).slice(0, HOLES - 1).map(pad);
    const want: (Box | undefined)[] = [me ? pad({ ...me, round: true }) : undefined, ...lit];
    const k = 1 - Math.exp(-dt * 14);
    this.holes.forEach((h, j) => {
      const w = want[j];
      const goal = w ?? { x: h.cur.x + h.cur.w / 2, y: h.cur.y + h.cur.h / 2, w: 0, h: 0 };
      if (w && h.cur.w < 1) h.cur = { x: w.x + w.w / 2, y: w.y + w.h / 2, w: 0, h: 0 }; // a light that was off opens from the middle
      h.cur = { x: h.cur.x + (goal.x - h.cur.x) * k, y: h.cur.y + (goal.y - h.cur.y) * k, w: h.cur.w + (goal.w - h.cur.w) * k, h: h.cur.h + (goal.h - h.cur.h) * k, round: w?.round ?? h.cur.round };
      const c = h.cur, on = c.w >= 1;
      const r = c.round ? Math.min(c.w, c.h) / 2 : Math.min(16, c.w / 2, c.h / 2);
      h.rect.setAttribute('x', String(c.x)); h.rect.setAttribute('y', String(c.y));
      h.rect.setAttribute('width', String(Math.max(0, c.w))); h.rect.setAttribute('height', String(Math.max(0, c.h)));
      h.rect.setAttribute('rx', String(Math.max(0, r)));
      h.ring.hidden = !on;
      if (on) h.ring.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${r}px`;
    });
    this.placeBubble(me, lit);
    this.placeArrow(lit.length ? this.holes[1].cur : null);
    this.raf = requestAnimationFrame(this.frame);
  };

  /**
   * The bubble comes out of Big Boi: above him, or below, beside him, wherever covers the least of what is lit and
   * stays on screen. Its tail points at him.
   */
  private placeBubble(me: Box | null, lit: Box[]) {
    const spk = this.root!.querySelector<HTMLElement>('.tut-spk')!;
    const bw = spk.offsetWidth, bh = spk.offsetHeight, vw = innerWidth, vh = innerHeight;
    const S = me ?? { x: vw / 2 - 40, y: vh / 2 - 40, w: 80, h: 80 };
    const cx = S.x + S.w / 2, cy = S.y + S.h / 2, gap = 22;
    const spots: { x: number; y: number; tail: 'down' | 'up' | 'left' | 'right' }[] = [
      { x: cx - bw / 2, y: S.y - bh - gap, tail: 'down' },
      { x: cx - bw / 2, y: S.y + S.h + gap, tail: 'up' },
      { x: S.x + S.w + gap, y: cy - bh / 2, tail: 'left' },
      { x: S.x - bw - gap, y: cy - bh / 2, tail: 'right' },
    ];
    const grown = lit.map((b) => ({ x: b.x - 12, y: b.y - 12, w: b.w + 24, h: b.h + 24 }));
    const screen = { x: 8, y: 8, w: vw - 16, h: vh - 16 };
    let best = spots[0], bestCost = Infinity;
    for (const p of spots) {
      const box = { x: p.x, y: p.y, w: bw, h: bh };
      // off the screen is worse than covering something
      const cost = grown.reduce((t, b) => t + overlap(box, b), 0) + (bw * bh - overlap(box, screen)) * 3;
      if (cost < bestCost - 1) { bestCost = cost; best = p; }
    }
    const x = Math.round(Math.max(8, Math.min(best.x, vw - bw - 8)));
    const y = Math.round(Math.max(8, Math.min(best.y, vh - bh - 8)));
    if (Math.abs(x - this.spk.x) > 2 || Math.abs(y - this.spk.y) > 2 || spk.dataset.tail !== best.tail) {
      spk.classList.toggle('glide', !Number.isNaN(this.spk.x));
      this.spk = { x, y };
      spk.style.transform = `translate(${x}px, ${y}px)`;
      spk.dataset.tail = best.tail;
    }
    // the tail stays on Big Boi when the bubble is pushed along by the edge of the screen
    const along = best.tail === 'down' || best.tail === 'up' ? cx - this.spk.x : cy - this.spk.y;
    const size = best.tail === 'down' || best.tail === 'up' ? bw : bh;
    spk.style.setProperty('--tail', `${Math.round(Math.max(28, Math.min(size - 28, along)))}px`);
  }

  /** A bouncing arrow on the edge of the first thing lit, on the bubble's side, pointing in. */
  private placeArrow(b: Box | null) {
    const arrow = this.root!.querySelector<HTMLElement>('.tut-arrow')!;
    if (!b || b.w < 4) { arrow.classList.remove('on'); return; }
    const spk = this.root!.querySelector<HTMLElement>('.tut-spk')!;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let dx = this.spk.x + spk.offsetWidth / 2 - cx, dy = this.spk.y + spk.offsetHeight / 2 - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const t = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
    const x = cx + dx * (t + 30), y = cy + dy * (t + 30);
    arrow.classList.add('on');
    arrow.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${Math.atan2(-dy, -dx).toFixed(3)}rad)`;
  }
}
