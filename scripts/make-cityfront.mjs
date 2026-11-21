#!/usr/bin/env node
/**
 * The city front's buildings, phases 1 and 2 (r296): Fort Point to the Marina's east end, then on past Fort Mason and Aquatic Park to Hyde Street Pier, from OpenStreetMap's building footprints
 * (ODbL; heights are OSM's) stood on the USGS 3DEP 1 m DEM's ground (public domain), in place of the grid of random boxes there.
 *
 *   node scripts/make-cityfront.mjs x54y419.tif x55y419.tif [--cache dir]
 *
 * The DEMs are USGS_1M_10_x54y419_CA_SanFrancisco_B23.tif (E 539,994–550,006, N 4,180,006–4,190,006, UTM 10N, NAVD88 m, 111,944,984 bytes) and
 * x55y419 (E 549,994–560,006, 86,461,076 bytes), each a window of it where it is wanted:
 *   https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_SanFrancisco_B23/TIFF/
 * The sim draws its water as a flat plane at mean sea level, 0.969 m above NAVD88 (NOAA 9414290: MSL 2.773 m, NAVD88 1.804 m above
 * station datum), so a building's ground is its DEM height less 0.969 m (scripts/make-alcatraz.mjs). The OSM pull is the strip's two
 * boxes from api.openstreetmap.org (cached with --cache). Skipped: ways inside the hand-modeled landmarks' own ground (Fort Point, the Palace of
 * Fine Arts, the two yacht-club buildings on the Marina's breakwater in render/landscape.ts), the Golden Gate Bridge's south anchorage, ways
 * whose middle is outside the strip, and a multipolygon's outer way that isn't a closed ring on its own. Multipolygon buildings are drawn with their courtyards filled in.
 *
 * A building's height is, in order: OSM's `height` (flag 2), `building:levels` × 3.3 m (flag 1), or a default by the `building` value
 * (flag 0, marked: no height is published for it where we could reach). A footprint with no ground in the DEM (a building on a pier over the
 * water) stands on a 3 m deck (flag bit 4), the piers' deck height (render/wharf.ts).
 *
 * Output src/render/data/cityfront.json: every footprint packed (ground cm, height dm, flags, the first vertex in dm and the rest as dm steps;
 * course coordinates, the sim's LAT0/LON0 frame), little-endian, deflated, base64.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { openGeoTiff } from './lib/geotiff-f32.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('--cache', '');
const STRIP = { s: 37.7975, n: 37.8150, w: -122.4900, e: -122.4180 }; // (Fort Point to Hyde Street Pier; its south edge, 37.7975, is Lombard Street's, where the Marina's houses end)
const COLS = [-122.4900, -122.4600, -122.4435, -122.4318, -122.4250, -122.4180];
const BOXES = COLS.slice(1).map((e, i) => [COLS[i], STRIP.s, e, STRIP.n]);
const MSL_NAVD88 = 0.969, DECK = 3; // (a pier's deck: about 3 m over the water, render/wharf.ts)
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = MLAT * Math.cos(LAT0 * Math.PI / 180);
const sim = (lat, lon) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
// landmarks drawn by hand in render/landscape.ts: [lat, lon, radius m]
const CLEAR = [[37.81055, -122.47710, 75], [37.80292, -122.44840, 130], [37.80728, -122.44664, 60], [37.80773, -122.44259, 25]];
// (the Fort Mason piers' sheds are drawn from src/geo/data/pile-piers.json, render/wharf.ts and harborLee)
const PILE_IDS = new Set(JSON.parse(await readFile(new URL('../src/geo/data/pile-piers.json', import.meta.url), 'utf8')).piers.map(p => p.way));
const SKIP_IDS = new Set([1560010162, 1560010163, 1560010164, 1560010165, 1560010166, 1560010167]); // the Golden Gate Bridge's south tower and anchorage

// ---- OSM
if (CACHE) await mkdir(CACHE, { recursive: true });
const xmls = [];
for (const [i, b] of BOXES.entries()) {
  const f = CACHE && `${CACHE}/osm_${i}.xml`;
  if (f && existsSync(f)) { xmls.push(await readFile(f, 'utf8')); continue; }
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${b.join(',')}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
  if (!r.ok) throw new Error(`OSM: HTTP ${r.status}`);
  const t = await r.text(); if (f) await writeFile(f, t); xmls.push(t);
}
const ways = new Map(), rels = new Map(); let relations = 0, relBuildings = 0, relChained = 0;
for (const xml of xmls) {
  const nodes = new Map(), all = new Map();
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
  const tagsOf = body => Object.fromEntries([...body.matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)].map(x => [x[1], x[2]]));
  const closed = refs => { if (refs.length < 4 || refs[0] !== refs.at(-1)) return null; const r = refs.slice(0, -1).map(x => nodes.get(x)); return r.some(p => !p) ? null : r; };
  for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const t = tagsOf(m[2]), refs = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map(x => x[1]), ring = closed(refs);
    if (ring) all.set(m[1], { t, ring });
    if (!t.building || t.building === 'no' || ways.has(m[1]) || !ring) continue;
    ways.set(m[1], { id: +m[1], t, ring });
  }
  // a multipolygon building (a complex, with courtyards): each closed outer way is drawn whole, the courtyards filled in (a chained outer is skipped)
  for (const m of xml.matchAll(/<relation id="(\d+)"[^>]*>([\s\S]*?)<\/relation>/g)) {
    relations++; const t = tagsOf(m[2]);
    if (t.type !== 'multipolygon' || !t.building || t.building === 'no' || rels.has(m[1])) continue;
    rels.set(m[1], 1); relBuildings++;
    for (const [, ref] of m[2].matchAll(/<member type="way" ref="(\d+)" role="outer"/g)) {
      const w = all.get(ref); if (!w) { relChained++; continue; }
      if (ways.has(ref)) continue; // (the outer way is a building of its own)
      ways.set('r' + m[1] + '-' + ref, { id: +m[1], t, ring: w.ring });
    }
  }
}

// ---- the DEM's ground (UTM 10N forward, Snyder 8-9 to 8-13, GRS80)
function utm(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), p = lat * Math.PI / 180, l = (lon + 123) * Math.PI / 180;
  const s = Math.sin(p), c = Math.cos(p), N = a / Math.sqrt(1 - e2 * s * s), T = (s / c) ** 2, C = ep2 * c * c, A = l * c;
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - 35 * e2 ** 3 / 3072 * Math.sin(6 * p));
  return [500000 + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120),
    k0 * (M + N * (s / c) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))];
}
// (a check: Alcatraz's highest point, E 550,804.5 N 4,186,695.5, is at about 37.82626, −122.42271)
{ const [e, n] = utm(37.82626, -122.42271); if (Math.hypot(e - 550804.5, n - 4186695.5) > 30) throw new Error(`UTM forward is off: ${e} ${n}`); }
const lo = utm(STRIP.s - 0.0005, STRIP.w - 0.0005), hi = utm(STRIP.n + 0.0005, STRIP.e + 0.0005), UE0 = Math.min(lo[0], hi[0]), UE1 = Math.max(lo[0], hi[0]), UN0 = Math.min(lo[1], hi[1]), UN1 = Math.max(lo[1], hi[1]);
const tifs = process.argv.slice(2).filter(a => a.endsWith('.tif')).map(f => {
  const dem = openGeoTiff(f), TX = dem.tiepoint[3], TY = dem.tiepoint[4];
  const e0 = Math.max(UE0, TX), e1 = Math.min(UE1, TX + dem.width), n1 = Math.min(UN1, TY), n0 = Math.max(UN0, TY - dem.height);
  const X0 = Math.floor(e0 - TX) - 3, X1 = Math.ceil(e1 - TX) + 3, Y0 = Math.floor(TY - n1) - 3, Y1 = Math.ceil(TY - n0) + 3, WW = X1 - X0, WH = Y1 - Y0;
  return { TX, TY, X0, Y0, WW, WH, win: dem.window(Math.max(0, X0), Math.max(0, Y0), Math.min(dem.width, X1) - Math.max(0, X0), Math.min(dem.height, Y1) - Math.max(0, Y0)), ox: Math.max(0, X0), oy: Math.max(0, Y0), w: Math.min(dem.width, X1) - Math.max(0, X0), h: Math.min(dem.height, Y1) - Math.max(0, Y0) };
});
const demAt = (lat, lon) => {
  const [e, n] = utm(lat, lon);
  for (const t of tifs) { const i = Math.floor(e - t.TX) - t.ox, j = Math.floor(t.TY - n) - t.oy; if (i < 0 || j < 0 || i >= t.w || j >= t.h) continue; const v = t.win[j * t.w + i]; return v > -1000 ? v : null; }
  return null;
};

// ---- the buildings
const inClear = (lat, lon) => CLEAR.some(([a, b, r]) => Math.hypot((lat - a) * MLAT, (lon - b) * MLON) < r);
const num = s => { const m = /^\s*([\d.]+)\s*(m|ft|')?/.exec(s || ''); if (!m) return null; const v = parseFloat(m[1]); return m[2] === 'ft' || m[2] === "'" ? v * 0.3048 : v; };
const DEFAULT = { house: 7, residential: 8, detached: 7, semidetached_house: 8, terrace: 8, apartments: 12, dormitory: 12, commercial: 10, retail: 8, office: 12, industrial: 9, warehouse: 9, hangar: 12, garage: 3.5, garages: 3.5, shed: 3, roof: 4, carport: 3, church: 12, chapel: 8, public: 10, civic: 10, school: 8, hospital: 14, hotel: 14, barracks: 9, service: 4, boathouse: 5, kiosk: 3 };
/** Ramer–Douglas–Peucker on a closed ring (dm), 0.4 m: the corners stay, the extra points along a wall and a curve's fine steps go (fewer triangles in the sheds and round buildings). */
function simplify(ring) {
  const tol = 4, dist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return l ? Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / l : Math.hypot(p[0] - a[0], p[1] - a[1]); };
  /** The points of an open polyline to keep, its first included, its last not. */
  const open = pts => { const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
    const rdp = (i0, i1) => { let m = -1, k = -1; for (let i = i0 + 1; i < i1; i++) { const d = dist(pts[i], pts[i0], pts[i1]); if (d > m) { m = d; k = i; } } if (m > tol) { keep[k] = true; rdp(i0, k); rdp(k, i1); } };
    rdp(0, pts.length - 1); return pts.filter((p, i) => keep[i] && i < pts.length - 1); };
  // (split the ring at its first point and the point farthest from it, so neither is lost)
  let far = 1; for (let i = 2; i < ring.length; i++) if (Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]) > Math.hypot(ring[far][0] - ring[0][0], ring[far][1] - ring[0][1])) far = i;
  const r = open(ring.slice(0, far + 1)).concat(open(ring.slice(far).concat([ring[0]])));
  return r.length >= 3 ? r : ring;
}
const out = [], stat = { n: 0, h2: 0, h1: 0, h0: 0, deck: 0, cleared: 0, outside: 0, tiny: 0 };
for (const w of ways.values()) {
  if (SKIP_IDS.has(w.id) || PILE_IDS.has(w.id)) continue;
  const c = w.ring.reduce((a, p) => [a[0] + p[0] / w.ring.length, a[1] + p[1] / w.ring.length], [0, 0]);
  if (c[0] < STRIP.s || c[0] > STRIP.n || c[1] < STRIP.w || c[1] > STRIP.e) { stat.outside++; continue; }
  if (inClear(c[0], c[1])) { stat.cleared++; continue; }
  const xy = simplify(w.ring.map(([la, lo]) => sim(la, lo).map(v => Math.round(v * 10)))); // dm
  let area = 0; for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) area += (xy[j][0] + xy[i][0]) * (xy[j][1] - xy[i][1]); if (Math.abs(area / 2) / 100 < 8) { stat.tiny++; continue; }
  let h = num(w.t.height), flag = 2;
  if (h === null) { const lv = num(w.t['building:levels']); if (lv) { h = lv * 3.3; flag = 1; } else { h = DEFAULT[w.t.building] ?? 8; flag = 0; } }
  h = Math.max(2.5, Math.min(h, 250));
  let g = Infinity; for (const [la, lo] of w.ring) { const v = demAt(la, lo); if (v !== null) g = Math.min(g, v - MSL_NAVD88); }
  if (!(g > 1)) { g = DECK; flag |= 4; stat.deck++; } // (no ground, or a shore sliver: a pier's deck)
  stat['h' + (flag & 3)]++; stat.n++;
  out.push({ id: w.id, xy, g: Math.round(g * 100), h: Math.round(h * 10), flag, name: w.t.name || '' });
}
out.sort((a, b) => a.xy[0][0] - b.xy[0][0]);

