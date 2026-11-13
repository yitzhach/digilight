import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The version shown at the foot of the page (D-056): the commit's time and short name. Without
// git (a build from a bare copy), the build machine's commit variable and the time of the build.
const git = (args: string) => { try { return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const version = {
  time: git('log -1 --format=%cI') || new Date().toISOString(),
  commit: git('rev-parse --short=7 HEAD') || (process.env.WORKERS_CI_COMMIT_SHA ?? '').slice(0, 7),
};

// Cross-origin isolation lets the render workers share one copy of the photo (D-025); the
// same headers are served in production by public/_headers.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
  plugins: [preact()],
  define: { __VERSION__: JSON.stringify(version) },
  // libheif (about 1.4 MB) is loaded only for a HEIC photo, so its size is expected.
  build: { target: ['safari16', 'chrome109', 'firefox115'], chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  server: { headers: isolation },
  preview: { headers: isolation },
});
