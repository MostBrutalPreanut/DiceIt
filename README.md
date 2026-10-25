# Free Play (working title)

A rogue-lite where you **build, tune and rebuild a pinball machine** to hit a score goal with 3 balls. Balatro-style escalating goals, pinball-style spectacle, goofy tone. The scoring machine is the game; everything else supports it.

- Plan: [docs/game-plan.md](docs/game-plan.md)
- Genre research and sources: [docs/genre-research.md](docs/genre-research.md)
- What the physics spike measured: [docs/m0-physics-findings.md](docs/m0-physics-findings.md)
- Creative parts from real machines (with sources): [docs/parts-catalog.md](docs/parts-catalog.md)
- Run flow, major upgrades, rebalancing, board variety: [docs/run-flow-and-balance.md](docs/run-flow-and-balance.md)
- Art direction, themed machines, particles, with concept sheets: [docs/art-direction.md](docs/art-direction.md)
- How to build that look, phase by phase: [docs/art-implementation-plan.md](docs/art-implementation-plan.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

On first launch you pick a machine (Funhouse Factory, Short Order or Castle Crash); themes change looks only, and you can switch under **Machine**, where **Calm mode** also lives.

Controls: `←` left flippers, `→` right flippers (every flipper on that side), hold `Space` to charge the plunger and release to fire, `Z` `X` nudge left and right (too much tilts), `Tab` cash out once the goal is hit, `Enter` play the round from the workshop, `M` mute. The controls for the current mode are always in one line under the table.

The loop is **Play → Shop → Place**, then play again; the scoreboard says which half you are in (PLAY or BUILD), and its big button is PLAY ROUND while you build and CASH OUT while you play. The toolbox holds four parts: buying stops when it is full, and a part stored in a full toolbox is sold for half its price. After every boss (rounds 3, 6, 9, ...) pick one of three major upgrades or skip for $4; Play Round is locked until you do. Buy parts in the shop, click one in your toolbox and click the table to place it. Drag a part to move it, drag it onto the toolbox to take it off the board, `R` (or the mouse wheel) rotates, `Del` stores it, `Space` fires a test ball. Hover any part to see exactly how it scores. Rules upgrades are relic decals stuck on the apron (four slots); click one between rounds to peel it off. Under **Machine & options**, tick **Test Lab** to get every part for free plus lab tools. `Ctrl+Z` / `Ctrl+Y` undo and redo.

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
src/game/     scoring (points × Mult, recipes, ledger), the run state (shop, inventory, rounds, upgrades) and the auto-builder
src/data/     content as data: parts (recipes, dials, descriptions), upgrades, the goal table, announcer lines
src/ui/       small HTML builders for the cards and tooltips
src/render/   PixiJS renderer (reads the sim, never writes it): theme kits, projection, baked props, particles, the HUD overlay
src/assets/   bundled fonts (Luckiest Guy, Nunito, DotGothic16) with their licences
tools/        stress/fuzz runners, the par player and balance table, browser smoke test
tests/        vitest
```

Notes: phaser-box2d can only ever create 32 worlds per process, so the sim reuses one world (`createSim`, never `new Sim`). See the findings doc.
