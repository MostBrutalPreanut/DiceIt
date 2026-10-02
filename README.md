# Dice It!

Premium, web-first dice roguelite. Design: [`Dice it plan v0.1.md`](Dice%20it%20plan%20v0.1.md).

## Milestone 0 — headless core + tuning bot (this code)

No graphics. A pure TypeScript game core, a content table of 21 combos, and bots that play thousands of runs so we can tune numbers with data.

```
src/core/      pure logic, deterministic given a seed (rng, roll/scoring, run state machine, shop)
src/content/   designer-editable data: combos.ts (chips/mult/rarity/cost), config.ts (targets, payouts, prices)
src/sim/       bots (random, greedy), run player, report, CLI
tests/         vitest
reports/       saved sim output
```

```bash
npm install
npm test                       # unit tests
npm run typecheck
npm run sim -- --runs 300      # all bots, default config
npm run sim -- --runs 300 --policy greedy --bank never --seed mine
npm run sim -- --policy greedy --set targetGrowth=1.4 --set 'dicePrices=[30,80,180]'   # override any config value
```

### What's in / out
In: seeded RNG, d6 dice with upgradeable faces, 21 combos with families + levels, `(base + chips) x (1 + mult)` scoring, rounds with target + roll budget, boss-round target bump, payout (clear + spare rolls + overkill), shop (face +1, buy die, combo training), ordered roll **event stream** (the future view's contract), random and greedy bots, reachability report.

Out (next): specials/relics, other die types, nudges/rerolls, boss modifiers, meta-progression, UI.

### Reading the report
- **win rate / avg rounds won** per bot. `random` is the floor (should be ~0%), `greedy` is a competent-ish player (target 20–40%).
- **death histogram**: spikes show difficulty walls (e.g. a boss round).
- **combo trigger rate by dice owned**: a combo that shows `.` at a dice count where it is allowed is unreachable in practice.
