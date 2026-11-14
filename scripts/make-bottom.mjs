#!/usr/bin/env node
/**
 * The bottom where a keel could touch it: the Bay's shoal water on a 50 m grid, from NOAA's chart
 * (src/geo/data/enc-chart.json, made by fetch-charts.mjs). For running aground on depth: the water over a point is the
 * bottom's depth below MLLW plus the tide's height there (environment/tide.ts tideHeightAt), against her draft.
 *  - Each depth area (DEPARE) gives a band: its shoal edge and its deep edge (DRVAL1, DRVAL2, m below MLLW; negative, a
 *    flat drying that high). Within it, the bottom at a cell is the chart's soundings within SOUND_R m, weighted by the
 *    inverse square of the distance, held inside the band (a sounding just across the band's line belongs to the next
 *    one); with no sounding near, the band's middle (the bottom taken as spread evenly through it, as tide.ts wetBand has
 *    it). The chart doesn't sound the drying flats (none of its soundings is below the datum), so they're at their middle.
 *  - Only where the band's shoal edge is under SHOAL m: deeper than that, no Folkboat (1.2 m) can touch at any tide (the
 *    lowest, about 0.6 m below MLLW), so it's left out, as is land (the sim's own shore decides that: geo/shore.ts).
 *
 *   node scripts/make-bottom.mjs
 *
 * Output: src/environment/data/bottom.json: 32 × 32 cell tiles (only those with shoal water), each cell a byte (runs of
 * 0 packed: a 0 then how many): 0 not shoal (deep, or land), else the depth below MLLW = (byte − 1) × STEP + OFF; cells centered at (i + 0.5, j + 0.5) from
 * the box's north-west corner, rows north to south. No network.
 */
import { readFile, writeFile } from 'node:fs/promises';

const enc = JSON.parse(await readFile(new URL('../src/geo/data/enc-chart.json', import.meta.url), 'utf8'));
const CELL = 50, TILE = 32, SHOAL = 3, SOUND_R = 400, STEP = 0.05, OFF = -2;
const B = enc.box, MLAT = 111320, MLON = 111320 * Math.cos((B.south + B.north) / 2 * Math.PI / 180);
const nx = Math.ceil((B.east - B.west) * MLON / CELL), ny = Math.ceil((B.north - B.south) * MLAT / CELL);
const lonOf = i => B.west + (i + 0.5) * CELL / MLON, latOf = j => B.north - (j + 0.5) * CELL / MLAT;
const dec = a => { const pts = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; pts.push([x / 1e5, y / 1e5]); } return pts; };
const bands = [...new Set(enc.depth.map(b => b.d))].sort((a, b) => a - b);

// each cell's band (shoal edge, deep edge), scanline-filled from the depth areas (as make-depth-grid.mjs)
const d1 = new Float32Array(nx * ny).fill(NaN), d2 = new Float32Array(nx * ny).fill(NaN);
for (const band of enc.depth) {
  if (band.d >= SHOAL) continue;
  const deep = band.d2 ?? bands.find(d => d > band.d) ?? band.d + 10;
  for (const poly of band.p) {
    const rings = poly.map(dec), lats = rings.flat().map(p => p[1]);
    const j0 = Math.max(0, Math.floor((B.north - Math.max(...lats)) * MLAT / CELL)), j1 = Math.min(ny - 1, Math.ceil((B.north - Math.min(...lats)) * MLAT / CELL));
    for (let j = j0; j <= j1; j++) {
      const lat = latOf(j), xs = [];
      for (const r of rings) for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [x0, y0] = r[b], [x1, y1] = r[a]; if ((y0 > lat) !== (y1 > lat)) xs.push(x0 + (lat - y0) / (y1 - y0) * (x1 - x0)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - B.west) * MLON / CELL - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - B.west) * MLON / CELL - 0.5));
        for (let i = i0; i <= i1; i++) { const c = j * nx + i; if (Number.isNaN(d1[c]) || band.d < d1[c]) { d1[c] = band.d; d2[c] = deep; } } // (the shoaler where two areas overlap)
      }
    }
  }
}

// the soundings, binned by cell for the search
const S = enc.soundings, bins = new Map(), BIN = Math.ceil(SOUND_R / CELL);
for (let k = 0; k < S.length; k += 3) {
  const lon = S[k] / 1e5, lat = S[k + 1] / 1e5, i = Math.floor((lon - B.west) * MLON / CELL), j = Math.floor((B.north - lat) * MLAT / CELL);
  const key = Math.floor(i / BIN) * 100000 + Math.floor(j / BIN); (bins.get(key) ?? bins.set(key, []).get(key)).push([(lon - B.west) * MLON, (B.north - lat) * MLAT, S[k + 2] / 10]);
}
const bottomAt = (i, j, lo, hi) => {
  const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL, bi = Math.floor(i / BIN), bj = Math.floor(j / BIN);
  let w = 0, s = 0;
  for (let a = bi - 1; a <= bi + 1; a++) for (let b = bj - 1; b <= bj + 1; b++) for (const [sx, sy, d] of bins.get(a * 100000 + b) ?? []) {
    const r = Math.hypot(sx - x, sy - y); if (r > SOUND_R) continue;
    const q = 1 / Math.max(25, r) ** 2; w += q; s += q * Math.min(hi, Math.max(lo, d));
  }
  return w > 0 ? s / w : (lo + hi) / 2;
};

/** Runs of empty cells packed: a 0 is followed by how many (1–255) there are. */
const rle = g => { const out = []; for (let k = 0; k < g.length;) { if (g[k]) { out.push(g[k++]); continue; } let n = 0; while (k < g.length && !g[k] && n < 255) { n++; k++; } out.push(0, n); } return out; };
const tiles = [];
let shoal = 0, sounded = 0;
for (let tj = 0; tj * TILE < ny; tj++) for (let ti = 0; ti * TILE < nx; ti++) {
  const g = new Uint8Array(TILE * TILE); let any = false;
  for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
    const i = ti * TILE + a, j = tj * TILE + b; if (i >= nx || j >= ny) continue;
    const c = j * nx + i; if (Number.isNaN(d1[c])) continue;
    const d = bottomAt(i, j, d1[c], d2[c]); if (d >= SHOAL) continue;
    g[b * TILE + a] = Math.min(255, Math.max(1, 1 + Math.round((d - OFF) / STEP))); any = true; shoal++;
    if (d !== (d1[c] + d2[c]) / 2) sounded++;
  }
  if (any) tiles.push([ti, tj, Buffer.from(rle(g)).toString('base64')]);
}
console.log(`${nx}×${ny} cells, ${tiles.length} tiles; ${shoal} shoal cells (${(shoal * CELL * CELL / 1e6).toFixed(0)} km²), ${sounded} with soundings near`);
await writeFile(new URL('../src/environment/data/bottom.json', import.meta.url), JSON.stringify({
  source: 'NOAA ENC (S-57) depth areas (DEPARE) and soundings (SOUNDG), src/geo/data/enc-chart.json; m below MLLW',
  made: 'scripts/make-bottom.mjs',
  note: `shoal water only (a band's shoal edge under ${SHOAL} m): the soundings within ${SOUND_R} m (inverse square of distance) held inside the depth area's band, else its middle; byte 0 not shoal (a run of them packed: 0, then how many), else (byte − 1) × step + offset m below MLLW; ${CELL} m cells from the box's north-west corner, rows north to south, in ${TILE} × ${TILE} tiles [ti, tj, base64]`,
  box: B, cell: CELL, tile: TILE, nx, ny, step: STEP, offset: OFF, tiles
}) + '\n');
