# Genre research: pinball × roguelite × "Balatro-like"

Snapshot date: 25 Oct 2026. Facts below come from web research done in this session; each links to its source at the bottom. Anything marked **(memory)** is my own background knowledge and was not re-verified. Anything marked **(inference)** is my conclusion, not a sourced fact. Review counts and sales figures are snapshots and will have moved.

---

## 1. The reference games

| Game | What it is | What to take from it |
|---|---|---|
| **Balatro** (LocalThunk) | Poker-hand roguelike. Chips × Mult, joker slots whose left-to-right order matters. Won Best Debut, Best Design, Innovation and Game of the Year at GDCA 2025. | The scoring chain and the build-an-engine fantasy. See §3 and §4. |
| **Ballionaire** (newobject / Raw Fury) | Physics pachinko roguelite. Balls hit triggers that earn money and spawn more balls; you draft new triggers between rounds. 9 tributes across 3 "Elders"; a tribute must be cleared within 7 balls or the run ends. ~85% positive on ~2.4k Steam reviews; Workshop mod support with a Lua API. | Closest structural cousin: the board is the build surface. Main complaints: RNG and low control, and confusing custom terminology. |
| **Dungeon Clawler** (Stray Fawn) | Claw machine as the deckbuilder: items are the deck, the claw is how you draw them. Side events riff on other gambling machines, pachinko included. Early Access Nov 2024 at $9.99, 100k+ copies, half of them in the first five days; 1.0 on 30 Apr 2026. | Proof that "a physical arcade machine as the core verb" sells. Machine-within-machine events are a good variety tool. |
| **Peglin** | Peggle × Slay the Spire. Orbs replace cards and change both enemies and physics. Started as a 48-hour jam game. | Prototype small and fast. Orbs/relics that change the physics, not just the numbers, are what make builds feel different. |
| **Ball x Pit** | Breakout/Vampire-Survivors fusion. 100k copies in 24 h, 400k in a week, 1M in about 6 weeks, 2M in under a year. | Respect for player time. Fast runs, no chores. |
| **CloverPit** | Slot machine roguelite with a debt hook. 500k copies in 8 days, 1M in under two months, peak 25,190 concurrent players. The developers say they spent "countless hours" on the sound and animation of every spin, click and jackpot. | Juice as a core pillar rather than a polish pass. Critics' complaint: personality outweighs depth. 150 charms at launch to avoid a single "correct" build. |

## 2. The pinball-roguelite field in 2026

The niche got crowded in H2 2026. Seven or more titles are out or about to be.

| Title | Date / price | Hook | Status / weak points |
|---|---|---|---|
| **Cult of PiN** | 10 Aug 2026, $14.99 | Roguelike pinball deckbuilder with destructible bumpers, 4 tables, 16 bumper types, 8 balls, 100+ upgrades, bosses | "Mostly Positive", 78% of 193. Reviews report balls falling through floors or flippers and ruining runs; limited content variety; balance concerns. |
| **Runix** | 13 Jul 2026, $15.99 | 3D; shoot balls at monsters, 50+ balls, 60+ artifacts | 87% of 41. One review calls it shallow, with only three tables. |
| **PinRogue** | 10 Jul 2026, $7.99 | Score goal against a timer, flippers launch you, mid-air dash, 50+ upgrades, daily run | Only 3 reviews. |
| **Custom Pinball** | 12 Jul 2026, $3.99 | Score-attack. Each cleared stage gives new bumpers to place; hidden placement synergies; "Glitches" that penalise you if left standing | **Closest to our pitch.** No reviews yet; discloses AI-generated art. |
| **PinKeep** | Early Access, date TBA | Pinball tower-defense deckbuilder: place buildings from a deck on the field | Demo only. |
| **DWARRF** | 27 Nov 2026 (planned) | Pinball/pachinko with turn-based combat | Upcoming. |
| **Appulse** | 26 Nov 2026 | Pinball + twin-stick roguelite shooter | Upcoming. |

### White space (inference)
Most of these treat the table as fixed and the *ball* or *abilities* as the build. Custom Pinball is the exception, but at $3.99 with bumpers as its main part type. **Nobody has yet built the table out of real pinball parts (ramps, spinners, drop-target banks, saucers, magnets, multiball locks) with the "hit things in the right order" rule logic of a real machine, wrapped in a readable Balatro-style scoring chain, with comedy and spectacle as a headline feature.** That is the pitch.

## 3. Lessons the genre teaches

