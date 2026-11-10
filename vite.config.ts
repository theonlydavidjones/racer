import { defineConfig } from 'vitest/config';

// base './' so the built site works from any static host path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 }, // three.js alone is ~600 kB
  test: { include: ['tests/**/*.test.ts'] },
});
