import { dialFactor, dialValue, grownPoints, lampStats, LEVEL_TARGETS, modFactor, PARTS, tierOf, type PartId, type PartInstance } from '../data/parts';
import { neutralMods, type Mods } from '../data/mods';
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
  /** Points before Mult (already includes growth, dials and lamps). */
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
  /** The run's upgrades (neutral if absent). */
  mods?: Mods;
  /** Overrides the Mult every ball starts with (default: the mods' `startMult`). */
  baseMult?: number;
}

export class Scorer {
  score = 0;
  mult: number;
  money = 0;
  goalReached = false;
  readonly ledger = new Map<number, LedgerRow>();
  /** Per-ball state: hits of each part type, and which lights are lit. */
  private hitsByType = new Map<PartId, number>();
  private lit = new Set<number>();
  /** Level Lights stay lit for the whole round, not just one ball. */
  private roundLit = new Set<number>();
  private levels: Partial<Record<PartId, number>>;
  private onLevelUp?: (id: PartId) => number | null;
  private mods: Mods;
  /** Scoring hits so far this round and this ball (Gold Ball and Lucky Seven count them). */
  private roundHits = 0;
  private ballHits = 0;
  /**
   * What the limits in the recipes have let through so far. Every source that compounds (growth, Mult, set
   * bonuses, coins) has a cap: this ledger of what has been paid is how the caps are kept. Per ball: Mult and
   * sets. Per round: money.
   */
  private multPaid = new Map<string, number>();
  private setsPaid = new Map<string, number>();
  private moneyPaid = new Map<string, number>();
  readonly baseMult: number;

  constructor(public goal: number, private getParts: () => PartInstance[] = () => [], opts: ScorerOpts = {}) {
    this.mods = opts.mods ?? neutralMods();
    this.baseMult = opts.baseMult ?? this.mods.startMult;
    this.mult = this.baseMult;
    this.levels = opts.levels ?? {};
    this.onLevelUp = opts.onLevelUp;
  }

  levelOf(id: PartId) {
    return this.levels[id] ?? 0;
  }

  private placed() {
    return this.getParts().filter((p) => p.placed);
  }

