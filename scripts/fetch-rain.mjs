#!/usr/bin/env node
/**
 * Rain, by the quarter hour: what fell at the airports either side of the Bay this past week (observed), and the National
 * Weather Service forecast for the coming week. The sim's real rain (environment/rain.ts): its look on the water, the
 * sky's murk and the visibility. Run it at least weekly (the API keeps about a week: a longer gap is a hole the
 * archive's run, scripts/fetch-rain-history.mjs, fills).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-rain.mjs      (npm run data:rain)
 *
 * Sources (public domain):
 *  - Observed: the NWS's station observations (api.weather.gov, the airports' ASOS/METAR reports) at San Francisco
 *    International (KSFO) and Oakland International (KOAK): the reported weather's rain and drizzle and their intensity
 *    (not what's only "in the vicinity"), and the precipitation since the last routine report, from the METAR's own
 *    P group in its remarks (the API's precipitationLastHour is often missing where the METAR has it).
 *  - Forecast: the NWS gridded forecast at the Cityfront cell (MTR 84,107, the cell the wind's forecast uses), by local
 *    hour: the quantitative precipitation (mm over each period, spread evenly over its hours: right for whether it
 *    rains, but a period's mean can't show a heavy hour), the probability of precipitation, the forecast weather's own
 *    intensity (and its "heavy rain" attribute), and whether its coverage word says rain is likely or surer.
 *
 * The days' encoding: scripts/rain-days.mjs. Output: src/environment/data/sf-rain.json (the archive's years, the climate
 * and the stations' from..to are kept).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { encodeDays, mergeDay, needed, localAt, localDate, b64, unb64, noReports, datesBetween } from './rain-days.mjs';

const OUT = new URL('../src/environment/data/sf-rain.json', import.meta.url);
const UA = 'folkboat-racing-sim (personal project)';
const STATIONS = [
  { id: 'KSFO', name: 'San Francisco International', lat: 37.61961, lon: -122.36558 },
  { id: 'KOAK', name: 'Oakland International', lat: 37.72126, lon: -122.22115 }
]; // (positions: api.weather.gov/stations)
const GRID = 'MTR/84,107';
const BACK_DAYS = 8;

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' } });
      if (res.ok) return await res.json();
      console.warn(`HTTP ${res.status} ${url}`);
    } catch (e) { console.warn(e.message); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Failed: ' + url);
}
/** An observation's wet weather at the field (rain-days.mjs's codes: 1 light rain, 2 moderate, 3 heavy, 4 drizzle only,
 * 0 none): a METAR's "RA" with no sign is moderate; a thunderstorm counts only with its rain, which the API lists as rain;
 * what's only in the vicinity isn't at the field. */
function intensity(pw) {
  const here = (pw ?? []).filter(w => !w.inVicinity), rain = here.filter(w => w.weather === 'rain');
  if (rain.length) return Math.max(...rain.map(w => w.intensity === 'light' ? 1 : w.intensity === 'heavy' ? 3 : 2));
  return here.some(w => w.weather === 'drizzle') ? 4 : 0;
}
/** The METAR's P group (hundredths of an inch since the last routine report), mm; null if it has none. */
const pGroup = raw => { const m = / RMK .*?\bP(\d{4})\b/.exec(raw ?? ''); return m ? +m[1] / 100 * 25.4 : null; };

let prev = null;
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { console.warn('No existing file: starting it.'); }
const now = Date.now();

/* ---------- observed: the airports' reports ---------- */
const stations = {};
for (const st of STATIONS) {
  const reports = [];
  let url = `https://api.weather.gov/stations/${st.id}/observations?start=${new Date(now - BACK_DAYS * 86400e3).toISOString().slice(0, 19)}Z&limit=500`;
  for (let page = 0; url && page < 10; page++) {
    const j = await get(url);
    for (const f of j.features ?? []) {
      const p = f.properties, api = p.precipitationLastHour?.value; // (mm; often missing)
      reports.push({ ms: Date.parse(p.timestamp), raw: p.rawMessage, mm: pGroup(p.rawMessage) ?? (api != null && Number.isFinite(api) ? api : null), code: intensity(p.presentWeather) });
    }
    url = (j.features ?? []).length ? j.pagination?.next : null;
  }
  const old = prev?.stations?.[st.id] ?? {}, days = { ...(old.days ?? {}) };
  const fetched = encodeDays(reports), first = localDate(now - (BACK_DAYS - 1) * 86400e3), yesterday = localDate(now - 86400e3);
  // (the last full day with reports: the record's end can't pass it)
  const last = reports.length ? localDate(Math.max(...reports.map(r => r.ms))) : first, upTo = last > yesterday ? yesterday : localDate(Date.parse(last + 'T12:00Z') - 86400e3);
  for (const date of datesBetween(first, last)) {
    // (the first day fetched only in part is skipped; a day with no report at all is unknown, not dry; the API's reports,
    // every five minutes, win over the archive's hourly ones already on file)
    const b = mergeDay(fetched.get(date) ?? noReports(), unb64(days[date]));
    if (needed(b) || date > yesterday) days[date] = b64(b); else delete days[date];
  }
  // the record's span: on to the last full day fetched, if this fetch reaches back to where it ended (else a hole: the
  // archive's run fills it)
  let { from, to } = old;
  if (!from) { from = first; to = upTo; }
  else if (to >= localDate(Date.parse(first + 'T12:00Z') - 86400e3)) to = upTo > to ? upTo : to;
  else console.warn(`${st.id}: the record ends ${to}, more than a week ago: run scripts/fetch-rain-history.mjs ${to} to fill the gap.`);
  stations[st.id] = { name: st.name, lat: st.lat, lon: st.lon, from, to, days: Object.fromEntries(Object.entries(days).sort()) };
  console.log(`${st.id}: ${reports.length} reports, ${fetched.size} days fetched, record ${from}..${to}, ${Object.keys(days).length} days on file`);
}

