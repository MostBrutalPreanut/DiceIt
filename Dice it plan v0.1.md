# Dice it plan v0.1

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
5. **Content is data.** New dice, faces, combos and relics are table rows, not code. (Also what makes tuning by bot possible.)

Reference feel: Balatro (escalating target, multipliers, joker-like relics), Dicey Dungeons (dice as the build surface), Slay the Spire (run structure, bosses), Vampire-Survivors-style "numbers go crazy" payoff, original Dice It! (pips streaming to the counter, editable faces).

Theme is **deliberately undecided**. Everything user-facing (names, art, sounds) lives in a swappable "theme layer" so we can choose later (arena was the old idea; cookies / casino / dungeon / space all work).

## 2. The game in one paragraph

A **run** is a series of **rounds**. Each round gives you a **target score** and a limited number of **rolls**. Roll your dice, score from pips and **combos**, and clear the target before rolls run out. Between rounds you visit the **shop**: upgrade faces, buy new dice, buy special faces, learn and level combos, buy relics. Rounds get harder (and every 3rd is a **Boss** with a rule-twisting modifier). Survive the final boss to win; then optionally go on into **Endless**. Each run unlocks content for future runs.

## 3. Core loop

```
START RUN (choose Starter Kit, Stake/difficulty, seed)
  └─ ROUND n:  target T, R rolls
        ROLL → dice tumble → faces resolve → combos fire → score cascade
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

Per roll:
1. **Base** = sum of all dice values after face effects.
2. **Combos** each add flat **Chips** (added to Base) and/or **Mult**. See §6.
3. **Roll score = (Base + ΣChips) × (1 + ΣMult)**, relics apply last in a defined order.
4. Round score = sum of roll scores. Pips are *score*, never spent. Spendable currency is **Coins**, earned on clear (payout) — this separates "number go up" from "can I afford it", avoiding the old "spending pips slows you down" trap, which was bad for a premium game (punishes experimenting).

Display rules: large numbers use compact notation (1.2K, 3.4M, 5e12). Every contribution animates and is individually labeled so the player can read the math (pillar 3).

**Decided:** score and coins are separate. Optional later idea: a high-Stake variant where score also is currency (the original design's tension) — cheap to test with the bot, not in v1.

## 5. Dice, faces, and the tray

### 5.1 Dice types
| Die | Faces | Notes |
|---|---|---|
| d6 | 1–6 | Start. Classic. |
| d4 / d8 / d10 / d12 / d20 | scale | Unlockable. More faces = more variance and higher ceiling, harder combos (straights need more distinct values). |
| Coin | 2 | Heads/Tails, huge face values, great for combos by count. |
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

## 6. Combos (the big list)

### 6.1 Rules
- Combos are detected on the **final dice values of a roll** (after nudges).
- Combos belong to **families**. Within one family only the **highest** matching tier fires (Triple doesn't also fire Pair). **All families can fire at once** (Pair + Even Steven + Lucky Seven = a three-hit cascade).
- Combos require a minimum dice count; low-dice builds always have *something* reachable (pairs, sums, parity, extremes) while big builds unlock the wild stuff.
- Each combo has a **level** (starts 1). Shop sells "Combo Training" which levels one combo: +Chips and +Mult scale per level (Balatro-style hand levels). This gives long-term build identity ("I'm a Straights deck").
- Combos have **rarity** controlling how often they're offered in the shop (not whether they can fire). Common = trivially reachable; Legendary = "once a run" thrill.
- **Secret combos** are hidden until first triggered, then added to the **Codex** (premium collection hook + wiki-level discovery).
- On trigger: named banner + crowd/UI/audio reaction proportional to rarity.

### 6.2 Combo catalog (draft ~60; "N" = die max face, "#" = dice count)

**A. Matching** (family: Sets)
1. Pair — 2 dice show the same value *(C)*
2. Two Pair *(C)*
3. Triple *(C)*
4. Full House — 3 + 2 *(U)*
5. Four of a Kind *(U)*
6. Five of a Kind *(R)*
7. Six of a Kind — "Sextet" *(E)*
8. Double Triple — two separate triples *(E)*
9. Everyone's the Same — every die identical (≥4 dice) *(L)*

**B. Sequences** (family: Runs)
10. Short Straight — 3 consecutive values *(C)*
11. Straight — 4 consecutive *(U)*
12. Big Straight — 5 consecutive *(R)*
13. Full Straight — 6+ consecutive *(E)*
14. Skip Run — 2-4-6 / 1-3-5 / any step-2 chain of 3+ *(U)*
15. Double Run — two separate runs of 3 *(E)*
16. Royal Flush — top 5 values of a d12/d20 (e.g., 10-11-12-13-14 style) *(L)*

**C. Parity & Range**
17. Even Steven — all dice even *(C)*
18. Odd Squad — all dice odd *(C)*
19. Odd/Even Alternation — dice in tray order alternate parity *(U)*
20. Low Roller — all dice ≤ 2 (≤ N/3) *(U)*
21. High Roller — all dice ≥ N−1 *(U)*
22. Full Spectrum — every die has a different value (≥4 dice) *(R)*
23. Bookends — contains both a 1 and an N *(U)*
24. Max Out — every die shows its own maximum face *(L)*
25. Snake Eyes — exactly two 1s *(C)*
26. Box Cars — exactly two Ns *(C)*
27. Only Ones — every die is a 1 (≥3 dice) *(E)*

**D. Sums** (family: Sums — all that match fire)
28. Lucky Seven — total is 7 *(C)*
29. Blackjack — total is 21 *(U)*
30. Perfect Ten — total is 10 *(C)*
31. Round Number — total is a multiple of 10 *(C)*
32. Prime Time — total is prime *(C)*
33. Square Dance — total is a perfect square *(U)*
34. Powers of Two — total is a power of 2 *(U)*
35. Fibonacci — total is a Fibonacci number *(U)*
36. Century — total ≥ 100 *(R)*
37. Palindromic Total — total reads the same backwards (e.g., 121) *(R)*
38. Jackpot 777 — total is exactly 77 or 777 *(L)*
39. Unlucky 13 — total is 13: **negative** — gives a Curse (small penalty) but also a unique payout *(risk combo)* *(U)*

**E. Position / Order** (uses tray order — rewards arrangement)
40. Staircase Up — values strictly ascend left→right *(R)*
41. Staircase Down — strictly descend *(R)*
42. Palindrome — tray reads symmetric (1-3-5-3-1) *(R)*
43. Mirror Image — left half equals right half *(E)*
44. Lone Wolf — one die differs from all-equal rest (e.g., 4-4-4-1) *(U)*
45. Sandwich — X · Y · X pattern in adjacent dice *(C)*

**F. Number-specific & Fun**
46. The Devil — three 6s *(R)*
47. Nice — a 6 and a 9 present (d10+) *(U)*
48. Leet — 1, 3, 3, 7 present *(E)*
49. Baker's Dozen — thirteen total pips on faces of a single die … or one die shows 13 *(U)*
50. Hot Streak — the same combo triggers two rolls in a row *(R)*
51. Comeback — a scoring roll right after a zero-combo roll *(C)*
52. Last Gasp — big combo on your final roll of a round *(U)*
53. First Blood — combo on the first roll of a round *(C)*
54. Overkill — roll score alone exceeds the round target *(E)*

**G. Special-face combos** (build-arounds)
55. Wild Bunch — 2+ Wild faces in one roll *(U)*
56. Bombs Away — two bombs in one roll *(R, risky)*
57. Gold Rush — 3+ Gold faces *(R)*
58. Crossfire — a special adjacent to its own copy *(U)*
59. Polyhedral — dice of 3+ different types rolled together *(R)*
60. Platonic — d4, d6, d8, d12, d20 all in one roll *(L)*
61. Twins — two dice of same color roll same value *(U)*
62. Full House of Specials — all faces rolled are specials *(L)*

Pick ~40 for the MVP so each family has a rich common→epic ladder; the rest are post-MVP content drops (cheap because they're data).

## 7. Boss rounds & modifiers

A boss round replaces/adds a **rule** for one round; telegraphed one round ahead so the player can prepare in the shop.
Examples:
- **Frost**: the first roll of the round doesn't score.
- **No Nudges**: nudge tokens disabled.
- **Heavy**: only even faces score pips.
- **Silence**: combos disabled — pure pips.
- **Famine**: rolls −2, target −20%.
- **Greedy**: banking early is disabled / overkill cost doubled.
- **Shrink**: one random die is held under a cup (can't be seen until after the roll).
- **Fragile**: bomb faces explode twice as hard.
- **Mimic**: the best combo of last roll is disabled this roll.
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
- **Hex**: score nothing but gives a combo level when rolled.

### 8.5 Wild / Meta
- **Wild**: counts as any value for combos (**decided: the player chooses** the value after rolling; UI shows the combos each choice would trigger).
- **Gold**: banks coins directly.
- **Diamond**: rare meta resource (original idea). Unlocks cosmetic/theme options and special unlock tokens at run end.

## 9. Relics (run-wide passives)

Not faces: persistent rules, 5 slots, bought in the shop (this gives the Balatro "joker" build layer on top of the dice layer). Examples:
- **Loaded Pockets**: start each round with 2 extra Nudges.
- **Tray Upgrade**: +1 die slot.
- **Metronome**: every 3rd roll ×2.
- **Chain Smoker**: each combo fired this roll adds +0.5 Mult to the next combo.
- **Combo Collector**: +1 Mult for each distinct combo triggered this round.
- **Rabbit's Foot**: first reroll each round is free.
- **Banker**: +10% interest on coins (cap).
- **Odd Job**: odd values score double chips.
- **Sixth Sense**: if you roll exactly a single 6 and nothing else, create a free random face special.
Relic limit keeps builds sharp; the sixth relic replaces one.

## 10. Meta-progression (unlock, don't power-creep)

Premium roguelite principle: unlocks widen *options*, not raw power.
- **Codex**: every combo, face, die, relic seen is recorded (completion % is the long-term goal).
- **Unlock tree via play**: milestones unlock new content into the pool (e.g., "win a run with only one die" unlocks Coin; "trigger Platonic" unlocks d20). No grind currency required.
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
5. **Cascade**: each die **pulses** as it scores (pip-fly to the counter with rising pitch, per original), then combos slam in with banners, then relics, then the final multiplier. The player always sees the math.
6. **Reactions** scale with rarity: screen shake, flash, slow-mo hit-stop on epic combos, particle bursts, haptic on mobile.
Quality of life: tap anywhere to skip the cascade; hold to auto-roll; "reduced motion" toggle; every juice effect is a setting.

Sound: pooled randomized clack samples per die (voice-limited to avoid mush), distinct material per die type, pitch-ramped pip pings, crowd/ambience layer that responds to combo rarity. Sound is ~half of the "luck" feeling — budget time for it.

Optional later: 3D dice render to pre-baked sprite frames (cheat 3D inside a 2D engine) if we want that look without physics.

## 12. UX / screens

Portrait-first layout (matches the original mock; scales to landscape desktop with the tray centered and shop in a side panel).
- **Round screen**: tray center; score vs target meter top; rolls left; coins; ROLL button bottom (big, thumb-friendly); relic bar; nudge tokens; combo log (collapsible).
- **Shop**: tabs/sections — Dice (faces upgrade grid, buy die), Specials (shared 3 + reroll), Combos (level), Relics. Clear price tags, "can afford" state, undo for the last purchase.
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
  rng, dice, faces, combos, relics, shop, economy, round/run state machine
  roll() returns an ordered EVENT STREAM: [Thrown, Landed(die,value), FaceEffect, ComboFired, Score(+x), ...]
content/    data tables (JSON/TS): dice, specials, combos, relics, bosses, stakes, prices, curves
view/       Pixi + DOM; plays the event stream as animations (skip/speed just scales the timeline)
sim/        headless bot runner (Node CLI) importing core + content
```
Key idea: the **event stream** is the contract. The core never knows about animation; the view never computes scoring. This makes the bot, replays, tests, and the juice all use one source of truth.

