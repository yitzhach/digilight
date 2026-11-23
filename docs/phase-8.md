# Phase 8 — AI access, hosted (plan; waiting on Isaac's OK, nothing built)

Depends on Phase 7 (`packages/mcp`), which is on branch `claude/happy-pasteur-2klr10`, not yet on
`main`. It merges first; this phase reuses its tool list and session.

## 1. The Worker
- Name **`studio-digilight-api`**. Folder **`packages/api/`**: `src/index.ts` (routes), `auth.ts`,
  `jpeg.ts` + `wasm/` (decoder), `png.ts` (decode and encode), `mcp.ts` (remote MCP),
  `wrangler.jsonc`, `test/`. Each file under 300 lines.
- `packages/mcp` gains one seam: tools and session take an image-io (`decode(bytes, maxSide)`,
  `encodePng`). Node keeps `sharp`; the Worker passes its own decoders. Nothing else changes.

## 2. How it deploys
Workers Builds from `main`, like `studio-digilight`: a second Worker on the same repository, with
its own config (`packages/api/wrangler.jsonc`) and build watch paths, so only changes to `api`,
`mcp`, `core` or the lockfile rebuild it. Branch builds give preview addresses. The first deploy
is Isaac's (step 2 below).

## 3. Endpoints (all but `GET /` need the key)
- `GET /`: name and version.
- `POST /v1/render`: multipart (`photo` file, `document` JSON, optional `sidelit` files) or JSON
  `{ photoUrl | photoBase64, document, width, sidelit? }`. Returns a PNG; with
  `Accept: application/json`, `{ image (base64), record (with photo.pixelsSha256), metrics,
  warnings }`. Errors `{ error: { code, message } }`.
- `POST /mcp`: remote MCP (Streamable HTTP, JSON replies, no streaming). **Stateless**: nothing is
  kept between calls, no photo is stored. Every tool takes the photo (`photoUrl` or
  `photoBase64`) and the `document`, and returns the new document plus its usual values and
  warnings. Same tools as Phase 7, minus `undo` (the agent keeps its earlier documents);
  `open_image` checks the photo and returns its size and a starting document. Same hand-written
  JSON-RPC as Phase 7: no MCP library.
- Photo by URL: https only, up to 25 MB, 10 s timeout, JPEG or PNG by its bytes.

## 4. Size and memory (128 MB per Worker)
- Largest render: **2048 px on the long side**. Files up to 25 MB, photos up to 40 MP.
- A large photo is never held at full size. JPEG decodes straight to 1/2, 1/4 or 1/8 size (the
  smallest at or above the target), PNG row by row into a reduced copy; then `core`'s
  `resample.ts` gives the exact size, as the app's smaller export does.
- Budget at 2048 × 1536: photo 12.6 MB, renderer buffers about 40 MB, Texture maps and horizon
  table measured in the build. A Node test asserts the peak stays under 100 MB with Texture on;
  if it does not, Texture's largest width drops to 1600 and the docs say so.
- Promise 5: a photo up to 2048 px gives the app's pixels (PNG exactly, JPEG within a level,
  D-029). A larger JPEG is reduced in the decoder, so its `pixelsSha256` differs from the app's
  and `verify` says "decoder difference", not "renderer difference".

## 5. JPEG and PNG without sharp
- **JPEG:** libjpeg-turbo compiled to WASM (about 250 KB), using its built-in 1/2 to 1/8 scaling;
  EXIF orientation read in TypeScript. The `.wasm` and its build script are committed, so Workers
  Builds needs no compiler. New dependency: a line in `DECISIONS.md`. (Ready-made `@jsquash/jpeg`
  decodes only at full size: 96 MB for 24 MP, too much.)
- **PNG:** about 150 lines of TypeScript on the Worker's `DecompressionStream`: the five row
  filters; grey, palette, alpha; 16-bit to 8. Interlaced PNGs are refused with a clear message.
  Output PNG written with `CompressionStream`. No dependency.
- HEIC, WebP and JPEG output: not in Phase 8 ("send a JPEG or PNG"). Display P3 photos: a warning.

## 6. The key
One secret, `DIGILIGHT_API_KEY` (32+ random characters, set by Isaac). Requests send
`Authorization: Bearer <key>`. The Worker hashes both and compares with
`crypto.subtle.timingSafeEqual`; missing or wrong is 401. No secret set: every call is 503 (it
fails closed). Changing the secret revokes the old key. Sign-in replaces it in Phase 9.

## 7. CPU time and cost
- Needs **Workers Paid** ($5 a month; Free allows 10 ms of CPU a request). Included: 10 million
  requests and 30 million CPU ms a month; beyond, $0.30 per million requests and $0.02 per
  million CPU ms. `limits.cpu_ms: 60000` in the config (default 30 s, maximum 5 min).
- Estimates, measured in the build and written here: Light layer at 2048, 0.5 to 1 s; Texture
  estimated 2 to 4 s (maps at 3 MP instead of 24); measured 10 to 40 s.
- Cost beyond the included amount: 1 s = $0.00002, 16 s = $0.00032, 60 s = $0.0012. The included
  30 million ms is about 30,000 light renders or 2,000 Texture renders a month. If the account is
  already on Workers Paid (Studio Platform), there is no new monthly cost.

## 8. Texture
- **Estimated:** works. Stateless, so its maps are built on every call (2 to 4 s at 2048); the
  reply says how long, and the server instructions tell agents to adjust at 1024 px.
- **Measured:** the side-lit photos (1 to 3) come with each call that uses it, and are measured
  again each time, inside the 60 s limit. Over it, the error says: smaller width, or the local
  MCP server (Phase 7), which keeps its maps.

## 9. Gate
`e2e/api.spec.ts` against `wrangler dev`: a PNG fixture renders with the same pixel SHA-256 as the
Node reference; a full MCP session through every tool; 401 without the key; a 2048 px light
render in under 2 s; peak memory under 100 MB (Node test). Then, deployed: one `curl` Isaac runs.

## 10. Isaac's steps in the Cloudflare dashboard (after I say the code is on `main`)
1. **Billing:** Account home → Billing → Subscriptions: is Workers Paid on? If not, Workers &
   Pages → Plans → Workers Paid ($5/month). Then Notifications → Add → Usage Based Billing:
   alert above, say, 60 million Workers CPU ms.
2. **Create the Worker:** Workers & Pages → Create → Import a repository → GitHub →
   `yitzhach/digilight`. Name `studio-digilight-api`; production branch `main`; root directory
   `/`; build command `pnpm install --frozen-lockfile`; deploy command
   `npx wrangler deploy -c packages/api/wrangler.jsonc`. Save and Deploy (the first deploy).
3. **Watch paths:** the new Worker → Settings → Build → Build watch paths → include
   `packages/api/*`, `packages/mcp/*`, `packages/core/*`, `pnpm-lock.yaml`.
4. **The key:** the new Worker → Settings → Variables and Secrets → Add → Type: Secret, Name
   `DIGILIGHT_API_KEY`, Value: a long random password from your password manager → Deploy.
   Keep it only there; never paste it in a chat.
5. Tell me "deployed" and the address. I check it answers and refuses without the key; you run
   one `curl` I give you, with the key.
6. To use it: Claude Code: `claude mcp add --transport http digilight <address>/mcp --header
   "Authorization: Bearer <key>"`. claude.ai connectors may need sign-in (OAuth), so Phase 9.
