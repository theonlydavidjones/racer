#!/usr/bin/env node
/**
 * The air temperature around the Bay, month by hour of the day, at NOAA's shore stations that measure it: Fort Point
 * (9414290, the wind's station, at the cool, foggy west end of the race area), Pier 1 on the Embarcadero (9414311),
 * Alameda (9414750) and Richmond (9414863). For the days the sim has no record or forecast of (environment/air.ts):
 * what the air usually is at that hour in that month at each, and how much it varies. In August–October afternoons
 * Fort Point is 20 °C or more on about one day in eight; Pier 1, Alameda and Richmond on more than two in five.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-air-climate.mjs            # 2021–2025
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-air-climate.mjs --from 2018 --to 2025
 *
 * For each month (0–11) and local hour (0–23): the mean, the 10th and 90th percentiles (°C), and the share of hours at
 * 20 °C or more; and for each month, the share of days warm (20 °C or more) at any hour 12:00–16:59, the racing hours.
 * Rough: each cell is about 150 hours over five years, and warm hours come in a few multi-day heat events, so a share
 * of 0.1 rests on a handful of events. Fort Point is the cool end of the Bay: the sea breeze and the summer fog come in over it, so its
 * summer afternoons are often under 16 °C while the East Bay's are well over 20.
 *
 * Source: NOAA CO-OPS (api.tidesandcurrents.noaa.gov), product air_temperature, hourly, metric, public domain.
 * Output: src/environment/data/sf-air-climate.json
 */
import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const STATIONS = [
  { id: '9414290', name: 'Fort Point', lat: 37.806305, lon: -122.46589 }, { id: '9414311', name: 'Pier 1', lat: 37.798, lon: -122.392975 },
  { id: '9414750', name: 'Alameda', lat: 37.771954, lon: -122.30026 }, { id: '9414863', name: 'Richmond', lat: 37.9283, lon: -122.4 }
]; // (positions: NOAA CO-OPS station metadata)
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
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
async function climate(STATION) {
  /** [month][hour] → readings, °C */
  const cells = Array.from({ length: 12 }, () => Array.from({ length: 24 }, () => []));
  /** 'YYYY-MM-DD' → { month, warm: any racing-hour reading at WARM or more } */
  const dayRace = new Map();
  let total = 0;
  for (let y = FROM; y <= TO; y++) {
    const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=air_temperature&station=${STATION}&begin_date=${y}0101&end_date=${y}1231&time_zone=lst_ldt&units=metric&interval=h&format=json&application=folkboat-sim`;
    const j = await get(url);
    if (!j.data) { console.warn(`${STATION} ${y}: ${JSON.stringify(j.error ?? j).slice(0, 120)}`); continue; }
    let n = 0;
    for (const r of j.data) {
      const v = parseFloat(r.v);
      // (the station's quality flags: f = "max/min exceeded, rate of change exceeded": anything flagged is left out)
      if (!Number.isFinite(v) || (r.f && r.f.split(',').some(x => x !== '0'))) continue;
      const m = r.t.match(/^(\d+-(\d+)-\d+) (\d+):/); if (!m) continue;
      const mo = +m[2], hh = +m[3];
      if (hh >= 12 && hh <= 16) { const d = dayRace.get(m[1]) ?? { month: mo - 1, warm: false }; d.warm ||= v >= WARM; dayRace.set(m[1], d); }
      cells[mo - 1][hh].push(v); n++;
    }
    total += n;
    console.log(`${STATION} ${y}: ${n} hours`);
  }
  if (!total) throw new Error(`No data for ${STATION}.`);
  return { total,
    mean: cells.map(m => m.map(a => a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null)),
    p10: cells.map(m => m.map(a => a.length ? r1(q(a, 0.1)) : null)),
    p90: cells.map(m => m.map(a => a.length ? r1(q(a, 0.9)) : null)),
    warm: cells.map(m => m.map(a => a.length ? r3(a.filter(x => x >= WARM).length / a.length) : null)),
    warmDay: Array.from({ length: 12 }, (_, mo) => { const ds = [...dayRace.values()].filter(d => d.month === mo); return ds.length ? r3(ds.filter(d => d.warm).length / ds.length) : null; }),
    n: cells.map(m => m.map(a => a.length)) };
}
const stations = {};
for (const st of STATIONS) stations[st.id] = { name: st.name, lat: st.lat, lon: st.lon, ...(await climate(st.id)) };
const out = {
  source: `NOAA CO-OPS stations ${STATIONS.map(s => `${s.id} (${s.name})`).join(', ')}: hourly air temperature ${FROM}–${TO}, °C, local time; readings with a quality flag set left out.`,
  updated: new Date().toISOString().slice(0, 10),
  note: 'Per station, by month (0–11) and local hour (0–23): mean, p10, p90 (°C), and warm, the share of hours at 20 °C or more; warmDay by month, the share of days at 20 °C or more at any hour 12:00–16:59. Rough (five years, a few heat events).',
  warmC: WARM,
  stations
};
await writeFile(OUT, JSON.stringify(out) + '\n');
for (const [id, st] of Object.entries(stations)) console.log(`${id} ${st.name}: ${st.total} hours; Sep 14:00 mean ${st.mean[8][14]} °C; days warm 12–16 h Aug ${st.warmDay[7]}, Sep ${st.warmDay[8]}, Oct ${st.warmDay[9]}`);
