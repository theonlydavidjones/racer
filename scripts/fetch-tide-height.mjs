#!/usr/bin/env node
/**
 * The tide's height in the bays the sim fills and empties by continuity (environment/tide.ts): Point San Quentin (NOAA
 * 9414873) for San Rafael Bay, San Leandro Channel (9414724) for San Leandro Bay. Both are subordinate stations of San
 * Francisco (9414290): its harmonic constants, with NOAA's offsets for each, and their datums.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-tide-height.mjs
 *
 * Output: src/environment/data/bay-tides.json (metres, phases GMT).
 */
import { writeFile } from 'node:fs/promises';

const API = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/', APP = '?units=metric&application=folkboat-sim';
const get = async p => { for (let a = 0; a < 4; a++) { try { const r = await fetch(API + p + APP); if (r.ok) return await r.json(); } catch { /* retry */ } await new Promise(r => setTimeout(r, 2000 * 2 ** a)); } throw new Error('Failed ' + p); };
const hc = (await get('9414290/harcon.json')).HarmonicConstituents.filter(c => c.amplitude > 0).map(c => [c.name, +c.amplitude.toFixed(4), +c.phase_GMT.toFixed(1)]);
// the bays' stations: each a subordinate of San Francisco, with its offsets; its datums (where it has none, the nearest
// station's that does: San Leandro Channel, 9414724, has none published; Oakland Airport, 9414711, 2.4 km off, has)
const BAYS = [
  { id: '9414873', name: 'Point San Quentin', bay: 'San Rafael Bay' },
  { id: '9414724', name: 'San Leandro Channel', bay: 'San Leandro Bay', datumsFrom: '9414711' }
];
// San Francisco's own datums: NOAA's ratio offsets scale its heights above its MLLW
const refDat = Object.fromEntries((await get('9414290/datums.json')).datums.map(d => [d.name, d.value]));
const refMsl = +(refDat.MSL - refDat.MLLW).toFixed(3), refMhhw = +(refDat.MHHW - refDat.MLLW).toFixed(3);
const stations = {};
for (const S of BAYS) {
  const off = await get(`${S.id}/tidepredoffsets.json`);
  if (off.refStationId !== '9414290') throw new Error(`${S.name}'s reference station changed: ${off.refStationId}`);
  const dat = Object.fromEntries(((await get(`${S.datumsFrom ?? S.id}/datums.json`)).datums ?? []).map(d => [d.name, d.value]));
  if (!Number.isFinite(dat.MSL) || !Number.isFinite(dat.MLLW)) throw new Error(`${S.datumsFrom ?? S.id}: no datums`);
  stations[S.id] = {
    name: S.name, bay: S.bay,
    // the station's offsets: minutes later than San Francisco, and height ratios, at high and low water
    dtHigh: off.timeOffsetHighTide, dtLow: off.timeOffsetLowTide, kHigh: off.heightOffsetHighTide, kLow: off.heightOffsetLowTide,
    msl: +(dat.MSL - dat.MLLW).toFixed(3), ...(S.datumsFrom ? { datumsFrom: S.datumsFrom } : {}) // mean sea level above MLLW
  };
  console.log(`${S.name}: +${off.timeOffsetHighTide}/${off.timeOffsetLowTide} min, ×${off.heightOffsetHighTide}/${off.heightOffsetLowTide}; MSL ${stations[S.id].msl} m above MLLW`);
}
await writeFile(new URL('../src/environment/data/bay-tides.json', import.meta.url), JSON.stringify({
  source: 'NOAA CO-OPS metadata API: San Francisco 9414290 harmonic constants (m, phase GMT); each station\'s tide prediction offsets and datums (m)',
  fetched: new Date().toISOString().slice(0, 10), ref: '9414290', refMsl, refMhhw, hc, stations
}) + '\n');
console.log(`bay-tides.json: ${hc.length} constituents`);
