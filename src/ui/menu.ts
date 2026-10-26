// The menus: the main menu over the attract table, the machine picker (the three cabinets from the key art),
// the personal scoreboard, settings, and the pause menu. Plain DOM like the rest of the UI; main.ts owns the
// game and passes in what the menus need as hooks. Keyboard: Enter or Space activate, arrows move, Esc goes back.
import { BIG_BOI_FOR, BIG_BOIS, defOn, type MachineId } from '../data/bigboi';
import { DECALS } from '../data/decals';
import { FINAL_ROUND } from '../data/bosses';
import { describe } from '../data/parts';
import type { Mood } from '../render/props';
import { themeById, themeVars, THEMES, type Theme } from '../render/theme';
import { fmt } from './html';
import { backdropTile } from './hud';
import { RESULT_NAMES, rankOf, shortDate, type RunRecord } from './scoreboard';
import { ACTIONS, DEFAULT_KEYS, keyLabel, rebind, type Action, type Settings } from './settings';

export interface SavedRunInfo { machine: MachineId; round: number; money: number; won: boolean }

export interface MenuHooks {
  /** The run in storage, if there is one (Resume continues it). */
  savedRun(): SavedRunInfo | null;
  /** Start a run on this machine (with Big Boi's tour, or not); any run in storage was already ended (abandoned) by the menu. */
  newGame(machine: MachineId, tutorial: boolean): void;
  /** Where the picker's Tutorial switch starts: on until the tour has been seen once. */
  tutorialDefault(): boolean;
  resume(): void;
  /** Pause menu: back to the table. */
  unpause(): void;
  /** Pause menu: to the main menu, the run stays saved. */
  quit(): void;
  /** End the run in storage: it goes on the scoreboard as abandoned and the save is cleared. */
  abandon(): void;
  records(): RunRecord[];
  /** A finished build as a picture (data URL). */
  thumb(rec: RunRecord): string;
  /** Big Boi in a machine's colours (data URL), pulling a face (happy unless asked). */
  bigBoi(machine: MachineId, mood?: Mood): string;
  /** Big Boi on the main menu was poked. */
  poke(): void;
  settings(): Settings;
  setSettings(s: Settings): void;
  /** Any key or click in a menu (browsers only start sound after one). */
  wake(): void;
}

type Screen = 'main' | 'picker' | 'scores' | 'settings' | 'pause';

/** The machine picker's cabinets: generated from the concept art code (npm run concept), loaded on demand. */
const CABINETS: Record<MachineId, () => Promise<{ default: string }>> = {
  factory: () => import('../assets/cabinets/factory.svg?raw'),
  diner: () => import('../assets/cabinets/diner.svg?raw'),
  castle: () => import('../assets/cabinets/castle.svg?raw'),
};
const cabinetSvg = new Map<MachineId, string>();

