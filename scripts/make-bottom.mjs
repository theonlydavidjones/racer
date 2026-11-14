#!/usr/bin/env node
/**
 * The bottom where a keel could touch it: the Bay's shoal water on a 50 m grid, from NOAA's chart
 * (src/geo/data/enc-chart.json, made by fetch-charts.mjs). For running aground on depth: the water over a point is the
 * bottom's depth below MLLW plus the tide's height there (environment/tide.ts tideHeightAt), against her draft.
 *  - Each depth area (DEPARE) gives a band: its shoal edge and its deep edge (DRVAL1, DRVAL2, m below MLLW; negative, a
 *    flat drying that high). The line between two bands is a depth contour, so within a band the bottom slopes from its
 *    shoal edge's depth to its deep edge's by the distance to each (the shore counted as its shoal side): two bands meet
 *    at their line's depth, no step there (where the chart's bands leave a gap, a flat drying to the datum beside water
 *    from 1.8 m, a step it shows stays). On that, the chart's soundings within SOUND_R m, by the inverse square of the
 *    distance tapered to nothing at SOUND_R (no edge where one stops counting), each held inside the band (a sounding
 *    just across the band's line belongs to the next one). The chart doesn't sound the drying flats (none of its
 *    soundings is below the datum), so there it's the band's slope alone.
 *  - Only where the band's shoal edge is under SHOAL m: deeper than that, no Folkboat (1.2 m) can touch at any tide (the
 *    lowest, about 0.6 m below MLLW), so it's left out, as is land (the sim's own shore decides that: geo/shore.ts).
 *
 *   node scripts/make-bottom.mjs
 *
 * Output: src/environment/data/bottom.json: 32 × 32 cell tiles (only those with shoal water), each cell a byte (runs of
 * 0 and 255 packed: the byte then how many): 0 known deep (a depth area from 3 m down), 255 no depth area (land, or water
 * the chart doesn't sound), else the depth below MLLW = (byte − 1) × STEP + OFF; cells centered at (i + 0.5, j + 0.5) from
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
for (const band of enc.depth) { // (every band, the deep ones too: a deep cell beside the shoal is known deep, not land)
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
// Within a band, where it lies between its edges: the line to a shoaler band is the band's shoal-edge contour (DRVAL1),
// the line to a deeper one its deep-edge contour (DRVAL2). So the bottom between them is taken to slope from one to the
// other by the distance to each (a band against land or drying ground on its shoal side slopes up to that edge too),
// and two bands meet at the depth of the line between them: no step there. (Distances by a two-pass chamfer transform
// over the cells, for each band's shoal edge in turn.)
const INF = 1e9, toShoal = new Float32Array(nx * ny).fill(INF), toDeep = new Float32Array(nx * ny).fill(INF);
{
  const levels = [...new Set(Array.from(d1).filter(v => !Number.isNaN(v)))].sort((a, b) => a - b), dist = new Float32Array(nx * ny);
  const chamfer = () => { const D = Math.SQRT2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = j * nx + i; let v = dist[c];
      if (i > 0) v = Math.min(v, dist[c - 1] + 1); if (j > 0) { v = Math.min(v, dist[c - nx] + 1); if (i > 0) v = Math.min(v, dist[c - nx - 1] + D); if (i < nx - 1) v = Math.min(v, dist[c - nx + 1] + D); } dist[c] = v; }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const c = j * nx + i; let v = dist[c];
      if (i < nx - 1) v = Math.min(v, dist[c + 1] + 1); if (j < ny - 1) { v = Math.min(v, dist[c + nx] + 1); if (i < nx - 1) v = Math.min(v, dist[c + nx + 1] + D); if (i > 0) v = Math.min(v, dist[c + nx - 1] + D); } dist[c] = v; } };
  for (const L of levels) {
    if (L >= SHOAL + 5) break; // (only the shoal bands need it; the deep side of the last of them is any band below)
    // the cells shoaler than this band's (or land: no depth area), and those deeper, as sources in turn
    for (const shoaler of [true, false]) {
      for (let c = 0; c < dist.length; c++) { const v = d1[c]; dist[c] = (shoaler ? (Number.isNaN(v) || v < L) : (!Number.isNaN(v) && v > L)) ? 0 : INF; }
      chamfer();
      for (let c = 0; c < dist.length; c++) if (d1[c] === L) (shoaler ? toShoal : toDeep)[c] = dist[c] * CELL;
    }
  }
}
/** The sounding's weight at r m: the inverse square of the distance, tapered to nothing at SOUND_R (no edge where it stops). */
const weight = r => r >= SOUND_R ? 0 : (1 - (r / SOUND_R) ** 2) ** 2 / Math.max(25, r) ** 2;
const bottomAt = (i, j, lo, hi) => {
  const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL, bi = Math.floor(i / BIN), bj = Math.floor(j / BIN), c = j * nx + i;
  // the band's own slope between its edges (its middle if it touches neither, or both equally far)
  const a = toShoal[c], b = toDeep[c], slope = a >= INF / 2 && b >= INF / 2 ? (lo + hi) / 2 : a >= INF / 2 ? hi : b >= INF / 2 ? lo + (hi - lo) * Math.min(1, a / 400) : lo + (hi - lo) * a / (a + b);
  // the soundings near, held inside the band, against it: the slope counted as one more sounding at SOUND_R / 2
  let w = weight(SOUND_R / 2), s = w * slope;
  for (let p = bi - 1; p <= bi + 1; p++) for (let q = bj - 1; q <= bj + 1; q++) for (const [sx, sy, d] of bins.get(p * 100000 + q) ?? []) {
    const k = weight(Math.hypot(sx - x, sy - y)); if (k <= 0) continue;
    w += k; s += k * Math.min(hi, Math.max(lo, d));
  }
  return s / w;
};

