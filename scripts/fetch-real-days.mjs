#!/usr/bin/env node
/**
 * The real wind and swell, day by day: what was observed on past days, and the National Weather Service forecast
 * for the coming week. The sim uses them for a race day when it has them (past: observed; this week: forecast;
 * otherwise the climatology in sf-wind-climate.json and sf-swell-climate.json).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-real-days.mjs            # everything, 2021 to yesterday, and the forecast
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-real-days.mjs --update   # since the newest day in the file (at least 45 days), and the forecast (the daily refresh)
 *
 * Sources (public domain):
 *  - Wind observed: NOAA CO-OPS station 9414290 (San Francisco, Fort Point), 6-minute wind (2-minute mean speed and
 *    direction, and the gust), 10:00–17:54 local.
 *  - Swell observed: NDBC 46237 (San Francisco Bar, CDIP 142): significant height, dominant period and mean direction,
 *    averaged over 11:00–16:59 local.
 *  - Wind across the Bay, observed: NOAA CO-OPS shore stations Pier 1 (9414311), Oakland Middle Harbor (9414769),
 *    Point Potrero (9414847) and Richmond (9414863), hourly vector means 10:00–17:59 local.
 *  - Forecast: NWS gridded forecast (api.weather.gov): wind on the 2.5 km grid cell over the Cityfront race area
 *    (MTR 84,107), hourly; the wind on every cell over the race area (MTR x 81–88, y 105–111), 09:00–18:00; swell at
 *    the cell by the Bar buoy (MTR 77,107).
 *
 * Output: src/environment/data/sf-real-days.json
 */
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../src/environment/data/sf-real-days.json', import.meta.url);
const UPDATE = process.argv.includes('--update');
const FROM_YEAR = 2021, WIND_STATION = '9414290', BUOY = '46237';
const SLOT0 = 600, SLOT_MIN = 6, SLOTS = 80; // 10:00 local, every 6 minutes, to 17:54
const UA = 'folkboat-racing-sim (personal project)';

