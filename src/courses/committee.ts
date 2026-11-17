import { D2R, KT, V, brg, cross, dot, sub, wrap, type Vec, hypot } from '../core/math';
import { beatAngle, polar, runAngle } from '../boat/polar';
import { CURRENTS, currentAt, currentVector } from '../environment/current';
import { CurrentField, nextSaturday, sfLocalToUtcMin, stationsFor } from '../environment/tide';
import { WIND_KIND_LABEL, type WindDay, type WindKind } from '../environment/wind';
import { dayWeather, turnWeather } from '../environment/weather';
import type { Settings } from '../settings';
import { buildCourse, type CourseFile } from './course';

/**
 * The race committee's choice of course.
 *
 * Rule 27.1: the committee signals the course no later than the warning signal. On the Seaweed Soup sheet
 * (Addendum B1.4) it's the course number, flown in numeral pennants. How a committee chooses is standard race
 * management (World Sailing's race management policies; US Sailing's race officer training): keep a table of how
 * long each course takes in each wind strength, and pick one that gives the leaders the target time, with the
 * first leg to windward. Here that table is worked out for the day: every leg sailed at the Folkboat's polar
 * speeds, tacking up the beats and gybing down the runs at the best angles, in the wind and the tide forecast for
 * when the fleet gets there.
 *
 * The Seaweed Soup sheet has courses starting west and starting east; it doesn't say when each is used. Here the
 * committee starts to windward when it can (west in the westerly; east when there's east in the wind), and off the
 * wind only when the beat won't work (light air against a strong tide). That's our inference, not the sheet's. The
 * line is fixed (the GGYC flagpole to X, running north), so in a northerly or southerly every start is a reach.
 */

export type RaceLength = 'short' | 'medium' | 'long';
/** The leaders' target time, minutes. */
export const TARGET_MIN: Record<RaceLength, number> = { short: 30, medium: 60, long: 90 };

/** The course id that means "the committee's choice". */
export const RC_COURSE = 'rc';

/** The day's wind and tide over the course, by minutes after the gun. */
export interface RaceDay {
  wind(p: Vec, min: number): { kt: number; from: number };
  current(p: Vec, min: number): Vec;
  /** Minutes since epoch UTC at the gun. */
  gunUtc: number;
  /** The kind of wind the day brings, and where it's from at the gun. */
  kind: WindKind; fromAtGun: number;
}

/** The day's wind and tide, as the World will have them (sim/world.ts). */
export function raceDay(S: Settings, windBase = 275): RaceDay {
  const date = S.tideDate || nextSaturday(), gunUtc = sfLocalToUtcMin(date, S.tideTime || '12:00');
  const sea = S.windKt === 0, day = (S.windDay ?? 1) as WindDay;
  const wx = turnWeather(dayWeather(date, S.windKind ?? 'auto', day), S.windTurn ?? 0), real = wx.source === 'observed' || wx.source === 'forecast';
  const g = wx.at(gunUtc), kind = wx.kind;
  if (!sea && kind === 'west' && !real) g.from = (windBase + (S.windTurn ?? 0) + 360) % 360; // as the World does
  if (S.windDir != null) g.from = S.windDir;
  const wind = (p: Vec, min: number) => {
    const b0 = sea ? wx.at(gunUtc + min) : { kt: S.windKt, from: g.from }, b = S.windDir != null ? { ...b0, from: S.windDir } : b0, f = wx.field(p, gunUtc + min, b.from); // the wind across the course
    return { kt: b.kt * f.k, from: (b.from + f.turn + 360) % 360 };
  };
  const base = { gunUtc, wind, kind, fromAtGun: g.from };
  if (S.current === 'real') {
    const f = new CurrentField(stationsFor(gunUtc - 30, gunUtc + 6 * 60));
    return { ...base, current: (p, min) => { f.setTime(gunUtc + min); return f.atShore(p); } };
  }
  const open = currentVector(CURRENTS[S.current] ?? CURRENTS.slack);
  return { ...base, current: p => currentAt(p, open) };
}

