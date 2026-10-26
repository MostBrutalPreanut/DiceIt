# Free Play (working title): game plan v0.6

Status: **M0 done; M1 (the machine workshop) mostly built and playable:** a bigger table with a varied launch, fifteen part types, per-run part levels, a shop, an inventory, a test lab, undo/redo, layout slots, a heatmap, and scoring you can read. **M1.5 is mostly done:** the cheap pinball parts (Kickback, Ball Saver, Vari-Target, lane change), the between-rounds flow with 23 major upgrades, and the auto-builder and balance table with a first-pass goal curve (provisional on purpose: playtests and many more parts come first). Next: cabinet picks and the seeded board, then more parts.

Docs: research [genre-research.md](genre-research.md) · measured results [m0-physics-findings.md](m0-physics-findings.md) · creative parts and real-machine mechanisms [parts-catalog.md](parts-catalog.md) · run flow, upgrades, rebalancing and board variety [run-flow-and-balance.md](run-flow-and-balance.md) · look, themed machines and particles [art-direction.md](art-direction.md) · how to build the look [art-implementation-plan.md](art-implementation-plan.md). All numbers are starting values to be tuned by simulation and playtests, not commitments.

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
| **Run flow** | **Play → buy (into the inventory; lock an offer for next round) → after every boss choose 1 of 3 decals → install → start round.** Twelve bosses (four regular and one final per run). **Built** ([balance-plan.md](balance-plan.md) §3-5) |
| **Testing** | A proper test environment: every part, no money limit (built as the Test Lab, §2.3) |
| **Creative parts** | Many, later, drawing on real machines: lights that upgrade bumpers, moving and changing parts, toys. Research is in parts-catalog.md |
| **Board** | Improvements and randomness at the start of a run (plan: run-flow-and-balance.md §5) |
| **Art direction** | **Toybox Diorama** (art-direction.md v0.3, approved): sticker props, theme kits as data, sticker particles, object-style HUD, relic decals on the apron, the machine tilts rather than the camera. Build plan: art-implementation-plan.md |
| Themes | **Picked per run** (no switching mid-run): Funhouse Factory, Short Order, Castle Crash. Each has its own Big Boi with its own ability (Foreman, Cook, Dragon); see [balance-plan.md](balance-plan.md) §1 |
| Type | Luckiest Guy (display), Nunito (UI), DotGothic16 (DMD), all SIL OFL |
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

### 2.4 Between rounds: Shop, Upgrade, Install (built)
After a round is won, one screen does everything. A stepper above the table reads **1 Shop · 2 Upgrade · 3 Install**; the Upgrade step only appears when a pick is owed (after every boss: rounds 3, 6, 9, 12, 15) or was just made. The big **Start round** button sits at the end of the stepper and is locked only while a pick is owed; it pulses when nothing is left to place. Parts that arrive from an upgrade (or the shop) sit in the inventory marked **NEW** until you place them. Buying costs money; moving, tuning and placing never do. The run's upgrades are listed as chips in the left panel, with what each does on hover.

### 2.3 The Test Lab (built)
The *Test Lab* checkbox replaces the shop with the **whole catalog, free**, shows ∞ money, and adds lab tools (drop 4 or 12 balls, clear the board, levels ±1, and **take any major upgrade for free**). Nothing counts. Details and next steps in run-flow-and-balance.md §3.

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
- **A ball ends when the last ball drains** (the Ball Printer makes multiball), **and the ball has a 60 s clock**: one clock per ball from its first launch, however many balls it turns into, shown as a bar in the HUD. When it runs out the flippers, nudge and plunger go dead and the balls in play roll out on their own (they still score); a ball still on the table 15 s later is taken.
- **Everything that compounds has a limit.** The auto-builder found a machine that scored 36.8 million in one ball (a Ball Printer chain kept the ball alive over ten minutes while Pop growth, Mult and coins grew without end), so every source that feeds on itself is capped, in the part data and in the sentence on the part: Pop growth **+100** a ball · Big Boi **+3 Mult** a ball · lane and drop-target sets **5** a ball · Cha-Ching and Gold Ball **$5** a round each · a Ball Printer prints **4** balls a ball. A maxed hit still scores; it says so (`Mult maxed for this ball`). The limits are the first thing to tune if the balance table shows a part dominating.
- **Not built yet:** the end-of-ball Bonus tally and Bonus-X.

Patterns for a *machine*, still to be validated: charge → release, sequences, banks and lanes, geometry flow, ball state, variance control through multiball, and wiring parts together.

## 4. Parts (fifteen built, plus lane change)

