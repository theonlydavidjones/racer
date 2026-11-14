import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { LL } from '../src/geo/geo';
import { n360 } from '../src/core/math';
import { sfTide } from '../src/environment/tide';
import { bottomDepth, waterOver } from '../src/environment/bottom';
import { GROUND, keelDepth } from '../src/boat/ground';

/**
 * Running aground on depth (boat/ground.ts): Richardson Bay's flats off Strawberry, half a meter below the chart's
 * datum, on 14 Nov 2026. From the deeper water 900 m south-east of them, at the day's lowest water she sails up onto
 * them with the wind on her quarter and stops in the mud; at high water she sails over.
 */
const day = Date.UTC(2026, 10, 14, 8); // (midnight in San Francisco)
const extreme = (sign: number) => { let best = -Infinity, at = 0; for (let m = 6 * 60; m < 20 * 60; m += 2) { const h = sign * sfTide(day + m * 60e3); if (h > best) { best = h; at = m; } } return at; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const FLAT = LL(37.880, -122.505), D = 900 * Math.SQRT1_2, START = { x: FLAT.x + D, y: FLAT.y - D }, HEAD = 315;

function sail(minute: number, seconds = 5 * 60) {
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windKt: 12, windDir: 180, windTurn: 0, tideDate: '2026-11-14', tideTime: hhmm(minute), current: 'real', traffic: 0 } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
  // in the deeper water south-east of the flat, sailing straight at it on a broad reach, at speed
  u.x = START.x; u.y = START.y; u.h = HEAD; u.v = 2.5; u.steer = 0; u.tiller = 0;
  let everAground = false, stoppedAt: number | null = null, maxInto = 0, touch: { x: number; y: number } | null = null, run = 0, v0 = 0;
  for (let k = 0; k < seconds * 60; k++) { u.steer = 0; u.tiller = 0; u.h = HEAD; w.step(DT); if (u.aground) everAground = true; if (u.aground) { if (!touch) { touch = { x: u.x, y: u.y }; v0 = Math.hypot(u.vx, u.vy); } maxInto = Math.max(maxInto, u.aground); if (stoppedAt === null && Math.hypot(u.vx, u.vy) < 0.01) { stoppedAt = w.t; run = Math.hypot(u.x - touch.x, u.y - touch.y); } } }
  return { w, u, stoppedAt, maxInto, run, v0, everAground };
}

describe('aground on the mud', () => {
  it('her keel: her own draft, the ORC certificate\'s, less as she heels', () => {
    expect(GROUND.draft).toBeCloseTo(1.141, 3);
    expect(keelDepth({ heel: 0 } as never)).toBeCloseTo(1.141, 3);
    expect(keelDepth({ heel: 20 } as never)).toBeCloseTo(1.141 * Math.cos(20 * Math.PI / 180), 4);
  });
  it('at the day\'s low water she runs onto Richardson Bay\'s flats and stops in the mud, and stays there', () => {
    const lo = extreme(-1), z = bottomDepth(FLAT)!, water = waterOver(FLAT, day + lo * 60e3)!;
    expect(water).toBeLessThan(GROUND.draft - 0.2); // (the flat, at low water: well short of what she draws)
    expect(waterOver(START, day + lo * 60e3)!).toBeGreaterThan(GROUND.draft); // (where she starts: afloat)
    const { u, stoppedAt, maxInto, run, v0 } = sail(lo);
    console.log(`touched at ${v0.toFixed(2)} m/s; stopped ${run.toFixed(1)} m on, the keel ${maxInto.toFixed(2)} m short of water`);
    expect(stoppedAt, `bottom ${z.toFixed(2)} m, water ${water.toFixed(2)} m`).not.toBeNull();
    expect(u.aground).toBeGreaterThan(0);
    expect(run).toBeLessThan(60); // (she ploughs on up the flat until the mud's friction on the weight it takes stops her)
    expect(Math.hypot(u.vx, u.vy)).toBeLessThan(0.02); // (held fast, sails up and the wind on her quarter)
  }, 300_000);
  it('at high water she sails over the same flat', () => {
    const hi = extreme(1);
    expect(waterOver(FLAT, day + hi * 60e3)!).toBeGreaterThan(GROUND.draft + 0.2);
    const { u, w, everAground } = sail(hi, 15 * 60); // (her wind in Richardson Bay is 3–5 kt, the hills' lee: she makes about 2 kt)
    expect(everAground).toBe(false);
    expect(Math.hypot(u.x - START.x, u.y - START.y)).toBeGreaterThan(Math.hypot(FLAT.x - START.x, FLAT.y - START.y)); // (a quarter of an hour on: over the flat's spot and on)
    expect(n360(u.h)).toBeCloseTo(HEAD, 0); void w;
  }, 300_000);
});
