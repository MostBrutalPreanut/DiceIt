import { dialFactor, dialValue, effectiveLevel, grownPoints, hasTag, HOT_WINDOW, lampStats, LEVEL_RADIUS, MAX_LEVEL, modFactor, PARTS, tierOf, type PartId, type PartInstance, type Recipe } from '../data/parts';
import { neutralMods, type Mods } from '../data/mods';
import { bigBoiOf, DRAGON, ORDER, type BigBoiId, type MachineId } from '../data/bigboi';
import { Rng } from '../sim/rng';
import type { SimEvent } from '../sim/sim';

/**
 * One attributed scoring event. The HUD, ledger, popups and sounds all read this and nothing else,
 * so what the player sees is exactly what happened.
 */
export interface ScoreEvent {
  t: number;
  uid: number;
  def: PartId;
  x: number;
  y: number;
  kind: 'hit' | 'bonus' | 'light';
  /** Points before Mult (already includes growth, dials, lamps and every multiplier). */
  base: number;
  /** Points added to the score: base x Mult. */
  points: number;
  multBefore: number;
  multAfter: number;
  money: number;
  /** The pieces of `base`, in plain words, e.g. "100 base", "+15 grown", "+25% lamp". */
  notes: string[];
  label?: string;
  spins?: number;
  /** Vari-target: index of the tier this hit reached. */
  tier?: number;
  /** This hit was a Hot Shot (the ball was hot). */
  hot?: boolean;
}

export interface LedgerRow {
  uid: number;
  def: PartId;
  hits: number;
  points: number;
  money: number;
  multAdded: number;
}

/**
 * Points x Mult with full attribution. Pure logic: no physics, no rendering, so the rules can be
 * unit-tested and balanced headless. `getParts` returns every part the player owns.
 */
export interface ScorerOpts {
  /**
   * Called when a lit group of Level Lights levels up a part, for real (the part's `level` is the owner's to
   * change). Without it the scorer keeps the levels to itself, so a free test ball never levels up a machine.
   */
  onLevelUp?: (inst: PartInstance, levels: number) => void;
  /** The run's decals and the boss (neutral if absent). */
  mods?: Mods;
  /** Overrides the Mult every ball starts with (default: the mods' `startMult`). */
  baseMult?: number;
  /** The machine: decides what Big Boi does. */
  machine?: MachineId;
  /** Seed for the Cook's orders and the Overlord's picks. */
  seed?: number;
  /** Balls on the table right now (Multiball Madness). */
  balls?: () => number;
  /** Is the ball in play the round's last? (Last Call) */
  lastBall?: () => boolean;
  /** The money you hold (Thrifty). */
  cash?: () => number;
  /** A boss jams part types: the most numerous one for the round, or a random one every ball. */
  jam?: 'mostNumerous' | 'randomEachBall';
  /** The Auditor: these mods (with the decals) take over once the score reaches `at`. */
  later?: { mods: Mods; at: number; baseMult: number };
}

