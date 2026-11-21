#!/usr/bin/env node
/**
 * Alcatraz's terrain (r254) from the USGS 3DEP 1 m lidar DEM (public domain), in place of the 50 m cells' lump.
 *
 *   curl -o x55y419.tif https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_SanFrancisco_B23/TIFF/USGS_1M_10_x55y419_CA_SanFrancisco_B23.tif
 *   node scripts/make-alcatraz.mjs x55y419.tif [--error 0.35] [--relief relief.png]
 *
 * The DEM (CA_SanFrancisco_B23, lidar of 2023-04-20, bare earth, NAD83 / UTM 10N, heights NAVD88 m) is cropped to UTM 10N
 * E 550,300–551,300, N 4,186,300–4,187,300. The sim draws its water as one flat plane at mid-tide, and NOAA's datums for
 * San Francisco (9414290, CO-OPS metadata API) put mean sea level 0.969 m above NAVD88 (MSL 2.773, NAVD88 1.804 m above
 * station datum; MLLW is 1.822, so NAVD88 is about MLLW here): so a height in the scene is its NAVD88 height less 0.969 m.
 * Water in the DEM is nodata (and a hydro-flattened belt at the shore): under it the surface is ramped down from the
 * shore to −6 m, hidden by the water, since no bathymetry here is public at 1 m.
 *
 * The surface is simplified with a right-triangulated irregular network (Evans et al.; the method of Mapbox's martini): split
 * a triangle only where its midpoint's height is off by more than --error meters, so the cliffs (steps of up to 10 m in
 * a few cells) keep their detail and the flat ground and the sea floor drop to a few big triangles. Triangles wholly under
 * water are dropped. Output src/render/data/alcatraz.json: the mesh (vertices on the 1 m grid, heights in cm, indices),
 * packed little-endian, deflated, as base64, and the grid's place in the sim's course coordinates.
 */
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { openGeoTiff } from './lib/geotiff-f32.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dem = openGeoTiff(process.argv[2]);
const MAXERR = +arg('--error', 0.5), RELIEF = arg('--relief', ''), MSL_NAVD88 = 0.969;
const E0 = 550300, N1 = 4187300, W = 1000, X0 = Math.round(E0 - dem.tiepoint[3]), Y0 = Math.round(dem.tiepoint[4] - N1);
const raw = dem.window(X0, Y0, W, W), NOD = dem.nodata;

// ---- the surface: heights above the drawn water, the sea floor ramped from the shore
const S = 1025, G = new Float32Array(S * S).fill(NaN); // (the network wants 2^n + 1 samples a side; the extra 25 are sea)
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const v = raw[j * W + i]; if (v !== NOD && v > -1000) G[j * S + i] = v - MSL_NAVD88; }
{ // nearest valid sample and its distance, spread out from the land over the nodata (a breadth-first sweep on the 8-neighbors)
  const near = new Float32Array(S * S), dist = new Float32Array(S * S).fill(-1), q = [];
  for (let k = 0; k < S * S; k++) if (!Number.isNaN(G[k])) { near[k] = G[k]; dist[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % S, j = (k - i) / S;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= S || b >= S) continue;
      const n = b * S + a, d = dist[k] + (di && dj ? 1.414 : 1);
      if (dist[n] < 0 || d < dist[n] - 1e-3 && Number.isNaN(G[n])) { if (dist[n] < 0) q.push(n); dist[n] = d; near[n] = near[k]; }
    }
  }
  for (let k = 0; k < S * S; k++) if (Number.isNaN(G[k])) G[k] = Math.max(-6, Math.min(near[k], -0.4) - 0.35 * dist[k]);
}

