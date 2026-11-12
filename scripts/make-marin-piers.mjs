#!/usr/bin/env node
/**
 * Piers on the Marin shore that NOAA's chart draws as part of the land (ENC LNDARE): fishing piers on piles, which the
 * drawn terrain can't show (a 12.5 m mesh turns their thin approaches into islands). From OpenStreetMap: the Moore Road
 * Pier at Fort Baker, in Horseshoe Bay's south-west corner (man_made=pier, way 422270510).
 * Also the Golden Gate Bridge's north anchorage there, for render/landscape.ts: OSM's "North Anchor" housing outline
 * (way 1560010149) and its four pylons, N1 and N2 either side of the roadway (ways 1495249486, 1560010150, 1560010159,
 * 1560010160), written to src/geo/data/gg-north-anchorage.json.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-marin-piers.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org. Output: src/geo/data/marin-piers.json
 */
import { writeFile } from 'node:fs/promises';

const outline = async id => {
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/way/${id}/full`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
  if (!r.ok) throw new Error(`OSM ${id}: HTTP ${r.status}`);
  const x = await r.text(), nodes = new Map();
  for (const m of x.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
  const w = x.match(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/);
  const refs = [...w[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(t => t[1]), name = w[2].match(/<tag k="name" v="([^"]*)"\/>/)?.[1];
  return { name, osm: id, pts: refs.slice(0, -1).map(n => nodes.get(n).map(v => Math.round(v * 1e7) / 1e7)) };
};
const piers = [await outline(422270510)];
const housing = await outline(1560010149), pylons = [];
for (const id of [1495249486, 1560010150, 1560010159, 1560010160]) pylons.push(await outline(id));
await writeFile(new URL('../src/geo/data/gg-north-anchorage.json', import.meta.url), JSON.stringify({ source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: the Golden Gate Bridge\'s north anchorage housing and pylons N1, N2 (bridge:support=pier)', fetched: new Date().toISOString().slice(0, 10), housing, pylons }) + '\n');
console.log(`housing: ${housing.pts.length} points; pylons: ${pylons.map(p => p.name ?? p.osm).join(', ')}`);
await writeFile(new URL('../src/geo/data/marin-piers.json', import.meta.url), JSON.stringify({ source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org: man_made=pier areas', fetched: new Date().toISOString().slice(0, 10), piers }) + '\n');
console.log(piers.map(p => `${p.name}: ${p.pts.length} points`).join('\n'));
