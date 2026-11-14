import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { LL } from '../src/geo/geo';
import { onLand, wharfNearest } from '../src/geo/shore';
import { routeAround } from '../src/sim/routing';

// The navigator (the tiller pilot on Nav) round Aquatic Park's curved Municipal Pier and the Fisherman's Wharf
// breakwater, whose gap is Aquatic Park's way in (57 m between them, OpenStreetMap): in, out, and past the outside,
// with the westerly and a northwesterly (the owner: "at aquatic park, auto nav failed to navigate around the seawall").
// She gets there under the pilot alone, never touches anything (the hull's own bump, collision or aground), and keeps
// her hull off the piers (her centre 7 m or more from them away from where she starts and finishes: half her 7.6 m
// length and a few metres; the route keeps 10 m). The way is worked out now and then, not every step, and she doesn't
// tack and tack again. She starts on the way out, pointed along the route's first leg, as a sailor casts off.
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'flat', ...o });
const HYDE = LL(37.8095, -122.4218), PIER39 = LL(37.8105, -122.4092), NW = LL(37.8250, -122.4450), BASIN = LL(37.8075, -122.4250), WEST = LL(37.8110, -122.4330), EAST = LL(37.8140, -122.4120), NORTH = LL(37.8140, -122.4250);
// (her centre off the piers: 7 m in open water; in a marina's fairways, 20-30 m between its docks, the route keeps 5 m)
const ROUTES: [string, typeof BASIN, typeof BASIN, number?][] = [
  ['into the basin from the west', WEST, BASIN], ['into the basin from the east', EAST, BASIN],
  ['out of the basin to the west', BASIN, WEST], ['out of the basin to the north', BASIN, NORTH],
  ['past the pier, west to east', WEST, EAST], ['past the pier, east to west (a beat)', EAST, WEST],
  ['out of the basin, northwest toward Sausalito', BASIN, NW], ['out of the Pier 39 marina to the west', PIER39, WEST, 4],
  ['into Hyde Street harbor from the east', EAST, HYDE, 4], ['into Hyde Street harbor from the west', WEST, HYDE, 4]];
/** A heading along the route's first leg from a to b. */
const firstLeg = (a: typeof BASIN, b: typeof BASIN) => { const r = routeAround(a, b, 30), q = r[1]; return (Math.atan2(q.x - a.x, q.y - a.y) * 180 / Math.PI + 360) % 360; };
// (the hull's own contact messages, boat/physics.ts travel(): not the traffic warnings, which cite the Collision Regulations)
const CONTACT = /^Collision: |^Bump: |^Aground!|touched bottom|been set sideways onto/;
const bumped = (w: World) => (w.drainEvents() as { msg?: string }[]).some(e => !!e.msg && CONTACT.test(e.msg));
describe('the navigator round Aquatic Park', () => {
  for (const from of [270, 300, 0]) for (const [name, a, b, berth = 7] of ROUTES) it(`${name}, wind from ${from}°`, () => {
    const w = new World(COURSES[0], S({ windDir: from }), 4, { freeSail: true }), u = w.user;
    expect(w.moveHere(a, 'start')).toBe(true);
    w.setDest(b, 'there'); u.h = firstLeg(a, b); u.v = 2;
    engage(u, w.pilot, 'nav');
    let closest = Infinity, touched = false, slowest = 0, slowSteps = 0, lastTackAt = -Infinity, tackGap = Infinity, wasTacking = false;
    for (let t = 0; t < 45 * 60 && w.arrivedT == null; t += DT) {
      const t0 = performance.now(); w.step(DT); const ms = performance.now() - t0; slowest = Math.max(slowest, ms); if (ms > 50) slowSteps++;
      if (onLand(u) || bumped(w)) touched = true;
      if (Math.hypot(u.x - a.x, u.y - a.y) > 80 && Math.hypot(u.x - b.x, u.y - b.y) > 80) { const n = wharfNearest(u, 30); if (n) closest = Math.min(closest, n.d); }
      if (u.tacking && !wasTacking) { tackGap = Math.min(tackGap, t - lastTackAt); lastTackAt = t; }
      wasTacking = !!u.tacking;
      expect(w.pilot.alarm ?? '', 'the pilot gave up').toBe('');
      expect(w.pilot.mode, 'the pilot let go').not.toBe('off');
    }
    expect(w.arrivedT, 'she got there').not.toBe(null);
    expect(touched, 'touched something').toBe(false);
    expect(closest, 'her centre off the piers').toBeGreaterThanOrEqual(berth);
    expect(w.pilot.plans, 'times the way was worked out').toBeLessThan(40);
    // (a route's worked out now and then, a tenth of a second or so among the Wharf's docks: not every step)
    expect(slowest, 'the slowest step, ms').toBeLessThan(500);
    expect(slowSteps, 'steps over 50 ms').toBeLessThan(12);
    expect(tackGap, 'the shortest time between two tacks, s').toBeGreaterThan(10);
  }, 600000);
});

