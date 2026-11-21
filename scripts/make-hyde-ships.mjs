#!/usr/bin/env node
/**
 * The ships at Hyde Street Pier (r296 phase 2): their hull outlines and berths from OpenStreetMap, where they are mapped as ways
 * with `historic=ship` (the ones now away carry `removed:name`: OSM's note says they were "moved to Mare Island/Vallejo while Hyde
 * Street Pier is being rebuilt", and the outlines stay as the berths they held). Lengths and beams to check them against are NPS's
 * (nps.gov/safr: Balclutha 256.5 ft × 38.65 ft, C.A. Thayer 219 ft overall, Eureka 299.5 ft, Hercules 151 ft × 26 ft, Alma 59 ft registered
 * and 80 ft overall).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-hyde-ships.mjs [island.osm]
 *
 * Output: src/render/data/hyde-ships.json. Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org.
 */
import { readFile, writeFile } from 'node:fs/promises';

const BOX = '-122.4250,37.8075,-122.4180,37.8110';
const xml = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${BOX}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } })).text();
const nodes = new Map(); for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
const NAMES = { 165579428: 'Alma', 165579429: 'Eureka', 165579430: 'Hercules', 165580087: 'Eppleton Hall', 165585930: 'Balclutha', 165586834: 'C. A. Thayer' };
const r7 = v => Math.round(v * 1e7) / 1e7, ships = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const t = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)].map(x => [x[1], x[2]]));
  if (!t['ship:type']) continue;
  const ring = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map(x => nodes.get(x[1])).filter(Boolean); ring.pop();
  const name = t.name || t['removed:name'] || NAMES[m[1]];
  ships.push({ osm: +m[1], name, type: t['ship:type'], built: +t.start_date || null, away: !t.name && !!t['removed:name'], ring: ring.map(([a, b]) => [r7(a), r7(b)]) });
}
if (ships.length !== 6) throw new Error(`expected six ships, found ${ships.length}`);
await writeFile(new URL('../src/render/data/hyde-ships.json', import.meta.url), JSON.stringify({ source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: historic=ship ways at Hyde Street Pier; names from the ways\' name or removed:name', made: 'scripts/make-hyde-ships.mjs', fetched: new Date().toISOString().slice(0, 10), ships }) + '\n');
console.log(ships.map(s => `${s.name} (${s.type}, ${s.ring.length} pts${s.away ? ', away per OSM' : ''})`).join('; '));
