# Dice It!

Premium, web-first dice roguelite. Design: [`Dice it plan v0.1.md`](Dice%20it%20plan%20v0.1.md).

## Milestone 0 — headless core + tuning bot (this code)

No graphics. A pure TypeScript game core with **per-die scoring** (no global poker combos), a table of special faces, and bots that play thousands of runs so we can tune numbers with data.

```
src/core/      pure logic, deterministic given a seed (rng, roll resolver, run state machine, shop)
src/content/   designer-editable data: specials.ts (faces, prices), config.ts (targets, payouts, dice prices)
src/sim/       bots (random, greedy), run player, report, CLI
tests/         vitest
reports/       saved sim output (gitignored)
```

```bash
npm install
npm test                       # unit tests
npm run typecheck
npm run sim -- --runs 300      # all bots, default config
npm run sim -- --runs 300 --policy greedy --bank never --seed mine
npm run sim -- --policy greedy --set targetGrowth=1.3 --set dieGrowth=1.2   # override any config value
```

### Scoring rules
Dice resolve left to right. A die scores `face value x multiplier from its left neighbour`; the roll is the sum of its dice.
Faces: plain pips, **Mult** (multiplies the die to its right), **Echo** (copies the die to its left), **Crowd** (pips per die in the tray), **Sum** (sum of the other dice), **Boom** (big score, then the die self-destructs; the last die is spared).
Shop: +1 a face, +1 a whole die, buy a die (price grows with dice owned), buy a cheap **volatile** die (5 normal faces + a Boom face), buy a special face for any die.

### What's in / out
In: seeded RNG, upgradeable d6s, specials, volatile dice, rounds with target + roll budget, boss target bump, payout scaled to target, shop, ordered roll **event stream** (the future view's contract), random and greedy bots, per-round growth/tension report.
Out (next): relics, other die types, nudges/rerolls, tray rearranging, boss modifiers, meta-progression, UI.

### Reading the report
- **win rate / avg rounds won**: `random` is the floor (~0%), `greedy` is a competent-ish player (target 20-40%).
- **death histogram**: spikes show difficulty walls.
- **per round table**: dice owned (do we reach "a ton of dice"?) and score/target (1.0-1.6x is healthy tension).
- **purchase / special stats**: what bots buy; unused or dominant items.
