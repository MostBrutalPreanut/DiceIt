# Creative parts catalog

Where the ideas come from and what we could build. Sources are linked at the bottom; anything marked **(memory)** is my own background knowledge of pinball machines and was not re-checked in this session. Status: ✅ built, ▶ next, 💡 idea. Effort is for *our* engine: **S** = a new recipe or small sim tweak, **M** = new sim behavior, **L** = needs a new system (layers, a second board).

## 0. The scale of the idea space

The Internet Pinball Serial Number Database alone lists **6,714 games** (an index of what has been catalogued, not a count of every machine ever built). The Dutch Pinball Museum shows about **190** machines across four eras: pre-war, electromechanical (1930 to 1977), solid state (1977 to 1990) and dot-matrix (1991 to today). The glossary on Wikipedia names well over fifty distinct playfield mechanisms and rule ideas. We will not run out.

What the real machines keep returning to, in order of how much it matters for us:
1. **Progress that you can see on the table**: lights that fill up, bumpers that change colour, ranks, quests, modes.
2. **Parts that change state**: drop targets that fall and reset, lights that toggle, gates and posts that open and close, targets that alternate between values.
3. **Parts that move**: toys, hands, heads, castles, spinning discs, upper playfields.
4. **Ball control**: locks, saucers, magnets, kickbacks, ball savers, multiball.
5. **Rules layered on top**: skill shots, combos, jackpots, missions, wizard modes, bonus multipliers.

## 1. What Space Cadet and its Full Tilt! siblings do

Full Tilt! Pinball shipped three tables: **Space Cadet**, **Skulduggery** and **Dragon's Keep** (the Windows version of Space Cadet differs in a few rules).

