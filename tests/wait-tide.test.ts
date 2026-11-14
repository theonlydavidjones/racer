import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { LL } from '../src/geo/geo';
import { sfTide, tideHeightAt } from '../src/environment/tide';
import { bottomDepth } from '../src/environment/bottom';
import { GROUND } from '../src/boat/ground';
import { applyCommand } from '../src/sim/commands';

/**
 * Aground on a cruise, wait for the tide (the owner, 14 Nov 2026): the pause menu skips the clock on to when the tide
 * floats her, by the predictions, and she sails on from there.
 */
const day = Date.UTC(2026, 10, 14, 8);
const FLAT = LL(37.880, -122.505), D = 900 * Math.SQRT1_2, START = { x: FLAT.x + D, y: FLAT.y - D };
let lo = 0; { let best = Infinity; for (let m = 6 * 60; m < 20 * 60; m += 2) { const h = sfTide(day + m * 60e3); if (h < best) { best = h; lo = m; } } }
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function aground(mode: 'sail' | 'race') {
  const S = { ...DEFAULT_SETTINGS, mode, windKind: 'west', windKt: 12, windDir: 180, windTurn: 0, tideDate: '2026-11-14', tideTime: hhmm(lo), current: 'real', traffic: 0 } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: mode === 'sail' }), u = w.user;
  u.x = START.x; u.y = START.y; u.h = 315; u.v = 2.5;
  for (let k = 0; k < 5 * 60 * 60 && !(u.aground && Math.hypot(u.vx, u.vy) < 0.01); k++) { u.steer = 0; u.tiller = 0; u.h = 315; w.step(DT); }
  return w;
}

describe('wait for the tide', () => {
  it('aground at low water on a cruise: the clock goes on to when she floats, by the predictions, and she floats', () => {
    const w = aground('sail'), u = w.user;
    expect(u.aground).toBeGreaterThan(0);
    const now = w.clockUtc * 60e3, at = w.floatTime()!;
    expect(at).toBeGreaterThan(now);
    expect(at - now).toBeLessThan(12 * 3600e3); // (the flood after the low: within the tide's half day)
    expect(bottomDepth(u)! + tideHeightAt(u, at)).toBeGreaterThanOrEqual(GROUND.draft);
    const x = u.x, y = u.y;
    applyCommand(w, { k: 'waitTide' });
    expect(Math.abs(w.clockUtc * 60e3 - at)).toBeLessThan(90e3); // (to the minute)
    expect(u.x).toBe(x); expect(u.y).toBe(y); // (she lay where she was)
    for (let k = 0; k < 60; k++) w.step(DT);
    expect(u.aground).toBeUndefined();
  }, 300_000);
  it('racing, it doesn\'t (a race\'s clock is the race\'s)', () => {
    const w = aground('race'), t0 = w.clockUtc;
    expect(w.user.aground).toBeGreaterThan(0); expect(w.floatTime()).not.toBeNull(); // (aground, and the tide would float her)
    expect(w.waitForTide()).toBe(false);
    expect(w.clockUtc).toBe(t0);
  }, 300_000);
});
