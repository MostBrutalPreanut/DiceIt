import { describe, expect, it } from 'vitest';
import { neutralMods } from '../src/data/mods';
import { makePart } from '../src/data/parts';
import { autoBuild, layoutIsValid, objective, playRounds, type Machine, type RoundSample } from '../src/game/autobuild';
import { starterLayout } from '../src/sim/layout';

const starter = (): Machine => ({ layout: starterLayout(), mods: neutralMods(), levels: {} });
const sample = (total: number, searches = 0): RoundSample => ({ cumulative: [total / 3, total], coins: [0, 0], seconds: 100, searches, points: {} });

describe('playing rounds with the bot', () => {
  it('plays every ball out, deterministically for a seed, and differently for another', () => {
    const a = playRounds(starter(), { rounds: 2, seed: 5, skill: 0.6 });
    const b = playRounds(starter(), { rounds: 2, seed: 5, skill: 0.6 });
    const c = playRounds(starter(), { rounds: 2, seed: 6, skill: 0.6 });
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
    for (const s of a) {
      expect(s.cumulative).toHaveLength(3);
      expect(s.cumulative[0]).toBeGreaterThan(0);
      expect(s.cumulative[1]).toBeGreaterThanOrEqual(s.cumulative[0]);
      expect(s.cumulative[2]).toBeGreaterThanOrEqual(s.cumulative[1]);
      expect(s.seconds).toBeGreaterThan(5);
      // the ledger accounts for the score: every point (before rounding of Mult) is attributed to a part type
      const attributed = Object.values(s.points).reduce((a, b) => a + (b ?? 0), 0);
      expect(attributed).toBeCloseTo(s.cumulative[2], -1);
      expect(s.points.pop).toBeGreaterThan(0);
    }
  });

  it('plays as many balls as the run gives (an Extra Ball upgrade makes four)', () => {
    const m = starter();
    m.mods.ballsPerRound = 4;
    expect(playRounds(m, { rounds: 1, seed: 2, skill: 0.6 })[0].cumulative).toHaveLength(4);
  });

  it('scores a machine by half its mean round and half its worse rounds, and a ball search costs 3% each', () => {
    expect(objective([sample(1000), sample(3000)])).toBe(1500); // (2000 + 1000) / 2
    expect(objective([sample(2000), sample(2000)])).toBe(2000); // a steady machine beats a streaky one with the same mean
    expect(objective([sample(1000, 1), sample(3000, 1)])).toBeCloseTo(1455);
    expect(objective([])).toBe(0);
  });
});

describe('the auto-builder', () => {
  const owned = () => {
    const l = starterLayout();
    l.parts.push(makePart('coin', l.nextUid++), makePart('vari', l.nextUid++));
    return { layout: l, mods: neutralMods(), levels: {} } satisfies Machine;
  };
  const tiny = { seed: 3, skill: 0.6, evalRounds: 1, steps: 2, placeTries: 2 };

  it('never ends below where it started, keeps every part, and leaves a layout that is valid', () => {
    const m = owned();
    const r = autoBuild(m, tiny);
    expect(r.after).toBeGreaterThanOrEqual(r.before);
    expect(r.evaluations).toBeGreaterThanOrEqual(1 + tiny.placeTries);
    expect(layoutIsValid(r.machine.layout)).toBe(true);
    expect(r.machine.layout.parts.map((p) => p.uid)).toEqual(m.layout.parts.map((p) => p.uid));
    expect(m.layout.parts.filter((p) => !p.placed)).toHaveLength(2); // the input machine is not touched
  });

  it('never moves, swaps or benches the Big Boi', () => {
    const m = owned();
    const boi = m.layout.parts.find((p) => p.def === 'mega')!;
    const r = autoBuild(m, { ...tiny, steps: 60 });
    const after = r.machine.layout.parts.find((p) => p.def === 'mega')!;
    expect([after.placed, after.x, after.y]).toEqual([true, boi.x, boi.y]);
  });

  it('is deterministic for a seed', () => {
    const cfg = { ...tiny, steps: 1, placeTries: 1 };
    const a = autoBuild(owned(), cfg);
    const b = autoBuild(owned(), cfg);
    expect(b.machine.layout).toEqual(a.machine.layout);
    expect(b.after).toBe(a.after);
  });

  it('can place a part when there is room, anywhere inside the build area', () => {
    const empty = { layout: { parts: [makePart('pop', 1), makePart('pop', 2)], gravity: 50, nextUid: 3 }, mods: neutralMods(), levels: {} } satisfies Machine;
    const r = autoBuild(empty, { ...tiny, steps: 0, placeTries: 3 });
    expect(r.machine.layout.parts.some((p) => p.placed)).toBe(true);
    expect(layoutIsValid(r.machine.layout)).toBe(true);
  });
});
