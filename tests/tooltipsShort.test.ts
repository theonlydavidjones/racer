import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8') as string;
const titleOf = (id: string) => new RegExp(`id="${id}"[^>]*?title="([^"]*)"`).exec(html)?.[1] ?? '';

// w031: the next card's and the ensign's tooltips were paragraph-length; one line each now (about 70 characters at most).
describe('the next card and the ensign button have one-line tooltips (w031)', () => {
  it('next card', () => { const t = titleOf('nextCard'); expect(t.length).toBeGreaterThan(10); expect(t.length).toBeLessThanOrEqual(72); });
  it('ensign', () => { const t = titleOf('bEnsign'); expect(t.length).toBeGreaterThan(10); expect(t.length).toBeLessThanOrEqual(72); });
});
