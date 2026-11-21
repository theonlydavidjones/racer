#!/usr/bin/env node
/**
 * Oracle Park's static structure from the lidar (r296): the ballpark's surface, its stands, roofs, light towers, scoreboard
 * and the arcade on McCovey Cove, as a triangle mesh of the USGS 3DEP lidar (CA_SanFrancisco_1_B23, flown 2023-04-20;
 * public domain), kept to the stadium's footprint, OpenStreetMap relation 7330762 (building=stadium, 30 m; © OpenStreetMap
 * contributors). The surface is the highest non-ground return in each 1 m cell (ground where there is none), simplified
 * with a right-triangulated irregular network (Evans et al.; as make-alcatraz.mjs); the triangles whose middle lies inside the
 * footprint (3 m wider) stay. Heights are scene metres (NAVD88 less 0.969 m). The pitch's outline (way 500283910) is kept for
 * the grass. Writes src/render/data/oracle-park.json for render/oraclePark.ts.
 *
 *   node scripts/make-oracle-park.mjs [--cache <dir>] [--error 0.6]
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const { createLazPerf } = require('laz-perf');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('--cache', null), MAXERR = +arg('--error', 0.6); if (CACHE) await mkdir(CACHE, { recursive: true });
const EPT = 'https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23', DATUM = 0.969, S = 513, T = S - 1;
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = MLAT * Math.cos(LAT0 * Math.PI / 180);
const sim = (lat, lon) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
const merc = (lat, lon) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];
const K = 1 / Math.cos(37.7786 * Math.PI / 180), r2 = v => Math.round(v * 100) / 100;
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };

const way = async id => { const w = await (await fetch(`https://api.openstreetmap.org/api/0.6/way/${id}/full.json`)).json(); const nd = new Map(w.elements.filter(e => e.type === 'node').map(n => [n.id, n])); return w.elements.find(e => e.type === 'way').nodes.map(i => [nd.get(i).lat, nd.get(i).lon]).slice(0, -1); };
const outerLL = await way(24352572), pitchLL = await way(500283910);
const outer = outerLL.map(([a, b]) => sim(a, b)), pitch = pitchLL.map(([a, b]) => sim(a, b));
const cs = outer.reduce((a, p) => [a[0] + p[0] / outer.length, a[1] + p[1] / outer.length], [0, 0]);
// the grid: 1 m cells, 513 a side, centred on the footprint; grid i east, j south; the sim's (x, y) of grid point (i, j) is (ox + i, oy + T - j)
const ox = Math.round(cs[0] - T / 2), oy = Math.round(cs[1] - T / 2);
const m0 = merc(LAT0 + oy / MLAT, LON0 + ox / MLON); // (Web Mercator of the grid's south-west corner; a similarity, to a part in 10^4 over 500 m)
const x0 = m0[0], y0 = m0[1], x1 = x0 + T * K, y1 = y0 + T * K;
const top = new Float32Array(S * S).fill(-1e9), low = new Float32Array(S * S).fill(1e9);

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
  const ptr = lp._malloc(buf.length); lp.HEAPU8.set(buf, ptr); const z = new lp.LASZip(); z.open(ptr, buf.length);
  if (z.getPointFormat() !== 1) throw new Error(`point format ${z.getPointFormat()}`);
  const n = z.getCount(), rec = lp._malloc(z.getPointLength());
  for (let i = 0; i < n; i++) {
    z.getPoint(rec); const dv = new DataView(lp.HEAPU8.buffer, rec, 29), c = dv.getUint8(15) & 31;
    if (c !== 1 && c !== 2) continue;
    const x = dv.getInt32(0, true) * sc[0] + of[0], y = dv.getInt32(4, true) * sc[1] + of[1];
    if (x < x0 || x >= x1 + K || y < y0 || y >= y1 + K) continue;
    const gi = Math.round((x - x0) / K), gj = T - Math.round((y - y0) / K), k = gj * S + gi, h = dv.getInt32(8, true) * sc[2] + of[2] - DATUM;
    if (gi < 0 || gj < 0 || gi > T || gj > T) continue;
    if (c === 1 && h > top[k]) top[k] = h; if (c === 2 && h < low[k]) low[k] = h; used++;
  }
  z.delete(); lp._free(ptr); lp._free(rec);
};
for (const k of nodes) decode(await getNode(k));
console.log(`${nodes.length} nodes, ${used} points in the ${S} × ${S} grid, footprint ${outer.length} points, centre ${cs.map(r2)}`);

// the surface: the highest non-ground return, else the ground, else the nearest of those (breadth-first over the gaps)
const G = new Float32Array(S * S).fill(NaN);
for (let k = 0; k < S * S; k++) G[k] = top[k] > -1e8 ? top[k] : low[k] < 1e8 ? low[k] : NaN;
{ const q = []; for (let k = 0; k < S * S; k++) if (!Number.isNaN(G[k])) q.push(k); const seen = new Uint8Array(S * S); q.forEach(k => seen[k] = 1);
  for (let h = 0; h < q.length; h++) { const k = q[h], i = k % S, j = (k - i) / S; for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (a < 0 || b < 0 || a >= S || b >= S) continue; const n = b * S + a; if (!seen[n]) { seen[n] = 1; G[n] = G[k]; q.push(n); } } } }

// the light towers and the tall thin things first (only those within 12 m of the footprint: the lidar's box takes in the streets round it)
const near12 = outer.map(([x, y]) => { const dx = x - cs[0], dy = y - cs[1], d = Math.hypot(dx, dy) || 1; return [x + dx / d * 12, y + dy / d * 12]; });
// the light towers and the tall thin things first (a 5 × 5 median takes them out of the surface): the local highest cells over 45 m in a 15 m window
const towers = [];
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const h = G[j * S + i]; if (h < 45) continue;
  let best = true; for (let dj = -7; dj <= 7 && best; dj++) for (let di = -7; di <= 7; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= S || b >= S) continue; const v = G[b * S + a]; if (v > h || (v === h && (b < j || (b === j && a < i)))) { best = false; break; } }
  if (best && inside(near12, ox + i, oy + T - j)) towers.push([ox + i, oy + T - j, r2(h)]);
}
towers.sort((a, b) => b[2] - a[2]); { const kept = []; for (const t of towers) if (kept.every(k => Math.hypot(k[0] - t[0], k[1] - t[1]) >= 20)) kept.push(t); towers.length = 0; towers.push(...kept); } // (one a tower: the highest of those within 20 m)
{ const H = new Float32Array(G); const R = 2; // (a 5 × 5 median: the seats' rows and the people and cars go, the stands' slopes, roofs and facades stay)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const w = []; for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const a = Math.min(T, Math.max(0, i + di)), b = Math.min(T, Math.max(0, j + dj)); w.push(H[b * S + a]); } w.sort((x, y) => x - y); G[j * S + i] = w[12]; } }

// the network (as make-alcatraz.mjs)
const nTri = T * T * 2 - 2, nPar = nTri - T * T, coords = new Uint16Array(nTri * 4);
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
// keep what is in the footprint (and 3 m round it): the triangle's middle, by a polygon grown by pushing each point 3 m from the centre
const grown = outer.map(([x, y]) => { const dx = x - cs[0], dy = y - cs[1], d = Math.hypot(dx, dy) || 1; return [x + dx / d * 3, y + dy / d * 3]; });
const vid = new Map(), VX = [], VY = [], VZ = [], idx = [];
const vert = (x, y) => { const k = y * S + x; let v = vid.get(k); if (v === undefined) { v = VX.length; vid.set(k, v); VX.push(x); VY.push(y); VZ.push(Math.round(G[k] * 100)); } return v; };
for (const [ax, ay, bx, by, cx, cy] of tris) {
  const mxs = ox + (ax + bx + cx) / 3, mys = oy + T - (ay + by + cy) / 3;
  if (!inside(grown, mxs, mys)) continue;
  if (Math.max(G[ay * S + ax], G[by * S + bx], G[cy * S + cx]) < -0.3) continue; // (wholly under water)
  const a = vert(ax, ay), b = vert(bx, by), c = vert(cx, cy), cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  idx.push(...(cross > 0 ? [a, c, b] : [a, b, c]));
}
const nV = VX.length, nT = idx.length / 3, buf = Buffer.alloc(nV * 6 + idx.length * 2); let o = 0;
for (const v of VX) { buf.writeUInt16LE(v, o); o += 2; } for (const v of VY) { buf.writeUInt16LE(v, o); o += 2; } for (const v of VZ) { buf.writeInt16LE(v, o); o += 2; }
let last = 0; for (const v of idx) { const d = v - last, z = d < 0 ? -2 * d - 1 : 2 * d; buf.writeUInt16LE(z, o); o += 2; last = v; }
const packed = deflateSync(buf, { level: 9 });
await writeFile(new URL('../src/render/data/oracle-park.json', import.meta.url), JSON.stringify({
  source: 'USGS 3DEP lidar CA_SanFrancisco_1_B23 (flown 2023-04-20; public domain) kept to OpenStreetMap relation 7330762 (building=stadium; © OpenStreetMap contributors); scripts/make-oracle-park.mjs',
  datum: 'scene metres = NAVD88 less 0.969 m; grid x east, y south, 1 m cells; sim (x, y) = (ox + i, oy + 512 - j)', ox, oy, error: MAXERR, vertices: nV, triangles: nT, pitch: pitch.map(p => p.map(r2)), towers, mesh: packed.toString('base64'),
}) + '\n');
let hmax = -1e9, hp = [0, 0]; for (let k = 0; k < S * S; k++) if (G[k] > hmax) { hmax = G[k]; hp = [k % S, (k / S) | 0]; }
console.log(`towers (x, y, top): ${JSON.stringify(towers)}`);
console.log(`${nV} vertices, ${nT} triangles (error ${MAXERR} m): ${(buf.length / 1024).toFixed(0)} KB packed, ${(packed.length * 4 / 3 / 1024).toFixed(0)} KB base64; highest ${r2(hmax)} m at sim (${ox + hp[0]}, ${oy + T - hp[1]})`);
