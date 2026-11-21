import { describe, expect, it } from 'vitest';
import { tacticsHtml } from '../src/ui/tacticsView';
import type { Tactics } from '../src/replay/tactics';

// (the debrief stills, 21 Nov 2026: two boats off the chart on one side, "−128 s" and "−145 s", sat on top of each other)
describe('the tactics chart: boats off its scale', () => {
  it('two labels at one edge stack far enough apart to read', () => {
    const T = { rows: [{ i: 3, name: 'X', kind: 'run', times: [400, 383, 255], mid: 255, best: { id: 2, t: 255 }, ideal: null, causes: {}, side: null, take: '', vsMid: 145, t0: 0, t1: 0 }], top: [], idealTotal: null } as unknown as Tactics;
    const boats = [{ id: 0, name: 'You', color: '#fff' }, { id: 1, name: 'Red', color: '#f00' }, { id: 2, name: 'Blue', color: '#00f' }];
    const html = tacticsHtml(T, boats, 0, { best: false, ideal: false, boats: new Set([1, 2]) });
    const ys = [...html.matchAll(/<text x="[\d.]+" y="(-?[\d.]+)" fill="[^"]+" font-size="10" text-anchor="start">−\d+ s<\/text>/g)].map(m => +m[1]);
    expect(ys).toHaveLength(2);
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(13);
  });
});
