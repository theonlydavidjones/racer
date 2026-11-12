import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LL } from '../geo/geo';
import { EAST_PIERS, onLand } from '../geo/shore';
import type { Vec } from '../core/math';
import { Kit, Path } from './bayBridge';
import { P3 } from './coords';
import type { Glint } from './night';

/**
 * The landmarks a sailor steers by in the East Bay and the north reach, at their real positions (extended November
 * 2026): the Richmond–San Rafael Bridge, the Brothers and East Brother Light, Red Rock, the Berkeley Pier, the Port of
 * Oakland's container cranes and Chevron's Long Wharf at Richmond. Visual only, except where a structure is solid (the
 * piers are in geo/shore.ts).
 */

const lam = (color: number) => new THREE.MeshLambertMaterial({ color });

/** A truss's side as a see-through panel: the chords along the top and bottom, Warren diagonals, verticals. */
function trussMaterial(color: string): THREE.Material {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d')!;
  g.strokeStyle = color; g.lineWidth = 7; g.beginPath();
  for (const y of [4, 60]) { g.moveTo(0, y); g.lineTo(128, y); }
  g.moveTo(0, 60); g.lineTo(64, 4); g.lineTo(128, 60); g.moveTo(64, 4); g.lineTo(64, 60); g.moveTo(0, 4); g.lineTo(0, 60); g.moveTo(128, 4); g.lineTo(128, 60);
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
}

/**
 * The Richmond–San Rafael Bridge (1956), I-580 from Point San Quentin to Point Molate: a double-deck steel bridge 6.5 km
 * (21,340 ft) long over the water, the "roller coaster" of two cantilever humps over the shipping channels.
 * - The line: OpenStreetMap's upper deck (way 24315544), from the Marin shore to the Richmond end of the steel.
 * - The spans, west to east (Wikipedia, "Richmond–San Rafael Bridge"): girders 1,900 ft (19 × 100 ft); deck trusses
 *   4,125 ft; the west cantilever, 2,145 ft with its 1,070 ft (326 m) channel span; trusses 2,955 ft between the
 *   cantilevers; the east cantilever, 2,145 ft; trusses 3,505 ft; girders 1,715 ft to the Richmond trestle.
 * - Where the channel spans and the piers are: NOAA's chart (ENC US5OAKGG, src/geo/data via scripts/fetch-charts.mjs):
 *   the West Channel span from 122.44652 W to 122.44281 W, 56.3 m (185 ft) clear above high water; the East Channel span
 *   from 122.42891 W to 122.42515 W, 41.1 m (135 ft) clear; the cantilevers' anchor piers 164 m beyond each, and the
 *   truss spans' piers about 90 m apart (the chart charts them east of the west cantilever; west of it they are laid
 *   out at the same spacing).
 * - The deck's rise and fall between them: no surveyed profile was found. Its grade "never exceeds 3%" (Wikipedia), so
 *   it climbs at 3% to each channel span's clearance from about 8 m above the water near the shores.
 * - The decks: westbound on top, eastbound below (Wikipedia); the approach spans are Pratt trusses, drawn about 10 m
 *   deep with the lower deck inside. The cantilevers' top chords rise over their main piers to about 99 m (325 ft) above
 *   the water (Caltrans's "tower height", from a search snippet of its project page, unconfirmed). The paint colour isn't
 *   published where we could reach: grey steel, as in photographs.
 */
