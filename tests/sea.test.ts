import { describe, expect, it } from 'vitest';
import { FLAT_SEA, SeaField, fetchAt, onCurrent, swellFor, swellReach, windSea, wavelength } from '../src/environment/sea';
import { beatInChop, chopLoss, waveYaw } from '../src/boat/seaway';
import { beatAngle } from '../src/boat/polar';
import { LL } from '../src/geo/geo';
import type { Vec } from '../src/core/math';

const LINE = LL(37.8115, -122.4433), CHANNEL = LL(37.817, -122.455);
/** Wavelength about 1.2 boat-lengths: the chop that hurts a Folkboat most. */
const T_BOATLENGTH = Math.sqrt(2 * Math.PI * 1.2 * 5.934 / 9.81);

describe('wind sea growth (JONSWAP)', () => {
  it('matches the fetch-limited growth laws', () => {
    // 20 kt (10.3 m/s) over 5 km: Hs ≈ 0.37 m, Tp ≈ 2.3 s
    const s = windSea(10.3, 5000);
    expect(s.hs).toBeCloseTo(0.372, 2);
    expect(s.tp).toBeCloseTo(2.32, 1);
    // height grows with the square root of fetch
    expect(windSea(10.3, 20000).hs / s.hs).toBeCloseTo(2, 2);
  });
  it('stops growing once the sea is fully developed', () => {
    const a = windSea(10, 1e7), b = windSea(10, 1e8);
    expect(a.hs).toBeCloseTo(b.hs, 6);
    expect(a.hs).toBeCloseTo(0.243 * 100 / 9.81, 2);
  });
});

describe('fetch on the real coastline', () => {
  it('is short off the Cityfront and long out in the channel for a westerly', () => {
    const atLine = fetchAt(LINE, 255), mid = fetchAt(CHANNEL, 255);
    expect(atLine).toBeGreaterThan(1000);
    expect(atLine).toBeLessThan(4000);
    expect(mid).toBeGreaterThan(atLine * 1.5);
  });
  it('is next to nothing in the lee of the land', () => {
    expect(fetchAt(LL(37.855, -122.475), 255)).toBeLessThan(800); // Sausalito, under the hills
  });
});

describe('waves meeting a current', () => {
  it('get shorter and higher against it, longer and lower with it', () => {
    const against = onCurrent(0.5, 3, -0.6), w = onCurrent(0.5, 3, 0.6);
    expect(against.H).toBeGreaterThan(0.55);
    expect(against.L).toBeLessThan(wavelength(3));
    expect(w.H).toBeLessThan(0.5);
    expect(w.L).toBeGreaterThan(wavelength(3));
  });
  it('are blocked (and break) when the current is stronger than they can go against', () => {
    expect(onCurrent(0.3, 1.5, -2).blocked).toBe(true);
  });
});

describe('the sea at the start line', () => {
  const sea = new SeaField(swellFor('2026-07-11', 1));
  const at = (kt: number, cur: Vec, up: Vec = cur) => sea.at(LINE, { from: 255, kt }, cur, () => up);
  it('builds with the breeze', () => {
    expect(at(8, { x: 0, y: 0 }).hsW).toBeLessThan(at(20, { x: 0, y: 0 }).hsW);
  });
  it('is bigger and steeper with an ebb against the westerly, smaller with a flood', () => {
    // the wind over the water is the wind relative to the current: an ebb adds to it, a flood takes from it
    const slack = at(16, { x: 0, y: 0 }), ebb = at(16 + 2, { x: -1, y: 0 }, { x: -0.7, y: 0 }), flood = at(16 - 1.5, { x: 0.75, y: 0 });
    expect(ebb.hsW).toBeGreaterThan(slack.hsW * 1.4);
    expect(ebb.steep).toBeGreaterThan(slack.steep);
    expect(flood.hsW).toBeLessThan(slack.hsW * 0.8);
  });
  it('is glassy in a near-calm', () => {
    expect(at(2, { x: 0, y: 0 }).hsW).toBeLessThan(0.01);
  });
  it('has whitecaps only in a real breeze', () => {
    expect(at(8, { x: 0, y: 0 }).white).toBeLessThan(0.002);
    expect(at(22, { x: -1, y: 0 }, { x: -0.6, y: 0 }).white).toBeGreaterThan(0.01);
  });
  it('is flat water when asked', () => {
    expect(new SeaField(null).at(LINE, { from: 255, kt: 20 }, { x: 0, y: 0 }, () => ({ x: 0, y: 0 }))).toBe(FLAT_SEA);
  });
});

