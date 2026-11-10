import { n360 } from '../core/math';
import real from './data/sf-real-days.json';
import { swellFor, type Swell, type SwellDay } from './sea';
import { OPEN_WATER, breezeAt, windKindFor, type Breeze, type WindDay, type WindKind } from './wind';

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
}

interface RealData {
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
      return {
        source, kind: k, realSwell: !!realSwell, swell, issued: obs ? undefined : R.forecastIssued,
        at: tMin => { const w = interp(samples, localMin(tMin)); return { kind: k, from: w.from, kt: w.kt, gust: w.kt > 0.5 ? Math.max(1.05, w.gust / w.kt) : 1.4, steady: obs ? 1 : (k === 'light' ? 0.35 : 0.9), freq: 1 }; }
      };
    }
  }
  const k = windKindFor(date, kind);
  return { source: kind === 'auto' ? 'records' : 'chosen', kind: breezeAt(Date.parse(date + 'T20:00:00Z') / 60000, windDay, k).kind, realSwell: false, swell, at: tMin => breezeAt(tMin, windDay, k) };
}
