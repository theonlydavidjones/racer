import { clamp, n360, wrap, type Vec } from '../core/math';
import { LL } from '../geo/geo';
import { anyShoreDist, onGround } from '../geo/shore';
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
  /** Whether the source has the wind at this time (minutes since epoch, UTC): a past day's record runs 10:00–18:00, and
   * outside it `at` holds the nearest sample. Always, for the others. */
  covers(tMin: number): boolean;
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
  grid: { hours: number[]; cells: [number, number][]; days: Record<string, { kt: (number | null)[][]; from: (number | null)[][]; vis?: (number | null)[][]; sky?: (number | null)[][]; ceil?: (number | null)[][]; fog?: number[][] }>; fogWords?: string[] };
  visStation?: { id: string; name: string; lat: number; lon: number; hours: number[]; unit?: number; cap?: number }; visObs?: Record<string, string>;
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
  return out.length >= 10 ? smoothed(out) : null;
}
/**
 * The record's samples, each a centred [1, 2, 1]/4 mean with its neighbours (18 minutes), as the course-wide wind. Each
 * 2-minute mean carries the station's own quick turbulence and the shifts of a minute or two, which aren't the same a
 * kilometre away (scripts/fit-wind-shifts.mjs: about 5–6° of white noise between samples on a 10–15 kt westerly, against
 * the coherent shifts of several minutes, σ 6.5°, e^(−τ/8 min)); laid over the whole course they'd shift every boat at
 * once, every 6 minutes. The mean keeps about 80% of the several-minute shifts and 60% of the noise. (Neighbours more than
 * 6 minutes away, across a gap in the record, are left out.) The quick part is the puffs' (wind.ts).
 */
function smoothed(s: Sample[]): Sample[] {
  return s.map((x, i) => {
    let vx = 2 * x[1] * Math.sin(x[2] * Math.PI / 180), vy = 2 * x[1] * Math.cos(x[2] * Math.PI / 180), kt = 2 * x[1], w = 2;
    for (const j of [i - 1, i + 1]) {
      const y = s[j]; if (!y || Math.abs(y[0] - x[0]) > R.slotMin) continue;
      vx += y[1] * Math.sin(y[2] * Math.PI / 180); vy += y[1] * Math.cos(y[2] * Math.PI / 180); kt += y[1]; w++;
    }
    // (the direction by the vector mean, so it averages the shorter way round; the speed by the plain mean)
    return [x[0], kt / w, Math.hypot(vx, vy) > 1e-6 ? n360(Math.atan2(vx, vy) * 180 / Math.PI) : x[2], x[3]];
  });
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
const shoreFactor = (p: Vec) => 0.8 + 0.2 * clamp(anyShoreDist(p) / 400, 0, 1);
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

/**
 * How much of each forecast cell (2.5 km) is water: its weight in the wind over the water. The model's cells over the
 * land (the East Bay's flats, Marin) forecast the wind over the land, a fifth to a third lighter; near the shore the
 * water's own cells say what it does on the water.
 */
let WATER: number[] | null = null;
const waterShare = (cells: Vec[]) => WATER ??= cells.map(c => { let n = 0; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (!onGround({ x: c.x + i * 500, y: c.y + j * 500 })) n++; return n / 25; });

/** A forecast day: the NWS grid's wind across the race area (2.5 km cells), relative to the reference cell, plus the shore. */
function forecastField(date: string) {
  const g = R.grid.days[date], cells = R.grid.cells.map(([la, lo]) => LL(la, lo)), water = waterShare(cells);
  return (p: Vec, tMin: number) => {
    const hf = clamp(localMin(tMin) / 60 - R.grid.hours[0], 0, R.grid.hours.length - 1), h0 = Math.floor(hf), h1 = Math.min(R.grid.hours.length - 1, h0 + 1), f = hf - h0;
    const uv = (q: Vec) => {
      let u = 0, v = 0, w = 0;
      cells.forEach((c, i) => {
        const k0 = g.kt[i]?.[h0], k1 = g.kt[i]?.[h1], d0 = g.from[i]?.[h0], d1 = g.from[i]?.[h1];
        if (k0 == null || k1 == null || d0 == null || d1 == null) return;
        if (water[i] === 0) return;
        const kt = k0 + (k1 - k0) * f, d = (d0 + wrap(d1 - d0) * f) * Math.PI / 180, wt = water[i] / ((q.x - c.x) ** 2 + (q.y - c.y) ** 2 + 1200 * 1200) ** 1.5;
        u += Math.sin(d) * kt * wt; v += Math.cos(d) * kt * wt; w += wt;
      });
      return w > 0 ? { kt: Math.hypot(u, v) / w, from: (Math.atan2(u, v) * 180 / Math.PI + 360) % 360 } : null;
    };
    const a = uv(p), r = uv(REF);
    if (!a || !r || r.kt < 0.5) return { k: shoreFactor(p), turn: 0 };
    // (the limits only guard against a broken forecast: across the whole world the water's cells turn up to about 75°
    // from the reference cell's wind along the Berkeley flats, and blow from a fifth to twice as hard)
    return { k: shoreFactor(p) * clamp(a.kt / r.kt, 0.15, 3), turn: clamp(wrap(a.from - r.from), -100, 100) };
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
        covers: tMin => { const m = localMin(tMin); return m >= samples[0][0] && m <= samples[samples.length - 1][0]; },
        fieldSource: obs ? 'the lie of the land, set by what the stations around the Bay saw that day (Pier 1, Oakland, Point Potrero, Richmond)' : R.grid.days[date] ? 'the National Weather Service forecast grid (2.5 km cells)' : 'the lie of the land',
        at: tMin => { const w = interp(samples, localMin(tMin)); return { kind: k, from: w.from, kt: w.kt, gust: w.kt > 0.5 ? Math.max(1.05, w.gust / w.kt) : 1.4, steady: obs ? 1 : (k === 'light' ? 0.35 : 0.9), freq: 1 }; }
      };
    }
  }
  const k = windKindFor(date, kind);
  return {
    source: kind === 'auto' ? 'records' : 'chosen', kind: breezeAt(Date.parse(date + 'T20:00:00Z') / 60000, windDay, k).kind, realSwell: false, swell, at: tMin => breezeAt(tMin, windDay, k), covers: () => true,
    field: (p, _t, from) => ({ k: windTerrain(p, from), turn: 0 }), fieldSource: 'the lie of the land'
  };
}

