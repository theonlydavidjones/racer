#!/usr/bin/env node
/**
 * The Ferry Building and its ferry gates, from OpenStreetMap, for render/landscape.ts: the building's outline (way
 * 558731934), the floating gates B–G on the Bay side (man_made=pier, floating=yes: ways 421576637, 69707606, 69707607,
 * 23623549, 661723971, 661723973) and the gates' shelters (the Golden Gate Ferry terminal's roof, way 69707604; Gate B's,
 * way 288511114), the main hall's height (building:part 24460886) and the clock tower's stages (building:parts 404449724,
 * 406710833–406710838).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-ferry-building.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org. Output: src/geo/data/ferry-building.json
 */
import { writeFile } from 'node:fs/promises';

const way = async id => {
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/way/${id}/full`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
  if (!r.ok) throw new Error(`OSM ${id}: HTTP ${r.status}`);
  const x = await r.text(), nodes = new Map();
  for (const m of x.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
  const w = x.match(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/), tags = Object.fromEntries([...w[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map(t => [t[1], t[2]]));
  const refs = [...w[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(t => t[1]);
  return { osm: id, name: tags.name, ref: tags.local_ref, height: tags.height, pts: refs.slice(0, -1).map(n => nodes.get(n).map(v => Math.round(v * 1e7) / 1e7)) };
};
const building = await way(558731934);
const gates = []; for (const id of [421576637, 69707606, 69707607, 23623549, 661723971, 661723973]) gates.push(await way(id));
const roofs = []; for (const id of [69707604, 288511114]) roofs.push(await way(id));
// the clock tower's stages, OSM building:parts, each a square (the top two round) with its height above the ground
const tower = []; for (const id of [404449724, 406710833, 406710834, 406710835, 406710836, 406710837, 406710838]) tower.push(await way(id));
const hall = await way(24460886); // the building's main part, with its height (16.1 m)
await writeFile(new URL('../src/geo/data/ferry-building.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org', fetched: new Date().toISOString().slice(0, 10), building, hall: { osm: hall.osm, height: hall.height }, tower, gates, roofs
}) + '\n');
console.log(`building ${building.pts.length} points (hall ${hall.height} m); tower ${tower.map(t => t.height).join(' ')}; gates ${gates.map(g => g.ref).join(' ')}; roofs ${roofs.map(r => `${r.name} ${r.height}`).join(', ')}`);
