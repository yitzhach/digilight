# Status

**Phase:** 4 (Texture and shadows): built, tests pass; gate waits on Isaac.
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).

## Done
- Phases 0 to 3: workspace, `core` engine (Light layer), `gl` preview, `web` app; deployed.
- Phase 4: looks retuned from Isaac's 11-12 notes (D-033). Texture: `core/relief/` (estimate,
  horizon table, sampling), `rel`, `sh`, `occl`, sheen in the reference and the shader,
  `gl/horizon-gpu.ts` (two directions a frame), panel section 3, `setRelief`, maps made across
  the workers for exports, bench rows (D-034 to D-038). 40 unit tests, 12 e2e: GPU table equals
  the CPU's within 1 byte, Texture parity within 1 level, Texture export equals the reference.

## Waiting on Isaac (Phase 4's gate)
- Merge Phase 4 (branch `claude/wonderful-pasteur-4kyydu`) into `main` so it deploys; on the iMac open a 24 MP photo with
  `?bench`, Run, paste the table back. New rows: texture switched on to maps ready (3 s, no frame
  over 100 ms), dragging with texture (20 fps), export with texture (20 s).
- Review round 4 (https://claude.ai/artifact/SEDbAFn98fYp5G5WkgSRyr, notes saved there, round
  `phase4-1`): the four retuned looks, and Texture on door, lintel and close-up at Shadows
  30/60/100 and two Depths. If Texture is worse than none: it ships off by default and labelled
  "experimental" (it is already off by default; the label says "estimated").

## How to run
- `pnpm typecheck && pnpm test` (unit), `pnpm e2e` (parity, relief, smoke; headless Chromium,
  software GL), `pnpm dev` (the app), `pnpm build`. Never run `playwright install`.
- Review rounds: `pnpm --filter core review` (D-019); read notes with ArtifactData (collection
  `notes`, round `phase4-1`) into `core/out/notes/` before the next round.

## Next
- Read round 4's notes and the bench; adjust looks, Texture defaults (depth 0.003, shadows 0.4)
  or label as he says. Low raking shadows run a little long (D-036): check his notes for that.
- Then Phase 5 (True Relief from a side-lit photo): new chat, Fable 5.2, high effort.
