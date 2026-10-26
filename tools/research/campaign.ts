import { writeFileSync } from 'node:fs';
import { gemFits, isDecor, isInlay, PARTS, type PartId, type PartInstance } from '../../src/data/parts';
import { DECALS, type DecalId } from '../../src/data/decals';
import type { MachineId } from '../../src/data/bigboi';
import { Game } from '../../src/game/game';
import { Rng } from '../../src/sim/rng';
import { DECAL_PRIORITY, PART_VALUE } from '../par';
import { mean, place, playRound, pool, type RoundTrace } from './lib';

/**
 * E5, campaigns: whole runs as a player would play them. Real shop rolls, decal picks, bosses and money; the round is
 * played once by the player profile against the real goal, and a lost round ends the run. A won run plays on into
 * endless rounds (up to `endless`) to see how far the build carries.
 *   npx vite-node tools/research/campaign.ts --seeds=6 --out=file.json
 */
export type Strategy = 'par' | 'seeker' | 'casual';
export interface CampaignTask { seed: number; strategy: Strategy; profile: string; machine: MachineId; endless: number }

/** The archetypes the seeker builds towards: core parts, support parts and the decals it wants (best first). */
export const ARCHETYPES: Record<string, { core: PartId[]; support: PartId[]; decals: DecalId[]; decor: PartId[] }> = {
  bumpers: { core: ['pop', 'thunder', 'golden', 'tesla', 'plate', 'ding'], support: ['bell', 'trophy', 'gong', 'keg', 'uplight', 'coin', 'lamp', 'roller', 'bonsai', 'grape'], decals: ['bumperCar', 'goldenAge', 'levelUp', 'overclock', 'headStart', 'momentum', 'afterglow', 'lucky'], decor: ['hutch', 'bulb', 'clock'] },
  sparks: { core: ['sparkler', 'rocks', 'firecracker', 'split', 'whale', 'nest'], support: ['jar', 'keg', 'pinata', 'tesla', 'pop', 'gong', 'golden', 'trophy'], decals: ['lucky', 'headStart', 'momentum', 'afterglow', 'goldenAge', 'overclock', 'multiball', 'crowd'], decor: ['clock', 'hutch', 'altar'] },
  lights: { core: ['lane', 'xlane', 'rank', 'disco', 'fame', 'lamp'], support: ['bank', 'spot', 'strip', 'wizard', 'echo', 'spinner', 'trophy', 'bell'], decals: ['lightShow', 'sets', 'lamps', 'afterglow', 'momentum', 'headStart', 'spinDoctor', 'goldenAge'], decor: ['altar', 'bulb', 'clock'] },
  targets: { core: ['vari', 'bank', 'duck', 'goal', 'piggy', 'pinata'], support: ['sling', 'deflector', 'jar', 'spot', 'kickback', 'golden', 'trophy', 'echo'], decals: ['targetPractice', 'comboKing', 'sets', 'headStart', 'momentum', 'afterglow', 'goldenAge', 'overclock'], decor: ['hutch', 'altar', 'clock'] },
  multiball: { core: ['printer', 'gumball', 'wheel', 'bucket', 'magnet', 'jackpot'], support: ['saver', 'hand', 'golden', 'xlane', 'trophy', 'pop', 'ding', 'wizard'], decals: ['multiball', 'printerPlus', 'twin', 'extraBall', 'headStart', 'momentum', 'afterglow', 'safetyNet'], decor: ['hutch', 'clock', 'altar'] },
};
const GENERIC_X: PartId[] = ['golden', 'xlane', 'disco', 'fame', 'trophy', 'bell', 'goal', 'wizard'];
const GUARDS: PartId[] = ['hand', 'flipper', 'flipperR', 'saver', 'kickback', 'bucket', 'magnet'];
/** Base values for what par ignores (gems, decor). */
const EXTRA_VALUE: Partial<Record<PartId, number>> = { ruby: 6, redseal: 6, goldleaf: 5, topaz: 4, opal: 3, garnet: 3, emerald: 8, clock: 5, altar: 6, hutch: 7, bulb: 2, tray: 4, mirror: 3, well: 3, capsule: 3, insure: 2, ring: 4, hand: 4, spot: 4, echo: 4 };