1. **A visible, labeled, multiplicative chain is the reward.** Balatro's tally, with numbers ticking up and rising sound effects, is the dopamine moment. Jokers resolve left to right, so +Mult placed before ×Mult scores more; that ordering puzzle is half the game.
2. **Hidden information gets solved by spreadsheet.** LocalThunk deliberately hides the score preview so you "set up your Rube Goldberg machine and watch it go". GMTK's critique is that the score is still derivable, so players reach for calculators. *Rule: either make a value truly unknowable or show it.* In pinball the final score is naturally chaotic, so show the current Mult and per-part values, and never pretend the outcome is computable.
3. **Skill must not swamp strategy.** No Small Games notes that PiN, Ballardo and TypInc lean heavily on player skill, and the build gets overshadowed.
4. **RNG needs levers.** Ballionaire's top complaint. Pinball has the natural levers: flippers, nudge, plunger, ball save.
5. **Spatial placement is a second axis of thought.** Omelet You Cook and Inventorix were praised for making the player think about placement and arrangement. This supports "the table is the build".
6. **Synergy needs enough distinct parts.** Inventorix, with 4–5 item types, was criticised for few viable combos. Cult of PiN and Runix were criticised for limited content. The plan sets a real catalog target (see [game-plan.md](game-plan.md) §4 and §8).
7. **Plain, consistent terminology.** Ballionaire's custom terms confused a first-run player. LocalThunk avoids RPG jargon on purpose. Pinball vocabulary is a free shared language; use it and define only what we invent.
8. **Respect player time.** Ball x Pit's creator reportedly built it to avoid chores (a secondary reading of a Japanese interview). Make restarts and animation skips instant.
9. **Juice is a moat.** CloverPit's team spent months on feel. Their 1.1 update added a ramp-up feature for big wins, which suggests long celebrations need pacing and skip options.
10. **Physics bugs are fatal.** Cult of PiN's most damaging reviews are about the ball escaping the table. Robustness is table stakes, not polish.
11. **Prototype scrappy, then iterate in public.** Peglin began as a 48-hour jam; LocalThunk credits demo feedback for Balatro's final shape.

## 4. Balatro anatomy → pinball mapping

| Balatro | Our version |
|---|---|
| Hand | **Ball** (launch, play, drain) |
| Hands + discards per blind | 3 balls per round, plus ball save, nudges, extra ball |
| Blind score requirement | Round goal |
| Ante (small, big, boss blind) | **Stage** of 3 rounds, boss with a rule-twisting modifier |
| Chips × Mult | **Points × Mult**, with Mult playing the role of the pinball *bonus multiplier* |
| Joker slots, order matters | **Rule cards** on the backglass (ordered) **plus** parts placed on the playfield (spatial) |
| Poker-hand levels | Part / shot levels |
| Consumables, vouchers | One-shot items; cabinet upgrades |
| Interest, rerolls, skip tags | Same (memory) |
| Starter deck | **Cabinet** (starting table + starting parts) |
| Stakes | Difficulty tiers |

## 5. Pinball vocabulary players already expect

Sources for table design were thin (a Giant Bomb design essay, a university slide deck, strategy guides). The list below is largely from general knowledge **(memory)**, with flow, orbits, ramps, drop-target-gated ramps and "lit item → extra ball / multiball" rules confirmed in the sources.

- **Core hardware:** flippers, plunger and skill shot, drain, inlanes/outlanes (inlanes safe, outlanes lose the ball), slingshots, pop bumpers, standup targets, drop-target banks, spinners, rollover lanes (A-B-C), ramps, orbits/loops, saucers/scoops, captive balls, magnets.
- **Rules layer:** bonus multiplier, end-of-ball bonus count-up, ball save, tilt and nudge, extra ball, special, multiball (often scoring doubled or tripled while several balls are live), locks, modes/missions, jackpots, wizard mode, ball search when the ball is stuck.
- **Presentation:** backglass, dot-matrix display (DMD), lit playfield inserts and light shows, announcer callouts, mechanical solenoid and bell sounds.
- **Design principles from sources:** the table should *flow* (shots feed other shots); ramps and orbits are the signature shots; gating a shot behind drop targets or spinners adds a stage to scoring; minimise dead space.

## 6. Technical findings

- **Flipper tunnelling is the classic pinball physics bug.** Unity's docs note that sweep-based continuous collision handles linear motion but misses collisions caused by *rotation*, and use a flipper as the example. Godot forum advice: kinematic/animatable flipper bodies, a higher physics tick (120 Hz), and predictive stop handling.
- **Box2D v3** (Aug 2024): soft-step solver, reworked continuous collision (hybrid speculative + time-of-impact) that Catto says prevents nearly all dynamic-vs-static tunnelling, a sensor system, and in v3.2 continuous sensor events. Bullet-vs-dynamic tunnelling prevention exists but is less robust. That matters for a fast ball against a swinging flipper, so it needs to be tested rather than assumed.
- **Phaser Box2D** is an MIT-licensed JavaScript conversion of Box2D v3 (~70 KB, ESM), with revolute joints (limits and motors, i.e. flippers), sensors, continuous collision, shape casts. It is not tied to Phaser and can be used with PixiJS. Support is community-only. In this sandbox, `npm view` showed `phaser-box2d` 1.1.0, `planck` 1.5.1, `@dimforge/rapier2d-compat` 0.21.0 and `pixi.js` 8.22.0 on the registry, and headless Chromium with WebGL2 launches, so a web stack can be built *and* verified here.

