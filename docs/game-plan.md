# Free Play (working title): game plan v0.4

Status: **M0 done; M1 (the machine workshop) mostly built and playable:** a bigger table with a varied launch, twelve part types, per-run part levels, a shop, an inventory, a test lab, undo/redo, layout slots, a heatmap, and scoring you can read. Next: the streamlined between-rounds flow with major upgrades, then a rebalance.

Docs: research [genre-research.md](genre-research.md) · measured results [m0-physics-findings.md](m0-physics-findings.md) · creative parts and real-machine mechanisms [parts-catalog.md](parts-catalog.md) · run flow, upgrades, rebalancing and board variety [run-flow-and-balance.md](run-flow-and-balance.md). All numbers are starting values to be tuned by simulation and playtests, not commitments.

## 0. Decisions so far

| Question | Decision |
|---|---|
| Platform | Web first (itch.io / hosted build), Steam wrapper later |
| Tone | **Goofy.** Funhouse machines, a snarky announcer, silly part names |
| Announcer | Text on the dot-matrix display for now; voice later, maybe |
| Flippers | Manual, with optional assists |
| Scoring feel | A live ticking score (the main rush) plus an end-of-ball bonus tally |
| **Focus** | **Building a great scoring machine, tuning it, and changing it mid-run. Everything else supports that.** |
| "Changing mid-run" | **Spend the money you earn on new parts (more bumpers, flippers, lights, ...), move parts around freely, and put parts in an inventory when you want them off the board.** |
| Scoring must be legible | Every part says how it scores (recipe, live value, math on every hit) |
| Camera | Fixed view of the whole table. No follow camera. |
| Launch | Must vary: the ball should land in different spots, not funnel down one wall |
| Game feel | "Pretty fun now." Next: rebalance the levels after the new flow is in |
| **Run flow** | **Play → buy (into the inventory) → every few rounds choose 1 of 3 major upgrades (board, balls, parts...) → install → start round.** One streamlined between-rounds screen (plan: run-flow-and-balance.md §1-2) |
| **Testing** | A proper test environment: every part, no money limit (built as the Test Lab, §2.3) |
| **Creative parts** | Many, later, drawing on real machines: lights that upgrade bumpers, moving and changing parts, toys. Research is in parts-catalog.md |
| **Board** | Improvements and randomness at the start of a run (plan: run-flow-and-balance.md §5) |
| Old Dice It! plan | Deleted (still in git history at `eb84abf`) |

## 1. Vision and the one rule

> **The scoring machine is the game. Everything else supports it.**

You build a pinball machine that shouldn't exist, tune it like an operator, watch it go off, see exactly why it scored, change it, and go again. You start with two flippers, a plunger and three bumpers. Each round you fire 3 balls at a points goal; winning pays money; money buys parts; you place, move, tune and swap parts until the machine is a beautiful, ridiculous engine. You lose when your machine can't reach a goal.

**The support test.** A feature earns its place only if it does at least one of these for the machine:

1. gives the player something to **build** with (parts, dials, rules),
2. lets them **see why** it scored (ledger, recipes, live values, math),
3. lets them **change** it faster or cheaper (workshop, inventory, test ball),
4. **tests** it (goals, bosses that break its assumptions), or
5. makes watching it **run** feel great (juice that reveals the causal chain).

Everything else (ball types, mini-games on the backbox, cabinet variety, daily seeds, a second playfield) is deferred until the core loop is proven fun.

Pillars: the table is the build · tunable, not just placeable · readable chaos · real pinball logic · skill helps but build wins · goofy and escalating · respect the player's time · content is data.

## 2. The machine loop

```
 OBSERVE ──► DIAGNOSE ──► CHANGE ──► TEST ──► COMMIT
 play a      Ledger +      buy, place,   Test Ball    fire the
 ball        part recipes  move, store,                real balls
                           tune, sell
```