// ---- pack
let bytes = 0; for (const b of out) bytes += 2 + 2 + 2 + 1 + 8 + (b.xy.length - 1) * 4;
const buf = Buffer.alloc(bytes); let o = 0;
for (const b of out) {
  buf.writeUInt16LE(b.xy.length, o); buf.writeInt16LE(b.g, o + 2); buf.writeUInt16LE(b.h, o + 4); buf[o + 6] = b.flag; buf.writeInt32LE(b.xy[0][0], o + 7); buf.writeInt32LE(b.xy[0][1], o + 11); o += 15;
  for (let i = 1; i < b.xy.length; i++) { buf.writeInt16LE(b.xy[i][0] - b.xy[i - 1][0], o); buf.writeInt16LE(b.xy[i][1] - b.xy[i - 1][1], o + 2); o += 4; }
}
const packed = deflateSync(buf, { level: 9 });
await writeFile(new URL('../src/render/data/cityfront.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), api.openstreetmap.org: building ways in the strip; ground from the USGS 3DEP 1 m DEM, CA_SanFrancisco_B23 tile x54y419 (public domain).',
  made: 'scripts/make-cityfront.mjs', fetched: new Date().toISOString().slice(0, 10), strip: STRIP,
  datum: 'ground is NAVD88 m less 0.969 m (mean sea level, the drawn water)', flags: 'bits 0-1: 2 OSM height, 1 levels x 3.3 m, 0 default by type; bit 2 (4): no DEM ground, on a 3 m deck',
  count: out.length, mesh: packed.toString('base64'),
}) + '\n');
console.log(`${out.length} buildings (${stat.h2} OSM heights, ${stat.h1} from levels, ${stat.h0} default; ${stat.deck} on a deck); skipped: ${stat.cleared} in landmarks' ground, ${stat.outside} outside the strip, ${stat.tiny} under 8 m²; ${relations} relations seen, ${relBuildings} multipolygon buildings (${relChained} outer ways not closed on their own, skipped)`);
console.log(`${(buf.length / 1024).toFixed(1)} KB packed, ${(packed.length / 1024).toFixed(1)} KB deflated, ${(packed.length * 4 / 3 / 1024).toFixed(1)} KB as base64`);
