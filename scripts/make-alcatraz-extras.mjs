#!/usr/bin/env node
/**
 * Alcatraz's walls and dock from OSM and the lidar (r296): the island's retaining walls and walls (OSM barrier=wall and
 * barrier=retaining_wall ways, the terraces and the sea wall that show from the water), the ferry dock (the pier ways 27999864,
 * the Alcatraz Ferry Terminal, and 27609572) and the cistern (way 396629347) (© OpenStreetMap contributors). Heights are the
 * USGS 3DEP lidar's (CA_SanFrancisco_1_B23, flown 2023-04-20; public domain): for each wall segment, the 90th percentile of the
 * returns within 0.9 m of it and the lowest return there (its foot); for the dock, the 90th percentile inside it.
 * Scene metres (NAVD88 less 0.969 m). Writes src/render/data/alcatraz-extras.json for render/alcatrazExtras.ts.
 *
 *   node scripts/make-alcatraz-extras.mjs [--cache <dir>]
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createLazPerf } = require('laz-perf');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('--cache', null); if (CACHE) await mkdir(CACHE, { recursive: true });
const EPT = 'https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23', DATUM = 0.969;
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const sim = (lat, lon) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
const merc = (lat, lon) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];
const K = 1 / Math.cos(37.8265 * Math.PI / 180), r2 = v => Math.round(v * 100) / 100;

const xml = await (await fetch('https://api.openstreetmap.org/api/0.6/map?bbox=-122.4265,37.8245,-122.4200,37.8295', { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } })).text();
const nodes = new Map([...xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(m => [m[1], [+m[2], +m[3]]]));
const walls = [], docks = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const t = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)].map(x => [x[1], x[2]])), pts = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map(x => nodes.get(x[1])).filter(Boolean);
  if (pts.length < 2) continue;
  const ll = pts.map(([a, b]) => ({ lat: a, lon: b, m: merc(a, b), s: sim(a, b) }));
  if (t.barrier === 'wall' || t.barrier === 'retaining_wall') walls.push({ id: +m[1], kind: t.barrier, pts: ll, segs: [] });
  else if (m[1] === '27999864' || m[1] === '27609572' || m[1] === '396629347') docks.push({ id: +m[1], name: t.name || (t.man_made || ''), closed: pts.length > 3, pts: ll, z: [] });
}
console.log(`${walls.length} walls, ${docks.length} dock/cistern ways`);
const allm = [...walls, ...docks].flatMap(w => w.pts.map(p => p.m)), pad = 3 * K;
const x0 = Math.min(...allm.map(p => p[0])) - pad, x1 = Math.max(...allm.map(p => p[0])) + pad, y0 = Math.min(...allm.map(p => p[1])) - pad, y1 = Math.max(...allm.map(p => p[1])) + pad;
for (const w of walls) for (let i = 0; i < w.pts.length - 1; i++) w.segs.push({ a: w.pts[i], b: w.pts[i + 1], z: [], lo: [] });
const segDist = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy); };
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };

const ept = await (await fetch(`${EPT}/ept.json`)).json(), [bx0, by0, , bx1] = ept.bounds, size = bx1 - bx0, tiles = [];
const walk = async key => {
  const h = await (await fetch(`${EPT}/ept-hierarchy/${key}.json`)).json();
  for (const [k, n] of Object.entries(h)) {
    const [d, x, y] = k.split('-').map(Number), s = size / 2 ** d, nx = bx0 + x * s, ny = by0 + y * s;
    if (nx > x1 || nx + s < x0 || ny > y1 || ny + s < y0) continue;
    if (n === -1) await walk(k); else if (n > 0) tiles.push(k);
  }
};
await walk('0-0-0-0');
const lp = await createLazPerf();
const getNode = async k => {
  const f = CACHE && `${CACHE}/${k}.laz`; if (f && existsSync(f)) return readFile(f);
  const r = await fetch(`${EPT}/ept-data/${k}.laz`); if (!r.ok) throw new Error(`${k}: HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer()); if (f) await writeFile(f, b); return b;
};
const decode = buf => {
  const sc = [buf.readDoubleLE(131), buf.readDoubleLE(139), buf.readDoubleLE(147)], of = [buf.readDoubleLE(155), buf.readDoubleLE(163), buf.readDoubleLE(171)];
  const ptr = lp._malloc(buf.length); lp.HEAPU8.set(buf, ptr);
  const z = new lp.LASZip(); z.open(ptr, buf.length);
  if (z.getPointFormat() !== 1) throw new Error(`point format ${z.getPointFormat()}`);
  const n = z.getCount(), rec = lp._malloc(z.getPointLength());
  for (let i = 0; i < n; i++) {
    z.getPoint(rec); const dv = new DataView(lp.HEAPU8.buffer, rec, 29), c = dv.getUint8(15) & 31;
    if (c !== 1 && c !== 2) continue;
    const x = dv.getInt32(0, true) * sc[0] + of[0], y = dv.getInt32(4, true) * sc[1] + of[1];
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const h = dv.getInt32(8, true) * sc[2] + of[2];
    for (const w of walls) for (const s of w.segs) { if (segDist([x, y], s.a.m, s.b.m) < 0.9 * K) { s.z.push(h); } }
    for (const d of docks) if (d.closed ? inside(d.pts.map(p => p.m), x, y) : d.pts.slice(1).some((p, k) => segDist([x, y], d.pts[k].m, p.m) < 2 * K)) d.z.push(h);
  }
  z.delete(); lp._free(ptr); lp._free(rec);
};
for (const k of tiles) decode(await getNode(k));
const pct = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const out = { source: 'OpenStreetMap ways (barrier=wall, barrier=retaining_wall, 27999864, 27609572, 396629347; © OpenStreetMap contributors) and USGS 3DEP lidar CA_SanFrancisco_1_B23 (flown 2023-04-20; public domain); scripts/make-alcatraz-extras.mjs', datum: 'scene metres = NAVD88 less 0.969 m', walls: [], docks: [] };
let kept = 0;
for (const w of walls) {
  const segs = w.segs.filter(s => s.z.length >= 6).map(s => ({ a: s.a.s.map(r2), b: s.b.s.map(r2), top: r2(pct(s.z, 0.9) - DATUM), foot: r2(Math.min(...s.z) - DATUM) })).filter(s => s.top - s.foot > 0.3 && s.top > 0.2);
  if (segs.length) { out.walls.push({ id: w.id, kind: w.kind, segs }); kept += segs.length; }
}
for (const d of docks) out.docks.push({ id: d.id, name: d.name, closed: d.closed, ring: d.pts.map(p => p.s.map(r2)), top: d.z.length > 20 ? r2(pct(d.z, 0.9) - DATUM) : null, returns: d.z.length });
console.log(`${out.walls.length} walls kept (${kept} segments)`, out.docks.map(d => `${d.id} ${d.name} top ${d.top} (${d.returns} returns)`).join('; '));
await writeFile(new URL('../src/render/data/alcatraz-extras.json', import.meta.url), JSON.stringify(out) + '\n');
