# Status

**Phase:** 0 (Repository): built, waiting at the gate.

## Done
- pnpm workspace: `packages/core` (pure TS, one placeholder test), `packages/web` (Vite + Preact page that says "DigiLight 2").
- `BUILD.md`, `docs/bakeoff.md`, `bench/bakeoff/`, `fixtures/` copied from v1 (`yitzhach/digi-light-test`, branch `claude/laughing-mendel-qvhsm6`).
- CI (`.github/workflows/ci.yml`): `pnpm typecheck && pnpm test` on every push.
- `wrangler.jsonc` (`studio-digilight`, assets `packages/web/dist`). Not deployed.
- Locally: typecheck and test pass, build works, `pnpm --filter web dev` shows the page.

## Waiting on Isaac
- Phase 0 gate: confirm CI is green on GitHub and `pnpm --filter web dev` shows the page.

## Next
- Phase 1, the engine (BUILD.md §10), in a new session.
