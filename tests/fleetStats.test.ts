// The fleet measures the skipper model is calibrated by (src/ai/fleetStats.ts), checked against the figures the
// analysis script published for the real SF Bay Folkboat races (scripts/analyse-folkboat-results.mjs, in
// src/boat/data/sf-folkboat-results.json's `calibration`): the same sums on the same races must give the same answers.
import { describe, expect, it } from 'vitest';
import results from '../src/boat/data/sf-folkboat-results.json';
import { gapPct, kendall, summarise, type RaceResult } from '../src/ai/fleetStats';

interface RealBoat { key: string; place: number | null; elapsedS: number | null }
interface RealRace { date: string; boats: RealBoat[]; realDay?: { fortPoint?: { meanKt: number } } }
const data = results as unknown as { events: { source: string; races: RealRace[] }[]; calibration: { spread: { lastFinisherPct: { median: number; p25: number; p75: number; min: number; max: number }; medianBoatPct: { median: number }; byRelativePlace: { medianPct: number }[] }; wind: { lastPctVsWind: { slopePctPerKt: number; interceptPct: number; r: number } } } };

/** The timed races (Jibeset), as the calibration sees them. */
const real: RaceResult[] = data.events.filter(e => e.source === 'jibeset').flatMap(e => e.races).map(r => ({
  finishers: r.boats.filter(b => b.place && b.elapsedS != null).map(b => ({ key: b.key, elapsedS: b.elapsedS! })),
  windKt: r.realDay?.fortPoint?.meanKt, label: r.date
})).filter(r => r.finishers.length >= 2);

describe('fleet measures (the skipper model\'s calibration)', () => {
  it('gaps behind the winner, %, to 0.1 as published', () => {
    expect(gapPct([{ key: 'a', elapsedS: 3000 }, { key: 'b', elapsedS: 2800 }, { key: 'c', elapsedS: 2900 }])).toEqual([0, 3.6, 7.1]);
  });
  it("Kendall's tau: 1 for the same order, −1 reversed, over the boats in both", () => {
    const a = ['p', 'q', 'r', 's'].map((key, i) => ({ key, elapsedS: 100 + i }));
    expect(kendall(a, a)).toBe(1);
    expect(kendall(a, a.map(x => ({ ...x, elapsedS: 200 - x.elapsedS })))).toBe(-1);
    expect(kendall(a, a.slice(0, 2))).toBeNull();
  });
  it('the real races give the analysis script\'s published spread and wind fit', () => {
    const c = data.calibration, s = summarise(real);
    expect(s.races).toBe(5);
    expect(s.lastPct).toEqual(c.spread.lastFinisherPct);
    expect(s.medianBoatPct).toBe(c.spread.medianBoatPct.median);
    expect(s.quarters).toEqual(c.spread.byRelativePlace.map(q => q.medianPct));
    expect(s.windSlope!.slope).toBeCloseTo(c.wind.lastPctVsWind.slopePctPerKt, 2);
    expect(s.windSlope!.intercept).toBeCloseTo(c.wind.lastPctVsWind.interceptPct, 1);
    expect(s.windSlope!.r).toBeCloseTo(c.wind.lastPctVsWind.r, 2);
  });
});
