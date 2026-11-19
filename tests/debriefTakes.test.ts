import { describe, expect, it } from 'vitest';
// @ts-ignore node's fs: the css can't come in through ?raw (vite returns it empty)
import { readFileSync } from 'node:fs';

// The debrief's tactical chart is a fixed 560 px wide; in the results panel the "take" column beside it was left about
// 29 px, so "Even with the fleet" wrapped a word a line and the rows overlapped (second panel sweep, 18 Nov).
describe('debrief tactical chart', () => {
  const css: string = readFileSync('src/styles/09-audit.css', 'utf8');
  it('lets the takes column wrap under the chart instead of being squeezed', () => {
    expect(css).toMatch(/\.tgrid\{[^}]*flex-wrap:wrap/);
    expect(css).toMatch(/\.ttakes\{[^}]*min-width:1[2-9]\d+px/);
  });
});
