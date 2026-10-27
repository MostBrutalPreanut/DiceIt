import './style.css';
import './ui/menu.css';
import { callout, type CalloutKey } from './data/callouts';
import { dialValue, footprint, isDecor, isInlay, packTag, PARTS, RITUAL_NAMES, wizardNeed, SHOP_IDS, type PartDef, type PartId, type PartInstance } from './data/parts';
import { BOSS_EVERY, DECAL_IDS, DECAL_SLOTS, DECALS, KIND_NAMES, type DecalId, type DecalPick } from './data/decals';
import { BIG_BOIS, BIG_BOI_FOR, defOn, type MachineId } from './data/bigboi';
import { FINAL_ROUND } from './data/bosses';
import { AudioFx } from './audio';
import { Game, goalFor, parseRun, UPKEEP, type Arrangement, type GameEvent, type Payout, type RunSave } from './game/game';
import type { ScoreEvent } from './game/scoring';
import { Renderer, type DrawState } from './render/renderer';
import type { Mood } from './render/props';
import { FxOverlay } from './render/overlay';
import { FACTORY, roleFill, themeById, THEMES, themeVars, type Theme } from './render/theme';
import { onDecorSlot } from './sim/cabinet';
import { DT, LANE_WALL_X, TABLE_W } from './sim/constants';
import { canPlaceLedge, starterLayout } from './sim/layout';
import { clampLedge, FLIPPER_PIVOTS, LEDGE, ledgeSeg } from './sim/table';
import { Bot } from './sim/bot';
import type { Input, SimEvent } from './sim/sim';
import { bossCard, decalCard, fmt, HUD_TIPS, partCard, rarityChip, roleVar, statsLine } from './ui/html';
import { applyBackdrop, chase, makeBulbs, MultDial, Odometer } from './ui/hud';
import { DecalPicker } from './ui/decalPick';
import { PrizePicker } from './ui/prizePick';
import './ui/decalPick.css';
import { Flyers, setFlyEffects } from './ui/flyers';
import { Menu, type SavedRunInfo } from './ui/menu';
import { keyLabel, loadSettings, saveSettings, type Settings } from './ui/settings';
import { Scoreboard, sourceOfSave, type RunResult } from './ui/scoreboard';
import { Attract } from './attract';
import { around, Tutorial, TUTORIAL_KEY, type Box, type Step } from './ui/tutorial';
import './ui/tutorial.css';
import { discover, LIBRARY_KEY, LIBRARY_PARTS, ownedPartIds, partHint, parseLibrary, partKnown, decalKnown, LIBRARY_DECALS } from './data/library';
import { silhouette } from './ui/silhouette';
import './ui/library.css';
import { countNames, Feedback, TOPICS, type TopicGroup } from './ui/feedback';
import './ui/feedback.css';

/** The developer's tools (the Machine & options drawer, the Test Lab) show only with ?dev in the address. */
const DEV = new URLSearchParams(location.search).has('dev');
/**
 * ?trailer: the game is filmed frame by frame by tools/trailer/record.cjs. The clock stands still between frames (the
 * recorder moves it on), a bot can play, and the sounds are written down with their time instead of played: the
 * recorder renders them offline afterwards.
 */
const TRAILER = new URLSearchParams(location.search).has('trailer');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE = 'pinball-roguelite.run.v2';
const SLOTS = 'pinball-roguelite.slots.v1';
const THEME_KEY = 'pinball-roguelite.theme.v1';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** The three faces have to be loaded before Pixi measures any text. */
async function loadFonts() {
  const faces = ['400 20px "Luckiest Guy"', '500 14px Nunito', '600 14px Nunito', '700 14px Nunito', '800 14px Nunito'];
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
}

