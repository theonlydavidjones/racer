import results from '../boat/data/sf-folkboat-results.json';
import days from '../environment/data/sf-real-days.json';
import { COURSES } from '../courses/registry';

/*
 * Real past races: days the San Francisco Folkboat fleet actually raced, to sail again in that day's real wind and tide,
 * on the course they sailed, and see where you'd have placed among them (docs/VISION-ROADMAP.md, near term 7).
 *
 * From the published results (src/boat/data/sf-folkboat-results.json: Jibeset, GGYC's Seaweed Soup): a race is here
 * when every finisher's time is published, its course is on GGYC's course sheet (Addendum B), and the wind that day is in
 * the sim's record of what was observed (environment/data/sf-real-days.json). Where the scorer's course number and
 * distance disagree with the sheet, the race says so: the course is the number published (it's what the committee
 * flies), the disagreement shown beside it.
 *
 * The course sheet: the course files are the 2026–27 sheet (Jibeset DOC=X0). The 2025–26 sheet (DOC=cr) is assumed to
 * be the same table, UNVERIFIED (it couldn't be read again: jibeset refuses this project's fetches), and three of the four
 * 2025–26 races scored with a course disagree with the 2026–27 distances (sf-folkboat-results.json, as published):
 *
 *   race 1 (1 Nov 2025)   course 3    6.1 nm published   3.7 nm on the 2026–27 sheet
 *   race 3 (3 Jan 2026)   course 1    1.0 nm             1.6 nm
 *   race 4 (7 Feb 2026)   course 13   8.9 nm             5.0 nm
 *   race 5 (7 Mar 2026)   course 12   3.4 nm             3.4 nm   (agrees)
 *
 * Those races carry `sheetUnverified`. The player is warned ("course uncertain", UNCERTAIN below) only where a perfect
 * boat can't sail the drawn course as fast as the fleet did, so the warning still means something.
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
  /** why the course itself is in doubt (the sim's best possible time is slower than the real fleet's), in words; or null */
  uncertain: string | null;
  /** the course is drawn from the 2026–27 sheet, the race's own season's sheet unread, and its published distance disagrees */
  sheetUnverified: boolean;
  /** where the course comes from when the results don't give it (someone who sailed it), in words; or null */
  courseFrom: string | null;
  /** the results page */
  url: string;
  boats: RealBoat[];
}

type RawBoat = { sail: string; key: string; boat: string; skipper: string; elapsedS: number | null; place: number | null; code: string | null };
type RawRace = { raceNo: number; date: string; start: string | null; course: string | null; courseFrom?: string; distanceNm: number | null; sheet?: 'unverified'; url: string; boats: RawBoat[] };
type RawEvent = { source: string; id: string; name: string; races: RawRace[] };

/**
 * Races whose course is uncertain: a perfect boat (the sim's own polar, NOAA's predicted current and the wind observed
 * at Fort Point, every leg on the planner's best line, sim/strategist.ts planLegs) is slower than most of the
 * real fleet (than its median finisher). Measured 13 Nov 2026; tests/realRaces.test.ts checks the list against the planner. On the other
 * races the real fleet takes 0.9–1.5 × the perfect boat's time, as a fleet of real boats does.
 */
