// The Library screen (opened from the main menu and the pause menu): every part and decal in the game, the ones
// you have found in full colour and the rest as silhouettes with ??? for a name. The Menu owns the screen; this
// draws it and keeps its own state (the tab, the rarity filter, the picked entry).
import { BIG_BOIS, BIG_BOI_FOR, defOn, type MachineId } from '../data/bigboi';
import { DECALS, KIND_NAMES, type DecalId } from '../data/decals';
import { decalIsNew, decalKnown, LIBRARY_DECALS, LIBRARY_PARTS, partIsNew, partKnown, progress, type Library, type Progress } from '../data/library';
import { neutralMods } from '../data/mods';
import { PARTS, RARITIES, RARITY_NAMES, type PartId, type Rarity } from '../data/parts';
import { THEMES } from '../render/theme';
import { decalCard, partCard, rarityChip, roleVar } from './html';

export type LibTab = 'parts' | 'decals';
export type LibIconKind = 'part' | 'decal' | 'boi';

export interface LibraryHooks {
  library(): Library;
  /**
   * A baked picture for a Library entry (data URL): in colour, or the locked silhouette with its hint. With
   * `cachedOnly`, '' unless it is baked already (the shelves fill in their pictures a few a frame).
   */
  icon(kind: LibIconKind, id: string, locked: boolean, cachedOnly?: boolean): string;
  /** The machine the menus are wearing (Big Boi's recipe and look on the cards). */
  machine(): MachineId;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const KIND_LABEL: Partial<Record<string, string>> = { inlay: 'Gem', decor: 'Decor', strip: 'Floor light', deflector: 'Rail', bank: 'Targets' };
const kindName = (id: PartId) => KIND_LABEL[PARTS[id].kind] ?? PARTS[id].kind[0].toUpperCase() + PARTS[id].kind.slice(1);
/** A clear pixel: the picture is still being baked. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const bar = (p: Progress) => `<span class="lbbar" role="img" aria-label="${p.known} of ${p.total} found"><i style="width:${p.total ? (100 * p.known) / p.total : 0}%"></i></span>`;

export class LibraryView {
  tab: LibTab = 'parts';
  filter: Rarity | 'all' = 'all';
  /** The entry in the detail panel: 'part:tesla', 'decal:lucky', 'boi:castle'. */
  picked: string | null = null;
  /** Found after this moment wears NEW (the Library's `seen` when the screen opened, so the badges last the visit). */
  private seenAt = 0;
  private pump = 0;

  constructor(private hooks: LibraryHooks) {}

  /** The screen opens: remember what counts as new for this visit. */
  open() {
    this.seenAt = this.hooks.library().seen;
    this.picked = null;
  }

  html(back: string): string {
    const lib = this.hooks.library(), pr = progress(lib);
    const all = pr.parts.known + pr.decals.known + 3, total = pr.parts.total + pr.decals.total + 3;
    const tab = (id: LibTab, name: string, p: Progress) => `<button data-libtab="${id}" class="${this.tab === id ? 'on' : ''}" aria-pressed="${this.tab === id}">${name} <small>${p.known}/${p.total}</small></button>`;
    const chip = (r: Rarity | 'all') => `<button data-libr="${r}" class="${this.filter === r ? 'on' : ''} ${r === 'all' ? '' : `r-${r}`}" aria-pressed="${this.filter === r}">${r === 'all' ? 'All' : RARITY_NAMES[r]}</button>`;
    return `<section class="mscreen">
      <header class="mhead">${back}<div><h2 class="disp">Library</h2><p>Every part and decal in the game. Buy a part, or stick a decal on your apron, and it shows up here for good. Until then it is a shadow with a hint.</p></div>
        <div class="lbtotal"><b class="disp">${all}<small>/${total}</small></b><span>found</span>${bar({ known: all, total })}</div></header>
      <div class="lbtools">
        <span class="seg lbtabs" role="group" aria-label="Library shelf">${tab('parts', 'Parts', { known: pr.parts.known + 3, total: pr.parts.total + 3 })}${tab('decals', 'Decals', pr.decals)}</span>
        <span class="seg lbrar" role="group" aria-label="Rarity">${chip('all')}${RARITIES.map(chip).join('')}</span>
      </div>
      <div class="lbwrap"><div class="lbshelves">${this.shelves(lib)}</div><div class="lbdetail card tipcard" id="lbDetail" aria-live="polite"></div></div>
    </section>`;
  }