async function fetchRetry(url, as = 'json', headers = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
      if (res.ok) return as === 'json' ? await res.json() : as === 'text' ? await res.text() : Buffer.from(await res.arrayBuffer());
      if (res.status === 404) return null;
      console.warn(`HTTP ${res.status} ${url}`);
    } catch (e) { console.warn(e.message); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Failed: ' + url);
}

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** UTC ms → { date: 'YYYY-MM-DD', min: minutes after local midnight } in San Francisco. */
function local(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');

let prev = null;
if (UPDATE) { try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { console.warn('No existing file: fetching everything.'); } }
const now = Date.now(), yesterday = new Date(now - 86400e3);
// updating: from a few days before the newest observed day in the file (or 45 days back, whichever is earlier)
const lastWind = prev ? Object.keys(prev.wind ?? {}).sort().pop() : null;
const start = prev ? new Date(Math.min(now - 45 * 86400e3, lastWind ? Date.parse(lastWind) - 3 * 86400e3 : now)) : new Date(Date.UTC(FROM_YEAR, 0, 1));

/* ---------- observed wind, 6-minute ---------- */
const wind = { ...(prev?.wind ?? {}) }; // date → base64 of SLOTS × [speed×4, dir/2, gust×4], 255 = missing
const raw = new Map();
for (let t = new Date(start); t <= yesterday;) {
  const end = new Date(Math.min(t.getTime() + 30 * 86400e3, yesterday.getTime() + 86400e3));
  const j = await fetchRetry(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=wind&station=${WIND_STATION}&begin_date=${ymd(t)}&end_date=${ymd(end)}&time_zone=gmt&units=english&format=json&application=folkboat-sim`);
  let n = 0;
  for (const r of j?.data ?? []) {
    const s = parseFloat(r.s), d = parseFloat(r.d), g = parseFloat(r.g);
    const L = local(Date.parse(r.t.replace(' ', 'T') + ':00Z')), k = (L.min - SLOT0) / SLOT_MIN;
    if (k < 0 || k >= SLOTS || k % 1) continue;
    if (!raw.has(L.date)) raw.set(L.date, new Uint8Array(SLOTS * 3).fill(255));
    const a = raw.get(L.date);
    if (Number.isFinite(s)) a[k * 3] = Math.min(254, Math.round(s * 4));
    if (Number.isFinite(d) && Number.isFinite(s) && s > 0) a[k * 3 + 1] = Math.round(((d % 360) + 360) % 360 / 2) % 180;
    if (Number.isFinite(g)) a[k * 3 + 2] = Math.min(254, Math.round(g * 4));
    n++;
  }
  console.log(`wind ${ymd(t)}–${ymd(end)}: ${n} samples`);
  t = new Date(end.getTime() + 86400e3);
}
for (const [date, a] of raw) if (a.filter((v, i) => i % 3 === 0 && v !== 255).length >= SLOTS / 2) wind[date] = Buffer.from(a).toString('base64');

/* ---------- the other wind stations around the Bay, hourly (for the wind across the course) ---------- */
// Shore stations (NOAA CO-OPS): the Embarcadero, Oakland, Point Potrero and Richmond. Each day, how each differed from
// Fort Point compared with how it usually does (its siting makes some read low every day), shapes the wind across the course.
const STATIONS = [
  { id: '9414311', name: 'Pier 1 (Embarcadero)', lat: 37.798, lon: -122.393 },
  { id: '9414769', name: 'Oakland Middle Harbor', lat: 37.8, lon: -122.33 },
  { id: '9414847', name: 'Point Potrero (Richmond)', lat: 37.9058, lon: -122.365 },
  { id: '9414863', name: 'Richmond', lat: 37.9283, lon: -122.4 }
];
const HOURS = [10, 11, 12, 13, 14, 15, 16, 17]; // hourly vector means over :00–:54
const stationsData = Object.fromEntries(STATIONS.map(st => [st.id, { ...(prev?.stations?.[st.id]?.days ?? {}) }]));
for (const st of STATIONS) {
  const acc = new Map(); // date → per hour [sum speed, sum vx, sum vy, n]
  for (let t = new Date(start); t <= yesterday;) {
    const end = new Date(Math.min(t.getTime() + 30 * 86400e3, yesterday.getTime() + 86400e3));
    const j = await fetchRetry(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=wind&station=${st.id}&begin_date=${ymd(t)}&end_date=${ymd(end)}&time_zone=gmt&units=english&format=json&application=folkboat-sim`);
    for (const r of j?.data ?? []) {
      const sp = parseFloat(r.s), d = parseFloat(r.d); if (!Number.isFinite(sp) || !Number.isFinite(d)) continue;
      const L = local(Date.parse(r.t.replace(' ', 'T') + ':00Z')), h = HOURS.indexOf(Math.floor(L.min / 60)); if (h < 0) continue;
      if (!acc.has(L.date)) acc.set(L.date, HOURS.map(() => [0, 0, 0, 0]));
      const c = acc.get(L.date)[h]; c[0] += sp; c[1] += Math.sin(d * Math.PI / 180) * sp; c[2] += Math.cos(d * Math.PI / 180) * sp; c[3]++;
    }
    t = new Date(end.getTime() + 86400e3);
  }
  for (const [date, hrs] of acc) {
    const a = new Uint8Array(HOURS.length * 2).fill(255);
    hrs.forEach((c, h) => { if (c[3] >= 5) { a[h * 2] = Math.min(254, Math.round(c[0] / c[3] * 4)); a[h * 2 + 1] = Math.round(((Math.atan2(c[1], c[2]) * 180 / Math.PI + 360) % 360) / 2) % 180; } });
    stationsData[st.id][date] = Buffer.from(a).toString('base64');
  }
  console.log(`${st.name}: ${Object.keys(stationsData[st.id]).length} days`);
}

