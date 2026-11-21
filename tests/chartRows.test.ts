import { describe, expect, it } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';

// w037: the planner's and the full chart's field pickers (Wind, Current, Waves, Fog, Off) were the same 650-odd
// characters of markup twice, hover texts and all. They're built from one list now (app.ts FIELD_PICKS).
describe('the chart-control rows (w037)', () => {
  const html = readFileSync('index.html', 'utf8') as string;
  it('the two field pickers are empty in the page, filled from one list', () => {
    for (const id of ['planField', 'chartField']) {
      const row = html.split('\n').find((l: string) => l.includes(`id="${id}"`))!;
      expect(row.length).toBeLessThan(120);
      expect(row).not.toContain('data-field');
    }
    const app = readFileSync('src/app.ts', 'utf8') as string;
    expect(app).toContain('FIELD_PICKS');
  });
});
