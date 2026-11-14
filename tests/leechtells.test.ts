import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { leechFlow, leechTellAt, type LeechFlow } from '../src/render/sails';
import type { SailTrim } from '../src/boat/trim';
import type { Boat } from '../src/boat/boat';

/** On a course (deg, wind from 0) in `kt`, the crew trimming; `then` changes something and she sails on. */
function sailing(heading: number, kt: number, then?: (b: Boat) => void): Boat {
  const b = testBoat({ heading, kt: 5, windKt: kt });
  sail(b, 30, () => { b.h = courseHeading(b, heading); });
  if (then) { then(b); const h = b.h; sail(b, 20, () => { b.h = h; }); }
  return b;
}
/** How much of a minute the leech telltale at height fraction f curls, with the twist and trim as given. */
function curling(b: Boat, f: number, o: { twistBy?: number; err?: number } = {}): number {
  const trim: SailTrim = o.err == null ? b.trim.main : { ...b.trim.main, err: o.err };
  let n = 0;
  for (let t = 0; t < 60; t += 0.25) {
    const lf: LeechFlow = leechFlow(b, t);
    if (o.twistBy != null) lf.twist = lf.target + o.twistBy; // (the twist set against the fast one)
    if (leechTellAt(trim, b.awa, !!b.luff, lf, f, 0) === 'curl') n++;
  }
  return n / 240;
}
const TOP = 0.8, LOW = 0.2, BEAT = 318;

describe('the main\'s leech telltales, each from its own batten\'s section', () => {
  it('light air, the fast trim (twist on target, the trim spot on): the top one flies, the lower ones too', () => {
    const b = sailing(BEAT, 4);
    expect(curling(b, TOP, { twistBy: 0, err: 0 })).toBe(0); expect(curling(b, LOW, { twistBy: 0, err: 0 })).toBe(0);
  });
  it('light air, the leech closed (4° short of the fast twist) or the sheet hard (3° over): the top one curls', () => {
    const b = sailing(BEAT, 4);
    expect(curling(b, TOP, { twistBy: -5, err: 0 })).toBeGreaterThan(0.5);
    expect(curling(b, TOP, { twistBy: -2, err: 3 })).toBeGreaterThan(0.5);
    expect(curling(b, LOW, { twistBy: -4, err: 0 })).toBe(0); // (the head stalls first)
  });
  it('a medium breeze, sheeted for height at the fast trim: the top one on its curl line, stalled some of the time', () => {
    const b = sailing(BEAT, 10), top = curling(b, TOP, { twistBy: 0, err: 0 });
    expect(top).toBeGreaterThan(0.3); expect(top).toBeLessThan(0.7);
    expect(curling(b, LOW, { twistBy: 0, err: 0 })).toBe(0);
  });
  it('easing the leech open flies the top one; closing it curls it (medium breeze)', () => {
    const b = sailing(BEAT, 10);
    expect(curling(b, TOP, { twistBy: 3, err: 0 })).toBe(0);
    expect(curling(b, TOP, { twistBy: -3, err: 0 })).toBe(1);
  });
  it('depowered in a breeze, the leech open at the fast trim: the top one flies', () => {
    const b = sailing(BEAT, 22);
    expect(curling(b, TOP, { twistBy: 0, err: 0 })).toBe(0);
  });
  it('a beam reach at the fast trim: every leech telltale streams (ease till they all stream)', () => {
    const b = sailing(270, 10);
    for (const f of [0.2, 0.4, 0.6, 0.8]) expect(curling(b, f, { twistBy: 0, err: 0 })).toBe(0);
  });
  it('the sim\'s own: closing the leech with the vang and the sheet curls the top more than the crew\'s trim', () => {
    const crew = sailing(BEAT, 10), closed = sailing(BEAT, 10, b => { takeLine(b, 'vang'); (b.ctlTarget ??= {}).vang = 1; takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = 0; });
    expect(curling(closed, TOP)).toBeGreaterThan(curling(crew, TOP));
    expect(curling(closed, TOP)).toBeGreaterThanOrEqual(curling(closed, LOW));
  });
  it('a main sheeted hard on a reach is stalled all the way up: every leech telltale curls', () => {
    const b = sailing(250, 12, b => { takeLine(b, 'mainsheet'); (b.ctlTarget ??= {}).mainsheet = 0; });
    for (const f of [0.2, 0.4, 0.6, 0.8]) expect(curling(b, f)).toBe(1);
  });
  // (the crew's own light-air trim leaves the leech 1–3.6° closed against the fast twist, so the top one curls 20–40% of
  // the time where North's Folkboat guide eases it to fly: the sim's leech hold, which Deep Physics is fixing in its
  // weather-helm work (the sheet's lever and drop, controls.ts mainShape). Expected to fail until then.)
  it.fails('light air, the crew\'s own trim: the top one flies (North: "eased so that the top tell-tale flies straight")', () => {
    for (const kt of [3, 4, 6, 7]) expect(curling(sailing(BEAT, kt), TOP)).toBe(0);
  });
  it('running, or luffing on purpose: they hang', () => {
    const run = sailing(BEAT, 10); run.awa = 160; expect(leechTellAt(run.trim.main, run.awa, false, leechFlow(run, 0), TOP)).toBe('hang');
    const luff = sailing(BEAT, 10); expect(leechTellAt(luff.trim.main, luff.awa, true, leechFlow(luff, 0), TOP)).toBe('hang');
  });
});