// ---- the network
const T = S - 1, nTri = T * T * 2 - 2, nPar = nTri - T * T, coords = new Uint16Array(nTri * 4);
for (let i = 0; i < nTri; i++) {
  let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
  if (id & 1) bx = by = cx = T; else ax = ay = cy = T;
  while ((id >>= 1) > 1) { const mx = (ax + bx) >> 1, my = (ay + by) >> 1; if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; } cx = mx; cy = my; }
  coords.set([ax, ay, bx, by], i * 4);
}
const err = new Float32Array(S * S);
for (let i = nTri - 1; i >= 0; i--) {
  const ax = coords[i * 4], ay = coords[i * 4 + 1], bx = coords[i * 4 + 2], by = coords[i * 4 + 3], mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx;
  const mid = my * S + mx; err[mid] = Math.max(err[mid], Math.abs((G[ay * S + ax] + G[by * S + bx]) / 2 - G[mid]));
  if (i < nPar) err[mid] = Math.max(err[mid], err[((ay + cy) >> 1) * S + ((ax + cx) >> 1)], err[((by + cy) >> 1) * S + ((bx + cx) >> 1)]);
}
const tris = [];
const go = (ax, ay, bx, by, cx, cy) => {
  const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
  if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && err[my * S + mx] > MAXERR) { go(cx, cy, ax, ay, mx, my); go(bx, by, cx, cy, mx, my); } else tris.push([ax, ay, bx, by, cx, cy]);
};
go(0, 0, T, T, T, 0); go(T, T, 0, 0, 0, T);
// the triangles above (or crossing) the water; their vertices once each
const vid = new Map(), VX = [], VY = [], VZ = [], idx = [];
const vert = (x, y) => { const k = y * S + x; let v = vid.get(k); if (v === undefined) { v = VX.length; vid.set(k, v); VX.push(x); VY.push(y); VZ.push(Math.round(G[k] * 100)); } return v; };
for (const [ax, ay, bx, by, cx, cy] of tris) {
  if (Math.max(G[ay * S + ax], G[by * S + bx], G[cy * S + cx]) < -0.3) continue; // wholly under water: hidden
  // wound counter-clockwise seen from above (grid y is south, three.js z too: x then z is clockwise on the page, so the grid cross product is positive for the front face when the order is a, c, b)
  const a = vert(ax, ay), b = vert(bx, by), c = vert(cx, cy), cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  idx.push(...(cross > 0 ? [a, c, b] : [a, b, c]));
}

// ---- pack: x, y (uint16), height (int16, cm), then indices (uint16, as the step from the last index, zigzag), deflated
const nV = VX.length, nT = idx.length / 3, buf = Buffer.alloc(nV * 6 + idx.length * 2);
let o = 0;
for (const v of VX) { buf.writeUInt16LE(v, o); o += 2; } for (const v of VY) { buf.writeUInt16LE(v, o); o += 2; } for (const v of VZ) { buf.writeInt16LE(v, o); o += 2; }
let last = 0; for (const v of idx) { const d = v - last, z = d < 0 ? -2 * d - 1 : 2 * d; buf.writeUInt16LE(z, o); o += 2; last = v; }
const packed = deflateSync(buf, { level: 9 });

// ---- where the grid sits in the sim's course coordinates (x east, y north from LAT0/LON0, geo/geo.ts)
function utmToLL(E, N) { // NAD83 / UTM 10N → lat, lon (deg): the standard transverse Mercator series (Snyder 8-17..8-18), GRS80
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), x = E - 500000;
  const mu = (N / k0) / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), C1 = ep2 * c * c, T1 = (s / c) ** 2, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * s / c / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = -123 * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
  return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const sim = (E, N) => { const [la, lo] = utmToLL(E, N); return [(lo - LON0) * MLON, (la - LAT0) * MLAT]; };