/* ---------- visibility (fog), for the map's fog layer ---------- */

/** NWS caps its visibility at 10 statute miles; NOAA's Pier 17 sensor reads up to 10 km. */
export const NWS_VIS_CAP = 16093, PIER17_CAP = 10000;

export interface Visibility {
  /**
   * forecast: NWS visibility (m) on its 2.5 km grid; outlook: beyond it, only whether NWS forecasts fog, in its own
   * words; observed: NOAA's Pier 17 sensor, one point.
   */
  source: 'forecast' | 'outlook' | 'observed';
  /** Visibility at p, m; NaN where it isn't known (beyond the forecast grid; anywhere but the sensor; an outlook). */
  at(p: Vec): number;
  /** For an outlook: the forecast's words for fog at p ('' none; null beyond the grid). */
  words?(p: Vec): string | null;
  /** The highest it can read (NWS: 10 statute miles; the sensor: 10 km). */
  cap: number;
  /** Where it's known: the forecast grid's cells, or the sensor. */
  points: { p: Vec; m: number; words?: string }[];
  /** In words: whose numbers, where and when. */
  says: string;
}

/** A forecast grid cell's half-width (2.5 km cells): beyond this from every cell centre, the grid says nothing. */
const CELL_REACH = 1800;

/**
 * The visibility over the race area at a time (minutes since epoch, UTC), from real data only: what NOAA's Pier 17
 * visibility sensor saw (past hours, since 2021); the NWS forecast grid's visibility (from when it's fetched to the
 * next morning); beyond that in the coming week, whether the NWS forecast has fog. `{ none }`, with why, when there's
 * nothing real for that day and hour: the sim doesn't make fog up.
 */