interface RoundLog {
  round: number; boss: string | null; goal: number; score: number; won: boolean; clearBall: number; ballSeconds: number[];
  moneyStart: number; moneyEnd: number; spent: number; bought: string[]; rerolls: number; fees: number; scrapped: string[];
  decalPicked: string | null; decals: string[]; owned: number; placed: number; types: number; archetype: string | null;
  top: [string, number][]; levels: number; keptMult: number; rings: number; peakMult: number; wallSec: number;
}
export interface CampaignResult { task: CampaignTask; rounds: RoundLog[]; reached: number; won: boolean; endlessReached: number }

const value = (id: PartId) => PART_VALUE[id] || EXTRA_VALUE[id] || 0;

class Shopper {
  arch: string | null = null;
  rng: Rng;
  lastPoints: Partial<Record<PartId, number>> = {};
  constructor(public t: CampaignTask) { this.rng = new Rng(t.seed * 13 + 7); }

  /** How much this player wants a part right now. */
  want(g: Game, id: PartId): number {
    let v = value(id);
    const s = this.t.strategy;
    if (s === 'par') return PART_VALUE[id] ?? 0;
    if (s === 'casual') {
      const rar = { common: 2, uncommon: 3, rare: 5, legendary: 8 }[PARTS[id].rarity];
      return isInlay(id) ? 0 : rar + this.rng.range(0, 3);
    }
    // seeker
    if (isInlay(id) && !this.gemHost(g, id)) return 0;
    if (isDecor(id) && g.layout.parts.some((p) => isDecor(p.def))) return 0;
    const a = this.arch ? ARCHETYPES[this.arch] : null;
    if (a) v *= a.core.includes(id) ? 2.5 : a.support.includes(id) ? 1.5 : a.decor.includes(id) ? 1.6 : 0.6;
    if (GENERIC_X.includes(id)) v *= 1.4;
    const guardBias = { pro: 0.7, avg: 1.2, poor: 2.2 }[this.t.profile] ?? 1;
    if (GUARDS.includes(id)) v *= guardBias;
    const have = g.layout.parts.filter((p) => p.def === id).length;
    if (have >= (PARTS[id].pack ? 2 * PARTS[id].pack! : id === 'pop' ? 6 : 3)) v *= 0.2;
    if ((id === 'tray' || id === 'mirror' || id === 'capsule') && g.round > 8) v *= 0.2;
    return v;
  }

  /** Pick an archetype from what the run owns (and what it has been offered). */
  chooseArch(g: Game) {
    if (this.t.strategy !== 'seeker') return;
    if (this.arch && g.round < 8) return;
    const owned = g.layout.parts.map((p) => p.def);
    let best: string | null = null, bestFit = -1;
    for (const [k, a] of Object.entries(ARCHETYPES)) {
      const fit = owned.reduce((s, id) => s + (a.core.includes(id) ? 3 * PARTS[id].cost : a.support.includes(id) ? PARTS[id].cost : 0), 0) + (k === this.arch ? 4 : 0);
      if (fit > bestFit) { bestFit = fit; best = k; }
    }
    if (g.round >= 3 || bestFit > 12) this.arch = best;
  }

  gemHost(g: Game, gem: PartId): PartInstance | undefined {
    const placed = g.placed.filter((p) => !p.fixed && !p.inlay && gemFits(gem, p.def));
    const pts = (p: PartInstance) => (this.lastPoints[p.def] ?? 0) / Math.max(1, g.placed.filter((q) => q.def === p.def).length);
    return placed.sort((a, b) => pts(b) - pts(a))[0];
  }

