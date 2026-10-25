import { PLUNGE_CHARGE_TIME, TABLE_H, TABLE_W, LANE_WALL_X } from '../src/sim/constants';
import { starterLayout, type Layout } from '../src/sim/layout';
import { Rng } from '../src/sim/rng';
import { createSim, NO_INPUT } from '../src/sim/sim';

export interface SpreadResult {
  launches: number;
  weak: number;
  inPlay: number;
  yMid: number;
  /** Share of balls (0..1) per x bin, left wall to right wall. */
  histo: number[];
  busiest: number;
  touched: number;
  avgHits: number;
  avgLife: number;
}

/**
 * Where do launched balls actually go? Fire many balls at random plunger strengths with no flipper
 * input and record where each first crosses mid-table, how many parts it touches and how long it lives.
 * A good table spreads these widely; a bad one funnels every ball down the same wall.
 */
export function launchSpread(n: number, layout: Layout = starterLayout(), bins = 8, minCharge = 0.3): SpreadResult {
  const rng = new Rng(2024);
  const yMid = Math.round(TABLE_H * 0.58);
  const counts = new Array(bins).fill(0);
  let touched = 0, hits = 0, seconds = 0, inPlay = 0, weak = 0;

  for (let i = 0; i < n; i++) {
    const sim = createSim(layout, { seed: i + 1 });
    const charge = minCharge + (1 - minCharge) * rng.next();
    sim.spawnBall();
    let crossedX: number | null = null, prevY = 1e9, ballHits = 0, over = false, entered = false;
    const hold = Math.round((charge * PLUNGE_CHARGE_TIME) / sim.dt);
    for (let k = 0; k < 240 * 40 && !over; k++) {
      for (const e of sim.step({ ...NO_INPUT, plunge: k < hold })) {
        if (e.type === 'partHit') ballHits++;
        if (e.type === 'drain') over = true;
      }
      const b = sim.ballStates()[0];
      if (b) {
        if (!b.inLane) entered = true;
        if (crossedX === null && prevY > yMid && b.y <= yMid && !b.inLane) crossedX = b.x;
        prevY = b.y;
      }
    }
    seconds += sim.time;
    if (!entered) { weak++; continue; }
    inPlay++;
    hits += ballHits;
    if (ballHits > 0) touched++;
    if (crossedX !== null) counts[Math.min(bins - 1, Math.max(0, Math.floor((crossedX / LANE_WALL_X) * bins)))]++;
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const histo = counts.map((c) => c / total);
  void TABLE_W;
  return { launches: n, weak, inPlay, yMid, histo, busiest: Math.max(...histo), touched: touched / (inPlay || 1), avgHits: hits / (inPlay || 1), avgLife: seconds / n };
}
