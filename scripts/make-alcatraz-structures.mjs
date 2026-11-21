#!/usr/bin/env node
/**
 * Alcatraz's buildings (r254) from OpenStreetMap's footprints: the island's 28 building ways, for the minor buildings.
 * OSM's cellhouse, lighthouse and water tower are crude (a 2,832 m² cellhouse where the real one is about 142 × 50 m; a 14 m² lighthouse),
 * so those three keep only OSM's centre and the cellhouse's heading, and take their size from the National Historic
 * Landmark nomination (NHL, 1986: cellhouse 465 × 165 ft, lighthouse 84 ft, water tower 94 ft).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-alcatraz-structures.mjs [island.osm]
 *
 * Output: src/render/data/alcatraz-buildings.json. Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org.
 */
import { readFile, writeFile } from 'node:fs/promises';

const BOX = '-122.4285,37.8235,-122.4175,37.8300';
const xml = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${BOX}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } })).text();
const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
const MLAT = 111320, MLON = 111320 * Math.cos(37.8265 * Math.PI / 180), r7 = v => Math.round(v * 1e7) / 1e7;
const out = { source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: building ways on Alcatraz; the cellhouse, lighthouse and water tower sized from the NHL nomination (NPS, 1986).', made: 'scripts/make-alcatraz-structures.mjs', fetched: new Date().toISOString().slice(0, 10), buildings: [], cellhouse: null, lighthouse: null, waterTower: null };
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const t = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)].map(x => [x[1], x[2]]));
  if (!t.building && !t['building:part']) continue;
  const ring = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map(x => nodes.get(x[1])).filter(Boolean);
  if (ring.length < 4) continue;
  ring.pop(); // (closed: the last is the first)
  const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  const name = (t.name || '').replace(/&amp;/g, '&'), id = +m[1];
  if (id === 128245373) { // the Main Prison: OSM's centre, and the heading of its long axis (the principal axis of its corners)
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of ring) { const e = (p[1] - c[1]) * MLON, n = (p[0] - c[0]) * MLAT; sxx += e * e; syy += n * n; sxy += e * n; }
    const th = 0.5 * Math.atan2(2 * sxy, syy - sxx); // angle from north, toward east
    out.cellhouse = { at: [r7(c[0]), r7(c[1])], bearing: Math.round(((th * 180 / Math.PI) % 180 + 180) % 180 * 10) / 10, length: 141.7, width: 50.3 };
  } else if (id === 99202294) out.lighthouse = { at: [r7(c[0]), r7(c[1])], height: 25.6 };
  else if (id === 660870452) out.waterTower = { at: [r7(c[0]), r7(c[1])], height: 29 };
  else out.buildings.push({ osm: id, name, ruin: t.building === 'ruins' || !!t.ruins || t.historic === 'ruins', height: t.height ? +t.height : t['building:levels'] ? +t['building:levels'] * 3.5 : null, ring: ring.map(p => [r7(p[0]), r7(p[1])]) });
}
if (!out.cellhouse || !out.lighthouse || !out.waterTower) throw new Error('a main structure is missing');
await writeFile(new URL('../src/render/data/alcatraz-buildings.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(out.buildings.length, 'minor buildings; cellhouse', JSON.stringify(out.cellhouse), 'lighthouse', JSON.stringify(out.lighthouse), 'water tower', JSON.stringify(out.waterTower));
