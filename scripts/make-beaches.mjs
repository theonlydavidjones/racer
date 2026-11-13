#!/usr/bin/env node
/**
 * The Marin Headlands' beaches, for colouring the drawn shore (render/terrain.ts): inside MARIN, sand where
 * OpenStreetMap maps a beach (natural=beach) and rock everywhere else along the water's edge, as the shore from Point
 * Bonita to Fort Baker is: cliffs and rock, with a few pocket beaches (Kirby Cove, Black Sands, Horseshoe Bay's).
 * NOAA's chart can't tell them apart there: its coastlines (ENC COALNE) carry no category (CATCOA) along that shore.
 *
 *   node scripts/make-beaches.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), via api.openstreetmap.org (the map call, two tiles: the API's own limits,
 * and its usage policy, rule out the whole Bay; the Overpass API is refused by this project's network).
 * Output: src/geo/data/beaches.json: the box, and each beach's outline as [lat, lon] (1e-6 degrees), with its name.
 */
import { writeFile } from 'node:fs/promises';

export const MARIN = { south: 37.81, north: 37.84, west: -122.535, east: -122.465 };
const TILES = [[MARIN.west, -122.50], [-122.50, MARIN.east]];
const beaches = [], seen = new Set();
for (const [w, e] of TILES) {
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${w},${MARIN.south},${e},${MARIN.north}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
  if (!r.ok) throw new Error(`OSM map ${w}..${e}: HTTP ${r.status}`);
  const x = await r.text(), nodes = new Map();
  for (const m of x.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [Math.round(+m[2] * 1e6) / 1e6, Math.round(+m[3] * 1e6) / 1e6]);
  for (const m of x.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    if (!/<tag k="natural" v="beach"\/>/.test(m[2]) || seen.has(m[1])) continue;
    const pts = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(t => nodes.get(t[1])).filter(Boolean);
    if (pts.length < 3) continue; // (a node outside the tile: the other tile has the way whole)
    seen.add(m[1]);
    beaches.push({ name: m[2].match(/<tag k="name" v="([^"]*)"\/>/)?.[1], osm: `way/${m[1]}`, pts });
  }
  await new Promise(res => setTimeout(res, 1000));
}
await writeFile(new URL('../src/geo/data/beaches.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: natural=beach ways in the box',
  fetched: new Date().toISOString().slice(0, 10), box: MARIN, beaches
}) + '\n');
console.log(`${beaches.length} beaches: ${beaches.map(b => `${b.name ?? b.osm} (${b.pts.length})`).join(', ')}`);
