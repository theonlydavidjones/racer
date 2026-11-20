import { describe, it, expect } from 'vitest';
import { ORDER_S, orderOver } from '../src/render/labels';

describe('the helm\'s order leaves soon after it is called (r032)', () => {
  it('holds under a second, and not before she is put over', () => {
    expect(ORDER_S).toBeLessThan(1);
    expect(orderOver(null, 100)).toBe(false);
    expect(orderOver(100, 100 + ORDER_S - 0.01)).toBe(false);
    expect(orderOver(100, 100 + ORDER_S + 0.01)).toBe(true);
  });
});

describe('the trim coach\'s diamond has its hover tip (r027)', () => {
  it('sailBand titles .sb-cue', async () => {
    // @ts-ignore node:fs for the source text
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/ui/sailBand.ts', 'utf8')).toContain("cue.title = 'Coach: trim to here'");
  });
});
