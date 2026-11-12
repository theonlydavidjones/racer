#!/usr/bin/env node
/**
 * Lime Point, the Marin foot of the Golden Gate Bridge, from OpenStreetMap's coastline in place of the terrain's 50 m
 * cells (which put the point's shore 60–80 m too far north, leaving the Lime Point light standing in the water and the
 * hill wrapped round the north tower's base). OSM's coastline here runs round the north tower's base and out along the
 * little spit the light stands on (it is mapped from the USGS 24K topo, the Marin assessor's survey and Bing imagery).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-lime-point.mjs
 *
 * The coastline (natural=coastline, chained; OSM keeps the land on its left) is clipped to BOX and closed through the
 * box's north-west corner, inland: the land inside the box. Output: src/geo/data/lime-point.json
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org.
 */
import { writeFile } from 'node:fs/promises';

const BOX = { south: 37.8230, north: 37.8300, west: -122.4935, east: -122.4760 }; // south of Horseshoe Bay's breakwater
const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${[BOX.west - 0.004, BOX.south - 0.004, BOX.east + 0.004, BOX.north + 0.004].join(',')}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
if (!res.ok) throw new Error(`OSM: HTTP ${res.status}`);
const xml = await res.text();
const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
const coast = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  if (!/<tag k="natural" v="coastline"\/>/.test(m[2])) continue;
  const refs = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(t => t[1]);
  if (refs[0] !== refs.at(-1)) coast.push(refs); // (closed rings are rocks offshore)
}
// chain the open ways end to start
const byStart = new Map(coast.map(w => [w[0], w])), ends = new Set(coast.map(w => w.at(-1)));
// (the longest chain: the download's edge can cut the coast into pieces)
let chain = [];
for (const s of coast.filter(x => !ends.has(x[0]))) {
  const c = [], used = new Set(); let w = s;
  while (w && !used.has(w)) { used.add(w); c.push(...(c.length ? w.slice(1) : w)); w = byStart.get(w.at(-1)); }
  if (c.length > chain.length) chain = c;
}
const pts = chain.map(id => nodes.get(id)).filter(Boolean);
// clip to the box: the stretch inside it, from where it comes in to where it goes out
const inB = ([la, lo]) => la >= BOX.south && la <= BOX.north && lo >= BOX.west && lo <= BOX.east;
const i0 = pts.findIndex(inB); let i1 = i0; while (i1 + 1 < pts.length && inB(pts[i1 + 1])) i1++;
if (i0 <= 0 || i1 >= pts.length - 1) throw new Error('the coastline does not cross the box');
const cut = (a, b) => { // where a→b crosses the box's edge
  let t = 1;
  for (const [k, v] of [[0, BOX.south], [0, BOX.north], [1, BOX.west], [1, BOX.east]]) { const s = (v - a[k]) / (b[k] - a[k]); if (s > 0 && s < t) { const q = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]; if (q[0] >= BOX.south - 1e-9 && q[0] <= BOX.north + 1e-9 && q[1] >= BOX.west - 1e-9 && q[1] <= BOX.east + 1e-9) t = s; } }
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};
const enter = cut(pts[i0], pts[i0 - 1]), leave = cut(pts[i1], pts[i1 + 1]);
if (Math.abs(enter[1] - BOX.west) > 1e-7 || Math.abs(leave[0] - BOX.north) > 1e-7) throw new Error(`expected the coast in from the west and out to the north: ${enter} ${leave}`);
const r7 = ([a, b]) => [Math.round(a * 1e7) / 1e7, Math.round(b * 1e7) / 1e7];
// the land: along the coast, then back inland through the north-west corner
const land = [enter, ...pts.slice(i0, i1 + 1), leave, [BOX.north, BOX.west]].map(r7);
await writeFile(new URL('../src/geo/data/lime-point.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: natural=coastline, clipped to the box and closed inland.',
  made: 'scripts/make-lime-point.mjs', fetched: new Date().toISOString().slice(0, 10), box: BOX, land
}) + '\n');
console.log(`Lime Point: ${land.length} points, coast in at ${enter.map(v => v.toFixed(5))}, out at ${leave.map(v => v.toFixed(5))}`);
