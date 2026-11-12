# Status

**Phase:** 3 (The app, Light layer only): merged and live; gate half done.
**Live:** https://studio-digilight.bobdylan2000.workers.dev (from `main`; `?bench` for the bench).

## Done
- Phase 0: workspace, CI, `wrangler.jsonc`. Phase 1, `packages/core`: the engine for the Light layer (D-007 to D-021). 31 tests.
- Phase 2, `packages/gl`: the WebGL2 preview; parity within 1 level, neutral exact (D-023, D-024).
- Phase 3, `packages/web`: the app (§8 sections 1, 2, 5 and Expert), workers for thumbnails,
  export and the guard, `window.digilight`, autosave, `?bench` (D-025 to D-029). Smoke test:
  every look, a drag with undo, PNG export equal to the reference SHA-256.
- Isaac connected Workers Builds and deployed; the app works on his iPhone. Export there now
  offers Save or share, to put the picture in Photos (D-030).

## Waiting on Isaac (rest of Phase 3's gate)
- Bench on the iMac (Chrome 138, 17.9 MP photo): open 1.16 s, thumbnails 0.87 s, drag 60 fps at
  scale 1, release 14 ms, export 2.2 s: all within §9. Open would be about 1.5 s at 24 MP, so
  the guard thumbnail and the file hash moved off the main thread's path (D-031); a re-run on a
  24 MP photo would confirm.
- Which looks don't read as real light. Tuning changes §6, `core/src/looks.ts` and the goldens
  (`packages/core/test/goldens.json`) together. Can be done at the start of Phase 4.

## How to run
- `pnpm typecheck && pnpm test` (unit), `pnpm e2e` (parity and smoke, headless Chromium,
  software GL), `pnpm dev` (the app), `pnpm build`. Never run `playwright install`.
- Review rounds: `pnpm --filter core review` (D-019).

## Handoff to Phase 4 (Texture)
- Start by reading Isaac's bench table and look notes from the session prompt; fix anything over
  budget in the texture-off rows first.
- Panel section 3 slots into `panel/Panel.tsx` (TABS); expert relief settings appear by adding
  `'relief.'` to an `ExpertFields` prefix list. Bench rows "texture on" are placeholders in
  `web/src/bench.ts`. Review raking with Texture at several Shadows values (D-022).

## Next: new chat, Opus 5.5, high effort (Fable 5.2 if GPU and CPU tables disagree)
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 4 (BUILD.md section 10, plus the sections it names). Port from yitzhach/digi-light-test
only the files the phase lists. Answers to "Waiting on Isaac": [paste the iMac bench table and
your notes on the looks]. Keep replies brief. Stop at the phase's gate and tell me what to check.
```
