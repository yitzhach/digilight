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
- Bench on the iMac passed (17.9 MP: open 1.16 s, drag 60 fps, release 14 ms, export 2.2 s);
  opening sped up for 24 MP (D-031), a re-run would confirm.
- Looks (Isaac, 11-12): Gallery, Spotlight and Dramatic too warm; Candlelight too blown out.
  Phase 4 starts by tuning these (§6, `core/src/looks.ts`, goldens together; D-032), then a
  review round (D-019) for him to confirm. Zoom buttons and a Settings window: Phase 6.

## How to run
- `pnpm typecheck && pnpm test` (unit), `pnpm e2e` (parity and smoke, headless Chromium,
  software GL), `pnpm dev` (the app), `pnpm build`. Never run `playwright install`.
- Review rounds: `pnpm --filter core review` (D-019).

## Handoff to Phase 4 (Texture)
- First: tune the looks from Isaac's notes above, then a review round.
- Panel section 3 slots into `panel/Panel.tsx` (TABS); expert relief settings appear by adding
  `'relief.'` to an `ExpertFields` prefix list. Bench rows "texture on" are placeholders in
  `web/src/bench.ts`. Review raking with Texture at several Shadows values (D-022).

## Next: new chat, Opus 5.5, high effort (Fable 5.2 if GPU and CPU tables disagree)
```
Read CLAUDE.md and STATUS.md in yitzhach/digilight, then BUILD.md sections 1 to 4, and do
Phase 4 (BUILD.md section 10, plus the sections it names). Port from yitzhach/digi-light-test
only the files the phase lists. Answers to "Waiting on Isaac": Phase 3 bench passed; look
notes are in STATUS.md, tune them first. Keep replies brief. Stop at the phase's gate and tell
me what to check.
```
