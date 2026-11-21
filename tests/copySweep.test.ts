import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
const read = (f: string) => readFileSync(f, 'utf8') as string;
// The copy sweep (docs/ui/copy-sweep.md): the cuts, one block each.
describe('copy sweep A: the Past races card is one short line', () => {
  it('under 70 characters', () => {
    const t = /id="bPast"[^>]*><b>Past races<\/b><span>([^<]*)<\/span>/.exec(read('index.html'))?.[1] ?? '';
    expect(t.length).toBeGreaterThan(10); expect(t.length).toBeLessThanOrEqual(70);
  });
});
