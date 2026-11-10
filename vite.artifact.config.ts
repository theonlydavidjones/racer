import { defineConfig } from 'vite';

// Build for the claude.ai artifact: one ES module with three.js left external (the page loads it from
// jsDelivr through an import map, as the artifact's content rules require). scripts/make-artifact.mjs
// then inlines this into a single HTML page.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: { external: ['three'], output: { inlineDynamicImports: true } },
  },
});
