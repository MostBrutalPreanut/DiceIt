# Balance changes: the implementation plan

The plan for the session that makes the changes. It comes from the picks and notes on the
[Big Boi Balance Board](https://claude.ai/artifact/MocZrG7hwpnbKTfqaMBUN4) (61 items, read on 26 Oct), which come from the
research in [balance-research.md](balance-research.md). **Implemented (27 Oct): what was done, the re-measure and what still
needs a decision are in [balance-changes-results.md](balance-changes-results.md).**

How to use it:

- Work the phases in order: later numbers depend on earlier ones (every curve and economy number is meaningless until the
  ceilings are closed). Each phase ends with its checks; do not start the next one with red tests.
- Every card sentence comes from the recipe (`describe()` in `src/data/parts.ts`, `text()` in `src/data/decals.ts`):
  change the number, and the card follows. Where a rule changes, update the sentence in the same commit, and the
  blurb if it now lies.
- Keep numbers round (your note on the goal curve): base points, caps and costs as round numbers, and the hover card
  shows round numbers (see 9.3).
- The research tools in `tools/research/` measure everything below; the commands are at the end of each phase.

---

## 0. Answers to the questions in your notes

| Your note | Answer |
|---|---|
| **Printer**: "How did it catch 50 times if it only works 3 times a ball? Was it 20 of these on the board?" | One Printer on the table. The ball falls into it about 50 times a round (each catch scores 40 and holds the ball 0.6 s); it only *prints* a new ball 3 times a ball (`printCap`). Its power is the sure multiball every ball, which is what 2.2 cuts. |
| **Gold Leaf**: "Up to 5× of what? What is the base?" | The part's own base points (`recipe.points`). A Pop Bumper (20) can gain at most +100, a Thunder Bumper (60) +300. It grows +1 every time the part scores. |
| **Levels**: "I think the level up was designed as up to 5, and resets by the end of the ball… When was this changed?" | Levels have always been for the rest of the run: they arrived in commit `70c2ae1` ("per-run part levels (max 5)"), and the cap went to 10 in `537e358` (25 Oct, the points-÷5 rebalance). What resets every ball is a Pop Bumper's *growth* (+1 per Pop hit, up to +20). Decided: levels stay per run (D1). |
| **Long Fuse**: "spawning new balls does NOT refresh the timer, the wording makes it sound like it" | Right: the clock belongs to the ball you launch, and every ball it turns into (printed, twin, Wizard, Gumball) shares it. Two code paths break that today (a Bucket catch in the run-out, a twin left in the lane): fixed in 4.2. Wording audit in 4.3. |
| **Autopilot / loop breakers**: "I think we already solved this in another fix?" | Mostly yes: closing time (4.1) ends every run-out loop the tests found, the Mag-Grab rest (3.4) breaks the ping-pong, and the Wheel and Printer limits (3.1, 3.2) remove the other two engines. A loop during play is now bounded by the ball clock. So no new loop rule now; 10.2 re-tests it, and Overheat is the fallback if a loop survives. |
| **Weak players**: "See if making it controllable helps" | Covered by the Helping Hand redesign (7.1), then measured in 10.2. |
| **Cash decals**: "Just suggested solutions" | They become useful once money is tighter (phase 5); nothing to change on them. |
| **Spin Doctor** (picked: offer only with a Spinner) | Already the case (`worth: owns(v, 'spinner')`). No change; its weak numbers come from tables without Spinners. |

## Decisions (all answered on 26 Oct)

- **D1. Levels: decided, keep them per run** (up to 10, as now). The "levels past 10" item stays as is; no change.
- **D2. Jammer: decided, as planned**: the single part that scored most in the last round scores nothing (6.4).
- **D3. Whale: decided** (26 Oct): swallowing stays the point (a swallowed spark is gone, and feeds the spout). No
  3-spouts-a-ball limit, a 3 s rest after each spout (7.3).
- **D4. Money: decided** (26 Oct): much less money. A cleared round pays a flat $4 and $1 for each ball left (5.1);
  go to $3 + $1 if cash still piles up.
- **D5. Big rail parts: decided** (26 Oct): they stay in the shop all run; a "Long" tag on their card, and "needs room"
  when the table has no space for one (7.6).
- **D6. Sparks and Mult: decided, sparks unchanged.** Only zaps lose their Mult (2.1); sparks keep giving Mult as today.
---

## Phase 1. Close the ceilings

1.1 **Afterglow: 10% of the round's gain, not of itself** (board: A + your note).
- `src/data/decals.ts`: `N.afterglow` 0.15 → **0.10**; `decalGrowth` (line ~285) for `'peak'` keeps `0.10 × (peakMult − the Mult balls started that round at)`,
  so what it already kept is not counted again. The scorer knows the start Mult (`opts.baseMult`); pass it to
  `decalGrowth` from `Game.endBall` (game.ts, where `decalGrowth(d, true, this.scorer.peakMult)` is called).
- Card: "At the end of every round, this decal keeps 10% of the Mult you gained that round: every ball after starts that
  much higher."
- Check: kept Mult over a 10-round segment grows about linearly, never compounding (the campaign that went 10.7 → 9.7
  billion should stay in the tens).

1.2 **Disco Ball: ×1.5, all Discos together at most ×3 a ball; Hall of Fame: all together at most ×3 a ball** (board: A + your note).
- `PARTS.disco.recipe`: `xmult` 2.5 → **1.5**, add `xmultCap: 3`. One Disco ×1.5, two ×2.25, a third only reaches the cap (×3).
- `PARTS.fame`: route `typeXNow` through `takeX('fame', …, gainX(3))` in `scoring.ts` (lines ~470 and ~865) so every
  copy shares one ×3 cap a ball. Give `fame` an `xmultCap: 3` so the card can say it.
- Emerald needs no rule of its own (board: C): with the caps, a second firing can only reach the cap faster.
- Cards: Disco "Multiplies your Mult by ×1.5 the first time a ball rolls over it each ball (all Disco Balls together: up to
  ×3 a ball)". Hall of Fame "… (all Halls of Fame together: up to ×3 a ball)".
