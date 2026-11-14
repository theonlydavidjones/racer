#!/usr/bin/env node
/**
 * The piers that stand on open piles with a shed on top, from OpenStreetMap: Fort Mason's Piers 1–3, by Gashouse Cove
 * (the owner, 13 Nov 2026: at Fort Mason's pier the tidal current flows under the pile field while the shed blocks the
 * wind). Each is its shed's outline (building=*, which covers the pier's deck nearly to its edges) and the shed's height
 * as OSM records it (height=*, m).
 *  - The current runs under them (environment/current.ts: the shore relief and the harbors' still water don't count them
 *    as shore), slowed by the piles.
 *  - The wind meets the shed: a bluff body's lee (environment/shadows.ts).
 *  - A boat still can't sail through one (geo/shore.ts onLand: the coastline runs round them, unchanged).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-pile-piers.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org. Output: src/geo/data/pile-piers.json
 */
import { writeFile } from 'node:fs/promises';

/** The sheds' ways: Pier 1, Pier 2 (Herbst Pavilion), Pier 3 (Festival Pavilion). */
const WAYS = [288387751, 288387752, 288387753];
const BBOX = [-122.4345, 37.8060, -122.4280, 37.8125]; // W S E N
const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX.join(',')}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
if (!res.ok) throw new Error(`OSM: HTTP ${res.status}`);
const xml = await res.text();
const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
const r7 = ([la, lo]) => [Math.round(la * 1e7) / 1e7, Math.round(lo * 1e7) / 1e7];
const piers = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  if (!WAYS.includes(+m[1])) continue;
  const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map(t => [t[1], t[2]]));
  const pts = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(x => nodes.get(x[1])).filter(Boolean).map(r7);
  if (!tags.height) throw new Error(`way ${m[1]}: no height`);
  piers.push({ name: tags.name, way: +m[1], height: +tags.height, pts });
}
if (piers.length !== WAYS.length) throw new Error(`found ${piers.length} of ${WAYS.length} sheds`);
await writeFile('src/geo/data/pile-piers.json', JSON.stringify({ source: 'OpenStreetMap contributors (ODbL)', fetched: new Date().toISOString().slice(0, 10), piers }, null, 0) + '\n');
console.log(piers.map(p => `${p.name}: ${p.height} m, ${p.pts.length} points`).join('\n'));
