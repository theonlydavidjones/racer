#!/usr/bin/env node
/**
 * The sea floor's tiles (r296): turns a bathymetric GeoTIFF into 1 km tiles of 12.5 m cells on the sim's own grid (x east,
 * y north in metres from LAT0/LON0), for render/bathy.ts to load by area. Made for the USGS 1 m Central San Francisco Bay
 * bathymetry DEM, cropped and resampled to 3 m (EPSG:6339, NAD83(2011) / UTM zone 10N, metres above NAVD88, negative
 * under water; the file is uncompressed float32 in one-row strips). Many tiles, not one: run it again with another crop
 * and it adds that crop's tiles to src/render/data/bathy.json (a tile cell the new crop has data for replaces the old).
 *
 *   node scripts/make-bathy.mjs <crop.tif> [more.tif ...]
 *
 * A tile cell is the mean of the 4 × 4 points of the source inside it (nodata left out); a cell with fewer than half valid
 * is unknown (−32768), and the renderer leaves its old sea as it was. Heights are stored as scene metres in centimetres
 * (Int16): scene height = NAVD88 − 0.969 m (NOAA CO-OPS 9414290: MSL 2.773 m and NAVD88 1.804 m above station datum, so the
 * flat drawn sea, at mid-tide, is NAVD88 + 0.969 m; as the Alcatraz step). Each tile is deflated and base64'd in the JSON
 * (the page is one file). Size, printed at the end: per km² at 12.5 m cells; for the 3 m source it would be 15 times the
 * cells (222 KB a km² raw Int16).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
const DATUM = 0.969, LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = MLAT * Math.cos(LAT0 * Math.PI / 180);
const TILE = 1000, CELL = 12.5, N = TILE / CELL, ATLAS = 1024; // (the renderer's atlas: 1024 cells a side, 12.8 km)
const OUT = new URL('../src/render/data/bathy.json', import.meta.url);

// ---- UTM 10N forward (Snyder 8-9 to 8-13, GRS80), as make-cityfront.mjs
function utm(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), p = lat * Math.PI / 180, l = (lon + 123) * Math.PI / 180;
  const s = Math.sin(p), c = Math.cos(p), Nn = a / Math.sqrt(1 - e2 * s * s), T = (s / c) ** 2, C = ep2 * c * c, A = l * c;
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - 35 * e2 ** 3 / 3072 * Math.sin(6 * p));
  return [500000 + k0 * Nn * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120),
    k0 * (M + Nn * (s / c) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))];
}

// ---- a one-row-strip, uncompressed float32 GeoTIFF (what QGIS writes with no creation options)
async function openStrips(path) {
  const d = await readFile(path), le = d.toString('latin1', 0, 2) === 'II';
  if (!le) throw new Error('little-endian TIFFs only');
  const u16 = o => d.readUInt16LE(o), u32 = o => d.readUInt32LE(o), tags = {};
  const ifd = u32(4), n = u16(ifd);
  const sz = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8 };
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12, tag = u16(o), typ = u16(o + 2), cnt = u32(o + 4), bytes = (sz[typ] || 1) * cnt, at = bytes <= 4 ? o + 8 : u32(o + 8);
    tags[tag] = { typ, cnt, at };
  }
  const val = (t, i = 0) => { const g = tags[t], o = g.at + i * (sz[g.typ] || 1); return g.typ === 3 ? u16(o) : g.typ === 4 ? u32(o) : g.typ === 12 ? d.readDoubleLE(o) : d[o]; };
  if (val(258) !== 32 || val(339) !== 3 || val(259) !== 1 || tags[273] === undefined || val(278) !== 1) throw new Error(`${path}: only uncompressed float32 one-row strips are read`);
  const w = val(256), h = val(257), E0 = val(33922, 3), N0 = val(33922, 4), px = val(33550, 0), nod = tags[42113] ? parseFloat(d.toString('latin1', tags[42113].at, tags[42113].at + tags[42113].cnt - 1)) : -3.4028234663852886e38;
  const rows = []; for (let r = 0; r < h; r++) rows.push(u32(tags[273].at + 4 * r));
  const at = (c, r) => { if (c < 0 || r < 0 || c >= w || r >= h) return null; const v = d.readFloatLE(rows[r] + 4 * c); return v > -1e30 && v !== nod ? v : null; };
  return { w, h, E0, N0, px, at, name: path };
}

// ---- tiles
const src = []; for (const a of process.argv.slice(2)) src.push(await openStrips(a));
if (!src.length) throw new Error('give a .tif');
const out = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : { tiles: [] };
const have = new Map(out.tiles.map(t => [`${t.ix},${t.iy}`, t]));
// sim extent of every source: corners to sim metres
const simOf = (E, Nn) => { // (UTM → sim by Newton on the forward: two steps from the linear guess)
  let lat = LAT0 + (Nn - utm(LAT0, LON0)[1]) / MLAT, lon = LON0 + (E - utm(LAT0, LON0)[0]) / MLON;
  for (let i = 0; i < 3; i++) { const [e, n] = utm(lat, lon), [e2] = utm(lat, lon + 1e-5), [, n2] = utm(lat + 1e-5, lon); lon += (E - e) / ((e2 - e) / 1e-5); lat += (Nn - n) / ((n2 - n) / 1e-5); }
  return [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
};
let added = 0, cellsKnown = 0;
for (const s of src) {
  const cs = [[s.E0, s.N0], [s.E0 + s.w * s.px, s.N0], [s.E0, s.N0 - s.h * s.px], [s.E0 + s.w * s.px, s.N0 - s.h * s.px]].map(([E, Nn]) => simOf(E, Nn));
  const xs = cs.map(p => p[0]), ys = cs.map(p => p[1]);
  for (let ix = Math.floor(Math.min(...xs) / TILE); ix <= Math.floor(Math.max(...xs) / TILE); ix++) for (let iy = Math.floor(Math.min(...ys) / TILE); iy <= Math.floor(Math.max(...ys) / TILE); iy++) {
    const old = have.get(`${ix},${iy}`), prev = old ? (b => new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)))(inflateSync(Buffer.from(old.b64, 'base64'))) : null;
    const cells = prev ?? new Int16Array(N * N).fill(-32768); let known = 0, any = false;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let sum = 0, cnt = 0;
      for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
        const x = ix * TILE + (i + (a + 0.5) / 4) * CELL, y = iy * TILE + (j + (b + 0.5) / 4) * CELL;
        const [E, Nn] = utm(LAT0 + y / MLAT, LON0 + x / MLON), v = s.at(Math.floor((E - s.E0) / s.px), Math.floor((s.N0 - Nn) / s.px));
        if (v !== null) { sum += v; cnt++; }
      }
      if (cnt >= 8) { cells[j * N + i] = Math.max(-32767, Math.min(32767, Math.round((sum / cnt - DATUM) * 100))); known++; any = true; }
    }
    if (!any) continue;
    have.set(`${ix},${iy}`, { ix, iy, b64: deflateSync(Buffer.from(cells.buffer), { level: 9 }).toString('base64') }); added++; cellsKnown += known;
  }
  console.log(`${s.name}: ${s.w} × ${s.h} at ${s.px} m`);
}
const tiles = [...have.values()].sort((a, b) => a.ix - b.ix || a.iy - b.iy);
const ix0 = Math.min(...tiles.map(t => t.ix)), iy0 = Math.min(...tiles.map(t => t.iy));
if (Math.max(...tiles.map(t => t.ix)) - ix0 >= ATLAS / N || Math.max(...tiles.map(t => t.iy)) - iy0 >= ATLAS / N) throw new Error(`the tiles span more than the renderer's ${ATLAS * CELL / 1000} km atlas`);
const json = {
  source: 'USGS 1 m Central San Francisco Bay bathymetry DEM (public domain), cropped and resampled to 3 m by the owner (EPSG:6339); scripts/make-bathy.mjs',
  datum: 'metres above NAVD88, negative under water; stored as scene metres (NAVD88 less 0.969 m) in cm, Int16, -32768 unknown',
  tile: TILE, cell: CELL, n: N, origin: [ix0 * TILE, iy0 * TILE], tiles,
};
await writeFile(OUT, JSON.stringify(json));
const bytes = tiles.reduce((a, t) => a + t.b64.length, 0);
console.log(`${tiles.length} tiles (${added} made now, ${cellsKnown} cells known): ${(bytes / 1024).toFixed(0)} KB base64 in all, ${(bytes / tiles.length / 1024).toFixed(1)} KB a tile; the file is ${(bytes / 1024 / (tiles.length)).toFixed(1)} KB per km² of tile at ${CELL} m cells (${(N * N * 2 / 1024).toFixed(1)} KB raw)`);
