// After racing is called off, a boat lying to off the harbour sails off a couple of lengths from another boat lying to
// or stopped beside her (they'd drift down together), but not from a boat sailing past with way on: that one is keeping
// clear of her or passing, and sailing off across it she'd cut into its way (abandon-home, 26 kt westerly: a boat
// parted across another's escape and they touched). ai.ts homeCourse.
import { expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V } from '../src/core/math';

function lyingPair(passV: number) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'slack', tideDate: '2026-11-14', traffic: 0, fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'], windKind: 'west', windKt: 20 } as Settings, 3);
  while (w.t < 30) w.step(DT);
  w.cancelled = { t: w.t, kt: 24, up: ['N', 'A'], say: '' };
  const ai = w.boats.filter(b => !b.isUser);
  for (let k = 0; k < 10 * 60; k++) w.step(DT); // (each boat works out her place)
  const [a, o] = ai, at = a.ai!.home!.at, from = a.ww.from;
  // a lying to 40 m off her spot, beam-on; o 10 m from her, on her own spot (so a, the further from hers, is the one to
  // sail off), going passV m/s on a beam reach
  const s = V(from + 180), q = V(from);
  a.x = at.x + q.x * 40; a.y = at.y + q.y * 40; a.h = from + 90; a.v = 0.6; a.ai!.home!.lying = true; a.ai!.home!.tack = 'P'; a.ai!.home!.parting = undefined;
  o.x = a.x + s.x * 10; o.y = a.y + s.y * 10; o.h = from + 90; o.v = passV; o.ai!.home!.at = { x: o.x, y: o.y }; o.ai!.home!.lying = passV < 1;
  w.boats.forEach((b, k) => { if (b !== a && b !== o) { b.x = at.x + 900 + 80 * k; b.y = at.y + 900; } });
  w.step(DT);
  return { aParts: a.ai!.home!.parting === o.id };
}

it('a boat lying to sails off from one stopped beside her, not from one sailing past with way on', () => {
  expect(lyingPair(2.6).aParts, 'parting from a boat sailing past at 2.6 m/s').toBe(false);
  expect(lyingPair(0.3).aParts, 'parting from a boat lying to beside her at 0.3 m/s').toBe(true);
}, 120_000);

// Coming to her spot slower than she can tack (physics.ts SLOW_TACK), or with a boat close by, she lies to on the tack
// she came in on: changing it there would be a gybe right round, or a turn across her neighbour (rules 13 and 15).
// With way on and clear water she takes the tack that forereaches her away from the fleet's spot.
function arriving(v: number, neighbour: boolean) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'slack', tideDate: '2026-11-14', traffic: 0, fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'], windKind: 'west', windKt: 20 } as Settings, 3);
  while (w.t < 30) w.step(DT);
  w.cancelled = { t: w.t, kt: 24, up: ['N', 'A'], say: '' };
  const ai = w.boats.filter(b => !b.isUser);
  for (let k = 0; k < 10 * 60; k++) w.step(DT);
  const base = w.cancelled.places![0];
  const a = ai.find(b => Math.hypot(b.ai!.home!.at.x - base.x, b.ai!.home!.at.y - base.y) > 20)!, h = a.ai!.home!, from = a.ww.from;
  const u = V(from - 90), away = u.x * (h.at.x - base.x) + u.y * (h.at.y - base.y) > 0 ? 'S' : 'P';
  const other = away === 'S' ? 'P' : 'S';
  // 40 m off her spot along the wind, on the tack that isn't the away one, close-hauled-ish, not yet lying to
  const q = V(from);
  a.x = h.at.x + q.x * 40; a.y = h.at.y + q.y * 40; a.h = from + (other === 'S' ? -50 : 50); a.tack = other; a.v = v; h.lying = false; h.tack = undefined;
  w.boats.forEach((b, k) => { if (b !== a) { b.x = h.at.x + 900 + 80 * k; b.y = h.at.y + 900; } });
  if (neighbour) { const o = w.boats.find(b => b !== a)!; o.x = a.x + 15; o.y = a.y; }
  w.step(DT);
  return { lying: h.lying, kept: h.tack === other, away: h.tack === away };
}

it('arriving at her spot she changes tack to lie to only with way enough and clear water', () => {
  expect(arriving(1.0, false), 'slow: a tack there would be a gybe right round').toMatchObject({ lying: true, kept: true });
  expect(arriving(2.5, true), 'a boat 15 m off').toMatchObject({ lying: true, kept: true });
  expect(arriving(2.5, false), 'with way on and clear water').toMatchObject({ lying: true, away: true });
}, 180_000);
