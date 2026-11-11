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
