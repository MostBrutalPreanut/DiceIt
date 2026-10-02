# Dice it plan v0.1

> **Revision (Milestone 0 feedback):** the global poker-style combos (pair, full house, straights…) are **removed**. Every die scores on its own pips; some faces read *other dice* (neighbors, tray size, totals). The game is about **rolling a ton of dice with big pips**. Dice are cheap, targets are high, and there are **self-destructing volatile dice**. Sections 4, 6, 7, 8, 9 and the milestones reflect this. The old combo catalog is dropped (kept in git history).

Premium, single-player, web-first dice roguelite. No ads, no IAP, no timers, no energy, no cash-out.
Status: design only, no code yet. Decisions below are agreed with the designer (see §16).

---

## 1. Vision

> **Roll a ton of dice. Watch the numbers explode. Build an absurd dice engine.**

Pillars (every decision gets checked against these):
1. **Rolling feels amazing.** The roll itself is the dopamine: tumble, clatter, anticipation, a cascade of scoring. Not a button that shows a number.
2. **Luck you can lean on.** Randomness is the spice, but the player always has *levers* (build, order, nudges, rerolls) so wins feel earned and losses feel survivable.
3. **Whacky, readable builds.** Every run should produce one "I can't believe this works" moment — and the player must be able to *read* why it worked.
4. **Short, repeatable runs.** ~25 minutes, one more run always. Premium = respect the player's time; the game never makes them wait.
5. **Content is data.** New dice, faces and relics are table rows, not code. (Also what makes tuning by bot possible.)

Reference feel: Balatro (escalating target, multipliers, joker-like relics), Dicey Dungeons (dice as the build surface), Slay the Spire (run structure, bosses), Vampire-Survivors-style "numbers go crazy" payoff, original Dice It! (pips streaming to the counter, editable faces).

Theme is **deliberately undecided**. Everything user-facing (names, art, sounds) lives in a swappable "theme layer" so we can choose later (arena was the old idea; cookies / casino / dungeon / space all work).

## 2. The game in one paragraph

A **run** is a series of **rounds**. Each round gives you a **target score** and a limited number of **rolls**. Roll your dice, score every die's pips, and clear the target before rolls run out. Between rounds you visit the **shop**: upgrade faces, buy lots of new dice (including cheap, explosive **volatile** dice), buy special faces, buy relics. Rounds get harder (and every 3rd is a **Boss** with a rule-twisting modifier). Survive the final boss to win; then optionally go on into **Endless**. Each run unlocks content for future runs.

## 3. Core loop

```
START RUN (choose Starter Kit, Stake/difficulty, seed)
  └─ ROUND n:  target T, R rolls
        ROLL → dice tumble → faces resolve left→right → each die scores → cascade
        (repeat; use Nudges/Rerolls to steer luck)
        reach T?  yes → payout → SHOP → ROUND n+1
                  no (rolls out) → RUN OVER → results + unlocks → new run
  └─ BOSS every 3rd round (modifier)
  └─ Final boss cleared → WIN → Endless / higher Stake
```

### 3.1 Round structure
- **Target** grows along a curve set in data and tuned by the bot (roughly exponential, with the player's scoring growing slightly faster *if* they build well).
- **Rolls per round**: start ~6–8, modifiable by relics/specials. Rolls are the round's resource (this replaces the old "limited rolls / watch an ad" — it's now pure tension, never a paywall).
- **Overkill**: score above target *at the end of the round* converts to bonus coins, and **unused rolls** convert to coins too (Balatro-style). This rewards efficient play and keeps the old "pips flying into the counter" ritual as the payout screen.
- **Early finish**: once target is hit the player can **bank** (end round now, keep remaining rolls as coins) or **keep rolling for overkill** (risk-free, but each extra roll costs 1 saved-roll coin). The old "Cash Out" button lives on as this decision — a greed dial with no downside except opportunity cost. (Bosses can punish greed — see §7.)

