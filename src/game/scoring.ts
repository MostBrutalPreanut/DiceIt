import { PARTS, payoutFactor, type PartId } from '../data/parts';
import type { PartInstance } from '../sim/layout';
import type { SimEvent } from '../sim/sim';

/** One attributed scoring event: this is what the HUD, ledger and juice all read. */
export interface ScoreEvent {
  t: number;
  uid: number;
  def: PartId;
  x: number;
  y: number;
  basePoints: number;
  points: number;
  multBefore: number;
  multAfter: number;
  money: number;
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
 * Points x Mult with full attribution. Pure logic: no physics, no rendering,
 * so the rules can be unit-tested and balanced headless.
 */
export class Scorer {
  score = 0;
  mult: number;
  money = 0;
  goalReached = false;
  readonly ledger = new Map<number, LedgerRow>();

  constructor(public goal: number, public baseMult = 1) {
    this.mult = baseMult;
  }

  startBall() {
    this.mult = this.baseMult;
  }

  /** Returns a ScoreEvent for a partHit, or null for events that do not score. */
  consume(ev: SimEvent, lookup: (uid: number) => PartInstance | undefined): ScoreEvent | null {
    if (ev.type !== 'partHit') return null;
    const inst = lookup(ev.uid);
    if (!inst) return null;
    const def = PARTS[inst.def];

    const basePoints = def.basePoints * payoutFactor(inst.kick);
    const points = Math.round(basePoints * this.mult);
    const multBefore = this.mult;
    this.mult = Math.round((this.mult + def.multGain) * 1000) / 1000;
    this.score += points;
    this.money += def.money;
    if (this.score >= this.goal) this.goalReached = true;

    const row = this.ledger.get(inst.uid) ?? { uid: inst.uid, def: inst.def, hits: 0, points: 0, money: 0, multAdded: 0 };
    row.hits++;
    row.points += points;
    row.money += def.money;
    row.multAdded += def.multGain;
    this.ledger.set(inst.uid, row);

    return { t: ev.t, uid: inst.uid, def: inst.def, x: ev.x, y: ev.y, basePoints, points, multBefore, multAfter: this.mult, money: def.money };
  }

  ledgerRows(): LedgerRow[] {
    return [...this.ledger.values()].sort((a, b) => b.points - a.points);
  }
}
