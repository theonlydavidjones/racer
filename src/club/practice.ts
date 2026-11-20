import { RC_COURSE } from '../courses/committee';
import { COURSES } from '../courses/registry';
import type { Settings } from '../settings';
import type { Series } from './season';

/**
 * Practice (r275; the owner, 20 Nov 2026, docs/FTUE-BRIEF.md §3): a race set up from the Race page is a sailing for
 * practice, not a race the player hosts. Any course, any real day, past or future, sailed now. At a default club it's
 * sailed as the club runs it: the committee's settings are the club's, not the player's. And it never counts in a
 * season: only a race entered from the Season page does.
 */

/** The race's host: the default club whose courses it sails (the Seaweed Soup's), or the practice area, no club's. */
export type Host = 'ggyc' | 'practice';
export const hostOf = (course: string): Host => course === RC_COURSE || COURSES.find(c => c.id === course)?.group ? 'ggyc' : 'practice';

/** The committee's settings: how the club starts and judges its races. */
export type Committee = Pick<Settings, 'seq' | 'prepFlag' | 'penaltyTurns' | 'judging' | 'bias'>;
/**
 * Each default club's, from its sailing instructions; where they're silent, the racing rules' own. The Seaweed Soup's
 * (GGYC, 2026–27 SIs rev. 1 of 1 Nov 2026 and NoR v1.1, https://www.jibeset.net/GGYC000.php?RG=T00227699; the 2025–26
 * set the same; read 20 Nov 2026): no start sequence is stated, so RRS 26's five minutes; no preparatory flag is
 * stated, and RRS 26 leaves it to the committee among P, I, Z, U and the black flag: P, the plain one (no sourced
 * fact: the committee's choice); the Part 2 penalty unchanged, so RRS 44.1's two turns; protests heard under Part 5
 * (SI 11, by Zoom; no umpires); the line between mark X, 300 yd north of the club, and the race deck (SI 5.2), its
 * angle not stated: square.
 */
export const CLUB_COMMITTEE: Record<Exclude<Host, 'practice'>, Committee> = {
  ggyc: { seq: 5, prepFlag: 'P', penaltyTurns: 2, judging: 'protests', bias: 0 }
};

/** The settings a race is sailed with: at a default club, its committee's in place of yours; anywhere else, as you set them. */
export function asTheClubRunsIt<T extends Settings>(S: T): T {
  if (S.mode !== 'race') return S;
  const h = hostOf(S.course);
  return h === 'practice' ? S : { ...S, ...CLUB_COMMITTEE[h] };
}

/**
 * The season race this sailing counts as: only one entered from the Season page (`entered`), and only while it's still
 * that race (its course, day, start and fleet, in the day's real conditions, the wind not pinned for a race sailed
 * again). A practice sailing set up the same way counts in no season.
 */
export function seasonRaceFor(S: Settings, entered: { series: Series; no: number } | null, windPinned: boolean): { series: Series; no: number } | null {
  if (!entered || S.mode !== 'race') return null;
  const { series, no } = entered, r = series.races.find(x => x.no === no);
  if (!r || r.abandoned || S.course !== r.courseId || S.tideDate !== r.date || S.tideTime !== r.start) return null;
  if (S.windKind !== 'auto' || S.windKt || S.windTurn || S.windDir != null || windPinned || S.current !== 'real') return null;
  if (S.opponents.length !== series.fleet.length || !series.fleet.every(o => S.opponents.includes(o))) return null;
  return { series, no };
}