/* ---------- observed swell, NDBC 46237 ---------- */
const swell = { ...(prev?.swell ?? {}) }; // date → [hs m, dominant period s, mean direction deg (from)]
const buoyLines = [];
const lastYear = new Date(now).getUTCFullYear() - 1;
// updating: only the years and months since the newest swell day in the file (the last 45 days come from realtime2)
const lastSwell = prev ? Object.keys(prev.swell ?? {}).sort().pop() : null;
const swellFrom = lastSwell ? new Date(Date.parse(lastSwell) - 3 * 86400e3) : new Date(Date.UTC(FROM_YEAR, 0, 1));
for (let y = swellFrom.getUTCFullYear(); y <= lastYear; y++) {
  const b = await fetchRetry(`https://www.ndbc.noaa.gov/data/historical/stdmet/${BUOY}h${y}.txt.gz`, 'buf');
  if (b) buoyLines.push(...gunzipSync(b).toString('ascii').split('\n'));
  console.log(`swell ${y}: ${b ? 'ok' : 'missing'}`);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
for (let m = swellFrom.getUTCFullYear() > lastYear ? swellFrom.getUTCMonth() : 0; m < new Date(now).getUTCMonth(); m++) { // this year's finished months
  const b = await fetchRetry(`https://www.ndbc.noaa.gov/data/stdmet/${MON[m]}/${BUOY}${(m + 1).toString(16)}${lastYear + 1}.txt.gz`, 'buf');
  if (b) buoyLines.push(...gunzipSync(b).toString('ascii').split('\n'));
}
const rt = await fetchRetry(`https://www.ndbc.noaa.gov/data/realtime2/${BUOY}.txt`, 'text'); // the last 45 days
if (rt) buoyLines.push(...rt.split('\n'));
const byDay = new Map();
for (const line of buoyLines) {
  if (line.startsWith('#') || !line.trim()) continue;
  const f = line.trim().split(/\s+/);
  const [yy, mm, dd, hh, mi] = f.slice(0, 5).map(Number), hs = parseFloat(f[8]), dpd = parseFloat(f[9]), mwd = parseFloat(f[11]);
  if (!(hs > 0 && hs < 30) || !(dpd > 0 && dpd < 40)) continue;
  const L = local(Date.UTC(yy, mm - 1, dd, hh, mi || 0));
  if (L.min < 11 * 60 || L.min >= 17 * 60) continue;
  if (!byDay.has(L.date)) byDay.set(L.date, []);
  byDay.get(L.date).push([hs, dpd, mwd >= 0 && mwd <= 360 ? mwd : NaN]);
}
const r2 = x => Math.round(x * 100) / 100;
for (const [date, v] of byDay) {
  const hs = v.reduce((a, x) => a + x[0], 0) / v.length, tp = v.reduce((a, x) => a + x[1], 0) / v.length;
  const dirs = v.map(x => x[2]).filter(Number.isFinite), dx = dirs.reduce((a, d) => a + Math.sin(d * Math.PI / 180), 0), dy = dirs.reduce((a, d) => a + Math.cos(d * Math.PI / 180), 0);
  swell[date] = [r2(hs), r2(tp), dirs.length ? Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360) : 285];
}
console.log(`swell: ${Object.keys(swell).length} days`);