export class Scorer {
  score = 0;
  mult: number;
  money = 0;
  goalReached = false;
  readonly ledger = new Map<number, LedgerRow>();
  /** Per-ball state: hits of each part type, which lights are lit, the types the ball has hit. */
  private hitsByType = new Map<PartId, number>();
  private lit = new Set<number>();
  private typesHit = new Set<PartId>();
  /** Level Lights stay lit for the whole round, not just one ball. */
  private roundLit = new Set<number>();
  /** Levels this scorer gave out itself (a test ball's, which never reach the machine). */
  private gained = new Map<number, number>();
  private onLevelUp?: (inst: PartInstance, levels: number) => void;
  /** Lamps: how bright each one is this ball, and until when every Lamp is at full glow (a bank set, the Disco Ball). */
  private lampSteps = new Map<number, number>();
  private lampFlashUntil = -1;
  /** Glow Strips: until when each one is lit. */
  private stripUntil = new Map<number, number>();
  /** The time of the latest event (labels and the hover card read lamp and strip state at it). */
  private now = 0;
  /** Ball Savers that saved a ball this round (the ones that do not pay at the end of the round). */
  readonly saversUsed = new Set<number>();
  mods: Mods;
  /** Scoring hits so far this round and this ball (Gold Ball, Lucky Seven and the jackpot count them). */
  private roundHits = 0;
  private ballHits = 0;
  /** Hits of each type this round (Golden Bumper's coins). */
  private roundTypeHits = new Map<PartId, number>();
  /**
   * What the limits in the recipes have let through so far. Every source that compounds (growth, Mult, set
   * bonuses, coins) has a cap: this ledger of what has been paid is how the caps are kept. Per ball: Mult and
   * sets. Per round: money.
   */
  private multPaid = new Map<string, number>();
  private xPaid = new Map<string, number>();
  private setsPaid = new Map<string, number>();
  private moneyPaid = new Map<string, number>();
  /** Hot Shots: each hot ball's bonus on its next scoring hit, and until when. */
  private hot = new Map<number, { until: number; bonus: number }>();
  /** Per part: until when it is dark (X Lane), and how often it fired this ball (Disco Ball). */
  private coolUntil = new Map<number, number>();
  private firedThisBall = new Map<number, number>();
  /** The jackpot pot: ball hits when each scoop last cashed. */
  private potFrom = new Map<number, number>();
  /** Piggy Banks: the $ inside each one (per round). */
  readonly piggies = new Map<number, number>();
  baseMult: number;
  readonly machine: MachineId;
  readonly bigBoi: BigBoiId;
  /** The Cook's order: the one part (by uid) whose next hit pays triple. */
  order: number | null = null;
  /** The Dragon's armour plates left, and how often it was knocked off this ball. */
  armour: number = DRAGON.armour;
  slays = 0;
  /** Part types a boss has switched off. */
  readonly jammed = new Set<PartId>();
  private rng: Rng;
  private opts: ScorerOpts;

  constructor(public goal: number, private getParts: () => PartInstance[] = () => [], opts: ScorerOpts = {}) {
    this.opts = opts;
    this.mods = { ...neutralMods(), ...opts.mods }; // a saved machine from before a mod existed still scores
    this.baseMult = opts.baseMult ?? this.mods.startMult;
    this.mult = this.baseMult;
    this.onLevelUp = opts.onLevelUp;
    this.machine = opts.machine ?? 'factory';
    this.bigBoi = bigBoiOf(this.machine).id;
    this.rng = new Rng(opts.seed ?? 1);
  }

  /** The level a part has earned (Level Lights), this round's included. */
  levelOf(inst: PartInstance) {
    return Math.min(MAX_LEVEL, (inst.level ?? 0) + (this.gained.get(inst.uid) ?? 0));
  }

  /** The level the part scores at: its own plus what the decals add. */
  effLevel(inst: PartInstance) {
    return effectiveLevel(inst.def, this.levelOf(inst), this.mods);
  }

  recipe(id: PartId): Recipe {
    return id === 'mega' ? bigBoiOf(this.machine).recipe : PARTS[id].recipe;
  }

  private placed() {
    return this.getParts().filter((p) => p.placed);
  }

  /** Called when a round (not a ball) starts: the Level Lights go dark, the piggies are empty, a jam is decided. */
  resetRound() {
    this.roundLit.clear();
    this.saversUsed.clear();
    this.roundHits = 0;
    this.roundTypeHits.clear();
    this.moneyPaid.clear();
    this.piggies.clear();
    this.jammed.clear();
    if (this.opts.jam === 'mostNumerous') {
      const n = new Map<PartId, number>();
      for (const p of this.placed()) if (!p.fixed && this.recipe(p.def).points) n.set(p.def, (n.get(p.def) ?? 0) + 1);
      const top = [...n.entries()].sort((a, b) => b[1] - a[1] || PARTS[b[0]].cost - PARTS[a[0]].cost)[0];
      if (top) this.jammed.add(top[0]);
    }
    this.startBall();
  }

  /** How much of `want` a cap lets through (all of it when there is no cap); what passes is recorded against the key. */
  private take(paid: Map<string, number>, key: string, want: number, cap: number | undefined): number {
    if (want <= 0) return 0;
    const used = paid.get(key) ?? 0;
    const got = cap === undefined ? want : Math.max(0, Math.min(want, cap - used));
    paid.set(key, used + got);
    return got;
  }