/** The tokens a card needs to wear its own machine's colours, whatever machine the page is in. */
const CARD_TOKENS = ['--bg', '--paper', '--ink', '--shade', '--rim', '--accent', '--glow', '--band', '--rim-light', '--chip', '--tile', '--faint', '--drop', '--paper-dim', '--bulb-off', '--role-lane-fill', '--role-mega-fill', '--metal'];
const themeStyle = (t: Theme) => {
  const v = themeVars(t);
  return CARD_TOKENS.map((k) => `${k}:${v[k]}`).join(';');
};
const backdropURL = (t: Theme) => `url("data:image/svg+xml,${encodeURIComponent(backdropTile(t).svg)}")`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export class Menu {
  screen: Screen | null = null;
  /** Settings can be opened from the main menu or from the pause menu; Back returns there. */
  private from: Screen = 'main';
  private picked: string | null = null;
  /** The picker's Tutorial switch: the next run starts with Big Boi's tour. */
  private tutorial = false;
  private binding: Action | null = null;
  private confirmOpen: { no: () => void } | null = null;
  private thumbs = new Map<string, string>();
  private root: HTMLElement;
  /** The machine the attract table is showing: the title's Big Boi wears it. */
  private machine: MachineId = 'factory';
  /** The title's Big Boi: when he next blinks, and the face he is pulling after a poke. */
  private blinkTimer = 0;
  private faceTimer = 0;
  private face: Mood | null = null;

  constructor(private hooks: MenuHooks) {
    this.root = document.getElementById('menu')!;
    // the menu sees every key first while it is open, and the game sees none of them
    addEventListener('keydown', (e) => this.onKey(e), true);
    this.root.addEventListener('pointerdown', () => hooks.wake());
    for (const id of THEMES.map((t) => t.id)) void CABINETS[id]().then((m) => cabinetSvg.set(id, m.default));
  }

  get open() { return this.screen !== null; }
  /** The game is paused under the pause menu (or under settings opened from it). */
  get paused() { return this.screen === 'pause' || (this.screen === 'settings' && this.from === 'pause'); }
  /** The main menu and its screens hide the game and show the attract table. */
  get inMenu() { return this.open && !this.paused; }

  showMain() { this.from = 'main'; this.show('main'); }
  showPicker() { this.from = 'main'; this.tutorial = this.hooks.tutorialDefault(); this.show('picker'); }
  showPause() { this.from = 'pause'; this.show('pause'); }
  /** Settings, opened over the screen you are on (Back returns to it). */
  showSettings() { this.show('settings'); }
  close() {
    this.stopBoi();
    this.screen = null;
    this.binding = null;
    this.confirmOpen = null;
    this.root.hidden = true;
    this.root.innerHTML = '';
    document.body.classList.remove('inmenu', 'paused');
  }

  /** The attract table moved on to another machine. */
  setMachine(id: MachineId) {
    this.machine = id;
    const img = this.root.querySelector<HTMLImageElement>('.mboi');
    if (img) img.src = this.hooks.bigBoi(id, this.face ?? 'happy');
  }

  /** New Game: a run in storage is abandoned first, so ask. */
  askNewGame() {
    const run = this.hooks.savedRun();
    if (!run) { this.showPicker(); return; }
    const t = themeById(run.machine);
    this.confirm('Start a new run?', `Your run on ${title(t?.tagline ?? run.machine)} (round ${run.round}) ends here and goes on the scoreboard as abandoned.`, 'Abandon it', () => { this.hooks.abandon(); this.showPicker(); });
  }

  private show(s: Screen) {
    this.stopBoi();
    this.screen = s;
    this.binding = null;
    this.confirmOpen = null;
    this.root.hidden = false;
    this.root.className = `m-${s}`;
    document.body.classList.toggle('inmenu', this.inMenu);
    document.body.classList.toggle('paused', this.paused);
    this.root.innerHTML = this.render(s);
    this.bind(s);
    this.focusFirst();
  }

  // ---- screens ------------------------------------------------------------------------------------------------

  private render(s: Screen): string {
    const back = (label = 'Back') => `<button class="mback" data-act="back"><span aria-hidden="true">←</span> ${label}</button>`;
    if (s === 'main') {
      const run = this.hooks.savedRun();
      const t = run ? themeById(run.machine) : null;
      const best = this.hooks.records()[0];
      const resume = run && t
        ? `<button class="mbtn primary" data-act="resume"><span class="disp">Resume</span><small>${esc(title(t.tagline))} · round ${run.round} · $${run.money}${run.won ? ' · endless' : ''}</small></button>` : '';
      // every piece pops in from the side, one after another (--i is its turn)
      let i = 0;
      const n = () => `style="--i:${i++}"`;
      return `<section class="mscreen">
        <div class="mcol">
          <h1 class="mtitle" aria-label="Big Boi Pinball Designer"><span class="t1 disp in" ${n()}>BIG BOI</span><span class="t2 disp in" ${n()}>PINBALL DESIGNER</span><span class="mboiwrap in" ${n()}><img class="mboi" alt="Big Boi. Poke him" title="Poke him" src="${this.hooks.bigBoi(this.machine)}"></span></h1>
          <nav class="mpanel in" aria-label="Main menu" ${n()}>
            ${resume.replace('class="mbtn primary"', () => `class="mbtn primary in" ${n()}`)}
            <button class="mbtn ${run ? '' : 'primary'} in" ${n()} data-act="new"><span class="disp">New Game</span><small>${run ? 'ends the run above' : 'pick a machine and build it up'}</small></button>
            <button class="mbtn in" ${n()} data-act="scores" data-hue="lane"><span class="disp">Scoreboard</span><small>${best ? `best: ${best.cleared} rounds, ${fmt(best.score)}` : 'your finished runs'}</small></button>
            <button class="mbtn in" ${n()} data-act="settings" data-hue="pop"><span class="disp">Settings</span><small>sound, graphics, buttons</small></button>
          </nav>
          <div class="mfoot in" ${n()}><kbd>↑</kbd><kbd>↓</kbd> choose <kbd>Enter</kbd> go</div>
        </div>
      </section>`;
    }
    if (s === 'picker') {
      const cards = THEMES.map((t) => {
        const bb = BIG_BOIS[BIG_BOI_FOR[t.id]];
        const lines = describe(defOn('mega', t.id), undefined, { machine: t.id }).filter((l) => l.tag !== 'score');
        const swatch = (['pop', 'coin', 'sling', 'spinner', 'lane'] as const).map((r) => `<i style="background:${t.role[r] === t.paper ? t.accent : t.role[r]}"></i>`).join('');
        return `<button class="cab" data-theme="${t.id}" style="${themeStyle(t)}">
          <span class="stage" style="background-image:${backdropURL(t)}"><span class="art" data-art="${t.id}">${cabinetSvg.get(t.id) ?? ''}</span><span class="ground"></span></span>
          <span class="cbody">
            <span class="cname disp">${esc(title(t.tagline))}</span>
            <span class="lanes" aria-label="its lanes spell ${t.laneWord}">${[...t.laneWord].map((c) => `<i class="disp">${c}</i>`).join('')}<span class="swatch">${swatch}</span></span>
            <span class="boi"><img alt="" src="${this.hooks.bigBoi(t.id)}"><span><b class="disp">${bb.title}</b>${bb.ability ? `<em>${bb.ability}</em>` : ''}</span></span>
            <span class="ab">${lines.map((l) => `<span>${l.text}</span>`).join('')}<span class="blurb">${bb.blurb}</span></span>
            <span class="go disp">Play this machine</span>
          </span>
        </button>`;
      }).join('');
      return `<section class="mscreen">
        <header class="mhead">${back()}<div><h2 class="disp">Pick your machine</h2><p>Each machine has its own look and its own Big Boi in the middle of the table, and he decides what kind of build pays best. The machine stays for the whole run.</p></div>
          <div class="mtut"><img alt="" src="${this.hooks.bigBoi(this.machine, 'cool')}"><span><b class="disp">Tutorial</b><small>Big Boi shows you around</small></span>
            <span class="seg" role="group" aria-label="Tutorial">${this.tutSeg()}</span></div></header>
        <div class="cabs">${cards}</div>
      </section>`;
    }
    if (s === 'scores') {
      const list = this.hooks.records();
      const rows = list.map((r, i) => {
        const t = themeById(r.machine);
        return `<li><button class="sbrow" data-id="${r.id}"><span class="rk disp">${i + 1}</span><i class="mdot" style="background:${t?.rim};border-color:${t?.ink}"></i>
          <span class="nm"><b>${esc(title(t?.tagline ?? r.machine))}</b><small>${shortDate(r.ended)} · ${r.cleared} round${r.cleared === 1 ? '' : 's'} cleared</small></span>
          <span class="res r-${r.result}">${RESULT_NAMES[r.result]}</span><span class="sc disp">${fmt(r.score)}</span></button></li>`;
      }).join('');
      return `<section class="mscreen">
        <header class="mhead">${back()}<div><h2 class="disp">Scoreboard</h2><p>Your finished runs on this device, best first. Pick one to see the machine it ended as.</p></div></header>
        ${list.length ? `<div class="sbwrap"><ol class="sblist">${rows}</ol><div class="sbdetail card" id="sbDetail"></div></div>`
          : `<div class="card sbempty"><h3>No runs yet</h3><p>A run lands here when it ends: won, lost or abandoned. Go and break something.</p><button class="primary disp" data-act="new">New Game</button></div>`}
      </section>`;
    }
    if (s === 'settings') {
      const st = this.hooks.settings();
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      return `<section class="mscreen">
        <header class="mhead">${back(this.from === 'pause' ? 'Back to pause' : 'Back')}<div><h2 class="disp">Settings</h2><p>Saved on this device and used at once. <kbd>M</kbd> still mutes everything while you play.</p></div></header>
        <div class="card setcard">
          <h3 class="disp">Sound</h3>
          <label class="srow"><span>Music</span><input type="range" min="0" max="100" step="5" value="${Math.round(st.music * 100)}" data-vol="music" aria-label="Music volume"><b class="num" id="volMusic">${pct(st.music)}</b></label>
          <label class="srow"><span>Sound effects</span><input type="range" min="0" max="100" step="5" value="${Math.round(st.sfx * 100)}" data-vol="sfx" aria-label="Sound effects volume"><b class="num" id="volSfx">${pct(st.sfx)}</b></label>
          <h3 class="disp">Graphics</h3>
          <div class="srow"><span>Quality</span><span class="seg" role="group" aria-label="Graphics quality"><button data-q="high" class="${st.quality === 'high' ? 'on' : ''}">High</button><button data-q="low" class="${st.quality === 'low' ? 'on' : ''}">Low</button></span><span></span></div>
          <div class="shint">Low draws at 1x, with no debris, smoke or glow: the score stickers stay. For slow machines.</div>
          <div class="srow"><span>Calm mode</span><span class="seg" role="group" aria-label="Calm mode"><button data-calm="0" class="${st.calm ? '' : 'on'}">Off</button><button data-calm="1" class="${st.calm ? 'on' : ''}">On</button></span><span></span></div>
          <div class="shint">No screen shake, backdrop drift, bulb chase or twinkles.</div>
          <h3 class="disp">Buttons</h3>
          ${ACTIONS.map((a) => `<div class="srow"><span>${a.name}</span><button class="keycap" data-bind="${a.id}" aria-label="${a.name}: ${keyLabel(st.keys[a.id])}. Press to change">${esc(keyLabel(st.keys[a.id]))}</button><span></span></div>`).join('')}
          <div class="shint" id="bindMsg">Pick a button, then press the key you want for it. <kbd>Z</kbd> <kbd>X</kbd> nudge, <kbd>Tab</kbd> cashes out and <kbd>Esc</kbd> pauses.</div>
          <div class="btnrow"><button data-act="resetkeys" ${ACTIONS.every((a) => st.keys[a.id] === DEFAULT_KEYS[a.id]) ? 'disabled' : ''}>Default buttons</button></div>
        </div>
      </section>`;
    }
    // pause
    const run = this.hooks.savedRun();
    const t = run ? themeById(run.machine) : null;
    return `<section class="mscreen">
      <div class="card pausecard housing-lite">
        <header class="marquee"><span class="bulbs"></span><h2 class="disp">PAUSED</h2></header>
        <div class="pbody">
          ${run && t ? `<p class="pinfo">${esc(title(t.tagline))} · round ${run.round}</p>` : ''}
          <button class="mbtn primary" data-act="unpause"><span class="disp">Resume</span><small>back to the table <kbd>Esc</kbd></small></button>
          <button class="mbtn" data-act="settings" data-hue="pop"><span class="disp">Settings</span><small>sound, graphics, buttons</small></button>
          <button class="mbtn" data-act="quit" data-hue="lane"><span class="disp">Quit to Main Menu</span><small>${run ? 'the run stays saved; a round in play starts over' : 'this run is over and on the scoreboard'}</small></button>
          ${run ? '<button class="mbtn danger" data-act="abandon"><span class="disp">Abandon Run</span><small>ends it, onto the scoreboard</small></button>' : ''}
        </div>
      </div>
    </section>`;
  }

  private bind(s: Screen) {
    const q = <T extends HTMLElement>(sel: string) => [...this.root.querySelectorAll<T>(sel)];
    for (const b of q<HTMLButtonElement>('[data-act]')) {
      b.onclick = () => {
        const act = b.dataset.act;
        if (act === 'back') this.back();
        else if (act === 'new') this.askNewGame();
        else if (act === 'resume') this.hooks.resume();
        else if (act === 'scores') this.show('scores');
        else if (act === 'settings') this.show('settings');
        else if (act === 'unpause') this.hooks.unpause();
        else if (act === 'quit') this.hooks.quit();
        else if (act === 'abandon') this.confirm('Abandon this run?', 'It ends now and goes on the scoreboard as abandoned. This cannot be undone.', 'Abandon run', () => this.hooks.abandon());
        else if (act === 'resetkeys') this.update({ keys: { ...DEFAULT_KEYS } }, true);
      };
    }
    if (s === 'picker') {
      for (const b of q<HTMLButtonElement>('.cab')) b.onclick = () => this.hooks.newGame(b.dataset.theme as MachineId, this.tutorial);
      const seg = this.root.querySelector<HTMLElement>('.mtut .seg')!;
      seg.onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tut]');
        if (!b) return;
        this.tutorial = b.dataset.tut === '1';
        seg.innerHTML = this.tutSeg();
        seg.querySelector<HTMLElement>(`[data-tut="${b.dataset.tut}"]`)?.focus();
      };
      // a cabinet that was still loading drops in when it arrives
      for (const el of q<HTMLElement>('.art')) {
        const id = el.dataset.art as MachineId;
        if (!el.innerHTML) void CABINETS[id]().then((m) => { cabinetSvg.set(id, m.default); if (el.isConnected) el.innerHTML = m.default; });
      }
    }
    if (s === 'scores') {
      for (const b of q<HTMLButtonElement>('.sbrow')) {
        b.onclick = () => this.detail(b.dataset.id!);
        b.onfocus = () => this.detail(b.dataset.id!);
      }
      const first = this.hooks.records()[0];
      if (first) this.detail(this.picked && this.hooks.records().some((r) => r.id === this.picked) ? this.picked : first.id);
    }
    if (s === 'settings') {
      for (const r of q<HTMLInputElement>('input[data-vol]')) {
        r.oninput = () => {
          const v = Number(r.value) / 100;
          this.update(r.dataset.vol === 'music' ? { music: v } : { sfx: v });
          this.root.querySelector(r.dataset.vol === 'music' ? '#volMusic' : '#volSfx')!.textContent = `${Math.round(v * 100)}%`;
        };
      }
      for (const b of q<HTMLButtonElement>('[data-q]')) b.onclick = () => this.update({ quality: b.dataset.q as Settings['quality'] }, true);
      for (const b of q<HTMLButtonElement>('[data-calm]')) b.onclick = () => this.update({ calm: b.dataset.calm === '1' }, true);
      for (const b of q<HTMLButtonElement>('[data-bind]')) {
        b.onclick = () => {
          this.binding = b.dataset.bind as Action;
          for (const o of q<HTMLButtonElement>('[data-bind]')) o.classList.toggle('wait', o === b);
          b.textContent = 'Press a key';
          this.root.querySelector('#bindMsg')!.textContent = 'Press the key for it (Esc to cancel).';
        };
      }
    }
    if (s === 'main') {
      // the pieces stop being "in" once they have landed, so a later hover or poke animation starts clean
      for (const el of q<HTMLElement>('.in')) el.addEventListener('animationend', (e) => { if (e.target === el) el.classList.remove('in'); });
      const img = this.root.querySelector<HTMLImageElement>('.mboi')!;
      img.onclick = () => this.pokeBoi(img);
      this.blinkLater(img);
    }
    // the scoreboard and settings close with a click anywhere outside them
    if (s === 'scores' || s === 'settings') {
      this.root.onclick = (e) => {
        if (this.screen !== s || this.confirmOpen || this.binding) return;
        if (!(e.target as HTMLElement).closest('.setcard, .sblist, .sbdetail, .sbempty, .mhead h2, .mhead p, button, input, label')) this.back();
      };
    } else this.root.onclick = null;
    if (s === 'pause') this.root.querySelector('.bulbs')!.innerHTML = Array.from({ length: 13 }, (_, i) => `<i class="${i % 2 ? 'on' : ''}"></i>`).join('');
  }

  private tutSeg() {
    return `<button data-tut="0" class="${this.tutorial ? '' : 'on'}" aria-pressed="${!this.tutorial}">Off</button><button data-tut="1" class="${this.tutorial ? 'on' : ''}" aria-pressed="${this.tutorial}">On</button>`;
  }

  // ---- the title's Big Boi: he blinks now and then, and pulls a face when poked ---------------------------------

  private stopBoi() {
    clearTimeout(this.blinkTimer);
    clearTimeout(this.faceTimer);
    this.face = null;
  }
  private blinkLater(img: HTMLImageElement) {
    clearTimeout(this.blinkTimer);
    this.blinkTimer = window.setTimeout(() => {
      if (!img.isConnected) return;
      if (!this.face) {
        img.src = this.hooks.bigBoi(this.machine, 'blink');
        const twice = Math.random() < 0.25;
        window.setTimeout(() => {
          if (this.face || !img.isConnected) return;
          img.src = this.hooks.bigBoi(this.machine);
          if (twice) window.setTimeout(() => { if (!this.face && img.isConnected) { img.src = this.hooks.bigBoi(this.machine, 'blink'); window.setTimeout(() => { if (!this.face && img.isConnected) img.src = this.hooks.bigBoi(this.machine); }, 110); } }, 140);
        }, 130);
      }
      this.blinkLater(img);
    }, 2200 + Math.random() * 2800);
  }
  private pokeBoi(img: HTMLImageElement) {
    const faces: Mood[] = ['oof', 'shocked', 'cool', 'sad'];
    const pick = faces.filter((f) => f !== this.face)[Math.floor(Math.random() * (faces.length - (this.face ? 1 : 0)))];
    this.face = pick;
    img.src = this.hooks.bigBoi(this.machine, pick);
    img.classList.remove('poked');
    void img.offsetWidth; // restart the wobble
    img.classList.add('poked');
    this.hooks.poke();
    clearTimeout(this.faceTimer);
    this.faceTimer = window.setTimeout(() => {
      this.face = null;
      img.classList.remove('poked');
      if (img.isConnected) img.src = this.hooks.bigBoi(this.machine);
    }, 1100);
  }

  /** Change settings; `rerender` redraws the screen (buttons that show state), keeping focus on the same control. */
  private update(patch: Partial<Settings>, rerender = false) {
    this.hooks.setSettings({ ...this.hooks.settings(), ...patch });
    if (!rerender) return;
    const active = document.activeElement as HTMLElement | null;
    const key = active?.dataset ? ['q', 'calm', 'bind', 'act'].map((k) => active.dataset[k] && `[data-${k}="${active.dataset[k]}"]`).find(Boolean) : undefined;
    this.root.innerHTML = this.render('settings');
    this.bind('settings');
    (key && this.root.querySelector<HTMLElement>(key) || this.focusables()[0])?.focus();
  }

  private detail(id: string) {
    const list = this.hooks.records();
    const r = list.find((x) => x.id === id);
    const box = this.root.querySelector<HTMLElement>('#sbDetail');
    if (!r || !box) return;
    this.picked = id;
    for (const b of this.root.querySelectorAll<HTMLElement>('.sbrow')) b.classList.toggle('on', b.dataset.id === id);
    const t = themeById(r.machine);
    let img = this.thumbs.get(r.id);
    if (!img) { img = this.hooks.thumb(r); this.thumbs.set(r.id, img); }
    const ended = r.result === 'won' ? (r.cleared > FINAL_ROUND ? `Won, then on into endless round ${r.round}` : 'Beat the final boss') : r.result === 'lost' ? `Lost on round ${r.round}` : `Abandoned on round ${r.round}`;
    const decals = r.decals.map((d) => `<span class="tag">${esc(DECALS[d].name)}</span>`).join('');
    box.style.cssText = t ? themeStyle(t) : '';
    box.innerHTML = `<div class="dhead"><span class="rk disp">#${rankOf(list, r.id)}</span><b class="disp">${esc(title(t?.tagline ?? r.machine))}</b><span class="res r-${r.result}">${RESULT_NAMES[r.result]}</span></div>
      <div class="dbody"><img class="thumb" alt="The machine this run ended as" src="${img}">
        <div class="dstats">
          <p>${ended} · ${shortDate(r.started)}${shortDate(r.started) === shortDate(r.ended) ? '' : ` to ${shortDate(r.ended)}`}</p>
          <div class="stats"><span><b>${r.cleared}</b><small>rounds cleared</small></span><span><b>${fmt(r.score)}</b><small>total points</small></span><span><b>${fmt(r.best)}</b><small>best round</small></span><span><b>${r.parts.length}</b><small>parts on the table</small></span></div>
          <div class="lbl">Decals</div><div class="tags">${decals || '<span class="hint">none stuck</span>'}</div>
        </div></div>`;
  }

  private confirm(head: string, text: string, yes: string, onYes: () => void) {
    const wrap = document.createElement('div');
    wrap.className = 'mconfirm';
    wrap.innerHTML = `<div class="card" role="alertdialog" aria-label="${esc(head)}"><h3 class="disp">${esc(head)}</h3><p>${esc(text)}</p><div class="btnrow"><button data-no>Keep it</button><button class="primary disp" data-yes>${esc(yes)}</button></div></div>`;
    const prev = document.activeElement as HTMLElement | null;
    const close = () => { wrap.remove(); this.confirmOpen = null; if (prev?.isConnected) prev.focus(); };
    wrap.querySelector<HTMLButtonElement>('[data-no]')!.onclick = close;
    wrap.querySelector<HTMLButtonElement>('[data-yes]')!.onclick = () => { close(); onYes(); };
    this.root.appendChild(wrap);
    this.confirmOpen = { no: close };
    wrap.querySelector<HTMLButtonElement>('[data-no]')!.focus();
  }

  private back() {
    if (this.screen === 'pause') this.hooks.unpause();
    else if (this.screen === 'settings' && this.from === 'pause') this.show('pause');
    else if (this.screen !== 'main') this.show('main');
  }

  // ---- keyboard ---------------------------------------------------------------------------------------------------

  private focusables(): HTMLElement[] {
    const scope = this.root.querySelector('.mconfirm') ?? this.root;
    return [...scope.querySelectorAll<HTMLElement>('button:not([disabled]), input')].filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  }
  private focusFirst() {
    const f = this.root.querySelector<HTMLElement>('.mbtn.primary, .cab, .sbrow.on, .sbrow') ?? this.focusables()[0];
    f?.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open) return;
    e.stopImmediatePropagation(); // the game never sees a key while a menu is open
    this.hooks.wake();
    if (this.binding) {
      e.preventDefault();
      if (e.code === 'Escape') { this.update({}, true); return; }
      const keys = rebind(this.hooks.settings().keys, this.binding, e.code);
      if (!keys) { this.root.querySelector('#bindMsg')!.textContent = `${keyLabel(e.code)} is taken by the game. Pick another key (Esc to cancel).`; return; }
      const done = this.binding;
      this.binding = null;
      this.update({ keys }, true);
      this.root.querySelector<HTMLElement>(`[data-bind="${done}"]`)?.focus();
      return;
    }
    if (e.code === 'Escape') { e.preventDefault(); if (this.confirmOpen) this.confirmOpen.no(); else this.back(); return; }
    const t = e.target as HTMLElement;
    const along = e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 0;
    if (!along) return;
    if (t instanceof HTMLInputElement && t.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return; // sliders take left and right
    e.preventDefault();
    const list = this.focusables();
    const i = list.indexOf(t);
    const next = list[i < 0 ? 0 : (i + along + list.length) % list.length];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest' });
  }
}
