import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeMods } from '../src/data/decals';
import { describe as describePart, makePart, PARTS } from '../src/data/parts';
import { playRounds, type Machine } from '../src/game/autobuild';
import { Scorer } from '../src/game/scoring';
import { RUNOUT_MAX } from '../src/sim/constants';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';
import type { Layout } from '../src/sim/layout';

/**
 * Everything that compounds has a limit. The first balance run found one machine scoring 36.8 million in a
 * single "ball" that lasted over ten minutes: a Ball Printer chain kept it alive while Pop growth, Mult and
 * coins all grew without end. These tests are the rules that stop that, one per limit.
 */
const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const text = (id: keyof typeof PARTS, m = computeMods([])) => describePart(PARTS[id], makePart(id, 1), { mods: m }).map((l) => l.text).join(' ');

describe('scoring limits', () => {
  it('Pop growth stops at +100: the 21st hit pays what the 100th does', () => {
    const s = new Scorer(1e9, () => [makePart('pop', 1, 10, 30, true)]);
    s.startBall();
    const bases = Array.from({ length: 100 }, () => s.consume(hit(1))[0].base);
    expect(bases[0]).toBe(20);
    expect(bases[19]).toBe(39);
    expect(bases[20]).toBe(40);
    expect(bases[99]).toBe(40);
    expect(s.label(makePart('pop', 1, 10, 30, true))).toBe('40');
    s.startBall(); // growth is per ball
    expect(s.consume(hit(1))[0].base).toBe(20);
  });

  it('Big Boi adds at most +5 Mult a ball, shared by every Big Boi, and says so when it is maxed', () => {
    const s = new Scorer(1e9, () => [makePart('mega', 1, 8, 30, true), makePart('mega', 2, 16, 30, true)]);
    s.startBall();
    let last;
    for (let i = 0; i < 100; i++) last = s.consume(hit(1 + (i % 2)))[0];
    expect(s.mult).toBeCloseTo(6);
    expect(last!.notes).toContain('Mult maxed for this ball');
    expect(last!.multAfter).toBe(last!.multBefore); // a maxed hit still scores, it just adds no Mult
    s.startBall();
    expect(s.mult).toBe(1);
    s.consume(hit(1));
    expect(s.mult).toBeCloseTo(1.15); // a new ball can earn it again
  });

  it('a lane set pays at most 5 times a ball, then says MAXED; the next ball pays again', () => {
    const lanes = [makePart('lane', 1, 6, 30, true), makePart('lane', 2, 12, 30, true), makePart('lane', 3, 18, 30, true)];
    const s = new Scorer(1e9, () => lanes);
    s.startBall();
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) for (const uid of [1, 2, 3]) for (const e of s.consume(hit(uid))) if (e.kind === 'bonus') labels.push(e.label!);
    expect(labels).toEqual(['LANES COMPLETE', 'LANES COMPLETE', 'LANES COMPLETE', 'LANES COMPLETE', 'LANES COMPLETE', 'LANE SETS MAXED', 'LANE SETS MAXED']);
    expect(s.mult).toBeCloseTo(3.5); // 1 + 5 x 0.5
    s.startBall();
    for (const uid of [1, 2, 3]) s.consume(hit(uid));
    expect(s.mult).toBeCloseTo(1.5);
  });

  it('a bank set has no limit a ball, and Jackpot Sets doubles what each pays', () => {
    const bank = [makePart('bank', 1, 12, 30, true)];
    const s = new Scorer(1e9, () => bank, { mods: computeMods([{ id: 'sets' }]) });
    s.startBall();
    const paid = Array.from({ length: 8 }, () => s.consume(hit(1, { bankComplete: true }))[0]);
    expect(paid.filter((e) => e.label === 'BANK COMPLETE')).toHaveLength(8);
    expect(paid[0].base).toBe(120);
  });

  it('Cha-Ching pays at most $5 a round, however many balls: a new ball does not refill it, a new round does', () => {
    const s = new Scorer(1e9, () => [makePart('coin', 1, 10, 30, true)]);
    s.resetRound();
    for (let i = 0; i < 30; i++) s.consume(hit(1));
    expect(s.money).toBe(5);
    s.startBall();
    for (let i = 0; i < 30; i++) s.consume(hit(1));
    expect(s.money).toBe(5);
    expect(s.consume(hit(1))[0].notes).toContain('coin limit reached');
    const next = new Scorer(1e9, () => [makePart('coin', 1, 10, 30, true)]);
    next.resetRound();
    for (let i = 0; i < 30; i++) next.consume(hit(1));
    expect(next.money).toBe(5);
  });

  it('Gold Ball pays at most $5 a round, separately from the coins', () => {
    const s = new Scorer(1e9, () => [makePart('coin', 1, 10, 30, true)], { mods: computeMods([{ id: 'gold' }]) });
    s.resetRound();
    for (let i = 0; i < 400; i++) s.consume(hit(1));
    expect(s.money).toBe(10); // $5 from the bumper and $5 from the Gold Ball
  });
});

