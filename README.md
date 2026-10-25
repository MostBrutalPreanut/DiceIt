# Free Play (working title)

A rogue-lite where you **build, tune and rebuild a pinball machine** to hit a score goal with 3 balls. Balatro-style escalating goals, pinball-style spectacle, goofy tone. The scoring machine is the game; everything else supports it.

- Plan: [docs/game-plan.md](docs/game-plan.md)
- Genre research and sources: [docs/genre-research.md](docs/genre-research.md)
- What the physics spike measured: [docs/m0-physics-findings.md](docs/m0-physics-findings.md)
- Creative parts from real machines (with sources): [docs/parts-catalog.md](docs/parts-catalog.md)
- Run flow, major upgrades, rebalancing, board variety: [docs/run-flow-and-balance.md](docs/run-flow-and-balance.md)
- Art direction, themed machines, particles, with concept sheets: [docs/art-direction.md](docs/art-direction.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Controls: `Z`/`Shift` left flipper, `/`/`Shift` right flipper, hold `Space` to charge the plunger and release to fire, `←` `→` nudge (too much tilts), `Tab` cash out once the goal is hit, `M` mute.

Workshop (between rounds): buy parts in the shop, click one in your inventory and click the table to place it. Drag a part to move it, drag it onto the inventory panel to take it off the board, `R` (or the mouse wheel) rotates, `Del` stores it, `Space` fires a test ball. Hover any part to see exactly how it scores. Tick **Test Lab** to get every part for free plus lab tools. `Ctrl+Z` / `Ctrl+Y` undo and redo.

## Check it

```bash
npm test                  # sim, scoring, economy, every part's physics, launch spread, stress + fuzz (headless)
npm run typecheck
npm run build && npx vite preview --port 4173 &
npm run smoke -- ./shots  # drives the built game in headless Chromium
npm run physics-report    # tunnelling rate per timestep, escape fuzz
npm run balance           # bot plays rounds; goal clear rates
npx vite-node tools/launch-spread.ts   # where do launched balls land?
npm run concept           # re-render the concept sheets in docs/concept from the real table and parts
```

## Layout

```
src/sim/      deterministic Box2D simulation (runs headless in Node); nothing about scoring or drawing
src/game/     scoring (points × Mult, recipes, ledger) and the run state: shop, inventory, rounds
src/data/     content as data: parts (recipes, dials, descriptions), announcer lines
src/ui/       small HTML builders for the cards and tooltips
src/render/   PixiJS renderer (reads the sim, never writes it)
tools/        stress/fuzz runners, balance bot, browser smoke test
tests/        vitest
```

Notes: phaser-box2d can only ever create 32 worlds per process, so the sim reuses one world (`createSim`, never `new Sim`). See the findings doc.
