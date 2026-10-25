import { makePart, MAX_LEVEL, PARTS, PART_IDS, sellPrice, type PartId, type PartInstance } from '../data/parts';
import { canPlace, inventoryParts, loadLayout, placedParts, starterLayout, type Layout } from '../sim/layout';
import { MAX_BALLS, TABLE_H, TABLE_W } from '../sim/constants';
import { Rng } from '../sim/rng';
import { createSim, NO_INPUT, type Input, type Sim, type SimEvent } from '../sim/sim';
import { Scorer, type ScoreEvent } from './scoring';

export type Mode = 'workshop' | 'round' | 'roundEnd' | 'runOver';

export type GameEvent =
  | { type: 'goal' }
  | { type: 'ballEnd'; ballsLeft: number }
  | { type: 'roundWon'; payout: Payout }
  | { type: 'runOver' }
  | { type: 'tilt' };

export interface Payout {
  lines: { label: string; amount: number }[];
  total: number;
}

export const BALLS_PER_ROUND = 3;
export const START_MONEY = 6;
export const SHOP_SLOTS = 4;

/** Placeholder goal curve. The real one gets set against the balance bot (see docs/game-plan.md). */
export function goalFor(round: number): number {
  return Math.round((2500 * Math.pow(1.7, round - 1)) / 100) * 100;
}

export interface StepResult {
  sim: SimEvent[];
  score: ScoreEvent[];
  game: GameEvent[];
}

export interface ShopState {
  /** null = already bought. */
  offers: (PartId | null)[];
  rerolls: number;
}

/** Everything that survives a page reload. */
export interface RunSave {
  v: 2;
  layout: Layout;
  money: number;
  round: number;
  shop: ShopState;
  sandbox: boolean;
  runSeed: number;
  /** Per-run level of each part type (added after v2 shipped; absent in old saves). */
  levels?: Partial<Record<PartId, number>>;
}

/** Validate a saved run from storage. Returns null for anything that is not a v2 save. */
export function parseRun(json: string): RunSave | null {
  try {
    const s = JSON.parse(json) as RunSave;
    if (s.v !== 2 || typeof s.money !== 'number' || typeof s.round !== 'number' || !Array.isArray(s.shop?.offers) || !loadLayout(JSON.stringify(s.layout))) return null;
    return s;
  } catch {
    return null;
  }
}

/** Pick `n` distinct parts, weighted by each part's shop weight. */
export function rollOffers(rng: Rng, n = SHOP_SLOTS): PartId[] {
  const pool = [...PART_IDS];
  const out: PartId[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, id) => a + PARTS[id].weight, 0);
    let r = rng.next() * total;
    const i = pool.findIndex((id) => (r -= PARTS[id].weight) < 0);
    out.push(pool.splice(i < 0 ? pool.length - 1 : i, 1)[0]);
  }
  return out;
}

/** One placed part, as saved in a layout slot (parts are matched to what you own when loaded). */
export interface ArrangementEntry {
  def: PartId;
  x: number;
  y: number;
  angle: number;
  dials: Record<string, number>;
}
export interface Arrangement {
  parts: ArrangementEntry[];
  gravity: number;
}

/** Heatmap resolution: one cell per world unit. */
export const HEAT_W = TABLE_W;
export const HEAT_H = TABLE_H;

/**
 * Orchestrates the run: workshop (shop, inventory, build, tune, test-ball) <-> round (3 balls vs a goal).
 * The sim keeps running in the workshop so a test ball can bounce around while you edit.
 */
export class Game {
  layout: Layout = starterLayout();
  mode: Mode = 'workshop';
  round = 1;
  money = START_MONEY;
  /** Sandbox: the shop is free and nothing is lost by experimenting. Off for a real run. */
  sandbox = false;
  ballsLeft = BALLS_PER_ROUND;
  payout: Payout | null = null;
  sim: Sim;
  scorer: Scorer;
  shop: ShopState;
  /** Part types levelled up this run (Level Lights, upgrades). Persistent across rounds. */
  levels: Partial<Record<PartId, number>> = {};
  /** Seconds balls have spent in each 1x1 cell since the layout last changed: where does the ball really go? */
  readonly heat = new Float32Array(HEAT_W * HEAT_H);
  private heatTick = 0;
  private history: string[] = [];
  private future: string[] = [];
  private runSeed = 1;
  private seed = 1;

  constructor() {
    this.sim = createSim(this.layout, { seed: this.seed });
    this.scorer = this.newScorer(Infinity);
    this.shop = { offers: rollOffers(new Rng(this.runSeed)), rerolls: 0 };
  }