export function visibilityFor(date: string, tMin: number): Visibility | { none: string; noFog?: boolean } {
  const h = localMin(tMin) / 60, hh = `${String(Math.floor(h)).padStart(2, '0')}:00`;
  // what was seen: the sensor, when it has the hour (or the one either side, said so)
  const st = R.visStation, b = R.visObs?.[date];
  if (st && b) {
    const hs = st.hours, unit = st.unit ?? 100, bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
    const val = (k: number) => k < 0 || k >= hs.length ? null : unit === 100 ? (bytes[k] === 255 ? null : bytes[k] * 100) : ((bytes[2 * k] << 8 | bytes[2 * k + 1]) === 65535 ? null : (bytes[2 * k] << 8 | bytes[2 * k + 1]) * unit);
    if (h >= hs[0] - 0.5 && h <= hs[hs.length - 1] + 0.5) {
      const k = Math.round(h - hs[0]), near = h - hs[0] - k >= 0 ? [k, k + 1, k - 1] : [k, k - 1, k + 1]; // (this hour, then the nearer neighbour)
      const kk = near.find(x => val(x) != null);
      if (kk != null) {
        const m = val(kk)!, p = LL(st.lat, st.lon), when = kk === k ? '' : `, at ${hs[kk]}:00 (no reading for ${hs[k]}:00)`;
        return { source: 'observed', cap: st.cap ?? PIER17_CAP, points: [{ p, m }], at: q => Math.hypot(q.x - p.x, q.y - p.y) < 500 ? m : NaN,
          says: `observed at NOAA's Pier 17 sensor (${st.id})${when}: one point on the Embarcadero, about 7 km inside the Gate; the Gate's own fog can differ` };
      }
    }
  }
  const g = R.grid.days[date];
  if (g?.vis) {
    const hs = R.grid.hours, hf = clamp(h - hs[0], 0, hs.length - 1);
    if (h < hs[0] - 0.5 || h > hs[hs.length - 1] + 0.5) return { none: `The forecast grid covers ${hs[0]}:00 to ${hs[hs.length - 1]}:00.` };
    const h0 = Math.floor(hf), h1 = Math.min(hs.length - 1, h0 + 1), f = hf - h0;
    const pick = (a: (number | null)[] | undefined) => { const x = a?.[h0], y = a?.[h1]; return x == null ? y ?? null : y == null ? x : x + (y - x) * f; };
    const issued = R.forecastIssued.slice(0, 10), cells = R.grid.cells.map(([la, lo]) => LL(la, lo));
    const points: Visibility['points'] = [];
    cells.forEach((p, i) => { const m = pick(g.vis![i]); if (m != null) points.push({ p, m }); });
    if (points.length) return { source: 'forecast', cap: NWS_VIS_CAP, points, at: idw(points), says: `National Weather Service forecast (issued ${issued}), 2.5 km grid` };
    // beyond the visibility forecast: whether the forecast's weather has fog, in its own words
    if (!g.fog) return { none: 'The NWS forecasts visibility only to the next morning.' };
    const W = R.grid.fogWords ?? [], fogs = cells.map((p, i) => ({ p, m: NaN, words: W[Math.max(g.fog![i]?.[h0] ?? 0, g.fog![i]?.[h1] ?? 0)] ?? '' }));
    if (!fogs.some(c => c.words)) return { none: `The NWS forecast (issued ${issued}) has no fog at ${hh}; it forecasts visibility only to the next morning.`, noFog: true };
    const nearest = (q: Vec) => { let best = fogs[0], bd = Infinity; for (const c of fogs) { const d = Math.hypot(c.p.x - q.x, c.p.y - q.y); if (d < bd) { bd = d; best = c; } } return bd < CELL_REACH ? best : null; };
    return { source: 'outlook', cap: NWS_VIS_CAP, points: fogs.filter(c => c.words), at: () => NaN, words: q => nearest(q)?.words ?? null,
      says: `National Weather Service forecast (issued ${issued}), 2.5 km grid; no visibility figure this far ahead` };
  }
  if (b) return { none: `NOAA's Pier 17 visibility sensor has no reading for ${hh}.` };
  return { none: date > R.updated.slice(0, 10) ? 'No visibility forecast reaches this day yet (the NWS forecast covers the coming week).' : 'No visibility was recorded for this day (NOAA\'s Pier 17 sensor, since 2021, has gaps).' };
}

/** Inverse-distance weighting between the grid's cell centres, within the grid (NaN beyond its cells). */
export function idw(points: { p: Vec; m: number }[]): (q: Vec) => number {
  return q => {
    let sw = 0, sv = 0, nearest = Infinity;
    for (const c of points) { const d2 = (c.p.x - q.x) ** 2 + (c.p.y - q.y) ** 2; nearest = Math.min(nearest, d2); if (d2 < 1) return c.m; const w = 1 / d2; sw += w; sv += w * c.m; }
    return nearest > CELL_REACH * CELL_REACH ? NaN : sv / sw;
  };
}

/**
 * The day's wind turned by `deg` (+ clockwise, a veer; − a back), the owner's "Turn the wind": the same kind of day
 * (its veer through the afternoon, its gusts and shifts, from the records), blowing a few degrees round from its usual
 * direction. Everything that reads the day's wind (the sim, the outlook, the committee's course) sees it turned.
 */
export function turnWeather(wx: DayWeather, deg = 0): DayWeather {
  if (!deg) return wx;
  return { ...wx, at: t => { const b = wx.at(t); return { ...b, from: n360(b.from + deg) }; } };
}
