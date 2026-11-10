import { clamp, n360, wrap, type Vec } from '../core/math';
import { LL } from '../geo/geo';
import { shoreDist } from '../geo/shore';
import real from './data/sf-real-days.json';
import { swellFor, type Swell, type SwellDay } from './sea';
import { OPEN_WATER, breezeAt, windKindFor, windTerrain, type Breeze, type WindDay, type WindKind } from './wind';

/**
 * The weather on a race day, the way it really was or will be:
 *  - a past day: what was observed: the wind at Fort Point every 6 minutes (its real shifts and gusts), and the
 *    swell at the San Francisco Bar buoy;
 *  - the coming week: the National Weather Service forecast, hour by hour;
 *  - any other day: drawn from the five years of records for its month (wind.ts, sea.ts).
 * Or you choose the kind of day, for practice. Data: scripts/fetch-real-days.mjs (refreshed daily).
 */

export type WeatherSource = 'observed' | 'forecast' | 'records' | 'chosen';
export interface DayWeather {
  source: WeatherSource;
  /** The kind of day (from its wind over the racing hours, for a real day). */
  kind: WindKind;
  /** The wind at a time (minutes since epoch, UTC): open-water speed, direction, gust factor, steadiness. */
  at(tMin: number): Breeze;
  /** The swell outside the Gate (`day`: small/typical/big, for a day without a real one). */
  swell(day: SwellDay): Swell;
  /** Whether the swell is the real one (observed or forecast). */
  realSwell: boolean;
  /** When the forecast was issued (ISO), for a forecast day. */
  issued?: string;
  /**
   * The wind across the course: at p and time tMin, the factor on the course-wide wind's speed and the turn (deg, +
   * veered) of its direction. `from` is the course-wide direction then. Includes the lie of the land (wind.ts).
   */
  field(p: Vec, tMin: number, from: number): { k: number; turn: number };
  /** What shapes the wind across the course, in words. */
  fieldSource: string;
}

interface StationData { name: string; lat: number; lon: number; days: Record<string, string> }
interface RealData {
  stationHours: number[]; stations: Record<string, StationData>;
  grid: { hours: number[]; cells: [number, number][]; days: Record<string, { kt: (number | null)[][]; from: (number | null)[][] }> };
  updated: string; forecastIssued: string; slot0: number; slotMin: number; slots: number;
  wind: Record<string, string>; swell: Record<string, [number, number, number]>;
  forecast: Record<string, { kt: (number | null)[]; from: (number | null)[]; gust: (number | null)[]; swell: [number | null, number | null, number | null] }>;
}
const R = real as unknown as RealData;
/** When the real-day data was last refreshed (ISO). */
export const REAL_UPDATED = R.updated;

/** San Francisco local minutes after midnight for a UTC minute. */
const localFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric' });
const localMin = (tMin: number) => { const p = Object.fromEntries(localFmt.formatToParts(new Date(tMin * 60000)).map(x => [x.type, x.value])); return (+p.hour % 24) * 60 + +p.minute; };

/** A day's samples: [local minute, kt, from, gust kt] (open-water kt). */
type Sample = [number, number, number, number];

function observedSamples(date: string): Sample[] | null {
  const s = R.wind[date]; if (!s) return null;
  const bin = atob(s), out: Sample[] = [];
  for (let k = 0; k < R.slots; k++) {
    const sp = bin.charCodeAt(k * 3), d = bin.charCodeAt(k * 3 + 1), g = bin.charCodeAt(k * 3 + 2);
    if (sp === 255 || d === 255) continue;
    out.push([R.slot0 + k * R.slotMin, sp / 4 * OPEN_WATER, d * 2, (g === 255 ? sp * 1.4 : g) / 4 * OPEN_WATER]);
  }
  return out.length >= 10 ? out : null;
}
function forecastSamples(date: string): Sample[] | null {
  const f = R.forecast[date]; if (!f) return null;
  const out: Sample[] = [];
  for (let h = 0; h < 24; h++) { const kt = f.kt[h], from = f.from[h]; if (kt != null && from != null) out.push([h * 60 + 30, kt, from, f.gust[h] ?? kt * 1.4]); }
  return out.length >= 6 ? out : null;
}

