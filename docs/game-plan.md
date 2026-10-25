# Free Play (working title): game plan v0.2

Status: **M0 (feel spike) is built and verified.** Research and sources: [genre-research.md](genre-research.md). Measured physics results: [m0-physics-findings.md](m0-physics-findings.md). All numbers here are starting values to be tuned by simulation and playtests, not commitments.

## 0. Decisions so far

| Question | Decision |
|---|---|
| Platform | Web first (itch.io / hosted build), Steam wrapper later |
| Tone | **Goofy.** Funhouse machines, a snarky announcer, silly part names |
| Announcer | Text on the dot-matrix display for now; voice later, maybe |
| Flippers | Manual, with optional assists |
| Scoring feel | Both a live ticking score and an end-of-ball bonus tally. **The live ticking score is the main rush.** |
| **Focus** | **Building a great scoring machine, tuning it, and changing it mid-run. Everything else supports that.** |
| Old Dice It! plan | Deleted (still in git history at `eb84abf`) |

## 1. Vision and the one rule

> **The scoring machine is the game. Everything else supports it.**

You build a pinball machine that shouldn't exist, tune it like an operator, watch it go off, see exactly why it scored, change it, and go again. You start with two flippers, a plunger and a few basic bumpers. Each round you fire 3 balls at a points goal; winning pays money; money buys parts; you place, move and tune parts until the machine is a beautiful, ridiculous engine. You lose when your machine can't reach a goal.

**The support test.** A feature earns its place only if it does at least one of these for the machine:

1. gives the player something to **build** with (parts, dials, rules),
2. lets them **see why** it scored (ledger, attribution, replay),
3. lets them **change** it faster or cheaper (workshop, test ball, tinker tokens),
4. **tests** it (goals, bosses that break its assumptions), or
5. makes watching it **run** feel great (juice that reveals the causal chain).

Everything else (ball types, mini-games on the backbox, cabinet variety, daily seeds, a second playfield) is deferred until the core loop is proven fun.

Pillars:
1. **The table is the build.** Parts occupy space, so layout is the puzzle. (The market gap; see research §2.)
2. **Tunable, not just placeable.** Every part has dials with trade-offs; the machine is also tuned as a whole.
3. **Readable chaos.** Every point is attributed. The outcome is never computable; the mechanics always are.
4. **Real pinball logic.** Shots, sequences, banks, lanes, locks and multiball, not "touch things".
5. **Skill helps, build wins.** Flippers give agency; a strong machine beats a good hand. Assists keep it accessible.
6. **Goofy and escalating.** A run visibly gets crazier, and funnier.
7. **Respect the player's time.** Short balls, instant restarts, no stalling.
8. **Content is data.** Parts, rules and bosses are rows, not code.

## 2. The machine loop (what the player actually does)

```
 OBSERVE ──► DIAGNOSE ──► CHANGE ──► TEST ──► COMMIT
 play a      Ledger:       move, tune,  Test Ball,   fire the
 ball        which part    swap, buy,   Lab (later)  real balls
             earned what   sell
```

