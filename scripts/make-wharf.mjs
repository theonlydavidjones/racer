#!/usr/bin/env node
/**
 * The real waterfront from Fort Mason east past Fisherman's Wharf and Pier 39 to Pier 27, from OpenStreetMap, in place
 * of the sim's hand-drawn shore there (which ran straight across Aquatic Park and south of the Wharf, leaving Pier 39 and
 * the Wharf's piers as water).
 *  - coast: the shoreline (natural=coastline), west to east, from where marina-coast.json ends (Fort Mason) to where it
 *    reaches 122.4000 W, the east edge of the hand-drawn Cityfront (geo/shore.ts). OSM's coastline here runs round the
 *    solid-fronted piers: Pier 45, Pier 39, Piers 35 to 27.
 *  - piers: the structures the coastline leaves out, each solid: Municipal Pier (the curved one round Aquatic Park),
 *    Black Point Pier, Hyde Street Pier, Pier 47, Pier 41, Pier 33, the Fisherman's Wharf breakwater (man_made=pier or
 *    breakwater areas).
 *  - lines: breakwaters, and the floating docks and fingers of the Pier 39 marina and the Wharf's boat harbor
 *    (man_made=pier or breakwater lines), with a width each.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-wharf.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org. Output: src/geo/data/wharf.json
 */
import { readFile, writeFile } from 'node:fs/promises';

const BBOX = [-122.4290, 37.8040, -122.3990, 37.8135]; // W S E N
const EAST = -122.4000; // the hand-drawn Cityfront's east end (beyond it, the terrain's land mask governs)
const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX.join(',')}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
if (!res.ok) throw new Error(`OSM: HTTP ${res.status}`);
const xml = await res.text();

const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
const ways = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map(t => [t[1], t[2]]));
  const refs = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(x => x[1]);
  ways.push({ id: m[1], tags, refs });
}
const r7 = ([la, lo]) => [Math.round(la * 1e7) / 1e7, Math.round(lo * 1e7) / 1e7];
const pts = refs => refs.map(id => nodes.get(id)).filter(Boolean).map(r7);

// 1. the coastline, chained end to start (OSM's coastline runs with the land on its left: here, east to west), reversed
const coastWays = ways.filter(w => w.tags.natural === 'coastline').map(w => w.refs);
const byStart = new Map(coastWays.map(w => [w[0], w]));
const ends = new Set(coastWays.map(w => w.at(-1)));
let w = coastWays.find(x => !ends.has(x[0])), chain = [];
const used = new Set();
while (w && !used.has(w)) { used.add(w); chain.push(...(chain.length ? w.slice(1) : w)); w = byStart.get(w.at(-1)); }
if (used.size !== coastWays.length) console.warn(`chained ${used.size} of ${coastWays.length} coastline ways`);
const all = pts(chain).reverse(); // west to east
// from where the Marina's coast stops (its last point is an OSM coastline node)
const marina = JSON.parse(await readFile(new URL('../src/geo/data/marina-coast.json', import.meta.url), 'utf8')).coast;
const last = marina.at(-1), i0 = all.findIndex(p => Math.abs(p[0] - last[0]) < 1e-6 && Math.abs(p[1] - last[1]) < 1e-6);
if (i0 < 0) throw new Error('the coastline does not pass through the end of marina-coast.json');
const coast = [];
for (let i = i0 + 1; i < all.length; i++) {
  const p = all[i], q = all[i - 1];
  if (p[1] >= EAST) { const t = (EAST - q[1]) / (p[1] - q[1]); coast.push(r7([q[0] + (p[0] - q[0]) * t, EAST])); break; }
  coast.push(p);
}

// 2. piers and breakwaters
const piers = [], lines = [];
for (const w of ways) {
  const k = w.tags.man_made; if (k !== 'pier' && k !== 'breakwater') continue;
  const p = pts(w.refs); if (p.length < 2) continue;
  const name = w.tags.name;
  if (w.refs[0] === w.refs.at(-1) && p.length >= 4) piers.push({ ...(name ? { name } : {}), kind: k, pts: p.slice(0, -1) });
  else {
    // a floating dock's main walkway is named ("C Dock"); the short unnamed ones off it are its fingers
    const L = p.slice(1).reduce((s, q, i) => s + Math.hypot((q[0] - p[i][0]) * 111320, (q[1] - p[i][1]) * 88000), 0);
    const width = k === 'breakwater' ? 6 : name || L > 30 ? 2.4 : 1.0;
    lines.push({ ...(name ? { name } : {}), kind: k === 'breakwater' ? 'breakwater' : width > 2 ? 'dock' : 'finger', width, pts: p });
  }
}
await writeFile(new URL('../src/geo/data/wharf.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: natural=coastline (chained west to east), man_made=pier and breakwater.',
  fetched: new Date().toISOString().slice(0, 10), coast, piers, lines
}) + '\n');
console.log(`coast ${coast.length} points to ${coast.at(-1)}; ${piers.length} pier and breakwater areas (${piers.filter(p => p.name).map(p => p.name).join(', ')}); ${lines.length} lines`);
