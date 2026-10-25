import { Rng } from './rng';
import type { Input, Sim } from './sim';

/**
 * A deliberately simple flipper policy: flip when a ball is in reach of a flipper and
 * not already rising. Used for fuzzing, replays and (later) the balance simulator.
 */
export class Bot {
  private holdUntil = { L: 0, R: 0 };
  /** A ball cradled on a held flipper: since when, how long to keep it, and until when the flipper is let go. */
  private cradle = { L: -1, R: -1 };
  private cradleFor = { L: 0, R: 0 };
  private dropUntil = { L: 0, R: 0 };
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
      // press again if the last press is long over and the plunger is still waiting (a Twin Ball's second ball)
      if (this.plungeStart < 0 || t - this.plungeStart > this.plungeFor + 0.4) {
        this.plungeStart = t;
        this.plungeFor = this.rng.range(0.75, 1.0);
      }
      input.plunge = t - this.plungeStart < this.plungeFor;
    } else this.plungeStart = -1;

    // keep flipping for the balls in play, even while one waits at the plunger (a multiball)
    const cradled = { L: false, R: false };
    for (const b of sim.ballStates()) {
      if (b.inLane || b.held) continue;
      for (const f of sim.flipperStates()) {
        const sign = f.side === 'L' ? 1 : -1;
        const dx = (b.x - f.pivotX) * sign;
        const dy = b.y - f.pivotY;
        const inReach = dx > 0.3 && dx < f.length + 0.6 && dy > -1 && dy < 2.4 && b.vy < 8;
        if (inReach && t >= this.dropUntil[f.side] && this.rng.next() < this.skill) this.holdUntil[f.side] = t + 0.18;
        if (inReach && Math.hypot(b.vx, b.vy) < 1.5 && t < this.holdUntil[f.side]) cradled[f.side] = true;
      }
    }
    // a ball resting on a held flipper: keep it a moment, then let it roll down the flipper and shoot it
    for (const side of ['L', 'R'] as const) {
      if (!cradled[side]) { this.cradle[side] = -1; continue; }
      if (this.cradle[side] < 0) { this.cradle[side] = t; this.cradleFor[side] = this.rng.range(0.3, 1.2); }
      if (t - this.cradle[side] > this.cradleFor[side]) {
        this.dropUntil[side] = t + this.rng.range(0.15, 0.3);
        this.holdUntil[side] = 0;
        this.cradle[side] = -1;
      }
    }
    input.left = t < this.holdUntil.L;
    input.right = t < this.holdUntil.R;
    return input;
  }
}
