#!/usr/bin/env node
/**
 * The real shoreline around the San Francisco Marina, from OpenStreetMap: the Marina Green seawall, the West Harbor's
 * basin, and the jetty (Yacht Road, the yacht clubs and the Wave Organ) out to its tip by the entrance beacon. It
 * replaces the sim's hand-drawn Cityfront shore over this stretch (geo/shore.ts), so the harbor's entrance is where it
 * really is: open to the east, between the jetty's tip and the Marina Green.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-marina-coast.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org (natural=coastline ways). Output, west to east:
 * src/geo/data/marina-coast.json
 */
import { writeFile } from 'node:fs/promises';

const BBOX = [-122.4560, 37.8040, -122.4310, 37.8115]; // W S E N
const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX.join(',')}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
if (!res.ok) throw new Error(`OSM: HTTP ${res.status}`);
const xml = await res.text();

const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
const ways = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  if (!/<tag k="natural" v="coastline"\/>/.test(m[2])) continue;
  ways.push([...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(x => x[1]));
}
// chain the ways end to start (coastline runs with the land on its left: here, east to west)
const byStart = new Map(ways.map(w => [w[0], w]));
const ends = new Set(ways.map(w => w.at(-1)));
let w = ways.find(x => !ends.has(x[0])), chain = [];
const used = new Set();
while (w && !used.has(w)) { used.add(w); chain.push(...(chain.length ? w.slice(1) : w)); w = byStart.get(w.at(-1)); }
if (used.size !== ways.length) console.warn(`chained ${used.size} of ${ways.length} coastline ways`);
const pts = chain.map(id => nodes.get(id)).filter(Boolean).reverse() // west to east
  .map(([la, lo]) => [Math.round(la * 1e7) / 1e7, Math.round(lo * 1e7) / 1e7]);
await writeFile(new URL('../src/geo/data/marina-coast.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: natural=coastline, chained west to east.',
  fetched: new Date().toISOString().slice(0, 10), coast: pts
}) + '\n');
console.log(`${pts.length} points, from ${pts[0]} to ${pts.at(-1)}`);
