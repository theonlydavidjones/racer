import { describe, expect, it } from 'vitest';
import { ROPE_IN, boomAtIn, jibsheetAtIn, jibsheetIn, jibsheetTotal, mainsheetIn } from '../src/ui/ropeScale';
import { defaultControls, jibAngle, jibsheetFor } from '../src/boat/controls';

describe("The sail band's rope ticks: inches of rope through the hand (ui/ropeScale.ts, Rigging's geometry)", () => {
  it('the mainsheet: four parts, the first inches swing the boom furthest', () => {
    // (reference/design/sheet-geometry.md: as a share of the ease to the shroud stop, 10° at 6%)
    const toShroud = mainsheetIn(70, 0);
    expect(mainsheetIn(10, 0) / toShroud).toBeCloseTo(0.06, 1);
    expect(mainsheetIn(0, 0)).toBe(0); // (two-blocked)
    expect(mainsheetIn(8, 0)).toBeGreaterThan(12); expect(mainsheetIn(8, 0)).toBeLessThan(22); // (close-hauled in 12 kt: about 17 in)
    // degrees per inch: about 0.8 for the first 6 in, under 0.2 past 4 ft
    expect(boomAtIn(6, 0) / 6).toBeGreaterThan(0.6);
    expect((boomAtIn(96, 0) - boomAtIn(48, 0)) / 48).toBeLessThan(0.2);
  });
  it('the mainsheet with the traveller off the middle: no rope out with the boom right over the car', () => {
    const at = boomAtIn(0.01, 0.6);
    expect(mainsheetIn(at, 0.6)).toBeLessThan(0.5);
    for (const i of [6, 24, 96, 300]) expect(mainsheetIn(boomAtIn(i, 0.6), 0.6)).toBeCloseTo(i, 0);
  });
  it('the jib sheet: 1:1 by its lead, as Rigging worked it (20° at 5%, 30° at 22%, 45° at 52%, about 1.9 m in all)', () => {
    const c = defaultControls(), total = jibsheetTotal(c, 'S');
    expect(total * 0.0254).toBeGreaterThan(1.7); expect(total * 0.0254).toBeLessThan(2.1);
    const at = (deg: number) => jibsheetIn({ ...c, jibsheet: jibsheetFor(deg, c, 'S') }, 'S') / total;
    expect(at(20)).toBeCloseTo(0.05, 1); expect(at(30)).toBeCloseTo(0.22, 1); expect(at(45)).toBeCloseTo(0.52, 1);
    // and the inverse: the sheet setting for so many inches out
    const v = jibsheetAtIn(24, c, 'S');
    expect(jibsheetIn({ ...c, jibsheet: v }, 'S')).toBeCloseTo(24, 0);
    expect(jibAngle({ ...c, jibsheet: v }, 'S')).toBeGreaterThan(25);
  });
  it('the tension lines: each its own total; the backstay flagged as uneven', () => {
    expect(ROPE_IN.outhaul!.inches).toBeCloseTo(3 / 2.54, 2); // (1:1, 3 cm: North Sails)
    expect(ROPE_IN.vang!.inches).toBeGreaterThan(8); expect(ROPE_IN.vang!.inches).toBeLessThan(13); // (4:1, 5-8 cm)
    expect(ROPE_IN.backstay!.even).toBe(false);
    for (const k of ['vang', 'outhaul', 'cunningham', 'jibCunningham', 'downhaul', 'jibHalyard'] as const) expect(ROPE_IN[k]!.even).toBe(true);
  });
});
