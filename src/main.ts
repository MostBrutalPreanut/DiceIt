import './style.css';
import { callout, type CalloutKey } from './data/callouts';
import { dialValue, footprint, PART_IDS, PARTS, type PartDef, type PartId, type PartInstance } from './data/parts';
import { BOSS_EVERY, COLUMN_NAMES, offerText, SKIP_PAY, UPGRADE_IDS, UPGRADES, type UpgradeId, type UpgradeOffer } from './data/upgrades';
import { DECAL_SLOTS } from './data/decals';
import { AudioFx } from './audio';
import { Game, goalFor, parseRun, TOOLBOX_SLOTS, type Arrangement, type GameEvent, type Payout } from './game/game';
import type { ScoreEvent } from './game/scoring';
import { Renderer, type DrawState } from './render/renderer';
import { FxOverlay, rectCentre } from './render/overlay';
import { FACTORY, roleFill, themeById, THEMES, themeVars, type Theme } from './render/theme';
import { DT } from './sim/constants';
import { canPlace } from './sim/layout';
import { Bot } from './sim/bot';
import type { Input, SimEvent } from './sim/sim';
import { decalCard, fmt, HUD_TIPS, partCard, roleVar, statsLine } from './ui/html';
import { applyBackdrop, chase, makeBulbs, MultDial, Odometer } from './ui/hud';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE = 'pinball-roguelite.run.v2';
const SLOTS = 'pinball-roguelite.slots.v1';
const THEME_KEY = 'pinball-roguelite.theme.v1';
const CALM_KEY = 'pinball-roguelite.calm.v1';
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

/** The three faces have to be loaded before Pixi measures any text. */
async function loadFonts() {
  const faces = ['400 20px "Luckiest Guy"', '500 14px Nunito', '600 14px Nunito', '700 14px Nunito', '800 14px Nunito'];
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
}

