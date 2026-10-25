import { describe, expect, it } from 'vitest';
import { DECAL_SLOTS, DECALS } from '../src/data/decals';
import { UPGRADE_IDS, UPGRADES, type UpgradeId } from '../src/data/upgrades';
import { Game, parseRun } from '../src/game/game';
import { NO_INPUT } from '../src/sim/sim';

function offer(g: Game, ...ids: UpgradeId[]) {
  g.pending = ids.map((id) => ({ id }));
}

describe('relic decals', () => {
  it('every Rules upgrade has a decal look, each with its own shape', () => {
    const rules = UPGRADE_IDS.filter((id) => UPGRADES[id].column === 'rules');
    for (const id of rules) expect(DECALS[id], id).toBeTruthy();
    const shapes = rules.map((id) => DECALS[id]!.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
    for (const id of Object.keys(DECALS)) expect(UPGRADES[id as UpgradeId].column).toBe('rules');
  });

  it('a run earns a decal from the Rules column and it sticks to the apron', () => {
    const g = new Game();
    offer(g, 'sponsor', 'headStart');
    expect(g.chooseUpgrade(1)).toBe(true);
    expect(g.decals.map((d) => d.id)).toEqual(['headStart']);
    expect(g.mods.startMult).toBeCloseTo(1.25);
  });

  it('the rule applies in the scorer at once: every ball starts at the Head Start Mult', () => {
    const g = new Game();
    offer(g, 'headStart');
    g.chooseUpgrade(0);
    g.startRound();
    expect(g.scorer.mult).toBeCloseTo(1.25);
  });

  it('the apron holds four; a fifth Rules card waits until you peel one', () => {
    const g = new Game();
    for (let i = 0; i < DECAL_SLOTS; i++) { offer(g, 'headStart'); expect(g.chooseUpgrade(0)).toBe(true); }
    expect(g.decals.length).toBe(DECAL_SLOTS);
    offer(g, 'sponsor', 'lucky');
    expect(g.canTake(1)).toBe(false);
    expect(g.chooseUpgrade(1)).toBe(false);
    expect(g.canTake(0)).toBe(true); // the other columns are not blocked
    expect(g.peel(0)).toBe(true);
    expect(g.decals.length).toBe(DECAL_SLOTS - 1);
    expect(g.chooseUpgrade(1)).toBe(true);
    expect(g.decals.map((d) => d.id)).toContain('lucky');
  });

  it('peeling destroys the decal: its rule stops, and undo can bring it back', () => {
    const g = new Game();
    offer(g, 'lucky');
    g.chooseUpgrade(0);
    expect(g.mods.luckyEvery).toBe(7);
    expect(g.peel(0)).toBe(true);
    expect(g.mods.luckyEvery).toBe(0);
    expect(g.picks).toEqual([]);
    expect(g.undo()).toBe(true);
    expect(g.mods.luckyEvery).toBe(7);
  });

  it('decals are only peeled between rounds, and survive a save', () => {
    const g = new Game();
    offer(g, 'ballHog');
    g.chooseUpgrade(0);
    g.startRound();
    expect(g.peel(0)).toBe(false);
    g.step(NO_INPUT);
    g.toWorkshop();
    const again = new Game();
    again.load(parseRun(JSON.stringify(g.save()))!);
    expect(again.decals.map((d) => d.id)).toEqual(['ballHog']);
    expect(again.mods.unusedBallPay).toBe(5);
  });

  it('the Test Lab also needs a free slot for a Rules decal', () => {
    const g = new Game();
    g.sandbox = true;
    for (let i = 0; i < DECAL_SLOTS; i++) expect(g.labUpgrade('headStart')).toBe(true);
    expect(g.labUpgrade('lucky')).toBe(false);
    expect(g.labUpgrade('sponsor')).toBe(true);
  });
});
