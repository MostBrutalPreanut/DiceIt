import { describe, dialFactor, dialValue, grownPoints, MAX_LEVEL, modFactor, PARTS, type DescribeCtx, type PartDef, type PartInstance, type PartKind } from '../data/parts';
import type { Mods } from '../data/mods';
import { UPGRADES, type UpgradeId } from '../data/upgrades';
import type { Scorer } from '../game/scoring';

export const fmt = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n).toLocaleString('en-US');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const num = (n: number) => (Math.round(n * 100) / 100).toString();

/** The part's colour as CSS: its theme role colour (filled), and the version that is safe as a thin bar. */
export const roleVar = (id: string) => `var(--role-${id}-fill)`;
export const barVar = (id: string) => `var(--role-${id}-line)`;

/** The part's recipe in sentences. Same data the scorer uses, so it cannot disagree with the game. */
export function descHtml(def: PartDef, inst?: PartInstance, ctx: DescribeCtx = {}): string {
  return `<ul class="desc" style="--bar:${barVar(def.id)}">${describe(def, inst, ctx).map((l) => `<li class="t-${l.tag}">${l.text}</li>`).join('')}</ul>`;
}

export function dot(def: PartDef) {
  return `<i class="dot" style="background:${roleVar(def.id)}"></i>`;
}

const KIND: Record<PartKind, string> = {
  bumper: 'Bumper', kicker: 'Kicker', deflector: 'Rail', spinner: 'Spinner', rollover: 'Rollover', saucer: 'Saucer', flipper: 'Flipper',
  lamp: 'Lamp', bank: 'Targets', kickback: 'Kickback', saver: 'Saver', target: 'Target',
};

/** The level chip: nothing until a part type has levelled up, then LVL 2, and MAX LVL at the top. */
export const levelText = (level: number) => (level >= MAX_LEVEL ? 'MAX LVL' : level > 0 ? `LVL ${level}` : '');

/** The header every card shares: the name in the display face on the part's colour, a kind chip, and the level once it has one. */
function head(def: PartDef, level: number) {
  const lv = def.recipe.perLevel ? levelText(level) : '';
  return `<div class="head"><h4>${def.name}</h4><span class="kind">${KIND[def.kind]}</span>${lv ? `<span class="lvl">${lv}</span>` : ''}</div>`;
}

export interface TipCtx {
  level: number;
  mods: Mods;
  /** Live numbers (a part on the board): the scorer and the current Mult. */
  scorer?: Scorer;
  mult?: number;
}

/**
 * The tooltip's fixed anatomy (art-direction §6): header, the next-hit number, the math as chips
 * (cross-part effects as their own chip), the recipe, this round, the dial with its trade-off, controls.
 */
export function partCard(def: PartDef, inst: PartInstance | undefined, c: TipCtx, opts: { keys?: string; blurb?: boolean; stats?: string; dial?: boolean; recipe?: boolean } = {}): string {
  const r = def.recipe;
  const level = r.perLevel ? c.level : 0;
  const lvl = (r.perLevel ?? 0) * level;
  const o: string[] = [head(def, level)];
  if (opts.blurb) o.push(`<div class="blurb">${def.blurb}</div>`);
  if (r.points) {
    const live = !!(c.scorer && inst?.placed);
    const grown = live ? grownPoints(r, c.scorer!.hitsOf(def.id)) : 0;
    const lamp = live ? c.scorer!.lampBonusAt(inst!).sum : 0;
    const dial = inst ? dialFactor(inst) : 1;
    const upg = modFactor(def.id, c.mods);
    const mult = live ? c.mult ?? 1 : 1;
    const base = live ? c.scorer!.baseNow(inst!)! : Math.round((r.points + lvl) * dial * upg);
    const tiers = r.tiers;
    const per = r.per ?? 'hit';
    const pays = (b: number) => Math.round(b * mult);
    const top = tiers ? tiers[tiers.length - 1].x : 1;
    const now = tiers ? `${pays(base)}–${pays(base * top)}` : String(pays(base));
    o.push(`<div class="now">${live ? `Next ${per} pays ${now}` : `Pays ${now} per ${per}`}</div>`);
    const chips: [string, string][] = [[String(r.points + lvl), 'base']];
    if (grown) chips.push([`+${grown}`, 'grown this ball']);
    if (Math.abs(dial - 1) > 0.001) chips.push([`×${num(dial)}`, 'dial']);
    if (Math.abs(upg - 1) > 0.001) chips.push([`×${num(upg)}`, 'upgrades']);
    if (tiers) chips.push([`×1–${top}`, 'hit tier']);
    if (lamp) chips.push([`+${Math.round(lamp * 100)}%`, 'Lamp glow']);
    if (live) chips.push([`×${(c.mult ?? 1).toFixed(2)}`, 'your Mult']);
    o.push(`<div class="chips">${chips.slice(0, 5).map(([v, l]) => `<span><b>${v}</b><small>${l}</small></span>`).join('')}</div>`);
  }
  if (opts.recipe !== false) o.push(descHtml(def, inst, { level: c.level, mods: c.mods }));
  if (opts.stats) o.push(`<div class="stats">${opts.stats}</div>`);
  if (opts.dial) {
    const d = def.dials[0];
    if (d) {
      const v = inst ? dialValue(inst, d.id) : d.default;
      const frac = (v - d.min) / (d.max - d.min || 1);
      o.push(`<div class="dialrow"><b>${d.label}</b><div class="track"><i class="knob" style="left:${(frac * 100).toFixed(1)}%"></i></div><div class="ends"><span>${d.ends[0]}</span><span>${d.ends[1]}</span></div></div>`);
    }
  }
  if (opts.keys) o.push(`<div class="keys">${opts.keys}</div>`);
  return o.join('');
}

