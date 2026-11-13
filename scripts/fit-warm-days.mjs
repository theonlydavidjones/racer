#!/usr/bin/env node
/**
 * How the chance of a warm afternoon depends on the day's wind, from the records the sim's past days use
 * (src/environment/data/sf-real-days.json: NOAA CO-OPS 9414290's 6-minute wind at Fort Point, and the hourly air
 * temperature at Fort Point, Pier 1, Alameda and Richmond, 2021 to the latest fetch).
 *
 *   node scripts/fit-warm-days.mjs
 *
 * Warm afternoons on the Bay are the light-wind days: an offshore northerly, or a weak sea breeze that doesn't bring
 * the fog in. A strong westerly is the fog's own wind, and cool. So on a day the sim has only the climate for, the chance
 * it's warm (environment/air.ts warmDay) should follow the day's drawn wind, not ignore it.
 *
 * For each day: its kind (as scripts/fetch-wind-climate.mjs classes them, from the wind over 11:00–16:59 local: light
 * and variable if it averages under 4 kt or wanders, else westerly 200–330°, southerly 100–200°, northerly otherwise)
 * and its mean speed at the station then; and, at each temperature station, whether it reached 20 °C at any hour
 * 12:00–16:59. Then, per station, for each kind and band of wind speed, the standardized ratio
 *
 *   ratio = (warm days observed + 2) / (warm days expected from each day's month + 2)
 *
 * (expected: the sum over the cell's days of that station's share of warm days in that month, the same records; the +2
 * pulls a cell with few days toward 1, no effect). On a climate-only day: the month's share × the ratio for the day's
 * drawn kind and wind.
 *
 * Output: src/environment/data/sf-warm-by-wind.json
 */
import { readFile, writeFile } from 'node:fs/promises';

const R = JSON.parse(await readFile(new URL('../src/environment/data/sf-real-days.json', import.meta.url), 'utf8'));
const OUT = new URL('../src/environment/data/sf-warm-by-wind.json', import.meta.url);
const WARM = 20, PRIOR = 2;
/** Mean station speed bands (kt) for the kinds that aren't light: under 8, 8–12, 12–16, 16 and over. */
const BANDS = [0, 8, 12, 16, 99];
const KINDS = ['west', 'north', 'south', 'light'];

// the day's wind: kind and mean station speed, 11:00–16:59
const wind = {};
for (const [date, s] of Object.entries(R.wind)) {
  const bin = Buffer.from(s, 'base64').toString('latin1'), pts = [];
  for (let k = 0; k < R.slots; k++) {
    const m = R.slot0 + k * R.slotMin; if (m < 660 || m >= 1020) continue;
    const sp = bin.charCodeAt(k * 3), d = bin.charCodeAt(k * 3 + 1);
    if (sp !== 255 && d !== 255) pts.push([sp / 4, d * 2]);
  }
  if (pts.length < 30) continue;
  let vx = 0, vy = 0, sum = 0;
  for (const [kt, d] of pts) { vx += Math.sin(d * Math.PI / 180) * kt; vy += Math.cos(d * Math.PI / 180) * kt; sum += kt; }
  const mean = sum / pts.length, vec = Math.hypot(vx, vy) / pts.length, dir = (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;
  const kind = mean < 4 || vec < 0.5 * mean ? 'light' : dir >= 200 && dir < 330 ? 'west' : dir >= 100 && dir < 200 ? 'south' : 'north';
  wind[date] = { kind, kt: mean, month: +date.slice(5, 7) - 1 };
}
const band = (kind, kt) => kind === 'light' ? 0 : BANDS.findIndex((b, i) => kt >= b && kt < BANDS[i + 1]);

const hours = R.airHours, i12 = hours.indexOf(12), i16 = hours.indexOf(16);
const stations = {};
for (const [id, st] of Object.entries(R.airStations)) {
  // each day's warmth at this station, the days with its wind
  const days = [];
  for (const [date, b] of Object.entries(st.days)) {
    const w = wind[date]; if (!w) continue;
    const v = [...Buffer.from(b, 'base64')].slice(i12, i16 + 1).filter(x => x !== 255).map(x => x / 4 - 10);
    if (v.length < 3) continue;
    days.push({ ...w, warm: Math.max(...v) >= WARM });
  }
  const byMonth = Array.from({ length: 12 }, (_, m) => { const d = days.filter(x => x.month === m); return d.length ? d.filter(x => x.warm).length / d.length : 0; });
  const cells = {};
  for (const k of KINDS) for (let b = 0; b < (k === 'light' ? 1 : BANDS.length - 1); b++) {
    const d = days.filter(x => x.kind === k && band(x.kind, x.kt) === b);
    const obs = d.filter(x => x.warm).length, exp = d.reduce((s, x) => s + byMonth[x.month], 0);
    (cells[k] ??= [])[b] = { days: d.length, warm: obs, expected: Math.round(exp * 10) / 10, ratio: Math.round((obs + PRIOR) / (exp + PRIOR) * 100) / 100 };
  }
  stations[id] = { name: st.name, days: days.length, monthShare: byMonth.map(x => Math.round(x * 1000) / 1000), cells };
  console.log(`${st.name} (${days.length} days):`);
  for (const k of KINDS) console.log(`  ${k.padEnd(6)} ${cells[k].map((c, b) => `${k === 'light' ? 'all' : `${BANDS[b]}–${BANDS[b + 1] === 99 ? '' : BANDS[b + 1]}`} kt: ${c.warm}/${c.days} warm, ratio ${c.ratio}`).join(' · ')}`);
}

await writeFile(OUT, JSON.stringify({
  source: 'NOAA CO-OPS 9414290 6-minute wind (Fort Point) and hourly air temperature at 9414290, 9414311, 9414750, 9414863, from src/environment/data/sf-real-days.json (scripts/fit-warm-days.mjs).',
  updated: new Date().toISOString().slice(0, 10),
  note: 'Per station and day kind (west/north/south/light) and band of the day\'s mean station wind 11:00–16:59 (kt, bands below), the standardized ratio of warm days (20 °C or more at any hour 12:00–16:59) to those expected from each day\'s month: (observed + 2) / (expected + 2).',
  bands: BANDS, kinds: KINDS, warmC: WARM, stations
}) + '\n');
console.log(`→ ${OUT.pathname}`);
