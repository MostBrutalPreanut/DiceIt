# Status: what works, what does not

The state of the game after the overnight test and balance pass (branch `ccr-f76f990f-mocbip`). "Works" means
checked: by the unit tests (`npx vitest run`), the browser smoke test (`node tools/smoke.cjs`, which drives the
built game in headless Chromium), the balance tool (`npm run balance -- --verify`) or by looking at screenshots.

## Checks

| Check | Result |
|---|---|
| Type check (`npx tsc --noEmit`) | clean |
| Unit tests | 443 pass, 0 fail (32 files) |
| Build (`npm run build`, `npm run artifact`) | builds; the single-file game is about 2 MB |
| Browser smoke test | 105 checks ok, no console errors |
| Renderer cost (smoke, software GL) | about 2.6 ms a frame; 3.5 ms with 4 balls, 24 sparks and zaps |
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
- **Flying points**: points fly from the part to the score on the scoreboard panel as chips, coins fly to the money.
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
- **Powder Keg, Laser Turret, Shockwave Gong** (the rest of step 2): a keg's fuse burns 2.5 s, then it blows and
  zaps everything within 6 (kegs chain, 4 at most, and re-arm after 6 s); the turret fires a wall-to-wall beam in a
  random direction; the gong's 8th hit of a ball zaps the whole table. Gain per round over a plain Pop Bumper on
  the power tool's table, mid / late: Tesla +6,568 / +18,913, Laser +1,935 / +9,678, Keg +3,337 / +7,989, Gong
  +1,068 / +3,730.
- **Gems (inlays, step 3)**: Ruby, Garnet, Opal, Gold Leaf, Red Seal and Emerald, sold from round 7. Drag one from the
  shop (or the toolbox) onto a part: every part it fits is ringed in its colour while it is in hand, and it shows as
  a small stone at the part's front. **Not measured yet**: the par player and the auto-builder never buy or set a
  gem, so `npm run balance` cannot see them. Emerald on a Disco Ball (×2.5 twice a ball) is the one to watch.
- **Sparks (step 4)**: little bonus balls that score on what they touch (as the ball that made them), never touch
  flippers, balls or each other, and fade after 4 s; 24 glow at most. Made by the **Sparkler** (common, $3), the
  **Rock Pile** (uncommon, $4), the **Firecracker** (rare, $8, a rocket once a ball that rains 6 sparks), the Powder
  Keg's blast and the **Topaz** gem. Balls no longer collide with each other. Gain per round over a plain Pop Bumper
  on the power tool's table, mid / late: Sparkler +4,200 / +8,619, Rock Pile +3,017 / +9,986, Firecracker +5,768 /
  +14,661. The drawing drops its extras when frames run long (see borrowed-parts §7.3).
- **Decor (step 5)**: a new kind of part that stands on the cabinet (the corners above the dome, the apron), never on
  the table: the ball never touches it and it takes no table room. One of each in a run. The **Midnight Clock**
  (180 scoring hits, then 20 s of ×2), the **Ritual Altar** (every 8 sets a ritual: Tempest, Inferno, Swarm, each
  stronger than the last) and four cabinet upgrades (Spare Bulb, Rubber Feet, Coin Tray, Side Mirror). Gain per
  round on the power tool's table, mid / late (decor costs no table room, so against the bare table): Clock +603 /
  +1,391, Altar +2,631 / +5,980. The Clock is the weak one on that small table (it rarely reaches midnight without
  zaps and sparks); watch it in playtests. The par player does not buy decor yet.
- **Wizard Lamp (step 6)**: legendary, $13. A floor insert with one segment for every scoring part type on the table
  when the round starts (up to 8; its card says how many). Each type the ball itself hits lights one; all lit starts
  WIZARD MODE for 30 s: 2 more balls (they leave again when it ends), no ×Mult limits, every Lamp ablaze. Once a
  round. Gain per round on the power tool's table, mid / late: +11,197 / +23,129 (+14,812 / +32,656 over a plain Pop
  Bumper, about Rank Lights per dollar). That table has only six types, so the lamp lights early; on a full board it
  needs eight.
