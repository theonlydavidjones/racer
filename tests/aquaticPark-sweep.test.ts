import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { LL } from '../src/geo/geo';
import { onLand, wharfNearest } from '../src/geo/shore';
import { routeAround } from '../src/sim/routing';

// The navigator's hard cases round Aquatic Park and the Wharf, each sailed over six seeds (the wind's gusts and shifts
// differ by seed): a measured baseline (the Coordinator, 14 Nov 2026). Every run must arrive with the pilot still steering.
// Each run is clean (no contact, her center off the piers by the berth) except the known limits listed by seed with
// why. A known limit that comes clean fails too, so an improvement shows and the list is kept true.
// (Full suite only: about 48 runs of up to 90 min of sailing; test:fast leaves it out.)
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'flat', ...o });
const CONTACT = /^Collision: |^Bump: |^Aground!|touched bottom|been set sideways onto/;
const HYDE = LL(37.8095, -122.4218), PIER39 = LL(37.8105, -122.4092), BASIN = LL(37.8075, -122.4250), WEST = LL(37.8110, -122.4330), EAST = LL(37.8140, -122.4120), NORTH = LL(37.8140, -122.4250);
type P = typeof BASIN;
const SEEDS = [1, 2, 3, 4, 5, 7];
// [name, from, to, wind from, kt, berth (m: open water 5.5, a small harbor 4, a marina's fairways 2.5), seeds]
const CASES: [string, P, P, number, number, number, number[]][] = [
  ['out of the basin to the north', BASIN, NORTH, 350, 18, 5.5, SEEDS],
  ['out of the Pier 39 marina to the west', PIER39, WEST, 0, 12, 2.5, SEEDS],
  ['into Hyde Street harbor from the west', WEST, HYDE, 150, 12, 4, SEEDS],
  ['into Hyde Street harbor from the west', WEST, HYDE, 180, 12, 4, SEEDS],
  ['out of the basin to the east', BASIN, EAST, 0, 22, 5.5, SEEDS],
  ['out of the basin to the north', BASIN, NORTH, 0, 5, 5.5, [1, 4, 7]],
  ['past the pier, east to west (a beat)', EAST, WEST, 270, 6, 5.5, [1, 4, 7]],
  ['out of the basin to the west', BASIN, WEST, 270, 12, 5.5, SEEDS],
  ['into the basin from the west', WEST, BASIN, 300, 12, 5.5, SEEDS]];
// the known limits, by seed (measured 14 Nov 2026, claude/aquatic-park-nav): follow-ups on ROADMAP
const KNOWN: Record<string, string> = {
  'out of the basin to the north|350|18|4': 'a plan made in the 57 m gap swings her across the pier end: 3.7 m off',
  'out of the basin to the north|350|18|5': 'the same, touching once, 2.6 m',
  'out of the basin to the north|350|18|7': 'the same, touching, 1.7 m',
  'out of the Pier 39 marina to the west|0|12|3': 'beating out of the marina\'s fairways she\'s set onto the shore, then gets off and out',
  'into Hyde Street harbor from the west|150|12|1': 'reaching in by the harbor\'s breakwater she touches once, 3.5 m',
  'into Hyde Street harbor from the west|150|12|3': 'the same, set onto it for a while before she gets in'
};

describe('the navigator round Aquatic Park, over six seeds (the measured baseline)', () => {
  for (const [name, a, b, from, kt, berth, seeds] of CASES) for (const seed of seeds) {
    const key = `${name}|${from}|${kt}|${seed}`, known = KNOWN[key];
    it(`${name}, wind from ${from}° at ${kt} kt, seed ${seed}${known ? ' (a known limit)' : ''}`, () => {
      const w = new World(COURSES[0], S({ windDir: from, windKt: kt }), seed, { freeSail: true }), u = w.user;
      expect(w.moveHere(a, 'start')).toBe(true);
      const r = routeAround(a, b, 30), q = r[1];
      w.setDest(b, 'there'); u.h = (Math.atan2(q.x - a.x, q.y - a.y) * 180 / Math.PI + 360) % 360; u.v = 2;
      engage(u, w.pilot, 'nav');
      let closest = Infinity, touched = false;
      const limit = Math.min(90, 45 * 12 / Math.min(12, kt)) * 60;
      for (let t = 0; t < limit && w.arrivedT == null; t += DT) {
        w.step(DT);
        if (onLand(u) || (w.drainEvents() as { msg?: string }[]).some(e => !!e.msg && CONTACT.test(e.msg))) touched = true;
        if (Math.hypot(u.x - a.x, u.y - a.y) > 80 && Math.hypot(u.x - b.x, u.y - b.y) > 80) { const n = wharfNearest(u, 30); if (n) closest = Math.min(closest, n.d); }
        expect(w.pilot.mode, `the pilot let go at ${t.toFixed(0)} s: ${w.pilot.alarm ?? ''}`).not.toBe('off');
      }
      expect(w.arrivedT, 'she got there').not.toBe(null);
      const clean = !touched && closest >= berth;
      if (known) expect(clean, `known limit (${known}) now clean: take it off the list`).toBe(false);
      else expect(clean, `touched ${touched}, closest ${closest.toFixed(2)} m (berth ${berth})`).toBe(true);
    }, 900000);
  }
});
