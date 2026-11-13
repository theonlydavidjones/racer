import climate from './data/sf-air-climate.json';

/**
 * The air temperature on the race area (°C), for what the crew wear: on a warm, dry day some of them sail in shorts
 * (render/crewBody.ts kitFor; the owner's photo, reference/photos/josephine-vang-to-mast-base.jpg).
 *
 * What it knows (scripts/fetch-air-climate.mjs): NOAA CO-OPS 9414290 (San Francisco, Fort Point), hourly air
 * temperature 2021–2025, by month and local hour: the mean, the 10th and 90th percentiles, and the share of hours at
 * 20 °C or more. Fort Point is the cool, foggy end of the race area (the sea breeze and the summer fog come in over
 * it): its July afternoons average about 15 °C, its September and October ones about 17 with one hour in ten over 20.
 * The observed temperature on a past day and the NWS forecast's for the coming week are to follow (fetch-real-days).
 */
interface Climate { mean: (number | null)[][]; p10: (number | null)[][]; p90: (number | null)[][]; warm: (number | null)[][]; warmC: number }
const C = climate as unknown as Climate;

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
export function airTempC(_date: string, tMin: number): AirTemp {
  const { month, hour } = local(tMin);
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