  shop(g: Game): { bought: string[]; spent: number; rerolls: number } {
    const bought: string[] = [];
    let spent = 0, rerolls = 0;
    const maxRerolls = this.t.strategy === 'seeker' ? 4 : this.t.strategy === 'par' ? 2 : g.money > 15 ? 1 : 0;
    for (let guard = 0; guard < 50; guard++) {
      const options = g.shop.offers
        .map((id, slot) => ({ id, slot }))
        .filter((o): o is { id: PartId; slot: number } => !!o.id && g.priceAt(o.slot) <= g.money && this.want(g, o.id) > 0 && (isInlay(o.id) ? !!this.gemHost(g, o.id) : g.hasRoomFor(o.id)))
        .map((o) => ({ ...o, score: (this.want(g, o.id) * (PARTS[o.id].pack ?? 1)) / g.priceAt(o.slot) }))
        .sort((a, b) => b.score - a.score);
      // a seeker keeps $ back for a core part it has locked
      const reserve = this.t.strategy === 'seeker' ? Math.max(0, ...((g.shop.locked ?? []).map((i) => g.shop.offers[i]).filter((x): x is PartId => !!x).map((id) => g.priceOf(id)))) : 0;
      const pick = options.find((o) => g.isLocked(o.slot) || g.money - g.priceAt(o.slot) >= reserve || g.priceAt(o.slot) >= reserve);
      if (pick && (this.t.strategy !== 'casual' || this.rng.next() < 0.85)) {
        const price = g.priceAt(pick.slot);
        let ok: PartInstance | null;
        if (isInlay(pick.id)) { const h = this.gemHost(g, pick.id)!; ok = g.buyAndPlace(pick.slot, h.x, h.y); }
        else ok = g.buy(pick.slot);
        if (!ok) break;
        bought.push(pick.id); spent += price;
        continue;
      }
      if (this.t.strategy === 'seeker') {
        // lock the best core offer it cannot afford yet
        const a = this.arch ? ARCHETYPES[this.arch] : null;
        const want = g.shop.offers.map((id, slot) => ({ id, slot })).filter((o): o is { id: PartId; slot: number } => !!o.id && !g.isLocked(o.slot) && g.priceAt(o.slot) > g.money && (!!a?.core.includes(o.id) || GENERIC_X.includes(o.id)));
        if (want.length && (g.shop.locked?.length ?? 0) < g.lockSlots) g.toggleLock(want[0].slot);
      }
      if (g.toolboxFull) break;
      if (rerolls < maxRerolls && g.money - g.rerollCost >= (this.t.strategy === 'seeker' ? 5 : 3) && g.reroll()) { rerolls++; continue; }
      break;
    }
    return { bought, spent, rerolls };
  }

  pickDecal(g: Game): number {
    const offers = g.pending ?? [];
    const ok = offers.map((_, i) => i).filter((i) => g.canTake(i));
    if (!ok.length) return -1;
    if (this.t.strategy === 'casual') return ok[Math.floor(this.rng.next() * ok.length)];
    const list: DecalId[] = this.t.strategy === 'seeker' && this.arch ? [...ARCHETYPES[this.arch].decals, ...DECAL_PRIORITY] : DECAL_PRIORITY;
    const own = new Set(g.layout.parts.map((p) => p.def));
    let best = ok[0], bestRank = Infinity;
    for (const i of ok) {
      const o = offers[i];
      let rank = list.indexOf(o.id);
      if (rank < 0) rank = 99;
      if (o.target && this.t.strategy === 'seeker') {
        // a targeted decal is worth it on the part that scores most
        const top = Object.entries(this.lastPoints).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3).map(([k]) => k);
        if (!top.includes(o.target)) rank += 6;
      }
      if (o.id === 'purist' && new Set([...own].filter((d) => d !== 'mega')).size > 4) rank = 99;
      if (rank < bestRank) { bestRank = rank; best = i; }
    }
    return best;
  }

  prize(g: Game) {
    const p = g.shop.prize;
    if (!p?.length) return;
    const order = p.map((id, i) => ({ i, v: this.want(g, id) || value(id) || 1 })).sort((a, b) => b.v - a.v);
    for (const o of order) if (g.takePrize(o.i)) return;
  }
}