// (Race 1, 1 Nov 2025, may have sailed another course than the one scored: the scored course isn't always the one sailed.
// The 2026–27 season's race 1, 7 Nov 2026, had a last-minute course change the results don't show at all, the scorer
// leaving the course blank; the owner, who sailed it, gives it: course 2. That doesn't settle 1 Nov 2025, but a late
// change is one way its course 3, 6.1 nm and the fleet's 47 minutes could all fail to agree.)
// (7 Nov 2026 on course 2, the course known, is the sim's own yardstick, and it fails: a perfect boat takes 76 min
// against the fleet's 51–55 (13 Nov 2026). The tide is right, NOAA's SFB1204 2.2–2.4 kt ebb toward 271°, and the sim
// has the shore's relief (0.8 kt within 100 m of the Cityfront, 2.4 at the marks 400 m out); but the planner's runs
// east sail out in the stream (−1.9 kt along the leg) where a crew would hug the shore, and the record's wind fades to
// 6.5 kt for the second lap. Not flagged "course uncertain": the gap is the sim's to close, not the course's.)
const UNCERTAIN: Record<string, string> = {
  'GGYC_T008047221-r1': 'Course uncertain: on course 3 as the sheet draws it, a perfect boat in the wind observed at Fort Point (9 kt from 249°) and NOAA\'s ebb takes about 53 min, slower than every real finisher (47–52 min). It would need about 11 kt to make 47. The fleet may have sailed a shorter course, or had more wind than Fort Point recorded, so compare your time with care.'
};

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
      // (which one is the typo: the published distance in the winner's time, beside a Folkboat's hull speed, about 6 kt)
      const win = Math.min(...timed.map(b => b.elapsedS!)), kt = r.distanceNm != null ? r.distanceNm / (win / 3600) : 0;
      const doubt = r.distanceNm != null && nm && Math.abs(r.distanceNm - nm) > 0.15
        ? `The results give course ${r.course} as ${r.distanceNm} nm; the 2026–27 course sheet, drawn here, has it as ${nm} nm (that season's own sheet couldn't be checked). ${r.distanceNm} nm in the winner's time would be ${kt.toFixed(1)} kt${kt > 6 ? ', faster than a Folkboat sails, so the published distance isn\'t what was sailed' : ''}.`
        : null;
      out.push({
        id: `${ev.id}-r${r.raceNo}`, event: ev.name, raceNo: r.raceNo, date: r.date, start: r.start.slice(0, 5),
        courseId: course.id, courseNo: r.course, distanceNm: nm, doubt, uncertain: UNCERTAIN[`${ev.id}-r${r.raceNo}`] ?? null, sheetUnverified: r.sheet === 'unverified', courseFrom: r.courseFrom ?? null, url: r.url,
        boats: r.boats.map(b => ({ key: b.key, sail: b.sail, boat: b.boat, skipper: b.skipper, elapsedS: b.elapsedS, place: b.place, code: b.code }))
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const realRace = (id: string): RealRace | undefined => realRaces().find(r => r.id === id);

/** The boats that started (a time, or a code other than didn't start / didn't come): the fleet the sim sails her against. */
export const realStarters = (r: RealRace): RealBoat[] => r.boats.filter(b => b.elapsedS != null || (b.code != null && !/DN[SC]/.test(b.code)));

/** A sail number's digits, the way the results key a boat ('USA 113' → '113'). */
export const sailKey = (sail: string): string => sail.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

/**
 * The real boats the sim sails, as opponent ids, at most `max`: the starters, less any that wears your own sail number.
 * Your boat has the number on the water (two boats with one number can't be told apart, or scored); if it's hers, you
 * sail in her place, and the results say so.
 */
export function realFleetIds(r: RealRace, yourSail: string, max: number): string[] {
  const mine = sailKey(yourSail);
  return realStarters(r).filter(b => !mine || b.key !== mine).slice(0, max).map(b => `real:${r.id}:${b.key}`);
}

/** Where an elapsed time (s) would have placed among the real fleet's finishers (1 = first), and of how many. */
export function placeAmong(race: RealRace, elapsedS: number): { place: number; of: number } {
  const times = race.boats.filter(b => b.elapsedS != null && b.code == null).map(b => b.elapsedS!);
  return { place: 1 + times.filter(t => t < elapsedS).length, of: times.length + 1 };
}

/**
 * The real fleet of a real past race, for the debrief and the replay (the Debrief session's request): by the race's id,
 * or a World (or SimView) sailing one (its settings.realRace). Each finisher's elapsed time is from her fleet's start (the
 * gun) to her finish, as published: all on the same rating (time on time), so elapsed time decides, as in the sim. Boat
 * names only, no skippers' (the owner). Null for a race that isn't a real one.
 */
export interface RealFleet {
  boats: { name: string; sail: string; elapsed: number | null; place: number | null; code?: string }[];
  /** the course sheet's distance (nm); what the scorer published, if it disagrees, in words */
  courseNm: number; doubt: string | null;
  /** why the course itself is in doubt, in words; or null */
  uncertain: string | null;
  /** the course drawn from the 2026–27 sheet, the race's own season's unread, its published distance disagreeing */
  sheetUnverified: boolean;
  /** where the times come from, in words, and the results page */
  source: string; url: string;
}
export function realFleetFor(x: string | { settings: { realRace?: string } }): RealFleet | null {
  const id = typeof x === 'string' ? x : x.settings.realRace; if (!id) return null;
  const r = realRace(id); if (!r) return null;
  const title = (t: string) => t.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  return {
    boats: r.boats.map(b => ({ name: title(b.boat), sail: b.key, elapsed: b.elapsedS, place: b.place, ...(b.code ? { code: b.code } : {}) })),
    courseNm: r.distanceNm, doubt: r.doubt, uncertain: r.uncertain, sheetUnverified: r.sheetUnverified, source: `${r.event}, race ${r.raceNo} (${r.date}), published results`, url: r.url
  };
}
