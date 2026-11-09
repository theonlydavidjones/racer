#!/usr/bin/env node
/**
 * Pull NOAA tidal-current data for the Cityfront race area and write what the sim needs to predict the
 * current for any date, offline.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-currents.mjs
 *
 * Source: NOAA CO-OPS (api.tidesandcurrents.noaa.gov), public domain.
 *  - Harmonic stations (2012–13 San Francisco Bay current survey): harmonic constituents of the current along
 *    its major (flood/ebb) axis, at the bin nearest the surface. The sim sums the constituents (src/environment/harmonics.ts).
 *  - Subordinate stations: time and speed offsets applied to a reference harmonic station's floods, ebbs and slacks.
 *
 * Output: src/environment/data/sf-currents.json, and a few days of NOAA's own predictions in
 * tests/fixtures/noaa-currents.json so the tests can check the sim's predictor against NOAA's.
 */
import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://api.tidesandcurrents.noaa.gov';
const APP = 'folkboat-sim';

/** Near-surface bins: a Folkboat feels the top couple of metres. */
const HARMONIC = [
  { id: 'SFB1203', bin: 18, note: 'Golden Gate Bridge, east of' },
  { id: 'SFB1202', bin: 17, note: 'north side of the channel; reference for the subordinate stations' },
  { id: 'SFB1204', bin: 18, note: 'southwest of Alcatraz: the middle of the Cityfront race area' },
  { id: 'SFB1211', bin: 22, note: 'north of Alcatraz' },
  { id: 'SFB1205', bin: 15, note: 'north of Pier 35: east edge' }
];
const SUBORDINATE = [
  { id: 'PCT0286', bin: 1, note: 'off Crissy Field: the shore relief and early flood along the Presidio' }
];
const FIXTURE_DAYS = { begin: '20261114', end: '20261116' };

async function get(path) {
  const url = API + path + (path.includes('?') ? '&' : '?') + 'application=' + APP;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      console.warn(`${path}: HTTP ${res.status}`);
    } catch (e) { console.warn(`${path}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error(`Failed: ${path}`);
}

const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;
const meta = async id => (await get(`/mdapi/prod/webapi/stations/${id}.json`)).stations[0];
const series = async (id, bin, interval) => (await get(`/api/prod/datagetter?product=currents_predictions&station=${id}&bin=${bin}&begin_date=${FIXTURE_DAYS.begin}&end_date=${FIXTURE_DAYS.end}&interval=${interval}&units=english&time_zone=gmt&format=json`)).current_predictions.cp;

const stations = [], fixtures = {};
for (const s of HARMONIC) {
  const m = await meta(s.id);
  const hc = (await get(`/mdapi/prod/webapi/stations/${s.id}/harcon.json?bin=${s.bin}&units=english`)).HarmonicConstituents.filter(c => c.binNbr === s.bin);
  const cp = await series(s.id, s.bin, 6);
  stations.push({
    id: s.id, kind: 'harmonic', name: m.name, note: s.note, lat: round(m.lat, 5), lon: round(m.lng, 5), bin: s.bin, depthM: round(hc[0].binDepth * 0.3048, 1),
    flood: cp[0].meanFloodDir, ebb: cp[0].meanEbbDir,
    z0: round(hc[0].majorMeanSpeed),
    hc: hc.map(c => [c.constituentName, round(c.majorAmplitude, 4), round(c.majorPhaseGMT, 2)])
  });
  fixtures[s.id] = cp.map(p => [p.Time, p.Velocity_Major]);
  console.log(`${s.id} ${m.name}: ${hc.length} constituents, bin ${s.bin}`);
}
for (const s of SUBORDINATE) {
  const m = await meta(s.id);
  const o = await get(`/mdapi/prod/webapi/stations/${s.id}_${s.bin}/currentpredictionoffsets.json`);
  const ref = `${o.refStationId}`;
  if (!stations.some(x => x.id === ref && x.bin === o.refStationBin)) throw new Error(`${s.id}: reference ${ref} bin ${o.refStationBin} isn't in HARMONIC`);
  stations.push({
    id: s.id, kind: 'subordinate', name: m.name, note: s.note, lat: round(m.lat, 5), lon: round(m.lng, 5),
    flood: o.meanFloodDir, ebb: o.meanEbbDir, ref,
    // time offsets (min) for max flood, slack before ebb, max ebb, slack before flood; speed ratios for flood and ebb
    dt: [o.mfcTimeAdjMin, o.sbeTimeAdjMin, o.mecTimeAdjMin, o.sbfTimeAdjMin], amp: [o.mfcAmpAdj, o.mecAmpAdj]
  });
  fixtures[s.id] = (await series(s.id, s.bin, 'MAX_SLACK')).map(p => [p.Time, p.Velocity_Major, p.Type]);
  console.log(`${s.id} ${m.name}: offsets from ${ref}`);
}

const today = new Date().toISOString().slice(0, 10);
await mkdir(new URL('../src/environment/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/environment/data/sf-currents.json', import.meta.url), JSON.stringify({
  source: 'NOAA CO-OPS current predictions (api.tidesandcurrents.noaa.gov): harmonic constituents along the major axis, near-surface bins, knots; subordinate offsets.',
  fetched: today, units: 'knots, degrees true (direction the water flows toward), phases GMT', stations
}, null, 1) + '\n');
await mkdir(new URL('../tests/fixtures/', import.meta.url), { recursive: true });
await writeFile(new URL('../tests/fixtures/noaa-currents.json', import.meta.url), JSON.stringify({
  source: 'NOAA CO-OPS currents_predictions, time_zone=gmt, units=english (knots, + flood)', fetched: today, series: fixtures
}) + '\n');
console.log('Wrote src/environment/data/sf-currents.json and tests/fixtures/noaa-currents.json');
