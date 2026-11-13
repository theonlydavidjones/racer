import climate from './data/sf-air-climate.json';
import real from './data/sf-real-days.json';
import { LL } from '../geo/geo';
import type { Vec } from '../core/math';

/**
 * The air temperature where the boat is (°C), for what the crew wear: on a warm, dry day some of them sail in shorts
 * (render/crewBody.ts dressWarm; the owner's photo, reference/photos/josephine-vang-to-mast-base.jpg).
 *
 * From NOAA's shore stations that measure it round the race area (scripts/fetch-air-climate.mjs, fetch-real-days.mjs):
 * Fort Point (9414290, at the cool, foggy west end: the sea breeze and the summer fog come in over it), Pier 1 on the
 * Embarcadero (9414311), Alameda (9414750) and Richmond (9414863). In August–October afternoons Fort Point reaches
 * 20 °C on about one day in eight; Pier 1, Alameda and Richmond on more than two in five (2021–2025).
 * - A past day: what each station read that day, hourly 09:00–18:00.
 * - The coming week: the NWS forecast grid's temperature at the Cityfront cell (MTR 84,107, by Crissy Field), carried to
 *   the other stations as an anomaly: each station's usual for that month and hour, plus how far the forecast is from
 *   Fort Point's usual then (the forecast cell's nearest station).
 * - Otherwise each station's climate: by month and local hour, the mean, and the shares of warm hours and warm days.
 * Between the stations, by inverse-distance weighting (weights 1/d², d from the boat to each station; at a station,
 * that station's). Where some stations have the day's readings and some don't, only those that do.
 */
interface StationClimate { name: string; lat: number; lon: number; mean: (number | null)[][]; warm: (number | null)[][]; warmDay: (number | null)[] }
const C = climate as unknown as { warmC: number; stations: Record<string, StationClimate> };
interface StationDays { name: string; lat: number; lon: number; days: Record<string, string> }
interface Real { airHours?: number[]; airStations?: Record<string, StationDays>; forecast?: Record<string, { air?: (number | null)[] }> }
const R = real as unknown as Real;
const FORT_POINT = '9414290';
const IDS = Object.keys(C.stations);
const POS: Record<string, Vec> = Object.fromEntries(IDS.map(id => [id, LL(C.stations[id].lat, C.stations[id].lon)]));
/** Where the races are when no place is given: the Cityfront off the St. Francis Yacht Club. */
const CITYFRONT = LL(37.812, -122.445);

/** That day's readings at a station (°C) at airHours, null where missing. */
const obsCache = new Map<string, (number | null)[] | null>();
function observed(id: string, date: string): (number | null)[] | null {
  const k = id + date;
  if (obsCache.has(k)) return obsCache.get(k)!;
  const b = R.airStations?.[id]?.days?.[date], v = b ? Array.from(atob(b), ch => { const x = ch.charCodeAt(0); return x === 255 ? null : x / 4 - 10; }) : null;
  obsCache.set(k, v); return v;
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
/** Inverse-distance weighting (1/d²) of the values given per station; null if none. */
function blend(p: Vec, vals: Record<string, number | null>): number | null {
  let sw = 0, sv = 0;
  for (const id of IDS) {
    const v = vals[id]; if (v == null) continue;
    const d2 = (POS[id].x - p.x) ** 2 + (POS[id].y - p.y) ** 2;
    if (d2 < 1) return v;
    sw += 1 / d2; sv += v / d2;
  }
  return sw ? sv / sw : null;
}
/** Each station's temperature at a local hour on a date: observed, or the forecast carried as an anomaly; null each where neither. */
function dayTemps(date: string, month: number, hour: number): { vals: Record<string, number | null>; source: 'observed' | 'forecast' } | null {
  const hs = R.airHours;
  if (hs) {
    const vals = Object.fromEntries(IDS.map(id => { const o = observed(id, date); return [id, o ? series(o, hs, hour) : null]; }));
    if (Object.values(vals).some(v => v != null)) return { vals, source: 'observed' };
  }
  const fc = R.forecast?.[date]?.air;
  const f = fc?.length ? series(fc, fc.map((_, k) => k), hour) : null, fp = at(C.stations[FORT_POINT].mean, month, hour);
  if (f != null && fp != null) return { vals: Object.fromEntries(IDS.map(id => { const m = at(C.stations[id].mean, month, hour); return [id, m == null ? null : m + (f - fp)]; })), source: 'forecast' };
  return null;
}

export interface AirTemp {
  /** the temperature (°C) */
  c: number;
  /** of how many hours like this one (this month, this hour, here) the air is at least 20 °C */
  warmShare: number;
  /** where it comes from, said plainly */
  source: string;
  /** the day's own (observed or forecast: `source` says which), not the climate's usual */
  real?: boolean;
}
/** The air temperature at `tMin` (minutes since epoch, UTC) on `date` (the race day, YYYY-MM-DD), at `p` (the sim's
 * metres; the Cityfront if not given). */
export function airTempC(date: string, tMin: number, p: Vec = CITYFRONT): AirTemp {
  const { month, hour } = local(tMin);
  const warmShare = blend(p, Object.fromEntries(IDS.map(id => [id, at(C.stations[id].warm, month, hour)]))) ?? 0;
  const d = dayTemps(date, month, hour), c = d ? blend(p, d.vals) : null;
  if (d && c != null) return { c, warmShare, real: true, source: d.source === 'observed' ? `observed that day at NOAA's shore stations round the Bay, weighted by distance` : `the National Weather Service forecast for the Cityfront, carried to the stations round the Bay by their usual differences` };
  return { c: blend(p, Object.fromEntries(IDS.map(id => [id, at(C.stations[id].mean, month, hour)]))) ?? 15, warmShare,
    source: `the usual for this month and hour at NOAA's shore stations round the Bay (2021–2025), weighted by distance` };
}
/** The temperature counted as a warm day for shorts (°C): 68 °F, the owner's (13 Nov 2026). */
export const WARM_C = 20;

/** 0..1 from a date (YYYY-MM-DD): the same for everyone sailing that day. */
function dayDraw(date: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
/** The racing hours (local) a day's kit is decided over. */
const RACE_HOURS = [12, 13, 14, 15, 16];
/**
 * Whether `date` is a warm day at `p` (WARM_C or more at any hour 12:00–16:59, the racing hours): decided once for the
 * day, so nobody changes clothes in the middle of a race.
 * - A day the sim has the temperature of (observed, or the NWS forecast): the warmest racing hour there, blended between
 *   the stations.
 * - A day it has only the climate for: warm as often as the stations' days were in that month (the share of days with a
 *   reading at 20 °C or more 12:00–16:59, 2021–2025, blended between the stations), against one number drawn from the
 *   date (the same day for everyone; and a warmer place on the same day is warm first).
 * Not yet: in real life the warm afternoons come with light wind and no fog (offshore or weak sea-breeze days: Fort
 * Point's August–October warm afternoons averaged 7 kt, the rest 9); on a climate-only day the draw here is independent
 * of the day's wind and fog, and heat that comes for several days in a row comes here a day at a time.
 */
export function warmDay(date: string, p: Vec = CITYFRONT): boolean {
  const month = +date.slice(5, 7) - 1;
  const hot = RACE_HOURS.map(h => { const d = dayTemps(date, month, h); return d ? blend(p, d.vals) : null; });
  if (hot.some(v => v != null)) return hot.some(v => v != null && v >= WARM_C);
  return dayDraw(date) < (blend(p, Object.fromEntries(IDS.map(id => [id, C.stations[id].warmDay[month]]))) ?? 0);
}
