#!/usr/bin/env node
/**
 * The Golden Gate Bridge's San Francisco end from the lidar and OSM (r296): the four pylon columns (S1 and S2, two columns
 * each, either side of the roadway) and the South Anchorage housing. Footprints are OSM ways 1560010162 to 1560010165 and
 * 1560010167 (© OpenStreetMap contributors); heights and the stepped art-deco profile are the USGS 3DEP lidar's
 * (CA_SanFrancisco_1_B23, flown 2023-04-20; public domain): for each 2 m of height, the smallest rectangle round the
 * footprint's cells that stand that high is one slab of a stack, so the steps come from the surface and not a guess.
 * Writes src/render/data/gg-south.json for render/ggSouth.ts.
 *
 *   node scripts/make-gg-south.mjs [--cache <dir>]
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createLazPerf } = require('laz-perf');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('--cache', null); if (CACHE) await mkdir(CACHE, { recursive: true });
const EPT = 'https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23', DATUM = 0.969, SLAB = 2, CELL = 0.5;
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const K = 1 / Math.cos(37.8105 * Math.PI / 180); // Web Mercator metres per ground metre here
const merc = (lat, lon) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];
const sim = (lat, lon) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
const IDS = { 1560010162: 'S1 east', 1560010163: 'S1 west', 1560010164: 'S2 east', 1560010165: 'S2 west', 1560010167: 'South Anchorage' };
const r2 = v => Math.round(v * 100) / 100;

const feats = [];
for (const id of Object.keys(IDS)) {
  const w = await (await fetch(`https://api.openstreetmap.org/api/0.6/way/${id}/full.json`)).json();
  const nd = new Map(w.elements.filter(e => e.type === 'node').map(n => [n.id, n]));
  const ring = w.elements.find(e => e.type === 'way').nodes.map(i => [nd.get(i).lat, nd.get(i).lon]).slice(0, -1);
  feats.push({ id: +id, name: IDS[id], ring, m: ring.map(([a, b]) => merc(a, b)), top: [], low: [] });
}
const x0 = Math.min(...feats.flatMap(f => f.m.map(p => p[0]))) - 6, x1 = Math.max(...feats.flatMap(f => f.m.map(p => p[0]))) + 6;
const y0 = Math.min(...feats.flatMap(f => f.m.map(p => p[1]))) - 6, y1 = Math.max(...feats.flatMap(f => f.m.map(p => p[1]))) + 6;
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
for (const f of feats) { f.box = [Math.min(...f.m.map(p => p[0])), Math.min(...f.m.map(p => p[1])), Math.max(...f.m.map(p => p[0])), Math.max(...f.m.map(p => p[1]))]; f.cells = new Map(); f.ground = []; }

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
    if (c !== 1 && c !== 2) continue;
    const x = dv.getInt32(0, true) * sc[0] + of[0], y = dv.getInt32(4, true) * sc[1] + of[1], h = dv.getInt32(8, true) * sc[2] + of[2];
    for (const f of feats) {
      if (x < f.box[0] || x > f.box[2] || y < f.box[1] || y > f.box[3] || !inside(f.m, x, y)) continue;
      if (c === 2) f.ground.push(h);
      else { const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`; const o = f.cells.get(k); if (!o || h > o[2]) f.cells.set(k, [x, y, h]); }
      used++; break;
    }
  }
  z.delete(); lp._free(ptr); lp._free(rec);
};
for (const k of nodes) decode(await getNode(k));
console.log(`${nodes.length} nodes, ${used} points inside the footprints`);

/** The smallest rectangle (any heading, to 3°) round some points, as { cx, cy, w, d, a } in Web Mercator metres. */
function fit(pts) {
  let best = { area: Infinity };
  for (let d = 0; d < 90; d += 3) {
    const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of pts) { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    u0 -= CELL / 2; u1 += CELL / 2; v0 -= CELL / 2; v1 += CELL / 2;
    if ((u1 - u0) * (v1 - v0) < best.area) best = { area: (u1 - u0) * (v1 - v0), a, u0, u1, v0, v1 };
  }
  const c = Math.cos(best.a), s = Math.sin(best.a), mu = (best.u0 + best.u1) / 2, mv = (best.v0 + best.v1) / 2;
  return { cx: mu * c - mv * s, cy: mu * s + mv * c, w: (best.u1 - best.u0) / K, d: (best.v1 - best.v0) / K, a: best.a };
}
const unmerc = (x, y) => [(2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI, x / 20037508.342789244 * 180];
const out = { source: 'USGS 3DEP lidar CA_SanFrancisco_1_B23 (flown 2023-04-20; public domain) and OpenStreetMap ways 1560010162 to 1560010167 (© OpenStreetMap contributors); scripts/make-gg-south.mjs', datum: 'scene metres = NAVD88 less 0.969 m', parts: [] };
for (const f of feats) {
  const cells = [...f.cells.values()], hs = cells.map(c => c[2]).sort((a, b) => a - b);
  const gnd = f.ground.length ? Math.min(...f.ground) : hs[0];
  const base = hs[Math.floor(hs.length * 0.02)] < gnd ? hs[Math.floor(hs.length * 0.02)] : gnd; // (the lowest the lidar reaches)
  const top = hs[Math.floor(hs.length * 0.995)];
  const slabs = [];
  for (let z = Math.floor(base / SLAB) * SLAB; z < top; z += SLAB) {
    const up = cells.filter(c => c[2] >= z + SLAB / 2); if (up.length < 8) break;
    const r = fit(up.map(c => [c[0], c[1]])), [lat, lon] = unmerc(r.cx, r.cy), [x, y] = sim(lat, lon);
    // (the housing's top: above it the lidar's footprint holds the roadway passing over, about 32 m wide, which the bridge's own deck draws)
    if (f.name === 'South Anchorage' && slabs.length && r.w < 0.85 * slabs[0].w / 1) break;
    slabs.push({ z0: r2(Math.max(z, base) - DATUM), z1: r2(Math.min(z + SLAB, top) - DATUM), x: r2(x), y: r2(y), w: r2(r.w), d: r2(r.d), a: r2(r.a) }); // a: heading of the w axis from east, radians
  }
  // (slabs that match their neighbor's rectangle within 0.2 m are one)
  const merged = []; for (const sl of slabs) { const l = merged[merged.length - 1]; if (l && Math.abs(l.w - sl.w) < 0.2 && Math.abs(l.d - sl.d) < 0.2 && Math.abs(l.x - sl.x) < 0.2 && Math.abs(l.y - sl.y) < 0.2) l.z1 = sl.z1; else merged.push({ ...sl }); }
  out.parts.push({ id: f.id, name: f.name, ground: r2(gnd - DATUM), top: r2(top - DATUM), ring: f.ring.map(([a, b]) => sim(a, b).map(r2)), slabs: merged });
  console.log(`${f.name.padEnd(16)} ${cells.length} cells, ground ${r2(gnd - DATUM)}, top ${r2(top - DATUM)}, ${merged.length} slabs; widths ${merged.map(s => `${s.w}×${s.d}`).join(' ')}`);
}
await writeFile(new URL('../src/render/data/gg-south.json', import.meta.url), JSON.stringify(out) + '\n');
