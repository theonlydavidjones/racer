import { describe, expect, it } from 'vitest';
import { realRaces } from '../src/sim/realRaces';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

/*
 * The sim against the real fleet (docs/VISION-ROADMAP.md near term 7: "the strongest validation of criterion 1"): each
 * real past race sailed by the AI as the real boats, on the real day, course and start, and the AI's finishing times set
 * beside the published ones. Reported, not tuned to: the test only checks the race runs and the sim's median is the
 * same order as the real one (within a factor of two); the numbers go to the log for the record. A long run (each race
 * is sailed to the last boat in, 15-30 minutes a race): only with VALIDATE=1 (VALIDATE=1 npx vitest run tests/sim-realraces.test.ts).
 */
describe.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VALIDATE)('the sim against the real fleet, race by race', () => {
  for (const r of realRaces()) it(`${r.date} course ${r.courseNo}: the AI fleet's times beside the real ones`, () => {
    const real = r.boats.filter(b => b.elapsedS != null && b.code == null);
    const ids = real.map(b => `real:${r.id}:${b.key}`);
    const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, current: 'real', sea: 'real', realRace: r.id, opponents: ids, fleet: ids.length };
    const w = new World(courseFile(r.courseId), S, 7), ai = w.boats.slice(1);
    // (to the gun, then until the AI boats are all in, or the SI's time limit: 17:30)
    const limit = 5.5 * 3600;
    while (w.t < limit && ai.some(b => !b.finished && !b.retired)) w.step(DT);
    const sim = ai.filter(b => b.finished).map(b => b.finishT!).sort((a, b) => a - b), med = (a: number[]) => a[Math.floor(a.length / 2)];
    const realT = real.map(b => b.elapsedS!).sort((a, b) => a - b);
    console.log(`${r.date} course ${r.courseNo} (${r.distanceNm} nm): real ${realT.map(t => (t / 60).toFixed(1)).join(' ')} min · sim ${sim.map(t => (t / 60).toFixed(1)).join(' ')} min · median sim/real ${(med(sim) / med(realT)).toFixed(2)}`);
    expect(sim.length).toBeGreaterThan(0);
    expect(med(sim) / med(realT)).toBeGreaterThan(0.5); expect(med(sim) / med(realT)).toBeLessThan(2);
  }, 3_600_000);
});