function richmondBridge(parent: THREE.Object3D): void {
  const STEEL = lam(0x8b918f), CONC = lam(0xb5afa3), ROAD = lam(0x55534f), TRUSS = trussMaterial('#8b918f');
  const path = new Path([
    LL(37.94252, -122.47781), LL(37.94186, -122.47414), LL(37.94118, -122.47083), LL(37.94070, -122.46872), LL(37.93994, -122.46576),
    LL(37.93906, -122.46283), LL(37.93662, -122.45502), LL(37.93536, -122.44880), LL(37.93530, -122.44806), LL(37.93435, -122.43399),
    LL(37.93360, -122.42282), LL(37.93268, -122.40901), LL(37.93227, -122.40536)
  ]);
  const K = new Kit(path), L = path.len;
  // distance along the bridge to a longitude (the line runs west to east)
  const at = (lon: number) => { const x = LL(37.935, lon).x; let lo = 0, hi = L; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (path.at(m, 0).x < x) lo = m; else hi = m; } return lo; };
  const WC = [at(-122.44652), at(-122.44281)], EC = [at(-122.42891), at(-122.42515)];
  const WA = [at(-122.44838), at(-122.44098)], EA = [at(-122.43075), at(-122.42335)]; // the cantilevers, anchor pier to anchor pier
  const GW = 579, GE = L - 523; // the girder spans' ends (1,900 ft from Marin; 1,715 ft from the Richmond end)
  const DEPTH = 10, W = 15, LOW = 8;
  // the steel's underside above the water: up at 3% to each channel span's charted clearance, level across it
  const climb = (s: number, [a, b]: number[], clr: number) => clr - 0.03 * (s < a ? a - s : s > b ? s - b : 0);
  const bot = (s: number) => Math.max(LOW, climb(s, WC, 56.3), climb(s, EC, 41.1));
  const girder = (s: number) => s < GW || s > GE;
  // the cantilevers' top chords: high over the main piers, down to the truss depth at the anchor piers and mid-span
  const hump = (s: number, [a0, a1]: number[], [c0, c1]: number[]) => {
    if (s < a0 || s > a1) return 0;
    const pk = (x: number, p: number, w0: number, w1: number) => x < p ? Math.max(0, 1 - (p - x) / w0) : Math.max(0, 1 - (x - p) / w1);
    const half = (c1 - c0) / 2;
    return 33 * Math.max(pk(s, c0, c0 - a0, half), pk(s, c1, half, a1 - c1)) ** 1.4; // (56.3 + 10 + 33 ≈ 99 m over the west channel's main piers)
  };
  const top = (s: number) => bot(s) + (girder(s) ? 3 : DEPTH + hump(s, WA, WC) + hump(s, EA, EC));
  // the roadways: westbound on top of the lower truss, eastbound inside it
  K.sweep(ROAD, 0, L, 0, W - 1, s => bot(s) + (girder(s) ? 3 : DEPTH) - 0.4, s => bot(s) + (girder(s) ? 3 : DEPTH), 25, 't');
  K.sweep(ROAD, GW, GE, 0, W - 1, s => bot(s) + 4.4, s => bot(s) + 4.8, 25, 't');
  K.sweep(STEEL, 0, L, 0, W, bot, s => bot(s) + 0.8, 25, 'b');
  // the girders: solid plate sides; the trusses: see-through sides, up to the top chord
  K.sweep(STEEL, 0, GW, 0, W, bot, s => bot(s) + 3, 25, 'lr'); K.sweep(STEEL, GE, L, 0, W, bot, s => bot(s) + 3, 25, 'lr');
  K.sweep(TRUSS, GW, GE, 0, W, bot, top, 12, 'lr');
  // the top chords of the cantilevers' humps, a beam each side, and the top bracing between them
  for (const [a0, a1] of [WA, EA]) for (let s = a0; s < a1; s += 6) { const h = top(s); for (const sx of [-1, 1]) K.box(STEEL, 0.9, 0.9, 6.2, s + 3, sx * W / 2, h); if (Math.round(s / 6) % 3 === 0) K.box(STEEL, W, 0.5, 0.6, s, 0, h); }
  // the piers: paired concrete columns on a footing at the waterline; the cantilevers' main and anchor piers heavier
  const pier = (s: number, big: boolean) => {
    const h = bot(s), w = big ? 5 : 2.6;
    for (const sx of [-1, 1]) K.box(CONC, w, h, w, s, sx * (W / 2 - w / 2), h / 2);
    K.box(CONC, W + 2, big ? 3 : 1.6, w + 2, s, 0, big ? 1.5 : 0.8); K.box(CONC, W, 1.4, w, s, 0, h - 0.7);
  };
  for (const s of [...WA, ...WC, ...EC, ...EA]) pier(s, true);
  for (let s = 30; s < GW; s += 30.5) pier(s, false); // 100 ft girder spans
  for (let s = GE + 30; s < L - 5; s += 30.5) pier(s, false);
  // the truss spans' piers: about 90 m apart between the girders and the cantilevers
  for (const [a, b] of [[GW, WA[0]], [WA[1], EA[0]], [EA[1], GE]]) { const n = Math.max(1, Math.round((b - a) / 88)); for (let i = 0; i <= n; i++) pier(a + (b - a) * i / n, false); }
  K.build(parent);
}

