import { describe, expect, it } from 'vitest';
import { describe as describePart, makePart, PARTS, wizardNeed, type PartId, type PartInstance } from '../src/data/parts';
import { Game } from '../src/game/game';
import { Scorer } from '../src/game/scoring';
import { MAX_BALLS } from '../src/sim/constants';
import type { SimEvent } from '../src/sim/sim';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
const at = (id: PartId, uid: number, x: number, y: number): PartInstance => makePart(id, uid, x, y, true);
/** The lamp, Big Boi, a Pop, a Slingshot and a Lamp (no points of its own, so it is no segment). */
const table = () => [at('wizard', 1, 12, 20), at('mega', 2, 12, 36), at('pop', 3, 6, 30), at('pop', 4, 18, 30), at('sling', 5, 5, 20), at('lamp', 6, 19, 20), at('xlane', 7, 12, 44)];
const scorer = (parts: PartInstance[]) => {
  const s = new Scorer(1e9, () => parts);
  s.resetRound();
  return s;
};

describe('Wizard Lamp', () => {
  it('has one segment for every scoring part type on the table, up to 8', () => {
    expect(wizardNeed(table())).toBe(4); // the lamp, Big Boi, the Pops, the Slingshot (not the Lamp, nor the X Lane: no points)
    const many: PartInstance[] = (['pop', 'coin', 'sling', 'spinner', 'lane', 'ding', 'vari', 'thunder', 'golden', 'wizard'] as PartId[]).map((id, i) => at(id, i + 1, 0, 0));
    expect(wizardNeed(many)).toBe(PARTS.wizard.recipe.wizard!.max);
    expect(wizardNeed([...table(), makePart('coin', 9)])).toBe(4); // in the toolbox: no segment
    expect(describePart(PARTS.wizard, undefined, { wizardNeed: 4 }).map((l) => l.text).join(' ')).toContain('Right now: hit 4 types');
  });

  it('every type the ball itself hits lights a segment; all lit: WIZARD MODE, two more balls, once a round', () => {
    const s = scorer(table());
    for (const uid of [3, 4, 5]) expect(s.consume(hit(uid)).some((e) => e.label === 'WIZARD MODE!')).toBe(false);
    s.consume(hit(1, { t: 0.5, zap: true })); // a zap does not count
    s.consume(hit(1, { t: 0.6, spark: true })); // nor a spark
    expect(s.wizardState().lit).toBe(2); // two Pops are one type
    s.consume(hit(1, { t: 0.7 }));
    const out = s.consume(hit(2, { t: 1 }));
    const w = out.find((e) => e.label === 'WIZARD MODE!')!;
    expect(w.balls).toEqual({ n: PARTS.wizard.recipe.wizard!.balls, x: 12, y: 20, uid: 1 });
    expect(s.wizardState(2)).toMatchObject({ fired: true, left: PARTS.wizard.recipe.wizard!.seconds - 1 });
    s.startBall();
    expect(s.wizardState().left).toBe(0);
    for (const uid of [1, 2, 3, 5]) expect(s.consume(hit(uid, { t: 40 })).some((e) => e.label === 'WIZARD MODE!')).toBe(false); // once a round
    s.resetRound();
    for (const uid of [1, 2, 3]) s.consume(hit(uid, { t: 50 }));
    expect(s.consume(hit(5, { t: 51 })).some((e) => e.label === 'WIZARD MODE!')).toBe(true);
  });

  it('in WIZARD MODE every ×Mult limit is doubled, never lifted', () => {
    const passes = (s: Scorer, t0: number) => { for (let i = 0; i < 8; i++) s.consume(hit(7, { t: t0 + i * 3.1 })); return s.mult; };
    const plain = scorer(table());
    const capped = passes(plain, 0);
    expect(capped).toBeCloseTo(PARTS.xlane.recipe.xmultCap!, 2);
    const s = scorer(table());
    for (const uid of [1, 2, 3, 5]) s.consume(hit(uid));
    const before = s.mult;
    const wiz = passes(s, 0.1) / before;
    expect(wiz).toBeGreaterThan(PARTS.xlane.recipe.xmultCap! + 0.5);
    expect(wiz).toBeLessThanOrEqual(PARTS.xlane.recipe.xmultCap! * 2 + 0.01);
  });

  it('the balls fly out of the lamp, never more than the table holds, and leave when WIZARD MODE ends', () => {
    const g = new Game();
    g.startRound();
    const n = g.sim.ballCount;
    g.sim.launchBalls(10, 12, 20, 1);
    expect(g.sim.ballCount).toBe(Math.max(n, MAX_BALLS));
    // in a round: the lamp fires, two balls come out, and 30 s later they go (the last ball on the table never does)
    const h = new Game();
    h.layout.parts = [at('wizard', 50, 12, 24), ...h.layout.parts];
    h.startRound();
    const lamp = h.layout.parts.find((p) => p.def === 'wizard')!;
    for (const p of h.layout.parts.filter((q) => q.placed && PARTS[q.def].recipe.points)) h.scorer.consume(hit(p.uid, { t: h.sim.time }));
    expect(h.scorer.wizardState().fired).toBe(true);
    const ids = h.sim.launchBalls(2, lamp.x, lamp.y, lamp.uid);
    expect(ids).toHaveLength(2);
    expect(h.sim.retireBall(ids[0])).toBe(true);
    const others = h.sim.ballCount - 1;
    expect(h.sim.retireBall(ids[1])).toBe(others > 0);
    expect(h.sim.ballCount).toBeGreaterThanOrEqual(1);
  });
});
