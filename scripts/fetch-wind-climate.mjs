#!/usr/bin/env node
/**
 * Build a wind climatology for the Cityfront from NOAA's San Francisco station (9414290, Fort Point / Crissy,
 * at the west end of the race area), by kind of day: the westerly sea breeze, a northerly (behind a cold front,
 * or the dry offshore wind), a southerly (ahead of a storm), or light and variable. For each month, how often each
 * kind of day comes; for each kind, hour by hour, how strong the wind is, from where, and how gusty.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-wind-climate.mjs            # 2021–2025
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-wind-climate.mjs --from 2018 --to 2025
 *
 * A day's kind is its wind over the racing hours (11:00–16:59 local): light and variable if it averages under
 * 4 kt or wanders (the vector mean under half the mean speed); otherwise by the vector-mean direction: westerly
 * 200–330°, northerly 330–100° (NW through N and NE to E), southerly 100–200°.
 *
 * Source: NOAA CO-OPS (api.tidesandcurrents.noaa.gov), hourly wind, knots, public domain.
 * Output: src/environment/data/sf-wind-climate.json
 */
import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const STATION = args.station ?? '9414290';
const FROM = Number(args.from ?? 2021), TO = Number(args.to ?? 2025);
const OUT = new URL('../src/environment/data/sf-wind-climate.json', import.meta.url);
const KINDS = ['west', 'north', 'south', 'light'];
const RACE_HOURS = [11, 16];

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { const res = await fetch(url); if (res.ok) return await res.json(); console.warn(`HTTP ${res.status}`); } catch (e) { console.warn(e.message); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Failed: ' + url);
}

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' });
/** Local days: 'YYYY-M-D' → { month, hours: [{h, s, d, g}] } */
const days = new Map();
let total = 0;
for (let y = FROM; y <= TO; y++) {
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=wind&station=${STATION}&begin_date=${y}0101&end_date=${y}1231&time_zone=gmt&units=english&interval=h&format=json&application=folkboat-sim`;
  const j = await get(url);
  if (!j.data) { console.warn(`${y}: ${JSON.stringify(j.error ?? j).slice(0, 120)}`); continue; }
  let n = 0;
  for (const r of j.data) {
    const s = parseFloat(r.s), d = parseFloat(r.d), g = parseFloat(r.g);
    if (!Number.isFinite(s) || !Number.isFinite(d)) continue;
    const p = Object.fromEntries(fmt.formatToParts(new Date(r.t.replace(' ', 'T') + ':00Z')).map(x => [x.type, x.value]));
    const key = `${p.year}-${p.month}-${p.day}`;
    if (!days.has(key)) days.set(key, { month: +p.month - 1, hours: [] });
    days.get(key).hours.push({ h: +p.hour % 24, s, d, g });
    n++;
  }
  total += n;
  console.log(`${y}: ${n} hours`);
}
if (!total) { console.error('No data.'); process.exit(1); }

/** The kind of day, from its racing hours. */
function kindOf(hours) {
  const race = hours.filter(x => x.h >= RACE_HOURS[0] && x.h <= RACE_HOURS[1]);
  if (race.length < 4) return null;
  let vx = 0, vy = 0, sum = 0;
  for (const x of race) { vx += Math.sin(x.d * Math.PI / 180) * x.s; vy += Math.cos(x.d * Math.PI / 180) * x.s; sum += x.s; }
  const mean = sum / race.length, vec = Math.hypot(vx, vy) / race.length, dir = (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;
  if (mean < 4 || vec < 0.5 * mean) return 'light';
  if (dir >= 200 && dir < 330) return 'west';
  if (dir >= 100 && dir < 200) return 'south';
  return 'north';
}

// count the kinds of day by month, and pool each kind's hours over the month and its neighbours (for enough days)
const count = Array.from({ length: 12 }, () => Object.fromEntries(KINDS.map(k => [k, 0])));
const pool = Array.from({ length: 12 }, () => Object.fromEntries(KINDS.map(k => [k, Array.from({ length: 24 }, () => ({ s: [], dx: 0, dy: 0, g: [], days: 0 }))])));
for (const day of days.values()) {
  const k = kindOf(day.hours); if (!k) continue;
  count[day.month][k]++;
  for (const dm of [-1, 0, 1]) {
    const m = (day.month + dm + 12) % 12, cells = pool[m][k];
    for (const x of day.hours) {
      const c = cells[x.h]; c.s.push(x.s);
      if (x.s >= 2) { c.dx += Math.sin(x.d * Math.PI / 180) * x.s; c.dy += Math.cos(x.d * Math.PI / 180) * x.s; }
      if (Number.isFinite(x.g) && x.s >= 6) c.g.push(x.g / x.s);
    }
    if (dm === 0) cells.forEach(c => c.days++);
  }
}

const q = (xs, p) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const months = count.map((c, m) => {
  const n = KINDS.reduce((a, k) => a + c[k], 0);
  const kinds = Object.fromEntries(KINDS.map(k => {
    const cells = pool[m][k], samples = cells.reduce((a, x) => a + x.s.length, 0);
    if (samples < 24 * 6) return [k, null]; // too few days of this kind around this month: none modelled
    return [k, cells.map(x => ({
      kt: [r1(q(x.s, 0.25)), r1(q(x.s, 0.5)), r1(q(x.s, 0.75))], // quartiles of the hourly mean wind, kt
      dir: Math.round((Math.atan2(x.dx, x.dy) * 180 / Math.PI + 360) % 360), // vector-mean direction
      steady: r2(x.s.length ? Math.hypot(x.dx, x.dy) / x.s.reduce((a, v) => a + v, 0) : 0), // 1 = always the same direction
      gust: r2(q(x.g, 0.5) || 1.4) // median gust / mean ratio, 6 kt and up
    }))];
  }));
  return { days: n, freq: Object.fromEntries(KINDS.map(k => [k, r2(n ? c[k] / n : 0)])), kinds };
});
await writeFile(OUT, JSON.stringify({
  source: `NOAA CO-OPS station ${STATION} (San Francisco, Fort Point), hourly wind ${FROM}–${TO}, knots. Sensor about 7 m above the site.`,
  fetched: new Date().toISOString().slice(0, 10), hours: total,
  note: 'months[0..11]: freq = how often each kind of day comes (by its wind 11:00–16:59 local: west 200–330°, north 330–100°, south 100–200°, light = under 4 kt or wandering); kinds[kind][local hour 0..23] = that kind of day, pooled over the month and its neighbours: kt = 25th/50th/75th percentile of the hourly mean, dir = vector-mean direction, steady = vector mean / mean speed, gust = median gust factor (null: too few such days).',
  months
}) + '\n');
console.log(`Wrote ${OUT.pathname}: ${total} hours`);
for (const [m, x] of months.entries()) console.log(m + 1, JSON.stringify(x.freq), KINDS.map(k => x.kinds[k] ? `${k} 13h ${x.kinds[k][13].kt[1]}kt@${x.kinds[k][13].dir}` : `${k} -`).join(' | '));
