# Status: what works, what does not

The state of the game after the overnight test and balance pass (branch `ccr-f76f990f-mocbip`). "Works" means
checked: by the unit tests (`npx vitest run`), the browser smoke test (`node tools/smoke.cjs`, which drives the
built game in headless Chromium), the balance tool (`npm run balance -- --verify`) or by looking at screenshots.

## Checks

| Check | Result |
|---|---|
| Type check (`npx tsc --noEmit`) | clean |
| Unit tests | 337 pass, 0 fail (24 files) |
| Build (`npm run build`, `npm run artifact`) | builds; the single-file game is about 2 MB |
| Browser smoke test | 104 checks ok, no console errors |
| Renderer cost (smoke, software GL) | about 2.5 ms a frame |
| Balance run | see the balance section below |

The smoke test's timing checks (physics speed, frame cost, the shop's roll-in wait) fail when the machine is
heavily loaded (several test runs at once). On a quiet machine they pass. That is the test, not the game.

## Works

- **Main menu**: BIG BOI / PINBALL DESIGNER over a demo machine that plays itself. Resume (with the round and
  money of the saved run), New Game (asks before abandoning a run), Scoreboard, Settings.
- **Machine picker**: the three full cabinets from the key art, each with its Big Boi and what he does.
- **Pause** (Esc or the button by the table): Resume, Settings, Quit to Main Menu (the run stays saved), Abandon
  Run.
- **Settings**: music and effects volume, graphics quality (low also turns off the flying points), calm mode,
  and rebinding the two flipper keys and the plunger.
- **Scoreboard**: every finished run (won, lost, abandoned), best first, with its final build drawn.
- **Decal pick after a boss**: BOSS BEATEN, three sticker cards slap down and flip, the pick flies onto the
  apron. Keyboard (1/2/3, arrows, Enter, S to skip), mouse and touch.
- **Score dock** by the table: points fly from the part into it as chips, coins fly to the money.
- **Castle Crash**: a rock flagstone path and a castle-and-forest land around the machine.
- **Sound**: a softer, warmer mix; every part has its own sound (the spinner ratchets and whirs, the bell
  ding-dongs, the duck quacks); new music for each machine.
- **Balls no longer go back to the plunger**: the top of the plunger lane was open, so balls in play fell back
  into it about twice a ball. A one-way gate closes it. Stuck balls get a kick, a harder kick, and only then go
  back to the plunger without costing the ball.
- **Bargain Bin and other shop decals** apply to the shop at once (they used to wait for the next shop).
- **Moving and removing parts costs money**: a part that has played a round costs $1 to move (once a visit)
  and $1 to scrap; one bought this visit moves freely and goes back for what it cost. Free Hands (was Full
  Refund) makes it free.
- **Kept Mult** (Mult that sticks between rounds): the Trophy Cup, and the Momentum and Afterglow decals.
- **Packs**: Lane Rollovers come as three (they spell the machine's word, and a set is one pack), Level Lights
  as two.
- **New parts** this pass: Trophy Cup (rare, kept Mult), Power Plate (uncommon, bumpers on it pay ×1.5), Hall of
  Fame (legendary, once a ball ×1.1 Mult for every part type on the table).
- **Rank Lights and the Old Bell** (rare, step 1 of [borrowed-parts.md](borrowed-parts.md)): a pack of three
  lights that ranks the ball up (×1.2, ×1.4, ×1.6 on its hits for 40 s), and a bell whose first hit each round earns
  a notch; three notches ring it for ×1.2 Mult on every ball for the rest of the run. Measured with
  `tools/power.ts`: Rank Lights sit between Lane Rollovers and X Lane per dollar (1,119 a $ mid, 3,306 late). The
  bell's single-round number cannot show its rings; the par player now notches its bells between rounds.
- **Zaps and the Tesla Coil** (rare, $9): every hit arcs lightning to the 2 nearest parts (3 and 4 with levels),
  which score as if hit. Measured: 328 a $ mid, 1,043 late, on the power tool's small table (about Lane
  Rollovers per dollar; a plain Pop Bumper there measures -1,205 / -3,176). It should do more on a full board.
