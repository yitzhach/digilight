# Light tools — handoff

Written 11-17 after an audit of DigiLight against other relighting tools (D-062). It lists the
tools that audit found missing, says how every one of them is built so that it can be taken out
again, and gives a build spec for each. Built: T6, T8, T3a, T3b, T4, T2 (11-17); the rest wait on
Isaac (photos, or his word).

**How to use it.** From 11-17 Isaac runs every tool on **Opus 5.5** (his call; the effort for
each is in section 3). One tool at a time, in section 3's order. A chat may go on to the next
tool once the last one's tests and parity pass and it is merged; it stops when a tool waits on
Isaac (photos, an answer) or when he says so. Read CLAUDE.md, STATUS.md, BUILD.md §1 to §4 and
§5.12, then sections 1 to 3 here and the tool. BUILD.md's rules (§3) all still apply.

Prompt for a new chat (Opus 5.5, high effort; repository `yitzhach/digilight` only):

```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4 and 5.12, then
docs/light-tools.md sections 1 to 3. Build the next light tool that is "to build" in section 3's
order and does not wait on me (next: T2 the wall, its first chat: the reference), exactly as its
spec in section 5 and the rules in section 2 say; nothing beyond it. For each tool: write its
maths into BUILD.md 5.12 first, then the reference, tests, the shader, parity; run pnpm
typecheck, pnpm test, pnpm e2e and the size check; update section 3, DECISIONS.md, CHANGELOG.md
and STATUS.md; open a pull request, merge it when CI is green, and send me before and after
pictures of it on the door and the painting. Then go on. Make the calls you can yourself and log
them; collect what only I can answer in section 6 and stop when nothing is left that does not
wait on me. My notes on the tools built: [each: keep / tune: ... / remove, or "not yet"].
Answers to section 6: [... / "not yet"]. Keep replies brief.
```

---

## 1. Why these tools

The audit rendered every look on the fixtures and compared the product with Photoshop Relight,
DaVinci Resolve Relight, Luminar Light Depth, Beeble, RTI viewers and the research they rest on.
Three things it found:

- **Without Texture the looks read as a tint and a vignette.** On `painting.jpg`, Gallery,
  Spotlight, Soft window and Dramatic are nearly one picture (D-047 says the same in Isaac's
  words). The light has nothing to fall across and no shape of its own. T2 and T3 answer this.
- **True Relief is the strong part**, and what it lacks is material: where the surface is shiny
  (T1), and light that bounces inside the relief (T6).
