# Status

**Phase:** 3 (The app, Light layer only): built, waiting at the gate.
**Branch:** `claude/wonderful-pasteur-4kyydu` (Phases 1 and 2 are on `main`).

## Done
- Phase 0: workspace, CI, `wrangler.jsonc` (not deployed).
- Phase 1, `packages/core`: the engine for the Light layer (D-007 to D-021). 31 tests.
- Phase 2, `packages/gl`: the WebGL2 preview; parity within 1 level, neutral exact (D-023, D-024).
- Phase 3, `packages/web`: the app (§8 sections 1, 2, 5 and Expert), workers for thumbnails,
  export and the guard, `window.digilight`, autosave, `?bench` (D-025 to D-029).
  `e2e/smoke.spec.ts` passes in about 5 s: every look, a drag with undo, PNG export equal to the
  reference renderer's SHA-256. Bench in software GL here: open 178 ms, thumbnails 132 ms,
  export 0.35 s (2.3 MP); frame rates and the release frame need the iMac's GPU.

## Waiting on Isaac
- Connect the repository to Cloudflare Workers Builds (build command `pnpm i && pnpm build`;
  first deploy of `studio-digilight`), after this branch is merged to `main`.
- On the iMac: open the site with `?bench` added, open a 24-megapixel photo, press Run, paste
  the table (the "texture off" rows should be within §9).
- Say whether the looks read as real light; tune the look table with him, then update §6 and
  the goldens (`packages/core/test/goldens.json`).

## How to run
- `pnpm typecheck && pnpm test` (unit), `pnpm e2e` (parity and smoke in headless Chromium,
  software GL), `pnpm dev` (the app), `pnpm build`. Playwright and Chromium are preinstalled in
  cloud sessions: never run `playwright install`.
- Review rounds: `pnpm --filter core review` (see D-019).

## Handoff to Phase 4 (Texture)
- Panel section 3 slots into `panel/Panel.tsx` (TABS); expert relief settings appear by adding
  `'relief.'` to an `ExpertFields` prefix list. Bench rows "texture on" are placeholders in
  `web/src/bench.ts`. Review raking with Texture at several Shadows values (D-022).
