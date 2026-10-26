# Rarities, decals, bosses, Big Bois, and the balance plan

What changed in this pass, why, and how the numbers will be tuned. Everything here is data
(`src/data/parts.ts`, `decals.ts`, `bosses.ts`, `bigboi.ts`, `goals.ts`): a sentence on a card is generated from
the same number the scorer uses, so tuning is editing a number and re-running the tools.

## 1. Machines and Big Boi

The machine is picked at the start of every run and stays for it (no more theme switching mid-run). It sets
the look **and** the one Big Boi in the middle of the table. Big Boi is never for sale, cannot be moved, and
each machine's Big Boi pulls the run towards a different build:

| Machine | Big Boi | What he does |
|---|---|---|
| Funhouse Factory | The Foreman | 50 a hit and +0.15 Mult a hit (up to +5 a ball) |
| Short Order | The Cook | 40 a hit. **Order Up!** Every hit calls an order: one part on the table lights up, and its next hit pays ×4, then the light goes out |
| Castle Crash | The Dragon | 40 a hit. **Siege**: 5 armour plates, and every hit knocks one off; when the last goes he pays 400 points, and the armour grows back one plate thicker |

"Big Boi" is a tag on all three. Cards carry no strategy tips: they say what a part does, and nothing about how to use it.

## 2. Part rarities

