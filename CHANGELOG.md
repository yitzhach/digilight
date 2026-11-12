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
