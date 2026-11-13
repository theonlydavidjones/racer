import { describe, expect, it } from 'vitest';
import { placeAmong, realFleetIds, realStarters, realRace, realRaces } from '../src/sim/realRaces';
import { realSpec } from '../src/boat/generic';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';

// docs/VISION-ROADMAP.md near term 7: "race a day the fleet actually sailed, in its real wind and tide, and see where
// you'd have placed".
describe('the real past races', () => {
  const rs = realRaces();
  it('are the Seaweed Soup races with every finisher timed, a course on the sheet and the day\'s wind on record', () => {
    expect(rs.map(r => r.id).sort()).toEqual(['GGYC_T008047221-r1', 'GGYC_T008047221-r4', 'GGYC_T008047221-r5']);
    for (const r of rs) {
      expect(r.boats.filter(b => b.elapsedS != null && b.code == null).length).toBeGreaterThanOrEqual(3);
      expect(courseFile(r.courseId).id).toBe(r.courseId);
      expect(r.start).toMatch(/^\d\d:\d\d$/);
    }
  });
  it('say so where the published distance disagrees with the course sheet (course 3 is 3.7 nm, not 6.1; 13 is 5.0, not 8.9)', () => {
    expect(realRace('GGYC_T008047221-r5')!.doubt).toBe(null);
    expect(realRace('GGYC_T008047221-r1')!.doubt).toMatch(/6\.1 nm.*3\.7 nm/);
    expect(realRace('GGYC_T008047221-r4')!.doubt).toMatch(/8\.9 nm.*5 nm/);
    // 6.1 nm in the winner's 46:49 is 7.8 kt: the distance is the typo, and the race says so
    expect(realRace('GGYC_T008047221-r1')!.doubt).toMatch(/7\.8 kt, faster than a Folkboat sails/);
    // the fleet the sim sails her against: every boat that started (a DNF too), none that didn't
    const r4 = realRace('GGYC_T008047221-r4')!;
    expect(realStarters(r4).length).toBeGreaterThan(r4.boats.filter(b => b.elapsedS != null && b.code == null).length);
    // your boat keeps her number on the water: a real boat wearing it stays ashore
    const all = realFleetIds(r4, '', 7), theirs = realStarters(r4)[0];
    expect(all.length).toBe(Math.min(7, realStarters(r4).length));
    expect(realFleetIds(r4, `USA ${theirs.key}`, 7)).not.toContain(`real:${r4.id}:${theirs.key}`);
    expect(realFleetIds(r4, `USA ${theirs.key}`, 7).length).toBe(all.length - 1);
    expect(realStarters(r4).some(b => b.code && /DN[SC]/.test(b.code))).toBe(false);
  });
  it('place your time among the real finishers', () => {
    const r = realRace('GGYC_T008047221-r5')!, t = r.boats.filter(b => b.elapsedS != null).map(b => b.elapsedS!).sort((a, b) => a - b);
    expect(placeAmong(r, t[0] - 1)).toEqual({ place: 1, of: t.length + 1 });
    expect(placeAmong(r, t[t.length - 1] + 1)).toEqual({ place: t.length + 1, of: t.length + 1 });
  });
  it('race against the real boats, by name and sail number, on the real day, course and start', () => {
    const r = realRace('GGYC_T008047221-r5')!, ids = r.boats.filter(b => b.elapsedS != null).map(b => `real:${r.id}:${b.key}`);
    expect(realSpec(ids[0])!.name).toBe(r.boats.find(b => b.elapsedS != null)!.boat.toUpperCase());
    const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, current: 'real', sea: 'real', realRace: r.id, opponents: ids, fleet: ids.length };
    const w = new World(courseFile(r.courseId), S, 7);
    expect(w.raceDate).toBe(r.date);
    expect(w.boats.slice(1).map(b => b.name.toUpperCase())).toEqual(r.boats.filter(b => b.elapsedS != null).map(b => b.boat.toUpperCase()));
    expect(w.boats.slice(1).map(b => b.no.replace(/\D/g, ''))).toEqual(r.boats.filter(b => b.elapsedS != null).map(b => b.key));
  });
});

import { realFleetFor } from '../src/sim/realRaces';
describe('realFleetFor (for the debrief)', () => {
  it('gives the real fleet by the race id or a World sailing it, names and times, no skippers; null for any other race', () => {
    const f = realFleetFor('GGYC_T008047221-r5')!;
    expect(f.boats.some(b => b.elapsed != null)).toBe(true); expect(f.courseNm).toBe(3.4);
    expect(JSON.stringify(f)).not.toMatch(/skipper/i);
    expect(realFleetFor({ settings: { realRace: 'GGYC_T008047221-r5' } })).toEqual(f);
    expect(realFleetFor({ settings: {} })).toBe(null); expect(realFleetFor('nope')).toBe(null);
  });
});

import { outlookFor } from '../src/sim/outlook';
import { planLegs } from '../src/sim/strategist';
describe('a real race whose course is uncertain', () => {
  // A perfect boat (the planner: the polar, NOAA's current, the observed wind, every leg on its best line) slower than
  // most of the real fleet means the course or the day's wind isn't what the fleet had: those races say so.
  it('is flagged exactly when a perfect boat is slower than the median real finisher', () => {
    for (const r of realRaces()) {
      const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, current: 'real', sea: 'real', opponents: [], fleet: 0 };
      const w = new World(courseFile(r.courseId), S, 7), o = outlookFor(w), legs = planLegs(w, o), last = legs[legs.length - 1];
      const perfect = (last.t0 - o.t0 + last.minutes) * 60;
      const fin = r.boats.filter(b => b.elapsedS != null && b.code == null).map(b => b.elapsedS!).sort((a, b) => a - b);
      expect(!!r.uncertain, `${r.id}: perfect ${(perfect / 60).toFixed(1)} min, median real ${(fin[Math.floor(fin.length / 2)] / 60).toFixed(1)}`).toBe(perfect > fin[Math.floor(fin.length / 2)]);
    }
    expect(realFleetFor('GGYC_T008047221-r1')!.uncertain).toMatch(/Course uncertain/);
    expect(realFleetFor('GGYC_T008047221-r5')!.uncertain).toBe(null);
  });
});