  /** Called when a round (not a ball) starts: the Level Lights go dark. */
  resetRound() {
    this.roundLit.clear();
    this.roundHits = 0;
    this.moneyPaid.clear();
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

  startBall() {
    this.mult = this.baseMult;
    this.ballHits = 0;
    this.multPaid.clear();
    this.setsPaid.clear();
    this.hitsByType.clear();
    this.lit.clear();
  }

  isLit(uid: number) {
    return this.lit.has(uid) || this.roundLit.has(uid);
  }

  hitsOf(id: PartId) {
    return this.hitsByType.get(id) ?? 0;
  }

  /** Sum of the bonuses of every lit lamp whose glow reaches this part. */
  lampBonusAt(inst: PartInstance): { sum: number; count: number } {
    let sum = 0, count = 0;
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

  /** What this part would score per event right now, before Mult. Null for parts that do not score. */
  baseNow(inst: PartInstance, spins = 1, tierX = 1): number | null {
    const r = PARTS[inst.def].recipe;
    if (!r.points) return null;
    const grown = grownPoints(r, this.hitsOf(inst.def));
    const lvl = (r.perLevel ?? 0) * this.levelOf(inst.def);
    return Math.round((r.points + lvl + grown) * spins * tierX * dialFactor(inst) * modFactor(inst.def, this.mods) * (1 + this.lampBonusAt(inst).sum));
  }

  /** The short number drawn on the part itself ("100", "10/spin", "+25%"). */
  label(inst: PartInstance): string | null {
    const def = PARTS[inst.def];
    if (def.kind === 'lamp') return `+${Math.round(lampStats(dialValue(inst, 'radius'), this.mods).bonus * 100)}%`;
    const n = this.baseNow(inst);
    if (n === null) return null;
    const tiers = def.recipe.tiers;
    if (tiers) return `${n}-${this.baseNow(inst, 1, tiers[tiers.length - 1].x)}`; // soft hit to smash
    return def.recipe.per === 'spin' ? `${n}/spin` : String(n);
  }

  private addLedger(inst: PartInstance, points: number, money: number, multAdded: number) {
    const row = this.ledger.get(inst.uid) ?? { uid: inst.uid, def: inst.def, hits: 0, points: 0, money: 0, multAdded: 0 };
    row.hits++;
    row.points += points;
    row.money += money;
    row.multAdded += multAdded;
    this.ledger.set(inst.uid, row);
  }

  private award(inst: PartInstance, t: number, x: number, y: number, kind: ScoreEvent['kind'], base: number, multGain: number, money: number, notes: string[], label?: string, spins?: number): ScoreEvent {
    const multBefore = this.mult;
    const points = Math.round(base * multBefore);
    this.mult = Math.round((this.mult + multGain) * 1000) / 1000;
    this.score += points;
    this.money += money;
    if (this.score >= this.goal) this.goalReached = true;
    this.addLedger(inst, points, money, multGain);
    return { t, uid: inst.uid, def: inst.def, x, y, kind, base, points, multBefore, multAfter: this.mult, money, notes, label, spins };
  }

  /** Turn one physical event into zero or more attributed score events. */
  consume(ev: SimEvent): ScoreEvent[] {
    // lane change: a flipper button shifts which lanes are lit
    if (ev.type === 'flipper') {
      if (ev.on) this.shiftLanes(ev.side === 'L' ? -1 : 1);
      return [];
    }
    if (ev.type !== 'partHit') return [];
    const inst = this.getParts().find((p) => p.uid === ev.uid && p.placed);
    if (!inst) return [];
    const def = PARTS[inst.def];
    const r = def.recipe;
    const out: ScoreEvent[] = [];

    // lamps only light up
    if (def.kind === 'lamp') {
      if (!this.lit.has(inst.uid)) {
        this.lit.add(inst.uid);
        const e = this.award(inst, ev.t, ev.x, ev.y, 'light', 0, 0, 0, [], 'LAMP LIT');
        out.push(e);
      }
      return out;
    }

    // a drop-target bank with every target down pays its set bonus (the individual hits scored already)
    if (def.kind === 'bank' && ev.bankComplete) {
      if (this.take(this.setsPaid, inst.def, 1, r.setCap) === 0) return [this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`${r.setCap} sets this ball`], 'BANK SETS MAXED')];
      const pts = r.setBonus!.points * this.mods.setFactor;
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, r.setBonus!.mult * this.mods.setFactor, 0, [`${pts} bank bonus`], 'BANK COMPLETE'));
      return out;
    }

    if (r.points) {
      const spins = ev.spins ?? 1;
      const grown = grownPoints(r, this.hitsOf(inst.def));
      const level = (r.perLevel ?? 0) * this.levelOf(inst.def);
      const factor = dialFactor(inst);
      const lamp = this.lampBonusAt(inst);
      const tier = tierOf(inst, ev.speed);
      const notes = [`${r.points}${spins > 1 ? ` x${spins} spins` : ''} base`];
      if (level) notes.push(`+${level} level`);
      if (grown) notes.push(`+${grown} grown`);
      if (tier) notes.push(`x${tier.x} ${tier.name} hit`);
      if (Math.abs(factor - 1) > 0.001) notes.push(`x${Math.round(factor * 100) / 100} dial`);
      const oc = this.mods.overclock[inst.def] ?? 0;
      if (oc) notes.push(`+${Math.round(oc * 100)}% overclock`);
      if (this.mods.pointsFactor !== 1) notes.push(`x${Math.round(this.mods.pointsFactor * 100) / 100} ball`);
      if (lamp.sum) notes.push(`+${Math.round(lamp.sum * 100)}% lamp`);
      this.roundHits++;
      this.ballHits++;
      const lucky = this.mods.luckyEvery > 0 && this.ballHits % this.mods.luckyEvery === 0;
      if (lucky) notes.push('x2 lucky seven');
      const goldDue = this.mods.goldEvery > 0 && this.roundHits % this.mods.goldEvery === 0 ? 1 : 0;
      const gold = this.take(this.moneyPaid, 'gold', goldDue, this.mods.goldCap || undefined);
      if (gold) notes.push('+$1 gold ball');
      const multGain = this.take(this.multPaid, inst.def, r.mult ?? 0, r.multCap);
      if (r.mult && multGain < r.mult) notes.push('Mult maxed for this ball');
      const coins = this.take(this.moneyPaid, inst.def, r.money ?? 0, r.moneyCap);
      if (r.money && coins < r.money) notes.push('coin limit reached');
      const base = Math.round((r.points + level + grown) * spins * (tier?.x ?? 1) * factor * modFactor(inst.def, this.mods) * (1 + lamp.sum) * (lucky ? 2 : 1));
      this.hitsByType.set(inst.def, this.hitsOf(inst.def) + 1);
      const scored = this.award(inst, ev.t, ev.x, ev.y, 'hit', base, multGain, coins + gold, notes, undefined, ev.spins);
      if (tier) scored.tier = r.tiers!.indexOf(tier);
      out.push(scored);
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
      const lanes = this.placed().filter((p) => p.def === inst.def);
      // a set needs at least two lanes: a lone lane would "complete" itself on every roll (the auto-builder found that exploit)
      if (r.setBonus && lanes.length >= 2 && lanes.every((l) => this.lit.has(l.uid))) {
        for (const l of lanes) this.lit.delete(l.uid);
        if (this.take(this.setsPaid, inst.def, 1, r.setCap) === 0) {
          out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', 0, 0, 0, [`${r.setCap} sets this ball`], 'LANE SETS MAXED'));
        } else {
          const pts = r.setBonus.points * this.mods.setFactor;
          out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', pts, r.setBonus.mult * this.mods.setFactor, 0, [`${pts} set bonus`], 'LANES COMPLETE'));
        }
      }
    }
    return out;
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