  /** The same for a ×Mult: how much of `x` the cap on the product lets through. */
  private takeX(key: string, x: number, cap: number | undefined): number {
    if (x <= 1) return 1;
    const used = this.xPaid.get(key) ?? 1;
    const got = cap === undefined ? x : Math.max(1, Math.min(x, cap / used));
    this.xPaid.set(key, used * got);
    return got;
  }

  startBall() {
    this.mult = this.baseMult;
    this.ballHits = 0;
    this.multPaid.clear();
    this.xPaid.clear();
    this.setsPaid.clear();
    this.hitsByType.clear();
    this.typesHit.clear();
    this.lit.clear();
    this.lampSteps.clear();
    this.lampFlashUntil = -1;
    this.stripUntil.clear();
    this.hot.clear();
    this.coolUntil.clear();
    this.firedThisBall.clear();
    this.potFrom.clear();
    this.armour = DRAGON.armour;
    this.slays = 0;
    this.order = null;
    if (this.opts.jam === 'randomEachBall') {
      this.jammed.clear();
      const types = [...new Set(this.placed().filter((p) => !p.fixed && this.recipe(p.def).points).map((p) => p.def))].sort();
      if (types.length) this.jammed.add(types[Math.floor(this.rng.next() * types.length)]);
    }
  }

  /** The Cook calls an order: one scoring part on the table other than himself (and not the one already lit). */
  private pickOrder(not: number | null): number | null {
    const parts = this.placed().filter((p) => p.def !== 'mega' && this.recipe(p.def).points && !this.jammed.has(p.def)).sort((a, b) => a.uid - b.uid);
    const pool = parts.length > 1 ? parts.filter((p) => p.uid !== not) : parts;
    return pool.length ? pool[Math.floor(this.rng.next() * pool.length)].uid : null;
  }

  isLit(uid: number) {
    if (this.mods.lightsOut) return false;
    return this.lit.has(uid) || this.roundLit.has(uid) || this.lampLevel(uid) > 0 || (this.stripUntil.get(uid) ?? -1) > this.now;
  }

  /** How many steps bright a Lamp is right now (all of them while the lamps flash). */
  lampLevel(uid: number) {
    if (this.mods.lightsOut) return 0;
    if (this.lampFlashUntil > this.now && this.getParts().some((p) => p.uid === uid && p.def === 'lamp')) return PARTS.lamp.recipe.brighten?.steps ?? 5;
    return this.lampSteps.get(uid) ?? 0;
  }

  /** A lit Glow Strip under this part: what it adds (0 if none). */
  stripBonusAt(inst: PartInstance): number {
    if (this.mods.lightsOut) return 0;
    let b = 0;
    for (const st of this.placed()) {
      const r = PARTS[st.def].recipe.strip;
      if (!r || st.uid === inst.uid || (this.stripUntil.get(st.uid) ?? -1) <= this.now) continue;
      const sh = PARTS[st.def].shape;
      if (sh.type !== 'box') continue;
      if (Math.abs(inst.x - st.x) <= sh.hw + 0.3 && Math.abs(inst.y - st.y) <= sh.hh + r.reach) b += r.bonus;
    }
    return b;
  }

  /** How often a part has fired this ball (Disco Ball). */
  firedOf(uid: number) {
    return this.firedThisBall.get(uid) ?? 0;
  }

  /** X Lane: is it dark right now (it just fired)? */
  coolingDown(uid: number, t: number) {
    return (this.coolUntil.get(uid) ?? -1) > t;
  }

  hitsOf(id: PartId) {
    return this.hitsByType.get(id) ?? 0;
  }

  /** Different part types the ball has hit this ball (Ding-Dong Bell). */
  get variety() {
    return this.typesHit.size;
  }

  /** What a Jackpot Scoop would add if the ball sank into it now. */
  potOf(inst: PartInstance): number {
    const j = this.recipe(inst.def).jackpot;
    if (!j) return 0;
    return Math.min(j.cap, j.per * (this.ballHits - (this.potFrom.get(inst.uid) ?? 0)));
  }

