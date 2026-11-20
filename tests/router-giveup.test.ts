// The router gives up a front that has lost the way (sim/router.ts GIVE_UP), and keeps one that is waiting.
// - Lost: from off Mile Rock to Gashouse Cove, leaving an hour after the test's panel asks (sailHome-mileRock), the
//   direct front came within ~130 m of the cove's way in, lost it, fell back ~3.8 km across the Bay and searched it to its
//   360 minutes, every rescue ashore or blocked: ~25 s of the page's thread, for the answer the stretches give. Given
//   up, it ends well short of that, and the passage's answer is the same (42.536 min, as on main).
// - Waiting, set back: stemming a spring ebb into the Gate in 4 kt (25 Nov 14:30), the front is carried backward from
//   the start and gets through on the turn at 168.1 minutes (Deep Physics' review: given up on the stall and the retreat
//   alone, it couldn't get there).
// - Waiting, holding on: from Coyote Point to the Gate at 07:30 in 14 kt, the front lay 500-700 m from the Gate for 70
//   minutes against the flood and got through at 168.2 (given up on the stall and a dead way alone, it couldn't either).
// - And the give-up is the passage's direct try's alone (it then goes stretch by stretch): asked of the router in general,
//   it cut a long wait on the foul tide in Raccoon Strait (Belvedere Point to Ayala Cove against the ebb in 5 kt, 25 Nov
//   15:00), given up at 218 min where it arrives at 327.5 (Deep Physics' second review; 326.5 since beat-chop read the drive table between its rows; 326.6 since the beat in a light chop lost its lean toward the wind, beat-smooth; 326.5 since no chop takes her closer than flat water, the v213 review). Not asked, the router gets there.
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { SLIPS, harborAt } from '../src/geo/marina';
import { LL } from '../src/geo/geo';
import { dist } from '../src/core/math';
import { outlookFor } from '../src/sim/outlook';
import { routeLeg, routeLegSteps } from '../src/sim/router';
import { passageNow } from '../src/sim/navigator';

const sail = (o: Partial<Settings>) => ({ ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', traffic: 0, fleet: 0, opponents: [], windKind: 'west', ...o } as Settings);

describe('a front that has lost the way is given up; one that is waiting is kept', () => {
  it('Mile Rock to Gashouse Cove, the departure an hour on: the direct front gives up well short of its 360 minutes, and the passage is the same', () => {
    const w = new World(COURSES[0], sail({ tideDate: '2026-11-14', windKt: 14 }), 1, { freeSail: true });
    w.step(DT); const p = LL(37.7955, -122.512); w.user.x = p.x; w.user.y = p.y; w.step(DT);
    const slip = SLIPS.find(s => s.marina === 'gashouse-cove')!.p; w.setDest(slip, 'Her slip');
    // (where she is 117 s on at 6 kt toward the Gate, and the cove's way in nearest her slip: navigator.ts outOfBasin)
    const V = 6 * 1852 / 3600, h = 75 * Math.PI / 180, E = 117, W = w as unknown as { t: number };
    const a = { x: p.x + Math.sin(h) * V * E, y: p.y + Math.cos(h) * V * E }; W.t += E;
    const H = harborAt(slip)!; let b = H.exits[0]; for (const x of H.exits) if (dist(x, slip) < dist(b, slip)) b = x;
    const g = routeLegSteps(outlookFor(w as never), a, { ...b }, w.clockUtc + 60, 30, 360, undefined, Infinity, true); let r = g.next();
    while (!r.done) r = g.next();
    expect(r.value.ok).toBe(false);
    expect(r.value.minutes, 'the front searched on to its 360 minutes').toBeLessThan(150);
    // the passage leaving then, from there: the same answer as before the give-up (main 1bbb6822)
    w.user.x = a.x; w.user.y = a.y; W.t += 3600;
    const pn = passageNow(w as never)!;
    expect(pn.ok).toBe(true); expect(pn.minutes).toBeCloseTo(42.536, 3);
  }, 300_000);

  it('into the Gate against a spring ebb in 4 kt: the front set back from the start is kept, and gets through at 168 minutes', () => {
    const w = new World(COURSES[0], sail({ tideDate: '2026-11-25', tideTime: '14:30', windKt: 4 }), 7, { freeSail: true });
    w.step(DT); const p = LL(37.806, -122.505); w.user.x = p.x; w.user.y = p.y; w.step(DT); w.setDest(LL(37.818, -122.455), 'off Crissy');
    const pn = passageNow(w as never)!;
    expect(pn.ok).toBe(true); expect(pn.minutes).toBeCloseTo(168.114, 2);
  }, 300_000);

  it('Coyote Point to the Gate at 07:30 in 14 kt: the front waiting on the flood is kept, and gets there at 168 minutes', () => {
    const w = new World(COURSES[0], sail({ windKt: 14, sailFrom: 'm-CM2', sailTo: 'gate', tideDate: '2026-11-14', tideTime: '07:30' }), 7, { freeSail: true });
    const pn = passageNow(w as never)!;
    expect(pn.ok).toBe(true); expect(pn.minutes).toBeCloseTo(168.154, 2);
  }, 300_000);

  it('Raccoon Strait eastbound against the ebb in 5 kt: the router, not asked to give up, waits it out and gets there at 326.5 minutes', () => {
    const w = new World(COURSES[0], sail({ tideDate: '2026-11-25', tideTime: '12:00', windKt: 5 }), 1, { freeSail: true });
    w.step(DT);
    const r = routeLeg(outlookFor(w as never), LL(37.8655, -122.456), LL(37.871, -122.435), w.clockUtc + 180, 30, 360); // (leaving 15:00)
    expect(r.ok).toBe(true); expect(r.minutes).toBeCloseTo(326.464, 2);
  }, 300_000);
});
