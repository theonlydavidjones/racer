import climate from './data/sf-air-climate.json';
import real from './data/sf-real-days.json';

/**
 * The air temperature on the race area (°C), for what the crew wear: on a warm, dry day some of them sail in shorts
 * (render/crewBody.ts kitFor; the owner's photo, reference/photos/josephine-vang-to-mast-base.jpg).
 *
 * What it knows (scripts/fetch-air-climate.mjs): NOAA CO-OPS 9414290 (San Francisco, Fort Point), hourly air
 * temperature 2021–2025, by month and local hour: the mean, the 10th and 90th percentiles, and the share of hours at
 * 20 °C or more. Fort Point is the cool, foggy end of the race area (the sea breeze and the summer fog come in over
 * it): its July afternoons average about 15 °C, its September and October ones about 17 with one hour in ten over 20.
 * A day it has the record of (scripts/fetch-real-days.mjs): what Fort Point read that day, hourly 09:00–18:00; the coming
 * week: the NWS forecast grid's temperature at the Cityfront cell (MTR 84,107). Otherwise the climate.
 */
interface Climate { mean: (number | null)[][]; p10: (number | null)[][]; p90: (number | null)[][]; warm: (number | null)[][]; warmC: number }
const C = climate as unknown as Climate;

interface Real { airStation?: { hours: number[] }; airObs?: Record<string, string>; forecast?: Record<string, { air?: (number | null)[] }> }
const R = real as unknown as Real;
/** That day's Fort Point readings (°C) at AIR_HOURS, null where missing. */
const obsCache = new Map<string, (number | null)[] | null>();
function observed(date: string): (number | null)[] | null {
  if (obsCache.has(date)) return obsCache.get(date)!;
  const b = R.airObs?.[date], v = b ? Array.from(atob(b), ch => { const x = ch.charCodeAt(0); return x === 255 ? null : x / 4 - 10; }) : null;
  obsCache.set(date, v); return v;
}
/** A day's hourly series at an hour (fractional), between the readings either side; null if neither is there. */
function series(vals: (number | null)[], hours: number[], hour: number): number | null {
  if (hour < hours[0] - 0.5 || hour > hours[hours.length - 1] + 0.5) return null;
  const f = Math.max(0, Math.min(hours.length - 1, hour - hours[0])), i0 = Math.floor(f), i1 = Math.min(hours.length - 1, i0 + 1), a = vals[i0], b = vals[i1];
  return a == null ? b : b == null ? a : a + (b - a) * (f - i0);
}
const localFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', month: 'numeric', hour: 'numeric', minute: 'numeric' });
/** The local month (0–11) and the hour of the day (0–24, with minutes) at `tMin` (minutes since epoch, UTC). */
function local(tMin: number): { month: number; hour: number } {
  const p = Object.fromEntries(localFmt.formatToParts(new Date(tMin * 60000)).map(x => [x.type, x.value]));
  return { month: +p.month - 1, hour: (+p.hour % 24) + +p.minute / 60 };
}
/** A month's table at an hour, between the hours either side (the day warms and cools smoothly). */
function at(tab: (number | null)[][], month: number, hour: number): number | null {
  const h0 = Math.floor(hour) % 24, h1 = (h0 + 1) % 24, f = hour - Math.floor(hour), a = tab[month][h0], b = tab[month][h1];
  return a == null ? b : b == null ? a : a + (b - a) * f;
}

export interface AirTemp {
  /** the temperature (°C) */
  c: number;
  /** of how many hours like this one (this month, this hour) the air is at least 20 °C */
  warmShare: number;
  /** where it comes from, said plainly */
  source: string;
  /** the day's own (observed or forecast), not the climate's usual */
  observed?: boolean;
}
/** The air temperature at `tMin` (minutes since epoch, UTC) on `date` (the race day, YYYY-MM-DD). */
export function airTempC(date: string, tMin: number): AirTemp {
  const { month, hour } = local(tMin), warmShare = at(C.warm, month, hour) ?? 0;
  const o = observed(date), hs = R.airStation?.hours;
  if (o && hs) { const c = series(o, hs, hour); if (c != null) return { c, warmShare, observed: true, source: `observed at NOAA's Fort Point station (9414290) that day` }; }
  const fc = R.forecast?.[date]?.air;
  if (fc?.length) { const c = series(fc, fc.map((_, k) => k), hour); if (c != null) return { c, warmShare, observed: true, source: `the National Weather Service forecast for the Cityfront (grid cell MTR 84,107)` }; }
  return { c: at(C.mean, month, hour) ?? 15, warmShare: at(C.warm, month, hour) ?? 0,
    source: `the usual for this month and hour at NOAA's Fort Point station (9414290, 2021–2025)` };
}
/** The temperature counted as a warm day for shorts (°C). A judgement, not a sourced figure: about where people
 * sailing in a breeze, with a jacket on, take their salopettes off. */
export const WARM_C = 20;

/** 0..1 from a date (YYYY-MM-DD): the same for everyone sailing that day. */
function dayDraw(date: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
/**
 * Whether it's warm (WARM_C or more) at `tMin` on `date`. Where the sim has the day's own temperature (observed or
 * forecast), that says. Where it has only the climate, the day is warm as often as Fort Point's hours are: the share of
 * hours at 20 °C or more in that month at that hour (NOAA CO-OPS 9414290, 2021–2025), against one number drawn from the
 * date (so a warm day is the same day for everyone, and warm all afternoon if it's warm at its warmest hour: one draw
 * for the whole day, the warmer hours' larger shares passing it first).
 */
export function warmAt(date: string, tMin: number): boolean {
  const a = airTempC(date, tMin);
  if (a.observed) return a.c >= WARM_C;
  return dayDraw(date) < a.warmShare;
}
