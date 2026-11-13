#!/usr/bin/env node
/**
 * How the chance of a warm afternoon depends on the day's wind, from the records the sim's past days use
 * (src/environment/data/sf-real-days.json: NOAA CO-OPS 9414290's 6-minute wind at Fort Point, and the hourly air
 * temperature at Fort Point, Pier 1, Alameda and Richmond), over the same years as the climates (2021–2025).
 *
 *   node scripts/fit-warm-days.mjs
 *
 * What the record shows (the physics reviewer checked it by fortnight and by year: it holds): at Fort Point, in the sea
 * breeze's and the fog's path, the wind's strength makes no difference to the warmth, and the light and variable days
 * (autumn's offshore days, most of them) are the warm ones; along the east shore, out of the fog's path, a fresh westerly
 * afternoon is a warm one, a light westerly a cool one (the inland heat that drives a strong sea breeze, about +0.3 °C an
 * afternoon for each knot at Fort Point).
 *
 * For each day: its kind and its mean speed at the station over 11:00–16:59, from the readings on the hour (as
 * scripts/fetch-wind-climate.mjs classes the days the sim's climate draws from: light and variable if it averages under
 * 4 kt or wanders, else westerly 200–330°, southerly 100–200°, northerly otherwise); and at each temperature station,
 * whether it reached 20 °C at any hour 12:00–16:59. Then per station, season (April–September, October–March), kind,
 * and band of wind speed, the standardized ratio
 *
 *   ratio = (warm days observed + 2) / (warm days expected from each day's month + 2)
 *
 * expected from each station's share of warm days in that month (sf-air-climate.json warmDay, the same years), so the
 * ratio only says which days within a month are the warm ones; the +2 keeps a cell of few days near 1 (no information,
 * no change). air.ts multiplies the climate's share by the ratio, interpolated smoothly in the wind's speed between the
 * bands' middles (so a wind on a band's edge doesn't jump).
 *
 * Output: src/environment/data/sf-warm-by-wind.json
 */
import { readFile, writeFile } from 'node:fs/promises';

const R = JSON.parse(await readFile(new URL('../src/environment/data/sf-real-days.json', import.meta.url), 'utf8'));
const CLIM = JSON.parse(await readFile(new URL('../src/environment/data/sf-air-climate.json', import.meta.url), 'utf8'));
const OUT = new URL('../src/environment/data/sf-warm-by-wind.json', import.meta.url);
const WARM = 20, PRIOR = 2, FROM = '2021-01-01', TO = '2025-12-31';
/** Mean station speed bands (kt) for the kinds that aren't light, and their middles (where each band's ratio sits). */
const BANDS = [0, 8, 12, 16, 99], MIDS = [6, 10, 14, 18];
const KINDS = ['west', 'north', 'south', 'light'];
const season = month => month >= 3 && month <= 8 ? 'summer' : 'winter'; // (April–September, October–March)

// the day's wind: kind and mean station speed, 11:00–16:59, from the readings on the hour
const wind = {};
for (const [date, s] of Object.entries(R.wind)) {
  if (date < FROM || date > TO) continue;
  const bin = Buffer.from(s, 'base64').toString('latin1'), pts = [];
  for (let k = 0; k < R.slots; k++) {
    const m = R.slot0 + k * R.slotMin; if (m < 660 || m >= 1020 || m % 60) continue;
    const sp = bin.charCodeAt(k * 3), d = bin.charCodeAt(k * 3 + 1);
    if (sp !== 255 && d !== 255) pts.push([sp / 4, d * 2]);
  }
  if (pts.length < 4) continue; // (as the climate: at least 4 of the 6 hours)
  let vx = 0, vy = 0, sum = 0;
  for (const [kt, d] of pts) { vx += Math.sin(d * Math.PI / 180) * kt; vy += Math.cos(d * Math.PI / 180) * kt; sum += kt; }
  const mean = sum / pts.length, vec = Math.hypot(vx, vy) / pts.length, dir = (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;
  const kind = mean < 4 || vec < 0.5 * mean ? 'light' : dir >= 200 && dir < 330 ? 'west' : dir >= 100 && dir < 200 ? 'south' : 'north';
  wind[date] = { kind, kt: mean, month: +date.slice(5, 7) - 1 };
}
const band = (kind, kt) => kind === 'light' ? 0 : Math.max(0, BANDS.findIndex((b, i) => kt >= b && kt < BANDS[i + 1]));

const hours = R.airHours, i12 = hours.indexOf(12), i16 = hours.indexOf(16);
const stations = {};
for (const [id, st] of Object.entries(R.airStations)) {
  const share = CLIM.stations[id].warmDay;
  const days = [];
  for (const [date, b] of Object.entries(st.days)) {
    const w = wind[date]; if (!w) continue;
    const v = [...Buffer.from(b, 'base64')].slice(i12, i16 + 1).filter(x => x !== 255).map(x => x / 4 - 10);
    if (v.length < 3) continue;
    days.push({ ...w, warm: Math.max(...v) >= WARM });
  }
  const cells = {};
  for (const se of ['summer', 'winter']) for (const k of KINDS) for (let b = 0; b < (k === 'light' ? 1 : BANDS.length - 1); b++) {
    const d = days.filter(x => season(x.month) === se && x.kind === k && band(x.kind, x.kt) === b);
    const obs = d.filter(x => x.warm).length, exp = d.reduce((s, x) => s + (share[x.month] ?? 0), 0);
    ((cells[se] ??= {})[k] ??= [])[b] = { days: d.length, warm: obs, expected: Math.round(exp * 10) / 10, ratio: Math.round((obs + PRIOR) / (exp + PRIOR) * 100) / 100 };
  }
  stations[id] = { name: st.name, days: days.length, cells };
  console.log(`${st.name} (${days.length} days):`);
  for (const se of ['summer', 'winter']) for (const k of KINDS) console.log(`  ${se} ${k.padEnd(6)} ${cells[se][k].map((c, b) => `${k === 'light' ? 'all' : `${BANDS[b]}–${BANDS[b + 1] === 99 ? '' : BANDS[b + 1]}`} kt: ${c.warm}/${c.days}, ×${c.ratio}`).join(' · ')}`);
}

await writeFile(OUT, JSON.stringify({
  source: `NOAA CO-OPS 9414290 wind (Fort Point, the readings on the hour) and hourly air temperature at 9414290, 9414311, 9414750, 9414863, ${FROM.slice(0, 4)}–${TO.slice(0, 4)}, from src/environment/data/sf-real-days.json (scripts/fit-warm-days.mjs).`,
  updated: new Date().toISOString().slice(0, 10),
  note: 'Per station, season (summer April–September, winter October–March), day kind and band of the day\'s mean station wind 11:00–16:59 (kt: bands, their middles mids), the standardized ratio of warm afternoons (20 °C or more at any hour 12:00–16:59) to those expected from sf-air-climate.json warmDay for each day\'s month: (observed + 2) / (expected + 2).',
  bands: BANDS, mids: MIDS, kinds: KINDS, warmC: WARM, stations
}) + '\n');
console.log(`→ ${OUT.pathname}`);
