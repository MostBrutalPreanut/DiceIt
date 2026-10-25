import { describe, PARTS, type DescribeCtx, type PartDef, type PartInstance } from '../data/parts';
import type { LedgerRow } from '../game/scoring';

export const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

export const fmt = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n).toLocaleString('en-US');

/** The part's recipe in sentences. Same data the scorer uses, so it cannot disagree with the game. */
export function descHtml(def: PartDef, inst?: PartInstance, ctx: DescribeCtx = {}): string {
  return `<ul class="desc">${describe(def, inst, ctx).map((l) => `<li class="t-${l.tag}">${l.text}</li>`).join('')}</ul>`;
}

export function dot(def: PartDef) {
  return `<i class="dot" style="color:${css(def.color)}"></i>`;
}

/** Floating card shown when hovering a part on the board. */
export function tipHtml(inst: PartInstance, live: { label: string | null; row?: LedgerRow; ctx?: DescribeCtx }): string {
  const def = PARTS[inst.def];
  const lines = [] as string[];
  if (live.label) lines.push(`Pays right now: <b>${live.label}</b>`);
  if (live.row) lines.push(`This round: ${live.row.hits} hits, ${fmt(live.row.points)} points`);
  return `<h4>${dot(def)}${def.name}</h4>${descHtml(def, inst, live.ctx)}${lines.length ? `<div class="live">${lines.join('<br>')}</div>` : ''}`;
}