  /** Sum of the bonuses of every lit lamp whose glow reaches this part (each lamp's bonus grows with its brightness). */
  lampBonusAt(inst: PartInstance): { sum: number; count: number } {
    let sum = 0, count = 0;
    if (this.mods.lightsOut) return { sum, count };
    for (const l of this.placed()) {
      if (PARTS[l.def].kind !== 'lamp') continue;
      const steps = this.lampLevel(l.uid);
      if (!steps) continue;
      const lamp = lampStats(dialValue(l, 'radius'), this.mods);
      if (Math.hypot(l.x - inst.x, l.y - inst.y) <= lamp.radius) {
        sum += lamp.bonus * steps;
        count++;
      }
    }
    return { sum: Math.round(sum * 100) / 100, count };
  }

  /** Multipliers that depend on the moment, not the part: Thrifty, Multiball Madness, Last Call, Purist. */
  private situational(): { x: number; notes: string[] } {
    const m = this.mods, notes: string[] = [];
    let x = 1;
    if (m.cashPer > 0 && this.opts.cash) {
      const c = Math.min(m.cashCap, m.cashPer * Math.max(0, this.opts.cash()));
      if (c > 0) { x *= 1 + c; notes.push(`+${Math.round(c * 100)}% thrifty`); }
    }
    if (m.multiballX !== 1 && (this.opts.balls?.() ?? 1) >= 2) { x *= m.multiballX; notes.push(`x${m.multiballX} multiball`); }
    if (m.lastBallX !== 1 && this.opts.lastBall?.()) { x *= m.lastBallX; notes.push(`x${m.lastBallX} last call`); }
    if (m.puristX !== 1 && this.puristOk()) { x *= m.puristX; notes.push(`x${m.puristX} purist`); }
    return { x, notes };
  }

  /** Purist: the table holds few enough part types (Big Boi does not count). */
  puristOk(): boolean {
    return new Set(this.placed().filter((p) => !p.fixed).map((p) => p.def)).size <= this.mods.puristTypes;
  }

  /** What this part would score per event right now, before Mult. Null for parts that do not score. */
  baseNow(inst: PartInstance, spins = 1, tierX = 1): number | null {
    const r = this.recipe(inst.def);
    if (!r.points) return null;
    const grown = grownPoints(r, this.hitsOf(inst.def));
    const lvl = (r.perLevel ?? 0) * this.effLevel(inst);
    const variety = r.variety ? r.variety * this.variety : 0;
    const order = this.order === inst.uid ? ORDER.x : 1;
    return Math.round((r.points + lvl + grown + variety + this.potOf(inst)) * spins * tierX * dialFactor(inst) * modFactor(inst.def, this.mods) * (1 + this.lampBonusAt(inst).sum) * (1 + this.stripBonusAt(inst)) * order);
  }

  /** The short number drawn on the part itself ("100", "10/spin", "+25%", "x1.25"). */
  label(inst: PartInstance): string | null {
    const def = PARTS[inst.def];
    if (this.jammed.has(inst.def)) return 'JAMMED';
    if (def.kind === 'lamp') return this.mods.lightsOut ? 'OFF' : `+${Math.round(lampStats(dialValue(inst, 'radius'), this.mods).bonus * this.lampLevel(inst.uid) * 100)}%`;
    if (def.kind === 'strip') return this.mods.lightsOut ? 'OFF' : `+${Math.round((def.recipe.strip?.bonus ?? 0) * 100)}%`;
    const r = this.recipe(inst.def);
    if (r.xmult && !r.points) return this.mods.lightsOut ? 'OFF' : `x${(1 + (r.xmult - 1) * this.mods.multGain).toFixed(2)}`;
    const n = this.baseNow(inst);
    if (n === null) return null;
    const tiers = r.tiers;
    if (tiers && inst.def === 'vari') return `${n}-${this.baseNow(inst, 1, tiers[tiers.length - 1].x)}`; // soft hit to smash
    if (r.piggy) return `${n} · $${this.piggies.get(inst.uid) ?? 0}`;
    return r.per === 'spin' ? `${n}/spin` : String(n);
  }

  private addLedger(inst: PartInstance, points: number, money: number, multAdded: number) {
    const row = this.ledger.get(inst.uid) ?? { uid: inst.uid, def: inst.def, hits: 0, points: 0, money: 0, multAdded: 0 };
    row.hits++;
    row.points += points;
    row.money += money;
    row.multAdded += multAdded;
    this.ledger.set(inst.uid, row);
  }

