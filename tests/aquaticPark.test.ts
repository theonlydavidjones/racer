import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { LL } from '../src/geo/geo';
import { onLand, wharfNearest } from '../src/geo/shore';

// The navigator (the tiller pilot on Nav) round Aquatic Park's curved Municipal Pier and the Fisherman's Wharf
// breakwater, whose gap is Aquatic Park's way in (57 m between them, OpenStreetMap): in, out, and past the outside,
// with the westerly and a northwesterly (the owner: "at aquatic park, auto nav failed to navigate around the seawall").
// She gets there under the pilot alone, never touches, and keeps her hull off the piers (her centre 4 m or more from
// them: half her 7.6 m length, the most of her that can reach toward one).
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'flat', ...o });
const BASIN = LL(37.8075, -122.4250), WEST = LL(37.8110, -122.4330), EAST = LL(37.8140, -122.4120), NORTH = LL(37.8140, -122.4250);
const ROUTES: [string, typeof BASIN, typeof BASIN][] = [
  ['into the basin from the west', WEST, BASIN], ['into the basin from the east', EAST, BASIN],
  ['out of the basin to the west', BASIN, WEST], ['out of the basin to the north', BASIN, NORTH],
  ['past the pier, west to east', WEST, EAST], ['past the pier, east to west (a beat)', EAST, WEST]];
describe('the navigator round Aquatic Park', () => {
  for (const from of [270, 300]) for (const [name, a, b] of ROUTES) it(`${name}, wind from ${from}°`, () => {
    const w = new World(COURSES[0], S({ windDir: from }), 4, { freeSail: true }), u = w.user;
    expect(w.moveHere(a, 'start')).toBe(true);
    w.setDest(b, 'there'); u.h = (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360; u.v = 2;
    engage(u, w.pilot, 'nav');
    let closest = Infinity, touched = false;
    for (let t = 0; t < 30 * 60 && w.arrivedT == null; t += DT) {
      w.step(DT);
      if (onLand(u)) touched = true;
      const n = wharfNearest(u, 30); if (n) closest = Math.min(closest, n.d);
      expect(w.pilot.alarm ?? '', 'the pilot gave up').toBe('');
      expect(w.pilot.mode, 'the pilot let go').not.toBe('off');
    }
    expect(w.arrivedT, 'she got there').not.toBe(null);
    expect(touched).toBe(false);
    expect(closest).toBeGreaterThanOrEqual(4);
  }, 300000);
});
