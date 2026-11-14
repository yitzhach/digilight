# Status
**Phase:** 6a done but item 2 (looks) and its gate; 6b items 3 to 6 done (11-14, D-061: projects,
Apply to more photos). Left in 6b: item 1 (crop), item 2 (versions), the gate.
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).
The foot of the page says which update it is; quote that line when something looks wrong.

## Done
- Phases 0 to 4: workspace, `core` engine, `gl` preview, `web` app, Texture (estimated); deployed.
- Phase 5 (D-040 to D-048): True Relief measured from side-lit photos, in core and in the app;
  `pnpm gate:relief`: door 0.78 / 0.87, lintel 0.68 / 0.85, lamps 0.80 to 0.87.
- Review round 4 (D-047): estimated texture experimental; audit (D-049, D-050): Phases 5b to 8b.
- Phase 5b (D-051 to D-054): the audit's fix-ups; gate passed on the iPhone. List in CHANGELOG.md.
- Phase 6a (D-055 to D-060): zoom, version line, Finish, export progress, phone export, Settings.
  Phase 6b items 3 to 6 (D-061): projects, old files, Apply to more photos. 78 unit, 35 e2e tests.

## Waiting on Isaac
- **Projects (11-14, D-061):** Settings…: Save project, open it again (also with Open), the recent
  list; Choose photos… under Apply to more photos (ten on the iMac is 6b's gate).
- **Settings window (11-13, D-060):** Export, Settings…: copy and paste between photos, a preset
  in one tap, presets to a file and back. Then 6a's gate: five pieces alike in under 2 minutes.
- **Zoom and version (11-13):** buttons, keys and wheel on the iMac; buttons and pinch on the
  iPhone; the version line at the foot of the page on both.
- **Phase 5 gate:** on the phone, a new piece's flat photo, Texture, "Use a side-lit photo for
  real texture", a handheld side-lit photo; pick the preview that looks right; try a raking look.
- The HEIC file for `fixtures/` (AirDrop or Files); the iMac bench (`?bench`); settings notes.
**Run:** `pnpm typecheck && pnpm test`, `pnpm e2e`, `pnpm build && pnpm --filter web size`,
`pnpm gate:relief` (3 min), `pnpm dev`. Never run `playwright install`. Review notes: ArtifactData.

## Next: new chats on Opus 5.5, repository `yitzhach/digilight` only, one at a time
1. **Medium effort.** Phase 6a item 2 (look tuning, from Isaac's settings notes), then 6a's gate.
2. Phase 6b item 1, crop and straighten (**high**: the warp in `core`), then item 2, Versions
   (**medium**), then 6b's gate.
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
chat [1 or 2] of STATUS.md's "Next" as BUILD.md section 10 lists it; nothing beyond it.
Answers to "Waiting on Isaac": Projects: [worked / notes]. Settings window: [worked / notes]. Zoom and version: [worked / notes]. Phase 5 phone test: [worked /
notes / "not yet"]. HEIC: [attached / "not yet"]. Bench: [table / "not yet"]. Settings notes:
[screenshots / "none yet"]. Keep replies brief. Stop at the gate and tell me what to check.
```
