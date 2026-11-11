#!/usr/bin/env node
/**
 * NOAA's official nautical chart for the sim's map: the ENC (Electronic Navigational Chart) vector data for the
 * Central Bay, drawn on the inset map and the full-screen chart (src/ui/encChart.ts).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-charts.mjs          (needs GDAL's ogr2ogr: apt-get install gdal-bin)
 *
 * Source: NOAA Office of Coast Survey, ENC cells (S-57), https://charts.noaa.gov/ENCs/ (catalog ENCProdCat.xml).
 * Public domain. NOAA has replaced the old chart-shaped cells (US5CA12M, US5CA13M, the vector form of paper chart
 * 18649 "Entrance to San Francisco Bay") with a regular grid of cells; the harbour-scale ones (band 5, 1:12,000 and
 * 1:22,000) covering the sim's area are picked from the catalog. Not for navigation.
 *
 * Output: src/geo/data/enc-chart.json — positions in latitude/longitude (WGS 84), stored as integer 1e-5 degrees
 * (about 1 m), each line's points delta-coded; depths in metres below MLLW (the ENC's own units and datum);
 * heights in metres above MHW. The edition, update and issue date of every cell are recorded in the file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HOST = 'https://charts.noaa.gov/ENCs/';
// the sim's world (the terrain and land mask, src/geo/data/shore-mask.json)
const BOX = { south: 37.745, north: 37.935, west: -122.61, east: -122.345 };
const CACHE = new URL('../.cache/enc/', import.meta.url).pathname;
const OUT = new URL('../src/geo/data/enc-chart.json', import.meta.url).pathname;
mkdirSync(CACHE, { recursive: true });

async function get(url, file) {
  if (existsSync(file)) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

// 1. the catalog: every active harbour-scale (band 5) cell overlapping the box; where the grid has no band-5 cell (the
// open coast north-west of the Marin Headlands), the approach-scale (band 4) cell, cut to just those squares
await get(HOST + 'ENCProdCat.xml', CACHE + 'ENCProdCat.xml');
const cat = readFileSync(CACHE + 'ENCProdCat.xml', 'utf8');
const catalog = [];
for (const m of cat.matchAll(/<cell>([\s\S]*?)<\/cell>/g)) {
  const x = m[1], tag = t => (x.match(new RegExp(`<${t}>([^<]*)</${t}>`)) ?? [])[1];
  const name = tag('name');
  if (tag('status') !== 'Active' || !/^US[45]/.test(name)) continue;
  const v = [...x.matchAll(/<lat>([^<]*)<\/lat>\s*<long>([^<]*)<\/long>/g)].map(a => [+a[1], +a[2]]);
  const la = v.map(p => p[0]), lo = v.map(p => p[1]);
  if (!v.length) continue;
  const b = { south: Math.min(...la), north: Math.max(...la), west: Math.min(...lo), east: Math.max(...lo) };
  if (b.south >= BOX.north || b.north <= BOX.south || b.west >= BOX.east || b.east <= BOX.west) continue;
  catalog.push({ name, band: +name[2], b, rec: { name, title: tag('lname'), scale: +tag('cscale'), edition: +tag('edtn'), update: +tag('updn'), updated: tag('uadt'), issued: tag('isdt') } });
}
const inside = (b, x, y) => x > b.west && x < b.east && y > b.south && y < b.north;
const cells = catalog.filter(c => c.band === 5).map(c => c.rec);
const STEP = 0.075, gaps = [];
for (let x = Math.floor(BOX.west / STEP) * STEP; x < BOX.east; x += STEP) for (let y = Math.floor(BOX.south / STEP) * STEP; y < BOX.north; y += STEP) {
  const sq = { west: +x.toFixed(4), east: +(x + STEP).toFixed(4), south: +y.toFixed(4), north: +(y + STEP).toFixed(4) };
  if (!catalog.some(c => c.band === 5 && inside(c.b, x + STEP / 2, y + STEP / 2))) gaps.push(sq);
}
const fill = []; // [band-4 cell, the square it fills]
for (const sq of gaps) {
  const c = catalog.find(c => c.band === 4 && inside(c.b, (sq.west + sq.east) / 2, (sq.south + sq.north) / 2));
  if (!c) { console.warn('no chart for', sq); continue; }
  fill.push([c.rec, sq]);
  if (!cells.includes(c.rec)) cells.push({ ...c.rec, onlyIn: [] });
  cells.find(r => r.name === c.rec.name).onlyIn.push(sq);
}
cells.sort((a, b) => a.name.localeCompare(b.name));
console.log('cells:', cells.map(c => `${c.name} 1:${c.scale} ed ${c.edition}.${c.update}`).join(', '));

// 2. each cell: download, unzip, every layer to GeoJSON (GDAL's S-57 driver applies the cell's updates)
const S57 = 'RETURN_PRIMITIVES=OFF,RETURN_LINKAGES=OFF,LNAM_REFS=ON,SPLIT_MULTIPOINT=ON,ADD_SOUNDG_DEPTH=ON,UPDATES=APPLY';
const layers = {}; // name -> features from all cells
const jobs = [...cells.filter(c => !c.onlyIn).map(c => [c, null]), ...fill];
for (const [c, sq] of jobs) {
  const zip = CACHE + c.name + '.zip', dir = CACHE + c.name;
  await get(HOST + c.name + '.zip', zip);
  if (!existsSync(dir)) execFileSync('unzip', ['-qo', zip, '-d', dir]);
  const base = join(dir, 'ENC_ROOT', c.name, c.name + '.000');
  const json = dir + (sq ? `.${sq.west}_${sq.south}` : '') + '.geojson.d';
  if (!existsSync(json)) {
    mkdirSync(json);
    const names = execFileSync('ogrinfo', ['-ro', '-q', base], { env: { ...process.env, OGR_S57_OPTIONS: S57 } }).toString()
      .split('\n').map(l => (l.match(/^\d+: (\w+)/) ?? [])[1]).filter(Boolean);
    const clip = sq ? ['-clipsrc', sq.west, sq.south, sq.east, sq.north].map(String) : [];
    for (const n of names) try { execFileSync('ogr2ogr', ['-f', 'GeoJSON', '-lco', 'RFC7946=NO', ...clip, join(json, n + '.json'), base, n], { env: { ...process.env, OGR_S57_OPTIONS: S57 }, stdio: ['ignore', 'ignore', 'ignore'] }); } catch { /* a layer with nothing in the square */ }
  }
  for (const f of readdirSync(json)) {
    const n = f.replace('.json', ''), fc = JSON.parse(readFileSync(join(json, f), 'utf8'));
    (layers[n] ??= []).push(...fc.features.filter(ft => ft.geometry).map(ft => ({ ...ft, cell: c.name })));
  }
}
console.log(Object.entries(layers).map(([k, v]) => `${k}=${v.length}`).join(' '));
if (process.argv.includes('--inspect')) { writeFileSync(CACHE + 'layers.json', JSON.stringify(layers)); process.exit(0); }
const dsid = JSON.parse(execFileSync('ogr2ogr', ['-f', 'GeoJSON', '/vsistdout/', join(CACHE, cells[0].name, 'ENC_ROOT', cells[0].name, cells[0].name + '.000'), 'DSID'], { env: { ...process.env, OGR_S57_OPTIONS: S57 } }).toString()).features[0].properties;
// every cell must share the units and datums the sim reads them in
if (dsid.DSPM_DUNI !== 1 || dsid.DSPM_HUNI !== 1 || dsid.DSPM_SDAT !== 12 || dsid.DSPM_VDAT !== 16) throw new Error('unexpected units or datum: ' + JSON.stringify(dsid));