### 3.2 Length target
**Target: 15–20 minutes per winning run.** 5 stages × 3 rounds (2 normal + 1 boss) = 15 rounds; ~45–60 s per round plus ~20–30 s per shop. Stage count, rolls per round (~5–7) and shop pacing are parameters; the bot tunes toward the length target. Losing runs are shorter, so a "one more run" fits in a coffee break.

## 4. Scoring

Per roll (**per-die scoring, no global combos**):
1. Every die lands on a face. Dice resolve **strictly left to right** (tray order matters, and the player can rearrange).
2. Each die scores `value × multiplier`, where the value comes from its face (plain pips, or a rule that reads other dice — see §6) and the multiplier is handed to it by a neighbor face.
3. **Roll score = sum of every die's score.** Relics (§9) can add global rules on top.
4. Round score = sum of roll scores. Pips are *score*, never spent. Spendable currency is **Coins**, earned on clear (payout) — this separates "number go up" from "can I afford it", avoiding the old "spending pips slows you down" trap, which was bad for a premium game (punishes experimenting).

Display rules: large numbers use compact notation (1.2K, 3.4M, 5e12). Every contribution animates and is individually labeled so the player can read the math (pillar 3).

**Decided:** score and coins are separate. Optional later idea: a high-Stake variant where score also is currency (the original design's tension) — cheap to test with the bot, not in v1.

## 5. Dice, faces, and the tray

### 5.1 Dice types
| Die | Faces | Notes |
|---|---|---|
| d6 | 1–6 | Start. Classic. |
| d4 / d8 / d10 / d12 / d20 | scale | Unlockable. More faces = more variance and a higher ceiling per die. |
| Coin | 2 | Heads/Tails, huge face values, great with face rules that count dice. |
| Loaded die | 6 | One face has 2× weight; unlock through relics/specials. |
| Mirror die | 6 | Copies the die to its left each roll. |
| Hex die | 6 | Faces can hold specials only, no pips (high variance build-around). |

Every die is its own object: faces, color/ID, position, modifiers. Tray capacity starts at 4, upgradable up to ~10 (relic/meta). Dice **order matters** (left→right resolution and neighbor effects) and the player can drag to rearrange between rolls.

### 5.2 Faces
Each face is either a **number** (value 1…N) or a **special** (see §8). Face states: base value, upgrades (+1 steps), attached effect.
- **Upgrade cost** rises with the face's current value (as in original design) but has *diminishing price slope* at low values so early upgrades are cheap and fun.
- **Buy a new die**: escalating prices (100, 500, 1k, 2k, 5k, 10k, 50k as original; subject to tuning, expressed in coins).
- **Remove / Replace** face is allowed (replacing a special refunds partially) so mistakes are recoverable — premium games shouldn't punish experimentation.

### 5.3 Luck levers (agency)
- **Nudge**: after a roll, spend a Nudge token to change one die ±1 (or to the adjacent face). Earned from shop/relics/rounds; a few per round.
- **Reroll one**: spend a token to re-throw a single die. 
- **Pin** (Yahtzee-style hold) is **cut for v1**; revisit after the bot and playtests show whether the game needs more steering.
- These are *limited*, so luck still matters, but the player is steering. This is the "feeling of luck" + "feeling of control" balance.

## 6. Per-die scoring & face effects

**Principle:** no global "hand" to hit. You aim to **roll high pips on many dice**. Depth comes from what a face *does with the rest of the tray*, and from how many dice you can field.

### 6.1 Resolution rules (implemented in M0, `src/core/roll.ts`)
- Left→right. A die's score = face value × the multiplier its left neighbor gave it.
- **Plain** `N`: scores N pips.
- **Mult ×k** (Doubler/Tripler): scores 0, multiplies the **die to its right** by k. A last-position Mult does nothing, so arranging matters.
- **Echo**: scores whatever the die to its **left** scored (multipliers included) — pair it after a Doubler for a copy.
- **Crowd ×N**: scores N per die in the tray — great once you own a ton of dice.
- **Sum**: scores the sum of every other die's plain number face — a "catch-up" face for big trays.
- **Boom**: scores a big number (30 in M0), then that die **self-destructs** (the last die in the tray is always spared, so a run can't go diceless).
- Dice price depends on how many you currently own, so losing a die to a Boom makes the next one cheaper (original idea).

### 6.2 Volatile dice (self-destructing, high-value)
A **Volatile die** is a cheap die (~40% of a normal die) with five normal faces and one **Boom** face (a 1-in-6 chance each roll to score ~30 and explode). It is a gamble: strong burst, but you keep re-buying it. Variants to design: bigger Boom for fewer safe faces; "Fuse" dice that explode after N rolls but score ×(rolls survived); dice that split into two when they explode.

### 6.3 More faces that look at other dice (ideas, all per-die)
- **Lonely**: +value if no other die shows the same number. **Twin**: ×2 if another die shows the same number (the old "pair", but local to the die).
- **Chain**: +1 for each die to its left showing a lower number. **Ladder**: scores the length of the ascending run it sits at the end of.
- **Magnet**: copies the highest face in the tray. **Seed**: scores nothing, permanently +1 to a random face of the die to its right.
- **Anchor**: counts double for **Sum/Crowd** reads. **Parity**: ×2 if every die to its left is even (or odd).
- **Last Call** (only scores on the last roll of the round), **Opener** (first roll), **Snowball** (+1 each time it lands, resets per round).
Everything is a row in `content/specials.ts` plus, for a brand-new rule, one `case` in the resolver.

### 6.4 Scaling and the "ton of dice" goal
Pips-only scoring is linear in dice count, so pacing comes from three levers:
1. **Cheap dice.** Dice price grows slowly (×1.25 per die owned), so you can field 10–16 dice by mid-run. (M0 finding: with cheaper dice, bots reach ~9–11 dice.)
2. **Higher targets.** Targets grow faster than a single die can keep up with; you must add dice and multiplier faces.
3. **Multiplier faces** (Doubler/Tripler/Echo/Sum/Crowd) create the compounding that linear pips lack.
Bulk shop actions (**upgrade a whole die +1 on every face**, later "upgrade all dice") keep the shop fast when you own many dice.

## 7. Boss rounds & modifiers

A boss round replaces/adds a **rule** for one round; telegraphed one round ahead so the player can prepare in the shop.
Examples:
- **Frost**: the first roll of the round doesn't score.
- **No Nudges**: nudge tokens disabled.
- **Heavy**: only even faces score pips.
- **Silence**: special faces score 0 — pure pips.
- **Famine**: rolls −2, target −20%.
- **Greedy**: banking early is disabled / overkill cost doubled.
- **Shrink**: one random die is held under a cup (can't be seen until after the roll).
- **Fragile**: bomb faces explode twice as hard.
- **Mimic**: the highest-scoring die of each roll scores 0.
Final boss: layers 2 modifiers and a huge target.

## 8. Specials (faces that do things)

Data-driven (price, rarity, weight, trigger, effect). Shared **shop of 3** (as original) with reroll (price escalates per reroll within a shop visit); buying removes it from the pool for this run.

### 8.1 Edit faces (modify the target face)
- **+1 / +2 / +3**: add pips (multi-level upgrade).
- **Set N**: replace face with a specific number (9–50; price 100×N−5×N as original).
- **Copy**: face becomes a copy of the face to its left.
- **Flip**: swap with opposite face.

### 8.2 Triggered faces (when this face is rolled)
- **+1 Roll** (extra roll).
- **Coin**: +N coins immediately.
- **Spark**: reroll a neighbor die.
- **Duplicate**: rolls an extra copy of this die.
- **Echo**: re-score this die's value once more.
- **Lucky**: rerolls itself once if it's the lowest value.

### 8.3 Scaling faces
- **Grow (^)**: +1 pip each time rolled (as original "arrow"), resets after round or never — variant faces.
- **×2 / ×3 neighbor**: doubles / triples the die next to it.
- **== (Sum)**: shows the sum of all other dice.
- **Dice ×N**: value = (# of dice) × N.
- **% Weight**: this face is more likely to be rolled (+5/10/15/20% chance).

### 8.4 Risk faces
- **Bomb xN**: blow up and reroll all dice; after N uses the die is destroyed (compensate: cheaper next die). Original idea, kept.
- **Gamble**: ×5 or 0, 50/50.
- **Cursed Gold**: big pips, but adds a penalty die to the next round's tray.
- **Hex**: score nothing but permanently +1 to every face of its die when rolled.

### 8.5 Wild / Meta
- **Wild**: counts as any number for faces that read other dice (Twin, Chain, Sum…). **Decided: the player chooses** the value after rolling; UI previews the score for each choice.
- **Gold**: banks coins directly.
- **Diamond**: rare meta resource (original idea). Unlocks cosmetic/theme options and special unlock tokens at run end.

## 9. Relics (run-wide passives)

Not faces: persistent rules, 5 slots, bought in the shop (this gives the Balatro "joker" build layer on top of the dice layer). Examples:
- **Loaded Pockets**: start each round with 2 extra Nudges.
- **Tray Upgrade**: +1 die slot.
- **Metronome**: every 3rd roll ×2.
- **Chain Smoker**: each Mult face that fires this roll adds +1 to the next Mult face.
- **Crowd Pleaser**: dice beyond the 8th score +1 each.
- **Rabbit's Foot**: first reroll each round is free.
- **Banker**: +10% interest on coins (cap).
- **Odd Job**: odd values score +2.
- **Demolition Crew**: when a die self-destructs, a free random special is added to the shop.
Relic limit keeps builds sharp; the sixth relic replaces one.

## 10. Meta-progression (unlock, don't power-creep)

Premium roguelite principle: unlocks widen *options*, not raw power.
- **Codex**: every face, die, relic seen is recorded (completion % is the long-term goal).
- **Unlock tree via play**: milestones unlock new content into the pool (e.g., "win a run with only one die" unlocks Coin; "own 12 dice" unlocks d20). No grind currency required.
- **Starter Kits** (choose at run start): Classic (1 d6), Twin (2 d6 weak), Gambler (d4 + bombs), Collector (extra relic slot, fewer rolls), etc.
- **Stakes** (difficulty ladder 1–8): each stake adds a rule (fewer rolls, pricier shop, tougher bosses, cursed starts). Winning at a stake unlocks the next.
- **Daily Seed**: deterministic from the date (no server needed), personal best stored locally; share-as-text result.
- **Run seeds**: any seed is shareable ("try seed ABC123").
- **Endless**: after final boss, targets keep scaling; high score on each stake.

## 11. Roll feel — making 2D rolling feel lucky (key section)

Rolling is deterministic first, visual second: **the core decides the outcome (seeded RNG), then the animation is built to land on it.** That gives fair, testable, replayable runs and total freedom with the 2D art.

Roll sequence (≈0.6–1.2s normal, <0.3s fast-mode, hold-to-roll chains them):
1. **Throw**: dice launch from the tap/button position (or off-screen edge) with random spin/arc, slight scale-up (pop).
2. **Tumble**: faces **cycle quickly** (rapid-fire random frames) with motion blur / squash-and-stretch. Dice bounce off the tray walls with simple fake physics (circle/rounded-rect collision between dice and walls, impulse-based, no heavy physics engine) — dice can *clack into each other* for sound and tiny screen shake.
3. **Anticipation**: dice slow, the face cycling decelerates through 2–3 "near" values (the slot-machine-style near-miss beat), then settles with a tiny bounce.
4. **Land** staggered (60–120 ms apart, left→right) so the ear hears a rhythm.
5. **Cascade**: each die **pulses** as it scores, left to right (pip-fly to the counter with rising pitch, per original); Doubler/Echo links visibly pass their effect to the next die; Booms explode; then relics. The player always sees the math.
6. **Reactions** scale with rarity: screen shake, flash, slow-mo hit-stop on huge dice scores and Booms, particle bursts, haptic on mobile.
Quality of life: tap anywhere to skip the cascade; hold to auto-roll; "reduced motion" toggle; every juice effect is a setting.

Sound: pooled randomized clack samples per die (voice-limited to avoid mush), distinct material per die type, pitch-ramped pip pings, crowd/ambience layer that responds to combo rarity. Sound is ~half of the "luck" feeling — budget time for it.

Optional later: 3D dice render to pre-baked sprite frames (cheat 3D inside a 2D engine) if we want that look without physics.

## 12. UX / screens

Portrait-first layout (matches the original mock; scales to landscape desktop with the tray centered and shop in a side panel).
- **Round screen**: tray center; score vs target meter top; rolls left; coins; ROLL button bottom (big, thumb-friendly); relic bar; nudge tokens; per-die score log (collapsible).
- **Shop**: tabs/sections — Dice (faces upgrade grid, buy die / volatile die, upgrade whole die), Specials (shared 3 + reroll), Relics. Clear price tags, "can afford" state, undo for the last purchase.
- **Codex**, **Run summary**, **Settings** (reduced motion, volume, speed, colorblind palette), **Start screen** (kit, stake, seed).
- Accessibility: colorblind-safe die colors + shapes, scalable text, no reliance on audio, full keyboard (Space = roll).
- No dark patterns, no popups, no wait. Autosave after each round/shop so closing the tab never loses a run.

## 13. Technical design

### 13.1 Stack
- **Language**: TypeScript. **Bundler**: Vite. **Rendering**: **Pixi.js v8** (WebGL/WebGPU, 2D, sprites, filters, particles) — an excellent fit for lots of sprites, tweens and juice.
- **UI**: HTML/CSS (DOM) layered over the canvas for menus, shop and text-heavy screens (accessible, easy to iterate); Pixi only for the tray and effects.
- **Animation**: GSAP (or Pixi ticker + small tween util); particles via Pixi or a small custom emitter.
- **Audio**: Howler.js (or WebAudio directly) with sprite sheets + voice pooling.
- **Tests**: Vitest (unit + simulation). **State**: plain TypeScript objects; no framework needed.
- **Save**: localStorage / IndexedDB, versioned schema.
- **Packaging later**: PWA (installable, offline); optional Steam via Electron/Tauri if desired.

### 13.2 Architecture (strict separation)
```
core/       pure TypeScript, no DOM, no Pixi. Deterministic given (seed, inputs).
  rng, dice, faces, relics, shop, economy, round/run state machine
  roll() returns an ordered EVENT STREAM: [Landed(die,face), DieScored(die,value,mult), Destroyed(die), Score(total), ...]
content/    data tables (JSON/TS): dice, specials, relics, bosses, stakes, prices, curves
view/       Pixi + DOM; plays the event stream as animations (skip/speed just scales the timeline)
sim/        headless bot runner (Node CLI) importing core + content
```
Key idea: the **event stream** is the contract. The core never knows about animation; the view never computes scoring. This makes the bot, replays, tests, and the juice all use one source of truth.

### 13.3 The tuning bot (sim)
- Plays full runs headlessly at thousands per second using the same `core`.
- **Policies**: random; greedy (buy best immediate score); heuristic (value-weighted shopper with archetype goals: multiplier chains / crowd / volatile dice); optional search (beam/MCTS) for upper-bound "skilled" play.
- **Metrics**: win rate by stake and policy, average round reached, run length, coin curve, shop pick rates vs win rate (flags OP/useless items), special-face trigger frequency by dice count (are all faces reachable and worth buying?), variance of outcomes (is luck vs skill balanced?), "dominant strategy" detector.
- **Outputs**: CSV/HTML report; run in CI as a regression gate ("win rate for baseline policy at Stake 1 stays 20–35%").
- Designer-facing: tweak a table → rerun → see impact. Replaces the old doc's "minor playtest and research work".

### 13.4 Content pipeline
Content tables define: id, name key, rarity, base price, weight, trigger, effect-params. Effects are composed from a small library of primitives (AddPips, MultiplyNeighbor, GrantRoll, Reroll, Bomb…) so new specials are mostly data; truly new mechanics add one primitive. A schema validator runs in CI so bad data fails fast.

### 13.5 Cost to build, host and run
- **Pixi.js**: MIT license, **free**, no royalties. Also free: Vite, TypeScript, Vitest, Howler, GSAP (check GSAP's current license terms for commercial use; it is currently free for most uses).
- **Hosting**: a static site (a few MB). **$0** on GitHub Pages, Cloudflare Pages, Netlify or itch.io free tiers. Bandwidth for a small personal game is a non-issue. No server needed (daily seed is date-derived; saves are local).
- **Optional costs**: domain ~ $10–15/yr; later Steam release is a one-time ~$100 app fee (assuming current pricing — verify); asset creation (art/sound) is the only real cost — use CC0 packs (Kenney, freesound) or generate SFX with a tool like jsfxr while prototyping.
- **Tooling**: free. Total out-of-pocket to start: $0.

## 14. Milestones (revised, premium/web)

0. **Spreadsheet/sim spike (1–3 days)** — implement core per-die scoring + specials + bots in Node. Prove the target curve and that dombos are reachable. No graphics.
1. **Rolling feel prototype (the most important milestone)** — Pixi page with 1–8 dice, throw → tumble → land → cascade, sounds, juice. *Pass criterion: rolling 8 dice and watching pips fly is fun with zero game around it.*
2. **Playable run** — round loop, shop, upgrades, ~25 specials, 2–3 volatile dice, 5 relics, 1 boss rule, save/load.
3. **Tuning pass with bot** — curves, prices, dominant strategy removal, stakes 1–3.
4. **Content & polish** — Codex, kits, unlocks, daily seed, accessibility, settings, tutorial-by-play (first round teaches roll → upgrade → shop).
5. **Theme & art pass** — pick the theme, replace placeholders (the theme layer makes this a reskin).
6. **Release to itch.io/web** (+ optional Steam wrap). Post-launch: new dice/faces/relic packs as data.

## 15. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Scoring math unreadable → "numbers soup" | Per-contribution labels, cascade order fixed, per-die score log, slow-replay of last roll |
| Runs plateau/dominant build | Bot detects it; stakes and boss mods push variety; relic cap |
| Rolling gets tedious at high dice counts | Fast-mode, skip, hold-to-roll; cascade time is capped regardless of dice count |
| 2D dice don't feel "lucky" | Milestone 1 is dedicated to feel; deterministic outcome allows near-miss anticipation, sound, hit-stop |
| Scope creep from infinite content | Data-driven content; MVP = ~25 specials/5 relics/few dice types; rest are content drops |
| Linear pips plateau / specials dominate | Bot reports pick rates and score-by-source; tune multiplier face prices; cap multiplier chains |

## 16. Decisions log & open questions

**Decided**
1. Premium, single-player, web-first (Pixi.js + TypeScript). No ads, IAP, timers, energy or real-money cash-out.
2. Run structure: rounds with target + roll budget, bosses every 3rd round, shop between rounds.
3. Score (never spent) and coins (spent) are **separate currencies**.
4. **Pin is cut** from v1.
5. **Wild faces: player chooses** the value.
6. **Run length 15–20 min** (5 stages × 3 rounds as the starting parameter).
7. 2D dice; rolling feel via deterministic outcome + animation. No skins for now; theme deferred.
8. Tuning bot is a first-class deliverable.

**Open (not blocking milestone 0–1)**
1. Theme/name (decide around Milestone 5).
2. Exact special/relic counts for the MVP cut (currently ~25 specials / 5 relics).
3. Whether Nudge/Reroll tokens are enough agency once the bot reports on luck-vs-skill variance.
4. Landscape/desktop layout details after the portrait prototype.