describe('the limits are written on the parts', () => {
  it('every cap is in the recipe sentence next to the number it limits', () => {
    expect(text('pop')).toContain('up to +20');
    expect(text('mega')).toContain('up to +5 a ball');
    expect(text('coin')).toContain('up to $5 a round');
    expect(text('lane')).toContain('At most 5 sets a ball');
    expect(text('printer')).toContain('at most 2 printed in one ball');
  });

  it('the Gold Ball card states its cap', () => {
    const p = computeMods([{ id: 'gold' }]);
    expect(p.goldCap).toBe(5);
    expect(p.goldEvery).toBe(10);
  });
});

describe('the ball clock', () => {
  const empty = (): Layout => ({ parts: [], gravity: 50, nextUid: 1 });

  it('takes the controls away when it runs out, and the ball rolls out on its own', () => {
    const sim = createSim(empty(), { ballClock: 1 });
    sim.spawnBall();
    let launchedAt = -1, upAt = -1;
    const after: SimEvent[] = [];
    for (let i = 0; i < 240 * 20 && sim.ballCount > 0; i++) {
      // the player mashes everything once the time is up
      const input = upAt < 0 ? { ...NO_INPUT, plunge: i < 240 } : { left: true, right: true, plunge: i % 2 === 0, nudge: i % 60 === 0 ? 1 : 0 };
      for (const e of sim.step(input)) {
        if (e.type === 'launch') launchedAt = e.t;
        if (e.type === 'timeUp') upAt = e.t;
        else if (upAt >= 0) after.push(e);
      }
      if (upAt >= 0 && sim.ballCount > 0) expect(sim.clockLeft).toBe(0);
    }
    expect(upAt - launchedAt).toBeGreaterThan(1);
    expect(upAt - launchedAt).toBeLessThan(1.1); // the clock, not the 2.5 s the ball would have lasted
    expect(sim.ballCount).toBe(0);
    expect(after.filter((e) => e.type === 'flipper' || e.type === 'nudge' || e.type === 'launch')).toEqual([]);
    expect(after.filter((e) => e.type === 'drain').map((e) => e.type === 'drain' && e.reason)).toEqual(['drain']); // it drained, it was not taken
    expect(sim.timeUp).toBe(false); // nothing left in play: the run-out is over
  });

  it('runs for the whole ball: a ball added later does not get a fresh clock', () => {
    const sim = createSim(empty(), { ballClock: 2 });
    sim.spawnBall();
    const ups: number[] = [];
    let launched = false;
    for (let i = 0; i < 240 * 6; i++) {
      if (launched && i === 240 * 2) sim.addBall(12, 30, 0, 0); // a "printed" ball, 1 s into the clock
      for (const e of sim.step({ ...NO_INPUT, plunge: i < 230 })) {
        if (e.type === 'launch') launched = true;
        if (e.type === 'timeUp') ups.push(e.t);
      }
    }
    expect(ups.length).toBe(1);
    expect(ups[0]).toBeLessThan(3.2); // launched at ~1 s, so the hands come off at 3 s + a tick
  });

  it('takes a ball that will not roll out', () => {
    const sim = createSim(empty(), { ballClock: 1, mods: { ballGravity: 0 } }); // nothing pulls it down to the drain
    sim.spawnBall();
    let upAt = -1, goneAt = -1;
    for (let i = 0; i < 240 * 30 && goneAt < 0; i++) {
      for (const e of sim.step({ ...NO_INPUT, plunge: i < 240 })) {
        if (e.type === 'timeUp') upAt = e.t;
        if (e.type === 'drain') { expect(e.reason).toBe('timeout'); goneAt = e.t; }
      }
    }
    expect(upAt).toBeGreaterThan(0);
    expect(goneAt).toBeGreaterThan(upAt);
    expect(goneAt - upAt).toBeLessThan(RUNOUT_MAX + 0.1);
  });

  it('one clock per ball you launch: a twin still waiting in the lane when the clock runs out leaves with the ball', () => {
    const sim = createSim(empty(), { ballClock: 0.5, mods: { twin: true } });
    sim.spawnBall();
    let launches = 0, sawUp = false;
    for (let i = 0; i < 240 * 10 && !(sawUp && !sim.timeUp); i++) {
      for (const e of sim.step({ ...NO_INPUT, plunge: i < 230 || (sawUp && i % 120 < 60) })) {
        if (e.type === 'launch') launches++;
        if (e.type === 'timeUp') sawUp = true;
      }
    }
    expect(sawUp).toBe(true);
    expect(launches).toBe(1); // it could not be fired during the run-out
    expect(sim.timeUp).toBe(false);
    expect(sim.ballCount).toBe(0); // and it never gets a clock of its own
    expect(sim.awaitingPlunge).toBe(false);
  });
});