| Rarity | In the shop from | Weight (× the part's own) | Price | Parts |
|---|---|---|---|---|
| Common | round 1 | 1 | $1–4 | Pop Bumper, Cha-Ching Bumper, Slingshot, Spinner, Lane Rollover (pack of 3), Lamp, Vari-Target, Deflector, Kickback |
| Uncommon | round 2 | 0.4, +0.12 a round, up to 1 | $5–7 | Drop-Target Bank, Level Light (pack of 2), Ball Saver, Left / Right Flipper, Ding-Dong Bell, Piggy Bank, Mag-Grab, Glow Strip, Roller Pop, **Power Plate**, X Lane |
| Rare | round 4 | 0.25, +0.1 a round, up to 1 | $8–9 | Ball Printer, Thunder Bumper, Jackpot Scoop, Duck Gallery, **Trophy Cup** |
| Legendary | round 7 | 0.15, +0.07 a round, up to 0.6 | $11–13 | Golden Bumper, Disco Ball, Goal!, **Hall of Fame** |

Rarer parts are physically bigger and do more. Every part does at least two things, and many feed or starve each other.
Cards say what a part does; they carry no strategy tips.

| Part | What it does |
|---|---|
| Pop Bumper | 20 · grows +1 per Pop hit this ball (up to +20) · kicks |
| Cha-Ching | 8 · $1 a hit (up to $5 a round) · kicks |
| Slingshot | 6 · **Hot Shot**: the ball's next hit within 1.2 s pays +50% |
| Spinner | 2 a spin and +0.01 Mult a spin (up to 10 spins a pass, +1.5 Mult a ball) · slows the ball |
| Lane Rollover | **sold as a pack of 3** ($4), spelling the machine's word · 10 · light all 3 of a pack: +40 and +0.5 Mult (5 sets a ball) |
| Lamp | every hit brightens it a step (up to 5) and pays 10 · each step +10% to parts in its glow (a wider glow gives a smaller step) |
| Vari-Target | 8 × a tier by impact speed (×2 at 12, ×4 at 28, ×8 at 50) · a smash makes the ball hot |
| Deflector | steers · the next hit pays +25% |
| Kickback | 30 · fires the ball out the way it faces, then needs 4 s to recharge · the kicked ball is hot |
| Drop-Target Bank | 12 a target · set: +60 and +0.3 Mult (no limit) · a set lights every Lamp for 5 s |
| Level Light | **sold as a pair** ($5) · switches on and off · when it and every Level Light within 5.5 of it are on (it needs at least one), the bumpers within 5.5 of them level up |
| Ball Saver | saves a drain · pays $1 at the end of a round in which it never had to |
| Left / Right Flipper | a small extra flipper on that button |
| Ding-Dong Bell | 12 · +8 for every different part type the ball has hit this ball |
| Piggy Bank | 5 · stores $1 a hit (holds $5) · a smash breaks it for what it holds +$1 |
| Mag-Grab | 24 · +0.25 Mult a grab (up to +2) · holds the ball, then throws it the way it faces |
| Glow Strip | a long strip under the floor that other parts stand on · lights for 5 s whenever anything pays a bonus; parts on it pay +50% |
| Roller Pop | a bumper rolling along a rail · 30 · hit it near either end of the rail: ×3 |
| Ball Printer | 40 · prints a ball (multiball, up to 3 a ball; $9) · fires out in a random direction |
| Thunder Bumper | a wedge: 60 · every hit counts as 3 Pop hits · +0.05 Mult (up to +2) · throws the ball up the table |
| Jackpot Scoop | 40 + **the pot** (+8 for every scoring hit this ball, up to +3,000), cashed when the ball sinks in |
| X Lane | uncommon, $7 · ×1.25 Mult (up to ×3 a ball) · lights a lane · dark for 3 s after |
| Duck Gallery | a duck paddling along a rail · 60, +20 every hit (up to +200) · every hit makes it 15% faster |
| Golden Bumper | 120 · ×1.05 Mult a hit (up to ×3 a ball) · $1 every 5 hits |
| Disco Ball | 200 · ×2.5 Mult once a ball · lights every Lamp for 8 s |
| Goal! | score past the sliding goalie: 300 and Mult ×1.5 (up to ×4 a ball) |
| Trophy Cup | 20 · every hit keeps +0.04 Mult for the rest of the run (up to +5): every ball starts higher |
| Power Plate | a floor plate: bumpers on or near it pay ×1.5, and plates multiply |
| Hall of Fame | 150 · once a ball, Mult ×1.1 for every different part type on the table |

Multiplicative Mult (X Lane, Golden Bumper, Disco Ball, the Dragon, Glass Cannon-style decals) is what lets a late
machine reach millions; each is capped per ball, like everything else that compounds.

## 2b. Kept Mult, the Tune-up, and moving costs

- **Kept Mult** is Mult every ball starts with, kept from round to round: the Trophy Cup's polish, and two decals,
  Momentum (+0.5 for every round you clear) and Afterglow (keeps 15% of each round's best Mult).
- **The Tune-up**: between rounds, pay to level a part up by one: $2 for the first level, $2 more each level
  after, up to level 10. It is the late-game money sink.
- **Moving and removing cost money** instead of selling for money: a part that has played a round costs $1 to
  move (once a visit) and $1 to scrap; one bought this visit moves freely and goes back for what it cost. Free
  Hands (the decal that was Full Refund) makes it free.

## 3. Shop locks

Each offer has a **Lock** button. A locked offer stays in its slot for the next round and through rerolls,
until you buy or unlock it. One lock by default; the Layaway decal gives two more.

## 4. Decals

The old three-column "major upgrades" are gone: every run-long rule is now a **decal** stuck on the apron.
Decals are **never for sale**: after each boss you pick one of three (of three different kinds) or skip for $4,
so a run has **four by its final boss** (rounds 3, 6, 9, 12), one per apron slot. A decal works while it is
stuck; peel it off to make room (that only matters in endless play after round 15).

44 decals in four kinds:

- **Cash** (outside the ball, in the shop and the payout): Sponsor (+$2 a round), Wide Shelf (+1 shop offer), Interest, Coupon Book, Full
  Refund, Ball Hog, Free Reroll, Layaway (+2 locks), Big Toolbox (+2 slots), Bargain Bin (one offer half price),
  Show-Off (2× overshoot money), Golden Ticket (+$8 a boss), Collector ($1 per part type), Savings Bond ($1 per decal).
- **Score**: Head Start, Lucky Seven (every 7th hit ×3), Overclock (one type +50%), Level Up (one type +2 levels),
  Bright Lamps, Jackpot Sets, Golden Age, Glass Cannon (×1.5, one ball less), Combo King (Hot Shots ×2), Spin
  Doctor, Multiball Madness (×2 while 2+ balls), Last Call (last ball ×2), Thrifty (+1% per $1 held), Big Boi Fan Club (×3).
- **Ball**: Rubber, Heavy, Glass, Gold, Twin, Extra Ball, Safety Net (a save with no saver part), Long Fuse (+20 s), Free Kick, Printer Plus.
- **Build** (the ones that make you rebuild): Bumper Car (bumpers ×1.5, the rest ×0.75), Target Practice
  (targets ×2, easier tiers, the rest ×0.75), Light Show (lights ×1.5 and more, the rest ×0.75), Purist (×2 with
  four part types or fewer), Crowd Pleaser (+0.04 starting Mult per part on the table), Minimalist (+0.25 per
  empty toolbox slot). These exclude each other where they would contradict.

With Bumper Car stuck, a Vari-Target is worth peeling off; with Target Practice it is the best part on the table.
Purist rewards selling half the table; Crowd Pleaser rewards filling it. That is the "a part great in one build,
removed in another" tension.

### The set pieces (built from the design discussion)
Moving targets (the Duck Gallery and the Roller Pop), the goal and its goalie, and an under-light (the Glow Strip) are
now parts; see the table in §2.

## 5. Bosses

Every third round is a boss that breaks one assumption. Each run draws four of the nine regular bosses for rounds
3, 6, 9 and 12, and one of the three final bosses for round 15; the next boss is always named under the map.
Beating the final boss wins the run; you can keep going (endless, every boss back in the draw).

| Boss | What it does | What beats it |
|---|---|---|
| The Tax Man | parts pay no money; the round pays $3 less | a score build, not a money build |
| Cheap Rubber | bumpers and slingshots kick half as hard | targets, lights, saucers |
| Slippery Slope | the ball falls 40% faster | Ball Savers, kickbacks, a Glass Ball |
| Night Shift | lamps, lanes, Level Lights, X Lanes and Disco Balls do nothing | bumpers and targets |
| Crossed Wires | the flipper buttons are swapped | your hands (and a table that plays itself) |
| Short Fuse | every ball's clock is 25 s | fast scorers, multiball |
| The Jammer | your most numerous part type scores nothing | a mixed table |
| Flat Rate | every Mult gain is 30% smaller | flat points: levels, Overclock, Bumper Car |
| The Magnet | a magnet under the drain pulls the balls in | savers, kickbacks, extra flippers |
| **The Auditor** (final) | decals off until half the goal; goal +10% | a table that scores on its own |
| **The Overlord** (final) | a random part type is off every ball; Mult gains 30% smaller | depth: no single point of failure |
| **The Whirlpool** (final) | drags balls to the drain, steeper table, 40 s clock | everything that keeps a ball alive |

The inspiration is Balatro's boss blinds (The Wall, The Needle, The Club, The Plant, The Flint, and the final
"showdown" blinds Violet Vessel, Crimson Heart, Amber Acorn, Verdant Leaf), translated into pinball problems.

## 6. The ball stopper and the flippers

- The **wall ledge** on the left (the "ball stopper") made every wall ball land in the same place. It is now
  part of the layout: each run puts it somewhere new on the left wall, and in the workshop you can drag it up or
  down (free, undoable). A test checks the launch spread stays healthy wherever it sits.
- **Flippers stuck up**: the physics was fine; the bug was that the sim stopped stepping on the payout and
  run-over screens, so a flipper held as the last ball drained stayed up for the whole screen. The empty table now
  keeps following the buttons. Keys also clear when the tab is hidden.

## 7. The balance plan

### The target curve
Round goals are now a **designed** curve with round numbers, not a measured one: the content is tuned towards
the curve instead of the curve following the content.

| Round | 1 | 2 | 3 (boss) | 4 | 5 | 6 (boss) | 7 | 8 | 9 (boss) | 10 | 11 | 12 (boss) | 13 | 14 | 15 (final) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Goal | 1,000 | 2,000 | 3,000 | 5,000 | 8,000 | 12,000 | 20,000 | 35,000 | 55,000 | 90,000 | 150,000 | 250,000 | 450,000 | 900,000 | 2M |

About ×1.6–1.8 a round, and the final round more than doubles. The Auditor adds 10% (2.2M). Endless rounds after 15 grow ×1.6 a round.

Base points were cut to a fifth in the overnight pass (a Pop pays 20, growing +1 a hit), so a starter table fits round 1's 1,000. Each level adds about a quarter of a part's base points, up to level 10.

### What "makes sense" means (the targets to tune to)
Measured with the par player (`npm run balance -- --verify`): a sensible bot builder at flipper skill 0.6.

1. **Round 1 is a gimme for a human**: par clears it on the first ball nearly always. (A human plays worse than par.)
2. **Fail rate rises with the run**: par fails about 5–10% of rounds 1–5, 15–25% of rounds 6–10, 30–45% of 11–15.
   Boss rounds may run 10 points above their neighbours.
3. **No single part or decal is most of the score** across runs (each under ~40% of points late).
4. **Money**: two or three purchases a round early, and nothing piling up late (rares and legendaries are the sink; a late-game sink is still an open question).
5. **Pacing**: rounds 1.5–3 minutes.

### The loop
1. `npm run balance -- --verify` (about 20 minutes on 4 cores; `--quick` for a rough 2-minute look; `--cache=file`
   to re-read a report).
2. Find the round where par's fail rate leaves the band, and the parts and decals that make the score there
   (WHERE THE POINTS COME FROM).
3. Nerf or buff **numbers only**, in this order of preference: a cap, a per-ball limit, a cooldown, then a base
   number. Re-run. Repeat until rounds 1–15 sit in the band.
4. Then human playtests: the bot is not a person. Expect to lower the curve's middle if humans fail rounds 5–9.

### First measurement
See §8 (filled in from the first `--verify` run of this pass).