/** "This round: 12 hits · 3,150 pts · Mult +1.2" */
export function statsLine(row?: { hits: number; points: number; multAdded: number; money: number }) {
  if (!row) return 'Not hit yet this round.';
  const out = [`${row.hits} hit${row.hits === 1 ? '' : 's'}`, `${fmt(row.points)} pts`];
  if (row.multAdded) out.push(`Mult +${num(row.multAdded)}`);
  if (row.money) out.push(`$${row.money}`);
  return `This round: ${out.join(' · ')}`;
}

/** A relic decal's card: the same anatomy as a part's, from the upgrade's own row. */
export function decalCard(id: UpgradeId, color: string, peelable: boolean): string {
  const d = UPGRADES[id];
  const rar = d.rarity === 'legendary' ? 'Wild' : d.rarity === 'rare' ? 'Rare' : 'Common';
  return `<div class="head" style="--head:${color}"><h4>${esc(d.name)}</h4><span class="kind">${rar} decal</span></div>
    <ul class="desc" style="--bar:${color}"><li>${esc(d.text())}</li><li class="t-note">A run-long rule, stuck on the apron. It works from the moment you stick it.</li></ul>
    <div class="keys">${peelable ? 'click it to peel it off between rounds · a peeled decal is gone' : 'peel it off between rounds to free the slot'}</div>`;
}

/** The short explanations behind the scoreboard's numbers. */
export const HUD_TIPS: Record<string, string> = {
  score: '<b>Score</b>: every hit adds its points × your Mult. Hover any part to see exactly what its next hit pays.',
  goal: '<b>Goal</b>: reach it before your balls run out to clear the round. Cash out (Tab) once it is hit, or keep playing for overshoot money.',
  mult: '<b>Mult</b>: multiplies every hit. It starts each ball at ×1.00 (plus any Head Start), Big Boi and completed sets raise it, and it resets when the ball ends.',
  balls: '<b>Balls</b>: the balls left this round. Each ball lasts until it drains or its clock runs out; a Ball Printer adds balls to the table, not to this count.',
  money: '<b>Money</b>: spend it in the shop between rounds. Cha-Ching Bumpers pay coins during play (they land here), and every unused ball pays when you clear a round.',
  tilt: '<b>Tilt</b>: every nudge fills it and it drains slowly. Fill it and the machine tilts: lights out, flippers dead, the ball drains.',
  map: '<b>The run</b>: fifteen rounds on the path, a boss every third (the big stops). The lit stop is where you are.',
  ledger: '<b>This round</b>: every point of the round, by the part type that scored it ($ is coins paid). Hover a part on the table for its own numbers.',
  clock: '<b>Ball clock</b>: one clock per ball (with every ball it turns into). When it runs out the ball ends.',
};
