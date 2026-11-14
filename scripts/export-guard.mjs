/**
 * Exports a module could reassign (docs/CAPACITY.md, "One copy of the sim's code"): `export let`, `export var`, or a
 * local `export { … }` list (it may name a let). If the published page's blob modules are refused, its start-up script
 * puts the chunks together as one module and hands on each chunk's exports as they are once it has run
 * (scripts/artifact-boot.js), which is exact only if no export is ever reassigned. scripts/make-artifact.mjs refuses
 * to build with one, and tests/exports.test.ts fails on one, so a pull request finds it before it's merged.
 * (Export a const, a function or a class; a re-export, `export { x } from '…'`, is fine.)
 */
import { readdir, readFile } from 'node:fs/promises';

const REASSIGNABLE = /^\s*export\s+(?:let|var)\s|^\s*export\s*\{(?![^}]*\}\s*from)/m;

/** Every src/ file with one, and what it is: [] when there are none. `root`: the repository's URL (ends in /). */
export async function reassignableExports(root) {
  const files = (await readdir(new URL('src/', root), { recursive: true })).filter(f => f.endsWith('.ts')).sort();
  const found = [];
  for (const f of files) {
    const m = REASSIGNABLE.exec(await readFile(new URL(`src/${f}`, root), 'utf8'));
    if (m) found.push(`src/${f}: ${m[0].trim()}…`);
  }
  return found;
}