/**
 * The Brothers, two rocky islets off Point San Pablo (OpenStreetMap ways 161075091 and 161075092): East Brother, about
 * 0.4 ha, blasted flat for the light station, 7 m high; West Brother, bare rock. East Brother Light Station (1874, Paul
 * Pelz, Stick style; OSM way 35406270; Wikipedia, "East Brother Island Light"): a two-storey keeper's house with the
 * square light tower at its corner, 15 m (48 ft) tall, the light 19 m (61 ft) above the water, Fl W 5 s. The tower is
 * ochre ("buff", the Coast Guard's history) with white trim and a red lantern (Wikipedia); the house is drawn the same
 * (its own colours and footprint aren't published where we could reach), the roof dark.
 */
function brothers(parent: THREE.Object3D, glints: Glint[]): void {
  const ROCK = lam(0x7d7466), HOUSE = lam(0xd9b56a), TRIM = lam(0xf2efe6), ROOF = lam(0x4a4440), LANTERN = lam(0xa8322a);
  const g = new THREE.Group(), p = LL(37.96316, -122.43359); g.position.copy(P3(p.x, p.y, 0)); parent.add(g);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  // the islands' rock, as low mounds (East Brother's flat top round the station; West Brother 160 m to the west-south-west)
  const e = LL(37.96326, -122.43338), w = LL(37.96279, -122.43519);
  const mound = (q: { x: number; y: number }, r: number, h: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, h, 10), ROCK); m.position.set(q.x - p.x, h / 2 - 1, -(q.y - p.y)); g.add(m); };
  mound(e, 36, 8); mound(w, 26, 9);
  // the house, its roof and the tower
  box(12, 7, 9, 0, 10, 0, HOUSE);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8.5, 4, 4), ROOF); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.75); roof.position.set(0, 15.5, 0); g.add(roof);
  box(3.4, 15, 3.4, 5.5, 14.5, 3, HOUSE); box(3.8, 0.4, 3.8, 5.5, 22, 3, TRIM); box(2.6, 2.2, 2.6, 5.5, 23.3, 3, LANTERN); box(12.3, 0.4, 9.3, 0, 13.4, 0, TRIM); // the tower, its gallery and lantern; the house's eaves
  glints.push({ x: p.x + 5.5, y: p.y - 3, h: 19, color: 0xfff4d6, i: 0.6, w: 3 });
}