- **Piñata (step 7)**: rare, $9. 40 health; each of the ball's hits takes 1 to 4 by speed (a zap or a spark 1). At
  zero it bursts: 15 sparks, $5 and a free pick of one of three parts above the next shop (rolled three rounds
  ahead; it waits until taken, a reroll keeps it). Broken for the rest of the round, back next round with 20 more
  health; the damage carries over. Gain per round on the power tool's table, mid / late: +5,731 / +13,848 (+9,346 /
  +23,375 over a plain Pop Bumper), above the Tesla Coil at the same price, before the money and the free part. If
  it plays too strong, the 15 sparks are the first thing to cut.
- **The cheap scalers (step 8)**: Grape Bunch (pack of 3, pays more for each touching bunch, golden at 4), Echo Cave
  (×2 per cave the ball went through in a row), Spotlight (×1.5 near it until the ball knocks it dark), Bonsai Bumper
  (+4 a round unmoved), Time Capsule (a free legendary pick after 6 rounds), Ice Sculpture (250 a hit, melting with
  every flipper press) and Wishing Well ($1 at a time in the workshop for +3 points and +0.02 Mult a hit). Gain per
  round over a plain Pop Bumper on the power tool's table, mid / late: Echo Cave +5,086 / +14,685, Spotlight +1,726 /
  +5,879, Bonsai +1,821 / +5,363, Well +842 / +4,247, Grape Bunch +650 / +2,245. The tool cannot see what these
  build up over a run (it never ages a Bonsai, fills a Well or sets the grapes snug), so those are their floors.
  **Tuned**: the Ice Sculpture melts 3 points a flipper press, not 1. At 1 the bot's 60 presses a round left it
  scoring 70% of round 1 and lasting four rounds; at 3 it pays about 4,300 over a round and a half, the burst it is
  meant to be.
- **The physics parts (step 9, the last of the build order)**: Wrecking Ball (once a ball, the ball grows 1.5× for 6 s
  where it has room; its hits pay ×2 and shake the table), Broomstick (the ball rides straight the way it points, no
  gravity, for 1 s or until it touches anything, zapping what it passes at ×2), Free Ball Bucket (a sensor bucket on
  a rail; a ball dropping in from above goes back to the plunger) and the Gremlin Hutch (decor: 2 gremlins, 100 and
  $1 a knock). Physics: a 1.5× ball against the flippers tunnelled 0 times in 600 trials with the safety net off,
  and the escape fuzz on a table with all four had 0 escapes and 0 stuck balls in 200. Gain per round on the power
  tool's table, mid / late: Bucket +8,553 / +15,280, Broomstick +2,658 / +7,271, Wrecking Ball -1,279 / +2,044
  (+2,336 / +11,571 over a plain Pop Bumper), Hutch +3,888 / +5,840. **Tuned**: a gremlin knock was 300 and made
  the Hutch +11,168 / +17,520 with no table room; at 100 it sits by the Ritual Altar. The Wrecking Ball is the weak
  one, as the review expected: it needs a playtest.
- **More spark parts (after the build order)**: Splitter, The Whale, Insurance Policy, Spider Nest and Marble Jar. Gain
  per round over a plain Pop Bumper, mid / late: Splitter +9,993 / +14,694 (about the Sparkler per dollar), Whale
  +1,630 / +4,994, Spider Nest +365 / +2,080, Marble Jar +4 / +2,528. The tool's table has no other spark source for
  the Whale to eat and never fills a Jar, so those are floors; the Insurance Policy only pays on a lost last ball.
  **Tuned**: the Splitter was $6 with a 4 s wait and measured +10,480 / +20,025, twice the Sparkler; now $7 and 5 s.
- **Crossed Wires**: the bot now swaps hands, as a player would (it used to score almost nothing on that boss).

## Does not work yet, or is unproven

- **The download button does nothing on the hosted page** (the artifact viewer blocks downloads). It works when
  the game runs from the build.
- **The par bot ignores move costs**: the auto-builder rearranges the table for free, so the balance tool slightly
  overrates late tables.
- **Nobody has listened to the new sound.** It passes an offline check (no clipping, no NaN, every sound ends) but
  needs a listening pass.
- **docs/concept PNGs** still say FREE PLAY, and the art direction doc still describes the old castle path.
- **The scoreboard's score trails the real score** by about half a second while chips fly (the display and receipt show
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
