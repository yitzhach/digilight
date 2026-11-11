# Status

**Phase:** 1 (The engine): built, CI green, waiting at the gate.
**Branch:** everything is on `main`.

## Done
- Phase 0: workspace, CI, `wrangler.jsonc` (not deployed).
- Phase 1, `packages/core`: `dmath`, `srgb` + `kelvin` (tables from `scripts/gen-tables.ts`), `schema`
  (`describe()`), `light`, `tone`, `guard`, `looks`, `resample` (v1 arithmetic), `render`, `commands`
  (undo/redo), `metrics`. Relief, sheen and finish not rendered yet (D-011).
- 31 tests in about 4 s. Gallery on the door at full size: 200 ms (400 ms under the test runner).

## Waiting on Isaac
- Phase 1 gate: mark each look and type or speak notes on the **Looks review** page
  (https://claude.ai/artifact/SEDbAFn98fYp5G5WkgSRyr). Claude reads them with ArtifactData
  `list`, collection `notes` (fields piece, look, verdict good/change/wrong, note); fold them into
  `looks.ts` (and goldens) or DECISIONS.md.

## Review rounds (any gate with pictures)
- `pnpm --filter core review` writes `packages/core/out/review/` (page + img/). Publish
  `index.html` with the Artifact tool, `root` out/review, `files` img/*, capabilities
  `{db: {}, dictation: {}}`; republish to the same URL for a new round (change `ROUND.id` in
  `scripts/review.ts` so old notes stay apart).

## Handoff to Phase 2 (the preview)
- Mirror these in GLSL: `light.ts` `prepareLighting` (per-document E factors, lamps as uniforms;
  suns fold into `base`), `tone.ts` `toneMap`, `srgb-tables.ts` (DECODE, THRESHOLDS) and
  `kelvin-tables.ts`. `kappa` comes from `guardKappa(photo, doc)` as a uniform.
- The parity reference is `render(photo, doc, { width: 1024 })`; fixtures load with `scripts/jpeg.ts`.
- Imports use `.ts` extensions; scripts run as `node file.ts` (D-008). Keep `core/src` pure.
- Playwright and Chromium are preinstalled: never run `playwright install`. `gl` and `e2e/` do not exist yet.

## Next: new chat, Opus 5.5, high effort (BUILD.md §13)
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 2 (BUILD.md section 10, plus the sections it names). Port from yitzhach/digi-light-test
only the files the phase lists. Answers to "Waiting on Isaac": my notes are on the Looks review
page; read them first and apply them.
Keep replies brief. Stop at the phase's gate and tell me what to check.
```