### 13.3 The tuning bot (sim)
- Plays full runs headlessly at thousands per second using the same `core`.
- **Policies**: random; greedy (buy best immediate score); heuristic (value-weighted shopper with archetype goals: straights / sums / pairs / bombs); optional search (beam/MCTS) for upper-bound "skilled" play.
- **Metrics**: win rate by stake and policy, average round reached, run length, coin curve, shop pick rates vs win rate (flags OP/useless items), combo trigger frequency by dice count (are combos reachable?), variance of outcomes (is luck vs skill balanced?), "dominant strategy" detector.
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

0. **Spreadsheet/sim spike (1–3 days)** — implement core scoring + 15 combos + a dumb bot in Node. Prove the target curve and that combos are reachable. No graphics.
1. **Rolling feel prototype (the most important milestone)** — Pixi page with 1–8 dice, throw → tumble → land → cascade, sounds, juice. *Pass criterion: rolling 8 dice and watching pips fly is fun with zero game around it.*
2. **Playable run** — round loop, shop, upgrades, ~40 combos, ~25 specials, 5 relics, 1 boss rule, save/load.
3. **Tuning pass with bot** — curves, prices, dominant strategy removal, stakes 1–3.
4. **Content & polish** — Codex, kits, unlocks, daily seed, accessibility, settings, tutorial-by-play (first round teaches roll → upgrade → shop).
5. **Theme & art pass** — pick the theme, replace placeholders (the theme layer makes this a reskin).
6. **Release to itch.io/web** (+ optional Steam wrap). Post-launch: new dice/combos/relic packs as data.

## 15. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Scoring math unreadable → "numbers soup" | Per-contribution labels, cascade order fixed, combo log, slow-replay of last roll |
| Runs plateau/dominant build | Bot detects it; stakes and boss mods push variety; relic cap |
| Rolling gets tedious at high dice counts | Fast-mode, skip, hold-to-roll; cascade time is capped regardless of dice count |
| 2D dice don't feel "lucky" | Milestone 1 is dedicated to feel; deterministic outcome allows near-miss anticipation, sound, hit-stop |
| Scope creep from infinite content | Data-driven content; MVP = 40 combos/25 specials/5 relics; rest are content drops |
| Combo reachability with few dice | Combos list tagged with min dice; bot reports reachability per dice count |

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
2. Exact combo and special counts for the MVP cut (currently ~40 combos / ~25 specials / 5 relics).
3. Whether Nudge/Reroll tokens are enough agency once the bot reports on luck-vs-skill variance.
4. Landscape/desktop layout details after the portrait prototype.
