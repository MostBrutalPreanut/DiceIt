# Balance research: what the game does when people play it

A research pass, not a tuning pass: **nothing in the game was changed.** Everything below was measured by playing the
real game (the real `Game`, sim and scorer, headless) with new test players, and is meant to decide what to change.
The harness is in `tools/research/` (see the end of this file for how to re-run any of it).

**What was run** (about 2,200 simulated rounds of build trials and segments, 120 full campaigns, 2 census passes):

| Test | What it answers | Size |
|---|---|---|
| Player calibration | What a pro, an average and a poor player are, against the existing par bot | 4 players x 3 tables x 16 rounds, plus clock-off |
| Campaigns ("normal" play) | Can players beat the game by shopping, building and playing the real run? | 120 whole runs: 4 shopping strategies x 3 players x 10 seeds |
| Build finder | What are the strongest builds? | 3 agents read the code and wrote 21 builds (full + partial versions, with placements) |
| Build trials | Do those builds work, for whom, and how far into endless? | 378 run segments (rounds 10 to 22): full / partial / auto-placed x 3 players x 2 seeds, every final boss |
| Clock-off study | Can skill alone run away if the ball clock is removed? | 21 builds x pro + avg, 3 rounds each, balls cut at 10 min |
| Part census | Does every part get hit, do its effects fire, what does it add? | Every part on a mid and a late table, 4-round segments, 3 players; **twice**, with different seeds and placement |
| Gem census | What each gem adds over its host part | 7 gems on 14 hosts |
| Decal census | What each decal adds, on 6 tables | 44 decals, 3 players on the late table |
| Boss census | How hard each boss hits each kind of build | 12 bosses x 6 tables x 3 players (+ a confused-hands player for Crossed Wires) |
| Mechanics probe | The parts with no points of their own: do they work? | Capsule, Mirror, Tray, Feet, Piñata, Insurance, Wheel, Gumball, Bucket, guards |
| Performance | Sim and render cost on the heaviest builds | Node step timing in every trial; Chromium frame cost on 7 heavy builds |

---

## 1. The short version (ranked by how much each matters)

1. **The goal curve was tuned against a perfect player.** The balance tool's par bot (skill 0.6) re-rolls its 60%
   every frame (240 times a second), so it effectively never misses. With a real miss model, par plays like our "pro".
   Every number in `docs/status.md`'s balance table is a pro's number.
2. **Big Boi is the game.** In 13 of the 21 builds, Big Boi scores 72-98% of all points. Tesla Coils zap him (he is a
   zappable bumper), four Power Plates around him multiply each other (x5.06), and Fan Club (x3), Overclock on him
   (+50%) and Bumper Car (+50%) stack on top. A **$53** build of 9 parts reaches round 18-20; a **$76** one, round 21.
   All three build finders found this independently within minutes.
3. **Four things have no ceiling at all**, and the numbers explode (10^36 times the goal, kept Mult in the billions):
   - **Afterglow** keeps 15% of the round's peak Mult, and the peak includes what it already kept: it compounds every
     round. In a real campaign it took kept Mult from 10.7 to **9.7 billion** between rounds 10 and 20.
   - **Hall of Fame** (x1.1 per part type) never goes through the ×Mult cap, and every copy stacks.
   - **Disco Ball** has no ×Mult cap, so every copy stacks (x2.5 each).
   - **Emerald** makes either fire twice a ball.
4. **The Spider Wheel is the strongest part in the game** once the player presses a flipper during the spin (+536% avg,
   +1,119% pro). A ball lands in it ~45 times a round, and collecting all 8 segments gives Wheel Mania (3 balls, x2) about
   twice a round. If nobody presses, the 3 s timeout always stops on segment 7, **Zilch**.
5. **The Ball Printer is the next strongest** (+400% to +730%, even for poor players), then **Twin Ball** (+73% to +565%),
   which together with **Multiball Madness** is a permanent x2 because the twin waiting in the plunger lane counts as a
   ball in play.
6. **Long Fuse does nothing** (bug): it adds 20 s to the round clock, but the sim also ends any ball older than the
   hard-coded 60 s `BALL_TIMEOUT`.
7. **Normal players rarely beat the game, and lose in three places**: rounds 1-2 (poor players: 23% lose round 1, 61% round 2),
   the round-3 boss (Short Fuse and The Jammer, which jams the starter Pops), and round 9 (55,000: average players lose 57%
   there). Over 120 real runs: **pro 15% won, average 2.5%, poor 0%.** The Overlord beat every run that reached it.
8. **The ball clock mostly stops tables that play themselves, not skilled players.** With the clock off, ordinary
   builds gain only x1-2 (their balls drain on their own); the Mag-Grab-under-Big-Boi loop, the multiball castle and the
   Diner autopilot keep balls alive past the 10-minute cut and gain x4 to x15. A pro and an average player score the same on them.
9. **Late cash piles up with nothing to buy**: $47 at round 10, $138 at round 15, while spending falls to $9 a round. The
   table (36-37 pieces by round 12) and the toolbox are full, and the big rail parts (Duck Gallery, Goal!, Roller Pop,
   Free Ball Bucket) **cannot be placed at all** on a full late table.
10. **Four gems do almost nothing** (Garnet, Opal, Gold Leaf, Topaz: 0-13%), and a handful of parts are a net loss on
    every table (Deflector, The Whale, Drop-Target Bank, Grape Bunch, Spotlight, Wishing Well late, extra flippers for
    anyone but a poor player). Details per part in §8.
11. **Crossed Wires costs a bot nothing** (it swaps hands perfectly); a player who presses the old hand 30% of the time
    drops from a 33-89% pass rate to 0-11%. The real cost is somewhere in between: it needs a human playtest.
