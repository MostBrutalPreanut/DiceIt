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