// 3. geometry: clip to the box, simplify to about a metre, quantize to 1e-5 degrees and delta-code
const Q = 1e5, TOL = 1e-5;
const inBox = ([x, y]) => x >= BOX.west && x <= BOX.east && y >= BOX.south && y <= BOX.north;
/** Polygon ring clipped to the box (Sutherland–Hodgman: fine for a rectangle). */
function clipRing(ring) {
  const edges = [[p => p[0] >= BOX.west, (a, b) => at(a, b, 0, BOX.west)], [p => p[0] <= BOX.east, (a, b) => at(a, b, 0, BOX.east)],
    [p => p[1] >= BOX.south, (a, b) => at(a, b, 1, BOX.south)], [p => p[1] <= BOX.north, (a, b) => at(a, b, 1, BOX.north)]];
  function at(a, b, k, v) { const t = (v - a[k]) / (b[k] - a[k]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  let out = ring;
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) return [];
  }
  return out;
}
/** Douglas–Peucker. */
function simplify(pts, tol = TOL) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); let m = -1, md = tol;
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = pts[k]; let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > md) { md = d; m = k; }
    }
    if (m > 0) { keep[m] = 1; st.push([i, m], [m, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
/** Points → [lon0, lat0, dlon, dlat, …] in 1e-5 degrees. */
function enc(pts) {
  const out = []; let px = 0, py = 0;
  for (const [x, y] of pts) { const qx = Math.round(x * Q), qy = Math.round(y * Q); if (out.length && qx === px && qy === py) continue; out.push(qx - px, qy - py); px = qx; py = qy; }
  return out;
}
const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const lines = g => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
/** A polygon for filling: each ring clipped and simplified; null if nothing is left inside the box. */
function fillPoly(rings) {
  const out = [];
  for (const r of rings) { const c = simplify(clipRing(r.slice(0, -1))); if (c.length >= 3) out.push(enc(c)); }
  return out.length ? out : null;
}
/** Lines in the box, in pieces. */
function clipLine(pts) {
  const out = []; let cur = [];
  for (const p of pts) { if (inBox(p)) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } }
  if (cur.length > 1) out.push(cur);
  return out.map(l => enc(simplify(l))).filter(l => l.length >= 4);
}
// NOAA's cells are a grid 0.075° on a side: an area spanning two cells is cut along the grid line, and that cut is not a
// boundary on the chart. Outlines leave out any edge lying along a grid line (or the box's edge).
const GRID = 0.075, onGrid = v => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-6;
const onBoxEdge = ([x, y]) => Math.abs(x - BOX.west) < 1e-9 || Math.abs(x - BOX.east) < 1e-9 || Math.abs(y - BOX.south) < 1e-9 || Math.abs(y - BOX.north) < 1e-9;
function outline(rings) {
  const out = [];
  for (const r of rings) {
    const ring = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]];
    let cur = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      if (i > 0) {
        const a = ring[i - 1], cut = (onGrid(a[0]) && onGrid(p[0]) && Math.abs(a[0] - p[0]) < 1e-9) || (onGrid(a[1]) && onGrid(p[1]) && Math.abs(a[1] - p[1]) < 1e-9);
        if (cut) { if (cur.length > 1) out.push(cur); cur = []; }
      }
      cur.push(p);
    }
    if (cur.length > 1) out.push(cur);
  }
  return out.flatMap(clipLine);
}
const ll = g => g.coordinates; // a point's [lon, lat]
const qp = ([x, y]) => [Math.round(x * Q), Math.round(y * Q)];
const P = f => f.properties;
const list = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',')).map(Number).filter(n => !isNaN(n));
const anyIn = f => { const g = f.geometry; return g.type === 'Point' ? inBox(ll(g)) : JSON.stringify(g.coordinates).length > 0; };
const all = n => (layers[n] ?? []).filter(anyIn);