/** The kind of day from its wind over the racing hours (11:00–16:59), as scripts/fetch-wind-climate.mjs classes them. */
export function classify(samples: Sample[], scale = 1): WindKind {
  const race = samples.filter(s => s[0] >= 660 && s[0] < 1020);
  if (!race.length) return 'west';
  let vx = 0, vy = 0, sum = 0;
  for (const [, kt, from] of race) { vx += Math.sin(from * Math.PI / 180) * kt; vy += Math.cos(from * Math.PI / 180) * kt; sum += kt; }
  const mean = sum / race.length / scale, vec = Math.hypot(vx, vy) / race.length / scale, dir = (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;
  if (mean < 4 || vec < 0.5 * mean) return 'light';
  if (dir >= 200 && dir < 330) return 'west';
  if (dir >= 100 && dir < 200) return 'south';
  return 'north';
}

/** The wind between samples: speed and gust linearly, direction by the shorter way round. Outside them, the nearest. */
function interp(samples: Sample[], min: number): { kt: number; from: number; gust: number } {
  if (min <= samples[0][0]) return { kt: samples[0][1], from: samples[0][2], gust: samples[0][3] };
  const last = samples[samples.length - 1];
  if (min >= last[0]) return { kt: last[1], from: last[2], gust: last[3] };
  let i = 1; while (samples[i][0] < min) i++;
  const a = samples[i - 1], b = samples[i], f = (min - a[0]) / (b[0] - a[0]);
  return { kt: a[1] + (b[1] - a[1]) * f, from: n360(a[2] + ((((b[2] - a[2]) % 360) + 540) % 360 - 180) * f), gust: a[3] + (b[3] - a[3]) * f };
}

/* ---------- the wind across the course ---------- */

/** The shore's own slowdown (wind.ts), without the slot: for the forecast grid, which has the Gate's channelling in it. */
const shoreFactor = (p: Vec) => 0.8 + 0.2 * clamp(shoreDist(p) / 400, 0, 1);
const FORT_POINT = LL(37.8063, -122.4659);
/** The forecast's reference cell (MTR 84,107), whose hourly wind is the course-wide wind on a forecast day. */
const REF = LL(37.8118, -122.4488);

/** Inverse-distance blend of values at points, with a background value that takes over far from them (`R`, m). */
function blend(p: Vec, pts: { p: Vec; v: number }[], L: number, R = Infinity, bg = 0): number {
  let sw = R < Infinity ? 1 / (R * R) : 0, sv = sw * bg;
  for (const q of pts) { const w = 1 / ((p.x - q.p.x) ** 2 + (p.y - q.p.y) ** 2 + L * L); sw += w; sv += w * q.v; }
  return sw > 0 ? sv / sw : bg;
}

/** Fort Point's hourly vector means (station kt, from) over the same hours as the other stations, for a day. */
function fortPointHours(date: string): ([number, number] | null)[] | null {
  const s = R.wind[date]; if (!s) return null;
  const bin = atob(s);
  return R.stationHours.map(h => {
    let sp = 0, vx = 0, vy = 0, n = 0;
    for (let k = 0; k < R.slots; k++) {
      const m = R.slot0 + k * R.slotMin; if (Math.floor(m / 60) !== h) continue;
      const a = bin.charCodeAt(k * 3), d = bin.charCodeAt(k * 3 + 1); if (a === 255 || d === 255) continue;
      sp += a / 4; vx += Math.sin(d * 2 * Math.PI / 180) * a / 4; vy += Math.cos(d * 2 * Math.PI / 180) * a / 4; n++;
    }
    return n >= 5 ? [sp / n, (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360] : null;
  });
}
const stationHours = (id: string, date: string): ([number, number] | null)[] | null => {
  const s = R.stations[id]?.days[date]; if (!s) return null;
  const bin = atob(s);
  return R.stationHours.map((_, h) => { const a = bin.charCodeAt(h * 2), d = bin.charCodeAt(h * 2 + 1); return a === 255 || d === 255 ? null : [a / 4, d * 2]; });
};

/**
 * How each station usually reads against Fort Point, by kind of day and hour, over all the records: the mean log of its
 * speed over Fort Point's, and the mean turn of its direction. A station sited in shelter reads low every day; only how
 * today differs from its usual is news about the wind out on the water.
 */
type Usual = Record<string, Record<string, { lr: number; turn: number; n: number }[]>>;
let usual: Usual | null = null;
function usualPattern() {
  if (usual) return usual;
  const acc: Record<string, Record<string, { lr: number; tx: number; ty: number; n: number }[]>> = {};
  for (const date of Object.keys(R.wind)) {
    const fp = fortPointHours(date), obs = observedSamples(date); if (!fp || !obs) continue;
    const kind = classify(obs, OPEN_WATER);
    for (const id of Object.keys(R.stations)) {
      const st = stationHours(id, date); if (!st) continue;
      const cells = ((acc[id] ??= {})[kind] ??= R.stationHours.map(() => ({ lr: 0, tx: 0, ty: 0, n: 0 })));
      st.forEach((o, h) => {
        const f = fp[h]; if (!o || !f || o[0] < 3 || f[0] < 3) return;
        const c = cells[h], t = wrap(o[1] - f[1]) * Math.PI / 180;
        c.lr += Math.log(o[0] / f[0]); c.tx += Math.sin(t); c.ty += Math.cos(t); c.n++;
      });
    }
  }
  usual = Object.fromEntries(Object.entries(acc).map(([id, kinds]) => [id, Object.fromEntries(Object.entries(kinds).map(([k, cs]) =>
    [k, cs.map(c => ({ lr: c.n ? c.lr / c.n : 0, turn: c.n ? Math.atan2(c.tx, c.ty) * 180 / Math.PI : 0, n: c.n }))]))])) as Usual;
  return usual;
}

/**
 * A past day: the physics of the land (wind.ts) driven by Fort Point, nudged toward what the other stations saw: where
 * a station read stronger (or more veered) than it usually does against Fort Point, the water around it gets that much
 * more, fading with distance (an objective analysis, as gridded observed-wind analyses are made).
 */
function observedField(date: string, kind: WindKind) {
  const fp = fortPointHours(date), U = usualPattern();
  // per hour: each station's anomaly (speed factor − 1, turn)
  const pts = Object.entries(R.stations).map(([id, st]) => {
    const o = stationHours(id, date), u = U[id]?.[kind];
    return { p: LL(st.lat, st.lon), hours: R.stationHours.map((_, h) => {
      const a = o?.[h], f = fp?.[h], c = u?.[h];
      if (!a || !f || !c || c.n < 20 || a[0] < 3 || f[0] < 3) return null;
      return { a: clamp(Math.exp(Math.log(a[0] / f[0]) - c.lr) - 1, -0.45, 0.6), t: clamp(wrap(wrap(a[1] - f[1]) - c.turn), -30, 30) };
    }) };
  });
  const anchor = { p: FORT_POINT, v: 0 };
  return (p: Vec, tMin: number, from: number) => {
    const hf = clamp(localMin(tMin) / 60 - R.stationHours[0] - 0.5, 0, R.stationHours.length - 1), h0 = Math.floor(hf), h1 = Math.min(R.stationHours.length - 1, h0 + 1), f = hf - h0;
    const at = (h: number, key: 'a' | 't') => blend(p, [anchor, ...pts.filter(q => q.hours[h]).map(q => ({ p: q.p, v: q.hours[h]![key] }))], 1500, 9000, 0);
    const a = at(h0, 'a') * (1 - f) + at(h1, 'a') * f, t = at(h0, 't') * (1 - f) + at(h1, 't') * f;
    return { k: windTerrain(p, from) * (1 + a), turn: t };
  };
}

/** A forecast day: the NWS grid's wind across the race area (2.5 km cells), relative to the reference cell, plus the shore. */
function forecastField(date: string) {
  const g = R.grid.days[date], cells = R.grid.cells.map(([la, lo]) => LL(la, lo));
  return (p: Vec, tMin: number) => {
    const hf = clamp(localMin(tMin) / 60 - R.grid.hours[0], 0, R.grid.hours.length - 1), h0 = Math.floor(hf), h1 = Math.min(R.grid.hours.length - 1, h0 + 1), f = hf - h0;
    const uv = (q: Vec) => {
      let u = 0, v = 0, w = 0;
      cells.forEach((c, i) => {
        const k0 = g.kt[i]?.[h0], k1 = g.kt[i]?.[h1], d0 = g.from[i]?.[h0], d1 = g.from[i]?.[h1];
        if (k0 == null || k1 == null || d0 == null || d1 == null) return;
        const kt = k0 + (k1 - k0) * f, d = (d0 + wrap(d1 - d0) * f) * Math.PI / 180, wt = 1 / ((q.x - c.x) ** 2 + (q.y - c.y) ** 2 + 1200 * 1200) ** 1.5;
        u += Math.sin(d) * kt * wt; v += Math.cos(d) * kt * wt; w += wt;
      });
      return w > 0 ? { kt: Math.hypot(u, v) / w, from: (Math.atan2(u, v) * 180 / Math.PI + 360) % 360 } : null;
    };
    const a = uv(p), r = uv(REF);
    if (!a || !r || r.kt < 0.5) return { k: shoreFactor(p), turn: 0 };
    return { k: shoreFactor(p) * clamp(a.kt / r.kt, 0.3, 2), turn: clamp(wrap(a.from - r.from), -40, 40) };
  };
}

/**
 * The weather for a race day ('YYYY-MM-DD'). `kind`: 'auto' for the real day (observed, forecast, or drawn from the
 * records when there's neither), or a kind of day to practise in (from the records). `windDay`: a light, typical or
 * windy day of its kind, for a day from the records.
 */
export function dayWeather(date: string, kind: WindKind | 'auto' = 'auto', windDay: WindDay = 1): DayWeather {
  const obsSwell = R.swell[date], fc = R.forecast[date];
  const realSwell: Swell | null = obsSwell ? { hs: obsSwell[0], tp: obsSwell[1], from: obsSwell[2] }
    : fc && fc.swell[0] != null && fc.swell[1] != null ? { hs: fc.swell[0], tp: fc.swell[1], from: fc.swell[2] ?? 285 } : null;
  const swell = (d: SwellDay) => kind === 'auto' && realSwell ? { ...realSwell } : swellFor(date, d);
  if (kind === 'auto') {
    const obs = observedSamples(date), samples = obs ?? forecastSamples(date);
    if (samples) {
      const k = classify(samples, obs ? OPEN_WATER : 1), source: WeatherSource = obs ? 'observed' : 'forecast';
      const field = obs ? observedField(date, k) : R.grid.days[date] ? forecastField(date) : (p: Vec, _t: number, from: number) => ({ k: windTerrain(p, from), turn: 0 });
      return {
        source, kind: k, realSwell: !!realSwell, swell, issued: obs ? undefined : R.forecastIssued, field,
        fieldSource: obs ? 'the lie of the land, set by what the stations around the Bay saw that day (Pier 1, Oakland, Point Potrero, Richmond)' : R.grid.days[date] ? 'the National Weather Service forecast grid (2.5 km cells)' : 'the lie of the land',
        at: tMin => { const w = interp(samples, localMin(tMin)); return { kind: k, from: w.from, kt: w.kt, gust: w.kt > 0.5 ? Math.max(1.05, w.gust / w.kt) : 1.4, steady: obs ? 1 : (k === 'light' ? 0.35 : 0.9), freq: 1 }; }
      };
    }
  }
  const k = windKindFor(date, kind);
  return {
    source: kind === 'auto' ? 'records' : 'chosen', kind: breezeAt(Date.parse(date + 'T20:00:00Z') / 60000, windDay, k).kind, realSwell: false, swell, at: tMin => breezeAt(tMin, windDay, k),
    field: (p, _t, from) => ({ k: windTerrain(p, from), turn: 0 }), fieldSource: 'the lie of the land'
  };
}