/** A simple deterministic hash, so the ruined pier's missing piles are the same every time. */
const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * The piers out on the open water (geo/shore.ts EAST_PIERS, OpenStreetMap): the Berkeley Pier's deck on its piles, the
 * abandoned 3 km beyond it as rows of piles with a few stretches of broken deck, and Chevron's Long Wharf. The deck heights
 * (about 3 m above the water, like the city's piers: render/wharf.ts) and the pile bents (every 6 m, three piles across)
 * are read off photographs, not published figures.
 */
function piers(parent: THREE.Object3D): void {
  const DECK = 3.0, THICK = 0.6, BENT = 6;
  const deck: THREE.BufferGeometry[] = [], piles: Vec[] = [];
  const slab = (pts: Vec[]) => {
    const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p.x, p.y) : sh.moveTo(p.x, p.y));
    const g = new THREE.ExtrudeGeometry(sh, { depth: THICK, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, DECK - THICK, 0);
    const out = g.toNonIndexed(); g.dispose(); out.deleteAttribute('uv'); deck.push(out);
  };
  // piles under a deck: bents square to its long axis every BENT metres, inside its outline
  const pileArea = (pts: Vec[], every: number) => {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const inside = (q: Vec) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > q.y) !== (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
    for (let x = x0 + BENT / 2; x < x1; x += every * BENT / 2) for (let y = y0 + BENT / 2; y < y1; y += every * BENT / 2) { const q = { x, y }; if (inside(q)) piles.push(q); }
  };
  for (const a of EAST_PIERS.areas) { slab(a.pts); pileArea(a.pts, a.name?.startsWith('Long Wharf') ? 2 : 1); } // (the Long Wharf's wide T-head: its piles drawn every other bent each way, to spare the triangles)
  // the abandoned pier: its line of bents, three piles across, many gone; here and there a stretch of deck still on them
  for (const l of EAST_PIERS.lines) {
    const [a, b] = [l.pts[0], l.pts[l.pts.length - 1]], L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    for (let s = 0, k = 0; s < L; s += BENT, k++) {
      for (const off of [-2.5, 0, 2.5]) if (hash(k * 3 + off) > 0.35) piles.push({ x: a.x + ux * s - uy * off, y: a.y + uy * s + ux * off });
      if (hash(k + 0.5) > 0.93) { const w = 6.6 / 2, e = BENT * 0.9; slab([{ x: a.x + ux * s - uy * w, y: a.y + uy * s + ux * w }, { x: a.x + ux * (s + e) - uy * w, y: a.y + uy * (s + e) + ux * w }, { x: a.x + ux * (s + e) + uy * w, y: a.y + uy * (s + e) - ux * w }, { x: a.x + ux * s + uy * w, y: a.y + uy * s - ux * w }]); }
    }
  }
  const g = mergeGeometries(deck); g.computeVertexNormals(); parent.add(new THREE.Mesh(g, lam(0x9c958a))); deck.forEach(x => x.dispose());
  const pile = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, DECK + 3, 6), lam(0x5d5248), piles.length), m = new THREE.Matrix4();
  piles.forEach((q, i) => { m.makeTranslation(q.x, (DECK - 3) / 2, -q.y); pile.setMatrixAt(i, m); });
  parent.add(pile);
}

/**
 * The Port of Oakland's ship-to-shore container cranes, at OpenStreetMap's positions (30 portal cranes on rails, traced
 * from Bing imagery: the Outer and Middle Harbor and the Inner Harbor's north shore; OSM has no more of them, so a few of
 * today's may be missing and a retired one or two shown). Each faces the water, its boom out over the berth.
 * Their size (Port of Oakland press, via search: the newest lift 53 m, 174 ft, above the wharf, the 2018 raise to 43 m,
 * 142 ft): an A-frame about 80 m to its apex, the boom about 55 m up reaching 60 m over the water and 20 m back, the
 * portal's legs 30 m apart along the boom and 18 m along the wharf (typical of post-Panamax cranes, not published for
 * Oakland's). Their colour isn't published where we could reach: white, with the machinery house grey.
 */
