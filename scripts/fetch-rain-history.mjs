#!/usr/bin/env node
/**
 * The years of rain before the NWS API's week (scripts/fetch-rain.mjs keeps the recent days): the airports' own reports
 * from the ASOS archive, and the rain's climate by month, for the days the sim has no record of.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-rain-history.mjs [from=2021-01-01] [file=src/environment/data/sf-rain.json]
 *
 * Source (public domain): the Iowa Environmental Mesonet's ASOS/METAR archive (mesonet.agron.iastate.edu, asos.py), the
 * routine and special reports at San Francisco International (SFO) and Oakland International (OAK): p01i (inches of
 * precipitation since the last routine report: the routine report just before the hour carries the hour's total; a
 * special report part way through it, what has fallen so far) and wxcodes (the METAR's weather: -RA light, RA moderate,
 * +RA heavy; DZ drizzle; SHRA, TSRA rain in a shower or a thunderstorm; VC…, in the vicinity, not at the field, isn't
 * counted). A trace ("T", under 0.01 in) counts as 0.1 mm, below the measurable line: alone, it's not rain.
 *
 * The days' encoding: scripts/rain-days.mjs (the reports' weather by the quarter hour). A day dry with a report all day
 * isn't stored: within a station's `from`..`to`, a day not listed was dry.
 *
 * The climate, per station and month, from 2021–2025 (the years the sim's other climates use), counting the days with a
 * report in at least 18 of their hours:
 *  - wetDay: the share of days with rain in any hour (the sim's rain: environment/rain.ts);
 *  - wetHour: on those days, the share of hours with rain;
 *  - heavy: of the hours with rain, the share heavy, drawn toward the station's share over the year as if the month had
 *    20 more wet hours (the dry months have few);
 *  - spellH: how long the rain lasts once it starts, the mean run of wet hours (whole hours).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { encodeDays, mergeDay, needed, slotLevel, localDate, SLOTS } from './rain-days.mjs';

const OUT = process.argv[3] ? new URL(process.argv[3], 'file://' + process.cwd() + '/') : new URL('../src/environment/data/sf-rain.json', import.meta.url);
const FROM = process.argv[2] ?? '2021-01-01', CLIM_FROM = '2021-01-01', CLIM_TO = '2025-12-31';
const IDS = { KSFO: 'SFO', KOAK: 'OAK' };
const UA = 'folkboat-racing-sim (personal project)';

async function get(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.text();
      console.warn(`HTTP ${res.status} (retrying)`);
    } catch (e) { console.warn(e.message); }
    await new Promise(r => setTimeout(r, 5000 * 2 ** attempt));
  }
  throw new Error('Failed: ' + url);
}
/** The METAR weather's wet intensity at the field (0 none, 1 light, 2 moderate, 3 heavy). */
function intensity(wx) {
  let best = 0;
  for (const g of (wx ?? '').split(/\s+/)) {
    if (!g || g.startsWith('VC') || !/(RA|DZ)/.test(g)) continue; // (TS or SH alone, or in the vicinity: no rain here)
    best = Math.max(best, g.startsWith('-') ? 1 : g.startsWith('+') ? 3 : 2);
  }
  return best;
}

