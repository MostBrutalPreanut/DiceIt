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
| **Major upgrade** | Not built. | Pick 1 of 3 after every boss (rounds 3, 6, 9, 12, 15), plus a cabinet pick at run start. §2. |
| **Install** | ✅ place / drag / rotate / tune / test ball / undo / layout slots. | Upgrades that are physical arrive in the inventory marked NEW, so "install" is literal. |
| Start | ✅ button in the left panel. | One prominent button, pulses when nothing is left to do. |

Why pick-1-of-3: it is the reward screen Slay the Spire popularised (after a fight you choose one of three cards, or skip). A critic's observation fits our use: one pick sets a direction that every later round feels.

## 2. Major upgrades (not built; the design)

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

## 4. Rebalancing the levels (not done; the method)

Today the goal curve is a placeholder (round 1 = 2,500, ×1.7 each round) and the economy is guesses. A bot clears round 1 on its first ball only 40% of the time, but a bot is not a person and the starter machine is not a bought machine. The method:

1. **Define the par machine** for each round: what a sensible player owns by then given the real income and prices (the shop and the upgrades above fix this).
2. **Build it automatically.** A tool that, given the parts you own, searches for a good layout: random restarts plus hill-climbing on simulated score, with a layout validator (no ball traps) and the launch-spread rule. The same code becomes the Lab estimate and the "suggest a layout" helper.
3. **Measure it.** The bot (at a *human-ish* skill, about 0.6, not 0.9) plays hundreds of balls on the par machine per round. Record the 3-ball score distribution.
4. **Set the goal** at a percentile: `Goal(n)` such that the par machine clears on ball 2 about 60% of the time and fails the round under 10%. Escalation then comes from the par machine growing slower than the goal in the late stages, which is the Balatro shape.
5. **Check the economy:** income per round against part prices (target: one good purchase plus a reroll per round early, a big purchase every other round late), the reroll price, and the sell-back rate.
6. **Check pacing:** ball life under 45 s (it was 49 s for a skilled bot on the starter machine), a round of about 2.5 minutes, a winning run of about 40 minutes.
7. Publish the numbers as a table (`npm run balance`) so every change shows its effect.

Difficulty tiers then scale the percentile, the ball saver, and the boss modifiers.

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
3. The **Upgrade** screen and the first ~20 upgrades; the between-rounds stepper.
4. The **auto-builder** and the **balance table**; set the real goal curve.
5. Cabinet picks and the seeded board.
6. Moving parts, magnets and then layers (ramps), toys.

## Sources

- Slay the Spire's reward screen: [Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire) · [Unwinnable, "Choose Your Own Adventure with Slay the Spire"](https://unwinnable.com/2019/02/13/choose-your-own-adventure-with-slay-the-spire/)
- Space Cadet and Full Tilt! mechanics, patents and museum material: see [parts-catalog.md](parts-catalog.md).
