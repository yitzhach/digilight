# Status

**Phase:** 1 (The engine): built, waiting at the gate.

## Done
- Phase 0: workspace, CI, `wrangler.jsonc` (not deployed).
- Phase 1, `packages/core`: `dmath`, `srgb` + `kelvin` (tables from `scripts/gen-tables.ts`), `schema`
  (`describe()`), `light`, `tone`, `guard`, `looks`, `resample` (v1 arithmetic), `render`, `commands`
  (undo/redo), `metrics`. Relief, sheen and finish not rendered yet (D-011).
- Tests: 31 pass in about 4 s (identity on the door, goldens, guard, kappa >= 0.7 for every look on
  door and lintel, schema, purity grep). Gallery on the door at full size: about 200 ms alone,
  400 ms under the test runner (gate: 1 s).
- Contact sheets: `pnpm --filter core sheet` writes `packages/core/out/sheet-*.html` (not committed).
- Dramatic look's lamp 1.1 to 1.0 so it keeps `kappa` >= 0.7 on the lintel (D-010).

## Waiting on Isaac
- Phase 1 gate: look at the door and lintel sheets and say what reads wrong.
- Phase 0 gate (if not done): CI green, `pnpm --filter web dev` shows the page.

## Next
- Phase 2, the preview (BUILD.md §10), in a new session.
