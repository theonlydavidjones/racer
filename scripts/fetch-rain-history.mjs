#!/usr/bin/env node
/**
 * The years of rain before the NWS API's week (scripts/fetch-rain.mjs keeps the recent days): the airports' own reports
 * from the ASOS archive, and the rain's climate by month, for the days the sim has no record of.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-rain-history.mjs [from=2021-01-01] [file=src/environment/data/sf-rain.json]
 *
 * Source (public domain): the Iowa Environmental Mesonet's ASOS/METAR archive (mesonet.agron.iastate.edu, asos.py), the
 * routine and special reports at San Francisco International (SFO) and Oakland International (OAK), with the METAR's own
 * text (its remarks say when rain began and ended: scripts/rain-days.mjs): p01i (inches of
 * precipitation since the last routine report: the routine report just before the hour carries the hour's total; a
 * special report part way through it, what has fallen so far) and wxcodes (the METAR's weather: -RA light, RA moderate,
 * +RA heavy; DZ drizzle; SHRA, TSRA rain in a shower or a thunderstorm; VC…, in the vicinity, not at the field, isn't
 * counted). A trace ("T", under 0.01 in) counts as 0.1 mm, below the measurable line: alone, it's not rain; nor is
 * drizzle in an hour with no measurable fall.
 *
 * The days' encoding: scripts/rain-days.mjs (the reports' weather by the quarter hour). A day dry with a report all day
 * isn't stored: within a station's `from`..`to`, a day not listed was dry.
 *
 * The climate over the race area, by month, from 2021–2025 (the years the sim's other climates use): each hour the wetter
 * of the two airports (as environment/rain.ts shows the record), counting the days with a report in at least 18 hours:
 *  - wetDay: the share of days with rain in any hour;
 *  - wetHour: on those days, the share of hours with rain;
 *  - heavy: of the hours with rain, the share heavy, drawn toward the station's share over the year as if the month had
 *    20 more wet hours (the dry months have few);
 *  - spellH: how long the rain lasts once it starts, the mean run of wet hours (whole hours).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { encodeDays, mergeDay, needed, slotLevel, localDate, SLOTS, b64, unb64, noReports, datesBetween } from './rain-days.mjs';

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
/** The METAR weather at the field (rain-days.mjs's codes: 1 light rain, 2 moderate, 3 heavy, 4 drizzle only, 0 none). */
function intensity(wx) {
  let rain = 0, dz = false;
  for (const g of (wx ?? '').split(/\s+/)) {
    if (!g || g.startsWith('VC')) continue; // (TS or SH alone, or in the vicinity: no rain here)
    if (/RA/.test(g)) rain = Math.max(rain, g.startsWith('-') ? 1 : g.startsWith('+') ? 3 : 2);
    else if (/DZ/.test(g)) dz = true;
  }
  return rain || (dz ? 4 : 0);
}