const [ox, oy] = sim(E0, 4186300), [ex, ey] = sim(E0 + 1000, 4186300), [nx, ny] = sim(E0, 4187300);
const r3 = v => Math.round(v * 1000) / 1000;
const out = {
  source: 'USGS 3DEP 1 m DEM, project CA_SanFrancisco_B23, tile x55y419 (lidar of 2023-04-20; public domain), cropped to UTM 10N E 550,300–551,300, N 4,186,300–4,187,300.',
  made: 'scripts/make-alcatraz.mjs', fetched: '2026-11-20',
  datum: 'heights are NAVD88 m less 0.969 m (San Francisco 9414290: MSL 2.773 m, NAVD88 1.804 m above station datum), so 0 is the sim\'s flat water plane (mean sea level)',
  maxError: MAXERR, grid: S, cell: 1,
  // sim course coordinates (m) of grid vertex (i, j): x = ox + e·exx + n·nxx, y = oy + e·exy + n·nxy, with e = i + 0.5 m east of E0 and n = 1000 − (j + 0.5) m north of N0
  place: { ox: r3(ox), oy: r3(oy), exx: r3((ex - ox) / 1000), exy: r3((ey - oy) / 1000), nxx: r3((nx - ox) / 1000), nxy: r3((ny - oy) / 1000) },
  vertices: nV, triangles: nT, mesh: packed.toString('base64'),
};
await writeFile(new URL('../src/render/data/alcatraz.json', import.meta.url), JSON.stringify(out) + '\n');
const peak = (() => { let b = -1e9, k = 0; for (let q = 0; q < W * W; q++) { const v = G[(q / W | 0) * S + q % W]; if (v > b) { b = v; k = q; } } return [b, k % W, k / W | 0]; })();
console.log(`${nT} triangles, ${nV} vertices (error ${MAXERR} m), ${(packed.length / 1024).toFixed(1)} KB deflated, ${(packed.length * 4 / 3 / 1024).toFixed(1)} KB as base64; peak ${peak[0].toFixed(2)} m at column ${peak[1]} row ${peak[2]}`);
const [pla, plo] = utmToLL(E0 + peak[1] + 0.5, N1 - peak[2] - 0.5);
console.log(`peak at ${pla.toFixed(5)}, ${plo.toFixed(5)} (OSM's peak node: 37.82653, -122.42261)`);

// ---- a shaded-relief picture of the crop, to look at before any mesh (--relief file.png): colored by height, lit from the north-west
if (RELIEF) {
  const sc = 2, w = W * sc, rgb = Buffer.alloc(w * w * 3), hs = (x, y) => G[Math.max(0, Math.min(W - 1, y)) * S + Math.max(0, Math.min(W - 1, x))];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const gx = Math.floor(x / sc), gy = Math.floor(y / sc), h = hs(gx, gy);
    const dzdx = (hs(gx + 1, gy) - hs(gx - 1, gy)) / 2, dzdy = (hs(gx, gy + 1) - hs(gx, gy - 1)) / 2; // (grid y is south)
    const shade = Math.max(0, Math.min(1.4, (0.55 + (-dzdx * 0.5 + dzdy * 0.5 - 0) * 0.18) * 1)) * 1;
    let r, g, b;
    if (h < -0.3) { const d = Math.min(1, -h / 6); r = 40 - 20 * d; g = 90 - 30 * d; b = 140 - 30 * d; } else { const t = Math.min(1, Math.max(0, h) / 41); r = 120 + 110 * t; g = 130 + 90 * t; b = 85 + 110 * t; r *= shade; g *= shade; b *= shade; }
    rgb[(y * w + x) * 3] = Math.min(255, r); rgb[(y * w + x) * 3 + 1] = Math.min(255, g); rgb[(y * w + x) * 3 + 2] = Math.min(255, b);
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const tb = Buffer.from(t, 'ascii'), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(Buffer.concat([tb, d]))); return Buffer.concat([l, tb, d, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(w, 4); ih[8] = 8; ih[9] = 2;
  const rows = Buffer.alloc(w * (w * 3 + 1)); for (let y = 0; y < w; y++) rgb.copy(rows, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  await writeFile(RELIEF, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
  console.log('relief →', RELIEF);
}