  /**
   * `persistent` scorers level the run up for real. Workshop and test-ball scorers get a throwaway copy
   * of the levels, so a free test ball can never level up your machine.
   */
  private newScorer(goal: number, persistent = false) {
    if (persistent) return new Scorer(goal, () => this.layout.parts, { levels: this.levels, onLevelUp: (id) => this.levelUp(id) });
    const copy = { ...this.levels };
    return new Scorer(goal, () => this.layout.parts, {
      levels: copy,
      onLevelUp: (id) => ((copy[id] ?? 0) >= MAX_LEVEL ? null : (copy[id] = (copy[id] ?? 0) + 1)),
    });
  }

  /** Level a part type up for the rest of the run. Returns the new level, or null at the cap. */
  levelUp(id: PartId): number | null {
    const cur = this.levels[id] ?? 0;
    if (cur >= MAX_LEVEL) return null;
    this.levels[id] = cur + 1;
    return cur + 1;
  }

  get goal() {
    return this.scorer.goal;
  }

  get inventory(): PartInstance[] {
    return inventoryParts(this.layout);
  }

  get placed(): PartInstance[] {
    return placedParts(this.layout);
  }

  part(uid: number): PartInstance | undefined {
    return this.layout.parts.find((p) => p.uid === uid);
  }

  // ---- mode changes -----------------------------------------------------------

  private resetSim() {
    this.sim.reset(this.layout, { seed: this.seed++ });
  }

  startRound() {
    this.resetSim();
    this.mode = 'round';
    this.ballsLeft = BALLS_PER_ROUND;
    this.payout = null;
    this.scorer = this.newScorer(goalFor(this.round), true);
    this.scorer.resetRound();
    this.sim.spawnBall();
  }

  toWorkshop() {
    this.resetSim();
    this.mode = 'workshop';
    this.scorer = this.newScorer(Infinity);
  }

  continueAfterRound() {
    this.round++;
    this.shop = { offers: rollOffers(new Rng(this.runSeed * 1000 + this.round)), rerolls: 0 };
    this.toWorkshop();
  }

  newRun() {
    this.layout = starterLayout();
    this.round = 1;
    this.money = START_MONEY;
    this.levels = {};
    this.history = [];
    this.future = [];
    this.clearHeat();
    this.runSeed++;
    this.shop = { offers: rollOffers(new Rng(this.runSeed)), rerolls: 0 };
    this.toWorkshop();
  }

  // ---- history (undo / redo) ------------------------------------------------------------

  private snapshot(): string {
    return JSON.stringify({ layout: this.layout, money: this.money, shop: this.shop, levels: this.levels });
  }

  /** Remember the workshop as it is now, so the next change can be undone. */
  checkpoint() {
    if (!this.editable) return;
    this.history.push(this.snapshot());
    if (this.history.length > 80) this.history.shift();
    this.future = [];
  }

  get canUndo() {
    return this.editable && this.history.length > 0;
  }
  get canRedo() {
    return this.editable && this.future.length > 0;
  }

  private restore(json: string) {
    const s = JSON.parse(json);
    this.layout = s.layout;
    this.money = s.money;
    this.shop = s.shop;
    this.levels = s.levels;
    this.clearHeat();
    this.toWorkshop();
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.future.push(this.snapshot());
    this.restore(this.history.pop()!);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    this.history.push(this.snapshot());
    this.restore(this.future.pop()!);
    return true;
  }

  // ---- heatmap ---------------------------------------------------------------------------------

  clearHeat() {
    this.heat.fill(0);
  }

  private sampleHeat() {
    for (const b of this.sim.ballStates()) {
      const cx = Math.floor(b.x), cy = Math.floor(b.y);
      if (cx >= 0 && cx < HEAT_W && cy >= 0 && cy < HEAT_H && !b.held) this.heat[cy * HEAT_W + cx] += 4 * this.sim.dt;
    }
  }

  // ---- layout slots -----------------------------------------------------------------------------

  arrangement(): Arrangement {
    return {
      gravity: this.layout.gravity,
      parts: this.placed.map((p) => ({ def: p.def, x: p.x, y: p.y, angle: p.angle, dials: { ...p.dials } })),
    };
  }

