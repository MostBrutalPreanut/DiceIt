# Parts borrowed from other ball games

Ideas taken from Ballionaire, Peglin, Peggle, Ball x Pit, other pinball roguelites (Cult of PiN, Custom Pinball,
MASSFALL, Endless Bounce), arcade-machine roguelites (CloverPit, Luck be a Landlord, Raccoin), the pool roguelite
Ultrapool, Balatro, video pinball and real machines, picked for three things: they **cause mayhem on screen**, they **scale** (they get better the more you build around them), or they
**work late**, when the board is full and money piles up. Snapshot date: 26 Oct 2026. Sources are linked at the
bottom; anything marked **(memory)** is my own background knowledge and was not re-checked in this session.
Effort is for *our* engine, as in [parts-catalog.md](parts-catalog.md): **S** = a new recipe or small sim tweak,
**M** = new sim behaviour, **L** = a new system.

Every card is on a review page with Approve / Change / Skip and a notes box per part:
https://claude.ai/artifact/UMabyQfo79xB2nmhH6c1fv (private to its owner; the decisions are saved there).

**Built so far:** Rank Lights and the Old Bell (step 1 of §4), as revised in §6.3; zaps, the Tesla Coil, the Powder Keg, the
Laser Turret (was Laser Cross: one beam is not a cross) and the Shockwave Gong (step 2); the inlays: Ruby, Garnet,
Opal, Gold Leaf, Red Seal and Emerald (step 3); sparks with the Sparkler, the Rock Pile, the Firecracker, the
Powder Keg's spark and the Topaz, plus the effects budget of §7 (step 4, see §7.3). Decor (step 5, see §6.4): the Midnight Clock, the Ritual
Altar and four cabinet upgrades (Spare Bulb, Rubber Feet, Coin Tray, Side Mirror). The Wizard Lamp (step 6): a legendary
rollover with one segment per scoring part type on the table (up to 8); the ball lighting them all starts WIZARD
MODE (2 more balls, no ×Mult limits and every Lamp ablaze for 30 s, once a round). The Piñata (step 7): a rare target with 40
health; each of the ball's hits takes 1–4 by speed (a zap or a spark 1); at zero it bursts into 15 sparks and $5,
and the next shop offers a free pick of one of three parts (rolled as if three rounds later). Broken for the rest
of the round, it comes back with 20 more health; its damage carries over. The cheap scalers (step 8): Grape Bunch,
Echo Cave, Spotlight, Bonsai Bumper, Time Capsule, Ice Sculpture and Wishing Well, as approved (the Wishing Well's
+Mult is capped at +3 a ball; the Ice Sculpture melts 3 a press, not 1, after measuring; a Time Capsule's prize uses the Piñata's free-pick box, legendaries only). See [balance-plan.md](balance-plan.md) §2 for their numbers. Step 9, the physics parts: the
Wrecking Ball (once a ball the ball grows 1.5× for 6 s, only where it has room, and its hits pay ×2), the
Broomstick (the ball rides straight the way it points with no gravity for 1 s or until it touches anything,
zapping what it flies past at ×2), the Free Ball Bucket (a sensor bucket on a rail you place; a ball dropping in
from above goes back to the plunger) and the Gremlin Hutch (decor: 2 gremlins wander the table, 100 and $1 a knock,
up to $5 a round, back 10 s later; a knock was 300 at first, tuned to 100). `npm run physics-report` now checks a 1.5× ball against the flippers (0
tunnels in 600 trials, with or without the safety net) and runs the escape fuzz on a table with all four (0
escapes, 0 stuck in 200 balls). **The build order of §4 is done.**

**The review is done (26 Oct 2026): read §6 first.** It records every decision, the parts that changed and a new
kind of part (decor). §7 is the plan for sparks and for keeping the CPU cost down. The tables in §3 still show
each idea as first proposed; their names carry the verdict: ✅ approved, ✏️ changed (§6.3), ❌ skipped.

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

## 2. Four small systems that unlock most of the list

Most of the ideas below are cheap once these exist. Each is worth building once and reusing.

### 2.1 Sparks: temporary bonus balls
**From:** Ballionaire's spawned balls (Fire, Rock, Water, Coin balls from Bombgoblin, Avalanche, Cairn, Firecracker,
Stormy Weather), Peglin's Matryorbshka (splits in two on every peg hit), Peggle's Multiball power, Ball x Pit's
Maggot (enemies burst into baby balls).

A **spark** is a small, short-lived glowing ember that a part shoots out. As decided in the review:

- **It shoots out, hits stuff, and slowly fades away.** It leaves its source fast, bounces off walls and solid
  parts and rolls through rollovers, scoring as it goes. It lives 4 s: full glow for 2.5 s, then it shrinks and
  fades over 1.5 s and is gone. It never costs or saves a ball.
- **Flippers never touch it**, and neither do balls or other sparks. It falls past the flippers and out, so the
  player never juggles it; sparks are a show the build makes, not another thing to keep alive.
- **No ball-vs-ball collision anywhere in the game** (the review's call): balls pass through each other too. That
  should also cut the multiball pile-ups at the back of a flipper that cost the bot thousands of ball searches.
- It scores like a ball, but shares the caps of the ball whose hit made it (Mult caps, set caps), so many sparks
  cannot break a cap that one ball cannot.
- **What makes sparks:** Sparkler (new, the cheap source, §6.3), Powder Keg, Firecracker, Rock Pile, Splitter,
  Spider Nest, Marble Jar, Piñata, Insurance Policy, the Whale, the Topaz inlay and the Ritual Altar's Swarm.

How it is simulated and drawn, and what that costs, is §7.

Sparks are the mayhem dial: almost every "rain of balls" idea below is "spawn N sparks".

### 2.2 Zaps: a part scores without being touched
**From:** Peggle 2's Uber Volt (lightning jumps from each hit peg to more pegs), Peglin's Ball Lightning (hits
nearby pegs too), Peggle's Space Blast (blows up nearby pegs), Ballionaire's Tomato and Grape Vine (pay again for
each adjacent copy).

A **zap** scores a part as if the ball had hit it, with no physics: no kick, no ball movement. It counts as a
hit for growth (Pop Bumpers grow), the Jackpot Scoop's pot, the Ding-Dong Bell's variety and Lucky Seven. Guards (as decided):
a part can be zapped many times, but **at most once every 0.5 s**; a zap never sets off another zap (no chains,
except Powder Kegs, 4 deep). Added when it was built: a zap never reaches a ×Mult part (X Lane, the Golden Bumper,
the Disco Ball, Hall of Fame, Rank Lights), so a ×Mult stays a shot the ball has to make; it neither spends nor
earns a Hot Shot, and it never pays the Old Bell's toll. Each zap's points fly to the score as one chip, and a burst
of zaps makes one crackle. Drawn as a lightning arc or a shockwave, so the player sees *why* a far-off part scored.

Zaps are the scaling dial: they are worth more the more parts you own and the closer you pack them, which is
exactly what a full late board has.

### 2.3 Fixtures: things that go *on* a part (decided: **inlays only**, one per part, on some parts; no stacks)
**From:** Ballionaire's **Stackable** trait (Cairn, Spells, Amethyst: placing one next to a copy stacks onto it, and
the effect scales with the stack) and its **Gems** (Amethyst, Topaz, Garnet, Peridot, Citrine: small pieces that
power up adjacent triggers). Avengers: Infinity Quest does the same on a real machine: each gem you win is placed
on a shot you choose. Balatro's editions (Foil, Holographic, Polychrome, and Negative, which takes no slot) are the
same idea sold pre-installed.

