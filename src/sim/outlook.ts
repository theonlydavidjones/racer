import { KT, V, brg, clamp, dot, type Vec } from '../core/math';
import { CURRENTS, currentAt, currentVector, windOnWater } from '../environment/current';
import type { SeaHere } from '../environment/sea';
import { CurrentField, events, sfClock, type TideStation } from '../environment/tide';
import { landLee, type Wind } from '../environment/wind';
import type { World } from './world';

/**
 * The day ahead, as a forecaster would look at it: the wind, the current and the sea at any place and time, from the
 * same data the boats sail in (environment/weather.ts: Fort Point observations, the NWS forecast grid or the NOAA
 * records; environment/tide.ts: NOAA current stations). Without the puffs, the oscillating shifts and the boats' own
 * wind shadows: those are the minute-to-minute part nobody can forecast, and the strategist says so.
 */
export interface Outlook {
  /** Minutes since epoch UTC at the start signal (or casting off, cruising). */
  t0: number;
  /** The true wind over the ground at p, at minute tMin (since epoch UTC): speed (kt), direction, gust factor. */
  wind(p: Vec, tMin: number): Wind & { gust: number };
  /** The current (m/s, the way it flows) at p, at minute tMin. */
  current(p: Vec, tMin: number): Vec;
  /** The wind felt on the water (air minus water motion): what the sails see. */
  windOnWater(p: Vec, tMin: number): Wind;
  /** The sea at p, at minute tMin. */
  sea(p: Vec, tMin: number): SeaHere;
  /** The NOAA current stations (real tide only). */
  stations: TideStation[] | null;
  /** The wind's chop at p around minute tMin (height m, period s): cached on a 400 m grid, every 10 minutes. */
  chop(p: Vec, tMin: number): { hs: number; tp: number };
  /** The course-wide wind at a time (no place): for the day's timeline. */
  breeze(tMin: number): { kt: number; from: number; gust: number };
}

/** The lee of the land changes slowly in space and with the wind's direction: cached on a 200 m grid, per 5°. */
const leeCache = new Map<string, number>();
function leeAt(p: Vec, from: number): number {
  const k = `${Math.round(p.x / 200)},${Math.round(p.y / 200)},${Math.round(from / 5) % 72}`;
  let v = leeCache.get(k);
  if (v == null) { v = landLee({ x: Math.round(p.x / 200) * 200, y: Math.round(p.y / 200) * 200 }, Math.round(from / 5) * 5); leeCache.set(k, v); if (leeCache.size > 60000) leeCache.clear(); }
  return v;
}