- Watch: a single Disco measured +66% to +115% at ×2.5; at ×1.5 it may read weak for a legendary. Measure in 10.1 before
  touching it again.

1.3 **Score guard** (board: A). Clamp the score and the Mult to a finite ceiling (e.g. 10^15) where the scorer adds points
(`award()` in scoring.ts) and in `Game.runScore`; the HUD shows MAXED at the ceiling. A unit test with an absurd Mult.

Checks: `npx vitest run`; the stacking unit tests (tests for xmult caps); `npx vite-node tools/research/builds.ts --dir=tools/research/builds --ids=dream-disco-fame-singularity,xmult-ladder,hall-of-fame-zoo --out=b.json` (the singularity build must stop at sane numbers).

---

## Phase 2. Big Boi and stacking

2.1 **Zaps score points but never Mult** (board: C + your note). In `scoring.ts` `hit()`: when `ev.zap`, the hit's
`multGain` is 0 and its `xmult` 1 (×Mult parts already cannot be zapped). This covers Big Boi's +0.15 a hit, Thunder,
the Foreman and every other additive Mult when zapped. Cards: Tesla Coil adds "Zapped parts score their points, but only
the ball itself raises your Mult."; same sentence on Powder Keg, Laser Turret, Shockwave Gong, Ritual Altar.

2.2 **Fan Club ×2, and Overclock / Level Up cannot pick Big Boi** (board: A). `N.fanClub` 3 → **2**; in `decals.ts`
`scoringTypes` and `levelableTypes` drop `'mega'`.

2.3 **A part counts at most 2 Power Plates and at most 2 Spotlights** (board: B). `plateXAt` and `spotXAt`
(scoring.ts ~415, ~459): multiply only the 2 strongest (nearest) of each. Cards: Plate "… pays ×1.5, and a part counts at
most 2 plates"; Spotlight the same.

