# Status: what works, what does not

The state of the game after the overnight test and balance pass (branch `ccr-f76f990f-mocbip`). "Works" means
checked: by the unit tests (`npx vitest run`), the browser smoke test (`node tools/smoke.cjs`, which drives the
built game in headless Chromium), the balance tool (`npm run balance -- --verify`) or by looking at screenshots.

## Checks

| Check | Result |
|---|---|
| Type check (`npx tsc --noEmit`) | clean |
| Unit tests | 315 pass, 0 fail (25 files) |
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
- **Tune-up**: pay to level a part up between rounds, dearer every level, up to level 10.
- **Packs**: Lane Rollovers come as three (they spell the machine's word, and a set is one pack), Level Lights
  as two.
- **New parts** this pass: Trophy Cup (rare, kept Mult), Power Plate (uncommon, bumpers on it pay ×1.5).

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

See the table at the end of this file (filled in by the latest run).