/** Runs packed: a 0 (known deep) or a LAND (no depth area: land, or water the chart doesn't sound) is followed by how many (1–255) there are. */
const LAND = 255;
const rle = g => { const out = []; for (let k = 0; k < g.length;) { const v = g[k]; if (v && v !== LAND) { out.push(g[k++]); continue; } let n = 0; while (k < g.length && g[k] === v && n < 255) { n++; k++; } out.push(v, n); } return out; };
const tiles = [];
let shoal = 0;
for (let tj = 0; tj * TILE < ny; tj++) for (let ti = 0; ti * TILE < nx; ti++) {
  const g = new Uint8Array(TILE * TILE); let any = false;
  for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
    const i = ti * TILE + a, j = tj * TILE + b; if (i >= nx || j >= ny) continue;
    const c = j * nx + i; if (Number.isNaN(d1[c])) { g[b * TILE + a] = LAND; continue; }
    if (d1[c] >= SHOAL) continue; // (known deep: 0)
    const d = bottomAt(i, j, d1[c], d2[c]); if (d >= SHOAL) continue;
    g[b * TILE + a] = Math.min(LAND - 1, Math.max(1, 1 + Math.round((d - OFF) / STEP))); any = true; shoal++;

  }
  if (any) tiles.push([ti, tj, Buffer.from(rle(g)).toString('base64')]);
}
console.log(`${nx}×${ny} cells, ${tiles.length} tiles; ${shoal} shoal cells (${(shoal * CELL * CELL / 1e6).toFixed(0)} km²)`);
await writeFile(new URL('../src/environment/data/bottom.json', import.meta.url), JSON.stringify({
  source: 'NOAA ENC (S-57) depth areas (DEPARE) and soundings (SOUNDG), src/geo/data/enc-chart.json; m below MLLW',
  made: 'scripts/make-bottom.mjs',
  note: `shoal water only (a band's shoal edge under ${SHOAL} m): the soundings within ${SOUND_R} m (inverse square of distance) held inside the depth area's band, else its middle; byte 0 known deep, ${255} no depth area (land, or unsounded); each a run packed (the byte, then how many); else (byte − 1) × step + offset m below MLLW; ${CELL} m cells from the box's north-west corner, rows north to south, in ${TILE} × ${TILE} tiles [ti, tj, base64]`,
  box: B, cell: CELL, tile: TILE, nx, ny, step: STEP, offset: OFF, tiles
}) + '\n');
