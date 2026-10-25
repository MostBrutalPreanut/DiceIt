import { describe, expect, it } from 'vitest';
import { BOSS_IDS, BOSSES, bossOf, FINAL_BOSSES, planBosses, REGULAR_BOSSES, type BossId } from '../src/data/bosses';
import { makePart } from '../src/data/parts';
import { Game, goalFor } from '../src/game/game';
import { createSim, NO_INPUT, type SimEvent } from '../src/sim/sim';
import type { Layout } from '../src/sim/layout';

const hit = (uid: number, extra: Partial<Extract<SimEvent, { type: 'partHit' }>> = {}): SimEvent =>
  ({ type: 'partHit', t: 0, uid, ballId: 1, x: 0, y: 0, speed: 10, ...extra });
/** A game on a boss round with this boss. */
function bossRound(id: BossId, setup?: (g: Game) => void) {
  const g = new Game();
  g.bossPlan = [id, id, id, id, FINAL_BOSSES[0]];
  g.round = 3;
  if (BOSSES[id].final) { g.bossPlan = [...REGULAR_BOSSES.slice(0, 4), id]; g.round = 15; }
  setup?.(g);
  g.startRound();
  return g;
}

describe('the bosses', () => {
  it('twelve of them: nine regular and three final, each says what it does', () => {
    expect(BOSS_IDS).toHaveLength(12);
    expect(REGULAR_BOSSES).toHaveLength(9);
    expect(FINAL_BOSSES).toHaveLength(3);
    for (const id of BOSS_IDS) expect(BOSSES[id].text.length, id).toBeGreaterThan(20);
  });

  it('every run draws four different regular bosses and a final one, and runs differ', () => {
    const plans = Array.from({ length: 60 }, (_, i) => planBosses(i + 1));
    for (const p of plans) {
      expect(p).toHaveLength(5);
      expect(new Set(p.slice(0, 4)).size).toBe(4);
      for (const b of p.slice(0, 4)) expect(BOSSES[b].final).toBe(false);
      expect(BOSSES[p[4]].final).toBe(true);
    }
    expect(new Set(plans.map((p) => p.join())).size).toBeGreaterThan(30);
  });

  it('bosses sit on rounds 3, 6, 9, 12 and 15; endless rounds after keep a boss every third round', () => {
    const plan = planBosses(4);
    expect([1, 2, 4, 5, 7].map((r) => bossOf(plan, r))).toEqual([null, null, null, null, null]);
    expect([3, 6, 9, 12, 15].map((r) => bossOf(plan, r))).toEqual(plan);
    expect(bossOf(plan, 18)).not.toBeNull();
    const g = new Game();
    g.newRun();
    expect(g.nextBoss.round).toBe(3);
    expect(g.nextBoss.boss.id).toBe(g.bossPlan[0]);
  });

  it('a new run plans new bosses, and the plan survives a save', () => {
    const g = new Game();
    g.newRun();
    const a = [...g.bossPlan];
    const copy = new Game();
    copy.load(JSON.parse(JSON.stringify(g.save())));
    expect(copy.bossPlan).toEqual(a);
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) { g.newRun(); seen.add(g.bossPlan.join()); }
    expect(seen.size).toBeGreaterThan(4);
  });

  it('the boss is only there on its round: the workshop and other rounds play normally', () => {
    const g = new Game();
    g.bossPlan = ['slippery', 'slippery', 'slippery', 'slippery', 'auditor'];
    g.round = 2;
    g.startRound();
    expect(g.mods.ballGravity).toBe(1);
    g.toWorkshop();
    g.round = 3;
    g.startRound();
    expect(g.mods.ballGravity).toBeCloseTo(1.4);
    g.toWorkshop();
    expect(g.mods.ballGravity).toBe(1);
  });
});

