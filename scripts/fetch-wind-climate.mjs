#!/usr/bin/env node
/**
 * Build a wind climatology for the Cityfront from NOAA's San Francisco station (9414290, Fort Point / Crissy,
 * at the west end of the race area): for each month and local hour, how strong the wind is, from where, how
 * often it's the westerly sea breeze, and how gusty.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-wind-climate.mjs            # 2021–2025
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-wind-climate.mjs --from 2018 --to 2025
 *
 * Source: NOAA CO-OPS (api.tidesandcurrents.noaa.gov), hourly wind, knots, public domain.
 * Output: src/environment/data/sf-wind-climate.json
 */
import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const STATION = args.station ?? '9414290';
const FROM = Number(args.from ?? 2021), TO = Number(args.to ?? 2025);
const OUT = new URL('../src/environment/data/sf-wind-climate.json', import.meta.url);
/** The sea breeze sector: wind from between SSW and NW. */
const WEST = [200, 320];

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { const res = await fetch(url); if (res.ok) return await res.json(); console.warn(`HTTP ${res.status}`); } catch (e) { console.warn(e.message); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Failed: ' + url);
}

const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', month: 'numeric', hour: 'numeric' });
const cells = Array.from({ length: 12 }, () => Array.from({ length: 24 }, () => ({ s: [], sW: [], dx: 0, dy: 0, nW: 0, n: 0, g: [] })));
let total = 0;
for (let y = FROM; y <= TO; y++) {
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=wind&station=${STATION}&begin_date=${y}0101&end_date=${y}1231&time_zone=gmt&units=english&interval=h&format=json&application=folkboat-sim`;
  const j = await get(url);
  if (!j.data) { console.warn(`${y}: ${JSON.stringify(j.error ?? j).slice(0, 120)}`); continue; }
  let n = 0;
  for (const r of j.data) {
    const s = parseFloat(r.s), d = parseFloat(r.d), g = parseFloat(r.g);
    if (!Number.isFinite(s) || !Number.isFinite(d)) continue;
    const parts = Object.fromEntries(hourFmt.formatToParts(new Date(r.t.replace(' ', 'T') + ':00Z')).map(p => [p.type, p.value]));
    const c = cells[+parts.month - 1][+parts.hour % 24];
    c.s.push(s); c.n++; n++;
    if (d >= WEST[0] && d <= WEST[1] && s >= 3) {
      c.nW++; c.sW.push(s); c.dx += Math.sin(d * Math.PI / 180) * s; c.dy += Math.cos(d * Math.PI / 180) * s;
      if (Number.isFinite(g) && s >= 6) c.g.push(g / s);
    }
  }
  total += n;
  console.log(`${y}: ${n} hours`);
}
if (!total) { console.error('No data.'); process.exit(1); }

const q = (xs, p) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const months = cells.map(m => m.map(c => ({
  kt: [r1(q(c.s, 0.25)), r1(q(c.s, 0.5)), r1(q(c.s, 0.75))], // quartiles of the hourly mean wind, kt (all hours)
  ktW: [r1(q(c.sW, 0.25)), r1(q(c.sW, 0.5)), r1(q(c.sW, 0.75))], // the same, westerly hours only
  dir: c.nW ? Math.round((Math.atan2(c.dx, c.dy) * 180 / Math.PI + 360) % 360) : 0, // mean direction when it's westerly
  west: r2(c.n ? c.nW / c.n : 0), // how often it's the westerly
  gust: r2(q(c.g, 0.5) || 1.4) // median gust / mean ratio in a westerly of 6 kt or more
})));
await writeFile(OUT, JSON.stringify({
  source: `NOAA CO-OPS station ${STATION} (San Francisco, Fort Point), hourly wind ${FROM}–${TO}, knots. Sensor about 7 m above the site.`,
  fetched: new Date().toISOString().slice(0, 10), hours: total,
  note: 'months[0..11][local hour 0..23]: kt = 25th/50th/75th percentile of hourly mean speed; ktW = the same for westerly hours only; dir = mean direction when the wind is from 200–320°; west = fraction of hours from that sector; gust = median gust factor.',
  months
}) + '\n');
console.log(`Wrote ${OUT.pathname}: ${total} hours`);
