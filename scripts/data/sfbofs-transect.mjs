/**
 * The current off the San Francisco Cityfront from NOAA's SFBOFS model (FVCOM, the San Francisco Bay Operational
 * Forecast System), for checking the sim's shore relief (environment/current.ts shoreRelief) and its stream there.
 *
 * Reads SFBOFS nowcast fields files (NetCDF-4) from NOAA's open-data bucket, e.g.
 *   https://noaa-nos-ofs-pds.s3.amazonaws.com/sfbofs/netcdf/2026/11/08/sfbofs.t03z.20261108.fields.n000.nc
 * (cycle 03z of 8 Nov: n000 is 21:00 UTC on 7 Nov, n001 22:00, n002 23:00), and writes the current at points on north–
 * south transects from the seawall out to mid-channel: through marks A, X and 6 (Fort Mason) of the Seaweed Soup
 * courses and through NOAA's current station SFB1204 (Alcatraz Island, SW of). At each point: the top sigma layer's
 * (the surface, like SFB1204's 2 ft bin) and the mean over all 20 layers, from the three nearest element centers
 * (inverse-distance weighted), and the water's depth there.
 *
 * Dev only (h5wasm is a devDependency; nothing here is in the page):
 *   node scripts/data/sfbofs-transect.mjs out.json file1.nc [file2.nc ...]
 */
import h5wasm from 'h5wasm/node';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [out, ...files] = process.argv.slice(2);
if (!out || !files.length) { console.error('usage: node scripts/data/sfbofs-transect.mjs out.json file.nc ...'); process.exit(1); }
await h5wasm.ready;

const LINES = { A: -122.446817, X: -122.443333, '6': -122.43, SFB1204: -122.432 };
const LAT0 = 37.8058, LAT1 = 37.8180, DLAT = 0.00025; // (about 28 m apart)
const BOX = { lon0: -122.47, lon1: -122.41, lat0: 37.80, lat1: 37.83 };
const M_LAT = 111_000, M_LON = 111_000 * Math.cos(37.81 * Math.PI / 180);

const result = { source: 'NOAA NOS CO-OPS SFBOFS (FVCOM) nowcast fields, from the NOAA Open Data Dissemination bucket noaa-nos-ofs-pds (https://noaa-nos-ofs-pds.s3.amazonaws.com/index.html#sfbofs/netcdf/), read with scripts/data/sfbofs-transect.mjs', files: [], times: [], lines: LINES, points: [] };
let elems = null, depth = null;
for (const path of files) {
  const f = new h5wasm.File(path, 'r');
  const time = String(f.get('Times').value.join ? f.get('Times').value.join('') : f.get('Times').value).slice(0, 19);
  if (!elems) {
    // (the elements in the box round the Cityfront, once: the grid is the same in every file)
    const lonc = f.get('lonc').value, latc = f.get('latc').value, nv = f.get('nv').value, h = f.get('h').value, ne = lonc.length;
    elems = []; depth = [];
    for (let e = 0; e < ne; e++) {
      const lo = lonc[e] > 180 ? lonc[e] - 360 : lonc[e], la = latc[e];
      if (lo < BOX.lon0 || lo > BOX.lon1 || la < BOX.lat0 || la > BOX.lat1) continue;
      elems.push({ e, lo, la }); depth.push((h[nv[e] - 1] + h[nv[ne + e] - 1] + h[nv[2 * ne + e] - 1]) / 3); // (nv is 1-based, [3][nele])
    }
  }
  const u = f.get('u').value, v = f.get('v').value, ne = f.get('lonc').shape[0], layers = f.get('u').shape[1];
  const wet = f.get('wet_cells').value;
  result.files.push(basename(path)); result.times.push(time);
  for (const [line, lon] of Object.entries(LINES)) for (let lat = LAT0; lat <= LAT1 + 1e-9; lat += DLAT) {
    // (the three nearest wet element centers, within 150 m)
    const near = [];
    elems.forEach((q, k) => { if (!wet[q.e]) return; const d = Math.hypot((q.lo - lon) * M_LON, (q.la - lat) * M_LAT); if (d < 150) near.push({ k, d }); });
    near.sort((a, b) => a.d - b.d); near.length = Math.min(3, near.length);
    if (!near.length) { result.points.push({ line, time, lat: +lat.toFixed(5), lon, dry: true }); continue; }
    let W = 0, us = 0, vs = 0, um = 0, vm = 0, dep = 0;
    for (const { k, d } of near) {
      const w = 1 / Math.max(5, d), e = elems[k].e; W += w; dep += w * depth[k];
      us += w * u[e]; vs += w * v[e]; // (layer 0, the top: u is [time][siglay][nele])
      let su = 0, sv = 0; for (let l = 0; l < layers; l++) { su += u[l * ne + e]; sv += v[l * ne + e]; }
      um += w * su / layers; vm += w * sv / layers;
    }
    const r = x => Math.round(x / W * 1000) / 1000;
    result.points.push({ line, time, lat: +lat.toFixed(5), lon, u: r(us), v: r(vs), uMean: r(um), vMean: r(vm), depth: Math.round(dep / W * 10) / 10, nearestM: Math.round(near[0].d) });
  }
  f.close();
}
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`${result.points.length} points, ${result.times.join(', ')}`);
