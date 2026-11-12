# Status
**Phase:** 5b (fix-ups from the audit) is next. Phase 5's gate still waits on Isaac's phone test
of the side-lit flow; it can follow.
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).

## Done
- Phases 0 to 4: workspace, `core` engine, `gl` preview, `web` app, Texture (estimated); deployed.
- Phase 5, engine (D-040 to D-044): v1's measurement and line-up in `core/relief/`, the light's
  axis, the 16-bit height, `pnpm gate:relief`: door 0.78 / 0.87, lintel 0.68 / 0.85, lamps 0.80 to 0.87.
- Phase 5, app flow (D-048): "Use a side-lit photo for real texture" (one to three photos, two
  previews, "Which looks right?", a dial per photo); the height is autosaved as a 16-bit PNG.
- Review round 4 (D-047): estimated texture "way too gritty": off by default, labelled
  experimental. Look notes (Dramatic more contrast, lintel Spotlight muted) wait for Phase 6a.
- Audit (D-049), agreed by Isaac (D-050): no code changed; BUILD.md gained Phases 5b, 6a, 6b
  and 8b. The engine, parity and True Relief hold up. Found, and now Phase 5b: Strength throws
  away lamps moved by hand (and deletes every light after a reload); messages on a phone shrink
  to "S…"; `measured` is accepted with no height; Cmd+Z does nothing; no test covers an iPhone
  photo (P3, HEIC), Safari or the deployed build; JavaScript is at 245 of 250 KB.
- A full-size photo opens on Isaac's iPhone (11-12; Phase 5b item 13 answered).

## Waiting on Isaac
- **Phase 5 gate:** on the phone, open a new piece's flat photo, Texture, "Use a side-lit photo
  for real texture", a handheld photo of it in sun or a lamp from one side; pick the preview that
  looks right; try a raking look. Say if the line-up failed, the choice was unclear, or it looked wrong.
- One full-size HEIC from the iPhone of his own piece, for `fixtures/` (Phase 5b item 10; without
  it that item waits and the rest goes ahead).
- Settings notes: screenshots with the look and slider numbers feed Phase 6a's defaults.
- Phase 4 bench: texture switched on is 5.5 s on the iMac (budget 3 s; D-045). Re-run `?bench`.
**Run:** `pnpm typecheck && pnpm test`, `pnpm e2e`, `pnpm gate:relief` (3 min), `pnpm dev`, `pnpm
build`. Never run `playwright install`. Review notes: ArtifactData, collection `notes`.

## Next: new chat, Opus 5.5 at medium effort, repository `yitzhach/digilight` only: Phase 5b
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 5b as BUILD.md section 10 lists it (no other repository is needed). Answers to "Waiting
on Isaac": Phase 5 phone test: [worked / notes / "not yet"]. HEIC for fixtures: [attached /
"not yet"]. Bench re-run: [table, or "not yet"]. Settings notes: [screenshots, or "none yet"].
Keep replies brief. Stop at the phase's gate and tell me what to check.
```
