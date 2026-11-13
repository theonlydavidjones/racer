#!/usr/bin/env node
/**
 * Real San Francisco Bay Folkboat race results, for calibrating the skipper and crew model and checking the AI fleet
 * against real fleets (ROADMAP: "skipper and crew model: calibration data first"; "validation against real fleets").
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-folkboat-results.mjs              # the known events below, then the analysis
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-folkboat-results.mjs --discover   # also look for new Folkboat events
 *   node scripts/analyse-folkboat-results.mjs                                 # the analysis alone (no network)
 *
 * Sources (public results pages; one request a second, with this project's own User-Agent):
 *  - Jibeset (www.jibeset.net), which scores Golden Gate YC's Seaweed Soup midwinters. Each race page gives the
 *    fleet's start time, course number and distance, and each boat's finish and elapsed times. Jibeset puts results
 *    from before 2025 behind a "person check" for people; this script respects that and records those as gated.
 *  - Regatta Network (www.regattanetwork.com), which scores Sausalito YC's Classic Boat Invitational and SFYC's
 *    Resin Regatta. One-design races there carry finish places and the fleet's start time; finish times are almost
 *    never entered, so these races give places only.
 *
 * What's kept: public results only (sail number, boat, skipper as published, club, places, times, scoring codes).
 * No contact details.
 *
 * Output: src/boat/data/sf-folkboat-results.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { analyse } from './analyse-folkboat-results.mjs';

const OUT = new URL('../src/boat/data/sf-folkboat-results.json', import.meta.url);
const UA = 'folkboat-racing-sim (personal project)';
const DISCOVER = process.argv.includes('--discover');
const JIBESET = 'https://www.jibeset.net';
const RN = 'https://www.regattanetwork.com';

/** Jibeset regattas with a Folkboat fleet (club code, regatta id), found by --discover on 2026-11-11. */
const JIBESET_EVENTS = [
  { club: 'GGYC', rg: 'T008047221', name: 'GGYC Manuel Fagundes Seaweed Soup Regatta 2025–26', host: 'Golden Gate Yacht Club' },
  { club: 'GGYC', rg: 'T00227699', name: 'GGYC Manuel Fagundes Seaweed Soup Regatta 2026–27', host: 'Golden Gate Yacht Club' },
];
/** Earlier Seaweed Soup seasons on Jibeset: behind its person check, so not fetched, and whether they had a Folkboat
 *  fleet isn't confirmed (press reports mention one in some midwinters). */
