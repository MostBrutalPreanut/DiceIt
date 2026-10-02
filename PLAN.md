# Dice It! — Design Plan (v0.1, draft for discussion)

## 1. What the original pitch gets right (keep)
- **One-thumb loop**: tap ROLL → pips fly to the counter → spend → repeat. Understandable in 3 seconds.
- **Dice as the unit of progression**: every die has 6 editable faces. This is a genuinely fresh "build" surface (compare Dicey Dungeons / Balatro: the fun is *engine-building with randomness*).
- **Specials that rewrite faces** (x2, +1 roll, bomb, "==", dice-count multiplier): easy to author, easy to add forever.
- **Juice**: pips streaming into the counter with per-pip sound. This *is* the game's dopamine; treat as core feature, not polish.
- Shared 3-slot special shop with reroll, escalating die prices (100, 500, 1k, 2k, 5k, 10k, 50k).

## 2. Problems to fix (the "modernize" part)
1. **Limited rolls + ads to refill is the weakest part.** It makes the core loop (rolling a ton of dice) the thing that is *rationed*. Modern hybrid-casual practice: rewarded ads are an *optional accelerator* ("2x this run", "free reroll", "revive"), not a gate on the verb.
2. **Real-money cash-out is a major legal/platform risk.** Apple/Google restrict real-money gaming and have tightened sweepstakes-style rules in 2026; several US states ban sweeps-style games. It also pushes design toward "pips ≈ dollars", which fights fun. **Recommendation: drop real-money cash out.** Replace with *Cash Out = bank your run*: convert pips to a permanent meta currency / score / leaderboard rank. Same emotional beat ("I'm done, bank it"), none of the liability. (Decision needed — see §7.)
3. **Pure upgrade grind plateaus.** Needs decisions with tension: risk (bombs, losing a die), synergy discovery, and a run end that is a *goal*, not just "out of rolls".
4. **Combos were left unfinished** — they're the best idea in the deck for crowd/screen feedback; promote them.

## 3. Core loop (proposed)
**Run structure (roguelite):** a run = N *rounds*. Each round has a **target score** and a **roll budget**. Hit the target → shop → next round (harder target). Miss → run ends; you bank partial reward. (Balatro-style escalating ante; keeps your "limited rolls" idea but makes it meaningful tension instead of an ad wall.)

Alternative "pure idle" mode possible later (see §7), but roguelite run is recommended as the primary mode.

```
Round: ROLL xN → pips fly to score → combos trigger → reach target?
   ├─ yes → SHOP (upgrade faces / buy die / buy special / reroll) → next round
   └─ no  → run over → bank → meta-progression → new run
```
- **Hold-to-roll / auto-roll** (from your doc): hold to roll rapidly; roll count still the budget.
- **Roll resolution is a short, snappy sequence** (< 1.2s, skippable) so 8 dice × 20 rolls never drags: dice tumble in arena → settle → left-to-right scoring cascade, each die pulsing as it contributes, specials chaining. The *order of evaluation* (left→right) is what makes arrangement/synergy a puzzle.

## 4. Systems

### 4.1 Dice & faces
- Start: 1 d6. Buying dice: escalating price curve as in the doc (bomb-lost dice make next purchase cheaper).
- Face upgrade: +1 pip, cost grows with current value (doc). Add **soft cap / diminishing return** and make later dice start with stronger faces so number-go-up stays readable.
- Unlock **d4 / d8 / d10 / d12 / d20** as rare dice (your "ideas" list). Odd-shaped dice also look great in 3D.
- Dice have **colors/IDs** (doc) and **order** the player can rearrange (matters for neighbor effects like "x2 on the die next to it").

### 4.2 Specials (data-driven, designer-editable)
Categories to implement as *data*, not code (JSON/ScriptableObject-style tables with price, rarity, weight):
- **Modify face**: +N, set to N (9–50, price 100x−5x as doc).
- **Modify roll**: +1 roll, "blow up & reroll all" (lose die after X uses), +% chance for this face.
- **Scale**: x2 neighbor, dice-count x N, "==" sum of others, growing face (+1 each time rolled).
- **Meta**: 💎 diamond face (premium currency earned in play, 100x cost).
- New idea buckets: **Wild** (copies neighbor), **Lucky** (rerolls itself once), **Gold** (pips banked immediately even if you bust), **Curse/Gamble** (high risk, high reward).
- Shared shop of 3, reroll for 50 pips (price escalates per reroll within a round), free restock after an ad.
- Rarity tiers + weighted draw so there are "oh WOW" shop moments.

### 4.3 Combos (finish the unfinished page)
Evaluated across the whole roll, give flat bonus or multiplier + crowd reaction + screen FX:
- Pairs / triple / quad ("ONLY ONES! +1", "THE DEVIL 666 +6")
- Short straight (1-2-3), straight (1-2-3-4-5-6), royal flush for big dice
- "Snake eyes", all-same, all-even, all-odd
- **Combos are levelable** (Balatro "hand levels"): each combo has a level you upgrade in the shop → another upgrade axis and long-term identity ("I'm a straights build").
- Pip total × combo multiplier gives the chips×mult feel that is proven-fun.

