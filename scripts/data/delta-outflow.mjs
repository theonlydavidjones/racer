/**
 * The Delta's daily outflow into the Bay, for the current field's mean flow (docs/plans/sfbofs-step2.md §2): the river
 * water that sets up the Bay's surface ebb, strong in a wet winter and about none in a dry autumn.
 *
 * - DWR DAYFLOW, the net Delta outflow (OUT, cfs), final, by water year: the California Department of Water
 *   Resources' Dayflow on the California Natural Resources Agency's open-data portal (data.cnra.ca.gov, dataset
 *   "dayflow", "Dayflow Results 1997 – 2025"). It starts 1 Oct 1996 and runs to the end of the last water year DWR has
 *   published (it lags by months).
 * - After that, DWR's CDEC daily Net Delta Outflow Index (station DTO, sensor 23, cfs: cdec.water.ca.gov), provisional.
 *   Over water years 2015–2025 the DTO ran 3% above DAYFLOW's final figure at the median, but 0.86 to 1.17 from one
 *   year to the next (10–90% of days 0.64–1.46), so it's used as published, not scaled.
 * - The median for each day of the year over DAYFLOW's record, for a day neither has (the future): typical for the
 *   date, not the day's own.
 *
 *   node scripts/data/delta-outflow.mjs <dir for the downloads> src/environment/data/delta-outflow.json
 *
 * Written: the days from `start`, as uint16 in hundreds of cfs (base64; the record's peak, 567,086 cfs, is 5,671),
 * `dto` the first day that's DTO's and not DAYFLOW's, and `median`, 366 values by day of the year (1 Jan = 0; 29 Feb
 * its own), also in hundreds of cfs.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DAYFLOW = 'https://data.cnra.ca.gov/dataset/06ee2016-b138-47d7-9e85-f46fae674536/resource/21c377fe-53b8-4bd6-9e1f-2025221be095/download/dayflow-results-1997-2025.csv';
const CDEC = (from, to) => `https://cdec.water.ca.gov/dynamicapp/req/CSVDataServlet?Stations=DTO&SensorNums=23&dur_code=D&Start=${from}&End=${to}`;
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node scripts/data/delta-outflow.mjs <download dir> <out.json>'); process.exit(1); }
mkdirSync(dir, { recursive: true });
const get = (url, file) => { execFileSync('curl', ['-sSL', '--fail', '--retry', '4', '-m', '300', '-o', file, url]); return readFileSync(file, 'utf8'); };
const iso = d => d.toISOString().slice(0, 10), day = s => Date.parse(s + 'T00:00:00Z');

// DAYFLOW: Year,Month,Date (M/D/YYYY),… OUT …
const df = get(DAYFLOW, path.join(dir, 'dayflow-1997-2025.csv')).trim().split('\n'), head = df[0].split(','), iD = head.indexOf('Date'), iO = head.indexOf('OUT');
if (iD < 0 || iO < 0) throw new Error('DAYFLOW: no Date or OUT column');
const flow = new Map();
for (const line of df.slice(1)) { const c = line.split(','), [m, d, y] = c[iD].split('/').map(Number), v = +c[iO]; if (Number.isFinite(v)) flow.set(Date.UTC(y, m - 1, d), v); }
const days = [...flow.keys()].sort((a, b) => a - b), start = days[0], dfEnd = days[days.length - 1];
// CDEC DTO from the day after DAYFLOW's last
const today = new Date(), cd = get(CDEC(iso(new Date(dfEnd + 864e5)), iso(today)), path.join(dir, 'dto.csv')).trim().split('\n').slice(1);
let dtoN = 0;
for (const line of cd) { const c = line.split(','), k = c[4], v = c[6]?.trim(); if (!k || !v || v === '---') continue; const t = Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)); if (t > dfEnd && Number.isFinite(+v)) { flow.set(t, +v); dtoN++; } }
const last = Math.max(...flow.keys()), n = Math.round((last - start) / 864e5) + 1, packed = new Uint16Array(n);
let gaps = 0;
for (let i = 0; i < n; i++) { const v = flow.get(start + i * 864e5); if (v == null) { gaps++; packed[i] = 0xffff; } else packed[i] = Math.min(0xfffe, Math.max(0, Math.round(v / 100))); } // (0xffff: no value that day)
// the day-of-year medians, DAYFLOW's final figures only
const byDoy = Array.from({ length: 366 }, () => []);
for (const t of days) { const d = new Date(t), y = d.getUTCFullYear(), leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; let doy = Math.round((t - Date.UTC(y, 0, 1)) / 864e5); if (!leap && doy >= 59) doy++; byDoy[doy].push(flow.get(t)); }
const median = byDoy.map(v => { const s = [...v].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)] / 100); });
writeFileSync(out, JSON.stringify({
  source: 'DWR DAYFLOW net Delta outflow (OUT), data.cnra.ca.gov dataset "dayflow" (Dayflow Results 1997-2025), final; then DWR CDEC station DTO (Net Delta Outflow Index, sensor 23), provisional; scripts/data/delta-outflow.mjs',
  fetched: iso(today), units: 'hundreds of cfs; 65535 = no value', start: iso(new Date(start)), dto: iso(new Date(dfEnd + 864e5)), days: n,
  out: Buffer.from(packed.buffer).toString('base64'), median
}));
console.log(`${out}: ${n} days from ${iso(new Date(start))}, DAYFLOW to ${iso(new Date(dfEnd))}, then ${dtoN} days of DTO to ${iso(new Date(last))}; ${gaps} days with no value; medians from ${days.length} days`);
