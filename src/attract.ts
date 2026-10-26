// Attract mode: behind the main menu a demo machine plays itself, the way a real cabinet does on the arcade
// floor. It borrows the one Game (the sim is a single shared world), so it never saves: the player's run
// stays in storage and is loaded back when they resume. Each demo game is on the next machine.
import { PARTS, type PartId } from './data/parts';
import type { MachineId } from './data/bigboi';
import type { Game } from './game/game';
import type { ScoreEvent } from './game/scoring';
import { Bot } from './sim/bot';
import { DT } from './sim/constants';

/** The demo build: the starter machine plus a handful of parts, roughly the concept art's mid-run table. */
export const DEMO_BUILD: { id: PartId; x: number; y: number; a?: number }[] = [
  { id: 'coin', x: 18.6, y: 33.6 }, { id: 'coin', x: 5.6, y: 35.4 },
  { id: 'printer', x: 19.8, y: 39.6 },
  { id: 'lamp', x: 15.6, y: 29.6 },
  { id: 'uplight', x: 3.4, y: 25.4 }, { id: 'uplight', x: 7.6, y: 27.6 },
  { id: 'spinner', x: 20.4, y: 24.9, a: 1.35 },
  { id: 'bank', x: 12, y: 22.4 },
  { id: 'sling', x: 4.4, y: 17.6, a: -1.05 }, { id: 'sling', x: 19.6, y: 17.6, a: 1.05 },
];
const DEMO_MACHINES: MachineId[] = ['factory', 'diner', 'castle'];

/** Put the demo build on the game's table (the Test Lab places parts for free; it is switched off again). */
export function buildDemo(game: Game, machine: MachineId) {
  game.newRun(machine);
  const lab = game.sandbox;
  game.sandbox = true;
  for (const q of DEMO_BUILD) {
    const p = game.grantAndPlace(q.id, q.x, q.y);
    if (p && q.a && PARTS[q.id].rotatable) game.rotate(p.uid, q.a);
  }
  game.sandbox = lab;
  game.goalOverride = Infinity; // every ball is played out; nothing is ever cashed
}

export class Attract {
  on = false;
  private bot = new Bot(11, 0.92);
  private acc = 0;
  private rest = 0;
  private machine = 0;

  constructor(private game: Game, private hooks: { score(s: ScoreEvent): void; machine(id: MachineId): void; gameOver(): void }) {}

  /** Start the demo on this machine (or the next one in turn). */
  start(machine?: MachineId) {
    if (machine) this.machine = Math.max(0, DEMO_MACHINES.indexOf(machine));
    this.on = true;
    this.deal();
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    this.game.goalOverride = null;
  }

  get machineId() { return DEMO_MACHINES[this.machine]; }

  private deal() {
    const id = DEMO_MACHINES[this.machine];
    buildDemo(this.game, id);
    this.hooks.machine(id);
    this.bot = new Bot(this.game.seed, 0.92);
    this.game.startRound();
    this.acc = 0;
    this.rest = 0;
  }

  /** Real time passes: the bot plays, and three seconds after the last ball the next machine is dealt. */
  step(dt: number) {
    if (!this.on) return;
    const g = this.game;
    if (g.mode === 'runOver' || g.mode === 'roundEnd') {
      if ((this.rest += dt) > 3) { this.machine = (this.machine + 1) % DEMO_MACHINES.length; this.deal(); }
      return;
    }
    this.acc += Math.min(dt, 0.05);
    for (let n = 0; this.acc >= DT && n < 24; n++) {
      this.acc -= DT;
      const res = g.step(this.bot.decide(g.sim));
      for (const s of res.score) this.hooks.score(s);
      if (res.game.some((e) => e.type === 'runOver')) this.hooks.gameOver();
    }
  }
}