// depth areas: one list of polygons per band (DRVAL1, the shoal edge of the band, metres)
const depth = {};
for (const f of all('DEPARE')) for (const rings of polys(f.geometry)) { const p = fillPoly(rings); if (p) (depth[P(f).DRVAL1] ??= []).push(p); }
const contours = {};
for (const f of all('DEPCNT')) for (const l of lines(f.geometry)) (contours[P(f).VALDCO] ??= []).push(...clipLine(l));
const land = [], built = [], structures = [], shore = [], piers = [];
for (const f of all('LNDARE')) { for (const rings of polys(f.geometry)) { const p = fillPoly(rings); if (p) land.push(p); } }
for (const f of all('BUAARE')) for (const rings of polys(f.geometry)) { const p = fillPoly(rings); if (p) built.push(p); }
for (const n of ['SLCONS', 'PONTON', 'DRYDOC', 'FLODOC', 'HULKES', 'BRIDGE', 'OFSPLF', 'PYLONS']) for (const f of all(n)) {
  for (const rings of polys(f.geometry)) { const p = fillPoly(rings); if (p) structures.push(p); }
  for (const l of lines(f.geometry)) piers.push(...clipLine(l));
}
for (const f of all('COALNE')) for (const l of lines(f.geometry)) shore.push(...clipLine(l));
// small islets and rocks that always show (land as a point)
const islets = all('LNDARE').filter(f => f.geometry.type === 'Point' && inBox(ll(f.geometry))).map(f => qp(ll(f.geometry)));