12. **Performance is fine.** The sim costs 10-17 ms per second of play on the heaviest builds; drawing a frame costs
    1-6 ms (16 ms at worst with 4 balls). The biggest tables (35+ parts, multiball) use up to ~80% of the frame budget in
    their worst 5 s in headless Chromium: worth watching on low-end devices.

---

## 2. How the test players work

### 2.1 Three pairs of hands

The existing bot (`src/sim/bot.ts`) flips when a ball is in reach and `rng < skill`, but it rolls that **every frame**:
at 240 Hz even skill 0.3 flips almost at once. So skill barely changes anything, and par is near-perfect. The research
players (`Human` in `tools/research/lib.ts`) instead decide **once per approach** (the ball comes into reach after being
away): miss it entirely, or press after a reaction delay; a cradler holds a slow ball and shoots it, others tap; poor
players also flail now and then (which melts Ice Sculptures). They also press during a Spider Wheel spin (pro: timed to
land each segment in turn; average: at a random moment; poor: never), and for Crossed Wires an extra "confused" player
presses the old hand 30% of the time.

| Player | Misses an approach | Reaction | Cradles | Ball life (late table) | Late-table score vs par |
|---|---|---|---|---|---|
| **pro** | 1% | 0-15 ms | yes | 44 s mean, half the balls hit the 60 s limit | about the same as par (x1.04) |
| **avg** | 6% | 10-40 ms | yes | 34 s | x0.94 |
| **poor** | 15% | 30-70 ms | no, flails | 17 s | x0.25 |
| par bot (skill 0.6) | ~0% | ~0 | yes | 43 s | 1 |

The ablation that settled it (mid table, 16 rounds): a zero-miss, zero-delay player scores 14,610 and keeps a ball 39 s,
par 12,667 and 34 s; 30-60 ms of reaction drops it to 7,964 and 25 s; missing 15% of approaches to 3,617 and 19 s. Reaction
time and misses fall off steeply, which is the skill a human actually has.

### 2.2 Four shoppers

| Strategy | How it shops | How it builds |
|---|---|---|
| **par** | the repo's value list (`tools/par.ts`) | auto-placer (3 spots per new part, 4 hill-climb moves), judged by its own hands |
| **seeker** | picks an archetype from what it owns (bumpers, sparks, lights, targets, multiball), wants core pieces x2.5, support x1.5; locks core pieces it cannot afford, rerolls up to 4 times, sets gems in its best part, buys decor, throws spare cash in Wishing Wells, scraps its weakest part for a better one, re-picks the archetype at round 8 if the core never came (the "compromise"); a poor player values guard parts x2.2 | as par |
| **meta** | the seeker, aiming for the Big Boi engine the build finders found (Plates, Teslas, Spotlights, Mag-Grab, Level Lights; Fan Club and Overclock on Big Boi); falls back to the seeker at round 8 if no Plate or Tesla came | puts the engine's pieces where the build finder put them, the rest by the placer |
| **casual** | buys what looks cool (rarity plus a random liking), rarely rerolls, random decal | 2 spots per part, no hill-climb |

Moving a part that already played costs $1 (the real fee), and a round is played once, against the real goal, with the
real boss; a lost round ends the run. A won run plays on into endless rounds (up to round 20).

### 2.3 How sure the numbers are

- A census row (one part, one table, one player) is 8-12 rounds. Its noise is about **±20%** (one standard error);
  the decor rows that change nothing (Spare Bulb on a table with no Lamps) read +12% to -16% purely from sampling.
  So the census was run **twice** with different seeds and different placements (§8): read a part as strong or weak only
  when both passes agree.
- Score-only decals do not change the ball's path, so the same seeds give the same game: their effect is **exact**
  (Heavy Ball reads +25% on every table, because it is x1.25).
- Campaigns: 10 runs per strategy and player. The seed (which sets the shop rolls and the bosses) matters more than the
  strategy: seed 3 and seed 6 (both Factory) made the strong runs for every strategy.
