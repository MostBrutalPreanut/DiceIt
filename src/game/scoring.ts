import { dialFactor, dialValue, lampBonus, LEVEL_TARGETS, MAX_LEVEL, PARTS, type PartId, type PartInstance } from '../data/parts';
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
  readonly baseMult: number;

  constructor(public goal: number, private getParts: () => PartInstance[] = () => [], opts: ScorerOpts = {}) {
    this.baseMult = opts.baseMult ?? 1;
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
    this.startBall();
  }

  startBall() {
    this.mult = this.baseMult;
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
  private lampBonusAt(inst: PartInstance): { sum: number; count: number } {
    let sum = 0, count = 0;
    for (const l of this.placed()) {
      if (PARTS[l.def].kind !== 'lamp' || !this.lit.has(l.uid)) continue;
      const r = dialValue(l, 'radius');
      if (Math.hypot(l.x - inst.x, l.y - inst.y) <= r) {
        sum += lampBonus(r);
        count++;
      }
    }
    return { sum, count };
  }

  /** What this part would score per event right now, before Mult. Null for parts that do not score. */
  baseNow(inst: PartInstance, spins = 1): number | null {
    const r = PARTS[inst.def].recipe;
    if (!r.points) return null;
    const grown = (r.grow ?? 0) * this.hitsOf(inst.def);
    const lvl = (r.perLevel ?? 0) * this.levelOf(inst.def);
    return Math.round((r.points + lvl + grown) * spins * dialFactor(inst) * (1 + this.lampBonusAt(inst).sum));
  }

  /** The short number drawn on the part itself ("100", "10/spin", "+25%"). */
  label(inst: PartInstance): string | null {
    const def = PARTS[inst.def];
    if (def.kind === 'lamp') return `+${Math.round(lampBonus(dialValue(inst, 'radius')) * 100)}%`;
    const n = this.baseNow(inst);
    if (n === null) return null;
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
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', r.setBonus!.points, r.setBonus!.mult, 0, [`${r.setBonus!.points} bank bonus`], 'BANK COMPLETE'));
      return out;
    }

    if (r.points) {
      const spins = ev.spins ?? 1;
      const grown = (r.grow ?? 0) * this.hitsOf(inst.def);
      const level = (r.perLevel ?? 0) * this.levelOf(inst.def);
      const factor = dialFactor(inst);
      const lamp = this.lampBonusAt(inst);
      const notes = [`${r.points}${spins > 1 ? ` x${spins} spins` : ''} base`];
      if (level) notes.push(`+${level} level`);
      if (grown) notes.push(`+${grown} grown`);
      if (Math.abs(factor - 1) > 0.001) notes.push(`x${Math.round(factor * 100) / 100} dial`);
      if (lamp.sum) notes.push(`+${Math.round(lamp.sum * 100)}% lamp`);
      const base = Math.round((r.points + level + grown) * spins * factor * (1 + lamp.sum));
      this.hitsByType.set(inst.def, this.hitsOf(inst.def) + 1);
      out.push(this.award(inst, ev.t, ev.x, ev.y, 'hit', base, r.mult ?? 0, r.money ?? 0, notes, undefined, ev.spins));
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
      if (r.setBonus && lanes.every((l) => this.lit.has(l.uid))) {
        for (const l of lanes) this.lit.delete(l.uid);
        out.push(this.award(inst, ev.t, ev.x, ev.y, 'bonus', r.setBonus.points, r.setBonus.mult, 0, [`${r.setBonus.points} set bonus`], 'LANES COMPLETE'));
      }
    }
    return out;
  }

  ledgerRows(): LedgerRow[] {
    return [...this.ledger.values()].sort((a, b) => b.points - a.points);
  }
}
