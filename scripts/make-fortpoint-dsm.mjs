#!/usr/bin/env node
/**
 * Fort Point's surface from the lidar (r296 phase 1b): the highest return in each 0.5 m cell over the fort and its yard,
 * and the lowest ground return, from USGS 3DEP lidar CA_SanFrancisco_1_B23 (flown 2023-04-20; public domain), EPT on AWS.
 * The fort's outline is OSM way 370509217 (© OpenStreetMap contributors). Writes a grid for make-fortpoint.mjs to read.
 *
 *   node scripts/make-fortpoint-dsm.mjs <out.json> [--cache <dir>]
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createLazPerf } = require('laz-perf');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = process.argv[2], CACHE = arg('--cache', null); if (CACHE) await mkdir(CACHE, { recursive: true });
const EPT = 'https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23';
const merc = (lat, lon) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];
const CELL = 0.5, PAD = 25; // metres (Web Mercator metres, 1.27 long here: the cell is 0.39 m on the ground)

const way = await (await fetch('https://api.openstreetmap.org/api/0.6/way/370509217/full.json')).json();
const nd = new Map(way.elements.filter(e => e.type === 'node').map(n => [n.id, n]));
const ring = way.elements.find(e => e.type === 'way').nodes.map(i => [nd.get(i).lat, nd.get(i).lon]);
const m = ring.map(([a, b]) => merc(a, b));
const x0 = Math.min(...m.map(p => p[0])) - PAD, x1 = Math.max(...m.map(p => p[0])) + PAD, y0 = Math.min(...m.map(p => p[1])) - PAD, y1 = Math.max(...m.map(p => p[1])) + PAD;
const NX = Math.ceil((x1 - x0) / CELL), NY = Math.ceil((y1 - y0) / CELL);
const top = new Float32Array(NX * NY).fill(-1e9), low = new Float32Array(NX * NY).fill(1e9), cnt = new Uint16Array(NX * NY);

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
    if (c !== 1 && c !== 2) continue; // not ground (1) or ground (2): not water, noise
    const x = dv.getInt32(0, true) * sc[0] + of[0], y = dv.getInt32(4, true) * sc[1] + of[1];
    if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
    const k = Math.floor((y1 - y) / CELL) * NX + Math.floor((x - x0) / CELL), h = dv.getInt32(8, true) * sc[2] + of[2];
    if (c === 1 && h > top[k]) top[k] = h; if (c === 2 && h < low[k]) low[k] = h; cnt[k]++; used++;
  }
  z.delete(); lp._free(ptr); lp._free(rec);
};
for (const k of nodes) decode(await getNode(k));
console.log(`${nodes.length} nodes, ${used} points in the ${NX} × ${NY} grid`);
const q = a => Array.from(a, v => Math.abs(v) > 1e8 ? null : Math.round(v * 100) / 100);
await writeFile(OUT, JSON.stringify({ x0, y1, cell: CELL, nx: NX, ny: NY, ring, top: q(top), low: q(low) }));
