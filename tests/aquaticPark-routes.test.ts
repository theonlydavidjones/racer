import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { LL } from '../src/geo/geo';
import { routeWork } from '../src/sim/routing';
import { CASES, QUICK, RECOVERY, S, caseTitle, recoverCase, sailCase } from './aquaticPark.shared';

// The navigator round Aquatic Park: every case but the quick slice tests/aquaticPark.test.ts sails (full suite only;
// test:fast leaves it out). The cases and the checks are tests/aquaticPark.shared.ts.
describe('the navigator round Aquatic Park', () => {
  for (const c of CASES.filter(c => !QUICK.includes(caseTitle(c)))) it(caseTitle(c), () => sailCase(c), 600000);
});

// Off Municipal Pier after touching it or stopped in irons (the first is in the quick slice, tests/aquaticPark.test.ts)
describe('the navigator off Municipal Pier, after touching it or stopped in irons', () => {
  for (const [name, at, h, from] of RECOVERY.slice(1)) it(name, () => recoverCase(at, h, from), 300000);
});

// Toward a slip inside a harbor ("Head home"), where the planner may find no way in: the navigator mustn't plan again
// every step (the sim slowed to half speed or worse). At most one plan every few seconds, and no searching in between
// (counted in the search's own land and pier tests, sim/routing.ts routeWork: a count, so a loaded machine can't fail it).
describe('the navigator toward a slip inside a harbor', () => {
  for (const [name, slip] of [['West Harbor, slip 101', LL(37.8072769, -122.440557)], ['Gashouse Cove, slip 2', LL(37.8058638, -122.4338858)]] as const) it(`${name}, from off Municipal Pier`, () => {
    const w = new World(COURSES[0], S({ windDir: 270 }), 4, { freeSail: true }), u = w.user, a = LL(37.8125, -122.4270);
    expect(w.moveHere(a, 'start')).toBe(true);
    w.setDest(slip, 'home'); u.h = 250; u.v = 2; engage(u, w.pilot, 'nav');
    let searching = 0, t = 0;
    for (; t < 10 * 60 && w.arrivedT == null && w.pilot.mode !== 'off'; t += DT) { const n0 = routeWork.n; w.step(DT); if (routeWork.n > n0) searching++; }
    expect(w.pilot.plans, 'times the way was worked out').toBeLessThanOrEqual(Math.ceil(t / 5) + 2);
    expect(searching, 'steps that searched for a way').toBeLessThan(Math.ceil(t / 5) + 5);
  }, 600000);
});
