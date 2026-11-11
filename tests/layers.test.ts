import { describe, expect, it } from 'vitest';
import { layerOn, LAYERS } from '../src/ui/layers';
import { idw, visibilityFor } from '../src/environment/weather';
import { sfLocalToUtcMin } from '../src/environment/tide';
import { DEFAULT_SETTINGS } from '../src/settings';
import { INK } from '../src/ui/encChart';
import { nm } from '../src/ui/mapLayers';

describe('the map\'s layers', () => {
  it('has wind, current, sea state, fog, ships, laylines and wind shadows, each its own switch', () => {
    expect(LAYERS.map(l => l.key)).toEqual(['wind', 'current', 'sea', 'fog', 'ships', 'laylines', 'shadows']);
  });
  it('defaults to what the map showed before: laylines and shadows with the training aids; sea and fog off', () => {
    const s = { ...DEFAULT_SETTINGS, aids: 1 as const };
    expect(['wind', 'current', 'ships', 'laylines', 'shadows'].every(k => layerOn(s, k as never))).toBe(true);
    expect(layerOn(s, 'sea')).toBe(false); expect(layerOn(s, 'fog')).toBe(false);
    expect(layerOn({ ...s, aids: 0 }, 'laylines')).toBe(false);
    expect(layerOn({ ...s, mapLayers: { fog: true, wind: false } }, 'fog')).toBe(true);
    expect(layerOn({ ...s, mapLayers: { fog: true, wind: false } }, 'wind')).toBe(false);
  });
  it('draws the sim\'s overlays in colours the chart doesn\'t use: not its magenta, nor the buoys\' red, green or yellow', () => {
    const chart = ['#b8188f', '#d4202c', '#1f9d48', '#f2c418'].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
    for (const pal of ['day', 'dusk'] as const) for (const c of [INK[pal].you, INK[pal].mark]) {
      const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
      for (const k of chart) expect(Math.hypot(rgb[0] - k[0], rgb[1] - k[1], rgb[2] - k[2]), `${pal} ${c}`).toBeGreaterThan(90);
    }
  });
});

describe('fog: real visibility only', () => {
  it('shows what NOAA\'s Pier 17 sensor saw on a past day: the morning fog of 2 March 2022', () => {
    const v = visibilityFor('2022-03-02', sfLocalToUtcMin('2022-03-02', '11:00'));
    expect('none' in v).toBe(false);
    if ('none' in v) return;
    expect(v.source).toBe('observed'); expect(v.points[0].m).toBe(140); // NOAA's reading at 19:00 UTC: 0.14 km
    expect(v.at({ x: 0, y: 0 })).toBeNaN(); // one sensor: it says nothing about the water 4 km away
    const later = visibilityFor('2022-03-02', sfLocalToUtcMin('2022-03-02', '15:00'));
    expect('none' in later ? 0 : later.points[0].m).toBe(10000); // cleared: the sensor's 10 km cap
    expect('none' in later ? '' : later.cap).toBe(10000);
  });
  it('says so, rather than making fog up, when there\'s no real visibility', () => {
    const before = visibilityFor('2019-07-15', sfLocalToUtcMin('2019-07-15', '14:00'));
    expect('none' in before && before.none).toMatch(/No visibility was recorded/);
    const far = visibilityFor('2030-07-15', sfLocalToUtcMin('2030-07-15', '14:00'));
    expect('none' in far && far.none).toMatch(/No visibility forecast/);
    const night = visibilityFor('2022-03-02', sfLocalToUtcMin('2022-03-02', '22:00'));
    expect('none' in night).toBe(true);
  });
  it('writes visibility as a sailor does, with each source\'s own cap', () => {
    expect(nm(140)).toBe('140 m'); expect(nm(10000, 10000)).toBe('5.4+ nm'); expect(nm(16093, 16093)).toBe('8.7+ nm'); expect(nm(14500, 16093)).toBe('8 nm');
  });
  it('shows forecast fog only over the NWS grid, not beyond it', () => {
    // two 2.5 km cells: between them, a value between theirs; 5 km beyond the outer one, nothing
    const f = idw([{ p: { x: 0, y: 0 }, m: 1000 }, { p: { x: 2500, y: 0 }, m: 9000 }]);
    expect(f({ x: 1250, y: 0 })).toBeCloseTo(5000, 0); expect(f({ x: 0, y: 1000 })).toBeLessThan(5000);
    expect(f({ x: 7500, y: 0 })).toBeNaN(); expect(f({ x: 0, y: -4000 })).toBeNaN();
  });
});

describe('the map\'s key', () => {
  it('names every line the chart draws, from the same pens the map uses', async () => {
    const { ENC, AREA_NAME, areaPen } = await import('../src/ui/encChart');
    const { CHART_ORDER } = await import('../src/ui/legend');
    const drawn = new Set(ENC.areas.map(a => a.k).filter(k => areaPen(k, INK.day, 0.25, 'chart')));
    drawn.add('lane'); // (the lanes' direction arrows)
    for (const k of drawn) { expect(AREA_NAME[k], k).toBeTruthy(); expect(CHART_ORDER, k).toContain(k); }
    // the line west of Fort Point (122°29.07'W) is where three of them meet: the precautionary area, the caution areas
    // (the VTS and the TSS) and a security zone (33 CFR 165.1183): each is in the key
    for (const k of ['precaution', 'caution', 'restricted']) expect(drawn.has(k), k).toBe(true);
  });
});
