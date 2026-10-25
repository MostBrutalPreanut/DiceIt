import { callout } from '../data/callouts';
import { DECAL_SLOTS, DECALS, decalText, KIND_NAMES, SKIP_PAY, type DecalId, type DecalOffer } from '../data/decals';
import { PARTS, RARITY_NAMES } from '../data/parts';
import type { AudioFx } from '../audio';
import type { Game } from '../game/game';
import type { Renderer } from '../render/renderer';
import { APRON_Z, DECAL_SLOT_POS, DECAL_TILT } from '../render/scene';

/**
 * The boss's prize as a reward reveal, not a menu: the page dims, BOSS BEATEN stamps in with the boss's name,
 * three sticker cards slap down and flip over one after another (rarity shows in the foil round each card), and
 * the one you pick peels off its card and flies onto the apron slot it will occupy. Mouse, keyboard (1/2/3, or
 * the arrows and Enter, S to skip) and touch (tap to lift a card, tap again to stick it). Reduced motion skips the
 * flying and flipping. The game logic is untouched: this calls chooseDecal / skipPick like any button would.
 */
export interface DecalPickHost {
  game: Game;
  renderer: Renderer;
  audio: AudioFx;
  /** A line for the backbox's dot-matrix display. */
  say: (text: string) => void;
  /** The run changed (a decal was stuck, or the cash taken): save it and refresh the workshop. */
  changed: () => void;
}

type Phase = 'closed' | 'intro' | 'open' | 'outro';

