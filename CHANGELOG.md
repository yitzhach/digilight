# Changelog

## Phase 0: Repository
- Workspace scaffold (`core`, `web`), strict TypeScript, Vitest, empty Preact page, CI, `wrangler.jsonc` (not deployed).
- Copied from v1: `BUILD.md`, `docs/bakeoff.md`, `bench/bakeoff/`, `fixtures/`.

## Phase 1: The engine
- `core` for the Light layer: deterministic maths, sRGB and light-colour tables, the schema with `describe()`, lamps and sun, tone, protect whites, looks, the reference renderer with area-average resize, commands with undo, metrics. Review page script (D-019). 31 tests, goldens.
- Looks retuned from Isaac's review (D-020); review round 2 with a stricter-whites comparison.

## Phase 2: The preview
- `gl`: `createPreview(canvas)` (`setPhoto`, `setDoc`, `setView`, `setScale`, `draw`, `readPixels`), one WebGL2 pass for §5.3 to §5.5 with up to 8 lights, Display P3 output, photo with mipmaps (down-scaled past `min(MAX_TEXTURE_SIZE, 8192)`).
- `e2e/parity.spec.ts`: six documents against the reference at 1024 px, all within 1 level, neutral exact (D-023, D-024). Round 3 notes logged (D-022).

## Phase 3: The app, Light layer only
- `web`: open by drop, picker or paste (JPEG, PNG, WebP, HEIC with libheif when needed; Display P3 kept), the picture with zoom, pan, light and aim handles, Before, the adaptive scale, panel sections Looks (live thumbnails from a worker), Lights and Export, Expert controls from `describe()`, export through a worker pool with a `.json` record, `window.digilight`, autosave in IndexedDB, `?bench` page (D-025 to D-029).
- `gl`: `sync()` for timing. `e2e/smoke.spec.ts`: open, every look, drag, export equals the reference's SHA-256.
- Deployed as `studio-digilight` (Workers Builds from `main`). On a phone, export offers Save or share, so the picture goes straight to Photos (D-030).

## Phase 4: Texture and shadows
- Looks: Gallery, Spotlight, Dramatic cooler; Candlelight no longer blows out at the bottom (D-033).
- `core/relief/`: estimated relief from one photo (labelled approximate), the horizon table (§5.6) with a max pyramid and exact pruning, map sampling; `rel`, `sh`, `occl` and sheen in the reference (D-034 to D-037). `setRelief` command.
- `gl`: the table on the GPU two directions a frame (`horizon-gpu.ts`), Texture in the preview shader. Within 1 byte of the CPU table; parity within 1 level.
- `web`: panel section 3 (Texture, Depth, Shadows, expert relief settings), maps made across the workers for exports, bench rows with texture (D-038). Review round 4.
- Texture on faster: Tmax on the GPU, the estimate split across the workers (D-039); the bench counts each script once.

## Phase 5: True Relief (engine half)
- `core/relief/`: v1's measured relief and handheld line-up ported (`measure.ts`, `lineup.ts` and their parts), equal to v1's output on Isaac's photos; the light's axis read from the pair (`axis.ts`); the measured height kept as 16 bits for project files (`measured.ts`); commands `measureRelief`, `setMeasured`, `getMeasured` (D-040 to D-043).
- `bench/relief-score.ts` (v1 score.py) and `bench/relief-gate.ts` (`pnpm gate:relief`, in CI): door 0.78 / 0.87, lintel 0.68 / 0.85, lamp shots 0.80 to 0.87 (D-044).
- Bench page prints each stage of Texture's estimate (D-045).

## Phase 5: True Relief (app flow)
- `web`: "Use a side-lit photo for real texture" in Texture: one to three photos lined up in a worker with progress, two previews and "Which looks right?", a dial per photo, Expert elevation or a lamp in cm; the measured height drives Texture, autosaved as a 16-bit PNG; `window.digilight.measureRelief` and `getMeasured` (D-048).
- Estimated texture labelled experimental after review round 4 (D-047).
- `e2e/truerelief.spec.ts`: the door pair through the flow; the height and the export equal `measureFromPhotos` + `render` in Node; the height comes back after a reload.
- Buttons no longer select their text on a long press (Before on a phone showed selection handles); Before also lets go on a cancelled touch.

## Audit (11-12)
- No code changed. BUILD.md: Phase 5b (fix-ups, each seen in the code or the running app), Phase 6 in two parts (6a, 6b), Phase 8b; §5.9 Brightness goes through the whites protection; Phase 7's gate compares pixel hashes (D-049).

## Phase 5b: fix-ups from the audit
- The Looks panel reads the look, Strength and Flip from the document (`lookOf`): moving a lamp by hand greys Strength ("Lights changed by hand") instead of Strength wiping the hand's work; Undo and a reload show the right look (D-051).
- Measured texture needs a height in every command; `load` reopens an autosave with no undo step, and an autosave that no longer fits says so; render and export refuse a width over the photo's.
- Phone: messages on their own line and wrapped, each tab starts at its top, a handle answers a touch within 22 px, hints on screen. Cmd+Z / Ctrl+Z undo. A lost WebGL context is rebuilt; uncaught errors show as a message; a failed texture build no longer haunts the next export; an empty decode says the photo is too large for the phone.
- Tests: smoke on the built app too; `fixups.spec.ts`, `iphone.spec.ts` (Display P3, EXIF rotation, HEIC once the file is in); a WebKit smoke job in CI; JavaScript size checked in CI, 245 to 161 KB (D-052).
- Gate passed on Isaac's iPhone, 11-12 (D-054).

## Phase 6a, item 3 only: zoom buttons
- Zoom out, Fit and Zoom in on the picture, keys `-`, `0`, `=`; a photo opens fitted to the stage (5% margin); Zoom out shows the lamps around the picture; panning never loses the picture (D-055). The rest of Phase 6a (Finish, look tuning, Settings) is still to do.
- A version line at the foot of the page: the update's date, time and short name (D-056).
