# Art direction: Toybox Diorama (draft v0.1)

What the five style references have in common, how that becomes a look for a pinball game, how one kit can produce many themed machines, and what particles should look like. The concept sheets in [concept/](concept/) are **generated from the game's own table geometry and part data** (`npm run concept`, source in `tools/concept/`), so they are a working prototype of the pipeline, not paintings we have to match by hand.

| | |
|---|---|
| ![](concept/before-neon.png) | ![](concept/screen-factory.png) |
| Today: neon placeholder | Concept: *Funhouse Factory* theme, same table, same build |

## 1. What connects the references

The five images: a juice-box café cut open, a castle on a cliff, a pencil sharpener that is a bookshop, a Game Boy that is a café, and an isometric "life production" factory.

1. **A world inside an object.** Every one of them is a thing (a carton, a sharpener, a Game Boy, a machine) with a small inhabited world inside or on it. The object's silhouette frames the scene, and the scene is the reward for looking closer. **A pinball machine already is this**: a cabinet with a world on its playfield and another one in its backglass. This is the strongest link and the reason the style suits us.
2. **A three-quarter view with no perspective.** Isometric or oblique, viewed from above at an angle, parallel lines stay parallel. You can see tops *and* fronts, so things read as solid toys, yet nothing gets smaller with distance, so the whole scene stays legible at once (our "fixed view of the whole table" rule).
3. **Chunky, coloured outlines.** A thick contour round each object and thinner lines inside it. The line is a dark hue *from the palette* (brown on the juice box, plum on the sharpener, navy on the factory), never pure black. This is what makes everything look like a sticker or a toy, and it keeps busy scenes readable.
4. **Flat cel shading with one light.** Two or three flat tones per material (base, shade, highlight), light from the upper left, hard edges, almost no gradients. The castle adds one painterly trick worth stealing: **warm light, cool shadows** (blue-grey shade under orange roofs).
5. **A small, warm palette on a quiet background.** Five to eight colours, one plain warm-neutral or single-colour background (beige, butter yellow, periwinkle), and a single hot accent (the red-and-white awning, the pink sharpener body).
6. **Rounded, bevelled, toy-like shapes.** Soft corners, slightly chunky proportions, simple primitives (cylinders, boxes, cones). It reads as "handmade miniature" rather than "technical drawing".
7. **Density of tiny, funny detail.** Little characters doing things, signs, plants, labels, steam. Detail is concentrated in clusters with calm areas between them, so the eye has places to rest.
8. **Machines with whimsy (the factory).** Conveyor belts, pipes, gauges and tanks connected into one absurd production line. This is our premise almost word for word: *a machine that shouldn't exist*.

## 2. The direction in rules

Call it **Toybox Diorama**: the machine is a handmade toy world on a cabinet, drawn as stickers.

