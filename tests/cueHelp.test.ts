import { describe, it, expect } from 'vitest';

describe('the trim coach\'s diamond has its Coach-card help (r027)', () => {
  it('sailBand titles .sb-cue', async () => {
    // @ts-ignore node:fs for the source text
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/ui/sailBand.ts', 'utf8')).toContain("cue.dataset.help = 'Coach: trim to here'");
  });
});
