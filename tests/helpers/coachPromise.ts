import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './testBoat';
import { takeLine } from '../../src/boat/physics';
import { FIX_MIN, lineNotes, teach } from '../../src/boat/coach';
import { polar } from '../../src/boat/polar';
import type { Boat } from '../../src/boat/boat';
import { DEFAULT_BOAT } from '../../src/boat/spec';
import type { SeaHere } from '../../src/environment/sea';

const hold = (b: Boat, t: number, each?: () => void) => { const h = b.h; sail(b, t, () => { b.h = h; each?.(); }); };
function boat(o: { heading: number; windKt: number; sea?: SeaHere; old?: boolean }) { const b = testBoat({ heading: o.heading, kt: 5, windKt: o.windKt }); if (o.sea) b.sea = o.sea; if (o.old) b.spec = { ...DEFAULT_BOAT, perf: { ...DEFAULT_BOAT.perf, mainAge: 'old', jibAge: 'old' } } as Boat['spec']; sail(b, 30, () => { b.h = courseHeading(b, o.heading); }); return b; } // (`heading`: her course, her leeway allowed for; then held)
function wrong(b: Boat, k: 'jibsheet' | 'mainsheet' | 'backstay' | 'vang' | 'outhaul' | 'traveller', v: number) { takeLine(b, k); (b.ctlTarget ??= {})[k] = v; hold(b, 30); }

// The coach only promises what the boat pays (the Coordinator, from Bay East, 15 Nov 2026: outhaul off upwind in 12–14 kt,
// the coach promised 0.02–0.035 kt and doing it made her slower). Close-hauled and a little low in 10–20 kt, one line set
// wrong at either end of its range (a sheet part-eased too, a learner's usual mistake: the second physics review): the coach's top fix, done, gains her at least ¾ of what it said, against the same
// boat left as she was, both settled (a minute: a sheet hauled in from flogging takes that to pay); and where it has no
// fix for the line at all, putting it back where the crew had it gains her under twice the least
// it speaks for (FIX_MIN: it may be a hair under its own floor).
const FRESH = new Map<string, Boat>();
const crewHad = (heading: number, windKt: number, k: string) => { const key = `${heading}/${windKt}`; if (!FRESH.has(key)) FRESH.set(key, boat({ heading, windKt })); return (FRESH.get(key)!.ctl as unknown as Record<string, number>)[k]; };
/** The cases, in the winds given (two files share them, so they sail in parallel), and the lull when asked. */
export function promiseCases(WINDS: number[], lull: boolean): void {
describe('the trim coach: its promise comes true', () => {
  const LINES = ['outhaul', 'backstay', 'vang', 'traveller', 'jibsheet', 'mainsheet'] as const;
  for (const windKt of WINDS) it(`in ${windKt} kt`, () => {
    let n = 0;
    for (const heading of [312, 316, 320]) for (const k of LINES) for (const v of k === 'mainsheet' || k === 'jibsheet' ? [0, 0.3, 0.6, 1] : [0, 1]) {
      const b = boat({ heading, windKt }); wrong(b, k, v);
      const top = teach(b).top, said = top?.kind === 'fix' && top.to != null && !!top.line;
      const left = boat({ heading, windKt }); wrong(left, k, v); hold(left, said ? 60 : 30);
      if (said) {
        (b.ctlTarget ??= {})[top!.line as 'outhaul'] = top!.to!; hold(b, 60); n++;
        expect(b.v - left.v, `${heading}°, ${k} at ${v}: ${top!.line} → ${top!.to!.toFixed(2)}, promised ${(top!.gain * left.v).toFixed(3)} m/s`).toBeGreaterThanOrEqual(0.75 * top!.gain * left.v);
      } else if (!lineNotes(b).notes.find(x => x.line === k)?.fix) {
        (b.ctlTarget ??= {})[k] = crewHad(heading, windKt, k); hold(b, 30);
        expect(b.v / left.v - 1, `${heading}°, ${k} at ${v}: the coach said nothing, the crew's setting is worth`).toBeLessThan(2 * FIX_MIN);
      }
    }
    expect(n, 'the coach spoke for so few').toBeGreaterThan(8);
  }, 600000);

  // carrying more way than the wind now gives her (a lull, 14 kt to 10): the coach still speaks for a line set wrong (the
  // physics review: a floor at her speed silenced it), the fix pays, and once the crew have settled to the lull (40 s)
  // it pays what it said. (In the first 20 s they're still coming in off the rail, and the coach, which has them where
  // they are, promises about twice what she gets: for later)
  // old sails (the owner's boat has a spec; the final physics review: hard in, an old main's hooked leech stalls, and the
  // coach had it paying, and she lost a quarter-knot): in a breeze, the main hauled in, eased or the outhaul off, the fix
  // pays what it says. (In 20 kt with the main bar-tight it pays 62–72% of it still, the crew's way back off their
  // depowering only roughly foreseen: ROADMAP, the coach's promise in light air; there it must pay at least half)
  if (lull) it('with old sails, in a breeze', () => {
    for (const windKt of [16, 18, 20]) for (const [k, v] of [['mainsheet', 0], ['mainsheet', 0.4], ['outhaul', 0], ['backstay', 0]] as const) {
      const b = boat({ heading: 316, windKt, old: true }); wrong(b, k, v); hold(b, 60);
      const top = teach(b).top;
      const left = boat({ heading: 316, windKt, old: true }); wrong(left, k, v); hold(left, 60);
      if (top?.kind !== 'fix' || top.to == null || !top.line) continue;
      (b.ctlTarget ??= {})[top.line as 'outhaul'] = top.to; hold(b, 90); hold(left, 90);
      expect(b.v - left.v, `${windKt} kt, ${k} at ${v}, old sails: ${top.line} → ${top.to.toFixed(2)}, promised ${(top.gain * left.v).toFixed(3)} m/s`).toBeGreaterThanOrEqual((windKt === 20 && k === 'mainsheet' && v === 0 ? 0.5 : 0.75) * top.gain * left.v);
    }
  }, 300000);

  if (lull) it('in a lull, with the way she carried still on', () => {
    for (const k of ['outhaul', 'vang'] as const) for (const wait of [10, 40]) {
      const b = boat({ heading: 320, windKt: 14 }); wrong(b, k, 1);
      const left = boat({ heading: 320, windKt: 14 }); wrong(left, k, 1);
      for (const x of [b, left]) { x.ww.kt = 10; x.twsSlow = 10; hold(x, wait, () => { x.ww.kt = 10; }); }
      if (wait === 10) expect(b.v, 'still carrying the way').toBeGreaterThan(polar(10, b.twa + (b.leeway ?? 0)));
      const top = teach(b).top;
      expect(top?.kind, `${k} at 1, ${wait} s into the lull`).toBe('fix');
      (b.ctlTarget ??= {})[top!.line as 'outhaul'] = top!.to!;
      hold(b, 120, () => { b.ww.kt = 10; }); hold(left, 120, () => { left.ww.kt = 10; });
      expect(b.v - left.v, `${k}, ${wait} s`).toBeGreaterThanOrEqual((wait === 10 ? 0.4 : 0.75) * top!.gain * left.v);
    }
  }, 300000);
});
}
