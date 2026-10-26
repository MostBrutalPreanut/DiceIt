import { CASCADE, footprint, gemFits, isDecor, isInlay, makePart, MAX_LEVEL, PARTS, PART_IDS, rarityOdds, sellPrice, SHOP_IDS, type PartDef, type PartId, type PartInstance, type Rarity } from '../data/parts';
import { neutralMods, simModsOf, type Mods } from '../data/mods';
import {
  BOSS_EVERY, computeMods, DECAL_SLOTS, DECALS, rollDecalPick, SKIP_PAY,
  type DecalId, type DecalLook, type DecalOffer, type DecalPick, type RunView,
  decalGrowth,
} from '../data/decals';
import { BOSSES, bossOf, FINAL_ROUND, planBosses, type BossDef, type BossId } from '../data/bosses';
import type { MachineId } from '../data/bigboi';
import { canPlace, canPlaceLedge, decorParts, WALL_GAP, ensureBigBoi, inventoryParts, loadLayout, placedParts, starterLayout, type Layout } from '../sim/layout';
import { MAX_BALLS, TABLE_H, TABLE_W } from '../sim/constants';
import { clampLedge, LEDGE } from '../sim/table';
import { GOALS, GOAL_GROWTH } from '../data/goals';
import { Rng } from '../sim/rng';
import { createSim, NO_INPUT, type Input, type Sim, type SimEvent } from '../sim/sim';
import { Scorer, type ScoreEvent, type SparkBurst } from './scoring';

export type Mode = 'workshop' | 'round' | 'roundEnd' | 'runOver';

export type GameEvent =
  | { type: 'goal' }
  | { type: 'ballEnd'; ballsLeft: number }
  | { type: 'roundWon'; payout: Payout; runWon: boolean }
  | { type: 'runOver' }
  | { type: 'tilt' };

export interface Payout {
  lines: { label: string; amount: number }[];
  total: number;
}

export const BALLS_PER_ROUND = 3; // the base; Extra Ball decals add to it (Game.ballsPerRound)
export const START_MONEY = 6;
export const SHOP_SLOTS = 4;
/** The toolbox holds this many parts off the board (Big Toolbox adds more); anything stored in a full toolbox is sold for its sell price. */
export const TOOLBOX_SLOTS = 4;
/**
 * Handling a part that has played a round costs money: moving it (on the table or into the toolbox) costs `move`,
 * once a visit, and removing it for good costs `scrap`. A part bought this visit moves freely and goes back for
 * what it cost.
 */
export const UPKEEP = { move: 1, scrap: 1 } as const;

/** Two significant figures: goals read as 4,300 or 12,000, not 4,312. */
/** A new part's angle: only parts that turn keep the one they were aimed at while carried. */
const aimed = (id: PartId, angle: number) => (PARTS[id].rotatable ? Math.round(angle * 1000) / 1000 : 0);

export function niceGoal(n: number): number {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1));
  return Math.round(n / mag) * mag;
}

/** The goal for a round: the table (src/data/goals.ts), then GOAL_GROWTH a round beyond it. */
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
  /** Slots locked by the player: they keep their offer into the next shop (and through rerolls). */
  locked?: number[];
  /** Bargain Bin: the slot that is half price. */
  bargain?: number | null;
  /** A Piñata burst last round: pick one of these, free (the others go). It waits until you pick. */
  prize?: PartId[] | null;
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
  /** Old saves: a level per part type (levels now live on each part, as `level`). */
  levels?: Partial<Record<PartId, number>>;
  /** Decals on the apron (old saves called them picks), and the boss's prize still waiting to be picked. */
  picks?: DecalPick[];
  pending?: DecalOffer[] | null;
  /** The run's total points so far (absent in older saves). */
  runScore?: number;
  /** The machine picked for this run (absent in older saves: the one picked last). */
  machine?: MachineId;
  /** The run's bosses, in order. */
  bosses?: BossId[];
  won?: boolean;
  /** Old Bell rings so far this run (absent in older saves). */
  rings?: number;
  /** Free rerolls won in play, not yet spent. */
  bonusRerolls?: number;
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

/** Within the rarity an offer rolled, a part you already own (on the table, in the toolbox or set in as a gem) is this much likelier. */
export const OWNED_BOOST = 1.5;

/**
 * `n` distinct parts for sale. Each offer rolls its rarity down the cascade (a legendary first, then a rare, then an
 * uncommon, else a common: the round's RARITY_ODDS), then picks a part of that rarity by its shop weight, the
 * parts in `owned` weighing OWNED_BOOST times more. A rarity with nothing left to sell passes the offer down to the
 * next one. Big Boi is never sold.
 */
