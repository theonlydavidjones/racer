import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { teach } from '../src/boat/coach';
import type { Boat } from '../src/boat/boat';
import type { SeaHere } from '../src/environment/sea';

const hold = (b: Boat, t: number, each?: () => void) => { const h = b.h; sail(b, t, () => { b.h = h; each?.(); }); };
function boat(o: { heading: number; windKt: number; sea?: SeaHere }) { const b = testBoat({ heading: o.heading, kt: 5, windKt: o.windKt }); if (o.sea) b.sea = o.sea; sail(b, 30, () => { b.h = courseHeading(b, o.heading); }); return b; } // (`heading`: her course, her leeway allowed for; then held)
function wrong(b: Boat, k: 'jibsheet' | 'mainsheet' | 'backstay' | 'vang' | 'outhaul' | 'traveller', v: number) { takeLine(b, k); (b.ctlTarget ??= {})[k] = v; hold(b, 30); }

// The coach only promises what the boat pays (the Coordinator, from Bay East, 15 Nov 2026: outhaul off upwind in 12–14 kt,
// the coach promised 0.02–0.035 kt and doing it made her slower). Close-hauled and a little low in 10–20 kt, one line set
// wrong at either end of its range: the coach's top fix, done, gains her at least ¾ of what it said, against the same
// boat left as she was.
describe('the trim coach: its promise comes true', () => {
  const LINES = ['outhaul', 'backstay', 'vang', 'traveller', 'jibsheet', 'mainsheet'] as const;
  for (const windKt of [10, 12, 14, 16, 18, 20]) it(`in ${windKt} kt`, () => {
    let n = 0;
    for (const heading of [312, 316, 320]) for (const k of LINES) for (const v of [0, 1]) {
      const b = boat({ heading, windKt }); wrong(b, k, v);
      const top = teach(b).top;
      if (top?.kind !== 'fix' || top.to == null || !top.line) continue;
      const left = boat({ heading, windKt }); wrong(left, k, v); hold(left, 30);
      (b.ctlTarget ??= {})[top.line as 'outhaul'] = top.to; hold(b, 30);
      n++;
      expect(b.v - left.v, `${heading}°, ${k} at ${v}: ${top.line} → ${top.to.toFixed(2)}, promised ${(top.gain * left.v).toFixed(3)} m/s`).toBeGreaterThanOrEqual(0.75 * top.gain * left.v);
    }
    expect(n).toBeGreaterThan(3);
  }, 600000);
});
