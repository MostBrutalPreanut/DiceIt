import { describe, expect, it } from 'vitest';
import { computeMods } from '../src/data/decals';
import { DT, SUBSTEPS } from '../src/sim/constants';
import { starterLayout } from '../src/sim/layout';
import { escapeFuzz, flipperTunnelTrials } from '../tools/stress';

describe('physics robustness (the Cult of PiN test)', () => {
  it('the raw engine tunnels through a flipper in under 0.5% of brutal trials at the default timestep', () => {
    const r = flipperTunnelTrials({ dt: DT, substeps: SUBSTEPS, trials: 1500, rescue: false });
    expect(r.tunnels / r.trials).toBeLessThan(0.005);
  });

  it('with the safety net on, no ball is ever visibly pushed through a flipper', () => {
    const r = flipperTunnelTrials({ dt: DT, substeps: SUBSTEPS, trials: 1500, seed: 4242 });
    expect(r.worst).toBeUndefined();
    expect(r.tunnels).toBe(0);
  });

  it('the safety net really catches coarse-timestep tunnelling (so we know it is not a no-op)', () => {
    const raw = flipperTunnelTrials({ dt: 1 / 60, substeps: 4, trials: 600, rescue: false });
    const net = flipperTunnelTrials({ dt: 1 / 60, substeps: 4, trials: 600 });
    expect(raw.tunnels).toBeGreaterThan(20);
    expect(net.tunnels).toBe(0);
    expect(net.rescued).toBe(raw.tunnels);
  });

  it('never lets a ball leave the table except through the drain, and never leaves one stuck', () => {
    const r = escapeFuzz(starterLayout(), 150);
    expect(r.escapes).toBe(0);
    // a ball that sits still for 3.5 s triggers a ball search; on a healthy table that never happens.
    // (Long balls are fine and expected: a skilled bot can sustain a ball until the 90 s clock.)
    expect(r.stuckSearches).toBe(0);
    expect(r.drained + r.timeouts).toBe(r.balls);
  });

  it('the ball upgrades (Rubber, Glass, Twin) keep the same guarantees: no tunnelling, no escapes, nothing stuck', () => {
    const mods = computeMods([{ id: 'rubber' }, { id: 'glass' }, { id: 'twin' }]);
    const t = flipperTunnelTrials({ dt: DT, substeps: SUBSTEPS, trials: 600, seed: 7, mods });
    expect(t.tunnels).toBe(0);
    for (const m of [mods, computeMods([{ id: 'rubber' }]), computeMods([{ id: 'heavy' }])]) {
      const r = escapeFuzz(starterLayout(), 40, DT, SUBSTEPS, m);
      expect(r.escapes).toBe(0);
      expect(r.stuckSearches).toBe(0);
      expect(r.drained + r.timeouts).toBe(r.balls);
    }
  });
});
