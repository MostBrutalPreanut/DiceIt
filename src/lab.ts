// The prop lab (dev page, /lab.html): every part in every theme and state, drawn by the same code the game
// bakes its textures with, on the theme's floor, with the collision footprint over it. The parts sheet, live.
import { Application, Container, Graphics } from 'pixi.js';
import './style.css';
import { footprint, PART_IDS, PARTS, type PartId } from './data/parts';
import { flat, label, P, ring, box, type View } from './render/draw';
import { drawFlipper, drawPart, type PartState } from './render/props';
import { THEMES } from './render/theme';

/** The states worth seeing per part: idle first, then whatever it can light, drop or say. */
const STATES: Partial<Record<PartId, [string, PartState][]>> = {
  pop: [['idle', {}], ['hit', { hit: true }]],
  coin: [['idle', {}], ['hit', { hit: true }]],
  mega: [['idle', {}], ['oof', { hit: true }]],
  sling: [['idle', {}], ['hit', { hit: true }]],
  spinner: [['idle', {}], ['turning', { spin: 3 }]],
  lane: [['dark', { letter: 'A' }], ['lit', { letter: 'A', lit: true }]],
  uplight: [['dark', { target: 'pop' }], ['lit', { target: 'pop', lit: true }], ['Big Boi', { target: 'mega', lit: true }]],
  lamp: [['dark', {}], ['lit', { lit: true }]],
  bank: [['up', {}], ['one down', { down: [false, true, false] }]],
  printer: [['idle', {}], ['busy', { busy: true }]],
  kickback: [['armed', {}], ['fired', { armed: false }]],
  saver: [['ready', {}], ['spent', { armed: false }]],
  vari: [['idle', {}], ['tier 2', { seg: 2 }], ['smash', { seg: 4 }]],
};
const ANGLE: Partial<Record<PartId, number>> = { sling: -0.55, spinner: 0.3, deflector: 0.4, bank: 0.15, vari: 0.2, kickback: -0.5, printer: 0.3 };

async function main() {
  await Promise.race([Promise.all(['400 20px "Luckiest Guy"', '700 14px Nunito'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2000))]);
  const cells = PART_IDS.flatMap((id) => (STATES[id] ?? [['idle', {}]]).map(([name, st]) => ({ id, name, st })));
  const cols = 8, cw = 150, ch = 150, head = 44;
  const W = cols * cw + 20, rowsPer = Math.ceil(cells.length / cols), H = THEMES.length * (head + rowsPer * ch + 16);
  const app = new Application();
  await app.init({ width: W, height: H, background: '#efe8dc', antialias: true, resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true });
  document.getElementById('lab')!.appendChild(app.canvas);
  const root = new Container();
  app.stage.addChild(root);
  const foot = document.getElementById('foot') as HTMLInputElement, tip = document.getElementById('tip') as HTMLInputElement;

  const draw = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    const k = Number(tip.value);
    document.getElementById('tipv')!.textContent = k.toFixed(2);
    THEMES.forEach((t, ti) => {
      const y0 = ti * (head + rowsPer * ch + 16);
      const band = new Graphics().roundRect(4, y0 + 4, W - 8, head + rowsPer * ch + 4, 18).fill(t.bg).stroke({ width: 3, color: t.ink });
      root.addChild(band);
      const title = label(t.tagline, 24, t.paper, { stroke: t.ink, strokeW: 5 });
      title.anchor.set(0, 0.5);
      title.position.set(20, y0 + head / 2 + 4);
      root.addChild(title);
      cells.forEach((c, i) => {
        const x = 10 + (i % cols) * cw, y = y0 + head + Math.floor(i / cols) * ch;
        const g = new Graphics().roundRect(x + 4, y + 4, cw - 8, ch - 8, 14).fill(t.floor).stroke({ width: 2.5, color: t.ink });
        root.addChild(g);
        const S = 17, v: View = { S, ox: x + cw / 2, oy: y + ch * 0.66, k, kz: 0.3 + 0.3 * Math.min(1, (1 - k) / 0.14), shx: 0, lw: S * 0.14 };
        const a = ANGLE[c.id] ?? 0;
        if (c.id === 'flipper') { const fg = new Graphics(); drawFlipper(fg, { ...v, ox: v.ox - 2 * S }, t, 0, 0, -0.49, 1); root.addChild(fg); }
        else root.addChild(drawPart(v, t, c.id, 0, 0, a, { letter: t.laneWord[0], ...c.st }));
        if (foot.checked) {
          const def = PARTS[c.id], fo = new Graphics();
          const shape = def.shape.type === 'circle' ? ring(0, 0, def.shape.r, 40) : box(0, 0, def.shape.hw, def.shape.hh, a);
          fo.poly(flat(shape.map(([px, py]) => P(v, px, py)))).stroke({ width: 1.5, color: t.accent, alpha: 0.9 });
          fo.poly(flat(ring(0, 0, footprint(def), 40).map(([px, py]) => P(v, px, py)))).stroke({ width: 1, color: t.ink, alpha: 0.35 });
          root.addChild(fo);
        }
        const name = label(`${PARTS[c.id].name}${c.name !== 'idle' ? ` · ${c.name}` : ''}`, 12, t.ink, { face: 'ui', weight: '800' });
        name.position.set(x + cw / 2, y + ch - 18);
        root.addChild(name);
      });
    });
  };
  foot.onchange = draw;
  tip.oninput = draw;
  draw();
}
void main();
