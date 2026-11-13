import results from '../boat/data/sf-folkboat-results.json';
import days from '../environment/data/sf-real-days.json';
import { COURSES } from '../courses/registry';

/*
 * Real past races: days the San Francisco Folkboat fleet actually raced, to sail again in that day's real wind and tide,
 * on the course they sailed, and see where you'd have placed among them (docs/VISION-ROADMAP.md, near term 7).
 *
 * From the published results (src/boat/data/sf-folkboat-results.json: Jibeset, GGYC's Seaweed Soup): a race is here
 * when every finisher's time is published, its course is on GGYC's course sheet (Addendum B: the 2025–26 and 2026–27
 * sheets are the same table, so the course files in src/courses/data serve both seasons), and the wind that day is in
 * the sim's record of what was observed (environment/data/sf-real-days.json). Where the scorer's course number and
 * distance disagree with the sheet, the race says so: the course is the number published (it's what the committee
 * flies), the disagreement shown beside it.
 */

export interface RealBoat {
  /** the sail number's digits (one boat across events), the sail number as published, her name, her skipper */
  key: string; sail: string; boat: string; skipper: string;
  /** seconds from her fleet's start to her finish, or null (a scoring code: DNF, DNS…) */
  elapsedS: number | null; place: number | null; code: string | null;
}
export interface RealRace {
  /** e.g. 'GGYC_T008047221-r5' */
  id: string;
  event: string; raceNo: number;
  /** the day (YYYY-MM-DD), and the fleet's start, local (HH:MM) */
  date: string; start: string;
  /** the course sailed (a course file's id), its number on the sheet, and the sheet's distance (nm) */
  courseId: string; courseNo: string; distanceNm: number;
  /** what the scorer published, where it disagrees with the sheet, in words; or null */
  doubt: string | null;
  /** the results page */
  url: string;
  boats: RealBoat[];
}

type RawBoat = { sail: string; key: string; boat: string; skipper: string; elapsedS: number | null; place: number | null; code: string | null };
type RawRace = { raceNo: number; date: string; start: string | null; course: string | null; distanceNm: number | null; url: string; boats: RawBoat[] };
type RawEvent = { source: string; id: string; name: string; races: RawRace[] };

/** At least this many timed finishers, so a placing among them means something. */
const MIN_TIMED = 3;

export function realRaces(): RealRace[] {
  const wind = (days as unknown as { wind: Record<string, unknown> }).wind;
  const out: RealRace[] = [];
  for (const ev of (results as unknown as { events: RawEvent[] }).events) {
    if (ev.source !== 'jibeset') continue; // (the others publish places only)
    for (const r of ev.races) {
      const timed = r.boats.filter(b => b.elapsedS != null && b.code == null);
      if (timed.length < MIN_TIMED || !r.start || !r.course || !wind[r.date]) continue;
      const course = COURSES.find(c => c.id === `ss${r.course}`);
      if (!course) continue;
      const nm = course.distanceNm ?? 0;
      const doubt = r.distanceNm != null && nm && Math.abs(r.distanceNm - nm) > 0.15
        ? `The results give course ${r.course} as ${r.distanceNm} nm; GGYC's course sheet has it as ${nm} nm. One of the two was typed wrong: this is course ${r.course}, the number the committee flies.`
        : null;
      out.push({
        id: `${ev.id}-r${r.raceNo}`, event: ev.name, raceNo: r.raceNo, date: r.date, start: r.start.slice(0, 5),
        courseId: course.id, courseNo: r.course, distanceNm: nm, doubt, url: r.url,
        boats: r.boats.map(b => ({ key: b.key, sail: b.sail, boat: b.boat, skipper: b.skipper, elapsedS: b.elapsedS, place: b.place, code: b.code }))
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const realRace = (id: string): RealRace | undefined => realRaces().find(r => r.id === id);

/** Where an elapsed time (s) would have placed among the real fleet's finishers (1 = first), and of how many. */
export function placeAmong(race: RealRace, elapsedS: number): { place: number; of: number } {
  const times = race.boats.filter(b => b.elapsedS != null && b.code == null).map(b => b.elapsedS!);
  return { place: 1 + times.filter(t => t < elapsedS).length, of: times.length + 1 };
}
