import results from '../boat/data/sf-folkboat-results.json';
import { realRace } from '../sim/realRaces';
import { RC_COURSE } from '../courses/committee';

/**
 * A racing season (docs/SEASON-PROPOSAL.md; the owner approved it on 13 Nov 2026, starting with the Seaweed Soup): a real
 * club series, sailed race by race on its real days in their observed wind and tide, against the club's fleet (the same
 * boats every race, as a series needs), scored as a series under the Racing Rules' Appendix A.
 *
 * GGYC's Manuel Fagundes Seaweed Soup, 2025–26: the race days, starts and course numbers are the published results'
 * (Jibeset, GGYC_T008047221, saved in src/boat/data/sf-folkboat-results.json). Race 3 (3 Jan 2026) was abandoned (every
 * boat scored ABN), so it stays abandoned here. Race 2 (6 Dec 2025) has no course recorded: it's sailed on the race
 * committee's choice of course for the day's wind (courses/committee.ts), and says so.
 *
 * How it's scored, best-supported answers (the series' sailing instructions couldn't be read: ggyc.com and jibeset refuse
 * this project's fetches):
 *  - Low point (RRS A4): a race's points are its places, the sim's race scores (rules/scoring.ts).
 *  - Ratings: level. The series scores the Folkboats on PHRF time on time, every Folkboat on the same rating: 252 on the
 *    2026–27 race 1 results sheet (reference/results/seaweed-soup-2026-27-race1-2026-11-07.png), and in every saved race
 *    the published points follow elapsed time exactly (sf-folkboat-results.json, 2025–26 races 1, 2, 4, 5). Time on time
 *    on equal ratings is boat for boat.
 *  - A boat that didn't finish (or retired, or was disqualified): the number of starters + 1, as the real series scored
 *    them (race 2 and race 4: 6 starters, DNF scored 7), an arrangement RRS A5.3 allows; a boat that didn't sail a race at
 *    all (DNC): the number of entries + 1 (A5.2; 9 for the real fleet's 8, as published).
 *  - Discards: one throwout, only once all five races are sailed. Latitude 38 (25 Apr 2025, quoting Scott Easom): "all five
 *    races completed … which created the throwout" (https://latitude38.com/lectronic/golden-gate-yc-seaweed-soup-san-francisco).
 *    With race 3 abandoned, 2025–26 has no throwout. To confirm against the series' own sailing instructions.
 *  - Ties (A8.1): the boats' race scores, best to worst, without excluded scores: the first difference decides; then (A8.2)
 *    the last race's score, then the one before, and so on, all scores counted. (The A wording here is from secondary
 *    sources; the rules' own text isn't reachable from this project.)
 */

export interface SeasonRace {
  no: number;
  /** the day (YYYY-MM-DD) and the start (HH:MM, local) */
  date: string; start: string;
  /** the course sailed: the real race's course file, or the committee's choice (RC_COURSE) when none was recorded */
  courseId: string; courseNo: string | null;
  /** the real past race (sim/realRaces.ts) it is, when it's one */
  realId: string | null;
  abandoned: boolean;
}
export interface Series {
  id: string; title: string; host: string; club: string;
  races: SeasonRace[];
  /** the races that make up the full series (the throwout comes only when all are sailed): calendar.length */
  scheduled: number;
  /** the series' race days as announced, published results or not (the season's overview shows those still to come) */
  calendar: { no: number; date: string }[];
  /** the club's fleet: the opponents' ids (the race setup's), the same every race */
  fleet: string[];
  url: string;
}

type Raw = { id: string; name: string; url: string; races: { raceNo: number; date: string; start: string | null; course: string | null; boats: { code: string | null }[] }[] };
/**
 * The seasons: GGYC's Seaweed Soup, each from its published results (Jibeset). 2026–27 is the season now under way: its
 * races appear as they're sailed and published (race 1, 7 Nov 2026, sailed on course 2: a last-minute change the results
 * don't show, from the owner, who sailed it; reference/results/seaweed-soup-2026-27-race1-2026-11-07.png). No date is
 * listed before it's published.
 *
 * Five races make the full series, for the throwout: the series is run as five races (Latitude 38, 25 Apr 2025: "all
 * five races completed", above; the 2025–26 results have five).
 */
const EVENTS: { event: string; id: string; title: string; dates?: string[] }[] = [
  { event: 'GGYC_T008047221', id: 'ggyc-seaweed-2025-26', title: 'Seaweed Soup 2025–26' },
  // the race days as announced, before their results: Latitude 38's racing calendar, "GOLDEN GATE YC — Seaweed Soup:
  // 11/7, 12/5, 1/2, 2/6, 3/6" (https://www.latitude38.com/calendar/, read 14 Nov 2026), the first Saturday of each month
  // as the series has run. The start times aren't announced: a race's own comes with its results.
  { event: 'GGYC_T00227699', id: 'ggyc-seaweed-2026-27', title: 'Seaweed Soup 2026–27', dates: ['2026-11-07', '2026-12-05', '2027-01-02', '2027-02-06', '2027-03-06'] }
];
const SCHEDULED = 5;

