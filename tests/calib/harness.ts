// The calibration harness: the sim's AI fleet raced on the days the real Seaweed Soup Folkboat races were sailed
// (src/boat/data/sf-folkboat-results.json, the timed races), in that day's real wind (Fort Point, NOAA 9414290: the
// sim's real-day data) and predicted tide, from the real start time, on the course the race committee would choose
// for those conditions and for a race about as long as the real one. The finishes are written to calib-out/ for the
// summary (summary.calib.ts) to set beside the real fleet's.
import { chooseCourse } from '../../src/courses/committee';
import { COURSES } from '../../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import { DT, World } from '../../src/sim/world';
import type { RaceResult } from '../../src/ai/fleetStats';

/** Node's file functions, typed here: the project doesn't take Node's type definitions (as perf.test.ts does). */
export interface Fs { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, s: string): void; readFileSync(p: string, e: 'utf8'): string; readdirSync(p: string): string[] }
export const fs = (globalThis as unknown as { process: { getBuiltinModule(m: 'node:fs'): Fs } }).process.getBuiltinModule('node:fs');

/** The real timed races: date, start signal (local), the winner's elapsed time (s), Fort Point's mean wind (kt). */
export const REAL_DAYS = [
  { date: '2025-11-01', start: '12:03', winnerS: 2809, windKt: 7.3 },
  { date: '2025-12-06', start: '12:06', winnerS: 4741, windKt: 11.1 },
  { date: '2026-02-07', start: '12:03', winnerS: 5963, windKt: 5.2 },
  { date: '2026-03-07', start: '12:03', winnerS: 2787, windKt: 8.5 },
  { date: '2026-11-07', start: '13:35', winnerS: 3082, windKt: 7.4 }
] as const;

/** The same five club boats every race, so the order can be compared race to race (the real fleet's tau). */
export const FLEET = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'];
export const OUT = 'calib-out';

/** The race length the committee aims for nearest the real winner's time (committee.ts TARGET_MIN: 30, 60, 90 min). */
const lengthFor = (s: number): Settings['raceLength'] => {
  const m = s / 60, d = (t: number) => Math.abs(Math.log(m / t));
  return d(30) < d(60) ? 'short' : d(60) < d(90) ? 'medium' : 'long';
};

/** Race one real day with each seed; returns the finishes, and writes them to calib-out/<date>.json. */
export function raceDay(day: typeof REAL_DAYS[number], seeds: number[]): RaceResult[] {
  const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', windKind: 'auto', windKt: 0, current: 'real', tideDate: day.date, tideTime: day.start, raceLength: lengthFor(day.winnerS), opponents: FLEET, fleet: FLEET.length };
  const pick = chooseCourse(COURSES, S);
  if (!pick) throw new Error('no course');
  const out: (RaceResult & { course: number; dnf: number; seed: number; meanKt: number })[] = [];
  for (const seed of seeds) {
    const w = new World(pick.est.file, S, seed);
    const limit = Math.max(2 * day.winnerS, 3 * pick.est.minutes * 60); // (the real time limits are about this)
    let ktSum = 0, n = 0;
    while (w.t < limit && !w.boats.slice(1).every(b => b.finished)) {
      w.step(DT);
      if (w.t > 0 && (w.steps % 60) === 0) { ktSum += w.wind.kt; n++; }
    }
    const fleet = w.boats.slice(1);
    out.push({
      label: `${day.date} seed ${seed}`, course: pick.est.no, seed, windKt: day.windKt, meanKt: Math.round(ktSum / Math.max(1, n) * 10) / 10,
      finishers: fleet.filter(b => b.finished && b.finishT != null).map(b => ({ key: b.name, elapsedS: b.finishT! })),
      dnf: fleet.filter(b => !b.finished).length
    });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/${day.date}.json`, JSON.stringify(out, null, 1));
  return out;
}