### 2.1 What "changing the machine" means (built)
- **Money comes from rounds** (and some parts, like the Cha-Ching Bumper) and **buys parts in the shop**. The shop shows 4 offers per round; reroll costs $1, then $2, and so on.
- **A bought part goes to your inventory** and follows your pointer until you click the table. **You can move any placed part by dragging it, rotate it, tune its dials, or drag it onto the inventory panel to take it off the board.** Selling refunds half the price.
- **Between rounds you can change anything, freely.** There is no cost to moving or tuning, only to buying. **During a round the machine is locked** (flippers and nudge only).
- A free **Test Ball** runs in the workshop, with its own throwaway ledger, while you edit. A test ball can never level up your real machine.
- **Undo / redo** (Ctrl+Z, Ctrl+Y) covers purchases (money included), sales, placing, storing, rotating and dial changes.
- **Three layout slots** save an arrangement and re-lay it out on the parts you own (the lab creates any that are missing).
- A **heatmap** shows where the balls really went since the layout last changed, so you can see a dead zone or a hotspot.

### 2.3 The Test Lab (built)
The *Test Lab* checkbox replaces the shop with the **whole catalog, free**, shows ∞ money, and adds lab tools (drop 4 or 12 balls, clear the board, levels ±1). Nothing counts. Details and next steps in run-flow-and-balance.md §3.

### 2.2 Making scoring readable (built)
The player must always be able to answer "what does this thing do, and what did it just do?":
1. **Recipe sentences** on every shop offer, inventory item, selected part and hover tooltip, generated from the same data the scorer uses, so they cannot disagree with the game. Example: *"Scores 100 per hit, times your Mult. Grows: +5 for every Pop Bumper hit this ball."*
2. **A live value printed on every part** on the board (a Pop Bumper reads 100, then 105, 110 ... as Pop hits accumulate this ball).
3. **A math line on every hit:** `+143` with `100 +10 grown ×1.43 Mult` under it.
4. **The ledger**, with hits and points per part.
5. **Dial text that follows the dial:** change Kick and the recipe sentence and the number on the part change with it. Defaults are neutral, so the printed recipe is exactly what you get.

## 3. Scoring

- **Live scoring (the rush).** Every event adds `points × Mult` immediately, with a popup sized by magnitude. Mult starts each ball at 1 and is raised by parts (Big Boi, a completed Lane set).
- **Per-part rules in the recipe, all data:** base points, `grow` (+points per hit of this part type this ball), `+Mult`, `+$`, lights, a set bonus, extra balls. A lit **Lamp** gives every scoring part inside its glow +25% (a wider glow gives a smaller bonus).
- **Goal reached mid-ball:** the ball keeps playing and the extra points become Overshoot; Cash Out ends the round at once.
- **A ball ends when the last ball drains** (the Ball Printer makes multiball).
- **Not built yet:** the end-of-ball Bonus tally and Bonus-X.

Patterns for a *machine*, still to be validated: charge → release, sequences, banks and lanes, geometry flow, ball state, variance control through multiball, and wiring parts together.

## 4. Parts (twelve built)

Each has a footprint, behaviors and dials with a trade-off shown on the part. Costs: Pop $3, Cha-Ching $4, Big Boi $6, Slingshot $4, Spinner $4, Lane $3, Ball Printer $7, Extra Flipper $8, Lamp $5, Deflector $1, Level Light $5, Drop-Target Bank $5.

| Part | What it does | Dial |
|---|---|---|
| Pop Bumper | 100 per hit; +5 for every Pop hit this ball | Kick ↔ payout |
| Cha-Ching Bumper | 40 per hit and $1 | Kick ↔ payout |
| Big Boi | 250 per hit and +0.1 Mult | Kick ↔ payout |
| Slingshot | 30 per hit; snaps the ball off whichever face it hits | Kick ↔ payout; rotates |
| Spinner | 10 per spin; faster balls spin more (1 to 10) | Drag ↔ payout; rotates |
| Lane Rollover | 50 per roll; light them all: +200 and +0.5 Mult, then reset | none |
| Ball Printer | Catches a ball, holds it, scores 200, fires it out and prints a second ball (max 4) | Hold ↔ payout; eject power; rotates to aim |
| Extra Flipper | A real flipper worked by the Left or Right button | which button |
| Lamp | Light it by rolling over it; lit, it gives parts within its glow +25% | glow radius ↔ bonus |
| Deflector | Scores nothing; a bouncy bar that steers the ball | rotates |
| **Level Light** | The Space Cadet bumper upgrade: roll over it to light it, again and it goes out. Light every Level Light aimed at one part type (at least two) and that type **levels up for the rest of the run** (max 5; each level adds base points, shown as gold pips on the part). Lights stay lit all round. | aim: Pop / Cha-Ching / Big Boi / Slingshot |
| **Drop-Target Bank** | Three targets that really drop when hit (60 each); all three: +300 and +0.3 Mult, then they pop back up (and on every new ball) | rotates |