/** The series on offer, oldest first; the last is the current season. */
export function seasons(): Series[] {
  const all = (results as unknown as { events: Raw[] }).events, out: Series[] = [];
  for (const E of EVENTS) {
    const e = all.find(x => x.id === E.event); if (!e) continue;
    const races: SeasonRace[] = e.races.map(r => {
      const real = realRace(`${E.event}-r${r.raceNo}`), abandoned = r.boats.length > 0 && r.boats.every(b => b.code === 'ABN');
      return { no: r.raceNo, date: r.date, start: (r.start ?? '12:00').slice(0, 5), courseId: real?.courseId ?? RC_COURSE, courseNo: real?.courseNo ?? r.course, realId: real?.id ?? null, abandoned };
    });
    // the calendar: the published races' own days, then the announced ones still to come
    const calendar = races.map(r => ({ no: r.no, date: r.date }));
    for (const [i, date] of (E.dates ?? []).entries()) if (!calendar.some(c => c.no === i + 1)) calendar.push({ no: i + 1, date });
    calendar.sort((a, b) => a.no - b.no);
    out.push({
      id: E.id, title: E.title, host: 'Golden Gate YC', club: 'ggyc', races, calendar, scheduled: Math.max(SCHEDULED, calendar.length),
      // the five club boats and the first two of the club's other Folkboats: 8 entries with you, as the real fleet had
      fleet: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'], url: e.url
    });
  }
  return out;
}
/** The season under way: the latest. */
export const currentSeason = (): Series | undefined => seasons().at(-1);
export const seasonById = (id: string): Series | undefined => seasons().find(s => s.id === id);

/** One boat's result in one race of the series, as kept. */
export interface SeasonScore { sail: string; name: string; hull: string; you: boolean; points: number; code: string | null; club?: string }
/** A race of the series as sailed: when, and every boat's score. */
export interface SeasonResult { at: string; scores: SeasonScore[] }

const KEY = 'fbsim-season-v1';
type Store = Record<string, Record<number, SeasonResult>>;
function load(): Store { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v as Store : {}; } catch { return {}; } }
/** The races of a series you've sailed and saved, by race number. */
export const seasonResults = (id: string): Record<number, SeasonResult> => load()[id] ?? {};
/** Keep a race of the series (the one you saved to her logbook; sailing it again and saving replaces it). */
export function keepSeasonRace(id: string, no: number, r: SeasonResult): void {
  const all = load(); (all[id] ??= {})[no] = r;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* full or private: not kept */ }
}

export interface StandingRow {
  sail: string; name: string; hull: string; you: boolean; club?: string;
  /** by race number: points and code, or null (not in that race: DNC); `out` the excluded (thrown out) score */
  races: Record<number, { points: number; code: string | null; out: boolean }>;
  total: number; nett: number; rank: number;
}
/** How many throwouts: one once every scheduled race is sailed (see above). */
export const throwouts = (sailed: number, scheduled: number): number => sailed >= scheduled ? 1 : 0;

/**
 * The series standings from the races sailed. `entries`: the boats entered (a DNC scores entries + 1). Abandoned races
 * and races not yet sailed don't count.
 */
/**
 * A boat as she is now, by her sail number (her spec: name, hull color, club), where she's one the game knows: the owner's
 * rule, results follow a boat's listed club, so an edit to her shows in every race she's sailed, not only the next.
 */
export type LiveBoat = (sail: string) => { name?: string; hull?: string; club?: string } | undefined;
export function standings(series: Series, res: Record<number, SeasonResult>, live?: LiveBoat): { rows: StandingRow[]; sailed: number[]; discards: number } {
  const sailed = series.races.filter(r => !r.abandoned && res[r.no]).map(r => r.no);
  const boats = new Map<string, Omit<StandingRow, 'races' | 'total' | 'nett' | 'rank'>>();
  for (const no of sailed) for (const s of res[no].scores) boats.set(s.sail, { sail: s.sail, name: s.name, hull: s.hull, you: s.you || !!boats.get(s.sail)?.you, club: s.club });
  const entries = boats.size, discards = throwouts(sailed.length, series.scheduled); // (an abandoned race is a race not completed)
  const rows: StandingRow[] = [...boats.values()].map(b => {
    const races: StandingRow['races'] = {};
    for (const no of sailed) { const s = res[no].scores.find(x => x.sail === b.sail); races[no] = s ? { points: s.points, code: s.code, out: false } : { points: entries + 1, code: 'DNC', out: false }; }
    // the worst score(s) thrown out; of equal worst, the earliest race's (as the Low Point System's practice has it)
    const order = sailed.slice().sort((x, y) => races[y].points - races[x].points || x - y);
    for (const no of order.slice(0, Math.min(discards, sailed.length - 1))) races[no].out = true;
    const total = sailed.reduce((a, no) => a + races[no].points, 0), nett = sailed.reduce((a, no) => a + (races[no].out ? 0 : races[no].points), 0);
    const now = live?.(b.sail);
    return { ...b, ...(now?.name ? { name: now.name } : {}), ...(now?.hull ? { hull: now.hull } : {}), ...(now && 'club' in now ? { club: now.club } : {}), races, total, nett, rank: 0 };
  });
  rows.sort((a, b) => a.nett - b.nett || tieBreak(a, b, sailed));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].nett === r.nett && tieBreak(rows[i - 1], r, sailed) === 0 ? rows[i - 1].rank : i + 1; });
  return { rows, sailed, discards };
}
/** A8.1, then A8.2 (above): negative when `a` wins the tie. */
function tieBreak(a: StandingRow, b: StandingRow, sailed: number[]): number {
  const kept = (r: StandingRow) => sailed.filter(n => !r.races[n].out).map(n => r.races[n].points).sort((x, y) => x - y);
  const ka = kept(a), kb = kept(b);
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  for (let i = sailed.length - 1; i >= 0; i--) { const d = a.races[sailed[i]].points - b.races[sailed[i]].points; if (d) return d; }
  return 0;
}
