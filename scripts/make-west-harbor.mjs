#!/usr/bin/env node
/**
 * San Francisco Marina's West Harbor (by the St. Francis and Golden Gate yacht clubs), from OpenStreetMap: the basin,
 * the breakwaters, the docks (main walkways and slip fingers), the entrance beacon, and the slips between the fingers.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-west-harbor.mjs
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org. Slips aren't mapped, so they're worked out from
 * the fingers: a Folkboat-sized slip (3.0 m wide) on each side of a finger where there's room. The harbor's own dock
 * letters and slip numbers aren't in the data either: docks are lettered here west to east, slips numbered along them.
 * Output: src/geo/data/west-harbor.json
 */
import { writeFile } from 'node:fs/promises';
import { SOURCE_NOTE, sfNumbers, writeRenames } from './sf-marina-numbers.mjs';

const BBOX = [-122.4500, 37.8040, -122.4370, 37.8110]; // W S E N
const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX.join(',')}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
if (!res.ok) throw new Error(`OSM: HTTP ${res.status}`);
const xml = await res.text();

// a small XML reader: nodes and ways with their tags
const nodes = new Map(), ways = [];
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*lat="([-\d.]+)" lon="([-\d.]+)"(?:\/>|>([\s\S]*?)<\/node>)/g)) nodes.set(m[1], { lat: +m[2], lon: +m[3], tags: tagsOf(m[4] ?? '') });
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) ways.push({ id: m[1], nds: [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(x => x[1]), tags: tagsOf(m[2]) });
function tagsOf(s) { return Object.fromEntries([...s.matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map(x => [x[1], x[2]])); }

const LAT0 = 37.81, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const xy = ([lat, lon]) => ({ x: (lon + 122.44) * MLON, y: (lat - LAT0) * MLAT });
const pts = w => w.nds.map(id => nodes.get(id)).filter(Boolean).map(n => [Math.round(n.lat * 1e7) / 1e7, Math.round(n.lon * 1e7) / 1e7]);
const len = p => p.slice(1).reduce((a, q, i) => { const A = xy(p[i]), B = xy(q); return a + Math.hypot(B.x - A.x, B.y - A.y); }, 0);

const marina = ways.find(w => w.tags.leisure === 'marina');
if (!marina) throw new Error('No marina in the area');
const basin = pts(marina);
const breakwaters = ways.filter(w => w.tags.man_made === 'breakwater').map(w => ({ area: w.tags.area === 'yes' || w.nds[0] === w.nds.at(-1), pts: pts(w) }));
const piers = ways.filter(w => w.tags.man_made === 'pier').map(w => ({ area: w.tags.area === 'yes', pts: pts(w) }));
// inside the basin only (the bbox has the Marina Green's and Crissy Field's piers too)
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < (b[1] - a[1]) * (p[0] - a[0]) / (b[0] - a[0]) + a[1]) c = !c; } return c; };
const inBasin = p => p.pts.some(q => inPoly(q, basin));
const docks = piers.filter(p => !p.area && inBasin(p)), areas = piers.filter(p => p.area && inBasin(p));
const walkways = docks.filter(d => len(d.pts) >= 35), fingers = docks.filter(d => len(d.pts) < 35 && len(d.pts) > 4);

// letter the walkways west to east (by their middle)
const mid = d => { const a = xy(d.pts[0]), b = xy(d.pts.at(-1)); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
walkways.sort((a, b) => mid(a).x - mid(b).x);
const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
const distTo = (p, d) => { let m = Infinity; const q = d.pts.map(xy); for (let i = 1; i < q.length; i++) m = Math.min(m, segDist(p, q[i - 1], q[i])); return m; };

// slips: either side of each finger, a Folkboat's beam plus fenders (3.0 m), as long as the finger, bow in
const SLIP_W = 3.0, slips = [];
const toLL = p => [Math.round((p.y / MLAT + LAT0) * 1e7) / 1e7, Math.round((p.x / MLON - 122.44) * 1e7) / 1e7];
for (const f of fingers) {
  const a = xy(f.pts[0]), b = xy(f.pts.at(-1));
  // the root is the end on a walkway
  const da = Math.min(...walkways.map(w => distTo(a, w))), db = Math.min(...walkways.map(w => distTo(b, w)));
  const root = da <= db ? a : b, tip = da <= db ? b : a, dock = walkways.reduce((best, w) => (distTo(root, w) < distTo(root, best) ? w : best), walkways[0]);
  const L = Math.hypot(tip.x - root.x, tip.y - root.y), u = { x: (tip.x - root.x) / L, y: (tip.y - root.y) / L }, n = { x: -u.y, y: u.x };
  for (const s of [1, -1]) {
    const c = { x: root.x + u.x * L * 0.55 + n.x * s * (SLIP_W / 2 + 0.5), y: root.y + u.y * L * 0.55 + n.y * s * (SLIP_W / 2 + 0.5) };
    if (!inPoly(toLL(c), basin)) continue;
    // room: clear of every other dock and breakwater by half a slip, and not on top of a slip already made
    if (docks.some(d => d !== f && distTo(c, d) < SLIP_W / 2)) continue;
    if (breakwaters.some(w => distTo(c, w) < 3)) continue;
    if (slips.some(o => Math.hypot(o.c.x - c.x, o.c.y - c.y) < SLIP_W * 0.9)) continue;
    slips.push({ c, dock: walkways.indexOf(dock), heading: (Math.atan2(-u.x, -u.y) * 180 / Math.PI + 360) % 360, len: Math.round(L * 10) / 10 }); // bow toward the walkway
  }
}
// number the slips along each dock
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const out = [];
walkways.forEach((w, k) => {
  const a = xy(w.pts[0]), b = xy(w.pts.at(-1)), d = { x: b.x - a.x, y: b.y - a.y };
  slips.filter(s => s.dock === k).sort((s, t) => (s.c.x - a.x) * d.x + (s.c.y - a.y) * d.y - ((t.c.x - a.x) * d.x + (t.c.y - a.y) * d.y))
    .forEach((s, i) => out.push({ id: `${letters[k]}${i + 1}`, dock: letters[k], at: toLL(s.c), heading: Math.round(s.heading), finger: s.len }));
});
// the marina's own numbers (scripts/sf-marina-numbers.mjs), in place of the letters above; old ids recorded for saves
const numbered = sfNumbers('west-harbor', out); await writeRenames('west-harbor', numbered.renames);
const beacon = [...nodes.values()].find(n => n.tags['seamark:type'] === 'beacon_lateral');
await writeFile(new URL('../src/geo/data/west-harbor.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via api.openstreetmap.org; slips worked out from the fingers (3.0 m wide)' + SOURCE_NOTE,
  fetched: new Date().toISOString().slice(0, 10),
  basin, breakwaters, walkways: walkways.map(w => w.pts), fingers: fingers.map(f => f.pts), areas: areas.map(a => a.pts),
  beacon: beacon ? [beacon.lat, beacon.lon] : null, slips: numbered.slips
}) + '\n');
console.log(`basin ${basin.length} pts, ${breakwaters.length} breakwaters, ${walkways.length} walkways (docks ${letters.slice(0, walkways.length)}), ${fingers.length} fingers, ${areas.length} pier areas, ${out.length} slips`);
