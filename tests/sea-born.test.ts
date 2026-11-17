// The chop's waves are born and die; none turns (environment/waveField.ts update)
import { describe, expect, it } from 'vitest';
import { N_WIND, WaveField } from '../src/environment/waveField';
import { SeaField, type SeaHere } from '../src/environment/sea';
import { seaDrag } from '../src/boat/seaway';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

const sea = (kt: number): SeaHere => ({ hsW: kt >= 20 ? 0.6 : 0.25, tpW: kt >= 20 ? 2.6 : 1.9, fromW: 270, hsS: 0.3, tpS: 12, fromS: 270, steep: 0.04, white: 0, fetch: 4400 });
const settled = (kt: number) => { const f = new WaveField(12); f.update(sea(kt), 270, 0, { x: 0, y: 0 }, kt); for (let i = 0; i < 600; i++) f.update(sea(kt), 270, 0.1, { x: 0, y: 0 }, kt); return f; };
const hs = (f: WaveField) => { let e = 0; for (let i = 0; i < N_WIND; i++) e += f.amp[i] ** 2; return 4 * Math.sqrt(e / 2); };
const off = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('the chop through a wind shift: the old sea fades as the new one grows, and nothing turns', () => {
  for (const kt of [10, 20]) it(`${kt} kt, the wind 40° round: the sea's height holds, each wave keeps its direction until it's flat, and the sea is round with the wind inside two hours`, () => {
    const f = settled(kt), h0 = hs(f), from0 = f.chopFrom, was = Array.from(f.dir), about = { x: 3000, y: -2000 };
    expect(off(from0, 270), 'the settled sea comes from the wind').toBeLessThan(0.01);
    let reaimed = 0, lastGap = 40, halfAt = NaN, short = NaN, long = NaN;
    for (let t = 0; t < 7200; t += 0.25) {
      f.update(sea(kt), 310, 0.25, about, kt);
      for (let i = 0; i < N_WIND; i++) if (f.dir[i] !== was[i]) {
        // (a wave's direction changes only while it has no height: under a millimeter)
        expect(f.amp[i], `component ${i} re-aimed at ${t.toFixed(0)} s with a height of`).toBeLessThan(0.001);
        was[i] = f.dir[i]; reaimed++;
        if (i === 0 && Number.isNaN(short)) short = t; if (i === N_WIND - 2 && Number.isNaN(long)) long = t;
      }
      expect(Math.abs(hs(f) / h0 - 1), `the sea's height at ${t.toFixed(0)} s`).toBeLessThan(0.01);
      const gap = off(f.chopFrom, from0 + 40);
      // (it goes round and never back: read by the wind each wave was born for, the mean only gains on the wind)
      expect(gap, `the sea's direction at ${t.toFixed(0)} s, against the nearest it has been`).toBeLessThan(lastGap + 0.01); lastGap = Math.min(lastGap, gap);
      if (Number.isNaN(halfAt) && gap < 20) halfAt = t;
    }
    expect(reaimed, 'every component was born again once').toBe(N_WIND);
    expect(lastGap, 'the sea is round with the wind').toBeLessThan(2);
    // (the shortest waves answer first, in minutes; the longest pair last; half way round inside the hour)
    expect(short).toBeLessThan(15 * 60); expect(long).toBeGreaterThan(2 * short); expect(halfAt).toBeLessThan(3600);
    expect(halfAt, 'and not at once: the sea lags the wind').toBeGreaterThan(5 * 60);
  });
  it('a backing shift, 40° the other way, does the same', () => {
    const f = settled(12), h0 = hs(f); let best = 40;
    for (let t = 0; t < 7200; t += 0.25) { f.update(sea(12), 230, 0.25, { x: 0, y: 0 }, 12); const gap = off(f.chopFrom, 230); expect(gap).toBeLessThan(best + 0.01); best = Math.min(best, gap); expect(Math.abs(hs(f) / h0 - 1)).toBeLessThan(0.01); }
    expect(best).toBeLessThan(0.5);
  });
  it('the wind going back while a pair is half changed over: both of its waves end up born for the wind there is', () => {
    const f = settled(12);
    for (let t = 0; t < 900; t += 0.25) f.update(sea(12), 310, 0.25, { x: 0, y: 0 }, 12); // (some pairs part way through)
    for (let t = 0; t < 4 * 3600; t += 0.5) f.update(sea(12), 270, 0.5, { x: 0, y: 0 }, 12);
    expect(off(f.chopFrom, 270)).toBeLessThan(0.5);
    expect(Array.from(f.stage), 'every pair settled').toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('a sea given without a fetch still has heights (the fetch\'s cap on the time is then its least)', () => {
    const f = new WaveField(12), s = { ...sea(12), fetch: undefined } as unknown as SeaHere;
    f.update(s, 270, 0, { x: 0, y: 0 }, 12); for (let t = 0; t < 600; t += 0.5) f.update(s, 300, 0.5, { x: 0, y: 0 }, 12);
    for (let i = 0; i < N_WIND; i++) expect(Number.isFinite(f.amp[i])).toBe(true);
  });
  it('a wobble of a few degrees changes nothing: no wave is re-aimed for 8° either way', () => {
    const f = settled(12), was = Array.from(f.dir), amp = Array.from(f.amp);
    for (let t = 0; t < 3600; t += 0.5) f.update(sea(12), 270 + 8 * Math.sin(t / 90), 0.5, { x: 0, y: 0 }, 12);
    expect(Array.from(f.dir)).toEqual(was);
    for (let i = 0; i < N_WIND; i++) expect(f.amp[i]).toBeCloseTo(amp[i], 6);
  });
});

describe('the sea the boat\'s wave drag meets is the sea that\'s drawn', () => {
  it('the sea model\'s chop comes from where the wave field\'s does, through a shift', () => {
    const f = settled(12), model = new SeaField({ hs: 0.5, tp: 12, from: 270 } as never, 1);
    model.field = f;
    const fetchless = () => model.at({ x: 0, y: 0 }, { from: 310, kt: 12 } as never, { x: 0, y: 0 }, () => ({ x: 0, y: 0 }));
    for (let t = 0; t < 1800; t += 0.5) f.update(sea(12), 310, 0.5, { x: 0, y: 0 }, 12);
    const here = fetchless();
    expect(here.fromW).toBe(f.chopFrom);
    expect(off(here.fromW, 310), 'half an hour after the shift the drawn sea still lags the wind').toBeGreaterThan(5);
    // (and so her drag: head to the wind, she meets the sea on the bow it is drawn on, not dead ahead)
    if (here.hsW > 0.02) expect(seaDrag(here, 310, 2)).toBeLessThan(seaDrag({ ...here, fromW: 310 }, 310, 2));
  });
  it('in the World: every boat\'s chop comes from the wave field\'s direction', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14' } as Settings, 1, {} as never);
    for (let i = 0; i < 600; i++) w.step(DT);
    for (const b of w.boats) if (b.sea.hsW > 0) expect(off(b.sea.fromW, w.waves.chopFrom)).toBeLessThan(0.5); // (hers is read a step or half a second before)
  });
});