**Next parts, in priority order** (full list with sources and effort in [parts-catalog.md](parts-catalog.md)): lane change (flipper buttons shift the lit lane), vari-target, kickback, ball saver, magic post, magnet, teleporter pair, moving parts (roving bumper, spinning disc, swinging gate), then ramps and layers, an upper playfield, and the big toys. The old "rule cards" are now the **Rules** column of the major upgrades.

## 5. The table and the launch

The first table sent **89% of launches down the left wall**, and only 6% touched any part. Space Cadet Pinball's source showed where its variety comes from (research §6b): randomness only where a ball enters play, plus bumpers sitting in the ball's arrival path. What changed:

- **A bigger table** (26 × 52 units, up from 22 × 44) with more build area.
- **A 45° chamfer** over the plunger lane, so a strong plunge leaves it as a free projectile and the plunger strength decides where the ball lands. A smooth dome sent every strong plunge to the same spot.
- **Plunger randomness like Space Cadet's** (0–10% extra boost, a little sideways drift); **saucers eject with a random angle and speed.**
- **Bouncier walls** and a small **ledge** on the left wall, so a ball arriving there rolls back into the field.
- **The starter bumpers sit where the ball arrives.**

Result: the busiest landing bin is 23% (was 89%), 74% of launches touch a part (was 6%), and balls land across the whole width. A test guards it.

## 6. Economy and run structure

- Round payout = base + unused balls ($3 each) + overshoot (log tiers) + coin bumpers (+ missions, interest later). Start with $6.
- **5 stages × 3 rounds** (Opener, Main Event, Boss), a 35–45 minute winning run. Goals scale with a curve set by the balance bot against percentiles of a par machine.
- **Bosses are machine stress tests** that break one assumption so you must re-tune: Cheap Rubber, Slippery Slope, Loose Screws, The Magnet, Reverse Flippers, Tax Man, Night Shift.
- Round 1 today: goal 2,500. A bot clears it on its first ball 40% of the time and fails it 10% of the time with the starter machine; real players will do worse than the bot, so expect to lower it.

## 7. Support systems (subordinate to the machine)

- **Controls:** Z and / (or Shift) flippers, Space to plunge, arrows to nudge (too much = tilt), Tab to cash out, R to rotate, Delete to store. On-screen buttons for touch. **Assists** (auto-plunge, flipper assist, longer ball save) are planned.
- **Anti-stall:** ball search after 3.5 s of stillness and a 90 s ball clock. Skilled bots can still keep a ball alive for the whole clock on a sparse table, so balls should end sooner (more drain pressure).
- **Presentation supports readability.** Pitch climbs with Mult. Effects come from the event stream. A Chaos meter, shaders, light shows and adaptive music are M3.
- **Accessibility:** Calm mode (no strobing), reduced shake, colour-blind-safe colours plus shapes, rebinding, one-handed mode. Planned.

## 8. Technical plan

TypeScript + Vite + PixiJS v8 + Box2D v3 (`phaser-box2d`, MIT) + Web Audio, web first.

```
Input ─► Sim (fixed 240 Hz, deterministic, headless in Node)
          Box2D world → contacts + sensors → events → Scorer (points × Mult, ledger, recipes)
                          │
                          ▼  immutable event stream (SimEvent / ScoreEvent / GameEvent)
          Presentation (never changes the sim): Pixi, particles, audio, DMD, HUD, shop, inventory
Data: parts + recipes + dials · callouts · Tools: balance bot, stress/fuzz, launch spread, smoke test
```

