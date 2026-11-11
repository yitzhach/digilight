# Changelog

## Phase 0: Repository
- Workspace scaffold (`core`, `web`), strict TypeScript, Vitest, empty Preact page, CI, `wrangler.jsonc` (not deployed).
- Copied from v1: `BUILD.md`, `docs/bakeoff.md`, `bench/bakeoff/`, `fixtures/`.

## Phase 1: The engine
- `core` for the Light layer: deterministic maths, sRGB and light-colour tables, the schema with `describe()`, lamps and sun, tone, protect whites, looks, the reference renderer with area-average resize, commands with undo, metrics. Review page script (D-019). 31 tests, goldens.
- Looks retuned from Isaac's review (D-020); review round 2 with a stricter-whites comparison.