## 7. Sources

**Reference games**
- Ballionaire: [PC Gamer review](https://pcgamer.com/games/roguelike/ballionaire-review) · [Siliconera](https://www.siliconera.com/?p=1071154) · [IsThereAnyDeal](https://isthereanydeal.com/game/ballionaire/info/) · [Vaporlens summary](https://vaporlens.app/app/2667120/ballionaire.md) · [press release](https://gamespress.com/Pachinko-Roguelike-Ballionaire-Set-to-Launch-on-December-10-on-PC-via-)
- Dungeon Clawler: [Turn Based Lovers review](https://turnbasedlovers.com/review/dungeon-clawler-impressions/) · [Pocket Gamer](https://www.pocketgamer.com/dungeon-clawler/early-access) · [WN Hub sales](https://wnhub.io/news/indie/item-46425) · [CogConnected 1.0](https://cogconnected.com/2026/04/dungeon-clawler-grabs-its-full-version-across-all-platforms-today/)
- Peglin: [Wikipedia](https://en.wikipedia.org/wiki/Peglin)
- Balatro: [GMTK on the hidden-score problem](https://gmtk.substack.com/p/balatros-cursed-design-problem) · [PC Gamer interview](https://www.pcgamer.com/i-dont-play-poker-at-all-says-solo-developer-who-made-the-poker-roguelike-i-cant-stop-playing/) · [GDCA 2025 awards](https://www.pushsquare.com/news/2025/03/balatro-cleans-house-at-gdc-awards-2025-including-game-of-the-year) · [Destructoid on joker order](https://www.destructoid.com/how-to-order-jokers-in-balatro/) · [Chris Coyier](https://chriscoyier.net/2025/03/13/on-balatro/)
- Ball x Pit: [Push Square, 2M sales](https://www.pushsquare.com/news/2026/08/devolvers-brilliant-roguelite-dopamine-factory-ball-x-pit-is-a-smash-hit-at-2-million-sales) · [Automaton interview (Japanese)](https://automaton-media.com/articles/newsjp/ball-pit-20251217-375231/)
- CloverPit: [Game Developer, 500k in 8 days](https://gamedeveloper.com/business/cloverpit-has-sold-500-000-units-in-eight-days) · [Instant Gaming, 1M](https://news.instant-gaming.com/en/articles/16032-cloverpit-a-slot-machine-style-roguelite-has-surpassed-one-million-sales) · [PCGamesN 1.1](https://www.pcgamesn.com/cloverpit/update-1-1-patch-notes) · [Xbox deep dive](https://news.xbox.com/en-us/2025/11/20/clover-pit-xbox-partner-preview/)

**Pinball roguelites**
- Steam pages: [Custom Pinball](https://store.steampowered.com/app/4838900) · [Cult of PiN](https://store.steampowered.com/app/3144340/Cult_of_PiN/) · [Runix](https://store.steampowered.com/app/3617290/Runix_Pinball_Roguelike/) · [PinKeep](https://store.steampowered.com/app/4143700/PinKeep/) · [PinRogue](https://store.steampowered.com/app/4465650/PinRogue/) · [DWARRF](https://store.steampowered.com/app/3634710/)
- [Cult of PiN review summary (Vaporlens)](https://vaporlens.app/app/3144340/cult_of_pi_n) · [Runix review (Defunct Games)](http://www.defunctgames.com/courant/1854/runix-roguelike-pinball) · [Appulse preview](https://www.thesixthaxis.com/2026/10/19/appulse-preview-blending-pinball-with-a-roguelite-shooter/) · [Cult of PiN spotlight (G2A)](https://www.g2a.com/news/game-spotlights/cult-of-pin-pinball-roguelike-spotlight/) · [No Small Games, Balatro-likes roundup](https://nosmallgames.com/2025/03/i-tried-every-balatro-like-game-i-could-find-in-steam-next-fest-2/)

**Pinball design and physics**
- [Giant Bomb, "Rebound: the design of pinball"](https://giantbomb.com/users/3929/articles/rebound-the-design-of-pinball) · [UBC "Pinball Wizardry" slides](https://www.cs.ubc.ca/~udls/slides/2018-clement-pinball.pdf)
- [Box2D 3.0 release post](https://box2d.org/posts/2024/08/releasing-box2d-3.0) · [Phaser Box2D](https://phaser.io/box2d) · [Unity CCD docs](https://docs.unity.cn/2020.3/Documentation/Manual/ContinuousCollisionDetection.html) · Godot forum: [flipper approaches](https://forum.godotengine.org/t/best-approach-to-a-pinball-flipper/22161), [4.4 table build](https://forum.godotengine.org/t/godot-4-4-pinball-table-build/107655)
