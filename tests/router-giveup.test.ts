// The router gives up a front that has lost the way (sim/router.ts GIVE_UP), and keeps one that is waiting.
// - Lost: from off Mile Rock to Gashouse Cove, leaving an hour after the test's panel asks (sailHome-mileRock), the
//   direct front came within 1.5 km of the cove, lost the way in, fell back 3.5 km across the Bay and searched it to its
//   360 minutes, every rescue ashore or blocked: ~25 s of the page's thread, for an answer the stretches gave the same to
//   the minute. Given up, it ends well short of that, and the passage goes stretch by stretch.
// - Waiting: from Coyote Point to the Gate at 07:30 in 14 kt, the front lay 500-700 m from the Gate for 70 minutes against
//   the flood and got through at 168. A front that holds its ground isn't lost, and is kept.
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { SLIPS, harborAt } from '../src/geo/marina';
import { LL } from '../src/geo/geo';
import { dist } from '../src/core/math';
import { outlookFor } from '../src/sim/outlook';
import { routeLegSteps } from '../src/sim/router';
import { passageNow } from '../src/sim/navigator';

describe('a front that has lost the way is given up; one that is waiting is kept', () => {
  it('Mile Rock to Gashouse Cove, the departure an hour on: the direct front gives up well short of its 360 minutes', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings, 1, { freeSail: true });
    w.step(DT); const p = LL(37.7955, -122.512); w.user.x = p.x; w.user.y = p.y; w.step(DT);
    const slip = SLIPS.find(s => s.marina === 'gashouse-cove')!.p; w.setDest(slip, 'Her slip');
    // (where she is 117 s on at 6 kt toward the Gate, and the cove's way in nearest her slip: navigator.ts outOfBasin)
    const V = 6 * 1852 / 3600, h = 75 * Math.PI / 180, E = 117, W = w as unknown as { t: number };
    const a = { x: p.x + Math.sin(h) * V * E, y: p.y + Math.cos(h) * V * E }; W.t += E;
    const H = harborAt(slip)!; let b = H.exits[0]; for (const x of H.exits) if (dist(x, slip) < dist(b, slip)) b = x;
    const g = routeLegSteps(outlookFor(w as never), a, { ...b }, w.clockUtc + 60, 30, 360); let r = g.next();
    while (!r.done) r = g.next();
    expect(r.value.ok).toBe(false);
    expect(r.value.minutes, 'the front searched on to its 360 minutes').toBeLessThan(150);
  }, 300_000);

  it('Coyote Point to the Gate at 07:30 in 14 kt: the front waiting on the flood is kept, and gets there at 168 minutes', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, mode: 'sail', sailFrom: 'm-CM2', sailTo: 'gate', tideDate: '2026-11-14', tideTime: '07:30', current: 'real', traffic: 0, fleet: 0, opponents: [] } as Settings, 7, { freeSail: true });
    const pn = passageNow(w as never)!;
    expect(pn.ok).toBe(true);
    expect(pn.minutes).toBeCloseTo(168.154, 2);
  }, 300_000);
});
