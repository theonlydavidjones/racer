#!/usr/bin/env node
/**
 * Alcatraz's building heights (r295) from the USGS 3DEP lidar (CA_SanFrancisco_1_B23, flown 2023-04-20; public domain), read
 * from its Entwine Point Tile data on AWS with laz-perf (a devDependency: this script only, never the page).
 *
 *   node scripts/make-alcatraz-heights.mjs x55y419.tif [--cache dir]
 *
 * For each footprint in src/render/data/alcatraz-buildings.json (and the cellhouse's, lighthouse's and water tower's
 * dimensioned ones) the points that are not ground (the project classes roofs 1, "unclassified"; there is no building class)
 * inside it give the roof: the 90th percentile of their heights for a flat-topped mass (the max would catch antennas, vents
 * and birds). A thin tall thing (chimney, lighthouse, water tower) is found in a 15–25 m window round OSM's centre, which can be 15 m off: its top is the
 * 99.9th percentile of the heights there, its place the middle of the points within 2 m of it. Height = that less the mean of the DEM's
 * bare-earth ground under the footprint, both NAVD88 (the lidar's vertical datum is NAVD88 Geoid18, as the DEM's), which
 * is how render/alcatrazBuildings.ts stands the mass on the ground. Written back into the buildings file as `lidar`.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { openGeoTiff } from './lib/geotiff-f32.mjs';
const { createLazPerf } = createRequire(import.meta.url)('laz-perf');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('--cache', ''); if (CACHE) await mkdir(CACHE, { recursive: true });
const FILE = new URL('../src/render/data/alcatraz-buildings.json', import.meta.url), B = JSON.parse(await readFile(FILE, 'utf8'));
const ALC = JSON.parse(await readFile(new URL('../src/render/data/alcatraz.json', import.meta.url), 'utf8')).place;
const EPT = 'https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23';

// ---- footprints, in web mercator (the lidar's X, Y) and in the DEM's grid
const merc = (lat, lon) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = MLAT * Math.cos(LAT0 * Math.PI / 180), det = ALC.exx * ALC.nxy - ALC.nxx * ALC.exy;
const grid = (lat, lon) => { const dx = (lon - LON0) * MLON - ALC.ox, dy = (lat - LAT0) * MLAT - ALC.oy; return [(dx * ALC.nxy - ALC.nxx * dy) / det - 0.5, 1000 - (ALC.exx * dy - ALC.exy * dx) / det - 0.5]; };
const around = (at, r, n = 12) => Array.from({ length: n }, (_, i) => [at[0] + r * Math.cos(i / n * 6.2832) / MLAT, at[1] + r * Math.sin(i / n * 6.2832) / (MLAT * Math.cos(at[0] * Math.PI / 180))]);
const rect = (c, bearing, w, d) => { // corners of a w × d rectangle (d along the bearing) about a centre
  const b = bearing * Math.PI / 180, out = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const a = u * w / 2, l = v * d / 2, e = a * Math.cos(b) + l * Math.sin(b), n = -a * Math.sin(b) + l * Math.cos(b); out.push([c[0] + n / MLAT, c[1] + e / (MLAT * Math.cos(c[0] * Math.PI / 180))]); }
  return out;
};
const CHIMNEY = 1056707165, centroid = r => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
const items = [
  ...B.buildings.map(b => ({ key: String(b.osm), name: b.name || String(b.osm), ring: b.osm === CHIMNEY ? around(centroid(b.ring), 15) : b.ring, thin: b.osm === CHIMNEY, tag: b })),
  { key: 'cellhouse', name: 'cellhouse', ring: rect(B.cellhouse.at, B.cellhouse.bearing, B.cellhouse.width, B.cellhouse.length), thin: false, tag: B.cellhouse },
  { key: 'lighthouse', name: 'lighthouse', ring: around(B.lighthouse.at, 25), thin: true, tag: B.lighthouse },
  { key: 'waterTower', name: 'water tower', ring: around(B.waterTower.at, 20), thin: true, tag: B.waterTower },
];
for (const it of items) { it.m = it.ring.map(([la, lo]) => merc(la, lo)); it.g = it.ring.map(([la, lo]) => grid(la, lo)); it.z = []; it.xy = []; const xs = it.m.map(p => p[0]), ys = it.m.map(p => p[1]); it.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const all = [Math.min(...items.map(i => i.box[0])), Math.min(...items.map(i => i.box[1])), Math.max(...items.map(i => i.box[2])), Math.max(...items.map(i => i.box[3]))];

// ---- the DEM's ground under each footprint
const dem = openGeoTiff(process.argv[2]), win = dem.window(Math.round(550300 - dem.tiepoint[3]), Math.round(dem.tiepoint[4] - 4187300), 1000, 1000);
for (const it of items) {
  const gx = it.g.map(p => p[0]), gy = it.g.map(p => p[1]); let s = 0, n = 0;
  for (let j = Math.floor(Math.min(...gy)); j <= Math.ceil(Math.max(...gy)); j++) for (let i = Math.floor(Math.min(...gx)); i <= Math.ceil(Math.max(...gx)); i++)
    if (i >= 0 && j >= 0 && i < 1000 && j < 1000 && win[j * 1000 + i] > -1000 && inside(it.g, i, j)) { s += win[j * 1000 + i]; n++; }
  it.ground = n ? s / n : NaN;
}

// ---- the lidar: the EPT nodes over the island
const ept = await (await fetch(`${EPT}/ept.json`)).json(), [bx0, by0, , bx1] = ept.bounds, size = bx1 - bx0, nodes = [];
const walk = async key => {
  const h = await (await fetch(`${EPT}/ept-hierarchy/${key}.json`)).json();
  for (const [k, n] of Object.entries(h)) {
    const [d, x, y] = k.split('-').map(Number), s = size / 2 ** d, nx = bx0 + x * s, ny = by0 + y * s;
    if (nx > all[2] || nx + s < all[0] || ny > all[3] || ny + s < all[1]) continue;
    if (n === -1) await walk(k); else if (n > 0) nodes.push(k);
  }
};
await walk('0-0-0-0');
const lp = await createLazPerf();
const getNode = async k => {
  const f = CACHE && `${CACHE}/${k}.laz`; if (f && existsSync(f)) return readFile(f);
  const r = await fetch(`${EPT}/ept-data/${k}.laz`); if (!r.ok) throw new Error(`${k}: HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer()); if (f) await writeFile(f, b); return b;
};
let seen = 0, used = 0;
const decode = buf => {
  const sc = [buf.readDoubleLE(131), buf.readDoubleLE(139), buf.readDoubleLE(147)], of = [buf.readDoubleLE(155), buf.readDoubleLE(163), buf.readDoubleLE(171)];
  const ptr = lp._malloc(buf.length); lp.HEAPU8.set(buf, ptr);
  const z = new lp.LASZip(); z.open(ptr, buf.length);
  if (z.getPointFormat() !== 1) throw new Error(`point format ${z.getPointFormat()}: only format 1's layout is read`);
  const n = z.getCount(), rec = lp._malloc(z.getPointLength());
  for (let i = 0; i < n; i++) {
    z.getPoint(rec); const dv = new DataView(lp.HEAPU8.buffer, rec, 29); seen++;
    if ((dv.getUint8(15) & 31) !== 1) continue; // class 1: not ground (2), water (9) or noise (7, 18)
    const x = dv.getInt32(0, true) * sc[0] + of[0], y = dv.getInt32(4, true) * sc[1] + of[1];
    if (x < all[0] || x > all[2] || y < all[1] || y > all[3]) continue;
    for (const it of items) if (x >= it.box[0] && x <= it.box[2] && y >= it.box[1] && y <= it.box[3] && inside(it.m, x, y)) { it.z.push(dv.getInt32(8, true) * sc[2] + of[2]); it.xy.push(x, y); used++; break; }
  }
  z.delete(); lp._free(ptr); lp._free(rec);
};
for (let i = 0; i < nodes.length; i += 8) await Promise.all((await Promise.all(nodes.slice(i, i + 8).map(getNode))).map(decode));
console.log(`${nodes.length} nodes, ${seen} points read, ${used} inside a footprint`);

// ---- heights
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const unmerc = (x, y) => [(2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI, x / 20037508.342789244 * 180];
const r1 = v => Math.round(v * 10) / 10;
for (const it of items) {
  const n = it.z.length;
  if (n < 30) { console.log(`${it.name.padEnd(30)} ${String(n).padStart(6)} points: too few, kept as it was`); delete it.tag.lidar; continue; }
  if (it.thin) {
    // a tall thin structure: OSM's centre can be 15 m off, so find the top of what stands in the window (the 99.9th percentile of the heights, not the
    // max) and the middle of the points within 2 m of that; its ground is the DEM there (the mean of the cells within 2 m)
    const order = it.z.map((z, i) => i).sort((a, b) => it.z[a] - it.z[b]), top = it.z[order[Math.floor(0.999 * n)]];
    let sx = 0, sy = 0, k = 0, zs = 0;
    for (let i = 0; i < n; i++) if (it.z[i] >= top - 2) { sx += it.xy[i * 2]; sy += it.xy[i * 2 + 1]; zs = Math.max(zs, it.z[i]); k++; }
    const at = unmerc(sx / k, sy / k), [gi, gj] = grid(at[0], at[1]); let gs = 0, gn = 0;
    for (let j = Math.round(gj) - 2; j <= Math.round(gj) + 2; j++) for (let i = Math.round(gi) - 2; i <= Math.round(gi) + 2; i++) if (win[j * 1000 + i] > -1000) { gs += win[j * 1000 + i]; gn++; }
    const g = gs / gn, h = r1(top - g);
    it.tag.lidar = { n: k, at: [Math.round(at[0] * 1e6) / 1e6, Math.round(at[1] * 1e6) / 1e6], top: r1(top), ground: r1(g), height: h };
    console.log(`${it.name.padEnd(30)} top ${top.toFixed(1)} m NAVD88 at ${at[0].toFixed(5)}, ${at[1].toFixed(5)}, ground ${g.toFixed(1)} m → ${h} m tall (${k} points near the top)`);
    continue;
  }
  const z = it.z.sort((a, b) => a - b), roof = pct(z, 0.9), h = r1(roof - it.ground);
  it.tag.lidar = { n, p50: r1(pct(z, 0.5) - it.ground), p90: r1(roof - it.ground), p98: r1(pct(z, 0.98) - it.ground), max: r1(z[n - 1] - it.ground), height: h };
  console.log(`${it.name.padEnd(30)} ${String(n).padStart(6)} points, ground ${it.ground.toFixed(1)} m, p50 ${it.tag.lidar.p50} p90 ${it.tag.lidar.p90} p98 ${it.tag.lidar.p98} max ${it.tag.lidar.max} → ${h} m`);
}
B.lidar = 'USGS 3DEP lidar, CA_SanFrancisco_1_B23 (flown 2023-04-20; public domain), EPT on AWS: the non-ground points inside each footprint, the 90th (98th for the chimney, lighthouse and water tower) percentile height less the DEM ground; scripts/make-alcatraz-heights.mjs';
await writeFile(FILE, JSON.stringify(B) + '\n');
