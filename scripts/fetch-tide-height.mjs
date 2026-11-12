#!/usr/bin/env node
/**
 * The tide's height at Point San Quentin (NOAA 9414873), for San Rafael Bay's filling and emptying (environment/tide.ts):
 * a subordinate station of San Francisco (9414290), so San Francisco's harmonic constants with NOAA's offsets for it
 * (its tidepredoffsets: high water 42 min later at 0.99 of the height, low water 50 min later at 0.93), and its datums.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-tide-height.mjs
 *
 * Output: src/environment/data/sq-tide.json (metres, phases GMT).
 */
import { writeFile } from 'node:fs/promises';

const API = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/', APP = '?units=metric&application=folkboat-sim';
const get = async p => { for (let a = 0; a < 4; a++) { try { const r = await fetch(API + p + APP); if (r.ok) return await r.json(); } catch { /* retry */ } await new Promise(r => setTimeout(r, 2000 * 2 ** a)); } throw new Error('Failed ' + p); };
const hc = (await get('9414290/harcon.json')).HarmonicConstituents.filter(c => c.amplitude > 0).map(c => [c.name, +c.amplitude.toFixed(4), +c.phase_GMT.toFixed(1)]);
const off = await get('9414873/tidepredoffsets.json'), dat = Object.fromEntries((await get('9414873/datums.json')).datums.map(d => [d.name, d.value]));
if (off.refStationId !== '9414290') throw new Error('Point San Quentin\'s reference station changed: ' + off.refStationId);
await writeFile(new URL('../src/environment/data/sq-tide.json', import.meta.url), JSON.stringify({
  source: 'NOAA CO-OPS metadata API: San Francisco 9414290 harmonic constants (m, phase GMT); Point San Quentin 9414873 tide prediction offsets and datums (m)',
  fetched: new Date().toISOString().slice(0, 10),
  ref: '9414290', station: '9414873', name: 'Point San Quentin',
  // the station's offsets: minutes later than San Francisco, and height ratios, at high and low water
  dtHigh: off.timeOffsetHighTide, dtLow: off.timeOffsetLowTide, kHigh: off.heightOffsetHighTide, kLow: off.heightOffsetLowTide,
  msl: +(dat.MSL - dat.MLLW).toFixed(3), gt: dat.GT, // mean sea level above MLLW, and the great diurnal range
  hc
}) + '\n');
console.log(`sq-tide.json: ${hc.length} constituents; MSL ${(dat.MSL - dat.MLLW).toFixed(3)} m above MLLW`);