- Part recipes drive three things from one source: the scorer, the description text, and the labels on the board.
- 83 headless tests plus a browser smoke test cover scoring math, the economy, each part's physics, determinism, tunnelling, escapes, and the launch spread.

## 9. Roadmap

| # | Milestone | Status |
|---|---|---|
| **M0** | Feel spike: physics, flippers, plunger, nudge/tilt, scoring ledger, rounds | **Done** |
| **M1** | **Machine Workshop.** Built: bigger table and varied launch, 12 parts, dials, recipes and live values, shop, inventory, sell/store/place, multiball, extra flippers, lamps, lane sets, **part levels and Level Lights, drop-target bank, Test Lab, undo/redo, layout slots, heatmap**. **Still to do:** the end-of-ball Bonus tally, and (moved to the next step) the between-rounds flow with major upgrades | **Mostly done** |
| **M1.5** | **Streamlined flow and rebalance.** Between-rounds stepper, major upgrades (pick 1 of 3), cabinet pick and seeded board, the cheap pinball parts (lane change, kickback, ball saver, vari-target), the auto-builder and balance table, a real goal curve | **Next** |
| M2 | Machine depth: **creative parts wave 2** (timed magnet, teleporter pair, moving parts: roving bumper, spinning disc, swinging gate; Fuse Lane, rank ring), wiring spike, Lab (bot estimate of a layout), ~25 parts, the **Rules** column of the upgrades (~25 relics), bosses, missions, balance bot sets the goal curve, difficulty tiers | After M1.5 |
| M3 | Spectacle (supports the machine): art direction, Chaos meter, shaders, DMD, light shows, adaptive audio, announcer, accessibility. **Creative parts wave 3, part 1:** layers (ramps, orbits), then the upper playfield | |
| M4 | Content and meta: ~40 parts, ~40 rules, **legendary toys** (the Hand, the Castle, the Head), themed cabinets, collection log, unlocks, tutorial, Steam wrapper | |
| M5 | Playtest and launch | |

Creative parts come in waves (priorities and sources in [parts-catalog.md](parts-catalog.md) §4): **wave 1** (M1.5) lane change, vari-target, standup and bash targets, kickback, ball saver, magic post; **wave 2** (M2) magnets, teleporters, moving parts, progress lights; **wave 3** (M3 to M4) ramps and layers, an upper playfield, toys. Each wave is data rows plus a little sim work, so the catalog can keep growing without changing the engine.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Physics bugs (the genre's worst reviews) | Stress tests, fuzz, safety net, ball search; keep running them |
| Same launch every time | Launch-spread test (busiest bin < 40%); randomness at launch points like Space Cadet |
| Skill overshadows build | Modest skill ceiling, high build ceiling, assists, variance-reducing builds |
| Unreadable scoring | Recipes, live values, per-hit math, ledger; keep the number of rules per part small |
| **Tuning becomes a spreadsheet chore** | Few, legible trade-offs per dial; the Lab is gated or lossy; reward experimenting |
| Crowded niche | Table-as-build, tunability, goofy tone; early public demo with a hero GIF |
| Thin content | Data-driven parts; minimum catalog before Early Access |
| Scope creep | The support test (§1) |

## 11. Open questions

| # | Question | My default |
|---|---|---|
| 1 | How hard should round 1 be? A bot with the starter machine clears it first ball 40% of the time. | Lower the goal after you have played it |
| 2 | Should **wiring** (parts signalling each other) be core or a spike? | Spike in M2, promote if it reads well |
| 3 | The **Lab** (simulated estimate of your layout): ship, gate, or skip? | Ship it, limited uses, lossy bot |
| 4 | Selling refunds half. Is that right, or should it refund in full so experimenting is free? | Half, with free moving and storing |
| 5 | Name | Ride "Free Play" until M3 |
| 6 | Major upgrades come after every boss (rounds 3, 6, 9, 12, 15). Right cadence? Should skipping pay money? | Yes to both; tune after playing |
| 7 | Level Lights need at least two per type (as Space Cadet's three). Should the lights also decay ("wear")? | No decay for now; add Fuse Lane later |
