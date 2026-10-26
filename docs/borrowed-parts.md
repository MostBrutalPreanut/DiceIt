# Parts borrowed from other ball games

Ideas taken from Ballionaire, Peglin, Peggle, Ball x Pit, video pinball and real machines, picked for three
things: they **cause mayhem on screen**, they **scale** (they get better the more you build around them), or they
**work late**, when the board is full and money piles up. Snapshot date: 26 Oct 2026. Sources are linked at the
bottom; anything marked **(memory)** is my own background knowledge and was not re-checked in this session.
Effort is for *our* engine, as in [parts-catalog.md](parts-catalog.md): **S** = a new recipe or small sim tweak,
**M** = new sim behaviour, **L** = a new system.

Nothing here is built. It sits next to the parts catalog (which covers real pinball mechanisms); where an idea is
already listed there, this doc says so and only adds the new angle.

## 1. Which late-game problems these address

From [status.md](status.md) and [run-flow-and-balance.md](run-flow-and-balance.md):

1. **The late game is bimodal.** Runs that find a ×Mult part score millions; the rest stall. Every run needs a
   reliable late lever.
2. **Late money piles up** (about $112 unspent by round 15). The shop needs late sinks.
3. **The board is full by about round 10** (about 28 parts). Past that, a new part means removing an old one, so
   late parts that **take no board space** or **make old parts better** are worth more than another bumper.
4. **Balls run long late** (55–61 s, the 60 s clock binds). More drain pressure helps; more ball time does not.

The best ideas from the other games hit 2 and 3 at once: Ballionaire's **stacks** and **gems** grow a part in place,
and you can keep feeding them money.

## 2. Three small systems that unlock most of the list

Most of the ideas below are cheap once these exist. Each is worth building once and reusing.

### 2.1 Sparks: temporary bonus balls
**From:** Ballionaire's spawned balls (Fire, Rock, Water, Coin balls from Bombgoblin, Avalanche, Cairn, Firecracker,
Stormy Weather), Peglin's Matryorbshka (splits in two on every peg hit), Peggle's Multiball power, Ball x Pit's
Maggot (enemies burst into baby balls).

A **spark** is a small, short-lived ball: radius about 0.7 of a real ball, lives 6 s or until it drains, never
costs or saves a ball, and is drawn as a glowing ember so it never reads as a real ball. It scores like a ball but
shares the parent ball's caps (Mult caps, set caps, the printer cap), so 12 sparks cannot break a cap that one ball
cannot.

- **Physics cost is fine:** the M0 benchmark measured about 0.2 ms a 240 Hz step with 10 balls and 0.17 ms with 20
  ([m0-physics-findings.md](m0-physics-findings.md)). A table cap of 12 sparks fits.
- **Ball-vs-ball is only tested up to 4 balls**, so sparks should not collide with each other (a collision filter:
  the sim has none yet, so this is the M part of the work). They collide with parts, walls and flippers.
- They do not use the particle pool (capped at 150); they are bodies drawn like balls.

Sparks are the mayhem dial: almost every "rain of balls" idea below is "spawn N sparks".

### 2.2 Zaps: a part scores without being touched
**From:** Peggle 2's Uber Volt (lightning jumps from each hit peg to more pegs), Peglin's Ball Lightning (hits
nearby pegs too), Peggle's Space Blast (blows up nearby pegs), Ballionaire's Tomato and Grape Vine (pay again for
each adjacent copy).

A **zap** scores a part as if the ball had hit it, with no physics: no kick, no ball movement. It counts as a
hit for growth (Pop Bumpers grow), the Jackpot Scoop's pot, the Ding-Dong Bell's variety and Lucky Seven. Guards:
a zap never zaps again (no chains, except where a part says so, with a depth cap), and a part can be zapped at
most once per 0.3 s. Drawn as a lightning arc or a shockwave, so the player sees *why* a far-off part scored.

Zaps are the scaling dial: they are worth more the more parts you own and the closer you pack them, which is
exactly what a full late board has.

