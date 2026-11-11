import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Cross-origin isolation lets the render workers share one copy of the photo (D-025); the
// same headers are served in production by public/_headers.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
  plugins: [preact()],
  // libheif (about 1.4 MB) is loaded only for a HEIC photo, so its size is expected.
  build: { target: ['safari16', 'chrome109', 'firefox115'], chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  server: { headers: isolation },
  preview: { headers: isolation },
});
