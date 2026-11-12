#!/usr/bin/env node
/**
 * Build the terrain height map for the scenery: San Francisco's north shore, the Golden Gate, the Marin
 * Headlands and Mt Tamalpais, Angel Island and Alcatraz, down to Twin Peaks and Sutro Tower.
 *
 *   node scripts/fetch-terrain.mjs            (behind a proxy: NODE_USE_ENV_PROXY=1)
 *
 * Source: the open terrain tiles on AWS (Terrarium encoding; land from USGS 3DEP/NED and SRTM), public domain.
 * Output: src/render/data/terrain.png (8-bit grey: 0 = water, else 1 + metres / SCALE) and terrain.json.
 * No dependencies: a minimal PNG decoder and encoder on Node's zlib.
 */
import { inflateSync, deflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// The grid's spacing is the first map's (37.745–37.935 N, 122.61–122.345 W, 467 × 424 cells of about 50 m), kept exactly
// as it was extended east to Oakland and Alameda and north past Richmond to the Brothers, so every cell of the first map
// is sampled at the same point as before.
const DLON = 0.265 / 466, DLAT = 0.19 / 423;
const BBOX = { south: +(37.745 - 22 * DLAT).toFixed(6), north: +(37.935 + 112 * DLAT).toFixed(6), west: -122.61, east: +(-122.345 + 232 * DLON).toFixed(6) };
const Z = 13, CELL = 50, SCALE = 3.2; // m per grid cell; m per grey level
const URL0 = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium';

const tileX = lon => (lon + 180) / 360 * 2 ** Z;
const tileY = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z; };

/** Minimal PNG decoder: 8-bit RGB or RGBA, non-interlaced. Returns {w, h, ch, data}. */
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[12] !== 0) throw new Error('unsupported PNG'); ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0; if (!ch) throw new Error('colour type ' + ct);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0, b = prev ? prev[x] : 0, c = prev && x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

