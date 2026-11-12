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

/**
 * Every NOAA current-prediction station in the sim's world (the Central Bay from the Golden Gate to the Oakland Estuary,
 * Berkeley and Richmond, Raccoon Strait and San Pablo Strait), at its published (near-surface) bin: a Folkboat feels the top couple of metres. Harmonic
 * stations from the 2012–13 San Francisco Bay current survey; subordinate stations as offsets from one of them.
 */
// (extended, November 2026, with the sim's world: east past Treasure Island to the Oakland Estuary and Alameda, the
// Berkeley and Emeryville flats, and north past Richmond to San Pablo Strait and Point San Pedro)
const AREA = { south: 37.74, north: 37.985, west: -122.50, east: -122.188 };
const NOTES = {
  SFB1203: 'Golden Gate Bridge, east of', SFB1202: 'north side of the channel', SFB1204: 'southwest of Alcatraz: the middle of the Cityfront race area',
  SFB1211: 'north of Alcatraz', SFB1205: 'north of Pier 35: east edge', PCT0286: 'off Crissy Field: the shore relief and early flood along the Presidio',
  SFB1213: 'Oakland Inner Harbor: the Estuary\'s mouth', SFB1214: 'the Estuary off Jack London Square', SFB1215: 'Brooklyn Basin, the Estuary by Encinal YC',
  SFB1216: 'the Estuary\'s south-east end', SFB1218: 'off the Emeryville Marina: the Berkeley flats', SFB1309: 'east of Point Chauncey: toward Southampton Shoal',
  SFB1310: 'north of Point Chauncey: the Richmond reach', SFB1312: 'San Pablo Strait, off Point San Pablo', s08010: 'Southampton Shoal Channel: the Richmond approach',
  s09010: 'Oakland Outer Harbor entrance', s10010: 'Oakland Inner Harbor entrance', PCT0336: 'between Yerba Buena Island and Oakland',
  PCT0596: 'off Fleming Point: the Berkeley Circle', PCT0631: 'east of Southampton Shoal', PCT0666: 'off Richmond, by the Long Wharf'
};
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

const list = (await get('/mdapi/prod/webapi/stations.json?type=currentpredictions')).stations;
const inArea = new Map();
for (const x of list) if (x.lat > AREA.south && x.lat < AREA.north && x.lng > AREA.west && x.lng < AREA.east && !inArea.has(x.id)) inArea.set(x.id, x);
const HARMONIC = [...inArea.values()].filter(x => x.type === 'H').map(x => ({ id: x.id, bin: Number(x.currbin), note: NOTES[x.id] ?? '' }));
const SUBORDINATE = [...inArea.values()].filter(x => x.type === 'S').map(x => ({ id: x.id, bin: Number(x.currbin), note: NOTES[x.id] ?? '' }));
// subordinate stations' reference stations, wherever they are
for (const s of SUBORDINATE) {
  const o = await get(`/mdapi/prod/webapi/stations/${s.id}_${s.bin}/currentpredictionoffsets.json`);
  s.offsets = o;
  if (!HARMONIC.some(h => h.id === o.refStationId && h.bin === o.refStationBin)) HARMONIC.push({ id: o.refStationId, bin: o.refStationBin, note: 'reference for subordinate stations' });
}
console.log(`${HARMONIC.length} harmonic, ${SUBORDINATE.length} subordinate stations`);

const stations = [], fixtures = {};
// A station NOAA publishes near the surface as offsets from its own deeper bin (Richmond, PCT0666: bin 1 from bin 2):
// the deeper bin is kept only as the reference, under its own key (id@bin), and isn't one of the field's stations.
const inWorld = m => m.lat > 37.735 && m.lat < 37.986 && m.lng > -122.61 && m.lng < -122.1886; // (the sim's world: the terrain's box)
const key = s => SUBORDINATE.some(x => x.id === s.id) ? `${s.id}@${s.bin}` : s.id;
for (const s of HARMONIC) {
  const m = await meta(s.id);
  const hc = (await get(`/mdapi/prod/webapi/stations/${s.id}/harcon.json?bin=${s.bin}&units=english`)).HarmonicConstituents.filter(c => c.binNbr === s.bin);
  const cp = await series(s.id, s.bin, 6);
  stations.push({
    // (a reference outside the world, San Mateo Bridge's, is only a reference too: its stream is a different water's)
    id: key(s), ...(key(s) !== s.id || !inWorld(m) ? { refOnly: true } : {}), kind: 'harmonic', name: m.name, note: s.note, lat: round(m.lat, 5), lon: round(m.lng, 5), bin: s.bin, depthM: round(hc[0].binDepth * 0.3048, 1),
    // (NOAA leaves a few stations' mean flood or ebb direction out of their predictions, Raccoon Strait's SFB1212 both:
    // there, the major axis's azimuth from its constants, which is within 2–10° of the published flood direction where
    // both are given, and the ebb opposite it)
    flood: cp[0].meanFloodDir ?? Math.round(hc[0].azi), ebb: cp[0].meanEbbDir ?? Math.round((hc[0].azi + 180) % 360),
    z0: round(hc[0].majorMeanSpeed),
    hc: hc.map(c => [c.constituentName, round(c.majorAmplitude, 4), round(c.majorPhaseGMT, 2)])
  });
  fixtures[key(s)] = cp.map(p => [p.Time, p.Velocity_Major]);
  console.log(`${key(s)} ${m.name}: ${hc.length} constituents, bin ${s.bin}`);
}
for (const s of SUBORDINATE) {
  const m = await meta(s.id);
  const o = s.offsets;
  const ref = key({ id: o.refStationId, bin: o.refStationBin });
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