/* ---------- the NWS forecast, the coming week ---------- */
/** An NWS grid series ("2026-11-10T04:00:00+00:00/PT2H" → value) as hourly values by local date and hour. */
function hourly(series, conv) {
  const out = {};
  for (const v of series?.values ?? []) {
    const [t0, dur] = v.validTime.split('/'), ms = Date.parse(t0);
    const m = dur.match(/P(?:(\d+)D)?T?(?:(\d+)H)?/), hours = (+(m?.[1] ?? 0)) * 24 + +(m?.[2] ?? 0) || 1;
    for (let h = 0; h < hours; h++) {
      const L = local(ms + h * 3600e3); (out[L.date] ??= Array(24).fill(null))[Math.floor(L.min / 60)] = v.value == null ? null : conv(v.value);
    }
  }
  return out;
}
const KMH = 1 / 1.852, r1 = x => Math.round(x * 10) / 10;
const grid = await fetchRetry('https://api.weather.gov/gridpoints/MTR/84,107', 'json', { Accept: 'application/geo+json' });
const sea = await fetchRetry('https://api.weather.gov/gridpoints/MTR/77,107', 'json', { Accept: 'application/geo+json' });
const g = grid.properties, s = sea.properties;
const ws = hourly(g.windSpeed, v => r1(v * KMH)), wd = hourly(g.windDirection, v => Math.round(v)), wg = hourly(g.windGust, v => r1(v * KMH));
const sh = hourly(s.primarySwellHeight ?? s.waveHeight, v => r2(v)), sp = hourly(s.wavePeriod, v => v), sd = hourly(s.primarySwellDirection, v => v);
const today = local(now).date, forecast = {};
for (const date of Object.keys(ws)) {
  if (date < today) continue;
  forecast[date] = { kt: ws[date], from: wd[date] ?? [], gust: wg[date] ?? [], swell: [sh[date]?.[13] ?? null, sp[date]?.[13] ?? null, sd[date]?.[13] ?? null] };
}
console.log(`forecast: ${Object.keys(forecast).join(', ')} (issued ${g.updateTime})`);

/* ---------- the NWS forecast grid over the race area (2.5 km cells), for the wind across the course ---------- */
const GRID_X = [81, 82, 83, 84, 85, 86, 87, 88], GRID_Y = [105, 106, 107, 108, 109, 110, 111], GRID_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const cells = [], gridDays = {};
for (const gx of GRID_X) for (const gy of GRID_Y) {
  const j = await fetchRetry(`https://api.weather.gov/gridpoints/MTR/${gx},${gy}`, 'json', { Accept: 'application/geo+json' });
  if (!j?.properties) continue;
  const ring = j.geometry?.coordinates?.[0] ?? [], n = Math.max(1, ring.length - 1);
  const lat = ring.slice(0, n).reduce((a, c) => a + c[1], 0) / n, lon = ring.slice(0, n).reduce((a, c) => a + c[0], 0) / n;
  const i = cells.push([Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4]) - 1;
  const cs = hourly(j.properties.windSpeed, v => r1(v * KMH)), cd = hourly(j.properties.windDirection, v => Math.round(v));
  for (const date of Object.keys(cs)) {
    if (date < today) continue;
    const day = gridDays[date] ??= { kt: [], from: [] };
    day.kt[i] = GRID_HOURS.map(h => cs[date]?.[h] ?? null); day.from[i] = GRID_HOURS.map(h => cd[date]?.[h] ?? null);
  }
}
console.log(`forecast grid: ${cells.length} cells, ${Object.keys(gridDays).length} days`);

await writeFile(OUT, JSON.stringify({
  source: `Observed wind: NOAA CO-OPS ${WIND_STATION} (Fort Point), 6-minute, 10:00–17:54 local, base64 of [speed kt ×4, direction from /2, gust kt ×4] per slot, 255 = missing. Observed swell: NDBC ${BUOY}, mean over 11:00–16:59 local, [Hs m, dominant period s, mean direction from]. Forecast: NWS gridded forecast, MTR 84,107 (wind, kt, hourly by local hour 0–23) and MTR 77,107 (swell at 13:00).`,
  updated: new Date(now).toISOString(), forecastIssued: g.updateTime,
  slot0: SLOT0, slotMin: SLOT_MIN, slots: SLOTS,
  wind: Object.fromEntries(Object.entries(wind).sort()), swell: Object.fromEntries(Object.entries(swell).sort()), forecast,
  stationHours: HOURS,
  stations: Object.fromEntries(STATIONS.map(st => [st.id, { name: st.name, lat: st.lat, lon: st.lon, days: Object.fromEntries(Object.entries(stationsData[st.id]).sort()) }])),
  grid: { hours: GRID_HOURS, cells, days: gridDays }
}) + '\n');
console.log(`Wrote ${OUT.pathname}: ${Object.keys(wind).length} days of wind, ${Object.keys(swell).length} of swell, ${Object.keys(forecast).length} forecast days`);