- What no bot does: nudge (so Rubber Feet, Heavy Ball's nudge cost and tilting are untested), aim shots at a target, or
  learn a table. A human pro would score more on aim-dependent parts (Goal!, Duck Gallery, Drop-Target Banks, lanes).

---

## 3. Normal play: 120 campaigns

### 3.1 How far players get

| | runs | won (beat round 15) | median rounds cleared | rounds cleared, every run |
|---|---|---|---|---|
| pro, par shopper | 10 | 10% | 9 | 5,7,8,8,9,9,9,14,14,19 |
| pro, seeker | 10 | 20% | 8.5 | 3,3,4,4,8,9,9,14,18,20 |
| pro, meta | 10 | 20% | 8.5 | 5,7,8,8,8,9,14,14,17,20 |
| pro, casual | 10 | 10% | 4 | 1,1,1,2,4,4,5,7,13,16 |
| avg, par | 10 | 0% | 7.5 | 2,2,3,7,7,8,8,8,9,14 |
| avg, seeker | 10 | 0% | 3 | 2,2,2,2,3,3,8,8,14,14 |
| avg, meta | 10 | 10% | 4.5 | 2,3,3,3,4,5,6,7,13,18 |
| avg, casual | 10 | 0% | 4.5 | 0,0,0,1,4,5,7,8,8,8 |
| poor, any | 40 | 0% | 1 | 31 of 40 runs ended in rounds 1-3 |

Win rates: **pro 15%, average 2.5%, poor 0%**. Of the 7 wins, 5 went on to round 17-20 in endless.

### 3.2 Where runs end (every player pooled; score / goal is the median of the rounds played)

| Round | Goal | pro: lost | pro: score/goal | avg: lost | avg: score/goal | poor: lost |
|---|---|---|---|---|---|---|
| 1 | 1,000 | 0% | 2.25 | 8% | 1.80 | **23%** |
| 2 | 2,000 | 8% | 2.18 | 3% | 1.59 | **61%** |
| 3 (boss) | 2,500 | 3% | 1.43 | **19%** | 1.37 | **67%** |
| 4 | 5,000 | 6% | 2.24 | 21% | 1.57 | 50% |
| 5 | 8,000 | 12% | 1.74 | 9% | 1.93 | |
| 6 (boss) | 12,000 | 10% | 1.83 | 10% | 1.77 | |
| 7 | 20,000 | 0% | 1.97 | 5% | 1.53 | |
| 8 | 35,000 | 11% | 1.48 | 22% | 1.39 | |
| 9 (boss) | 55,000 | **25%** | 1.45 | **57%** | 0.82 | |
| 10 | 90,000 | **33%** | 1.99 | 17% | 3.90 | |
| 11 | 150,000 | 0% | 3.77 | 0% | 1.49 | |
| 12 (boss) | 200,000 | 0% | 2.01 | 0% | 1.79 | |
| 13 | 450,000 | 0% | 1.75 | 0% | 1.80 | |
| 14 | 750,000 | 8% | 1.51 | 20% | 1.25 | |
| 15 (final) | 1,500,000 | **45%** | 1.06 | **75%** | 0.75 | |

What it says:

- **Rounds 1-8 are comfortable for pro and average players** (they clear at 1.4-2.3 times the goal), which is the
  "first level quite easy" you want. For a poor player, round 2 (x2 the goal, with one or two new parts) is the wall.
- **Round 9 is the real wall** for average players, and rounds 9-10 for pros: a boss round right after the jump to
  55,000.
- **Rounds 11-13 are easier than their neighbours** (pros clear them at 1.75-3.8 times the goal): the run's builds come
  together there, and the curve does not follow.
- **Round 15 is a coin flip for a pro** and a loss for an average player, with the goal at 1.5M.
- Where the 113 losses happened: rounds 1-2: 35; the round-3 boss: 12 (6 Short Fuse, 6 The Jammer); round 4: 10; round 9
  (boss): 14; round 10: 8; the final: 8 (6 of them to the Overlord).

### 3.3 Bosses met in real runs

| Boss | Met | Lost | Score / goal (median) |
|---|---|---|---|
| The Overlord (final) | 6 | **100%** | 0.47 |
| The Whirlpool (final) | 6 | 33% | 1.06 |
| The Auditor (final) | 3 | 0% | 1.17 |
| Short Fuse | 34 | 29% | 1.27 |
| Night Shift | 18 | 22% | 1.30 |
| The Jammer | 33 | 21% | 1.27 |
| Flat Rate | 21 | 19% | 1.49 |
| Slippery Slope | 28 | 18% | 1.80 |
| Tax Man | 6 | 17% | 1.30 |
| Cheap Rubber | 15 | 13% | 1.39 |
| Crossed Wires | 28 | 11% | 1.80 (bots swap hands perfectly) |
| The Magnet | 19 | 5% | 1.95 |

### 3.4 Money

| Round | Cash at the shop (median) | Spent | Parts bought | Parts on the table | Kept Mult |
|---|---|---|---|---|---|
| 1 | $6 | $3 | 1.0 | 4 | 0 |
| 4 | $17 | $13 | 3.0 | 14 | 0.1 |
| 7 | $25 | $18 | 3.2 | 24 | 0.4 |
| 10 | $47 | $20 | 2.7 | 34 | 1.4 |
| 12 | $78 | $9 | 1.6 | 36 | 3.6 |
| 13 | $97 | $8 | 1.6 | 37 | 5.3 |
| 15 | $138 | $11 | 1.2 | 37 | 138.7 (Afterglow runs) |

Early money works (two or three purchases a round). From round 11 money has nowhere to go: the table and toolbox are
full, nothing bigger fits, and scrapping costs. Rerolls stay rare (0.1-0.4 a round) because there is nothing to put a new
part on. Move fees run $0.4-0.9 a round, so the fee is not what stops rebuilding.

### 3.5 What scored in real runs (rounds 10+)

The part with the most points in a round: Pop Bumper 74 times, Ding-Dong Bell 27, Big Boi 16, Bank Ring 11, Wishing Well 4.
The top part's share averaged 39%, inside the plan's "under ~40%". Real shops rarely assemble the dangerous engines: only 1
of 120 runs ever stuck Fan Club, and **none of the 30 meta runs got even two Power Plates and a Tesla** (Plates are
uncommon, Teslas rare, and the toolbox fills first). The two meta runs that went deep (seed 3: rounds 18 and 20) did it
with two Teslas and no Plates. **The breakers are real, but they are lucky-run (and Test Lab) breakers, not every-run
breakers**: the next section is what happens when a player does get the pieces.

---

## 4. The goal curve

You asked for about 1,000 in round 1, 2.5-3M in round 15, round numbers in between, and for a good build to pass most
rounds narrowly, sometimes wildly, sometimes not.

**What the current table does**: 1,000 · 2,000 · 2,500 · 5,000 · 8,000 · 12,000 · 20,000 · 35,000 · 55,000 · 90,000 ·
150,000 · 200,000 · 450,000 · 750,000 · **1.5M**. The final is 1.5M (the balance plan and `status.md` still say 2.5M);
round 3 (x1.25) and round 12 (x1.33) are flat steps; round 9 (x1.57 into a boss) is the wall; rounds 11-13 are slack.

**What players score** (median of the campaign rounds that were played, every strategy): a pro is at ~2,200 in round 1,
~180k in round 10, ~790k in round 13, ~1.1M in round 14 and ~1.6M in round 15 against a final boss. A 2.5-3M final that a
good run passes narrowly needs **about twice the late scoring a normal (non-broken) build has today**. So the curve change
and the late-game changes in §10 belong together; raising the final alone makes the game harder, not more exciting.

**Proposed curve** (about x1.7-1.8 a round, every number easy to remember; boss rounds marked):

| Round | 1 | 2 | 3B | 4 | 5 | 6B | 7 | 8 | 9B | 10 | 11 | 12B | 13 | 14 | 15F |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Now | 1,000 | 2,000 | 2,500 | 5,000 | 8,000 | 12,000 | 20,000 | 35,000 | 55,000 | 90,000 | 150,000 | 200,000 | 450,000 | 750,000 | 1.5M |
| **Proposed** | 1,000 | 1,500 | 2,500 | 4,000 | 6,000 | 10,000 | 15,000 | 25,000 | 40,000 | 70,000 | 120,000 | 200,000 | 350,000 | 600,000 | **1M** |
| **Then, with the late-game changes** | 1,000 | 1,500 | 2,500 | 4,000 | 6,000 | 10,000 | 15,000 | 25,000 | 40,000 | 75,000 | 150,000 | 250,000 | 500,000 | 1M | **2.5M** |

- Round 2 at 1,500 gives a poor player a second round to find a part; round 9 at 40,000 removes the wall without making
  rounds 7-8 harder (they are 1.4-2x today).
- The first proposed row is what today's content supports: from the round-15 scores measured, a pro would pass a 1M final
  about 2 times in 3 and an average player about half the time. The second row is the 2.5M target: switch to it **after** the runaways are capped (§10.1) and late cash
  turns into points (§10.4), then re-measure.
- Endless: x1.6 a round past 15 is fine; with the runaways capped, the builds in §5 that are "insane" by design would
  still carry a strong player 3-6 rounds into endless.
- The balance tool needs the research players (or a per-approach miss model in `Bot`) before it measures any curve again.

---

## 5. The build finder

Three agents read the parts, decals, bosses and the scorer, and each wrote 7 builds: what pieces, where, which decals and
decor, what synergy they expect, and a "partial" version (the run that found only some pieces). Each build was played
from round 10 (rounds 10-12 to let levels, polish and Momentum grow, not judged) through rounds 13-15 (judged, against a
final boss) and on into endless until it lost, by all three players, twice; once as written, once refined by the
auto-placer ("auto"), and once as the partial version.

| Build | Cost | What it is | Beat round 15: pro / avg / poor | Last round won (median, all players) | Top scorer |
|---|---|---|---|---|---|
| foreman-elevator | $76 | 4 Plates + 2 Teslas + 3 Spotlights around Big Boi, Mag-Grab feeding it; Bumper Car, Fan Club, Overclock (Big Boi), Momentum | 2/2 · 2/2 · 1/2 | 20 | Big Boi 98% (93% by zaps) |
| dragon-purist-siege | $53 | the same engine with 9 parts, Purist | 2/2 · 2/2 · 1/2 | 18 | Big Boi 97% |
| cook-autopilot-survival | $132 | a table that plays itself (Diner) | 2/2 · 2/2 · **2/2** | 18 | Big Boi 96% |
| factory-broom-xmult-runway | $168 | Broomstick runway through X Lanes, Jackpot | 2/2 · 2/2 · 2/2 | 20 | Big Boi 72% |
| multiball-madness-castle | $99 | Twin Ball, Printers, Gumball, Bucket | 2/2 · 2/2 · 1/2 | 17 | Big Boi 41%, Pops 30% |
| hall-of-fame-zoo | $178 | 29 part types, Emerald Hall of Fame | 1/2 · 1/2 · 2/2 (auto: all) | 18-20 | Big Boi 26%, Ding 18% |
| castle-dragon-siege | $114 | Dragon, Teslas, Fan Club | 2/2 · 1/2 · 0/2 | 15-17 | Big Boi 78% |
| budget-grape-garden | $95 | Grapes, Bonsai, Well, Fan Club | 1/2 · 1/2 · 1/2 | 15 | Big Boi 96% |
| factory-spotlit-tesla-crown | $136 | Spotlights, Teslas, Lucky Seven | 1/2 · 0/2 · 0/2 | 14-15 | Big Boi 59% |
| diner-printer-lucky-madness | $126 | Printer, Multiball Madness, Lucky Seven | 0/2 · 1/2 · 0/2 | 14 | Ding 34% |
| xmult-ladder | $122 | Golden, Goal!, X Lanes, Emerald Disco | 0/2 · 0/2 · 0/2 | 14 | Golden 57% |
| light-show-lane-echo | $114 | Light Show, lanes, Echo Caves | 0/2 · 0/2 · 0/2 | 13-14 | Echo 45% |
| cook-target-practice-banks | $106 | Target Practice, Drop-Target Banks | 0/2 · 0/2 · 0/2 | 13 | Bank 79% |
| foreman-overtime-additive | $97 | every additive Mult cap filled | 0/2 · 0/2 · 0/2 | 13 | Thunder 50% |
| foreman-furnace | $115 | Plates and Spotlights, no Teslas | 0/2 · 0/2 · 0/2 | 13 | Big Boi 87% |
| factory-altar-set-storm | $132 | Ritual Altar, sets, sparks | 0/2 · 0/2 · 0/2 | 13 | Big Boi 50% |
| dream-disco-fame-singularity | $292 | 3 Emerald Discos, 2 Emerald Halls of Fame, Afterglow | all | 22 (cap of the test) | **10^36 times the goal** |
| dream-foreman-overdrive | $201 | the Big Boi engine maxed | all | 22 | 60-140 times the goal |
| dream-bell-tower-trophy-room | $153 | 8 Old Bells, Trophy Cups | all | 22 | 30-75 times the goal |
| castle-dragon-apocalypse | $204 | Dragon engine maxed, Twin, Multiball | all | 20 | 7-51 times the goal |
| factory-supernova | $238 | sparks + zaps + Big Boi | all | 20-22 | 18-230 times the goal |

What it says:

- **Two families of builds work: the Big Boi engine and multiball.** Everything that wins without a dream budget either
  feeds Big Boi with zaps (Teslas next to him, Plates and Spotlights around him, Fan Club) or makes extra balls.
- **The "honest" archetypes stall at round 13-14 even for a pro**: lights, targets, additive Mult, the ×Mult ladder,
  sets, sparks. They are the builds the game's parts and decals are written for, and they lose to the final curve.
- **Partial builds mostly die before round 13** (their decals are the first thing missing). That is as it should be,
  except the dream partials (still 18-22) and the autopilot partial (a poor player still wins half its runs).
- **Placement**: the auto-placer and the hand placements end in the same place for most builds (±1 round), but the
  engine builds only work with the hand placement (the placer does not find "Tesla right next to Big Boi"); the
  Hall-of-Fame zoo got better when auto-placed (all players beat 15). Placement is a real skill in this game.
- **Skill hardly matters on the winning builds**: pro, average and poor reach the same rounds with the engine and the
  autopilot. Skill shows on the honest builds (pro reaches 14, poor 11-12).
- By final boss, over every build that reached it: Auditor beaten 78% (pro and avg), Overlord 60%, Whirlpool 63-85%.

---

## 6. The ball clock, and items for time

Same builds, same seeds, every ball played out, with the clock and the 60 s ball limit, then without them (a ball still
alive after 10 minutes is cut). Score with the clock off divided by the score with it on, and how long balls lasted:

| Build | pro: off/on | pro ball off (mean / max) | avg: off/on | avg ball off (mean / max) |
|---|---|---|---|---|
| light-show-lane-echo | x1.4 | 43 / 87 s | x0.9 | 32 / 62 s |
| cook-target-practice-banks | x1.7 | 58 / 99 s | x1.9 | 47 / 123 s |
| budget-grape-garden | x1.0 | 37 / 63 s | x1.0 | 51 / 195 s |
| xmult-ladder | x1.0 | 37 / 171 s | x1.0 | 17 / 42 s |
| foreman-furnace | x1.0 | 43 / 157 s | x1.0 | 40 / 119 s |
| foreman-overtime-additive | x4.7 | 86 / 306 s | x0.5 | 54 / 110 s |
| factory-spotlit-tesla-crown | x3.1 | 93 / 255 s | x1.0 | 27 / 68 s |
| foreman-elevator (Mag-Grab loop) | x4.3 | 206 / **600** s | x4.2 | 145 / 359 s |
| dragon-purist-siege | x7.0 | 311 / **600** s | x3.0 | 114 / 281 s |
| factory-broom-xmult-runway | x5.3 | 218 / **600** s | x2.4 | 83 / 162 s |
| multiball-madness-castle | x14.6 | **600 / 601** s | x9.5 | 475 / 602 s |
| cook-autopilot-survival | x12.4 | 536 / **600** s | x12.9 | **600 / 600** s |

(600 s is the cut: those balls were still alive after 10 minutes.)

- **A skilled player with an ordinary table does not run away without the clock**: x1-5, and the score grows about
  linearly with time (the per-ball caps reset each ball), not exponentially.
- **Tables that hold or return the ball do**: the Mag-Grab that throws the ball back into Big Boi, the Free Ball Bucket +
  Gumball multiball, the autopilot. On these, a pro and an average player score the same: **the clock is the only thing
  between them and infinity, and it is capping the machine, not the hands.**
- So the clock is right to exist, but it should push back on the table playing itself, and reward hands. Ideas, from
  that:

| Idea | What it does | Why |
|---|---|---|
| **Autopilot tax** (system) | the ball clock runs x2 (or x3) while the ball has not touched a flipper for 15 s | ends self-playing loops without touching any part's numbers; flipper play is never taxed |
| **Fix Long Fuse** (decal) | also lift each ball's 60 s age limit by the same 20 s | it is a no-op today |
| **Hourglass** (part, uncommon) | every *flipper-shot* hit on it adds +1 s to the ball clock, up to +20 s a ball | time is earned by aim, not by a loop |
| **Overtime** (decal) | +20 s a ball, but every goal is 10% higher | a real trade |
| **Sudden Death** (decal) | every ball has 20 s less, every hit x1.5 | takes time away for points: good with fast scorers |
| **Stopwatch** (rollover, rare) | once a ball, freezes the clock for 8 s | a target for good players |
| **Time Bomb** (part) | pays x2 in the last 10 s of a ball | rewards keeping balls alive to the limit |
| **Holds cost time** (rule, already true) | a ball held by a Mag-Grab, Printer or Wheel keeps the clock running | keep it: it is what stops holds from being free |

---

## 7. Bosses

Pass rate against a goal the table (with its decals) clears ~70% of the time without the boss, average player (pro and poor
in `tools/research/` output). "Base" is the same table's pass rate without the boss in the same test.

| Boss | late | Big Boi engine | ×Mult ladder | lights | targets | sparks/Tesla | Verdict |
|---|---|---|---|---|---|---|---|
| (base) | 89% | 33% | 44% | 56% | 56% | 67% | |
| Tax Man | 89% | 33% | 44% | 56% | 56% | 67% | no score effect at all; only money. Fine as an economy boss, but it never threatens |
| Cheap Rubber | **22%** | **0%** | 56% | 56% | 56% | **22%** | a clean counter to bumper builds, as designed |
| Slippery Slope | 67% | 33% | 89% | 67% | 67% | 33% | mild, and sometimes helps |
| Night Shift | 78% | 11% | **0%** | **0%** | **0%** | 56% | a hard counter: lights and ×Mult builds score nothing (x0.00-0.21) |
| Crossed Wires | 78% | 44% | 67% | 44% | 56% | 56% | bots swap hands; **a confused player: 0-11% on every table** |
| Short Fuse | **11%** | **0%** | 22% | **0%** | **0%** | 11% | the hardest regular boss on every kind of build |
| The Jammer | 78% | **0%** | 44% | **0%** | **0%** | 56% | wipes out single-engine builds (and the starter Pops at round 3) |
| Flat Rate | 78% | 0% | 22% | 11% | 0% | 67% | strong on Mult builds, as designed |
| The Magnet | 56% | 44% | 89% | 56% | 44% | 33% | mild |
| The Auditor | 22% | 0% | 22% | 0% | 0% | 44% | strong against decal builds (Momentum builds lose their whole start) |
| The Overlord | 67% | 0% | 11% | 0% | 0% | 78% | very strong on anything with one key part type; 0 of 6 campaigns survived it |
| The Whirlpool | 44% | 0% | 56% | 67% | 11% | 11% | strong |

---

## 8. Every part

Gain = the table's score with the part added (placed by the auto-placer) over the same table without it, average player
unless noted, over 4-round segments. Two passes with different seeds and placements. "touched" = rounds in which a ball,
zap or spark hit it at all. The mid table is a round-5 table (Pops, Big Boi, lanes, slings, spinner, lamp); the late one a
round-11 table (16 parts, level 3, every ball starts at x3).

PARTS_TABLE

### 8.1 Verdicts and suggestions

VERDICTS

### 8.2 Gems (the gain over the same host part without the gem)

| Gem | Host | Mid (avg / pro / poor) | Late (avg / pro / poor) | Verdict |
|---|---|---|---|---|
| Emerald | Disco Ball | +103% / +106% / +98% | +108% / +111% / +84% | doubles an uncapped x2.5: too strong (see §10.1) |
| Emerald | Hall of Fame | +61% / +63% / +55% | +134% / +137% / +101% | same |
| Emerald | Firecracker | +39% / +47% / +34% | +19% | fine |
| Red Seal | Thunder Bumper | +37% / +37% / +38% | +30% / +33% / +31% | good on a busy, high-points part |
| Ruby | Thunder Bumper | +21% | +18% | fine, a little low for $6 |
| Ruby / Gold Leaf / Red Seal | Pop Bumper | +3% to +11% | +3% to +4% | a Pop is too cheap a host: fine |
| Garnet | X Lane / Laser | +3% / 0% | +5% / +2% | **does nothing measurable** |
| Opal | Pop / Duck | +2% / +13% | 0% / 0% | **does nothing measurable** |
| Topaz | Pop | -15% / -31% (poor) | +29% | noise: about nothing |
| Gold Leaf | Pop | +11% | +3% | grows +1 a score up to 5x: too slow to show in 4 rounds; weak |

### 8.3 The parts with no points of their own (the mechanics probe)

| Part | Works? | What happened |
|---|---|---|
| Time Capsule | yes | ripe after exactly 6 rounds; digging it up offers 3 legendaries (Wizard, Wrecking Ball, Hall of Fame). A $8 bet that pays a $11-13 part 6 rounds later, while taking a spot and scoring nothing: fair but rarely worth it late |
| Side Mirror | yes | 5 offers on even rounds, 4 on odd |
| Coin Tray | yes | +$1 a cleared round |
| Rubber Feet | yes (nudge x1.15) | but **no bot nudges**, so nothing was measured; for a player who does not nudge it is a dead $6 |
| Piñata | yes | burst in the first round of an average player's segment; prize of 3 parts in the next shop |
| Insurance Policy | yes | the last ball drained short: 10 sparks, ~1,100-2,400 points, then gone for good |
| Spider Wheel | yes, **but** | without a press the wheel always stops on Zilch; with presses it is the strongest part in the game |
| Gumball Machine | yes | exactly one 3-ball multiball a round, as tuned |
| Free Ball Bucket | yes | ~5 catches a round (each ball back to the plunger); cannot be placed on a full late table |
| Ball Printer | yes | ~60 catches and ~8 extra balls a round |
| Helping Hand | flips, but never "hits" | no score events; it shows only in ball life (below) |
| Ball Saver | yes | 0.7-0.9 saves a round |

---

## 9. Decals

Score with the decal alone over the same table with no decals, average player (pro and poor on the late table). Cash
decals score nothing by design and are listed under economy. Effects of score-only decals are exact (same ball paths).

| Decal | late | Big Boi engine | ×Mult ladder | lights | targets | sparks/Tesla | late pro / poor | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Afterglow** | +24% | +25% | **+1,264%** | **+671%** | **+481%** | +49% | +24% / +18% | compounds (3 rounds shown here): cap it |
| **Twin Ball** | +94% | +73% | **+565%** | +102% | +114% | +147% | +104% / **+280%** | the strongest decal; x2 with Multiball Madness for free |
| **Fan Club** | +14% | **+192%** | +52% | +49% | +12% | +103% | +15% / +13% | x3 on the part that already scores most |
| Extra Ball | +35% | +48% | +37% | +36% | +44% | +53% | +33% / +37% | strong everywhere: fine for a rare |
| Lucky Seven | +27% | +29% | +23% | +26% | +19% | +27% | +27% / +26% | solid, even |
| Last Call | +26% | +29% | +38% | +24% | +36% | +32% | +39% / +28% | solid |
| Heavy Ball | +25% | +25% | +25% | +26% | +25% | +25% | +25% / +25% | exactly x1.25 (its nudge cost is never paid: nobody nudges) |
| Bumper Car | +35% | +49% | +35% | -6% | -20% | +47% | +36% / +32% | works as designed |
| Light Show | +11% | -25% | -20% | **+93%** | +23% | -12% | +13% / +7% | works as designed |
| Target Practice | -18% | -25% | -16% | -24% | **+57%** | -25% | -18% / -16% | works as designed |
| Minimalist | +20% | +15% | +47% | +65% | +72% | +10% | +18% / +26% | strong for a "build" decal with no downside on a full table |
| Crowd Pleaser | +12% | +8% | +28% | +68% | +55% | +10% | +11% / +15% | ok |
| Bright Lamps | +23% | 0% | +7% | +40% | +36% | 0% | +21% / +19% | ok where there are Lamps |
| Jackpot Sets | +22% | 0% | 0% | +30% | +48% | +12% | +25% / +16% | ok |
| Momentum | +10% | +10% | +31% | +38% | +35% | +5% | +9% / +12% | grows +0.5 a round: fine, and survives the Auditor |
| Overclock | +21% | +1% | +21% | +16% | +28% | +9% | +17% / +20% | fine; on a Tesla it does nothing (the zaps are scored by the other parts) |
| Golden Age | +12% | +10% | +24% | +23% | +17% | +21% | +12% / +13% | ok |
| Head Start | +10% | +8% | +23% | +32% | +36% | +5% | +9% / +13% | ok early, weak late |
| Thrifty | +15% | +15% | +15% | +15% | +15% | +15% | | +1% per $ held: with $100+ late cash it is a flat +50% (its cap) |
| Level Up | +12% | +1% | +21% | +13% | +13% | +1% | +10% / +12% | weak for a decal slot |
| Glass Ball | +13% | +33% | +130% | -16% | -2% | +16% | -17% / **+145%** | swingy physics; great for poor players |
| Rubber Ball | -3% | +59% | +144% | -2% | +17% | +85% | -20% / +101% | swingy physics; good for poor players, bad for pros |
| Safety Net | +6% | +13% | +12% | +15% | 0% | +4% | 0% / **+72%** | exactly the weak player's decal: good design |
| Glass Cannon | +11% | -1% | -7% | +12% | -6% | -5% | -8% / +8% | **about nothing**: one ball fewer for x1.5 is a wash |
| Combo King | +8% | 0% | +5% | 0% | 0% | 0% | +7% / +8% | weak |
| Spin Doctor | +10% | 0% | 0% | 0% | 0% | 0% | +9% / +5% | weak (only Spinners) |
| Long Fuse | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | **a no-op: bug** |
| Purist | 0 on all six tables | | | | | | | only works with 4 types or fewer; with the Big Boi engine it is fine (dragon-purist-siege) |
| Multiball Madness, Printer Plus, Free Kick | 0 without their parts | | | | | | | as designed (they need Printers / Kickbacks / a Twin) |

Cash decals (Sponsor, Wide Shelf, Interest, Coupon Book, Free Hands, Ball Hog, Free Reroll, Layaway, Big Toolbox, Bargain Bin,
Show-Off, Golden Ticket, Collector, Savings Bond): no score effect, as designed. Given §3.4 (cash piles up from round 10),
**every cash decal taken after round 6 is close to worthless**: money is not what late runs lack.

---

## 10. The change list

Ordered by what to do first. "Measured" means the numbers above; "proposal" is a design suggestion to measure next.

### 10.1 Close the ceilings (do these before anything else)

1. **Afterglow**: keep 15% of the Mult *gained* in the round (peak minus the start), not of the peak; or cap what it
   keeps at +5 (Momentum's pace). Measured: 10.7 -> 9.7 billion kept Mult over 10 rounds.
2. **Hall of Fame and Disco Ball**: put them through `takeX` with a cap per type (e.g. Disco x2.5 a ball for all Discos
   together, Hall of Fame x3 a ball), so a second copy does not multiply. Measured: 10^36 times the goal.
3. **Emerald on a ×Mult part**: the second firing pays half (x1.25 Disco), or Emerald fits only non-×Mult once-a-ball parts
   (Firecracker, Wizard Lamp). Measured: +100-137% over the host.
4. **A score guard**: clamp the score and the Mult to finite numbers (the dream builds reach 10^36; past 10^308 the
   score is Infinity, then NaN). Proposal.

### 10.2 Big Boi

5. **Zaps on Big Boi pay a quarter** (or Big Boi cannot be zapped). Measured: 93-96% of the engine builds' points are
   zaps, most of them on Big Boi.
6. **Power Plates add, not multiply**: n plates under one part pay x(1 + 0.5n), not x1.5^n (4 plates: x3 instead of
   x5.06), or a part counts at most two plates. Same for Spotlights (x1.5^n -> x(1 + 0.5n)).
7. **Fan Club x2** (from x3), and **Overclock / Level Up cannot target Big Boi** (he is already the strongest part every
   run). Measured: Fan Club +192% on the engine build.
8. **A Tesla arcing to a Level Light pair** levels the bumpers around it on every hit (build finder: ~4 permanent levels a
   round with no aim). Proposal: Level Lights cannot be zapped (they are aim targets).

### 10.3 The strongest parts and decals

9. **Spider Wheel**: one spin a ball (or a 10 s rest after a spin); Wheel Mania once a round; the timeout stops on a random
   segment, not always Zilch; spin slower (3 a second) so the stop is readable rather than a 200 ms timing trick.
   Measured: +536% avg, +1,119% pro.
10. **Ball Printer**: 2 balls a ball (from 3) and a 3 s rest after printing, or make it legendary at $11-12. Measured:
    +400-730%, the most reliable winner, including for poor players.
11. **Twin Ball**: count only launched balls for Multiball Madness (or anything counting balls); consider the twin
    arriving with the first ball of a round only. Measured: +73-565%.
12. **Mag-Grab**: it cannot grab the same ball again within 3 s, so a Mag-Grab-into-Big-Boi loop ends. Measured: with the clock off,
    its balls were still alive after 10 minutes.
13. **Autopilot tax** on the ball clock (§6): stops self-playing tables without touching any part.

### 10.4 The late game

14. **Make late money do something**: e.g. a $5 "tune-up" that levels one part, a $10 "bigger table" (more build area
    once a run), or scrapping being free from round 10. Measured: $47 at round 10 to $138 at round 15, unspent.
15. **Room for the big parts**: Duck Gallery, Goal!, Roller Pop and Free Ball Bucket cannot be placed on a 16-part late
    table at all; either let rails overlap floor parts, or shrink their footprint, or sell them only early (rounds 1-9).
16. **Then raise the final to 2.5M** with the second curve in §4, and re-measure.

### 10.5 The early game and the curve

17. Round 2 at 1,500 (poor players lose 61% of round 2).
18. **The round-3 boss** should come from a mild pool (Tax Man, Slippery Slope, The Magnet, Cheap Rubber): The Jammer
    jams the starter Pops, and Short Fuse ends 29% of the runs that meet it.
19. Round 9 at 40,000 (the wall: 57% of average players lose it).
20. Proposed curve in §4.

### 10.6 Bosses

21. **Short Fuse**: 40 s, not 30 (the hardest regular boss on every kind of build).
22. **The Overlord**: switch off a random type once a round (not every ball), or keep the -30% Mult but drop the switch-off.
    Measured: 0 of 6 campaign runs survived it; 0-11% pass rate on four of six build tables.
23. **The Jammer**: jam the most numerous *bought* type, never the starters, and never more than 40% of the table's points.
24. **Night Shift**: leave X Lanes and Disco Balls on (they are the late Mult every build needs); it still kills lanes,
    Lamps and Level Lights. Also: Spotlights ignore Night Shift today (build finder), which looks like an oversight.
25. **Tax Man**: also -25% points, or move it to the round-3 pool as the gentle boss.
26. **Crossed Wires**: needs a human playtest; the bot measurement (no effect) is wrong, the confused-hands one (0-11%)
    may be too harsh.

### 10.7 Bugs and oddities

27. **Long Fuse is a no-op**: lift `BALL_TIMEOUT` for each ball by the decal's 20 s.
28. **Spider Wheel timeout always lands on Zilch** (`floor(3 s x 5) % 8 = 7`).
29. **Decal levels go past 10**: `effectiveLevel` adds Level Up and Golden Age after the cap (up to 13). Maybe intended.
30. **Garnet does nothing measurable** on X Lane or Laser (their recharge is rarely what limits them).
31. **A Cook order on Goal! is never used up** (build finder, from the code: the goal path skips the order check).
32. **Gremlins never count as scoring hits** for the Midnight Clock, Lucky Seven or the Jackpot pot (build finder) — fine
    if intended, but the Hutch reads weak for $12.

### 10.8 The weak parts

VERDICT_SHORT

### 10.9 Tools

33. Give the balance tool's par bot a per-approach miss model (or use `tools/research/lib.ts`'s `Human`): today it
    measures a perfect player.
34. The auto-builder never finds "next to Big Boi" engines and moves parts for free; the research placer charges the move
    fee but is no smarter. A human finds the engine; the tools do not.
35. Add a nudging player (Rubber Feet, Heavy Ball's cost, tilt) and an aiming player (Goal!, Duck, Drop-Target Banks)
    before judging those parts.

---

## 11. Performance

- **Sim (Node)**: 10-17 ms of compute per second of play on every build (0.04-0.07 ms a step at 240 Hz). The worst single
  steps (up to 1.3 s) were JIT warm-up and an overloaded machine; they did not reproduce (worst 167 ms, in the first 5 s).
- **Browser (headless Chromium, software GL, `tools/research/browser-perf.cjs`)**: drawing a frame costs 1.2-6.5 ms on
  average, 16.4 ms at worst (multiball castle, 4 balls). Sim + draw per second of play: 160-790 ms in the worst 5 s window
  (1,000 is real time); the 37-part Hall-of-Fame zoo is the heaviest. No page errors.
- Real campaign tables reach 36-37 parts by round 12, so the zoo is a realistic worst case. Fine on a desktop; worth a
  check on a phone.

---

## 12. Re-running it

```bash
npx vite-node tools/research/calibrate.ts                       # the players (2 min)
npx vite-node tools/research/census.ts --out=census.json [--seed-off=7]   # every part (30 min)
npx vite-node tools/research/report-census.ts census.json census.csv
npx vite-node tools/research/report-pooled.ts census.json census2.json pooled.md
npx vite-node tools/research/campaign.ts --seeds=5 [--seed-base=6] [--strategies=meta] --out=campaign.json   # whole runs (25 min)
npx vite-node tools/research/report-campaign.ts campaign.json
npx vite-node tools/research/builds.ts --dir=<builds dir> --out=builds.json            # build trials (30 min)
npx vite-node tools/research/builds.ts --dir=<builds dir> --out=clock.json --mode=clock # clock on vs off (7 min)
npx vite-node tools/research/report-builds.ts builds.json clock.json
npx vite-node tools/research/rules.ts --builds=<builds dir> --ids=a,b --out=rules.json  # decals and bosses (80 min)
npx vite-node tools/research/report-rules.ts rules.json
npx vite-node tools/research/mechanics.ts                      # the parts with no points
```

The build finder's 21 builds are in `tools/research/builds/` (JSON: parts with spots, decals, decor, partial version,
the synergy each build claims).
