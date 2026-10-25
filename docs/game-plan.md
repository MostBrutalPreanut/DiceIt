# Pinball roguelite: game plan v0.1

Working title: **TBD** (candidates: *Free Play*, *Extra Ball*, *Kickback*, *Tilt!*, *Wizard Mode*).
Status: planning only, no code yet. Research and sources are in [genre-research.md](genre-research.md). All numbers here are **starting values to be tuned by simulation and playtests**, not commitments.

---

## 1. Vision and pillars

> **Build a pinball machine that shouldn't exist, then watch it go off.**

You start with a bare table: two flippers, a plunger, and a few basic bumpers. Each round you fire 3 balls at a points goal. Winning earns money; money buys parts, which you place on the table; the table gets prettier, louder and sillier until it's a fireworks show. You lose when you can't reach a goal.

1. **The table is the build.** Parts are placed in space, so the layout is the puzzle and the machine is the character. (This is the gap in the market; see research §2.)
2. **Real pinball logic.** Parts reward *shots and sequences*: ramps, orbits, drop-target banks, lit lanes, locks, multiball. Not just "touch things".
3. **Readable chaos.** Every point is attributed. At any moment the player can see their current Mult and why it grew. The outcome stays unknowable; the *mechanics* never do.
4. **Skill helps, build wins.** Flippers give agency, but a strong build beats a good flipper hand. Assist options keep it accessible.
5. **Escalating spectacle, funny to the core.** A run visibly gets crazier. An announcer, part names and flavor text carry the humor.
6. **Respect the player's time.** Short balls, instant restarts, skippable tallies, no stalling exploits.
7. **Content is data.** Parts, rules and bosses are table rows, not code. This also makes headless balancing and mods possible.

## 2. Core loop

```
START RUN  (pick Cabinet, difficulty tier, seed)
 └─ ROUND:  goal G, 3 balls
      Plunge → play ball → drain → Ball Bonus tally
      goal reached?  yes → ball keeps going until drain → PAYOUT → SHOP/BUILD
                     no, balls left → next ball
                     no, no balls  → RUN OVER → unlocks → new run
 └─ every 3rd round = BOSS (rule-twisting modifier)
 └─ clear the last boss → WIN → Endless mode
```

### 2.1 The ball
- Hold and release the plunger for the **skill shot** (aim a shot into a lit lane for bonus money).
- Live scoring: each event adds `points × Mult` to the round score immediately, on a ticking score display.
- **Mult** starts each ball at the cabinet's base value and is raised by parts and rules during the ball. It resets on drain unless a rule says otherwise. Growing it is the arc of a ball: build, then cash in.
- On drain: a short **Ball Bonus** tally (classic pinball ritual), skippable. Bonus is `bonus pool × Bonus-X`, where lit lanes raise Bonus-X. *To prototype both ways:* a live-only version and live + end-of-ball bonus, and keep the one that feels better.
- **Goal reached mid-ball:** a "GOAL!" banner, the ball keeps playing, and extra points count as **Overshoot** (converted to money at drain). A **Cash Out** key lets the player end the round instantly instead of waiting.
- **Stuck-ball and stalling rules:** real pinball's *ball search* is our answer. If the ball is nearly still for ~4 s, it triggers a fun "ball search" (kickers fire, lights flash). A soft per-ball clock (~90 s) ends the ball with a "TILT-TIMEOUT" gag. This prevents flipper-cradling stalls and keeps balls short.