async function main() {
  await loadFonts();
  const game = new Game();
  try {
    const saved = store.get(STORE);
    const run = saved ? parseRun(saved) : null;
    if (run) game.load(run);
  } catch { /* storage can be blocked; the game works without it */ }
  const persist = () => store.set(STORE, JSON.stringify(game.save()));

  // there is no default machine: until the player picks one, the Factory stands in behind the picker
  const chosen = themeById(store.get(THEME_KEY));
  let theme: Theme = chosen ?? FACTORY;
  let calm = store.get(CALM_KEY) === '1';

  const renderer = new Renderer(theme);
  await renderer.init($('stage'));
  const overlay = new FxOverlay(theme);
  await overlay.init();
  const audio = new AudioFx();
  const odometer = new Odometer($('score'));
  const dial = new MultDial($('multDial'));

  // ---- state shared by input, workshop and HUD ------------------------------------------------
  const keys = new Set<string>();
  let nudgePulse = 0;
  /** An inventory part waiting to be placed: it follows the pointer until you click the table. */
  let armed: number | null = null;
  let selected: number | null = null;
  let hover: number | null = null;
  let hoverDecal: number | null = null;
  let selectedDecal: number | null = null;
  let dragging: { uid: number; dx: number; dy: number; moved: boolean } | null = null;
  let dragFromInventory = false;
  /** An offer being dragged out of the shop (slot null: the Test Lab catalog). */
  let shopDrag: { id: PartId; slot: number | null; x0: number; y0: number; moving: boolean; carry: boolean; el: HTMLElement } | null = null;
  /** A part picked up off the table with a click: it follows the pointer until the next click sets it down. */
  let carry: { uid: number; moved: boolean } | null = null;
  let pointer: { x: number; y: number } | null = null;
  let ledgerTimer = 0;
  let lastMultBand = 1;
  let lastStamp = 0;
  /** Coins still flying to the money stack: the balance counts them when they land. */
  let coinsInFlight = 0;
  const overlayEl = $('overlay');
  $('stage').appendChild($('upgradeBox')); // the upgrade picker floats over the top of the table
  const drawState: DrawState = { ghost: null, selectedUid: null, hoverUid: null, showHeat: false, hoverDecal: null };

  /** The backbox's dot-matrix display says it: the message scrolls in from the right. */
  const say = (text: string) => renderer.say(text);
  const sayKey = (k: CalloutKey, vars?: Record<string, string | number>) => say(callout(k, vars));
  say('INSERT COIN');

  /** What the recipe sentences need to know: this part type's level and the run's upgrades. */
  const ctxFor = (def: PartDef) => ({ level: game.levels[def.id] ?? 0, mods: game.mods });

  // ---- theme: tokens to CSS, the backdrop, the baked icons ----------------------------------------
  const icons = new Map<string, string>();
  const iconURL = (id: PartId | 'ball' | 'button', w = 84, h = 100, t = theme) => {
    const key = `${t.id}:${id}:${w}x${h}`;
    let url = icons.get(key);
    if (!url) { url = renderer.icon(id, w, h, { theme: t }).toDataURL(); icons.set(key, url); }
    return url;
  };
  const decalURL = (id: UpgradeId) => {
    const key = `${theme.id}:decal:${id}`;
    let url = icons.get(key);
    const look = game.decalLook(id);
    if (!url && look) { url = renderer.decalIcon(look, game.decalRarity(id), 56).toDataURL(); icons.set(key, url); }
    return url ?? '';
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
    $('themeRow').innerHTML = THEMES.map((th) => `<button data-theme="${th.id}" class="${th.id === t.id ? 'on' : ''}" style="background:${th.bg};color:${th.ink}">${th.tagline.split(' ')[0]}<span class="swatch">${[th.role.pop, th.role.coin, th.role.mega, th.accent].map((c) => `<i style="background:${c}"></i>`).join('')}</span></button>`).join('');
    for (const b of $('themeRow').querySelectorAll<HTMLButtonElement>('button[data-theme]')) b.onclick = () => { pickTheme(b.dataset.theme!); };
    upgradeKey = '';
    refreshWorkshop();
  }
  function pickTheme(id: string) {
    const t = themeById(id);
    if (!t) return;
    store.set(THEME_KEY, t.id);
    $('themePick').hidden = true;
    applyTheme(t);
    say(`${t.tagline}. LOOKS ONLY. SAME PHYSICS`);
  }
  function showThemePicker() {
    const box = $('themePick');
    box.innerHTML = `<div class="pickbox"><h2>Pick your machine</h2><div class="hint">A theme changes looks only: same parts, same physics. Change it any time under Machine.</div>
      <div class="cabs">${THEMES.map((t) => `<button class="cab" data-theme="${t.id}" style="background:${t.bg};color:${t.ink}">
        <img alt="" src="${iconURL('mega', 160, 120, t)}"><b>${t.tagline}</b><span>${t.laneWord.split('').join(' · ')} lanes · ${t.popMotif === 'rivets' ? 'riveted' : t.popMotif === 'awning' ? 'awning' : 'turret'} bumpers</span><span class="go">Play this machine</span></button>`).join('')}</div></div>`;
    box.hidden = false;
    for (const b of box.querySelectorAll<HTMLButtonElement>('.cab')) b.onclick = () => pickTheme(b.dataset.theme!);
  }

  function setCalm(on: boolean) {
    calm = on;
    store.set(CALM_KEY, on ? '1' : '0');
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
  const tipPart = (def: PartDef, inst: PartInstance | undefined, cx: number, cy: number, live: boolean) => {
    const tip = $('tip');
    tip.className = 'card tipcard';
    tip.style.setProperty('--head', roleVar(def.id));
    const row = inst ? game.scorer.ledger.get(inst.uid) : undefined;
    tip.innerHTML = partCard(def, inst, { ...ctxFor(def), scorer: live ? game.scorer : undefined, mult: game.scorer.mult }, {
      stats: live ? statsLine(row) : undefined,
      keys: inst?.fixed ? 'part of every machine: it stays where it is' : live ? (game.editable ? 'drag to move · R rotate · Del to toolbox' : 'in the workshop: drag, R rotate, Del to toolbox') : inst ? 'click it, then the table' : 'drag it onto the table, or Buy to put it in the toolbox',
    });
    tip.hidden = false;
    placeTip(cx, cy);
  };

  function offerHtml(id: PartId, price: number | null, index: number | null) {
    const def = PARTS[id];
    const btn = index === null
      ? `<button class="buy" data-add="${id}">Add</button>`
      : `${price! < def.cost ? `<s>$${def.cost}</s>` : ''}<button class="buy" data-buy="${index}" ${game.canAfford(price!) && game.editable && !game.toolboxFull ? '' : 'disabled'}>$${price}</button>`;
    return `<div class="offer" data-id="${id}"${index === null ? '' : ` data-slot="${index}"`}><div class="plinth" style="background:var(--role-${id}-tint)"><img alt="" src="${iconURL(id, 64, 64)}"></div>
      <div class="name">${def.name}</div><div class="buyrow">${btn}</div><div class="blurb">${def.blurb}</div></div>`;
  }

  /** Test Lab: every part in the game, free, instead of 4 rotating offers. */
  function renderCatalog() {
    $('shopMoney').textContent = '$∞';
    ($('btnReroll') as HTMLButtonElement).hidden = true;
    const box = $('offers');
    box.className = 'catalog';
    box.innerHTML = PART_IDS.map((id) => offerHtml(id, null, null)).join('');
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
        if (slot !== null && !game.canAfford(game.priceOf(def.id))) { sayKey('broke'); return; }
        audio.unlock();
        e.preventDefault();
        if (shopDrag?.carry) return; // the capture handler deals with a click while something is in hand
        shopDrag = { id: def.id, slot, x0: e.clientX, y0: e.clientY, moving: false, carry: false, el };
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
    $('offers').innerHTML = game.shop.offers.map((id, i) => (id ? offerHtml(id, game.priceOf(id), i) : `<div class="offer sold">Sold</div>`)).join('');
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
    const slots = Math.max(TOOLBOX_SLOTS, Math.ceil(inv.length / TOOLBOX_SLOTS) * TOOLBOX_SLOTS); // the Test Lab has no limit
    $('inventory').innerHTML = cells.join('') + '<div class="item empty"></div>'.repeat(slots - inv.length);
    // a part picked up from the toolbox can be sold right there: the latch becomes a Sell button with its price
    const held = selected !== null ? inv.find((p) => p.uid === selected) : undefined;
    const sell = $('toolSell') as HTMLButtonElement;
    sell.hidden = !held || !game.editable;
    $('inventoryBox').classList.toggle('selling', !sell.hidden);
    if (held) {
      sell.textContent = `SELL $${game.sandbox ? 0 : game.sellValue(PARTS[held.def])}`;
      sell.onclick = () => {
        const refund = game.sell(held.uid);
        selected = armed = null;
        audio.remove();
        say(refund ? `SOLD FOR $${refund}. NO REFUNDS ON FEELINGS` : 'SOLD. THE LAB GIVES NOTHING BACK');
        persist();
        refreshWorkshop();
      };
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

  function renderSelected() {
    const card = $('selected');
    const inst = game.part(selected ?? -1);
    card.hidden = !inst || !game.editable;
    if (!inst || !game.editable) return;
    const def = PARTS[inst.def];
    card.className = 'card tipcard';
    card.style.setProperty('--head', roleVar(def.id));
    card.innerHTML = `${partCard(def, inst, { ...ctxFor(def), scorer: game.scorer, mult: game.scorer.mult }, { recipe: false })}
      ${def.dials.map((d) => `<div class="dial"><div class="row2"><span>${d.label}</span><b id="dv-${d.id}">${d.fmt ? d.fmt(dialValue(inst, d.id)) : dialValue(inst, d.id)}</b></div>
        <input data-dial="${d.id}" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${dialValue(inst, d.id)}" /><div class="hint">${d.tradeoff}</div></div>`).join('')}
      <div class="live" id="selLive">${liveText(inst)}</div>
      ${inst.fixed ? '<div class="hint">Part of every machine: it stays where it is.</div>' : `<div class="btnrow">
        ${def.rotatable ? '<button id="btnRotL">⟲ 15°</button><button id="btnRotR">15° ⟳</button>' : ''}
        ${inst.placed ? '<button id="btnStore">To toolbox</button>' : ''}
        <button id="btnSell">Sell $${game.sellValue(def)}</button>
      </div>`}`;
    for (const input of card.querySelectorAll<HTMLInputElement>('input[data-dial]')) {
      for (const ev of ['pointerdown', 'keydown'] as const) input.addEventListener(ev, () => game.checkpoint());
      input.oninput = () => {
        const d = def.dials.find((x) => x.id === input.dataset.dial)!;
        game.setDial(inst.uid, d.id, Number(input.value));
        $(`dv-${d.id}`).textContent = d.fmt ? d.fmt(Number(input.value)) : input.value;
        // what it pays follows the dial
        const now = card.querySelector('.now');
        const fresh = partCard(def, inst, { ...ctxFor(def), scorer: game.scorer, mult: game.scorer.mult }, { recipe: false }).match(/<div class="now">([\s\S]*?)<\/div>/);
        if (now && fresh) now.innerHTML = fresh[1];
        persist();
      };
    }
    if (inst.fixed) return;
    const rot = (dir: number) => { game.rotate(inst.uid, dir * (Math.PI / 12)); persist(); };
    if (def.rotatable) { $('btnRotL').onclick = () => rot(1); $('btnRotR').onclick = () => rot(-1); }
    if (inst.placed) $('btnStore').onclick = () => storeSelected();
    $('btnSell').onclick = () => {
      const refund = game.sell(inst.uid);
      selected = armed = null;
      audio.remove();
      sayKey('sell');
      if (refund) say(`SOLD FOR $${refund}. NO REFUNDS ON FEELINGS`);
      persist();
      refreshWorkshop();
    };
  }

  /** The decal clicked on the apron: what it does, and (between rounds) the Peel button. */
  function renderDecal() {
    const card = $('decalCard');
    const d = selectedDecal !== null ? game.decals[selectedDecal] : undefined;
    card.hidden = !d || !game.editable;
    if (!d || !game.editable) return;
    const look = game.decalLook(d.id)!;
    card.className = 'card tipcard';
    card.innerHTML = `${decalCard(d.id, look.color, true)}<div class="btnrow"><button id="btnPeel">Peel it off</button></div>`;
    $('btnPeel').onclick = () => {
      const name = UPGRADES[d.id].name.toUpperCase();
      if (game.peel(selectedDecal!)) { selectedDecal = null; audio.remove(); say(`${name} PEELED. GONE FOR GOOD`); persist(); afterHistory(); }
    };
  }

  const liveText = (inst: PartInstance) => {
    const label = game.scorer.label(inst);
    const row = game.scorer.ledger.get(inst.uid);
    const out: string[] = [];
    if (label) out.push(`Pays right now: ${label}`);
    if (row) out.push(statsLine(row));
    return out.join('<br>') || 'Not hit yet.';
  };

  function storeSelected() {
    if (selected == null || !game.editable) return;
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

  // ---- major upgrades: the three cards, and the chips that list what the run has taken ----------------
  const offerTitle = (o: UpgradeOffer) => UPGRADES[o.id].name + (o.target ? ` · ${PARTS[o.target].name}s` : '');
  let upgradeKey = '';
  function renderUpgrades() {
    const box = $('upgradeBox');
    const show = game.pending !== null && game.editable;
    box.hidden = !show;
    const key = JSON.stringify([game.pending, game.picks, theme.id]);
    if (key !== upgradeKey) {
      upgradeKey = key;
      if (game.pending) {
        box.innerHTML = `<h3>Choose an upgrade<small>one of three for the rest of the run, or take $${SKIP_PAY} instead</small></h3>
          ${game.pending.map((o, i) => {
            const d = UPGRADES[o.id];
            const decal = d.column === 'rules' ? `<img class="decalimg" alt="" src="${decalURL(o.id)}">` : '';
            const full = d.column === 'rules' && !game.canTake(i) ? `<span class="full">Apron full: click a decal on the apron and peel it to make room</span>` : '';
            return `<button class="ucard c-${d.column} r-${d.rarity}" data-pick="${i}"><span class="head"><b>${offerTitle(o)}</b><span class="tag">${d.column === 'rules' ? 'DECAL' : COLUMN_NAMES[d.column].toUpperCase()}</span></span>
              ${decal}<span class="txt">${offerText(o)}</span><span class="rar">${d.rarity === 'legendary' && d.column === 'rules' ? 'WILD' : d.rarity.toUpperCase()}</span>${full}</button>`;
          }).join('')}
          <button id="btnSkip">Skip: take $${SKIP_PAY}</button>`;
        box.querySelectorAll<HTMLButtonElement>('button[data-pick]').forEach((b) => {
          b.onclick = () => {
            audio.unlock();
            const o = game.pending?.[Number(b.dataset.pick)];
            if (!game.chooseUpgrade(Number(b.dataset.pick))) { if (o && !game.canStick(o.id)) say('NO ROOM ON THE APRON. PEEL ONE FIRST'); return; }
            audio.goal();
            say(o && UPGRADES[o.id].column === 'rules' ? `${UPGRADES[o.id].name.toUpperCase()} STUCK ON THE APRON` : `${o ? UPGRADES[o.id].name.toUpperCase() : 'UPGRADE'} INSTALLED. THE MACHINE IS DIFFERENT NOW`);
            persist();
            afterHistory();
          };
        });
        ($('btnSkip') as HTMLButtonElement).onclick = () => { if (game.skipUpgrade()) { sayKey('skipped'); persist(); afterHistory(); } };
      }
      // the run's upgrades, grouped, with what each does on hover (Rules picks are decals on the apron instead)
      const groups = new Map<string, { o: UpgradeOffer; n: number }>();
      for (const p of game.picks) {
        if (UPGRADES[p.id].column === 'rules') continue;
        const k = `${p.id}:${p.target ?? ''}`;
        groups.set(k, { o: p, n: (groups.get(k)?.n ?? 0) + 1 });
      }
      $('upgradesBox').hidden = groups.size === 0;
      $('upgradeChips').innerHTML = [...groups.values()].map(({ o, n }) =>
        `<span class="chip" title="${offerText(o).replace(/"/g, '&quot;')}">${offerTitle(o)}${n > 1 ? ` ×${n}` : ''}</span>`).join('');
    }
  }

  function refreshWorkshop() {
    reportSold();
    if (carry && !game.part(carry.uid)?.placed) carry = null; // the part in hand was stored, sold or undone away
    if (selectedDecal !== null && !game.decals[selectedDecal]) selectedDecal = null;
    renderUpgrades();
    renderShop();
    renderInventory();
    renderSelected();
    renderDecal();
    updateStepper(); // the Play Round button follows a pick or a skip at once, not on the next frame
  }

  // ---- buying: drag an offer, or click it to pick it up, then drop it on the table (it lands on the board) or on
  // the toolbox. Nothing is paid until it is dropped; a right-click or Esc puts it back. Buy still goes to the toolbox.
  const dropShop = (d: NonNullable<typeof shopDrag>, cx: number, cy: number): boolean => {
    const over = document.elementFromPoint(cx, cy);
    let part: PartInstance | null = null;
    if (over === canvas) {
      const p = renderer.toSim(cx, cy);
      part = d.slot === null ? game.grantAndPlace(d.id, p.x, p.y) : game.buyAndPlace(d.slot, p.x, p.y);
      if (part) { selected = part.uid; if (d.slot !== null) audio.buy(); audio.place(); sayKey('place'); } else { say('NO ROOM THERE'); return false; }
    } else if (over?.closest('#inventoryBox')) {
      part = d.slot === null ? game.grant(d.id) : game.buy(d.slot);
      if (part) { selected = part.uid; audio.buy(); sayKey('buy'); } else { say(game.toolboxFull ? 'TOOLBOX FULL. DROP IT ON THE TABLE' : 'CANNOT AFFORD IT'); return false; }
    } else return false;
    persist();
    return true;
  };
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
    if (carry) { if (carry.moved) game.undo(); carry = null; audio.remove(); persist(); }
    armed = null;
    refreshWorkshop();
  }

  // ---- pointer: place, select, drag, store -------------------------------------------------------
  const canvas = renderer.app.canvas;
  const hitPart = (x: number, y: number) => {
    let best: PartInstance | undefined, bd = 1e9;
    for (const p of game.placed) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= footprint(PARTS[p.def]) + 0.3 && d < bd) { best = p; bd = d; }
    }
    return best;
  };

  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (!game.editable || e.button !== 0) return;
    const p = renderer.toSim(e.clientX, e.clientY);
    pointer = p;
    if (carry) { // a part picked up off the table: this click sets it down where it is
      carry = null;
      audio.place();
      persist();
      refreshWorkshop();
      return;
    }
    if (armed !== null) {
      if (game.place(armed, p.x, p.y, true)) {
        selected = armed;
        armed = null;
        audio.place();
        sayKey('place');
        persist();
      }
    } else {
      const hit = hitPart(p.x, p.y);
      const decal = renderer.decalAt(e.clientX, e.clientY);
      if (hit) {
        selected = hit.uid;
        selectedDecal = null;
        if (!hit.fixed) { // the Big Boi in the middle stays put
          dragging = { uid: hit.uid, dx: hit.x - p.x, dy: hit.y - p.y, moved: false };
          canvas.setPointerCapture(e.pointerId);
        }
      } else if (decal !== null && game.decals[decal]) {
        selectedDecal = decal;
        selected = null;
      } else { selected = null; selectedDecal = null; }
    }
    refreshWorkshop();
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = renderer.toSim(e.clientX, e.clientY);
    hover = hitPart(pointer.x, pointer.y)?.uid ?? null;
    hoverDecal = hover === null ? renderer.decalAt(e.clientX, e.clientY) : null;
    if (carry && game.editable) {
      if (game.place(carry.uid, pointer.x, pointer.y, !carry.moved)) carry.moved = true;
      const box = $('inventoryBox').getBoundingClientRect();
      $('inventoryBox').classList.toggle('drop', e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom);
    }
    if (dragging && game.editable) {
      if (game.place(dragging.uid, pointer.x + dragging.dx, pointer.y + dragging.dy, !dragging.moved)) {
        dragging.moved = true;
        const box = $('inventoryBox');
        const r = box.getBoundingClientRect();
        box.classList.toggle('drop', e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
      }
    }
    showTip(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (dragging) {
      // a click without a drag picks the part up: it follows the pointer until the next click
      if (!dragging.moved) { carry = { uid: dragging.uid, moved: false }; dragging = null; audio.pickUp(); refreshWorkshop(); return; }
      // dropped on the toolbox: take it off the board
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el?.closest('#inventoryBox')) storeSelected();
      else audio.place();
      persist();
      dragging = null;
      $('inventoryBox').classList.remove('drop');
      refreshWorkshop();
    }
  });
  // a part carried off the table can be put in the toolbox with a click on it
  $('inventoryBox').addEventListener('pointerdown', (e) => {
    if (!carry || e.button !== 0) return;
    e.stopPropagation();
    selected = carry.uid;
    carry = null;
    $('inventoryBox').classList.remove('drop');
    storeSelected();
  }, true);
  canvas.addEventListener('pointerleave', () => {
    pointer = null; hover = null; hoverDecal = null; $('tip').hidden = true;
    // a part in hand goes back to its spot when the pointer leaves the table (reaching for its card, say)
    if (carry) { if (carry.moved) { game.undo(); persist(); } carry = null; refreshWorkshop(); }
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  canvas.addEventListener('wheel', (e) => {
    const uid = armed ?? selected;
    if (uid == null || !game.editable) return;
    e.preventDefault();
    game.rotate(uid, (e.deltaY < 0 ? 1 : -1) * (Math.PI / 12));
  }, { passive: false });
  // dragging an inventory part onto the table: release over the canvas to place it
  addEventListener('pointerup', (e) => {
    if (!dragFromInventory || armed === null) { dragFromInventory = false; return; }
    dragFromInventory = false;
    if (e.target === canvas) {
      const p = renderer.toSim(e.clientX, e.clientY);
      if (game.place(armed, p.x, p.y, true)) {
        selected = armed;
        armed = null;
        audio.place();
        sayKey('place');
        persist();
        refreshWorkshop();
      }
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
    const inst = hover != null && !dragging ? game.part(hover) : undefined;
    if (inst) { tipPart(PARTS[inst.def], inst, cx, cy, true); return; }
    const d = hoverDecal !== null && !dragging ? game.decals[hoverDecal] : undefined;
    if (d) {
      const tip = $('tip');
      tip.className = 'card tipcard';
      tip.innerHTML = decalCard(d.id, game.decalLook(d.id)!.color, game.editable);
      tip.hidden = false;
      placeTip(cx, cy);
      return;
    }
    if (hoverDecal !== null && !dragging && game.decals.length < DECAL_SLOTS) {
      tipPlain('<b>Empty decal slot</b>: win a relic decal from the Rules column of a major upgrade (after every boss) and it sticks here.', cx, cy);
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
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyZ') nudgePulse = -1;
    if (e.code === 'KeyX') nudgePulse = 1;
    if (e.code === 'Tab') game.cashOut();
    if (e.code === 'Enter' && game.canStart && $('themePick').hidden && overlayEl.hidden) startRound();
    if (e.code === 'KeyM') say(audio.toggleMute() ? 'SOUND OFF. THE SILENCE IS LOUD' : 'SOUND ON');
    if (e.code === 'Space' && game.mode === 'workshop' && game.sim.ballCount === 0) { game.testBall(); sayKey('start'); }
    if (e.code === 'KeyR' && game.editable) {
      const uid = armed ?? selected;
      if (uid != null) { game.rotate(uid, (e.shiftKey ? -1 : 1) * (Math.PI / 12)); persist(); }
    }
    if ((e.code === 'Delete' || e.code === 'Backspace') && game.editable) storeSelected();
    if (e.code === 'Escape') { if (shopDrag || carry || armed !== null) cancelHold(); else { selected = null; selectedDecal = null; refreshWorkshop(); } }
    // 1, 2, 3 switch the machine's theme (a menu comes later)
    const ti = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (ti >= 0 && THEMES[ti] && THEMES[ti].id !== theme.id) pickTheme(THEMES[ti].id);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('click', (e) => { if (e.target instanceof HTMLButtonElement) e.target.blur(); });

  // on-screen controls for touch devices send the same key events the keyboard does
  for (const b of document.querySelectorAll<HTMLButtonElement>('#touch button')) {
    const code = b.dataset.key!;
    const fire = (type: 'keydown' | 'keyup') => dispatchEvent(new KeyboardEvent(type, { code }));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); fire('keydown'); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(t, () => fire('keyup'));
  }

  const readInput = (): Input => {
    const input: Input = {
      left: keys.has('ArrowLeft'),
      right: keys.has('ArrowRight'),
      plunge: keys.has('Space'),
      nudge: nudgePulse,
    };
    nudgePulse = 0;
    return input;
  };

  // ---- buttons -------------------------------------------------------------------------------------------
  function startRound() {
    if (!game.canStart) return;
    audio.unlock(); game.startRound(); armed = null; selected = null; selectedDecal = null; $('tip').hidden = true; refreshWorkshop(); sayKey('start'); persist();
  }
  $('btnStart').onclick = startRound;
  $('btnCash').onclick = () => game.cashOut();
  $('btnTest').onclick = () => { audio.unlock(); game.testBall(); sayKey('start'); };
  $('btnReset').onclick = () => { game.newRun(); armed = selected = null; selectedDecal = null; persist(); refreshWorkshop(); say('NEW RUN. SAME OLD PHYSICS'); };
  $('btnReroll').onclick = () => { if (game.reroll()) { sayKey('reroll'); persist(); } else sayKey('broke'); refreshWorkshop(); };
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
  const MUSIC_KEY = 'pinball-roguelite.music.v1';
  const musicBox = $('music') as HTMLInputElement;
  musicBox.checked = store.get(MUSIC_KEY) !== '0';
  audio.setMusic(musicBox.checked);
  musicBox.onchange = () => { audio.unlock(); audio.setMusic(musicBox.checked); store.set(MUSIC_KEY, musicBox.checked ? '1' : '0'); };
  const calmBox = $('calm') as HTMLInputElement;
  calmBox.checked = calm;
  calmBox.onchange = () => setCalm(calmBox.checked);

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
  labUpgrade.innerHTML = UPGRADE_IDS.map((id) => `<option value="${id}">${COLUMN_NAMES[UPGRADES[id].column]}: ${UPGRADES[id].name}</option>`).join('');
  $('labTake').onclick = () => {
    const id = labUpgrade.value as UpgradeId;
    if (game.labUpgrade(id)) say(`${UPGRADES[id].name.toUpperCase()} TAKEN. FREE. NOTHING COUNTS`);
    else say(game.canStick(id) ? 'NOTHING TO AIM THAT AT. OWN A PART FIRST' : 'NO ROOM ON THE APRON. PEEL ONE FIRST');
    afterHistory();
  };
  $('labDrop').onclick = () => { game.labClearUpgrades(); afterHistory(); };
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
        if (ev.reason === 'timeout' && game.mode === 'round') sayKey('clock'); else if (game.mode !== 'workshop' || ev.reason === 'timeout') sayKey('drain');
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
      case 'extraBall': sayKey('printed'); renderer.onBigMoment(); audio.goal(); renderer.bigBoiMood('shocked', 1.6); break;
      case 'partRelease': { const p = game.part(ev.uid); if (p) renderer.onRelease(p.x, p.y); break; }
      case 'ballSaved': {
        const saver = game.part(ev.uid);
        if (saver) renderer.onSaved(saver.x, saver.y);
        sayKey('saved'); renderer.onBigMoment(); audio.saved();
        break;
      }
      case 'partHit': if (ev.kicked) { audio.launch(70); sayKey('kicked'); } break;
      default: break;
    }
  };
  const moneyEl = () => $('coinStack');
  const landCoin = () => {
    coinsInFlight = Math.max(0, coinsInFlight - 1);
    const c = $('coinStack'), tick = $('moneyTick');
    c.classList.remove('land'); void c.offsetWidth; c.classList.add('land');
    audio.coinLand();
    tick.textContent = '+$1';
    tick.classList.remove('go'); void tick.offsetWidth; tick.classList.add('go');
  };
  const onScore = (s: ScoreEvent) => {
    renderer.onScore(s);
    // coins fly to the money stack, a rising Mult stamps and flies to the dial: effects point at their consequence
    if (s.money > 0 && !simulating) {
      const from = renderer.toClient(s.x, s.y, 1.1);
      for (let i = 0; i < s.money; i++) { coinsInFlight++; overlay.coin(from, () => rectCentre(moneyEl()), landCoin, i * 0.08); }
    }
    if (s.multAfter > s.multBefore + 1e-9 && !simulating) {
      const now = performance.now();
      if (s.kind === 'bonus' || now - lastStamp > 350) {
        lastStamp = now;
        overlay.stamp(`×${s.multAfter.toFixed(2)}`, roleFill(theme, s.def), renderer.toClient(s.x, s.y, 2), () => rectCentre($('multDial')), s.kind === 'bonus', () => { dial.kick(); audio.stamp(); });
      }
    }
    // every part has its own voice; a set or a level-up gets a fanfare and a shocked Big Boi
    if (s.kind === 'bonus') { audio.bonus(); say(s.label ?? 'BONUS!'); renderer.onBigMoment(); renderer.bigBoiMood('shocked', 1.6); }
    else audio.hit(s.def, s.multAfter, { spins: s.spins, tier: s.tier, points: s.points });
    // while you play, the display flashes every hit
    if (s.kind === 'hit' && game.mode === 'round') renderer.pop(`+${fmt(s.points)}`);
    const band = Math.floor(s.multAfter);
    if (band > lastMultBand) { sayKey('mult', { n: band }); renderer.bigBoiMood('shocked', 1.4); }
    lastMultBand = band;
  };
  const onGame = (g: GameEvent) => {
    if (g.type === 'goal') { audio.goal(); renderer.onBigMoment(); sayKey('goal'); }
    if (g.type === 'roundWon') { sayKey('roundWon'); showOverlay('won', g.payout); persist(); }
    if (g.type === 'runOver') { sayKey('runOver'); audio.gameOver(); renderer.bigBoiMood('sad', 30); showOverlay('over'); }
    if (g.type === 'ballEnd') lastMultBand = 1;
  };

  // overlayEl is declared up top (the keyboard needs it)
  function showOverlay(kind: 'won' | 'over', payout?: Payout) {
    overlayEl.hidden = false;
    overlayEl.classList.toggle('full', kind === 'over');
    if (kind === 'won' && payout) {
      overlayEl.innerHTML = `<div class="card"><h3>Round ${game.round} cleared!</h3>
        <div class="hint">Score ${fmt(game.scorer.score)} vs goal ${fmt(game.scorer.goal)}</div><br/>
        ${payout.lines.map((l) => `<div class="pay"><span>${l.label}</span><span>$${l.amount}</span></div>`).join('')}
        <div class="pay total"><span>Total</span><span>$${payout.total}</span></div><div class="hint">Cash on hand: $${game.money}. Spend it in the shop.</div><br/>
        <button class="primary disp" id="btnNext">${game.round % BOSS_EVERY === 0 ? 'Choose an upgrade' : 'To the workshop'}</button></div>`;
      ($('btnNext') as HTMLButtonElement).onclick = () => { overlayEl.hidden = true; game.continueAfterRound(); sayKey(game.pending ? 'upgrade' : 'workshop'); refreshWorkshop(); persist(); };
    } else {
      // the run in one card: how far along the map you got, your points, what your machine became
      const boss = game.round % BOSS_EVERY === 0;
      overlayEl.innerHTML = `<div class="card summary"><h3>Run over</h3>
        <div class="hint">${fmt(game.scorer.score)} of ${fmt(game.scorer.goal)} on round ${game.round}${boss ? ', a boss round' : ''}.</div>
        <div class="roundmap">${mapSvg(game.round)}</div>
        <div class="stats"><span><b>${game.round - 1}</b><small>rounds cleared</small></span><span><b>${fmt(game.runScore)}</b><small>total points</small></span><span><b>${game.placed.length}</b><small>parts on the table</small></span></div>
        <button class="primary disp" id="btnAgain">New run</button></div>`;
      ($('btnAgain') as HTMLButtonElement).onclick = () => { overlayEl.hidden = true; game.newRun(); persist(); sayKey('workshop'); refreshWorkshop(); };
    }
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
    if (mode === keysKey) return;
    keysKey = mode;
    const k = (key: string, what: string) => `<kbd>${key}</kbd><span>${what}</span>`;
    $('keys').innerHTML = mode === 'play'
      ? [k('←', ''), k('→', 'flippers'), k('Space', 'shoot'), k('Z', ''), k('X', 'nudge'), k('Tab', 'cash out'), k('M', 'mute')].join(' ')
      : [k('Enter', 'play round'), k('Space', 'test ball'), k('R', 'rotate'), k('Del', 'to toolbox'), k('Ctrl+Z', 'undo'), k('M', 'mute')].join(' ');
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

  function updateHud(dt: number) {
    const sc = game.scorer;
    const inRound = game.mode === 'round' || game.mode === 'roundEnd' || game.mode === 'runOver';
    // the scoreboard says which half of the loop you are in: the workshop (buy and place), or play
    const playing = game.mode !== 'workshop';
    $('phaseTitle').textContent = playing ? 'PLAY' : 'WORKSHOP';
    document.body.classList.toggle('playing', playing);
    odometer.set(sc.score);
    renderer.idle(playing ? fmt(sc.score) : `ROUND ${game.round}  GOAL ${fmt(goalFor(game.round))}`);
    $('mult').textContent = `×${sc.mult.toFixed(2)}`;
    $('mult').classList.toggle('hot', sc.mult >= 2);
    dial.set(sc.mult, theme);
    const money = game.money + (inRound ? sc.money : 0) - coinsInFlight;
    $('shopMoney').textContent = game.sandbox ? '$∞' : `$${Math.max(0, money)}`;
    renderMap();
    const goal = inRound ? sc.goal : goalFor(game.round);
    $('goal').textContent = fmt(goal);
    $('toGo').textContent = inRound ? (sc.goalReached ? 'GOAL HIT!' : `${fmt(Math.max(0, goal - sc.score))} to go`) : 'next round';
    $('goalFill').style.width = inRound ? `${Math.min(100, (sc.score / goal) * 100)}%` : '0%';
    $('goalFill').parentElement!.classList.toggle('hit', inRound && sc.goalReached);
    updateBalls(inRound);
    $('tiltFill').style.width = `${Math.min(100, game.sim.tiltMeter * 100)}%`;
    $('tiltFill').classList.toggle('danger', game.sim.tiltMeter > 0.55 || game.sim.tilted);
    const clock = game.sim.clockLeft;
    $('clockBox').hidden = game.mode !== 'round';
    $('clockSec').textContent = clock === null ? `${game.sim.clockTotal} s` : `${Math.ceil(clock)} s`;
    $('clockFill').style.width = `${clock === null ? 100 : (clock / game.sim.clockTotal) * 100}%`;
    $('clockFill').classList.toggle('low', clock !== null && clock < 10);
    updateStepper();
    updateKeys();
    const cash = $('btnCash') as HTMLButtonElement;
    cash.hidden = game.mode !== 'round';
    cash.disabled = !(game.mode === 'round' && sc.goalReached);
    $('workshop').hidden = game.mode !== 'workshop';
    ($('btnUndo') as HTMLButtonElement).disabled = !game.canUndo;
    ($('btnRedo') as HTMLButtonElement).disabled = !game.canRedo;
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
        if (inst) $('selLive').innerHTML = liveText(inst);
      }
    }
  }

  // ---- main loop ------------------------------------------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let frames = 0, fpsClock = 0, bulbClock = 0, bulbPhase = 0;
  // Test hooks (used by tools/smoke.cjs): drive the sim deterministically instead of in real time.
  let frozen = false;
  /** True while a test hook runs many seconds of sim in one go: no effects fly to the HUD then. */
  let simulating = false;
  const debug = {
    game, keys, renderer, fps: 0, steps: 0,
    freeze(v = true) { frozen = v; },
    /** Run `seconds` of sim time with the bot at the controls, drawing at 60 fps of sim time. */
    advance(seconds: number, seed = 1, skill = 0.9) {
      const bot = new Bot(seed, skill);
      const frames = Math.round(seconds * 60);
      simulating = true;
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
    theme: (id: string) => pickTheme(id),
    refresh: () => refreshWorkshop(),
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
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (!frozen && acc >= DT && n < 24) {
      stepOnce(readInput());
      acc -= DT;
      n++;
    }
    if (n === 24) acc = 0;

    drawState.selectedUid = game.editable ? selected : null;
    drawState.hoverUid = hover;
    drawState.hoverDecal = hoverDecal;
    const armedPart = armed != null ? game.part(armed) : undefined;
    drawState.ghost = game.editable && (shopDrag?.moving || shopDrag?.carry) && pointer
      ? { def: shopDrag.id, x: pointer.x, y: pointer.y, angle: 0, valid: canPlace(game.layout, shopDrag.id, pointer.x, pointer.y) }
      : game.editable && armedPart && pointer
        ? { def: armedPart.def, x: pointer.x, y: pointer.y, angle: armedPart.angle, valid: canPlace(game.layout, armedPart.def, pointer.x, pointer.y) }
        : null;
    renderer.draw(game, dt, drawState);
    updateHud(dt);
    // the marquee bulbs chase (they hold still in Calm mode)
    bulbClock += dt;
    if (!calm && bulbClock > 0.35) { bulbClock = 0; chase(document, ++bulbPhase); }

    frames++;
    fpsClock += dt;
    if (fpsClock >= 1) { debug.fps = Math.round(frames / fpsClock); frames = 0; fpsClock = 0; }
  });

  makeBulbs(document);
  setCalm(calm);
  applyTheme(theme);
  if (!chosen) showThemePicker();
  renderer.draw(game, 0, drawState);
  sayKey('workshop');
}

void main();
