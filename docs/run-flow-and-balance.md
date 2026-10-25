# Run flow, major upgrades, rebalancing and board variety

Plans for the next stretch, written from your direction: *play, buy into the inventory, every few rounds pick one of three major upgrades (board, balls, parts...), install, start the round*; rebalance the levels; a proper testing environment; and variety in the board itself. Numbers are proposals to be tuned, not commitments. Status of each piece is marked.

## 1. The streamlined loop

```
 ROUND ──► PAYOUT ──► SHOP ──► (every 3rd round) MAJOR UPGRADE ──► INSTALL ──► START ROUND
 3 balls    tally      buy into    pick 1 of 3                       place, move,   one big
 vs goal               inventory                                      tune, test     button
```

**One "between rounds" screen**, not a chain of dialogs. A slim stepper across the top shows `1 Shop · 2 Upgrade · 3 Install`, the upgrade step appears only when one is due, and a large **Start round** button is always visible (it is disabled only while an upgrade pick is still owed). Everything stays free to rearrange, as now: buying costs money, moving and tuning never do.

| Step | Today | Plan |
|---|---|---|
| Payout | An overlay with line items. | ✅ Keep; show cash and what it can buy. |
| Shop (buy into inventory) | ✅ 4 offers, reroll, parts go to the inventory and follow the pointer. | Keep. Mark new items **NEW** in the inventory. |
| **Major upgrade** | ✅ Pick 1 of 3 after every boss (rounds 3, 6, 9, 12, 15); skip for $4. The cabinet pick at run start is still to come. §2. |
| **Install** | ✅ place / drag / rotate / tune / test ball / undo / layout slots. | ✅ Parts from upgrades and the shop arrive in the inventory marked NEW, so "install" is literal. |
| Start | ✅ the big button at the end of the stepper. | ✅ Locked while a pick is owed; pulses when nothing is left to place. |

Why pick-1-of-3: it is the reward screen Slay the Spire popularised (after a fight you choose one of three cards, or skip). A critic's observation fits our use: one pick sets a direction that every later round feels.

## 2. Major upgrades (built: 23 of the design's cards; see the plan, §4b)

Three cards, one per column, so the choice is legible and each run is steered toward a different kind of machine:

| Column | What it changes | Examples (all numbers are first guesses) |
|---|---|---|
| **Board** | The table and the round rules | **Ball Saver** (a free Ball Saver part in your inventory; the part itself is built, see the parts table in the plan) · **Extra Ball** (4 balls per round) · **Kickbacks** (two outlane launchers, delivered as parts to install) · **Magic Post** (rises between the flippers once per ball) · **Wider Build Area** (+4 units of room) · **Upper Flippers** (two Extra Flippers to install) · **Interest** ($1 per $4 held) · **Bonus-X** (end-of-ball multiplier +1) |
| **Balls** | The ball itself, for the whole round | **Rubber** (bouncier) · **Heavy** (hard to nudge, hits harder) · **Glass** (fast and light, more spins) · **Gold** (+$1 per 10 part hits) · **Magnetic** (saucers catch it more easily) · **Twin** (balls come in pairs) |
| **Parts** | Levels and special parts | **Level up** a part type · **Overclock** (+50% base on one type) · **Lamps glow +2 and pay +10%** · **Printer prints two** · **Lanes pay a double set bonus** · a **legendary part** to install (the Hand, the Castle) |

From stage 2 a fourth **Rules** column adds relic-style modifiers (*Combo Meal*, *Lucky Seven*, *Ball Hog*, *Banker*, *Layaway* from the earlier plan). These replace the separate "rule cards" idea: **the rule cards are the major upgrades**.

Rules for offers:
- Never offer a dead pick (no "level up Spinners" if you own none). Weight toward what you own, with one wild card.
- Skipping pays $4.
- Rarity: common, rare, legendary; legendary only from the second pick on.
- Some upgrades apply instantly, some arrive as **NEW** inventory items, some unlock space on the board.
- Every upgrade is a data row with a one-sentence recipe, like parts, so the card text is generated from the same numbers.

