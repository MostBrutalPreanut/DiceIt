# Art implementation plan (Toybox Diorama)

Status: **design approved, not implemented.** This is the build plan for the look in [art-direction.md](art-direction.md) (v0.3). The concept sheets in [concept/](concept/) are the target, and `tools/concept/` is working reference code: the projection, the prop drawers, the theme kits, the UI widgets and the particle shapes are already written there, against the real table and part data.

## Ground rules

- **The sim never changes for art.** Everything here is presentation: it reads the sim and the event stream and never writes back (as `src/render/renderer.ts` does today). The machine tilt and the nudge shove are visual only.
- **Themes are data and a player choice.** No default machine; the player picks a theme, and a theme changes looks only.
- **One source per fact.** Part recipes keep driving the scorer, the descriptions, the tooltips and the labels on the board. Theme tokens drive every colour. Nothing in `src/render` hard-codes a colour.
- **Port, don't redesign.** Each step below has a concept file to port from; matching the concept sheets is the acceptance test.

## Phases

Each phase ends with the game still playable and the tests green.

### A. Theme kit in `src` (about a day)
- Move `tools/concept/themes.ts` into `src/render/theme.ts`: the three theme rows, `mat()`, `mix()`, `legible()`, `roleClashes()`.
- Replace the hard-coded colours in `renderer.ts`, `style.css` and `src/ui/html.ts` with theme tokens (CSS custom properties for the HTML side).
- A **theme picker** in the options (and later in the run setup), saved in `localStorage`.
- **Done when:** switching theme recolours the table and the panels live; a vitest test runs `roleClashes()` on every theme and fails on a clash.

### B. Projection, machine tilt, rails (1–2 days)
- One projection function `P(x, y, z)` in the renderer (`tools/concept/draw.ts` has it) and its inverse on the floor plane for pointer picking, so placing and dragging keep working.
- Animate `k` from 1.0 in the workshop to 0.86 in play over ~0.4 s, and back.
- **Nudge** as a damped spring on the machine container's offset and lean; **tilt warning** rattle; **TILT** tips to `k` 0.8, turns all lamps and inserts off and dims the field.
- Walls as continuous stacked-stroke rails (`rails()` in `scenes.ts`).
- **Done when:** the four states of the tilt sheet can be seen in the game, and placing a part lands exactly where the pointer is in both the flat and the tipped state.

### C. Props as cached textures (several days)
- Port the prop drawers (`props.ts`, the `Prop` class in `draw.ts`) from SVG strings to Pixi `Graphics` (the calls map nearly one to one).
- Bake each part × state (idle, lit, hit, down) × theme once with `renderer.generateTexture` and show sprites; rotatable parts are baked in 5° buckets on first use, or drawn live if cheap. Today the renderer clears and redraws everything every frame.
- Live-value tags, level pips, the Lane Rollover letters (the theme's `laneWord`) and the Level Light dome tinted by its target.
- Use Pixi's real bounds (`getLocalBounds`) for the fit-and-centre rule of `fitIcon()`.
- **Done when:** every part matches the parts sheet in all three themes, and a full table with multiball holds 60 fps on a mid laptop.

### D. Floor art, surroundings, backdrop, apron (1–2 days)
- Floor patterns (plates and gear, checker and plate, meadow and path), inserts, the apron with its decal slots, and the surround props (tanks with the piped valve, condiment bottles, pine trees), rendered once per layout into a texture.
- The drifting backdrop as a `TilingSprite` scrolled by phase (squiggles, waves, curls), 10–12 s loop, frozen in Calm mode and on TILT.
- **Done when:** the three screen mock-ups match with the HUD hidden.

### E. Particles (a few days)
- Bake the particle shapes per theme into one atlas (impact star frames, debris, puff, coin flip frames, sparkle, stamp) and run them in a `ParticleContainer`.
- The scale curve `0.45 → 1.18 → 1.0 → 0.68 → 0`, shape frames on a 1/12 s step, positions every frame; no fading except air (smoke, trails, glow).
- **Causal targets:** coins fly to the money stack, Mult stamps to the Mult dial. The panel positions come from the DOM (see F), mapped into canvas space.
- Budgets: ~150 live particles, 16 stickers; Calm mode halves counts and drops shake, twinkles and bulb chases.
- **Done when:** the particle sheet's timings are visible in play and the budget holds in a busy multiball.

### F. HUD reskin and tooltips (a few days)
- Keep the panels in **HTML/CSS** (crisp text, easy layout) with a transparent Pixi overlay above them for effects that fly between the table and the panels.
- Build from `tools/concept/ui.ts`: housings with marquee headers, the round strip, odometer drums, the goal tube with its badge, the Mult dial, the ball tray, the receipt ledger, the Cash Out button, the money row, offer cards with Buy buttons, and the toolbox. The small 3D bits (buttons, parts on plinths, toolbox items) are the baked prop textures from C, shown as images.
- **Tooltips** with the fixed anatomy (header, the next-hit number, math chips including cross-part effects, recipe, this ball, the dial, controls), generated from recipe data; the dotted link to a boosting part is drawn on the table.
- **Fonts:** bundle Luckiest Guy, Nunito and DotGothic16 locally (all SIL OFL); apply the "bold and 19 px or more uses the display face" rule in CSS classes.
- Polish rules from art-direction §7 as CSS: the 30 px grid, three line weights, fixed-width numbers, only stuck-on things tilted.
- **Done when:** the screen mock-ups match with live data, and every scoring number on screen can be explained by its tooltip.

### G. Relic decals (needs the major-upgrade flow from M1.5)
- Decal data rows (name, shape, rarity, rule), four apron slots, the Rules column of a major upgrade (pick one of three), peel to remove between rounds, decal tooltips.
- The six on the relic sheet are placeholders; real decals come with the rebalance.
- **Done when:** a run can earn, stick, read and peel decals, and the rules apply in the scorer.

### H. Tooling and tests (alongside the phases)
- `roleClashes()` as a unit test (A).
- A **prop lab** dev page: every part in every theme and state with a footprint overlay (the parts sheet, live).
- **Visual snapshots** in the browser smoke test (`tools/smoke.cjs`) for the workshop and a frozen play frame per theme.
- Keep `npm run concept` working as the design reference until the game matches it; retire it afterwards or keep it for key art.

### Later: bigger and more parts
When ramps, upper playfields and big toys arrive, follow art-direction §11: prop specs as data built from primitives, size classes (S, M, L, XL) with theme-specific hero art only for L, cutaway on demand when a ball is behind a tall part, and render layers per playfield level.

## Order and fit with the roadmap

A → B → C → D → E → F, with H alongside and G after the major-upgrade flow exists. A is cheap and can land any time (even before M1.5); B to F are the "art direction" part of **M3**; G belongs to the M1.5/M2 major-upgrade work.

## Risks

| Risk | Mitigation |
|---|---|
| Baked textures use too much memory with many themes and states | Bake lazily per theme in use; drop other themes' textures on switch |
| The tipped view makes aiming feel off | Build in the flat view; tip only while the ball is live; tune `k` in playtests (0.86 is a starting value) |
| Effects flying between canvas and HTML panels drift out of place | One mapping function from DOM rects to canvas space, recomputed on resize; a smoke-test check |
| Text in Luckiest Guy gets used for sentences | The CSS class rule (display only for bold text of 19 px and up) and a review checklist |
| A new theme's colours clash | `roleClashes()` in the tests blocks it |
