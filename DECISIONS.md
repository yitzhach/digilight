# Decisions

Anything BUILD.md leaves open or gets wrong: the simplest option that keeps its promises, logged here.

- **D-001 (Phase 0). Only `core` and `web` are scaffolded.** `gl`, `mcp`, `e2e/` and the other files in §4 are created in the phase that first needs them (§3: no file the brief does not ask for).
- **D-002. `zod` and `@preact/signals` are not installed yet.** Both are in the §4 stack; they are added when code first uses them (`zod` in Phase 1, signals in Phase 3).
- **D-003. Versions.** TypeScript 5.9 (§4 says 5; 7.x exists), Vite 7, Vitest 3, Preact 10, pnpm 10.28 (`packageManager`), Node 20+ (CI uses 22). No `wrangler` dependency: Workers Builds provides it and Phase 0 does not deploy.
- **D-004. Package names are `core` and `web`**, so `pnpm --filter web dev` works as the gate says.
- **D-005. Copied files are verbatim.** `bench/bakeoff/*.py`, `docs/bakeoff.md` and `fixtures/README.md` still name v1 paths (`testdata/photos`, `samples/`, `tools/bakeoff`, `docs/v2`). `common.py` builds paths from `REPO + '/testdata/photos/'` and `'/samples/dsc8382/'`; they must point at `fixtures/` and `fixtures/dsc8382/` before the scripts run (Phase 5 or 10). In `fixtures/`, `samples/painting.jpg` is `fixtures/painting.jpg` and `samples/dsc8382/` is `fixtures/dsc8382/`.
- **D-006. `wrangler.jsonc` `compatibility_date`** is the date of Phase 0 (2026-11-11).
