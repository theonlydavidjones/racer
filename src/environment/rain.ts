import data from './data/sf-rain.json';
import { LL } from '../geo/geo';
import type { Vec } from '../core/math';

/**
 * Rain, from the record (scripts/fetch-rain.mjs): what the airports either side of the Bay reported (San Francisco
 * International, KSFO; Oakland International, KOAK), and the National Weather Service forecast for the coming week. For
 * the rain's look on the water and in the sky (render/scene.ts), and what the crew wear.
 *
 * The sim's rain has two strengths, light and heavy (the conditions panel's). From a report: heavy when the airport
 * reported heavy rain, or more than 7.6 mm fell in the hour (the American Meteorological Society's line between moderate
 * and heavy rain); light for any other rain or drizzle. The reported intensity leads: the hour's total is often missing,
 * and a special report part way through an hour starts its count again.
 * Between the airports, the nearer one's report, weighted by distance (1/d²) where both reported.
 * From the forecast: rain when the chance of it is 50% or more and the forecast has rain that hour, heavy by the same
 * line (its amount per hour, or its own word "heavy").
 * The record only goes back to when it was first fetched (November 2026; the API keeps about a week). Before that, and
 * beyond the forecast, there's no rain: the climate's by month needs the ASOS archive, not yet reachable from here.
 */
interface Station { name: string; lat: number; lon: number; days: Record<string, string> }
interface Forecast { mm: (number | null)[]; pop: (number | null)[]; code: (number | null)[] }
const D = data as unknown as { stations: Record<string, Station>; forecast: Record<string, Forecast> };
const IDS = Object.keys(D.stations);
const POS: Record<string, Vec> = Object.fromEntries(IDS.map(id => [id, LL(D.stations[id].lat, D.stations[id].lon)]));
/** Where the races are when no place is given: the Cityfront off the St. Francis Yacht Club. */
const CITYFRONT = LL(37.812, -122.445);
/** The American Meteorological Society's line between moderate and heavy rain (mm an hour). */
const HEAVY_MM = 7.6;

export type RainLevel = 0 | 1 | 2;
export interface RainHere { level: RainLevel; source: 'observed' | 'forecast' | 'none'; says: string }

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
/** The local date and hour at `tMin` (minutes since epoch, UTC). */
function local(tMin: number): { date: string; hour: number } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(tMin * 60000)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
}
const levelOf = (mm: number | null, code: number): RainLevel => code >= 3 || (mm != null && mm > HEAVY_MM) ? 2 : code >= 1 || (mm != null && mm > 0) ? 1 : 0;

/** The rain at `tMin` (minutes since epoch, UTC) at `p` (the sim's metres; the Cityfront if not given). */
export function rainAt(tMin: number, p: Vec = CITYFRONT): RainHere {
  const { date, hour } = local(tMin);
  // what the airports reported that hour: each one's level, weighted by distance
  let sw = 0, sv = 0, near = Infinity, nearLevel: RainLevel = 0;
  for (const id of IDS) {
    const b = D.stations[id].days[date]; if (!b) continue;
    const bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0)), mm = bytes[hour * 2], code = bytes[hour * 2 + 1];
    if (code === 255 && mm === 255) continue;
    const lv = levelOf(mm === 255 ? null : mm / 10, code === 255 ? 0 : code);
    const d2 = Math.max(1, (POS[id].x - p.x) ** 2 + (POS[id].y - p.y) ** 2);
    sw += 1 / d2; sv += lv / d2;
    if (d2 < near) { near = d2; nearLevel = lv; }
  }
  if (sw) {
    // (the weighted level, rounded; where the two airports differ by two steps, the nearer one's)
    const w = sv / sw, level = (Math.abs(w - nearLevel) > 1 ? nearLevel : Math.round(w)) as RainLevel;
    return { level, source: 'observed', says: level ? `${level === 2 ? 'heavy' : 'light'} rain reported at the airports (KSFO, KOAK) then` : 'no rain reported at the airports then' };
  }
  const f = D.forecast[date];
  if (f) {
    const mm = f.mm[hour], pop = f.pop[hour] ?? 0, code = f.code[hour] ?? 0;
    if (mm != null || code) {
      const level = pop >= 50 && ((mm ?? 0) > 0 || code > 0) ? levelOf(mm, code) : 0;
      return { level, source: 'forecast', says: level ? `${level === 2 ? 'heavy' : 'light'} rain forecast (${pop}% chance)` : `no rain forecast (${pop}% chance)` };
    }
  }
  return { level: 0, source: 'none', says: 'no record of rain for then' };
}
/** The rain to show: the conditions panel's when it's set, the record's otherwise ('real', or unset). */
export function rainLevel(set: 'real' | RainLevel | undefined, tMin: number, p?: Vec): RainLevel {
  return typeof set === 'number' ? set : rainAt(tMin, p).level;
}