### 2.3 Fixtures: things that go *on* a part
**From:** Ballionaire's **Stackable** trait (Cairn, Spells, Amethyst: placing one next to a copy stacks onto it, and
the effect scales with the stack) and its **Gems** (Amethyst, Topaz, Garnet, Peridot, Citrine: small pieces that
power up adjacent triggers).

Two kinds:
- **Stacks:** drop a copy of a stackable part onto one already on the table and it joins it (a number on the part)
  instead of taking new space. Every copy is bought at full price, so stacks are a money sink that needs no room.
- **Inlays:** a small gem set into a part (one per part), changing it. Inlays are sold in the shop like parts and
  never touch the board's layout.

Both work on a full board and soak up late money: problems 2 and 3 at once.

## 3. The parts

Columns: **M** = mayhem on screen, **S** = scales, **L** = good late. Costs follow
[balance-plan.md](balance-plan.md) §2 (common $1–4, uncommon $5–7, rare $8–9, legendary $11–13); every number is
a first guess for the balance tool to tune.

### 3.1 Explosions and lightning (zaps)

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| **Powder Keg** | Peglin's bomb (the first hit lights the fuse, the second detonates it); Ballionaire's Bombgoblin; Peggle's Space Blast | A barrel. The first hit lights the fuse (sparks fly off it). The next hit, or 3 s later, it **blows**: 80 points, every ball and spark within 6 units is thrown outward, and every part within 6 units is zapped. Then it is gone until the next ball. A blast lights the fuse of any other Keg in range, so a row of them goes off as a chain (up to 4 deep). | ✔✔ | ✔ | ✔ | Rare $8, **M** |
| **Tesla Coil** | Peggle 2's Uber Volt (Gnorman); Peglin's Ball Lightning | 30 a hit, and every hit arcs lightning to the **2 nearest scoring parts**, which are zapped. Levels add a third and a fourth arc. | ✔✔ | ✔✔ | ✔ | Rare $9, **S** once zaps exist |
| **Grape Bunch** | Ballionaire's Tomato and Grape Vine (pay once more for each adjacent copy); Clover (4 or more touching turn lucky) | A small bumper, 10 a hit, and it pays again for every Grape Bunch touching it. Four or more in one cluster turn **golden** and pay double. Sold as a pack of 3. | | ✔✔ | | Uncommon $5 (pack), **S** |
| **Echo Cave** | Ballionaire's Cave (×2 for every other Cave bonked in a row before it); Demon's Tilt's chain meter | A rollover tunnel, 15 a pass, ×2 for every other Echo Cave the ball went through **in a row** with no other part hit in between (×8 at most). A routing puzzle: line them up along one shot. | | ✔✔ | | Uncommon $6, **S** |
| **Spotlight** | Ballionaire's Whistle (adjacent triggers ×2 until it is bonked) and Candle | Parts within 5 units pay ×1.5 **while it is not hit**. A hit knocks it dark for 10 s. The tension: build round it, then keep the ball off it. | | ✔ | ✔ | Uncommon $6, **S** |

### 3.2 Rains of balls (sparks)

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| **Firecracker** | Ballionaire's Firecracker (once a drop, a rocket bursts and rains Fire balls); Stormy Weather | Once a ball, a hit fires a rocket to the top of the table. It bursts and rains **6 sparks** across the top. | ✔✔ | ✔ | | Rare $8, **M** (sparks) |
| **Rock Pile** (stackable) | Ballionaire's Cairn (one Rock ball per Cairn in the stack) and Avalanche | A heap of rocks, 10 a hit, and every hit drops **1 spark per rock in the pile** (cooldown 2 s). Drop another Rock Pile on it to stack it, up to 5. Takes one spot however big it gets. | ✔✔ | ✔✔ | ✔✔ | Uncommon $5, **M** (sparks and stacks) |
| **Splitter** | Peglin's Matryorbshka; Ballionaire's split-in-half effect | A rollover: the ball splits off **2 sparks** going left and right of it. Dark for 4 s after. | ✔ | ✔ | | Uncommon $6, **S** once sparks exist |
| **The Whale** | Ballionaire's Whale (holds balls, ejects them all when full and pays per ball) and Dam (holds Water balls, spawns two per held ball) | Swallows every spark that touches it (8 points each). At 8 it **spouts**: 12 sparks out of its blowhole and 300 points. | ✔✔ | ✔ | ✔ | Legendary $12, **M** |
| **Rainy Day Fund** | Ballionaire's Retirement Fund (if a tribute's last drop fails, spawn 10 Coin balls, then destroy itself) | If the **last ball of a round** drains short of the goal, 10 sparks rain from the top, once. Then the part is used up and leaves the table. A comeback, never a crutch. | ✔✔ | | ✔ | Uncommon $5, **S** once sparks exist |
| **Tulip** | Pachinko's tulip catchers (petals that open and close to widen the catcher) and the payout of balls into the tray | A pocket whose petals open for 3 s whenever a target in the machine is hit. A ball that falls in while it is open pays 60 and spits out **3 sparks**; while it is shut the ball bounces off. | ✔ | ✔ | | Rare $8, **M** |

