import { PARTS, type PartId } from '../data/parts';
import { canPlace, cloneLayout, starterLayout, type Layout, type PartInstance } from '../sim/layout';
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

/** Placeholder goal curve. The real one gets set against the balance bot (see docs/game-plan.md). */
export function goalFor(round: number): number {
  return Math.round((2500 * Math.pow(1.7, round - 1)) / 100) * 100;
}

export interface StepResult {
  sim: SimEvent[];
  score: ScoreEvent[];
  game: GameEvent[];
}

/**
 * Orchestrates the run: workshop (build, tune, test-ball) <-> round (3 balls vs a goal).
 * The sim keeps running in the workshop so a test ball can bounce around while you edit.
 */
export class Game {
  layout: Layout = starterLayout();
  mode: Mode = 'workshop';
  round = 1;
  money = 0;
  ballsLeft = BALLS_PER_ROUND;
  payout: Payout | null = null;
  sim: Sim;
  scorer: Scorer;
  private seed = 1;

  constructor() {
    this.sim = createSim(this.layout, { seed: this.seed });
    this.scorer = new Scorer(Infinity);
  }

  get goal() {
    return this.scorer.goal;
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
    this.scorer = new Scorer(goalFor(this.round));
    this.scorer.startBall();
    this.sim.spawnBall();
  }

  toWorkshop() {
    this.resetSim();
    this.mode = 'workshop';
    this.scorer = new Scorer(Infinity);
  }

  continueAfterRound() {
    this.round++;
    this.toWorkshop();
  }

  newRun() {
    this.layout = starterLayout();
    this.round = 1;
    this.money = 0;
    this.toWorkshop();
  }

  // ---- workshop edits (applied live to the running sim) -------------------------

  get editable() {
    return this.mode === 'workshop';
  }

  placePart(def: PartId, x: number, y: number): PartInstance | null {
    if (!this.editable || !canPlace(this.layout, def, x, y)) return null;
    const inst: PartInstance = { uid: this.layout.nextUid++, def, x, y, kick: PARTS[def].kick.default };
    this.layout.parts.push(inst);
    this.sim.addPart(inst);
    return inst;
  }

  movePart(uid: number, x: number, y: number): boolean {
    const p = this.layout.parts.find((q) => q.uid === uid);
    if (!this.editable || !p || !canPlace(this.layout, p.def, x, y, uid)) return false;
    p.x = x;
    p.y = y;
    this.sim.movePart(uid, x, y);
    return true;
  }

  removePart(uid: number) {
    if (!this.editable) return;
    this.layout.parts = this.layout.parts.filter((p) => p.uid !== uid);
    this.sim.removePart(uid);
  }

  setKick(uid: number, kick: number) {
    const p = this.layout.parts.find((q) => q.uid === uid);
    if (!this.editable || !p) return;
    p.kick = kick;
    this.sim.setKick(uid, kick);
  }

  setGravity(g: number) {
    if (!this.editable) return;
    this.layout.gravity = g;
    this.sim.setGravity(g);
  }

  /** Free practice ball in the workshop; scored into a throwaway ledger. */
  testBall() {
    if (this.mode !== 'workshop' || this.sim.ballCount > 0) return;
    this.scorer = new Scorer(Infinity);
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
    const lookup = (uid: number) => this.layout.parts.find((p) => p.uid === uid);
    for (const ev of events) {
      const s = this.scorer.consume(ev, lookup);
      if (s) result.score.push(s);
      if (ev.type === 'tilt') result.game.push({ type: 'tilt' });
      if (ev.type === 'drain') this.handleDrain(result);
    }
    if (!wasGoal && this.scorer.goalReached) result.game.push({ type: 'goal' });
    return result;
  }

  private handleDrain(result: StepResult) {
    if (this.mode === 'workshop') return;
    this.endBall(false, result);
  }

  private endBall(forced: boolean, result?: StepResult) {
    const out: GameEvent[] = result ? result.game : [];
    if (forced) {
      // Cash Out: remove the live ball without waiting for it to drain
      this.resetSimKeepLedger();
    }
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

  private resetSimKeepLedger() {
    this.sim.reset(this.layout, { seed: this.seed++ });
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