### 4.4 Economy & meta
- **Run currency**: pips (spend in shop, count toward score).
- **Meta currency** (earned from banked score at end of run): permanent upgrades — starting dice, starting roll budget, shop slot +1, reroll discount, new special unlocks into the pool.
- **Diamonds**: rare, for cosmetics and special unlocks.
- Cash Out = end run voluntarily early for a banking multiplier decay (don't wait → safe; push → risk). Keeps the push-your-luck.

### 4.5 Monetization (optional, player-friendly)
- Rewarded ads as *accelerators*: double bank, free shop restock (doc), revive after bust, +rolls once per round. Never a hard gate.
- IAP: remove-ads/ad-free bundle, cosmetic dice skins & arenas, starter packs (doc's "sell pips/rolls/better starts" kept but light).
- Offer multiple routes to same benefit (earn / ads / buy).
- Interstitials only at run end, if at all.

## 5. Presentation
- **Theme: Arena** (doc) is good and differentiating: top-down ~75°, dice rolled in a ring, minimal crowd (trolls/dwarves/elves) reacting to combos. It gives combos a reason to exist (crowd cheers).
- **Recommend real 3D physics dice** (tumbling + faces as textures) over flat sprites: the doc worried about control, but face values must be *determined first* and animation steered to land on them ("rigged physics" / pre-computed outcome) — fair, deterministic, performant, and testable. Fall back to 2D sprite dice for the MVP prototype if needed.
- Juice checklist: per-pip fly-to-counter with rising pitch, screen shake on big hit, crowd reaction tiers, slow-mo on bombs, haptics, damage-number style popups on combos.
- Audio: pooled randomized dice-clack samples (up to 8+ simultaneous, voice-limited), per-pip pings with pitch ramp.
- UI follows the mock-up layout (top-left score, cash-out top-right, roll bottom-left, upgrade bottom-right) recolored for arena.

## 6. Technical plan (no code yet — decisions only)
- **Engine**: Unity (Skeepy Games context, mobile, 3D dice, ads SDKs) — or Godot / web (Phaser/Three.js) for rapid prototyping. *Need your preference* (§7). Repo is currently empty.
- **Architecture**: deterministic game core separated from view:
  - `Core` (pure logic): dice, faces, specials, combos, economy, RNG (seedable), run state. Fully unit-testable.
  - `Content` (data): specials/combos/dice/prices as editable tables → solves "designer can change prices easily".
  - `View`: arena, dice animation, UI, audio, FX.
  - `Services`: save, analytics, ads, IAP (stubbed at first).
- **Simulation harness**: headless bot that plays thousands of runs to tune target curves, prices, and detect degenerate builds. This answers the doc's "how much are pips worth / what should everything cost" without guessing.
- Save: persist between sessions (run in progress + meta). Cloud save later.
- Analytics events from day one: roll count, shop picks, run length, death round, ad opt-ins.

## 7. Milestones
0. **Paper/spreadsheet prototype & sim** — validate the number curves and that "round + target" is fun. (days)
1. **Vertical slice (2D)**: 1 arena, core loop, 3 dice, ~12 specials, 6 combos, 1 meta upgrade, juice pass on pip-fly + sounds. *Goal: rolling 8 dice feels great.*
2. **3D dice + arena + crowd**, rarity, reroll, full special set (~40).
3. **Meta-progression, save, onboarding/tutorial**, balancing from sim + playtests.
4. **Monetization + analytics + soft launch** in a small region; tune retention (D1/D7).
5. Live ops: new dice, arenas, daily seeds/challenges, leaderboards, seasonal specials.

## 8. Open questions for you
1. **Real-money cash-out**: drop it (my recommendation) or is it essential to the vision? If essential, we need legal review per region before any design commitment.
2. **Primary mode**: roguelite rounds with targets (rec.) vs. pure endless idle-style rolling vs. both?
3. **Roll limit**: keep as the per-round budget (rec.) or free rolling with cooldown/energy?
4. **Engine / platform**: Unity? Godot? Web prototype first? Mobile-only?
5. **2D vs 3D** for the first playable.
6. **Scope/audience**: personal prototype, pitch for Skeepy Games, or shipping product? Affects polish & monetization depth.
7. Pips as cookies/other round things — still want the skin option?

## Research notes
- Dice-builder roguelites (Dicey Dungeons, Balatro-likes) succeed via synergy-building and push-your-luck: fits your "specials that rewrite faces".
- Hybrid-casual best practice: simple core + meta layer; rewarded ads as optional boosters inside progression; multiple paths to the same benefit.
- Real-money/sweepstakes style games face tightening store and state-level rules in 2026.