- **Crossed Wires**: the bot now swaps hands, as a player would (it used to score almost nothing on that boss).

## Does not work yet, or is unproven

- **The download button does nothing on the hosted page** (the artifact viewer blocks downloads). It works when
  the game runs from the build.
- **The par bot ignores move costs**: the auto-builder rearranges the table for free, so the balance tool slightly
  overrates late tables.
- **Nobody has listened to the new sound.** It passes an offline check (no clipping, no NaN, every sound ends) but
  needs a listening pass.
- **docs/concept PNGs** still say FREE PLAY, and the art direction doc still describes the old castle path.
- **The score dock trails the real score** by about half a second while chips fly (the display and receipt show
  it at once).

## Balance

Measured with the par player (bot skill 0.6, 4 runs, 12 measured rounds a step), against the designed goal curve
(1,000 in round 1 to 2.5M in round 15). Targets: par fails 5–10% of rounds 1–5, 15–25% of rounds 6–10, 30–45% of
rounds 11–15.

Latest run: 12 par runs, 10 measured rounds a step (`npm run balance -- --verify --runs=12 --measure=10`).

| Round | Goal | Par fails | Target | Verdict |
|---|---|---|---|---|
| 1 | 1,000 | 5% | 5–10% | ok |
| 2 | 2,000 | 3% | 5–10% | ok (a little easy) |
| 3 (boss) | 2,500 | 11% | up to ~20% | ok |
| 4 | 5,000 | 10% | 5–10% | ok |
| 5 | 8,000 | 14% | 5–10% | a little hard |
| 6 | 12,000 | 21% | 15–25% | ok |
| 7 | 20,000 | 15% | 15–25% | ok |
| 8 | 35,000 | 18% | 15–25% | ok |
| 9 (boss) | 55,000 | 32% | up to ~35% | ok |
| 10 | 90,000 | 19% | 15–25% | ok |
| 11 | 150,000 | 27% | 30–45% | ok |
| 12 (boss) | 200,000 | 55% | up to ~55% | hard |
| 13 | 450,000 | 48% | 30–45% | a little hard |
| 14 | 750,000 | 54% | 30–45% | hard |
| 15 (final) | 1.5M | 78% | 30–45% | too hard |

**What works**
- No part carries a run: the biggest share of points late is Big Boi at about 25%, then the Ding-Dong Bell and
  the Golden Bumper at 15–20%.
- Money is spent: two or three parts a round early. With no Tune-up, late cash piles up again: a late-game money sink is still open.
- Rounds last 0.7 to 2.3 minutes, about 35–55 seconds a ball. Balls never needed a search in the last runs.

**What does not work yet**
- **The late game is bimodal.** About a third of par runs find ×Mult parts (Golden Bumper, X Lane, Disco Ball,
  Hall of Fame) and score millions; the rest stall at tens of thousands and fail rounds 12–15. That is a build
  problem more than a goal problem: lowering the final goal from 2M to 1.5M did not move round 15's fail rate.
  The next lever is to give every run a reliable late ×Mult (e.g. one ×Mult part guaranteed in the shop after
  the round-9 boss, or a ×Mult decal in every late pick).
- **Every final boss costs a table about 40%** of its round-14 score.
- **The bot is not a person**: it buys from a fixed value list and never plans a build. Human playtests are the
  real test, and the goal curve should follow them.
- **Measuring is noisy**: adding a part to the shop changes every shop roll, and with 4 par runs a single lucky
  run moved whole rows. Use 12 runs or more.

**Tools**
- `npm run balance -- --verify --runs=12 --measure=10`: the curve check (about 27 minutes).
- `npx vite-node tools/power.ts --context=mid|late`: what one shop offer of each part adds to a typical table, per
  dollar. It found the Ball Printer far ahead of everything (now $9 and 3 a ball).
- `npx vite-node tools/stuck.ts`: where balls go back to the plunger or get stuck.
