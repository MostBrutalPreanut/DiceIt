# BIG BOI <sub>PINBALL DESIGNER</sub>

A rogue-lite where you **build, tune and rebuild a pinball machine** to hit a score goal with 3 balls. Balatro-style escalating goals, pinball-style spectacle, goofy tone. The scoring machine is the game; everything else supports it.

- Plan: [docs/game-plan.md](docs/game-plan.md)
- Genre research and sources: [docs/genre-research.md](docs/genre-research.md)
- What the physics spike measured: [docs/m0-physics-findings.md](docs/m0-physics-findings.md)
- Creative parts from real machines (with sources): [docs/parts-catalog.md](docs/parts-catalog.md)
- Parts borrowed from Ballionaire, Peglin, Peggle, other pinball and arcade roguelites, video pinball and real machines (mayhem, scaling, late game): [docs/borrowed-parts.md](docs/borrowed-parts.md)
- Run flow, major upgrades, rebalancing, board variety: [docs/run-flow-and-balance.md](docs/run-flow-and-balance.md)
- Art direction, themed machines, particles, with concept sheets: [docs/art-direction.md](docs/art-direction.md)
- How to build that look, phase by phase: [docs/art-implementation-plan.md](docs/art-implementation-plan.md)
- Rarities, decals, bosses, the three Big Bois, and the balance plan (1,000 to millions): [docs/balance-plan.md](docs/balance-plan.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

The game opens on the **main menu**, with a demo machine playing itself behind it (attract mode): **New Game**, **Resume** (the run saved on this device, if there is one), **Scoreboard** and **Settings**. Every run starts with picking a machine (Funhouse Factory, Short Order or Castle Crash), shown as its full cabinet. The machine stays for the run: it sets the look and decides what its **Big Boi** does (the Factory's Foreman raises the Mult, the Diner's Cook calls orders that pay triple, the Castle's Dragon pays a jackpot when his armour is knocked off). **Settings** (saved on this device, used at once): music and sound volume, graphics quality (Low draws at 1x without debris, smoke or glow), Calm mode, and the three play buttons, which can be rebound. The **Scoreboard** keeps every finished run (won, lost or abandoned) with its rounds, points, best round, decals and a picture of the machine it ended as.

Controls: `←` left flippers, `→` right flippers (every flipper on that side), hold `Space` to charge the plunger and release to fire, `Z` `X` nudge left and right (too much tilts), `Tab` cash out once the goal is hit, `Enter` play the round from the workshop, `M` mute, `Esc` pause (Resume, Settings, Quit to Main Menu, which keeps the run saved, or Abandon Run). The flipper and plunger keys can be changed under Settings. The controls for the current mode are always in one line under the table.

The loop is play a round, then the **Workshop** (buy and place parts), then play again; the scoreboard's title says which (PLAY or WORKSHOP), its map shows the run's fifteen rounds (every third a boss, the final boss in round 15, named in advance under the map), and its big button is PLAY ROUND in the workshop and CASH OUT while you play. Every machine starts with three Pop Bumpers and one Big Boi in the middle: he is not for sale, cannot be moved, and watches the ball. Parts come in four rarities (common, uncommon, rare, legendary); the rarer ones start to appear later in the run and are bigger and stronger. **Lock** a shop offer and it waits for you next round. The **wall ledge** on the left (the ball stopper) moves to a new spot every run, and you can drag it up and down the wall. Drag an offer, or click it to pick it up, then drop it on the table (bought and placed in one go) or on the toolbox; nothing is paid until it is dropped, and a right-click or `Esc` puts it back. Buy puts it straight in the toolbox. Parts on the table work the same way: drag them, or click to pick one up and click again to set it down. The toolbox holds four parts: buying stops when it is full, and a part stored in a full toolbox is sold for half its price. After every boss (rounds 3, 6, 9, ...) pick one of three **decals** or skip for $4; Play Round is locked until you do. Buy parts in the shop, click one in your toolbox and click the table to place it. Drag a part to move it, drag it onto the toolbox to take it off the board, `R` (or the mouse wheel) rotates, `Del` stores it, `Space` fires a test ball. Hover any part to see exactly how it scores. Decals are run-long rules stuck on the apron (four slots, one per boss before the final); click one between rounds to peel it off. Under **Machine & options**, tick **Test Lab** to get every part for free plus lab tools. `Ctrl+Z` / `Ctrl+Y` undo and redo.

## Check it

```bash
npm test                  # sim, scoring, economy, every part's physics, launch spread, stress + fuzz (headless)
npm run typecheck
npm run build && npx vite preview --port 4173 &
npm run smoke -- ./shots  # drives the built game in headless Chromium
npm run physics-report    # tunnelling rate per timestep, escape fuzz
npm run balance           # the balance table: par machines play whole runs, the goal curve, economy, pacing (about 30 min)
npm run balance -- --quick     # a rough look in a couple of minutes
npm run balance -- --write     # also regenerate src/data/goals.ts, the goal for every round
npm run balance -- --verify --seed-base=10   # judge fresh par machines against the goals now in the game
npm run balance -- --cache=par.json          # keep the par runs, so a report can be re-read without the long run
npx vite-node tools/explain.ts report.json 6  # replay one measured round and see where its score came from
npm run clears            # the old quick check: how often the starter machine clears round 1
npx vite-node tools/launch-spread.ts   # where do launched balls land?
npm run concept           # re-render the concept sheets in docs/concept from the real table and parts
# prop lab (dev page): every part in every theme and state, with its footprint: http://localhost:5173/lab.html
```

## Layout

```
src/sim/      deterministic Box2D simulation (runs headless in Node); nothing about scoring or drawing
src/game/     scoring (points × Mult, recipes, ledger), the run state (shop, inventory, rounds, decals, bosses) and the auto-builder
src/data/     content as data: parts (rarities, recipes, dials, descriptions), Big Bois, decals, bosses, the goal table, announcer lines
src/ui/       small HTML builders for the cards and tooltips
src/render/   PixiJS renderer (reads the sim, never writes it): theme kits, projection, baked props, particles, the HUD overlay
src/assets/   bundled fonts (Luckiest Guy, Nunito, DotGothic16) with their licences
tools/        stress/fuzz runners, the par player and balance table, browser smoke test
tests/        vitest
```

Notes: phaser-box2d can only ever create 32 worlds per process, so the sim reuses one world (`createSim`, never `new Sim`). See the findings doc.