### 2.2 Money (what the user asked for)
Payout at round end = sum of:
- **Base** for the round (grows per stage).
- **Unused balls:** about $3 each. Clearing on ball 1 means two unused balls.
- **Overshoot:** a tiered bonus for each doubling over the goal (log scale so it can't run away).
- **Missions** (see §4.4): optional per-round goals on the backglass ("clear the drop-target bank", "trigger multiball", "land the skill shot"), each worth cash.
- **Interest:** $1 per $5 held, capped. Creates the save-vs-spend tension that makes shops interesting.
- **Parts that make money:** Coin bumpers, an ATM saucer, and similar.

### 2.3 Run structure
- **5 stages × 3 rounds** (Opener, Main Event, Boss) = 15 rounds. At roughly 3 balls × 45 s + a short shop, a winning run lands near **35–45 minutes**, with a Quick Run mode of 3 stages. Tune this against the sim and playtests.
- **Goal curve:** `Goal(n) = par_score(n) × 3 balls × stake_factor`, where `par_score` is the *designer-defined expected power* of a competent build at round n. Bots measure whether the real curve matches.
- **Variance control:** one design lever matters here. The relative spread of total score shrinks as the number of scoring events grows, so **multiball and ball-spawner builds reduce variance as well as raise the mean**. The goal curve is set against a percentile (e.g. a par build clears on its second ball about 70% of the time), not the mean, so bad luck rarely ends a good build.
- **Bosses** each change the physics or rules, pinball-flavoured. Examples: *Loose Screws* (bumpers flicker off at random), *Cheap Rubber* (no bounce), *The Magnet* (a gravity well appears), *Reverse Flippers*, *Tax Man* ($ lost per drain), *Night Shift* (parts hide until hit), *Slippery Slope* (stronger gravity).
- **Difficulty tiers** ("Tilt Levels" 1–8): higher goals, fewer ball saves, sticky boss modifiers.

## 3. The shop and the Build phase

Between rounds: **Shop** (3–4 parts, 1–2 rule cards, one mystery pack, reroll, sell) then **Build** (place and rotate parts, then optionally try a **Test Ball**).

- **Placement:** parts snap to a grid, rotate, and have a footprint. A protected keep-out zone around the flippers, drain and plunger lane guarantees the table always stays playable. Cabinet upgrades unlock more room, including an **upper playfield** later.
- **Test Ball:** a free, unscored ball in the Build phase. Tinkering and playing with your machine is the game's playground.
- **Layout validator and heatmap** (a tool and a feature): a headless sim fires ~200 random launches at your layout and warns about ball traps, dead zones and infinite loops, then shows a **heatmap** of where balls actually travelled. It both protects against soft-locks and teaches placement.
- Selling and moving parts is cheap, so experimenting is never punished.

## 4. Content model

### 4.1 Parts (physical, spatial)
Starting kit: 2 flippers, 2 slingshots, 3 basic pop bumpers, plunger, outlane kickback. Draft catalog of about 40 parts for the first release, by family:

| Family | Examples | Idea |
|---|---|---|
| **Bumpers** | Pop, Coin, Mult, Mega, Chain (charges neighbors), Cursed (big points, costs money) | Core scoring and economy |
| **Targets** | Standup, Drop-target bank (completing it pays out and resets), Captive ball | Bank-clear rewards, order-based payouts |
| **Lanes** | A-B-C rollovers, Skill-shot lane, Return lanes | Lighting all lanes raises Bonus-X |
| **Shots** | Ramp, Orbit/Loop, Spinner, Combo Gate | Chain different shots within ~3 s for a growing combo |
| **Holders** | Saucer, Scoop, Lock | Hold then eject; locks feed multiball; mystery award |
| **Movers** | Magnet, Fan, Gravity well, Teleporter | Change the ball's path, enable wild builds |
| **Ball makers** | Ball Printer, Multiball Lock | More balls: higher ceiling, lower variance |
| **Flipper kit** | Extra flippers, bigger/stronger flippers, mid-table flipper | Agency and shot access |
| **Backbox** | Slot machine, claw, wheel-of-fortune mini-game | Mystery awards; a classic trope |

### 4.2 Rule cards (non-spatial, ordered)
About 5 slots on the backglass, resolved **left to right** like Balatro jokers, so ordering them is a puzzle. Draft examples (also the tone of voice for names):
- *Pop-Pop:* each pop-bumper hit this ball adds +0.1 Mult.
- *Combo Meal:* chaining different shot types within 3 s multiplies the combo.
- *Ball Hog:* ×2 Mult while 2 or more balls are in play.
- *Lucky Seven:* the 7th scoring event of each ball is worth ×7.
- *Righty Tighty:* hits made right after the right flipper fires count double.
- *Banker:* each drained ball pays $1.
- *Sticky Fingers:* saucers hold 1 s longer and add +Mult.
- *Layaway:* carry half your Mult into the next ball.

### 4.3 Cabinets and balls
- **Cabinets** are starting kits: *Classic* (balanced), *Pachinko Cab* (vertical, begins with pegs), *Mini* (small, cheap parts), *Wide Body* (extra room, fewer ball saves), *Junkyard* (random parts). Unlocked by play.
- **Balls** (later): steel, rubber, glass, gold, magnetic, bomb. Each changes physics and scoring. Think of them as Peglin orbs.

### 4.4 Missions
Optional backglass goals each round (2 offered): cash rewards, rotating each round. They are the money-making goals the user asked for, and they teach players new parts by asking for them.

### 4.5 Meta-progression
Codex (every part, rule, boss), unlock-by-achievement for parts and cabinets, difficulty tiers, seeds, daily seed (offers and bosses are seeded; physics itself is not replay-verified).

## 5. Controls, assists and accessibility

- **Keyboard:** Z and / (or Shift keys) for flippers; Space for the plunger; arrow keys to nudge; Tab for Cash Out. Gamepad triggers. Touch (left/right halves) later.
- **Nudge and tilt:** nudging costs "Tilt meter"; overdoing it tilts the ball and disables flippers. This is a core risk/reward verb.
- **Assists (all optional):** auto-plunge, longer ball save, flipper assist when the ball is near the tip, slow-mo.
- **Accessibility:** a photosensitivity "Calm" mode (cap flashes, no strobe), reduced screen shake, colour-blind-safe part colors plus shapes, scalable text, full key rebinding, one-handed mode, captions for the announcer.

## 6. Presentation: pretty, funny, escalating

**Art direction.** 2D physics with 2.5D rendering: layered sprites, drop shadows, bloom, a ball that scales and shadows when on a ramp (collision layers switch on the ramp). Each stage is a different *machine theme* with its own backglass and palette; classic pinball themes are a goldmine for parody. Because there is no artist on the team, the style leans on things code can do well: neon vectors, glow, a **dot-matrix display** for text and animations, lit inserts, and procedurally generated part art, with hand-made art added where it matters most.

**The Chaos meter.** One value, driven by round score vs goal, Mult size and balls in play, controls presentation intensity in tiers:
0. Clean and quiet
1. Sparks and chimes
2. Screen shake, bloom, music layer 2
3. Hit-stop on big hits, zoom punch, light shows, multiball fireworks
4. "Wizard": full-screen takeover, kaleidoscope trails

Particles and shaders are generated from the *event stream* (§7), so adding a new part rarely needs new VFX code.

**Sound.** Web Audio. Rising pentatonic pitch ladder on combo/Mult growth, solenoid thunks and bells layered with synth, adaptive music stems keyed to the Chaos meter. Announcer callouts as DMD text first; a voiced announcer is an open decision (§10). I (Claude) cannot hear audio, so sound is built by feel loop with the user.

**Humor.** Part names, flavor text, DMD insults when you drain, boss taunts, and a deliberately snarky announcer. Write them as a data file so they scale.

**Performance budget.** 60 fps on a mid laptop and Steam Deck, with pooled GPU particles, a particle cap and quality tiers.

## 7. Technical plan

### 7.1 Stack (recommended)
**TypeScript + Vite + PixiJS v8 + Box2D v3 (Phaser Box2D, MIT) + Web Audio**, shipped first as a web build (itch.io / GitHub Pages) and later wrapped for Steam (Electron or Tauri).

Why web-first:
- I can **build and verify it in this cloud sandbox**: Node 22, npm registry access and headless Chromium with WebGL2 were all confirmed working. Headless Playwright can screenshot, run the sim and smoke-test builds.
- A playable link is the fastest way to get *your* hands on the flippers, which is the thing I can't test.
- Cost: JS physics is slower than native, and Steam packaging is a later step.

Alternatives considered:
- **Godot 4:** great editor and Steam export; flipper physics works but needs the kinematic-body workarounds in the research; harder for me to run and verify headlessly here.
- **Unity:** heaviest, licence and CI overhead, and nothing I can run to verify visually here.
- **Rapier (WASM) or planck.js** instead of Box2D v3: fallbacks if M0's spike fails.

### 7.2 Architecture

```
Input (keys / gamepad / touch)
        │
        ▼
┌──────── Sim (fixed timestep, deterministic, runs headless in Node) ────────┐
│ Box2D world → contacts + sensors → Event bus → Rules engine (ordered)       │
│                                              → Score pipeline → Run state   │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  ▼  immutable stream of PhysicsEvents / ScoreEvents
┌──────── Presentation (render rate, can never change the sim) ──────────────┐
│ Pixi renderer · particles · shaders · Audio · DMD · Build/Shop UI · Camera   │
└──────────────────────────────────────────────────────────────────────────────┘
Data: parts/*.json · rules/*.json · bosses/*.json · callouts.json  (content = data)
Tools: headless balance sim · replay recorder/player · layout validator · debug overlay
```

Key decisions:
- **Sim and presentation are separate.** The sim emits events (`BumperHit`, `RampComplete`, `MultChanged`, ...); presentation only listens. This gives headless balancing, replay tests, and VFX that scale with content.
- **Fixed timestep** (start at 120 Hz with Box2D substeps). The ball is a bullet body; flippers are motorised revolute joints with hard limits; tunnelling is tested explicitly (§8, M0).
- **Parts are composed from behaviors** declared in data: `OnHit → addPoints / addMult / addMoney`, `Bank → onComplete`, `Charge → release`, `Hold → eject`, `Spawn(ball)`, `Mover(force)`. Rule cards are `trigger → condition → effect` with an explicit resolution order. Anything not expressible gets a small, named code behavior.
- **Seeded RNG** for offers, bosses and missions, kept separate from physics.
- **Mod-friendliness:** keep the data schema stable and documented from the start. Ballionaire's Lua-based Workshop mod support is reported as a plus.

### 7.3 Testing and tooling
- **Vitest** for the sim and scoring pipeline (unit tests on rule ordering and economy).
- **Golden replays:** record inputs, replay headlessly, and assert the score; any physics change that moves results is flagged.
- **Stress tests:** a flipper hitting a fast ball at 60 and 120 Hz; 20-ball multiball; ball-through-wall fuzzing with random launches. (This is the direct answer to the Cult of PiN reviews.)
- **Balance bot:** a simple flipping policy plays thousands of balls on candidate layouts and prints the score distribution per build, used to set the goal curve and check variance.
- **Playwright** smoke tests and screenshots for UI and rendering regressions.

### 7.4 What needs you
I can build, test and screenshot almost everything here. I **can't feel the flippers or hear the sound**. So each milestone ends with a playable web link and a short checklist for you ("does the flipper feel right?", "is this shop readable?").

## 8. Roadmap

| # | Milestone | Size | Exit criteria |
|---|---|---|---|
| **M0** | **Feel spike.** Repo scaffold, one table, ball, plunger, two flippers, 3 balls; compare Box2D v3 (Phaser) and Rapier on tunnelling, 20-ball perf and replay determinism | S | Zero tunnelling in 10k random fast-ball flipper hits; 60 fps with 10 balls; flippers feel right to *you*; engine chosen with data |
| **M1** | **Vertical slice.** Scoring pipeline with live Mult and Ball Bonus, rounds and goals, payout, shop, placement editor with Test Ball, 10 parts, 5 rules, 1 boss, save/load | L | A full 3-stage run is playable, greybox art; economy is not trivially exploitable |
| **M2** | **Build depth.** ~30 parts, ~25 rules, 5 boss modifiers, missions, layout validator + heatmap, balance bot, difficulty tiers, seeds | L | Bot-tuned goal curve; at least 3 distinct viable build archetypes; a run takes 35–45 min |
| **M3** | **Spectacle pass.** Art direction, Chaos meter, particles/shaders, DMD, lit inserts, audio, announcer, accessibility modes | L | Hits the frame budget at max chaos; Calm mode passes a flash audit; playtesters laugh |
| **M4** | **Content and meta.** ~40 parts, ~40 rules, cabinets, codex, unlocks, daily seed, Steam wrapper, tutorial | L | Content-complete demo suitable for a Next Fest |
| **M5** | **Playtest and launch.** Public web demo, wishlist push, tuning, then Early Access | M | Retention and run-length targets met; no soft-lock bugs open |

Principles: ship a playable build at every milestone; cut parts, never physics robustness; add content only through the data schema.

## 9. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Physics bugs** (ball escapes, flipper phasing) | Cult of PiN's worst reviews | M0 stress tests, replay goldens, ball-through-wall fuzzing, stuck-ball detection, a "ball respawn" safety net |
| **Skill overshadows build** | Named criticism of PiN-style games | Modest flipper skill ceiling, high build ceiling, assist options, variance-reducing multiball builds |
| **RNG frustration** | Top complaint about Ballionaire | Nudge, skill shot, ball save, goals set against a percentile not the mean |
| **Unreadable scoring** | The GMTK critique | Every point attributed on-screen; live Mult always visible; slow "replay" of a big chain |
| **Crowded niche** (7+ pinball roguelites in H2 2026) | Discoverability | The table-as-build + real-pinball-logic + humor pitch; a hero GIF of a screen-filling multiball; early public demo |
| **Thin content** | Cult of PiN and Runix criticised for it | Data-driven content, a minimum catalog target for Early Access, rules AND parts for combinatorics |
| **Spectacle hurts performance or health** | Particles, strobing | Particle cap, quality tiers, Calm mode, flash limits from day one of M3 |
| **Scope creep** (3D, mobile, online) | Kills solo projects | 2D physics, web/desktop first; leaderboards and mobile are post-launch |
| **Asset production** | No artist or composer | Procedural/vector style, CC0 audio as placeholders, budget for key art, music and announcer later |

## 10. Decisions needed from you

| # | Question | My default |
|---|---|---|
| 1 | **Platform:** web-first (itch.io) then Steam wrapper? | Yes |
| 2 | **Theme/tone:** neon arcade, or goofy "funhouse" with a different theme per machine? | Funhouse, a different machine theme each stage, neon as the base look |
| 3 | **Announcer:** text-only, TTS, or a hired voice? | Text on the DMD first, decide on voice later |
| 4 | **Skill vs automation:** are flippers fully manual with assists optional? | Manual with assists |
| 5 | **Scoring feel:** live ticking score, end-of-ball tally, or both? | Both, A/B tested in M1 |
| 6 | **Name:** pick one or let it ride until M3 | Ride until M3 |
