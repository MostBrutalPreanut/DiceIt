import { makePart, MAX_LEVEL, PARTS, PART_IDS, sellPrice, type PartDef, type PartId, type PartInstance } from '../data/parts';
import { neutralMods, type Mods, type SimMods } from '../data/mods';
import { BOSS_EVERY, computeMods, rollUpgradeOffers, SKIP_PAY, UPGRADES, type Rarity, type UpgradePick, type RunView, type UpgradeApi, type UpgradeId, type UpgradeOffer } from '../data/upgrades';
import { DECAL_SLOTS, DECALS, type DecalLook } from '../data/decals';
import { canPlace, canPlaceLedge, ensureBigBoi, inventoryParts, loadLayout, placedParts, starterLayout, type Layout } from '../sim/layout';
import { MAX_BALLS, TABLE_H, TABLE_W } from '../sim/constants';
import { clampLedge, LEDGE } from '../sim/table';
import { GOALS, GOAL_GROWTH } from '../data/goals';
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

export const BALLS_PER_ROUND = 3; // the base; Extra Ball upgrades add to it (Game.ballsPerRound)
export const START_MONEY = 6;
export const SHOP_SLOTS = 4;
/** The toolbox holds this many parts off the board; anything stored in a full toolbox is sold for its sell price. */
export const TOOLBOX_SLOTS = 4;

/** Two significant figures: goals read as 4,300 or 12,000, not 4,312. */
export function niceGoal(n: number): number {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1));
  return Math.round(n / mag) * mag;
}

