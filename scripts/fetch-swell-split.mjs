#!/usr/bin/env node
/**
 * The swell on its own, day by day, for the last 45 days: NDBC 46237's spectral wave summary (realtime2 .spec), which
 * splits the total significant height (WVHT) into the swell (SwH, its period SwP and direction SwD) and the ocean's own
 * wind sea (WWH, WWP, WWD). The sim makes its own wind sea from the wind over the water, so the swell it adds is SwH,
 * not the total. NDBC keeps the split only for the realtime window (the station's history has no spectral files), so
 * older days use the share of the total that's swell, measured here too (see sea.ts swellShare).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-swell-split.mjs
 *
 * Updates `swellSplit` (date → [SwH m, SwP s, SwD deg from], the mean over 11:00–16:59 local, as `swell`) in
 * src/environment/data/sf-real-days.json, keeping the days already there. Public domain (NOAA NDBC).
 */
import { readFile, writeFile } from 'node:fs/promises';

const BUOY = '46237', OUT = new URL('../src/environment/data/sf-real-days.json', import.meta.url);
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function local(ms) { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute }; }
// (the compass points NDBC gives SwD in, as degrees from)
const PT = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const deg = s => { const i = PT.indexOf(s); return i < 0 ? NaN : i * 22.5; };

const res = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${BUOY}.spec`);
if (!res.ok) throw new Error(`NDBC ${res.status}`);
const byDay = new Map();
for (const line of (await res.text()).split('\n')) {
  if (line.startsWith('#') || !line.trim()) continue;
  const f = line.trim().split(/\s+/), [yy, mm, dd, hh, mi] = f.slice(0, 5).map(Number), swh = parseFloat(f[6]), swp = parseFloat(f[7]), swd = deg(f[10]);
  if (!(swh > 0 && swh < 30) || !(swp > 0 && swp < 40)) continue;
  const L = local(Date.UTC(yy, mm - 1, dd, hh, mi || 0));
  if (L.min < 11 * 60 || L.min >= 17 * 60) continue;
  if (!byDay.has(L.date)) byDay.set(L.date, []);
  byDay.get(L.date).push([swh, swp, swd]);
}
const data = JSON.parse(await readFile(OUT, 'utf8')), split = { ...(data.swellSplit ?? {}) }, r2 = x => Math.round(x * 100) / 100;
for (const [date, v] of byDay) {
  const ds = v.map(x => x[2]).filter(Number.isFinite), dx = ds.reduce((a, d) => a + Math.sin(d * Math.PI / 180), 0), dy = ds.reduce((a, d) => a + Math.cos(d * Math.PI / 180), 0);
  split[date] = [r2(v.reduce((a, x) => a + x[0], 0) / v.length), r2(v.reduce((a, x) => a + x[1], 0) / v.length), ds.length ? Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360) : NaN];
}
data.swellSplit = Object.fromEntries(Object.entries(split).sort());
await writeFile(OUT, JSON.stringify(data));
console.log(`swellSplit: ${Object.keys(data.swellSplit).length} days`);