  private shelves(lib: Library): string {
    const pr = progress(lib).byRarity[this.tab];
    const out: string[] = [];
    if (this.tab === 'parts' && this.filter === 'all') {
      const bois = THEMES.map((t) => this.card(`boi:${t.id}`, BIG_BOIS[BIG_BOI_FOR[t.id]].title, 'legendary', true, false, ['boi', t.id, false], `var(--role-mega-tint)`)).join('');
      out.push(`<section class="lbshelf"><h3 class="disp">Big Bois <small>3/3</small></h3><p class="lbnote">One in the middle of every machine. Not for sale.</p><div class="lbgrid">${bois}</div></section>`);
    }
    for (const r of RARITIES) {
      if (this.filter !== 'all' && this.filter !== r) continue;
      const cards = this.tab === 'parts'
        ? LIBRARY_PARTS.filter((id) => PARTS[id].rarity === r).map((id) => {
          const known = partKnown(lib, id);
          return this.card(`part:${id}`, PARTS[id].name, r, known, known && partIsNew({ ...lib, seen: this.seenAt }, id), ['part', id, !known], known ? `var(--role-${id}-tint)` : '');
        })
        : LIBRARY_DECALS.filter((id) => DECALS[id].rarity === r).map((id) => {
          const known = decalKnown(lib, id);
          return this.card(`decal:${id}`, DECALS[id].name, r, known, known && decalIsNew({ ...lib, seen: this.seenAt }, id), ['decal', id, !known], '');
        });
      if (!cards.length) continue;
      out.push(`<section class="lbshelf r-${r}"><h3 class="disp">${RARITY_NAMES[r]} <small>${pr[r].known}/${pr[r].total}</small>${bar(pr[r])}</h3><div class="lbgrid">${cards.join('')}</div></section>`);
    }
    return out.join('');
  }

  private card(key: string, name: string, r: Rarity, known: boolean, isNew: boolean, icon: [LibIconKind, string, boolean], tint: string): string {
    const src = this.hooks.icon(...icon, true);
    return `<button class="lbcard r-${r} ${known ? '' : 'locked'}" data-lib="${key}" aria-label="${known ? esc(name) : `Not found yet: a ${RARITY_NAMES[r].toLowerCase()} ${key.startsWith('decal') ? 'decal' : 'part'}`}">
      <span class="lbplinth" ${tint ? `style="background:${tint}"` : ''}><img alt="" src="${src || BLANK}"${src ? '' : ` data-icon="${icon.join('|')}"`}></span>
      <span class="lbname">${known ? esc(name) : '???'}</span>${isNew ? '<span class="new">NEW</span>' : ''}</button>`;
  }

