import { defineConfig } from 'vite';

// Serves the harness page that the Playwright specs drive.
export default defineConfig({ root: new URL('harness/', import.meta.url).pathname, server: { port: 5179, strictPort: true } });