export function rollOffers(rng: Rng, n = SHOP_SLOTS, round = 1, exclude: PartId[] = [], owned: PartId[] = []): PartId[] {
  const pool = SHOP_IDS.filter((id) => !exclude.includes(id) && round >= (PARTS[id].from ?? 0));
  const odds = rarityOdds(round);
  const w = (id: PartId) => PARTS[id].weight * (owned.includes(id) ? OWNED_BOOST : 1);
  const out: PartId[] = [];
  while (out.length < n && pool.length) {
    let ids: PartId[] = [];
    for (let i = CASCADE.findIndex((r) => r === 'common' || rng.next() < odds[r]); i < CASCADE.length && !ids.length; i++) ids = pool.filter((id) => PARTS[id].rarity === CASCADE[i]);
    if (!ids.length) ids = pool; // only rarer parts are left
    const total = ids.reduce((a, id) => a + w(id), 0);
    let r = rng.next() * total;
    const pick = ids.find((id) => (r -= w(id)) < 0) ?? ids[ids.length - 1];
    out.push(pool.splice(pool.indexOf(pick), 1)[0]);
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
  /** The machine picked for the run: its look, and what its Big Boi does. Fixed for the run. */
  machine: MachineId = 'factory';
  /** Decals stuck on the apron, in slot order (at most DECAL_SLOTS). */
  decals: DecalPick[] = [];
  /** What the decals add up to, and (in a boss round) the boss on top. */
  mods: Mods = neutralMods();
  /** Tools: play with exactly these mods instead of the decals' (the auto-builder measures machines this way). */
  fixedMods: Mods | null = null;
  /** The boss's prize: three decals waiting for a pick (null = none owed). Play Round stays locked until it is resolved. */
  pending: DecalOffer[] | null = null;
  /** The pick made (or skipped) at this stop; null when none was due. */
  resolved: DecalPick | 'skipped' | null = null;
  /** The run's bosses: rounds 3, 6, 9 and 12, then the final boss in round 15. */
  bossPlan: BossId[] = planBosses(1);
  /** The final boss is beaten (the run goes on, endless, if you want). */
  won = false;
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
  /** Sparks owed to the table later (a Firecracker's burst): when, and what. */
  private pendingSparks: (SparkBurst & { at: number })[] = [];
  /** Free rerolls won in play (the Spider Wheel), for the shop; and how many were spent (a new shop for each). */
  bonusRerolls = 0;
  private wonRerolls = 0;
  /** A Piñata burst this round: the next shop owes a free pick. */
  private prizeDue = false;
  /** WIZARD MODE's extra balls, and when they leave: it is a 30 s multiball, not two balls for keeps. */
  private wizardBalls: { ids: number[]; until: number } | null = null;
  /** The part the last gem from the toolbox went into (the UI selects it). */
  lastInlaid: number | null = null;
  /** Old Bell rings this run: every ball's Mult is ×1.2 for each, for the rest of the run (selling the bell keeps them). */
  rings = 0;
  /** Parts the toolbox had no room for and that were sold instead; the UI reports these and clears the list. */
  soldOverflow: { def: PartId; refund: number }[] = [];

  constructor() {
    this.sim = createSim(this.layout, { seed: this.seed, mods: simModsOf(this.mods) });
    this.scorer = this.newScorer(Infinity);
    this.shop = this.freshShop(new Rng(this.runSeed));
  }

  /**
   * `persistent` scorers level the run up for real. Workshop and test-ball scorers get a throwaway copy
   * of the levels, so a free test ball can never level up your machine.
   */
  private newScorer(goal: number, persistent = false) {
    const base = {
      mods: this.mods, machine: this.machine, seed: this.seed * 31 + this.round, baseMult: this.startMult(this.mods), rings: this.rings,
      balls: () => this.sim.ballCount, lastBall: () => this.mode === 'round' && this.ballsLeft <= 1, cash: () => this.money,
    };
    if (persistent) {
      const boss = this.boss;
      const later = boss?.decalsOffUntilHalf && !this.fixedMods ? (() => { const m = this.roundMods(true); return { mods: m, at: goal / 2, baseMult: this.startMult(m) }; })() : undefined;
      return new Scorer(goal, () => this.layout.parts, { ...base, onLevelUp: (inst, n) => this.levelUp(inst, n), onPolish: (inst, by, cap) => this.polish(inst, by, cap), onNotch: (inst, n) => this.notch(inst, n), onLeaf: (inst, cap) => this.leaf(inst, cap), onKeep: (inst, patch) => Object.assign(inst, patch), onPrize: () => { this.prizeDue = true; }, jam: boss?.jam, later });
    }
    return new Scorer(goal, () => this.layout.parts, base); // a test ball's level-ups stay in its own scorer
  }

  /**
   * The Mult every ball starts at with these mods: Head Start, plus Crowd Pleaser and Minimalist counting your
   * table and toolbox, plus the Mult kept from earlier rounds.
   */
  startMult(m: Mods): number {
    const onTable = this.layout.parts.filter((p) => p.placed && !p.fixed).length;
    const empty = Math.max(0, m.toolboxSlots - this.inventory.length);
    return Math.round((m.startMult + m.startMultPerPart * onTable + m.startMultPerEmpty * empty + this.keptMult) * 100) / 100;
  }

  /** Mult kept from round to round: the polish of the Trophy Cups on the table, and what Momentum and Afterglow have kept. */
  get keptMult(): number {
    const cups = this.layout.parts.filter((p) => p.placed).reduce((a, p) => a + (p.polish ?? 0), 0);
    const decals = this.decals.reduce((a, d) => a + (d.grown ?? 0), 0);
    return Math.round((cups + decals) * 100) / 100;
  }

  /** A Trophy Cup is polished (at most `cap`). Returns its polish now. */
  polish(inst: PartInstance, by: number, cap: number): number {
    inst.polish = Math.round(Math.min(cap, (inst.polish ?? 0) + by) * 1000) / 1000;
    return inst.polish;
  }

  /** An Old Bell's notch for the round: at `notches` it rings (one more ring for the run) and starts again. True if it rang. */
  notch(inst: PartInstance, notches: number): boolean {
    const n = (inst.notches ?? 0) + 1;
    const rang = n >= notches;
    inst.notches = rang ? 0 : n;
    if (rang) this.rings++;
    return rang;
  }

  /** Gold Leaf: its part is worth +1 more (at most `cap`), for the rest of the run. Returns what it adds now. */
  leaf(inst: PartInstance, cap: number): number {
    inst.leaf = Math.min(cap, (inst.leaf ?? 0) + 1);
    return inst.leaf;
  }

  /** Level a part up for the rest of the run (at most MAX_LEVEL). Returns its new level. */
  levelUp(inst: PartInstance, n = 1): number {
    inst.level = Math.min(MAX_LEVEL, (inst.level ?? 0) + n);
    return inst.level;
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

  /** The decor standing on the cabinet. */
  get decor(): PartInstance[] {
    return decorParts(this.layout);
  }

  get toolboxSlots(): number {
    return this.mods.toolboxSlots;
  }

  /** The toolbox is full (the Test Lab has no limit). */
  get toolboxFull(): boolean {
    return !this.sandbox && this.inventory.length >= this.toolboxSlots;
  }

  /** The toolbox has room for a whole pack of this part (three Lane Rollovers need three free slots). */
  hasRoomFor(id: PartId): boolean {
    return this.sandbox || this.inventory.length + (PARTS[id].pack ?? 1) <= this.toolboxSlots;
  }

  /** Sells a part the toolbox has no room for, at its sell price, and remembers it for the UI. */
  private sellOverflow(inst: PartInstance): number {
    const refund = this.sandbox ? 0 : this.sellValue(PARTS[inst.def]);
    this.money += refund;
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== inst.uid);
    if (inst.placed) this.sim.removePart(inst.uid);
    this.soldOverflow.push({ def: inst.def, refund });
    if (inst.inlay) this.returnGem(inst.inlay);
    return refund;
  }

  /** Sells whatever no longer fits in the toolbox (newest first), e.g. after loading a layout slot or an old save. */
  enforceToolbox() {
    if (this.sandbox) return;
    const inv = this.inventory;
    for (const p of inv.slice(this.toolboxSlots).reverse()) this.sellOverflow(p);
  }

  part(uid: number): PartInstance | undefined {
    return this.layout.parts.find((p) => p.uid === uid);
  }

  // ---- bosses ---------------------------------------------------------------------

  /** The boss of a round (null if it is not a boss round). */
  bossAt(round: number): BossDef | null {
    const id = bossOf(this.bossPlan, round, BOSS_EVERY);
    return id ? BOSSES[id] : null;
  }

  /** The boss of the current round, if it is a boss round. */
  get boss(): BossDef | null {
    return this.bossAt(this.round);
  }

  /** The next boss coming up (this round's, or the next boss round's) and its round. */
  get nextBoss(): { round: number; boss: BossDef } {
    const round = Math.ceil(this.round / BOSS_EVERY) * BOSS_EVERY;
    return { round, boss: this.bossAt(round)! };
  }

  /** The mods for a round: the decals, and the boss on top. `withDecals` false is The Auditor's opening. */
  private roundMods(withDecals = true): Mods {
    if (this.fixedMods) return this.fixedMods;
    const m = this.withDecor(computeMods(withDecals ? this.decals : []));
    this.boss?.mods?.(m);
    return m;
  }

  /** The cabinet upgrades on the cabinet add their little bit (decor in the toolbox does nothing). */
  private withDecor(m: Mods): Mods {
    for (const p of decorParts(this.layout)) {
      const c = PARTS[p.def].recipe.cab;
      if (!c) continue;
      m.lampRadius += c.lampRadius ?? 0;
      m.lampBonus += c.lampBonus ?? 0;
      m.nudge *= c.nudge ?? 1;
      m.cabinetPay += c.pay ?? 0;
      if (c.mirror && this.round % 2 === 0) m.shopSlots += 1;
    }
    return m;
  }

  /** Decor went on or off the cabinet: a cabinet upgrade works (or stops) at once, the shop included. */
  private decorChanged(id: PartId) {
    if (!isDecor(id) || this.fixedMods || this.mode !== 'workshop') return;
    this.mods = this.workshopMods();
    this.scorer.mods = this.mods;
    this.fitShop();
  }

  /** Decor the run owns (placed or in the toolbox): the shop never offers a second of any. */
  private ownedDecor(): PartId[] {
    return this.layout.parts.filter((p) => isDecor(p.def)).map((p) => p.def);
  }

  /** Every kind of part the run owns, on the table, in the toolbox or set in a part as a gem: the shop favours these a little. */
  private ownedKinds(): PartId[] {
    return [...new Set(this.layout.parts.flatMap((p) => (p.inlay ? [p.def, p.inlay] : [p.def])))];
  }

  /** The mods the current round will be played with (the decals, and the boss on top), for tools that measure a machine. */
  get modsForRound(): Mods {
    return this.roundMods(!this.boss?.decalsOffUntilHalf);
  }

  /** The mods in the workshop: the decals alone. */
  private workshopMods(): Mods {
    return this.fixedMods ?? this.withDecor(computeMods(this.decals));
  }

  // ---- mode changes -----------------------------------------------------------

  private resetSim() {
    this.sim.reset(this.layout, { seed: this.seed++, mods: simModsOf(this.mods), ballClock: this.mods.ballClock });
    this.pendingSparks = [];
    this.wizardBalls = null;
  }

  /** The scorer asked for sparks: shoot them out now, or keep them for later (a firework bursts after its flight). */
  private spawnSparks(score: ScoreEvent[]) {
    for (const s of score) if (s.grow) this.sim.growBall(s.grow.ballId, s.grow.k, s.grow.seconds);
    for (const s of score) {
      if (!s.balls) continue;
      const ids = this.sim.launchBalls(s.balls.n, s.balls.x, s.balls.y, s.balls.uid);
      const w = PARTS[s.def].recipe.wizard;
      if (w) this.wizardBalls = { ids, until: s.t + w.seconds }; // WIZARD MODE's balls leave when it ends; a wheel's stay
    }
    for (const s of score) if (s.reroll && this.mode === 'round') this.bonusRerolls++; // a Spider Wheel's free reroll (not a test ball's)
    if (this.wizardBalls && this.sim.time >= this.wizardBalls.until) {
      for (const id of this.wizardBalls.ids) this.sim.retireBall(id);
      this.wizardBalls = null;
    }
    for (const s of score) for (const b of s.sparks ?? []) {
      if (b.delay) this.pendingSparks.push({ ...b, at: this.sim.time + b.delay });
      else this.sim.addSparks(b.n, b.x, b.y, b.parent, { r: b.r, top: b.top, aim: b.aim, egg: b.egg });
    }
    if (!this.pendingSparks.length) return;
    const due = this.pendingSparks.filter((b) => b.at <= this.sim.time);
    this.pendingSparks = this.pendingSparks.filter((b) => b.at > this.sim.time);
    for (const b of due) this.sim.addSparks(b.n, b.x, b.y, b.parent, { r: b.r, top: b.top, aim: b.aim, egg: b.egg });
  }

  get ballsPerRound() {
    return this.mods.ballsPerRound;
  }

  /** The round can start once any decal pick that is owed has been made (or skipped). */
  get canStart() {
    return this.mode === 'workshop' && this.pending === null;
  }

  startRound() {
    if (!this.canStart) return;
    for (const p of this.layout.parts) { delete p.fresh; delete p.loose; delete p.paid; } // anything bought is no longer new, and moving it costs from now on
    const boss = this.boss;
    this.mods = boss?.decalsOffUntilHalf && !this.fixedMods ? this.roundMods(false) : this.roundMods();
    this.resetSim();
    this.mode = 'round';
    this.ballsLeft = this.ballsPerRound;
    this.payout = null;
    const goal = this.goalOverride ?? Math.round(goalFor(this.round) * (boss?.goalX ?? 1));
    this.scorer = this.newScorer(goal, true);
    this.scorer.resetRound();
    this.sim.spawnBall();
  }

  toWorkshop() {
    this.mods = this.workshopMods();
    this.resetSim();
    this.mode = 'workshop';
    this.scorer = this.newScorer(Infinity);
  }

  continueAfterRound() {
    // a round played: the Bonsai Bumpers and Time Capsules on the table are a round older
    for (const p of this.placed) if (PARTS[p.def].recipe.bonsai || PARTS[p.def].recipe.capsule) p.age = (p.age ?? 0) + 1;
    this.round++;
    this.mods = this.workshopMods(); // the new round's shop (the Side Mirror counts the rounds)
    this.shop = this.freshShop(new Rng(this.runSeed * 1000 + this.round), this.shop);
    if (this.prizeDue) {
      // a Piñata burst: one of three parts, free; rarer than the shop's own (it rolls as if it were three rounds later)
      this.shop.prize = rollOffers(new Rng(this.runSeed * 4241 + this.round), PARTS.pinata.recipe.pinata!.pick, this.round + 3, this.ownedDecor(), this.ownedKinds());
      this.prizeDue = false;
    }
    this.resolved = null;
    // after every boss (rounds 3, 6, 9...) the machine owes you a decal: one of three
    this.pending = (this.round - 1) % BOSS_EVERY === 0 ? this.rollPick() : null;
    this.toWorkshop();
  }

  // ---- the shop -------------------------------------------------------------------------

  /** A new shop: locked offers stay where they are, the rest are rolled for this round. */
  private freshShop(rng: Rng, prev?: ShopState): ShopState {
    const n = this.mods.shopSlots;
    const keep = (prev?.locked ?? []).filter((i) => i < n && prev!.offers[i]);
    const kept = keep.map((i) => prev!.offers[i]!) as PartId[];
    const fresh = rollOffers(rng, n - keep.length, this.round, [...kept, ...this.ownedDecor()], this.ownedKinds());
    const offers: (PartId | null)[] = [];
    for (let i = 0; i < n; i++) offers.push(keep.includes(i) ? prev!.offers[i] : fresh.shift() ?? null);
    const bargain = this.mods.bargain ? Math.floor(rng.next() * n) : null;
    return { offers, rerolls: 0, locked: keep, bargain, prize: prev?.prize ?? null };
  }

  get lockSlots() {
    return this.mods.locks;
  }

  isLocked(slot: number) {
    return !!this.shop.locked?.includes(slot);
  }

  /** Lock (or unlock) a shop offer: a locked offer is still there next round, and survives rerolls. */
  toggleLock(slot: number): boolean {
    if (!this.editable || !this.shop.offers[slot]) return false;
    const locked = this.shop.locked ?? [];
    if (locked.includes(slot)) this.shop.locked = locked.filter((i) => i !== slot);
    else if (locked.length < this.lockSlots) this.shop.locked = [...locked, slot];
    else return false;
    return true;
  }

  // ---- decals: stuck on the apron ----------------------------------------------

  private view(): RunView {
    return { owned: this.layout.parts, decals: this.decals, round: this.round };
  }

  private rollPick(): DecalOffer[] {
    return rollDecalPick(this.runSeed * 4421 + this.round * 977, this.view(), Math.floor((this.round - 1) / BOSS_EVERY));
  }

  decalLook(id: DecalId): DecalLook {
    return DECALS[id].look;
  }

  decalRarity(id: DecalId): Rarity {
    return DECALS[id].rarity;
  }

  /** There is a free slot on the apron. */
  get apronFree(): boolean {
    return this.decals.length < DECAL_SLOTS;
  }

  /** Whether the pending decal at `index` can be taken right now (it needs a free slot on the apron: peel one first). */
  canTake(index: number): boolean {
    return !!this.pending?.[index] && this.editable && this.apronFree;
  }

  private stick(d: DecalPick) {
    this.decals.push({ ...d });
    this.mods = this.workshopMods();
    this.fitShop();
    this.toWorkshop(); // new ball physics and the like apply to the sim straight away
  }

  /**
   * The shop catches up with the decals at once (it was rolled before the boss's decal was picked): a bigger
   * shelf shows its extra part, the Bargain Bin marks a half-price offer, and a peeled Bargain Bin takes it back.
   */
  private fitShop() {
    const rng = new Rng(this.runSeed * 31 + this.round * 7 + this.decals.length);
    const extra = this.mods.shopSlots - this.shop.offers.length;
    if (extra > 0) this.shop.offers.push(...rollOffers(rng, extra, this.round, [...this.shop.offers.filter((x): x is PartId => !!x), ...this.ownedDecor()], this.ownedKinds()));
    if (!this.mods.bargain) this.shop.bargain = null;
    else if (this.shop.bargain == null || !this.shop.offers[this.shop.bargain]) {
      const open = this.shop.offers.map((id, i) => (id ? i : -1)).filter((i) => i >= 0);
      this.shop.bargain = open.length ? open[Math.floor(rng.next() * open.length)] : null;
    }
  }

  /**
   * Peel a decal off the apron between rounds. A peeled decal is gone: its rule stops at once and the slot is
   * free for the next one.
   */
  peel(slot: number): boolean {
    const d = this.decals[slot];
    if (!d || !this.editable) return false;
    this.checkpoint();
    this.decals.splice(slot, 1);
    this.mods = this.workshopMods();
    this.fitShop();
    this.toWorkshop();
    this.enforceToolbox(); // a peeled Big Toolbox leaves less room
    return true;
  }

  /** Take one of the boss's three decals. */
  chooseDecal(index: number): boolean {
    const offer = this.pending?.[index];
    if (!offer || !this.canTake(index)) return false;
    this.checkpoint();
    this.pending = null;
    this.resolved = offer;
    this.stick(offer);
    return true;
  }

  /** Decline the boss's decal for cash. */
  skipPick(): boolean {
    if (!this.pending || !this.editable) return false;
    this.checkpoint();
    this.pending = null;
    this.resolved = 'skipped';
    this.money += SKIP_PAY;
    return true;
  }

  /** Test Lab: stick any decal for free (a targeted one aims at the first part type it can). */
  labDecal(id: DecalId): boolean {
    if (!this.editable || !this.sandbox || !this.apronFree) return false;
    const def = DECALS[id];
    const target = def.targets ? def.targets(this.view())[0] : undefined;
    if (def.targets && !target) return false;
    this.checkpoint();
    this.stick({ id, target });
    return true;
  }

  /** Test Lab: peel every decal. */
  labClearDecals() {
    if (!this.editable || !this.sandbox) return;
    this.checkpoint();
    this.decals = [];
    this.toWorkshop();
  }

  newRun(machine: MachineId = this.machine) {
    this.runScore = 0;
    this.rings = 0;
    this.prizeDue = false;
    this.bonusRerolls = 0;
    this.machine = machine;
    this.layout = starterLayout();
    // the starting bumpers wait in the toolbox: put them wherever you like, free to place and to move this visit
    for (const p of this.layout.parts) if (!p.fixed) { p.placed = false; p.loose = true; }
    this.round = 1;
    this.money = START_MONEY;
    this.decals = [];
    this.mods = this.workshopMods();
    this.pending = null;
    this.resolved = null;
    this.won = false;
    this.history = [];
    this.future = [];
    this.clearHeat();
    this.runSeed++;
    this.bossPlan = planBosses(this.runSeed * 2741 + 3);
    this.layout.ledge = randomLedge(new Rng(this.runSeed * 613 + 17), this.layout);
    this.shop = this.freshShop(new Rng(this.runSeed));
    this.toWorkshop();
  }

  // ---- history (undo / redo) ------------------------------------------------------------

  private snapshot(): string {
    return JSON.stringify({ layout: this.layout, money: this.money, shop: this.shop, decals: this.decals, pending: this.pending, resolved: this.resolved });
  }

  /** Remember the workshop as it is now, so the next change can be undone. */
  checkpoint() {
    if (!this.editable) return;
    this.history.push(this.snapshot());
    if (this.history.length > 80) this.history.shift();
    this.future = [];
  }

  /** How many steps undo can go back: a part carried and put back undoes to the depth it was picked up at. */
  get historyDepth() {
    return this.history.length;
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
    this.decals = s.decals;
    this.pending = s.pending;
    this.resolved = s.resolved;
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
    for (const p of this.layout.parts) if (!p.fixed && !isDecor(p.def)) p.placed = false; // the decor stays on the cabinet
    let placed = 0, missing = 0;
    for (const e of a.parts) {
      if (!(e.def in PARTS) || e.def === 'mega') { missing++; continue; }
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
  grant(id: PartId, angle = 0): PartInstance | null {
    if (!this.editable || !this.sandbox || id === 'mega') return null;
    this.checkpoint();
    const inst = makePart(id, this.layout.nextUid++);
    inst.angle = aimed(id, angle);
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

  /** Test Lab: raise (or lower) the level of every part that has levels. */
  levelAll(delta: number) {
    if (!this.editable || !this.sandbox) return;
    this.checkpoint();
    for (const p of this.layout.parts) if (PARTS[p.def].recipe.perLevel) p.level = Math.max(0, Math.min(MAX_LEVEL, (p.level ?? 0) + delta));
    this.toWorkshop();
  }

  // ---- save / load ----------------------------------------------------------------

  save(): RunSave {
    return {
      v: 2, layout: this.layout, money: this.money, round: this.round, shop: this.shop, sandbox: this.sandbox, runSeed: this.runSeed,
      picks: this.decals, pending: this.pending, runScore: this.runScore, machine: this.machine, bosses: this.bossPlan, won: this.won, rings: this.rings, bonusRerolls: this.bonusRerolls,
    };
  }

  load(s: RunSave, machine?: MachineId) {
    this.layout = s.layout;
    this.money = s.money;
    this.round = s.round;
    this.shop = { ...s.shop, offers: s.shop.offers.map((id) => (id && id in PARTS && PARTS[id].weight > 0 ? id : null)) };
    delete (this.shop as { decal?: unknown }).decal; // saves from when the shop sold decals
    this.sandbox = s.sandbox;
    this.runSeed = s.runSeed;
    this.machine = s.machine ?? machine ?? 'factory';
    this.decals = (s.picks ?? []).filter((p) => p.id in DECALS).slice(0, DECAL_SLOTS);
    this.pending = s.pending && s.pending.every((o) => o.id in DECALS) ? s.pending : null;
    this.bossPlan = s.bosses?.every((b) => b in BOSSES) ? s.bosses : planBosses(this.runSeed * 2741 + 3);
    this.won = !!s.won;
    this.resolved = null;
    this.runScore = s.runScore ?? 0;
    this.rings = s.rings ?? 0;
    this.bonusRerolls = s.bonusRerolls ?? 0;
    this.history = [];
    this.future = [];
    this.layout.parts = this.layout.parts.filter((p) => p.def in PARTS);
    migrateParts(this.layout, s.levels);
    ensureBigBoi(this.layout);
    this.mods = this.workshopMods();
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
    return this.sandbox || this.bonusRerolls > 0 || this.shop.rerolls < this.mods.freeRerolls ? 0 : 1 + this.shop.rerolls - this.mods.freeRerolls;
  }

  canAfford(cost: number) {
    return this.sandbox || this.money >= cost;
  }

  /** Buy an offer into the inventory (turned to `angle` when it can turn). Returns the new part, or null if you cannot. */
  buy(slot: number, angle = 0): PartInstance | null {
    const id = this.shop.offers[slot];
    if (!this.editable || !id || !this.hasRoomFor(id)) return null;
    const cost = this.priceAt(slot);
    if (!this.canAfford(cost)) return null;
    this.checkpoint();
    if (!this.sandbox) this.money -= cost;
    this.sold(slot);
    const pack = this.makePack(id, cost, angle);
    for (const inst of pack) { inst.fresh = true; this.layout.parts.push(inst); }
    return pack[0];
  }

  /** One shop offer's worth of parts: a pack's pieces know they belong together. */
  /** Is this a Time Capsule that has been on the table for all its rounds? */
  capsuleRipe(p: PartInstance): boolean {
    const c = PARTS[p.def].recipe.capsule;
    return !!c && (p.age ?? 0) >= c.rounds;
  }

  /** Wishing Well: throw $1 in (up to its limit each visit to the workshop). False if you cannot. */
  wish(uid: number): boolean {
    const p = this.part(uid), w = p ? PARTS[p.def].recipe.well : undefined;
    if (!this.editable || !p || !w || this.money < 1) return false;
    const n = p.wished?.round === this.round ? p.wished.n : 0;
    if (n >= w.perRound) return false;
    this.checkpoint();
    if (!this.sandbox) this.money -= 1;
    p.well = (p.well ?? 0) + 1;
    p.wished = { round: this.round, n: n + 1 };
    return true;
  }

  /** How many more $ a Wishing Well takes this visit. */
  wishesLeft(p: PartInstance): number {
    const w = PARTS[p.def].recipe.well;
    return w ? w.perRound - (p.wished?.round === this.round ? p.wished.n : 0) : 0;
  }

  /** Take the Piñata's prize: the part (or pack) goes into the toolbox for free, and the other two go. */
  takePrize(i: number): PartInstance | null {
    const id = this.shop.prize?.[i];
    if (!this.editable || !id || !this.hasRoomFor(id)) return null;
    this.checkpoint();
    this.shop.prize = null;
    const pack = this.makePack(id, 0);
    for (const inst of pack) { inst.fresh = true; this.layout.parts.push(inst); }
    return pack[0];
  }

  private makePack(id: PartId, cost: number, angle = 0): PartInstance[] {
    const n = PARTS[id].pack ?? 1, first = this.layout.nextUid;
    return Array.from({ length: n }, (_, i) => {
      const inst = makePart(id, this.layout.nextUid++);
      inst.angle = aimed(id, angle);
      if (n > 1) inst.group = first;
      inst.loose = true;
      inst.paid = Math.floor(cost / n) + (i < cost % n ? 1 : 0); // the pieces' refunds add up to the price
      return inst;
    });
  }

  /**
   * Where the rest of a pack goes when its first piece is dropped on the table at (x, y): the nearest free spots
   * beside it, in a row first (lanes side by side), or the toolbox. null if some piece fits nowhere.
   */
  private packSpots(id: PartId, x: number, y: number): ({ x: number; y: number } | null)[] | null {
    const n = PARTS[id].pack ?? 1;
    const probe: Layout = { ...this.layout, parts: [...this.layout.parts, makePart(id, -1, x, y, true)] };
    const spots: ({ x: number; y: number } | null)[] = [{ x, y }];
    // a pack's pieces go side by side; a Grape Bunch's snug against each other (they pay for touching)
    const step = PARTS[id].recipe.grape ? 2 * footprint(PARTS[id]) + WALL_GAP + 0.05 : 2.4;
    const offsets = [[1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [0, -2], [0, 2]];
    let toolbox = this.sandbox ? Infinity : this.toolboxSlots - this.inventory.length;
    for (let k = 1; k < n; k++) {
      const at = offsets.map(([dx, dy]) => ({ x: x + dx * step, y: y + dy * step })).find((p) => canPlace(probe, id, p.x, p.y));
      if (at) { probe.parts.push(makePart(id, -1 - k, at.x, at.y, true)); spots.push(at); }
      else if (toolbox-- > 0) spots.push(null);
      else return null;
    }
    return spots;
  }

  // ---- gems (inlays): set into a part on the table, one each ----------------------------------------------

  /** The part a gem dropped at (x, y) goes into: the nearest placed part under the point that it fits. */
  inlayTarget(gem: PartId, x: number, y: number): PartInstance | undefined {
    let best: PartInstance | undefined, bd = Infinity;
    for (const p of this.placed) {
      if (p.fixed || !gemFits(gem, p.def)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= footprint(PARTS[p.def]) + 0.3 && d < bd) { best = p; bd = d; }
    }
    return best;
  }

  /** Could this go at (x, y)? A part on a free spot; a gem into a part it fits. */
  canDropAt(id: PartId, x: number, y: number, ignoreUid?: number): boolean {
    return isInlay(id) ? !!this.inlayTarget(id, x, y) : canPlace(this.layout, id, x, y, ignoreUid);
  }

  /** Set a gem into a part. The gem it replaces goes back to the toolbox (or is sold, if there is no room). */
  private setInlay(gem: PartInstance, target: PartInstance) {
    const old = target.inlay;
    target.inlay = gem.def;
    delete target.leaf; // Gold Leaf's points go with its leaf
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== gem.uid);
    if (old) this.returnGem(old);
  }

  /** A gem out of its part: back in the toolbox, or sold if the toolbox is full. */
  private returnGem(id: PartId) {
    const inst = makePart(id, this.layout.nextUid++);
    inst.fresh = true;
    this.layout.parts.push(inst);
    if (!this.sandbox && this.inventory.length > this.toolboxSlots) this.sellOverflow(inst);
  }

  /** Buy an offer straight onto the board at (x, y), dragged from the shop: it needs room on the table, not in the toolbox. A gem goes into the part there. */
  buyAndPlace(slot: number, x: number, y: number, angle = 0): PartInstance | null {
    const id = this.shop.offers[slot];
    if (!this.editable || !id) return null;
    if (isInlay(id)) {
      const target = this.inlayTarget(id, x, y), cost = this.priceAt(slot);
      if (!target || !this.canAfford(cost)) return null;
      this.checkpoint();
      if (!this.sandbox) this.money -= cost;
      this.sold(slot);
      const gem = makePart(id, this.layout.nextUid++);
      this.layout.parts.push(gem);
      this.setInlay(gem, target);
      return target;
    }
    const cost = this.priceAt(slot);
    if (!this.canAfford(cost) || !canPlace(this.layout, id, x, y)) return null;
    const spots = this.packSpots(id, x, y);
    if (!spots) return null;
    this.checkpoint();
    if (!this.sandbox) this.money -= cost;
    this.sold(slot);
    const pack = this.makePack(id, cost, angle);
    pack.forEach((inst, i) => {
      const at = spots[i];
      if (at) Object.assign(inst, { x: at.x, y: at.y, placed: true });
      else inst.fresh = true;
      this.layout.parts.push(inst);
      if (at) this.sim.updatePart(inst);
    });
    this.clearHeat();
    this.decorChanged(id);
    return pack[0];
  }

  private sold(slot: number) {
    this.shop.offers[slot] = null;
    if (this.shop.locked) this.shop.locked = this.shop.locked.filter((i) => i !== slot);
  }

  /** Test Lab: any part, free, straight onto the board. */
  grantAndPlace(id: PartId, x: number, y: number, angle = 0): PartInstance | null {
    if (!this.editable || !this.sandbox || id === 'mega' || !this.canDropAt(id, x, y)) return null;
    this.checkpoint();
    if (isInlay(id)) {
      const target = this.inlayTarget(id, x, y)!, gem = makePart(id, this.layout.nextUid++);
      this.layout.parts.push(gem);
      this.setInlay(gem, target);
      return target;
    }
    return this.addPlaced(id, x, y, angle);
  }

  private addPlaced(id: PartId, x: number, y: number, angle = 0): PartInstance {
    const inst = makePart(id, this.layout.nextUid++, x, y, true);
    inst.angle = aimed(id, angle);
    this.layout.parts.push(inst);
    this.clearHeat();
    this.sim.updatePart(inst);
    this.decorChanged(id);
    return inst;
  }

  /** What a part costs in the shop (Coupon Book takes $1 off each, never below $1). */
  priceOf(id: PartId): number {
    return Math.max(1, PARTS[id].cost - this.mods.couponOff);
  }

  /** What the offer in a shop slot costs right now (the Bargain Bin's slot is half price). */
  priceAt(slot: number): number {
    const id = this.shop.offers[slot];
    if (!id) return 0;
    const p = this.priceOf(id);
    return this.shop.bargain === slot ? Math.max(1, Math.ceil(p / 2)) : p;
  }

  /** What selling a part refunds (half, or all of it with Full Refund). */
  sellValue(def: PartDef): number {
    return sellPrice(def, this.mods.sellRate);
  }

  reroll(): boolean {
    if (!this.editable || !this.canAfford(this.rerollCost)) return false;
    this.checkpoint();
    // a reroll won in play goes first, and does not make the next paid one dearer
    const won = this.bonusRerolls > 0;
    if (won) this.bonusRerolls--;
    else if (!this.sandbox) this.money -= this.rerollCost;
    const rerolls = this.shop.rerolls + (won ? 0 : 1);
    this.wonRerolls += won ? 1 : 0;
    this.shop = { ...this.freshShop(new Rng(this.runSeed * 7919 + this.round * 131 + rerolls + this.wonRerolls * 997), this.shop), rerolls };
    return true;
  }

  /** What moving this part costs right now (0 if it was bought this visit, its move is paid, or moves are free). */
  moveFee(p: PartInstance): number {
    return this.sandbox || p.loose || this.mods.freeMoves ? 0 : UPKEEP.move;
  }

  /** What removing this part does to your money: a part bought this visit goes back for what it cost; any other costs the scrap fee. */
  removeValue(p: PartInstance): number {
    if (this.sandbox || this.capsuleRipe(p)) return 0;
    if (p.loose) return p.paid ?? 0;
    return this.mods.freeMoves ? 0 : -UPKEEP.scrap;
  }

  /** Pay a part's move fee (once a visit). False if you cannot pay it. */
  private payMove(p: PartInstance): boolean {
    const fee = this.moveFee(p);
    if (fee > this.money) return false;
    this.money -= fee;
    if (!this.sandbox) p.loose = true;
    return true;
  }

  /** Remove a part for good. Returns the change in money (a refund, or minus the scrap fee); null if it cannot be removed. */
  sell(uid: number): number | null {
    const p = this.part(uid);
    if (!this.editable || !p || p.fixed) return null;
    const value = this.removeValue(p);
    if (-value > this.money) return null;
    this.checkpoint();
    this.clearHeat();
    this.money += value;
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== uid);
    this.sim.removePart(uid);
    if (p.inlay) this.returnGem(p.inlay); // its gem comes out first
    this.decorChanged(p.def);
    if (this.capsuleRipe(p)) {
      // a Time Capsule dug up after its rounds: a free pick of legendary parts, above the shop
      const legend = SHOP_IDS.filter((id) => PARTS[id].rarity === 'legendary' && !this.ownedDecor().includes(id));
      const rng = new Rng(this.runSeed * 6007 + this.round * 13 + p.uid);
      const pick: PartId[] = [];
      while (pick.length < PARTS.capsule.recipe.capsule!.pick && legend.length) pick.push(legend.splice(Math.floor(rng.next() * legend.length), 1)[0]);
      this.shop.prize = pick;
    }
    return value;
  }

  // ---- workshop edits (applied live to the running sim) -----------------------------------

  /** Put an inventory part on the board (or move a placed one). */
  place(uid: number, x: number, y: number, checkpoint = false): boolean {
    const p = this.part(uid);
    if (p && isInlay(p.def)) { // a gem from the toolbox goes into the part under it
      const target = this.editable ? this.inlayTarget(p.def, x, y) : undefined;
      if (!target) return false;
      if (checkpoint) this.checkpoint();
      this.setInlay(p, target);
      this.lastInlaid = target.uid;
      return true;
    }
    if (!this.editable || !p || p.fixed || !canPlace(this.layout, p.def, x, y, uid)) return false;
    const moving = p.placed && (p.x !== x || p.y !== y);
    if (moving && this.moveFee(p) > this.money) return false;
    if (checkpoint) this.checkpoint();
    if (moving) this.payMove(p);
    this.clearHeat();
    if (moving && PARTS[p.def].recipe.bonsai) delete p.age; // a Bonsai that is moved starts again
    p.x = x;
    p.y = y;
    p.placed = true;
    delete p.fresh;
    this.sim.updatePart(p);
    this.decorChanged(p.def);
    return true;
  }

  /**
   * Take a part off the board and back into the toolbox. If the toolbox is full the part is sold instead,
   * for its sell price: the return value is that refund (null when it was stored).
   */
  store(uid: number): number | null {
    const p = this.part(uid);
    if (!this.editable || !p || !p.placed || p.fixed || this.moveFee(p) > this.money) return null;
    this.checkpoint();
    this.payMove(p);
    this.clearHeat();
    if (this.toolboxFull) { const refund = this.sellOverflow(p); this.decorChanged(p.def); return refund; }
    if (PARTS[p.def].recipe.bonsai) delete p.age;
    p.placed = false;
    this.sim.updatePart(p);
    this.decorChanged(p.def);
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

  /** Game events from outside a step (Cash Out ends the round between steps): the next step reports them. */
  private queued: GameEvent[] = [];

  cashOut() {
    if (this.mode === 'round' && this.scorer.goalReached) this.endBall(true);
  }

  // ---- stepping -------------------------------------------------------------------

  step(input: Input = NO_INPUT): StepResult {
    const result: StepResult = { sim: [], score: [], game: this.queued };
    this.queued = [];
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
      if (ev.type === 'flipper' && ev.on && this.mode === 'round') this.melt(result);
      if (ev.type === 'launch') {
        // a Marble Jar: every ball launched brings one spark per marble, down from the top
        const n = this.placed.reduce((a, p) => a + (PARTS[p.def].recipe.jar ? this.scorer.marblesOf(p) : 0), 0);
        if (n) this.sim.addSparks(n, 0, 0, ev.ballId, { top: true });
      }
    }
    for (const s of this.scorer.tick(this.sim.time)) result.score.push(s); // a Powder Keg's fuse burns down
    this.spawnSparks(result.score);
    if (!wasGoal && this.scorer.goalReached) result.game.push({ type: 'goal' });
    // a ball ends when the LAST ball on the table is gone (the Ball Printer makes multiball)
    if (this.mode === 'round' && this.sim.ballCount === 0 && !this.sim.awaitingPlunge && !this.insured(result)) this.endBall(false, result);
    return result;
  }

  /**
   * The last ball of a round has drained short of the goal: an Insurance Policy pays out once (its sparks rain from
   * the top, scoring as that ball) and is used up. The ball ends when its sparks are gone. True while that holds it.
   */
  private insured(result: StepResult): boolean {
    if (this.claim) return this.sim.sparkStates().length > 0 || this.pendingSparks.length > 0;
    if (this.ballsLeft > 1 || this.scorer.goalReached) return false;
    const policy = this.placed.find((p) => PARTS[p.def].recipe.insure);
    if (!policy) return false;
    const drained = [...result.sim].reverse().find((e) => e.type === 'drain');
    this.claim = true;
    this.layout.parts = this.layout.parts.filter((q) => q.uid !== policy.uid);
    this.sim.removePart(policy.uid);
    this.sim.addSparks(PARTS[policy.def].recipe.insure!.sparks, 0, 0, drained && 'ballId' in drained ? drained.ballId : 1, { top: true });
    result.score.push(this.scorer.claimed(policy, this.sim.time));
    return true;
  }
  /** An Insurance Policy is paying out on this ball. */
  private claim = false;

  /** A flipper press in a round: every Ice Sculpture loses a point; one at zero is a puddle, and gone. */
  private melt(result: StepResult) {
    for (const p of this.placed) {
      const ice = PARTS[p.def].recipe.ice;
      if (!ice) continue;
      p.ice = Math.max(0, (p.ice ?? PARTS[p.def].recipe.points ?? 0) - ice.melt);
      if (p.ice > 0) continue;
      result.score.push(this.scorer.melted(p, this.sim.time));
      this.layout.parts = this.layout.parts.filter((q) => q.uid !== p.uid);
      this.sim.removePart(p.uid);
      if (p.inlay) this.returnGem(p.inlay);
    }
  }

  private endBall(forced: boolean, result?: StepResult) {
    const out: GameEvent[] = result ? result.game : this.queued;
    if (forced) this.sim.reset(this.layout, { seed: this.seed++, mods: simModsOf(this.mods), ballClock: this.mods.ballClock }); // Cash Out: clear the table at once
    this.ballsLeft--;
    out.push({ type: 'ballEnd', ballsLeft: this.ballsLeft });
    this.sim.clearSparks(); // a ball's sparks go out with it
    this.pendingSparks = [];
    this.claim = false;
    this.wizardBalls = null;
    if (this.scorer.goalReached || this.ballsLeft <= 0) this.runScore += this.scorer.score;
    if (this.scorer.goalReached) {
      this.payout = this.computePayout();
      this.money += this.payout.total;
      for (const d of this.decals) {
        const g = decalGrowth(d, true, this.scorer.peakMult);
        if (g) d.grown = Math.round(((d.grown ?? 0) + g) * 100) / 100; // Momentum and Afterglow keep Mult for the next rounds
      }
      this.mode = 'roundEnd';
      const runWon = this.round === FINAL_ROUND && !this.won;
      if (runWon) this.won = true;
      out.push({ type: 'roundWon', payout: this.payout, runWon });
    } else if (this.ballsLeft <= 0) {
      this.mode = 'runOver';
      out.push({ type: 'runOver' });
    } else {
      this.scorer.startBall();
      this.sim.spawnBall();
    }
  }

  private computePayout(): Payout {
    return payoutFor({
      round: this.round, ballsLeft: this.ballsLeft, score: this.scorer.score, goal: this.scorer.goal, coins: this.scorer.money, money: this.money,
      mods: this.scorer.mods, boss: this.boss !== null, types: new Set(this.placed.filter((p) => !p.fixed).map((p) => p.def)).size, decals: this.decals.length,
      unusedSavers: this.placed.filter((p) => PARTS[p.def].recipe.unusedPay && !this.scorer.saversUsed.has(p.uid)).length,
    });
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

/**
 * Saves from before a change of the parts: a level per part type becomes a level on each part of that type, and an
 * Extra Flipper set to the Right button becomes a Right Flipper.
 */
export function migrateParts(l: Layout, typeLevels?: Partial<Record<PartId, number>>) {
  for (const p of l.parts) {
    if (typeLevels?.[p.def] && p.level === undefined && PARTS[p.def].recipe.perLevel) p.level = Math.min(MAX_LEVEL, typeLevels[p.def]!);
    if (p.def === 'flipper' && (p.dials.side ?? 0) >= 0.5) p.def = 'flipperR';
    delete p.dials.side;
    if (p.def === 'uplight') delete p.dials.target;
  }
}

/** What a cleared round pays. One formula, used by the game and by the balance tool's economy check. */
export function payoutFor(i: { round: number; ballsLeft: number; score: number; goal: number; coins: number; money: number; mods: Mods; boss?: boolean; types?: number; decals?: number; unusedSavers?: number }): Payout {
  const lines: Payout['lines'] = [];
  const m = i.mods;
  lines.push({ label: `Round ${i.round} cleared`, amount: Math.max(0, 3 + i.round - m.payCut) });
  if (i.boss) lines.push({ label: 'Boss beaten', amount: 2 + m.bossBonus });
  if (m.roundBonus > 0) lines.push({ label: 'Sponsor', amount: m.roundBonus });
  if (m.cabinetPay > 0) lines.push({ label: 'Coin Tray', amount: m.cabinetPay });
  if (i.ballsLeft > 0) lines.push({ label: `${i.ballsLeft} unused ball${i.ballsLeft > 1 ? 's' : ''} x $${m.unusedBallPay}`, amount: m.unusedBallPay * i.ballsLeft });
  const interest = Math.min(m.interestCap, Math.floor(i.money / 5) * m.interestPer);
  if (interest > 0) lines.push({ label: `Interest on $${i.money}`, amount: interest });
  const over = i.score / i.goal;
  const doublings = Math.min(3, Math.max(0, Math.floor(Math.log2(over))));
  if (doublings > 0) lines.push({ label: `Overshoot (${over.toFixed(1)}x goal)`, amount: Math.round(2 * doublings * m.overshootFactor) });
  if (m.perTypePay > 0 && i.types) lines.push({ label: `Collector: ${i.types} part types`, amount: m.perTypePay * i.types });
  if (m.perDecalPay > 0 && i.decals) lines.push({ label: `Savings Bond: ${i.decals} decals`, amount: m.perDecalPay * i.decals });
  if (i.unusedSavers && !m.noCoins) lines.push({ label: `${i.unusedSavers} Ball Saver${i.unusedSavers > 1 ? 's' : ''} never used`, amount: i.unusedSavers * (PARTS.saver.recipe.unusedPay ?? 0) });
  if (i.coins > 0) lines.push({ label: 'Coins from play', amount: i.coins });
  return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
}

export type { BossDef, DecalPick, DecalOffer };
