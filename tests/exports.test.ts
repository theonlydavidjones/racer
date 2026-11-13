// No module exports a binding it could reassign (scripts/export-guard.mjs): the published page's fallback hands on each
// chunk's exports as they are once it has run. make-artifact refuses to build with one; this finds it before a merge.
import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script, no types)
import { reassignableExports } from '../scripts/export-guard.mjs';

describe('the exports the published page can hand on', () => {
  it('no export let, export var or local export { } in src/ (export a const, a function or a class; re-export with from)', async () => {
    expect(await reassignableExports(new URL('../', import.meta.url))).toEqual([]);
  });
});
