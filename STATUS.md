# Status
**Phase:** 5 (True Relief): engine half done and passing its gate rows; the app flow is next.
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).

## Done
- Phases 0 to 4: workspace, `core` engine, `gl` preview, `web` app, Texture (estimated); deployed.
- Phase 5, engine (steps 1, 2, 4, core of 5; D-040 to D-044): v1's measurement and line-up in
  `core/relief/` (equal to v1 on Isaac's photos), the light's axis, the 16-bit stored height,
  commands `measureRelief` / `setMeasured` / `getMeasured`, `pnpm gate:relief`: door 0.78 / 0.87,
  lintel 0.68 / 0.85 (needs 0.45 / 0.50), own axis 0.79 / 0.88 and 0.59 / 0.78 (0.40 / 0.45), lamp
  shots 0.80 to 0.87 (0.7). 44 unit tests, 12 e2e.

## Waiting on Isaac
- Phase 4 bench: texture switched on is 5.5 s on the iMac (budget 3 s; D-045). Re-run `?bench`
  and paste the table: it now shows each stage of the estimate.
- Review round 4 (https://claude.ai/artifact/SEDbAFn98fYp5G5WkgSRyr, round `phase4-1`): no notes
  yet; until then Texture stays off by default and labelled "estimated".
**Run:** `pnpm typecheck && pnpm test`, `pnpm e2e`, `pnpm gate:relief` (3 min), `pnpm dev`, `pnpm
build`. Never run `playwright install`. Review notes: ArtifactData, collection `notes`.

## Next: new chat, Opus 5.5, medium effort (interface work): Phase 5, the app flow
In `web` only; `core` does the work (`prepareSideLit`, `measureRelief`, `quantise`, `flipped`,
`measuredRelief`, `packHeight`, `cmd.setMeasured`):
1. A worker (`workers/measure.worker.ts`): line the side-lit photo up at relief size (about 10 s,
   show progress), read the axis, measure at long side 512 (1 s) for the two previews.
2. Panel section 3 (§8): "Use a side-lit photo for real texture" (one to three), two previews
   lit from the upper-left end of the axis, one per end (`flipped`), "Which looks right?", a dial
   (re-measures at 512), Expert: elevation (default 20), or lamp in cm and the width.
3. On the choice: measure at relief size, `quantise`, `cmd.setMeasured`; the pool's
   `relief-height` takes the height (`horizonInput(h, w, h, false)`), then the GPU as now.
4. Autosave the height as a PNG (`packHeight`) with `lo`, `hi`; `window.digilight.measureRelief`.
5. e2e: the door pair through the flow; the export equals `measureFromPhotos` + `render` in Node.
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 5's app flow as STATUS.md lists it (BUILD.md section 10, Phase 5, steps 3 and 5; section 8).
No v1 files are needed. Answers to "Waiting on Isaac": bench re-run: [paste the table, or "not
yet"]. Review round 4: [notes are saved / not yet].
Keep replies brief. Stop at the phase's gate and tell me what to check.
```