### 3.3 The ball itself

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| **Rank Lights** | Pokémon Pinball Ruby & Sapphire (light three lights and the ball steps up to Great, Ultra and Master Ball, ×2, ×3 and ×4, for a while) | A set of 3 rollovers. Light all three and the ball **ranks up**: Silver (every hit pays ×1.5), Gold (×2), Diamond (×3). The ball changes colour and trails glitter. A rank lasts 40 s, and a drain loses it. | ✔ | ✔✔ | ✔✔ | Rare $8 (pack of 3), **S** |
| **Wrecking Ball** | Peggle 2's Bowlder (Jeffrey: the ball becomes a boulder that smashes through pegs); Peggle's Fireball (burns through pegs) | Once a ball, a hit makes the ball **twice as big and heavy for 6 s**: it knocks drop targets down without bouncing, every bumper hit counts twice, and the table shakes on every hit. | ✔✔ | ✔ | | Legendary $11, **M** (needs a physics check, see §5) |
| **Broomstick** | Ballionaire's Broom (bonk to ride it: the ball earns 2× and flies to the furthest screen edge) | The ball rides it: it flies in a straight line, ignoring gravity, for 1 s or until it reaches a wall, and every part it passes is zapped at ×2. | ✔✔ | ✔ | | Rare $9, **M** |
| **Party Hats** (ball hats) | Ballionaire's Hats: Disguise (the ball counts as every ball type), Happy Drama Mask (3×), Captain's Hat (passes to another ball) | A rollover that puts a hat on the ball for the rest of that ball. Three kinds: **Disguise** (every hit counts as every part type, so the Ding-Dong Bell and Hall of Fame see the whole table), **Crown** (points ×2, but the ball's Mult stops growing), **Captain's Hat** (jumps to the next ball that touches this one in multiball). | | ✔ | ✔ | Uncommon $6, **S** |
| **Gumball Machine** | Twilight Zone's gumball machine (holds three balls; dispenses or receives them during play); real-pinball ball locks | A lock: a ball shot into it is held and a new one comes to the plunger at no cost. The **third** lock releases all three at once as a real multiball. | ✔✔ | | ✔ | Rare $9, **M** (the catalog lists the lock) |

### 3.4 Growth and big set pieces

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| **Piñata** | Ballionaire's Attackables (Cave Troll: defeating it grants a draft; Lich: a boon draft); Peggle Blast's armoured pegs **(memory)**; Cult of PiN's damageable bumpers | Has 40 health; every hit takes 1–4 by impact speed (Vari-Target tiers). At zero it **bursts**: candy confetti, 15 sparks, $5, and a free pick of one of three parts. It comes back the next round with 20 more health. | ✔✔ | ✔ | ✔ | Rare $9, **M** |
| **Bonsai Bumper** | Ballionaire's Agers (Tree, Cheese and Grape Vine gain +0.1 mult per age) | A bumper, 10 a hit and **+4 for every round it has stayed on the table without being moved**. Moving it resets the count. It pays you for committing to a layout. | | ✔✔ | | Uncommon $5, **S** |
| **Time Capsule** | Ballionaire's Time Capsule (remove it at age 10 or more for 3 trigger drafts) | Scores nothing. Remove it after **6 rounds** on the table and it pays a **legendary part pick**. Before that, removing it pays nothing. It takes a spot early to pay off late. | | | ✔✔ | Rare $8, **S** |
| **Free Ball Bucket** | Peggle's moving bucket at the bottom (a ball that lands in it is a free ball) **(memory)** | A small bucket slides back and forth under the flippers. A draining ball that lands in it is returned to the plunger and pays 200. It also adds drain pressure: it takes the space where a lucky bounce would have been. | ✔ | | ✔ | Legendary $11, **M** (a mover below the flippers) |
| **Wizard Lamp** | Twilight Zone's Lost in the Zone (light all 14 door panels for a six-ball multiball of about 45 s); Pokémon Pinball's bonus stages; Demon's Tilt's rituals that unlock a wizard mode | Lights a segment for every **different part type** the ball hits. All lit: **WIZARD MODE**, 30 s of 3-ball multiball, every ×Mult cap lifted, music change and a table-wide light show. Once a round. | ✔✔ | ✔✔ | ✔✔ | Legendary $13, **M** |

### 3.5 Inlays (fixtures, no board space)

Gems set into a part on the table, one each. Sold in the shop from round 7 for $4–8, so late money has
somewhere to go; selling the part returns the gem to the toolbox.

| Inlay | Borrowed from | What it does to its part |
|---|---|---|
| **Ruby** | Ballionaire's Amethyst (+mult to adjacent triggers per stack) | Pays ×1.5. |
| **Topaz** | Ballionaire's Topaz (adjacent spawners get a chance of an extra ball) | Every hit has a 15% chance to drop a spark. |
| **Garnet** | Ballionaire's Garnet (adjacent triggers skip one cooldown per drop) | Its cooldown or dark time is halved (X Lane, Kickback, Firecracker). |
| **Emerald** | Ballionaire's Peridot (Limited triggers regain charges) | A once-a-ball part (Disco Ball, Hall of Fame, Firecracker) fires twice a ball. |
| **Opal** | Ballionaire's Citrine (ages adjacent Agers) | Its hits count twice for its type's growth (Pop growth, the Duck's speed, the Trophy's polish). |

Effort **M** (a slot on a part instance, the shop and the tooltip). Emerald on a Disco Ball is a ×Mult doubler, so it
needs the strictest look from the balance tool.

## 4. Recommended order

The order I would build in: value for the late game ÷ effort, and each step reuses the one before it.

1. **Rank Lights** (S). A reliable ×points lever that any run can find, and it is pinball's own vocabulary. It goes
   straight at problem 1.
2. **Zaps, then the Tesla Coil and Powder Keg** (S, then M). The biggest show for the cost, and they scale with a
   full board.
3. **Inlays** (M). The late money sink that needs no room (problems 2 and 3).
4. **Sparks, then the Rock Pile (with stacks) and the Firecracker** (M). The real "screen full of balls" moment.
   Do the collision filter and the cap first, and measure frame cost with 12 sparks in the smoke test.
5. **Wizard Lamp** (M). A late legendary that turns a whole ball into an event; it reuses the Ball Printer's
   multiball.
6. **Piñata** (M). Mayhem with a reward, and a second home for the decal-pick and part-pick screens.
7. The cheap scalers as filler between the big ones: **Grape Bunch, Echo Cave, Spotlight, Bonsai Bumper, Time
   Capsule** (all S).
8. Last, because they touch the riskiest physics: **Wrecking Ball, Broomstick, Free Ball Bucket**.

## 5. Watch out for

- **Caps first.** Every scoring part in the game has a per-ball cap (see the recipe fields in `src/data/parts.ts`).
  Sparks and zaps need them too: sparks share their parent ball's caps, a zap never chains (except Kegs, 4 deep), and
  a part is zapped at most once per 0.3 s. Without these, one Tesla Coil next to a Jackpot Scoop fills the pot in a
  second.
- **Flat Rate and the Overlord** take a share of Mult gains; check that Rank Lights (×points, not ×Mult) do not
  slip past them unintended. Decide whether "×points" counts as a Mult gain for those bosses.
- **Physics bugs are fatal** (Cult of PiN's worst reviews, [genre-research.md](genre-research.md) §3.10). A ball that
  changes size (Wrecking Ball) must be re-checked against flipper tunnelling (`npm run physics-report`) and the stuck
  and escape fuzz, and must not grow inside a gap narrower than its new size (grow only in open space, or shrink
  back if it would overlap). Broomstick flight must stop at walls, not pass through them.
- **Calm mode and Low graphics** should turn down shake, lightning and spark trails.
- **Readable terms.** Ballionaire's top complaints are RNG with too little control and custom jargon. "Spark" and
  "zap" are two new words: define them once on the card, the way the README defines a decal.
- **Not worth borrowing:** Peggle 2's Deep Freeze (pegs slide into each other) would shuffle a build the player
  placed by hand; Cult of PiN's gravity-changing bumpers fight the flipper physics we spent M0 making safe;
  Ballionaire's no-aim autobonking runs against our flippers being the player's lever.

## 6. Sources

- Ballionaire: [Triggers](https://ballionaire.wiki.gg/wiki/Triggers) · [Boons](https://ballionaire.wiki.gg/wiki/Boons) · [Spell](https://ballionaire.wiki.gg/wiki/Spell) (ballionaire.wiki.gg) · [Rogueliker early access review](https://rogueliker.com/ballionaire-early-access-review/) · [Gamecritics review](https://gamecritics.com/gc-staff/ballionaire-review/) · [Steam page](https://store.steampowered.com/app/2667120/Ballionaire/)
- Peglin: [Bomb](https://peglin.wiki.gg/wiki/Bomb) · [Peg](https://peglin.wiki.gg/wiki/Peg) · [Relic](https://peglin.wiki.gg/wiki/Relic) (peglin.wiki.gg) · [MuMu orb tier list](https://www.mumuglobal.com/blog/peglin-a-pachinko-roguelike-orbs-tier-list.html) (Matryorbshka, Ball Lightning)
- Peggle: [Prima Games, Peggle 2 Masters' power-ups](https://primagames.com/news/peggle-2-how-use-masters-power-ups) · [Engadget, Peggle 2 review](https://www.engadget.com/2013-12-09-peggle-2-review-relapse.html) · [MobyGames, Peggle](https://mobygames.com/game/peggle) (the original Masters' powers) · [Peggle Wiki](https://peggle.fandom.com/wiki/Purple_Peg) (peg types)
- Ball x Pit: [Dexerto wiki](https://www.dexerto.com/wikis/ball-x-pit/) (Maggot, Sun, Magma) · [PCGamesN evolutions tier list](https://www.pcgamesn.com/ball-x-pit/evolutions-tier-list)
- Cult of PiN: [Steam page](https://store.steampowered.com/app/3144340/Cult_of_PiN) (16 bumper types, damageable bumpers)
- Demon's Tilt: [Nintendo eShop page](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-download-software/DEMON-S-TILT-1695920.html) (chain meter, rituals, wizard mode; publisher copy)
- Pokémon Pinball Ruby & Sapphire: [Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Pinball:_Ruby_%26_Sapphire) (ball upgrades ×2, ×3, ×4; bonus stages)
- Twilight Zone (1993): [Wikipedia](https://en.wikipedia.org/wiki/Twilight_Zone_(pinball)) (gumball machine, Powerball, Powerfield, clock, Lost in the Zone)
- Black Knight 2000: [Wikipedia](https://en.wikipedia.org/wiki/Black_Knight_2000) (Magna-Save, split-level playfield)
- Pachinko: [Wikipedia](https://en.wikipedia.org/wiki/Pachinko) (tulip catchers, payouts) · [JRPass guide](https://www.jrpass.com/blog/everything-about-pachinko-in-japan) (start chucker, attacker)