The foundation is built: **per-run part levels** (max 5, shown as pips on the part, saved with the run). A "level up" upgrade is one call to `game.levelUp(type)`.

## 3. Test lab (✅ first version built)

The Test Lab checkbox in the workshop opens a proper testing environment:
- **The whole catalog, free**, replacing the 4-offer shop (every part appears automatically when we add it); money shows ∞; nothing counts.
- **Lab tools:** drop 4 or 12 test balls, clear the board, levels +1 / −1 for every part type.
- Works with everything else: undo/redo, layout slots (loading a slot in the lab creates the parts it needs), the heatmap, the hover recipes.

Next for the lab: **bot play** (watch the machine run itself), **scenario presets** (a table full of lights; a multiball stress layout), **copy/paste a layout as text**, and the **Lab estimate**: run N bot balls on your layout in a worker and show the score distribution, which doubles as the balance tool in §4.

## 4. Rebalancing the levels (built; the numbers are a first pass)

**The numbers in the table below are provisional on purpose.** They exist so the game has a sensible curve and so we can see the machinery work. Human playtests and many more parts, abilities and toys are coming; each of those moves the curve, so do not tune it hard yet. What matters now is that the tooling exists and that no part runs away.

### The tools
- **The auto-builder** (`src/game/autobuild.ts`): given the parts a run owns, places each new part at the best of several random spots, then hill-climbs (nudge, rotate, turn a dial, swap two parts, bench or bring one back). Every candidate is played by the bot on the same seeds, scored by half the mean round and half the mean of the worse half (a machine that clears reliably beats a lucky one), and validated by `canPlace`. It never ends below where it started.
- **The par player** (`tools/par.ts`): takes the upgrade it is owed, shops by value per dollar within caps, auto-builds, and is measured. The policy is data (`PART_VALUE`, `PART_CAP`, `UPGRADE_PRIORITY`), so "what par means" is a one-line change.
- **The balance table** (`npm run balance`): four par players, one process each, play 15 rounds (about 25 minutes on 4 cores). `-- --quick` is a rough 2-minute look, `-- --write` regenerates `src/data/goals.ts`, `-- --verify --seed-base=10` judges fresh par machines against the goals in the game, `-- --cache=file` reuses a finished run. `tools/explain.ts` replays one measured round and says where its score came from.

### How the goal is set
The first rule (clear with a ball to spare 60% of the time *and* fail under 10%) cannot hold at once: bot rounds vary so much that the 10th percentile of the full round is about a third of the median. So the goal is **the score a par machine fails a chosen share of the time: 10% in round 1, rising to 40% in round 15.** Early rounds are easy for a par machine, and late rounds ask for more than par can give, which is the Balatro shape. The per-round numbers are noisy (four par runs differ in luck), so the table is a log-quadratic fit through them, never growing less than 12% a round.

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Goal | 4.0k | 6.1k | 9.3k | 14k | 20k | 29k | 42k | 58k | 80k | 110k | 140k | 190k | 240k | 300k | 370k |

The measured fail rate of the par machines against that table runs 10% to 48%, noisier than the 10% to 40% target (a few runs at 120 samples a round). That is within what a first pass needs; a `--verify` run on fresh seeds is the check to do after the next big batch of parts.

### What building it found (these were real bugs, and the tool is why we know)
1. **A lone Lane Rollover completed its own "set"** on every roll: +200 and +0.5 Mult for $3. A set now needs two lanes.
2. **A single ball lasted over ten minutes** (36.8 million points, $403 payouts). A Ball Printer chain kept re-catching and printing balls, each a new body with age 0, so the 90 s timeout never fired, while Pop growth, Mult and coins all grew without end. Fixes, in the part data and in the sentence on each part: the ball clock belongs to the ball (60 s from its first launch, whatever it turns into) · Pop growth caps at +100 · Big Boi at +3 Mult a ball · lane and bank sets at 5 a ball · Cha-Ching and Gold Ball at $5 a round · a printer prints 4 balls a ball. That machine is saved as a regression fixture (`tests/fixtures/runaway-machine.json`).
3. Levers worth remembering when a number looks too big: a **cap**, a **per-ball or per-round limit**, a **cooldown**, or simply a **lower number**. Prefer the first three: they keep the fun of a part that builds up and only stop it from feeding on itself forever.