/* ---------- forecast: the NWS grid at the Cityfront ---------- */
const g = (await get(`https://api.weather.gov/gridpoints/${GRID}`)).properties;
/** An NWS series ("…/PT6H" → value) by local date and hour: `spread`, the value shared over the period's hours (an amount);
 * otherwise held through them. */
function hourly(series, conv, spread = false) {
  const out = {};
  for (const v of series?.values ?? []) {
    const [t0, dur] = v.validTime.split('/'), ms = Date.parse(t0);
    const m = dur.match(/P(?:(\d+)D)?T?(?:(\d+)H)?/), n = (+(m?.[1] ?? 0)) * 24 + +(m?.[2] ?? 0) || 1;
    for (let h = 0; h < n; h++) {
      const L = localAt(ms + h * 3600e3); (out[L.date] ??= Array(24).fill(null))[L.hour] = v.value == null ? null : conv(spread ? v.value / n : v.value);
    }
  }
  return out;
}
const WET_FC = ['rain', 'rain_showers', 'drizzle', 'freezing_rain', 'freezing_drizzle']; // (a thunderstorm's own rain is forecast as rain or showers beside it)
/** The forecast weather's rain intensity (0 none, 1 light or very light, 2 moderate or unsaid, 3 heavy, or the "heavy rain"
 * attribute), and whether its coverage says likely or surer (likely, definite; numerous, widespread; periods, frequent). */
const fcCode = ws => Math.max(0, ...(ws ?? []).filter(w => WET_FC.includes(w.weather)).map(w => w.intensity === 'heavy' || (w.attributes ?? []).includes('heavy_rain') ? 3 : w.intensity === 'light' || w.intensity === 'very_light' ? 1 : 2));
const LIKELY = ['likely', 'definite', 'numerous', 'widespread', 'periods', 'frequent'];
const fcLikely = ws => (ws ?? []).some(w => WET_FC.includes(w.weather) && LIKELY.includes(w.coverage)) ? 1 : 0;
const r2 = x => Math.round(x * 100) / 100;
const qpf = hourly(g.quantitativePrecipitation, v => r2(v), true), pop = hourly(g.probabilityOfPrecipitation, v => Math.round(v));
const wx = hourly(g.weather, fcCode), cov = hourly(g.weather, fcLikely);
const today = localAt(now).date, forecast = {}, none = () => Array(24).fill(null);
for (const date of Object.keys(qpf).sort()) if (date >= today) forecast[date] = { mm: qpf[date], pop: pop[date] ?? none(), code: wx[date] ?? none(), likely: cov[date] ?? none() };
console.log(`forecast: ${Object.keys(forecast).join(', ')} (issued ${g.updateTime})`);

await writeFile(OUT, JSON.stringify({
  ...(prev ?? {}),
  source: `Observed: NWS station observations (api.weather.gov; the ASOS/METAR reports) at ${STATIONS.map(s => `${s.id} (${s.name})`).join(' and ')}, kept from each fetch (the API holds about a week). Forecast: NWS gridded forecast ${GRID} (quantitative precipitation spread over each period's hours, probability of precipitation, weather intensity and coverage).`,
  updated: new Date(now).toISOString(), forecastIssued: g.updateTime,
  note: 'stations[id].days[date]: base64 of 120 bytes, scripts/rain-days.mjs: 24 local hours\' rain (tenths of a mm), then 96 quarter hours\' reported wet weather (0 none, 1 light rain, 2 moderate, 3 heavy, 4 drizzle only); 255 = no report. Within a station\'s from..to, a date not in days was dry, with every report. forecast[date]: mm (per hour), pop (%), code (intensity as above), likely (1: the coverage says likely or surer), by local hour 0–23.',
  stations: { ...(prev?.stations ?? {}), ...stations }, forecast
}) + '\n');
console.log(`Wrote ${OUT.pathname}`);
