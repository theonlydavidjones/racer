import { describe, expect, it, vi } from 'vitest';

// (w041) The rose on the water and lesson 4 agree on every band's edges, whatever her beat angle, past 67° too, where
// the lesson holds close-hauled below the beam reach. Her beat angle comes from the wind and sea (beatFor); it's set here.
let BEAT = 42;
vi.mock('../src/boat/seaway', async (orig) => ({ ...(await orig<typeof import('../src/boat/seaway')>()), beatFor: () => BEAT }));
const { pointBand } = await import('../src/sim/lessons');
const { roseEdges } = await import('../src/render/windRose');

describe('The points of sail on the water and lesson 4 agree (render/windRose.ts, sim/lessons.ts)', () => {
  it('every band\'s edges are the lesson\'s, from a usual beat angle to one past 67°', () => {
    const boat = {} as Parameters<typeof pointBand>[1];
    for (const beat of [36, 42, 50, 66, 68, 70, 80]) {
      BEAT = beat;
      const e = roseEdges(beat), bands = [0, 1, 2, 3, 4].map(k => pointBand(k, boat));
      // (rose bands: close [e0, e1], close reach [e1, e2], beam [e2, e3], broad [e3, e4], run [e4, 180])
      expect(bands, `beat ${beat}`).toEqual([[e[0], e[1]], [e[1], e[2]], [e[2], e[3]], [e[3], e[4]], [e[4], 180]]);
      for (let i = 1; i < e.length; i++) expect(e[i], `beat ${beat}: edge ${i}`).toBeGreaterThanOrEqual(e[i - 1]); // (never crossing)
    }
  });
});