// Leaving the basin she hit the wall and "just kinda sat there" (the owner): the pilot let go the moment she drifted
// astern, with the tiller hard over. Now, touching the pier or stopped head to wind, it gets her off and out.
describe('the navigator off Municipal Pier, after touching it or stopped in irons', () => {
  const OUT = LL(37.8110, -122.4330);
  for (const [name, at, h, from] of [
    ['reached onto the pier\'s inner face (wind from N)', LL(37.8092, -122.4255), 270, 0],
    ['reached onto the pier\'s inner face (wind from SSW)', LL(37.8092, -122.4255), 270, 200],
    ['stopped head to wind in the basin (northwesterly)', LL(37.8090, -122.4255), 300, 300]] as const) it(name, () => {
    const w = new World(COURSES[0], S({ windDir: from }), 4, { freeSail: true }), u = w.user;
    expect(w.moveHere(at, 'start')).toBe(true);
    u.h = h; u.v = from === h ? 0 : 2.5;
    let touched = false;
    const hits = () => bumped(w);
    if (from !== h) { for (let t = 0; t < 45; t += DT) { w.step(DT); if (hits()) touched = true; } expect(touched, 'she reached the pier').toBe(true); }
    w.setDest(OUT, 'out'); engage(u, w.pilot, 'nav');
    let lastHit = 0, t = 0;
    for (; t < 15 * 60 && w.arrivedT == null; t += DT) {
      w.step(DT); if (hits()) lastHit = t;
      expect(w.pilot.mode, `the pilot let go at ${t.toFixed(0)} s: ${w.pilot.alarm ?? ''}`).not.toBe('off');
    }
    expect(w.arrivedT, 'she got out').not.toBe(null);
    expect(lastHit, 'off the wall soon, not bumping along it').toBeLessThan(90);
  }, 300000);
});

// Toward a slip inside a harbor ("Head home"), where the planner may find no way in: the navigator mustn't plan again
// every step (the sim slowed to half speed or worse). At most one plan every few seconds, and no long steps.
describe('the navigator toward a slip inside a harbor', () => {
  for (const [name, slip] of [['West Harbor, slip 101', LL(37.8072769, -122.440557)], ['Gashouse Cove, slip 2', LL(37.8058638, -122.4338858)]] as const) it(`${name}, from off Municipal Pier`, () => {
    const w = new World(COURSES[0], S({ windDir: 270 }), 4, { freeSail: true }), u = w.user, a = LL(37.8125, -122.4270);
    expect(w.moveHere(a, 'start')).toBe(true);
    w.setDest(slip, 'home'); u.h = 250; u.v = 2; engage(u, w.pilot, 'nav');
    let slowSteps = 0, t = 0;
    for (; t < 10 * 60 && w.arrivedT == null && w.pilot.mode !== 'off'; t += DT) { const t0 = performance.now(); w.step(DT); if (performance.now() - t0 > 50) slowSteps++; }
    expect(w.pilot.plans, 'times the way was worked out').toBeLessThanOrEqual(Math.ceil(t / 5) + 2);
    expect(slowSteps, 'steps over 50 ms').toBeLessThan(Math.ceil(t / 5) + 5);
  }, 600000);
});