// soundings: [lon, lat, depth in decimetres]
const soundings = [];
for (const f of all('SOUNDG')) { const c = ll(f.geometry); if (inBox(c)) soundings.push(...qp(c), Math.round(c[2] * 10)); }

// areas the chart marks in magenta (and the dredged channels and fairways in black)
const areas = [];
const AREA_KIND = { TSSLPT: 'lane', TSEZNE: 'sepzone', TSSBND: 'tssbound', PRCARE: 'precaution', FAIRWY: 'fairway', DRGARE: 'dredged', DWRTPT: 'deepwater',
  ACHARE: 'anchorage', ACHBRT: 'berth', RESARE: 'restricted', CTNARE: 'caution', CBLARE: 'cable', PIPARE: 'pipeline', DMPGRD: 'dumping', MIPARE: 'military',
  RECTRC: 'track', NAVLNE: 'navline', FERYRT: 'ferry', TSELNE: 'sepline', CBLSUB: 'cableline', PIPSOL: 'pipeline' };
for (const [n, k] of Object.entries(AREA_KIND)) for (const f of all(n)) {
  const p = P(f), g = f.geometry, a = { k };
  if (p.OBJNAM) a.name = p.OBJNAM;
  if (p.ORIENT != null) a.orient = p.ORIENT;
  if (p.DRVAL1 != null && n === 'DRGARE') a.d = p.DRVAL1;
  const restrn = list(p.RESTRN), catrea = list(p.CATREA), catach = list(p.CATACH);
  if (restrn.length) a.restrn = restrn; if (catrea.length) a.catrea = catrea; if (catach.length) a.catach = catach;
  const ps = polys(g);
  if (ps.length) {
    a.o = ps.flatMap(outline);
    if (['sepzone', 'dredged', 'fairway', 'precaution'].includes(k)) { a.f = ps.map(fillPoly).filter(Boolean); }
    // where to put its name and symbol: the middle of the biggest piece inside the box
    let best = null, bs = 0;
    for (const rings of ps) { const r = clipRing(rings[0].slice(0, -1)); if (r.length < 3) continue; let s = 0, cx = 0, cy = 0;
      for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], c = x0 * y1 - x1 * y0; s += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
      if (Math.abs(s) > bs) { bs = Math.abs(s); best = [cx / (3 * s), cy / (3 * s)]; } }
    if (best) { a.at = qp(best); a.size = Math.round(Math.sqrt(bs / 2) * 111320); }
  } else if (g.type === 'Point') { if (!inBox(ll(g))) continue; a.at = qp(ll(g)); }
  else a.o = lines(g).flatMap(clipLine);
  if (!a.at && !(a.o?.length)) continue;
  areas.push(a);
}

