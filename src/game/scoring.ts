import { dialFactor, dialValue, effectiveLevel, grownPoints, HOT_WINDOW, lampStats, LEVEL_TARGETS, modFactor, PARTS, tierOf, type PartId, type PartInstance, type Recipe } from '../data/parts';
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
  /** Per-run level of each part type. Mutated by `onLevelUp`'s owner, read here. */
  levels?: Partial<Record<PartId, number>>;
  /** Called when a Level Light set completes. Returns the new level, or null if already at the cap. */
  onLevelUp?: (id: PartId) => number | null;
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
  private levels: Partial<Record<PartId, number>>;
  private onLevelUp?: (id: PartId) => number | null;
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
    this.levels = opts.levels ?? {};
    this.onLevelUp = opts.onLevelUp;
    this.machine = opts.machine ?? 'factory';
    this.bigBoi = bigBoiOf(this.machine).id;
    this.rng = new Rng(opts.seed ?? 1);
  }

  levelOf(id: PartId) {
    return this.levels[id] ?? 0;
  }

  /** The level the part type scores at: its own plus what the decals add. */
  effLevel(id: PartId) {
    return effectiveLevel(id, this.levelOf(id), this.mods);
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
    return !this.mods.lightsOut && (this.lit.has(uid) || this.roundLit.has(uid));
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

  /** Sum of the bonuses of every lit lamp whose glow reaches this part. */
  lampBonusAt(inst: PartInstance): { sum: number; count: number } {
    let sum = 0, count = 0;
    if (this.mods.lightsOut) return { sum, count };
    for (const l of this.placed()) {
      if (PARTS[l.def].kind !== 'lamp' || !this.lit.has(l.uid)) continue;
      const lamp = lampStats(dialValue(l, 'radius'), this.mods);
      if (Math.hypot(l.x - inst.x, l.y - inst.y) <= lamp.radius) {
        sum += lamp.bonus;
        count++;
      }
    }
    return { sum, count };
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
    const lvl = (r.perLevel ?? 0) * this.effLevel(inst.def);
    const variety = r.variety ? Math.min(r.varietyCap ?? Infinity, r.variety * this.variety) : 0;
    const order = this.order === inst.uid ? ORDER.x : 1;
    return Math.round((r.points + lvl + grown + variety + this.potOf(inst)) * spins * tierX * dialFactor(inst) * modFactor(inst.def, this.mods) * (1 + this.lampBonusAt(inst).sum) * order);
  }

  /** The short number drawn on the part itself ("100", "10/spin", "+25%", "x1.25"). */
  label(inst: PartInstance): string | null {
    const def = PARTS[inst.def];
    if (this.jammed.has(inst.def)) return 'JAMMED';
    if (def.kind === 'lamp') return this.mods.lightsOut ? 'OFF' : `+${Math.round(lampStats(dialValue(inst, 'radius'), this.mods).bonus * 100)}%`;
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
    this.addLedger(inst, points, money, this.mult - multBefore);
    this.checkLater();
    return { t, uid: inst.uid, def: inst.def, x, y, kind, base, points, multBefore, multAfter: this.mult, money, notes, label, spins };
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
    // lane change: a flipper button shifts which lanes are lit
    if (ev.type === 'flipper') {
      if (ev.on && !this.mods.lightsOut) this.shiftLanes(ev.side === 'L' ? -1 : 1);
      return [];
    }
    if (ev.type === 'ballSaved') {
      const inst = this.getParts().find((p) => p.uid === ev.uid && p.placed);
      const pay = inst ? this.recipe(inst.def).saveMoney ?? 0 : 0;
      if (!inst || !pay || this.mods.noCoins) return [];
      return [this.award(inst, ev.t, inst.x, inst.y, 'light', 0, 0, pay, [`+$${pay} save`], `SAVED +$${pay}`)];
    }
    if (ev.type !== 'partHit') return [];
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
      if (!this.lit.has(inst.uid)) {
        this.lit.add(inst.uid);
        const on = r.onLight;
        const pts = on ? Math.round(on.points * modFactor(inst.def, m)) : 0;
        out.push(this.award(inst, ev.t, ev.x, ev.y, 'light', pts, on ? this.gain(on.mult) : 0, 0, pts ? [`${pts} lamp lit`] : [], 'LAMP LIT'));
      }
      return out;
    }

    // a drop-target bank with every target down pays its set bonus (the individual hits scored already)
    if (def.kind === 'bank' && ev.bankComplete) {
      if (this.take(this.setsPaid, inst.def, 1, r.setCap) === 0) return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`${r.setCap} sets this ball`], 'BANK SETS MAXED')];
      const situ = this.situational();
      const pts = Math.round(r.setBonus!.points * m.setFactor * modFactor(inst.def, m) * situ.x);
      if (r.lightsLamps) this.lightLamps();
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, this.gain(r.setBonus!.mult * m.setFactor), 0, [`${pts} bank bonus`, ...situ.notes], 'BANK COMPLETE'));
      return out;
    }

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
      if (r.lightsLane) this.lightNextLane();
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [], x > 1.0001 ? `MULT x${x.toFixed(2)}` : 'X LANE MAXED', undefined, x));
      if (r.lightsLane) out.push(...this.checkLaneSet(inst, ev));
      return out;
    }

    if (r.points) {
      if (r.perBall && (this.firedThisBall.get(inst.uid) ?? 0) >= r.perBall) return out;
      const spins = ev.spins ?? 1;
      const grown = grownPoints(r, this.hitsOf(inst.def));
      const level = (r.perLevel ?? 0) * this.effLevel(inst.def);
      const variety = r.variety ? Math.min(r.varietyCap ?? Infinity, r.variety * this.variety) : 0;
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
            piggy = this.take(this.moneyPaid, 'piggy', held * r.piggy.x, r.piggy.cap * r.piggy.x);
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
      const base = Math.round((r.points + level + grown + variety + pot) * spins * tierX * factor * mf * (1 + lamp.sum) * (lucky ? m.luckyX : 1) * (1 + hotBonus) * order * situ.x);
      this.hitsByType.set(inst.def, this.hitsOf(inst.def) + 1);
      if (r.feeds) this.hitsByType.set(r.feeds.id, this.hitsOf(r.feeds.id) + r.feeds.n);
      this.typesHit.add(inst.def);
      if (r.jackpot) this.potFrom.set(inst.uid, this.ballHits);
      if (r.perBall) this.firedThisBall.set(inst.uid, (this.firedThisBall.get(inst.uid) ?? 0) + 1);
      if (r.lightsLamps) this.lightLamps();
      const label = r.perBall && xmult > 1 ? `MULT x${xmult.toFixed(2)}` : r.jackpot && pot ? 'JACKPOT!' : undefined;
      const scored = this.award(inst, ev.t, ev.x, ev.y, r.perBall || (r.jackpot && pot) ? 'bonus' : 'hit', base, multGain, money, notes, label, ev.spins, xmult);
      if (tier && inst.def === 'vari') scored.tier = r.tiers!.indexOf(tier);
      if (hotBonus) scored.hot = true;
      out.push(scored);
      // this hit makes the ball hot for its next one
      if (r.hot && (r.hotTier === undefined || (tier && r.tiers!.indexOf(tier) >= r.hotTier))) this.hot.set(ev.ballId, { until: ev.t + HOT_WINDOW, bonus: r.hot * m.hotFactor });
      // the Cook calls a new order; the Dragon loses a plate
      if (inst.def === 'mega') out.push(...this.bigBoiHit(inst, ev));
    }

    // Level Lights (Space Cadet's bumper upgrade lanes): each pass toggles the light; when every light
    // aimed at one part type is lit, that type levels up for the rest of the run and the lights reset
    if (r.levelUp) {
      const target = LEVEL_TARGETS[Math.round(dialValue(inst, 'target'))] ?? 'pop';
      const wasLit = this.roundLit.has(inst.uid);
      if (wasLit) this.roundLit.delete(inst.uid);
      else {
        this.roundLit.add(inst.uid);
        const group = this.placed().filter((p) => p.def === inst.def && (LEVEL_TARGETS[Math.round(dialValue(p, 'target'))] ?? 'pop') === target);
        // a set needs at least two lights, as in Space Cadet (three): one light would level up every other pass
        if (group.length >= 2 && group.every((l) => this.roundLit.has(l.uid))) {
          for (const l of group) this.roundLit.delete(l.uid);
          const lvl = this.onLevelUp ? this.onLevelUp(target) : null;
          const name = PARTS[target].name.toUpperCase();
          out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [], lvl === null ? `${name}S ARE MAXED OUT` : `${name}S LEVEL ${lvl}!`));
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

  /** A complete set of Lane Rollovers pays its bonus and resets. */
  private checkLaneSet(inst: PartInstance, ev: { t: number; x: number; y: number }): ScoreEvent[] {
    const r = PARTS.lane.recipe, m = this.mods;
    const lanes = this.placed().filter((p) => p.def === 'lane');
    // a set needs at least two lanes: a lone lane would "complete" itself on every roll (the auto-builder found that exploit)
    if (!r.setBonus || lanes.length < 2 || !lanes.every((l) => this.lit.has(l.uid))) return [];
    for (const l of lanes) this.lit.delete(l.uid);
    if (this.take(this.setsPaid, 'lane', 1, r.setCap) === 0) return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`${r.setCap} sets this ball`], 'LANE SETS MAXED')];
    const situ = this.situational();
    const pts = Math.round(r.setBonus.points * m.setFactor * modFactor('lane', m) * situ.x);
    return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, this.gain(r.setBonus.mult * m.setFactor), 0, [`${pts} set bonus`, ...situ.notes], 'LANES COMPLETE')];
  }

  private lightLamps() {
    for (const l of this.placed()) if (PARTS[l.def].kind === 'lamp') this.lit.add(l.uid);
  }

  /** X Lane: light the next dark Lane Rollover (left to right); it can complete a set. */
  private lightNextLane() {
    const lanes = this.placed().filter((p) => p.def === 'lane').sort((a, b) => a.x - b.x || a.y - b.y);
    const dark = lanes.find((l) => !this.lit.has(l.uid));
    if (dark) this.lit.add(dark.uid);
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
    const pts = Math.round((r.points! + (r.perLevel ?? 0) * this.effLevel('mega')) * DRAGON.jackpotX * modFactor('mega', m) * situ.x);
    return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, 0, 0, [`${pts} armour broken`, ...situ.notes], 'ARMOUR BROKEN!')];
  }

  /**
   * Lane change: shift the lit Lane Rollovers one lane along (left to right by position, wrapping round).
   * The number lit never changes, so shifting cannot complete a set; it only moves where the dark lane is.
   */
  private shiftLanes(dir: -1 | 1) {
    const lanes = this.placed().filter((p) => p.def === 'lane').sort((a, b) => a.x - b.x || a.y - b.y);
    const n = lanes.length;
    if (n < 2) return;
    const was = lanes.map((l) => this.lit.has(l.uid));
    lanes.forEach((l, i) => {
      if (was[(i - dir + n) % n]) this.lit.add(l.uid);
      else this.lit.delete(l.uid);
    });
  }

  ledgerRows(): LedgerRow[] {
    return [...this.ledger.values()].sort((a, b) => b.points - a.points);
  }
}
