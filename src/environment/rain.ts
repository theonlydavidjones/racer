import data from './data/sf-rain.json';

/**
 * Rain, from the record: what the airports either side of the Bay reported (San Francisco International, KSFO; Oakland
 * International, KOAK), by the quarter hour, from 2021 (scripts/fetch-rain-history.mjs, the ASOS archive; the last week,
 * scripts/fetch-rain.mjs, the NWS API); the National Weather Service forecast for the coming week; and otherwise the
 * airports' climate by month (2021–2025). For the rain's look on the water and in the sky, and the visibility in it
 * (render/scene.ts, the map's visibility).
 *
 * The sim's rain has two strengths, light and heavy (the conditions panel's). From a report: heavy when the airport
 * reported heavy rain (+RA), or more than 7.6 mm fell in the hour (the American Meteorological Society's line between
 * moderate and heavy); moderate rain (RA) is heavy when the hour's fall was 4 mm or more (the geometric mean of the
 * scene's light and heavy rates, 2 and 8 mm/h), light otherwise; light rain and drizzle are light. A report's weather
 * holds until the next report. No weather reported but a measurable fall (0.01 in or more) is rain by its amount; a trace
 * alone is the fog's drip on the gauge.
 * Over the race area: the wetter of the two airports. They're 22 km either side of the Cityfront, almost equally far
 * from it: rain has edges and moves, so a blend by distance would draw a line through the course; a band over either is
 * most likely over the course too.
 * From the forecast: rain when its chance is 50% or more, or its coverage says likely or surer, and it has rain that hour;
 * heavy by its own word (or its heavy-rain attribute), or moderate with 4 mm or more an hour (the period's amount spread
 * over its hours: a mean that can't show a heavy hour).
 * From the climate (a day with neither): rain on as many days as the airports had in that month; on such a day, spells as
 * long as theirs, as many of the hours as theirs, and as many of those heavy; drawn from the date (the same for everyone).
 */
interface Station { name: string; lat: number; lon: number; from: string; to: string; days: Record<string, string> }
interface Forecast { mm: (number | null)[]; pop: (number | null)[]; code: (number | null)[]; likely?: (number | null)[] }
interface Climate { wetDay: number; wetHour: number; heavy: number; spellH: number }
const D = data as unknown as { stations: Record<string, Station>; forecast: Record<string, Forecast>; climate?: { stations: Record<string, Climate[]> } };
const IDS = Object.keys(D.stations);
/** The American Meteorological Society's line between moderate and heavy rain (mm an hour). */
const HEAVY_MM = 7.6;
/** Moderate rain counts as heavy from this much an hour (mm): between the scene's light 2 and heavy 8 mm/h. */
const MODERATE_SPLIT_MM = 4;
/** Measurable precipitation (mm): 0.01 in. */
const MEASURABLE_MM = 0.25;