- **The engine's promise is the edge.** Tools that regenerate the picture (IC-Light, LightLab)
  break promise 1. Nothing here may. A model may compute geometry or a light multiplier, never
  a pixel (how Google's Portrait Light works: a low-resolution multiplier applied to the photo).

Isaac's calls (11-17): build them as expert settings; make each easy to remove if it does not
earn its place; start with T6 and T8.

## 2. What a tool is (the rules)

A tool is a trial. It must be possible to delete it in one commit and leave no trace in any
picture, document or test that does not use it.

1. **Expert tier only**, in `core/src/fields.ts`, in the group whose panel section should show
   it. The panel builds itself from the schema (§8), so a tool has **no interface code**. Two
   exceptions, at Isaac's request (D-068): a number field may carry `track` (a colour strip under
   its slider, drawn by the generic Slider), and a tool may have its own on-picture handles in
   one marked file in `web/src/canvas/` (T3b's `PatternBox.tsx`).
2. **Off by default, exactly.** At its default a tool changes no byte: every existing golden
   and parity document passes untouched. If a golden moves, the tool is wrong.
3. **Its maths is in BUILD.md §5.12**, one subsection per tool, normative like the rest of §5.
   Write it there first, then the reference, then the shader (§3: one lighting model).
4. **One file per package.** `core/src/tools/<id>.ts` holds the tool's maths. Where the
   renderer must call it (`light.ts`, `tone.ts`, `render.ts`, the shader, `preview.ts`), the
   call is a **hook**: a few lines, each marked with the comment `tool:<id>`, guarded so that
   the default costs nothing. `grep -rn "tool:<id>" packages e2e` must find every hook. (T6's
   two tools, `bounce` and `roomside`, share one file; each has its own marks.)
5. **Listed in `core/src/tools/index.ts`** (`TOOLS`): its id, label, setting paths, and `off`,
   the values at which it does nothing. `core/test/tools.test.ts` checks every listed tool: its
   settings exist, are expert, default to `off`, and its hooks are marked.
6. **Its own tests** in `core/test/tool-<id>.test.ts`: off changes nothing (bytes); each
   setting moves the picture the way its label says; one golden hash with it on
   (`expectGolden('<id>', picture)` from `core/test/tool-golden.ts`; the hashes are in
   `tool-goldens.json`, apart from `goldens.json`; `UPDATE_GOLDENS=1` writes one). And a block
   in `e2e/tools.spec.ts`, marked `tool:<id>`: parity documents with it on (§5.11).
7. **A row in section 3** and an entry in `DECISIONS.md` and `CHANGELOG.md`.

**To remove a tool:** delete its files and every line or block `grep -rn "tool:<id>" packages
e2e` finds, then run `pnpm typecheck`, which names whatever still leans on it (an import, a
signal read); delete its fields and its line in `TOOLS`, and add the fields' paths to `RETIRED` in
`core/src/tools/index.ts` (`parseDoc` drops retired settings from whatever it reads, so
documents, presets and projects that still carry them open as before); delete its test file,
its key in `tool-goldens.json` and its block in `e2e/tools.spec.ts`; replace its §5.12
subsection by one line saying it was removed and why; mark it removed in section 3; log the
decision. Nothing else changes, and no older golden moves.

**What building the first two taught** (read before writing a tool):

- Keep the arithmetic of the off path exactly as it was, in its order. A golden that moves
  means the tool leaks when off.
- A new setting in a group breaks any test that compares the whole group with `toEqual`. Two
  were loosened to `toMatchObject` (`core/test/schema.test.ts`, `e2e/finish.spec.ts`); do the
  same, never delete the check.
- A new field on a light breaks `looks.ts` `withLook` and `lookOf` (they build and compare a
  light field by field). The look tests fail at once: T3a's spec has the fix.
- In the shader's lamp loop the names `a`, `b`, `s`, `c`, `col`, `l`, `e`, `w`, `f` are taken.
- A tool file may be imported by `light.ts`, `tone.ts` or `render.ts`: it must not call
  anything from them while it loads (constants only), or the import order breaks.
- Maps that both renderers read are made by `core` on the CPU and handed to the preview as
  textures (Glow does this): parity is then exact and the tool stays one file to delete.
- Try the idea on the fixtures before the shader. Glow's first rule (only light over white
  glows) was right in physics and did nothing on real looks; ten minutes of renders showed it.

**A tool that Isaac keeps** stays as it is. Making one simple-tier, or letting a look use one,
is a separate decision of his (looks change only with him, §6).

**Promise 1** (§1) now reads: the lighting never repaints, and never blurs or sharpens *the
art's own pixels*. A tool may add light (as sheen does), including soft light (T8). It may
never replace, move or filter the photo's pixels.

## 3. The tools

| id | tool | state | model | waits on Isaac |
|---|---|---|---|---|
| T6 | Softer shadows: bounce light, room light from one side | **built 11-17** (D-063) | done | his judgement: keep, tune or remove |
| T8 | Glow | **built 11-17** (D-064) | done | his judgement |
| T3a | Colour filter on a light | **built 11-17** (D-066) | done | his judgement: keep, tune or remove |
| T3b | Light patterns: window, blinds, leaves | **built 11-17** (D-067) | done | his judgement: keep, tune or remove |
| T2 | The wall: light pool, drop shadow | **built 11-17** (D-070, D-071) | done | his judgement, and the calls of D-068 (question 9) |
| T4 | Even out the photo | **built 11-17** (D-069) | done | his judgement: keep, tune or remove |
| T7 | 16-bit export | to build if wanted | Opus 5.5, medium | does a lab or customer want it? |
| T1 | Gloss map | to build | Opus 5.5, high (hard: see its spec) | side-lit photos of two glossy pieces |
| T5 | More side-lit shots | to build | Opus 5.5, high (hard) | one piece lit from 6 to 8 sides |
| T9 | Scene: portraits and general photos | experiment first | Opus 5.5, high | scope and hosting (section 6) |

