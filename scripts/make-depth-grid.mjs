#!/usr/bin/env node
/**
 * The water's depth over the bays the sim fills and empties by continuity (San Rafael Bay, San Leandro Bay), on a 50 m
 * grid, from NOAA's chart (src/geo/data/enc-chart.json, made by fetch-charts.mjs): each depth area (DEPARE) filled at
 * the middle of its band, below MLLW (the chart's sounding datum). For the bays' cross-sections, which carry their tidal
 * prisms (environment/tide.ts). No network.
 *
 *   node scripts/make-depth-grid.mjs
 *
 * Output: src/environment/data/depth-grid.json: a grid for each bay, depths in 0.2 m steps from 2 m above MLLW (0 =
 * land), rows north to south, base64.
 */
import { readFile, writeFile } from 'node:fs/promises';

const enc = JSON.parse(await readFile(new URL('../src/geo/data/enc-chart.json', import.meta.url), 'utf8'));
const BOXES = [
  // San Rafael Bay, inside the line from Point San Quentin to Point San Pedro, to the chart's (and the world's) north edge
  { name: 'San Rafael Bay', south: 37.935, north: enc.box.north, west: -122.545, east: -122.45 },
  // San Leandro Bay, from the San Leandro Channel's mouth past Bay Farm Island to the world's east edge
  { name: 'San Leandro Bay', south: 37.735, north: 37.766, west: -122.246, east: Math.min(-122.188, enc.box.east) }
];
const CELL = 50, MLAT = 111320;
const dec = a => { const pts = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; pts.push([x / 1e5, y / 1e5]); } return pts; };
// each depth area's band, its shoal edge and its deep edge (DRVAL1, DRVAL2; where the chart gives none, the next band's
// shoal edge, or 10 m more for the deepest), stored as two grids: so a flat drying from 1.7 m to the datum is wetted bit
// by bit as the tide rises through it, not all at once at some height in it
// (stored from 2 m above the datum, so the flats the tide leaves dry keep their height: the chart's drying bands reach 1.8 m)
const OFF = -2, bands = [...new Set(enc.depth.map(b => b.d))].sort((a, b) => a - b);
const byte = d => Math.min(255, Math.max(1, Math.round((d - OFF) / 0.2)));
const grids = BOXES.map(B => {
  const MLON = 111320 * Math.cos((B.south + B.north) / 2 * Math.PI / 180);
  const nx = Math.round((B.east - B.west) * MLON / CELL), ny = Math.round((B.north - B.south) * MLAT / CELL), grid = new Uint8Array(nx * ny), grid2 = new Uint8Array(nx * ny);
  enc.depth.forEach(band => {
    const deep = band.d2 ?? bands.find(d => d > band.d) ?? band.d + 10, v = byte(band.d), v2 = byte(deep);
    for (const poly of band.p) {
      const rings = poly.map(dec), lats = rings.flat().map(p => p[1]);
      const j0 = Math.max(0, Math.floor((B.north - Math.max(...lats)) / (B.north - B.south) * ny)), j1 = Math.min(ny - 1, Math.ceil((B.north - Math.min(...lats)) / (B.north - B.south) * ny));
      for (let j = j0; j <= j1; j++) {
        const lat = B.north - (j + 0.5) / ny * (B.north - B.south), xs = [];
        for (const r of rings) for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [x0, y0] = r[b], [x1, y1] = r[a]; if ((y0 > lat) !== (y1 > lat)) xs.push(x0 + (lat - y0) / (y1 - y0) * (x1 - x0)); }
        xs.sort((p, q) => p - q);
        for (let k2 = 0; k2 + 1 < xs.length; k2 += 2) {
          const i0 = Math.max(0, Math.ceil((xs[k2] - B.west) / (B.east - B.west) * nx - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k2 + 1] - B.west) / (B.east - B.west) * nx - 0.5));
          for (let i = i0; i <= i1; i++) { grid[j * nx + i] = v; grid2[j * nx + i] = v2; }
        }
      }
    }
  });
  console.log(`${B.name}: ${nx}×${ny}`);
  return { ...B, nx, ny, data: Buffer.from(grid).toString('base64'), deep: Buffer.from(grid2).toString('base64') };
});
await writeFile(new URL('../src/environment/data/depth-grid.json', import.meta.url), JSON.stringify({
  source: 'NOAA ENC depth areas (DEPARE), src/geo/data/enc-chart.json: each band at its middle, metres below MLLW',
  step: 0.2, offset: OFF, note: 'each cell its depth area\'s band: data its shoal edge, deep its deep edge, below MLLW = byte × step + offset (negative: a flat drying that high); 0 land; cells centred at (i + 0.5, j + 0.5); rows north to south; base64 bytes',
  grids
}) + '\n');
