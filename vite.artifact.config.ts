import { defineConfig } from 'vite';

// Build for the claude.ai artifact (docs/CAPACITY.md, "One copy of the sim's code"): the page (src/main.ts) and the
// race's worker (src/sim/worker.ts) as two entries of one build, so the sim's code they share is one chunk, in the page
// once. three.js is left external (the page loads it from jsDelivr through an import map, as the artifact's content
// rules require). scripts/make-artifact.mjs then puts the chunks into a single HTML page, and its start-up script loads
// them as modules from blob URLs.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 6000,
    manifest: true, // (the chunks' imports, for make-artifact's checks and the start-up script's order)
    modulePreload: false, // (Vite's preloading helper resolves chunks against the page's URL: the chunks load from blobs)
    rollupOptions: {
      external: ['three'],
      input: { main: 'src/main.ts', worker: 'src/sim/worker.ts' },
      preserveEntrySignatures: 'allow-extension',
      // (names no code would contain by chance: make-artifact swaps each for its blob URL, and checks it's only where the
      // bundler's import list says)
      output: { format: 'es', entryFileNames: 'fbchunk-[name].js', chunkFileNames: 'fbchunk-[name].js' },
    },
  },
});