// buoys and beacons, with the light, fog signal and topmark or daymark at the same spot
const key = c => qp(c).join(',');
const extras = {};
for (const n of ['LIGHTS', 'FOGSIG', 'TOPMAR', 'DAYMAR', 'RTPBCN']) for (const f of layers[n] ?? []) if (f.geometry.type === 'Point') (extras[key(ll(f.geometry))] ??= []).push({ n, p: P(f), c: ll(f.geometry) });
const used = new Set();
function lightOf(p) {
  const l = { chr: p.LITCHR, col: list(p.COLOUR) };
  if (p.SIGGRP && p.SIGGRP !== '()') l.grp = p.SIGGRP; if (p.SIGPER) l.per = p.SIGPER; if (p.HEIGHT != null) l.h = p.HEIGHT; if (p.VALNMR != null) l.r = p.VALNMR;
  const cat = list(p.CATLIT); if (cat.length) l.cat = cat;
  if (p.SECTR1 != null && p.SECTR2 != null) { l.s1 = p.SECTR1; l.s2 = p.SECTR2; }
  if (p.OBJNAM) l.name = p.OBJNAM;
  return l;
}
// 17 emergency, 6 air obstruction (the bridge towers' aircraft warnings): not aids to navigation for a boat
const marineLight = p => !list(p.CATLIT).some(c => c === 17 || c === 6);
function dress(a, c) {
  const k = key(c);
  for (const e of extras[k] ?? []) {
    if (e.n === 'LIGHTS' && marineLight(e.p)) (a.lit ??= []).push(lightOf(e.p));
    else if (e.n === 'FOGSIG') a.fog = e.p.CATFOG;
    else if (e.n === 'TOPMAR' || e.n === 'DAYMAR') { a.top = e.p.TOPSHP; const tc = list(e.p.COLOUR); if (tc.length) a.topcol = tc; }
    else if (e.n === 'RTPBCN') a.racon = 1;
  }
  used.add(k);
}
const aids = [];
const AID_KIND = { BOYLAT: 'buoy', BOYSPP: 'buoy', BOYSAW: 'buoy', BOYCAR: 'buoy', BOYISD: 'buoy', BCNLAT: 'beacon', BCNSPP: 'beacon', BCNCAR: 'beacon', BCNSAW: 'beacon', BCNISD: 'beacon' };
for (const [n, k] of Object.entries(AID_KIND)) for (const f of all(n)) {
  if (f.geometry.type !== 'Point') continue;
  const p = P(f), c = ll(f.geometry), a = { k, cls: n, p: qp(c) };
  if (p.OBJNAM) a.name = p.OBJNAM.replace(/\s+/g, ' ').trim();
  const col = list(p.COLOUR), pat = list(p.COLPAT); if (col.length) a.col = col; if (pat.length) a.pat = pat;
  if (p.BOYSHP != null) a.shp = p.BOYSHP; if (p.BCNSHP != null) a.shp = p.BCNSHP;
  if (p.CATLAM != null) a.cat = p.CATLAM; if (p.CATSPM != null) a.spm = list(p.CATSPM);
  const st = list(p.STATUS); if (st.includes(8)) a.priv = 1; // privately maintained
  dress(a, c);
  aids.push(a);
}
// lights not on a buoy or beacon: the lighthouses and the lights on piers, bridges and landmarks
for (const f of all('LIGHTS')) {
  const c = ll(f.geometry), k = key(c); if (used.has(k) || !inBox(c) || !marineLight(P(f))) continue;
  const lm = (layers.LNDMRK ?? []).find(m => m.geometry.type === 'Point' && key(ll(m.geometry)) === k);
  const prev = aids.find(a => a.k === 'light' && a.p.join(',') === k);
  if (prev) { prev.lit.push(lightOf(P(f))); continue; }
  const a = { k: 'light', p: qp(c), lit: [lightOf(P(f))] };
  const nm = P(f).OBJNAM ?? lm?.properties.OBJNAM; if (nm) a.name = nm;
  for (const e of extras[k] ?? []) if (e.n === 'FOGSIG') a.fog = e.p.CATFOG;
  aids.push(a);
}