export type LegKind = 'beat' | 'reach' | 'run';
export interface LegEstimate { to: string; kind: LegKind; minutes: number; sogKt: number }
export interface CourseEstimate { file: CourseFile; no: number; minutes: number; legs: LegEstimate[]; slowestKt: number; upwindStart: boolean; firstTwa: number }

/** Seconds lost in each tack or gybe, and at each mark. */
// (8 s a tack or gybe, unsourced: calibrated together with FLEET_FACTOR against fleet runs, so it stays until the two
// are re-checked together; the passage planner's measured cost is sim/routing.ts manoeuvreS)
const MANOEUVRE_S = 8, ROUNDING_S = 10;
/**
 * Calibrated against the sim's own fleet sailing the courses (12 kt slack, the real tide and ebb; courses 1, 3, 5,
 * 41): the leaders take about 15% longer than the polar arithmetic (puffs and lulls, tacks, each other's wind), and
 * rounding Alcatraz costs about six minutes more (the wide berth, and the patchy air in its lee).
 */
const FLEET_FACTOR = 1.15;
export const ISLAND_ROUNDING_S = 360;

/** Time (s) to sail from a to b, and how: tacking or gybing on the best angles, or straight there (crabbing across the current). */
export function legTime(a: Vec, b: Vec, w: { kt: number; from: number }, c: Vec): { s: number; kind: LegKind } | null {
  const L = sub(b, a), d = hypot(L.x, L.y);
  if (d < 1) return { s: 0, kind: 'reach' };
  const twa = Math.abs(wrap(brg(L.x, L.y) - w.from)), beat = beatAngle(w.kt), run = runAngle(w.kt);
  // two boards at ±angle off the wind: how long on each to make good L over the ground
  const boards = (ang: number) => {
    const v = polar(w.kt, ang), h1 = w.from + ang, h2 = w.from - ang;
    const g1 = { x: V(h1).x * v + c.x, y: V(h1).y * v + c.y }, g2 = { x: V(h2).x * v + c.x, y: V(h2).y * v + c.y };
    const det = cross(g1, g2);
    if (Math.abs(det) < 1e-6) return null;
    const t1 = cross(L, g2) / det, t2 = cross(g1, L) / det;
    if (t1 < 0 || t2 < 0) return null;
    const t = t1 + t2;
    return t + MANOEUVRE_S * (1 + Math.floor(t / 300)); // a tack or gybe every five minutes or so
  };
  if (twa < beat) { const t = boards(beat); if (t != null) return { s: t, kind: 'beat' }; }
  if (twa > run) { const t = boards(run); if (t != null) return { s: t, kind: 'run' }; }
  // straight there: steer up-current enough to hold the line
  const u = { x: L.x / d, y: L.y / d }, cAlong = dot(c, u), cAcross = cross(u, c);
  let v = polar(w.kt, Math.max(beat, Math.min(run, twa)));
  for (let i = 0; i < 2; i++) {
    const crab = Math.asin(Math.max(-0.95, Math.min(0.95, cAcross / Math.max(0.2, v)))) / D2R;
    v = polar(w.kt, Math.max(beat, Math.min(run, Math.abs(wrap(brg(L.x, L.y) + crab - w.from)))));
  }
  const crab = Math.asin(Math.max(-0.95, Math.min(0.95, cAcross / Math.max(0.2, v))));
  const sog = v * Math.cos(crab) + cAlong;
  if (sog < 0.05) return null;
  return { s: d / sog, kind: twa < beat ? 'beat' : twa > run ? 'run' : 'reach' };
}

