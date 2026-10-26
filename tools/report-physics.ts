import { flipperTunnelTrials, escapeFuzz } from './stress';
import { makePart } from '../src/data/parts';
import { starterLayout } from '../src/sim/layout';

const trials = Number(process.argv[2] ?? 1500);
console.log(`flipper tunnelling, ${trials} trials per config (raw = safety net off)`);
for (const [dt, sub] of [[1 / 60, 4], [1 / 120, 4], [1 / 120, 8], [1 / 240, 4], [1 / 240, 8]] as const) {
  const t0 = performance.now();
  const raw = flipperTunnelTrials({ dt, substeps: sub, trials, rescue: false });
  const net = flipperTunnelTrials({ dt, substeps: sub, trials, rescue: true });
  console.log(
    `  ${Math.round(1 / dt)} Hz x${sub}: raw ${raw.tunnels}/${trials} (${((100 * raw.tunnels) / trials).toFixed(2)}%)` +
      `  with net: ${net.tunnels} visible, ${net.rescued} rescued  (${Math.round(performance.now() - t0)} ms)`,
  );
}
{
  // a Wrecking Ball's big ball (1.5x) at the game's own timestep
  const raw = flipperTunnelTrials({ dt: 1 / 240, substeps: 4, trials, rescue: false, bigBall: 1.5 });
  const net = flipperTunnelTrials({ dt: 1 / 240, substeps: 4, trials, rescue: true, bigBall: 1.5 });
  console.log(`  big ball (1.5x), 240 Hz x4: raw ${raw.tunnels}/${trials}  with net: ${net.tunnels} visible, ${net.rescued} rescued`);
}
const e = escapeFuzz(starterLayout(), 200);
console.log('escape fuzz (default timestep):', JSON.stringify(e));
// the step 9 parts: a Wrecking Ball, a Broomstick aimed at the left wall, a Free Ball Bucket and a Gremlin Hutch
const nine = starterLayout();
const add = (id: Parameters<typeof makePart>[0], x: number, y: number, angle = 0) => nine.parts.push({ ...makePart(id, nine.nextUid++, x, y, true), angle });
add('wreck', 6, 30); add('broom', 18, 26, Math.PI / 2); add('broom', 8, 22, -0.6); add('bucket', 12, 18); add('hutch', 2, 51);
console.log('escape fuzz with the step 9 parts:', JSON.stringify(escapeFuzz(nine, 200)));
// the lock and the wheel catch and let go of balls, the Helping Hand flips on its own, the Bank Ring is a rollover
const four = starterLayout();
const put = (id: Parameters<typeof makePart>[0], x: number, y: number, angle = 0) => four.parts.push({ ...makePart(id, four.nextUid++, x, y, true), angle });
put('gumball', 12, 30); put('wheel', 7, 36); put('hand', 6, 22); put('ring', 17, 24);
console.log('escape fuzz with the Gumball Machine, Spider Wheel, Helping Hand and Bank Ring:', JSON.stringify(escapeFuzz(four, 200)));
