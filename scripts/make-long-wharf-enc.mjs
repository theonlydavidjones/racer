#!/usr/bin/env node
/**
 * Chevron's Long Wharf at Richmond as NOAA's chart has it, for what OpenStreetMap's outline lacks (east-piers.json):
 * the berth heads' platforms, drawn on the chart as small land areas (LNDARE), the wharf's pier lines (SLCONS, CATSLC 4)
 * and its mooring dolphin (MORFAC, CATMOR 1). Kept solid so the terrain's 50 m cells beside the wharf can be water
 * without losing them (src/geo/shore.ts; w044's follow-up).
 *
 *   node scripts/make-long-wharf-enc.mjs      (after scripts/fetch-charts.mjs has cached the cells in .cache/enc)
 *
 * Source: NOAA Office of Coast Survey, ENC US5OAKGG "San Francisco Bay - Tiburon Peninsula to Point Molate, CA"
 * (S-57), edition and update as recorded in src/geo/data/enc-chart.json. Public domain. Not for navigation.
 * Output: src/geo/data/long-wharf-enc.json, positions [lat, lon] (WGS 84), the format of east-piers.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('../.cache/enc/US5OAKGG.geojson.d/', import.meta.url).pathname;
const OUT = new URL('../src/geo/data/long-wharf-enc.json', import.meta.url).pathname;
const CELLS = JSON.parse(readFileSync(new URL('../src/geo/data/enc-chart.json', import.meta.url), 'utf8')).cells;
const cell = CELLS.find(c => c.name === 'US5OAKGG');
// the wharf and its berths, short of the Richmond–San Rafael Bridge (its pylons, at 37.9327 N, are bridge-piers.json's)
const BOX = { west: -122.420, east: -122.396, south: 37.917, north: 37.9315 };
const inBox = ([lon, lat]) => lon >= BOX.west && lon <= BOX.east && lat >= BOX.south && lat <= BOX.north;
const layer = n => JSON.parse(readFileSync(DIR + n + '.json', 'utf8')).features.filter(f => f.geometry);
const ll = ([lon, lat]) => [Math.round(lat * 1e7) / 1e7, Math.round(lon * 1e7) / 1e7];

const piers = [], lines = [];
// the berth heads' platforms: small land areas wholly in the box (not the mainland's, which runs out of it)
for (const f of layer('LNDARE')) {
  if (f.geometry.type !== 'Polygon') continue;
  const ring = f.geometry.coordinates[0];
  if (ring.every(inBox)) piers.push({ name: 'Long Wharf, berth platform (chart)', kind: 'pier', pts: ring.map(ll) });
}
// the mooring dolphin: a point on the chart; drawn 3 m square, about a dolphin's size (an estimate)
for (const f of layer('MORFAC')) {
  if (f.geometry.type !== 'Point' || !inBox(f.geometry.coordinates)) continue;
  const [lon, lat] = f.geometry.coordinates, dLat = 1.5 / 111320, dLon = 1.5 / (111320 * Math.cos(lat * Math.PI / 180));
  piers.push({ name: 'Long Wharf, mooring dolphin (chart)', kind: 'dolphin', pts: [[lat - dLat, lon - dLon], [lat - dLat, lon + dLon], [lat + dLat, lon + dLon], [lat + dLat, lon - dLon]].map(([a, o]) => [Math.round(a * 1e7) / 1e7, Math.round(o * 1e7) / 1e7]) });
}
// the wharf's pier lines (CATSLC 4, pier/jetty), 2 m wide: what of them OSM's outline already covers is solid twice
for (const f of layer('SLCONS')) {
  if (f.geometry.type !== 'LineString' || f.properties.CATSLC !== 4) continue;
  const pts = f.geometry.coordinates.filter(inBox);
  if (pts.length >= 2) lines.push({ name: 'Long Wharf, pier line (chart)', kind: 'pier', width: 2, pts: pts.map(ll) });
}
writeFileSync(OUT, JSON.stringify({
  source: `NOAA Office of Coast Survey, ENC ${cell.name} (${cell.title}), edition ${cell.edition} update ${cell.update}, issued ${cell.issued}: LNDARE, SLCONS (CATSLC 4), MORFAC. Public domain. Not for navigation.`,
  made: 'scripts/make-long-wharf-enc.mjs', coast: [], piers, lines
}, null, 0) + '\n');
console.log(`${piers.length} areas, ${lines.length} lines → ${OUT}`);