/** When things land in the reveal (ms from opening). */
const T = { title: 120, banner: 520, card: 760, stagger: 260, flipAfter: 230, flip: 480 };
/** The sticker on the card is drawn at this size (px); the decal icon fills about 0.77 of its box. */
const ART = 168;
const ICON_FILL = 0.383 * 2;
/** decalIcon draws every sticker turned by this much (degrees); the apron slots have their own tilt. */
const ICON_TILT = -6;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class DecalPicker {
  private phase: Phase = 'closed';
  /** The pending offer (and the apron) the cards were last drawn for. */
  private drawnKey = '';
  /** The offer whose reveal has already played: redraws of it (a peel, a theme change) come in settled. */
  private revealedKey = '';
  /** The card that is lifted (hovered, or picked with the arrows; on touch, the first tap). */
  private sel = -1;
  /** Folded away so the apron can be clicked (the apron is full and a decal has to be peeled first). */
  private docked = false;
  private pointerType = 'mouse';
  private timers: number[] = [];
  private readonly icons = new Map<string, string>();

  constructor(private readonly root: HTMLElement, private readonly host: DecalPickHost) {
    // the reveal covers the whole page, so it lives on the body (out of the table's stacking context)
    document.body.appendChild(root);
    root.className = 'dp-root';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Boss beaten: pick a decal');
    addEventListener('keydown', (e) => this.onKey(e), true); // capture: the table's keys (arrows, Space, Enter) stay put while it is open
    root.addEventListener('pointerdown', (e) => {
      this.pointerType = e.pointerType || 'mouse';
      root.classList.toggle('dp-touch', this.pointerType === 'touch');
      // a click on the backdrop during the reveal skips to the end of it
      if (this.phase === 'intro' && !(e.target as HTMLElement).closest('button')) this.settle();
    });
  }

  /** Called whenever the workshop refreshes: open, redraw or close the picker to match the run. */
  update() {
    const g = this.host.game;
    const owed = g.pending !== null && g.editable;
    if (this.phase === 'outro') return; // the pick's flight finishes on its own
    if (!owed) { if (this.phase !== 'closed') this.close(); return; }
    const offerKey = JSON.stringify([g.round, g.pending]);
    const key = JSON.stringify([offerKey, g.decals.length, this.host.renderer.theme.id]);
    if (key === this.drawnKey && this.phase !== 'closed') return;
    const replay = offerKey !== this.revealedKey;
    if (this.docked && g.apronFree) this.docked = false; // room was made: back to the cards
    this.drawnKey = key;
    this.revealedKey = offerKey;
    this.draw(replay && !reducedMotion());
  }

  // ---- drawing -----------------------------------------------------------------------------------------

  private icon(id: DecalId, size: number) {
    const r = this.host.renderer;
    const key = `${r.theme.id}:${id}:${size}`;
    let url = this.icons.get(key);
    if (!url) { url = r.decalIcon(DECALS[id].look, DECALS[id].rarity, size).toDataURL(); this.icons.set(key, url); }
    return url;
  }

  private cardHtml(o: DecalOffer, i: number, slot: number, full: boolean) {
    const g = this.host.game, d = DECALS[o.id];
    const target = o.target ? PARTS[o.target] : null;
    const enabled = g.canTake(i);
    const foot = full ? '<b>No room:</b> peel a decal off the apron first' : `Sticks in apron slot <b>${slot + 1}</b> of ${DECAL_SLOTS}`;
    const label = `${d.name}${target ? ` for ${target.name}s` : ''}. ${RARITY_NAMES[d.rarity]} ${KIND_NAMES[d.kind]} decal. ${decalText(o)}`;
    const sparks = d.rarity === 'legendary' ? `<span class="dp-sparks" aria-hidden="true">${'<i></i>'.repeat(6)}</span>` : '';
    return `<button class="dp-card r-${d.rarity} k-${d.kind}" data-pick="${i}" style="--i:${i};--dc:${d.look.color}" ${enabled ? '' : 'disabled'} aria-label="${esc(label)}">
      <span class="dp-lift"><span class="dp-flip">
        <span class="dp-back" aria-hidden="true"><span class="dp-backmark disp">?</span><span class="dp-backtag">DECAL</span></span>
        <span class="dp-face">
          <span class="dp-art"><span class="dp-burst"></span><img class="dp-img" alt="" draggable="false" src="${this.icon(o.id, ART)}">${sparks}<span class="dp-key" aria-hidden="true">${i + 1}</span><span class="dp-kind">${KIND_NAMES[d.kind]}</span>${full ? '<span class="dp-noroom disp" aria-hidden="true">NO ROOM</span>' : ''}</span>
          <span class="dp-body">
            <b class="dp-name disp">${esc(d.name)}</b>
            <span class="dp-meta"><span class="rar r-${d.rarity}">${RARITY_NAMES[d.rarity]}</span>${target ? `<span class="dp-target"><i style="background:var(--role-${o.target}-fill)"></i>${esc(target.name)}s</span>` : ''}</span>
            <span class="dp-txt">${esc(decalText(o))}</span>
            <span class="dp-foot">${foot}<span class="dp-again">Tap again to stick it</span></span>
          </span>
          <span class="dp-glare" aria-hidden="true"></span>
        </span>
      </span></span>
    </button>`;
  }

  private draw(animate: boolean) {
    const g = this.host.game, root = this.root;
    const pending = g.pending!;
    const boss = g.bossAt(g.round - 1);
    const full = !g.apronFree;
    const slot = g.decals.length;
    this.clearTimers();
    this.sel = -1;
    root.hidden = false;
    root.classList.toggle('dp-anim', animate);
    root.classList.remove('dp-settled', 'dp-out', 'dp-closing');
    root.classList.toggle('dp-docked', this.docked);
    root.classList.toggle('dp-full', full);
    const apron = Array.from({ length: DECAL_SLOTS }, (_, i) => `<i class="${i < slot ? 'on' : i === slot ? 'next' : ''}"></i>`).join('');
    root.innerHTML = `<div class="dp-dim"></div><div class="dp-rays" aria-hidden="true"></div>
      <div class="dp-stage">
        <header class="dp-head">
          <h2 class="dp-title disp">Boss beaten!</h2><span class="dp-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          <div class="dp-banner disp">${boss ? `${esc(boss.name)}${boss.final ? ' · final boss' : ''}` : 'Prize time'}</div>
          <p class="dp-sub">Pick a decal. It sticks on your apron for the rest of the run.</p>
        </header>
        ${full ? `<div class="dp-fullnote"><span><b>Your apron is full.</b> Peel a decal off it to make room for this one.</span><button class="dp-peel" id="dpPeel">Peel one off</button></div>` : ''}
        <div class="dp-cards">${pending.map((o, i) => this.cardHtml(o, i, slot, full)).join('')}</div>
        <footer class="dp-footer">
          <span class="dp-apron" title="Your apron: ${slot} of ${DECAL_SLOTS} slots taken">${apron}<small>Apron</small></span>
          <button class="dp-skip" id="btnSkip"><span class="dp-coin" aria-hidden="true">$</span>Take $${SKIP_PAY} instead<kbd>S</kbd></button>
          <span class="dp-hint"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick · <kbd>←</kbd><kbd>→</kbd> <kbd>Enter</kbd></span>
        </footer>
      </div>
      <div class="dp-dock"><span><b>Apron full.</b> Click a decal on the apron and peel it off.</span><button id="dpBack">Back to the decals</button></div>`;

    root.querySelectorAll<HTMLButtonElement>('.dp-card').forEach((b) => {
      const i = Number(b.dataset.pick);
      b.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { this.tilt(b, e); this.select(i, false); } });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.untilt(b); if (this.sel === i) this.select(-1, false); } });
      b.addEventListener('focus', () => this.select(i, false));
      b.onclick = () => {
        if (this.phase === 'intro') this.settle();
        // on touch the first tap lifts the card so it can be read; the second sticks it
        if (this.pointerType === 'touch' && this.sel !== i) { this.select(i, false); return; }
        this.pick(i);
      };
    });
    ($('btnSkip', root) as HTMLButtonElement).onclick = () => this.skip();
    const peel = root.querySelector<HTMLButtonElement>('#dpPeel');
    if (peel) peel.onclick = () => this.dock(true);
    ($('dpBack', root) as HTMLButtonElement).onclick = () => this.dock(false);

    if (!animate) { this.phase = 'open'; root.classList.add('dp-settled'); return; }
    this.phase = 'intro';
    const a = this.host.audio;
    this.later(T.title, () => a.stamp());
    pending.forEach((o, i) => {
      const at = T.card + i * T.stagger;
      const r = DECALS[o.id].rarity;
      this.later(at, () => { if (!this.hook('decalReveal', i, r)) a.shopRoll(i); });
      if (r === 'legendary') this.later(at + T.flipAfter + T.flip * 0.6, () => a.bonus());
    });
    this.later(T.card + (pending.length - 1) * T.stagger + T.flipAfter + T.flip, () => this.settle());
  }

  /** The reveal is over (or was skipped): everything at rest and clickable. */
  private settle() {
    if (this.phase !== 'intro') return;
    this.clearTimers();
    this.phase = 'open';
    this.root.classList.add('dp-settled');
  }

  private dock(on: boolean) {
    this.docked = on;
    this.root.classList.toggle('dp-docked', on);
    if (on) this.host.say('PEEL A DECAL OFF THE APRON TO MAKE ROOM');
  }

  // ---- hover, tilt, selection ----------------------------------------------------------------------------

  private tilt(b: HTMLElement, e: PointerEvent) {
    const r = b.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    b.style.setProperty('--rx', `${(-py * 14).toFixed(1)}deg`);
    b.style.setProperty('--ry', `${(px * 18).toFixed(1)}deg`);
    b.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(0)}%`);
    b.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(0)}%`);
  }

  private untilt(b: HTMLElement) {
    for (const v of ['--rx', '--ry', '--mx', '--my']) b.style.removeProperty(v);
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
    // while the pick flies nothing else may change the run (not even an undo): it lands in a moment
    if (this.phase !== 'intro' && this.phase !== 'open') { if (this.phase === 'outro') { e.preventDefault(); e.stopPropagation(); } return; }
    if (this.docked || this.root.hidden) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // undo and redo still work
    if (!this.onTop()) return; // something else (the machine picker, a menu) is over the reveal
    const n = this.host.game.pending?.length ?? 0;
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      const i = Number(digit[2]) - 1;
      if (i < n) { eat(); if (!e.repeat) { this.settle(); this.pick(i); } }
      return;
    }
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
        if (document.activeElement?.id === 'btnSkip') this.skip();
        else if (this.sel >= 0) this.pick(this.sel);
        else this.select(0, true);
        return;
      case 'KeyS':
        eat();
        if (!e.repeat) this.skip();
        return;
      case 'Escape':
        if (this.phase === 'intro') { eat(); this.settle(); }
        return;
    }
  }

  /** The reveal is what the player is looking at (nothing modal sits over its middle). */
  private onTop() {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return !el || this.root.contains(el);
  }

  // ---- picking -----------------------------------------------------------------------------------------

  private pick(i: number) {
    const g = this.host.game, a = this.host.audio;
    a.unlock();
    if (this.phase !== 'open') return;
    const offer = g.pending?.[i];
    if (!offer) return;
    if (!g.canTake(i)) { if (!g.apronFree) { this.host.say('NO ROOM ON THE APRON. PEEL ONE FIRST'); this.nudge(i); } return; }
    const slot = g.decals.length;
    const stick = () => {
      if (!g.chooseDecal(i)) return false;
      if (!this.hook('decalPick')) { a.place(); a.goal(); }
      this.host.say(`${DECALS[offer.id].name.toUpperCase()} STUCK ON THE APRON`);
      this.host.changed();
      return true;
    };
    if (reducedMotion()) { stick(); this.close(true); return; }

    this.phase = 'outro';
    this.root.classList.add('dp-out');
    const cards = this.cards();
    const chosen = cards[i];
    chosen.classList.add('is-chosen');
    cards.forEach((b, j) => {
      if (j === i) return;
      b.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(70vh) rotate(${j < i ? -28 : 24}deg)`, opacity: 0 }],
        { duration: 520, easing: 'cubic-bezier(.5,-0.3,.9,.6)', fill: 'forwards', delay: Math.abs(j - i) * 50 });
    });
    for (const sel of ['.dp-head', '.dp-footer', '.dp-fullnote']) {
      this.root.querySelector(sel)?.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-12px)' }], { duration: 300, fill: 'forwards' });
    }

    // the sticker peels off its card and flies to its slot on the apron
    const img = chosen.querySelector<HTMLImageElement>('.dp-img')!;
    const from = img.getBoundingClientRect();
    const fly = document.createElement('img');
    fly.className = 'dp-fly';
    fly.src = img.src;
    fly.alt = '';
    Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    this.root.appendChild(fly);
    img.classList.add('dp-peeled');
    if (!this.hook('decalPeel')) a.pickUp();

    const dest = this.slotOnScreen(slot) ?? { x: innerWidth / 2, y: innerHeight - 80, r: 20, tilt: 0, k: 1 };
    const s = (dest.r * 2) / (from.width * ICON_FILL);
    const dx = dest.x - (from.left + from.width / 2), dy = dest.y - (from.top + from.height / 2);
    const rot = dest.tilt - ICON_TILT;
    const peel = 360, flight = 720;
    fly.animate([
      { transform: 'none', offset: 0 },
      // a corner lifts first (a squash and a skew read as peeling), then the whole sticker comes away
      { transform: 'translate(6px, -4px) rotate(5deg) skewX(-10deg) scale(1.02, .9)', offset: 0.1 },
      { transform: 'translate(0, -58px) rotate(-16deg) scale(1.22)', offset: peel / (peel + flight), easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 140}px) rotate(${rot - 200}deg) scale(${(1.1 + s) / 2})`, offset: (peel + flight * 0.5) / (peel + flight), easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${s * 1.35}, ${s * 1.35 * dest.k})`, offset: 0.93 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${s}, ${s * dest.k})`, offset: 1 },
    ], { duration: peel + flight, easing: 'linear', fill: 'forwards' });

    this.later(peel + flight, () => {
      const ok = stick();
      this.burst(dest.x, dest.y, dest.r, DECALS[offer.id].look.color, ok);
      fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: 60, fill: 'forwards' });
      this.later(620, () => this.close(true));
    });
  }

  private skip() {
    const g = this.host.game, a = this.host.audio;
    a.unlock();
    if (this.phase === 'intro') this.settle();
    if (this.phase !== 'open') return;
    if (!g.skipPick()) return;
    if (!this.hook('decalSkip')) a.buy();
    this.host.say(callout('skipped'));
    if (reducedMotion()) { this.host.changed(); this.close(true); return; }
    this.phase = 'outro'; // before the refresh, so it does not close the reveal under the cash's flight
    this.root.classList.add('dp-out');
    this.host.changed();
    this.cards().forEach((b, j) => b.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(-60vh) rotate(${(j - 1) * 18}deg) scale(.7)`, opacity: 0 }],
      { duration: 480, easing: 'cubic-bezier(.5,-0.4,.9,.5)', fill: 'forwards', delay: j * 60 }));
    for (const sel of ['.dp-head', '.dp-footer', '.dp-fullnote']) this.root.querySelector(sel)?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    // the cash flies to the money on the shop panel
    const btn = $('btnSkip', this.root).getBoundingClientRect();
    const money = document.getElementById('shopMoney')?.getBoundingClientRect();
    const cash = document.createElement('div');
    cash.className = 'dp-cash disp';
    cash.textContent = `+$${SKIP_PAY}`;
    Object.assign(cash.style, { left: `${btn.left + btn.width / 2}px`, top: `${btn.top + btn.height / 2}px` });
    this.root.appendChild(cash);
    const dx = money && money.width ? money.left + money.width / 2 - (btn.left + btn.width / 2) : 0;
    const dy = money && money.width ? money.top + money.height / 2 - (btn.top + btn.height / 2) : -80;
    cash.animate([
      { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%, -90%) scale(1.5) rotate(-6deg)', opacity: 1, offset: 0.3 },
      { transform: `translate(calc(${dx}px - 50%), calc(${dy}px - 50%)) scale(.7)`, opacity: 1, offset: 0.92 },
      { transform: `translate(calc(${dx}px - 50%), calc(${dy}px - 50%)) scale(.5)`, opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'forwards' });
    this.later(900, () => { a.coinLand(); this.close(true); });
  }

  /** A card that cannot be taken shakes its head. */
  private nudge(i: number) {
    this.cards()[i]?.animate([{ transform: 'none' }, { transform: 'translateX(-8px) rotate(-1.5deg)' }, { transform: 'translateX(7px) rotate(1deg)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 360 });
  }

  /** Apron slot `i` on screen: its centre, the sticker's radius there, its tilt and the machine's tip. */
  private slotOnScreen(i: number) {
    const pos = DECAL_SLOT_POS[i];
    if (!pos) return null;
    const r = this.host.renderer;
    const c = r.toClient(pos[0], pos[1], APRON_Z), e = r.toClient(pos[0] + 1.05 * 1.16, pos[1], APRON_Z);
    const radius = Math.hypot(e.x - c.x, e.y - c.y);
    if (!isFinite(radius) || radius <= 0) return null;
    return { x: c.x, y: c.y, r: radius, tilt: DECAL_TILT[i] ?? 0, k: r.view.k };
  }

  /** Sticker confetti and a STUCK! stamp where the decal landed (art-direction §5: particles are stickers). */
  private burst(x: number, y: number, r: number, color: string, stuck: boolean) {
    const colors = [color, 'var(--paper)', 'var(--accent)', 'var(--coin)', 'var(--glow)'];
    for (let n = 0; n < 12; n++) {
      const p = document.createElement('i');
      p.className = `dp-bit ${n % 3 === 0 ? 'star' : n % 3 === 1 ? 'dot' : 'chip'}`;
      p.style.background = colors[n % colors.length];
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      this.root.appendChild(p);
      const a = (n / 12) * Math.PI * 2 + Math.random() * 0.4, d = Math.max(44, r * 2.4) + Math.random() * 36;
      p.animate([
        { transform: 'translate(-50%, -50%) scale(.45) rotate(0deg)' },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d * 0.8}px), calc(-50% + ${Math.sin(a) * d * 0.8 - 10}px)) scale(1.18) rotate(${90 + n * 20}deg)`, offset: 0.35 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 14}px)) scale(.68) rotate(${160 + n * 25}deg)`, offset: 0.8 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 22}px)) scale(0) rotate(${200 + n * 25}deg)` },
      ], { duration: 620, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    }
    if (!stuck) return;
    const s = document.createElement('div');
    s.className = 'dp-stuck disp';
    s.textContent = 'STUCK!';
    s.style.left = `${x}px`;
    s.style.top = `${y - r * 1.6}px`;
    this.root.appendChild(s);
    s.animate([
      { transform: 'translate(-50%, -50%) scale(.45) rotate(-8deg)' },
      { transform: 'translate(-50%, -70%) scale(1.18) rotate(-8deg)', offset: 0.25 },
      { transform: 'translate(-50%, -75%) scale(1) rotate(-8deg)', offset: 0.7 },
      { transform: 'translate(-50%, -90%) scale(0) rotate(-8deg)' },
    ], { duration: 680, easing: 'ease-out', fill: 'forwards' });
  }

  // ---- housekeeping -------------------------------------------------------------------------------------

  private close(fade = false) {
    this.clearTimers();
    this.phase = 'closed';
    this.drawnKey = '';
    this.docked = false;
    const root = this.root;
    const done = () => { if (this.phase === 'closed') { root.hidden = true; root.innerHTML = ''; root.className = 'dp-root'; } };
    if (!fade || reducedMotion()) { done(); return; }
    root.classList.add('dp-closing');
    this.later(240, done);
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** An optional sound the audio module may grow (decalReveal, decalPeel, decalPick, decalSkip): true if it played. */
  private hook(name: string, ...args: unknown[]): boolean {
    const f = (this.host.audio as unknown as Record<string, unknown>)[name];
    if (typeof f !== 'function') return false;
    (f as (...a: unknown[]) => void).apply(this.host.audio, args);
    return true;
  }
}

function $(id: string, root: ParentNode): HTMLElement {
  return root.querySelector<HTMLElement>(`#${id}`)!;
}

