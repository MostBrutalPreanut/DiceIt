import './style.css';
import { callout, type CalloutKey } from './data/callouts';
import { dialValue, footprint, PART_IDS, PARTS, sellPrice, type PartInstance } from './data/parts';
import { AudioFx } from './audio';
import { Game, goalFor, parseRun, type Arrangement, type GameEvent, type Payout } from './game/game';
import type { ScoreEvent } from './game/scoring';
import { Renderer, type DrawState } from './render/renderer';
import { DT } from './sim/constants';
import { canPlace } from './sim/layout';
import { Bot } from './sim/bot';
import type { Input, SimEvent } from './sim/sim';
import { css, descHtml, dot, fmt, tipHtml } from './ui/html';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE = 'pinball-roguelite.run.v2';
const SLOTS = 'pinball-roguelite.slots.v1';

async function main() {
  const game = new Game();
  try {
    const saved = localStorage.getItem(STORE);
    const run = saved ? parseRun(saved) : null;
    if (run) game.load(run);
  } catch { /* storage can be blocked; the game works without it */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(game.save())); } catch { /* ignore */ } };

  const renderer = new Renderer();
  await renderer.init($('stage'));
  const audio = new AudioFx();

  // ---- state shared by input, workshop and HUD ------------------------------------------------
  const keys = new Set<string>();
  let nudgePulse = 0;
  /** An inventory part waiting to be placed: it follows the pointer until you click the table. */
  let armed: number | null = null;
  let selected: number | null = null;
  let hover: number | null = null;
  let dragging: { uid: number; dx: number; dy: number; moved: boolean } | null = null;
  let dragFromInventory = false;
  let pointer: { x: number; y: number } | null = null;
  let ledgerTimer = 0;
  let lastMultBand = 1;
  const drawState: DrawState = { ghost: null, selectedUid: null, hoverUid: null, showHeat: false };

  const say = (text: string) => {
    const el = $('dmdText');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };
  const sayKey = (k: CalloutKey, vars?: Record<string, string | number>) => say(callout(k, vars));
  say('INSERT COIN');

  // ---- workshop panels: shop, inventory, selected part ---------------------------------------------
  /** Test Lab: every part in the game, free, instead of 4 rotating offers. */
  function renderCatalog() {
    $('shopMoney').textContent = '∞';
    ($('btnReroll') as HTMLButtonElement).hidden = true;
    const box = $('offers');
    box.className = 'catalog';
    box.innerHTML = PART_IDS.map((id) => {
      const def = PARTS[id];
      return `<div class="offer" data-id="${id}"><div class="top">${dot(def)}<span class="name">${def.name}</span><span class="cost">free</span>
        <button data-add="${id}">Add</button></div><div class="hint">${def.blurb}</div>${descHtml(def, undefined, game.levels[id] ?? 0)}</div>`;
    }).join('');
    box.querySelectorAll<HTMLElement>('.offer').forEach((el) => {
      const def = PARTS[el.dataset.id as keyof typeof PARTS];
      el.onmouseenter = (e) => showDefTip(def, undefined, e.clientX, e.clientY);
      el.onmousemove = (e) => placeTip(e.clientX, e.clientY);
      el.onmouseleave = () => { $('tip').hidden = true; };
    });
    for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-add]')) {
      b.onclick = () => {
        audio.unlock();
        const part = game.grant(b.dataset.add as keyof typeof PARTS);
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

  function renderShop() {
    if (game.sandbox) { renderCatalog(); return; }
    $('offers').className = '';
    ($('btnReroll') as HTMLButtonElement).hidden = false;
    $('shopMoney').textContent = `$${game.money}`;
    const rb = $('btnReroll') as HTMLButtonElement;
    rb.textContent = game.rerollCost ? `Reroll $${game.rerollCost}` : 'Reroll (free)';
    rb.disabled = !game.canAfford(game.rerollCost);
    $('offers').innerHTML = game.shop.offers.map((id, i) => {
      if (!id) return `<div class="offer sold"><div class="top"><span class="name">Sold</span></div></div>`;
      const def = PARTS[id];
      return `<div class="offer"><div class="top">${dot(def)}<span class="name">${def.name}</span><span class="cost">$${def.cost}</span>
        <button data-buy="${i}" ${game.canAfford(def.cost) ? '' : 'disabled'}>Buy</button></div>
        <div class="hint">${def.blurb}</div>${descHtml(def)}</div>`;
    }).join('');
    const slotIds = game.shop.offers.map((id, i) => ({ id, i })).filter((o) => o.id);
    $('offers').querySelectorAll<HTMLElement>('.offer:not(.sold)').forEach((el, n) => {
      const def = PARTS[slotIds[n].id!];
      el.onmouseenter = (e) => showDefTip(def, undefined, e.clientX, e.clientY);
      el.onmousemove = (e) => placeTip(e.clientX, e.clientY);
      el.onmouseleave = () => { $('tip').hidden = true; };
    });
    for (const b of $('offers').querySelectorAll<HTMLButtonElement>('button[data-buy]')) {
      b.onclick = () => {
        audio.unlock();
        const part = game.buy(Number(b.dataset.buy));
        if (!part) { sayKey('broke'); return; }
        armed = part.uid;
        selected = part.uid;
        audio.place();
        sayKey('buy');
        persist();
        refreshWorkshop();
      };
    }
  }

  function renderInventory() {
    const inv = game.inventory;
    $('inventoryHint').hidden = inv.length > 0;
    $('inventory').innerHTML = inv.map((p) => {
      const def = PARTS[p.def];
      return `<div class="item ${armed === p.uid ? 'armed' : ''} ${selected === p.uid ? 'sel' : ''}" data-uid="${p.uid}">
        <div class="top">${dot(def)}<span class="name">${def.name}</span><span class="hint">${armed === p.uid ? 'click the table' : 'click to place'}</span></div></div>`;
    }).join('');
    for (const el of $('inventory').querySelectorAll<HTMLElement>('.item')) {
      const part = game.part(Number(el.dataset.uid))!;
      el.onmouseenter = (e) => showDefTip(PARTS[part.def], part, e.clientX, e.clientY);
      el.onmouseleave = () => { $('tip').hidden = true; };
      el.addEventListener('pointerdown', (e) => {
        audio.unlock();
        e.preventDefault();
        $('tip').hidden = true;
        const uid = Number(el.dataset.uid);
        armed = armed === uid && !dragFromInventory ? null : uid;
        selected = uid;
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
    const row = game.scorer.ledger.get(inst.uid);
    card.innerHTML = `
      <h3>${dot(def)}${def.name} <span class="hint" style="margin-left:auto">${inst.placed ? 'on the board' : 'in inventory'}</span></h3>
      <div class="blurb">${def.blurb}</div>
      ${descHtml(def, inst, game.levels[def.id] ?? 0)}
      ${def.dials.map((d) => `<div class="dial"><div class="row2"><span>${d.label}</span><b id="dv-${d.id}">${d.fmt ? d.fmt(dialValue(inst, d.id)) : dialValue(inst, d.id)}</b></div>
        <input data-dial="${d.id}" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${dialValue(inst, d.id)}" /><div class="hint">${d.tradeoff}</div></div>`).join('')}
      <div class="live" id="selLive">${liveText(inst)}</div>
      <div class="btnrow">
        ${def.rotatable ? '<button id="btnRotL">⟲ 15°</button><button id="btnRotR">15° ⟳</button>' : ''}
        ${inst.placed ? '<button id="btnStore">Store</button>' : ''}
        <button id="btnSell">Sell $${sellPrice(def)}</button>
      </div>`;
    for (const input of card.querySelectorAll<HTMLInputElement>('input[data-dial]')) {
      for (const ev of ['pointerdown', 'keydown'] as const) input.addEventListener(ev, () => game.checkpoint());
      input.oninput = () => {
        const d = def.dials.find((x) => x.id === input.dataset.dial)!;
        game.setDial(inst.uid, d.id, Number(input.value));
        $(`dv-${d.id}`).textContent = d.fmt ? d.fmt(Number(input.value)) : input.value;
        // the recipe text follows the dial
        card.querySelector('.desc')!.outerHTML = descHtml(def, inst, game.levels[def.id] ?? 0);
        persist();
      };
    }
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

  const liveText = (inst: PartInstance) => {
    const label = game.scorer.label(inst);
    const row = game.scorer.ledger.get(inst.uid);
    const out: string[] = [];
    if (label) out.push(`Pays right now: ${label}`);
    if (row) out.push(`This round: ${row.hits} hits, ${fmt(row.points)} points`);
    return out.join('<br>') || 'Not hit yet.';
  };

  function storeSelected() {
    if (selected == null || !game.editable) return;
    game.store(selected);
    audio.remove();
    sayKey('store');
    persist();
    refreshWorkshop();
  }

  function refreshWorkshop() {
    renderShop();
    renderInventory();
    renderSelected();
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
      if (hit) {
        selected = hit.uid;
        dragging = { uid: hit.uid, dx: hit.x - p.x, dy: hit.y - p.y, moved: false };
        canvas.setPointerCapture(e.pointerId);
      } else selected = null;
    }
    refreshWorkshop();
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = renderer.toSim(e.clientX, e.clientY);
    hover = hitPart(pointer.x, pointer.y)?.uid ?? null;
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
      // dropped on the inventory panel: take it off the board
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el?.closest('#inventoryBox')) storeSelected();
      persist();
      dragging = null;
      $('inventoryBox').classList.remove('drop');
      refreshWorkshop();
    }
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; hover = null; $('tip').hidden = true; });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); armed = null; refreshWorkshop(); });
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
    tip.style.left = `${Math.max(8, Math.min(cx - w - 16, innerWidth - w - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(cy + 12, innerHeight - h - 8))}px`;
  }
  /** The full recipe of a part, shown while hovering a shop offer or an inventory item. */
  function showDefTip(def: (typeof PARTS)[keyof typeof PARTS], inst: PartInstance | undefined, cx: number, cy: number) {
    const tip = $('tip');
    tip.innerHTML = `<h4>${dot(def)}${def.name}</h4><div class="hint">${def.blurb}</div>${descHtml(def, inst, game.levels[def.id] ?? 0)}`;
    tip.hidden = false;
    placeTip(cx, cy);
  }

  function showTip(cx: number, cy: number) {
    const tip = $('tip');
    const inst = hover != null && !dragging ? game.part(hover) : undefined;
    if (!inst) { tip.hidden = true; return; }
    tip.innerHTML = tipHtml(inst, { label: game.scorer.label(inst), row: game.scorer.ledger.get(inst.uid), level: game.scorer.levelOf(inst.def) });
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(cx + 16, innerWidth - w - 8)}px`;
    tip.style.top = `${Math.min(cy + 12, innerHeight - h - 8)}px`;
  }

  // ---- keyboard ---------------------------------------------------------------------------------------
  const GAME_KEYS = new Set(['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Slash', 'KeyZ', 'ShiftLeft', 'ShiftRight']);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT') return;
    audio.unlock();
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
      e.preventDefault();
      if (e.code === 'KeyY' || e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'ArrowLeft') nudgePulse = -1;
    if (e.code === 'ArrowRight') nudgePulse = 1;
    if (e.code === 'Tab') game.cashOut();
    if (e.code === 'KeyM') say(audio.toggleMute() ? 'SOUND OFF. THE SILENCE IS LOUD' : 'SOUND ON');
    if (e.code === 'Space' && game.mode === 'workshop' && game.sim.ballCount === 0) { game.testBall(); sayKey('start'); }
    if (e.code === 'KeyR' && game.editable) {
      const uid = armed ?? selected;
      if (uid != null) { game.rotate(uid, (e.shiftKey ? -1 : 1) * (Math.PI / 12)); persist(); }
    }
    if ((e.code === 'Delete' || e.code === 'Backspace') && game.editable) storeSelected();
    if (e.code === 'Escape') { armed = null; selected = null; refreshWorkshop(); }
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
      left: keys.has('KeyZ') || keys.has('ShiftLeft'),
      right: keys.has('Slash') || keys.has('ShiftRight'),
      plunge: keys.has('Space'),
      nudge: nudgePulse,
    };
    nudgePulse = 0;
    return input;
  };

  // ---- buttons -------------------------------------------------------------------------------------------
  $('btnStart').onclick = () => { audio.unlock(); game.startRound(); armed = null; selected = null; $('tip').hidden = true; refreshWorkshop(); sayKey('start'); persist(); };
  $('btnCash').onclick = () => game.cashOut();
  $('btnTest').onclick = () => { audio.unlock(); game.testBall(); sayKey('start'); };
  $('btnReset').onclick = () => { game.newRun(); armed = selected = null; persist(); refreshWorkshop(); say('NEW RUN. SAME OLD PHYSICS'); };
  $('btnReroll').onclick = () => { if (game.reroll()) { sayKey('reroll'); persist(); } else sayKey('broke'); refreshWorkshop(); };
  const sandbox = $('sandbox') as HTMLInputElement;
  sandbox.checked = game.sandbox;
  sandbox.onchange = () => { game.sandbox = sandbox.checked; persist(); refreshWorkshop(); say(sandbox.checked ? 'TEST LAB OPEN. NOTHING HERE COUNTS' : 'BACK TO REAL MONEY'); };
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
  $('btnHeatClear').onclick = () => game.clearHeat();

  const readSlots = (): (Arrangement | null)[] => {
    try { const v = JSON.parse(localStorage.getItem(SLOTS) ?? 'null'); if (Array.isArray(v)) return [v[0] ?? null, v[1] ?? null, v[2] ?? null]; } catch { /* ignore */ }
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
        try { localStorage.setItem(SLOTS, JSON.stringify(all)); } catch { /* ignore */ }
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
  $('labLevelUp').onclick = () => { game.levelAll(1); afterHistory(); };
  $('labLevelDown').onclick = () => { game.levelAll(-1); afterHistory(); };

  // ---- game event handling -----------------------------------------------------------------------------------
  const onSimEvent = (ev: SimEvent) => {
    switch (ev.type) {
      case 'flipper': audio.flipper(ev.on); break;
      case 'launch': audio.launch(ev.power); if (ev.power < 62) sayKey('weakPlunge'); break;
      case 'drain': audio.drain(); if (game.mode !== 'workshop' || ev.reason === 'timeout') sayKey('drain'); break;
      case 'nudge': audio.nudge(); break;
      case 'tilt': audio.tilt(); renderer.onTilt(); sayKey('tilt'); break;
      case 'ballSearch': sayKey('search'); break;
      case 'rescue': sayKey('rescue'); break;
      case 'extraBall': sayKey('printed'); renderer.onBigMoment(); audio.goal(); break;
      default: break;
    }
  };
  const onScore = (s: ScoreEvent) => {
    renderer.onScore(s);
    if (s.kind === 'bonus') { audio.goal(); say(s.label ?? 'BONUS!'); renderer.onBigMoment(); }
    else if (s.kind === 'light') audio.place();
    else audio.bumper(s.multAfter, PARTS[s.def].recipe.money !== undefined);
    const band = Math.floor(s.multAfter);
    if (band > lastMultBand) sayKey('mult', { n: band });
    lastMultBand = band;
  };
  const onGame = (g: GameEvent) => {
    if (g.type === 'goal') { audio.goal(); renderer.onBigMoment(); sayKey('goal'); }
    if (g.type === 'roundWon') { sayKey('roundWon'); showOverlay('won', g.payout); persist(); }
    if (g.type === 'runOver') { sayKey('runOver'); showOverlay('over'); }
    if (g.type === 'ballEnd') lastMultBand = 1;
  };

  const overlay = $('overlay');
  function showOverlay(kind: 'won' | 'over', payout?: Payout) {
    overlay.hidden = false;
    if (kind === 'won' && payout) {
      overlay.innerHTML = `<div class="card"><h3>Round ${game.round} cleared!</h3>
        <div class="hint">Score ${fmt(game.scorer.score)} vs goal ${fmt(game.scorer.goal)}</div><br/>
        ${payout.lines.map((l) => `<div class="pay"><span>${l.label}</span><span>$${l.amount}</span></div>`).join('')}
        <div class="pay total"><span>Total</span><span>$${payout.total}</span></div><div class="hint">Cash on hand: $${game.money}. Spend it in the shop.</div><br/>
        <button class="primary" id="btnNext">To the workshop</button></div>`;
      ($('btnNext') as HTMLButtonElement).onclick = () => { overlay.hidden = true; game.continueAfterRound(); sayKey('workshop'); refreshWorkshop(); persist(); };
    } else {
      overlay.innerHTML = `<div class="card"><h3>Run over</h3>
        <div class="hint">Score ${fmt(game.scorer.score)} vs goal ${fmt(game.scorer.goal)} on round ${game.round}.</div><br/>
        <button class="primary" id="btnAgain">New run</button></div>`;
      ($('btnAgain') as HTMLButtonElement).onclick = () => { overlay.hidden = true; game.newRun(); persist(); sayKey('workshop'); refreshWorkshop(); };
    }
  }

  // ---- HUD ------------------------------------------------------------------------------------------------------
  function updateHud(dt: number) {
    const sc = game.scorer;
    const inRound = game.mode === 'round' || game.mode === 'roundEnd' || game.mode === 'runOver';
    $('modeBadge').textContent = game.mode === 'workshop' ? (game.sandbox ? 'WORKSHOP · TEST LAB' : 'WORKSHOP') : `ROUND ${game.round}`;
    $('score').textContent = fmt(sc.score);
    $('mult').textContent = `×${sc.mult.toFixed(2)}`;
    $('mult').classList.toggle('hot', sc.mult >= 2);
    $('money').textContent = game.sandbox ? '$∞' : `$${game.money + (inRound ? sc.money : 0)}`;
    $('round').textContent = String(game.round);
    const goal = inRound ? sc.goal : goalFor(game.round);
    $('goal').textContent = fmt(goal);
    $('goalFill').style.width = inRound ? `${Math.min(100, (sc.score / goal) * 100)}%` : '0%';
    $('balls').textContent = inRound ? '●'.repeat(Math.max(0, game.ballsLeft)) + '○'.repeat(Math.max(0, 3 - game.ballsLeft)) : '∞';
    $('tiltFill').style.width = `${Math.min(100, game.sim.tiltMeter * 100)}%`;
    ($('btnStart') as HTMLButtonElement).hidden = game.mode !== 'workshop';
    ($('btnCash') as HTMLButtonElement).hidden = !(game.mode === 'round' && sc.goalReached);
    $('workshop').hidden = game.mode !== 'workshop';
    ($('btnUndo') as HTMLButtonElement).disabled = !game.canUndo;
    ($('btnRedo') as HTMLButtonElement).disabled = !game.canRedo;
    $('labTools').hidden = !game.sandbox;

    ledgerTimer += dt;
    if (ledgerTimer > 0.12) {
      ledgerTimer = 0;
      const rows = sc.ledgerRows();
      const total = rows.reduce((a, r) => a + r.points, 0) || 1;
      $('ledgerEmpty').hidden = rows.length > 0;
      $('ledger').hidden = rows.length === 0;
      $('ledger').querySelector('tbody')!.innerHTML = rows.map((r) => {
        const d = PARTS[r.def];
        return `<tr><td class="name"><i style="background:${css(d.color)}"></i>${d.name} #${r.uid}</td>
          <td>${r.hits}</td><td>${fmt(r.points)}</td><td style="width:60px"><div class="share" style="width:${Math.round((r.points / total) * 100)}%"></div></td></tr>`;
      }).join('');
      if (game.editable && selected != null && $('selLive')) {
        const inst = game.part(selected);
        if (inst) $('selLive').innerHTML = liveText(inst);
      }
    }
  }

  // ---- main loop ------------------------------------------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let frames = 0, fpsClock = 0;
  // Test hooks (used by tools/smoke.cjs): drive the sim deterministically instead of in real time.
  let frozen = false;
  const debug = {
    game, keys, fps: 0, steps: 0,
    freeze(v = true) { frozen = v; },
    /** Run `seconds` of sim time with the bot at the controls, drawing at 60 fps of sim time. */
    advance(seconds: number, seed = 1, skill = 0.9) {
      const bot = new Bot(seed, skill);
      const frames = Math.round(seconds * 60);
      for (let f = 0; f < frames; f++) {
        for (let i = 0; i < 4; i++) stepOnce(bot.decide(game.sim));
        renderer.draw(game, 1 / 60, drawState);
        updateHud(1 / 60);
      }
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
    const armedPart = armed != null ? game.part(armed) : undefined;
    drawState.ghost = game.editable && armedPart && pointer
      ? { def: armedPart.def, x: pointer.x, y: pointer.y, angle: armedPart.angle, valid: canPlace(game.layout, armedPart.def, pointer.x, pointer.y) }
      : null;
    renderer.draw(game, dt, drawState);
    updateHud(dt);

    frames++;
    fpsClock += dt;
    if (fpsClock >= 1) { debug.fps = Math.round(frames / fpsClock); frames = 0; fpsClock = 0; }
  });

  refreshWorkshop();
  sayKey('workshop');
}

void main();