const JIBESET_GATED = [
  { club: 'GGYC', rg: 'T00645992', name: 'GGYC Seaweed Soup 2024–25' },
  { club: 'GGYC', rg: 'T008769423', name: 'GGYC Seaweed Soup 2023' },
  { club: 'GGYC', rg: 'T005493669', name: 'GGYC Seaweed Soup 2022' },
  { club: 'GGYC', rg: 'T004296899', name: 'GGYC Seaweed Soup 2021' },
  { club: 'GGYC', rg: 'T009157579', name: 'GGYC Seaweed Soup 2019' },
];
/** Regatta Network events with a Folkboat fleet, 2019–2026 (from its yearly results index, html/results.php?year=). */
const RN_EVENTS = [17960, 18590, 22071, 22583, 24685, 26519, 28252, 29909, 31389];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastFetch = 0;
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastFetch + 1000 - Date.now(); // be polite: at most one request a second
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.text();
      if (res.status === 404) return '';
      console.warn(`HTTP ${res.status} ${url}`);
    } catch (e) { console.warn(e.message); }
    await sleep(2000 * 2 ** attempt);
  }
  throw new Error('Failed: ' + url);
}

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const text = s => s.replace(/<br[^>]*>/gi, ' ').replace(/<[^>]*>/g, '')
  .replace(/&(#\d+|\w+);/g, (m, e) => ENT[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))
  .replace(/\s+/g, ' ').trim();
const hms = s => { const m = /(\d{1,2}):(\d\d):(\d\d)/.exec(s ?? ''); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
/** A boat's identity across events: the digits of its sail number (f113, US 113 and USA-113 are one boat). */
const sailKey = s => (s.match(/\d+/g) ?? []).join('') || s.trim().toLowerCase();
/** Skippers as published, tidied to one spelling ("peter jeal" → "Peter Jeal"). */
const tidyName = s => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s/'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const CODES = /\b(DNC|DNS|DNF|OCS|UFD|BFD|DNE|DPI|RET|NSC|TLE|DSQ|SCP|ZFP|RDG|ABN|SRE)\b/;

// ---------------------------------------------------------------- Jibeset

/** A Jibeset race page → its Folkboat fleet (or null). */
function parseJibesetRace(html, url) {
  // The race page is a run of fleets; each starts with a header cell linking to perf00.php with FM=<fleet>.
  const parts = html.split(/<td class="tred"[^>]*>/).slice(1);
  for (const part of parts) {
    const fleet = text(part.slice(0, part.indexOf('</td>')));
    if (!/folkboat/i.test(fleet)) continue;
    const firstRow = part.search(/<tr class="d[01]"/);
    const head = text(firstRow > 0 ? part.slice(0, firstRow) : part);
    const start = /Start:\s*(\d\d)\/(\d\d)\/(\d\d)\s*at\s*(\d\d:\d\d:\d\d)/.exec(head);
    const course = /Course:\s*(\S+)\s*Distance:\s*([\d.]+)/.exec(head);
    const wind = /Wind:\s*(.*?)\s*from\s*(.*?)\s*(?:Fleet|Tide|$)/.exec(head);
    const num = k => { const m = new RegExp(k + ':\\s*(\\d+)').exec(head); return m ? +m[1] : null; };
    const scoring = text(/<td class="tdatahh"[^>]*>([^<]*)/.exec(part)?.[1] ?? '');
    const boats = [];
    for (const row of part.split(/<tr class="d[01]"[^>]*>/).slice(1)) {
      const cells = [...row.split('</tr>')[0].matchAll(/<td[^>]*class="(tdatar\w?)"[^>]*>([\s\S]*?)<\/td>/g)].map(m => text(m[2]));
      if (cells.length < 11) continue;
      const [sail, boat, points, skipper, , finish, elapsed, corrected, club, , comments] = cells;
      const code = (CODES.exec(corrected) ?? CODES.exec(comments) ?? CODES.exec(finish))?.[1] ?? null;
      boats.push({
        sail, key: sailKey(sail), boat, skipper: tidyName(skipper), club: club || null,
        points: points === '' ? null : +points, finish: hms(finish) != null ? finish : null,
        elapsedS: hms(elapsed), code,
      });
    }
    // Places: finishers in order of elapsed time (one design, so corrected order is the same).
    const fin = boats.filter(b => b.elapsedS != null && !b.code).sort((a, b) => a.elapsedS - b.elapsedS);
    fin.forEach((b, i) => { b.place = i + 1; });
    return {
      fleet, scoring: scoring || null,
      date: start ? `20${start[3]}-${start[1]}-${start[2]}` : null, start: start?.[4] ?? null,
      course: course?.[1] ?? null, distanceNm: course ? +course[2] : null,
      windReported: wind && !/---/.test(wind[1]) ? `${wind[1]} from ${wind[2]}` : null,
      fleetCount: num('Fleet'), started: num('Started'), finished: num('Finished'),
      url, boats,
    };
  }
  return null;
}

async function fetchJibesetEvent(ev) {
  const fhUrl = `${JIBESET}/show.php?RR=${ev.club}_${ev.rg}&DOC=fh&TYP=html`;
  const fh = await get(fhUrl);
  if (/person check/i.test(fh)) return { ...ev, gated: true };
  const raceDocs = [...new Set([...fh.matchAll(/DOC=r(\d+)&/g)].map(m => +m[1]))].sort((a, b) => a - b);
  const races = [];
  // A season under way may have no series page yet: then try race 1, 2, … until one isn't there.
  const tryInTurn = !raceDocs.length;
  for (let i = 0; tryInTurn ? i < 20 : i < raceDocs.length; i++) {
    const n = tryInTurn ? i + 1 : raceDocs[i];
    const url = `${JIBESET}/show.php?RR=${ev.club}_${ev.rg}&DOC=r${n}&TYP=html`;
    const html = await get(url);
    if (tryInTurn && !html.trim()) break;
    const r = parseJibesetRace(html, url);
    if (r) races.push({ raceNo: n, ...r });
  }
  console.log(`Jibeset ${ev.name}: ${races.length} Folkboat races`);
  return { source: 'jibeset', id: `${ev.club}_${ev.rg}`, name: ev.name, host: ev.host, url: fhUrl, races };
}

/** Every Jibeset club's regattas from 2025 on whose series page has a Folkboat fleet. */
async function discoverJibeset() {
  const home = await get(`${JIBESET}/`);
  const clubs = [...new Set([...home.matchAll(/CLUB=([A-Z]+)/g)].map(m => m[1]))];
  const found = [];
  for (const club of clubs) {
    const list = await get(`${JIBESET}/ourregatta.php?A00=yes&A11=yes&CLUB=${club}`);
    for (const m of list.matchAll(/RG=(T\d+)[^>]*>([^<]*)/g)) {
      const year = +(/^(\d{4})/.exec(m[2].trim())?.[1] ?? 0);
      if (year < 2025 || found.some(f => f.rg === m[1])) continue;
      const fh = await get(`${JIBESET}/show.php?RR=${club}_${m[1]}&DOC=fh&TYP=html`);
      if (/folkboat/i.test(fh) && !/person check/i.test(fh)) found.push({ club, rg: m[1], name: text(m[2]), host: club });
    }
  }
  return found;
}

// ---------------------------------------------------------------- Regatta Network

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function parseRnRace(html, url) {
  const info = /Start Date\/Time\s*=\s*(\w+)\s+(\d+),\s*(\d{4})\s+(\d\d:\d\d:\d\d)(?:,\s*Length \(NM\)\s*=\s*([\d.]+))?/.exec(text(html));
  const headers = [...html.matchAll(/class="score_header[^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map(m => text(m[1]).toLowerCase());
  const col = name => headers.findIndex(h => h.startsWith(name));
  const boats = [];
  for (const row of html.split(/<tr[^>]*>/).slice(1)) {
    const cells = [...row.matchAll(/class="score_line[01][^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map(m => text(m[1]));
    if (cells.length < 6) continue;
    const pen = cells[col('penalty')] ?? '';
    const code = CODES.exec(pen)?.[1] ?? null;
    const fin = col('finish') >= 0 ? cells[col('finish')] : '';
    const sail = cells[col('sail')];
    boats.push({
      sail, key: sailKey(sail), boat: cells[col('boat')], skipper: tidyName(cells[col('skipper')]),
      club: cells[col('club')] || null, points: +cells[col('pts')] || null,
      finish: hms(fin) != null ? fin : null, elapsedS: null, code,
      place: code ? null : +cells[0] || null,
    });
  }
  const date = info ? `${info[3]}-${String(MONTHS[info[1].toLowerCase()]).padStart(2, '0')}-${info[2].padStart(2, '0')}` : null;
  const start = info && info[4] !== '00:00:00' ? info[4] : null;
  if (start) for (const b of boats) if (b.finish) b.elapsedS = hms(b.finish) - hms(start);
  return { fleet: 'Folkboat', date, start, distanceNm: info?.[5] ? +info[5] : null, url, boats };
}

async function fetchRnEvent(id) {
  const url = `${RN}/clubmgmt/applet_regatta_results.php?regatta_id=${id}&limit_fleet=Folkboat`;
  const html = await get(url);
  const name = text(/<title>([^<]*)/i.exec(html)?.[1] ?? '').replace(/\s*-\s*Series Standing.*/, '');
  const h4 = text(/<h4[^>]*>([\s\S]*?)<\/h4>/i.exec(html)?.[1] ?? '');
  const raceNums = [...new Set([...html.matchAll(/applet_race_scores\.php\?regatta_id=\d+&(?:amp;)?race_num=(\d+)&(?:amp;)?fleet=Folkboat/g)].map(m => +m[1]))].sort((a, b) => a - b);
  const races = [];
  for (const n of raceNums) {
    const rurl = `${RN}/clubmgmt/applet_race_scores.php?regatta_id=${id}&race_num=${n}&fleet=Folkboat`;
    const r = parseRnRace(await get(rurl), rurl);
    if (r.boats.length) races.push({ raceNo: n, ...r });
  }
  console.log(`Regatta Network ${id} ${name}: ${races.length} Folkboat races`);
  return { source: 'regattanetwork', id: String(id), name, host: h4.split('|')[0].trim() || null, url, races };
}

/** Regatta Network events 2019 on, hosted on the Bay, whose results page has a Folkboat fleet. */
async function discoverRn() {
  const BAY = /sausalito|san francisco|st\.? francis|golden gate|richmond|berkeley|encinal|tiburon|south beach|corinthian|bay view|alameda|sequoia|vallejo|island yacht|oakland|coyote point|cal sailing/i;
  const ids = [];
  for (let y = 2019; y <= new Date().getFullYear(); y++) {
    const idx = await get(`${RN}/html/results.php?year=${y}`);
    for (const row of idx.split(/<tr/i)) {
      const id = /regatta_id=(\d+)/.exec(row)?.[1];
      if (!id || !BAY.test(text(row)) || ids.includes(+id)) continue;
      const html = await get(`${RN}/clubmgmt/applet_regatta_results.php?regatta_id=${id}`);
      if (/name="Folkboat"|>\s*Folkboat\s*</i.test(html)) ids.push(+id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------- main

const jibEvents = [...JIBESET_EVENTS];
const rnEvents = [...RN_EVENTS];
if (DISCOVER) {
  for (const ev of await discoverJibeset()) if (!jibEvents.some(e => e.rg === ev.rg)) jibEvents.push(ev);
  for (const id of await discoverRn()) if (!rnEvents.includes(id)) rnEvents.push(id);
}
const events = [];
const gated = JIBESET_GATED.map(g => ({ ...g, url: `${JIBESET}/${g.club}000.php?RG=${g.rg}` }));
for (const ev of jibEvents) {
  const e = await fetchJibesetEvent(ev);
  if (e.gated) gated.push({ ...ev, url: `${JIBESET}/${ev.club}000.php?RG=${ev.rg}` }); else events.push(e);
}
for (const id of rnEvents) events.push(await fetchRnEvent(id));

const out = {
  source: 'Public race results: Jibeset (www.jibeset.net, GGYC Seaweed Soup) and Regatta Network (www.regattanetwork.com, ' +
    'Sausalito YC Classic Boat Invitational, SFYC Resin Regatta). Fetched by scripts/fetch-folkboat-results.mjs.',
  fetched: new Date().toISOString().slice(0, 10),
  notes: [
    'Times are local (Pacific). elapsedS is from the fleet\'s start to the boat\'s finish, in seconds.',
    'Jibeset races: finish and elapsed times for every finisher, the start time, course number and nominal distance (nm).',
    'Regatta Network races: places and the start time only; finish times appear for one or two boats in a few races and ' +
      'are hand-entered, so they are kept but not used for speed. A start of 00:00:00 there means not entered (null here).',
    'place is the finishing place among finishers (null for a scoring code). points are as published.',
    'key is the digits of the sail number, to follow one boat across events (sail numbers are typed differently by each scorer).',
    'Course numbers are on GGYC\'s course sheet (Addendum B), which is the same table in 2025–26 and 2026–27 (Jibeset ' +
      'DOC=cr for 2025–26, DOC=X0 for 2026–27), so src/courses/data serves both seasons. Where the scorer\'s distance ' +
      'disagrees with the sheet\'s for the course number (2025–26 races 1 and 4: course 3 given as 6.1 nm, the sheet 3.7; ' +
      'course 13 as 8.9, the sheet 5.0), one of the two was typed wrong: sim/realRaces.ts says so beside the race.',
    'Distances are the scorer\'s nominal course lengths, not sailed distances.',
    'Regatta Network gives every 2023 SYC Classic race the date 2023-06-11 although the event ran June–October; treat those dates as unsure.',
    'Skippers are as published, tidied to one spelling; a boat can have several skippers over the years.',
  ],
  gated,
  events,
};
const real = JSON.parse(await readFile(new URL('../src/environment/data/sf-real-days.json', import.meta.url), 'utf8'));
await writeFile(OUT, JSON.stringify(analyse(out, real), null, 1) + '\n');
console.log('Wrote', OUT.pathname, events.reduce((n, e) => n + e.races.length, 0), 'races');