const data = JSON.parse(await readFile(OUT, 'utf8'));
const today = localDate(Date.now()), yesterday = localDate(Date.now() - 86400e3);
for (const [id, iem] of Object.entries(IDS)) {
  const reports = [];
  for (let y = +FROM.slice(0, 4); y <= +today.slice(0, 4); y++) {
    const a = y === +FROM.slice(0, 4) ? FROM : `${y}-01-01`, b = `${y + 1}-01-01`;
    const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${iem}&data=p01i&data=wxcodes&data=metar&year1=${a.slice(0, 4)}&month1=${+a.slice(5, 7)}&day1=${+a.slice(8)}&year2=${b.slice(0, 4)}&month2=${+b.slice(5, 7)}&day2=${+b.slice(8)}&tz=UTC&format=onlycomma&latlon=no&missing=M&trace=T&report_type=3&report_type=4`;
    const rows = (await get(url)).trim().split('\n').slice(1);
    for (const r of rows) {
      const [, valid, p01i, wx, ...raw] = r.split(','); // (valid: "YYYY-MM-DD HH:MM", UTC)
      const ms = Date.parse(valid.replace(' ', 'T') + 'Z');
      reports.push({ ms, raw: raw.join(','), mm: p01i === 'M' ? null : p01i === 'T' ? 0.1 : +p01i * 25.4, code: intensity(wx === 'M' ? '' : wx) });
    }
    console.log(`${id} ${y}: ${rows.length} reports`);
    await new Promise(r => setTimeout(r, 3000)); // (be gentle with the archive)
  }
  const st = data.stations[id], days = { ...st.days }, enc = encodeDays(reports);
  // (the last full day with reports: the record's end can't pass it)
  const last = reports.length ? localDate(Math.max(...reports.map(r => r.ms))) : FROM, upTo = last > yesterday ? yesterday : localDate(Date.parse(last + 'T12:00Z') - 86400e3);
  for (const date of datesBetween(FROM, last)) {
    // the reports already on file (the NWS API's, every five minutes, kept by fetch-rain.mjs) win; the archive fills their
    // gaps, today's too (it's near real time); a day with no report at all is unknown, not dry
    const b = mergeDay(unb64(days[date]) ?? noReports(), enc.get(date) ?? noReports());
    if (needed(b) || date > yesterday) days[date] = b64(b); else delete days[date];
  }
  st.days = Object.fromEntries(Object.entries(days).sort());
  st.from = st.from && st.from < FROM ? st.from : FROM; st.to = st.to && st.to > upTo ? st.to : upTo;
}

/* ---------- the climate over the race area, by month: the wetter of the two airports, as the sim shows ---------- */
const hourLevels = (id, date) => {
  const st = data.stations[id], b = st.days[date];
  if (!b) return date >= st.from && date <= st.to ? Array(24).fill(0) : Array(24).fill(null); // (not on file: dry, every report)
  const a = unb64(b); if (a.length !== 24 + SLOTS) return Array(24).fill(null);
  // each hour: its wettest quarter (null if none of its quarters has a report)
  return Array.from({ length: 24 }, (_, h) => { const l = [0, 1, 2, 3].map(k => slotLevel(a, h * 4 + k)).filter(x => x != null); return l.length ? Math.max(...l) : null; });
};
const m = Array.from({ length: 12 }, () => ({ days: 0, wet: 0, wetHours: 0, hoursOnWet: 0, heavy: 0, spells: 0 }));
for (const date of datesBetween(CLIM_FROM, CLIM_TO)) {
  const c = m[+date.slice(5, 7) - 1], per = Object.keys(IDS).map(id => hourLevels(id, date));
  const hr = Array.from({ length: 24 }, (_, h) => { const l = per.map(p => p[h]).filter(x => x != null); return l.length ? Math.max(...l) : null; });
  if (hr.filter(x => x != null).length < 18) continue; // (a day with most of its hours reported)
  c.days++;
  if (!hr.some(x => x)) continue;
  c.wet++; c.hoursOnWet += hr.filter(x => x != null).length;
  hr.forEach((x, h) => { if (x) { c.wetHours++; if (x === 2) c.heavy++; if (!hr[h - 1]) c.spells++; } });
}
const r3 = x => Math.round(x * 1000) / 1000;
const yearHeavy = m.reduce((s, c) => s + c.heavy, 0) / Math.max(1, m.reduce((s, c) => s + c.wetHours, 0)), K = 20;
const climate = m.map(c => ({ wetDay: r3(c.wet / Math.max(1, c.days)), wetHour: r3(c.wetHours / Math.max(1, c.hoursOnWet)), heavy: r3((c.heavy + K * yearHeavy) / (c.wetHours + K)), spellH: Math.max(1, Math.round(c.wetHours / Math.max(1, c.spells))), days: c.days }));
console.log('climate:', climate.map((c, i) => `${i + 1}: ${Math.round(c.wetDay * 100)}% wet (${c.days} d), ${Math.round(c.wetHour * 100)}% of hours, ${Math.round(c.heavy * 100)}% heavy, ${c.spellH} h`).join(' · '));
data.history = `ASOS/METAR archive, Iowa Environmental Mesonet (mesonet.agron.iastate.edu), SFO and OAK, from ${FROM}: routine and special reports, p01i and wxcodes (scripts/fetch-rain-history.mjs).`;
data.climate = { years: `${CLIM_FROM.slice(0, 4)}–${CLIM_TO.slice(0, 4)}`, note: 'Over the race area (the wetter of the two airports each hour, as environment/rain.ts shows it), by month (0 January): wetDay, the share of days with rain in any hour; wetHour, on those days the share of hours with rain; heavy, of those hours the share heavy (drawn toward the year\'s share as if 20 more wet hours); spellH, the mean run of wet hours; days, the days counted.', months: climate };
await writeFile(OUT, JSON.stringify(data) + '\n');
console.log(`Wrote ${OUT.pathname}`);
