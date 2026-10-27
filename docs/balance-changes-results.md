# Balance changes: what was done, and what the re-measure says

The implementation of [balance-changes-plan.md](balance-changes-plan.md), phase by phase, then the re-measure (phase 10)
with the same research harness and the same three players (pro, avg, poor) as [balance-research.md](balance-research.md).
Where the measurement says something still needs to change, it is flagged under **Flags** at the end.

## 1. Implemented

Every item of phases 1-9 is in, with its card sentence changed in the same place as its number. Tests for each are in
`tests/balance-changes.test.ts` (plus the existing tests, updated where they pinned an old number).

| Phase | Item | Done | Note |
|---|---|---|---|
| 1.1 | Afterglow 10% of the round's gain | yes | **Changed from the plan's formula**: "peak − start Mult" still compounds when ×Mults multiply the kept Mult (the singularity build hit the score ceiling with it). Afterglow now measures the gain as if the ball had started without the Mult the decals kept (`Scorer.peakGain`), so it is linear whatever the ×Mults. |
| 1.2 | Disco ×1.5 (all ×3 a ball), Hall of Fame all ×3 a ball | yes | |
| 1.3 | Score guard (10^15), MAXED | yes | |
| 2.1 | Zaps score points, never Mult | yes | also: a zap never polishes a Trophy, and a zapped lane set adds no Mult |
| 2.2 | Fan Club ×2; Overclock and Level Up never pick Big Boi | yes | |
| 2.3 | At most 2 Plates and 2 Spotlights a part (the strongest) | yes | |
| 2.4 | Level Lights cannot be zapped | yes | |
| 3.1 | Spider Wheel: one spin a ball, Mania once a round, Zilch on timeout, card fixed | yes | |
| 3.2 | Printer cap 2, 3 s rest | yes | |
| 3.3 | Twin with the first ball of a round only; ball counts are balls in play | yes | |
| 3.4 | Mag-Grab ignores its thrown ball 2 s | yes | |
| 3.5 | X Lane rare, $8 | yes | |
| 4.1 | Closing time (no kicks, catchers roll over, Kickbacks/Bucket off, lights out one by one, Big Boi's cash-in at 15 s for 5% of the ball's points) | yes | |
| 4.2 | One clock per launched ball (a ball still in the lane leaves with the ball) | yes | |
| 4.3 | Wording audit | yes | Printer, Twin, Gumball, Wizard, Bucket, Long Fuse, the HUD clock tip |
| 4.5 | Hourglass (uncommon $5) | yes | new part, with its own prop |
| 4.6 | Sudden Death (rare decal) | yes | new decal, with its own sticker |
| 5.1 | Round pays a flat $4, $1 a ball left, Ball Hog $3 | yes | |
| 5.2 | Nest Egg (uncommon decal) | yes | |
| 5.3 | The Vault (rare bumper, $8) | yes | |
| 6.1 | Round 3 from a gentle list | yes | |
| 6.2 | Short Fuse 40 s | yes | |
| 6.3 | Overlord: one type off for the whole round | yes | |
| 6.4 | Jammer: the part that scored most last round | yes | **never Big Boi** (he is the machine, not a part you chose; the board's B said "never the starters"): it jams the best of the rest |
| 6.5 | Night Shift: lights pay half; board darkens, glows dim | yes | Level Lights still level up in full (a level cannot be halved) |
| 7.1 | Helping Hand: a small flipper on the button of the way it faces, $2 | yes | a Faces dial picks left (←) or right (→); 75% of an extra flipper's length |
| 7.2 | Left/Right Flipper $4 | yes | |
| 7.3 | Whale: no spout limit, 3 s rest | yes | |
| 7.4 | Spotlight dark 4 s | yes | |
| 7.5 | Deflector 5 points, Hot Shot +50% | yes | |
| 7.6 | Long tag, "needs room" on the shop card | yes | |
| 7.7 | Nest, Jar, Bonsai, Clock, Altar/Hutch, Capsule, Garnet, Opal, Gold Leaf, Topaz | yes | Garnet now fits the Sparkler, Rock Pile, Splitter, Kickback and Tesla Coil too |
| 7.8 | Glass Cannon ×2, Combo King ×3 | yes | |
| 7.9 | Gremlins count as scoring hits | yes | |
| 7.10 | Cook orders on Goal! | yes | |
| 8.1 | The balance tool plays with pro/avg/poor | yes | `npm run balance -- --player=avg` (default), `--players=pro,avg,poor`, `--player=bot` for the old bot |
| 8.2 | Human playtest list | yes | [playtest-list.md](playtest-list.md) |
| 9.1 | Step 1 curve (1M final) | yes | |
| 9.2 | Endless as a list to round 30, "You beat it all. Well done!" | yes | |
| 9.3 | Round numbers | partly | base points are multiples of 5 now (Cha-Ching, Slingshot, Vari-Target, Drop-Target, Ding-Dong, Mag-Grab, Sparkler, Whale's swallow, Jackpot's pot), and so are the bigger per-level steps; the hover card rounds what it shows (to 5 up to 100, two figures above). Per-level steps of 1-3 on cheap parts were left alone (rounding them to 5 would double those parts' late value). |

After the first re-measure (below), six more changes went in, all from what was measured:

| Change | Why |
|---|---|
| Ball Printer prints **once** a ball (was 2), still rests 3 s | still +110% to +432% in both census passes with a cap of 2 (target: under +150%) |
| Wizard Mode lasts **20 s** (was 30) | +154% / +173% on the mid table in both passes |
| The Whale's spout pays **500** (was 300) | the plan's own fallback (7.3): still a net loss on the late table in both passes |
| Bonsai Bumper **+10** a round (was +6) | the plan's own fallback (7.7): a net loss on the late table in both passes |
| Wizard Mode **doubles** every ×Mult limit (was: lifts them) | the build trials: inside Wizard Mode the Golden Bumper's ×1.05 a hit had no cap, and the singularity build reached a 2 billion Mult |
| **Overheat**: a catcher or a Tesla Coil that fires 4 times in 6 s rests 5 s | the plan's 10.2 rule: with the clock off, some builds still kept balls up 4-8 minutes |

## 2. The part census (both passes)

Every part on the mid and the late table, 3 players, two passes with different seeds and placements (as in the
research). Full table: [balance-research/after/pooled.md](balance-research/after/pooled.md). Measured before the four
changes just above.

**The engines are back in range.** The old runaways now read:

| Part | Before (late avg, pass 1 / 2) | Now (late avg, pass 1 / 2) | Now (mid avg) |
|---|---|---|---|
| Spider Wheel | about +930% | +36% / +27% | +68% / +58% |
| Ball Printer (cap 2) | +417% / +622% | +230% / +110% | +365% / +432% |
| X Lane | +57% / +83% | +34% / +74% | +96% / +93% |
| Mag-Grab | +67% / +6% | +22% / +56% | +68% / +58% |
| Tesla Coil | +12% / +37% | +6% / -13% | +81% / +12% |
| Disco Ball | (×2.5, no cap) | +20% / +25% | +47% / +42% |
| Hall of Fame | (no cap) | +82% / +97% | +66% / +60% |

Still above +150% somewhere: the Printer (cut again, above), the Wizard Lamp (cut, above), the Gumball Machine on the mid
table (+112% / +234%; the board said no change) and the Golden Bumper for a pro (+175% late; +100% to +116% for avg).

Still a net loss in both passes: the Deflector (-32% / -7% mid, -16% / -2% late), the Piggy Bank (-2% to -24%; it pays in
money, which the census does not count), the Whale and the Bonsai late (buffed, above), the Time Capsule and the
Spotlight late (-26% / -20%; mid it is mixed). The four big rail parts get no room on the 36-piece late table, as the
plan expected (the shop card now says "Needs room"). The new parts: Hourglass -6% to +27% (noise), the Vault +19% to
+66%, both in range.

Gems: the Emerald and the Red Seal (in a Thunder) are the only ones that matter (+30-40%). Gold Leaf at +2 a score is +5%
late, +20% mid; **Opal and Garnet still do nothing measurable (0-6%)**, as before.

## 3. Builds, the clock and the run-out

The build finder's 21 builds (full, partial, auto-placed) × 3 players × 2 seeds, rounds 10-15 against the new goals then
endless: [balance-research/after/builds-and-clock-report.txt](balance-research/after/builds-and-clock-report.txt).

- **Ordinary builds ($50-130) now stop at rounds 13-14**; before, a $53 Big Boi build reached round 18-20. Only the
  expensive dream builds ($150-300: Hall of Fame zoo, broom runway, dragon apocalypse, supernova, bell tower, overdrive)
  beat round 15 and go on into endless.
- **The singularity build still ran away** (peak Mult 2 billion): Wizard Mode lifted every ×Mult cap, and the Golden
  Bumper's ×1.05 a hit compounds without one. Fixed afterwards: **Wizard Mode doubles the ×Mult caps instead of lifting
  them**. (Every other ceiling held: Afterglow, Disco, Hall of Fame.)
- **Big Boi still takes 76-92% of the points on the Big Boi builds** (foreman-elevator 92%, dragon-purist 88%, budget
  grape 88%, cook-autopilot 76%), with zaps 60-72% of all points. Zaps no longer give Mult, but Tesla Coils still zap
  him for his points (×2 Fan Club, ×2.25 from two Plates). See the flags.
- Other one-part builds: the Drop-Target Bank 72% (Target Practice), the Echo Cave 46%, the Golden Bumper 44%.

**Clock off** (every ball out, cut at 10 min): no build reaches the 10-minute cut any more (before: three did). But the
multiball castle still kept a ball alive 499 s, the Diner autopilot 420 s and the Hall of Fame zoo 236 s, past the plan's
2-minute line. So, as the plan says, **Overheat is in**: a catcher (Mag-Grab, Jackpot Scoop, Printer, Wheel) or a Tesla Coil
that fires 4 times in 6 s rests 5 s.

**The run-out** (closing time): 196 run-outs, 98% rolled out by themselves, 2% a stuck ball taken, **0 cut at 15 s, 0
fresh clocks**; median 2.5 s, 90th percentile 3.7 s. Exactly what the harness variant promised.

## 4. Whole runs (the campaigns)

The real run: shop rolls, decal picks, bosses and money; 4 shopping strategies (par, seeker, casual, meta) × 3 players
(pro, avg, poor); a lost round ends the run. Reports in [balance-research/after/](balance-research/after/).

| Campaign | Runs | Pro won | Avg won | Poor won | Pro median round | Avg median round |
|---|---|---|---|---|---|---|
| Before the changes (research) | 120 | 15% | 2.5% | 0% | 8.5-9 | 3-7.5 |
| **As planned**: $4 a round, 1M final (5 seeds) | 60 | 0% | 0% | 0% | 1-8 | 1-7 |
| $4 a round, softer late curve (600k final) (10 seeds) | 120 | 2.5% | 0% | 0% | 6-9 | 1.5-6.5 |
| $5 a round, 1M final (10 seeds) | 120 | 2.5% | 0% | 0% | 2.5-11 | 1.5-8 |

The plan's targets were pro 30-50%, avg 15-30%, poor rarely. **None of these comes near.** What the numbers say:

- **Money is where the plan wanted it.** Cash at the shop is $6-12 a round through round 12, spending $7-9 (about two
  cheap parts or one good one), no pile-up (the old $47 → $138 is gone). With $5 a round it is $9-12, still no pile-up.
- **Rounds 1-10 are fine for a pro, a bit harsh for the rest.** With $5 a round the pro par and seeker players fail 0-2% of
  rounds 1-5 and 7-8% of rounds 6-10, about the research's numbers before the changes. At $4 it is 5-9% and 7-23%.
  Average players lose 15-25% a round from round 3 on; poor players 30-50% a round from round 1 (round 1 is the bare
  starter, unchanged: poor players score 0.24-2.6× the 1,000 goal).
- **The late game is a wall.** From round 12 the pro loses 38-67% of every round it plays (score/goal median falls to
  1.1 at round 12 and 0.8 at round 14). The exploits used to carry the late game (Afterglow compounding, the Printer, the
  Wheel, twin multiball); with them closed, an honestly built table grows about ×1.4-1.5 a round from round 10 while the
  curve asks ×1.7. Peak Mult at round 14 is 11; kept Mult 3.4; the bots take no levels (median 0).
- What wins in normal play now: Pops (top part in 23-37 of the late rounds), Ding-Dong Bells, then Big Boi. The top part
  takes 42-44% of a late round: no single part carries a normal table any more.
- Bosses (rounds that met them, $5 run): The Jammer 35% lost, Flat Rate 29%, Cheap Rubber 27%, The Magnet 24%, Night
  Shift 19%, Short Fuse 35% in the $4 run. No regular boss is a run-ender any more; the final bosses could not be judged
  (1-3 runs reached them).

## 5. Decals and bosses

The late table plus four build tables, 6 rounds a cell
([balance-research/after/rules-report.txt](balance-research/after/rules-report.txt)). On the build tables only the avg
player plays and the noise is about ±30% (the cash decals, which cannot change a score, read -8% to +34% there): read the
late column first.

- **Decals, late table (avg)**: Glass Cannon +61% (×2 now, one ball less), Twin Ball +39% (first ball only), Bumper Car
  +36%, Lucky Seven +27%, Heavy Ball +25%, **Sudden Death +25% (pro 0%, poor +43%)**, Bright Lamps +23%, Glass Ball
  +23%, Jackpot Sets +22%, Overclock +21%, Minimalist +20%, Last Call +19%, Combo King +18% (×3 now; +34% on the cook
  banks table). Afterglow is now +10% late (it is linear) and still +126% to +228% on the ×Mult tables. **Nest Egg +6%**
  (with $15 held it is +0.3 Mult) and Spin Doctor +7% (no Spinner on the late table) are the weakest score decals.
- **Bosses, late table (pass rate of a goal the table clears 83% of the time, avg)**: Tax Man 83%, Night Shift 83% (but
  0-17% on the light builds, as intended), Short Fuse 67% (40 s), Overlord 67% (now once a round), Slippery Slope 33%,
  The Magnet 33%, Whirlpool 17%, **Cheap Rubber 0% (×0.42 of the score), The Jammer 0% (×0.51), The Auditor 0%** (and
  0-33% on every build table, ×0.16-0.6). Crossed Wires: a player who presses the wrong hand 30% of the time gets 0%
  everywhere; the bot that swaps hands perfectly reads 17% on the late table but 50-83% on the build tables (noise of 6
  rounds); it still needs a human playtest.
- Big Boi unzappable (a variant, not in the game): on the six Big Boi builds his share falls from 76-92% to 56-74%, but the
  builds collapse from round 13 to rounds 6-11
  ([balance-research/after/variant-bigboi-unzappable.txt](balance-research/after/variant-bigboi-unzappable.txt)).
