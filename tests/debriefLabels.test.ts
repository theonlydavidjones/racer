import { describe, expect, it } from 'vitest';
import { tacticsHtml } from '../src/ui/tacticsView';

// Two boats off the scale by the same seconds printed "+62 s" twice, piled on one spot (second panel sweep, 18 Nov).
describe('debrief chart off-scale labels', () => {
  it('prints one label for boats off the scale by the same seconds', () => {
    const T: any = { top: [], idealTotal: null, rows: [{ i: 1, name: 'A', kind: 'run', times: [100, 300, 300], mid: 100, best: { id: 0, t: 100 }, ideal: null, vsMid: 0, causes: {}, side: null, take: 'x', t0: 0, t1: 1 }] };
    const boats = [{ id: 0, name: 'You', color: '#fff' }, { id: 1, name: 'Red', color: '#f00' }, { id: 2, name: 'Blue', color: '#00f' }];
    const html = tacticsHtml(T, boats, 0, { best: false, ideal: false, boats: new Set([1, 2]) } as any);
    expect((html.match(/>−200 s</g) ?? []).length).toBe(1);
  });
});
