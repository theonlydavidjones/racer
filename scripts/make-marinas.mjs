#!/usr/bin/env node
/**
 * The Bay marinas beyond West Harbor (which has its own script, make-west-harbor.mjs), from OpenStreetMap: each one's
 * basin, breakwaters, docks (main walkways and slip fingers), solid pier areas, entrance beacons, and the slips between
 * the fingers, worked out the same way as West Harbor's.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/make-marinas.mjs [gashouse-cove] [south-beach] [corinthian]
 *
 * Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org. What's real and what's worked out, harbor by harbor:
 * - Gashouse Cove (San Francisco Marina's East Harbor, by Fort Mason): basin, walkways and fingers all mapped. The
 *   harbor's own dock letters and slip numbers aren't published anywhere we could reach: lettered here north to south.
 * - South Beach Harbor (by Oracle Park): basin, breakwater, walkways and fingers mapped, and the docks carry their real
 *   names in OSM (Dock A … Dock G, north to south). Slip numbers aren't published where we could reach: numbered here
 *   along each dock from its shore (west) end.
 * - Corinthian Yacht Club, Tiburon: the breakwater and three dock lines are mapped, but not the fingers. The club's
 *   visitor notes put A dock on the southernmost line (along the breakwater, "on the extreme left as you enter") with the
 *   guest dock aft of A-14 at the end of A dock (bbyc.org/corinthian-1; Modern Sailing's CYC visitor sheet); B and C
 *   (going north) and the fingers (double-loaded, 12 m apart, so A has 14 slips with A-14 by the guest dock) are inferred.
 *   Its basin is closed off along the coastline of the club's point, the breakwater and the Main Street decks.
 * Output: src/geo/data/<id>.json
 */
import { writeFile } from 'node:fs/promises';

