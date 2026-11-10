#!/usr/bin/env node
/**
 * Build a swell climatology for the Golden Gate from the San Francisco Bar wave buoy (NDBC 46237, CDIP 142,
 * just outside the Gate): for each month, a small, typical and big day (the 25th, 50th and 75th percentile of
 * significant wave height), each with its typical dominant period and direction.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-swell.mjs                 # 2019–2025
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-swell.mjs --from 2016 --to 2025 --station 46026
 *
 * Source: NOAA National Data Buoy Center, historical standard meteorological data (WVHT, DPD, MWD), public domain.
 * Output: src/environment/data/sf-swell-climate.json
 */
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const STATION = args.station ?? '46237';
const FROM = Number(args.from ?? 2019), TO = Number(args.to ?? 2025);
const OUT = new URL('../src/environment/data/sf-swell-climate.json', import.meta.url);

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { const res = await fetch(url); if (res.ok) return Buffer.from(await res.arrayBuffer()); console.warn(`HTTP ${res.status} ${url}`); if (res.status === 404) return null; } catch (e) { console.warn(e.message); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Failed: ' + url);
}

// one observation per hour (the buoy reports every 30 min), by month
const months = Array.from({ length: 12 }, () => []);
let total = 0;
for (let y = FROM; y <= TO; y++) {
  const buf = await get(`https://www.ndbc.noaa.gov/data/historical/stdmet/${STATION}h${y}.txt.gz`);
  if (!buf) continue;
  const seen = new Set();
  let n = 0;
  for (const line of gunzipSync(buf).toString('ascii').split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const f = line.trim().split(/\s+/);
    const [yy, mm, dd, hh] = f.slice(0, 4).map(Number), hs = parseFloat(f[8]), dpd = parseFloat(f[9]), mwd = parseFloat(f[11]);
    if (!(hs > 0 && hs < 30) || !(dpd > 0 && dpd < 30) || !(mwd >= 0 && mwd <= 360)) continue;
    const key = `${yy}-${mm}-${dd}-${hh}`; if (seen.has(key)) continue; seen.add(key);
    months[mm - 1].push({ hs, tp: dpd, dir: mwd }); n++;
  }
  console.log(`${y}: ${n} hourly observations`); total += n;
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const circMean = a => { let x = 0, y = 0; for (const d of a) { x += Math.sin(d * Math.PI / 180); y += Math.cos(d * Math.PI / 180); } return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360; };
const r = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
// each kind of day: the observations in a band around its percentile of wave height
const BANDS = [[0.15, 0.35], [0.4, 0.6], [0.65, 0.85]];
const out = months.map((obs, m) => {
  const s = [...obs].sort((a, b) => a.hs - b.hs);
  return { month: m + 1, n: s.length, days: BANDS.map(([a, b]) => { const band = s.slice(Math.floor(a * s.length), Math.ceil(b * s.length)); return { hs: r(median(band.map(o => o.hs))), tp: r(median(band.map(o => o.tp)), 1), from: Math.round(circMean(band.map(o => o.dir))) }; }) };
});
await writeFile(OUT, JSON.stringify({
  source: `NOAA NDBC station ${STATION} (San Francisco Bar, CDIP 142), historical standard meteorological data ${FROM}–${TO}`,
  fetched: new Date().toISOString().slice(0, 10), observations: total,
  note: 'Per month: small, typical and big days (25th, 50th, 75th percentile of significant wave height, m), with the median dominant period (s) and mean direction the waves come from (deg true) on such days. Measured outside the Gate: total sea (swell plus the ocean wind sea).',
  months: out
}, null, 1) + '\n');
for (const m of out) console.log(m.month, m.days.map(d => `${d.hs} m ${d.tp} s from ${d.from}`).join(' | '));