  private award(inst: PartInstance, t: number, x: number, y: number, kind: ScoreEvent['kind'], base: number, multGain: number, money: number, notes: string[], label?: string, spins?: number, xmult = 1): ScoreEvent {
    const multBefore = this.mult;
    const points = Math.round(base * multBefore);
    this.mult = Math.round((this.mult + multGain) * xmult * 1000) / 1000;
    this.score += points;
    this.money += money;
    if (this.score >= this.goal) this.goalReached = true;
    if (kind === 'bonus') this.flashStrips(t);
    this.addLedger(inst, points, money, this.mult - multBefore);
    this.checkLater();
    return { t, uid: inst.uid, def: inst.def, x, y, kind, base, points, multBefore, multAfter: this.mult, money, notes, label, spins };
  }

  /** Anything paid a bonus: every Glow Strip lights up for a while. */
  private flashStrips(t: number) {
    for (const p of this.placed()) {
      const r = PARTS[p.def].recipe.strip;
      if (r) this.stripUntil.set(p.uid, t + r.seconds);
    }
  }

  /** The Auditor: the decals come back once the score reaches the mark. */
  private laterDone = false;
  private checkLater() {
    const l = this.opts.later;
    if (!l || this.laterDone || this.score < l.at) return;
    this.laterDone = true;
    this.mods = l.mods;
    this.baseMult = l.baseMult;
    this.pending.push('DECALS BACK ON!');
  }
  /** Shouts the scorer owes the next event (the Auditor letting go). */
  private pending: string[] = [];

  /** A Mult gain after the boss's Flat Rate. */
  private gain(n: number) { return n * this.mods.multGain; }
  private gainX(x: number) { return 1 + (x - 1) * this.mods.multGain; }

  /** Turn one physical event into zero or more attributed score events. */
  consume(ev: SimEvent): ScoreEvent[] {
    if (ev.type === 'ballSaved') {
      this.saversUsed.add(ev.uid);
      return [];
    }
    if (ev.type !== 'partHit') return [];
    this.now = ev.t;
    const inst = this.getParts().find((p) => p.uid === ev.uid && p.placed);
    if (!inst) return [];
    const out = this.hit(inst, ev);
    if (this.pending.length && out.length) out[out.length - 1].label ??= this.pending.shift();
    return out;
  }