async function main() {
  await loadFonts();
  const game = new Game();
  let hasRun = false;
  try {
    const saved = store.get(STORE);
    const run = saved ? parseRun(saved) : null;
    if (run) { game.load(run, themeById(store.get(THEME_KEY))?.id); hasRun = true; }
  } catch { /* storage can be blocked; the game works without it */ }
  // never while the attract table borrows the game, and not once the run has ended
  const persist = () => { if (hasRun && !attract.on) store.set(STORE, JSON.stringify(game.save())); };

  // the machine is picked for each run (it decides the look and what Big Boi does); until the first pick, the Factory stands in behind the picker
  const chosen = hasRun ? themeById(game.machine) : null;
  let theme: Theme = chosen ?? FACTORY;
  let settings = loadSettings(store);
  let calm = settings.calm;

  const renderer = new Renderer(theme);
  await renderer.init($('stage'));
  const overlay = new FxOverlay(theme);
  await overlay.init();
  const audio = new AudioFx();
  /** ?trailer: the clock (ms) the recorder moves on, the bot at the controls, and every sound asked for (at the video's time). */
  const film = { now: performance.now(), video: 0, steps: 0, bot: null as Bot | null, log: null as { t: number; k: string; a: unknown[] }[] | null };
  const clock = () => (TRAILER ? film.now : performance.now());
  if (TRAILER) {
    for (const k of Object.getOwnPropertyNames(AudioFx.prototype)) {
      const d = Object.getOwnPropertyDescriptor(AudioFx.prototype, k);
      if (k === 'constructor' || typeof d?.value !== 'function') continue;
      (audio as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => { film.log?.push({ t: film.video, k, a: JSON.parse(JSON.stringify(a)) }); return k === 'toggleMute' ? false : undefined; };
    }
  }
  /** Points and coins fly from the part to the score and the money stack. */
  const flyers = new Flyers(overlay, renderer, { coinLand: () => audio.coinLand() });
  const odometer = new Odometer($('score'));
  // the demo machine behind the main menu: it plays, it never saves
  const attract = new Attract(game, {
    score: (s) => renderer.onScore(s),
    machine: (id) => { applyTheme(themeById(id) ?? FACTORY); menu.setMachine(id); },
    gameOver: () => say('GAME OVER. INSERT COIN'),
  });
  const dial = new MultDial($('multDial'));

  // ---- the Library: every part and decal this device has found, across runs ------------------------------------
  const library = parseLibrary(store.get(LIBRARY_KEY));
  /** Parts handed out by the Test Lab this session: nothing found there counts. */
  const labUids = new Set<number>();
  /** Note what the live run owns; anything new goes in the Library, and the display says so. */
  function noteFound() {
    if (!hasRun || attract.on) return;
    if (game.sandbox) { for (const p of game.layout.parts) labUids.add(p.uid); return; }
    const fresh = discover(library, ownedPartIds(game.layout.parts.filter((p) => !labUids.has(p.uid))), game.decals);
    const names = [...fresh.parts.map((id) => PARTS[id].name), ...fresh.decals.map((id) => DECALS[id].name)];
    if (!names.length) return;
    store.set(LIBRARY_KEY, JSON.stringify(library));
    say(names.length > 2 ? `${names.length} NEW IN THE LIBRARY` : `NEW IN THE LIBRARY: ${names.join(' AND ')}`);
  }
  /** A Library entry's picture: in the menus' colours, or as its locked silhouette with the hint cut out. */
  const libIcon = (kind: 'part' | 'decal' | 'boi', id: string, locked: boolean, cachedOnly = false) => {
    const key = `lib:${theme.id}:${kind}:${id}:${locked ? 1 : 0}`;
    let url = icons.get(key);
    if (url || cachedOnly) return url ?? '';
    if (kind === 'boi') url = boiURL(id as MachineId, 'happy');
    else if (kind === 'decal') {
      const d = DECALS[id as DecalId], c = renderer.decalIcon(d.look, d.rarity, 96);
      url = (locked ? silhouette(c, renderer.decalArtIcon(d.look, 96), { lines: theme.ink }) : c).toDataURL();
    } else {
      const c = renderer.icon(id as PartId, 96, 96, { theme });
      url = (locked ? silhouette(c, partHint(id as PartId)) : c).toDataURL();
    }
    icons.set(key, url);
    return url;
  };

  // ---- feedback: P anywhere, or the menus' Feedback buttons. Made before anything else listens for keys, so the
  // form gets every key first while it is open.
  const feedback = new Feedback({
    store,
    canOpen: () => !tour.open && !menu.busy && !shopDrag && !carry && !ledgeDrag,
    topics: () => {
      const run = hasRun && !attract.on;
      const mine = run ? [...new Set([...game.layout.parts.map((p) => (p.def === 'mega' ? BIG_BOIS[BIG_BOI_FOR[game.machine]].title : PARTS[p.def].name)), ...game.layout.parts.flatMap((p) => (p.inlay ? [PARTS[p.inlay].name] : []))])].sort() : [];
      const stuck = run ? game.decals.map((d) => DECALS[d.id].name) : [];
      const groups: TopicGroup[] = [{ label: 'The game', options: ['General', ...TOPICS] }];
      if (mine.length) groups.push({ label: 'A part on your machine', options: mine.map((n) => `Part: ${n}`) });
      if (stuck.length) groups.push({ label: 'A decal on your apron', options: stuck.map((n) => `Decal: ${n}`) });
      const found = LIBRARY_PARTS.filter((id) => partKnown(library, id) && !mine.includes(PARTS[id].name)).map((id) => `Part: ${PARTS[id].name}`)
        .concat(LIBRARY_DECALS.filter((id) => decalKnown(library, id) && !stuck.includes(DECALS[id].name)).map((id) => `Decal: ${DECALS[id].name}`));
      if (found.length) groups.push({ label: 'Found in your Library', options: found });
      // the part whose card is open is probably what it is about
      const sel = selected !== null ? game.part(selected) : undefined;
      return { groups, pick: run && sel ? `Part: ${sel.def === 'mega' ? BIG_BOIS[BIG_BOI_FOR[game.machine]].title : PARTS[sel.def].name}` : undefined };
    },
    snapshot: () => {
      const where = menu.open ? (menu.paused ? `paused (${menu.screen})` : `menu (${menu.screen})`) : game.mode === 'workshop' ? 'workshop' : game.mode === 'round' ? 'playing a round' : game.mode;
      if (!hasRun || attract.on) return { where };
      const name = (p: PartInstance) => (p.def === 'mega' ? BIG_BOIS[BIG_BOI_FOR[game.machine]].title : PARTS[p.def].name) + (p.inlay ? ` (${PARTS[p.inlay].name})` : '');
      return {
        where, machine: themeById(game.machine)?.tagline ?? game.machine, round: game.round, money: game.money,
        score: game.mode === 'workshop' ? undefined : Math.round(game.scorer.score), goal: game.scorer.goal, runScore: Math.round(game.runScore),
        parts: countNames(game.placed.map(name)), toolbox: countNames(game.inventory.map(name)), decals: game.decals.map((d) => DECALS[d.id].name).join(', '),
      };
    },
    face: (mood) => boiURL(game.machine ?? theme.id, mood),
    // the game holds still while the form is open (main loop), and no key stays held down behind it
    opened: () => { keys.clear(); $('tip').hidden = true; },
    closed: () => { last = performance.now(); },
  });

  // ---- state shared by input, workshop and HUD ------------------------------------------------
  const keys = new Set<string>();
  let nudgePulse = 0;
  /** An inventory part waiting to be placed: it follows the pointer until you click the table. */
  let armed: number | null = null;
  let selected: number | null = null;
  let hover: number | null = null;
  let hoverDecal: number | null = null;
  let selectedDecal: number | null = null;
  let dragFromInventory = false;
  /** An offer being dragged out of the shop (slot null: the Test Lab catalog), and the angle R has turned it to. */
  let shopDrag: { id: PartId; slot: number | null; x0: number; y0: number; moving: boolean; carry: boolean; el: HTMLElement; angle: number } | null = null;
  /**
   * A part being moved (the Move button on its card): it follows the pointer until the next click sets it down.
   * `depth` is the undo history when it was picked up, so putting it back undoes the move and any turns.
   */
  let carry: { uid: number; moved: boolean; depth: number; fee: number } | null = null;
  /** Where a decal's card points (the click that opened it); a part's card follows the part. */
  let inspectAt: { x: number; y: number } | null = null;
  /** The wall ledge being dragged up or down the left wall: where it would go, and where the grab started. */
  let ledgeDrag: { dy: number; y: number } | null = null;
  let hoverLedge = false;
  let pointer: { x: number; y: number } | null = null;
  /** Where a piece of decor would go under the pointer: into the decor screen at the head of the table, when it is over it. */
  let pointerDecor: { x: number; y: number } | null = null;
  /** Where a part of this type would go under the pointer: on the table, or (decor) into the decor screen. */
  const spotFor = (id: PartId, cx: number, cy: number) => (isDecor(id) ? renderer.toDecor(cx, cy) : renderer.toSim(cx, cy));
  let ledgerTimer = 0;
  let lastMultBand = 1;
  let lastStamp = 0;
  const overlayEl = $('overlay');
  $('stage').appendChild($('upgradeBox')); // the upgrade picker floats over the top of the table
  const drawState: DrawState = { ghost: null, selectedUid: null, hoverUid: null, showHeat: false, hoverDecal: null, ledge: null };

  /** The backbox's dot-matrix display says it: the message scrolls in from the right. */
  const say = (text: string) => renderer.say(text);
  const sayKey = (k: CalloutKey, vars?: Record<string, string | number>) => say(callout(k, vars));
  say('INSERT COIN');

  /** What the recipe sentences need to know: this part type's level and the run's upgrades. */
  const ctxFor = (def: PartDef, inst?: PartInstance) => ({ level: inst ? game.scorer.levelOf(inst) : 0, mods: game.mods, machine: game.machine, types: new Set(game.placed.map((p) => p.def)).size, wizardNeed: wizardNeed(game.layout.parts) });
  /** A part's definition on this run's machine (Big Boi's recipe depends on it). */
  const defFor = (id: PartId) => defOn(id, game.machine);

  // ---- theme: tokens to CSS, the backdrop, the baked icons ----------------------------------------
  const icons = new Map<string, string>();
  const iconURL = (id: PartId | 'ball' | 'button', w = 84, h = 100, t = theme) => {
    const key = `${t.id}:${id}:${w}x${h}`;
    let url = icons.get(key);
    if (!url) { url = renderer.icon(id, w, h, { theme: t }).toDataURL(); icons.set(key, url); }
    return url;
  };

  /** Big Boi pulling a face, in a machine's colours: the main menu's title wears him (he blinks, and minds being poked). */
  const boiURL = (id: MachineId, mood: Mood) => {
    const key = `boi:${id}:${mood}`;
    let url = icons.get(key);
    if (!url) { url = renderer.icon('mega', 150, 120, { theme: themeById(id) ?? FACTORY, st: { mood } }).toDataURL(); icons.set(key, url); }
    return url;
  };

  function applyTheme(t: Theme) {
    theme = t;
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(themeVars(t))) root.setProperty(k, v);
    applyBackdrop(t);
    renderer.setTheme(t);
    overlay.setTheme(t);
    audio.setTheme(t.id);
    dial.build(t);
    for (const cap of ['cashCap', 'startCap']) $(cap).innerHTML = `<img alt="" src="${iconURL('button', 64, 48)}">`;
    ballsKey = '';
    const bb = BIG_BOIS[BIG_BOI_FOR[t.id]];
    $('themeRow').innerHTML = `<div class="machineInfo" style="background:${t.bg};color:${t.ink}"><b>${t.tagline}</b><span>${bb.title}${bb.ability ? `: ${bb.ability}` : ''}</span><span class="hint">The machine is picked for each run. Start a new run to change it.</span></div>`;
    upgradeKey = '';
    refreshWorkshop();
  }
  /** A new run on the chosen machine: its look, and its Big Boi. */
  function pickTheme(id: string) {
    const t = themeById(id);
    if (!t) return;
    store.set(THEME_KEY, t.id);
    attract.stop();
    menu.close();
    overlayEl.hidden = true;
    game.newRun(t.id as MachineId);
    hasRun = true;
    board.startRun();
    armed = selected = null;
    selectedDecal = null;
    applyTheme(t);
    persist();
    afterRunChange();
    const bb = BIG_BOIS[BIG_BOI_FOR[t.id]];
    say(`${t.tagline}. ${bb.title.toUpperCase()}${bb.ability ? `. ${bb.ability.toUpperCase()}` : ''}`);
  }
  function setCalm(on: boolean) {
    calm = on;
    renderer.setCalm(on);
    overlay.calm = on;
    document.body.classList.toggle('calm', on);
  }

  // ---- workshop panels: shop, inventory, selected part ---------------------------------------------
  const tipPlain = (html: string, cx: number, cy: number) => {
    const tip = $('tip');
    tip.className = 'card small';
    tip.innerHTML = `<div class="plain">${html}</div>`;
    tip.hidden = false;
    placeTip(cx, cy);
  };
  /** The fee line under a picked part's buttons. */
  const moveHint = (fee: number, broke: boolean, what: string) =>
    broke ? `${what} costs $${fee} and you have $${game.money}.` : fee ? `${what} costs $${fee}, once a visit: after that it is free until the next round.` : `${what} is free right now.`;
  /** A part's live line: what it did this round; decor says how it stands instead (it is never hit). */
  const liveLine = (inst: PartInstance) => {
    if (PARTS[inst.def].recipe.wizard && inst.placed) {
      const w = game.scorer.wizardState();
      const now = w.left > 0 ? `WIZARD MODE: ${Math.ceil(w.left)} s left` : w.fired ? 'Wizard Mode done this round' : `${w.lit} of ${w.need || wizardNeed(game.layout.parts)} types hit this ball`;
      return `${now}. ${statsLine(game.scorer.ledger.get(inst.uid))}`;
    }
    if (PARTS[inst.def].recipe.capsule) { const c = PARTS[inst.def].recipe.capsule!; return game.capsuleRipe(inst) ? 'Ripe: remove it for a free legendary pick!' : `${inst.age ?? 0} of ${c.rounds} rounds on the table.`; }
    if (!isDecor(inst.def)) return statsLine(game.scorer.ledger.get(inst.uid));
    if (!inst.placed) return 'In the toolbox: put it in the decor screen to use it.';
    const r = PARTS[inst.def].recipe;
    if (r.clock) { const t = game.scorer.label(inst); return t === 'MIDNIGHT' ? 'Midnight Madness: every hit pays double!' : `The clock says ${t}. Midnight comes at ${r.clock.hits} hits.`; }
    if (r.altar) {
      const a = game.scorer.altarOf(inst), now = game.scorer.ritualNow();
      return now ? `${RITUAL_NAMES[now.kind]} under way: ${Math.ceil(now.left)} s left.` : `${a.sets} of ${r.altar.sets} sets towards the next ritual: a ${RITUAL_NAMES[a.next]} (strength ${a.strength + 1}).`;
    }
    return 'Working: it is in the decor screen.';
  };
  const tipPart = (def: PartDef, inst: PartInstance | undefined, cx: number, cy: number, live: boolean) => {
    const tip = $('tip');
    tip.className = 'card tipcard';
    tip.style.setProperty('--head', roleVar(def.id));
    const row = inst ? game.scorer.ledger.get(inst.uid) : undefined;
    tip.innerHTML = partCard(def, inst, { ...ctxFor(def, inst), scorer: live ? game.scorer : undefined, mult: game.scorer.mult }, {
      stats: live && inst ? liveLine(inst) : live ? statsLine(row) : undefined,
      keys: inst?.fixed ? 'part of every machine: it stays where it is' : live ? (game.editable ? `click it to move, store or sell it${inst && game.moveFee(inst) ? ` · moving costs $${game.moveFee(inst)}` : ''}` : 'in the workshop: click it to move, store or sell it') : isDecor(def.id) ? (inst ? 'click it, then the decor screen' : 'drag it into the decor screen, or Buy to put it in the toolbox') : inst ? 'click it, then the table · R turns it' : 'drag it onto the table (R turns it), or Buy to put it in the toolbox',
    });
    tip.hidden = false;
    placeTip(cx, cy);
  };

  function offerHtml(id: PartId, price: number | null, index: number | null) {
    const def = PARTS[id];
    const locked = index !== null && game.isLocked(index);
    const btn = index === null
      ? `<button class="buy" data-add="${id}">Add</button>`
      : `${price! < def.cost ? `<s>$${def.cost}</s>` : ''}<button class="buy" data-buy="${index}" ${game.canAfford(price!) && game.editable && game.hasRoomFor(id) ? '' : 'disabled'}>$${price}</button>`;
    const lock = index === null ? '' : `<button class="lock ${locked ? 'on' : ''}" data-lock="${index}" title="${locked ? 'Locked: it stays for the next round. Click to unlock' : 'Lock it: it stays for the next round (and through rerolls)'}">${locked ? 'LOCKED' : 'LOCK'}</button>`;
    return `<div class="offer r-${def.rarity} ${locked ? 'locked' : ''}" data-id="${id}"${index === null ? '' : ` data-slot="${index}"`}><div class="plinth" style="background:var(--role-${id}-tint)"><img alt="" src="${iconURL(id, 64, 64)}">${rarityChip(def.rarity)}${packTag(def) ? `<span class="pack" title="One offer: a pack of ${def.pack}">${packTag(def)}</span>` : ''}</div>
      <div class="name">${def.name}</div><div class="buyrow">${btn}</div>${lock}<div class="blurb">${def.blurb}${def.tags.includes('long') && !game.tableRoomFor(id) ? '<span class="room">Needs room: move or scrap a part first.</span>' : ''}</div></div>`;
  }

  /**
   * A burst Piñata or a dug-up Time Capsule: three parts to take one of, free, as a pop-up (src/ui/prizePick.ts).
   * Put away with Later, the prize waits behind a button at the top of the shop.
   */
  function renderPrize() {
    prizePicker.update();
    const box = $('prize');
    box.hidden = !prizePicker.waiting;
    if (box.hidden) return;
    const capsule = game.shop.prizeFrom === 'capsule';
    box.innerHTML = `<button class="prizeChip" id="btnPrize"><img alt="" src="${iconURL(capsule ? 'capsule' : 'pinata', 48, 48)}"><span><b class="disp">${capsule ? 'Capsule prize' : 'Piñata prize'}</b><small>Take one part, free</small></span><span class="go disp">Open</span></button>`;
    ($('btnPrize') as HTMLButtonElement).onclick = () => { audio.unlock(); prizePicker.reopen(); renderPrize(); };
  }

  /** Test Lab: every part in the game, free, instead of 4 rotating offers. */
  function renderCatalog() {
    $('shopMoney').textContent = '$∞';
    ($('btnReroll') as HTMLButtonElement).hidden = true;
    const box = $('offers');
    box.className = 'catalog';
    box.innerHTML = SHOP_IDS.map((id) => offerHtml(id, null, null)).join('');
    bindOfferTips(box);
    for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-add]')) {
      b.onclick = () => {
        audio.unlock();
        const part = game.grant(b.dataset.add as PartId);
        if (!part) return;
        armed = part.uid;
        selected = part.uid;
        audio.place();
        sayKey('buy');
        persist();
        refreshWorkshop();
      };
    }
  }
  function bindOfferTips(box: HTMLElement) {
    box.querySelectorAll<HTMLElement>('.offer[data-id]').forEach((el) => {
      const def = PARTS[el.dataset.id as PartId];
      el.onmouseenter = (e) => { if (!shopDrag) tipPart(def, undefined, e.clientX, e.clientY, false); };
      el.onmousemove = (e) => { if (!shopDrag) placeTip(e.clientX, e.clientY); };
      el.onmouseleave = () => { $('tip').hidden = true; };
      el.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('button') || !game.editable || e.button !== 0) return;
        const slot = el.dataset.slot === undefined ? null : Number(el.dataset.slot);
        if (slot !== null && !game.canAfford(game.priceAt(slot))) { sayKey('broke'); return; }
        audio.unlock();
        e.preventDefault();
        if (shopDrag?.carry) return; // the capture handler deals with a click while something is in hand
        shopDrag = { id: def.id, slot, x0: e.clientX, y0: e.clientY, moving: false, carry: false, el, angle: 0 };
      });
    });
  }

  let lastStock: unknown = null;
  function renderShop() {
    $('shopBox').classList.toggle('locked', !game.editable);
    if (game.sandbox) { renderCatalog(); return; }
    $('offers').className = '';
    const rb = $('btnReroll') as HTMLButtonElement;
    rb.hidden = false;
    rb.textContent = game.rerollCost ? `REROLL $${game.rerollCost}` : 'REROLL';
    rb.disabled = !game.canAfford(game.rerollCost) || !game.editable;
    $('offers').innerHTML = game.shop.offers.map((id, i) => (id ? offerHtml(id, game.priceAt(i), i) : `<div class="offer sold">Sold</div>`)).join('');
    renderPrize();
    for (const b of $('offers').querySelectorAll<HTMLButtonElement>('button[data-lock]')) {
      b.onclick = (e) => {
        e.stopPropagation();
        const slot = Number(b.dataset.lock);
        if (game.toggleLock(slot)) { audio.place(); say(game.isLocked(slot) ? 'LOCKED. IT WAITS FOR YOU' : 'UNLOCKED'); persist(); }
        else say(`YOU CAN LOCK ${game.lockSlots}. UNLOCK ONE FIRST`);
        renderShop();
      };
    }
    // fresh stock (a new round, a reroll, a new run) rolls down onto the shelf one card at a time, with a tick each
    if (game.shop.offers !== lastStock && game.editable) {
      lastStock = game.shop.offers;
      $('offers').querySelectorAll<HTMLElement>('.offer').forEach((el, i) => {
        el.classList.add('roll');
        el.style.animationDelay = `${i * 0.09}s`;
        el.addEventListener('animationend', () => el.classList.remove('roll'), { once: true });
        setTimeout(() => audio.shopRoll(i), i * 90);
      });
    }
    bindOfferTips($('offers'));
    for (const b of $('offers').querySelectorAll<HTMLButtonElement>('button[data-buy]')) {
      b.onclick = () => {
        audio.unlock();
        const part = game.buy(Number(b.dataset.buy));
        if (!part) { sayKey('broke'); return; }
        armed = part.uid;
        selected = part.uid;
        audio.buy();
        sayKey('buy');
        persist();
        refreshWorkshop();
      };
    }
  }

  function renderInventory() {
    const inv = game.inventory;
    const cells = inv.map((p) => `<div class="item ${armed === p.uid ? 'armed' : ''} ${selected === p.uid ? 'sel' : ''}" data-uid="${p.uid}"><img alt="${PARTS[p.def].name}" src="${iconURL(p.def, 64, 64)}">${p.fresh ? '<span class="new">NEW</span>' : ''}</div>`);
    const slots = Math.max(game.toolboxSlots, Math.ceil(inv.length / 4) * 4); // the Test Lab has no limit
    $('inventory').innerHTML = cells.join('') + '<div class="item empty"></div>'.repeat(slots - inv.length);
    // a part picked up from the toolbox can be sold right there: the latch becomes a Sell button with its price
    const held = selected !== null ? inv.find((p) => p.uid === selected) : undefined;
    const sell = $('toolSell') as HTMLButtonElement;
    sell.hidden = !held || !game.editable;
    $('inventoryBox').classList.toggle('selling', !sell.hidden);
    if (held) {
      sell.textContent = removeLabel(held).toUpperCase();
      sell.onclick = () => removePart(held);
    }
    for (const el of $('inventory').querySelectorAll<HTMLElement>('.item[data-uid]')) {
      const part = game.part(Number(el.dataset.uid))!;
      el.onmouseenter = (e) => tipPart(PARTS[part.def], part, e.clientX, e.clientY, false);
      el.onmouseleave = () => { $('tip').hidden = true; };
      el.addEventListener('pointerdown', (e) => {
        audio.unlock();
        e.preventDefault();
        $('tip').hidden = true;
        const uid = Number(el.dataset.uid);
        armed = armed === uid && !dragFromInventory ? null : uid;
        if (armed !== null) audio.pickUp();
        selected = uid;
        selectedDecal = null;
        dragFromInventory = armed !== null;
        refreshWorkshop();
      });
    }
  }

  /**
   * The picked part's card, pinned next to it on the table: what it pays, its dial, and what you can do with it
   * (Move and To toolbox say what they cost). A decal clicked on the apron gets the same card, with Peel.
   */
  function renderInspect() {
    const card = $('inspect');
    const inst = selected !== null && !carry ? game.part(selected) : undefined;
    const decal = selectedDecal !== null ? game.decals[selectedDecal] : undefined;
    const part = inst?.placed ? inst : undefined;
    card.hidden = !game.editable || (!part && !decal);
    if (card.hidden) return;
    if (decal) {
      card.className = 'card tipcard inspect';
      card.style.removeProperty('--head');
      card.innerHTML = `<button class="ix" aria-label="Close">×</button>${decalCard(decal, null)}<div class="btnrow acts"><button id="btnPeel">Peel it off</button></div>`;
      $('btnPeel').onclick = () => {
        const name = DECALS[decal.id].name.toUpperCase();
        if (game.peel(selectedDecal!)) { selectedDecal = null; audio.remove(); say(`${name} PEELED. GONE FOR GOOD`); persist(); afterHistory(); }
      };
    } else if (part) {
      const def = defFor(part.def);
      const fee = game.moveFee(part), broke = fee > game.money, scrap = -game.removeValue(part) > game.money;
      const price = `<span class="fee ${fee ? '' : 'free'}">${fee ? `$${fee}` : 'free'}</span>`;
      card.className = 'card tipcard inspect';
      card.style.setProperty('--head', roleVar(def.id));
      card.innerHTML = `<button class="ix" aria-label="Close">×</button>${partCard(def, part, { ...ctxFor(def, part), scorer: game.scorer, mult: game.scorer.mult }, { recipe: false, compact: true })}
        ${def.dials.map((d) => `<div class="dial"><div class="row2"><span>${d.label}</span><b id="dv-${d.id}">${d.fmt ? d.fmt(dialValue(part, d.id)) : dialValue(part, d.id)}</b></div>
          <input data-dial="${d.id}" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${dialValue(part, d.id)}" /><div class="hint">${d.tradeoff}</div></div>`).join('')}
        <div class="stats" id="selLive">${liveLine(part)}</div>
        ${def.recipe.well ? `<div class="btnrow"><button id="btnWish" ${game.wishesLeft(part) > 0 && game.money >= 1 ? '' : 'disabled'} title="Every $1 in it: +${def.recipe.well.points} to its hits and +${def.recipe.well.mult} Mult a hit, for the rest of the run">Throw in $1 (${game.wishesLeft(part)} left this visit)</button></div>` : ''}
        ${part.fixed ? '<div class="hint">Part of every machine: it stays where it is.</div>' : `<div class="btnrow acts">
          ${isDecor(def.id) ? '' : `<button id="btnMove" ${broke ? 'disabled' : ''} title="Pick it up and click the table to set it down${def.rotatable ? ' (R or the wheel turns it)' : ''}">Move ${price}</button>`}
          <button id="btnStore" ${broke ? 'disabled' : ''}>To toolbox ${price}</button>
          <button id="btnSell" class="sell" ${scrap ? 'disabled' : ''}>${removeLabel(part)}</button>
        </div>
        <div class="hint feehint">${moveHint(fee, broke, isDecor(def.id) ? 'Taking it out' : 'Moving it')}</div>`}`;
      for (const input of card.querySelectorAll<HTMLInputElement>('input[data-dial]')) {
        for (const ev of ['pointerdown', 'keydown'] as const) input.addEventListener(ev, () => game.checkpoint());
        input.oninput = () => {
          const d = def.dials.find((x) => x.id === input.dataset.dial)!;
          game.setDial(part.uid, d.id, Number(input.value));
          $(`dv-${d.id}`).textContent = d.fmt ? d.fmt(Number(input.value)) : input.value;
          // what it pays follows the dial
          const now = card.querySelector('.now'), math = card.querySelector('.math');
          const fresh = partCard(def, part, { ...ctxFor(def, part), scorer: game.scorer, mult: game.scorer.mult }, { recipe: false, compact: true });
          const pick = (cls: string) => fresh.match(new RegExp(`<div class="${cls}[^"]*">([\\s\\S]*?)</div>`))?.[1];
          if (now) now.innerHTML = pick('now') ?? now.innerHTML;
          if (math) math.innerHTML = pick('math') ?? math.innerHTML;
          persist();
        };
      }
      const wishBtn = card.querySelector<HTMLButtonElement>('#btnWish');
      if (wishBtn) wishBtn.onclick = () => { if (game.wish(part.uid)) { audio.coinLand(); say('MAKE A WISH'); persist(); refreshWorkshop(); } };
      if (!part.fixed) {
        // decor has one place to be (the decor screen), so it has no Move: only out to the toolbox, or away
        const move = card.querySelector<HTMLButtonElement>('#btnMove');
        if (move) move.onclick = () => startMove(part.uid);
        $('btnStore').onclick = () => storeSelected();
        $('btnSell').onclick = () => removePart(part);
      }
    }
    card.querySelector<HTMLButtonElement>('.ix')!.onclick = () => { selected = null; selectedDecal = null; refreshWorkshop(); };
    placeInspect(true);
  }

  /** Keep the card beside its part (to the right, or the left at the edge), on screen. */
  let inspectPos = '';
  function placeInspect(force = false) {
    const card = $('inspect');
    if (card.hidden) return;
    const inst = selected !== null ? game.part(selected) : undefined;
    let ax: number, ay: number, gap: number;
    if (inst?.placed && selectedDecal === null) {
      const c = renderer.toClient(inst.x, inst.y, 0.5), e = renderer.toClient(inst.x + footprint(PARTS[inst.def]), inst.y, 0.5);
      ax = c.x; ay = c.y; gap = Math.abs(e.x - c.x) + 16;
    } else if (inspectAt) { ax = inspectAt.x; ay = inspectAt.y; gap = 28; } else return;
    const w = card.offsetWidth, h = card.offsetHeight;
    let left = ax + gap;
    if (left + w > innerWidth - 8) left = ax - gap - w;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    const top = Math.max(8, Math.min(ay - h * 0.3, innerHeight - h - 8));
    const key = `${Math.round(left)}|${Math.round(top)}`;
    if (key === inspectPos && !force) return;
    inspectPos = key;
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  /** Move: the part comes off its spot and follows the pointer; the next click on the table sets it down. */
  function startMove(uid: number) {
    const inst = game.part(uid);
    if (!inst || inst.fixed || !inst.placed || !game.editable) return;
    const fee = game.moveFee(inst);
    if (fee > game.money) { say(`MOVING IT COSTS $${fee}`); return; }
    carry = { uid, moved: false, depth: game.historyDepth, fee };
    selected = uid;
    selectedDecal = null;
    $('tip').hidden = true;
    audio.pickUp();
    say(fee ? `MOVING IT COSTS $${fee}. CLICK TO SET IT DOWN` : 'CLICK TO SET IT DOWN');
    refreshWorkshop();
  }
  /** Set the carried part down where it is. */
  function putDown() {
    if (!carry) return;
    const paid = carry.moved ? carry.fee : 0;
    carry = null;
    audio.place();
    if (paid) say(`MOVED FOR $${paid}`);
    persist();
    refreshWorkshop();
  }
  /** Put the carried part back where it was picked up (and undo any turns): nothing is paid. */
  function dropCarry() {
    if (!carry) return;
    const depth = carry.depth;
    carry = null;
    while (game.historyDepth > depth && game.undo()) { /* back to where it was */ }
    persist();
  }

  /** The remove button: a part bought this visit goes back for what it cost; any other costs the scrap fee. */
  function removeLabel(inst: PartInstance) {
    const v = game.removeValue(inst);
    return v > 0 ? `Return +$${v}` : v < 0 ? `Scrap −$${-v}` : 'Remove';
  }

  function removePart(inst: PartInstance) {
    const value = game.sell(inst.uid);
    if (value === null) { say(`SCRAPPING IT COSTS $${-game.removeValue(inst)}`); return; }
    selected = armed = null;
    audio.remove();
    say(value > 0 ? `RETURNED FOR $${value}` : value < 0 ? `SCRAPPED FOR $${-value}. NO REFUNDS ON FEELINGS` : 'REMOVED');
    persist();
    refreshWorkshop();
  }

  function storeSelected() {
    if (selected == null || !game.editable) return;
    const inst = game.part(selected);
    if (inst?.placed && game.moveFee(inst) > game.money) { say(`MOVING IT COSTS $${game.moveFee(inst)}`); return; }
    const sold = game.store(selected);
    if (sold !== null) selected = null;
    audio.remove();
    if (sold === null) sayKey('store');
    persist();
    refreshWorkshop();
  }
  /** Anything the full toolbox had to sell (a store, an upgrade's free part, a layout slot) gets said out loud. */
  function reportSold() {
    if (!game.soldOverflow.length) return;
    const total = game.soldOverflow.reduce((a, s) => a + s.refund, 0);
    const names = game.soldOverflow.map((s) => PARTS[s.def].name.toUpperCase()).join(', ');
    say(`TOOLBOX FULL. SOLD ${names} FOR $${total}`);
    game.soldOverflow = [];
  }

  // ---- the decal selection screen after a boss, and the boss panel on the scoreboard ----------------
  let upgradeKey = '';
  /** The reveal after a boss: BOSS BEATEN, three sticker cards, and the pick flies onto the apron (src/ui/decalPick.ts). */
  const picker = new DecalPicker($('upgradeBox'), { game, renderer, audio, say, changed: () => afterHistory() });
  function renderUpgrades() {
    picker.update();
  }
  const prizeRoot = Object.assign(document.createElement('div'), { id: 'prizeBox' });
  const prizePicker = new PrizePicker(prizeRoot, {
    game, audio, say, icon: (id, size) => iconURL(id, size, size),
    taken: (part) => { armed = part.uid; selected = part.uid; afterHistory(); },
    changed: () => renderPrize(),
  });

  let bossKey = '';
  /** The next boss, named on the scoreboard: you see it coming and can build for it. */
  function renderBoss() {
    const { round, boss } = game.nextBoss;
    const now = round === game.round;
    const key = `${round}|${boss.id}|${now}`;
    if (key === bossKey) return;
    bossKey = key;
    const box = $('bossBox');
    box.classList.toggle('now', now);
    box.classList.toggle('final', boss.final);
    box.innerHTML = `<div class="lbl">${now ? (boss.final ? 'Final boss: this round' : 'Boss: this round') : `${boss.final ? 'Final boss' : 'Next boss'}: round ${round}`}</div><b class="disp">${boss.name}</b><span>${boss.text}</span>`;
    box.onmouseenter = (e) => { const tip = $('tip'); tip.className = 'card tipcard'; tip.innerHTML = bossCard(boss, round, now); tip.hidden = false; placeTip(e.clientX, e.clientY); };
    box.onmousemove = (e) => placeTip(e.clientX, e.clientY);
    box.onmouseleave = () => { $('tip').hidden = true; };
  }

  function refreshWorkshop() {
    reportSold();
    noteFound();
    if (carry && !game.part(carry.uid)?.placed) carry = null; // the part in hand was stored, sold or undone away
    if (selectedDecal !== null && !game.decals[selectedDecal]) selectedDecal = null;
    renderUpgrades();
    renderBoss();
    renderShop();
    renderInventory();
    renderInspect();
    updateStepper(); // the Play Round button follows a pick or a skip at once, not on the next frame
  }

  // ---- buying: drag an offer, or click it to pick it up, then drop it on the table (it lands on the board) or on
  // the toolbox. Nothing is paid until it is dropped; a right-click or Esc puts it back. Buy still goes to the toolbox.
  const dropShop = (d: NonNullable<typeof shopDrag>, cx: number, cy: number): boolean => {
    const over = document.elementFromPoint(cx, cy);
    let part: PartInstance | null = null;
    if (over === canvas) {
      const p = spotFor(d.id, cx, cy);
      part = d.slot === null ? game.grantAndPlace(d.id, p.x, p.y, d.angle) : game.buyAndPlace(d.slot, p.x, p.y, d.angle);
      if (part) { selected = part.uid; if (d.slot !== null) audio.buy(); audio.place(); sayKey('place'); placedTip(part.uid); } else { say(isInlay(d.id) ? 'DROP IT ON A PART IT FITS' : isDecor(d.id) ? (game.decor.length ? 'ONE DECOR AT A TIME: STORE THE OTHER FIRST' : 'DECOR GOES IN THE SCREEN UP TOP') : 'NO ROOM THERE'); return false; }
    } else if (over?.closest('#inventoryBox')) {
      part = d.slot === null ? game.grant(d.id, d.angle) : game.buy(d.slot, d.angle);
      if (part) { selected = part.uid; audio.buy(); sayKey('buy'); } else { say(d.slot !== null && !game.hasRoomFor(d.id) ? 'TOOLBOX FULL. DROP IT ON THE TABLE' : 'CANNOT AFFORD IT'); return false; }
    } else return false;
    persist();
    return true;
  };
  /**
   * Where a pack carried from the shop would spread if it were dropped here: the spots of the other pieces on the
   * table and how many go to the toolbox; null if some piece fits nowhere (the drop would be refused). Worked out
   * again only when the spot or the machine changes.
   */
  let spreadKey = '', spreadAt: { table: { x: number; y: number }[]; toolbox: number } | null | undefined;
  function packPreview(d: NonNullable<typeof shopDrag>, at: { x: number; y: number }) {
    if (d.slot === null || (PARTS[d.id].pack ?? 1) < 2 || !game.canDropAt(d.id, at.x, at.y)) return undefined;
    const key = `${d.id}|${at.x.toFixed(2)}|${at.y.toFixed(2)}|${game.historyDepth}|${game.inventory.length}`;
    if (key !== spreadKey) {
      spreadKey = key;
      const spots = game.packSpots(d.id, at.x, at.y);
      spreadAt = spots && { table: spots.slice(1).filter((s): s is { x: number; y: number } => !!s), toolbox: spots.filter((s) => !s).length };
    }
    return spreadAt;
  }
  const endShop = () => {
    if (!shopDrag) return;
    shopDrag.el.classList.remove('dragging');
    shopDrag = null;
    $('inventoryBox').classList.remove('drop');
    refreshWorkshop();
  };
  addEventListener('pointermove', (e) => {
    if (!shopDrag) return;
    if (!shopDrag.moving && !shopDrag.carry && Math.hypot(e.clientX - shopDrag.x0, e.clientY - shopDrag.y0) > 6) {
      shopDrag.moving = true;
      shopDrag.el.classList.add('dragging');
      $('tip').hidden = true;
      armed = null;
      audio.pickUp();
    }
    if (!shopDrag.moving && !shopDrag.carry) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    pointer = over === canvas ? renderer.toSim(e.clientX, e.clientY) : null;
    pointerDecor = over === canvas ? renderer.toDecor(e.clientX, e.clientY) : null;
    $('inventoryBox').classList.toggle('drop', !!over?.closest('#inventoryBox'));
  });
  addEventListener('pointerup', (e) => {
    const d = shopDrag;
    if (!d || e.button !== 0) return;
    if (d.moving) { dropShop(d, e.clientX, e.clientY); endShop(); return; }
    if (!d.carry) { // a click: it stays in hand until it is dropped or put back
      d.carry = true;
      d.el.classList.add('dragging');
      $('tip').hidden = true;
      armed = null;
      audio.pickUp();
    }
  });
  // while an offer is in hand, the next click drops it (or a right-click puts it back)
  addEventListener('pointerdown', (e) => {
    const d = shopDrag;
    if (!d?.carry) return;
    if ((e.target as HTMLElement).closest('.offer') === d.el && e.button === 0) { endShop(); e.stopPropagation(); return; }
    if (e.button !== 0) { endShop(); e.stopPropagation(); return; }
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (over === canvas || over?.closest('#inventoryBox')) {
      e.stopPropagation();
      e.preventDefault();
      if (dropShop(d, e.clientX, e.clientY)) endShop();
      return;
    }
    if (!(e.target as HTMLElement).closest('.offer')) endShop();
  }, true);
  addEventListener('contextmenu', (e) => {
    if (shopDrag || carry || armed !== null) { e.preventDefault(); cancelHold(); }
  });
  /** Right-click or Esc: whatever is in hand goes back where it came from. */
  function cancelHold() {
    if (shopDrag) { endShop(); audio.remove(); }
    if (carry) { dropCarry(); audio.remove(); }
    armed = null;
    refreshWorkshop();
  }

  // ---- pointer: place, select, drag, store -------------------------------------------------------
  const canvas = renderer.app.canvas;
  const hitPart = (x: number, y: number, parts = game.placed) => {
    let best: PartInstance | undefined, bd = 1e9;
    for (const p of parts) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= footprint(PARTS[p.def]) + 0.3 && d < bd) { best = p; bd = d; }
    }
    return best;
  };
  /** The part under the pointer: one on the table, else the decor in the decor screen. */
  const hitAt = (cx: number, cy: number) => {
    const p = renderer.toSim(cx, cy);
    return hitPart(p.x, p.y) ?? (onDecorSlot(p.x, p.y) ? game.decor[0] : undefined);
  };

  /** Is a sim point on the wall ledge? (Its handle is a little fatter than the rail.) */
  const onLedge = (x: number, y: number) => {
    const s = ledgeSeg(game.layout.ledge);
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, u = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (s.x1 + u * dx), y - (s.y1 + u * dy)) < 0.9;
  };

  // a part on the table is picked with a click (its card opens beside it); it only moves with the card's Move button
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (!game.editable || e.button !== 0) return;
    const p = renderer.toSim(e.clientX, e.clientY);
    pointer = p;
    pointerDecor = renderer.toDecor(e.clientX, e.clientY);
    if (carry) { putDown(); return; } // a part being moved: this click sets it down where it is
    if (armed === null && !hitAt(e.clientX, e.clientY) && onLedge(p.x, p.y)) {
      const y = game.layout.ledge ?? LEDGE.default;
      ledgeDrag = { dy: y - p.y, y };
      canvas.setPointerCapture(e.pointerId);
      audio.pickUp();
      return;
    }
    if (armed !== null) {
      const a = spotFor(game.part(armed)?.def ?? 'pop', e.clientX, e.clientY);
      if (game.place(armed, a.x, a.y, true)) {
        selected = game.part(armed) ? armed : game.lastInlaid; // a gem went into a part: select the part
        armed = null;
        audio.place();
        sayKey('place');
        persist();
        if (selected !== null) placedTip(selected);
      } else if (isInlay(game.part(armed)?.def ?? 'pop')) say('DROP IT ON A PART IT FITS');
    } else {
      const hit = hitAt(e.clientX, e.clientY);
      const decal = renderer.decalAt(e.clientX, e.clientY);
      if (hit) {
        selected = selected === hit.uid ? null : hit.uid; // a second click closes its card
        selectedDecal = null;
        $('tip').hidden = true;
      } else if (decal !== null && game.decals[decal]) {
        selectedDecal = selectedDecal === decal ? null : decal;
        inspectAt = { x: e.clientX, y: e.clientY };
        selected = null;
        $('tip').hidden = true;
      } else { selected = null; selectedDecal = null; }
    }
    refreshWorkshop();
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = renderer.toSim(e.clientX, e.clientY);
    pointerDecor = renderer.toDecor(e.clientX, e.clientY);
    hover = hitAt(e.clientX, e.clientY)?.uid ?? null;
    hoverLedge = hover === null && game.editable && (ledgeDrag !== null || onLedge(pointer.x, pointer.y));
    if (ledgeDrag) ledgeDrag.y = clampLedge(pointer.y + ledgeDrag.dy);
    hoverDecal = hover === null ? renderer.decalAt(e.clientX, e.clientY) : null;
    if (carry && game.editable) {
      const q = isDecor(game.part(carry.uid)?.def ?? 'pop') ? pointerDecor! : pointer;
      if (game.place(carry.uid, q.x, q.y, !carry.moved)) carry.moved = true;
    }
    showTip(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', () => {
    if (!ledgeDrag) return;
    const y = ledgeDrag.y;
    ledgeDrag = null;
    if (y !== (game.layout.ledge ?? LEDGE.default)) {
      if (game.moveLedge(y)) { audio.place(); say('LEDGE MOVED. THE BALL WILL NOTICE'); persist(); } else say('NO ROOM THERE');
    }
    refreshWorkshop();
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = null; pointerDecor = null; hover = null; hoverDecal = null; hoverLedge = false; $('tip').hidden = true;
    // a part being moved goes back to its spot when the pointer leaves the table
    if (carry) { dropCarry(); refreshWorkshop(); }
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  canvas.addEventListener('wheel', (e) => {
    if (!game.editable || !(shopDrag?.moving || shopDrag?.carry || armed !== null || carry || selected !== null)) return;
    e.preventDefault();
    turn(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  /** R or the wheel: turn whatever is in hand (an offer, a toolbox part, a part being moved), or the picked part, by 15°. */
  function turn(dir: number) {
    if (!game.editable) return;
    const step = dir * (Math.PI / 12);
    if (shopDrag && (shopDrag.moving || shopDrag.carry)) {
      if (PARTS[shopDrag.id].rotatable) { const TAU = Math.PI * 2; shopDrag.angle = (((shopDrag.angle + step) % TAU) + TAU) % TAU; }
      return;
    }
    const uid = armed ?? carry?.uid ?? selected;
    if (uid == null) return;
    game.rotate(uid, step);
    if (!carry) persist();
  }
  // dragging an inventory part onto the table: release over the canvas to place it
  addEventListener('pointerup', (e) => {
    if (!dragFromInventory || armed === null) { dragFromInventory = false; return; }
    dragFromInventory = false;
    if (e.target === canvas) {
      const p = spotFor(game.part(armed)?.def ?? 'pop', e.clientX, e.clientY);
      if (game.place(armed, p.x, p.y, true)) {
        selected = game.part(armed) ? armed : game.lastInlaid;
        armed = null;
        audio.place();
        sayKey('place');
        persist();
        refreshWorkshop();
        if (selected !== null) placedTip(selected);
      } else if (isInlay(game.part(armed)?.def ?? 'pop')) say('DROP IT ON A PART IT FITS');
    }
  });

  function placeTip(cx: number, cy: number) {
    const tip = $('tip');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    // to the right of the pointer, so the card never covers what it describes; flip left at the edge
    const left = cx + 24 + w < innerWidth - 8 ? cx + 24 : cx - 24 - w;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, Math.min(cy - 40, innerHeight - h - 8))}px`;
  }

  function showTip(cx: number, cy: number) {
    if (shopDrag?.moving || shopDrag?.carry || carry) { $('tip').hidden = true; return; }
    const inst = hover != null ? game.part(hover) : undefined;
    // the picked part already has its card open beside it
    if (inst && !(inst.uid === selected && !$('inspect').hidden)) { tipPart(defFor(inst.def), inst, cx, cy, true); return; }
    const d = hoverDecal !== null && hoverDecal !== selectedDecal ? game.decals[hoverDecal] : undefined;
    if (d) {
      const tip = $('tip');
      tip.className = 'card tipcard';
      tip.innerHTML = decalCard(d, game.editable);
      tip.hidden = false;
      placeTip(cx, cy);
      return;
    }
    if (hoverLedge) {
      tipPlain('<b>Wall ledge</b>: a ball sliding down the left wall rolls back into the field off it, so where it sits decides where those balls land. Every run puts it somewhere new; drag it up or down the wall to move it (free).', cx, cy);
      return;
    }
    if (hoverDecal !== null && !d && game.decals.length < DECAL_SLOTS && !game.decals[hoverDecal]) {
      tipPlain('<b>Empty decal slot</b>: beat a boss and pick one of three decals, and it sticks here. One per boss: four by the final boss.', cx, cy);
      return;
    }
    $('tip').hidden = true;
  }
  // the scoreboard's numbers explain themselves too
  for (const el of document.querySelectorAll<HTMLElement>('[data-tip]')) {
    el.addEventListener('mouseenter', (e) => tipPlain(HUD_TIPS[el.dataset.tip!] ?? '', e.clientX, e.clientY));
    el.addEventListener('mousemove', (e) => placeTip(e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => { $('tip').hidden = true; });
  }

  // ---- keyboard ---------------------------------------------------------------------------------------
  const GAME_KEYS = new Set(['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter']);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
    audio.unlock();
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
      e.preventDefault();
      if (e.code === 'KeyY' || e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if (GAME_KEYS.has(e.code) || Object.values(settings.keys).includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyZ') nudgePulse = -1;
    if (e.code === 'KeyX') nudgePulse = 1;
    if (e.code === 'Tab') game.cashOut();
    if (e.code === 'Enter' && game.canStart && overlayEl.hidden) startRound();
    else if (e.code === 'Enter' && !overlayEl.hidden) { if (clearReveal) clearReveal(); else overlayEl.querySelector<HTMLButtonElement>('#btnNext, #btnEndless, #btnAgain')?.click(); }
    if (e.code === 'KeyM') say(audio.toggleMute() ? 'SOUND OFF. THE SILENCE IS LOUD' : 'SOUND ON');
    if (e.code === settings.keys.launch && game.mode === 'workshop' && game.sim.ballCount === 0) { game.testBall(); sayKey('start'); }
    if (e.code === 'KeyR' && game.editable) turn(e.shiftKey ? -1 : 1);
    if ((e.code === 'Delete' || e.code === 'Backspace') && game.editable && !carry) storeSelected();
    if (e.code === 'Escape') {
      if (shopDrag || carry || armed !== null) cancelHold();
      else if (game.editable && (selected !== null || selectedDecal !== null)) { selected = null; selectedDecal = null; refreshWorkshop(); } // Esc closes the card first
      else openPause();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });
  document.addEventListener('click', (e) => { if (e.target instanceof HTMLButtonElement) e.target.blur(); });

  // on-screen controls for touch devices send the same key events the keyboard does
  const TOUCH: Record<string, keyof Settings['keys']> = { ArrowLeft: 'left', Space: 'launch', ArrowRight: 'right' };
  for (const b of document.querySelectorAll<HTMLButtonElement>('#touch button')) {
    const act = TOUCH[b.dataset.key!];
    const fire = (type: 'keydown' | 'keyup') => dispatchEvent(new KeyboardEvent(type, { code: settings.keys[act] }));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); fire('keydown'); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(t, () => fire('keyup'));
  }

  /** The flipper buttons a step ago: a press after the ball clock ran out gets a dead click. */
  let flipWas = { left: false, right: false };
  const readInput = (): Input => {
    const input: Input = {
      left: keys.has(settings.keys.left),
      right: keys.has(settings.keys.right),
      plunge: keys.has(settings.keys.launch),
      nudge: nudgePulse,
    };
    nudgePulse = 0;
    if (game.sim.timeUp && ((input.left && !flipWas.left) || (input.right && !flipWas.right))) { audio.deadFlip(); renderer.nope(); }
    flipWas = { left: input.left, right: input.right };
    return input;
  };

  // ---- buttons -------------------------------------------------------------------------------------------
  function startRound() {
    if (!game.canStart) return;
    audio.unlock(); game.startRound(); armed = null; selected = null; selectedDecal = null; $('tip').hidden = true; refreshWorkshop(); persist();
    const boss = game.boss;
    if (boss) { say(boss.shout); renderer.bigBoiMood('shocked', 2); } else sayKey('start');
  }
  $('btnStart').onclick = startRound;
  $('btnCash').onclick = () => game.cashOut();
  $('btnTest').onclick = () => { audio.unlock(); game.testBall(); sayKey('start'); };
  $('btnReset').onclick = () => { openMenu(); menu.askNewGame(); }; // a new run starts with picking its machine
  $('btnPause').onclick = () => openPause();
  $('btnSettings').onclick = () => { openPause(); menu.showSettings(); };
  $('btnReroll').onclick = () => { if (game.reroll()) { sayKey('reroll'); persist(); } else sayKey('broke'); refreshWorkshop(); };
  // Machine & options (undo, the Test Lab, layout slots, the heatmap, the table's tilt) is a developer's drawer: it
  // shows only with ?dev in the address, and without it nothing can leave the Test Lab switched on
  $('machineBox').hidden = !DEV;
  const sandbox = $('sandbox') as HTMLInputElement;
  sandbox.checked = game.sandbox;
  sandbox.onchange = () => {
    game.sandbox = sandbox.checked;
    say(sandbox.checked ? 'TEST LAB OPEN. NOTHING HERE COUNTS' : 'BACK TO REAL MONEY');
    if (!sandbox.checked) game.enforceToolbox();
    persist();
    refreshWorkshop();
  };
  const gravity = $('gravity') as HTMLInputElement;
  gravity.value = String(game.layout.gravity);
  $('gravVal').textContent = gravity.value;
  for (const ev of ['pointerdown', 'keydown'] as const) gravity.addEventListener(ev, () => game.checkpoint());
  gravity.oninput = () => { game.setGravity(Number(gravity.value)); $('gravVal').textContent = gravity.value; persist(); };

  // ---- undo / redo, layout slots, heatmap, lab tools ------------------------------------------------
  const afterHistory = () => {
    if (selected != null && !game.part(selected)) selected = null;
    if (armed != null && !game.part(armed)) armed = null;
    gravity.value = String(game.layout.gravity);
    $('gravVal').textContent = gravity.value;
    persist();
    refreshWorkshop();
  };
  function doUndo() { if (game.undo()) { say('UNDONE. TIME IS A FLAT CIRCLE'); afterHistory(); } }
  function doRedo() { if (game.redo()) { say('REDONE. BOLD'); afterHistory(); } }
  $('btnUndo').onclick = doUndo;
  $('btnRedo').onclick = doRedo;

  const heat = $('heat') as HTMLInputElement;
  heat.onchange = () => { drawState.showHeat = heat.checked; };
  $('btnHeatClear').onclick = (e) => { e.preventDefault(); game.clearHeat(); };

  const readSlots = (): (Arrangement | null)[] => {
    try { const v = JSON.parse(store.get(SLOTS) ?? 'null'); if (Array.isArray(v)) return [v[0] ?? null, v[1] ?? null, v[2] ?? null]; } catch { /* ignore */ }
    return [null, null, null];
  };
  function renderSlots() {
    const slots = readSlots();
    $('slots').innerHTML = slots.map((sl, i) => `<div class="slot"><span>Layout ${i + 1}: ${sl ? sl.parts.length + ' parts' : 'empty'}</span>
      <button data-save="${i}">Save</button><button data-load="${i}" ${sl ? '' : 'disabled'}>Load</button></div>`).join('');
    for (const b of $('slots').querySelectorAll<HTMLButtonElement>('button[data-save]')) {
      b.onclick = () => {
        const all = readSlots();
        all[Number(b.dataset.save)] = game.arrangement();
        store.set(SLOTS, JSON.stringify(all));
        $('slotMsg').textContent = `Saved layout ${Number(b.dataset.save) + 1}.`;
        renderSlots();
      };
    }
    for (const b of $('slots').querySelectorAll<HTMLButtonElement>('button[data-load]')) {
      b.onclick = () => {
        const sl = readSlots()[Number(b.dataset.load)];
        if (!sl) return;
        const r = game.applyArrangement(sl);
        $('slotMsg').textContent = `Placed ${r.placed} part${r.placed === 1 ? '' : 's'}${r.missing ? `; ${r.missing} missing (you do not own them, or they no longer fit)` : ''}.`;
        afterHistory();
      };
    }
  }
  renderSlots();

  $('labBalls4').onclick = () => { audio.unlock(); game.labBalls(4); };
  $('labBalls12').onclick = () => { audio.unlock(); game.labBalls(12); };
  $('labClear').onclick = () => { game.clearBoard(); afterHistory(); };
  const labUpgrade = $('labUpgrade') as HTMLSelectElement;
  labUpgrade.innerHTML = DECAL_IDS.map((id) => `<option value="${id}">${KIND_NAMES[DECALS[id].kind]}: ${DECALS[id].name}</option>`).join('');
  $('labTake').onclick = () => {
    const id = labUpgrade.value as DecalId;
    if (game.labDecal(id)) say(`${DECALS[id].name.toUpperCase()} STUCK. FREE. NOTHING COUNTS`);
    else say(game.apronFree ? 'NOTHING TO AIM THAT AT. OWN A PART FIRST' : 'NO ROOM ON THE APRON. PEEL ONE FIRST');
    afterHistory();
  };
  $('labDrop').onclick = () => { game.labClearDecals(); afterHistory(); };
  $('labLevelUp').onclick = () => { game.levelAll(1); afterHistory(); };
  $('labLevelDown').onclick = () => { game.levelAll(-1); afterHistory(); };

  // ---- game event handling -----------------------------------------------------------------------------------
  const onSimEvent = (ev: SimEvent) => {
    switch (ev.type) {
      case 'flipper': audio.flipper(ev.on); break;
      case 'launch': audio.launch(ev.power); if (ev.power < 62) { sayKey('weakPlunge'); renderer.bigBoiMood('sad', 1.5); } break;
      case 'drain':
        audio.drain();
        if (game.mode === 'round' && game.sim.ballCount === 0) renderer.bigBoiMood('sad', 2.2); // a bad shot: Big Boi is sad
        if (ev.reason !== 'timeout' && game.mode !== 'workshop') sayKey('drain');
        break;
      case 'cashIn':
        audio.gulp();
        if (game.mode === 'round') renderer.bigBoiMood('happy', 1.5);
        break;
      case 'timeUp':
        audio.timeUp();
        renderer.flashDmd();
        sayKey('clock');
        if (game.mode === 'round') renderer.bigBoiMood('sad', 2.2);
        break;
      case 'nudge': {
        audio.nudge();
        renderer.onNudge(ev.dir, ev.tilt);
        if (ev.tilt > 0.55) renderer.flashDmd();
        break;
      }
      case 'tilt': audio.tilt(); renderer.onTilt(); sayKey('tilt'); renderer.bigBoiMood('sad', 3); break;
      case 'ballSearch': sayKey('search'); break;
      case 'rescue': sayKey('rescue'); break;
      case 'retired': renderer.onRelease(ev.x, ev.y); break;
      case 'extraBall': sayKey('printed'); renderer.onBigMoment(); audio.printed(); renderer.bigBoiMood('shocked', 1.6); break;
      case 'partRelease': { const p = game.part(ev.uid); if (p) { renderer.onRelease(p.x, p.y); audio.release(p.def); } break; }
      case 'ballSaved': {
        const saver = game.part(ev.uid);
        if (saver) renderer.onSaved(saver.x, saver.y);
        sayKey('saved'); renderer.onBigMoment(); audio.saved();
        break;
      }
      case 'partHit': { const p = game.part(ev.uid); if (p) audio.contact(p.def, ev); if (ev.kicked) sayKey('kicked'); break; }
      default: break;
    }
  };
  const onScore = (s: ScoreEvent) => {
    renderer.onScore(s);
    // points fly to the score, coins to the money stack, a rising Mult stamps and flies to the dial: effects point at their consequence
    if (!simulating) flyers.onScore(s);
    if (s.multAfter > s.multBefore + 1e-9 && !simulating) {
      const now = performance.now();
      if (s.kind === 'bonus' || now - lastStamp > 350) {
        lastStamp = now;
        overlay.stamp(`×${s.multAfter.toFixed(2)}`, roleFill(theme, s.def), renderer.toClient(s.x, s.y, 2), () => flyers.multTarget(), s.kind === 'bonus', () => { dial.kick(); flyers.kickMult(); audio.stamp(); });
      }
    }
    // every part has its own voice; a set or a level-up gets a fanfare and a shocked Big Boi
    if (s.kind === 'bonus') { audio.bonus(s.def, s.label, game.placed.some((p) => p.def === 'strip')); say(s.label ?? 'BONUS!'); renderer.onBigMoment(); renderer.bigBoiMood('shocked', 1.6); }
    else if (s.zap?.by === 'storm') audio.strike();
    else if (s.zap?.by === 'fire') audio.hit('keg', s.multAfter, { label: 'FUSE LIT!' }); // a burst of flame: the fuse's hiss
    else if (s.zap) audio.zap(); // however many parts one coil zaps, one crackle
    else if (s.spark) audio.tick(); // a spark's touch: a tick, whatever it hit
    else audio.hit(s.def, s.multAfter, s);
    // while you play, the display flashes every hit (a zap rides along with the hit that made it, and sparks are too many)
    if (s.kind === 'hit' && !s.zap && !s.spark && game.mode === 'round') renderer.pop(`+${fmt(s.points)}`);
    const band = Math.floor(s.multAfter);
    if (band > lastMultBand) { sayKey('mult', { n: band }); renderer.bigBoiMood('shocked', 1.4); }
    lastMultBand = band;
  };
  const onGame = (g: GameEvent) => {
    if (g.type === 'goal') { audio.goal(); renderer.onBigMoment(); sayKey('goal'); }
    if (g.type === 'roundWon') {
      board.noteBest(game.scorer.score);
      audio.roundWon(g.runWon);
      renderer.bigBoiMood('cool', 6);
      if (g.allDone) { say('YOU BEAT IT ALL. WELL DONE!'); renderer.bigBoiMood('cool', 30); board.noteBest(game.scorer.score); showOverlay('done'); endRun('won'); return; }
      if (g.runWon) { say('THE FINAL BOSS IS DOWN. YOU WIN. FREE PLAY!'); renderer.bigBoiMood('cool', 30); board.record(game, 'won', game.sandbox); } else sayKey('roundWon');
      showOverlay(g.runWon ? 'champ' : 'won', g.payout); persist();
    }
    if (g.type === 'runOver') { board.noteBest(game.scorer.score); endRun('lost'); sayKey('runOver'); audio.gameOver(); renderer.bigBoiMood('sad', 30); showOverlay('over'); }
    if (g.type === 'ballEnd') lastMultBand = 1;
  };

  /** While an end-of-round card is still counting in: call it to skip to the end. */
  let clearReveal: (() => void) | null = null;
  /**
   * The cards at the end of a round, all built the same way: a banner drops in (Big Boi pulling a face beside it),
   * the score counts up, the rest prints line by line, and the buttons pop up last. A click (or Enter) skips to the end.
   *  - won: ROUND CLEARED, with the payout, coin by coin
   *  - champ: the final boss is down, YOU WIN: keep playing (endless, every boss back in the draw) or start again
   *  - done: round 30, the last of endless, cleared: you beat it all, and the run is over
   *  - over: GAME OVER: how far along the map you got, your points, what your machine became
   */
  function showOverlay(kind: 'won' | 'champ' | 'done' | 'over', payout?: Payout) {
    overlayEl.hidden = false;
    overlayEl.onpointerdown = null;
    clearReveal = null;
    overlayEl.classList.toggle('full', kind !== 'won');
    const boss = game.boss, score = game.scorer.score;
    const colours = ['var(--accent)', 'var(--coin)', 'var(--role-pop-fill)', 'var(--role-lane-fill)', 'var(--glow)'];
    const confetti = (n: number) => `<div class="cl-confetti" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="left:${(i * 37) % 100}%;--d:${((i * 53) % 90) / 100}s;--x:${((i * 29) % 60) - 30}px;--r:${(i * 97) % 360}deg;background:${colours[i % 5]}"></i>`).join('')}</div>`;
    const head = (chip: string, title: string, mood: Mood) => `<div class="cl-head"><span class="cl-rays" aria-hidden="true"></span><span class="cl-round disp">${chip}</span><h3 class="cl-title disp">${title}</h3><img class="cl-boi" alt="" src="${boiURL(game.machine, mood)}"></div>`;
    const scoreRow = `<div class="cl-score"><b class="disp" id="clScore">0</b><span>of ${fmt(game.scorer.goal)}</span></div>`;
    const stats = (items: [string | number, string][]) => `<div class="stats cl-step">${items.map(([v, l]) => `<span><b>${v}</b><small>${l}</small></span>`).join('')}</div>`;
    if (kind === 'won' && payout) {
      overlayEl.innerHTML = `<div class="card clear won">${confetti(28)}${head(`Round ${game.round}`, 'Cleared!', 'cool')}
        <div class="cl-body">${scoreRow}
          <div class="cl-lines">${payout.lines.map((l) => `<div class="pay cl-step cl-coin"><span>${l.label}</span><b>+$${l.amount}</b></div>`).join('')}</div>
          <div class="pay total cl-step cl-total"><span>Total</span><span>$${payout.total}</span></div>
          <div class="hint cl-step">Cash on hand: <b>$${game.money}</b>. Spend it in the shop.</div>
          <div class="cl-step cl-btns"><button class="primary disp cl-next" id="btnNext">${game.round % BOSS_EVERY === 0 ? 'Pick a decal' : 'To the workshop'}</button></div>
          <div class="cl-skip">click to skip</div>
        </div></div>`;
      $('btnNext').onclick = () => { overlayEl.hidden = true; overlayEl.onpointerdown = null; game.continueAfterRound(); sayKey(game.pending ? 'upgrade' : 'workshop'); refreshWorkshop(); persist(); };
    } else if (kind === 'champ') {
      overlayEl.innerHTML = `<div class="card clear summary win">${confetti(64)}${head('The machine is beaten', 'You win!', 'cool')}
        <div class="cl-body">${scoreRow}
          <p class="cl-sub cl-step">${boss?.name ?? 'The final boss'} is down. All ${FINAL_ROUND} rounds, cleared.</p>
          <div class="roundmap cl-step">${mapSvg(FINAL_ROUND + 1)}</div>
          ${stats([[FINAL_ROUND, 'rounds cleared'], [fmt(game.runScore), 'total points'], [game.decals.length, 'decals']])}
          <div class="btnrow cl-step cl-btns"><button class="primary disp cl-next" id="btnEndless">Keep playing (endless)</button><button class="disp" id="btnAgain">New run</button></div>
          <div class="cl-skip">click to skip</div>
        </div></div>`;
      $('btnEndless').onclick = () => { overlayEl.hidden = true; overlayEl.onpointerdown = null; game.continueAfterRound(); sayKey(game.pending ? 'upgrade' : 'workshop'); refreshWorkshop(); persist(); };
      $('btnAgain').onclick = () => { overlayEl.hidden = true; overlayEl.onpointerdown = null; openMenu('picker'); };
    } else if (kind === 'done') {
      overlayEl.innerHTML = `<div class="card clear summary win">${confetti(80)}${head(`Round ${game.round}`, 'You beat it all', 'cool')}
        <div class="cl-body">${scoreRow}
          <p class="cl-sub cl-step">Every round there is, cleared: the final boss and all of endless. Well done!</p>
          ${stats([[game.round, 'rounds cleared'], [fmt(game.runScore), 'total points'], [game.decals.length, 'decals']])}
          <div class="btnrow cl-step cl-btns"><button class="primary disp cl-next" id="btnAgain">New run</button><button class="disp" id="btnToMenu">Main menu</button></div>
          <div class="cl-skip">click to skip</div>
        </div></div>`;
      $('btnAgain').onclick = () => { overlayEl.hidden = true; overlayEl.onpointerdown = null; openMenu('picker'); };
      $('btnToMenu').onclick = () => { overlayEl.hidden = true; overlayEl.onpointerdown = null; openMenu(); };
    } else {
      const short = Math.max(0, game.scorer.goal - score);
      overlayEl.innerHTML = `<div class="card clear summary lose">${head(`Round ${game.round}`, 'Game over', 'sad')}
        <div class="cl-body">${scoreRow}
          <p class="cl-sub cl-step">${fmt(short)} short${boss ? `, against ${boss.name}` : ''}. The machine wins this time.</p>
          <div class="roundmap cl-step">${mapSvg(game.round)}</div>
          ${stats([[game.round - 1, 'rounds cleared'], [fmt(game.runScore), 'total points'], [game.placed.length, 'parts on the table']])}
          <div class="btnrow cl-step cl-btns"><button class="primary disp cl-next" id="btnAgain">New run</button><button class="disp" id="btnToMenu">Main menu</button></div>
          <div class="cl-skip">click to skip</div>
        </div></div>`;
      $('btnAgain').onclick = () => { overlayEl.hidden = true; overlayEl.onpointerdown = null; openMenu('picker'); };
      $('btnToMenu').onclick = () => { overlayEl.hidden = true; overlayEl.onpointerdown = null; openMenu(); };
    }
    const card = overlayEl.querySelector<HTMLElement>('.clear')!;
    const steps = [...card.querySelectorAll<HTMLElement>('.cl-step')];
    const scoreEl = $('clScore');
    const timers: number[] = [];
    let raf = 0;
    const finish = () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      scoreEl.textContent = fmt(score);
      for (const el of steps) el.classList.add('on');
      card.classList.add('done');
      clearReveal = null;
    };
    clearReveal = finish;
    // the score counts up (slower, with a sigh, when the run is lost)
    const t0 = performance.now(), countFor = kind === 'over' ? 1300 : 900;
    const count = (now: number) => {
      const u = Math.min(1, (now - t0) / countFor);
      scoreEl.textContent = fmt(score * (1 - Math.pow(1 - u, 3)));
      if (u < 1) raf = requestAnimationFrame(count);
    };
    raf = requestAnimationFrame(count);
    // then the rest prints, a line at a time: a coin for each payout line, a stamp for the total; the buttons pop up last
    let coin = 0;
    steps.forEach((el, i) => {
      const last = el.classList.contains('cl-btns');
      timers.push(window.setTimeout(() => {
        el.classList.add('on');
        if (el.classList.contains('cl-coin')) audio.tally(coin++);
        else if (el.classList.contains('cl-total')) audio.buy();
        else if (!last) audio.print(1);
        if (last) { card.classList.add('done'); clearReveal = null; }
      }, countFor + 150 + i * (kind === 'won' ? 280 : 340) + (last ? 200 : 0)));
    });
    overlayEl.onpointerdown = (e) => { if (clearReveal) { e.preventDefault(); clearReveal(); } };
  }

  // ---- HUD ------------------------------------------------------------------------------------------------------
  /** The one big button: PLAY ROUND while you build (locked while an upgrade is owed). */
  function updateStepper() {
    const play = game.mode !== 'workshop';
    const owed = game.pending !== null;
    const start = $('btnStart') as HTMLButtonElement;
    start.hidden = play;
    start.disabled = owed;
    start.title = owed ? 'Pick an upgrade (or skip it) first' : '';
    start.classList.toggle('ready', !owed && game.inventory.length === 0);
  }

  /** The run as a map: fifteen stops on a winding path, every third a boss (bigger); here is lit, behind is grey. */
  function mapSvg(round: number) {
    const N = 15, first = Math.floor((round - 1) / N) * N + 1, W = 260, H = 34;
    const pts = Array.from({ length: N }, (_, i) => [10 + ((W - 20) * i) / (N - 1), H / 2 + Math.sin(i * 0.95 + 0.4) * 6]);
    const seg = (a: number, b: number, style: string) => `<polyline points="${pts.slice(a, b + 1).map((q) => q.join(',')).join(' ')}" style="fill:none;${style}"/>`;
    const here = round - first;
    const o = [seg(0, Math.max(0, here), 'stroke:var(--paper-dim);stroke-width:3;stroke-linecap:round;stroke-linejoin:round'),
      seg(Math.max(0, here), N - 1, 'stroke:var(--faint);stroke-width:2.2;stroke-dasharray:2 5;stroke-linecap:round')];
    pts.forEach(([x, y], i) => {
      const boss = (first + i) % BOSS_EVERY === 0, r = boss ? 8.5 : 5;
      const fill = i < here ? 'var(--paper-dim)' : i === here ? 'var(--accent)' : 'var(--paper)';
      const line = i < here ? 'var(--faint)' : 'var(--ink)';
      if (i === here) o.push(`<circle cx="${x}" cy="${y}" r="${r + 4.5}" style="fill:none;stroke:var(--accent);stroke-width:2;opacity:.45"/>`);
      o.push(`<circle cx="${x}" cy="${y}" r="${r}" style="fill:${fill};stroke:${line};stroke-width:${boss ? 2.4 : 1.8}"/>`);
      if (boss) o.push(`<circle cx="${x}" cy="${y}" r="2.6" style="fill:${i < here ? 'var(--faint)' : i === here ? 'var(--paper)' : 'var(--ink)'}"/>`);
    });
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${o.join('')}</svg>`;
  }
  let mapKey = '';
  function renderMap() {
    const key = `${game.round}|${theme.id}`;
    if (key === mapKey) return;
    mapKey = key;
    $('roundMap').innerHTML = mapSvg(game.round);
  }

  let keysKey = '';
  /** The controls, in one short line under the table: what the keys do right now. */
  function updateKeys() {
    const mode = game.mode === 'workshop' ? 'build' : 'play';
    const bound = settings.keys, key = `${mode}|${bound.left}|${bound.right}|${bound.launch}`;
    if (key === keysKey) return;
    keysKey = key;
    const k = (key: string, what: string) => `<kbd>${key}</kbd><span>${what}</span>`;
    $('keys').innerHTML = mode === 'play'
      ? [k(keyLabel(bound.left), ''), k(keyLabel(bound.right), 'flippers'), k(keyLabel(bound.launch), 'shoot'), k('Z', ''), k('X', 'nudge'), k('Tab', 'cash out'), k('Esc', 'pause'), k('P', 'feedback')].join(' ')
      : [k('Enter', 'play round'), k(keyLabel(bound.launch), 'test ball'), k('R', 'rotate'), k('Del', 'to toolbox'), k('Ctrl+Z', 'undo'), k('Esc', 'pause'), k('P', 'feedback')].join(' ');
  }

  let ballsKey = '';
  let receiptScorer: unknown = null;
  let receiptOrder: PartId[] = [];
  function updateBalls(inRound: boolean) {
    const key = inRound ? `${game.ballsLeft}/${game.ballsPerRound}` : 'inf';
    if (key === ballsKey) return;
    ballsKey = key;
    const tray = $('ballTray');
    tray.classList.toggle('inf', !inRound);
    if (!inRound) { tray.textContent = 'FREE'; $('balls').textContent = 'PRACTICE'; return; }
    const ball = iconURL('ball', 24, 24);
    tray.innerHTML = Array.from({ length: game.ballsPerRound }, (_, i) => (i < game.ballsLeft ? `<img alt="" src="${ball}">` : '<i></i>')).join('');
    $('balls').textContent = `${Math.max(0, game.ballsLeft)} LEFT`;
  }

  /** The mark of the last tick of the ball clock's countdown (null outside its last 10 s). */
  let tickMark: number | null = null;
  /** The ball clock's last 10 s tick, twice a second in the last 3; each tick kicks the clock's bar. */
  function countdown(left: number | null) {
    if (game.mode !== 'round' || left === null || game.sim.timeUp || left > 10) { tickMark = null; return; }
    const mark = left > 3 ? Math.ceil(left) : Math.ceil(left * 2) / 2;
    if (mark === tickMark || mark <= 0) return;
    tickMark = mark;
    if (simulating) return;
    audio.clockTick(mark);
    if (mark === 10) sayKey('hurry');
    const box = $('clockBox');
    box.classList.remove('beat');
    void box.offsetWidth; // restart the kick
    box.classList.add('beat');
  }

  function updateHud(dt: number) {
    const sc = game.scorer;
    const inRound = game.mode === 'round' || game.mode === 'roundEnd' || game.mode === 'runOver';
    // the scoreboard says which half of the loop you are in: the workshop (buy and place), or play
    const playing = game.mode !== 'workshop';
    // the music gets going while a round is played, more so as the goal gets close
    audio.setIntensity(game.mode === 'round' ? 0.55 + 0.45 * Math.min(1, sc.score / Math.max(1, sc.goal)) : 0);
    $('phaseTitle').textContent = playing ? 'PLAY' : 'WORKSHOP';
    document.body.classList.toggle('playing', playing);
    odometer.set(Math.round(flyers.shownScore)); // the drums count the points in as they land
    renderer.idle(playing ? fmt(sc.score) : `ROUND ${game.round}  GOAL ${fmt(goalFor(game.round))}`);
    $('mult').textContent = `×${sc.mult.toFixed(2)}`;
    $('mult').classList.toggle('hot', sc.mult >= 2);
    dial.set(sc.mult, theme);
    const money = game.money + (inRound ? sc.money : 0) - flyers.coinsInFlight;
    $('shopMoney').textContent = game.sandbox ? '$∞' : `$${Math.max(0, money)}`;
    renderMap();
    const goal = inRound ? sc.goal : goalFor(game.round);
    $('goal').textContent = fmt(goal);
    $('toGo').textContent = inRound ? (sc.goalReached ? 'GOAL HIT!' : `${fmt(Math.max(0, goal - sc.score))} to go`) : 'next round';
    $('goalFill').style.width = inRound ? `${Math.min(100, (sc.score / goal) * 100)}%` : '0%';
    $('goalFill').parentElement!.classList.toggle('hit', inRound && sc.goalReached);
    flyers.hud({ round: sc, score: sc.score, mult: sc.mult, theme });
    updateBalls(inRound);
    $('tiltFill').style.width = `${Math.min(100, game.sim.tiltMeter * 100)}%`;
    $('tiltFill').classList.toggle('danger', game.sim.tiltMeter > 0.55 || game.sim.tilted);
    const clock = game.sim.clockLeft;
    $('clockBox').hidden = game.mode !== 'round';
    $('clockBox').classList.toggle('up', game.sim.timeUp);
    countdown(clock);
    $('clockSec').textContent = game.sim.timeUp ? 'TIME!' : clock === null ? `${game.sim.clockTotal} s` : `${Math.ceil(clock)} s`;
    $('clockFill').style.width = `${clock === null ? 100 : (clock / game.sim.clockTotal) * 100}%`;
    $('clockFill').classList.toggle('low', clock !== null && clock < 10);
    updateStepper();
    updateKeys();
    const cash = $('btnCash') as HTMLButtonElement;
    cash.hidden = game.mode !== 'round';
    cash.disabled = !(game.mode === 'round' && sc.goalReached);
    ($('btnUndo') as HTMLButtonElement).disabled = !game.canUndo;
    ($('btnRedo') as HTMLButtonElement).disabled = !game.canRedo;
    if (game.sandbox && !DEV) { game.sandbox = false; game.enforceToolbox(); } // an old save from the Test Lab
    $('labTools').hidden = !game.sandbox;
    document.body.classList.toggle('still', calm || game.sim.tilted);

    ledgerTimer += dt;
    if (ledgerTimer > 0.12) {
      ledgerTimer = 0;
      // the receipt groups the ledger by part type, in the order they first scored, so it prints downwards:
      // it feeds out at the start of a round, and each new line feeds out after the last
      if (game.scorer !== receiptScorer) {
        receiptScorer = game.scorer;
        receiptOrder = [];
        $('ledger').querySelector('tbody')!.innerHTML = '';
        if (game.mode === 'round') { const w = $('ledgerBox'); w.classList.remove('feed'); void w.offsetWidth; w.classList.add('feed'); audio.print(3); }
      }
      const groups = new Map<PartId, { n: number; points: number; money: number }>();
      for (const r of sc.ledgerRows()) {
        const g = groups.get(r.def) ?? { n: 0, points: 0, money: 0 };
        g.n++; g.points += r.points; g.money += r.money;
        groups.set(r.def, g);
      }
      const fresh = [...groups.keys()].filter((id) => !receiptOrder.includes(id));
      if (fresh.length) { receiptOrder.push(...fresh); audio.print(fresh.length); }
      const body = $('ledger').querySelector('tbody')!;
      if (!receiptOrder.length) body.innerHTML = '';
      // rows are kept and updated in place, so a line feeds out once and then just counts up
      for (const id of receiptOrder) {
        const g = groups.get(id);
        if (!g) continue;
        let tr = body.querySelector<HTMLTableRowElement>(`tr[data-id="${id}"]`);
        if (!tr) {
          tr = document.createElement('tr');
          tr.dataset.id = id;
          tr.className = 'new';
          tr.innerHTML = `<td class="name"><i style="background:${roleVar(id)}"></i><span></span></td><td class="pts"></td>`;
          body.appendChild(tr);
        }
        const name = id === 'lane' ? `Lanes ${theme.laneWord}` : `${PARTS[id].name}${g.n > 1 ? ` ×${g.n}` : ''}`;
        const pts = `${g.money ? `$${g.money} · ` : ''}${fmt(g.points)}`;
        const [nameEl, ptsEl] = [tr.querySelector('span')!, tr.querySelector<HTMLElement>('.pts')!];
        if (nameEl.textContent !== name) nameEl.textContent = name;
        if (ptsEl.textContent !== pts) ptsEl.textContent = pts;
      }
      const rows = receiptOrder.filter((id) => groups.has(id)).map((id) => [id, groups.get(id)!] as const);
      $('ledgerEmpty').hidden = rows.length > 0;
      $('ledger').hidden = rows.length === 0;
      $('ledgerTotal').textContent = fmt(rows.reduce((a, [, g]) => a + g.points, 0));
      if (game.editable && selected != null && $('selLive')) {
        const inst = game.part(selected);
        if (inst) $('selLive').innerHTML = liveLine(inst);
      }
    }
  }

  // ---- Big Boi's tour (src/ui/tutorial.ts): what is where, never what to do ----------------------------------------
  /** The screen box around a patch of the table, from its floor up to height z. */
  const tableBox = (x0: number, y0: number, x1: number, y1: number, z = 0): Box[] => {
    const pts = [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [renderer.toClient(x, y, 0), renderer.toClient(x, y, z)]));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return [{ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }];
  };
  const partBox = (uid: number): Box[] => {
    const p = game.part(uid);
    if (!p?.placed) return [];
    const r = footprint(PARTS[p.def]);
    return tableBox(p.x - r, p.y - r, p.x + r, p.y + r, 1).map((b) => ({ ...b, round: true }));
  };
  const tour = new Tutorial({
    // the Big Boi in the middle of the table does the talking: the bubbles come out of him, and he pulls the faces
    speaker: () => {
      const p = game.placed.find((q) => q.def === 'mega');
      if (!p) return null;
      const r = footprint(PARTS.mega);
      return tableBox(p.x - r, p.y - r, p.x + r, p.y + r, 1.9)[0];
    },
    face: (m) => renderer.bigBoiMood(m ?? 'happy', m ? 600 : 0),
    talk: () => audio.talk(),
    pop: () => audio.pickUp(),
  });
  /** Big Boi still has one thing to say after the tour: about the first part you put on the table. */
  let partTip = false;
  function startTour() {
    store.set(TUTORIAL_KEY, '1');
    partTip = true;
    const k = settings.keys, n = game.inventory.length;
    const { L, R } = FLIPPER_PIVOTS;
    const steps: Step[] = [
      { say: "Hey, welcome back! I haven't seen you in a while. Let me remind you how things go.", mood: 'cool' },
      { say: 'This is your <b>route</b>: 15 rounds to clear, each with a bigger goal. Some of them have their own nasty rules. Those are the <b>bosses</b>, and this box warns you which one is next.', at: () => [...around('#roundMap'), ...around('#bossBox')], scroll: '#roundMap' },
      { say: 'This is the <b>score</b> to beat. It grows every round.', at: () => around('#score', '#left .goalrow', '#left .tube'), scroll: '#score' },
      { say: `This is your <b>toolbox</b>. Right now it holds ${n} bumper${n === 1 ? '' : 's'}. Press one, then press the table to put it there.`, at: () => around('#invWrap'), scroll: '#invWrap' },
      { say: `Moving parts is <b>free</b> while you set up, before round 1: shoot some test balls and shuffle things around. Once the round starts, every move costs <b>$${UPKEEP.move}</b>.`, mood: 'cool', at: () => around('#invWrap'), scroll: '#invWrap' },
      { say: 'This is your <b>money</b>. Every round you clear pays, every ball you did not need pays extra, and some parts cough up coins when you hit them.', at: () => around('#right .money'), scroll: '#right .moneyrow' },
      { say: 'This is the <b>shop</b>. After every round you can buy new parts for the machine here.', at: () => around('#shopBox'), scroll: '#shopBox' },
      {
        say: `These are your <b>flippers</b>: <kbd>${keyLabel(k.left)}</kbd> and <kbd>${keyLabel(k.right)}</kbd>. Hold <kbd>${keyLabel(k.launch)}</kbd> to pull the plunger, let go to shoot. Until the round starts, balls are free: shoot as many as you like.`,
        at: () => [...tableBox(L.x - 1, L.y - 2.4, R.x + 1, L.y + 1, 0.5), ...tableBox(LANE_WALL_X, 0, TABLE_W, 7, 0.5)], scroll: '#stage',
      },
      { say: `When you're ready, hit <b>Play Round</b>. Then it counts: ${game.ballsPerRound} balls to reach the goal.`, at: () => around('#btnStart'), scroll: '#actions' },
      {
        say: 'During the round this turns into <b>Cash Out</b>. Once the goal is hit you can bank the round any time: handy if a ball gets stuck, or you just want out.',
        at: () => around('#btnCash'), scroll: '#actions',
        enter: () => document.body.classList.add('tut-cash'), leave: () => document.body.classList.remove('tut-cash'),
      },
      { say: 'Ball stuck anyway? Shove the table with <kbd>Z</kbd> and <kbd>X</kbd>. Gently! Shove too hard and this fills up: <b>TILT</b>. Lights out, flippers dead, and I sulk.', mood: 'sad', at: () => around('#left .gauge[data-tip="tilt"]'), scroll: '#tiltFill' },
      { say: "That's the tour! I'll be right here in the middle, watching the ball.", mood: 'cool' },
    ];
    tour.start(steps, (skipped) => { if (skipped) partTip = false; });
  }
  function placedTip(uid: number) {
    if (!partTip || tour.open) return;
    partTip = false;
    tour.start([
      { say: 'Nice spot! Press any part on the table to open its card: what it pays, a dial to tune it (like how hard it bounces the ball), and buttons to move it, store it or get rid of it.', at: () => [...partBox(uid), ...around('#inspect')] },
      { say: "That's all from me. Good luck!", mood: 'cool' },
    ]);
  }

  // ---- menus: settings, the scoreboard, pause, the main menu -------------------------------------------------------
  function applySettings(s: Settings) {
    settings = s;
    saveSettings(store, s);
    audio.setVolumes(s.music, s.sfx);
    renderer.setQuality(s.quality === 'low');
    setFlyEffects(s.quality !== 'low'); // low graphics: the score and coins count up in place
    if (s.calm !== calm) setCalm(s.calm);
    keysKey = '';
  }

  const board = new Scoreboard(store, hasRun);
  const savedRun = (): RunSave | null => (hasRun ? parseRun(store.get(STORE) ?? '') : null);
  /** The run ends: onto the scoreboard, and the save is cleared. The live game, or (behind the menu) the one in storage. */
  function endRun(result: RunResult) {
    if (!hasRun) return;
    if (attract.on) {
      const run = savedRun();
      if (run) board.record(sourceOfSave(run), result, run.sandbox);
    } else {
      // a round in play counts what it has scored so far
      const live = game.mode === 'round' ? game.scorer.score : 0;
      board.noteBest(live);
      board.record({ machine: game.machine, round: game.round, mode: game.mode, runScore: game.runScore + live, won: game.won, decals: game.decals, placed: game.placed, layout: game.layout }, result, game.sandbox);
    }
    board.endRun();
    store.del(STORE);
    hasRun = false;
  }
  /** After a run is started or loaded: the controls that mirror it. */
  function afterRunChange() {
    sandbox.checked = game.sandbox;
    gravity.value = String(game.layout.gravity);
    $('gravVal').textContent = gravity.value;
    armed = selected = null;
    selectedDecal = null;
    keysKey = '';
    refreshWorkshop();
  }

  /** The main menu (or the machine picker): the game hides and the attract table plays behind. The run stays saved. */
  function openMenu(screen: 'main' | 'picker' = 'main') {
    if (!attract.on) {
      // a payout still on screen is taken on the way out, so the save is the next round's workshop
      if (hasRun && game.mode === 'roundEnd' && game.payout) { game.continueAfterRound(); persist(); }
      if (hasRun && game.mode === 'workshop') persist();
      if (shopDrag || carry || armed !== null) cancelHold();
      overlayEl.hidden = true;
      clearReveal = null;
      $('tip').hidden = true;
      $('inspect').hidden = true;
      selected = null;
      selectedDecal = null;
      keys.clear();
      attract.start(theme.id);
      say('BIG BOI. PINBALL DESIGNER');
      dmdClock = 0;
    }
    if (screen === 'picker') menu.showPicker(); else menu.showMain();
  }
  function openPause() {
    if (menu.open || attract.on) return;
    if (shopDrag || carry || armed !== null) cancelHold();
    keys.clear();
    $('tip').hidden = true;
    menu.showPause();
  }

  // the attract table's display: its score, and now and then a line
  let dmdClock = 0, dmdLine = 0;
  function attractDmd(dt: number) {
    renderer.idle(game.scorer.score > 0 ? fmt(game.scorer.score) : 'BIG BOI');
    if ((dmdClock += dt) < 9) return;
    dmdClock = 0;
    const best = board.records[0];
    const lines = ['PRESS START', best ? `YOUR BEST ${fmt(best.score)}` : 'BUILD IT. BREAK IT.', 'BIG BOI. PINBALL DESIGNER', 'DEMO MODE'];
    say(lines[dmdLine++ % lines.length]);
  }
  const IDLE_DRAW: DrawState = { ghost: null, selectedUid: null, hoverUid: null, showHeat: false, hoverDecal: null, ledge: null };

  const menu = new Menu({
    savedRun: (): SavedRunInfo | null => { const r = savedRun(); return r ? { machine: r.machine ?? 'factory', round: r.round, money: r.money, won: !!r.won } : null; },
    newGame: (id, tutorial) => {
      audio.unlock();
      if (savedRun()) endRun('abandoned');
      pickTheme(id);
      partTip = false;
      if (tutorial) startTour();
    },
    tutorialDefault: () => store.get(TUTORIAL_KEY) !== '1',
    resume: () => {
      const run = savedRun();
      if (!run) { menu.showMain(); return; }
      audio.unlock();
      attract.stop();
      menu.close();
      game.load(run, themeById(store.get(THEME_KEY))?.id);
      applyTheme(themeById(game.machine) ?? FACTORY);
      afterRunChange();
      say(`WELCOME BACK. ROUND ${game.round}`);
    },
    unpause: () => { menu.close(); last = performance.now(); },
    quit: () => { menu.close(); openMenu(); },
    abandon: () => { const live = !attract.on; endRun('abandoned'); if (live) openMenu(); else menu.showMain(); },
    records: () => board.records,
    thumb: (r) => {
      const t = themeById(r.machine) ?? FACTORY;
      const decals = Array.from({ length: DECAL_SLOTS }, (_, i) => { const d = r.decals[i]; return d ? { look: DECALS[d].look, rarity: DECALS[d].rarity } : null; });
      return renderer.tableShot(r.parts, 220, 456, { theme: t, ledge: r.ledge, decals }).toDataURL();
    },
    bigBoi: (id, mood = 'happy') => boiURL(id, mood),
    poke: () => { audio.unlock(); audio.poke(); say(['OI!', 'HEY. WATCH THE PAINT', 'THAT TICKLES', 'BIG BOI SAYS HI', 'POKE ME AGAIN. I DARE YOU'][Math.floor(Math.random() * 5)]); },
    settings: () => settings,
    setSettings: (s) => { audio.unlock(); applySettings(s); },
    wake: () => audio.unlock(),
    library: () => library,
    libIcon,
    librarySeen: () => { library.seen = Date.now(); store.set(LIBRARY_KEY, JSON.stringify(library)); },
    machine: () => theme.id as MachineId,
    feedback: () => feedback.show(),
  });

  // ---- main loop ------------------------------------------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let frames = 0, fpsClock = 0, bulbClock = 0, bulbPhase = 0;
  // Test hooks (used by tools/smoke.cjs): drive the sim deterministically instead of in real time.
  let frozen = false;
  /** True while a test hook runs many seconds of sim in one go: no effects fly to the HUD then. */
  let simulating = false;
  const debug = {
    game, keys, renderer, flyers, fps: 0, steps: 0,
    freeze(v = true) { frozen = v; },
    /** Run `seconds` of sim time with the bot at the controls, drawing at 60 fps of sim time (fx: let points and coins fly). */
    advance(seconds: number, seed = 1, skill = 0.9, fx = false) {
      const bot = new Bot(seed, skill);
      const frames = Math.round(seconds * 60);
      simulating = !fx;
      try {
        for (let f = 0; f < frames; f++) {
          for (let i = 0; i < 4; i++) stepOnce(bot.decide(game.sim));
          renderer.draw(game, 1 / 60, drawState);
          updateHud(1 / 60);
        }
      } finally { simulating = false; }
    },
    /** Pure physics cost: ms per step with `balls` balls dropped in, no drawing (balls drain as they would in play). */
    bench(steps: number, balls: number) {
      game.toWorkshop();
      for (let i = 0; i < balls; i++) game.sim.addBall(4 + (i % 12) * 1.1, 30 + Math.floor(i / 12) * 1.1, (i % 5) - 2, -3);
      const bot = new Bot(3, 0.9);
      const t0 = performance.now();
      let minBalls = balls;
      for (let i = 0; i < steps; i++) {
        game.sim.step(bot.decide(game.sim));
        minBalls = Math.min(minBalls, game.sim.ballCount);
      }
      return { msPerStep: (performance.now() - t0) / steps, ballsAtEnd: game.sim.ballCount, minBalls };
    },
    /** Client pixels of a sim point on the table (through the tip and the nudge). */
    toScreen: (x: number, y: number, z = 0) => renderer.toClient(x, y, z),
    /** Average ms per renderer.draw() over n frames of the current state. */
    probe: (n = 60) => renderer.probe(game, drawState, n),
    menu: () => menu,
    attract: () => attract.on,
    /** Run `seconds` of the attract table (real time is too slow in a headless browser). */
    demo(seconds: number) {
      for (let f = 0; f < Math.round(seconds * 60); f++) { attract.step(1 / 60); renderer.draw(game, 1 / 60, IDLE_DRAW); }
    },
    theme: (id: string) => pickTheme(id),
    /** Put a new run's starting bumpers from the toolbox onto their old spots, settled in (moving them costs again), for checks written for that start. */
    seatStarters() { for (const p of starterLayout().parts) if (!p.fixed && game.place(p.uid, p.x, p.y)) delete game.part(p.uid)!.loose; refreshWorkshop(); },
    refresh: () => refreshWorkshop(),
    // ?trailer (tools/trailer/record.cjs): one frame of `ms` (fx false: nothing flies to the hidden panels), the camera, the
    // drawing resolution, a bot at the controls, the main menu, and the sounds written down since the log was opened
    frame(ms: number, video: number, fx = true) {
      film.now += ms;
      film.video = video;
      film.steps = Math.round(ms / 1000 / DT);
      simulating = !fx;
      try { renderer.app.ticker.update(film.now); overlay.app.ticker.update(film.now); } finally { simulating = false; }
    },
    /** Play `seconds` with the bot (or nobody) and draw nothing: the run-up to a shot. */
    skip(seconds: number) {
      simulating = true;
      try { for (let i = Math.round(seconds / DT); i > 0; i--) stepOnce(film.bot ? film.bot.decide(game.sim) : { left: false, right: false, plunge: false, nudge: 0 }); } finally { simulating = false; }
    },
    camera: (c: Parameters<Renderer['setCamera']>[0]) => renderer.setCamera(c),
    resolution: (r: number) => renderer.setResolution(r),
    autopilot(seed: number | null, skill = 0.9) { film.bot = seed === null ? null : new Bot(seed, skill); },
    openMenu: () => openMenu(),
    closeMenu() { attract.stop(); menu.close(); },
    soundLog(on: boolean) { const l = film.log ?? []; film.log = on ? [] : null; return l; },
    mood: (m: Mood, s: number) => renderer.bigBoiMood(m, s),
  };
  (window as unknown as { __pinball: typeof debug }).__pinball = debug;

  function stepOnce(input: Input) {
    const res = game.step(input);
    for (const ev of res.sim) onSimEvent(ev);
    for (const s of res.score) onScore(s);
    for (const g of res.game) onGame(g);
    debug.steps++;
  }

  renderer.app.ticker.add(() => {
    const now = clock();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (attract.on) {
      audio.setIntensity(0);
      attract.step(dt);
      attractDmd(dt);
      renderer.draw(game, dt, IDLE_DRAW);
      bulbClock += dt;
      if (!calm && bulbClock > 0.35) { bulbClock = 0; chase(document, ++bulbPhase); }
      frames++;
      return;
    }
    if (menu.paused || feedback.open) { acc = 0; renderer.draw(game, 0, drawState); return; }
    acc += dt;
    let n = 0;
    // a filmed frame is a whole number of steps, so a shot plays out exactly as it did when it was planned
    if (TRAILER) { for (; n < film.steps; n++) stepOnce(film.bot ? film.bot.decide(game.sim) : readInput()); film.steps = 0; acc = 0; }
    while (!TRAILER && !frozen && acc >= DT && n < 24) {
      stepOnce(readInput());
      acc -= DT;
      n++;
    }
    if (n === 24) acc = 0;

    drawState.selectedUid = game.editable ? selected : null;
    drawState.hoverUid = hover;
    drawState.hoverDecal = hoverDecal;
    drawState.ledge = game.editable && (ledgeDrag || hoverLedge)
      ? { y: ledgeDrag?.y ?? game.layout.ledge ?? LEDGE.default, valid: !ledgeDrag || canPlaceLedge(game.layout, ledgeDrag.y), moving: !!ledgeDrag }
      : null;
    const armedPart = armed != null ? game.part(armed) : undefined;
    const ptr = (id: PartId) => (isDecor(id) ? pointerDecor : pointer);
    const sp = shopDrag ? ptr(shopDrag.id) : null, ap = armedPart ? ptr(armedPart.def) : null;
    const spread = shopDrag && sp ? packPreview(shopDrag, sp) : undefined;
    drawState.ghost = game.editable && (shopDrag?.moving || shopDrag?.carry) && sp
      ? {
        def: shopDrag.id, x: sp.x, y: sp.y, angle: PARTS[shopDrag.id].rotatable ? shopDrag.angle : 0,
        valid: game.canDropAt(shopDrag.id, sp.x, sp.y) && spread !== null, pack: spread?.table,
      }
      : game.editable && armedPart && ap
        ? { def: armedPart.def, x: ap.x, y: ap.y, angle: armedPart.angle, valid: game.canDropAt(armedPart.def, ap.x, ap.y) }
        : null;
    // the pieces of a pack that will find no room on the table: the toolbox says how many are coming its way
    const incoming = drawState.ghost && spread ? spread.toolbox : 0;
    $('inventoryBox').classList.toggle('incoming', incoming > 0);
    const tag = $('toolIncoming');
    tag.hidden = !incoming;
    if (incoming) tag.textContent = `+${incoming} HERE`;
    renderer.draw(game, dt, drawState);
    updateHud(dt);
    placeInspect();
    // the marquee bulbs chase (they hold still in Calm mode)
    bulbClock += dt;
    if (!calm && bulbClock > 0.35) { bulbClock = 0; chase(document, ++bulbPhase); }

    frames++;
    fpsClock += dt;
    if (fpsClock >= 1) { debug.fps = Math.round(frames / fpsClock); frames = 0; fpsClock = 0; }
  });

  if (TRAILER) { renderer.app.ticker.stop(); overlay.app.ticker.stop(); last = film.now; }
  makeBulbs(document);
  applySettings(settings);
  applyTheme(theme);
  renderer.draw(game, 0, drawState);
  openMenu();
}

// the page is shown once the main menu is up (or, if loading failed, as it is)
void main().finally(() => document.body.classList.remove('booting'));