2.4 **Level Lights cannot be zapped** (board: A). `zappable()` (parts.ts ~337) returns false for `levelUp` parts.

Checks: unit tests for zaps, plates, decals; `builds.ts` on `foreman-elevator,dragon-purist-siege,cook-autopilot-survival,foreman-furnace`: Big Boi's share should fall well under 70%.

---

## Phase 3. The strongest parts

3.1 **Spider Wheel** (board: A + your note; Zilch: B).
- One spin a ball: after its spin, the wheel lets the ball roll over it (points only) until the next ball.
- Wheel Mania at most once a round; the eight-prize progress (`spun`) keeps counting across rounds, as now, so a very good
  player gets Mania once or twice a run.
- The timeout still stops on Zilch (board: B): the card says so: "… or it stops by itself after 3 s, on ZILCH".
- Card bug: "Holds the ball 70 s" (parts.ts ~1164 reads the first dial; for the wheel that is Power): the wheel's
  sentence is "Spins until you flip, or 3 s."

3.2 **Ball Printer** (board: A): `printCap` 3 → **2**, and after printing it rests 3 s (lets balls roll over it). Card text
follows.

3.3 **Twin Ball** (board: B). (a) Multiball Madness and anything that counts balls counts only balls in play, not one
waiting in the lane: `opts.balls` in `Game.newScorer` uses the balls not in the lane. (b) The twin comes only with the
first ball of every round. Card: "The first ball of every round arrives with a twin."

3.4 **Mag-Grab rest** (board: A + your note "even 1 s"): a Mag-Grab ignores the ball it just threw for **2 s** (the ball
rolls over it). Start at 2 s; if the ping-pong survives in 10.2, 3 s. Card: "… then it ignores that ball for 2 s."

3.5 **X Lane becomes rare, $8** (board: A): `PARTS.xlane.rarity` 'rare', `cost` 8.

3.6 Gumball Machine: no change (board: A).

Checks: unit tests (wheel, printer, multiball, mag-grab); `npx vite-node tools/research/census.ts --parts=wheel,printer,magnet,xlane,gumball --out=c.json` then the pooled report against `docs/balance-research/` numbers: the Wheel should land under +150%, the Printer under +150%.

---

## Phase 4. The clock

4.1 **Closing time** (board: E). When the ball clock runs out (`timeUp` in `sim.ts`), on top of what the merged run-out does:
- bumpers and slings stop kicking (`kickFactor` 0 for the run-out);
- catchers stop catching: Mag-Grab, Jackpot Scoop, Spider Wheel, Ball Printer, Gumball (a ball rolls over them and
  still scores), in the saucer branch of the sim's hit handling (~line 1343);
