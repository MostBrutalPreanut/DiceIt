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

## Launch variety: why every ball took the same path, and the fix

Feedback after the first playable: every ball goes up the lane, over the top and down the left wall. `tools/launch-spread.ts` measures it: fire hundreds of balls at random plunger strengths with no flipper input, record where each first crosses mid-table, how many parts it touches and how long it lives.

| | First table (22 × 44) | Now (26 × 52) |
|---|---|---|
| Busiest landing bin (of 8) | **89%** (the left wall) | **23%** |
| Balls that touched any part | 6% | 74% |
| Average part hits per launch | 0.23 | 1.39 |
| Average life of a launched ball | 7.2 s | 9.1 s |

What the traces showed, and what fixed each thing:
1. **A smooth dome is a perfect guide.** Any strong plunge hugged the dome at the apex and was carried to the left wall, over the top of everything. A 45° chamfer over the lane throws the ball out as a free projectile, so plunger strength decides where it lands. (Alone it was not enough: 80% still hugged the left wall.)
2. **Low wall restitution (0.25)** let a ball arriving almost horizontally just slide down the wall. Raised to 0.5.
3. **The starter bumpers were nowhere near the ball's path.** They now sit where the ball arrives (about y = 42 to 46).
4. **Space Cadet's trick:** randomness only where the ball enters play. The plunger now boosts every launch by a random 0–10% and drifts the ball sideways a little (the original does `boost + rand * 0.1 * boost`). Saucers fire balls out with a random angle (±0.12 rad) and speed (±8%), like the original's `throw_ball`.
5. **A short ledge on the left wall** rolls a ball sliding down it back into the field. The tool is sensitive (a 1-unit change to the ledge shifted most balls from the left to the right), so the final geometry was chosen by running it.

`tests/launch.test.ts` now fails if the busiest bin reaches 40%, fewer than 5 of 8 bins have 5% of the balls, fewer than half the launches touch a part, or any launch of at least 30% charge falls back.

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

## Bot balance probe (starter machine, round-1 goal 2,500, bot skill 0.9)

On the new table, over 30 rounds: cleared on ball 1 in 12, ball 2 in 8, ball 3 in 7, failed 3; median 3-ball score about 3,700; average ball 49.5 s (it was 80% first-ball clears and 60 s per ball on the old, emptier table). Real players will do worse than the bot, so round 1 may be too hard once someone plays it; the goal curve is still a placeholder. Run `npm run balance`.

## Open physics items

- The plunger lane has no one-way gate. A ball rolling down the right side can fall back into the lane (the sloped lane top makes this rare).
- No outlanes or inlane guides yet; the drain gap is wide. Slingshots exist as a buyable part, not as fixed cabinet furniture.
- Ball-vs-ball collisions are tested only up to 4 balls (the Ball Printer's cap) and in the cost benchmark.
- The flipper tunnelling table above was re-run on the new table: 173 / 56 / 46 / 1 / 0 raw failures per config, identical to the old table within one trial (the flipper geometry did not change). Escape fuzz on the new table: 0 escapes and 0 stuck balls in 200 bot balls; 45 of the 200 ran to the 90 s ball clock.
