#!/usr/bin/env node
/**
 * Rain, day by day and hour by hour: what fell at the airports either side of the Bay (observed), and the National
 * Weather Service forecast for the coming week. The sim's real rain (environment/rain.ts): its look on the water, the
 * sky's murk, and what the crew wear.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-rain.mjs      # the last week's observations (added to those on file), and the forecast
 *
 * Sources (public domain):
 *  - Observed: the NWS's station observations (api.weather.gov, the airports' ASOS/METAR reports) at San Francisco
 *    International (KSFO) and Oakland International (KOAK): the precipitation in the last hour (the routine report just
 *    before the hour gives the hour's total) and the reported rain's intensity (light, moderate, heavy). The API keeps
 *    only the last week or so, so the file keeps what each run fetched: its record grows from when this was first run
 *    (November 2026). The years before need the ASOS archive (the Iowa Environmental Mesonet), not reachable from here yet.
 *  - Forecast: the NWS gridded forecast at the Cityfront cell (MTR 84,107, the cell the wind's forecast uses): the
 *    quantitative precipitation (mm over each period, spread evenly over its hours), the probability of precipitation,
 *    and the weather's own rain intensity, by local hour.
 *
 * Stored per station and local date: base64 of 24 hours × 2 bytes, [the hour's rain in tenths of a mm (0–254), the
 * reported intensity (0 none, 1 light, 2 moderate, 3 heavy)], 255 = no report that hour.
 * Output: src/environment/data/sf-rain.json
 */
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../src/environment/data/sf-rain.json', import.meta.url);
const UA = 'folkboat-racing-sim (personal project)';
const STATIONS = [
  { id: 'KSFO', name: 'San Francisco International', lat: 37.61961, lon: -122.36558 },
  { id: 'KOAK', name: 'Oakland International', lat: 37.72126, lon: -122.22115 }
]; // (positions: api.weather.gov/stations)
const GRID = 'MTR/84,107';

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
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
const local = ms => { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 }; };
/** The reported intensity of the wet weather in an observation (0 none, 1 light, 2 moderate, 3 heavy): rain, drizzle,
 * showers or a thunderstorm; a METAR with no sign ("RA") is moderate. */
const WET = ['rain', 'drizzle', 'rain_showers', 'showers', 'thunderstorms', 'freezing_rain', 'freezing_drizzle'];
const intensity = pw => Math.max(0, ...(pw ?? []).filter(w => WET.includes(w.weather)).map(w => w.intensity === 'light' ? 1 : w.intensity === 'heavy' ? 3 : 2));

let prev = null;
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { console.warn('No existing file: starting it.'); }
const now = Date.now();

/* ---------- observed: the airports' reports ---------- */
const stations = {};
for (const st of STATIONS) {
  const hours = new Map(); // 'date' → Uint8Array(48)
  let url = `https://api.weather.gov/stations/${st.id}/observations?start=${new Date(now - 8 * 86400e3).toISOString().slice(0, 19)}Z&limit=500`, n = 0;
  for (let page = 0; url && page < 10; page++) {
    const j = await get(url);
    for (const f of j.features ?? []) {
      const p = f.properties, L = local(Date.parse(p.timestamp));
      if (!hours.has(L.date)) hours.set(L.date, new Uint8Array(48).fill(255));
      const a = hours.get(L.date), k = L.hour * 2;
      const mm = p.precipitationLastHour?.value; // (mm: the hour to this report; most reports leave it out)
      if (mm != null && Number.isFinite(mm)) a[k] = Math.max(a[k] === 255 ? 0 : a[k], Math.min(254, Math.round(mm * 10)));
      a[k + 1] = Math.max(a[k + 1] === 255 ? 0 : a[k + 1], intensity(p.presentWeather));
      n++;
    }
    url = (j.features ?? []).length ? j.pagination?.next : null;
  }
  // (an hour with reports but none giving its total: its rain unknown (255), its intensity known)
  const days = { ...(prev?.stations?.[st.id]?.days ?? {}) };
  for (const [date, a] of hours) {
    const old = days[date] ? Buffer.from(days[date], 'base64') : null;
    if (old) a.forEach((x, i) => { if (x === 255 && old[i] !== 255) a[i] = old[i]; });
    days[date] = Buffer.from(a).toString('base64');
  }
  stations[st.id] = { name: st.name, lat: st.lat, lon: st.lon, days: Object.fromEntries(Object.entries(days).sort()) };
  console.log(`${st.id}: ${n} reports, ${hours.size} days fetched, ${Object.keys(days).length} on file`);
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
      const L = local(ms + h * 3600e3); (out[L.date] ??= Array(24).fill(null))[L.hour] = v.value == null ? null : conv(spread ? v.value / n : v.value);
    }
  }
  return out;
}
const r2 = x => Math.round(x * 100) / 100;
const qpf = hourly(g.quantitativePrecipitation, v => r2(v), true), pop = hourly(g.probabilityOfPrecipitation, v => Math.round(v));
const wx = hourly(g.weather, v => intensity((v ?? []).map(w => ({ weather: w.weather === 'rain_showers' ? 'rain_showers' : w.weather, intensity: w.intensity }))));
const today = local(now).date, forecast = {};
for (const date of Object.keys(qpf).sort()) if (date >= today) forecast[date] = { mm: qpf[date], pop: pop[date] ?? Array(24).fill(null), code: wx[date] ?? Array(24).fill(null) };
console.log(`forecast: ${Object.keys(forecast).join(', ')} (issued ${g.updateTime})`);

await writeFile(OUT, JSON.stringify({
  source: `Observed: NWS station observations (api.weather.gov; the ASOS/METAR reports) at ${STATIONS.map(s => `${s.id} (${s.name})`).join(' and ')}, kept from each fetch (the API holds about a week). Forecast: NWS gridded forecast ${GRID} (quantitative precipitation spread over each period's hours, probability of precipitation, weather intensity).`,
  updated: new Date(now).toISOString(), forecastIssued: g.updateTime,
  note: 'stations[id].days[date]: base64 of 24 local hours × 2 bytes [rain in the hour, tenths of a mm (0–254); intensity reported 0 none, 1 light, 2 moderate, 3 heavy]; 255 = no report. forecast[date]: mm (per hour), pop (%), code (intensity as above), by local hour 0–23.',
  stations, forecast
}) + '\n');
console.log(`Wrote ${OUT.pathname}`);
