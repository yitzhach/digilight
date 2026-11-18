# Status
**Phase:** 6a items done (looks 11-18, D-075); its gate waits on Isaac. 6b items 3 to 6 done
(D-061); left: item 1 (crop), item 2 (versions), the gate. Beside the phases: light tools (11-17).
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).
The foot of the page says which update it is; quote that line when something looks wrong.

## Done
- Phases 0 to 4: workspace, engine, preview, app, Texture (estimated); deployed. Phase 5 (D-040 to D-048): True Relief measured from side-lit photos, in core and in the app;
  `pnpm gate:relief`: door 0.78 / 0.87, lintel 0.68 / 0.85, lamps 0.80 to 0.87.
- Review round 4 (D-047), audit (D-049, D-050), Phase 5b (D-051 to D-054), Phase 6a (D-055 to
  D-060), Phase 6b items 3 to 6 (D-061): see CHANGELOG.md.
- Light tools (D-062 to D-072): `docs/light-tools.md` (rules, a spec for each). Built, expert,
  off by default: softer shadows, Glow, colour filter, light patterns with Edit pattern, even
  out the photo, the wall (D-072). 150 unit, 44 e2e tests; 190.9 of 250 KB.

## Waiting on Isaac
- **Light tools (11-17):** Expert controls on. Texture measured, a raking lamp, Shadows high:
  Bounce light, Room light from one side. Finish, with Spotlight: Glow, Glow spread, Glow
  warmth. Colour filter; Pattern and Edit pattern; Even out (Lights). Grain at full. Wall
  (Export). Each: keep, tune or remove; 10 questions: `docs/light-tools.md` section 6.
- **Projects (11-14, D-061):** Settings…: Save project, open it again, the recent list; Choose
  photos… under Apply to more photos (ten on the iMac is 6b's gate).
- **Settings window (11-13, D-060):** copy and paste between photos, a preset in one tap, presets
  to a file and back. **6a's gate:** five pieces alike in under 2 minutes (new Spotlight, D-075).
- **Zoom and version (11-13):** on the iMac and the iPhone. **Phase 5 gate:** on the phone, a
  new piece: flat photo, Texture, a handheld side-lit photo. The HEIC file; the bench; notes.
**Run:** `pnpm typecheck && pnpm test`, `pnpm e2e`, `pnpm build && pnpm --filter web size`,
`pnpm gate:relief` (3 min), `pnpm dev`. Never run `playwright install`. Review notes: ArtifactData.

## Next: new chats on Opus 5.5, repository `yitzhach/digilight` only, one at a time
1. Phase 6b item 1, crop (**high**: the warp in `core`), item 2, Versions (**medium**), the gate.
2. Light tools: the rest wait on Isaac (T1, T5 photos; T7, T9 his word). Prompt: light-tools.md.
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do chat
[1 or 2] of STATUS.md's "Next" as BUILD.md section 10 lists it; nothing beyond it. Answers to
"Waiting on Isaac": [each item: worked / notes / "not yet"]. Keep replies brief. Stop at the gate.
```
