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

## 4. Size and memory (128 MB per Worker; measured 11-23, see section 7)
- Largest render: **2048 px on the long side with the Light layer; 1024 px with Texture.**
  Files up to 25 MB, photos up to 40 MP.
- Why Texture is smaller: its shadow table is 32 bytes a pixel (`horizon.ts`, K = 32
  directions), so 100 MB at 2048 px (3.1 MP) before anything else; 25 MB at 1024 px. Node's peak
  grew by 365 MB for estimated Texture at 2048 px, 104 MB at 1024.
- The light at 2048 px: Node's peak grew by 146 MB, but that counts garbage not yet collected
  and sharp's own buffers; the buffers a render holds at once come to about 50 MB (photo,
  picture, the photo's own numbers). The build measures it in the Worker; if it does not fit,
  the light's limit drops to 1600 px and this plan says so.
- A large photo is never held at full size (24 MP is 96 MB as pixels). JPEG decodes straight to
  1/2, 1/4 or 1/8 size (the smallest at or above the target), PNG row by row into a reduced
  copy. Then `core`'s `resampleRegion` makes the working copy in strips of rows: its
  intermediate is source rows x output width x 24 bytes (about 200 MB for a 24 MP photo to
  2048 px in one go), and a strip has exactly the pixels a whole resample has there.
- Promise 5: a photo up to 2048 px gives the app's pixels (PNG exactly, JPEG within a level,
  D-029). A larger photo is worked from the reduced copy, so its picture is close to the app's,
  not identical (Texture most of all: its maps come from that copy); the record names the copy's
  size and `verify` reports it as such.

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
- Measured 11-23 in Node 22 (Phase 7's session, `painting.jpg` and the door), a whole request:
  decode, a look, render, PNG. A Worker's CPU is about as fast per request; the build measures it
  again on the deployed Worker and writes it here.

| Request | CPU | Beyond the included amount |
|---|---|---|
| Light, 1024 px | 0.3 s | $0.000006 |
| Light, 2048 px | 1.3 s | $0.000026 |
| Texture estimated, 1024 px | 5.1 s | $0.0001 |
| Texture estimated, 2048 px (does not fit in memory) | 20 s | |
| Texture measured, one side-lit photo, 1024 px | 15.9 s | $0.00032 |
| Texture measured, 1805 px (does not fit in memory) | 36.6 s | |

- The included 30 million ms is about 23,000 light renders at 2048 px, 5,900 estimated Texture
  renders or 1,900 measured ones a month. If the account is already on Workers Paid (Studio
  Platform), there is no new monthly cost. (The plan's first estimate, 2 to 4 s for Texture at
  2048 px, was wrong: building the maps grows with the pixels, 5 s at 0.8 MP, 20 s at 3.1 MP.)

## 8. Texture
- **Estimated:** works, up to 1024 px. Stateless, so its maps are built on every call (about
  5 s); the reply says so, and the server instructions tell agents to adjust with the light
  alone, then add Texture. Wider, the error says: 1024 px, or the local MCP server (Phase 7),
  which keeps its maps and works at full size.
- **Measured:** the side-lit photos (1 to 3) come with each call that uses it, reduced like the
  flat photo, and are measured again each time (about 16 s for one at 1024 px). The build checks
  that `gate:relief`'s scores hold at 1024 px; if they drop, measured Texture stays local only.

## Open questions (the defaults are what gets built)
1. Texture hosted up to 1024 px only. Default: yes. (Keeping maps between calls would allow more,
   but needs storage: a Durable Object or R2, another resource.)
2. Photos over 2048 px: a close picture, not the app's exact one, and the record says so.
   Default: yes.
3. Stateless, nothing stored. Default: yes.

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
