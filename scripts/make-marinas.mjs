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
 *   names in OSM (Dock A … Dock G, north to south). Slip numbers from the harbor's plan: from each dock's gate at
 *   the shore (west) end, odd on the north side, even on the south.
 * - Corinthian Yacht Club, Tiburon: the breakwater and three dock lines are mapped, but not the fingers. The club's
 *   visitor notes put A dock on the southernmost line (along the breakwater, "on the extreme left as you enter") with the
 *   guest dock aft of A-14 at the end of A dock (bbyc.org/corinthian-1; Modern Sailing's CYC visitor sheet); B and C
 *   (going north) and the fingers (double-loaded, 12 m apart, so A has 14 slips with A-14 by the guest dock) are inferred.
 *   Its basin is closed off along the coastline of the club's point, the breakwater and the Main Street decks.
 * Output: src/geo/data/<id>.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { SF_DOCKS, SOURCE_NOTE, sfNumbers, writeRenames } from './sf-marina-numbers.mjs';

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
    // the harbor's own plan (Port of San Francisco, South Beach Harbor map, sfport.com/files/2023-06/Harbor%20Map.pdf):
    // each dock's slips numbered from its gate at the shore (west) end, odd on the north side, even on the south; the top
    // numbers there (A84 B92 C92 D104 E104 F108 G92) are the slips mapped here, side for side
    odd: 'left',
    // two ways in, each between a pair of lateral beacons (OSM seamarks, from NOAA's chart): north by Pier 40, and south by the fishing pier
    exits: [[37.78194, -122.38469], [37.77830, -122.38524]]
  },
  'horseshoe-bay': {
    name: 'Travis Marina, Horseshoe Bay', bbox: [-122.4800, 37.8300, -122.4715, 37.8360],
    // the basin: the water inside OSM's Travis Marina outline (which takes in Marina Road's lot and the north shore's
    // buildings), worked out by scripts/make-horseshoe-basin.py; the beach below the Presidio Yacht Club is solid shore
    basin: { file: 'horseshoe-basin.json' },
    // the paved path along the breakwater's top (OSM footway 225654086, surface=paved; the owner's photo from ashore)
    pathIds: ['225654086'],
    letter: 'north-south', piles: 'white', // (floating docks on white piles: the owner's photos)
    // the way in: between the south breakwater's west end and the Coast Guard station's breakwater, looking west to the bridge
    exits: [[37.8324, -122.4764]]
  },
  berkeley: {
    name: 'Berkeley Marina', bbox: [-122.3235, 37.8615, -122.3100, 37.8705],
    noSlips: true, // (few of its fingers are mapped and its slips aren't published: no slips of its own, only the guest dock's berths)
    // Berkeley Yacht Club's guest dock (OSM way 28239155, floating, 44 m, on the clubhouse's east side): visitors lie alongside
    alongside: [{ way: '28239155', label: 'BYC guest ' }],
    // the basin: OSM's marina outline (way 117767451), and the water inside the breakwaters west of it (the fairway, open
    // to the Bay through the three ways in), bounded by OSM's coastline (ways 153288129, 153288138) round BYC's point and
    // the north shore, and by the breakwaters between NOAA's charted lights
    basin: { pts: [
      [37.86631, -122.31772], [37.86621, -122.31801], [37.86612, -122.31806], [37.86601, -122.31806], [37.86598, -122.31797], [37.86593, -122.31792],
      [37.86510, -122.31785], [37.86523, -122.31906], [37.86700, -122.32012], [37.86719, -122.32134], [37.86822, -122.32052],
      [37.86830, -122.31911], [37.86806, -122.31886], [37.86788, -122.31873], [37.86775, -122.31866], [37.86768, -122.31864], [37.86734, -122.31861],
      [37.86712, -122.31855], [37.86701, -122.31846], [37.86697, -122.31831], [37.86699, -122.31818], [37.86706, -122.31811],
      [37.86700, -122.31811], [37.86709, -122.31805], [37.86719, -122.31804], [37.86728, -122.31813], [37.86734, -122.31824], [37.86795, -122.31828],
      [37.86834, -122.31798], [37.86853, -122.31745], [37.86896, -122.31507], [37.86800, -122.31467], [37.86772, -122.31316], [37.86526, -122.31172],
      [37.86501, -122.31254], [37.86487, -122.31252], [37.86413, -122.31593], [37.86438, -122.31659], [37.86590, -122.31720], [37.86614, -122.31719],
      [37.86636, -122.31726], [37.86635, -122.31730]] },
    letter: 'named',
    // the breakwaters (OSM 23617828, 23617829; NOAA's chart has the same two lines) and the three ways in: south of
    // Berkeley Breakwater Light 1 (the deepest, the one the guides use), the middle gap between Lights 2 and 3, and north
    // of North Breakwater Light 4 (ENC US5OAKFI)
    breakwaterIds: ['23617828', '23617829'],
    beaconsExtra: [{ at: [37.86523, -122.31906], colour: 'green' }, { at: [37.86700, -122.32012], colour: 'red' }, { at: [37.86718, -122.32134], colour: 'green' }, { at: [37.86831, -122.32047], colour: 'red' }],
    exits: [[37.86516, -122.31845], [37.86709, -122.32073], [37.86826, -122.31980]] // (south, middle, north: on the basin's edge)
  },
  'richmond-yc': {
    name: 'Richmond Yacht Club, Brickyard Cove', bbox: [-122.3880, 37.9060, -122.3790, 37.9125],
    noSlips: true, // (no fingers mapped in OSM: the slips are laid out from the club's own plan, below)
    // the club's harbor plan ("Richmond Yacht Club Harbor Layout", richmondyc.org/files/RYC Harbor Layout.pdf, 1" = 30',
    // north to the right; 250 slips, the club's harbor page): docks A to F run out east-south-east from the headwalk by the
    // shore road to the pierhead line, A the shortest by the clubhouse and the launching area, F along the Potrero Reach
    // breakwater. Matched to OSM's dock lines by their order and lengths. Slip lengths: the sizes printed on the plan
    // (A and F 36 ft; B 44 ft on its odd side, 36 ft on its even; C 40–50 ft, drawn 44; D 32–50, drawn 40; E 32–50,
    // drawn 36). G (eleven 28 ft slips by the harbormaster's office) isn't mapped in OSM: left out.
    plan: [
      { way: '27419293', letter: 'A', sides: [{ side: 'right', count: 11, len: 11.0, numbers: 'run' }] },
      { way: '23618133', letter: 'B', rootAtEnd: true, sides: [{ side: 'right', count: 13, len: 13.4 }, { side: 'left', count: 11, len: 11.0 }] },
      { way: '23618131', letter: 'C', rootAtEnd: true, from: 22, sides: [{ side: 'right', count: 19, len: 13.4 }, { side: 'left', count: 18, len: 13.4 }] },
      { way: '23618129', letter: 'D', rootAtEnd: true, from: 22, sides: [{ side: 'right', count: 31, len: 12.2 }, { side: 'left', count: 25, len: 12.2 }] },
      { way: '23618128', letter: 'E', rootAtEnd: true, sides: [{ side: 'right', count: 42, len: 11.0 }, { side: 'left', count: 42, len: 11.0 }] },
      { way: '583333847', letter: 'F', from: 22, sides: [{ side: 'right', count: 21, len: 11.0 }, { side: 'left', count: 20, len: 11.0 }] }
    ],
    basin: { marina: 'Richmond Yacht Club' }, letter: 'north-south',
    // the harbor's two breakwater arms aren't in OSM: NOAA's chart (ENC US5OAKGH, SLCONS) has them, ending at Brickyard
    // Cove Harbor Lights 1 (green, F G, 2.4 m) and 2 (red, F R) either side of the way in, which faces south-east
    breakwatersExtra: [[[37.90851, -122.38494], [37.90835, -122.38494], [37.90711, -122.38288]], [[37.90727, -122.38191], [37.90690, -122.38265]]],
    beaconsExtra: [{ at: [37.90712, -122.38287], colour: 'green' }, { at: [37.90690, -122.38264], colour: 'red' }],
    exits: [[37.90695, -122.38282]]
  },
  encinal: {
    name: 'Encinal Yacht Club, Alameda', bbox: [-122.2655, 37.7810, -122.2605, 37.7845],
    noSlips: true, // (few of its fingers are mapped and its slips aren't published: no berths yet, only the water and the docks)
    basin: { marina: 'Encinal Yacht Club' }, letter: 'north-south',
    // no breakwater: the club's docks open straight onto the Oakland Estuary, across the basin's north-east side
    exits: [[37.78320, -122.26195]]
  },
  // the Oakland Estuary's other harbors, between Alameda and Oakland (OSM marina outlines; their ways out found from the
  // chart's water beyond their edges): water to sail into, their docks solid. No berths: their dock letters and slips
  // aren't published where we could reach
  'oakland-yc': { name: 'Oakland Yacht Club, Alameda', bbox: [-122.2685, 37.7815, -122.2615, 37.7860], basin: { marina: 'Oakland Yacht Club' }, letter: 'north-south', noSlips: true, exits: 'auto' },
  'marina-village': { name: 'Marina Village Yacht Harbor, Alameda', bbox: [-122.2760, 37.7820, -122.2640, 37.7900], basin: { marina: 'Marina Village Yacht Harbor - East Basin' }, letter: 'north-south', noSlips: true, exits: 'auto' },
  'fortmann': { name: 'Fortmann Marina, Alameda', bbox: [-122.2590, 37.7765, -122.2540, 37.7820], basin: { marina: 'Fortmann Marina' }, letter: 'north-south', noSlips: true, exits: 'auto' },
  'grand-marina': { name: 'Grand Marina, Alameda', bbox: [-122.2575, 37.7765, -122.2500, 37.7815], basin: { marina: 'Grand Marina' }, letter: 'north-south', noSlips: true, exits: 'auto' },
  'alameda-marina': { name: 'Alameda Marina (Island Yacht Club)', bbox: [-122.2535, 37.7725, -122.2435, 37.7790], basin: { marina: 'Alameda Marina' }, letter: 'north-south', noSlips: true, exits: 'auto' },
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

  const basinFile = H.basin.file ? JSON.parse(await readFile(new URL(`./data/${H.basin.file}`, import.meta.url), 'utf8')) : null;
  const basin = basinFile?.basin ?? H.basin.pts ?? pts(ways.find(w => w.tags.leisure === 'marina' && w.tags.name === H.basin.marina) ?? fail(`no marina ${H.basin.marina}`));
  const BP = basin.map(xy), inBasin = p => inPoly(p, BP);
  const near = (p, d) => inBasin(p) || BP.some((a, i) => segDist(p, a, BP[(i + 1) % BP.length]) < d);
  const skip = new Set(H.skipIds ?? []), bwIds = new Set(H.breakwaterIds ?? []);
  const breakwaters = ways.filter(w => bwIds.has(w.id) || (w.tags.man_made === 'breakwater' && pts(w).some(q => near(xy(q), 40))))
    .map(w => { const sw = H.seawalls?.[w.id]; if (!sw) return { area: w.tags.area === 'yes', pts: pts(w) };
      const line = pts(w).slice(sw.from ?? 0), a = faceToArea(line, sw.side === 'right' ? 1 : -1, sw.width), n = line.length;
      return { area: true, pts: a, seawall: { top: sw.top, rail: a.slice(n, 2 * n) } }; }) // (the railing along its outer edge)
    .concat((H.breakwatersExtra ?? []).map(pts => ({ area: false, pts }))); // (charted on NOAA's ENC, not mapped in OSM)
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
  if (H.letter === 'named') for (const w of walkways) { const m = /^(?:Dock ([A-Z])|([A-Z])-Dock)$/.exec(w.name); if (m) letterOf.set(w, m[1] ?? m[2]); } // ("Dock A" at South Beach, "B-Dock" at Berkeley)
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
  if (!H.noSlips) for (const [w, letter] of [...letterOf].sort((a, b) => a[1].localeCompare(b[1]))) {
    const q = w.pts.map(xy); let a = q[0], b = q.at(-1); if (b.x < a.x) [a, b] = [b, a];
    const d = { x: b.x - a.x, y: b.y - a.y }, along = s => (s.c.x - a.x) * d.x + (s.c.y - a.y) * d.y;
    const mine = slips.filter(s => s.dock === w).sort((s, t) => along(s) - along(t));
    // (odd numbers on one side, looking out along the dock from its shore end, even on the other, where the harbor numbers
    // them so; otherwise one run along the dock)
    const left = s => d.x * (s.c.y - a.y) - d.y * (s.c.x - a.x) > 0;
    const num = H.odd ? (s => { const odd = left(s) === (H.odd === 'left'), k = mine.filter(t => left(t) === left(s)).indexOf(s); return odd ? 2 * k + 1 : 2 * k + 2; }) : (s => mine.indexOf(s) + 1);
    mine.map(s => ({ s, n: num(s) })).sort((p, q) => p.n - q.n)
      .forEach(({ s, n }) => out.push({ id: `${letter}${n}`, dock: letter, at: toLL(s.c), heading: Math.round(s.heading), finger: s.len }));
  }
  // slips laid out from the harbor's own plan, where it publishes one (Richmond YC): per dock, its letter, which end is the
  // shore's (the root), and per side the number of slips and their length; numbered from the root, odd on the right
  // (looking out along the dock), even on the left, or one run 1, 2, 3 … on one side. Each slip a finger's width plus a
  // share of the dock between root and tip; a slip that wouldn't be clear of the basin's edge, the breakwaters or another
  // dock is left out (its number skipped, as on the plan)
  const planned = [];
  for (const D of H.plan ?? []) {
    const w = walkways.find(d => d.id === D.way) ?? fail(`no dock ${D.way}`);
    let q = w.pts.map(xy); if (D.rootAtEnd) q = q.reverse();
    // the dock's straight run: from the root, the segments within 30° of the root-to-tip line
    const tipAll = q.at(-1), dir0 = Math.atan2(tipAll.x - q[0].x, tipAll.y - q[0].y);
    const segs = []; for (let i = 1; i < q.length; i++) { const a = q[i - 1], b = q[i], L = Math.hypot(b.x - a.x, b.y - a.y); const d = Math.atan2(b.x - a.x, b.y - a.y); if (L > 1 && Math.abs(((d - dir0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < Math.PI / 6) segs.push({ a, b, L }); }
    const total = segs.reduce((t, g) => t + g.L, 0), at = s => { for (const g of segs) { if (s <= g.L) { const t = s / g.L; return { p: { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t }, u: { x: (g.b.x - g.a.x) / g.L, y: (g.b.y - g.a.y) / g.L } }; } s -= g.L; } const g = segs.at(-1); return { p: g.b, u: { x: (g.b.x - g.a.x) / g.L, y: (g.b.y - g.a.y) / g.L } }; };
    const others = [...breakwaters, ...docks.filter(d => d !== w)];
    for (const S of D.sides) {
      // (from 12 m out from the headwalk (22 m on C, D and F, where OSM's docks close in on each other there), clear of its corner, to 9 m short of the dock's end, left for its end tie)
      const side = S.side === 'right' ? -1 : 1, pitch = (total - (D.from ?? 12) - 9) / S.count, flen = S.len; // (n = left of the way out: −1 the right)
      for (let k = 0; k < S.count; k++) {
        const s = (D.from ?? 12) + pitch * (k + 0.5), { p, u } = at(s), n = { x: -u.y * side, y: u.x * side };
        const root = { x: p.x + n.x * 1.2, y: p.y + n.y * 1.2 }, c = { x: root.x + n.x * flen * 0.55, y: root.y + n.y * flen * 0.55 };
        const num = S.numbers === 'run' ? k + 1 : S.side === 'right' ? 2 * k + 1 : 2 * k + 2;
        const clear = [0.15, 0.55, 0.95].every(f => { const r = { x: root.x + n.x * flen * f, y: root.y + n.y * flen * f }; return inBasin(r) && edgeDist(r) > 1.5 && minDist(r, others) > 1.8; });
        if (!clear) continue;
        // the finger on the far side of the slip (looking out along the dock), as long as the slip
        const f0 = { x: root.x + u.x * pitch / 2, y: root.y + u.y * pitch / 2 };
        planned.push({ dock: D.letter, root, n, flen, c, finger: { id: `${D.letter}${num}f`, name: '', pts: [toLL(f0), toLL({ x: f0.x + n.x * flen, y: f0.y + n.y * flen })], made: true },
          slip: { id: `${D.letter}${num}`, dock: D.letter, at: toLL(c), heading: Math.round((Math.atan2(-n.x, -n.y) * 180 / Math.PI + 360) % 360), finger: Math.round(flen * 10) / 10 } });
      }
    }
  }
  for (const a of planned) { fingers.push(a.finger); out.push(a.slip); }
  // berths alongside a dock (a club's guest dock): along each side of it, a Folkboat's length and a bit apart, bow along
  // the dock, where she lies clear of everything else in the basin
  for (const { way, label, every = 9 } of H.alongside ?? []) {
    const w = walkways.find(d => d.id === way) ?? fail(`no dock ${way}`), q = w.pts.map(xy);
    const others = [...breakwaters, ...docks.filter(d => d !== w), ...fingers], off = 1.2 + 1.1 + 0.3; let k = 0;
    for (const side of [1, -1]) {
      let s0 = 0;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-6) continue;
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y * side, y: u.x * side };
        for (let t = 5.5; t <= L - 4.6; t += every) {
          const c = { x: a.x + u.x * t + n.x * off, y: a.y + u.y * t + n.y * off };
          const ok = [-3.6, 0, 3.6].every(e => { const p = { x: c.x + u.x * e, y: c.y + u.y * e }; return inBasin(p) && minDist(p, others) > 1.5 && edgeDist(p) > 1.5; });
          if (ok) out.push({ id: `${label}${++k}`, dock: label, at: toLL(c), heading: Math.round((Math.atan2(u.x, u.y) * 180 / Math.PI + 360) % 360), finger: 0, kind: 'alongside' });
        }
        s0 += L;
      }
    }
  }
  // the ways out, where they aren't given: the basin's open edges, those with open water (the chart's, the sim's 50 m
  // land cells) just beyond them; each run of them is one way out, at its middle
  if (H.exits === 'auto') {
    const M = JSON.parse(await readFile(new URL('../src/geo/data/shore-mask.json', import.meta.url), 'utf8')), G = new Uint8Array(M.nx * M.ny);
    M.rows.forEach((runs, j) => { let i = 0, v = 0; for (const n of runs) { if (v) G.fill(1, j * M.nx + i, j * M.nx + i + n); i += n; v ^= 1; } });
    const landAt = ([la, lo]) => { const i = Math.floor((lo - M.west) / (M.east - M.west) * (M.nx - 1) + 0.5), j = Math.floor((M.north - la) / (M.north - M.south) * (M.ny - 1) + 0.5); return i >= 0 && j >= 0 && i < M.nx && j < M.ny && G[j * M.nx + i] === 1; };
    const runs = []; let cur = null;
    for (let i = 0; i < BP.length; i++) {
      const a = BP[i], b = BP[(i + 1) % BP.length], L = Math.hypot(b.x - a.x, b.y - a.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const n = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L }, side = inBasin({ x: m.x + n.x, y: m.y + n.y }) ? -1 : 1; // (outward)
      const open = L > 4 && [25, 45].every(d => { const q = { x: m.x + n.x * side * d, y: m.y + n.y * side * d }; return !inBasin(q) && !landAt(toLL(q)) && minDist(q, [...breakwaters, ...docks]) > 3; });
      if (open) { if (!cur) runs.push(cur = []); cur.push({ a, b, L }); } else cur = null;
    }
    if (runs.length > 1 && cur && runs[0] !== cur && BP.length && runs[0][0].a === BP[0]) { runs[0].unshift(...runs.pop()); } // (a run across the outline's start)
    H.exits = runs.filter(r => r.reduce((t, e) => t + e.L, 0) > 15).map(r => { // the middle of each run, along it
      const tot = r.reduce((t, e) => t + e.L, 0); let s = tot / 2;
      for (const e of r) { if (s <= e.L) { const t = s / e.L; return toLL({ x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t }); } s -= e.L; }
      return toLL(r[0].a);
    });
    if (!H.exits.length) fail(`${id}: no way out found`);
  }
  // the entrance beacons (lateral marks, from NOAA's chart via OSM seamarks)
  const beacons = [...nodes.values()].filter(n => n.tags['seamark:type'] === 'beacon_lateral' && near(xy([n.lat, n.lon]), 80))
    .map(n => ({ at: [r7(n.lat), r7(n.lon)], colour: n.tags['seamark:beacon_lateral:colour'] === 'green' ? 'green' : 'red' })).concat(H.beaconsExtra ?? []);

  // the SF Marina's own numbers (Gashouse Cove: scripts/sf-marina-numbers.mjs), in place of the letters; old ids kept for saves
  const sf = SF_DOCKS[id] ? sfNumbers(id, out) : null; if (sf) await writeRenames(id, sf.renames);
  await writeFile(new URL(`../src/geo/data/${id}.json`, import.meta.url), JSON.stringify({
    source: `OpenStreetMap contributors (ODbL), via api.openstreetmap.org (scripts/make-marinas.mjs); slips worked out from the fingers (3.0 m wide). ${H.letter === 'named' ? `Dock letters are the docks' names in OSM; slip numbers ${H.odd ? 'as on the harbor\'s own map' : 'are this sim\'s'}.` : typeof H.letter === 'object' ? 'A dock (the southernmost line) per the club\'s visitor notes; B, C, the fingers and the slip numbers are inferred.' : sf ? '' : 'Dock letters and slip numbers are this sim\'s, not the harbor\'s.'}${sf ? 'S' + SOURCE_NOTE.slice(3) : ''}`,
    fetched: new Date().toISOString().slice(0, 10), name: H.name,
    basin, breakwaters, walkways: walkways.map(w => w.pts), fingers: fingers.map(f => f.pts), areas,
    beacons, exits: H.exits, ...(H.shore ? { shore: [basin.slice(...H.shore)] } : basinFile?.shore ? { shore: basinFile.shore } : {}), ...(H.piles ? { piles: H.piles } : {}),
    ...(H.pathIds ? { paths: ways.filter(w => H.pathIds.includes(w.id)).map(pts) } : {}), slips: sf ? sf.slips : out
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
