import './style.css';
import { callout, type CalloutKey } from './data/callouts';
import { PARTS, PART_IDS, payoutFactor, type PartId } from './data/parts';
import { AudioFx } from './audio';
import { Game, goalFor, type GameEvent, type Payout } from './game/game';
import type { ScoreEvent } from './game/scoring';
import { Renderer, type DrawState } from './render/renderer';
import { DT } from './sim/constants';
import { canPlace, loadLayout, saveLayout, starterLayout } from './sim/layout';
import { Bot } from './sim/bot';
import type { Input, SimEvent } from './sim/sim';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE = 'pinball-roguelite.layout.v1';

const fmt = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n).toLocaleString('en-US'));

async function main() {
  const game = new Game();
  try {
    const saved = localStorage.getItem(STORE);
    const l = saved ? loadLayout(saved) : null;
    if (l) {
      game.layout = l;
      game.toWorkshop();
    }
  } catch { /* storage can be blocked; the game works without it */ }
  const persist = () => { try { localStorage.setItem(STORE, saveLayout(game.layout)); } catch { /* ignore */ } };

  const renderer = new Renderer();
  await renderer.init($('stage'));
  const audio = new AudioFx();

  // ---- state shared by input, workshop and HUD ------------------------------------------------
  const keys = new Set<string>();
  let nudgePulse = 0;
  let tool: PartId | null = null;
  let selected: number | null = null;
  let dragging: { uid: number; dx: number; dy: number } | null = null;
  let pointer: { x: number; y: number } | null = null;
  const drawState: DrawState = { ghost: null, selectedUid: null };
  let ledgerTimer = 0;
  let lastMultBand = 1;

  const say = (text: string) => {
    const el = $('dmdText');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };
  const sayKey = (k: CalloutKey, vars?: Record<string, string | number>) => say(callout(k, vars));
  say('INSERT COIN');

  // ---- palette + selected-part card ---------------------------------------------------------------
  const palette = $('palette');
  for (const id of PART_IDS) {
    const def = PARTS[id];
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.id = id;
    b.innerHTML = `<i style="color:#${def.color.toString(16).padStart(6, '0')}"></i><span>${def.name}<small>${def.blurb}</small></span>`;
    b.onclick = () => { tool = tool === id ? null : id; selected = null; refreshWorkshop(); };
    palette.appendChild(b);
  }

  function refreshWorkshop() {
    for (const b of palette.querySelectorAll<HTMLButtonElement>('.tool')) b.classList.toggle('active', b.dataset.id === tool);
    const card = $('selected');
    const inst = game.layout.parts.find((p) => p.uid === selected);
    card.hidden = !inst || !game.editable;
    if (!inst) return;
    const def = PARTS[inst.def];
    const perHit = Math.round(def.basePoints * payoutFactor(inst.kick));
    card.innerHTML = `
      <h3>${def.name} #${inst.uid}</h3>
      <label>${def.kick.label} <b id="kickVal">${inst.kick.toFixed(2)}</b>
        <input id="kick" type="range" min="${def.kick.min}" max="${def.kick.max}" step="${def.kick.step}" value="${inst.kick}" />
      </label>
      <div class="hint">${def.kick.tradeoff}</div>
      <div class="pay"><span>Base per hit</span><b id="perHit">${perHit}</b></div>
      <div class="pay"><span>Mult gain per hit</span><b>+${def.multGain}</b></div>
      <button id="btnRemove" style="margin-top:8px">Remove (Del)</button>`;
    ($('kick') as HTMLInputElement).oninput = (e) => {
      const k = Number((e.target as HTMLInputElement).value);
      game.setKick(inst.uid, k);
      $('kickVal').textContent = k.toFixed(2);
      $('perHit').textContent = String(Math.round(def.basePoints * payoutFactor(k)));
      persist();
    };
    $('btnRemove').onclick = removeSelected;
  }

  function removeSelected() {
    if (selected == null || !game.editable) return;
    game.removePart(selected);
    selected = null;
    audio.remove();
    sayKey('remove');
    persist();
    refreshWorkshop();
  }

  // ---- pointer: place, select, drag ----------------------------------------------------------------
  const canvas = renderer.app.canvas;
  const hitPart = (x: number, y: number) =>
    game.layout.parts.find((p) => Math.hypot(p.x - x, p.y - y) <= PARTS[p.def].radius + 0.3);

  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (!game.editable || e.button !== 0) return;
    const p = renderer.toSim(e.clientX, e.clientY);
    const hit = hitPart(p.x, p.y);
    if (hit) {
      selected = hit.uid;
      tool = null;
      dragging = { uid: hit.uid, dx: hit.x - p.x, dy: hit.y - p.y };
      canvas.setPointerCapture(e.pointerId);
    } else if (tool) {
      const inst = game.placePart(tool, p.x, p.y);
      if (inst) {
        selected = inst.uid;
        audio.place();
        sayKey('place');
        persist();
      }
    } else {
      selected = null;
    }
    refreshWorkshop();
  });
  canvas.addEventListener('pointermove', (e) => {
    pointer = renderer.toSim(e.clientX, e.clientY);
    if (dragging && game.editable) game.movePart(dragging.uid, pointer.x + dragging.dx, pointer.y + dragging.dy);
  });
  canvas.addEventListener('pointerup', () => { if (dragging) persist(); dragging = null; });
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); tool = null; refreshWorkshop(); });

  // ---- keyboard ---------------------------------------------------------------------------------------
  const GAME_KEYS = new Set(['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Slash', 'KeyZ', 'ShiftLeft', 'ShiftRight']);
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT') return;
    audio.unlock();
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'ArrowLeft') nudgePulse = -1;
    if (e.code === 'ArrowRight') nudgePulse = 1;
    if (e.code === 'Tab') game.cashOut();
    if (e.code === 'KeyM') say(audio.toggleMute() ? 'SOUND OFF. THE SILENCE IS LOUD' : 'SOUND ON');
    if (e.code === 'Space' && game.mode === 'workshop' && game.sim.ballCount === 0) { game.testBall(); sayKey('start'); }
    if ((e.code === 'Delete' || e.code === 'Backspace') && game.editable) removeSelected();
    if (e.code === 'Escape') { tool = null; selected = null; refreshWorkshop(); }
    const n = Number(e.key);
    if (game.editable && n >= 1 && n <= PART_IDS.length) { tool = PART_IDS[n - 1]; selected = null; refreshWorkshop(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('click', (e) => { if (e.target instanceof HTMLButtonElement) e.target.blur(); });

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
  $('btnStart').onclick = () => { audio.unlock(); game.startRound(); tool = null; selected = null; refreshWorkshop(); sayKey('start'); };
  $('btnCash').onclick = () => game.cashOut();
  $('btnTest').onclick = () => { audio.unlock(); game.testBall(); sayKey('start'); };
  $('btnReset').onclick = () => {
    game.layout = starterLayout();
    game.toWorkshop();
    selected = null;
    persist();
    refreshWorkshop();
  };
  const gravity = $('gravity') as HTMLInputElement;
  gravity.value = String(game.layout.gravity);
  $('gravVal').textContent = gravity.value;
  gravity.oninput = () => { game.setGravity(Number(gravity.value)); $('gravVal').textContent = gravity.value; persist(); };

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
      default: break;
    }
  };
  const onScore = (s: ScoreEvent) => {
    renderer.onScore(s);
    audio.bumper(s.multAfter, PARTS[s.def].money > 0);
    const band = Math.floor(s.multAfter);
    if (band > lastMultBand) sayKey('mult', { n: band });
    lastMultBand = band;
  };
  const onGame = (g: GameEvent) => {
    if (g.type === 'goal') { audio.goal(); renderer.onBigMoment(); sayKey('goal'); }
    if (g.type === 'roundWon') { sayKey('roundWon'); showOverlay('won', g.payout); }
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
        <div class="pay total"><span>Total</span><span>$${payout.total}</span></div><br/>
        <button class="primary" id="btnNext">To the workshop</button></div>`;
      ($('btnNext') as HTMLButtonElement).onclick = () => { overlay.hidden = true; game.continueAfterRound(); sayKey('workshop'); refreshWorkshop(); };
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
    $('modeBadge').textContent = game.mode === 'workshop' ? 'WORKSHOP' : `ROUND ${game.round}`;
    $('score').textContent = fmt(sc.score);
    $('mult').textContent = `×${sc.mult.toFixed(2)}`;
    $('mult').classList.toggle('hot', sc.mult >= 2);
    $('money').textContent = `$${game.money + (inRound ? sc.money : 0)}`;
    $('round').textContent = String(game.round);
    const goal = inRound ? sc.goal : goalFor(game.round);
    $('goal').textContent = fmt(goal);
    $('goalFill').style.width = inRound ? `${Math.min(100, (sc.score / goal) * 100)}%` : '0%';
    $('balls').textContent = inRound ? '●'.repeat(Math.max(0, game.ballsLeft)) + '○'.repeat(Math.max(0, 3 - game.ballsLeft)) : '∞';
    $('tiltFill').style.width = `${Math.min(100, game.sim.tiltMeter * 100)}%`;
    ($('btnStart') as HTMLButtonElement).hidden = game.mode !== 'workshop';
    ($('btnCash') as HTMLButtonElement).hidden = !(game.mode === 'round' && sc.goalReached);
    $('workshop').hidden = game.mode !== 'workshop';

    ledgerTimer += dt;
    if (ledgerTimer > 0.12) {
      ledgerTimer = 0;
      const rows = sc.ledgerRows();
      const total = rows.reduce((a, r) => a + r.points, 0) || 1;
      $('ledgerEmpty').hidden = rows.length > 0;
      $('ledger').hidden = rows.length === 0;
      $('ledger').querySelector('tbody')!.innerHTML = rows.map((r) => {
        const d = PARTS[r.def];
        return `<tr><td class="name"><i style="background:#${d.color.toString(16).padStart(6, '0')}"></i>${d.name.split(' ')[0]} #${r.uid}</td>
          <td>${r.hits}</td><td>${fmt(r.points)}</td><td style="width:60px"><div class="share" style="width:${Math.round((r.points / total) * 100)}%"></div></td></tr>`;
      }).join('');
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
    drawState.ghost = game.editable && tool && pointer
      ? { def: tool, x: pointer.x, y: pointer.y, valid: canPlace(game.layout, tool, pointer.x, pointer.y) }
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
