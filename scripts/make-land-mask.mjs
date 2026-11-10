#!/usr/bin/env node
/**
 * Make the land mask the wave model measures fetch against (open water upwind), from the terrain height map
 * (src/render/data/terrain.png, made by fetch-terrain.mjs): 100 m cells, land where any of the four 50 m
 * samples is above water. Rows run north to south, run-length encoded (alternating water and land counts,
 * starting with water). Also a 50 m mask (every terrain sample) for running aground beyond the Cityfront
 * (src/geo/data/shore-mask.json). No network.
 *
 *   node scripts/make-land-mask.mjs
 */
import { inflateSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';

const meta = JSON.parse(await readFile(new URL('../src/render/data/terrain.json', import.meta.url), 'utf8'));
const buf = await readFile(new URL('../src/render/data/terrain.png', import.meta.url));
// minimal PNG decoder for the 8-bit greyscale image we write ourselves
let p = 8, w = 0, h = 0; const idat = [];
while (p < buf.length) {
  const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
  if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[9] !== 0) throw new Error('expected 8-bit greyscale'); }
  else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
  p += 12 + len;
}
const raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(w * h);
for (let y = 0; y < h; y++) {
  const f = raw[y * (w + 1)];
  for (let x = 0; x < w; x++) {
    const a = x ? px[y * w + x - 1] : 0, b = y ? px[(y - 1) * w + x] : 0, c = x && y ? px[(y - 1) * w + x - 1] : 0;
    let v = raw[y * (w + 1) + 1 + x];
    if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
    else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    px[y * w + x] = v & 255;
  }
}
const nx = Math.ceil(w / 2), ny = Math.ceil(h / 2), rows = [];
let land = 0;
for (let j = 0; j < ny; j++) {
  const runs = []; let cur = 0, n = 0;
  for (let i = 0; i < nx; i++) {
    let v = 0;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const x = Math.min(w - 1, 2 * i + di), y = Math.min(h - 1, 2 * j + dj); if (px[y * w + x] > 0) v = 1; }
    land += v;
    if (v === cur) n++; else { runs.push(n); cur = v; n = 1; }
  }
  runs.push(n); rows.push(runs);
}
await writeFile(new URL('../src/environment/data/land-mask.json', import.meta.url), JSON.stringify({
  source: 'src/render/data/terrain.png (' + meta.source + ')', south: meta.south, north: meta.north, west: meta.west, east: meta.east, nx, ny,
  note: 'land mask, ~100 m cells; rows north to south; run lengths alternating water, land, water, ... starting with water', rows
}) + '\n');
console.log(`land-mask.json ${nx}×${ny}, ${(100 * land / (nx * ny)).toFixed(0)}% land`);

// the 50 m mask: what boats run aground on away from the Cityfront
const rows50 = [];
for (let y = 0; y < h; y++) {
  const runs = []; let cur = 0, n = 0;
  for (let x = 0; x < w; x++) { const v = px[y * w + x] > 0 ? 1 : 0; if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } }
  runs.push(n); rows50.push(runs);
}
await writeFile(new URL('../src/geo/data/shore-mask.json', import.meta.url), JSON.stringify({
  source: 'src/render/data/terrain.png (' + meta.source + ')', south: meta.south, north: meta.north, west: meta.west, east: meta.east, nx: w, ny: h,
  note: 'land (above 0.5 m) in 50 m cells; rows north to south; run lengths alternating water, land, ... starting with water', rows: rows50
}) + '\n');
console.log(`shore-mask.json ${w}×${h}`);
