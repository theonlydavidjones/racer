#!/usr/bin/env node
/**
 * The bridges' towers and piers standing in the water, solid in the sim (geo/shore.ts PIERS): what you run into, what
 * the AI and the tiller pilot steer round, what the navigator routes round, and obstructions under Rules 19 and 20.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-charts.mjs   (first: it downloads and converts NOAA's ENC cells)
 *   NODE_USE_ENV_PROXY=1 node scripts/make-bridge-piers.mjs
 *
 * Sources:
 *  - NOAA ENC (S-57) PYLONS, "bridge pylon / pier", in the cells fetch-charts.mjs uses (public domain): the charted
 *    footprints. The Bay Bridge: the West Span's Piers A–F (W2–W7: the towers' piers and the central anchorage), the
 *    East Span's tower G and the Skyway's Piers H–N; the Golden Gate Bridge's South Pier, the fender round the south
 *    tower (88 × 44 m); the Richmond–San Rafael Bridge's piers at the north edge.
 *  - OpenStreetMap (ODbL), api.openstreetmap.org: the Golden Gate Bridge's tower bases (bridge:support=pylon, 43 × 24 m):
 *    the north tower's, which the chart doesn't draw as a pier (it stands just off Lime Point), and the south one's
 *    inside its fender. And each charted pier checked against OSM's (bridge:support=pier/pylon, the West Span's
 *    W1–W7 refs): the distance between their centres is recorded.
 *
 *  - NOAA ENC soundings (src/geo/data/enc-chart.json): the depth round each one.
 *
 * Output: src/geo/data/bridge-piers.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = new URL('../.cache/enc/', import.meta.url).pathname;
const BOX = { south: 37.745, north: 37.935, west: -122.61, east: -122.345 }; // the sim's world (as fetch-charts.mjs)
const UA = { 'User-Agent': 'folkboat-racing-sim (personal project)' };
const r6 = v => Math.round(v * 1e6) / 1e6;
const centre = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
const metres = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(37.81 * Math.PI / 180));

// 1. NOAA's charted piers
if (!existsSync(CACHE)) throw new Error('Run scripts/fetch-charts.mjs first: it downloads the ENC cells this reads.');
const piers = [], seen = new Set();
for (const d of readdirSync(CACHE).filter(d => d.endsWith('.geojson.d'))) {
  const f = join(CACHE, d, 'PYLONS.json'); if (!existsSync(f)) continue;
  for (const ft of JSON.parse(readFileSync(f, 'utf8')).features) {
    if (ft.geometry?.type !== 'Polygon') continue;
    const ring = ft.geometry.coordinates[0].slice(0, -1).map(([lon, lat]) => [r6(lat), r6(lon)]), c = centre(ring);
    if (c[0] < BOX.south || c[0] > BOX.north || c[1] < BOX.west || c[1] > BOX.east) continue;
    const key = c.map(v => v.toFixed(5)).join(','); if (seen.has(key)) continue; seen.add(key); // (a pier on two cells' edge)
    const name = (ft.properties.OBJNAM ?? '').replace(/\\/g, '/');
    const bridge = c[0] > 37.9 ? 'Richmond–San Rafael Bridge' : c[1] < -122.45 ? 'Golden Gate Bridge' : c[0] < 37.76 ? 'Islais Creek bridge' : 'Bay Bridge';
    const nm = /South Pier/.test(name) ? 'south tower\'s fender' : name.replace(/^Golden Gate Bridge /, '').replace(/^Pylon\/Tower /, 'East Span tower ');
    piers.push({ name: nm ? `${bridge}, ${nm}` : `${bridge}, pier`, src: `NOAA ENC ${d.replace('.geojson.d', '')} PYLONS`, pts: ring });
  }
}

// 2. OpenStreetMap: the Golden Gate's tower bases, and the Bay Bridge's piers to check the chart's against
async function osm(bbox) {
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox.join(',')}`, { headers: UA });
  if (!r.ok) throw new Error(`OSM ${r.status}`);
  const x = await r.text(), nodes = new Map();
  for (const m of x.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
  const ways = [];
  for (const m of x.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map(t => [t[1], t[2]]));
    const refs = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(t => t[1]);
    if (!tags['bridge:support'] || refs[0] !== refs.at(-1)) continue;
    ways.push({ id: m[1], tags, pts: refs.slice(0, -1).map(id => nodes.get(id)).filter(Boolean).map(([a, b]) => [r6(a), r6(b)]) });
  }
  return ways;
}
const gg = await osm([-122.4820, 37.8110, -122.4750, 37.8290]);
const bb = [...await osm([-122.3950, 37.7860, -122.3640, 37.8100]), ...await osm([-122.3640, 37.8090, -122.3300, 37.8230])];
// the towers' bases: the 43 × 24 m pylon footprints (the legs' outlines sit inside them)
for (const w of gg.filter(w => w.tags['bridge:support'] === 'pylon')) {
  const c = centre(w.pts), north = c[0] > 37.82;
  piers.push({ name: `Golden Gate Bridge, ${north ? 'north tower' : 'south tower'}`, src: `OpenStreetMap way ${w.id}`, pts: w.pts });
}
// 3. the depth of water round each one: the median of NOAA's charted soundings within 150 m of its centre (300, then
// 600 m where none is that close) (the chart's
// own, from src/geo/data/enc-chart.json; metres below chart datum, MLLW). It sets how much the bed's friction wears
// its current wake down (environment/pierWakes.ts).
const enc = JSON.parse(readFileSync(new URL('../src/geo/data/enc-chart.json', import.meta.url), 'utf8'));
for (const p of piers) {
  const c = centre(p.pts);
  for (const R of [150, 300, 600]) {
    const ds = [];
    for (let i = 0; i < enc.soundings.length; i += 3) if (metres(c, [enc.soundings[i + 1] / 1e5, enc.soundings[i] / 1e5]) < R) ds.push(enc.soundings[i + 2] / 10);
    ds.sort((a, b) => a - b);
    if (ds.length) { p.depth = { m: ds[ds.length >> 1], soundings: ds.length, within_m: R }; break; }
  }
}
// each charted pier's nearest OSM support, for the record
const supports = [...gg, ...bb].map(w => ({ id: w.id, ref: w.tags.ref ?? w.tags.name ?? w.tags['bridge:support'], c: centre(w.pts) }));
for (const p of piers) {
  if (!p.src.startsWith('NOAA')) continue;
  const c = centre(p.pts); let best = null;
  for (const s of supports) { const d = metres(c, s.c); if (!best || d < best.d) best = { d, s }; }
  if (best && best.d < 120) p.osm = { way: best.s.id, ref: best.s.ref, offset_m: Math.round(best.d) };
}
writeFileSync(new URL('../src/geo/data/bridge-piers.json', import.meta.url), JSON.stringify({
  source: 'NOAA ENC PYLONS (public domain), via scripts/fetch-charts.mjs; OpenStreetMap contributors (ODbL), api.openstreetmap.org: the Golden Gate Bridge\'s tower bases (bridge:support=pylon). Each charted pier\'s nearest OSM bridge support is noted (osm), with the distance between their centres.',
  made: 'scripts/make-bridge-piers.mjs', fetched: new Date().toISOString().slice(0, 10), piers
}, null, 0) + '\n');
for (const p of piers) console.log(p.name.padEnd(60), p.src.padEnd(32), `${p.depth?.m ?? '?'} m (${p.depth?.soundings ?? 0})`.padEnd(12), p.osm ? `OSM ${p.osm.ref} ${p.osm.offset_m} m` : '');