| Idea | How it works there | For us |
|---|---|---|
| **Bumper upgrades from lit lanes** | Lighting all three "re-entry" lanes upgrades the four attack bumpers; lighting the three launch-lane lights upgrades the engine bumpers. Each bumper type can be upgraded **three times** per game, and the bumpers change colour (blue, green, yellow, red) as they level. | ✅ **Level Light** + per-run part levels (max 5), pips on the part. ▶ colour the bumper by level. |
| **Lights that toggle** | In the Windows version the yellow lights above the bumpers turn **off** if the ball passes over them while lit; in the original Full Tilt! they stay lit. | ✅ Level Lights toggle. |
| **Upgrades that wear off** | Some missions require the bumpers to be at a level and "downgrade" over time. | 💡 **Wear**: upgrades fade unless you keep feeding the lights (a risk/maintenance mechanic). **M** |
| **Fuel lights (a countdown you can refill)** | A mission has fuel lights that go out one at a time; rolling over them relights them, and going up the launch ramp relights all at once. When they run out the mission is aborted. | 💡 **Fuse Lane**: lights burn down while a bonus is active; rolling over refills. **M** |
| **Ranks** | Nine ranks. Missions light a blue ring in the table's centre; when it is full you rank up. | 💡 table-wide tiers: filling the ring raises every part by a level or the goal's payout. **M** |
| **Missions** | Mission targets pick the mission, the launch ramp accepts it. "Target practice" asks for eight hits on the attack bumpers. | ▶ missions (optional per-round goals), already in the plan. |
| **Wormholes** | Hitting the wormhole whose colour matches a lit light locks the ball; doing it repeatedly starts multiball (a replay in the Windows version). | 💡 **Wormhole pair**: a coloured teleporter that locks and releases. **M** |
| **Two routes to win** (Skulduggery) | Assemble a treasure map **or** complete a series of pirate mini-games (ship battle, tavern fight, escape the Bermuda Triangle, mutiny, sword fight). | 💡 a stage with two different goals to choose between. |
| **Spells, weapons, armour** (Dragon's Keep) | Quests lead to a dragon. Weapons just add points; **armour and spells temporarily activate gates, magnets and chutes**, changing how the table plays. | 💡 **Power-ups**: earn "Magnet 10 s", "Open Gate", "Chute" charges and spend them mid-ball. **M** |
| **Arrows that show the next shot** | Small arrows light up to show the next target, ramp or bumper to hit. | 💡 a hint layer that points at the part you have not hit this ball. **S** |
| **Four flippers, elevated platforms and wire ramps** (Skulduggery, Dragon's Keep) | More flippers, more levels, wireform tracks. | ✅ Extra Flipper. ▶ ramps and layers. **L** |

## 2. A catalog of mechanisms

### 2.1 Lights, lanes and progress
| Part | Idea | Status / effort |
|---|---|---|
| Lane Rollover set | Light them all: bonus and reset. | ✅ |
| Level Light | Toggles on pass; a full set levels a part type for the run. | ✅ |
| **Lane change** | Pressing a flipper button **shifts which lane is lit** ("many games shift the illuminated insert from one lane to another by triggering the left and right flipper buttons"; a common, legitimate tactic). It gives the flippers a second job and lets a skilled player steer a shot. | ✅ built on every Lane Rollover group (no dial: with no cost it would always be on). Left shifts left, right shifts right, wrapping round; a shift keeps the same number lit, so it never completes a set |
| Rank ring | A ring of lights filled by missions; full = tier up. | 💡 M |
| Combo lights | Chain shots within N seconds for rising points. | 💡 S |
| Arrow hints | Light the next target. | 💡 S |
| Insert show | Lamp animations on big events. | M3 |

### 2.2 Targets
| Part | Idea | Status / effort |
|---|---|---|
| Drop-target bank | Targets fall when hit; all down pays and resets. Real machines also have in-line banks and designs that drop a second target when one is hit. | ✅ |
| Standup target | Stays up when struck (the spot target). | ▶ S |
| **Vari-target** | Scores more for a harder hit. | ✅ four tiers by impact speed (the speed just before the contact, since the bounce has already slowed the ball afterwards), with a Stiffness dial |
| **Bash target** | Built to be hit hard; bounces the ball back. Scores by speed. | 💡 S |
| **Captive ball** | A ball trapped on the table with limited movement; hit it to score. | 💡 M |
| **Alternating / property-changing target** | A target that switches between two values or colours; hit it at the right moment for the high value. Patents describe targets that present alternatives to keep the player interested. | 💡 M |
| **Moving target** | A target that slides on a track so timing matters (a moving-target patent exists). | 💡 M (kinematic body) |
| Seesaw target | Hitting one end raises the other. | 💡 M |
| Spinner | Scores per turn. | ✅ |

### 2.3 Kickers, holders and ball control
| Part | Idea | Status / effort |
|---|---|---|
| Pop bumper, slingshot | | ✅ |
| Saucer / scoop / kickout | Catch, score, return. | ✅ (Ball Printer) |
| **Kickback** | A launcher in an outlane that sends the ball back into play (once, then it must be re-armed by a shot). | ✅ built as a one-shot sensor launcher: armed every ball, fires along its aim at its Power dial, pays 150. Our table has no outlanes (the rails run straight into the flippers), so it works as a side-lane rescue or a booster wherever you aim it |
| **Ball saver** | Returns a drained ball for a limited time. | ✅ built as a part: 8 s after each launch, one drain per Ball Saver on the board returns the ball to the plunger. Still to come: the "Ball Saver" board upgrade can simply grant one into the inventory, and an assist can lengthen the window |
| **Magic post** | A post that rises between the flippers to block the centre drain. | ▶ S-M |
| **Magna-save** | A magnet that pulls an outlane-bound ball back to the inlane when you press a button. | 💡 M |
| **Magnet** | A pulsed field that holds or bends the ball (Dragon's Keep activates magnets with armour and spells). | ▶ M (timed, never held forever, so it cannot stall) |
| **Popper / up-kicker** | Fires the ball upward onto a raised playfield. | 💡 L (needs layers) |
| One-way gate, diverter | Controls flow; diverters switch between paths. | ▶ S-M |
| Gobble hole | A hole that ends the ball: a risky high-value shot. | 💡 S |
| Lock / virtual lock → multiball | Catch balls and release them together; "add-a-ball". | ✅ Ball Printer (add-a-ball); 💡 lock M |
| Mystery award | A random award from a hole. | 💡 S |

### 2.4 Moving and changing parts (the "creative" ones)
| Part | Idea | Status / effort |
|---|---|---|
| **Roving bumper** | A bumper sliding back and forth on a rail; scores more when you hit it while it is moving toward you. | 💡 M |
| **Spinning disc / windmill** | A kinematic rotating bar that scatters balls (also the pachinko classic). | 💡 M |
| **Swinging gate** | Opens and closes on a timer; a shot you have to time. | 💡 M |
| **Teleporter pair** | Ball enters A and leaves B after a short delay, with a random throw. | 💡 S-M |
| **Fan / wind zone, conveyor** | A zone that pushes the ball. | 💡 S-M (sensor + force) |
| **Phase part** | Alternates between solid and ghost every second. | 💡 S |
| **Swapping playfield sections** | A patent describes a playfield section that swaps its components mid-game, often by rotating to expose parts stored under the surface. | 💡 L: a "rotating tile" that changes which parts are live each round or each ball |
| **Upper / lower playfield** | Black Hole (Gottlieb, 1981) had an upper and a lower playfield, the lower one upside down with its own flippers. Haunted House (1982) is credited as the first with **three playfields** (attic, main floor, cellar), eight flippers, four pop bumpers, two kickouts, a secret passage and a trap door. | 💡 L: a second small board with its own flippers |
| Ramp, orbit, habitrail, subway | Raised and wireform paths; subways carry the ball under the playfield. | ▶ L (needs ball layers: collision filters per layer) |

### 2.5 Set pieces ("toys")
Real machines are remembered for these. A Pinball Party Podcast ranking put **Medieval Madness's castle** first (cannonball shot, drop gate, moat, shake effects), then Metallica's Sparky, Funhouse's Rudy (eyes that follow you, a jaw that snores), and **The Addams Family's Thing** (a hand that comes out of its box and snatches the ball). It also notes that Attack from Mars' simple gyrating saucer works because of the lights, sound and strobes around it. Stranger Things has a Demogorgon bash toy with a mouth shot. **(Rankings are opinion; the page I read is a podcast summary.)**

| Part | Idea | Effort |
|---|---|---|
| **The Hand** | Reaches out, grabs a ball, holds it, then throws it to a random spot. Legendary rarity. | M |
| **The Castle** | A big bash target: N hits open a drop gate behind it for a jackpot shot. | M |
| **The Head** | A face whose eyes track the ball; shooting the mouth pays. Mostly presentation plus a hole. | M |
| **The Saucer** | A gyrating target that scores per hit and flashes the whole table. | S + presentation |

### 2.6 Rules and modes (rule cards, missions)
Glossary terms we have not used yet: **skill shot** (bonus for a precise plunge), **combo**, **jackpot** (a high value from a multiball shot), **mode** (timed goals), **wizard mode** (the final mode after a long run of tasks), **hurry-up** (a bonus that drops quickly), **extra ball**, **special**, **replay**, **match**, **bonus multiplier**, **ball saver**. These are the rule cards and mission types in the plan.

### 2.7 Exotic machines for whole stages or cabinets
From the museum and the Atlas Obscura pinball listings (via search):
- **Bat games** (All American Quarterback 1949, Hi-Fly 1956, Target Gallery 1962) and **cocktail tables** (Star Trip 1979). A pre-flipper or tabletop feel.
- **Banana flippers** (Disco Fever, 1978): curved flipper shapes.
- **The first talking pinball** (Gorgar, 1979), the origin of the announcer.
- **Redemption games** (Bell Ringer, Dinosaur Eggs, Ticket Tac Toe) that pay tickets: money as a literal ticket stream.
- **Baby Pac-Man** (1982): a video game inside a pinball cabinet, a backbox mini-game.
- At the Museum of Pinball in Banning, California: **Hercules**, a huge machine that uses cue balls, and **Joust**, a head-to-head two-player machine; the oldest game there is from the 1840s and has literal pins (the ancestor of the peg field).
- Flippers themselves are young: the first mechanical flippers are credited to Gottlieb's **Humpty Dumpty (1947)**, and in 1948 Steve Kordek's **Triple Action** moved them to the bottom, which let skilled players send the ball back up.

## 3. What our engine can do cheaply

| Mechanism in the sim | Good for |
|---|---|
| Static solid bodies, rotated | bumpers, kickers, targets, posts, walls |
| **Sensors** (no collision, begin/end events) | rollovers, lamps, spinners, saucers, **force fields (magnet, fan, wormhole)**, zones |
| **Kinematic bodies** moved each tick | roving bumpers, discs, gates, moving targets, toys |
| **Revolute / prismatic joints with motors** | flippers (built), swinging gates, hinged flaps, castles |
| **Collision filters** (category and mask) | **layers**: ramps and upper playfields, ghost/phase parts |
| Destroying and recreating shapes | drop targets (built), pop-up posts, rotating tiles |
| Applying velocity on events | kickers, kickbacks, magnets, throws (built) |

## 4. A priority order (value for the machine ÷ effort)

1. **Lane change ✅** (flippers rotate the lit lane) and **vari-targets ✅**: tiny, very pinball, give skill a role in the build.
2. **Kickback ✅, ball saver ✅, magic post**: board-improvement parts that also work as major upgrades.
3. **Standup and bash targets, captive ball**: cheap variety.
4. **Magnet (timed)** and **teleporter pair**: they change the ball's path the way the best real parts do.
5. **Roving bumper, spinning disc, swinging gate**: moving parts (kinematic).
6. **Fuse Lane, rank ring, wear**: progress that you can see decay and refill.
7. **Layers: ramps and orbits**, then the **upper playfield**: the biggest feel jump, and the biggest build.
8. **Toys**: the Hand, the Castle, the Head as legendary parts, once presentation can carry them.

## 5. Sources

- Wikipedia: [Glossary of pinball terms](https://en.wikipedia.org/wiki/Glossary_of_pinball_terms) · [Full Tilt! Pinball](https://en.wikipedia.org/wiki/Full_Tilt!_Pinball) · [Haunted House (pinball)](https://en.wikipedia.org/wiki/Haunted_House_(pinball))
- Space Cadet bumper upgrades: [How to upgrade bumpers in 3D Pinball](http://helpaoi.blogspot.com/2011/05/how-to-upgrade-bumpers-in-3d-pinball.html) · [StrategyWiki: Captain and Lieutenant Commander](https://strategywiki.org/wiki/3D_Pinball_for_Windows:_Space_Cadet/Captain_and_Lieutenant_Commander) (search result; the page itself returned an error when fetched)
- [Dutch Pinball Museum collection](https://dutchpinballmuseum.com/gb/museum/collection/) · Atlas Obscura: [Museum of Pinball, Banning](https://assets.atlasobscura.com/places/the-museum-of-pinball-banning-california), [Seattle Pinball Museum](https://atlasobscura.com/places/seattle-pinball-museum), [Pacific Pinball Museum](https://atlasobscura.com/places/pacific-pinball-museum) (the category page itself blocked a direct fetch, so these come from search results)
- [IPSND manufacturer listing](https://www.ipsnd.net/manufacturer.aspx?id=239) (6,714 games catalogued)
- Toys ranking: [Pinball Party Podcast ep. 39](https://www.kineticist.com/promoters/pinball-party-podcast/ep-39-one-shot-in-the-mouth) · Addams Family Thing: [Museum of Play](https://www.museumofplay.org/blog/the-addams-family-and-pinball-in-the-age-of-video-games/)
- Lane change: [Pinball Mastery tips](https://pinballmastery.beehiiv.com/p/pinball-mastery-20-tiny-tips-74db) · [Rollergames guide](https://pinballnirvana.com/forums/resources/rollergames-williams-1990-vp8.3313)
- History of flippers: [Flippers.be](https://www.flippers.be/basics/101_flipper_evolution.html) · [Liberty Games guide to the playfield](https://www.libertygames.co.uk/blog/the-pinball-playfield/)
- Patents (found by search, abstracts not opened): [playfield changed during play, US5112049](https://patents.google.com/patent/US5112049) · [property-changing target, US5449172](https://patents.google.com/patent/US5449172) · [moving target, US4773646](https://patents.google.com/patent/US4773646) · [interactive playfield, US5333866](https://patents.google.com/patent/US5333866) · [in-line drop targets, US4257604](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4257604)
