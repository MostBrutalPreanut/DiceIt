# M0 findings: what the feel spike measured

Everything below was measured in this repo (`npm test`, `npm run physics-report`, `npm run balance`, `npm run smoke`). Re-run them after any physics change.

## Verdict

**Box2D v3 (via `phaser-box2d` 1.1.0) is good enough, with three conditions:** a 240 Hz fixed timestep, a safety net for flipper tunnelling, and one reused world per process. No need to fall back to Rapier.

## Flipper tunnelling is a timestep problem, not a substep problem

1,500 brutal trials per config: a ball is fired at a flipper from random heights, angles and speeds (up to 160 units/s, 15% starting at rest) while the flipper fires at a random moment, including already moving when the ball arrives. A trial "tunnels" if the ball's centre crosses from the flipper's top side to its underside within the flipper's length.

| Timestep × substeps | Raw engine (net off) | With safety net |
|---|---|---|
| 60 Hz × 4 | 173 / 1500 (11.5%) | 0 visible, 173 rescued |
| 120 Hz × 4 | 57 / 1500 (3.8%) | 0 visible, 57 rescued |
| 120 Hz × 8 | 46 / 1500 (3.1%) | 0 visible, 46 rescued |
| **240 Hz × 4 (default)** | **1 / 1500 (0.07%)** | 0 visible, 1 rescued |
| 240 Hz × 8 | 0 / 1500 | 0 visible, 0 rescued |

- Doubling substeps barely helps; doubling the timestep helps a lot. The rule of thumb: per-step travel of the flipper tip plus the ball must stay below the flipper's thickness plus the ball's diameter. A 4.2-unit flipper at 38 rad/s has a tip moving ~160 units/s.
- **The flipper must not be a bullet body.** Box2D v3 only sweeps a bullet (the ball) against non-bullet bodies; two bullets get no continuous collision between them.
- **Safety net (`Sim.rescueFromFlippers`).** If a ball's centre crosses a flipper from its top to its underside, put it back on top and bounce it. It is counted in `sim.rescues`, so tests still measure how often the raw engine needed help. At every timestep the rescue count equals the raw failure count and zero tunnels stay visible. A test keeps this honest by running at 60 Hz and requiring the net to catch every one.
- My first detector flagged balls that legitimately slid off the flipper tip and fell, a false positive. A tunnel now requires a *crossing of the flipper's own span* between two consecutive samples.

## Table geometry bugs that fuzzing found (all fixed)

Bot-played balls in a fuzz harness (`escapeFuzz`) exposed these; they are exactly the "ball gets stuck or escapes" class of bug seen in reviews of competing games:

1. **Groove stall.** The guide rails ended below the flippers' top surface, leaving a groove narrower than the ball. Balls rested there for 90 s. The rails now end just outside the swept circle of each flipper's rear corner.
2. **Lane slot.** The plunger lane's inner wall stopped 1.0 unit above its floor, exactly one ball diameter. A ball could wedge in the slot and then launch into the wall. The wall now reaches the floor.
3. **Dead plunger.** After a weak plunge the ball fell back but the plunger stayed disarmed. It now re-arms when the ball comes to rest in the lane.
4. A fuzz "escape" that turned out to be a ball already draining sideways below the flippers; the criterion now only counts balls that leave above the flippers.

Result at 240 Hz: 0 escapes and 0 stuck balls (no ball-search events) in 150 bot balls.

**Long balls are a pacing problem, not a physics one.** In the same run 41 of 150 balls (27%) survived to the 90 s ball clock, averaging 24 scoring hits each: a skilled bot can juggle a ball on the sparse starter table indefinitely. The clock catches it, but real balls should end sooner. Expect slingshots, outlanes and more parts to add drain pressure; consider a 60 s clock.

## Library notes (phaser-box2d 1.1.0)

- `main` points to a missing `index.js`; import `phaser-box2d/dist/PhaserBox2D.js`.
- No TypeScript types. `src/sim/box2d.d.ts` declares the module as untyped; all calls live in `src/sim`.
- **`b2DestroyWorld` never frees its slot** (it wipes a local copy), so a process can only ever create 32 worlds. `Sim` therefore keeps one world per process and `reset()`s it by destroying and rebuilding bodies. A test replays a ball on a fresh world and on a world reset after other balls and requires identical state, and another survives 300 resets. Use `createSim()`, never `new Sim()`. Parallel simulations need workers (one module instance each).
- Creating a world allocates 4,096 contact objects, another reason to reuse it.
- The code is MIT. The vendor's Getting Started guide, examples and API docs are *not* licensed for commercial use; don't copy them into the project.

## Performance

In headless Chromium (CPU physics only, no drawing), ms per 240 Hz step: ~0.12 with 1 ball, ~0.2 with 10 balls, ~0.17 with 20 balls (they drain over the 8 s run, so the average includes fewer balls). A 60 fps frame needs 4 steps, so physics costs roughly 0.5–1 ms per frame. Rendering was not measured: headless software WebGL runs at ~20 fps and says nothing about a real GPU.

## Determinism

Same seed and inputs give the same fingerprint (ball and flipper state) tick for tick, including on a reset world. JS floating point is deterministic within one engine build, so golden replays are valid per browser/Node version, not across them; daily-seed leaderboards must not rely on replay verification.

## Bot balance probe (starter table, round-1 goal 2,500, bot skill 0.9)

Over 40 rounds: cleared on ball 1 in 32, ball 2 in 5, ball 3 in 2, failed 1; median 3-ball score ~5,900. A real player will do worse than the bot, so the placeholder curve is plausible for round 1, but **balls last ~60 s on average on the sparse starter table**, double the 30 s target. Expect shorter balls once the table has more parts, flow shots and drain pressure; tune against this number.

## Open physics items

- The plunger lane has no one-way gate. A ball rolling down the right arc can fall back into the lane (the sloped lane top makes this rare).
- No slingshots, outlanes or inlane guides yet; the drain gap is wide.
- Ball-vs-ball collisions are untested at high counts beyond the cost benchmark.