Order: T2 (it changes how the product looks without Texture), then T1 and T5 when their photos
exist. T7 and T9 only on Isaac's word. Isaac (11-17): keep moving, make the calls and log them;
he answers in bulk later (section 6).

T1, T5 and T9 were first marked for Fable 5.2: they change `relief/measure.ts`, the hardest code
here, or are research. On Opus 5.5: high effort, agree the gate's score with Isaac before any
code, change nothing in the measuring that `pnpm gate:relief` then scores lower, and if the
gate is not met after an honest try, stop and say so rather than loosen it.

**Shipping** (Isaac, 11-17): a tool's pull request is merged once CI is green, so he can try it
on the live site; it is off by default, so nothing changes for anyone until a slider moves.

---

## 4. Built

### T6 — Softer shadows (BUILD.md §5.12.1, §5.12.2)

Two tools, three settings, all in Texture's expert list (they act only with Texture on):
`relief.bounce` (Bounce light); `relief.roomSide` (Room light from one side) and
`relief.roomFrom` (Room light comes from). Files: `core/src/tools/bounce.ts`; hooks
`tool:bounce` and `tool:roomside` in `core/src/fields.ts`, `light.ts`, `tone.ts`,
`gl/src/shaders/light.glsl.ts` and `gl/src/preview.ts`. Tests: `core/test/tool-bounce.test.ts`.

What to judge: on a piece with True Relief under a raking lamp, with Shadows high, raise
Bounce light. Hollows in pale paint should lighten and warm; dark paint should hardly move; a
cast shadow on open ground should stay dark. Room light from one side should model the surface
where no lamp reaches. Seen on the door (D-063): right, and subtle. If Isaac cannot see it at
all on his pieces, it has not earned its place.

### T8 — Glow (BUILD.md §5.12.3)

Settings in Finish's expert list: `finish.glow`, `finish.glowSpread`, `finish.glowWarmth`.
Files: `core/src/tools/glow.ts`, `gl/src/glow-gpu.ts`; hooks `tool:glow` in `core/src/fields.ts`,
`render.ts`, `tone.ts`, `gl/src/shaders/light.glsl.ts`, `gl/src/preview.ts`, and in the app
`web/src/state.ts`, `workers/guard.worker.ts`, `workers/pool.ts`, `canvas/Stage.tsx`; the
parity harness (`e2e/harness/main.ts`) hands the preview the maps. Tests:
`core/test/tool-glow.test.ts`.

What to judge: with a spotlight or a dramatic look, raise Glow to 30 to 60. The lamp's pool
should bloom and read as light; Spread carries it further; Warmth turns it toward film's
red-orange. Too much is a haze. It is the one tool that softens the picture (never the art's
own pixels, section 2), so it is the first to remove if it does not convince. Known limits
(D-064): the glow follows the lights a moment after a drag; highlights that only Texture
makes do not glow; it reaches about an eighth of the picture at most.

### T3a — Colour filter (BUILD.md §5.12.4)

