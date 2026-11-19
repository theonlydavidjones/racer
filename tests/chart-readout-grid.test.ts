// The chart's readout under the cursor (ui/flow.ts readout, drawn by Hud.chartFx) has a value in every field over the
// whole chart's water, wind layer and current layer, at slack and at strength, with real current: no blank, no NaN,
// no stray separator (the sprint's sweep after the owner's "Bottom: ," report).
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { onLand } from '../src/geo/shore';
import { readout } from '../src/ui/flow';

const bad = (s: string) => !s.trim() || /NaN|undefined|null|Infinity|-0\.0\b|\s\s|^\s|\s$|^[,·:]|[,·:]$/.test(s);

describe('the chart readout over the whole grid', () => {
  for (const tideTime of ['06:00', '12:30', '18:30']) it(`every water cell reads in full, both layers (14 Nov ${tideTime})`, () => {
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 16, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-11-14', tideTime, current: 'real', sea: 'flat' };
    const w = new World(COURSES[0], S, 1, { freeSail: true });
    let n = 0;
    for (let lat = 37.45; lat <= 38.1; lat += 0.01) for (let lon = -122.7; lon <= -122.1; lon += 0.0125) {
      const p = LL(lat, lon); if (onLand(p)) continue;
      for (const kind of ['wind', 'current'] as const) {
        const lines = readout(w as never, kind, p); n++;
        expect(lines).toHaveLength(2);
        for (const s of lines) expect(bad(s), `${kind} at ${lat.toFixed(3)}, ${lon.toFixed(3)}: "${s}"`).toBe(false);
      }
    }
    expect(n).toBeGreaterThan(1000);
  }, 120_000);
});
