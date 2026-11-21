#!/usr/bin/env node
/**
 * The Palace of Fine Arts from OSM and the lidar (r296): the rotunda complex (OSM way 288371295, building=temple, 48 m),
 * the two curved colonnades and their end pavilions (ways 288371306, 288371310, 288371313, 288371314: building=roof, 19 to 21 m)
 * (© OpenStreetMap contributors); the dome's profile, the ring's heights and the lagoon from the USGS 3DEP lidar
 * (CA_SanFrancisco_1_B23, flown 2023-04-20; public domain): the rotunda's profile is the highest return in each metre of
 * radius round its centre (a lathe turns it), the ring and colonnade heights are high percentiles of the returns inside
 * each outline, and the lagoon is the lidar's water-class cells (class 9) as a grid of rows. Heights are scene metres (NAVD88 less 0.969 m).
 * Writes src/render/data/palace.json for render/palace.ts.
 *
 *   node scripts/make-palace.mjs [--cache <dir>]
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createLazPerf } = require('laz-perf');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('--cache', null); if (CACHE) await mkdir(CACHE, { recursive: true });
const EPT = 'https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23', DATUM = 0.969;
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const sim = (lat, lon) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
const merc = (lat, lon) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];
const K = 1 / Math.cos(37.8030 * Math.PI / 180);
const unmerc = (x, y) => [(2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI, x / 20037508.342789244 * 180];
const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
const IDS = { 288371295: 'rotunda', 288371306: 'colonnade south', 288371310: 'colonnade north', 288371313: 'pavilion north', 288371314: 'pavilion south' };

const parts = [];
for (const id of Object.keys(IDS)) {
  const w = await (await fetch(`https://api.openstreetmap.org/api/0.6/way/${id}/full.json`)).json();
  const nd = new Map(w.elements.filter(e => e.type === 'node').map(n => [n.id, n]));
  const way = w.elements.find(e => e.type === 'way'), ring = way.nodes.map(i => [nd.get(i).lat, nd.get(i).lon]).slice(0, -1);
  parts.push({ id: +id, name: IDS[id], osmHeight: parseFloat(way.tags?.height), ring, m: ring.map(([a, b]) => merc(a, b)), z: [], cells: new Map() });
}
const all = parts.flatMap(p => p.m);
const x0 = Math.min(...all.map(p => p[0])) - 25 * K, x1 = Math.max(...all.map(p => p[0])) + 25 * K, y0 = Math.min(...all.map(p => p[1])) - 25 * K, y1 = Math.max(...all.map(p => p[1])) + 25 * K;
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const rot = parts[0], rc = rot.m.reduce((a, p) => [a[0] + p[0] / rot.m.length, a[1] + p[1] / rot.m.length], [0, 0]); // the rotunda complex's centre (Web Mercator)
const prof = new Map(), water = new Map(), waterZ = [], gz = []; // (radius m → highest; 4 m cell → count)

const ept = await (await fetch(`${EPT}/ept.json`)).json(), [bx0, by0, , bx1] = ept.bounds, size = bx1 - bx0, nodes = [];
const walk = async key => {
  const h = await (await fetch(`${EPT}/ept-hierarchy/${key}.json`)).json();
  for (const [k, n] of Object.entries(h)) {
    const [d, x, y] = k.split('-').map(Number), s = size / 2 ** d, nx = bx0 + x * s, ny = by0 + y * s;
    if (nx > x1 || nx + s < x0 || ny > y1 || ny + s < y0) continue;
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
let used = 0;
const decode = buf => {
  const sc = [buf.readDoubleLE(131), buf.readDoubleLE(139), buf.readDoubleLE(147)], of = [buf.readDoubleLE(155), buf.readDoubleLE(163), buf.readDoubleLE(171)];
  const ptr = lp._malloc(buf.length); lp.HEAPU8.set(buf, ptr);
  const z = new lp.LASZip(); z.open(ptr, buf.length);
  if (z.getPointFormat() !== 1) throw new Error(`point format ${z.getPointFormat()}`);
  const n = z.getCount(), rec = lp._malloc(z.getPointLength());
  for (let i = 0; i < n; i++) {
    z.getPoint(rec); const dv = new DataView(lp.HEAPU8.buffer, rec, 29), c = dv.getUint8(15) & 31;
    const x = dv.getInt32(0, true) * sc[0] + of[0], y = dv.getInt32(4, true) * sc[1] + of[1];
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const h = dv.getInt32(8, true) * sc[2] + of[2];
    if (c === 9) { const k = `${Math.floor(x / (4 * K))},${Math.floor(y / (4 * K))}`; water.set(k, (water.get(k) || 0) + 1); waterZ.push(h); used++; continue; }
    if (c !== 1 && c !== 2) continue;
    used++;
    if (c === 2 && Math.hypot(x - rc[0], y - rc[1]) < 60 * K) gz.push(h);
    if (c === 1) {
      const r = Math.floor(Math.hypot(x - rc[0], y - rc[1]) / K); if (r < 40) prof.set(r, Math.max(prof.get(r) ?? -1e9, h));
      for (const p of parts) { if (x < p.box?.[0] || x > p.box?.[2] || y < p.box?.[1] || y > p.box?.[3]) continue; if (inside(p.m, x, y)) { p.z.push(h); break; } }
    }
  }
  z.delete(); lp._free(ptr); lp._free(rec);
};
for (const p of parts) p.box = [Math.min(...p.m.map(q => q[0])), Math.min(...p.m.map(q => q[1])), Math.max(...p.m.map(q => q[0])), Math.max(...p.m.map(q => q[1]))];
for (const k of nodes) decode(await getNode(k));
console.log(`${nodes.length} nodes, ${used} points used`);

const pct = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const out = { source: 'OpenStreetMap ways 288371295, 288371306, 288371310, 288371313, 288371314 (© OpenStreetMap contributors) and USGS 3DEP lidar CA_SanFrancisco_1_B23 (flown 2023-04-20; public domain); scripts/make-palace.mjs', datum: 'scene metres = NAVD88 less 0.969 m', parts: [] };
for (const p of parts) {
  const ground = 0; // (the lagoon's rim and the park are near sea level: the heights below are above the ground the outline stands on)
  out.parts.push({ id: p.id, name: p.name, osmHeight: p.osmHeight, lidarTop: p.z.length > 30 ? r1(pct(p.z, 0.9) - DATUM) : null, lidarMax: p.z.length > 30 ? r1(pct(p.z, 0.995) - DATUM) : null, ring: p.ring.map(([a, b]) => sim(a, b).map(r2)) });
  console.log(`${p.name.padEnd(16)} OSM ${p.osmHeight} m, ${p.z.length} returns, lidar p90 ${p.z.length > 30 ? r1(pct(p.z, 0.9) - DATUM) : '-'} p99.5 ${p.z.length > 30 ? r1(pct(p.z, 0.995) - DATUM) : '-'} (scene m)`);
}
const [rlat, rlon] = unmerc(rc[0], rc[1]); out.centre = sim(rlat, rlon).map(r2);
out.profile = [...prof.entries()].sort((a, b) => a[0] - b[0]).map(([r, h]) => [r + 0.5, r2(h - DATUM)]); // (radius m, highest return, scene m)
// the lagoon: 4 m cells with 3 or more water returns, as rows of runs (sim metres): [y, x0, x1]; the water returns are sparse
// (dark water gives few), so a gap of 12 m or less along a row is closed, and the renderer draws each row 8 m deep (a row and its neighbors)
const rows = new Map();
for (const [k, n] of water) { if (n < 3) continue; const [i, j] = k.split(',').map(Number), [lat, lon] = unmerc((i + 0.5) * 4 * K, (j + 0.5) * 4 * K), [x, y] = sim(lat, lon); const row = Math.round(y / 4); if (!rows.has(row)) rows.set(row, []); rows.get(row).push(x); }
out.lagoon = { cell: 4, level: r2(pct(waterZ, 0.5) - DATUM), runs: [] }; out.ground = r2(pct(gz, 0.1) - DATUM); // (the park's low ground round the rotunda, 10th percentile)
for (const [row, xs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) { xs.sort((a, b) => a - b); let s = xs[0], e = xs[0]; for (const x of xs.slice(1)) { if (x - e > 12) { out.lagoon.runs.push([row * 4, r1(s - 2), r1(e + 2)]); s = x; } e = x; } out.lagoon.runs.push([row * 4, r1(s - 2), r1(e + 2)]); }
console.log(`rotunda centre ${out.centre}; profile (r:h) ${out.profile.slice(0, 40).map(([r, h]) => `${r}:${h}`).join(' ')}; lagoon ${out.lagoon.runs.length} runs, ${water.size} water cells`);
await writeFile(new URL('../src/render/data/palace.json', import.meta.url), JSON.stringify(out) + '\n');