function play(t: CampaignTask): CampaignResult {
  const g = new Game();
  for (let i = 0; i < t.seed; i++) g.newRun(t.machine);
  const sh = new Shopper(t);
  const rounds: RoundLog[] = [];
  let won = false, reached = 0;
  const effort = t.strategy === 'casual' ? { tries: 2, steps: 0 } : { tries: 3, steps: 4 };
  for (let n = 1; n <= 15 + t.endless; n++) {
    const w0 = Date.now();
    const moneyStart = g.money;
    let decalPicked: string | null = null;
    sh.chooseArch(g);
    if (g.pending) {
      const i = sh.pickDecal(g);
      if (i >= 0 && g.chooseDecal(i)) { const d = g.decals.at(-1)!; decalPicked = d.id + (d.target ? ':' + d.target : ''); }
      else { g.skipPick(); decalPicked = 'skip'; }
    }
    sh.prize(g);
    const { bought, spent, rerolls } = sh.shop(g);
    sh.chooseArch(g);
    // a seeker throws spare cash in its wells
    if (t.strategy === 'seeker') for (const p of g.placed.filter((q) => PARTS[q.def].recipe.well)) while (g.money > 8 && g.wish(p.uid));
    // a sold-out Time Capsule: dig it up for the prize
    for (const p of g.placed.filter((q) => g.capsuleRipe(q))) { g.sell(p.uid); sh.prize(g); }
    // lay out the machine (the player's own hands judge it); moving a part that already played costs $1
    const before = new Map(g.layout.parts.map((p) => [p.uid, `${p.x},${p.y},${p.angle},${p.placed}`]));
    const setup = { layout: g.layout, machine: g.machine, decals: g.decals, rings: g.rings, boss: g.boss?.id ?? null, round: g.round };
    const res = place(setup, { profile: t.profile, seed: t.seed * 100 + n, evalRounds: 1, ...effort });
    let fees = 0;
    const freeMoves = g.mods.freeMoves;
    for (const p of res.layout.parts) {
      const orig = g.layout.parts.find((q) => q.uid === p.uid);
      if (!orig) continue;
      const moved = before.get(p.uid) !== `${p.x},${p.y},${p.angle},${p.placed}`;
      if (moved && orig.placed && !orig.fresh && !orig.loose && !freeMoves) {
        if (g.money - fees <= 0) continue; // cannot pay: it stays put
        fees++;
      }
      Object.assign(orig, { x: p.x, y: p.y, angle: p.angle, placed: p.placed });
    }
    g.money -= fees;
    // a seeker scraps its weakest part when a better one is stuck in the toolbox
    const scrapped: string[] = [];
    if (t.strategy === 'seeker') {
      for (const loose of g.inventory.filter((p) => !isDecor(p.def) && !isInlay(p.def)).slice(0, 2)) {
        const weakest = g.placed.filter((p) => !p.fixed && p.def !== loose.def && !PARTS[p.def].pack).map((p) => ({ p, v: (sh.lastPoints[p.def] ?? 0) / Math.max(1, g.placed.filter((q) => q.def === p.def).length) })).sort((a, b) => a.v - b.v)[0];
        if (!weakest || sh.want(g, loose.def) < sh.want(g, weakest.p.def) * 1.3) continue;
        const at = { x: weakest.p.x, y: weakest.p.y };
        if (g.sell(weakest.p.uid) === null) continue;
        scrapped.push(weakest.p.def);
        if (!g.place(loose.uid, at.x, at.y)) {
          const r2 = place({ ...setup, layout: g.layout }, { profile: t.profile, seed: t.seed * 100 + n + 50, evalRounds: 1, tries: 3, steps: 0 });
          const q = r2.layout.parts.find((x) => x.uid === loose.uid);
          if (q?.placed) Object.assign(loose, { x: q.x, y: q.y, angle: q.angle, placed: true });
        }
      }
    }
    const boss = g.boss?.id ?? null;
    const r: RoundTrace = playRound(g, { profile: t.profile, seed: t.seed * 1000 + n, real: true, detail: true });
    sh.lastPoints = Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, v!.points]));
    const tot = Object.values(r.parts).reduce((a, v) => a + (v?.points ?? 0), 0) || 1;
    rounds.push({
      round: n, boss, goal: r.goal ?? 0, score: r.score, won: !!r.won, clearBall: r.clearBall ?? 0, ballSeconds: r.ballSeconds,
      moneyStart, moneyEnd: g.money, spent, bought, rerolls, fees, scrapped, decalPicked, decals: g.decals.map((d) => d.id + (d.target ? ':' + d.target : '')),
      owned: g.layout.parts.filter((p) => !p.fixed).length, placed: g.placed.filter((p) => !p.fixed).length, types: new Set(g.placed.filter((p) => !p.fixed).map((p) => p.def)).size,
      archetype: sh.arch, top: Object.entries(r.parts).map(([k, v]) => [k, Math.round((100 * (v?.points ?? 0)) / tot)] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5),
      levels: g.layout.parts.reduce((a, p) => a + (p.level ?? 0), 0), keptMult: g.keptMult, rings: g.rings, peakMult: r.peakMult, wallSec: (Date.now() - w0) / 1000,
    });
    process.stderr.write(`${t.strategy}/${t.profile}/${t.seed} r${n} ${r.won ? 'WON' : 'LOST'} ${Math.round(r.score)}/${r.goal} $${g.money} ${sh.arch ?? ''}\n`);
    if (!r.won) break;
    reached = n;
    if (n === 15) won = true;
    g.continueAfterRound();
  }
  return { task: t, rounds, reached, won, endlessReached: Math.max(0, reached - 15) };
}

