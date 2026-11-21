#!/usr/bin/env node
/**
 * The piers out in the open water of the East Bay and the north reach, from OpenStreetMap: solid, so a boat runs into
 * them (geo/shore.ts adds them to the Wharf's piers), and drawn by render/eastBay.ts.
 * - The Berkeley Pier (way 32211603, an area): the deck from the foot of University Avenue out about 900 m (3,000 ft),
 *   open to anglers 1937–2015 (Wikipedia, "Berkeley Pier"). The deck as mapped is about 6.6 m wide.
 * - Its abandoned outer part (way 28844087, a line): 3.2 km more out toward the old ferry terminal, piles and broken
 *   deck "still emerging in places" (Wikipedia), past a gap of about 45 m at the end of the usable deck. Solid along
 *   its line, 4 m wide: a boat can't sail between the piles.
 * - Chevron's Long Wharf at Richmond (way 35442255, an area): the causeway from the shore by Point Richmond and its
 *   T-head of tanker berths.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-east-piers.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org. Output: src/geo/data/east-piers.json, in the form of
 * wharf.json (piers: areas; lines: centre lines with a width).
 */
import { writeFile } from 'node:fs/promises';

const WAYS = [
  { id: 32211603, name: 'Berkeley Pier', kind: 'pier', area: true },
  { id: 28844087, name: 'Berkeley Pier (abandoned)', kind: 'ruin', area: false, width: 4 },
  { id: 35442255, name: 'Long Wharf (Chevron, Richmond)', kind: 'pier', area: true }
];
const r7 = x => Math.round(x * 1e7) / 1e7;
const piers = [], lines = [];
for (const w of WAYS) {
  let xml = null;
  for (let a = 0; a < 4 && !xml; a++) {
    try { const res = await fetch(`https://api.openstreetmap.org/api/0.6/way/${w.id}/full`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } }); if (res.ok) xml = await res.text(); } catch { /* retry */ }
    if (!xml) await new Promise(r => setTimeout(r, 2000 * 2 ** a));
  }
  if (!xml) throw new Error(`way ${w.id}`);
  const nodes = new Map([...xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(m => [m[1], [r7(+m[2]), r7(+m[3])]]));
  const pts = [...xml.matchAll(/<nd ref="(\d+)"\/>/g)].map(m => nodes.get(m[1]));
  if (w.area) piers.push({ name: w.name, kind: w.kind, pts: pts.slice(0, -1) }); // (closed: the last node repeats the first)
  else lines.push({ name: w.name, kind: w.kind, width: w.width, pts });
  console.log(w.name, pts.length, 'nodes');
}
await writeFile(new URL('../src/geo/data/east-piers.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), api.openstreetmap.org: ways ' + WAYS.map(w => w.id).join(', '), fetched: new Date().toISOString().slice(0, 10), piers, lines
}) + '\n');