const HARBORS = {
  'gashouse-cove': {
    name: 'Gashouse Cove', bbox: [-122.4390, 37.8040, -122.4295, 37.8100],
    basin: { marina: 'East Harbor' }, letter: 'north-south',
    // the seawall along the north side, and its hook out to the entrance: NOAA's chart (ENC US5CA13M) has both as
    // breakwaters, always dry, on the same lines as these OSM ways (which OSM tags as piers). It's a vertical concrete wall
    // with a walkway and a pipe railing on top, standing about 1.5–2 m above the water (the owner's photos from the water;
    // the hook's arms are lighter, a narrower walkway). The chart gives the line, not the width: the line is taken as the
    // wall's harbor face (A dock floats 4–5 m inside it), the wall 3 m wide (the hook 2 m) out toward the Bay.
    breakwaterIds: ['23605116', '153269402'],
    seawalls: { 23605116: { side: 'right', width: 3, top: 1.8, from: 1 }, 153269402: { side: 'left', width: 2, top: 1.8 } }, // (the wall's line runs 4 m on past where the hook starts: it starts at the hook's first node here, with no stub)
    // the light on the hook's end: San Francisco East Yacht Harbor Light 2, red, Iso R 6s, 4.0 m (NOAA ENC US5CA13M, which
    // charts it at 37.807983 −122.432906, 6 m off the arm's end: within the chart's precision; stood on the end of the arm here)
    beaconsExtra: [{ at: [37.807931, -122.432936], colour: 'red' }],
    // the way in: the gap between the end of the seawall's hook and Fort Mason's Pier 1
    exits: [[37.80795, -122.43272]]
  },
  'south-beach': {
    name: 'South Beach Harbor', bbox: [-122.3945, 37.7755, -122.3820, 37.7850],
    basin: { marina: 'South Beach Harbor' }, letter: 'named',
    // two ways in, each between a pair of lateral beacons (OSM seamarks, from NOAA's chart): north by Pier 40, and south by the fishing pier
    exits: [[37.78194, -122.38469], [37.77830, -122.38524]]
  },
  'horseshoe-bay': {
    name: 'Travis Marina, Horseshoe Bay', bbox: [-122.4800, 37.8300, -122.4715, 37.8360],
    // the basin: OSM's Travis Marina outline takes in Marina Road's lot and the buildings along the north shore, so it's the
    // water inside it: the outline less the stone breakwaters and revetments (OSM areas, man_made=breakwater; NOAA ENC
    // US5CA13M charts the same breakwater and riprap), less the land behind the coastline, the piece that holds the docks
    // (worked out with shapely from the OSM ways, and grown 1 m into the breakwaters so no sliver lies between; the bay west of the outline, by the Coast Guard station, is open water)
    basin: { pts: [[37.8336373, -122.4741336], [37.8335755, -122.4741513], [37.8335408, -122.4741501], [37.8333166, -122.4741093], [37.8332423, -122.4740809], [37.8329375, -122.4739564], [37.8328706, -122.473909], [37.8328043, -122.4738852], [37.832747, -122.4738566], [37.8324352, -122.4736558], [37.8323411, -122.4736053], [37.8322565, -122.4735801], [37.8321963, -122.4735716], [37.8321462, -122.473551], [37.8320869, -122.4735997], [37.832028, -122.473702], [37.8319767, -122.4738094], [37.8319482, -122.4738884], [37.8319372, -122.4740518], [37.8319106, -122.47423], [37.8318452, -122.47515], [37.831832, -122.4752667], [37.8318475, -122.475301], [37.8320627, -122.4755128], [37.8321666, -122.4756055], [37.8321923, -122.4756425], [37.8322012, -122.4756923], [37.8321791, -122.4757339], [37.8338399, -122.4754951], [37.8338007, -122.4753873], [37.8338223, -122.4752771], [37.8338208, -122.4751395], [37.8337942, -122.4749779], [37.8338105, -122.4749171], [37.833853, -122.4749046], [37.8338871, -122.4749212], [37.8339068, -122.4749116], [37.8339078, -122.4748996], [37.8339414, -122.4749008], [37.8339073, -122.4747297], [37.8338323, -122.4745044], [37.833771, -122.4743937], [37.8337175, -122.4742814], [37.8337048, -122.4742307], [37.8337115, -122.4741831], [37.8336888, -122.4741259]] },
    shoreLines: [[[37.8338871, -122.4749212], [37.8339068, -122.4749116], [37.8339078, -122.4748996], [37.8339414, -122.4749008], [37.8339073, -122.4747297], [37.8338323, -122.4745044], [37.833771, -122.4743937], [37.8337175, -122.4742814], [37.8337048, -122.4742307], [37.8337115, -122.4741831], [37.8336888, -122.4741259]]], // (the basin's edge where it's the beach itself, below the Presidio Yacht Club: solid)
    letter: 'north-south', piles: 'white', pavedCrest: true, // (floating docks on white piles; a paved path along the breakwater's top: the owner's photos)
    // the way in: between the south breakwater's west end and the Coast Guard station's breakwater, looking west to the bridge
    exits: [[37.8324, -122.4764]]
  },
  corinthian: {
    name: 'Corinthian Yacht Club', bbox: [-122.4600, 37.8700, -122.4535, 37.8740],
    basin: { pts: [ // the coastline round the club's point and the Main Street decks (OSM way 157393812), the entrance, the breakwater (OSM way 125807786)
      [37.8713155, -122.4572744], [37.8713815, -122.4571101], [37.8714545, -122.4569285], [37.8715333, -122.4568829], [37.8718867, -122.4570442],
      [37.8722767, -122.4572325], [37.8723251, -122.457077], [37.8728218, -122.4570006], [37.8729692, -122.4566438], [37.8733118, -122.4555926],
      [37.8730092, -122.4553782], [37.872105, -122.455378], [37.871381, -122.455759], [37.871284, -122.456821], [37.871326, -122.456853],
      [37.871322, -122.457025], [37.871381, -122.45711]] },
    breakwaterIds: ['125807786'], skipIds: ['28808643'],
    shore: [0, 11], // the basin's edge along the club's point and the decks is the shore: solid (the 50 m terrain grid is too coarse here)
    letter: { 125807759: 'A', 125807777: 'B', 125807775: 'C' },
    // fingers along the mapped docks: [way, side (+1 left of the way's direction), length m, from m, to m along it, every m]
    fingers: [['125807759', -1, 14, 54, 125, 11.5], ['125807777', 1, 12, 6, 104], ['125807777', -1, 12, 6, 104], ['125807775', 1, 11, 6, 44]],
    fingerEvery: 12,
    exits: [[37.87235, -122.45528]] // between the breakwater's arm and the ferry floats, looking north-east
  }
};

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(HARBORS);
for (const id of want) {
  const H = HARBORS[id]; if (!H) throw new Error(`No harbor ${id}`);
  await make(id, H);
}

