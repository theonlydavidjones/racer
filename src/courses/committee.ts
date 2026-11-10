import { D2R, KT, V, brg, cross, dot, sub, wrap, type Vec } from '../core/math';
import { beatAngle, polar, runAngle } from '../boat/polar';
import { CURRENTS, currentAt, currentVector, shoreRelief } from '../environment/current';
import { CurrentField, nextSaturday, sfLocalToUtcMin, stationsFor } from '../environment/tide';
import { breezeAt, windTerrain, type WindDay } from '../environment/wind';
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
 * committee starts west (to windward) in the westerly, and only sends the fleet east when a beat to the west
 * won't work: light air against a strong flood, say. That's our inference, not the sheet's.
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
}

export function raceDay(S: Settings, windBase: number): RaceDay {
  const date = S.tideDate || nextSaturday(), gunUtc = sfLocalToUtcMin(date, S.tideTime || '12:00');
  const sea = S.windKt === 0;
  const wind = (p: Vec, min: number) => {
    const b = sea ? breezeAt(gunUtc + min, (S.windDay ?? 1) as WindDay) : { kt: S.windKt, from: windBase };
    return { kt: b.kt * windTerrain(p), from: b.from };
  };
  if (S.current === 'real') {
    const f = new CurrentField(stationsFor(gunUtc - 30, gunUtc + 6 * 60));
    return { gunUtc, wind, current: (p, min) => { f.setTime(gunUtc + min); const c = f.at(p), k = shoreRelief(p); return { x: c.x * k, y: c.y * k }; } };
  }
  const open = currentVector(CURRENTS[S.current] ?? CURRENTS.slack);
  return { gunUtc, wind, current: p => currentAt(p, open) };
}

export type LegKind = 'beat' | 'reach' | 'run';
export interface LegEstimate { to: string; kind: LegKind; minutes: number; sogKt: number }
export interface CourseEstimate { file: CourseFile; no: number; minutes: number; legs: LegEstimate[]; slowestKt: number; upwindStart: boolean }

/** Seconds lost in each tack or gybe, and at each mark. */
const MANOEUVRE_S = 8, ROUNDING_S = 10;

/** Time (s) to sail from a to b, and how: tacking or gybing on the best angles, or straight there (crabbing across the current). */
export function legTime(a: Vec, b: Vec, w: { kt: number; from: number }, c: Vec): { s: number; kind: LegKind } | null {
  const L = sub(b, a), d = Math.hypot(L.x, L.y);
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
  const C = buildCourse(file, { bias: 0, fleet });
  const pts = [C.center, ...C.marks.map(m => m.p), C.center], names = [...C.marks.map(m => m.name), 'Finish'];
  const legs: LegEstimate[] = [];
  let t = 0, slowest = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // the wind and tide when she's halfway down the leg (sail it once to find out when that is)
    let r = legTime(a, b, day.wind(mid, t / 60), day.current(mid, t / 60));
    r = legTime(a, b, day.wind(mid, (t + (r?.s ?? 600) / 2) / 60), day.current(mid, (t + (r?.s ?? 600) / 2) / 60));
    const s = r ? r.s : 4 * 3600, dist = Math.hypot(b.x - a.x, b.y - a.y), sog = r && r.s > 0 ? dist / r.s / KT : 0;
    legs.push({ to: names[i - 1], kind: r?.kind ?? 'beat', minutes: s / 60, sogKt: sog });
    if (dist > 50) slowest = Math.min(slowest, sog);
    t += s + (i < pts.length - 1 && C.marks[i - 1].type === 'round' ? ROUNDING_S : 0);
  }
  const w0 = day.wind(C.center, 0), first = sub(C.marks[0].p, C.center);
  const upwindStart = Math.abs(wrap(brg(first.x, first.y) - w0.from)) < 70;
  return { file, no: Number(file.id.replace(/\D/g, '')) || 0, minutes: t / 60, legs, slowestKt: slowest, upwindStart };
}

export interface CommitteeChoice { est: CourseEstimate; target: number; why: string; considered: number }

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/**
 * The committee's pick from the Seaweed Soup courses: the course that best fits the target time, starting to
 * windward, with no leg the fleet can barely sail. Among courses within a few percent of the best, the day decides
 * (the same day always gives the same course).
 */
export function chooseCourse(courses: CourseFile[], S: Settings): CommitteeChoice | null {
  const pool = courses.filter(c => c.group?.startsWith('Seaweed Soup'));
  if (!pool.length) return null;
  const day = raceDay(S, pool[0].windBase), target = TARGET_MIN[(S.raceLength ?? 'medium') as RaceLength] ?? 60;
  const score = (e: CourseEstimate) => Math.abs(Math.log(e.minutes / target)) + (e.upwindStart ? 0 : 0.35) + (e.slowestKt < 1 ? 1 : 0);
  const ranked = pool.map(f => estimateCourse(f, day, S.fleet)).map(e => ({ e, s: score(e) })).sort((a, b) => a.s - b.s);
  const near = ranked.filter(r => r.s <= ranked[0].s + 0.05);
  const pick = near[hash(`${S.tideDate}|${S.tideTime}|${S.windKt}|${S.current}|${S.raceLength}`) % near.length].e;
  const w = day.wind(buildCourse(pick.file, { bias: 0, fleet: S.fleet }).center, 0), c = day.current(buildCourse(pick.file, { bias: 0, fleet: S.fleet }).center, 0);
  const ckt = Math.hypot(c.x, c.y) / KT, ebb = dot(c, V(270)) > 0;
  const tide = ckt < 0.2 ? 'slack water' : `${ebb ? 'an ebb' : 'a flood'} of ${ckt.toFixed(1)} kt at the line`;
  const why = `${Math.round(w.kt)} kt from ${Math.round(w.from)}° and ${tide}: course ${pick.no} (${pick.file.distanceNm ?? '?'} nm) should take the leaders about ${Math.round(pick.minutes)} min, for a ${target}-minute race${pick.upwindStart ? ', starting to windward' : ''}.${!pick.upwindStart && ranked.some(r => r.e.upwindStart) ? ' A beat to the west would leave the fleet stuck against the tide, so the start is to the east.' : ''}`;
  return { est: pick, target, why, considered: pool.length };
}
