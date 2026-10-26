import { readFileSync, writeFileSync } from 'node:fs';
import { makePart, PARTS, SHOP_IDS, type PartId, type PartInstance } from '../../src/data/parts';
import type { Game } from '../../src/game/game';
import { gameFor, mean, nextRound, place, playRound, pool, type RoundTrace, type Setup } from './lib';
import { TABLES } from './tables';

/**
 * E1, the part census: does every part get hit, do its special effects fire, and what does it add?
 *   npx vite-node tools/research/census.ts [--out=file.json] [--parts=a,b]
 * Each part is added to the mid and the late table, placed by the auto-placer (avg player), then played in segments of
 * 4 rounds on the same Game (so things that grow over rounds grow) by the pro, avg and poor players. Gems are set into a
 * host part and compared with the host alone.
 */
export interface Task { context: string; part: PartId | null; gem?: PartId; host?: PartId; segs: Record<string, number>; seedOff?: number }
export interface ProfileStats {
  rounds: { score: number; ballSeconds: number[]; saves: number; presses: number; peak: number; seg: number; idx: number; part?: { points: number; hits: number; zaps: number; sparkHits: number; events: number; triggers: Record<string, number> }; money: number; maxSparks: number; maxBalls: number; zapBy: Record<string, { n: number; points: number }>; sparkPoints: number; wallMs: number; steps: number; worstStepMs: number }[];
  levelsGained: number;
  gone: boolean;
}
export interface Result { task: Task; placed: { x: number; y: number }[]; placeGain: number; profiles: Record<string, ProfileStats> }

const SEG = 4;
const GEM_HOSTS: Record<string, PartId[]> = {
  ruby: ['pop', 'thunder'], goldleaf: ['pop'], redseal: ['pop', 'thunder'], topaz: ['pop'], opal: ['pop', 'duck'],
  garnet: ['xlane', 'laser'], emerald: ['disco', 'firecracker', 'fame'],
};

function hostOn(g: Game, def: PartId): PartInstance | undefined {
  return g.layout.parts.filter((p) => p.placed && p.def === def).at(-1);
}

function run(t: Task): Result {
  const base = TABLES[t.context]();
  const s: Setup = { ...base, layout: structuredClone(base.layout), money: 30 };
  const l = s.layout;
  const add = (id: PartId) => {
    const n = PARTS[id].pack ?? 1, group = l.nextUid;
    for (let k = 0; k < n; k++) {
      const p = makePart(id, l.nextUid++);
      if (n > 1) p.group = group;
      if (t.context === 'late' && PARTS[id].recipe.perLevel) p.level = 3;
      l.parts.push(p);
    }
  };
  const target = t.host ?? t.part;
  const isGemBase = !!t.host; // gem tasks: the host is added (with or without the gem)
  if (target && !(t.host && l.parts.some((p) => p.def === t.host && p.placed))) add(target);
  let placeGain = 1;
  if (l.parts.some((p) => !p.placed)) {
    const r = place(s, { profile: 'avg', seed: 41 + (t.seedOff ?? 0), evalRounds: 1, tries: 6, steps: 0 });
    s.layout = r.layout;
    placeGain = r.before > 0 ? r.after / r.before : 1;
  }
  const placed = s.layout.parts.filter((p) => p.placed && p.def === target).map((p) => ({ x: p.x, y: p.y }));
  const profiles: Record<string, ProfileStats> = {};
  for (const [profile, segs] of Object.entries(t.segs)) {
    const st: ProfileStats = { rounds: [], levelsGained: 0, gone: false };
    for (let seg = 0; seg < segs; seg++) {
      const g = gameFor(s);
      if (t.gem && t.host) { const h = hostOn(g, t.host); if (h) h.inlay = t.gem; }
      const lv0 = g.layout.parts.reduce((a, p) => a + (p.level ?? 0), 0);
      for (let i = 0; i < SEG; i++) {
        g.money = 30;
        for (const p of g.layout.parts.filter((q) => q.placed && PARTS[q.def].recipe.well)) for (let k = 0; k < 5; k++) g.wish(p.uid);
        const m0 = g.money;
        const r: RoundTrace = playRound(g, { profile, seed: 1000 + seg * 10 + i + (t.seedOff ?? 0) * 100000, detail: true });
        const tr = t.host ? r.parts[t.host] : t.part ? r.parts[t.part] : undefined;
        st.rounds.push({ score: r.score, ballSeconds: r.ballSeconds, saves: r.saves, presses: r.presses, peak: r.peakMult, seg, idx: i, part: tr, money: r.coins, maxSparks: r.maxSparks, maxBalls: r.maxBalls, zapBy: r.zapBy, sparkPoints: r.sparkPoints, wallMs: r.wallMs, steps: r.steps, worstStepMs: r.worstStepMs });
        void m0;
        if (i < SEG - 1) nextRound(g, s);
      }
      st.levelsGained += g.layout.parts.reduce((a, p) => a + (p.level ?? 0), 0) - lv0;
      if (target && !isGemBase && !g.layout.parts.some((p) => p.def === target)) st.gone = true;
    }
    profiles[profile] = st;
  }
  return { task: t, placed, placeGain, profiles };
}

const arg = process.argv[2];
if (arg && !arg.startsWith('--')) {
  process.stdout.write('RESULT ' + JSON.stringify(run(JSON.parse(arg))) + '\n');
} else {
  const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true'] as [string, string]; }));
  const parts = (args.get('parts')?.split(',') as PartId[] | undefined) ?? SHOP_IDS.filter((id) => PARTS[id].kind !== 'inlay');
  const segs = { avg: 3, pro: 2, poor: 2 };
  const seedOff = Number(args.get('seed-off') ?? 0);
  const tasks: Task[] = [];
  for (const context of ['mid', 'late']) {
    tasks.push({ context, part: null, segs: { avg: 6, pro: 4, poor: 4 }, seedOff });
    for (const p of parts) tasks.push({ context, part: p, segs, seedOff });
    if (!args.get('parts')) for (const [gem, hosts] of Object.entries(GEM_HOSTS)) for (const host of hosts) {
      tasks.push({ context, part: null, host, segs, seedOff }); // the host alone
      tasks.push({ context, part: null, gem: gem as PartId, host, segs, seedOff });
    }
  }
  const t0 = Date.now();
  let done = 0;
  // --resume=file: keep the results already there, run only the tasks that failed
  const prev: (Result | null)[] = args.get('resume') ? JSON.parse(readFileSync(args.get('resume')!, 'utf8')) : [];
  const todo = tasks.map((t, i) => i).filter((i) => !prev[i]);
  const got = await pool<Result>('tools/research/census.ts', todo.map((i) => tasks[i]), 4, () => { if (++done % 10 === 0) console.error(`${done}/${todo.length} in ${((Date.now() - t0) / 60000).toFixed(1)} min`); });
  const res: Result[] = tasks.map((_, i) => prev[i] ?? got[todo.indexOf(i)]);
  writeFileSync(args.get('out') ?? 'census.json', JSON.stringify(res));
  console.log(`wrote ${tasks.length} results in ${((Date.now() - t0) / 60000).toFixed(1)} min; mean wall per task ${mean(res.filter(Boolean).map((r) => Object.values(r.profiles).flatMap((p) => p.rounds).reduce((a, x) => a + x.wallMs, 0))) / 1000} s`);
}
