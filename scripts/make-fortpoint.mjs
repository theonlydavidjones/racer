#!/usr/bin/env node
/**
 * Fort Point from the lidar surface (r296 phase 1b): reads make-fortpoint-dsm.mjs's grid and writes
 * src/render/data/fortpoint.json for render/fortPoint.ts. Everything is measured, not drawn by hand:
 *   - the outline: OSM way 370509217, in the sim's course metres (x east, y north from LAT0/LON0);
 *   - the heights, as scene metres (NAVD88 less 0.969 m, as the Alcatraz step): the rock outside the walls, the courtyard
 *     floor, the barbette (roof) level, the parapet on the roof's edge, and the lighthouse's top;
 *   - the courtyard, the open middle, as a rectangle along the outline's longest edge; the parapet is +1 m (the lidar's
 *     18.6 m against the roof's 17.7 m, NAVD88, in a band about 2.5 m wide along every outer edge).
 *
 *   node scripts/make-fortpoint-dsm.mjs dsm.json --cache <dir>; node scripts/make-fortpoint.mjs dsm.json
 */
import { readFile, writeFile } from 'node:fs/promises';
const DATUM = 0.969, LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const merc = (lat, lon) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];
const K = 1 / Math.cos(37.8105 * Math.PI / 180); // Web Mercator metres per ground metre here
const d = JSON.parse(await readFile(process.argv[2], 'utf8')), { nx, ny, cell } = d;
const cx = i => d.x0 + (i % nx + 0.5) * cell, cy = i => d.y1 - (Math.floor(i / nx) + 0.5) * cell; // (Web Mercator)
const pm = d.ring.map(([a, b]) => merc(a, b));
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const segDist = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy); };
const med = a => { a = a.filter(v => v != null).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const pct = (a, p) => { a = a.filter(v => v != null).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const r2 = v => Math.round(v * 100) / 100;
const sc = z => z - DATUM; // NAVD88 → scene

const inFort = new Uint8Array(nx * ny);
for (let i = 0; i < nx * ny; i++) inFort[i] = inside(pm, cx(i), cy(i)) ? 1 : 0;
// the lighthouse: OSM building:part 1358282761, a ring on the courtyard side
const LIGHT = { lat: 37.810543, lon: -122.477295, r: 2.2 }, lm = merc(LIGHT.lat, LIGHT.lon);
const inLight = i => Math.hypot(cx(i) - lm[0], cy(i) - lm[1]) < LIGHT.r * K;

// the roof level: the commonest height between 15 and 20 m in the fort
const roofs = []; for (let i = 0; i < nx * ny; i++) if (inFort[i] && !inLight(i) && d.top[i] != null && d.top[i] > 15 && d.top[i] < 20) roofs.push(d.top[i]);
const roof = med(roofs), courts = []; for (let i = 0; i < nx * ny; i++) if (inFort[i] && d.top[i] != null && d.top[i] < 8) courts.push(d.top[i]);
const court = med(courts);
// the rock outside the walls: the lowest ground, 2 to 6 m outside the outline
const rock = []; for (let i = 0; i < nx * ny; i++) { if (inFort[i] || d.low[i] == null) continue; const p = [cx(i), cy(i)]; let m = 1e9; for (let j = 0; j < pm.length - 1; j++) m = Math.min(m, segDist(p, pm[j], pm[j + 1])); if (m > 2 * K && m < 6 * K) rock.push(d.low[i]); }
const ground = med(rock);

const loc = ([x, y]) => { const lon = x / 20037508.342789244 * 180, lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI; return [r2((lon - LON0) * MLON), r2((lat - LAT0) * MLAT)]; };
// the courtyard: the fort's open middle, the cells inside the outline that are low (under 8 m): the smallest rectangle
// along the outline's longest edge that holds them (1st to 99th percentile, so a stray return doesn't stretch it)
const L0 = pm.reduce((best, p, j) => j < pm.length - 1 && Math.hypot(pm[j + 1][0] - p[0], pm[j + 1][1] - p[1]) > best.len ? { j, len: Math.hypot(pm[j + 1][0] - p[0], pm[j + 1][1] - p[1]) } : best, { j: 0, len: 0 });
const ux = (pm[L0.j + 1][0] - pm[L0.j][0]) / L0.len, uy = (pm[L0.j + 1][1] - pm[L0.j][1]) / L0.len, us = [], vs = [];
for (let i = 0; i < nx * ny; i++) if (inFort[i] && d.top[i] != null && d.top[i] < 8 && !inLight(i)) { us.push(cx(i) * ux + cy(i) * uy); vs.push(-cx(i) * uy + cy(i) * ux); }
const [u0, u1, v0, v1] = [pct(us, 0.01), pct(us, 0.99), pct(vs, 0.01), pct(vs, 0.99)];
const court4 = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => loc([u * ux - v * uy, u * uy + v * ux]));
const ring = d.ring.map(([a, b]) => [r2((b - LON0) * MLON), r2((a - LAT0) * MLAT)]);
const lt = []; for (let i = 0; i < nx * ny; i++) if (inLight(i) && d.top[i] != null && d.top[i] < 30) lt.push(d.top[i]); // (not the bridge's deck over it)
const out = {
  source: 'USGS 3DEP lidar CA_SanFrancisco_1_B23 (flown 2023-04-20; public domain) and OpenStreetMap way 370509217 (© OpenStreetMap contributors); scripts/make-fortpoint.mjs',
  ring, rock: r2(sc(ground)), court: r2(sc(court)), roof: r2(sc(roof)), parapet: 1, lightTop: r2(sc(pct(lt, 0.98))),
  light: [r2((LIGHT.lon - LON0) * MLON), r2((LIGHT.lat - LAT0) * MLAT)],
  courtyard: court4,
};
console.log(`rock ${out.rock}, courtyard ${out.court}, roof ${out.roof}, parapet +${out.parapet}, light top ${out.lightTop} (scene m)`);
console.log('courtyard corners', JSON.stringify(out.courtyard), `${r2((u1 - u0) / K)} × ${r2((v1 - v0) / K)} m`);
await writeFile(new URL('../src/render/data/fortpoint.json', import.meta.url), JSON.stringify(out) + '\n');