/** How long the course takes the leading Folkboat on the day (minutes), leg by leg. */
export function estimateCourse(file: CourseFile, day: RaceDay, fleet = 3): CourseEstimate {
  const C = buildCourse(file, { bias: 0, fleet, windFrom: day.fromAtGun });
  const pts = [C.center, ...C.marks.map(m => m.p), C.center], names = [...C.marks.map(m => m.name), 'Finish'];
  const legs: LegEstimate[] = [];
  let t = 0, slowest = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // the wind and tide when she's halfway down the leg (sail it once to find out when that is)
    let r = legTime(a, b, day.wind(mid, t / 60), day.current(mid, t / 60));
    r = legTime(a, b, day.wind(mid, (t + (r?.s ?? 600) / 2) / 60), day.current(mid, (t + (r?.s ?? 600) / 2) / 60));
    const s = r ? r.s : 4 * 3600, dist = hypot(b.x - a.x, b.y - a.y), sog = r && r.s > 0 ? dist / r.s / KT : 0;
    legs.push({ to: names[i - 1], kind: r?.kind ?? 'beat', minutes: s / 60, sogKt: sog });
    if (dist > 50) slowest = Math.min(slowest, sog);
    t += s + (i < pts.length - 1 && C.marks[i - 1].type === 'round' ? ROUNDING_S : 0);
  }
  const w0 = day.wind(C.center, 0), first = sub(C.marks[0].p, C.center);
  const firstTwa = Math.abs(wrap(brg(first.x, first.y) - w0.from)), upwindStart = firstTwa < BEAT_TWA; // a beat, as course.ts counts one
  const islands = C.marks.filter(m => m.reach).length;
  return { file, no: Number(file.id.replace(/\D/g, '')) || 0, minutes: (t * FLEET_FACTOR + islands * ISLAND_ROUNDING_S) / 60, legs, slowestKt: slowest, upwindStart, firstTwa };
}

/** A first leg this close to the wind (true wind angle, degrees) or closer is a beat, as course.ts counts one. */
const BEAT_TWA = 55;
/**
 * The first leg: as near a beat as the courses allow, and long enough to spread the fleet. World Sailing's Race
 * Management Manual (J.2.2, Course selection): "On a beat a fleet tends to spread out - the leading boats have clear air
 * and less interference from other boats. On a run the leading boats may be blanketed and the fleet closes up. Because
 * of this and because an upwind start is the fairest, a race should start with a beat or have a beating leg as soon as
 * possible after the start"; and (J.3.1) "sufficient distance between the start line and mark 1 to allow the fleet to
 * spread out before reaching mark 1". On the Bay's fixed marks the line can't move and in a southerly no course starts
 * with a beat, so the committee takes the one nearest it. This ranks the first legs of the courses that fit the time
 * (chooseCourse), lower nearer a beat: any beat 0, so a beat on offer always wins; off the wind, NOT_BEAT and up to
 * FIRST_OFF_BEAT more with the angle off a beat (most for a dead run), and up to FIRST_SHORT more for a first leg
 * shorter than SPREAD_MIN minutes, all of it at SHORT_MIN or less (a reach to a mark two minutes off the line has the
 * whole fleet there inside 30 s). A beat, however short, scores 0: it spreads the fleet (J.2.2), and the club's own
 * sheet starts many courses with a short beat to A. The weights only set how a short first reach trades against its
 * angle; they're the sim's estimates, and the manuals give no numbers.
 */
const NOT_BEAT = 0.35, FIRST_OFF_BEAT = 0.6, FIRST_SHORT = 0.35, SPREAD_MIN = 5, SHORT_MIN = 2;
export const firstLegScore = (e: CourseEstimate): number => e.upwindStart ? 0
  : NOT_BEAT + FIRST_OFF_BEAT * Math.max(0, e.firstTwa - BEAT_TWA) / (180 - BEAT_TWA)
  + FIRST_SHORT * Math.min(1, Math.max(0, (SPREAD_MIN - (e.legs[0]?.minutes ?? SPREAD_MIN)) / (SPREAD_MIN - SHORT_MIN)));

