# Free Play (working title): game plan v0.3

Status: **M0 (feel spike) done. First slice of M1 (the machine workshop) built and playable:** a bigger table with a varied launch, ten part types, a shop, an inventory, and scoring you can read. Research and sources: [genre-research.md](genre-research.md). Measured results: [m0-physics-findings.md](m0-physics-findings.md). All numbers are starting values to be tuned by simulation and playtests, not commitments.

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
- A free **Test Ball** runs in the workshop, with its own throwaway ledger, while you edit.
- A **Sandbox** switch makes the shop free, for exploring the catalog.

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

## 4. Parts (ten built)

Each has a footprint, behaviors and dials with a trade-off shown on the part. Costs: Pop $3, Cha-Ching $4, Big Boi $6, Slingshot $4, Spinner $4, Lane $3, Ball Printer $7, Extra Flipper $8, Lamp $5, Deflector $1.

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

**Next parts to consider:** drop-target bank, standup target, magnet, ramp, kickback, one-way gate, rule cards (ordered, joker-like), then wiring parts to each other.

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
- 59 headless tests plus a browser smoke test cover scoring math, the economy, each part's physics, determinism, tunnelling, escapes, and the launch spread.

## 9. Roadmap

| # | Milestone | Status |
|---|---|---|
| **M0** | Feel spike: physics, flippers, plunger, nudge/tilt, scoring ledger, rounds | **Done** |
| **M1** | **Machine Workshop.** Built: bigger table and varied launch, 10 parts, dials, recipes and live values, shop, inventory, sell/store/place, multiball, extra flippers, lamps and lane sets. **Still to do:** undo/redo and saved layouts, ball heatmap and per-ball history, end-of-ball Bonus tally, rule cards, a few more parts (drop-target bank, magnet, ramp), tuning the goal curve | **In progress** |
| M2 | Machine depth: wiring spike, Lab (bot estimate of a layout), ~25 parts, ~25 rules, bosses, missions, balance bot sets the goal curve, difficulty tiers | Next |
| M3 | Spectacle (supports the machine): art direction, Chaos meter, shaders, DMD, light shows, adaptive audio, announcer, accessibility | |
| M4 | Content and meta: ~40 parts, ~40 rules, collection log, unlocks, tutorial, Steam wrapper | |
| M5 | Playtest and launch | |

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