async function make(id, H) {
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${H.bbox.join(',')}`, { headers: { 'User-Agent': 'folkboat-racing-sim (personal project)' } });
  if (!res.ok) throw new Error(`OSM: HTTP ${res.status}`);
  const xml = await res.text();
  const nodes = new Map(), ways = [];
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*lat="([-\d.]+)" lon="([-\d.]+)"(?:\/>|>([\s\S]*?)<\/node>)/g)) nodes.set(m[1], { lat: +m[2], lon: +m[3], tags: tagsOf(m[4] ?? '') });
  for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) ways.push({ id: m[1], nds: [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(x => x[1]), tags: tagsOf(m[2]) });

  const LAT0 = (H.bbox[1] + H.bbox[3]) / 2, LON0 = (H.bbox[0] + H.bbox[2]) / 2, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
  const xy = ([lat, lon]) => ({ x: (lon - LON0) * MLON, y: (lat - LAT0) * MLAT });
  const toLL = p => [r7(p.y / MLAT + LAT0), r7(p.x / MLON + LON0)];
  const pts = w => w.nds.map(i => nodes.get(i)).filter(Boolean).map(n => [r7(n.lat), r7(n.lon)]);
  const len = p => p.slice(1).reduce((a, q, i) => { const A = xy(p[i]), B = xy(q); return a + Math.hypot(B.x - A.x, B.y - A.y); }, 0);

  const basin = H.basin.pts ?? pts(ways.find(w => w.tags.leisure === 'marina' && w.tags.name === H.basin.marina) ?? fail(`no marina ${H.basin.marina}`));
  const BP = basin.map(xy), inBasin = p => inPoly(p, BP);
  const near = (p, d) => inBasin(p) || BP.some((a, i) => segDist(p, a, BP[(i + 1) % BP.length]) < d);
  const skip = new Set(H.skipIds ?? []), bwIds = new Set(H.breakwaterIds ?? []);
  const breakwaters = ways.filter(w => (w.tags.man_made === 'breakwater' || bwIds.has(w.id)) && pts(w).some(q => near(xy(q), 40)))
    .map(w => { const sw = H.seawalls?.[w.id]; if (!sw) return { area: w.tags.area === 'yes', pts: pts(w) };
      const line = pts(w).slice(sw.from ?? 0), a = faceToArea(line, sw.side === 'right' ? 1 : -1, sw.width), n = line.length;
      return { area: true, pts: a, seawall: { top: sw.top, rail: a.slice(n, 2 * n) } }; }); // (the railing along its outer edge)
  /** A wall charted as a line along its harbor face: the area of rock from that line out to one side (right or left of the way's direction), `w` m wide. */
  function faceToArea(line, side, w) {
    const q = line.map(xy), out = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const n = { x: (b.y - a.y) / L * side, y: -(b.x - a.x) / L * side }; // to the right of the way's direction, × side
      out.push({ x: q[i].x + n.x * w, y: q[i].y + n.y * w });
    }
    return [...line, ...out.reverse().map(toLL), line[0]];
  }
  // the piers in the basin, and those running along just outside it (South Beach's fishing pier, the harbor's south wall)
  const piers = ways.filter(w => w.tags.man_made === 'pier' && !skip.has(w.id) && !bwIds.has(w.id)
    && (pts(w).some(q => inBasin(xy(q))) || (w.tags.area !== 'yes' && len(pts(w)) > 35 && pts(w).every(q => near(xy(q), 15)))));
  const areas = piers.filter(w => w.tags.area === 'yes').map(w => pts(w));
  const docks = piers.filter(w => w.tags.area !== 'yes').map(w => ({ id: w.id, name: w.tags.name ?? '', pts: pts(w) }));
  const walkways = docks.filter(d => len(d.pts) >= 35), fingers = [];
  // a finger mapped as one line right across its walkway (a finger each side) is two fingers, split where it crosses
  for (const f of docks.filter(d => len(d.pts) < 35 && len(d.pts) > 4)) {
    const a = xy(f.pts[0]), b = xy(f.pts.at(-1));
    // (crossing it between two nodes, or at a node of its own on the walkway's line)
    const P = f.pts.map(xy), half = (i, j) => len([f.pts[i], f.pts[j]]) > 3;
    const k = P.findIndex((p, i) => i > 0 && i < P.length - 1 && minDist(p, walkways) < 1.0 && half(0, i) && half(i, P.length - 1));
    if (k > 0) { fingers.push({ ...f, pts: f.pts.slice(0, k + 1).reverse() }, { ...f, id: f.id + 'b', pts: f.pts.slice(k) }); continue; }
    let cut = null;
    if (f.pts.length === 2) for (const w of walkways) { const q = w.pts.map(xy); for (let i = 1; i < q.length && !cut; i++) { const t = cross(a, b, q[i - 1], q[i]); if (t != null && t > 0.12 && t < 0.88) cut = t; } }
    if (cut == null) { fingers.push(f); continue; }
    const m = toLL({ x: a.x + (b.x - a.x) * cut, y: a.y + (b.y - a.y) * cut });
    fingers.push({ ...f, pts: [m, f.pts[0]] }, { ...f, id: f.id + 'b', pts: [m, f.pts[1]] });
  }

  // fingers that aren't mapped (Corinthian): laid square off the dock, every so often, where there's room
  for (const [wid, side, flen, from, to, every = H.fingerEvery] of H.fingers ?? []) {
    const w = walkways.find(d => d.id === wid) ?? fail(`no dock ${wid}`), q = w.pts.map(xy);
    let s0 = 0;
    for (let i = 1; i < q.length; i++) {
      const a = q[i - 1], b = q[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-6) continue;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y * side, y: u.x * side };
      for (let s = from + Math.max(0, Math.ceil((s0 - from) / every)) * every; s <= Math.min(to, s0 + L); s += every) {
        const root = { x: a.x + u.x * (s - s0) + n.x * 1.2, y: a.y + u.y * (s - s0) + n.y * 1.2 }, tip = { x: root.x + n.x * flen, y: root.y + n.y * flen };
        // clear of the basin's edge, the breakwaters and the other docks by a slip's width either side
        const ok = [0.25, 0.5, 0.75, 1].every(t => { const p = { x: root.x + n.x * flen * t, y: root.y + n.y * flen * t }; return inBasin(p) && minDist(p, [...breakwaters, ...docks.filter(d => d !== w)]) > 3.5 && edgeDist(p) > 3.5; });
        if (ok) fingers.push({ id: `${wid}-${Math.round(s)}${side > 0 ? 'l' : 'r'}`, name: '', pts: [toLL(root), toLL(tip)], made: true });
      }
      s0 += L;
    }
  }
  function edgeDist(p) { return Math.min(...BP.map((a, i) => segDist(p, a, BP[(i + 1) % BP.length]))); }
  function minDist(p, ds) { let m = Infinity; for (const d of ds) { const q = d.pts.map(xy); for (let i = 1; i < q.length; i++) m = Math.min(m, segDist(p, q[i - 1], q[i])); } return m; }
  const distTo = (p, d) => minDist(p, [d]);

  // each walkway's dock letter: its real name, or the sim's own (north to south), or as set above
  const letterOf = new Map();
  if (H.letter === 'named') for (const w of walkways) { const m = /^Dock ([A-Z])$/.exec(w.name); if (m) letterOf.set(w, m[1]); }
  else if (H.letter !== 'north-south') for (const w of walkways) if (H.letter[w.id]) letterOf.set(w, H.letter[w.id]);
  // (north to south: lettered below, once it's known which walkways have slips; the rest are gangways and headwalks)

  // slips: either side of each finger, a Folkboat's beam plus fenders (3.0 m), as long as the finger, bow in
  const SLIP_W = 3.0, slips = [];
  for (const f of fingers) {
    const a = xy(f.pts[0]), b = xy(f.pts.at(-1));
    const da = Math.min(...walkways.map(w => distTo(a, w))), db = Math.min(...walkways.map(w => distTo(b, w)));
    const root = da <= db ? a : b, tip = da <= db ? b : a, dock = walkways.reduce((best, w) => (distTo(root, w) < distTo(root, best) ? w : best), walkways[0]);
    if ((H.letter !== 'north-south' && !letterOf.has(dock)) || distTo(root, dock) > 2.5) continue; // a finger off an unnamed walkway, or standing on its own
    // (measured from the walkway's edge: a finger split where it crossed the walkway starts at its centre line)
    const L0 = Math.hypot(tip.x - root.x, tip.y - root.y), u = { x: (tip.x - root.x) / L0, y: (tip.y - root.y) / L0 }, n = { x: -u.y, y: u.x };
    const off = Math.max(0, 1.2 - distTo(root, dock)), L = L0 - off; root.x += u.x * off; root.y += u.y * off;
    for (const s of [1, -1]) {
      const c = { x: root.x + u.x * L * 0.55 + n.x * s * (SLIP_W / 2 + 0.5), y: root.y + u.y * L * 0.55 + n.y * s * (SLIP_W / 2 + 0.5) };
      if (!inBasin(c)) continue;
      if ([...walkways, ...fingers].some(d => d !== f && distTo(c, d) < SLIP_W / 2)) continue;
      if (breakwaters.some(w => distTo(c, w) < 3)) continue;
      if (slips.some(o => Math.hypot(o.c.x - c.x, o.c.y - c.y) < SLIP_W * 0.9)) continue;
      slips.push({ c, dock, heading: (Math.atan2(-u.x, -u.y) * 180 / Math.PI + 360) % 360, len: Math.round(L * 10) / 10 });
    }
  }
  if (H.letter === 'north-south') {
    const mid = w => { const q = w.pts.map(xy); return q.reduce((a, p) => a + p.y, 0) / q.length; };
    [...new Set(slips.map(s => s.dock))].sort((a, b) => mid(b) - mid(a)).forEach((w, i) => letterOf.set(w, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]));
  }
  // numbered along each dock from its shore (west) end
  const out = [];
  for (const [w, letter] of [...letterOf].sort((a, b) => a[1].localeCompare(b[1]))) {
    const q = w.pts.map(xy); let a = q[0], b = q.at(-1); if (b.x < a.x) [a, b] = [b, a];
    const d = { x: b.x - a.x, y: b.y - a.y }, along = s => (s.c.x - a.x) * d.x + (s.c.y - a.y) * d.y;
    slips.filter(s => s.dock === w).sort((s, t) => along(s) - along(t))
      .forEach((s, i) => out.push({ id: `${letter}${i + 1}`, dock: letter, at: toLL(s.c), heading: Math.round(s.heading), finger: s.len }));
  }
  // the entrance beacons (lateral marks, from NOAA's chart via OSM seamarks)
  const beacons = [...nodes.values()].filter(n => n.tags['seamark:type'] === 'beacon_lateral' && near(xy([n.lat, n.lon]), 80))
    .map(n => ({ at: [r7(n.lat), r7(n.lon)], colour: n.tags['seamark:beacon_lateral:colour'] === 'green' ? 'green' : 'red' })).concat(H.beaconsExtra ?? []);

  await writeFile(new URL(`../src/geo/data/${id}.json`, import.meta.url), JSON.stringify({
    source: `OpenStreetMap contributors (ODbL), via api.openstreetmap.org (scripts/make-marinas.mjs); slips worked out from the fingers (3.0 m wide). ${H.letter === 'named' ? 'Dock letters are the docks\' names in OSM; slip numbers are this sim\'s.' : typeof H.letter === 'object' ? 'A dock (the southernmost line) per the club\'s visitor notes; B, C, the fingers and the slip numbers are inferred.' : 'Dock letters and slip numbers are this sim\'s, not the harbor\'s.'}`,
    fetched: new Date().toISOString().slice(0, 10), name: H.name,
    basin, breakwaters, walkways: walkways.map(w => w.pts), fingers: fingers.map(f => f.pts), areas,
    beacons, exits: H.exits, ...(H.shore ? { shore: [basin.slice(...H.shore)] } : H.shoreLines ? { shore: H.shoreLines } : {}), ...(H.piles ? { piles: H.piles } : {}), ...(H.pavedCrest ? { pavedCrest: true } : {}), slips: out
  }) + '\n');
  const docksUsed = [...new Set(out.map(s => s.dock))].join('');
  console.log(`${id}: basin ${basin.length} pts, ${breakwaters.length} breakwaters, ${walkways.length} walkways (docks ${docksUsed}), ${fingers.length} fingers (${fingers.filter(f => f.made).length} inferred), ${areas.length} pier areas, ${beacons.length} beacons, ${out.length} slips`);
}

function tagsOf(s) { return Object.fromEntries([...s.matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map(x => [x[1], x[2].replace(/&amp;/g, '&')])); }
function r7(v) { return Math.round(v * 1e7) / 1e7; }
function fail(m) { throw new Error(m); }
function inPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
/** Where segment ab crosses segment cd, as a fraction along ab; null if they don't cross. */
function cross(a, b, c, d) {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x); if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den, s = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? t : null;
}
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