  /** The detail panel: the full card of a found entry, or the silhouette and what it takes to find it. */
  detail(root: HTMLElement, key: string) {
    const box = root.querySelector<HTMLElement>('#lbDetail');
    if (!box) return;
    this.picked = key;
    for (const b of root.querySelectorAll<HTMLElement>('.lbcard')) b.classList.toggle('on', b.dataset.lib === key);
    const lib = this.hooks.library();
    const [kind, id] = key.split(':') as [LibIconKind, string];
    const machine = this.hooks.machine();
    let head = '', body = '', icon = '', locked = false;
    box.style.removeProperty('--head');
    if (kind === 'boi') {
      const m = id as MachineId, bb = BIG_BOIS[BIG_BOI_FOR[m]];
      icon = this.hooks.icon('boi', m, false);
      box.style.setProperty('--head', roleVar('mega'));
      body = partCard(defOn('mega', m), undefined, { level: 0, mods: neutralMods(), machine: m }, { blurb: true })
        + `<div class="keys">${esc(THEMES.find((t) => t.id === m)?.tagline ?? '')} · always in the middle of the table</div>`;
      head = bb.title;
    } else if (kind === 'part') {
      const pid = id as PartId, def = PARTS[pid], known = partKnown(lib, pid);
      locked = !known;
      icon = this.hooks.icon('part', pid, !known);
      if (known) {
        box.style.setProperty('--head', roleVar(pid));
        const where = def.weight === 0 ? 'Comes with every machine' : `$${def.cost} in the shop${def.pack && def.pack > 1 ? ` (a pack of ${def.pack})` : ''}${def.from ? `, from round ${def.from}` : ''}`;
        const found = lib.parts[pid] ? ` · found ${new Date(lib.parts[pid]!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : '';
        body = partCard(defOn(pid, machine), undefined, { level: 0, mods: neutralMods(), machine }, { blurb: true }) + `<div class="keys">${where}${found}</div>`;
      } else {
        body = this.lockedCard(kindName(pid), def.rarity, def.from
          ? `Not found yet. Gems turn up in the shop from round ${def.from}: buy one to add it here.`
          : 'Not found yet. Buy one in the shop (or win it) to add it here.');
      }
      head = known ? def.name : '???';
    } else {
      const did = id as DecalId, d = DECALS[did], known = decalKnown(lib, did);
      locked = !known;
      icon = this.hooks.icon('decal', did, !known);
      body = known
        ? decalCard({ id: did }, null)
        : this.lockedCard(`${KIND_NAMES[d.kind]} decal`, d.rarity, `Not found yet. Beat a boss and stick it on your apron to add it here.${d.rarity === 'legendary' ? ' Legendary decals are only offered from the second boss on.' : ''}`);
      head = known ? d.name : '???';
    }
    box.classList.toggle('locked', locked);
    box.innerHTML = `<div class="lbbig ${kind === 'decal' ? 'decal' : ''}"><img alt="${esc(head)}" src="${icon}"></div>${body}`;
  }

  private lockedCard(kind: string, r: Rarity, how: string) {
    return `<div class="head" style="--head:var(--paper-dim)"><h4>???</h4><span class="kind">${esc(kind)}</span></div>
      <div class="tags">${rarityChip(r)}</div>
      <ul class="desc"><li>??? ??? ???</li><li class="t-note">${esc(how)}</li></ul>`;
  }

  /** Bake the shelves' missing pictures a few a frame, top to bottom, so the screen opens at once. */
  private fill(root: HTMLElement) {
    cancelAnimationFrame(this.pump);
    const todo = [...root.querySelectorAll<HTMLImageElement>('img[data-icon]')];
    const step = () => {
      const t0 = performance.now();
      while (todo.length && performance.now() - t0 < 12) {
        const img = todo.shift()!;
        if (!img.isConnected) { todo.length = 0; return; } // the screen was redrawn: its own pump takes over
        const [kind, id, locked] = img.dataset.icon!.split('|');
        img.src = this.hooks.icon(kind as LibIconKind, id, locked === 'true');
        img.removeAttribute('data-icon');
      }
      if (todo.length) this.pump = requestAnimationFrame(step);
    };
    this.pump = requestAnimationFrame(step);
  }

  bind(root: HTMLElement, rerender: () => void) {
    const cards = [...root.querySelectorAll<HTMLButtonElement>('.lbcard')];
    const narrow = matchMedia('(max-width: 1000px)');
    for (const b of cards) {
      const show = () => this.detail(root, b.dataset.lib!);
      // on a phone the card sits above the shelves: a tap brings it into view
      b.onclick = () => { show(); if (narrow.matches) root.querySelector('#lbDetail')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
      b.onfocus = show;
      b.onmouseenter = show;
    }
    this.fill(root);
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-libtab]')) b.onclick = () => { this.tab = b.dataset.libtab as LibTab; this.picked = null; rerender(); };
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-libr]')) b.onclick = () => { this.filter = b.dataset.libr as Rarity | 'all'; rerender(); };
    const keep = this.picked && cards.find((b) => b.dataset.lib === this.picked);
    const first = keep ?? cards.find((b) => !b.classList.contains('locked') && !b.dataset.lib!.startsWith('boi')) ?? cards[0];
    if (first) this.detail(root, first.dataset.lib!);
  }
}