  private hit(inst: PartInstance, ev: Extract<SimEvent, { type: 'partHit' }>): ScoreEvent[] {
    const def = PARTS[inst.def];
    const r = this.recipe(inst.def);
    const m = this.mods;
    const out: ScoreEvent[] = [];
    if (this.jammed.has(inst.def)) return out;
    if (m.lightsOut && def.tags.includes('light')) return out;

    // lamps only light up
    if (def.kind === 'lamp') {
      const b = r.brighten!, steps = this.lampSteps.get(inst.uid) ?? 0;
      if (steps >= b.steps) return out; // as bright as it gets
      this.lampSteps.set(inst.uid, steps + 1);
      const pts = Math.round(b.points * modFactor(inst.def, m));
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'light', pts, 0, 0, [`${pts} brighter`], steps + 1 >= b.steps ? 'LAMP FULL!' : `LAMP ${steps + 1}/${b.steps}`));
      return out;
    }

    // a drop-target bank with every target down pays its set bonus (the individual hits scored already)
    if (def.kind === 'bank' && ev.bankComplete) {
      const situ = this.situational();
      const pts = Math.round(r.setBonus!.points * m.setFactor * modFactor(inst.def, m) * situ.x);
      if (r.lightsLamps) this.flashLamps(ev.t, r.lightsLamps);
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, this.gain(r.setBonus!.mult * m.setFactor), 0, [`${pts} bank bonus`, ...situ.notes], 'BANK COMPLETE'));
      return out;
    }

    // the goal: a ball past the goalie (the goalie and the posts score nothing)
    if (def.kind === 'goal') {
      if (!ev.goal || this.coolingDown(inst.uid, ev.t)) return out;
      this.coolUntil.set(inst.uid, ev.t + (r.cooldown ?? 1.5));
      const situ = this.situational();
      const pts = Math.round(((r.points ?? 0) + (r.perLevel ?? 0) * this.effLevel(inst)) * modFactor(inst.def, m) * (1 + this.lampBonusAt(inst).sum) * situ.x);
      const x = this.takeX(inst.def, this.gainX(r.goal!.xmult), this.gainX(r.goal!.xmultCap));
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, 0, 0, [`${pts} goal`, ...situ.notes], 'GOAL!', undefined, x));
      return out;
    }
    // a moving part scores only when its moving piece is hit (the duck, the roller), not its rail
    if (def.kind === 'mover' && !ev.mover) return out;

    // a part that scores nothing itself can still make the ball hot (a Deflector's bank shot)
    if (!r.points && r.hot && !r.xmult) {
      this.hot.set(ev.ballId, { until: ev.t + HOT_WINDOW, bonus: r.hot * m.hotFactor });
      return out;
    }

    // X Lane and other ×Mult lights without points
    if (!r.points && r.xmult) {
      if (this.coolingDown(inst.uid, ev.t)) return out;
      if (r.cooldown) this.coolUntil.set(inst.uid, ev.t + r.cooldown);
      const x = this.takeX(inst.def, this.gainX(r.xmult), r.xmultCap ? this.gainX(r.xmultCap) : undefined);
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [], x > 1.0001 ? `MULT x${x.toFixed(2)}` : 'X LANE MAXED', undefined, x));
      if (r.lightsLane) { const lane = this.lightNextLane(); if (lane) out.push(...this.checkLaneSet(lane, ev, inst)); }
      return out;
    }

    if (r.points) {
      if (r.perBall && (this.firedThisBall.get(inst.uid) ?? 0) >= r.perBall) return out;
      const spins = ev.spins ?? 1;
      const grown = grownPoints(r, this.hitsOf(inst.def));
      const level = (r.perLevel ?? 0) * this.effLevel(inst);
      const variety = r.variety ? r.variety * this.variety : 0;
      const pot = r.jackpot ? this.potOf(inst) : 0;
      const factor = dialFactor(inst);
      const lamp = this.lampBonusAt(inst);
      const tier = tierOf(inst, ev.speed, m.tierEase);
      const tierX = inst.def === 'vari' ? tier?.x ?? 1 : 1;
      const notes = [`${r.points}${spins > 1 ? ` x${spins} spins` : ''} base`];
      if (level) notes.push(`+${level} level`);
      if (grown) notes.push(`+${grown} grown`);
      if (variety) notes.push(`+${variety} variety`);
      if (pot) notes.push(`+${pot} pot`);
      if (tier && inst.def === 'vari') notes.push(`x${tier.x} ${tier.name} hit`);
      if (Math.abs(factor - 1) > 0.001) notes.push(`x${Math.round(factor * 100) / 100} dial`);
      const mf = modFactor(inst.def, m);
      if (Math.abs(mf - 1) > 0.001) notes.push(`x${Math.round(mf * 100) / 100} decals`);
      if (lamp.sum) notes.push(`+${Math.round(lamp.sum * 100)}% lamp`);
      const strip = this.stripBonusAt(inst);
      if (strip) notes.push(`+${Math.round(strip * 100)}% glow strip`);
      const edge = r.edgeShot && ev.edge ? r.edgeShot.x : 1;
      if (edge > 1) notes.push(`x${edge} edge shot`);
      this.roundHits++;
      this.ballHits++;
      this.roundTypeHits.set(inst.def, (this.roundTypeHits.get(inst.def) ?? 0) + 1);
      const lucky = m.luckyEvery > 0 && this.ballHits % m.luckyEvery === 0;
      if (lucky) notes.push(`x${m.luckyX} lucky seven`);
      const hot = this.hot.get(ev.ballId);
      const hotBonus = hot && hot.until >= ev.t ? hot.bonus : 0;
      if (hot) this.hot.delete(ev.ballId);
      if (hotBonus) notes.push(`+${Math.round(hotBonus * 100)}% hot shot`);
      const order = this.order === inst.uid ? ORDER.x : 1;
      if (order > 1) { notes.push(`x${order} order`); this.order = null; }
      const situ = this.situational();
      notes.push(...situ.notes);
      // money
      let money = 0;
      if (!m.noCoins) {
        const goldDue = m.goldEvery > 0 && this.roundHits % m.goldEvery === 0 ? 1 : 0;
        const gold = this.take(this.moneyPaid, 'gold', goldDue, m.goldCap || undefined);
        if (gold) notes.push('+$1 gold ball');
        const coins = this.take(this.moneyPaid, inst.def, r.money ?? 0, r.moneyCap);
        if (r.money && coins < r.money) notes.push('coin limit reached');
        let every = 0;
        if (r.moneyEvery && (this.roundTypeHits.get(inst.def) ?? 0) % r.moneyEvery.n === 0) every = this.take(this.moneyPaid, `${inst.def}:every`, 1, r.moneyEvery.cap);
        let piggy = 0;
        if (r.piggy) {
          const held = this.piggies.get(inst.uid) ?? 0;
          if (tier && r.tiers!.indexOf(tier) >= r.piggy.breakTier && held > 0) {
            piggy = held + r.piggy.bonus;
            this.piggies.set(inst.uid, 0);
            notes.push(`piggy smashed: $${piggy}`);
          } else this.piggies.set(inst.uid, Math.min(r.piggy.cap, held + 1));
        }
        money = gold + coins + every + piggy;
      }
      // Mult: plus, times, and per spin
      let multGain = this.gain(this.take(this.multPaid, inst.def, r.mult ?? 0, r.multCap));
      if (r.mult && multGain < this.gain(r.mult) - 1e-9) notes.push('Mult maxed for this ball');
      if (r.spinMult) multGain += this.gain(this.take(this.multPaid, 'spin', r.spinMult * m.spinMult * spins, (r.spinMultCap ?? 0) * m.spinMult));
      const xmult = r.xmult ? this.takeX(inst.def, this.gainX(r.xmult), r.xmultCap ? this.gainX(r.xmultCap) : undefined) : 1;
      const base = Math.round((r.points + level + grown + variety + pot) * spins * tierX * factor * mf * (1 + lamp.sum) * (1 + strip) * edge * (lucky ? m.luckyX : 1) * (1 + hotBonus) * order * situ.x);
      this.hitsByType.set(inst.def, this.hitsOf(inst.def) + 1);
      if (r.feeds) this.hitsByType.set(r.feeds.id, this.hitsOf(r.feeds.id) + r.feeds.n);
      this.typesHit.add(inst.def);
      if (r.jackpot) this.potFrom.set(inst.uid, this.ballHits);
      if (r.perBall) this.firedThisBall.set(inst.uid, (this.firedThisBall.get(inst.uid) ?? 0) + 1);
      if (r.lightsLamps) this.flashLamps(ev.t, r.lightsLamps);
      const label = r.perBall && xmult > 1 ? `MULT x${xmult.toFixed(2)}` : r.jackpot && pot ? 'JACKPOT!' : edge > 1 ? 'EDGE SHOT!' : undefined;
      const scored = this.award(inst, ev.t, ev.x, ev.y, r.perBall || (r.jackpot && pot) ? 'bonus' : 'hit', base, multGain, money, notes, label, ev.spins, xmult);
      if (tier && inst.def === 'vari') scored.tier = r.tiers!.indexOf(tier);
      if (hotBonus) scored.hot = true;
      out.push(scored);
      // this hit makes the ball hot for its next one
      if (r.hot && (r.hotTier === undefined || (tier && r.tiers!.indexOf(tier) >= r.hotTier))) this.hot.set(ev.ballId, { until: ev.t + HOT_WINDOW, bonus: r.hot * m.hotFactor });
      // the Cook calls a new order; the Dragon loses a plate
      if (inst.def === 'mega') out.push(...this.bigBoiHit(inst, ev));
    }

    // Level Lights (Space Cadet's bumper upgrade lanes): each pass switches the light on or off. When every light
    // in a group (lights within reach of each other) is on, the bumpers within reach of them level up, by one
    // level for each light past the first, and the group goes dark
    if (r.levelUp) {
      if (this.roundLit.has(inst.uid)) this.roundLit.delete(inst.uid);
      else {
        this.roundLit.add(inst.uid);
        const group = this.lightGroup(inst);
        if (group.length >= 2 && group.every((l) => this.roundLit.has(l.uid))) {
          for (const l of group) this.roundLit.delete(l.uid);
          const levels = group.length - 1;
          const near = this.placed().filter((p) => hasTag(p.def, 'bumper') && this.recipe(p.def).perLevel && group.some((l) => Math.hypot(l.x - p.x, l.y - p.y) <= LEVEL_RADIUS));
          let upped = 0;
          for (const p of near) {
            const room = MAX_LEVEL - this.levelOf(p);
            if (room <= 0) continue;
            const n = Math.min(room, levels);
            if (this.onLevelUp) this.onLevelUp(p, n);
            else this.gained.set(p.uid, (this.gained.get(p.uid) ?? 0) + n);
            upped++;
          }
          out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [], upped ? `${upped} BUMPER${upped > 1 ? 'S' : ''} +${levels} LEVEL${levels > 1 ? 'S' : ''}!` : near.length ? 'BUMPERS MAXED OUT' : 'NO BUMPERS NEARBY'));
        }
      }
    }

    // lane rollovers: light up, and a complete set pays a bonus and resets
    if (r.lights && def.kind === 'rollover') {
      this.lit.add(inst.uid);
      out.push(...this.checkLaneSet(inst, ev));
    }
    return out;
  }

  /**
   * The three Lane Rollovers of a pack make a set: when all three are lit it pays its bonus, and they go dark.
   * (Lanes from no pack, from an old save or the Test Lab, make sets of any three.)
   */
  private checkLaneSet(lane: PartInstance, ev: { t: number; x: number; y: number }, inst = lane): ScoreEvent[] {
    const r = PARTS.lane.recipe, m = this.mods, size = r.setSize ?? 3;
    const lit = this.placed().filter((p) => p.def === 'lane' && p.group === lane.group && this.lit.has(p.uid));
    if (!r.setBonus || lit.length < size) return [];
    for (const l of lit) this.lit.delete(l.uid);
    if (this.take(this.setsPaid, 'lane', 1, r.setCap) === 0) return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`${r.setCap} sets this ball`], 'LANE SETS MAXED')];
    const situ = this.situational();
    const pts = Math.round(r.setBonus.points * m.setFactor * modFactor('lane', m) * situ.x);
    return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, this.gain(r.setBonus.mult * m.setFactor), 0, [`${pts} set bonus`, ...situ.notes], 'LANES COMPLETE')];
  }

  /** Every Lamp at full glow for a while (a drop-target set, the Disco Ball). */
  private flashLamps(t: number, seconds: number) {
    this.lampFlashUntil = Math.max(this.lampFlashUntil, t + seconds);
  }

  /** This Level Light and the ones within its reach: they work together. */
  lightGroup(inst: PartInstance): PartInstance[] {
    const near = this.placed().filter((p) => p.def === 'uplight' && p.uid !== inst.uid && Math.hypot(p.x - inst.x, p.y - inst.y) <= LEVEL_RADIUS);
    return [inst, ...near];
  }

  /** X Lane: light the next dark Lane Rollover (left to right); it can complete a set. */
  private lightNextLane(): PartInstance | undefined {
    const lanes = this.placed().filter((p) => p.def === 'lane').sort((a, b) => a.x - b.x || a.y - b.y);
    const dark = lanes.find((l) => !this.lit.has(l.uid));
    if (dark) this.lit.add(dark.uid);
    return dark;
  }

  /** Big Boi's own ability on a hit: the Cook calls an order, the Dragon loses a plate. */
  private bigBoiHit(inst: PartInstance, ev: { t: number; x: number; y: number }): ScoreEvent[] {
    if (this.bigBoi === 'cook') {
      this.order = this.pickOrder(this.order);
      return [];
    }
    if (this.bigBoi !== 'dragon') return [];
    this.armour = Math.max(0, this.armour - 1);
    if (this.armour > 0) return [];
    this.slays++;
    this.armour = DRAGON.armour + DRAGON.regrow * this.slays;
    const r = this.recipe('mega'), m = this.mods;
    const situ = this.situational();
    const pts = Math.round((r.points! + (r.perLevel ?? 0) * this.effLevel(inst)) * DRAGON.jackpotX * modFactor('mega', m) * situ.x);
    return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, 0, 0, [`${pts} armour broken`, ...situ.notes], 'ARMOUR BROKEN!')];
  }

  ledgerRows(): LedgerRow[] {
    return [...this.ledger.values()].sort((a, b) => b.points - a.points);
  }
}
