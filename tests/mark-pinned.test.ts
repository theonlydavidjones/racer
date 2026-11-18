// A boat laid onto a mark by the wind sails off it (the stability soak, 18 Nov 2026: Seaweed Soup course 2, west 22 kt,
// seed 211, eight boats: Red met mark A at 2.5 m/s and lay on it for five minutes at 0.1 m/s, the wind pressing her
// sideways onto it, until a lull let her go). Every step of contact took 3% of her way whatever her heading
// (world.ts checkMarkTouches); now only the share of it she sails into the mark. Set up directly (the race itself
// changed with v208 and no longer brings her there): an AI boat on her leg from A, beside it on its windward side,
// lying along it with a little way on, in 22 kt.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';

describe('a mark touched in a breeze', () => {
  it('a boat laid along mark A by 22 kt abeam is clear of it within half a minute', () => {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 22, windTurn: 0, current: 'slack', sea: 'real', tideDate: '2026-11-14', tideTime: '12:00', fleet: 1, opponents: ['stock:1'] } as Settings;
    const w = new World(COURSES.find(c => c.id === 'ss2')!, S, 3), b = w.boats[1], u = w.boats[0];
    while (w.t < 5) w.step(DT); // (the gun)
    const A = w.C.marks[0].p;
    u.x = A.x - 3000; u.y = A.y; // (your boat well away)
    b.started = true; b.ocs = false; b.leg = 1; b.penalty = 0; b.ai!.mode = 'race';
    // (as Red lay: close-hauled on port, 320° in the westerly, all but stopped, the mark on her starboard beam, to leeward)
    const H = +((globalThis as any).process.env.H ?? 320), V0 = +((globalThis as any).process.env.V0 ?? 0.1), r = (H + 90) * Math.PI / 180;
    b.x = A.x - Math.sin(r) * 2.2; b.y = A.y - Math.cos(r) * 2.2; b.h = H; b.v = V0;
    let touched = 0, clear = NaN;
    while (w.t < 5 + 60 && isNaN(clear)) { w.step(DT); if (b.markTouch) touched++; if (Math.hypot(b.x - A.x, b.y - A.y) > 8) clear = w.t - 5; }
    expect(touched, 'she touched it').toBeGreaterThan(0);
    // (clear of it in 20.3 s; taxed every step whatever her heading, 41.0 s: 18 Nov 2026)
    expect(clear, `clear of A (8 m): she's ${Math.hypot(b.x - A.x, b.y - A.y).toFixed(1)} m from it at ${b.v.toFixed(2)} m/s`).toBeLessThan(30);
  }, 120_000);
});
