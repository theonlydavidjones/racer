#!/usr/bin/env node
/**
 * The air temperature on the Cityfront, month by hour of the day, from NOAA's San Francisco station (9414290, Fort
 * Point / Crissy, at the west end of the race area: the same station as the wind). For the days the sim has no record
 * or forecast of (environment/air.ts): what the air usually is at that hour in that month, and how much it varies.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-air-climate.mjs            # 2021–2025
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-air-climate.mjs --from 2018 --to 2025
 *
 * For each month (0–11) and local hour (0–23): the mean, the 10th and 90th percentiles (°C), and the share of hours at
 * 20 °C or more. Fort Point is the cool end of the Bay: the sea breeze and the summer fog come in over it, so its
 * summer afternoons are often under 16 °C while the East Bay's are well over 20.
 *
 * Source: NOAA CO-OPS (api.tidesandcurrents.noaa.gov), product air_temperature, hourly, metric, public domain.
 * Output: src/environment/data/sf-air-climate.json
 */
import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const STATION = args.station ?? '9414290';
const FROM = Number(args.from ?? 2021), TO = Number(args.to ?? 2025);
const OUT = new URL('../src/environment/data/sf-air-climate.json', import.meta.url);
const WARM = 20;

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { const res = await fetch(url, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } }); if (res.ok) return await res.json(); console.warn(`HTTP ${res.status}`); } catch (e) { console.warn(e.message); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Failed: ' + url);
}

// (local time: the station's own standard/daylight time, as the sim's race hours are)
/** [month][hour] → readings, °C */
const cells = Array.from({ length: 12 }, () => Array.from({ length: 24 }, () => []));
let total = 0;
for (let y = FROM; y <= TO; y++) {
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=air_temperature&station=${STATION}&begin_date=${y}0101&end_date=${y}1231&time_zone=lst_ldt&units=metric&interval=h&format=json&application=folkboat-sim`;
  const j = await get(url);
  if (!j.data) { console.warn(`${y}: ${JSON.stringify(j.error ?? j).slice(0, 120)}`); continue; }
  let n = 0;
  for (const r of j.data) {
    const v = parseFloat(r.v);
    // (the station's quality flags: f = "max/min exceeded, rate of change exceeded": anything flagged is left out)
    if (!Number.isFinite(v) || (r.f && r.f.split(',').some(x => x !== '0'))) continue;
    const m = r.t.match(/^\d+-(\d+)-\d+ (\d+):/); if (!m) continue;
    const mo = +m[1], hh = +m[2];
    cells[mo - 1][hh].push(v); n++;
  }
  total += n;
  console.log(`${y}: ${n} hours`);
}
if (!total) { console.error('No data.'); process.exit(1); }

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const out = {
  source: `NOAA CO-OPS station ${STATION} (San Francisco, Fort Point), hourly air temperature ${FROM}–${TO}, °C, local time; readings with a quality flag set left out.`,
  updated: new Date().toISOString().slice(0, 10),
  note: 'By month (0–11) and local hour (0–23): mean, p10, p90 (°C), and warm, the share of hours at 20 °C or more. Fort Point is the cool, foggy end of the race area.',
  warmC: WARM,
  mean: cells.map(m => m.map(a => a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null)),
  p10: cells.map(m => m.map(a => a.length ? r1(q(a, 0.1)) : null)),
  p90: cells.map(m => m.map(a => a.length ? r1(q(a, 0.9)) : null)),
  warm: cells.map(m => m.map(a => a.length ? r2(a.filter(x => x >= WARM).length / a.length) : null)),
  n: cells.map(m => m.map(a => a.length))
};
await writeFile(OUT, JSON.stringify(out) + '\n');
console.log(`${total} hours → ${OUT.pathname}`);
for (const m of [0, 3, 6, 8, 9]) console.log(`month ${m + 1}: 14:00 mean ${out.mean[m][14]} °C, p90 ${out.p90[m][14]}, warm ${out.warm[m][14]}`);
