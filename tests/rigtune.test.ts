import { describe, expect, it } from 'vitest';
import { benchAngles, benchSpeed } from '../src/boat/benchmark';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';
import { condition } from '../src/boat/condition';
import { forestaySag, forestayTension, guideTune, TUNE_PRESETS, tuneEffect, type RigTune } from '../src/boat/rigTune';

const spec = (tune?: Partial<RigTune>) => fixSpec({ ...DEFAULT_BOAT, perf: { ...DEFAULT_BOAT.perf, ...(tune ? { tune: { ...TUNE_PRESETS.medium, ...tune } } : {}) } });
const up = (kt: number, tune?: Partial<RigTune>) => benchSpeed(kt, benchAngles(kt).up, spec(tune));

describe('rig tune (rigTune.ts): North Sails\' Nordic Folkboat guide', () => {
  it('no tune set changes nothing: the sail rig carries no tune, as before', () => {
    expect(condition(spec()).main.tune).toBeUndefined();
    expect(spec().perf.tune).toBeUndefined();
  });

  it('the light-air tune gives the guide\'s 8 cm of forestay sag in light air, and the guide\'s tunes hold it about there as the wind builds', () => {
    expect(forestaySag(forestayTension(TUNE_PRESETS.light), 9)).toBeCloseTo(0.08, 3);
    expect(forestaySag(forestayTension(TUNE_PRESETS.medium), 17)).toBeCloseTo(0.08, 3);
    // a light tune in a breeze sags far more
    expect(forestaySag(forestayTension(TUNE_PRESETS.light), 17)).toBeGreaterThan(0.2 - 1e-9);
  });

  it('on the guide\'s tune for the wind she sails as with no tune set', () => {
    for (const [kt, t] of [[5, TUNE_PRESETS.light], [8, TUNE_PRESETS.light], [11, TUNE_PRESETS.medium], [14, TUNE_PRESETS.medium], [20, TUNE_PRESETS.strong]] as const) {
      expect(Math.abs(up(kt, t).kt / up(kt).kt - 1)).toBeLessThan(1e-6);
      expect(guideTune(kt)).toEqual(t);
    }
  });

  it('a tune for the wrong wind is slower: the strong-air tune in light air, the light-air tune in a breeze', () => {
    const base5 = up(5).kt, base20 = up(20).kt;
    expect(up(5, TUNE_PRESETS.strong).kt).toBeLessThan(base5 * 0.998);
    expect(up(20, TUNE_PRESETS.light).kt).toBeLessThan(base20 * 0.995);
  });

  it('more forestay rakes the mast aft and moves both sails\' force aft: more weather helm', () => {
    const e = tuneEffect({ ...TUNE_PRESETS.medium, forestayMark: 1.36 });
    expect(e.mainCeAft).toBeGreaterThan(0); expect(e.jibCeAft).toBeGreaterThan(0);
    // 5 cm more forestay: the hounds about 17 cm aft, the main's centre of effort about 11 cm
    expect(e.mainCeAft * 2.4 / 2).toBeCloseTo(0.05 * 3.4 * 4.44 / 6.5, 2);
    const h0 = up(12).helm, h1 = up(12, { forestayMark: 1.36 }).helm, h2 = up(12, { forestayMark: 1.26 }).helm;
    expect(h1).toBeGreaterThan(h0 + 0.2); expect(h2).toBeLessThan(h0 - 0.2);
  });

  it('saved tunes are kept in range', () => {
    const s = fixSpec({ ...DEFAULT_BOAT, perf: { ...DEFAULT_BOAT.perf, tune: { forestayMark: 9, footAft: -4, shroudTurns: 2, jumperTurns: NaN } as RigTune } });
    expect(s.perf.tune).toEqual({ forestayMark: 1.41, footAft: 6, shroudTurns: 2, jumperTurns: 2.5 });
  });
});

import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { tuneName, presetFor, tuneBrief, TUNE_HEIKKILA } from '../src/boat/rigTune';
import { raceBrief } from '../src/sim/strategist';
import { lessons } from '../src/boat/coach';
import { testBoat, sail } from './helpers/testBoat';

const S = (s: Partial<Settings> = {}) => ({ ...DEFAULT_SETTINGS, ...s }) as Settings;

describe('the tune at the dock, racing (owner: North Sails\' setting for the forecast)', () => {
  it('racing, with no tune of her own she is set to the guide\'s setting for the forecast; cruising, she has none', () => {
    for (const windKt of [6, 12, 20]) {
      const w = new World(COURSES[0], S({ windKt, fleet: 0 }), 3);
      expect(w.forecastKt).toBeGreaterThan(0);
      expect(tuneName(w.user.tune!)).toBe(presetFor(w.forecastKt));
    }
    expect(new World(COURSES[0], S({ windKt: 12 }), 3, { freeSail: true }).user.tune).toBeUndefined();
  });

  it('her own tune from the Boat panel stays hers', () => {
    const boat = fixSpec({ ...DEFAULT_BOAT, perf: { ...DEFAULT_BOAT.perf, tune: { ...TUNE_HEIKKILA } } });
    expect(new World(COURSES[0], S({ windKt: 20, fleet: 0, boat }), 3).user.tune).toEqual(TUNE_HEIKKILA);
  });

  it('the club fleet: most on the right setting, some on Heikkilä\'s or the next one; the same for the same seed', () => {
    const names = (seed: number) => new World(COURSES[0], S({ windKt: 12, fleet: 12 }), seed).boats.slice(1).map(b => tuneName(b.tune!));
    const all = [1, 2, 3, 4, 5].flatMap(names);
    const right = all.filter(n => n === 'medium').length / all.length;
    expect(right).toBeGreaterThan(0.55); expect(right).toBeLessThan(0.9);
    expect(all).toContain('heikkila');
    expect(names(7)).toEqual(names(7));
  });

  it('the brief says what the tune is and what it means for the day', () => {
    const w = new World(COURSES[0], S({ windKt: 12, fleet: 0 }), 3);
    const items = raceBrief(w).sections.find(s => s.id === 'trim')!.items, item = items.find(i => i.head === 'Rig tune')!;
    expect(item.text).toMatch(/medium setting/);
    expect(tuneBrief(TUNE_PRESETS.light, 15, 17, 19)).toMatch(/too soft/);
    expect(tuneBrief(TUNE_PRESETS.strong, 4, 5, 6)).toMatch(/too tight/);
  });

  it('the coach says so, upwind, when the tune is wrong for the wind and costs her', () => {
    const b = testBoat({ heading: 42, kt: 5, windKt: 18 }); b.tune = { ...TUNE_PRESETS.light };
    sail(b, 30);
    const l = lessons(b).list.find(x => x.id === 'rig:soft');
    expect(l).toBeTruthy(); expect(l!.head).toMatch(/soft for 18 kt/);
    const ok = testBoat({ heading: 42, kt: 5, windKt: 18 }); ok.tune = { ...TUNE_PRESETS.strong }; sail(ok, 30);
    expect(lessons(ok).list.some(x => x.id.startsWith('rig:'))).toBe(false);
  });
});
