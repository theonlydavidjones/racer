#!/usr/bin/env node
/**
 * Assemble the playable single-page build for the claude.ai artifact:
 *   npm run build:artifact   →   artifact/folkboat-racing-sim.html
 * Takes the markup from index.html, inlines the built CSS and JS, and maps `three` to jsDelivr
 * (pinned to the version in package.json) with an import map.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const threeVersion = JSON.parse(await readFile(new URL('node_modules/three/package.json', root), 'utf8')).version;
const assets = new URL('dist-artifact/assets/', root);
const files = await readdir(assets);
const js = files.find(f => f.endsWith('.js') && !f.startsWith('worker-')), css = files.find(f => f.endsWith('.css'));
// the race's worker (src/sim/worker.ts, built by Vite as one classic script): put in the page as a script element that
// isn't run, which the page starts the worker from (src/sim/spawn.ts). The claude.ai host lets a page start a worker
// from a blob URL, not from a data: URL (the owner's probe, 13 Nov 2026).
const workerJs = files.find(f => f.startsWith('worker-') && f.endsWith('.js'));
if (!js || !css || !workerJs) throw new Error('Run `vite build -c vite.artifact.config.ts` first');
const code = await readFile(new URL(js, assets), 'utf8');
const workerCode = await readFile(new URL(workerJs, assets), 'utf8');
if (workerCode.includes('</script')) throw new Error('worker bundle contains </script>, cannot inline');
const style = await readFile(new URL(css, assets), 'utf8');
if (code.includes('</script')) throw new Error('bundle contains </script>, cannot inline');

const html = await readFile(new URL('index.html', root), 'utf8');
const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>')).trim();
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();

const out = `${head}
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${style}
</style>
${body}
<script type="text/plain" id="sim-worker">${workerCode}</script>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js"}}</script>
<script type="module">
${code}
</script>
`;
await mkdir(new URL('artifact/', root), { recursive: true });
await writeFile(new URL('artifact/folkboat-racing-sim.html', root), out);
console.log(`artifact/folkboat-racing-sim.html: ${(out.length / 1024).toFixed(0)} KB (the race's worker ${(workerCode.length / 1024).toFixed(0)} KB of it), three@${threeVersion} from jsDelivr, sim v${pkg.version}`);