Two kinds:
- **Stacks:** drop a copy of a stackable part onto one already on the table and it joins it (a number on the part)
  instead of taking new space. Every copy is bought at full price, so stacks are a money sink that needs no room.
- **Inlays:** a small gem set into a part (one per part), changing it. Inlays are sold in the shop like parts and
  never touch the board's layout.

Both work on a full board and soak up late money: problems 2 and 3 at once.

### 2.4 Merging (❌ skipped in the review)
**From:** Ball x Pit's **Fusion** (two level-3 balls merge into one that keeps both abilities and frees a slot; the
wiki counts 7,836 different fused balls) and **Evolution** (fixed recipes), Ultrapool (two of the same ball merge a
level up, to Level 5; its cocktail bar fuses two different balls), Endless Bounce (drag two placed bumpers together;
a recipe stays unlocked once found), and Suika Game's merge chain.

In the workshop, drop a part onto another of the same type and they merge into one part, one level higher and a
little bigger (up to Level 10), freeing a spot. Some different pairs have recipes (Pop Bumper + Cha-Ching = a Tip Jar
Bumper that pays points and $; Slingshot + Kickback = a Catapult), and a recipe stays in the catalogue once found.
It frees space on the full late board. Levels already come from Level Lights and decals, so merging must not make
Level Lights pointless, and the Tune-up (paying money to level a part) was removed from the game: check why before
merging doubles as a money sink. Effort **M**.

## 3. The parts

Columns: **M** = mayhem on screen, **S** = scales, **L** = good late. Costs follow
[balance-plan.md](balance-plan.md) §2 (common $1–4, uncommon $5–7, rare $8–9, legendary $11–13); every number is
a first guess for the balance tool to tune.

### 3.1 Explosions and lightning (zaps)

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| ✅ **Powder Keg** | Peglin's bomb (the first hit lights the fuse, the second detonates it); Ballionaire's Bombgoblin; Peggle's Space Blast | A barrel. The first hit lights the fuse (sparks fly off it). The next hit, or 3 s later, it **blows**: 80 points, every ball and spark within 6 units is thrown outward, and every part within 6 units is zapped. Then it is gone until the next ball. A blast lights the fuse of any other Keg in range, so a row of them goes off as a chain (up to 4 deep). | ✔✔ | ✔ | ✔ | Rare $8, **M** |
| ✅ **Tesla Coil** | Peggle 2's Uber Volt (Gnorman); Peglin's Ball Lightning | 30 a hit, and every hit arcs lightning to the **2 nearest scoring parts**, which are zapped. Levels add a third and a fourth arc. | ✔✔ | ✔✔ | ✔ | Rare $9, **S** once zaps exist |
| ✅ **Grape Bunch** | Ballionaire's Tomato and Grape Vine (pay once more for each adjacent copy); Clover (4 or more touching turn lucky) | A small bumper, 10 a hit, and it pays again for every Grape Bunch touching it. Four or more in one cluster turn **golden** and pay double. Sold as a pack of 3. | | ✔✔ | | Uncommon $5 (pack), **S** |
| ✅ **Echo Cave** | Ballionaire's Cave (×2 for every other Cave bonked in a row before it); Demon's Tilt's chain meter | A rollover tunnel, 15 a pass, ×2 for every other Echo Cave the ball went through **in a row** with no other part hit in between (×8 at most). A routing puzzle: line them up along one shot. | | ✔✔ | | Uncommon $6, **S** |
| ✅ **Spotlight** | Ballionaire's Whistle (adjacent triggers ×2 until it is bonked) and Candle | Parts within 5 units pay ×1.5 **while it is not hit**. A hit knocks it dark for 10 s. The tension: build round it, then keep the ball off it. | | ✔ | ✔ | Uncommon $6, **S** |
| ✏️ **Laser Cross** | Ball x Pit's Holy Laser (damages every enemy in the ball's row and column); Peggle Nights' Electro (lightning from the first peg to the bucket clears its path) | 40 a hit, and every hit fires two beams through it across the whole table, one across and one up and down. Every part a beam crosses is zapped. Cooldown 3 s. | ✔✔ | ✔✔ | ✔ | Rare $9, **S** once zaps exist |
| ❌ **Arc Wire** | Cult of PiN's Chain Lightning (while more than one ball is active, lightning damages everything between the balls) and Teamwork glyph (×1.2 per active ball) | While two or more balls or sparks are in play, lightning links them, and every 0.5 s every part on a line between two balls is zapped. With one ball it does nothing. | ✔✔ | ✔✔ | ✔ | Rare $9, **M** |
| ✏️ **Shockwave Gong** | Ultrapool's Tiger (launches every ball) and Tornado; Pinball Storm: Lokanta's Diting (re-bounces every marble); Cult of PiN's Power Nudge | 25 a hit. Every 10th hit it booms: every ball and spark on the table is kicked up the table at once. | ✔✔ | ✔ | | Uncommon $5, **S** |

### 3.2 Rains of balls (sparks)

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| ✅ **Firecracker** | Ballionaire's Firecracker (once a drop, a rocket bursts and rains Fire balls); Stormy Weather | Once a ball, a hit fires a rocket to the top of the table. It bursts and rains **6 sparks** across the top. | ✔✔ | ✔ | | Rare $8, **M** (sparks) |
| ✏️ **Rock Pile** (stackable) | Ballionaire's Cairn (one Rock ball per Cairn in the stack) and Avalanche | A heap of rocks, 10 a hit, and every hit drops **1 spark per rock in the pile** (cooldown 2 s). Drop another Rock Pile on it to stack it, up to 5. Takes one spot however big it gets. | ✔✔ | ✔✔ | ✔✔ | Uncommon $5, **M** (sparks and stacks) |
| ✅ **Splitter** | Peglin's Matryorbshka; Ballionaire's split-in-half effect | A rollover: the ball splits off **2 sparks** going left and right of it. Dark for 4 s after. | ✔ | ✔ | | Uncommon $6, **S** once sparks exist |
| ✏️ **The Whale** | Ballionaire's Whale (holds balls, ejects them all when full and pays per ball) and Dam (holds Water balls, spawns two per held ball) | Swallows every spark that touches it (8 points each). At 8 it **spouts**: 12 sparks out of its blowhole and 300 points. | ✔✔ | ✔ | ✔ | Legendary $12, **M** |
| ✅ **Insurance Policy** (renamed: Cult of PiN has a glyph called Rainy Day Fund) | Ballionaire's Retirement Fund (if a tribute's last drop fails, spawn 10 Coin balls, then destroy itself) | If the **last ball of a round** drains short of the goal, 10 sparks rain from the top, once. Then the part is used up and leaves the table. A comeback, never a crutch. | ✔✔ | | ✔ | Uncommon $5, **S** once sparks exist |
| ❌ **Tulip** | Pachinko's tulip catchers (petals that open and close to widen the catcher) and the payout of balls into the tray | A pocket whose petals open for 3 s whenever a target in the machine is hit. A ball that falls in while it is open pays 60 and spits out **3 sparks**; while it is shut the ball bounces off. | ✔ | ✔ | | Rare $8, **M** |
| ✅ **Spider Nest** | Ball x Pit's Egg Sac (explodes into 2–4 baby balls), Spider Queen (25% chance a hit births an Egg Sac), Catapult | 15 a hit, and each hit has a 25% chance to lay an egg: a spark that bursts into 3 sparks on the first part it hits. | ✔✔ | ✔ | | Rare $8, **M** |
| ✅ **Marble Jar** | Ballz (every orb collected adds a ball to all later volleys); Ball x Pit's Bag Maker (+1 ball slot) | Every 25 hits on it add a marble for the rest of the run (up to 5). Every ball you launch comes with one spark per marble. | ✔ | ✔✔ | ✔✔ | Rare $8, **S** once sparks exist |