| Beat | What supports it | Status |
|---|---|---|
| Observe | Live ticker, Mult display, popups, DMD callouts | M0 done |
| Diagnose | **Ledger** (hits, points, share per part) | M0 done; M1 adds per-ball history, a **ball heatmap**, and wasted-potential hints |
| Change | **Live workshop edits** with a test ball still rolling: place, drag, delete, tune dials, table tilt | M0 done; M1 adds undo/redo and layout slots |
| Test | Free **Test Ball** with its own throwaway ledger | M0 done; the **Lab** (bot-simulated estimate of a layout's score distribution) comes in M2 |
| Commit | Start the round | M0 done |

### 2.1 When can the player change the machine ("mid-run")?
My reading of your focus line, to confirm (§11):
- **Between rounds: free and unlimited.** Move, rotate, tune and test as much as you like. Only *buying* costs money; selling refunds most of it. Tinkering must never be punished.
- **Between balls: limited, 2 Tinker Tokens per round.** A token lets you move one part or turn one dial after seeing how ball 1 went. Ball 1 becomes a diagnostic probe, and a failing machine can be rescued mid-round. Upgrades add tokens.
- **During a ball:** only flippers and nudge.
- **Bosses** break a specific assumption (see §6), forcing a re-tune.

## 3. Scoring: anatomy of a ball

- **Live scoring (the rush).** Every event adds `points × Mult` to the score immediately, on a ticking display, with popups sized by magnitude. Mult starts each ball at the machine's base value and grows as parts and rules fire.
- **End-of-ball Bonus tally (second beat).** On drain, a short skippable count-up (classic pinball) pays out lit-feature bonuses and Bonus-X, and the economy line items. It is also where money appears, so spending feels earned.
- **Goal reached mid-ball:** a "GOAL!" banner; the ball keeps playing and extra points become **Overshoot**. A Cash Out key ends the round at once.
- **Attribution is non-negotiable.** Every `ScoreEvent` names the part (or rule) that caused it; the ledger, popups and sounds all derive from the same event. This is also the sanctioned path for the optimising players GMTK warns about: give them the numbers rather than force a spreadsheet.

### 3.1 Patterns that make it a *machine* (design hypotheses for M1/M2 to validate)
1. **Charge → release.** Parts bank charge (points or Mult) that another part releases.
2. **Sequences.** Order-sensitive shots: a spinner, then a ramp within 3 s, then the saucer multiplies.
3. **Banks and lanes.** Completing a drop-target bank or lighting A-B-C pays and resets; partial progress is visible.
4. **Geometry flow.** Placement makes shots feed each other. This is the physical, un-spreadsheetable part.
5. **Ball state.** A ball can be "charged" by a part and carry it to the next.
6. **Variance control.** Relative spread falls as scoring events rise, so multiball and ball-printers lower variance as well as raise the mean. Goals are set against a percentile, not the mean.
7. **Wiring (M2 spike).** Parts emit signals ("bank complete", "saucer holding") and other parts or rules consume them. Real machines work this way, and it is the most literal "machine building". It is a spike because it is the riskiest to make readable.

## 4. Building blocks

### 4.1 Parts: physical, spatial, each with dials
Every part has a footprint, a shape, behaviors and **1–3 dials with trade-offs**, shown on the part itself. Built so far:

| Part | Role | Dial (trade-off) |
|---|---|---|
| Pop Bumper | Basic points, small Mult gain | Kick ↔ payout: harder kick sends the ball farther but pays less (neutral at 2; +50% at 0, −50% at 4) |
| Cha-Ching Bumper | Pays $1 per hit, low points | Kick ↔ payout |
| Big Boi | Big radius, big points and Mult | Kick ↔ payout |

The M1 target is **~10 parts that demonstrate the patterns above**: add drop-target bank, spinner, saucer, ramp, magnet, slingshot, ball printer. Each gets its own dials (spinner friction ↔ points per spin, magnet strength ↔ hold time, ramp angle ↔ speed).

### 4.2 Machine dials
Per-table settings tuned like an operator: **table tilt** (gravity; built), flipper strength and angle, bounciness, nudge sensitivity, ball weight. Same philosophy: each trades control for speed or payout.

### 4.3 Rule cards (ordered, joker-like)
About 5 slots on the backglass, resolving left to right so order is a puzzle. Examples (and the tone of voice): *Pop-Pop* (+0.1 Mult per pop-bumper hit this ball), *Combo Meal* (chain different shots within 3 s), *Ball Hog* (×2 Mult while 2+ balls are live), *Lucky Seven* (the 7th scoring event of each ball is ×7), *Righty Tighty*, *Banker*, *Layaway* (carry half your Mult to the next ball).

### 4.4 Deferred until the loop is proven
Ball types, backbox mini-games (slots, claw, wheel), cabinets as starting kits, an upper playfield, meta-progression beyond a collection log.

## 5. Economy

Round payout = base + unused balls (~$3 each) + overshoot (log tiers) + missions + interest ($1 per $5, capped) + money parts. Spending: **buy, upgrade, sell (refunds most), reroll, and Tinker Token upgrades**. Money is only meaningful because it buys *machine changes*, which is why moving and tuning are free: players should never be afraid to experiment.

Optional per-round **Missions** (2 offered, "clear the drop-target bank", "land the skill shot") pay cash and teach new parts by asking for them.

## 6. Run structure, goals and bosses

- **5 stages × 3 rounds** (Opener, Main Event, Boss) = 15 rounds, targeting a 35–45 minute winning run; Quick Run of 3 stages.
- **Goal curve:** `Goal(n) = par_score(n) × 3 balls × stake`, where `par_score` is the expected power of a competent machine at round n, measured by the balance bot against percentiles.
- **Bosses are machine stress tests:** each breaks one assumption so the machine must be re-tuned. *Cheap Rubber* (no bounce), *Slippery Slope* (strong gravity), *Loose Screws* (bumpers flicker off), *The Magnet*, *Reverse Flippers*, *Tax Man*, *Night Shift* (parts hide until hit).
- **Difficulty tiers** ("Tilt Levels"): higher goals, fewer ball saves, harsher bosses.

## 7. Support systems (subordinate to the machine)

- **Controls:** Z and / (or Shift) for flippers, Space to plunge, arrows to nudge (too much = **tilt**), Tab to cash out. Gamepad later. **Assists:** auto-plunge, longer ball save, flipper assist near the tip, slow-mo.
- **Anti-stall:** real-pinball *ball search* when the ball is still for 3.5 s, and a 90 s soft timeout. Built.
- **Presentation supports readability.** The Chaos meter scales effects with the *machine's output*. Pitch climbs a pentatonic ladder with Mult (built in M0). Effects should trace the causal chain: which part fired which. Particles come from the event stream, so new parts rarely need new VFX code.
- **Accessibility:** a Calm mode (no strobing, capped flashes), reduced shake, colour-blind-safe part colours plus shapes, scalable text, rebinding, one-handed mode, announcer captions.
- **Humor:** part names, flavor text, DMD insults, boss taunts, all as data.

## 8. Technical plan

**Stack:** TypeScript + Vite + PixiJS v8 + Box2D v3 (`phaser-box2d`, MIT) + Web Audio, shipped as a web build first. I can build and verify it in the cloud sandbox with headless Chromium; a hosted build is how *you* feel the flippers.

```
Input ─► Sim (fixed 240 Hz, deterministic, headless in Node)
          Box2D world → contacts → events → Scorer (points × Mult, ledger)
                          │
                          ▼  immutable event stream (SimEvent / ScoreEvent / GameEvent)
          Presentation (render rate, never changes the sim): Pixi, particles, audio, DMD, HUD
Data: parts / rules / bosses / callouts · Tools: balance bot, stress tests, replay, smoke test
```

What M0 established (details in the findings doc): 240 Hz fixed step; flipper-tunnelling safety net; one world per process; table geometry shared by physics and renderer; content as data (`src/data`); all randomness through a seeded RNG; 13 headless tests plus a browser smoke test.

## 9. Roadmap

| # | Milestone | Size | Exit criteria |
|---|---|---|---|
| **M0** ✅ | **Feel spike.** One table, ball, plunger, flippers, nudge/tilt, 3 part types with a Kick dial, live scoring + ledger, 3-ball rounds with goals and payout, live workshop (place, drag, tune, test ball), synth audio | S | Done: ~0% visible tunnelling, 0 escapes/stalls in 200 bot balls, ~0.2 ms/step with 20 balls, deterministic replay. **Not yet done: you playing it and judging the flipper feel (see below).** |
| **M1** | **Machine Workshop.** Undo/redo and layout slots; Tinker Tokens between balls; ball heatmap and per-ball ledger history; ~10 parts demonstrating the §3.1 patterns (bank, spinner, saucer, ramp, magnet, slingshot, ball printer); table dials; 5 rule cards; shop (buy, sell, reroll); end-of-ball Bonus tally | L | A 3-stage run is playable; you can name 3 different machines you built and why each scored |
| **M2** | **Machine depth.** Wiring spike, Lab (bot estimate of a layout), ~25 parts, ~25 rules, bosses, missions, balance bot sets the goal curve, difficulty tiers | L | Bot-tuned goals; 3+ viable archetypes; 35–45 min winning run |
| **M3** | **Spectacle (supports the machine).** Art direction, Chaos meter, shaders, DMD, light shows, adaptive audio, announcer, accessibility | L | Frame budget at max chaos; Calm mode passes a flash audit |
| **M4** | **Content and meta.** ~40 parts, ~40 rules, collection log, unlocks, tutorial, Steam wrapper | L | Content-complete demo |
| **M5** | **Playtest and launch.** Public demo, tuning, Early Access | M | Retention and run-length targets met; no soft-locks |

**What I need from you after M0:** open the hosted build and tell me (1) do the flippers feel right (strength, speed, angle), (2) is the plunger charge readable, (3) is the ledger the kind of feedback you wanted, (4) is the workshop fun to fiddle with.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Physics bugs (the genre's worst reviews) | Stress tests, fuzz, safety net, ball search; keep running them in CI |
| Skill overshadows build | Modest skill ceiling, high build ceiling, assists, variance-reducing builds |
| RNG frustration | Nudge, skill shot, Tinker Tokens, goals set against a percentile |
| Unreadable scoring | Attribution on every event; Ledger; effects that trace the chain |
| **Tuning becomes a spreadsheet chore** | Dials have few, legible trade-offs; the Lab is gated or lossy; the game rewards experimentation not optimisation |
| Crowded niche | Table-as-build, tunability, goofy tone; early public demo with a hero GIF |
| Thin content | Data-driven parts and rules; minimum catalog target before Early Access |
| Spectacle hurts performance or health | Particle cap, quality tiers, Calm mode from day one of M3 |
| Scope creep | The support test (§1) |

## 11. Open questions

| # | Question | My default |
|---|---|---|
| 1 | **"Mid-run" changes:** is my reading in §2.1 right (free between rounds, 2 Tinker Tokens between balls, nothing mid-ball)? | Yes |
| 2 | Should **wiring** (parts signal each other) be a core idea or stay a spike? | Spike in M2, promote if it reads well |
| 3 | The **Lab** (simulated estimate of your layout): ship it, gate it, or leave it out? | Ship it, limited uses per round, bot is lossy |
| 4 | Name | Ride "Free Play" until M3 |