- Kickbacks, the Free Ball Bucket and Ball Savers switch off (savers already do);
- the table's lights dim part by part (renderer: a run-out state);
- **the cash-in**: a ball still on the table at `RUNOUT_MAX` (15 s) is swallowed by Big Boi with a small bonus (say 5% of
  the ball's points, round number) and a gulp, instead of vanishing.
- Measured in the harness: 0 balls cut in 485 run-outs, run-outs 2-4 s (`tools/research/runout.ts --variants=v4`).

4.2 **One clock per launched ball** (board: bucket A + your Long Fuse note).
- The Bucket does nothing during the run-out (part of 4.1).
- A twin still waiting in the lane when the clock runs out does not get a new clock: it is launched by itself at the end of
  the run-out, or simply leaves with the ball. (Today `checkBalls` ends the run-out when every ball is in the lane and the
  next launch starts a new clock.)

4.3 **Wording audit**: every card, callout and doc that talks about the clock says "one clock per ball you launch; extra
balls share it" (Ball Printer, Twin Ball, Gumball, Wizard Lamp, Free Ball Bucket, Long Fuse, the HUD clock).

4.4 **Long Fuse**: done by the merged timer (board: A). Re-measure in 10.1.

4.5 **New: Hourglass** (part, uncommon, ~$5; board: picked): every hit on it from a flipper shot (the ball touched a
flipper within the last 1.5 s) adds +1 s to the ball clock, up to +20 s a ball. A round number of points (10).

4.6 **New: Sudden Death** (decal, rare; board: picked): every ball's clock is 20 s shorter, every hit pays ×1.5.

4.7 Run-out points count in full (board: A); no change.

Checks: `tests/limits.test.ts` (the merged run-out tests) plus new tests for closing time, the cash-in, the twin and the
Bucket; `npx vite-node tools/research/runout.ts --builds=tools/research/builds --out=r.json`: no `cut`, no fresh clocks.

---

## Phase 5. Money (Decision D4: numbers to measure)

Your note: give less money so every purchase counts, and add a decal and a part that pay off saved money.

5.1 **Much lower payouts** (`payoutFor` in game.ts ~1354, `unusedBallPay` in mods.ts ~129):
- round cleared: `3 + round` → a flat **$4** (no growth with the round);
- each ball left: $3 → **$1**;
- if cash still piles up in the campaigns: **$3 + $1**;
- boss bonus and overshoot unchanged for now; Ball Hog (a ball left pays $5 instead of $3) becomes **$3 instead of $1**
  so it keeps its ×3, and its card follows;
- with less money, prices may need a look (a $12 legendary is three rounds of pay): measure first.
- Target (measure with campaigns): enough for about one part a round without money parts or decals; never the $47 →
  $138 pile-up of rounds 10-15 measured today.

5.2 **New decal: Nest Egg** (uncommon): every ball starts at +0.1 Mult for every $5 you hold (up to +2).

5.3 **New part: Vault** (rare, $8, a bumper): scores 10 + $1 for every $1 you hold (up to +100) a hit.

5.4 Thrifty (+1% a hit per $1 held, up to +50%) already fits this; keep it.

Checks: `npx vite-node tools/research/campaign.ts --seeds=5 --out=c1.json` and the report's ECONOMY table.

---

## Phase 6. Bosses

6.1 **Round 3 draws from a gentle list** (board: A, and Tax Man A): Tax Man, Slippery Slope, The Magnet, Cheap Rubber.
`planBosses` (bosses.ts ~76): the first pick from that list, the other three from the rest.

6.2 **Short Fuse: 40 s** (board: A; 45 s if still too hard). Card text follows.

6.3 **The Overlord: one random part type off for the whole round, not every ball** (board: A; if still too hard, Mult
gains −20% instead of −30%).

6.4 **The Jammer: the single part that scored most last round scores nothing** (D2). Needs the last round's per-part
ledger saved on the Game (by uid). Card: "Your best part from last round is jammed: it scores nothing."

6.5 **Night Shift: lights pay half instead of nothing** (board: B + your note): the board darkens a little and the lights
dim, but stay on. Spotlights are lights here too (today they ignore Night Shift). Card: "Lights out: Lamps, lanes, Level
Lights, X Lanes, Disco Balls and Spotlights pay half."

6.6 Crossed Wires: no change (board: C).

Checks: boss tests; `npx vite-node tools/research/rules.ts --builds=tools/research/builds --ids=foreman-elevator,xmult-ladder,light-show-lane-echo,cook-target-practice-banks --what=boss --out=r.json`.

---

## Phase 7. Weak parts, gems and decals

7.1 **Helping Hand becomes a small flipper you control** (board notes on Hand, Hand card, Flippers, Weak players): no
more auto-flip; it flips with the button that matches the way it faces (left-facing: ←, right-facing: →), like the
normal flippers. **$2**. The card's contradiction ("needs no button" / "Left key") goes with the redesign.

7.2 **Left / Right Flipper: $4** (board: B): the large extra flipper, for skilled players.

7.3 **The Whale** (D3): swallowing stays as it is (a swallowed spark is gone and counts towards the spout). No
3-spouts-a-ball limit; a 3 s rest after each spout. If it still loses points in 10.1, the spout pays more (300 → 500) or
comes every 5th spark instead of every 6th.

7.4 **Spotlight**: dark for **4 s** after a ball hit, not 10 (board: A; stacking is 2.3).

7.5 **Deflector**: 5 points a hit, and its Hot Shot +50% (board: C).

7.6 **Big rail parts** (D5): Duck Gallery, Goal!, Roller Pop, Free Ball Bucket stay in the shop all run. Their cards get
a **Long** tag (a new `PartTag`, display only: no decal reads it), and when the table has no room for one, the card says
"needs room: move or scrap a part first".

7.7 Numbers (board: A on each):

| Part | Change |
|---|---|
| Spider Nest | eggs 25% → **50%** |
| Marble Jar | a marble every 25 hits → **every 10** |
| Bonsai Bumper | +4 a round → **+6** (+10 if still weak in 10.1) |
| Midnight Clock | 180 hits → **120** |
| Ritual Altar, Gremlin Hutch | legendary $12 → **rare $8** |
| Time Capsule | 6 rounds → **4** |
| Garnet | halves the cooldown of **any** part that has one (Sparkler, Rock Pile, Splitter, Kickback, the Tesla's zap rest, plus the four today) |
| Opal | also doubles Trophy polish and Bonsai age |
| Gold Leaf | +1 → **+2** a score (cap stays 5× the part's base points) |
| Topaz | 15% → **25%** |

7.8 Decals (board: A on each): Glass Cannon ×1.5 → **×2**; Combo King: Hot Shots pay **×3** the usual extra; Spin
Doctor: no change (see section 0); cash decals: no change (phase 5 makes them matter).

7.9 Gremlins count as scoring hits (board: A) for the Midnight Clock, Lucky Seven and the Jackpot pot.

7.10 Cook orders apply to Goal! (board: A): the goal's scoring path takes and clears the order like every other part.

Checks: unit tests per part; both census passes for the changed parts (`census.ts --parts=… --seed-off=0` and `--seed-off=7`, then `report-pooled.ts`): each should land inside or above the noise band, none above +150%.

---

## Phase 8. Tools (board: par bot A, playtest A)

8.1 The balance tool (`tools/par.ts`, `tools/balance.ts`) plays with the research players (`Human` in
`tools/research/lib.ts`: pro, avg, poor) instead of the per-frame Bot, and reports per player.

8.2 A human playtest list (and, as you noted, opt-in data from players): Crossed Wires, Goal!, Duck Gallery, Rubber Feet,
the run-out and closing time, the new Helping Hand.

---

## Phase 9. The goal curve (board: C + your notes)

9.1 **Step 1 now** (`src/data/goals.ts`): 1,000 · 1,500 · 2,500 · 4,000 · 6,000 · 10,000 · 15,000 · 25,000 · 40,000 ·
70,000 · 120,000 · 200,000 · 350,000 · 600,000 · **1,000,000**.

9.2 **Endless as a fixed list of round numbers, ending at round 30** (board: B + your note): rounds 16-30 at about ×1.6,
rounded: 1.5M, 2.5M, 4M, 6M, 10M, 15M, 25M, 40M, 60M, 100M, 150M, 250M, 400M, 600M, 1B (from step 1's final; shift
the list if step 2 lands). Round 30 cleared: a "You beat it all. Well done!" ending instead of more rounds.

9.3 **Round numbers on cards** (your note: "no 127 points on the tooltip"): base points, per-level points and caps stay
multiples of 5 (10 above 100), and the live hover card rounds what it shows (two significant figures, or to 5).

9.4 **Step 2, after phases 1-7 and a re-measure (10.1-10.3)**: 1,000 · 1,500 · 2,500 · 4,000 · 6,000 · 10,000 · 15,000 ·
25,000 · 40,000 · 75,000 · 150,000 · 250,000 · 500,000 · 1,000,000 · **2,500,000**. Your fallback: if that proves too
hard, keep the 1M final and leave the parts' numbers alone.

---

## Phase 10. Re-measure (the same tests as the research)

10.1 Both census passes (`census.ts`, `--seed-off=7`) and the decal census (`rules.ts --what=decal`): no part above
+150%, no part a net loss in both passes.

10.2 Build trials and the clock study (`builds.ts`, `builds.ts --mode=clock`) and the run-out study (`runout.ts`): no
build's top part above about 50% of the points; no self-playing build alive past 2 minutes with the clock off (if one is,
add Overheat: a catcher or Tesla that fires 4 times in 6 s rests 5 s).

10.3 Campaigns (`campaign.ts --seeds=10`, all four strategies): the targets from your goal:
- pro wins about 30-50%, average about 15-30%, poor rarely but sometimes with a good build;
- a medium or low player who wins usually wins clutch (round 15 score / goal under 1.5);
- most rounds of a winning run pass at 1.1-2× the goal; few fail before round 5.

Then decide step 2 of the curve (9.4).

---

## Not changing (your picks)

Gumball Machine, Emerald, Crossed Wires, run-out points, cash decals, Spin Doctor (already as picked), the autopilot tax
and the loop breakers (unless 10.2 finds a loop).

## Appendix: the picks as stored on the board

| Item | Pick | Note |
|---|---|---|
| afterglow | A | 10% of the highest Mult, not including itself |
| stacking | A | Disco ×1.5, at most ×3; a second still useful, a third a small add-on |
| emerald | C | |
| score-guard | A | |
| bigboi-zaps | C | Mult must come from bumping, not zaps; say so on the Tesla |
| plates | B | |
| fanclub | A | |
| tesla-levels | A | |
| wheel | A | Mania counts through rounds; once a ball; Mania once or twice a run for very good players |
| printer | A | (question answered in section 0) |
| twin | B | |
| maggrab | A | even 1 s would do |
| xlane | A | |
| gumball | A | |
| runout | E | "Fantastic" |
| bucket-clock | A | |
| runout-points | A | |
| time-items | Hourglass, Sudden Death | |
| autopilot, loop-breakers | open | "already solved by other fixes?" (section 0) |
| money-sink | decided (D4) | much less money ($4 + $1 a ball left, or $3 + $1); a decal and a part that use saved money |
| honest-builds | A | follows from the other fixes |
| big-parts | decided (D5) | in the shop all run; a Long tag and "needs room" |
| round3-boss | A | |
| weak-players | open | see if a controllable Hand helps |
| shortfuse | A | 45 s if still too hard |
| overlord | A | −20% Mult if still too hard |
| jammer | decided: jam the top part (D2) | B, or jam the top part instead of the type |
| nightshift | B | dim the lights / darken the board a little |
| taxman | A | |
| crossedwires | C | |
| longfuse | A | new balls don't refresh the clock; fix the wording |
| wheel-zilch | B | |
| wheel-card | A | |
| hand-card | open | covered by the redesign: a small cheap flipper |
| levels-cap | decided: keep per run | question answered in section 0 (D1) |
| cook-goal | A | |
| gremlins | A | |
| deflector | C | |
| whale | decided (D3) | no 3-a-ball limit, a cooldown; swallowing stays the point |
| spotlight | A | stacking fix also approved |
| nest | A | |
| jar | A | |
| hand | open | controllable, moves with the normal flipper by orientation (7.1) |
| flippers | B | large one $4, small one $2, for skilled players |
| bonsai | A | +10 if still weak |
| clockdecor | A | |
| legend-decor | A | |
| capsule | A | |
| garnet, opal, topaz | A | |
| goldleaf | A | (question answered in section 0) |
| glasscannon, comboking, spindoctor | A | |
| cashdecals | A | |
| goal-curve | C | fallback: 1M final; round numbers on parts and tooltips |
| endless-goals | B | stop at round 30, "Well done!" |
| parbot | A | |
| playtest | A | humans test; opt-in data |