const data = JSON.parse(await readFile(OUT, 'utf8'));
const today = localDate(Date.now()), yesterday = localDate(Date.now() - 86400e3);
for (const [id, iem] of Object.entries(IDS)) {
  const reports = [];
  for (let y = +FROM.slice(0, 4); y <= +today.slice(0, 4); y++) {
    const a = y === +FROM.slice(0, 4) ? FROM : `${y}-01-01`, b = `${y + 1}-01-01`;
    const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${iem}&data=p01i&data=wxcodes&year1=${a.slice(0, 4)}&month1=${+a.slice(5, 7)}&day1=${+a.slice(8)}&year2=${b.slice(0, 4)}&month2=${+b.slice(5, 7)}&day2=${+b.slice(8)}&tz=America/Los_Angeles&format=onlycomma&latlon=no&missing=M&trace=T&report_type=3&report_type=4`;
    const rows = (await get(url)).trim().split('\n').slice(1);
    for (const r of rows) {
      const [, valid, p01i, wx] = r.split(','); // ("YYYY-MM-DD HH:MM", local)
      const date = valid.slice(0, 10); if (date < FROM) continue;
      reports.push({ date, min: +valid.slice(11, 13) * 60 + +valid.slice(14, 16), mm: p01i === 'M' ? null : p01i === 'T' ? 0.1 : +p01i * 25.4, code: intensity(wx === 'M' ? '' : wx) });
    }
    console.log(`${id} ${y}: ${rows.length} reports`);
    await new Promise(r => setTimeout(r, 3000)); // (be gentle with the archive)
  }
  const st = data.stations[id], days = { ...st.days };
  // the archive's days, the reports already on file (the NWS API's, kept by fetch-rain.mjs) filling the archive's gaps
  for (const [date, a] of encodeDays(reports)) {
    // (today too: the archive is near real time, and fills the API's gaps; the record's span stays to yesterday)
    if (date > yesterday) { days[date] = Buffer.from(mergeDay(a, days[date])).toString('base64'); continue; }
    const b = mergeDay(a, days[date]);
    if (needed(b)) days[date] = Buffer.from(b).toString('base64'); else delete days[date];
  }
  st.days = Object.fromEntries(Object.entries(days).sort());
  st.from = st.from && st.from < FROM ? st.from : FROM; st.to = st.to && st.to > yesterday ? st.to : yesterday;
}

/* ---------- the climate, per station and month ---------- */
const climate = {};
for (const id of Object.keys(IDS)) {
  const st = data.stations[id], m = Array.from({ length: 12 }, () => ({ days: 0, wet: 0, wetHours: 0, hoursOnWet: 0, heavy: 0, spells: 0 }));
  for (let t = Date.parse(CLIM_FROM + 'T12:00Z'); t <= Date.parse(CLIM_TO + 'T12:00Z'); t += 86400e3) {
    const date = new Date(t).toISOString().slice(0, 10), c = m[+date.slice(5, 7) - 1], b = st.days[date];
    if (!b) { c.days++; continue; } // (dry, with every report)
    const a = Buffer.from(b, 'base64');
    if (a.length !== 24 + SLOTS) continue;
    // each hour: its worst quarter (null if none of its quarters has a report)
    const hr = Array.from({ length: 24 }, (_, h) => { const l = [0, 1, 2, 3].map(k => slotLevel(a, h * 4 + k)).filter(x => x != null); return l.length ? Math.max(...l) : null; });
    if (hr.filter(x => x != null).length < 18) continue;
    c.days++;
    if (!hr.some(x => x)) continue;
    c.wet++; c.hoursOnWet += hr.filter(x => x != null).length;
    hr.forEach((x, h) => { if (x) { c.wetHours++; if (x === 2) c.heavy++; if (!hr[h - 1]) c.spells++; } });
  }
  const r = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;
  const yearHeavy = m.reduce((s, c) => s + c.heavy, 0) / Math.max(1, m.reduce((s, c) => s + c.wetHours, 0)), K = 20;
  climate[id] = m.map(c => ({ wetDay: r(c.wet / Math.max(1, c.days)), wetHour: r(c.wetHours / Math.max(1, c.hoursOnWet)), heavy: r((c.heavy + K * yearHeavy) / (c.wetHours + K)), spellH: Math.max(1, Math.round(c.wetHours / Math.max(1, c.spells))), days: c.days }));
  console.log(`${id} climate:`, climate[id].map((c, i) => `${i + 1}: ${Math.round(c.wetDay * 100)}% wet (${c.days} d), ${Math.round(c.wetHour * 100)}% of hours, ${Math.round(c.heavy * 100)}% heavy, ${c.spellH} h`).join(' · '));
}
data.history = `ASOS/METAR archive, Iowa Environmental Mesonet (mesonet.agron.iastate.edu), SFO and OAK, from ${FROM}: routine and special reports, p01i and wxcodes (scripts/fetch-rain-history.mjs).`;
data.climate = { years: `${CLIM_FROM.slice(0, 4)}–${CLIM_TO.slice(0, 4)}`, note: 'Per station, by month (0 January): wetDay, the share of days with rain in any hour; wetHour, on those days the share of hours with rain; heavy, of those hours the share heavy (drawn toward the year\'s share as if 20 more wet hours); spellH, the mean run of wet hours; days, the days counted.', stations: climate };
await writeFile(OUT, JSON.stringify(data) + '\n');
console.log(`Wrote ${OUT.pathname}`);
