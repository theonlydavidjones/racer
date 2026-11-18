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

describe('the committee boat run into end on', () => {
  // (the physics review, round two, 18 Nov 2026: the side's normal used off its ends read a boat driving onto its bow as
  // lying along it, and she lost no way there: held on her heading, still in contact and gaining, 1.0 to 1.27 m/s, for
  // 20 s. Off its ends the normal is the end's, as a round mark's)
  it('a boat held driving onto its end loses her way, as square onto its side', () => {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, windTurn: 0, current: 'slack', fleet: 0, opponents: [] } as Settings;
    const w = new World(COURSES.find(c => c.id === 'train')!, S, 3), u = w.boats[0];
    while (w.t < 2) w.step(DT);
    const cb = w.committeeHull!, L = Math.hypot(cb.q!.x - cb.p.x, cb.q!.y - cb.p.y), ax = { x: (cb.q!.x - cb.p.x) / L, y: (cb.q!.y - cb.p.y) / L };
    // (along its axis onto whichever end she can run down onto: the wind behind her)
    const down = { x: -Math.sin(u.ww.from * Math.PI / 180), y: -Math.cos(u.ww.from * Math.PI / 180) }, s = ax.x * down.x + ax.y * down.y > 0 ? 1 : -1;
    const d = { x: ax.x * s, y: ax.y * s }, end = s > 0 ? cb.p : cb.q!, h = (Math.atan2(d.x, d.y) * 180 / Math.PI + 360) % 360;
    u.x = end.x - d.x * 14; u.y = end.y - d.y * 14; u.h = h; u.v = 2.5;
    const t0 = w.t; let touched = 0;
    while (w.t < t0 + 20) { w.step(DT); u.h = h; if (u.lastHitT != null && u.lastHitT > w.t - DT * 1.5) touched++; }
    expect(touched, 'she reached it').toBeGreaterThan(0);
    // (0.21 m/s after 20 s; with the side's normal off its ends, 1.27, still in contact: 18 Nov 2026)
    expect(u.v, 'her way after 20 s held onto its end (m/s)').toBeLessThan(0.5);
  }, 120_000);
});