// dangers: rocks, wrecks and obstructions (points), with their depth where charted
const hazards = [];
for (const [n, k] of [['UWTROC', 'rock'], ['WRECKS', 'wreck'], ['OBSTRN', 'obstn']]) for (const f of all(n)) {
  const p = P(f), g = f.geometry, h = { k };
  if (p.VALSOU != null) h.d = p.VALSOU; if (p.WATLEV != null) h.wl = p.WATLEV; if (p.CATWRK != null) h.cw = p.CATWRK;
  if (g.type === 'Point') { if (!inBox(ll(g))) continue; h.p = qp(ll(g)); }
  else { const ps = polys(g).map(fillPoly).filter(Boolean); if (ps.length) h.f = ps; const ls = lines(g).flatMap(clipLine); if (ls.length) h.o = ls; if (!ps.length && !ls.length) continue; }
  hazards.push(h);
}

// names on the chart: waters (italic) and land, at the middle of each named area, with its size to pick a zoom to show it at
const names = [];
for (const [n, k] of [['SEAARE', 'sea'], ['LNDRGN', 'land'], ['LNDARE', 'land'], ['BRIDGE', 'bridge']]) for (const f of all(n)) {
  const p = P(f); if (!p.OBJNAM) continue;
  let best = null, bs = 0;
  for (const rings of polys(f.geometry)) { const r = clipRing(rings[0].slice(0, -1)); if (r.length < 3) continue; let s = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], c = x0 * y1 - x1 * y0; s += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
    if (Math.abs(s) > bs) { bs = Math.abs(s); best = [cx / (3 * s), cy / (3 * s)]; } }
  if (f.geometry.type === 'Point' && inBox(ll(f.geometry))) { best = ll(f.geometry); bs = 0; }
  if (!best || !inBox(best)) continue;
  const t = { k, t: p.OBJNAM, p: qp(best), size: Math.round(Math.sqrt(bs) * 111320 * 0.89) };
  if (n === 'BRIDGE' && p.VERCLR != null) t.clr = p.VERCLR;
  if (names.some(o => o.t === t.t && o.k === t.k && Math.hypot(o.p[0] - t.p[0], o.p[1] - t.p[1]) < 3000)) { const o = names.find(o => o.t === t.t && o.k === t.k); if (t.size > o.size) Object.assign(o, t); continue; }
  names.push(t);
}

const out = {
  source: 'NOAA Office of Coast Survey, Electronic Navigational Charts (S-57), https://charts.noaa.gov/ENCs/, public domain. ' +
    `Catalog ENCProdCat.xml of ${(cat.match(/<date_created>([^<]*)/) ?? [])[1]}. Not for navigation.`,
  made: 'scripts/fetch-charts.mjs',
  cells,
  units: 'positions: integer 1e-5 degrees WGS 84 [lon, lat], lines delta-coded; depths: metres below MLLW (sounding datum); heights and clearances: metres above MHW',
  box: BOX,
  depth: Object.entries(depth).map(([d, p]) => ({ d: +d, p })).sort((a, b) => a.d - b.d),
  contours: Object.entries(contours).map(([d, l]) => ({ d: +d, l })).sort((a, b) => a.d - b.d),
  land, built, structures, shore, piers, islets, soundings, areas, aids, hazards, names
};
writeFileSync(OUT, JSON.stringify(out));
const size = k => (JSON.stringify(out[k]).length / 1024).toFixed(0) + ' kB';
console.log('wrote', OUT, (JSON.stringify(out).length / 1024).toFixed(0), 'kB:', Object.keys(out).filter(k => typeof out[k] === 'object').map(k => `${k} ${size(k)}`).join(', '));
