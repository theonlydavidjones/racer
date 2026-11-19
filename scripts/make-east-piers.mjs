#!/usr/bin/env node
/**
 * The piers out in the open water of the East Bay and the north reach, from OpenStreetMap: solid, so a boat runs into
 * them (geo/shore.ts adds them to the Wharf's piers), and drawn by render/eastBay.ts.
 * - The Berkeley Pier (way 32211603, an area): the deck from the foot of University Avenue out about 900 m (3,000 ft),
 *   open to anglers 1937–2015 (Wikipedia, "Berkeley Pier"). The deck as mapped is about 6.6 m wide.
 * - Its abandoned outer part (way 28844087, a line): 3.2 km more out toward the old ferry terminal, piles and broken
 *   deck "still emerging in places" (Wikipedia). Solid along its line, 4 m wide: a boat can't sail between the piles.
 *   OSM leaves a gap of about 45 m between it and the end of the usable deck; it's closed here, the ruin's line begun at
 *   the deck's end, so the pier and its ruin are one hazard from the shore to Berkeley Marina Channel Light 2 by its west
 *   end. No chart or notice gives a passage through it: Coast Pilot 7 (ch. 7, para. 322, 2026) says only "the outer
 *   1.7 miles of the pier is in ruins", the broken piles there may be awash or under water, and the one break sailors
 *   speak of, at the deck's end, a long-time Berkeley Marina sailor advises against (Latitude 38, "Is There a Safe Break
 *   in the Berkeley Pier?"). The physics review's soak, 18 Nov 2026: the passage planner threaded that gap 22 m off the
 *   ruin, and the pilot ran her onto it.
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
// (the ruin joined to the deck's end: the middle of the deck's two outermost corners, its first two nodes as mapped)
{ const deck = piers.find(p => p.name === 'Berkeley Pier'), ruin = lines.find(l => l.kind === 'ruin');
  const [a, b] = deck.pts, end = [r7((a[0] + b[0]) / 2), r7((a[1] + b[1]) / 2)];
  ruin.pts = [end, ...ruin.pts]; ruin.joined = 'begun at the usable deck\'s end (the 45 m gap OSM leaves closed: see the script)'; }
await writeFile(new URL('../src/geo/data/east-piers.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), api.openstreetmap.org: ways ' + WAYS.map(w => w.id).join(', '), fetched: new Date().toISOString().slice(0, 10), piers, lines
}) + '\n');