export type RainLevel = 0 | 1 | 2;
export interface RainHere { level: RainLevel; source: 'observed' | 'forecast' | 'climate'; says: string }

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** The local date, hour and quarter hour of the day at `tMin` (minutes since epoch, UTC). */
function local(tMin: number): { date: string; hour: number; slot: number } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(tMin * 60000)).map(x => [x.type, x.value])), hour = +p.hour % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, slot: hour * 4 + Math.floor(+p.minute / 15) };
}
const days = new Map<string, Uint8Array>();
/** A quarter hour's level from a day's bytes (scripts/rain-days.mjs: keep the two the same); null if no report. */
function slotLevel(a: Uint8Array, s: number): RainLevel | null {
  const h = Math.floor(s / 4), mm = a[h] === 255 ? null : a[h] / 10, code = a[24 + s];
  let anyCode = false; for (let k = 0; k < 4; k++) { const c = a[24 + h * 4 + k]; if (c !== 255 && c > 0) anyCode = true; }
  const byAmount = (): RainLevel | null => mm == null ? null : mm >= MODERATE_SPLIT_MM ? 2 : mm >= MEASURABLE_MM ? 1 : 0;
  if (code === 255) return anyCode ? null : byAmount();
  if (code === 0) return anyCode ? 0 : byAmount();
  if (code === 3 || (mm != null && mm > HEAVY_MM)) return 2;
  if (code === 2) return mm != null && mm >= MODERATE_SPLIT_MM ? 2 : 1;
  return 1;
}
/** What an airport reported then: its level, or null if it has no report (a day in its record not on file was dry). */
function observed(id: string, date: string, slot: number): RainLevel | null {
  const st = D.stations[id], b = st.days[date];
  if (!b) return date >= st.from && date <= st.to ? 0 : null;
  let a = days.get(id + date);
  if (!a) { a = Uint8Array.from(atob(b), c => c.charCodeAt(0)); days.set(id + date, a); }
  return a.length === 120 ? slotLevel(a, slot) : null;
}
/** 0..1 from a string: the same for everyone. */
function draw(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
const word = (l: RainLevel) => l === 2 ? 'heavy rain' : 'light rain';

function find(tMin: number): RainHere {
  const { date, hour, slot } = local(tMin);
  // the airports' reports: the wetter of the two
  let obs: RainLevel | null = null;
  for (const id of IDS) { const l = observed(id, date, slot); if (l != null && (obs == null || l > obs)) obs = l; }
  if (obs != null) return { level: obs, source: 'observed', says: obs ? `${word(obs)} reported at the airports (KSFO, KOAK)` : 'no rain at the airports (KSFO, KOAK)' };
  // the NWS forecast
  const f = D.forecast[date];
  if (f && (f.mm[hour] != null || f.code[hour] != null)) {
    const mm = f.mm[hour] ?? 0, pop = f.pop[hour] ?? 0, code = f.code[hour] ?? 0, likely = !!f.likely?.[hour];
    const level: RainLevel = !((pop >= 50 || likely) && (mm > 0 || code > 0)) ? 0 : code >= 3 ? 2 : code === 1 ? 1 : mm >= MODERATE_SPLIT_MM ? 2 : 1;
    return { level, source: 'forecast', says: level ? `${word(level)} forecast (NWS, ${pop}% chance)` : `no rain forecast (NWS, ${pop}% chance)` };
  }
  // the climate: the airports' usual for the month, drawn from the date
  const cs = D.climate ? IDS.map(id => D.climate!.stations[id]?.[+date.slice(5, 7) - 1]).filter(Boolean) : [];
  if (!cs.length) return { level: 0, source: 'climate', says: 'no rain (no record)' };
  const mean = (k: keyof Climate) => cs.reduce((s, c) => s + c[k], 0) / cs.length;
  const spell = Math.max(1, Math.round(mean('spellH')));
  const wet = draw(date + ':wet') < mean('wetDay') && draw(`${date}:${Math.floor(hour / spell)}`) < mean('wetHour');
  const level: RainLevel = !wet ? 0 : draw(`${date}:${hour}:heavy`) < mean('heavy') ? 2 : 1;
  return { level, source: 'climate', says: level ? `${word(level)}, as the month's usual brings (KSFO, KOAK, 2021–2025)` : `no rain, as the month's usual (KSFO, KOAK, 2021–2025)` };
}

let memo: { q: number; r: RainHere } | null = null;
/** The rain over the race area at `tMin` (minutes since epoch, UTC). */
export function rainAt(tMin: number): RainHere {
  const q = Math.floor(tMin / 15); // (the record's quarter hours: the scene asks every frame)
  if (memo?.q !== q) memo = { q, r: find(tMin) };
  return memo.r;
}
/** The rain to show: the conditions panel's when it's set, the record's otherwise ('real', or unset). */
export function rainLevel(set: 'real' | RainLevel | undefined, tMin: number): RainLevel {
  return typeof set === 'number' ? set : rainAt(tMin).level;
}
