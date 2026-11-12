import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { KT, V, dot } from '../src/core/math';
import { CURRENT_RAMP, WIND_RAMP, flowAt, rampColor, readout, tideWord } from '../src/ui/flow';
import { fieldLayer, layerOn, withLayer } from '../src/ui/layers';

// the owner: "more prominent information from the condition layers, similar to how the Windy app handles it.
// Especially wind and current." Their answers: Windy's wind colours, one field layer at a time, moving particles.
const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 16, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-11-14', tideTime: '18:30', current: 'real', sea: 'flat' };

describe('the colour scales', () => {
  it("are Windy's for the wind: green at 10–15 kt, yellow at 20, red at 28, and hold past the ends", () => {
    const [r, g, b] = rampColor(WIND_RAMP, 14); expect(g).toBeGreaterThan(r); expect(g).toBeGreaterThan(b);
    const y = rampColor(WIND_RAMP, 20); expect(y[0]).toBeGreaterThan(180); expect(y[1]).toBeGreaterThan(160); expect(y[2]).toBeLessThan(100);
    const red = rampColor(WIND_RAMP, 28); expect(red[0]).toBeGreaterThan(red[1] + 80);
    expect(rampColor(WIND_RAMP, -3)).toEqual(WIND_RAMP[0][1]); expect(rampColor(WIND_RAMP, 99)).toEqual(WIND_RAMP[WIND_RAMP.length - 1][1]);
  });
  it('run on smoothly (no jump between neighbouring speeds)', () => {
    for (const R of [WIND_RAMP, CURRENT_RAMP]) {
      const max = R[R.length - 1][0];
      for (let v = 0; v < max; v += max / 500) { const a = rampColor(R, v), b = rampColor(R, v + max / 500); expect(Math.max(...a.map((q, i) => Math.abs(q - b[i])))).toBeLessThan(12); }
    }
  });
});

describe('one field layer at a time', () => {
  it('switching one on puts the other fields off, and leaves the rest as they were', () => {
    const s: Settings = { ...S, mapLayers: { ships: false } };
    expect(fieldLayer(s)).toBe('wind'); // (the defaults have the wind and the current on: the wind shows)
    const m = withLayer(s, 'current', true);
    expect(m).toMatchObject({ current: true, wind: false, sea: false, fog: false, ships: false });
    const t = { ...s, mapLayers: m }; expect(fieldLayer(t)).toBe('current'); expect(layerOn(t, 'ships')).toBe(false);
    expect(fieldLayer({ ...s, mapLayers: withLayer(t, 'current', false) })).toBe(null);
    expect(withLayer(t, 'ships', true)).toMatchObject({ current: true, ships: true }); // (not a field: nothing else changes)
  });
});

describe('what the layers show', () => {
  const w = new World(COURSES[0], S, 7, { freeSail: true });
  const spot = LL(37.8150, -122.4600); // between the Gate and Alcatraz
  it("colours the wind by the mean wind there (the day's, with the shore's lee and the slot; the puffs drawn apart)", () => {
    const f = flowAt(w, 'wind', spot), fa = w.fieldAt(spot);
    expect(f.kt).toBeCloseTo(w.wind.kt * fa.k, 9);
    // and the streaks go downwind
    const a = (w.wind.from + fa.turn) * Math.PI / 180; expect(f.ux * -Math.sin(a) + f.uy * -Math.cos(a)).toBeCloseTo(1, 9);
  });
  it("colours the current by the sim's own current there, and the streaks go with it", () => {
    const f = flowAt(w, 'current', spot), c = w.currentAt(spot);
    expect(f.kt).toBeCloseTo(Math.hypot(c.x, c.y) / KT, 9);
    expect(f.ux * c.x + f.uy * c.y).toBeGreaterThan(0);
  });
  it("reads out both, the layer's first, flood or ebb by the nearest NOAA station (as the tide box)", () => {
    const c = w.currentAt(spot), [a, b] = readout(w, 'current', spot), [p] = readout(w, 'wind', spot);
    const st = w.tide!.stations.reduce((x, s) => (Math.hypot(s.p.x - spot.x, s.p.y - spot.y) < Math.hypot(x.p.x - spot.x, x.p.y - spot.y) ? s : x));
    const word = Math.hypot(c.x, c.y) / KT < 0.15 ? 'slack' : dot(c, V(st.flood)) >= 0 ? 'flood' : 'ebb';
    expect(tideWord(w, spot, c)).toBe(word);
    expect(a.startsWith(word === 'slack' ? 'slack' : `${word} ${(Math.hypot(c.x, c.y) / KT).toFixed(1)} kt toward `)).toBe(true);
    expect(b).toMatch(/^wind \d+ kt from \d{3}°$/); expect(p).toMatch(/^\d+ kt from \d{3}°$/);
  });
});
