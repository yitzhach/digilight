import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { target: ['safari16', 'chrome109', 'firefox115'] },
});