/** The goal for a round: the balance bot's table (src/data/goals.ts), then GOAL_GROWTH a round beyond it. */
export function goalFor(round: number): number {
  if (round <= GOALS.length) return GOALS[Math.max(1, round) - 1];
  return niceGoal(GOALS[GOALS.length - 1] * Math.pow(GOAL_GROWTH, round - GOALS.length));
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
  /** Major upgrades taken, the three cards still waiting for a pick, and how many offers the run has had. */
  picks?: UpgradePick[];
  pending?: UpgradeOffer[] | null;
  offers?: number;
  /** The run's total points so far (absent in older saves). */
  runScore?: number;
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

/** UpgradePick `n` distinct parts, weighted by each part's shop weight. */
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
  /** Major upgrades taken this run, and what they add up to. */
  picks: UpgradePick[] = [];
  mods: Mods = neutralMods();
  /** The three cards waiting for a pick after a boss (null = none owed). Start round stays locked until it is resolved. */
  pending: UpgradeOffer[] | null = null;
  /** The pick made (or skipped) at this stop, shown as done in the stepper; null when none was due. */
  resolved: { id: UpgradePick['id']; target?: PartId } | 'skipped' | null = null;
  /** How many offers of upgrades the run has had (the Rules column and legendaries open up after the first). */
  offersSoFar = 0;
  /** Seconds balls have spent in each 1x1 cell since the layout last changed: where does the ball really go? */
  readonly heat = new Float32Array(HEAT_W * HEAT_H);
  private heatTick = 0;
  private history: string[] = [];
  private future: string[] = [];
  private runSeed = 1;
  /** Seed for the next sim reset (tools set it to vary the plunger and saucer randomness). */
  seed = 1;
  /** Tools: play a round against this goal instead of the table's (Infinity = play every ball out). */
  goalOverride: number | null = null;
  /** Every point the run has scored in its rounds (the lose screen's total). */
  runScore = 0;
  /** Parts the toolbox had no room for and that were sold instead; the UI reports these and clears the list. */
  soldOverflow: { def: PartId; refund: number }[] = [];

  constructor() {
    this.sim = createSim(this.layout, { seed: this.seed, mods: this.simMods() });
    this.scorer = this.newScorer(Infinity);
    this.shop = { offers: rollOffers(new Rng(this.runSeed)), rerolls: 0 };
  }

  /**
   * `persistent` scorers level the run up for real. Workshop and test-ball scorers get a throwaway copy
   * of the levels, so a free test ball can never level up your machine.
   */
  private newScorer(goal: number, persistent = false) {
    if (persistent) return new Scorer(goal, () => this.layout.parts, { levels: this.levels, onLevelUp: (id) => this.levelUp(id), mods: this.mods });
    const copy = { ...this.levels };
    return new Scorer(goal, () => this.layout.parts, {
      mods: this.mods,
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

  /** The toolbox is full (the Test Lab has no limit). */
  get toolboxFull(): boolean {
    return !this.sandbox && this.inventory.length >= TOOLBOX_SLOTS;
  }

  /** Sells a part the toolbox has no room for, at its sell price, and remembers it for the UI. */
  private sellOverflow(inst: PartInstance): number {
    const refund = this.sandbox ? 0 : this.sellValue(PARTS[inst.def]);
    this.money += refund;
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== inst.uid);
    if (inst.placed) this.sim.removePart(inst.uid);
    this.soldOverflow.push({ def: inst.def, refund });
    return refund;
  }

  /** Sells whatever no longer fits in the toolbox (newest first), e.g. after loading a layout slot or an old save. */
  enforceToolbox() {
    if (this.sandbox) return;
    const inv = this.inventory;
    for (const p of inv.slice(TOOLBOX_SLOTS).reverse()) this.sellOverflow(p);
  }

  part(uid: number): PartInstance | undefined {
    return this.layout.parts.find((p) => p.uid === uid);
  }

  // ---- mode changes -----------------------------------------------------------

  private simMods(): SimMods {
    const { ballBounce, ballGravity, nudge, spinBoost, twin, printerExtra } = this.mods;
    return { ballBounce, ballGravity, nudge, spinBoost, twin, printerExtra };
  }

  private resetSim() {
    this.sim.reset(this.layout, { seed: this.seed++, mods: this.simMods() });
  }

  get ballsPerRound() {
    return this.mods.ballsPerRound;
  }

  /** The round can start once any upgrade pick that is owed has been made (or skipped). */
  get canStart() {
    return this.mode === 'workshop' && this.pending === null;
  }

  startRound() {
    if (!this.canStart) return;
    for (const p of this.layout.parts) delete p.fresh; // anything bought or granted is no longer new
    this.resetSim();
    this.mode = 'round';
    this.ballsLeft = this.ballsPerRound;
    this.payout = null;
    this.scorer = this.newScorer(this.goalOverride ?? goalFor(this.round), true);
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
    this.shop = { offers: rollOffers(new Rng(this.runSeed * 1000 + this.round), this.mods.shopSlots), rerolls: 0 };
    this.resolved = null;
    // after every boss (rounds 3, 6, 9...) the machine owes you one of three major upgrades
    this.pending = (this.round - 1) % BOSS_EVERY === 0 ? this.rollUpgrades() : null;
    this.toWorkshop();
  }

  // ---- major upgrades ----------------------------------------------------------------------------

  private view(): RunView {
    return { owned: this.layout.parts, levels: this.levels, picks: this.picks, offersSoFar: this.offersSoFar };
  }

  private rollUpgrades(): UpgradeOffer[] {
    const offers = rollUpgradeOffers(this.runSeed * 4421 + this.round * 977 + this.offersSoFar, this.view());
    this.offersSoFar++;
    return offers;
  }

  // ---- relic decals: the Rules column, stuck on the apron ----------------------------------------------

  /** The Rules picks the run has stuck on the apron, in slot order (at most DECAL_SLOTS). */
  get decals(): UpgradePick[] {
    return this.picks.filter((p) => UPGRADES[p.id].column === 'rules');
  }

  decalLook(id: UpgradeId): DecalLook | undefined {
    return DECALS[id];
  }

  decalRarity(id: UpgradeId): Rarity {
    return UPGRADES[id].rarity;
  }

  /** A Rules upgrade needs a free apron slot; the others can always be taken. */
  canStick(id: UpgradeId): boolean {
    return UPGRADES[id].column !== 'rules' || this.decals.length < DECAL_SLOTS;
  }

  /** Whether the pending card at `index` can be taken right now (a Rules card needs a free slot: peel one first). */
  canTake(index: number): boolean {
    const offer = this.pending?.[index];
    return !!offer && this.editable && this.canStick(offer.id);
  }

  /**
   * Peel a decal off the apron between rounds. A peeled decal is gone: its rule stops at once (the run's mods
   * are rebuilt without it) and the slot is free for the next Rules pick.
   */
  peel(slot: number): boolean {
    const d = this.decals[slot];
    if (!d || !this.editable) return false;
    this.checkpoint();
    const i = this.picks.indexOf(d);
    this.picks.splice(i, 1);
    this.mods = computeMods(this.picks);
    this.toWorkshop();
    return true;
  }

  /** Take one of the three pending upgrades. Parts it grants arrive in the inventory marked NEW. */
  chooseUpgrade(index: number): boolean {
    const offer = this.pending?.[index];
    if (!offer || !this.editable || !this.canStick(offer.id)) return false;
    this.checkpoint();
    const pick: UpgradePick = { id: offer.id, target: offer.target };
    this.pending = null;
    this.resolved = pick;
    this.applyPick(pick);
    return true;
  }

  /** Test Lab: take any major upgrade for free (a targeted one aims at the first part type it can). */
  labUpgrade(id: UpgradeId): boolean {
    if (!this.editable || !this.sandbox) return false;
    const def = UPGRADES[id];
    const target = def.targets ? def.targets(this.view())[0] : undefined;
    if ((def.targets && !target) || !this.canStick(id)) return false;
    this.checkpoint();
    this.applyPick({ id, target });
    return true;
  }

  /** Test Lab: forget every upgrade's lasting effect (parts and levels it already gave stay). */
  labClearUpgrades() {
    if (!this.editable || !this.sandbox) return;
    this.checkpoint();
    this.picks = [];
    this.mods = computeMods(this.picks);
    this.toWorkshop();
  }

  private applyPick(pick: UpgradePick) {
    this.picks.push(pick);
    this.mods = computeMods(this.picks);
    const api: UpgradeApi = {
      grant: (id, dials) => {
        const inst = makePart(id, this.layout.nextUid++);
        Object.assign(inst.dials, dials);
        inst.fresh = true;
        const full = this.toolboxFull;
        this.layout.parts.push(inst);
        if (full) this.sellOverflow(inst); // no room in the toolbox: it is sold for its sell price
      },
      levelUp: (id) => void this.levelUp(id),
      levelable: () => this.layout.parts.map((p) => p.def).filter((id) => PARTS[id].recipe.perLevel && (this.levels[id] ?? 0) < MAX_LEVEL),
    };
    UPGRADES[pick.id].instant?.(api, pick.target);
    // a bigger shelf shows the extra part straight away
    const extra = this.mods.shopSlots - this.shop.offers.length;
    if (extra > 0) {
      const rng = new Rng(this.runSeed * 31 + this.round * 7 + this.picks.length);
      const more = rollOffers(rng, this.mods.shopSlots + 4).filter((id) => !this.shop.offers.includes(id)).slice(0, extra);
      this.shop.offers.push(...more);
    }
    this.toWorkshop(); // new ball physics and the like apply to the sim straight away
  }

  /** Decline the upgrade for cash. */
  skipUpgrade(): boolean {
    if (!this.pending || !this.editable) return false;
    this.checkpoint();
    this.pending = null;
    this.resolved = 'skipped';
    this.money += SKIP_PAY;
    return true;
  }

  newRun() {
    this.runScore = 0;
    this.layout = starterLayout();
    this.round = 1;
    this.money = START_MONEY;
    this.levels = {};
    this.picks = [];
    this.mods = neutralMods();
    this.pending = null;
    this.resolved = null;
    this.offersSoFar = 0;
    this.history = [];
    this.future = [];
    this.clearHeat();
    this.runSeed++;
    this.layout.ledge = randomLedge(new Rng(this.runSeed * 613 + 17), this.layout);
    this.shop = { offers: rollOffers(new Rng(this.runSeed), this.mods.shopSlots), rerolls: 0 };
    this.toWorkshop();
  }

  // ---- history (undo / redo) ------------------------------------------------------------

  private snapshot(): string {
    return JSON.stringify({ layout: this.layout, money: this.money, shop: this.shop, levels: this.levels, picks: this.picks, pending: this.pending, resolved: this.resolved, offersSoFar: this.offersSoFar });
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
    this.picks = s.picks;
    this.pending = s.pending;
    this.resolved = s.resolved;
    this.offersSoFar = s.offersSoFar;
    this.mods = computeMods(this.picks);
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
      parts: this.placed.filter((p) => !p.fixed).map((p) => ({ def: p.def, x: p.x, y: p.y, angle: p.angle, dials: { ...p.dials } })),
    };
  }

  /**
   * Lay out the parts you own the way a saved arrangement had them. Parts are matched by type; in the
   * Test Lab missing ones are created, otherwise they are skipped and counted.
   */
  applyArrangement(a: Arrangement): { placed: number; missing: number } {
    if (!this.editable) return { placed: 0, missing: 0 };
    this.checkpoint();
    for (const p of this.layout.parts) if (!p.fixed) p.placed = false;
    let placed = 0, missing = 0;
    for (const e of a.parts) {
      let inst = this.layout.parts.find((p) => !p.placed && !p.fixed && p.def === e.def);
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
    this.enforceToolbox();
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
    inst.fresh = true;
    this.layout.parts.push(inst);
    return inst;
  }

  /** Test Lab: rain `n` test balls from the top of the table (up to 12 at once). */
  labBalls(n: number) {
    if (!this.editable) return;
    if (this.sim.ballCount === 0) {
      this.scorer = this.newScorer(Infinity);
      this.scorer.resetRound();
      this.sim.rearm();
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
    for (const p of this.layout.parts) if (!p.fixed) p.placed = false;
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
    return {
      v: 2, layout: this.layout, money: this.money, round: this.round, shop: this.shop, sandbox: this.sandbox, runSeed: this.runSeed, levels: this.levels,
      picks: this.picks, pending: this.pending, offers: this.offersSoFar, runScore: this.runScore,
    };
  }

  load(s: RunSave) {
    this.layout = s.layout;
    this.money = s.money;
    this.round = s.round;
    this.shop = s.shop;
    this.sandbox = s.sandbox;
    this.runSeed = s.runSeed;
    this.levels = { ...(s.levels ?? {}) };
    this.picks = (s.picks ?? []).filter((p) => p.id in UPGRADES);
    this.mods = computeMods(this.picks);
    this.pending = s.pending && s.pending.every((o) => o.id in UPGRADES) ? s.pending : null;
    this.resolved = null;
    this.offersSoFar = s.offers ?? this.picks.length;
    this.runScore = s.runScore ?? 0;
    this.history = [];
    this.future = [];
    ensureBigBoi(this.layout);
    this.enforceToolbox();
    this.soldOverflow = [];
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
    if (!this.editable || !id || this.toolboxFull) return null;
    const cost = this.priceOf(id);
    if (!this.canAfford(cost)) return null;
    this.checkpoint();
    if (!this.sandbox) this.money -= cost;
    this.shop.offers[slot] = null;
    const inst = makePart(id, this.layout.nextUid++);
    inst.fresh = true;
    this.layout.parts.push(inst);
    return inst;
  }

  /** Buy an offer straight onto the board at (x, y), dragged from the shop: it needs room on the table, not in the toolbox. */
  buyAndPlace(slot: number, x: number, y: number): PartInstance | null {
    const id = this.shop.offers[slot];
    if (!this.editable || !id) return null;
    const cost = this.priceOf(id);
    if (!this.canAfford(cost) || !canPlace(this.layout, id, x, y)) return null;
    this.checkpoint();
    if (!this.sandbox) this.money -= cost;
    this.shop.offers[slot] = null;
    return this.addPlaced(id, x, y);
  }

  /** Test Lab: any part, free, straight onto the board. */
  grantAndPlace(id: PartId, x: number, y: number): PartInstance | null {
    if (!this.editable || !this.sandbox || !canPlace(this.layout, id, x, y)) return null;
    this.checkpoint();
    return this.addPlaced(id, x, y);
  }

  private addPlaced(id: PartId, x: number, y: number): PartInstance {
    const inst = makePart(id, this.layout.nextUid++, x, y, true);
    this.layout.parts.push(inst);
    this.clearHeat();
    this.sim.updatePart(inst);
    return inst;
  }

  /** What a part costs in the shop right now (Coupon Book takes $1 off each, never below $1). */
  priceOf(id: PartId): number {
    return Math.max(1, PARTS[id].cost - this.mods.couponOff);
  }

  /** What selling a part refunds (half, or all of it with Full Refund). */
  sellValue(def: PartDef): number {
    return sellPrice(def, this.mods.sellRate);
  }

  reroll(): boolean {
    if (!this.editable || !this.canAfford(this.rerollCost)) return false;
    this.checkpoint();
    if (!this.sandbox) this.money -= this.rerollCost;
    this.shop.rerolls++;
    this.shop.offers = rollOffers(new Rng(this.runSeed * 7919 + this.round * 131 + this.shop.rerolls), this.mods.shopSlots);
    return true;
  }

  sell(uid: number): number {
    const p = this.part(uid);
    if (!this.editable || !p || p.fixed) return 0;
    this.checkpoint();
    this.clearHeat();
    const refund = this.sandbox ? 0 : this.sellValue(PARTS[p.def]);
    this.money += refund;
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== uid);
    this.sim.removePart(uid);
    return refund;
  }

  // ---- workshop edits (applied live to the running sim) -----------------------------------

  /** Put an inventory part on the board (or move a placed one). */
  place(uid: number, x: number, y: number, checkpoint = false): boolean {
    const p = this.part(uid);
    if (!this.editable || !p || p.fixed || !canPlace(this.layout, p.def, x, y, uid)) return false;
    if (checkpoint) this.checkpoint();
    this.clearHeat();
    p.x = x;
    p.y = y;
    p.placed = true;
    delete p.fresh;
    this.sim.updatePart(p);
    return true;
  }

  /**
   * Take a part off the board and back into the toolbox. If the toolbox is full the part is sold instead,
   * for its sell price: the return value is that refund (null when it was stored).
   */
  store(uid: number): number | null {
    const p = this.part(uid);
    if (!this.editable || !p || !p.placed || p.fixed) return null;
    this.checkpoint();
    this.clearHeat();
    if (this.toolboxFull) return this.sellOverflow(p);
    p.placed = false;
    this.sim.updatePart(p);
    return null;
  }

  rotate(uid: number, delta: number) {
    const p = this.part(uid);
    if (!this.editable || !p || p.fixed || !PARTS[p.def].rotatable) return;
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

  /** Move the wall ledge (the ball stopper) up or down the left wall. Free, like moving a part. */
  moveLedge(y: number, checkpoint = true): boolean {
    if (!this.editable || !canPlaceLedge(this.layout, y)) return false;
    if (checkpoint) this.checkpoint();
    this.clearHeat();
    this.layout.ledge = y;
    this.toWorkshop(); // the wall is cabinet furniture: the sim rebuilds its table
    return true;
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
    if (this.mode === 'roundEnd' || this.mode === 'runOver') {
      // the table is empty, but the flippers still follow the buttons: freezing the sim here left a flipper
      // that was held as the last ball drained stuck up for the whole payout screen
      result.sim = this.sim.step(input).filter((e) => e.type === 'flipper');
      return result;
    }

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
    if (this.scorer.goalReached || this.ballsLeft <= 0) this.runScore += this.scorer.score;
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
    return payoutFor({ round: this.round, ballsLeft: this.ballsLeft, score: this.scorer.score, goal: this.scorer.goal, coins: this.scorer.money, money: this.money, mods: this.mods });
  }
}

/** A new run puts the wall ledge somewhere new, so balls coming down the left wall do not always land in the same place. */
export function randomLedge(rng: Rng, layout: Layout): number {
  for (let i = 0; i < 20; i++) {
    const y = clampLedge(rng.range(22, LEDGE.max));
    if (canPlaceLedge(layout, y)) return y;
  }
  return LEDGE.default;
}

/** What a cleared round pays. One formula, used by the game and by the balance tool's economy check. */
export function payoutFor(i: { round: number; ballsLeft: number; score: number; goal: number; coins: number; money: number; mods: Mods }): Payout {
  const lines: Payout['lines'] = [];
  lines.push({ label: `Round ${i.round} cleared`, amount: 3 + i.round });
  if (i.mods.roundBonus > 0) lines.push({ label: 'Sponsor', amount: i.mods.roundBonus });
  if (i.ballsLeft > 0) lines.push({ label: `${i.ballsLeft} unused ball${i.ballsLeft > 1 ? 's' : ''} x $${i.mods.unusedBallPay}`, amount: i.mods.unusedBallPay * i.ballsLeft });
  const interest = Math.min(i.mods.interestCap, Math.floor(i.money / 4) * i.mods.interestPer);
  if (interest > 0) lines.push({ label: `Interest on $${i.money}`, amount: interest });
  const over = i.score / i.goal;
  const doublings = Math.min(3, Math.max(0, Math.floor(Math.log2(over))));
  if (doublings > 0) lines.push({ label: `Overshoot (${over.toFixed(1)}x goal)`, amount: 2 * doublings });
  if (i.coins > 0) lines.push({ label: 'Coins from play', amount: i.coins });
  return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
}