### What the table says (par machines, bot skill 0.6)
- **Growth:** the par machine's score grows about ×1.5 a round at first and plateaus around round 10, when it owns about 28 parts and the build area is full. Past that, difficulty comes only from the fail-rate ramp.
- **Where the points come from:** Pop Bumpers are 83% of round 1 and about 30% late; Vari-Targets about 20%, Big Boi about 20%, printers 8%, lanes 6%. No part dominates. (Watch Vari-Target: its x8 smash is the biggest single event in most late rounds.)
- **Economy:** income is $7 in round 1 rising to $25; early on it buys about two parts a round plus a reroll, as intended. **Late, money piles up unspent ($112 by round 15)** because par has everything it wants and the board is full. The shop needs late-game sinks (bigger purchases, buying upgrades or levels with money, price growth). This is the clearest design gap the table shows. Not fixed here.
- **Pacing:** median ball life is 41 s early and 55 to 61 s late (the 60 s clock binds from about round 8), so a round is 1.4 minutes early and 3 minutes late, and a run is about 30 minutes of play plus shopping. Ball life is above the 45 s target late. More drain pressure (outlanes, slingshots) would shorten balls without relying on the clock.
- **Ball searches** (a ball sat still for 3.5 s): about 6,000 over the whole run, almost all in rounds 4 and later, and almost all a pile of balls resting at the rear of a flipper in printer multiball, which the bot never flips because it ignores balls within 0.3 units of the pivot. Harmless (the search frees them) but real time lost; the auto-builder charges 3% a search so it does not avoid printers. Worth a look in human playtests.

### Still to do
Difficulty tiers (scale the fail-rate ramp, the ball saver, boss modifiers), a verify pass on fresh seeds after the next parts, late-game money sinks, a smarter par policy (it ignores Level Lights, which need aiming in pairs), and the Lab estimate and a "suggest a layout" button built on the auto-builder.

## 5. Board improvements and board randomness (not built; the design)

You asked for improvements to the board and randomness at the start. Space Cadet's variety comes from where the ball enters and what it hits (research §6b), and our own launch test showed the board's shape decides it. So the board becomes data too:

- **Cabinet pick at run start** (1 of 3): *Classic* (the current table), *Wide Body* (a wider build area, a slower ball), *Pachinko Cab* (a vertical table that starts with a field of pegs). Later: themed cabinets modelled on real machines (a three-level Haunted House, a Funhouse with a head, a cocktail table).
- **A seeded layout of fixed furniture** each run (a few posts, a ledge or two, the chamfer's angle), generated from the run seed so that the same seed gives the same board. Guarded by the launch-spread test run over many seeds (the busiest landing bin must stay under 40% for every seed).
- **Board upgrades** during the run (the Board column above): ball saver, kickbacks, magic post, extra space.
- **Rotating tiles** (an idea from a real patent for swapping playfield sections): a section of the board that changes which parts are live each round.
- A **cabinet preview** on the pick screen, using the heatmap to show where balls tend to land.

## 6. Order of work

1. ✅ Levels, Level Lights, drop-target bank, Test Lab, undo/redo, layout slots, heatmap.
2. ✅ Kickback, ball saver, vari-target and lane change (the cheap, very-pinball parts; catalog §4).
3. ✅ The **Upgrade** screen, 23 upgrades and the between-rounds stepper.
4. ✅ The **auto-builder** and the **balance table**; a first-pass goal curve (provisional: see §4).
5. Cabinet picks and the seeded board.
6. Moving parts, magnets and then layers (ramps), toys.

## Sources

- Slay the Spire's reward screen: [Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire) · [Unwinnable, "Choose Your Own Adventure with Slay the Spire"](https://unwinnable.com/2019/02/13/choose-your-own-adventure-with-slay-the-spire/)
- Space Cadet and Full Tilt! mechanics, patents and museum material: see [parts-catalog.md](parts-catalog.md).