Settings in each light's expert list: `lights.i.gel` (Colour filter), `lights.i.gelHue`
(Filter colour). File: `core/src/tools/gel.ts`; hooks `tool:gel` in `core/src/fields.ts` and
`light.ts` (where the light's colour is made). Nothing in the shader. Tests:
`core/test/tool-gel.test.ts`.

What to judge: add a second light from one side, give it Colour filter 0.8 and a blue, on two
pieces. It should read as a coloured lamp, not a tint over the picture. Camera white balance
(30% by default) leans the whole picture a little against the filter, as a camera would; set
it to 0 to see the filter at full strength. A strong filter dims its lamp. Filter colour has a
colour strip under its slider (D-068).

### T3b — Light patterns (BUILD.md §5.12.5)

Settings in each light's expert list: Pattern (none, window, blinds, leaves), Pattern size,
softness, turn, and (D-068) stretch, slant, across, up and down. Files:
`core/src/tools/pattern.ts`, `gl/src/shaders/pattern.glsl.ts`, `web/src/canvas/PatternBox.tsx`;
hooks `tool:pattern` in `core/src/fields.ts`, `light.ts`, `index.ts`,
`gl/src/shaders/light.glsl.ts`, `gl/src/preview.ts` (`packLamps`; a lamp is 8 vec4s, 5 without
it), `web/src/canvas/Handles.tsx`, `web/src/panel/Lights.tsx` and `style.css`. Tests:
`core/test/tool-pattern.test.ts`.

**Edit pattern** (D-068, Isaac's ask): with Expert controls on and a light with a pattern
selected, the button beside Remove shows the pattern as a box on the picture. Drag inside it to
move the pattern, a corner square to scale it, the right edge's circle to stretch it, the top
edge's circle sideways to slant it or up and down to change its height. One undo step a drag.
The turn stays a slider.

What to judge: Soft window, then a light's Pattern: window, on three pieces. The window's
shadow should read at a glance as light through a window; blinds and leaves likewise. Size
makes the shapes larger, Softness blurs their edges, Turn turns them. The shapes keep the
picture's up for any lamp, and follow the lamp's perspective (a lamp from the side stretches
them across). The pattern's names in the list are plain words (no interface code).

### T4 — Even out the photo (BUILD.md §5.12.6)

Settings, a group `prepare` in the Lights section's expert list: Even out: one side, which side,
corners, and Green to magenta (with a colour strip). They belong to the photo: Copy settings and
presets leave them out. Files: `core/src/tools/even.ts`; hooks `tool:even` in
`core/src/fields.ts`, `schema.ts`, `render.ts` (`isNeutral`), `light.ts`, `tools/glow.ts`
(`glowKey`), `gl/src/shaders/light.glsl.ts`, `gl/src/preview.ts`, `web/src/panel/Lights.tsx`.
Tests: `core/test/tool-even.test.ts`.

What to judge: a photo lit from one side, or with a hot centre, comes out even in under a
minute. On Isaac's panel photo (11-17, a hard cast shadow across the lower left) it lifts the
dark side but cannot take out the shadow's sharp edge: a smooth correction cannot. That needs a
different tool (section 6, question 8).

### T2 — The wall (BUILD.md §5.12.7)

Settings, a group `wall` in the Export section's expert list: Wall (on), Wall around the piece,
Wall brightness, Wall colour, Distance from the wall, Shadow strength. Copy settings and presets
carry it. Files: `core/src/tools/wall.ts` (`wallSize`, `wallPaint`, `wallPixels`,
`renderWithWall`); hooks `tool:wall` in `core/src/fields.ts`, `schema.ts`, `settings.ts`,
`light.ts` (the suns folded into the room light are kept for the wall's shadow), `index.ts`,
`gl/src/shaders/light.glsl.ts` (`wallLightAt`, the branch outside the piece, grain's cell through
`int`), `gl/src/preview.ts`, `web/src/workers/pool.ts` and `render.worker.ts` (the export's rows
are the whole picture), `web/src/panel/ExportPanel.tsx`, `web/src/canvas/view.ts` and `Stage.tsx`
(Fit takes in the wall). Tests: `core/test/tool-wall.test.ts`, `web/test/view.test.ts`; parity
and the app in `e2e/tools.spec.ts`.

What to judge: Gallery and Spotlight on the door and the lintel, Wall on. The lamp's pool should
spill onto the wall and the piece throw a soft shadow away from the lamp; Distance from the wall
widens it, a lamp's Softness blurs it. The exported file is the piece with its margin. Known
limits (D-071): the piece is a flat panel with square edges (no frame, no thickness lit on its
sides); the look thumbnails show the piece alone; `render` for an agent gives the piece alone
(the export gives the whole).

---

## 5. To build

Each spec gives the settings, the maths to write into §5.12, where it hooks, the tests and the
gate. Where a spec says "decide and log", take the simplest option and record it.

### T3a — Colour filter on a light (Opus 5.5, medium)

A light's colour is warm to cool only (`kelvin`). Other tools let a light be any colour. A real
coloured light is a lamp with a filter in front of it, and a filter only removes light.

Settings (in `LIGHT`):

| path | range, default | label | help |
|---|---|---|---|
| `gel` | 0..1, 0 | Colour filter | A coloured filter over this light; 0 is none |
| `gelHue` | 0..360, 30 | Filter colour | 0 red, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta |

Maths (§5.12.4): `hue(h)` in linear RGB, pure arithmetic:
`r = clamp(|h/60 - 3| - 1, 0, 1)`, `g = clamp(2 - |h/60 - 2|, 0, 1)`, `b = clamp(2 - |h/60 - 4|, 0, 1)`.
The light's colour is `colour(kelvin) * mix((1,1,1), hue(gelHue), gel)`, per channel, wherever
§5.3, §5.4 and §5.8 use `colour(kelvin)` (the white balance `Wc` included). It is not
renormalised: a strong filter dims the lamp, as a real one does.

Hooks: one line in `prepareLighting` (`light.ts`), where `cols` is made. **Nothing in the
shader**: colours arrive prepared, so parity comes free.

First, a trap: `looks.ts` `withLook` builds each light field by field, and `lookOf` compares
key counts. A new light field breaks both (the look tests fail at once). Build the look's
lights with `defaultLight({...})` so new fields get their defaults; do this as its own commit.

Tests: `gel: 0` leaves the bytes; a red filter lowers the green and blue means and never raises
red; `hue()` at 0, 60, 120, 180, 240, 300; a golden; a parity document.
**Gate:** tests pass; Isaac puts a coloured second light on two pieces and says whether it
reads as coloured light.

### T3b — Light patterns (Opus 5.5, high)

A lamp behind a window, blinds or leaves throws their shadow. This is what makes a look read at
a glance without Texture. Do T3a first (it fixes `withLook`).

Settings (in `LIGHT`):

| path | range, default | label | help |
|---|---|---|---|
| `pattern` | none, window, blinds, leaves; none | Pattern | Shadow shapes in this light, as from a window, blinds or leaves |
| `patternSize` | 0.05..2, 0.5 | Pattern size | How large the shapes are on the picture |
| `patternSoft` | 0..1, 0.3 | Pattern softness | How soft the shapes' edges are |
| `patternTurn` | -180..180, 0 | Pattern turn | Turns the pattern |

Maths (§5.12.5), to be written exactly before any code:

- **Where the pattern is.** For a lamp, in the plane through the aim point `A` at right angles
  to the beam `s`. The ray from the lamp `L` through picture point `P` meets it at
  `Q = L + (P - L) * r0 / dot(P - L, s)`. With `u = normalize(cross(s, (0,0,1)))` (use `(1,0,0)`
  when `s` is within 1e-6 of straight on) and `v = cross(s, u)`, the pattern coordinates are
  `(dot(Q - A, u), dot(Q - A, v))`, turned by `patternTurn`, divided by `patternSize`. For a
  sun: `(P.x - 0.5, P.y - a/2)`, turned and divided the same way. Fix the signs so that "up" in
  the pattern is up in the picture for a lamp above it, and test that.
- **The shapes**, each a function `M(p, q)` in `[0, 1]` built only from `floor`, `abs`, `min`,
  `max`, `smoothstep` and the PCG hash already in `finish.ts`, so the reference and the shader
  agree: `window` (panes with bars between, dark outside the frame), `blinds` (slats, a period
  of 1 in `q`), `leaves` (three octaves of value noise on the hash, cut by a smoothstep).
  `patternSoft` is the half-width of every smoothstep edge. Value noise must be continuous
  across cell edges, so a pixel that float32 and float64 put in different cells still gets the
  same value (the lesson of D-057).
- **Its effect:** `e *= 0.15 + 0.85 * M`. A sun with a pattern is no longer constant over the
  picture, so `prepareLighting` must not fold it into `base`.

Hooks: `tools/pattern.ts`; `prepareLamp` and `prepareSun` (the basis and the numbers);
`lightingAt`; the shader (a chunk exported from `gl/src/shaders/pattern.glsl.ts` and spliced
into `FRAGMENT`); `packLamps` (more vec4s per lamp: raise `LAMP_VEC4S`).

Tests: `none` leaves the bytes; each shape lowers the mean light and leaves the brightest part
within 1% of the plain lamp; turning by 360 is the same picture; a golden per shape; a parity
document per shape. Watch the size budget (§9) and the 300-line rule.
**Gate:** parity passes; Isaac tries a window pattern on Soft window on three pieces.

### T2 — The wall (Opus 5.5, high; two chats: the reference, then the preview and app)

The piece hangs on a wall. The lamp's pool spills past its edge and the piece throws a soft
shadow, so a spotlight has something to be a spotlight on. It is on BUILD.md's Later list;
this promotes it. Best after Phase 6b's crop: the photo must be cropped to the piece (the
`*-crop.jpg` fixtures already are).

Isaac's calls, made for him on 11-17 at his word ("make the decisions", D-068): the wall is one
colour set by Wall brightness and Wall colour below (white, 0.8, by default); no frame (a frame
is a later tool); it does not wait for the crop: it works on any photo and is right when the
photo is cropped to the piece (the `*-crop.jpg` fixtures are).

Settings: a new group `wall` (add it to `Doc`, `docSchema`, `describe` and `settingsOf`;
its panel place is the Export section's expert list, decide and log):

| path | range, default | label |
|---|---|---|
| `wall.on` | boolean, false | Wall |
| `wall.margin` | 0.05..1, 0.25 | Wall around the piece (picture widths, each side) |
| `wall.tone` | 0..1, 0.8 | Wall brightness (display value of the paint) |
| `wall.warmth` | -1..1, 0 | Wall colour (as Finish's warmth, §5.9) |
| `wall.standoff` | 0..0.1, 0.02 | How far the piece stands off the wall (picture widths) |
| `wall.shadow` | 0..1, 0.7 | Shadow strength |

Maths (§5.12.7):

- The wall is the plane `z = -standoff`; the piece's face stays `z = 0`. A wall point `Q` is
  lit by §5.3 with `P = Q` (so `D.z = L.z + standoff`), relief off.
- **The piece's shadow.** The ray from `Q` to the light crosses `z = 0` at
  `X = Q.xy + (L.xy - Q.xy) * standoff / (L.z + standoff)` (a sun: `Q.xy + l.xy * standoff / l.z`).
  With `d` the signed distance from `X` to the rectangle `[0,1] x [0,a]` (negative inside) and
  `pw = max(size * standoff / L.z, 0.002)` the penumbra's half-width,
  `vis = smoothstep(-pw, pw, d)` and the light is multiplied by `1 - wall.shadow * (1 - vis)`.
- **The wall's colour** is `decode(wall.tone)` times warmth's colour. A wall pixel is that
  colour through §5.4 (same white balance, same `kappa`), §5.5 and Finish.
- **Size.** With `mp = round(wall.margin * W)` for an output `W` wide, the picture is
  `(W + 2 mp) x (H + 2 mp)` and the piece sits at `(mp, mp)`. **The piece's pixels are exactly
  those of the same render with the wall off.**
- The guard (§5.7) judges the piece only. Glow's map covers the piece only: read it clamped.

How to build it: leave `render()` as it is (the piece). Add `tools/wall.ts` with
`wallPixels(doc, W, H, region)` (pure, no photo) and `renderWithWall()` that makes the canvas
and copies `render()`'s piece into it. The export and the command line call the second when
`wall.on`. In the shader, the branch that draws nothing outside the picture (`main`) draws the
wall inside the margin. In the app, Fit fits the piece and its margin (`canvas/view.ts`).

Tests: piece pixels equal with the wall on and off; on a flat grey photo with the wall the same
grey, the light is continuous across the edge away from the shadow; the shadow lies on the side
away from the lamp and widens with `size` and `standoff`; the export's size; a golden; parity.
**Gate:** Isaac sees Gallery and Spotlight on the door and the lintel with the wall on, and an
exported file with its margin.

### T7 — 16-bit export (Opus 5.5, medium; only if Isaac says a lab or customer wants it)

Not a document setting: an export option, `export({depth: 16, format: 'png'})`. The photo is
8-bit, so what 16 bits keep is the smoothness of the light and of Finish.

- Reference: the same maths, quantised at the end as `floor(65535 v + 0.5)` on the continuous
  curve (`toDisplay`, as Finish does). A pixel the document leaves alone is `257 * code`.
- A PNG writer in `web/io` with `CompressionStream('deflate')` (Safari 16.4 and later; say so
  on older), rows streamed so a 24-megapixel picture never sits whole in memory twice.
- The colour profile: an `sRGB` chunk, or for a Display P3 photo its ICC profile (`iCCP`).
  Where the profile's bytes come from is the open point: decide and log.
- The record gains the depth; `pixelsSha256` is of the 16-bit values.

**Gate:** a neutral document exports `257 * code` everywhere; the file opens as 16 bits a
channel in Preview and Photoshop on Isaac's iMac.
Separate, and Isaac's call: averaging smaller exports in linear light (BUILD.md, Later). It
moves the golden of every sized render.

### T1 — Gloss map (Opus 5.5, high; hard)

Where the surface is shiny, a moving lamp should catch it. Today `relief.sheen` is one number
for the whole piece, and True Relief finds glints only to discard them (`relief/shading.ts`
`findGlints`). RTI viewers, Beeble and museum scanners all carry a per-pixel gloss.

Cannot start until Isaac sends side-lit photos, with their flat photo, of two glossy pieces
(varnish, metal leaf): no fixture today is glossy.

Outline: after the height is measured, the light in a side-lit shot that the matte prediction
(`shading.ts` `predicted`) cannot explain is gloss. Evidence exists only where a facet happens
to mirror the light into the camera, so spread it over the same paint with a filter guided by
the flat photo's colour, and scale it so its 98th percentile is 1. Keep it beside the height
(a project carries it as another PNG; `MeasuredHeight` gains it). When a measured gloss exists,
§5.3's sheen is multiplied by it at `P`; `relief.sheen` stays the overall strength. One more
R8 texture in the preview.

**Gate:** from one side-lit shot's gloss, the relit picture puts its highlights where a second
real shot has them (agree the score before building, as the bake-off did); Isaac says it reads
as varnish or leaf, not as plastic.

### T5 — More side-lit shots (Opus 5.5, high; hard)

True Relief takes one to three shots. With four to eight from round the piece, each pixel has
several readings: shadows and glints can be left out per shot, both slopes are measured
everywhere, and "which end looks right?" answers itself. Needs from Isaac one piece shot from
six to eight sides on a tripod, and the same handheld.

Outline: `relief/measure.ts` solves each pixel by least squares over the shots that are
neither shadow nor glint there; the flow takes up to eight photos. The check that exists for
three shots (each predicted from the others at 0.7 or better) is the gate for eight.
A short video sweep as the source of the shots is a later step.

### T9 — Scene: portraits and general photos (Opus 5.5, high; an experiment before any build)

BUILD.md §1 says artwork only. Isaac asked about portraits on 11-17; nothing is decided
(section 6). What other tools do: a depth and surface map from a trained model, the existing
light taken out, subject and background split. They need a recent GPU or a server; the 2014
iMac can run neither.

The experiment, in `bench/` only, no app code: take three portraits of Isaac's own; run a depth
model on each in Python (Depth Anything V2 small, as the bake-off did); turn depth into a
height; give it to the existing relief engine at a depth of 0.1 to 0.4 picture widths (the
schema's limit is 0.03: the bench goes round it); render key, fill and rim set-ups with the
reference renderer; make a sheet for Isaac. The engine may carry further than expected: the
horizon table reaches 0.2 picture widths, about a nose's shadow. The sheet will also show the
problem of the light already in the photo. Only after it: a design, and Isaac's decisions.

---

## 6. Open with Isaac

From the audit, not yet answered:

1. Are portraits and general photos part of DigiLight, or a later mode? (T9)
2. If so: a paid hosted model, or in the browser on recent machines only?
3. What do his customers make: varnished, metal leaf, heavy impasto, flat matte? (ranks T1)
4. Would artists take four to eight side-lit shots, or is one extra photo the limit? (T5)
5. Is the output mainly for screens, prints or both? (T7)
6. Each tool built: keep, tune (how) or remove? Glow, Bounce light, Room light from one side,
   Colour filter, Light patterns (and the Edit pattern box), Even out the photo, the wall.
7. Grain at full is now about four times stronger (D-068): right, or a different top?
8. A hard shadow in the photo (his panel, 11-17): worth a tool that lifts a shadow he paints or
   that is found from its edge? It would be a light multiplier from a mask, never a repaint.
9. T2's calls made for him (D-068): one wall colour (brightness and warmth), no frame. Right?

Answered 11-17: expert-only additions that add light are fine (gloss, wall, glow), each
removable; build now, before the first customer.
