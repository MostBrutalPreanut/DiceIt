import { PARTS, RARITY_NAMES, type PartId, type PartInstance } from '../data/parts';
import type { AudioFx } from '../audio';
import type { Game } from '../game/game';
import { KIND } from './html';

/**
 * A free prize as a reward reveal, the same show as the boss's decals (decalPick.ts, whose card styles it shares):
 * a burst Piñata, or a Time Capsule dug up, puts three parts on the table face down; they slap down and flip over,
 * and the one you take flies into your toolbox. Later puts the prize away (the shop keeps a button to bring it back),
 * since it waits until you take one. Mouse, keys (1/2/3, the arrows and Enter, L for later) and touch (tap to lift,
 * tap again to take).
 */
export interface PrizePickHost {
  game: Game;
  audio: AudioFx;
  /** A part's picture, as a data URL. */
  icon: (id: PartId, size: number) => string;
  say: (text: string) => void;
  /** The prize was taken (the part is in the toolbox): save the run and refresh the workshop. */
  taken: (part: PartInstance) => void;
  /** The pop-up opened or closed (the shop's "prize waiting" button follows it). */
  changed: () => void;
}

type Phase = 'closed' | 'intro' | 'open' | 'outro';

/** When the reveal settles (ms from opening): the decal picker's timings, three cards. */
const SETTLE = 760 + 2 * 260 + 230 + 480;
const ART = 150;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class PrizePicker {
  private phase: Phase = 'closed';
  private drawnKey = '';
  /** The prize whose reveal has played: drawing it again (Later and back, a toolbox change) comes in settled. */
  private revealed = '';
  /** The prize put away with Later: it stays closed until the shop's button brings it back. */
  private putAway = '';
  private sel = -1;
  /** Picks are ignored until this time (performance.now ms): the reveal has to settle first, then a moment more. */
  private readyAt = 0;
  private pointerType = 'mouse';
  private timers: number[] = [];

  constructor(private readonly root: HTMLElement, private readonly host: PrizePickHost) {
    document.body.appendChild(root);
    root.className = 'dp-root pp-root';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    addEventListener('keydown', (e) => this.onKey(e), true);
    root.addEventListener('pointerdown', (e) => {
      this.pointerType = e.pointerType || 'mouse';
      root.classList.toggle('dp-touch', this.pointerType === 'touch');
      if (this.phase === 'intro' && !(e.target as HTMLElement).closest('button')) this.settle();
    });
  }

  private get key() {
    const g = this.host.game;
    return JSON.stringify([g.runId, g.round, g.shop.prize, g.shop.prizeFrom ?? 'pinata']);
  }

  /** Is a prize waiting that the pop-up is not showing (it was put away)? The shop shows a button for it. */
  get waiting() {
    return this.owed() && this.phase === 'closed';
  }

  private owed() {
    const g = this.host.game;
    // the boss's decals go first: the prize waits behind them
    return !!g.shop.prize?.length && g.editable && !g.sandbox && g.pending === null;
  }

  /** Called whenever the workshop refreshes: open, redraw or close the pop-up to match the run. */
  update() {
    if (this.phase === 'outro') return;
    if (!this.owed() || this.putAway === this.key) { if (this.phase !== 'closed') this.close(); return; }
    const key = JSON.stringify([this.key, this.host.game.inventory.length]);
    if (key === this.drawnKey && this.phase !== 'closed') return;
    const replay = this.revealed !== this.key;
    this.drawnKey = key;
    this.revealed = this.key;
    this.draw(replay && !reducedMotion());
  }

  /** Bring a put-away prize back (the shop's button). */
  reopen() {
    this.putAway = '';
    this.drawnKey = '';
    this.update();
  }

  // ---- drawing -----------------------------------------------------------------------------------------

  private cardHtml(id: PartId, i: number) {
    const g = this.host.game, def = PARTS[id], room = g.hasRoomFor(id);
    const pack = def.pack && def.pack > 1 ? ` (a pack of ${def.pack})` : '';
    const sparks = def.rarity === 'legendary' ? `<span class="dp-sparks" aria-hidden="true">${'<i></i>'.repeat(6)}</span>` : '';
    const foot = room ? `<b>Free</b> · straight into your toolbox${pack}` : '<b>Toolbox full:</b> make room for it first';
    return `<button class="dp-card r-${def.rarity}" data-pick="${i}" style="--i:${i};--dc:var(--role-${id}-fill)" ${room ? '' : 'disabled'} aria-label="${esc(`${def.name}${pack}. ${RARITY_NAMES[def.rarity]} ${KIND[def.kind]}. ${def.blurb}`)}">
      <span class="dp-lift"><span class="dp-flip">
        <span class="dp-back" aria-hidden="true"><span class="dp-backmark disp">?</span><span class="dp-backtag">PRIZE</span></span>
        <span class="dp-face">
          <span class="dp-art"><span class="dp-burst"></span><img class="dp-img" alt="" draggable="false" src="${this.host.icon(id, ART)}">${sparks}<span class="dp-key" aria-hidden="true">${i + 1}</span><span class="dp-kind">${KIND[def.kind]}</span>${def.pack && def.pack > 1 ? `<span class="pp-pack disp">×${def.pack}</span>` : ''}${room ? '' : '<span class="dp-noroom disp" aria-hidden="true">NO ROOM</span>'}</span>
          <span class="dp-body">
            <b class="dp-name disp">${esc(def.name)}</b>
            <span class="dp-meta"><span class="rar r-${def.rarity}">${RARITY_NAMES[def.rarity]}</span></span>
            <span class="dp-txt">${esc(def.blurb)}</span>
            <span class="dp-foot">${foot}<span class="dp-again">Tap again to take it</span></span>
          </span>
          <span class="dp-glare" aria-hidden="true"></span>
        </span>
      </span></span>
    </button>`;
  }

  private draw(animate: boolean) {
    const g = this.host.game, root = this.root, prize = g.shop.prize!;
    const capsule = g.shop.prizeFrom === 'capsule';
    this.clearTimers();
    this.sel = -1;
    root.hidden = false;
    root.setAttribute('aria-label', capsule ? 'Time Capsule dug up: take a part' : 'Piñata burst: take a part');
    root.classList.toggle('dp-anim', animate);
    root.classList.toggle('pp-capsule', capsule);
    root.classList.remove('dp-settled', 'dp-out', 'dp-closing');
    root.innerHTML = `<div class="dp-dim"></div><div class="dp-rays" aria-hidden="true"></div>
      ${capsule ? '' : `<div class="pp-candy" aria-hidden="true">${'<i></i>'.repeat(14)}</div>`}
      <div class="dp-stage">
        <header class="dp-head">
          <h2 class="dp-title disp">${capsule ? 'Dug it up!' : 'Piñata!'}</h2><span class="dp-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          <div class="dp-banner disp">${capsule ? 'Time Capsule' : 'Candy for everyone'}</div>
          <p class="dp-sub">${capsule ? 'Take one legendary part, free.' : 'Take one part, free. The others go back in the piñata.'}</p>
        </header>
        <div class="dp-cards">${prize.map((id, i) => this.cardHtml(id, i)).join('')}</div>
        <footer class="dp-footer">
          <button class="dp-skip" id="ppLater">Later<kbd>L</kbd></button>
          <span class="dp-hint"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> take · <kbd>←</kbd><kbd>→</kbd> <kbd>Enter</kbd></span>
        </footer>
      </div>`;
    root.querySelectorAll<HTMLButtonElement>('.dp-card').forEach((b) => {
      const i = Number(b.dataset.pick);
      b.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { this.tilt(b, e); this.select(i, false); } });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { for (const v of ['--rx', '--ry', '--mx', '--my']) b.style.removeProperty(v); if (this.sel === i) this.select(-1, false); } });
      b.addEventListener('focus', () => this.select(i, false));
      b.onclick = () => {
        if (this.phase === 'intro') { this.settle(); return; } // a click on a card still flipping in only finishes the reveal
        if (this.pointerType === 'touch' && this.sel !== i) { this.select(i, false); return; }
        this.pick(i);
      };
    });
    (root.querySelector('#ppLater') as HTMLButtonElement).onclick = () => this.later();
    if (!animate) { this.phase = 'open'; this.readyAt = performance.now() + 300; root.classList.add('dp-settled'); this.host.changed(); return; }
    this.phase = 'intro';
    const a = this.host.audio;
    if (capsule) a.goal(); else a.bonus(undefined, 'PIÑATA!');
    prize.forEach((_, i) => this.timers.push(window.setTimeout(() => a.shopRoll(i), 760 + i * 260)));
    this.timers.push(window.setTimeout(() => this.settle(), SETTLE));
    this.host.changed();
  }

  private settle() {
    if (this.phase !== 'intro') return;
    this.clearTimers();
    this.phase = 'open';
    this.readyAt = performance.now() + 300; // a double-click or a held key does not pick the moment the cards land
    this.root.classList.add('dp-settled');
  }

  private tilt(b: HTMLElement, e: PointerEvent) {
    const r = b.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    b.style.setProperty('--rx', `${(-py * 14).toFixed(1)}deg`);
    b.style.setProperty('--ry', `${(px * 18).toFixed(1)}deg`);
    b.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(0)}%`);
    b.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(0)}%`);
  }

  private cards() {
    return Array.from(this.root.querySelectorAll<HTMLButtonElement>('.dp-card'));
  }

  private select(i: number, focus: boolean) {
    this.sel = i;
    this.cards().forEach((b, j) => b.classList.toggle('is-sel', j === i));
    if (focus && i >= 0) this.cards()[i]?.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent) {
    if (this.phase === 'outro') { e.preventDefault(); e.stopPropagation(); return; }
    if (this.phase !== 'intro' && this.phase !== 'open') return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    if (el && !this.root.contains(el)) return; // something else (a menu) is over the pop-up
    const n = this.host.game.shop.prize?.length ?? 0;
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) { const i = Number(digit[2]) - 1; if (i < n) { eat(); if (e.repeat) return; if (this.phase === 'intro') this.settle(); else this.pick(i); } return; }
    switch (e.code) {
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        eat();
        this.settle();
        const dir = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1;
        this.select(this.sel < 0 ? (dir > 0 ? 0 : n - 1) : (this.sel + dir + n) % n, true);
        this.host.audio.pickUp();
        return;
      }
      case 'Enter': case 'NumpadEnter': case 'Space':
        eat();
        if (e.repeat) return;
        if (this.phase === 'intro') { this.settle(); return; }
        if (document.activeElement?.id === 'ppLater') this.later();
        else if (this.sel >= 0) this.pick(this.sel);
        else this.select(0, true);
        return;
      case 'KeyL': case 'Escape':
        eat();
        if (!e.repeat) this.later();
        return;
    }
  }

  /** Put the prize away for now: it waits behind the shop's button. */
  private later() {
    if (this.phase === 'intro') { this.settle(); return; }
    if (this.phase !== 'open' || performance.now() < this.readyAt) return;
    this.putAway = this.key;
    this.host.say('YOUR PRIZE WAITS IN THE SHOP');
    this.close();
  }

  private pick(i: number) {
    const g = this.host.game, a = this.host.audio;
    a.unlock();
    if (this.phase !== 'open' || performance.now() < this.readyAt) return;
    const id = g.shop.prize?.[i];
    if (!id) return;
    if (!g.hasRoomFor(id)) { this.host.say('TOOLBOX FULL. MAKE ROOM FIRST'); this.cards()[i]?.animate([{ translate: '0' }, { translate: '-8px' }, { translate: '8px' }, { translate: '0' }], { duration: 260 }); return; }
    const take = () => {
      const part = g.takePrize(i);
      if (!part) return;
      a.buy();
      this.host.say(`${PARTS[id].name.toUpperCase()}: INTO THE TOOLBOX`);
      this.host.taken(part);
    };
    if (reducedMotion()) { take(); this.close(); return; }
    this.phase = 'outro';
    this.root.classList.add('dp-out');
    const cards = this.cards(), chosen = cards[i];
    chosen.classList.add('is-chosen');
    cards.forEach((b, j) => {
      if (j !== i) b.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(70vh) rotate(${j < i ? -28 : 24}deg)`, opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.5,-0.3,.9,.6)', fill: 'forwards', delay: Math.abs(j - i) * 50 });
    });
    for (const sel of ['.dp-head', '.dp-footer']) this.root.querySelector(sel)?.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-12px)' }], { duration: 300, fill: 'forwards' });
    // the part hops off its card and drops into the toolbox
    const img = chosen.querySelector<HTMLImageElement>('.dp-img')!, from = img.getBoundingClientRect();
    const fly = document.createElement('img');
    fly.className = 'dp-fly';
    fly.src = img.src;
    fly.alt = '';
    Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    this.root.appendChild(fly);
    img.classList.add('dp-peeled');
    a.pickUp();
    const box = document.getElementById('inventoryBox')?.getBoundingClientRect();
    const to = box ? { x: box.left + box.width / 2, y: box.top + box.height * 0.4 } : { x: innerWidth - 160, y: 220 };
    const dx = to.x - (from.left + from.width / 2), dy = to.y - (from.top + from.height / 2), s = 56 / from.width;
    fly.animate([
      { transform: 'none' },
      { transform: 'translate(0, -50px) rotate(-12deg) scale(1.15)', offset: 0.3, easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 120}px) rotate(160deg) scale(${(1 + s) / 2})`, offset: 0.65 },
      { transform: `translate(${dx}px, ${dy}px) rotate(360deg) scale(${s})` },
    ], { duration: 900, easing: 'linear', fill: 'forwards' });
    this.timers.push(window.setTimeout(() => { take(); this.close(); }, 900));
  }

  private close() {
    this.clearTimers();
    const was = this.phase;
    this.phase = 'closed';
    this.drawnKey = '';
    if (was === 'closed') return;
    // while it fades out it still covers the page, so a click meant for it never lands on the table behind; the
    // shop's prize button only appears once it has gone
    this.root.classList.add('dp-closing');
    window.setTimeout(() => { if (this.phase === 'closed') { this.root.hidden = true; this.root.innerHTML = ''; } this.host.changed(); }, 230);
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
