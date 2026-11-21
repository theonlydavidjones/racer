/**
 * Her bottom on your own clock (r294, the owner's answers, 20 Nov 2026; docs/BOAT-CARE-PROPOSAL.md): the day her bottom
 * was last cleaned, and the weeks since, as the real calendar runs (as BoatSpec.laidUpUntil does). The sim reads
 * perf.cleanedWeeks as before (fouling.ts, condition.ts); it's worked out from the day as she sets off, so it grows
 * between sails, never during one. The fouling model stops at 26 weeks (fouling.ts), and so do these.
 *
 * Cleaning: Mike the diver, booked from her Care tab, cleans her at her slip; it's done by her next sail (the owner: "a
 * diver does the cleaning, done by the next sail"; no haul-out).
 */
import type { BoatSpec } from './spec';
import { localDay } from './spec';
import { fouling } from './fouling';

/** The fouling model's longest run (fouling.ts): her weeks stop growing there. */
export const MAX_WEEKS = 26;

/** Whole days from `a` to `b` (YYYY-MM-DD, local days; noon, so a summer-time change doesn't take an hour off a day). */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => new Date(s + 'T12:00').getTime();
  return Math.round((t(b) - t(a)) / 86400000);
}
/** The day `weeks` weeks before `today`. */
export function weeksBefore(today: string, weeks: number): string {
  const d = new Date(today + 'T12:00'); d.setDate(d.getDate() - weeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Weeks since her bottom was cleaned, on `today` (whole weeks, 0 to MAX_WEEKS). */
export function bottomWeeks(cleanedOn: string, today = localDay()): number {
  return Math.max(0, Math.min(MAX_WEEKS, Math.floor(daysBetween(cleanedOn, today) / 7)));
}
/**
 * As she sets off (a race or a cruise): Mike's booked cleaning done, then her weeks from the day, into perf.cleanedWeeks
 * for the sim. Returns true if anything changed (to be saved).
 */
export function careAtSail(b: BoatSpec, today = localDay()): boolean {
  let changed = false;
  if (b.diverBooked) { b.cleanedOn = today; delete b.diverBooked; changed = true; }
  if (!b.cleanedOn) { b.cleanedOn = weeksBefore(today, b.perf.cleanedWeeks); changed = true; }
  const w = bottomWeeks(b.cleanedOn, today);
  if (w !== b.perf.cleanedWeeks) { b.perf.cleanedWeeks = w; changed = true; }
  return changed;
}

/**
 * Her bottom as it is today, for her Care tab and the setup: the weeks on your clock, fouling.ts's label for them in this
 * month's water, and whether it's foul (slime or worse: enough to cost her speed, condition.ts), for the one line at the setup.
 */
export function bottomNow(b: BoatSpec, today = localDay()): { weeks: number; label: string; foul: boolean; slime: number; calc: number } {
  const weeks = b.cleanedOn ? bottomWeeks(b.cleanedOn, today) : b.perf.cleanedWeeks, f = fouling(weeks, Number(today.slice(5, 7)));
  return { weeks, label: f.label, foul: f.calc > 0 || f.slime >= 80e-6, slime: f.slime, calc: f.calc };
}
/** "slime · 9 weeks", "clean · this week". */
export const bottomWords = (n: { weeks: number; label: string }): string => `${n.label} · ${n.weeks === 0 ? 'this week' : n.weeks === 1 ? '1 week' : `${n.weeks} weeks`}`;
