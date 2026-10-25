import { makePart, PARTS, PART_IDS, sellPrice, type PartId, type PartInstance } from '../data/parts';
import { canPlace, inventoryParts, loadLayout, placedParts, starterLayout, type Layout } from '../sim/layout';
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
  private runSeed = 1;
  private seed = 1;

  constructor() {
    this.sim = createSim(this.layout, { seed: this.seed });
    this.scorer = this.newScorer(Infinity);
    this.shop = { offers: rollOffers(new Rng(this.runSeed)), rerolls: 0 };
  }

  private newScorer(goal: number) {
    return new Scorer(goal, () => this.layout.parts);
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
    this.scorer = this.newScorer(goalFor(this.round));
    this.scorer.startBall();
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
    this.runSeed++;
    this.shop = { offers: rollOffers(new Rng(this.runSeed)), rerolls: 0 };
    this.toWorkshop();
  }

  // ---- save / load ----------------------------------------------------------------

  save(): RunSave {
    return { v: 2, layout: this.layout, money: this.money, round: this.round, shop: this.shop, sandbox: this.sandbox, runSeed: this.runSeed };
  }

  load(s: RunSave) {
    this.layout = s.layout;
    this.money = s.money;
    this.round = s.round;
    this.shop = s.shop;
    this.sandbox = s.sandbox;
    this.runSeed = s.runSeed;
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
    if (!this.sandbox) this.money -= cost;
    this.shop.offers[slot] = null;
    const inst = makePart(id, this.layout.nextUid++);
    this.layout.parts.push(inst);
    return inst;
  }

  reroll(): boolean {
    if (!this.editable || !this.canAfford(this.rerollCost)) return false;
    if (!this.sandbox) this.money -= this.rerollCost;
    this.shop.rerolls++;
    this.shop.offers = rollOffers(new Rng(this.runSeed * 7919 + this.round * 131 + this.shop.rerolls));
    return true;
  }

  sell(uid: number): number {
    const p = this.part(uid);
    if (!this.editable || !p) return 0;
    const refund = this.sandbox ? 0 : sellPrice(PARTS[p.def]);
    this.money += refund;
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== uid);
    this.sim.removePart(uid);
    return refund;
  }

  // ---- workshop edits (applied live to the running sim) -----------------------------------

  /** Put an inventory part on the board (or move a placed one). */
  place(uid: number, x: number, y: number): boolean {
    const p = this.part(uid);
    if (!this.editable || !p || !canPlace(this.layout, p.def, x, y, uid)) return false;
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
    p.placed = false;
    this.sim.updatePart(p);
  }

  rotate(uid: number, delta: number) {
    const p = this.part(uid);
    if (!this.editable || !p || !PARTS[p.def].rotatable) return;
    const TAU = Math.PI * 2;
    let a = (p.angle + delta) % TAU;
    if (a < 0) a += TAU;
    p.angle = Math.round(a * 1000) / 1000;
    if (p.placed) this.sim.updatePart(p);
  }

  setDial(uid: number, id: string, value: number) {
    const p = this.part(uid);
    if (!this.editable || !p) return;
    p.dials[id] = value;
    if (p.placed) this.sim.updatePart(p);
  }

  setGravity(g: number) {
    if (!this.editable) return;
    this.layout.gravity = g;
    this.sim.setGravity(g);
  }

  /** Free practice ball in the workshop; scored into a throwaway ledger. */
  testBall() {
    if (this.mode !== 'workshop' || this.sim.ballCount > 0) return;
    this.scorer = this.newScorer(Infinity);
    this.scorer.startBall();
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
