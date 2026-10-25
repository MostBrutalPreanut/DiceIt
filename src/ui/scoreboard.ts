// The personal scoreboard: every finished run (won, lost or abandoned) with the machine it ended as. It lives in
// localStorage on this device only. The records are plain data, ranked and capped here, so the rules are tested
// without a browser; the menu draws them.
import { DECALS, type DecalId } from '../data/decals';
import { PARTS, type PartId } from '../data/parts';
import type { MachineId } from '../data/bigboi';
import type { Game, RunSave } from '../game/game';

export type RunResult = 'won' | 'lost' | 'abandoned';

/** One part of the final build, where it stood. */
export interface BuiltPart { def: PartId; x: number; y: number; angle: number; level?: number }

export interface RunRecord {
  id: string;
  started: number;
  ended: number;
  machine: MachineId;
  result: RunResult;
  /** the round the run ended on, and how many it cleared (more than 15 is endless) */
  round: number;
  cleared: number;
  /** every point the run scored in its rounds */
  score: number;
  /** the best single round */
  best: number;
  decals: DecalId[];
  parts: BuiltPart[];
  ledge?: number;
}

/** The run in progress: its id, when it started and its best round so far (kept beside the save). */
export interface RunMeta { id: string; started: number; best: number }

export const RECORDS_KEY = 'pinball-roguelite.scoreboard.v1';
export const RUN_META_KEY = 'pinball-roguelite.runmeta.v1';
/** The board keeps the best this many runs. */
export const MAX_RECORDS = 50;

export const RESULT_NAMES: Record<RunResult, string> = { won: 'Won', lost: 'Lost', abandoned: 'Abandoned' };

export const newRunMeta = (now = Date.now()): RunMeta => ({ id: `${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, started: now, best: 0 });

export function parseRunMeta(json: string | null): RunMeta | null {
  try {
    const v = json ? JSON.parse(json) : null;
    if (v && typeof v.id === 'string' && Number.isFinite(v.started)) return { id: v.id, started: v.started, best: Number.isFinite(v.best) ? v.best : 0 };
  } catch { /* none */ }
  return null;
}

/** Best first: more rounds cleared, then more points, then the newer run. */
export const compareRecords = (a: RunRecord, b: RunRecord) => b.cleared - a.cleared || b.score - a.score || b.ended - a.ended;

export function parseRecords(json: string | null): RunRecord[] {
  let raw: unknown;
  try { raw = json ? JSON.parse(json) : []; } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const ok = (r: RunRecord) => r && typeof r.id === 'string' && ['won', 'lost', 'abandoned'].includes(r.result) && Number.isFinite(r.cleared) && Number.isFinite(r.score) && Array.isArray(r.parts);
  return raw.filter(ok).map((r: RunRecord) => ({
    ...r,
    decals: (r.decals ?? []).filter((d) => d in DECALS),
    parts: r.parts.filter((p) => p && p.def in PARTS && Number.isFinite(p.x) && Number.isFinite(p.y)),
  })).sort(compareRecords).slice(0, MAX_RECORDS);
}

/**
 * Add a run, or update it (the same run id: an endless run that is won and later lost). A run that was won
 * stays won. The list comes back ranked and capped.
 */
export function upsertRecord(list: RunRecord[], rec: RunRecord): RunRecord[] {
  const old = list.find((r) => r.id === rec.id);
  const merged = old ? { ...rec, result: old.result === 'won' ? 'won' as const : rec.result, best: Math.max(old.best, rec.best) } : rec;
  return [...list.filter((r) => r.id !== rec.id), merged].sort(compareRecords).slice(0, MAX_RECORDS);
}

/** Where a record sits on the board (1 = best), or 0 when it did not make the cut. */
export const rankOf = (list: RunRecord[], id: string) => list.findIndex((r) => r.id === id) + 1;

/** The run as it stands now, as a record. */
export function recordOf(game: Pick<Game, 'machine' | 'round' | 'mode' | 'runScore' | 'won' | 'decals' | 'placed' | 'layout'>, meta: RunMeta, result: RunResult, now = Date.now()): RunRecord {
  // a round cleared but not yet left still counts as cleared
  const cleared = Math.max(0, game.round - 1 + (game.mode === 'roundEnd' ? 1 : 0));
  return {
    id: meta.id, started: meta.started, ended: now, machine: game.machine, result: game.won ? 'won' : result,
    round: game.round, cleared, score: Math.round(game.runScore), best: Math.round(meta.best),
    decals: game.decals.map((d) => d.id),
    parts: game.placed.map((p) => ({ def: p.def, x: round2(p.x), y: round2(p.y), angle: round2(p.angle), ...(p.level ? { level: p.level } : {}) })),
    ledge: game.layout.ledge,
  };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "25 Oct" for this year, "25 Oct 2025" for older runs. */
export function shortDate(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const month = d.toLocaleString('en-GB', { month: 'short' });
  return `${d.getDate()} ${month}${d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

type Store = { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void };
type Source = Parameters<typeof recordOf>[0];

/** A run as the scoreboard sees it, from a save (while the game itself is busy with the attract table). */
export const sourceOfSave = (run: RunSave): Source => ({
  machine: run.machine ?? 'factory', round: run.round, mode: 'workshop', runScore: run.runScore ?? 0, won: !!run.won,
  decals: run.picks ?? [], placed: run.layout.parts.filter((p) => p.placed), layout: run.layout,
});

/** The scoreboard in storage, and the run in progress that will go on it. */
export class Scoreboard {
  records: RunRecord[];
  meta: RunMeta;

  constructor(private store: Store, hasRun: boolean) {
    this.records = parseRecords(store.get(RECORDS_KEY));
    this.meta = parseRunMeta(store.get(RUN_META_KEY)) ?? newRunMeta();
    if (hasRun) this.saveMeta(); // a save from before the scoreboard gets its id now
  }

  startRun() { this.meta = newRunMeta(); this.saveMeta(); }

  noteBest(score: number) {
    if (score <= this.meta.best) return;
    this.meta.best = score;
    this.saveMeta();
  }

  /** Put the run on the board as it stands (a run that was won stays won). Test Lab runs never count. */
  record(from: Source, result: RunResult, sandboxed: boolean) {
    if (sandboxed) return;
    const rec = recordOf(from, this.meta, result);
    if (rec.result === 'abandoned' && rec.cleared === 0 && rec.score === 0 && !this.records.some((r) => r.id === rec.id)) return; // nothing happened yet
    this.records = upsertRecord(this.records, rec);
    this.store.set(RECORDS_KEY, JSON.stringify(this.records));
  }

  /** The run is over: its record stands, and the run in progress is forgotten. */
  endRun() { this.store.del(RUN_META_KEY); }

  private saveMeta() { this.store.set(RUN_META_KEY, JSON.stringify(this.meta)); }
}
