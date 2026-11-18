// A boat that touches a mark sails off it (the stability soak, 18 Nov 2026: Seaweed Soup course 2, west 22 kt, seed 211,
// eight boats: Red met mark A at 2.5 m/s at about 5 minutes and lay on it for five minutes more at 0.1 m/s, the wind
// pressing her onto it, until a lull let her go).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';

describe('a mark touched in a breeze', () => {
  it('Red, laid onto mark A by 22 kt, is clear of it within a minute', () => {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 22, current: 'real', sea: 'real', tideDate: '2026-11-14', tideTime: '12:00', fleet: 7, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'] } as Settings;
    const w = new World(COURSES.find(c => c.id === 'ss2')!, S, 211), red = w.boats[1];
    let met = NaN; while (w.t < 420 && isNaN(met)) { w.step(DT); if (red.markTouch) met = w.t; }
    expect(met, 'she meets the mark (the soak saw her at about 305 s)').toBeLessThan(420);
    const A = w.C.marks.find(m => m.name === red.markTouch)!.p; let clear = NaN;
    while (w.t < met + 60 && isNaN(clear)) { w.step(DT); if (Math.hypot(red.x - A.x, red.y - A.y) > 8) clear = w.t - met; }
    expect(clear, `clear of ${red.markTouch ?? 'the mark'} (8 m) after meeting it; she's at ${Math.hypot(red.x - A.x, red.y - A.y).toFixed(1)} m, ${red.v.toFixed(2)} m/s`).toBeLessThan(60);
  }, 180_000);
});