function cranes(parent: THREE.Object3D): void {
  const SITES: [number, number][] = [
    [37.79387, -122.29298], [37.79374, -122.30024], [37.79376, -122.30071], [37.79381, -122.30171], [37.79383, -122.30213], [37.79427, -122.30694], [37.79444, -122.30754],
    [37.79458, -122.30801], [37.79516, -122.31024], [37.79606, -122.31384], [37.79659, -122.31590], [37.79767, -122.32013], [37.79859, -122.32364], [37.79848, -122.32315],
    [37.79864, -122.32391], [37.80580, -122.34224], [37.80705, -122.33995], [37.80735, -122.33941], [37.80757, -122.33900], [37.80893, -122.33644], [37.81025, -122.32238],
    [37.80991, -122.32350], [37.80995, -122.32390], [37.81015, -122.32596], [37.81032, -122.32761], [37.81619, -122.31611], [37.81897, -122.31333], [37.81411, -122.31819],
    [37.81467, -122.31768], [37.81534, -122.31700]
  ];
  // one crane, in its own frame: x along the wharf, z out over the water (+z), y up
  const WHITE: THREE.BufferGeometry[] = [], GREY: THREE.BufferGeometry[] = [];
  const box = (to: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); to.push(g.toNonIndexed()); g.dispose(); };
  const strut = (to: THREE.BufferGeometry[], a: [number, number, number], b: [number, number, number], t: number) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), g = new THREE.BoxGeometry(t, A.distanceTo(B), t);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); to.push(g.toNonIndexed()); g.dispose();
  };
  const GX = 9, GZ = 15, PORTAL = 14, BOOM = 55, APEX = 80;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { strut(WHITE, [sx * GX, 0, sz * GZ], [sx * GX, BOOM, sz * GZ], 2.2); } // the four legs
  for (const sx of [-1, 1]) { box(WHITE, 2, 2.4, 2 * GZ + 2, sx * GX, PORTAL, 0); box(WHITE, 2.2, 2.6, 2 * GZ + 2, sx * GX, BOOM - 4, 0); strut(WHITE, [sx * GX, PORTAL, -GZ], [sx * GX, BOOM - 4, GZ], 1.2); } // portal beams and side bracing
  for (const sz of [-1, 1]) box(WHITE, 2 * GX + 2, 2.4, 2, 0, PORTAL, sz * GZ);
  // the boom (out over the water) and the back-reach girder, a pair of box girders
  for (const sx of [-1, 1]) box(WHITE, 1.6, 3.2, 82, sx * 3.5, BOOM, 20);
  // the A-frame over the land-side legs, and the forestays out to the boom's tip and back to its tail
  for (const sx of [-1, 1]) { strut(WHITE, [sx * GX, BOOM, -GZ], [sx * 3, APEX, -GZ + 6], 1.6); strut(WHITE, [sx * GX, BOOM, GZ], [sx * 3, APEX, -GZ + 6], 1.6); strut(WHITE, [sx * 3, APEX, -GZ + 6], [sx * 3.5, BOOM + 1.5, 60], 0.5); strut(WHITE, [sx * 3, APEX, -GZ + 6], [sx * 3.5, BOOM + 1.5, -20], 0.6); }
  box(WHITE, 8, 1.6, 2.4, 0, APEX, -GZ + 6);
  box(GREY, 9, 5, 12, 0, BOOM + 4.2, -14); // the machinery house on the back-reach
  box(GREY, 4, 3.2, 4, 0, BOOM - 3.6, 6); // the trolley and the operator's cab under the boom
  const gW = mergeGeometries(WHITE), gG = mergeGeometries(GREY); gW.computeVertexNormals(); gG.computeVertexNormals();
  const mw = new THREE.InstancedMesh(gW, lam(0xe8e8e2), SITES.length), mg = new THREE.InstancedMesh(gG, lam(0x7d8084), SITES.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  SITES.forEach(([la, lo], i) => {
    const p = LL(la, lo);
    // which way the water is: the bearing (of 72) with the most water within 60 m, and its neighbours
    let best = 0, bw = -1;
    for (let k = 0; k < 72; k++) { const a = k * 5 * Math.PI / 180; let w = 0; for (const r of [20, 40, 60]) for (const da of [-0.3, 0, 0.3]) if (!onLand({ x: p.x + Math.sin(a + da) * r, y: p.y + Math.cos(a + da) * r })) w++; if (w > bw) { bw = w; best = a; } }
    q.setFromAxisAngle(up, Math.PI - best); // the crane's +z (out over the water) along the bearing (world z is south)
    m.compose(P3(p.x, p.y, 2.5), q, one); mw.setMatrixAt(i, m); mg.setMatrixAt(i, m);
  });
  WHITE.concat(GREY).forEach(g => g.dispose());
  parent.add(mw, mg);
}

export function buildEastBay(parent: THREE.Object3D): Glint[] {
  const glints: Glint[] = [];
  richmondBridge(parent);
  brothers(parent, glints);
  piers(parent);
  cranes(parent);
  return glints;
}