  /**
   * Lay out the parts you own the way a saved arrangement had them. Parts are matched by type; in the
   * Test Lab missing ones are created, otherwise they are skipped and counted.
   */
  applyArrangement(a: Arrangement): { placed: number; missing: number } {
    if (!this.editable) return { placed: 0, missing: 0 };
    this.checkpoint();
    for (const p of this.layout.parts) p.placed = false;
    let placed = 0, missing = 0;
    for (const e of a.parts) {
      let inst = this.layout.parts.find((p) => !p.placed && p.def === e.def);
      if (!inst && this.sandbox) {
        inst = makePart(e.def, this.layout.nextUid++);
        this.layout.parts.push(inst);
      }
      if (!inst) { missing++; continue; }
      inst.angle = e.angle;
      inst.dials = { ...inst.dials, ...e.dials };
      if (canPlace(this.layout, inst.def, e.x, e.y, inst.uid)) {
        inst.x = e.x;
        inst.y = e.y;
        inst.placed = true;
        placed++;
      } else missing++;
    }
    this.layout.gravity = a.gravity;
    this.clearHeat();
    this.toWorkshop();
    return { placed, missing };
  }

  // ---- test lab (sandbox) --------------------------------------------------------------------------

  /** Test Lab: add any part to the inventory for free. */
  grant(id: PartId): PartInstance | null {
    if (!this.editable || !this.sandbox) return null;
    this.checkpoint();
    const inst = makePart(id, this.layout.nextUid++);
    this.layout.parts.push(inst);
    return inst;
  }

  /** Test Lab: rain `n` test balls from the top of the table (up to 12 at once). */
  labBalls(n: number) {
    if (!this.editable) return;
    if (this.sim.ballCount === 0) {
      this.scorer = this.newScorer(Infinity);
      this.scorer.resetRound();
    }
    const rng = new Rng(this.seed++ * 31 + n);
    for (let i = 0; i < n && this.sim.ballCount < Math.max(MAX_BALLS, 12); i++) {
      this.sim.addBall(rng.range(4, 20), rng.range(44, 48), rng.range(-10, 10), rng.range(-30, -5));
    }
  }

  /** Test Lab: take everything off the board. */
  clearBoard() {
    if (!this.editable) return;
    this.checkpoint();
    for (const p of this.layout.parts) p.placed = false;
    this.clearHeat();
    this.toWorkshop();
  }

  /** Test Lab: raise (or lower) the level of every levelable part type. */
  levelAll(delta: number) {
    if (!this.editable || !this.sandbox) return;
    this.checkpoint();
    for (const id of PART_IDS) {
      if (!PARTS[id].recipe.perLevel) continue;
      this.levels[id] = Math.max(0, Math.min(MAX_LEVEL, (this.levels[id] ?? 0) + delta));
    }
    this.toWorkshop();
  }

  // ---- save / load ----------------------------------------------------------------

  save(): RunSave {
    return { v: 2, layout: this.layout, money: this.money, round: this.round, shop: this.shop, sandbox: this.sandbox, runSeed: this.runSeed, levels: this.levels };
  }

  load(s: RunSave) {
    this.layout = s.layout;
    this.money = s.money;
    this.round = s.round;
    this.shop = s.shop;
    this.sandbox = s.sandbox;
    this.runSeed = s.runSeed;
    this.levels = { ...(s.levels ?? {}) };
    this.history = [];
    this.future = [];
    this.clearHeat();
    this.toWorkshop();
  }

  // ---- economy: shop, inventory, buy, sell ---------------------------------------------

  get editable() {
    return this.mode === 'workshop';
  }

  get rerollCost() {
    return this.sandbox ? 0 : 1 + this.shop.rerolls;
  }

  canAfford(cost: number) {
    return this.sandbox || this.money >= cost;
  }

  /** Buy an offer into the inventory. Returns the new part, or null if you cannot. */
  buy(slot: number): PartInstance | null {
    const id = this.shop.offers[slot];
    if (!this.editable || !id) return null;
    const cost = PARTS[id].cost;
    if (!this.canAfford(cost)) return null;
    this.checkpoint();
    if (!this.sandbox) this.money -= cost;
    this.shop.offers[slot] = null;
    const inst = makePart(id, this.layout.nextUid++);
    this.layout.parts.push(inst);
    return inst;
  }

  reroll(): boolean {
    if (!this.editable || !this.canAfford(this.rerollCost)) return false;
    this.checkpoint();
    if (!this.sandbox) this.money -= this.rerollCost;
    this.shop.rerolls++;
    this.shop.offers = rollOffers(new Rng(this.runSeed * 7919 + this.round * 131 + this.shop.rerolls));
    return true;
  }