### 3.3 The ball itself

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| ✏️ **Rank Lights** (built, as revised in §6.3) | Pokémon Pinball Ruby & Sapphire (light three lights and the ball steps up to Great, Ultra and Master Ball, ×2, ×3 and ×4, for a while) | A set of 3 rollovers. Light all three and the ball **ranks up**: Silver (every hit pays ×1.5), Gold (×2), Diamond (×3). The ball changes colour and trails glitter. A rank lasts 40 s, and a drain loses it. | ✔ | ✔✔ | ✔✔ | Rare $8 (pack of 3), **S** |
| ✏️ **Wrecking Ball** | Peggle 2's Bowlder (Jeffrey: the ball becomes a boulder that smashes through pegs); Peggle's Fireball (burns through pegs) | Once a ball, a hit makes the ball **twice as big and heavy for 6 s**: it knocks drop targets down without bouncing, every bumper hit counts twice, and the table shakes on every hit. | ✔✔ | ✔ | | Legendary $11, **M** (needs a physics check, see §5) |
| ✅ **Broomstick** | Ballionaire's Broom (bonk to ride it: the ball earns 2× and flies to the furthest screen edge) | The ball rides it: it flies in a straight line, ignoring gravity, for 1 s or until it reaches a wall, and every part it passes is zapped at ×2. | ✔✔ | ✔ | | Rare $9, **M** |
| ❌ **Party Hats** (ball hats) | Ballionaire's Hats: Disguise (the ball counts as every ball type), Happy Drama Mask (3×), Captain's Hat (passes to another ball) | A rollover that puts a hat on the ball for the rest of that ball. Three kinds: **Disguise** (every hit counts as every part type, so the Ding-Dong Bell and Hall of Fame see the whole table), **Crown** (points ×2, but the ball's Mult stops growing), **Captain's Hat** (jumps to the next ball that touches this one in multiball). | | ✔ | ✔ | Uncommon $6, **S** |
| ✅ **Gumball Machine** | Twilight Zone's gumball machine (holds three balls; dispenses or receives them during play); real-pinball ball locks; Wonka's Super Locks (kept between games) | A lock: a ball shot into it is held and a new one comes to the plunger at no cost. The **third** lock releases all three at once as a real multiball. | ✔✔ | | ✔ | Rare $9, **M** (the catalog lists the lock) |
| ✅ **Bank Ring** | MASSFALL's HEAT (score builds up unbanked and counts only when you pass a golden bank ring); Demon's Tilt's banked jackpot | With a Bank Ring on the table, 30% of every hit is held back as heat. Roll through the ring to bank it all at ×1.5; a drain loses whatever is unbanked. | | ✔✔ | ✔ | Rare $8, **M** |
| ✅ **Helping Hand** | The Addams Family's Thing Flips (the machine takes over a flipper and tries a shot, about 50–60% success) | A small flipper that flips by itself: when a ball comes near, it aims at the nearest scoring part and fires. It makes the shot about half the time. | ✔ | ✔ | ✔ | Uncommon $7, **M** |
| ❌ **Bullet Time** | Ball x Pit's Timestop (freezes everything for 5–6 s); Peggle's Extreme Fever slow motion **(memory)**; Creature in the Well's Hammer | Once a ball, a hit slows the whole table to half speed for 4 s; every hit in it pays ×2. Slow the clock the sim is fed, never its step size (the tunnelling numbers depend on the step). | ✔✔ | ✔ | | Legendary $11, **M** |

### 3.4 Growth and big set pieces

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| ✅ **Piñata** | Ballionaire's Attackables (Cave Troll: defeating it grants a draft; Lich: a boon draft); Peggle Blast's armoured pegs **(memory)**; Cult of PiN's damageable bumpers | Has 40 health; every hit takes 1–4 by impact speed (Vari-Target tiers). At zero it **bursts**: candy confetti, 15 sparks, $5, and a free pick of one of three parts. It comes back the next round with 20 more health. | ✔✔ | ✔ | ✔ | Rare $9, **M** |
| ✅ **Bonsai Bumper** | Ballionaire's Agers (Tree, Cheese and Grape Vine gain +0.1 mult per age) | A bumper, 10 a hit and **+4 for every round it has stayed on the table without being moved**. Moving it resets the count. It pays you for committing to a layout. | | ✔✔ | | Uncommon $5, **S** |
| ✅ **Time Capsule** | Ballionaire's Time Capsule (remove it at age 10 or more for 3 trigger drafts) | Scores nothing. Remove it after **6 rounds** on the table and it pays a **legendary part pick**. Before that, removing it pays nothing. It takes a spot early to pay off late. | | | ✔✔ | Rare $8, **S** |
| ✏️ **Free Ball Bucket** | Peggle's moving bucket at the bottom (a ball that lands in it is a free ball) **(memory)** | A small bucket slides back and forth under the flippers. A draining ball that lands in it is returned to the plunger and pays 200. It also adds drain pressure: it takes the space where a lucky bounce would have been. | ✔ | | ✔ | Legendary $11, **M** (a mover below the flippers) |
| ✏️ **Wizard Lamp** | Twilight Zone's Lost in the Zone (light all 14 door panels for a six-ball multiball of about 45 s); Pokémon Pinball's bonus stages; Demon's Tilt's rituals that unlock a wizard mode; Monster Bash's Monsters of Rock and Scared Stiff's Spider Mania (collect every award for a 4-ball mode); Metroid Prime Pinball's Artifact Temple | Lights a segment for every **different part type** the ball hits. All lit: **WIZARD MODE**, 30 s of 3-ball multiball, every ×Mult cap lifted, music change and a table-wide light show. Once a round. | ✔✔ | ✔✔ | ✔✔ | Legendary $13, **M** |
| ❌ **Siege Tower** | Godzilla's building (drops floor by floor as it is damaged, changing the shots); Medieval Madness's castle | 5 floors; every 6 hits knock one down (100, 200, 300...), and each floor gone opens shots behind it. Flattened: 3-ball multiball and a 1,000 super jackpot at the rubble. It rebuilds next round one floor taller. Close to the Castle Dragon's Siege: maybe the Factory's or Diner's version instead. | ✔✔ | ✔ | ✔✔ | Legendary $12, **M** |
| ✏️ **Magic Trunk** | Theatre of Magic's rotating trunk (four faces: a scoop, a magnet that grabs the ball...) | Turns to a new face every 8 hits: a bumper (30), a scoop (pays 5 for every hit since it opened), a magnet (grabs and throws, +0.25 Mult), a plain wall. | ✔ | ✔ | ✔ | Rare $9, **M** |
| ❌ **Haunted Gallery** | Pokémon Pinball's Gengar stage (10 Gastly bring Haunter, 10 Haunter bring Gengar); Devil's Crush's wandering skeletons; Peggle Blast's gnomes | Ghosts drift across the table, 3 at a time, 20 a pop. 10 popped bring a big ghost (3 hits, 150); 3 big ghosts bring the Boss Ghost (10 hits, 1,000 and ×1.5 Mult). Ghosts are moving sensors, not solid bodies. | ✔✔ | ✔ | ✔ | Rare $9, **M** |
| ✏️ **Old Bell** (built, as revised in §6.3) | CloverPit's Ring Bell (1 charge a round; a full 3-segment bar gives Symbols Multiplier +1 for good); Cult of PiN's Level Up glyph (×1.25 Mult for good after each Act) | Gains a notch every round you clear. At 3 notches the next hit rings it: every ball starts at ×1.2 Mult for the rest of the run (it stacks). Then it starts again. A slow ×Mult every run can find (problem 1). | | ✔✔ | ✔✔ | Rare $8, **S** |
| ✅ **Wishing Well** | Yoku's Island Express (bumpers that work only once you deposit enough fruit); Cult of PiN's Financier and Investor glyphs (+Mult and +Base per Mana spent) | 10 a hit. In the workshop throw $1 in (up to $5 a round); every $1 in it adds +3 to its hits and +0.02 Mult a hit, for the rest of the run. A money sink on the board (problem 2). | | ✔ | ✔✔ | Uncommon $4, **S** |
| ✅ **Ice Sculpture** | Cult of PiN's melting glyph (+300 damage, −1 every time a flipper is used, removed at 0) | 250 a hit, and it melts 1 point every time you press a flipper. At 0 it is a puddle and leaves the table. | | | ✔ | Uncommon $5, **S** |
| ❌ **Dish Rack** | Roundguard's pots (every pot broken in a launch smashes in turn at the end, building a break multiplier); real pinball's end-of-ball bonus count-up **(memory)** | Four plates, sold as a set. A hit breaks a plate (20). When the ball drains, every broken plate on the table smashes one by one, each paying 25% more than the last; they come back for the next ball. | ✔ | ✔ | | Uncommon $5 (pack of 4), **S** |

### 3.5 Modes and table events

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| ❌ **Portal Gun** | Rick and Morty (Spooky): spinner hits charge a portal gun; spending it jumps to a random dimension with a rule (3× ramps, 10× lanes, ½ right half, all flippers fire together), and Megaseeds add 5% each; Pirates of the Caribbean's random chapters | Spinner spins charge it (50 to fill). Full, the next hit opens a portal for 20 s with one random rule from a deck of 12, good or bad (lanes ×5, left half ×3, bumpers ×2, slings off, right half ×0.5, both flippers on every button). Each portal you get through leaves +5% to everything for the round. Share the rule code with bosses like Crossed Wires. | ✔ | ✔ | ✔ | Rare $9, **M** |
| ✏️ **Ritual Altar** | Cult of PiN's Rituals (missions start table-wide specials: Tempest rains destruction for 10 s, Inferno sets every ball on fire for 20 s, Multiball) and its Altar bumper (hits upgrade a ritual) | Every 8 sets completed anywhere start a 15 s ritual, in turn: Tempest (lightning strikes random parts twice a second), Inferno (every hit also zaps the parts next to it), Swarm (8 sparks). Every 20 hits on the Altar make the next ritual stronger. | ✔✔ | ✔✔ | ✔✔ | Legendary $12, **M** (zaps, sparks) |
| ✏️ **Midnight Clock** | FunHouse's clock (shots move it on; at midnight comes multiball); Twilight Zone's clock | Every scoring hit anywhere moves the hands on a minute from 9 PM. At midnight (180 hits) it strikes twelve: 20 s of Midnight Madness, everything ×2 and every lamp flashing. Once a ball. A meter every part feeds, so it scales with the board. | ✔ | ✔✔ | ✔ | Uncommon $6, **S** |
| ✅ **Spider Wheel** | Scared Stiff's spider wheel (the flippers stop it on one of 12 awards; collect all for Spider Mania); Bride of Pin·Bot's skill wheel; Cyclone's mystery wheel; Peggle's Lucky Spin | A scoop that spins a wheel of 8 awards, stopped by the flippers: ×2 for 20 s, $3, print a ball, light every Lamp, +1 Mult, a free reroll, 300 points, or Zilch. All 8 in a run: the next spin is Wheel Mania, 4-ball multiball at ×2. | ✔ | ✔ | ✔ | Rare $8, **M** |
| ✏️ **Gremlins** (a run rule, not sold) | Custom Pinball's Glitches (break them for a boon; left standing they raise the quota, cut coins and make rerolls dearer); Peggle Blast's gnomes; PINBOMB's boss parts | From round 7, two gremlins sneak onto the table each round, 5 hits each; a broken one pays $3 and a free reroll. Every gremlin still standing at the end of the round raises the next goal by 5%. | ✔ | | ✔✔ | Rule, **M** |

### 3.6 Machine upgrades (no board space)

| Part | Borrowed from | What it does here | M | S | L | Rarity, effort |
|---|---|---|---|---|---|---|
| ✏️ **Cabinet Upgrades** | Balatro's Vouchers ($10 permanent upgrades in pairs: Overstock +1 shop slot, Antimatter +1 joker slot); Cult of PiN's shop Blessings; Raccoin's chips; Wizorb's town rebuilding; Ball x Pit's Bag Maker and Bank | From round 6 the shop offers one permanent machine upgrade a round, $10–15: wider flippers, +1 shop slot, +1 toolbox space, a stronger plunger, +1 lock on offers, a longer Ball Saver window. They come in pairs; the second costs more. Decide which overlap with decals (Wide Shelf, Big Toolbox, Layaway). | | ✔ | ✔✔ | Machine, **S** |
| ❌ **Secret Basement** | Haunted House's cellar (a drain from the cellar goes to another playfield, never out); Black Hole's lower playfield; Banzai Run's backbox playfield; Kirby's Pinball Land's floors | A trap door drops the ball to a small basement table with its own two flippers and 4 part spots. A drain there sends the ball back up through the trap door. 30 s a visit. More board space late. The parts catalog lists it as **L** (ball layers). | ✔ | ✔✔ | ✔✔ | Legendary $13, **L** |

### 3.7 Inlays (fixtures, no board space)

Gems set into a part on the table, one each. Sold in the shop from round 7 for $4–8, so late money has
somewhere to go; selling the part returns the gem to the toolbox.

| Inlay | Borrowed from | What it does to its part |
|---|---|---|
| ✅ **Ruby** | Ballionaire's Amethyst (+mult to adjacent triggers per stack) | Pays ×1.5. |
| ✅ **Topaz** | Ballionaire's Topaz (adjacent spawners get a chance of an extra ball) | Every hit has a 15% chance to drop a spark. |
| ✅ **Garnet** | Ballionaire's Garnet (adjacent triggers skip one cooldown per drop) | Its cooldown or dark time is halved (X Lane, Kickback, Firecracker). |
| ✅ **Emerald** | Ballionaire's Peridot (Limited triggers regain charges) | A once-a-ball part (Disco Ball, Hall of Fame, Firecracker) fires twice a ball. |
| ✅ **Opal** | Ballionaire's Citrine (ages adjacent Agers) | Its hits count twice for its type's growth (Pop growth, the Duck's speed, the Trophy's polish). |
| ✅ **Gold Leaf** | CloverPit's Golden symbol (adds its base value to itself every time it scores, for good); Balatro's Foil edition | Its points grow +1 every time it scores, for the rest of the run. |
| ✏️ **Red Seal** | Balatro's Red Seal (the card retriggers once); CloverPit's Repetition modifier | Every hit scores twice. The second score counts against the same caps. |

Effort **M** (a slot on a part instance, the shop and the tooltip). Emerald on a Disco Ball is a ×Mult doubler, so it
needs the strictest look from the balance tool.

## 4. Recommended order

The order I would build in after the review: value for the late game ÷ effort, and each step reuses the one before
it.

1. **Rank Lights and the Old Bell** (S). Reliable ×points and ×Mult levers that any run can find. They go
   straight at problem 1. Test Rank Lights against Flat Rate and the Overlord.
2. **Zaps, then the Tesla Coil, Powder Keg, Laser Cross and Shockwave Gong** (S, then M). The biggest show for the
   cost, and they scale with a full board.
3. **Inlays** (M). The late money sink that needs no room (problems 2 and 3).
4. **Sparks: the collision categories and no ball-vs-ball collision, then the Sparkler, Firecracker and Rock Pile**
   (M). The real "screen full of balls" moment. Do the spark drawing and the effects budget of §7 in the same
   step, and add the 24-spark smoke check before any spark part ships.
5. **Decor: the strip around the playfield, then the Midnight Clock, Cabinet Upgrades and Ritual Altar** (M). It
   takes no playfield spot, so it is the second answer to problems 2 and 3.
6. **Wizard Lamp** (M). A late legendary that turns a whole ball into an event; it reuses the Ball Printer's
   multiball.
7. **Piñata** (M). Mayhem with a reward, and a second home for the decal-pick and part-pick screens.
8. The cheap scalers as filler between the big ones: **Grape Bunch, Echo Cave, Spotlight, Bonsai Bumper, Time
   Capsule, Ice Sculpture, Wishing Well** (all S).
9. Last, because they touch the riskiest physics: **Wrecking Ball, Broomstick, Free Ball Bucket**, and the
   wandering gremlins of the **Gremlin Hutch**.

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
- **What players hated in similar games** (from Steam reviews and previews):
  - Cult of PiN: maxed multiball "trivializes the game"; balls feel identical; upgrades are a number going up with
    few real synergies; ritual timers are too long and hard to see past; one bad curse can ruin a run; balls stop on
    corners or fall through the floor.
  - Runix: one ball at a time leaves "not much chance for synergy"; ball abilities show only in the pause menu;
    runs of 80+ minutes.
  - Pinball Storm: Lokanta: the split-ball power makes the others "useless"; no pop-bumper equivalent, so it does not
    feel like pinball; skills unclear without visual cues; it "can largely play itself".
  - What follows for us: cap multiball and sparks so they are one strong build, not the only one; say on the card and
    on the table what every part does; keep rituals and modes short.
- **Not worth borrowing:** Peggle 2's Deep Freeze (pegs slide into each other) would shuffle a build the player
  placed by hand; Cult of PiN's gravity-changing bumpers fight the flipper physics we spent M0 making safe;
  Ballionaire's no-aim autobonking runs against our flippers being the player's lever.

## 6. Review decisions (26 Oct 2026)

Every card was reviewed on the review page: **29 approved, 15 to change, 10 skipped** (54 in all). The notes are
summarised here as design decisions; where a note asked a question, the answer is under the part.

### 6.1 Decisions that change the systems
- **Sparks:** no flippers, no balls, no other sparks; they shoot out, hit stuff and fade away (§2.1).
- **No ball-vs-ball collision in the game at all**, for balls as well as sparks.
- **Zaps:** a part can be zapped many times, at most once every 0.5 s.
- **Fixtures:** inlays only, one per part, and only on some parts: the ones that score when hit (bumpers, targets,
  spinners, lanes, lamps, scoops). Not on flippers, the Ball Saver, the Kickback, floor pieces (Glow Strip, Power
  Plate), decor or Big Boi. The card shows an empty gem socket on parts that take one. **No stacking.**
- **Merging:** skipped.
- **Never move parts mid-run.** Nothing a part does may push, slide or knock over another part. (Drop targets in the
  existing Drop-Target Bank still fall and come back as they do today.)

### 6.2 A new kind of part: decor
The review asked for several ideas to become **decor**: things bought in the shop and placed **outside the build
area** (on the cabinet around the playfield), which **cannot overlap each other and cannot be hit**. Decor never
takes a playfield spot, so it is the answer to the full late board, and the money it costs is the late money sink.
Decor in this doc: the **Ritual Altar**, the **Midnight Clock**, the **Cabinet Upgrades** (as small decor pieces)
and the **Gremlin Hutch** (was Gremlins). Effort **M**: a decor strip in the layout, its own placement rules and
drawing, and a shop slot type.

### 6.2.1 Decor as built (step 5)
- **Where it stands:** on the cabinet itself, never on the playfield: the wooden corners above the dome (the top of
  the walls) and the apron below the flippers, clear of the drain's stripes and the four decal slots. Both are always
  on screen, even on a phone, where the scenery beside the cabinet is cropped. Decor cannot overlap other decor; table
  parts and decor never block each other. While a piece is in hand, every spot it fits is dotted.
- **What it is:** a part of kind `decor`: bought in the shop (one of each, so the shop never offers decor you own),
  kept in the toolbox, sold and moved like a part. It has no body in the sim, so the ball never touches it, and it
  works only while it stands on the cabinet. Zaps, Hall of Fame's part types, Purist and Crowd Pleaser ignore it.
- **Midnight Clock** (uncommon, $6): every scoring hit (zaps and sparks too) is a minute from 9 PM; at midnight (180)
  it strikes: 20 s of every hit ×2 and every Lamp at full glow. Once a ball; the hands go back each round.
- **Ritual Altar** (legendary, $12): every 8 completed sets (lane, bank, Level Light, Rank Light) start a 15 s
  ritual, in turn: Tempest (lightning zaps 2 + s random parts a second), Inferno (each of the ball's hits zaps the
  1 + s nearest parts within 5), Swarm (8 + 4s sparks from the top), where s is the rituals done so far (up to 4).
  Its count and strength are kept on the altar for the run.
- **Cabinet upgrades**, each about half a decal: **Spare Bulb** ($6: Lamps +1 radius, +2% a step), **Rubber Feet**
  ($6: nudges 15% stronger, no more tilt), **Coin Tray** ($8: +$1 a cleared round), **Side Mirror** ($9: one more
  shop offer every second round). They fold into the run's mods, like decals.
- **Gremlin Hutch** (step 9, legendary, $12): two gremlins wander the table through the parts; a ball that knocks
  one out scores 100 and $1 (up to $5 a round), and it is back 10 s later.

### 6.3 The changed parts, as revised

| Part | Note from the review | Revised |
|---|---|---|
| **Sparkler** (new) | The Whale: "we need a cheap way to create sparks" | Common, $3. 8 a hit, and every hit shoots out 1 spark (cooldown 1 s). The cheap, everyday spark source. |
| **Powder Keg** (approved, reworded) | Make the wording simpler | Hit it once to light it. A few seconds later it explodes: everything around it scores, and it shoots out a spark. |
| **Laser Cross** | Random direction is better | Every hit fires one beam in a random direction, right across the table. Every part on the beam scores. |
| **Shockwave Gong** | Hitting everything is cool; do not move parts | Every 10th hit it booms and every part on the table scores once (a table-wide zap). Nothing moves, balls included. |
| **Rock Pile** (approved) | A bit cheaper. Is a rock a heavy ball the flippers can bounce? | $4. No stacks now: the pile grows by a rock every 5 hits (up to 5, back to 1 each round), and every hit drops one rock per rock in the pile (cooldown 2 s). Rocks are sparks: the flippers never touch them. |
| **The Whale** | 12 may be too much | Swallows sparks (8 points each); at 6 it spouts 6. With the Sparkler as a cheap source it has something to eat. |
| **Rank Lights** | It counts for Flat Rate; test it. Perhaps ×1.2 steps are enough | Ranks count as Mult gains for Flat Rate and the Overlord. Silver ×1.2, Gold ×1.4, Diamond ×1.6 (read from "1x2 etc"; confirm), tuned by the balance tool. |
| **Wrecking Ball** | Big heavy ball, but not sure it is good. What is a drop target? Do not move parts | A drop target is a target in the existing Drop-Target Bank (they already fall and come back), so nothing new moves. Revised: once a ball, a hit makes the ball 1.5× bigger and heavier for 6 s; every hit pays ×2 and shakes the table. Needs a playtest to see if it earns its slot. |
| **Free Ball Bucket** (approved) | It must not always be under the flippers; make it a skill shot | It rides a rail you place in the build area, sliding back and forth. Landing a ball in it from above pays 200 and returns the ball to the plunger without losing it. |
| **Wizard Lamp** | How many types? The player must know exactly | The lamp has one segment for every different part type on the table when the round starts, at most 8, and its card says the number ("Hit 6 types"). |
| **Magic Trunk** (approved) | Maybe every 5 hits | Turns to a new face every 5 hits. |
| **Old Bell** | It must be hit each round and pay once, so it is not a dud | Its first hit each round pays 150 and adds a notch; a round where it is not hit adds none. At 3 notches it rings: every ball starts at ×1.2 Mult for the rest of the run. |
| **Red Seal** | But it puts (or extends) a short cooldown on the part | Every hit on its part scores twice, then the part is dark for 0.5 s (added to any cooldown it already has). |
| **Ritual Altar** | Out of the build area, as decor; cannot be hit | Decor. Every 8 sets completed anywhere start a ritual (Tempest, Inferno, Swarm in turn); each ritual done makes the next one stronger (it cannot be hit, so its "20 hits" rule is gone). |
| **Midnight Clock** | Make it decor | Decor, otherwise the same: every scoring hit moves it on a minute; at midnight, 20 s of ×2. |
| **Cabinet Upgrades** | Small decor, weaker than decals | Small decor pieces, $6–10, each about half a decal: Spare Bulb (Lamps +5%), Rubber Feet (nudges 10% stronger, no extra tilt), Coin Tray ($1 every second round cleared), Side Mirror (the shop shows one more part every second round). |
| **Gremlin Hutch** (was Gremlins) | Decor, not round based, but expensive. Gremlins move around and pass through parts, like the ghosts | Decor, legendary, $12. Releases 2 gremlins that wander the table, drifting through parts. A ball that touches one knocks it out for 300 and $1; it comes back 10 s later. |

### 6.4 Approved as written
Tesla Coil, Grape Bunch, Echo Cave, Spotlight, Firecracker, Splitter, Insurance Policy, Spider Nest, Marble Jar,
Broomstick, Gumball Machine, Bank Ring, Helping Hand, Piñata, Bonsai Bumper, Time Capsule, Spider Wheel, Wishing
Well, Ice Sculpture, and the Ruby, Topaz, Garnet, Emerald, Opal and Gold Leaf inlays (plus Powder Keg, Rock Pile,
Free Ball Bucket and Magic Trunk with the small changes above).

### 6.5 Skipped
Arc Wire, Tulip, Party Hats, Bullet Time, Siege Tower, Haunted Gallery, Dish Rack, Portal Gun, Secret Basement,
and the Merging system.

## 7. Sparks, zaps and the CPU

The review asked for a smart way to spend CPU when several balls, sparks, zaps and effects are on screen at once.
The first rule: **the sim decides what happens and stays exact and deterministic; only drawing and sound are
budgeted.** The balance tool, the bot and the player must see the same game, so nothing that scores is ever
dropped to save time.

### 7.1 What it costs: measured
A throwaway benchmark (not committed) ran the real sim on a full late table (27 parts plus Big Boi) for 30 s of
game time at 240 Hz, topping balls and sparks up as they drained. Node 22 in this container, CPU only; read the
numbers as ratios, not as a promise for every machine.

| On the table | ms per 240 Hz step | ms per 60 fps frame |
|---|---|---|
| 1 ball | 0.041 | 0.16 |
| 4 balls | 0.044 | 0.18 |
| 4 balls, no ball-vs-ball collision | 0.041 | 0.16 |
| 4 balls + 12 sparks as Box2D bodies | 0.066 | 0.27 |
| 4 balls + 30 sparks as Box2D bodies | 0.120 | 0.48 |
| 4 balls + 12 sparks stepped outside Box2D (circle casts at 60 Hz) | 0.210 | 0.84 |
| 4 balls + 30 sparks stepped outside Box2D | 0.339 | 1.36 |

What it says:
- **Physics is not the problem.** 30 sparks add about 0.3 ms a frame; a 60 fps frame has 16.7 ms.
- **The obvious "smart" idea is slower.** Moving sparks outside Box2D and casting a circle for each one, even at a
  quarter of the rate, cost 3–5× more, because this JavaScript Box2D allocates on every cast. Box2D's own broadphase
  and solver are the cheap path. Keep sparks as ordinary bodies.
- **Turning off ball-vs-ball collision** saves a little and should cut the pile-ups.
- **The cost to watch is everything a hit triggers:** drawing, flying points, particles and sound. Balls are drawn
  today as vector shapes rebuilt every frame (body, highlight and a trail ribbon each), which is fine for 4 balls and
  not for 24 sparks.

### 7.2 The plan

**Physics (sim):**
1. **Collision categories.** Walls, parts, flippers, balls and sparks each get a category. Balls collide with walls,
   parts and flippers; sparks with walls and solid parts only; sensors (rollovers, lamps, spinners) see both. This
   is the whole of "flippers never touch sparks" and "no ball-vs-ball collision".
2. **Sparks are plain dynamic bodies, not bullets.** Box2D v3 already sweeps dynamic bodies against static ones, so
   a spark cannot tunnel through a wall; the bullet sweep that balls need is only for fast bodies against moving
   ones, and sparks never meet the flippers. A rare miss against a sliding duck or roller is harmless.
3. **A hard cap: 24 sparks on the table.** A spawn over the cap makes the oldest spark start its fade at once, so
   nothing is refused and the count never runs away.
4. **Sparks live in their own list,** looked up by id in a Map. Today each contact searches the ball array, and
   every step copies it; with sparks those per-step costs would grow with the spark count.
5. **Zaps are a queue,** resolved at the end of each sim step: each part once per 0.5 s, Kegs chain at most 4 deep.
   A zap is arithmetic in the scorer, so even 100 zaps in a step costs almost nothing.

**Drawing (renderer):**
1. **Sparks are baked sprites in one ParticleContainer,** the way `particles.ts` already draws debris: one texture
   per theme, and per frame only position, scale and alpha change. Their trail is two fainter copies at older
   positions, not ribbon geometry. All sparks together are one draw call.
2. **One state snapshot a frame.** `ballStates()` is called several times a frame and allocates each time; read
   balls and sparks once, share the arrays.
3. **Lightning in one batch.** Every zap arc of a frame goes into one Graphics as a few jagged lines (seeded, so they
   do not flicker), at most 12 arcs drawn a frame; the score still counts every zap.
4. **Later, if needed:** balls as baked sprites too (the same move as sparks).

**Effects budget (presentation only):**
The game already caps particles (150), flying chips (160) and sound voices (24, with a minimum gap per kind of
sound). Sparks and zaps plug into those caps, at a lower priority than real balls:
1. **Priority:** a real ball's hit always gets its effects; zaps next; spark hits last.
2. **Merge the flying points.** Points from sparks and zaps on the same part within 0.2 s fly as one chip carrying
   the sum. Same total, far fewer chips. If that is still too many, the review allows going further: merge them into
   one bigger chip per burst, or let spark and zap points skip the flight to the score dock and count in at once.
3. **A spark hit is a flash, not a burst:** the part lights up for a moment; no debris.
4. **Sound:** spark hits share one soft tick with a 60 ms gap; zaps play one crackle a frame however many fired.

**Quality that adapts:**
A rolling average of frame time. Above 14 ms for a second, the next cosmetic tier goes: spark trails, then
lightning becomes straight lines, then debris and smoke. Below 10 ms for 3 s, it comes back one tier at a time.
Low graphics starts at the bottom tier, and Calm mode also turns down shake and flashes. The sim never knows.

**Checks to add:**
- The smoke test's renderer check (it fails above 12 ms a frame) gets a scripted frame with 4 balls, 24 sparks and
  10 zaps a second.
- `npm run physics-report` gets a 24-spark line, and the escape fuzz runs with sparks on.
- A determinism test: the same seed with sparks gives the same fingerprint, step for step.

### 7.3 As built (step 4)
- **Physics as planned:** collision categories (a ball's mask is walls, parts and flippers; a spark's is walls and
  parts), sparks as plain dynamic bodies in their own list, the cap of 24 glowing (36 at most, the oldest goes), and
  they are in the sim's fingerprint, so the determinism test covers them. A spark scores on parts that can be zapped,
  each part at most once per 0.25 s per spark, as the ball that made it; it never makes sparks, spends a Hot Shot or
  pays the Old Bell's toll.
- **Drawing:** each spark is four pooled sprites (a halo, a four-point star sticker baked per theme that spins, and
  two soft ghosts at older positions) plus a warm spot on the floor; no Graphics. An ordinary Container, not a
  ParticleContainer: at 36 sparks the pool is under 150 sprites and Pixi batches them anyway.
- **Effects:** a spark's hit is a small flash and a small number, no debris and no shake; its points fly as one chip;
  its sound is one tick (3 at most in 0.35 s); the display does not flash for it. Not built: merging chips across
  hits within 0.2 s (one chip a hit has been enough so far).
- **Adaptive quality:** the renderer smooths the real frame interval. Over 22 ms for a second, strain goes up a step:
  1 drops the spark ghosts and floor spots, 2 also draws lightning straight and half as many arcs. Under 17.5 ms for
  3 s, it comes back a step. (The plan's 14 / 10 ms would trip at a plain 60 fps: the interval includes the wait
  for the screen.) Low graphics drops the ghosts and spots from the start; debris and smoke already go with it.
- **Checks:** the smoke test draws 4 balls, 24 sparks and a burst of zaps and fails above 12 ms a frame (3.5 ms in
  this container, against 2.6 ms for the plain frame). Not done: the physics report's spark line and running the
  escape fuzz with sparks.

## 8. Sources

- Ballionaire: [Triggers](https://ballionaire.wiki.gg/wiki/Triggers) · [Boons](https://ballionaire.wiki.gg/wiki/Boons) · [Spell](https://ballionaire.wiki.gg/wiki/Spell) (ballionaire.wiki.gg) · [Rogueliker early access review](https://rogueliker.com/ballionaire-early-access-review/) · [Gamecritics review](https://gamecritics.com/gc-staff/ballionaire-review/) · [Steam page](https://store.steampowered.com/app/2667120/Ballionaire/)
- Peglin: [Bomb](https://peglin.wiki.gg/wiki/Bomb) · [Peg](https://peglin.wiki.gg/wiki/Peg) · [Relic](https://peglin.wiki.gg/wiki/Relic) (peglin.wiki.gg) · [MuMu orb tier list](https://www.mumuglobal.com/blog/peglin-a-pachinko-roguelike-orbs-tier-list.html) (Matryorbshka, Ball Lightning)
- Peggle: [Prima Games, Peggle 2 Masters' power-ups](https://primagames.com/news/peggle-2-how-use-masters-power-ups) · [Engadget, Peggle 2 review](https://www.engadget.com/2013-12-09-peggle-2-review-relapse.html) · [MobyGames, Peggle](https://mobygames.com/game/peggle) (the original Masters' powers) · [Peggle Wiki](https://peggle.fandom.com/wiki/Purple_Peg) (peg types)
- Ball x Pit: [Dexerto wiki](https://www.dexerto.com/wikis/ball-x-pit/) (Maggot, Sun, Magma) · [PCGamesN evolutions tier list](https://www.pcgamesn.com/ball-x-pit/evolutions-tier-list)
- Cult of PiN: [Steam page](https://store.steampowered.com/app/3144340/Cult_of_PiN) (16 bumper types, damageable bumpers)
- Demon's Tilt: [Nintendo eShop page](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-download-software/DEMON-S-TILT-1695920.html) (chain meter, rituals, wizard mode; publisher copy)
- Pokémon Pinball Ruby & Sapphire: [Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Pinball:_Ruby_%26_Sapphire) (ball upgrades ×2, ×3, ×4; bonus stages)
- Twilight Zone (1993): [Wikipedia](https://en.wikipedia.org/wiki/Twilight_Zone_(pinball)) (gumball machine, Powerball, Powerfield, clock, Lost in the Zone)
- Black Knight 2000: [Wikipedia](https://en.wikipedia.org/wiki/Black_Knight_2000) (Magna-Save, split-level playfield)
- Cult of PiN devlogs: [demo v0.8 overhaul](https://kennymakesgames.itch.io/pin/devlog/955200/demo-v08-an-enormous-overhaul) · [v0.9.42 notes](https://kennymakesgames.itch.io/pin/devlog/1277003/demo-v0942-patch-notes) · [Blessings update](https://kennymakesgames.itch.io/pin/devlog/1006950/massive-update-blessings-sparks-burn-and-more) · [v0.10.0](https://kennymakesgames.itch.io/pin/devlog/1341633/major-update-v0100-is-live) · [v0.11.15 notes](https://kennymakesgames.itch.io/pin/devlog/1505669/demo-v01115-patch-notes) · [negative reviews](https://steamcommunity.com/app/3144340/negativereviews/)
- Other pinball roguelites: [Custom Pinball](https://store.steampowered.com/app/4838900/) · [Endless Bounce](https://store.steampowered.com/app/5097100/) · [MASSFALL](https://store.steampowered.com/app/4972250) · [PINBOMB](https://store.steampowered.com/app/4869310) · [Pinball Storm: Lokanta](https://store.steampowered.com/app/2642570/) · [Runix reviews](https://steamcommunity.com/app/3617290/reviews/) · [Yoku's Island Express review](https://www.thexboxhub.com/yokus-island-express-review/) · [Creature in the Well review](https://easyallies.com/review/creature-in-the-well)
- Ball x Pit wiki: [Fusion](https://ballxpit.wiki.gg/wiki/Fusion_Mechanics) · [Balls](https://ballxpit.wiki.gg/wiki/Balls) · [Timestop](https://ballxpit.wiki.gg/wiki/Timestop) · [Catapult](https://ballxpit.wiki.gg/wiki/Catapult) · [Destructoid, all special balls](https://www.destructoid.com/all-special-balls-in-ball-x-pit/) (Holy Laser) · [buildings](https://www.dexerto.com/wikis/ball-x-pit/all-buildings-in-ball-x-pit/)
- Peggle Nights: [Wikipedia](https://en.wikipedia.org/wiki/Peggle_Nights) (Electro) · Roundguard: [TouchTapPlay guide](https://www.touchtapplay.com/roundguard-guide-tips-tricks-to-surviving-the-dungeon/) · Ballz: [TechCrunch](https://techcrunch.com/2017/04/29/ballz-is-my-new-digital-enemy-and-favorite-mobile-game/amp)
- CloverPit wiki: [Symbols](https://cloverpit.wiki.gg/wiki/Symbols) · [Phone](https://cloverpit.wiki.gg/wiki/Phone) · [Ring Bell](https://cloverpit.wiki.gg/wiki/Ring_Bell) · Ultrapool wiki: [Balls](https://ultrapool.wiki/w/Balls) · [Cocktail bar](https://ultrapool.wiki/w/Cocktail_bar) · Raccoin: [Rogueliker review](https://rogueliker.com/raccoin-coin-pusher-review) · Balatro wiki: [Vouchers](https://balatrowiki.org/w/Vouchers) · [Editions](https://balatrowiki.org/w/Editions) · [Seals](https://balatrowiki.org/w/Seals)
- Real machines: [Medieval Madness](https://en.wikipedia.org/wiki/Medieval_Madness) · [The Addams Family](https://en.wikipedia.org/wiki/The_Addams_Family_(pinball)) · [Theatre of Magic](https://en.wikipedia.org/wiki/Theatre_of_Magic) · [FunHouse](https://en.wikipedia.org/wiki/FunHouse_(pinball)) · [Monster Bash](https://en.wikipedia.org/wiki/Monster_Bash_(pinball)) · [Haunted House](https://en.wikipedia.org/wiki/Haunted_House_(pinball)) · [Black Hole](https://en.wikipedia.org/wiki/Black_Hole_(pinball)) · [Banzai Run](https://en.wikipedia.org/wiki/Banzai_Run) · [Cyclone](https://en.wikipedia.org/wiki/Cyclone_(pinball)) · [Bride of Pin·Bot](https://en.wikipedia.org/wiki/Bride_of_Pinbot) · [Scared Stiff rules](https://www.cferrero.net/pball/ScaredStiff.pdf) · rulesheets: [Rick and Morty](https://pinballrulesheets.com/spooky/rick-morty-rulesheet.html), [Avengers: Infinity Quest](https://pinballrulesheets.com/stern/avengers-infinity-quest-rulesheet.html), [Wonka](https://pinballrulesheets.com/jersey-jack/wonka-rulesheet.html) · Godzilla: [Kineticist](https://www.kineticist.com/post/stern-pinball-announces-godzilla-pinball) (search summary)
- Video pinball: [Pokémon Pinball bonus stages](https://serebii.net/pinball/bonusstages.shtml) · [Devil's Crush](https://www.nintendolife.com/games/tg16/devils_crush) · [Kirby's Pinball Land](https://en.wikipedia.org/wiki/Kirby%27s_Pinball_Land) · [Metroid Prime Pinball](https://www.metroidwiki.org/wiki/Metroid_Prime_Pinball)
- Pachinko: [Wikipedia](https://en.wikipedia.org/wiki/Pachinko) (tulip catchers, payouts) · [JRPass guide](https://www.jrpass.com/blog/everything-about-pachinko-in-japan) (start chucker, attacker)