export interface CommitteeChoice { est: CourseEstimate; target: number; why: string; considered: number }

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/**
 * How far off the target time a course still fits it, as |log(minutes / target)|: 0.35 is about 30% short or 40% long.
 * It's the margin the committee has always given a course that starts with a beat over one that doesn't (a beat that
 * far off the time was taken over a reach right on it). The manuals give no number; this is the sim's estimate. Swept
 * over 444 winds, tides and race lengths (races more than 35% off the target / starting with a beat): 0.25 gives 24 / 255,
 * 0.35 gives 55 / 278, 0.45 gives 95 / 305. At 0.35 the beats dropped are courses 45-57% over the target time.
 */
export const TIME_FIT = 0.35;
/** When no course fits the time, the committee looks at this many nearest it. */
const NEAREST_FEW = 3;

/**
 * The committee's pick from the Seaweed Soup courses, in two steps, as a race officer does it:
 *  1. The courses that fit the time: the leaders' expected time within TIME_FIT of the target, and no leg the fleet can
 *     barely sail (under 1 kt over the ground). If none fit, the few nearest the time.
 *  2. Of those, the one whose first leg is a beat, or as near one as they allow and long enough to spread the fleet
 *     (firstLegScore: World Sailing Race Management Manual J.2.2 and J.3.1). Among equals, the nearest the time; among
 *     courses within a few percent of that, the day decides (the same day always gives the same course).
 */
export function chooseCourse(courses: CourseFile[], S: Settings): CommitteeChoice | null {
  const pool = courses.filter(c => c.group?.startsWith('Seaweed Soup'));
  if (!pool.length) return null;
  const day = raceDay(S, pool[0].windBase), target = TARGET_MIN[(S.raceLength ?? 'medium') as RaceLength] ?? 60;
  const off = (e: CourseEstimate) => Math.abs(Math.log(e.minutes / target)) + (e.slowestKt < 1 ? 1 : 0);
  const ests = pool.map(f => estimateCourse(f, day, S.fleet));
  const fits = ests.filter(e => off(e) <= TIME_FIT);
  const shortlist = fits.length ? fits : [...ests].sort((a, b) => off(a) - off(b)).slice(0, NEAREST_FEW);
  const bestLeg = Math.min(...shortlist.map(firstLegScore));
  const ranked = shortlist.filter(e => firstLegScore(e) <= bestLeg + 0.02).sort((a, b) => off(a) - off(b));
  const near = ranked.filter(e => off(e) <= off(ranked[0]) + 0.05);
  const pick = near[hash(`${S.tideDate}|${S.tideTime}|${S.windKt}|${S.current}|${S.raceLength}`) % near.length];
  const beats = ests.filter(e => e.upwindStart);
  const at = buildCourse(pick.file, { bias: 0, fleet: S.fleet, windFrom: day.fromAtGun }).center, w = day.wind(at, 0), c = day.current(at, 0);
  const ckt = hypot(c.x, c.y) / KT, ebb = dot(c, V(270)) > 0;
  const tide = ckt < 0.2 ? 'slack water' : `${ebb ? 'an ebb' : 'a flood'} of ${ckt.toFixed(1)} kt at the line`;
  const why = `${WIND_KIND_LABEL[day.kind]}, ${Math.round(w.kt)} kt from ${Math.round(w.from)}°, and ${tide}: course ${pick.no} (${pick.file.distanceNm ?? '?'} nm) should take the leaders about ${Math.round(pick.minutes)} min, for a ${target}-minute race${pick.upwindStart ? ', starting to windward' : ''}.${!pick.upwindStart && beats.length ? (beats.every(e => e.slowestKt < 1) ? ' The beat would leave the fleet stuck against the tide, so the first leg is off the wind.' : ' The courses that start with a beat run too long or too short for the time, so the first leg is off the wind.') : !pick.upwindStart ? ' The line runs north from the club and can\'t be moved, so in this wind no course starts to windward: it\'s a reaching start.' : ''}`;
  return { est: pick, target, why, considered: pool.length };
}