Each has a footprint, behaviors and dials with a trade-off shown on the part. Costs: Pop $3, Cha-Ching $4, Big Boi $6, Slingshot $4, Spinner $4, Lane $3, Ball Printer $7, Extra Flipper $8, Lamp $5, Deflector $1, Level Light $5, Drop-Target Bank $5, Kickback $4, Ball Saver $5, Vari-Target $4.

| Part | What it does | Dial |
|---|---|---|
| Pop Bumper | 100 per hit; +5 for every Pop hit this ball, up to +100 | Kick ↔ payout |
| Cha-Ching Bumper | 40 per hit and $1, up to $5 a round | Kick ↔ payout |
| Big Boi | 250 per hit and +0.1 Mult, up to +3 a ball | Kick ↔ payout |
| Slingshot | 30 per hit; snaps the ball off whichever face it hits | Kick ↔ payout; rotates |
| Spinner | 10 per spin; faster balls spin more (1 to 10) | Drag ↔ payout; rotates |
| Lane Rollover | 50 per roll; light them all (at least two lanes): +200 and +0.5 Mult, then reset, at most 5 times a ball. **Lane change:** each flipper press shifts the lit lanes one place (Z left, / right, wrapping), so you can steer which lane is still dark. Shifting never completes a set | none |
| Ball Printer | Catches a ball, holds it, scores 200, fires it out and prints a second ball (at most 4 printed in a ball, 4 on the table) | Hold ↔ payout; eject power; rotates to aim |
| Extra Flipper | A real flipper worked by the Left or Right button | which button |
| Lamp | Light it by rolling over it; lit, it gives parts within its glow +25% | glow radius ↔ bonus |
| Deflector | Scores nothing; a bouncy bar that steers the ball | rotates |
| **Level Light** | The Space Cadet bumper upgrade: roll over it to light it, again and it goes out. Light every Level Light aimed at one part type (at least two) and that type **levels up for the rest of the run** (max 5; each level adds base points, shown as gold pips on the part). Lights stay lit all round. | aim: Pop / Cha-Ching / Big Boi / Slingshot |
| **Drop-Target Bank** | Three targets that really drop when hit (60 each); all three: +300 and +0.3 Mult, then they pop back up (and on every new ball); at most 5 sets a ball | rotates |
| **Kickback** | A one-shot launcher: armed at the start of every ball; the first time a ball rolls over it, it fires the ball out along its aim and pays 150 (then it is dark until the next ball). Roll a ball over it and it is a rescue shot from a side lane; aim it up the table and it is a booster | Power (30 to 110); rotates to aim |
| **Vari-Target** | A solid standup that bounces the ball back and pays 40 times a tier set by how hard it was hit: x1 soft, x2 firm (speed 12+), x4 hard (28+), x8 smash (50+). The plate lights one segment per tier | Stiffness 0.5 to 2: thresholds scale up and payout rises, or the reverse; rotates |
| **Ball Saver** | A "shoot again" insert. For 8 s after you launch a ball, a drain sends the ball back to the plunger lane unspent (the Mult and growth carry over). **Each Ball Saver on the board saves one drain per ball**, so two give two saves. Scores nothing. Its ring drains as the window closes and it goes dark once used | none (stack them) |

**Next parts, in priority order** (full list with sources and effort in [parts-catalog.md](parts-catalog.md)): magic post, standup and bash targets, magnet, teleporter pair, moving parts (roving bumper, spinning disc, swinging gate), then ramps and layers, an upper playfield, and the big toys. The old "rule cards" are now the **Rules** column of the major upgrades.

### 4b. Major upgrades (replaced by decals: see [balance-plan.md](balance-plan.md) §4)

*Superseded*: the three-column upgrades below became 44 decals, and parts gained rarities (§2 there). Kept for history.

After a boss the machine offers three cards, **one per column**, and you take one for the rest of the run or skip it for $4. Offers never include a dead pick (nothing aimed at a part you do not own, nothing that needs a lamp, printer or lane you lack), respect each upgrade's maximum and exclusions, and are weighted by rarity (common 6, rare 3, legendary 1). The **Rules** column and the **legendaries** open from the second offer on. Every card's sentence is generated from the same numbers as its effect (`src/data/upgrades.ts`), and the sentence on every part (`describe`) follows the run's upgrades, so what a part says it does is what it does.