describe('the printer limit', () => {
  it('prints at most 2 balls in one ball, and a new ball lets it print again', () => {
    const sim = createSim({ parts: [makePart('printer', 1, 12, 30, true)], gravity: 50, nextUid: 2 });
    sim.spawnBall();
    let extras = 0;
    for (let i = 0; i < 260; i++) sim.step({ ...NO_INPUT, plunge: i < 230 }); // fire the ball, so the table plays as it does in a round
    const drop = (n: number) => {
      for (let k = 0; k < n; k++) {
        // let everything from the last drop drain first (firing any ball the printer threw into the plunger lane), so
        // the 4-balls-on-the-table limit is not what stops the printer
        for (let i = 0; i < 260; i++) for (const e of sim.step({ ...NO_INPUT, plunge: i < 230 })) if (e.type === 'extraBall') extras++;
        for (let i = 0; i < 240 * 30 && sim.ballStates().some((b) => !b.inLane); i++) for (const e of sim.step(NO_INPUT)) if (e.type === 'extraBall') extras++;
        sim.addBall(12, 33.5, 0, -20);
        for (let i = 0; i < 240 * 1.2; i++) for (const e of sim.step(NO_INPUT)) if (e.type === 'extraBall') extras++;
      }
    };
    drop(10);
    expect(extras).toBe(2);
    sim.spawnBall();
    const before = extras;
    drop(2);
    expect(extras).toBeGreaterThan(before);
  });
});

describe('the runaway machine that started all this', () => {
  it('no longer scores millions: it is bounded by the clock, the caps and the coin limit', () => {
    const m = JSON.parse(readFileSync(new URL('./fixtures/runaway-machine.json', import.meta.url), 'utf8')) as Machine;
    const samples = playRounds(m, { rounds: 3, seed: 1, skill: 0.6 });
    for (const s of samples) {
      expect(s.cumulative[2]).toBeLessThan(1_000_000); // it scored 36,786,362 in one ball before
      expect(s.seconds).toBeLessThan(3 * 100); // three balls on a 90 s clock, plus launches
      expect(s.coins[2]).toBeLessThanOrEqual(5 + 3); // it paid $403 before (now: the coin cap, plus its one Ball Saver tipping $1 a ball)
    }
  });
});
