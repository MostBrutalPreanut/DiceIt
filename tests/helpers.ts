import { Bot } from '../src/sim/bot';
import { starterLayout } from '../src/sim/layout';
import { createSim } from '../src/sim/sim';

/** Play one ball with the bot until it drains (or `maxSeconds` pass). Returns the sim for inspection. */
export function playBall(seed: number, maxSeconds = 120, layout = starterLayout()) {
  const sim = createSim(layout, { seed });
  const bot = new Bot(seed);
  sim.spawnBall();
  let hits = 0;
  let drained = false;
  while (sim.time < maxSeconds && !drained) {
    for (const e of sim.step(bot.decide(sim))) {
      if (e.type === 'partHit') hits++;
      if (e.type === 'drain') drained = true;
    }
  }
  return { sim, hits, drained, seconds: sim.time, fingerprint: sim.fingerprint() };
}
