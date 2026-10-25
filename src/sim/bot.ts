import { FLIPPER_LENGTH } from './constants';
import { Rng } from './rng';
import type { Input, Sim } from './sim';

/**
 * A deliberately simple flipper policy: flip when a ball is in reach of a flipper and
 * not already rising. Used for fuzzing, replays and (later) the balance simulator.
 */
export class Bot {
  private holdUntil = { L: 0, R: 0 };
  private plungeFor = 0;
  private plungeStart = -1;
  private rng: Rng;

  constructor(seed = 7, public skill = 1) {
    this.rng = new Rng(seed);
  }

  decide(sim: Sim): Input {
    const t = sim.time;
    const input: Input = { left: false, right: false, plunge: false, nudge: 0 };

    if (sim.awaitingPlunge) {
      if (this.plungeStart < 0) {
        this.plungeStart = t;
        this.plungeFor = this.rng.range(0.75, 1.0);
      }
      input.plunge = t - this.plungeStart < this.plungeFor;
      return input;
    }
    this.plungeStart = -1;

    for (const b of sim.ballStates()) {
      if (b.inLane) continue;
      for (const f of sim.flipperStates()) {
        const sign = f.side === 'L' ? 1 : -1;
        const dx = (b.x - f.pivotX) * sign;
        const dy = b.y - f.pivotY;
        const inReach = dx > 0.3 && dx < FLIPPER_LENGTH + 0.6 && dy > -1 && dy < 2.4 && b.vy < 8;
        if (inReach && this.rng.next() < this.skill) this.holdUntil[f.side] = t + 0.18;
      }
    }
    input.left = t < this.holdUntil.L;
    input.right = t < this.holdUntil.R;
    return input;
  }
}
