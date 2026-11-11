import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    headless: true,
    // No GPU on test machines: software GL (SwiftShader), as BUILD.md Phase 2's gate says.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'vite --config vite.config.ts', port: 5179, reuseExistingServer: true },
});