describe('what each boss does', () => {
  it('The Tax Man: parts pay no money and the round pays $3 less', () => {
    const g = bossRound('taxMan', (x) => { x.layout.parts.push(makePart('coin', 50, 12, 28, true)); });
    expect(g.scorer.consume(hit(50))[0].money).toBe(0);
    expect(g.mods.noCoins).toBe(true);
    expect(g.mods.payCut).toBe(3);
  });

  it('Cheap Rubber: bumpers kick half as hard', () => {
    const speed = (factor: number) => {
      const layout: Layout = { parts: [makePart('pop', 1, 12, 30, true)], gravity: 50, nextUid: 9 };
      const sim = createSim(layout, { mods: { kickFactor: factor } });
      sim.addBall(12, 32, 0, -1);
      let best = 0;
      for (let i = 0; i < 240; i++) { sim.step(NO_INPUT); best = Math.max(best, Math.hypot(sim.ballStates()[0]?.vx ?? 0, sim.ballStates()[0]?.vy ?? 0)); }
      return best;
    };
    expect(BOSSES.cheapRubber.mods).toBeTruthy();
    expect(bossRound('cheapRubber').mods.kickFactor).toBe(0.5);
    expect(speed(0.5)).toBeLessThan(speed(1) * 0.8);
  });

  it('Night Shift: lights do nothing (lamps stay dark, lanes score nothing)', () => {
    const g = bossRound('nightShift', (x) => { x.layout.parts.push(makePart('lamp', 50, 12, 28, true), makePart('lane', 51, 6, 40, true)); });
    expect(g.scorer.consume(hit(50))).toEqual([]);
    expect(g.scorer.consume(hit(51))).toEqual([]);
    expect(g.scorer.isLit(50)).toBe(false);
  });

  it('Crossed Wires: the left button works the right flippers', () => {
    const g = bossRound('crossedWires');
    for (let i = 0; i < 40; i++) g.step({ ...NO_INPUT, left: true });
    const f = g.sim.flipperStates();
    expect(f.find((q) => q.side === 'R')!.angle).toBeLessThan(0); // up (the right flipper turns clockwise)
    expect(f.find((q) => q.side === 'L')!.angle).toBeLessThan(0); // left stays down
  });

  it('Short Fuse: every ball has a 25 s clock', () => {
    expect(bossRound('shortFuse').sim.clockTotal).toBe(25);
  });

  it('The Jammer: your most numerous part type scores nothing', () => {
    const g = bossRound('jammer', (x) => { x.layout.parts.push(makePart('coin', 50, 12, 28, true)); });
    expect([...g.scorer.jammed]).toEqual(['pop']); // three Pops beat one Cha-Ching
    expect(g.scorer.consume(hit(1))).toEqual([]);
    expect(g.scorer.consume(hit(50))[0].base).toBe(8);
  });

  it('Flat Rate: Mult gains are halved', () => {
    const g = bossRound('flatRate');
    g.scorer.consume(hit(4)); // the Big Boi
    expect(g.scorer.mult).toBeCloseTo(1.075);
  });

  it('The Magnet and The Whirlpool pull balls towards the drain', () => {
    const drift = (id: BossId) => {
      const g = bossRound(id);
      g.sim.addBall(5, 12, 0, 0);
      const x0 = 5;
      for (let i = 0; i < 60; i++) g.sim.step(NO_INPUT);
      const b = g.sim.ballStates().find((q) => !q.inLane)!;
      return b.x - x0;
    };
    expect(drift('magnet')).toBeGreaterThan(0.05);
    expect(drift('whirlpool')).toBeGreaterThan(0.05);
  });

  it('The Auditor: decals are off until half the goal, and the goal is 20% higher', () => {
    const g = bossRound('auditor', (x) => { x.decals = [{ id: 'overclock', target: 'pop' }]; });
    expect(g.scorer.goal).toBe(Math.round(goalFor(15) * 1.2));
    expect(g.scorer.consume(hit(1))[0].base).toBe(20);
    g.scorer.score = g.scorer.goal / 2;
    g.scorer.consume(hit(2));
    expect(g.scorer.consume(hit(3))[0].base).toBe(Math.round((20 + 2) * 1.5));
  });

  it('The Overlord: a random part type is switched off every ball, and Mult gains are halved', () => {
    const g = bossRound('overlord', (x) => { x.layout.parts.push(makePart('coin', 50, 12, 28, true), makePart('sling', 51, 8, 22, true)); });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) { g.scorer.startBall(); expect(g.scorer.jammed.size).toBe(1); seen.add([...g.scorer.jammed][0]); }
    expect(seen.size).toBeGreaterThan(1);
    expect(g.mods.multGain).toBe(0.5);
  });

  it('every boss plays a whole round with the bot and nothing breaks', async () => {
    const { Bot } = await import('../src/sim/bot');
    for (const id of BOSS_IDS) {
      const g = bossRound(id);
      g.goalOverride = Infinity;
      g.startRound();
      const bot = new Bot(2, 0.7);
      for (let i = 0; i < 240 * 30 && g.mode === 'round'; i++) g.step(bot.decide(g.sim));
      expect(Number.isFinite(g.scorer.score), id).toBe(true);
    }
  });

  it('beating the final boss wins the run, and you can keep playing', () => {
    const g = new Game();
    g.round = 15;
    g.startRound();
    g.scorer.score = g.scorer.goal;
    g.scorer.goalReached = true;
    const out: string[] = [];
    g.cashOut();
    expect(g.mode).toBe('roundEnd');
    expect(g.won).toBe(true);
    out.push(g.mode);
    g.continueAfterRound();
    expect(g.round).toBe(16);
    expect(g.pending).toHaveLength(3); // the final boss's decal
  });
});
