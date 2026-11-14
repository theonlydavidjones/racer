// A right-of-way boat beating at the land isn't held on into it for another boat's room (Rule 16.1): held so, a
// starboard boat with another on the same tack 8 m off sailed into a breakwater at 1.7 m/s and lay pinned against it at
// 0 kt for the rest of the race (Capacity's case: Seaweed Soup course 10, 12 kt west, the real tide of 14 Nov 2026,
// seed 2, boat 4, at 94 s; set up here as it was then, the rest of the fleet sent well away).
import { expect, it } from 'vitest';
// Too slow to tack (1.3 m/s, under SLOW_TACK) she goes round by the gybe, the long way from 205° to 307°, away from
// the boat to windward; the room was checked the short way, up through the wind toward it, and held her for a turn she
// wasn't making (now checked the way the helm turns, physics.ts helmWay).
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { anyShoreDist } from '../src/geo/shore';

it('beating at a breakwater with a boat close by, she gets off it: never lying stopped against the land', () => {
  const w = new World(ss10 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: 12, current: 'real', opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'], fleet: 7 } as never, 2);
  while (w.t < 94) w.step(DT);
  const black = w.boats.find(b => b.id === 4)!, freya = w.boats.find(b => b.id === 6)!;
  const put = (b: typeof black, x: number, y: number, h: number, v: number) => { b.x = x; b.y = y; b.h = h; b.v = v; b.tack = 'S'; b.penalty = 0; b.desired = h; };
  put(black, 50.78, -274.01, 204.9, 1.34); put(freya, 43.78, -270.1, 216.4, 0.9);
  w.boats.forEach((b, k) => { if (b !== black && b !== freya) { b.x = -900 - 60 * k; b.y = 400; } });
  let stopped = 0, least = Infinity;
  while (w.t < 154) { w.step(DT); const d = anyShoreDist(black); least = Math.min(least, d); if (black.v < 0.1 && d < 3) stopped += DT; }
  expect(stopped, 'seconds lying stopped against the land').toBeLessThan(5);
}, 120_000);