const arg = process.argv[2];
if (arg && !arg.startsWith('--')) process.stdout.write('RESULT ' + JSON.stringify(play(JSON.parse(arg))) + '\n');
else {
  const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true'] as [string, string]; }));
  const seeds = Number(args.get('seeds') ?? 4), base = Number(args.get('seed-base') ?? 1);
  const strategies = (args.get('strategies') ?? 'par,seeker,casual').split(',') as Strategy[];
  const profiles = (args.get('profiles') ?? 'pro,avg,poor').split(',');
  const machines: MachineId[] = ['factory', 'diner', 'castle'];
  const tasks: CampaignTask[] = [];
  for (let s = base; s < base + seeds; s++) for (const strategy of strategies) for (const profile of profiles) tasks.push({ seed: s, strategy, profile, machine: machines[s % 3], endless: Number(args.get('endless') ?? 5) });
  // the long ones first, so the pool ends together
  tasks.sort((a, b) => (a.profile === 'poor' ? 1 : 0) - (b.profile === 'poor' ? 1 : 0));
  const t0 = Date.now();
  let done = 0;
  const res = await pool<CampaignResult>('tools/research/campaign.ts', tasks, Number(args.get('workers') ?? 4), (i, r) => { done++; console.error(`[${done}/${tasks.length}] ${r.task.strategy}/${r.task.profile}/${r.task.seed} reached ${r.reached}${r.won ? ' WON' : ''} (${((Date.now() - t0) / 60000).toFixed(1)} min)`); });
  writeFileSync(args.get('out') ?? 'campaign.json', JSON.stringify(res));
  console.log(`done ${tasks.length} runs in ${((Date.now() - t0) / 60000).toFixed(1)} min; mean reached ${mean(res.filter(Boolean).map((r) => r.reached)).toFixed(1)}`);
}
