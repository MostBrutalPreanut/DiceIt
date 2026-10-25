# Free Play (working title)

A rogue-lite where you **build, tune and rebuild a pinball machine** to hit a score goal with 3 balls. Balatro-style escalating goals, pinball-style spectacle, goofy tone. The scoring machine is the game; everything else supports it.

- Plan: [docs/game-plan.md](docs/game-plan.md)
- Genre research and sources: [docs/genre-research.md](docs/genre-research.md)
- What the M0 physics spike measured: [docs/m0-physics-findings.md](docs/m0-physics-findings.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Controls: `Z`/`Shift` left flipper, `/`/`Shift` right flipper, hold `Space` to charge the plunger and release to fire, `←` `→` nudge (too much tilts), `Tab` cash out once the goal is hit, `M` mute. In the workshop, pick a part and click the table; drag to move, `Del` removes, `Space` fires a test ball.

## Check it

```bash
npm test                  # sim, scoring, determinism, physics stress + fuzz (headless)
npm run typecheck
npm run build && npx vite preview --port 4173 &
npm run smoke -- ./shots  # drives the built game in headless Chromium
npm run physics-report    # tunnelling rate per timestep, escape fuzz
npm run balance           # bot plays rounds; goal clear rates
```

## Layout

```
src/sim/      deterministic Box2D simulation (runs headless in Node); nothing about scoring or drawing
src/game/     scoring (points × Mult + ledger) and the run/round state machine
src/data/     content as data: parts, announcer lines
src/render/   PixiJS renderer (reads the sim, never writes it)
tools/        stress/fuzz runners, balance bot, browser smoke test
tests/        vitest
```

Notes: phaser-box2d can only ever create 32 worlds per process, so the sim reuses one world (`createSim`, never `new Sim`). See the findings doc.