| Column | Upgrades |
|---|---|
| **Board** | **Ball Saver** (a free saver to install) · **Kickbacks** (two free) · **Upper Flippers** (rare: one for each button) · **Extra Ball** (rare, up to 2: 4 or 5 balls a round) · **Interest** ($1 per $4 held after each round, up to $5) · **Sponsor** (+$3 a round) · **Coupon Book** (parts cost $1 less) · **Full Refund** (rare: sell for the full price) · **Wide Shelf** (the shop shows one more part) |
| **Ball** | **Rubber Ball** (bounces harder off everything: livelier, harder to cradle) · **Heavy Ball** (hits pay +25%, nudges 40% weaker) · **Glass Ball** (falls 20% slower; spinners spin 50% more; excludes Heavy) · **Gold Ball** ($1 for every 10th scoring hit of a round) · **Twin Ball** (legendary: every ball arrives as a pair) |
| **Parts** | **Level Up** (one owned type) · **Overclock** (+50% base points for one owned type, stacks) · **Bright Lamps** (glow +2 units, +10%) · **Printer Plus** (rare: prints one more ball) · **Jackpot Sets** (rare: lane and drop-target sets pay double points and Mult) · **Golden Age** (legendary: every owned type levels up) |
| **Rules** | **Head Start** (+0.25 starting Mult, stacks to 4) · **Lucky Seven** (rare: every 7th hit of a ball pays double) · **Ball Hog** (unused balls pay $5 instead of $3) |

Not built yet from the design: Wider Build Area, Magic Post, Bonus-X (needs the end-of-ball tally), Magnetic Ball, and the legendary toys (the Hand, the Castle).

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
- **Anti-stall:** ball search after 3.5 s of stillness and a 60 s ball clock per ball (it was 90 s per body, which a Ball Printer chain defeated). Median bot balls last 35 to 50 s, so the clock mostly bites late, which keeps rounds near 2.5 minutes. More drain pressure (outlanes, slingshots) would shorten balls without a clock.
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
- 200 headless tests plus a browser smoke test cover scoring math, the economy, each part's physics, determinism, tunnelling, escapes, and the launch spread.

## 9. Roadmap

| # | Milestone | Status |
|---|---|---|
| **M0** | Feel spike: physics, flippers, plunger, nudge/tilt, scoring ledger, rounds | **Done** |
| **M1** | **Machine Workshop.** Built: bigger table and varied launch, 12 parts, dials, recipes and live values, shop, inventory, sell/store/place, multiball, extra flippers, lamps, lane sets, **part levels and Level Lights, drop-target bank, Test Lab, undo/redo, layout slots, heatmap**. **Still to do:** the end-of-ball Bonus tally, and (moved to the next step) the between-rounds flow with major upgrades | **Mostly done** |
| **M1.5** | **Streamlined flow and rebalance.** Between-rounds stepper, major upgrades (pick 1 of 3), cabinet pick and seeded board, the cheap pinball parts (**built**), the auto-builder and balance table (**built**), a goal curve (**first pass, provisional**) | **Parts, stepper, 23 upgrades, auto-builder and goal table built; cabinet picks and seeded board next** |
| M2 | Machine depth: **creative parts wave 2** (timed magnet, teleporter pair, moving parts: roving bumper, spinning disc, swinging gate; Fuse Lane, rank ring), wiring spike, Lab (bot estimate of a layout), ~25 parts, the **Rules** column of the upgrades (~25 relics), bosses, missions, balance bot sets the goal curve, difficulty tiers | After M1.5 |
| M3 | Spectacle (supports the machine): **art direction per [art-implementation-plan.md](art-implementation-plan.md)** (theme kit, tilt, prop textures, particles, HUD reskin), Chaos meter, shaders, DMD, light shows, adaptive audio, announcer, accessibility. **Creative parts wave 3, part 1:** layers (ramps, orbits), then the upper playfield | |
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
| **Runaway compounding** (a part that feeds on itself) | Every compounding source has a cap or limit in its recipe; the auto-builder hunts for exploits (`npm run balance`, `tools/explain.ts`); a saved runaway machine is a regression test. New parts that grow, multiply or pay should ship with a limit |
| Thin content | Data-driven parts; minimum catalog before Early Access |
| Scope creep | The support test (§1) |

## 11. Open questions

| # | Question | My default |
|---|---|---|
| 1 | How hard should round 1 be? Round 1's goal is now 4,000 (a par machine fails it 10% of the time). | Judge it in human playtests; the bot is not a person |
| 2 | Should **wiring** (parts signalling each other) be core or a spike? | Spike in M2, promote if it reads well |
| 3 | The **Lab** (simulated estimate of your layout): ship, gate, or skip? | Ship it, limited uses, lossy bot |
| 4 | Selling refunds half. Is that right, or should it refund in full so experimenting is free? | Half, with free moving and storing |
| 5 | Name | Ride "Free Play" until M3 |
| 6 | Major upgrades come after every boss (rounds 3, 6, 9, 12, 15). Right cadence? Should skipping pay money? | Built as proposed (skip pays $4); tune after playing |
| 7 | Level Lights need at least two per type (as Space Cadet's three). Should the lights also decay ("wear")? | No decay for now; add Fuse Lane later |
