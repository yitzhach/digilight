import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  reporter: 'list',
  use: { headless: true, acceptDownloads: true },
  projects: [
    {
      name: 'chromium',
      // No GPU on test machines: software GL (SwiftShader), as BUILD.md Phase 2's gate says.
      use: { browserName: 'chromium', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
    },
    // Safari's engine, for the smoke test only (BUILD.md Phase 5b item 12). Run on GitHub's
    // machines by its own CI job (`--project webkit`); never installed in cloud sessions.
    { name: 'webkit', use: { browserName: 'webkit' }, grep: /smoke:/ },
  ],
  webServer: [
    // The harness page for parity, the app itself (dev server) and the built app (what deploys).
    { command: 'vite --config vite.config.ts', port: 5179, reuseExistingServer: true },
    { command: 'pnpm --dir ../packages/web exec vite --port 5180 --strictPort', port: 5180, reuseExistingServer: true },
    { command: 'pnpm --dir ../packages/web exec vite build && pnpm --dir ../packages/web exec vite preview --port 5181 --strictPort', port: 5181, reuseExistingServer: true, timeout: 180_000 },
  ],
});
