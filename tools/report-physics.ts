import { flipperTunnelTrials, escapeFuzz } from './stress';
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
const e = escapeFuzz(starterLayout(), 200);
console.log('escape fuzz (default timestep):', JSON.stringify(e));