/** Minimal PNG encoder: 8-bit greyscale. */
function encodePngGrey(w, h, px) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 1; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (px[y * w + x] - (x ? px[y * w + x - 1] : 0)) & 255; } // Sub filter
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const x0 = Math.floor(tileX(BBOX.west)), x1 = Math.floor(tileX(BBOX.east)), y0 = Math.floor(tileY(BBOX.north)), y1 = Math.floor(tileY(BBOX.south));
const tiles = new Map();
for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
  const url = `${URL0}/${Z}/${tx}/${ty}.png`;
  let res; for (let a = 0; a < 4; a++) { try { res = await fetch(url); if (res.ok) break; } catch { /* retry */ } await new Promise(r => setTimeout(r, 1500 * 2 ** a)); }
  if (!res?.ok) throw new Error('Failed ' + url);
  tiles.set(`${tx},${ty}`, decodePng(Buffer.from(await res.arrayBuffer())));
  process.stdout.write('.');
}
console.log(` ${tiles.size} tiles`);
/** Elevation (m) at a lat/lon, bilinear between tile pixels. Terrarium: (R·256 + G + B/256) − 32768. */
function elev(lat, lon) {
  const fx = tileX(lon) * 256 - 0.5, fy = tileY(lat) * 256 - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
  const at = (px, py) => { const t = tiles.get(`${Math.floor(px / 256)},${Math.floor(py / 256)}`); if (!t) return 0; const i = ((py % 256) * 256 + (px % 256)) * t.ch, d = t.data; return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768; };
  return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
}
const nx = Math.round((BBOX.east - BBOX.west) / DLON) + 1, ny = Math.round((BBOX.north - BBOX.south) / DLAT) + 1;
const px = new Uint8Array(nx * ny);
let maxH = 0;
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
  const lat = BBOX.north - (BBOX.north - BBOX.south) * j / (ny - 1), lon = BBOX.west + (BBOX.east - BBOX.west) * i / (nx - 1);
  const h = elev(lat, lon); maxH = Math.max(maxH, h);
  px[j * nx + i] = h <= 0.5 ? 0 : Math.min(255, 1 + Math.round(h / SCALE)); // row 0 = north
}
// The land and water are NOAA's chart's, not the elevation data's: the ENC's land areas (LNDARE, harbour-scale cells at
// 1:12,000–1:22,000; src/geo/data/enc-chart.json, made by fetch-charts.mjs) decide which 50 m cells are land, tested at
// each cell's centre. The elevation tiles' sea level is coarse along the flat filled shores (the Port of Oakland, Alameda
// Point, the Berkeley and Richmond waterfronts, a few metres above the water), they fill breakwaters and basins in, and
// they miss low islands (Brooks Island, 4 m). An islet smaller than a cell (West Brother) gets the cell at its middle.
// Heights still come from the elevation data, at least 2.5 m on the chart's land (fill and seawalls). Along the
// Cityfront nothing changes: the shore there is OpenStreetMap's, fitted in render/terrain.ts and geo/shore.ts.
const CITYFRONT = { south: 37.7925, north: 37.8135, west: -122.4775, east: -122.4015 }; // (render/terrain.ts cityShore)
let chartLand = 0, islets = 0;
try {
  const enc = JSON.parse(await readFile(new URL('../src/geo/data/enc-chart.json', import.meta.url), 'utf8'));
  const dec = a => { const pts = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; pts.push([x / 1e5, y / 1e5]); } return pts; };
  const isLand = new Uint8Array(nx * ny);
  // each land area (outer ring and holes, even–odd) filled by scanlines through the cells' centres
  for (const poly of enc.land) {
    const rings = poly.map(dec), lats = rings.flat().map(p => p[1]); let cells = 0;
    const ja = Math.max(0, Math.floor((BBOX.north - Math.max(...lats)) / (BBOX.north - BBOX.south) * (ny - 1))), jb = Math.min(ny - 1, Math.ceil((BBOX.north - Math.min(...lats)) / (BBOX.north - BBOX.south) * (ny - 1)));
    for (let j = ja; j <= jb; j++) {
      const lat = BBOX.north - (BBOX.north - BBOX.south) * j / (ny - 1), xs = [];
      for (const r of rings) for (let k = 0, l = r.length - 1; k < r.length; l = k++) {
        const [x0, y0] = r[l], [x1, y1] = r[k];
        if ((y0 > lat) !== (y1 > lat)) xs.push(x0 + (lat - y0) / (y1 - y0) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ia = Math.max(0, Math.ceil((xs[k] - BBOX.west) / (BBOX.east - BBOX.west) * (nx - 1))), ib = Math.min(nx - 1, Math.floor((xs[k + 1] - BBOX.west) / (BBOX.east - BBOX.west) * (nx - 1)));
        for (let i = ia; i <= ib; i++) { isLand[j * nx + i] = 1; cells++; }
      }
    }
    if (!cells) { // too small to hold a cell's centre: the cell at its middle
      const r = rings[0], la = r.reduce((a, q) => a + q[1], 0) / r.length, lo = r.reduce((a, q) => a + q[0], 0) / r.length;
      const i = Math.round((lo - BBOX.west) / (BBOX.east - BBOX.west) * (nx - 1)), j = Math.round((BBOX.north - la) / (BBOX.north - BBOX.south) * (ny - 1));
      if (i >= 0 && j >= 0 && i < nx && j < ny) { isLand[j * nx + i] = 1; islets++; }
    }
  }
  // NOAA cuts its cells along a 0.075° grid, and a land area spanning two cells is two polygons meeting there: a line of
  // cell centres right on the cut can fall in neither. A water cell on a cut with land either side across it is land.
  {
    const onCut = v => { const r = v / 0.075 - Math.round(v / 0.075); return Math.abs(r) * 0.075 < 0.0004; };
    const fill = [];
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i; if (isLand[k]) continue;
      const lat = BBOX.north - (BBOX.north - BBOX.south) * j / (ny - 1), lon = BBOX.west + (BBOX.east - BBOX.west) * i / (nx - 1);
      if ((onCut(lon) && isLand[k - 1] && isLand[k + 1]) || (onCut(lat) && isLand[k - nx] && isLand[k + nx])) fill.push(k);
    }
    for (const k of fill) isLand[k] = 1;
    console.log(`${fill.length} cells on the chart's cell cuts filled`);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lat = BBOX.north - (BBOX.north - BBOX.south) * j / (ny - 1), lon = BBOX.west + (BBOX.east - BBOX.west) * i / (nx - 1);
    if (lat > CITYFRONT.south && lat < CITYFRONT.north && lon > CITYFRONT.west && lon < CITYFRONT.east) continue;
    const k = j * nx + i;
    px[k] = isLand[k] ? Math.max(px[k], 1 + Math.round(2.5 / SCALE)) : 0;
    chartLand += isLand[k];
  }
} catch (e) { console.warn('no chart land (run fetch-charts.mjs first):', e.message); }
console.log(`${chartLand} cells of land from the chart (${islets} islets smaller than a cell)`);
await mkdir(new URL('../src/render/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/render/data/terrain.png', import.meta.url), encodePngGrey(nx, ny, px));
await writeFile(new URL('../src/render/data/terrain.json', import.meta.url), JSON.stringify({
  source: 'AWS open terrain tiles (Terrarium; USGS 3DEP/NED, SRTM), zoom ' + Z, fetched: new Date().toISOString().slice(0, 10),
  land: 'land and water from NOAA ENC land areas (LNDARE), src/geo/data/enc-chart.json, except along the Cityfront (OpenStreetMap, fitted in the sim)',
  ...BBOX, nx, ny, cell: CELL, scale: SCALE, note: 'grey 0 = water (≤ 0.5 m), else 1 + height / scale; row 0 is the north edge'
}, null, 1) + '\n');
console.log(`terrain.png ${nx}×${ny}, highest ${Math.round(maxH)} m`);
