# Status
**Phase:** 5b (fix-ups from the audit): done here; its gate waits on Isaac's iPhone check, in the
same sitting as Phase 5's phone test.
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).
Phase 5b is on `main` (11-12), so the live link has it.

## Done
- Phases 0 to 4: workspace, `core` engine, `gl` preview, `web` app, Texture (estimated); deployed.
- Phase 5 (D-040 to D-048): True Relief measured from side-lit photos, in core and in the app;
  `pnpm gate:relief`: door 0.78 / 0.87, lintel 0.68 / 0.85, lamps 0.80 to 0.87.
- Review round 4 (D-047): estimated texture off by default, experimental. Look notes wait for 6a.
- Audit (D-049), agreed by Isaac (D-050): BUILD.md gained Phases 5b, 6a, 6b and 8b.
- Phase 5b (D-051, D-052): the Looks panel reads the look from the document (Strength greyed,
  "Lights changed by hand", after a lamp is moved); measured needs a height in every command;
  `load` for autosaves, which now say when they cannot be reopened; phone messages, tabs, 22 px
  handles, hints; Cmd/Ctrl+Z; a lost WebGL context rebuilt; errors shown; no stale texture
  failure; no upscaled render or export; an empty decode says the photo is too large. Smoke runs
  on the built app too; P3 and EXIF fixtures and tests; WebKit smoke job in CI (built app passes,
  D-053); JavaScript 245 to 161 KB, checked in CI. 51 + 5 unit tests, e2e listed in CHANGELOG.

## Waiting on Isaac
- **Phase 5b gate (iPhone):** apply a look, move a lamp, see Strength greyed ("Lights changed by
  hand"), Undo (it comes back), export, and read the message under the top bar.
- **Phase 5 gate:** on the phone, a new piece's flat photo, Texture, "Use a side-lit photo for
  real texture", a handheld side-lit photo; pick the preview that looks right; try a raking look.
- One full-size HEIC of his own piece from the iPhone (AirDrop or Files keeps it HEIC; a chat
  upload turns it into a small JPEG) for `fixtures/`: its test is written and skipped until then.
- Phase 4 bench re-run on the iMac (`?bench`, paste the table; item 14, D-045).
- Settings notes: screenshots with the look and slider numbers feed Phase 6a's defaults.
**Run:** `pnpm typecheck && pnpm test`, `pnpm e2e`, `pnpm build && pnpm --filter web size`,
`pnpm gate:relief` (3 min), `pnpm dev`. Never run `playwright install`. Review notes: ArtifactData.

## Next: new chat, Opus 5.5 at medium effort, repository `yitzhach/digilight` only: Phase 6a
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 6a as BUILD.md section 10 lists it. Answers to "Waiting on Isaac": Phase 5 and 5b phone
tests: [worked / notes / "not yet"]. HEIC: [attached / "not yet"]. Bench re-run: [table, or
"not yet"]. Settings notes: [screenshots, or "none yet"].
Keep replies brief. Stop at the phase's gate and tell me what to check.
```