1. **Every object is a sticker.** Thick outer contour (2× the inner line) in the theme's ink colour, thin inner lines, flat fills. Implemented as a two-pass draw (`Prop` in `tools/concept/draw.ts`): the silhouette in ink with a fat stroke, then the coloured faces on top.
2. **Three tones per material, derived, not picked.** A theme picks base colours only; shade = base pushed 34% towards the theme's *shadow hue*, mid = 16%, light = 50% towards white (`mat()` in `themes.ts`). The shadow hue can be cool against a warm palette (castle). This is what lets one person make many themes.
3. **Light from the upper left, always.** Right-facing faces take the shade tone, left-facing faces the light tone, and drop shadows fall down and to the right in the shadow hue at about 20% opacity.
4. **Glow lives only in lamps and inserts.** Lit things (lane inserts, the Lamp's pool, backglass bulbs) are the one place for soft radial light. Everything else is flat. That way "lit" always means something in the rules.
5. **Shape carries identity, colour comes second.** Each part keeps one silhouette in every theme; the theme only changes colours and one motif. A Pop Bumper is always a round cap on a skirt; it can wear an awning, a turret roof or rivets. This is also our colour-blind-safety plan.
6. **A few parts are characters.** Big Boi and the Ball Printer have faces; most parts are furniture. The faces react (Big Boi goes "oof" when hit). Goofy, but rationed so the table doesn't become noise.
7. **Detail goes round the edges, calm stays in the middle.** Busy art sits on the rim, the apron, the backglass and the surroundings (tanks, condiment bottles, pine trees). The ball's lanes stay quiet so the ball is always the most readable thing on screen.
8. **The UI is paper.** Cards are cream paper with ink borders and a hard offset shadow, numbers are set in a chunky rounded face ([Fredoka](https://fonts.google.com/specimen/Fredoka), OFL), and the DMD stays a real dot-matrix. Money, Mult and balls are stickers that effects can fly into.

## 3. Bringing it to the playfield

**Projection.** The sim stays top-down and 2D. The renderer uses an oblique projection over the sim's own coordinates: `screen = (x + y·shx, −(y·k + z·kz))`. In the game `k ≈ 0.9` (the floor is barely squashed), `kz ≈ 0.55` (heights drawn straight up) and no shear; the key art uses `k = 0.42`, shear `0.2`. The rules:

- **The footprint on the floor is the collision shape.** Height only grows upwards, so a part's base outline is exactly where the ball bounces. Drop shadows and ground rings sit on the footprint, which helps the eye find it.
- **Keep heights low.** Parts stand 0.5 to 2 ball diameters tall. A ball passing behind a tall part is drawn on top of it anyway (or as an x-ray outline) so it is never hidden.
- **Draw far things first** (sort by sim y); walls are continuous stacked strokes.

**Layers of a machine (each one themed):** cabinet rim and side art · playfield floor art · inserts (the only glowing things) · walls and rails · parts · balls and trails · particles · live-value tags and score stickers · backbox (marquee with the DMD) · surroundings (the diorama base the cabinet stands in).

**Readability budget:** the ball is the brightest, highest-contrast object (near-white with an ink outline everywhere); parts are mid-value; the floor is the lowest contrast; effects may cover the floor but not the ball.

## 4. One kit, many machines

![](concept/parts-sheet.png)

A theme is a data row (`tools/concept/themes.ts`), the same idea as the parts catalogue:

| Token | What it does | Factory / Diner / Castle |
|---|---|---|
| `bg`, `paper`, `ink`, `shadeTint` | page, cards, outline colour, the hue shadows lean to | butter + plum / beige + brown / sand + cool blue |
| `floor`, `floor2`, `floorArt` | playfield paint and its pattern | riveted plates and a painted gear / checker tiles, a giant plate, awning stripes / meadow and a cobbled path |
| `rail`, `rim`, `metal`, `rubber` | walls, cabinet wood, posts, rubber | |
| `role.*` | one colour per part type, all distinguishable in that theme | |
| `popMotif` | the Pop Bumper's hat (and the Ball Printer's roof) | rivets / awning / turret cone |
| `debris` | the theme's confetti | bolts and gears / peas and sprinkles / leaves and stone chips |
| `surround` | the diorama the table stands in | tanks and pipes / condiment bottles / pine trees |
| backglass | title, tagline banner, the mascot (Big Boi in the theme's skin) | |

![](concept/key-art-lineup.png)

**Cost of a new machine** once the kit is in the game: about 25 colour tokens, one motif, one floor pattern, one debris shape, a surround set and a backglass. No new part drawings. A theme can also carry rules (the Diner could be the "Tax Man" boss table), but that is a design question for later.

**Checks per theme (automate them):** every `role` colour must differ from its neighbours and from `floor` by a minimum contrast; ink against paper must pass WCAG AA for text; the ball must be the highest-contrast object against `floor`.

## 5. Particles

![](concept/particles.png)

The references have almost no "effects" in the usual sense (glows, sparks, additive blur), so ours follow the same rules as the props: **particles are stickers.**

1. **Solid shapes, ink outline, theme palette.** No additive blending, no soft dots. Shapes come from the theme (bolts, peas, leaves) so effects say which machine you are in.
2. **They pop in, hold, and shrink out.** Scale `0.45 → 1.18 → 1.0 → 0.68 → 0` over the particle's life (overshoot then settle). They do not fade: fading flat shapes looks like a bug. Only *air* (smoke, glow, motion trails) is soft and outline-free, like the castle's ribbon smoke.
3. **Animate shape on a 12 fps step, move at full frame rate.** Positions update every frame so motion is smooth; the shape (frame of the impact star, the coin's flip, a sparkle's twinkle) advances on a 1/12 s step, which reads as hand-drawn ("on twos").
4. **Every effect points at its cause and its consequence.** The impact star sits on the contact point, the ground ring under the part that was hit, and a coin *flies to the MONEY sticker* and lands with a +$1 tick; a Mult stamp flies to MULT. This is the "juice that reveals the causal chain" pillar from the plan.
5. **Size by value, count by rarity.** Small hits make small, few particles; a set bonus or a Mult change gets the big stamp. Cap live particles at about 150 and stickers at 16 (as today).

| Effect | Trigger | Life | Notes |
|---|---|---|---|
| Impact star | every bumper / sling hit | 0.18 s, 3 frames | part colour with a paper core |
| Debris | every scoring hit, 3–8 pieces | 0.5–0.8 s | ballistic, spins, bounces once on the floor |
| Puff | landing, a drop target falling, an eject | 0.35 s | paper with a shade crescent |
| Coin | each $ earned | ~0.6 s flight | flip = squash x; flies to MONEY |
| Score sticker | every scoring event | ~0.9 s | the existing popup, now a paper sticker with the math line |
| Mult stamp | Mult rises | ~1 s | starburst in the source part's colour, flies to MULT |
| Ground ring | under every hit part | 0.25 s | in the floor plane, never covers the ball |
| Smoke ribbon | Ball Printer, kickouts, tilt | 0.6–1 s | tapered ribbon, no outline |
| Sparkle | lit inserts, level-ups, idle glints | twinkles | 4-point star, paper or gold |
| Ball trail | fast balls | per frame | tapered paper ribbon at 75% |

**Ambient motion (cheap, reads as "alive"):** factory conveyor arrows crawl, diner steam curls off the toaster, castle flags flutter, backglass bulbs chase. Each is a looping 2–4 frame swap.

**Accessibility:** Calm mode drops the 12 fps twinkles, the screen shake and the bulb chase, and halves the particle counts; the stickers that carry information (score, coin, Mult) stay.

## 6. How to build it in the game (PixiJS v8)

1. **Theme kit module** (`src/render/theme.ts`): move the tokens and `mat()` from `tools/concept/themes.ts` into `src`. Replace the colours hard-coded in `renderer.ts` with role colours from the theme.
2. **Prop drawing → textures.** Port the prop drawers (`props.ts`) from SVG strings to Pixi `Graphics` calls (nearly one to one: `poly`, `circle`, `fill`, `stroke`). Draw each part type × state × theme **once** into a texture (`renderer.generateTexture`) and show sprites; redraw only when a theme or a part's state changes. Today the renderer rebuilds every shape every frame.
3. **Projection in one place.** Add `P(x, y, z)` to the renderer and use it everywhere; pointer picking inverts it on the floor plane (`z = 0`), so placing and dragging parts keeps working.
4. **Floor art and the surround as static layers**, rendered once per layout to a texture.
5. **Particles:** bake each particle shape per theme into a small atlas, run them in a `ParticleContainer`, and apply the scale curve and the 12 fps frame step in the update. Stickers stay `Container`s with text.
6. **Fonts:** bundle Fredoka (OFL) locally; keep the DMD in a mono face behind a dot mask.
7. **Content:** the hero theme first (Factory), then Diner and Castle as the proof that a theme is only data.

Suggested order: theme tokens and colours (a day), projection and rails (a day or two), prop textures for the 12 parts (several days), particles (a few days), HUD reskin (a few days). It fits M3 ("art direction") in the roadmap, but the token step is cheap enough to do earlier.

## 7. Open questions

| # | Question | My default |
|---|---|---|
| 1 | Which theme is the default machine? | Funhouse Factory: it *is* the premise (a machine that shouldn't exist) |
| 2 | Should themes change rules, or only looks? | Looks only at first; tie themes to bosses or stages later |
| 3 | How much tilt in the game view (`k`)? | 0.9: enough to see the sides of parts; check that aiming still feels exact |
| 4 | A dark theme for night play? | Yes, later: "Night Shift" with the same tokens, which would also suit the Night Shift boss |
| 5 | Hand-painted art from an artist later? | The kit sets the rules an artist would follow; hero art (backglass, key art) is where a human illustrator adds the most |

## Sources

- Cutaway and breakaway illustration: [Wikipedia, Cutaway drawing](https://en.wikipedia.org/wiki/Cutaway_drawing)
- Isometric construction from simple primitives, clean regular curves: [IBM Design Language, isometric style](https://www.ibm.com/design/language/illustration/isometric-style/design)
- Oblique and axonometric projection in 2D games: [Wikipedia, 2.5D](https://en.wikipedia.org/wiki/2.5D), [Wikipedia, Oblique projection](https://en.wikipedia.org/wiki/Oblique_projection), [A Layman's Guide to Projection in Videogames](https://www.significant-bits.com/a-laymans-guide-to-projection-in-videogames/)
- Coloured outlines instead of black, selective outlining: [Lospec, pixel art outlines part 2: using colour](https://lospec.com/articles/pixel-art-outlines-part-2-using-color), [Graphixly, creating coloured line art](https://graphixly.com/blogs/news/creating-colored-line-art)
- Hand-drawn effects without glow or CG particles: [PlatinumGames blog on Bayonetta Origins' VFX](https://www.platinumgames.com/official-blog/article/12867)
- Pinball artwork anatomy (playfield, inserts, apron, backglass, cabinet art): [Wikipedia, Glossary of pinball terms](https://en.wikipedia.org/wiki/Glossary_of_pinball_terms), [PinWiki glossary](https://pinwiki.com/wiki/index.php/Glossary)