/** The outlook for a World's day, with its settings (a set wind strength or direction, a practice current) as it sails them. */
export function outlookFor(w: World): Outlook {
  const S = w.settings, wx = w.weather, gun = w.gunUtc;
  const fixedFrom = w.windModel.base, fixedKt = S.windKt;
  const breeze = (t: number) => {
    const b = wx.at(t);
    // as World.updateBreeze: the westerly from the records follows the clock; a set strength holds the gun's direction
    const kt = w.seaBreeze ? b.kt : fixedKt, from = S.windDir ?? (w.seaBreeze ? b.from : fixedFrom);
    // the gusts she'll actually meet: the sim's strongest puffs (environment/wind.ts Puffs: up to 0.3 × gustiness over
    // the mean, gustiness set from the day's gust factor as World.updateBreeze sets it), not the station's instantaneous
    // peak gust over its 6-minute mean, which reads 2–5 × on a light, puffy day
    const gIn = w.seaBreeze ? b.gust : w.windKind !== 'west' || w.realWind ? Math.max(1.5, b.gust) : 1.5;
    return { kt, from, gust: 1 + 0.3 * clamp((gIn - 1) / 0.55, 0.5, 1.5) };
  };
  const field = w.tide ? new CurrentField(w.tide.stations) : null;
  let fieldT = NaN;
  const open = currentVector(CURRENTS[S.current] ?? CURRENTS.slack);
  // the tide changes over hundreds of metres and minutes: a 100 m grid each half minute (the shore relief included)
  const currents = new Map<string, Vec>();
  const current = (p: Vec, t: number): Vec => {
    if (!field) return currentAt(p, open);
    const i = Math.round(p.x / 100), j = Math.round(p.y / 100), m = Math.round(t * 2), k = `${i},${j},${m}`;
    let v = currents.get(k);
    if (!v) {
      if (m / 2 !== fieldT) { fieldT = m / 2; field.setTime(fieldT); }
      v = field.atShore({ x: i * 100, y: j * 100 });
      if (currents.size > 200000) currents.clear();
      currents.set(k, v);
    }
    return v;
  };
  // the wind across the course changes over kilometres and the course-wide wind over minutes: worked out on a 150 m
  // grid each half minute, which keeps a whole briefing (thousands of points) quick
  const winds = new Map<string, Wind & { gust: number }>();
  const wind = (p: Vec, t: number) => {
    const i = Math.round(p.x / 150), j = Math.round(p.y / 150), m = Math.round(t * 2), k = `${i},${j},${m}`;
    let v = winds.get(k);
    if (!v) {
      const q = { x: i * 150, y: j * 150 }, tt = m / 2, b = breeze(tt), f = wx.field(q, tt, b.from);
      v = { kt: b.kt * f.k * leeAt(q, b.from), from: (b.from + f.turn + 360) % 360, gust: b.gust };
      if (winds.size > 200000) winds.clear();
      winds.set(k, v);
    }
    return v;
  };
  // (the chop as developed as the day's wind will have made it then: World.seaDurationAt)
  const sea = (p: Vec, t: number) => { const c = current(p, t); return w.sea.at(p, windOnWater(wind(p, t), c), c, q => current(q, t), w.seaDurationAt(t)); };
  const chops = new Map<string, { hs: number; tp: number }>();
  const chop = (p: Vec, t: number) => {
    const k = `${Math.round(p.x / 400)},${Math.round(p.y / 400)},${Math.round(t / 10)}`;
    let v = chops.get(k);
    if (!v) { const s = sea({ x: Math.round(p.x / 400) * 400, y: Math.round(p.y / 400) * 400 }, Math.round(t / 10) * 10); v = { hs: s.hsW, tp: s.tpW }; chops.set(k, v); }
    return v;
  };
  return {
    t0: gun, stations: w.tide?.stations ?? null, breeze, wind, current,
    windOnWater: (p, t) => windOnWater(wind(p, t), current(p, t)),
    sea, chop
  };
}

/* ---------- the tide, in words ---------- */

/** Flood or ebb, and how strong, at a station at a time: signed kt along its flood direction. */
export function tideWord(kt: number): string { return Math.abs(kt) < 0.15 ? 'slack' : `${kt > 0 ? 'flood' : 'ebb'} ${Math.abs(kt).toFixed(1)} kt`; }

/** The nearest NOAA current station to a point. */
export function nearestStation(st: TideStation[], p: Vec): TideStation {
  return st.reduce((a, s) => (Math.hypot(s.p.x - p.x, s.p.y - p.y) < Math.hypot(a.p.x - p.x, a.p.y - p.y) ? s : a));
}

export interface TideEvent { t: number; kind: 'max flood' | 'slack before ebb' | 'max ebb' | 'slack before flood'; kt: number }
const KINDS = ['max flood', 'slack before ebb', 'max ebb', 'slack before flood'] as const;
/** A station's slacks and peaks between two times (minutes since epoch UTC), as NOAA's tables list them. */
export function stationEvents(s: TideStation, from: number, to: number): TideEvent[] {
  if (s.t.length < 3) return [];
  // a harmonic station's series is regular (6 min); a subordinate's is already its events
  const regular = s.t.length > 20 && Math.abs((s.t[2] - s.t[1]) - (s.t[1] - s.t[0])) < 0.01;
  const ev: [number, number, number][] = regular ? events(s.t, s.v)
    : s.t.map((t, i) => [t, s.v[i], s.v[i] === 0 ? (i > 0 ? s.v[i - 1] > 0 : (s.v[i + 1] ?? 0) < 0) ? 1 : 3 : s.v[i] > 0 ? 0 : 2] as [number, number, number]);
  return ev.filter(e => e[0] >= from && e[0] <= to).map(([t, kt, k]) => ({ t, kind: KINDS[k], kt }));
}

/** The current at p as words: "ebb 1.4 kt setting 275°", relative to the flood/ebb of the nearest station. */
export function currentWords(c: Vec, floodDir: number | null): string {
  const kt = Math.hypot(c.x, c.y) / KT;
  if (kt < 0.15) return 'slack';
  const set = Math.round(brg(c.x, c.y));
  const kind = floodDir == null ? '' : dot(c, V(floodDir)) >= 0 ? 'flood ' : 'ebb ';
  return `${kind}${kt.toFixed(1)} kt setting ${String(set).padStart(3, '0')}°`;
}

export const clockOf = sfClock;
