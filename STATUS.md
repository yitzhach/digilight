# Status
**Phase:** 6a under way. Done (11-13): item 3, the zoom buttons (D-055), a version line at the
foot of the page (D-056), and item 1, Finish (D-057). Left in 6a: items 2 (looks), 4 (Settings).
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).
The foot of the page says which update it is; quote that line when something looks wrong.

## Done
- Phases 0 to 4: workspace, `core` engine, `gl` preview, `web` app, Texture (estimated); deployed.
- Phase 5 (D-040 to D-048): True Relief measured from side-lit photos, in core and in the app;
  `pnpm gate:relief`: door 0.78 / 0.87, lintel 0.68 / 0.85, lamps 0.80 to 0.87.
- Review round 4 (D-047): estimated texture off by default, experimental. Look notes wait for 6a.
- Audit (D-049, agreed in D-050): BUILD.md gained Phases 5b, 6a, 6b and 8b.
- Phase 5b (D-051 to D-054): the audit's fix-ups; gate passed on the iPhone. List in CHANGELOG.md.
- Phase 6a item 3 (D-055): zoom buttons and keys. Item 1 (D-057): Finish in both renderers and
  the panel; parity and goldens with it on. 69 unit tests, 30 e2e (HEIC skipped).

## Waiting on Isaac
- **Finish (11-13):** on the iMac and the iPhone, the Finish section's five sliders on a lit piece;
  each should do what it says, and Brightness should not blow out the whites.
- **Zoom and version (11-13):** buttons, keys and wheel on the iMac; buttons and pinch on the
  iPhone; the version line at the foot of the page on both.
- **Phase 5 gate:** on the phone, a new piece's flat photo, Texture, "Use a side-lit photo for
  real texture", a handheld side-lit photo; pick the preview that looks right; try a raking look.
- The HEIC file itself for `fixtures/` (AirDrop or Files; a chat upload makes it a JPEG).
- Phase 4 bench re-run on the iMac (`?bench`, paste the table; item 14, D-045).
- Settings notes: screenshots with the look and slider numbers, for chat 2's look tuning.
**Run:** `pnpm typecheck && pnpm test`, `pnpm e2e`, `pnpm build && pnpm --filter web size`,
`pnpm gate:relief` (3 min), `pnpm dev`. Never run `playwright install`. Review notes: ArtifactData.

## Next: new chats on Opus 5.5, repository `yitzhach/digilight` only, one at a time
1. **Medium effort.** Phase 6a items 2 and 4 (look tuning, the Settings window), then 6a's gate.
2. Phase 6b: **high** for item 1 (the crop's warp in `core`), **medium** for items 2 to 6.
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
chat [1 or 2] of STATUS.md's "Next" as BUILD.md section 10 lists it; nothing beyond it.
Answers to "Waiting on Isaac": Finish: [worked / notes]. Zoom and version: [worked / notes]. Phase 5 phone test: [worked /
notes / "not yet"]. HEIC: [attached / "not yet"]. Bench: [table / "not yet"]. Settings notes:
[screenshots / "none yet"]. Keep replies brief. Stop at the gate and tell me what to check.
```