  sell(uid: number): number {
    const p = this.part(uid);
    if (!this.editable || !p) return 0;
    this.checkpoint();
    this.clearHeat();
    const refund = this.sandbox ? 0 : sellPrice(PARTS[p.def]);
    this.money += refund;
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== uid);
    this.sim.removePart(uid);
    return refund;
  }

  // ---- workshop edits (applied live to the running sim) -----------------------------------

  /** Put an inventory part on the board (or move a placed one). */
  place(uid: number, x: number, y: number, checkpoint = false): boolean {
    const p = this.part(uid);
    if (!this.editable || !p || !canPlace(this.layout, p.def, x, y, uid)) return false;
    if (checkpoint) this.checkpoint();
    this.clearHeat();
    p.x = x;
    p.y = y;
    p.placed = true;
    this.sim.updatePart(p);
    return true;
  }

  /** Take a part off the board and back into the inventory. */
  store(uid: number) {
    const p = this.part(uid);
    if (!this.editable || !p || !p.placed) return;
    this.checkpoint();
    this.clearHeat();
    p.placed = false;
    this.sim.updatePart(p);
  }

  rotate(uid: number, delta: number) {
    const p = this.part(uid);
    if (!this.editable || !p || !PARTS[p.def].rotatable) return;
    this.checkpoint();
    this.clearHeat();
    const TAU = Math.PI * 2;
    let a = (p.angle + delta) % TAU;
    if (a < 0) a += TAU;
    p.angle = Math.round(a * 1000) / 1000;
    if (p.placed) this.sim.updatePart(p);
  }

  setDial(uid: number, id: string, value: number) {
    const p = this.part(uid);
    if (!this.editable || !p) return;
    this.clearHeat();
    p.dials[id] = value;
    if (p.placed) this.sim.updatePart(p);
  }

  setGravity(g: number) {
    if (!this.editable) return;
    this.clearHeat();
    this.layout.gravity = g;
    this.sim.setGravity(g);
  }

  /** Free practice ball in the workshop; scored into a throwaway ledger. */
  testBall() {
    if (this.mode !== 'workshop' || this.sim.ballCount > 0) return;
    this.scorer = this.newScorer(Infinity);
    this.scorer.resetRound();
    this.sim.spawnBall();
  }

  cashOut() {
    if (this.mode === 'round' && this.scorer.goalReached) this.endBall(true);
  }

  // ---- stepping -------------------------------------------------------------------

  step(input: Input = NO_INPUT): StepResult {
    const result: StepResult = { sim: [], score: [], game: [] };
    if (this.mode === 'roundEnd' || this.mode === 'runOver') return result;

    const wasGoal = this.scorer.goalReached;
    const events = this.sim.step(input);
    if ((++this.heatTick & 3) === 0 && this.sim.ballCount > 0) this.sampleHeat();
    result.sim = events;
    for (const ev of events) {
      for (const s of this.scorer.consume(ev)) result.score.push(s);
      if (ev.type === 'tilt') result.game.push({ type: 'tilt' });
    }
    if (!wasGoal && this.scorer.goalReached) result.game.push({ type: 'goal' });
    // a ball ends when the LAST ball on the table is gone (the Ball Printer makes multiball)
    if (this.mode === 'round' && this.sim.ballCount === 0 && !this.sim.awaitingPlunge) this.endBall(false, result);
    return result;
  }

  private endBall(forced: boolean, result?: StepResult) {
    const out: GameEvent[] = result ? result.game : [];
    if (forced) this.sim.reset(this.layout, { seed: this.seed++ }); // Cash Out: clear the table at once
    this.ballsLeft--;
    out.push({ type: 'ballEnd', ballsLeft: this.ballsLeft });
    if (this.scorer.goalReached) {
      this.payout = this.computePayout();
      this.money += this.payout.total;
      this.mode = 'roundEnd';
      out.push({ type: 'roundWon', payout: this.payout });
    } else if (this.ballsLeft <= 0) {
      this.mode = 'runOver';
      out.push({ type: 'runOver' });
    } else {
      this.scorer.startBall();
      this.sim.spawnBall();
    }
  }

  private computePayout(): Payout {
    const lines: Payout['lines'] = [];
    lines.push({ label: `Round ${this.round} cleared`, amount: 3 + this.round });
    if (this.ballsLeft > 0) lines.push({ label: `${this.ballsLeft} unused ball${this.ballsLeft > 1 ? 's' : ''} x $3`, amount: 3 * this.ballsLeft });
    const over = this.scorer.score / this.scorer.goal;
    const doublings = Math.min(3, Math.max(0, Math.floor(Math.log2(over))));
    if (doublings > 0) lines.push({ label: `Overshoot (${over.toFixed(1)}x goal)`, amount: 2 * doublings });
    if (this.scorer.money > 0) lines.push({ label: 'Cha-Ching bumpers', amount: this.scorer.money });
    return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
  }
}
