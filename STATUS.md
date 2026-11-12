# Status
**Phase:** 5 (True Relief): engine and app flow done; the gate waits on Isaac's phone test.
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).

## Done
- Phases 0 to 4: workspace, `core` engine, `gl` preview, `web` app, Texture (estimated); deployed.
- Phase 5, engine (D-040 to D-044): v1's measurement and line-up in `core/relief/`, the light's
  axis, the 16-bit height, `measureRelief` / `setMeasured` / `getMeasured`, `pnpm gate:relief`:
  door 0.78 / 0.87, lintel 0.68 / 0.85, own axis 0.79 / 0.88 and 0.59 / 0.78, lamps 0.80 to 0.87.
- Phase 5, app flow (D-048): Texture's "Use a side-lit photo for real texture" (one to three
  photos, lined up in a worker with progress, two previews, "Which looks right?", a dial per
  photo, Expert elevation or lamp in cm); the height drives Texture and is autosaved as a 16-bit
  PNG; `window.digilight.measureRelief`. e2e: the door pair through the flow equals Node's
  `measureFromPhotos` + `render` bit for bit. 44 unit tests, 14 e2e.
- Review round 4 read (D-047): estimated texture "way too gritty", so it stays off and is
  labelled experimental. Look notes (Dramatic more contrast, lintel Spotlight muted) kept for
  Phase 6.

## Waiting on Isaac
- **Phase 5 gate:** on the phone, open a new piece's flat photo, Texture, "Use a side-lit photo
  for real texture", a handheld photo of it in sun or a lamp from one side; pick the preview that
  looks right; try a raking look. Say if the line-up failed, the choice was unclear, or it looked wrong.
- Phase 4 bench: texture switched on is 5.5 s on the iMac (budget 3 s; D-045). Re-run `?bench`
  and paste the table: it shows each stage of the estimate.
**Run:** `pnpm typecheck && pnpm test`, `pnpm e2e`, `pnpm gate:relief` (3 min), `pnpm dev`, `pnpm
build`. Never run `playwright install`. Review notes: ArtifactData, collection `notes`.

## Next: new chat, Sonnet 5.5 or Opus 5.5 at medium effort: Phase 6 (after the gate)
Prepare, Finish, Projects (BUILD.md §10 Phase 6; D-032's zoom buttons and Settings window).
Project files carry the measured height (`packHeight`, `lo`, `hi`). Fold in D-047's look notes.
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 6 as BUILD.md section 10 lists it. Answers to "Waiting on Isaac": Phase 5 phone test:
[worked / notes]. Bench re-run: [paste the table, or "not yet"].
Keep replies brief. Stop at the phase's gate and tell me what to check.
```
