import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';

// r286 (the owner): "this whole section can go away." The block of copy under Keys, "How to sail her", is gone.
describe('Settings has no "How to sail her" block of copy (r286)', () => {
  it('the page does not have it, and no comment points the player to it', () => {
    const html = readFileSync('index.html', 'utf8') as string;
    expect(html).not.toContain('How to sail her');
    expect(html).not.toMatch(/<div class="help">/);
    expect(readFileSync('src/ui/sailBand.ts', 'utf8')).not.toContain('How to sail her');
  });
});
