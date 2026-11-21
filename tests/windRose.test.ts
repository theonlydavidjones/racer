import { describe, expect, it } from 'vitest';
import { ROSE_POINTS, roseEdges } from '../src/render/windRose';

// (w041) The wind lesson's band edges (render/windRose.ts roseEdges, lesson 4's own: close-hauled from her beat angle)
describe('The points of sail on the water: their band edges (render/windRose.ts)', () => {
  it('for every beat angle a Folkboat sails, 35° to 50°, the edges rise strictly, inside 0°–180°, one fewer than the bands', () => {
    for (let beat = 35; beat <= 50; beat += 0.5) {
      const e = roseEdges(beat);
      expect(e.length).toBe(ROSE_POINTS.length - 1);
      expect(e[0]).toBeGreaterThan(0); expect(e[e.length - 1]).toBeLessThan(180);
      for (let i = 1; i < e.length; i++) expect(e[i], `beat ${beat}: edge ${i}`).toBeGreaterThan(e[i - 1]);
    }
  });
  it('close-hauled is the lesson\'s: from 3° inside her beat angle to 8° outside it; then 75°, 105° and 160°', () => {
    expect(roseEdges(42)).toEqual([39, 50, 75, 105, 160]);
    expect(roseEdges(35)[1] - roseEdges(35)[0]).toBe(11);
  });
});