describe('the ocean swell', () => {
  it('is bigger in winter than late summer (SF Bar buoy)', () => {
    expect(swellFor('2026-01-10', 1).hs).toBeGreaterThan(swellFor('2026-08-10', 1).hs * 1.4);
    expect(swellFor('2026-01-10', 2).hs).toBeGreaterThan(swellFor('2026-01-10', 0).hs);
  });
  it('dies away inside the Gate and is shadowed by the land', () => {
    const outside = swellReach(LL(37.81, -122.52)).k, bridge = swellReach(LL(37.8195, -122.4775)).k;
    const line = swellReach(LINE).k, sausalito = swellReach(LL(37.855, -122.475)).k;
    expect(outside).toBeGreaterThan(bridge);
    expect(bridge).toBeGreaterThan(line);
    expect(line).toBeGreaterThan(0.05);
    expect(sausalito).toBeLessThan(0.03);
  });
});

describe('the boat in waves', () => {
  it('2 ft of boat-length chop costs about a tenth of her upwind speed', () => {
    const loss = chopLoss(12, beatAngle(12), 0.6, T_BOATLENGTH);
    expect(loss).toBeGreaterThan(0.07);
    expect(loss).toBeLessThan(0.16);
  });
  it('hurts more in light air (less drive to punch through) and much less off the wind', () => {
    expect(chopLoss(8, beatAngle(8), 0.6, T_BOATLENGTH)).toBeGreaterThan(chopLoss(14, beatAngle(14), 0.6, T_BOATLENGTH));
    expect(chopLoss(12, 165, 0.6, T_BOATLENGTH)).toBeLessThan(0.03);
  });
  it('makes footing pay: the best upwind angle widens in chop', () => {
    expect(beatInChop(10, 0.6, T_BOATLENGTH)).toBeGreaterThan(beatAngle(10) + 1);
    expect(beatInChop(10, 1.0, 2.5)).toBeGreaterThan(beatInChop(10, 0.6, T_BOATLENGTH));
  });
  it('long swell barely slows her', () => {
    expect(chopLoss(12, beatAngle(12), 0.3, 14)).toBeLessThan(0.005);
  });
  it('knocks her bow about most with the sea on the quarter, and is the same every replay', () => {
    const s = { ...FLAT_SEA, hsW: 0.6, tpW: 2.5, fromW: 0 };
    const peak = (h: number) => { let m = 0; for (let t = 0; t < 30; t += 0.05) m = Math.max(m, Math.abs(waveYaw(s, h, 2.5, t, 1))); return m; };
    expect(peak(135)).toBeGreaterThan(peak(10) * 3);
    expect(waveYaw(s, 135, 2.5, 12.3, 2)).toBe(waveYaw(s, 135, 2.5, 12.3, 2));
  });
  it("the yaw is a slender hull's Froude–Krylov moment: nothing beam-on, as much on the bow as the quarter, next to nothing in a long swell", () => {
    const peakOf = (sea: typeof FLAT_SEA, h: number) => { let m = 0; for (let t = 0; t < 40; t += 0.02) m = Math.max(m, Math.abs(waveYaw(sea, h, 2.5, t, 1))); return m; };
    const chop = { ...FLAT_SEA, hsW: 0.6, tpW: 2.5, fromW: 0 }, swell = { ...FLAT_SEA, hsS: 0.6, tpS: 12, fromS: 0 };
    expect(peakOf(chop, 90)).toBeLessThan(0.2 * peakOf(chop, 135));
    expect(peakOf(chop, 45) / peakOf(chop, 135)).toBeGreaterThan(0.7); expect(peakOf(chop, 45) / peakOf(chop, 135)).toBeLessThan(1.3);
    // (per metre of height, a 12 s swell turns her less than 2% as much as a 2.5 s chop)
    expect(peakOf(swell, 135)).toBeLessThan(0.02 * peakOf(chop, 135));
  });
});
