import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { leechFlow, leechTellAt } from '../src/render/sails';
import type { Boat } from '../src/boat/boat';

/** Close-hauled in `kt`, the crew trimming; `then` changes something and she sails on. */
function beating(kt: number, then?: (b: Boat) => void): Boat {
  const b = testBoat({ heading: 318, kt: 5, windKt: kt });
  sail(b, 30, () => { b.h = courseHeading(b, 318); });
  if (then) { then(b); const h = b.h; sail(b, 20, () => { b.h = h; }); }
  return b;
}
/** How much of a minute the leech telltale at height fraction f curls behind the sail. */
const curling = (b: Boat, f: number) => {
  let n = 0; for (let t = 0; t < 60; t += 0.25) if (leechTellAt(b.trim.main, b.awa, !!b.luff, leechFlow(b, t), f, 0) === 'curl') n++;
  return n / 240;
};
const TOP = 0.8, LOW = 0.2;

describe('the main\'s leech telltales, each from its own batten\'s flow (North Sails\' Folkboat guide)', () => {
  it('light air, the crew\'s trim: the top one flies ("the mainsheet is eased so that the top tell-tale flies straight")', () => {
    const b = beating(4);
    expect(curling(b, TOP)).toBe(0); expect(curling(b, LOW)).toBe(0);
  });
  it('a medium breeze, sheeted for height: the top one stalled some of the time, near half, the lower ones flying', () => {
    const b = beating(10), top = curling(b, TOP);
    expect(top).toBeGreaterThan(0.1); expect(top).toBeLessThan(0.8);
    expect(curling(b, LOW)).toBe(0);
  });
  it('the top one stalls first: closing the leech (the vang hard on, the twist taken out) curls it before the lower ones', () => {
    const b = beating(10, b => { takeLine(b, 'vang'); (b.ctlTarget ??= {}).vang = 1; takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = 0; });
    expect(curling(b, TOP)).toBeGreaterThan(curling(beating(10), TOP));
    expect(curling(b, TOP)).toBeGreaterThanOrEqual(curling(b, LOW));
  });
  it('easing the sheet makes the top one fly', () => {
    const b = beating(10, b => { takeLine(b, 'mainsheet'); (b.ctlTarget ??= {}).mainsheet = Math.min(1, b.ctl.mainsheet + 0.15); });
    expect(curling(b, TOP)).toBeLessThan(curling(beating(10), TOP));
  });
  it('a main sheeted hard on a reach is stalled all the way up: every leech telltale curls', () => {
    const b = testBoat({ heading: 250, kt: 5, windKt: 12 }); sail(b, 30, () => { b.h = courseHeading(b, 250); });
    takeLine(b, 'mainsheet'); (b.ctlTarget ??= {}).mainsheet = 0; const h = b.h; sail(b, 20, () => { b.h = h; });
    for (const f of [0.2, 0.4, 0.6, 0.8]) expect(curling(b, f)).toBe(1);
  });
  it('running, or luffing on purpose: they hang', () => {
    const run = beating(10); run.awa = 160; expect(leechTellAt(run.trim.main, run.awa, false, leechFlow(run, 0), TOP)).toBe('hang');
    const luff = beating(10); expect(leechTellAt(luff.trim.main, luff.awa, true, leechFlow(luff, 0), TOP)).toBe('hang');
  });
});
