# Status

**Phase:** 2 (The preview): built, waiting at the gate.
**Branch:** `claude/ecstatic-sagan-3g3wg5` (Phase 1 is on `main`).

## Done
- Phase 0: workspace, CI, `wrangler.jsonc` (not deployed).
- Phase 1, `packages/core`: the engine for the Light layer (D-007 to D-021). 31 tests in about 3 s.
- Phase 2, `packages/gl`: `createPreview(canvas)` with `setPhoto`, `setDoc(doc, {kappa})`,
  `setView({zoom, pan})`, `setScale(q)`, `draw()`, `readPixels()`; one pass, up to 8 lights,
  Display P3 output, mipmapped photo. `e2e/parity.spec.ts`: six documents on the lintel at
  1024 px, every channel within 1 level (allowed: 99% within 2, none over 6), neutral exact.
- Round 3 notes read: looks kept; more raking shadow needs Texture (D-022).

## Waiting on Isaac
- Phase 2 gate: CI green on the branch (jobs `check` and `e2e`). Nothing to look at by eye.

## How to run
- `pnpm typecheck && pnpm test` (unit), `pnpm e2e` (parity in headless Chromium, software GL).
  Playwright and Chromium are preinstalled in cloud sessions: never run `playwright install`.
- Review rounds: `pnpm --filter core review` writes `packages/core/out/review/`; publish
  `index.html` with the Artifact tool, `root` out/review, `files` img/*, capabilities
  `{db: {}, dictation: {}}`; republish to the same URL with a new `ROUND.id` in `scripts/review.ts`.

## Handoff to Phase 3 (the app)
- `gl` takes `kappa` from the caller; `setDoc` computes `guardKappa` on the main thread if not
  given (move it to a worker for big photos). The canvas is transparent outside the picture.
- Looks tuning can continue at Phase 3's gate with sliders in the app.
- Phase 4: review raking with Texture at several Shadows values (D-022).

## Next: new chat, Opus 5.5, medium effort (BUILD.md §13)
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 3 (BUILD.md section 10, plus the sections it names). Port from yitzhach/digi-light-test
only the files the phase lists. Answers to "Waiting on Isaac": Phase 2's gate passed (CI green).
Keep replies brief. Stop at the phase's gate and tell me what to check.
```
