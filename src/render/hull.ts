import './three-setup';
import * as THREE from 'three';

/**
 * A Nordic Folkboat hull, built from a few functions of position along the boat. Class figures (NFIA Class Rules
 * 2025–2028, Appendix): about 6.00 m on the waterline, 2.20 m beam, 1.20 m draft, lowest freeboard 0.568 m. The
 * length on deck, 7.64 m, isn't confirmed (the rules and ORC give 7.68 overall). The deck's half-breadths come from the
 * class lines (below); the rest (sheer at the ends, sections, keel profile, cabin and cockpit sizes) is estimated from
 * the boat's well-known look, not from the lines plan: long overhangs, a sweeping sheer, slack bilges into a long keel
 * with a cutaway forefoot, the rudder hung on a small raked transom with the tiller over its top, and clinker
 * (lapstrake) planking, which the glassfibre boats copy in their moulding.
 *
 * Frame: x to starboard, y up (waterline at 0), z aft; the bow is at z = −L/2.
 */
export const L = 7.64;
const zAt = (u: number) => -L / 2 + u * L;

/**
 * Sheer height above the waterline: high bow, lowest about 60% aft (0.568 m, the class's lowest freeboard), and only a
 * little rise to the transom: the class's construction plan (1:10, folkboat.com, rev. 2024) dimensions the deck line
 * 598 mm above the waterline at the transom, then 588, 578 and 573 going forward, which this curve meets within a few mm.
 */
export function sheer(u: number): number {
  return u < 0.62 ? 0.568 + 0.40 * Math.pow((0.62 - u) / 0.62, 1.8) : 0.568 + 0.030 * ((u - 0.62) / 0.38) ** 2;
}
/**
 * Half-breadth of the deck (m) at the class's measuring stations, 0.5 m apart (CR 2.14), station 1 at the transom:
 * from the class's construction plan (Nordic Folkboat Construction Plan, 1:10, 1947, rev. 2024, folkboat.com; the same
 * figures as the physics, boat/crewPhys.ts). Station 11's 1910 mm beam is also the class rule's (CR 2.161), and the
 * numbering agrees with the rules: the frames abreast the mast at stations 10 and 10.5 (CR 2.208), where the forestay
 * rules put it; the cockpit's after end at station 3 (CR 3.22).
 */
const HB_MM = [655, 760, 860, 948, 1017, 1067, 1094, 1100, 1080, 1028, 955, 849, 705, 530, 315]; // stations 1..15
/**
 * A fair curve through points (x increasing): a monotone cubic (Fritsch–Carlson), so between two points it never
 * bulges past them, the way a batten bent through a table of offsets lies.
 */
export function fairCurve(pts: [number, number][]): (x: number) => number {
  const n = pts.length, d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  const m = [d[0], ...d.slice(1).map((di, i) => (d[i] * di <= 0 ? 0 : (d[i] + di) / 2)), d[n - 2]];
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = Math.hypot(a, b);
    if (h > 3) { m[i] = 3 * a / h * d[i]; m[i + 1] = 3 * b / h * d[i]; }
  }
  return (x: number) => {
    let i = 0; while (i < n - 2 && x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = x1 - x0, t = Math.min(1, Math.max(0, (x - x0) / h));
    return (2 * t ** 3 - 3 * t * t + 1) * y0 + (t ** 3 - 2 * t * t + t) * h * m[i] + (-2 * t ** 3 + 3 * t * t) * y1 + (t ** 3 - t * t) * h * m[i + 1];
  };
}
/** (z, half-breadth) from the stem aft. */
const STATIONS: [number, number][] = [[-L / 2, 0]];
for (let k = 15; k >= 1; k--) STATIONS.push([L / 2 - 0.5 * (k - 1), HB_MM[k - 1] / 1000]);
const deckLine = fairCurve(STATIONS);
/** Half-beam at the sheer (m) at station u: fine bow, full a little aft of amidships, a 1.31 m transom. */
export const halfBeam = (u: number) => Math.max(0, deckLine(zAt(Math.min(1, Math.max(0, u)))));
const ease = (f: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, f)))) / 2;

/**
 * The stern: the raked transom and the sternpost are one straight line, from the heel of the keel up to the top of the
 * transom, and the rudder hangs on it. From the class's construction plan (1:10, rev. 2024): the waterline crosses
 * that line 620 mm forward of the transom's top, and the heel is 1216 mm further forward at the 1200 mm draft, so it
 * rakes about 46° from the vertical; the transom is flat (CR 2.16), 1310 mm wide at the deck (station 1, 655 mm
 * half-breadth). The waterline ends where it crosses y = 0.
 */
export const HEEL = { z: L / 2 - 0.620 - 1.216, y: -1.2 }, TRANSOM_TOP = { z: L / 2, y: sheer(1) };
export const aftLineZ = (y: number) => HEEL.z + (y - HEEL.y) * (TRANSOM_TOP.z - HEEL.z) / (TRANSOM_TOP.y - HEEL.y);

/**
 * Bottom of the canoe body on the centreline: the spoon bow's stem, the hull bottom, rising aft. The stem meets the
 * water about 1.02 m aft of the bow at deck level, so with the raked transom's crossing (aftLineZ(0), 0.62 m forward
 * of the transom, from the plan) she's 6.0 m on the waterline (class Appendix: LWL 6.00 m). The stem's curve itself
 * is estimated.
 */
const BOW = 0.144; // where the stem's curve meets the forefoot (fraction of L)
function canoe(u: number): number {
  if (u < BOW) return 0.96 - 1.06 * Math.pow(u / BOW, 1.34);
  if (u < 0.45) return -0.1 - 0.52 * ease((u - BOW) / (0.45 - BOW));
  if (u < 0.62) return -0.62; // where the hollow garboards meet the keel amidships (the plan's main section at St. 8)
  return -0.62 + 0.79 * ease((u - 0.62) / 0.38);
}
/** Keel bottom: cutaway forefoot, deepest at the heel (1.2 m draft with the keel band), where the sternpost rises. */
const U_HEEL = (HEEL.z + L / 2) / L;
function keel(u: number): number {
  if (u <= BOW) return canoe(u);
  if (u < 0.33) return -0.1 + (-0.95 + 0.1) * ease((u - BOW) / (0.33 - BOW));
  return Math.max(-1.2, -0.95 - 0.25 * (u - 0.33) / (U_HEEL - 0.33));
}
/** Half-thickness of the keel (ballast keel and deadwood). */
function keelHalf(u: number): number {
  if (u <= BOW) return 0;
  return 0.03 + 0.1 * Math.pow(Math.sin(Math.PI * Math.min(1, (u - BOW) / 0.73)), 0.7);
}
/**
 * The sections' shape: the wineglass section of the class's construction plan (main section at St. 8): topsides
 * nearly upright, a firm turn of the bilge just below the waterline, then hollow garboards running down into the keel.
 * Half-breadth = keel + (deck − keel) · F(q), q the height from the keel's side (0) to the sheer (1), with
 * F(q) = (1 − (1 − q)^α)^β: α sets how long the topsides stay upright, β > 1 the hollow into the keel. Fitted to the
 * St. 8 section (within about 3 cm at the waterline, the turn of the bilge and the garboards); finer and more V-shaped
 * forward, and aft the same wineglass narrowing to the sternpost, which gives the flat transom its shape: wide and
 * nearly upright-sided at the deck, curving in to meet the sternpost near the waterline (the owner's photos).
 */
function sectionShape(u: number): { al: number; be: number } {
  // toward the transom the hollow gives way to a full, round run (Josephine hauled out: the owner's photo), so the
  // transom's foot is a broad, nearly flat U at about the waterline, not a point
  const mid = ease((u - 0.12) / 0.3), aft = ease((u - 0.62) / 0.38), tr = ease((u - 0.78) / 0.18);
  return { al: 1.6 + 2.4 * mid + 1.8 * aft - 1.2 * tr, be: 1.0 + 0.6 * mid + 0.9 * aft - 1.85 * tr };
}

const NU = 72, NF = 5, STRAKES = 9, LAP = 0.016;
/** Where strake k's top edge is (p; the last strake, the garboard, ends on the keel's side at 0.8). */
const strakeP = (k: number) => (k >= STRAKES ? 0.8 : 0.8 * k / STRAKES);
/**
 * How far the plank stands out at fraction t down strake k: clinker, so each plank's lower edge laps over the outside
 * of the plank below and the plank lies at a slight angle, out toward its lower edge. The garboard's lower edge isn't
 * lapped: it's let into the rabbet in the keel, flush with it (the class construction plan), so it lies flush.
 */
const strakeLap = (k: number, t: number) => (k >= STRAKES - 1 ? 0 : LAP * t);
/** Moves a point on the section out (along the section's outward normal) by `lap` m. */
function lapOut(pt: { x: number; y: number }, u: number, p: number, lap: number) {
  const q = hullPoint(u, Math.min(0.8, p + 0.01)), dx = pt.x - q.x, dy = pt.y - q.y, l = Math.hypot(dx, dy) || 1;
  pt.x += (dy / l) * lap; pt.y -= (dx / l) * lap; // (q is below pt on the section, so (dy, −dx) points outboard)
}

/** The section point at station u: p from 0 at the sheer to 0.8 at the keel's side (canoe body), 1 at the keel bottom. */
function sectionPoint(u: number, p: number): { x: number; y: number } {
  const b = halfBeam(u), s = sheer(u), kc = canoe(u), wk = keelHalf(u), kb = Math.min(keel(u), kc);
  if (p <= 0.8) {
    // heights spread down the section (the strakes a little closer near the keel), the breadth from the wineglass curve
    const a = (p / 0.8) * Math.PI / 2, g = Math.pow(Math.sin(a), 1.15), ys = s - (s - kc) * g;
    const { al, be } = sectionShape(u), w = Math.min(wk, b), F = Math.pow(1 - Math.pow(g, al), be);
    return { x: w + (b - w) * F, y: ys };
  }
  const f = (p - 0.8) / 0.2;
  return f < 0.85 ? { x: wk * (1 - 0.15 * f / 0.85), y: kc + (kb - kc) * f / 0.85 } : { x: wk * 0.85 * (1 - (f - 0.85) / 0.15), y: kb };
}
/** How far aft the hull goes along the line of constant p: where it meets the raked transom / sternpost plane. */
const uMaxCache = new Map<number, number>();
function uMax(p: number): number {
  const c = uMaxCache.get(p); if (c != null) return c;
  let lo = 0.6, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, q = sectionPoint(m, p); if (zAt(m) < aftLineZ(q.y)) lo = m; else hi = m; }
  uMaxCache.set(p, lo); return lo;
}
function hullPoint(u: number, p: number): THREE.Vector3 { const q = sectionPoint(u, p); return new THREE.Vector3(q.x, q.y, zAt(u)); }

export interface HullPaint { topsides: THREE.Color; boot: THREE.Color; bottom: THREE.Color }

/** The hull shell (both sides), clinker planked, painted: bottom paint below the waterline, a boot stripe, topsides. */
/**
 * The paint lines, struck level the way a yard marks them, with the usual slight rise toward the bow and the stern:
 * the top of the bottom paint (just above the waterline), and the top of the boot stripe. y as a function of z.
 */
export const PAINT_LINES = { wl: 0.045, wlRise: 0.035, stripe: 0.065, stripeRise: 0.02 };
export const paintLines = (z: number) => { const e = (2 * z / L) ** 2; return { wl: PAINT_LINES.wl + PAINT_LINES.wlRise * e, top: PAINT_LINES.wl + PAINT_LINES.stripe + (PAINT_LINES.wlRise + PAINT_LINES.stripeRise) * e }; };

/** The shell's geometry; its vertex colours are only the light and shade of the laps (the paint is per pixel: boatMesh.ts). */
export function hullGeometry(_paint?: HullPaint): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const white = new THREE.Color(1, 1, 1), colorAt = (_y: number) => white;
  // rows: the planked canoe body in STRAKES bands (each plank's lower edge stands out by LAP), then the keel
  type Row = { p: number; lap: number; shade?: number; land?: boolean }[];
  const strips: Row[] = [];
  for (let k = 0; k < STRAKES; k++) {
    const p0 = strakeP(k), p1 = strakeP(k + 1), row: Row = [];
    if (k > 0) row.push({ p: p0 - 0.02, lap: 0, shade: 1, land: true }); // the land: this plank's top edge, hidden behind the plank above
    for (let j = 0; j <= 3; j++) row.push({ p: j === 3 ? p1 : p0 + (p1 - p0) * j / 3, lap: strakeLap(k, j / 3), shade: j === 0 && k > 0 ? 0.82 : 1 }); // in the shadow of the lap above
    strips.push(row);
    if (k < STRAKES - 1) strips.push([{ p: p1, lap: LAP }, { p: p1, lap: 0 }]); // the lap's edge, facing down
  }
  // the keel, from the garboard's lower edge (the same vertices: the garboard lands in the keel's rabbet, no gap)
  { const row: Row = []; for (let j = 0; j <= NF; j++) row.push({ p: j === 0 ? 0.8 : 0.8 + 0.2 * j / NF, lap: 0 }); strips.push(row); }
  for (const side of [1, -1]) {
    for (const row of strips) {
      const base = pos.length / 3;
      for (let i = 0; i <= NU; i++) for (const r of row) {
        const f = i / NU, u = f * uMax(r.p), pt = hullPoint(u, r.p);
        // push the lap outward across the section (along the section's outward normal); the planks run out
        // flush at the stem and the transom
        const lap = r.lap * Math.min(1, f / 0.04, (1 - f) / 0.03);
        if (lap > 0) lapOut(pt, u, r.p, lap);
        pos.push(pt.x * side, pt.y, pt.z);
        const c = colorAt(pt.y), k = row.length === 2 && row[0].p === row[1].p ? 0.55 : r.shade ?? 1; col.push(c.r * k, c.g * k, c.b * k);
      }
      // (a plank's faces look outboard; a lap's edge, running from the plank's outer face in to the plank below, faces
      // down into its own shadow: the same winding does both)
      const W = row.length;
      for (let i = 0; i < NU; i++) for (let j = 0; j < W - 1; j++) {
        const a = base + i * W + j, b = a + 1, c = a + W, d = c + 1;
        if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
  }
  // transom and sternpost: the hull's aft ends, all on the raked plane. Its outline (the wide transom above the
  // waterline, the narrow sternpost and deadwood below it) isn't convex, so it's triangulated as a shape, not fanned
  // from a centre, and each face turned to look aft, out of the hull.
  // Its outline runs through the planks' own end points (no others, and not the lands hidden behind them), so the hull
  // and the transom share every vertex along their join and no crack opens between them.
  { const ps = [...new Set(strips.flatMap(row => row.filter(r => !r.land).map(r => r.p)))].sort((a, b) => a - b), outline: THREE.Vector3[] = [];
    for (const p of ps) outline.push(hullPoint(uMax(p), p));
    for (let j = ps.length - 2; j >= 0; j--) { const pt = hullPoint(uMax(ps[j]), ps[j]); outline.push(new THREE.Vector3(-pt.x, pt.y, pt.z)); }
    const ring = outline.filter((q, i) => i === 0 || q.distanceTo(outline[i - 1]) > 1e-4);
    const base = pos.length / 3; transomFrom = base; transomTo = base + ring.length;
    for (const q of ring) { pos.push(q.x, q.y, q.z); const c = colorAt(q.y); col.push(c.r, c.g, c.b); }
    const out = new THREE.Vector3(0, -(TRANSOM_TOP.z - HEEL.z) / (TRANSOM_TOP.y - HEEL.y), 1); // the plane's aft-facing normal
    const tris = THREE.ShapeUtils.triangulateShape(ring.map(q => new THREE.Vector2(q.x, q.y)), []);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const [a, b, c] of tris) {
      e1.subVectors(ring[b], ring[a]); e2.subVectors(ring[c], ring[a]);
      if (e1.cross(e2).dot(out) > 0) idx.push(base + a, base + b, base + c); else idx.push(base + a, base + c, base + b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // The raked transom looks down at the water, so the scene's sky and sun leave it in shade; on the real boat light
  // bounced off the water and the hard keeps it nearly as bright as the topsides (the owner's haul-out photo). The
  // scene has no bounced light, so the transom is lit as if it faced straight aft.
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = transomFrom; i < transomTo; i++) nrm.setXYZ(i, 0, 0.1 / Math.hypot(1, 0.1), 1 / Math.hypot(1, 0.1));
  return g;
}
let transomFrom = 0, transomTo = 0;

/* ---------- deck, cabin, cockpit ---------- */

/** Openings in the deck: the cabin trunk and the cockpit well (u range, half-width). */
/**
 * The cabin trunk, by the class rules: its top at least 1850 mm long from the main bulkhead to where it meets the
 * deck forward (CR 3.11), the after end within 300 mm forward of station 6 (CR 3.12): drawn 1.85 m, ending 0.26 m
 * forward of station 6, which starts it 0.10 m aft of the mast; the mast goes through the foredeck at the sheer (the
 * boom's band 1.00 m above the deck, CR 6.1.11). The cockpit from the main bulkhead aft to station 3 (CR 3.22), 1.0 m
 * from the transom, leaving a long after deck; its side decks 250–310 mm wide (CR 3.22).
 * Its section, from the construction plan's main section at St. 8 and CR 3.13–3.14: about 1580 mm wide there (at least
 * 1550), the sides upright and about 200 mm above the deck (at least 190), the top arched about 170 mm above the sides'
 * tops (at least 150); the side decks about 300 mm, and the cockpit coamings carry the cabin sides' line on aft, faired
 * into them (CR 3.25, the plan's "cockpit coaming to fair into cabin sides").
 */
const zU = (z: number) => (z + L / 2) / L;
/** The side deck's width, sheer to cabin side or coaming (m). */
export const SIDE_DECK = 0.30;
/** The line of the cabin sides and the coamings' outer face: the sheer less the side deck. */
export const sideLine = (u: number) => halfBeam(u) - SIDE_DECK;
export const CABIN = { u0: zU(-0.79), u1: zU(1.06), w: 0.79, h: 0.20, crown: 0.17 };
export const COCKPIT = { u0: zU(1.06), u1: zU(L / 2 - 2 * 0.5), sole: 0.24 };
/** The coaming's thickness (m): the cockpit opening is its inside face. */
export const COAMING_T = 0.025;
/** Cockpit half-width: inside the coaming, which follows the side line, narrowing aft with the hull. */
export const cockpitHalf = (u: number) => sideLine(u) - COAMING_T;
const CAMBER = 0.05;
export const deckY = (u: number, x: number) => sheer(u) + CAMBER * Math.max(0, 1 - (x / Math.max(0.05, halfBeam(u))) ** 2) * halfBeam(u) / 1.1;

/** The deck: cambered, following the sheer, open where the cabin and cockpit are. */
export function deckGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const us: number[] = [];
  for (let i = 0; i <= NU; i++) us.push(i / NU);
  for (const e of [CABIN.u0, CABIN.u1, COCKPIT.u1]) us.push(e - 1e-4, e + 1e-4);
  us.sort((a, b) => a - b);
  const inner = (u: number) => (u > CABIN.u0 && u < CABIN.u1 ? cabinHalf(u) : u > COCKPIT.u0 && u < COCKPIT.u1 ? cockpitHalf(u) : 0);
  const NX = 8;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (const u of us) {
      const b = Math.max(0.001, halfBeam(u) - 0.01), xi = Math.min(inner(u), b - 0.05);
      for (let j = 0; j <= NX; j++) { const x = xi + (b - xi) * j / NX; pos.push(x * side, deckY(u, x), zAt(u)); }
    }
    for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < NX; j++) {
      const a = base + i * (NX + 1) + j, b2 = a + 1, c = a + NX + 1, d = c + 1;
      if (side > 0) idx.push(a, b2, c, b2, d, c); else idx.push(a, c, b2, b2, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // texture coordinates for laid decks: planks run fore and aft (u across the boat, a plank to 0.07 m; v along it)
  const uv: number[] = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 0.28, pos[i + 2] / 2.4);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Cabin trunk half-width: the side line, rounded in plan at the front. */
export function cabinHalf(u: number): number {
  const r = 0.05, w = sideLine(u); // the rounded front, as a fraction of the length
  if (u < CABIN.u0 + r) { const f = (CABIN.u0 + r - u) / r; return w * Math.sqrt(Math.max(0, 1 - f * f * 0.85)); }
  return w;
}
/** How far the cabin sides lean in over their height (m). */
const CABIN_LEAN = 0.015;

/** Height of the cabin sides' top edge at station u. */
export const cabinTopY = (u: number) => deckY(u, cabinHalf(u)) + CABIN.h;
/** The cabin top's surface at station u, x across: arched from the sides' top edges up to the centreline. */
export const cabinTopAt = (u: number, x: number) => { const w = Math.max(0.05, cabinHalf(u) - CABIN_LEAN); return cabinTopY(u) + CABIN.crown * Math.max(0, 1 - (x / w) ** 2); };

/** The cabin trunk: sides from below the deck up to an arched top, and the after end (the main bulkhead's face). */
export function cabinGeometry(): { sides: THREE.BufferGeometry; top: THREE.BufferGeometry; aft: THREE.BufferGeometry; topY: (u: number) => number } {
  const N = 40, topY = cabinTopY;
  const outline: { u: number; x: number }[] = [];
  for (let i = 0; i <= N; i++) { const u = CABIN.u0 + (CABIN.u1 - CABIN.u0) * i / N; outline.push({ u, x: cabinHalf(u) }); }
  const sides: number[] = [], sIdx: number[] = [];
  const ring = [...outline.map(o => ({ u: o.u, x: o.x })), ...outline.slice().reverse().map(o => ({ u: o.u, x: -o.x }))];
  ring.push(ring[0]); // close the front
  for (const o of ring) {
    sides.push(o.x, 0.45, zAt(o.u), o.x - Math.sign(o.x) * CABIN_LEAN, topY(o.u), zAt(o.u));
  }
  for (let i = 0; i < ring.length - 1; i++) { const a = i * 2; sIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3)); sg.setIndex(sIdx); sg.computeVertexNormals();
  const top: number[] = [], tIdx: number[] = [], NX = 8;
  for (let i = 0; i <= N; i++) {
    const u = outline[i].u, w = outline[i].x - CABIN_LEAN;
    for (let j = 0; j <= NX; j++) { const x = -w + 2 * w * j / NX; top.push(x, cabinTopAt(u, x), zAt(u)); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < NX; j++) { const a = i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1; tIdx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); tg.setIndex(tIdx); tg.computeVertexNormals();
  // the after end: from the deck up the sides and over the arch of the top, facing aft into the cockpit
  const u1 = CABIN.u1, w1 = cabinHalf(u1), z1 = zAt(u1) + 0.002, rim: THREE.Vector2[] = [new THREE.Vector2(w1, COCKPIT.sole)];
  for (let j = 0; j <= 16; j++) { const x = (w1 - CABIN_LEAN) * (1 - 2 * j / 16); rim.push(new THREE.Vector2(x, cabinTopAt(u1, x))); }
  rim.push(new THREE.Vector2(-w1, COCKPIT.sole));
  const ap: number[] = []; for (const q of rim) ap.push(q.x, q.y, z1);
  const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
  ag.setIndex(THREE.ShapeUtils.triangulateShape(rim, []).flat()); ag.computeVertexNormals();
  return { sides: sg, top: tg, aft: ag, topY };
}

/** A flat quad from four corners (counter-clockwise seen from the side it faces). */
export function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d]); g.computeVertexNormals(); return g;
}

/** Cockpit well: sole, the side walls from the deck edge down to it (following the taper), and the aft wall. */
export function cockpitGeometry(): THREE.BufferGeometry[] {
  const { u0, u1, sole } = COCKPIT, N = 16, us = Array.from({ length: N + 1 }, (_, i) => u0 + (u1 - u0) * i / N);
  const strip = (pts: [THREE.Vector3, THREE.Vector3][], flip: boolean) => {
    const pos: number[] = [], idx: number[] = [];
    for (const [a, b] of pts) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; if (flip) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // the well's sole narrows aft with the V of her sections, inside the hull; its sides slope up to the deck opening
  const soleHalf = (u: number) => Math.min(cockpitHalf(u), hullHalfAt(u, sole) - 0.05);
  const out = [strip(us.map(u => [V(-soleHalf(u), sole, zAt(u)), V(soleHalf(u), sole, zAt(u))]), true)]; // sole
  for (const s of [1, -1]) out.push(strip(us.map(u => [V(s * soleHalf(u), sole, zAt(u)), V(s * cockpitHalf(u), deckY(u, cockpitHalf(u)), zAt(u))]), s > 0));
  const w1 = cockpitHalf(u1), ws = soleHalf(u1), ya = deckY(u1, 0);
  out.push(quad(V(ws, sole, zAt(u1)), V(-ws, sole, zAt(u1)), V(-w1, ya, zAt(u1)), V(w1, ya, zAt(u1)))); // aft wall
  return out;
}

/** Cockpit seats along each side, following the taper. */
export function cockpitSeats(): THREE.BufferGeometry[] {
  const { u0, u1 } = COCKPIT, h = 0.42, d = 0.3, N = 12, out: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) { const u = u0 + 0.01 + (u1 - u0 - 0.03) * i / N, w = cockpitHalf(u) - 0.005; pos.push(s * w, h, zAt(u), s * (w - d), h, zAt(u)); }
    for (let i = 0; i < N; i++) { const a = i * 2; if (s > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); out.push(g);
  }
  return out;
}

/** The sheer as a line of points (one side), for the toerail and the coaming. */
export function sheerLine(side: number, inset = 0.01, n = 60): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const u = i / n, b = Math.max(0, halfBeam(u) - inset); pts.push(new THREE.Vector3(side * b, sheer(u), zAt(u))); }
  return pts;
}

/** A strip standing up from a line of points (toerail, coaming), height h, thickness t. */
export function rail(pts: THREE.Vector3[], hh: number | ((i: number) => number), t: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (const [i, p] of pts.entries()) { const h = typeof hh === 'number' ? hh : hh(i); pos.push(p.x - t / 2 * Math.sign(p.x || 1), p.y, p.z, p.x - t / 2 * Math.sign(p.x || 1), p.y + h, p.z, p.x + t / 2 * Math.sign(p.x || 1), p.y + h, p.z, p.x + t / 2 * Math.sign(p.x || 1), p.y, p.z); }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 4, b = a + 4;
    for (let k = 0; k < 3; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/**
 * Rudder and tiller, in a frame whose y axis is the hinge line (the raked sternpost/transom), origin at the
 * heel, z aft. Put the group at HEEL rotated by RUDDER_RAKE about x; turn it about its y axis to steer.
 */
export const RUDDER_RAKE = Math.atan2(TRANSOM_TOP.z - HEEL.z, TRANSOM_TOP.y - HEEL.y);
export function rudderGeometry(): { blade: THREE.BufferGeometry; tiller: THREE.BufferGeometry } {
  // the class's rudder (CR 5.20): breadth square off the fore edge (the hinge), at distances up the fore edge from the
  // blade's lower edge, ±20 mm; 1528 mm up is at the waterline, and the head runs on, 160 mm wide, to 2700 mm
  const OFF: [number, number][] = [[0, 0.105], [0.289, 0.240], [0.640, 0.385], [0.991, 0.470], [1.220, 0.490], [1.342, 0.480], [1.528, 0.415], [1.693, 0.270], [2.006, 0.160], [2.700, 0.160]];
  const toWL = -HEEL.y / Math.cos(RUDDER_RAKE), s0 = toWL - 1.528; // the blade's lower edge, up the hinge from the heel
  const sh = new THREE.Shape();
  sh.moveTo(0, s0); sh.lineTo(OFF[0][1], s0);
  sh.splineThru(OFF.slice(1, 8).map(([a, w]) => new THREE.Vector2(w, s0 + a)));
  sh.lineTo(OFF[8][1], s0 + OFF[8][0]); sh.lineTo(OFF[9][1], s0 + OFF[9][0]); sh.lineTo(0, s0 + OFF[9][0]); sh.closePath();
  // at most 50 mm thick (CR 5.30)
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 2, curveSegments: 10 });
  // shape (x, y) → (z, y); extrusion → x, centred
  blade.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -0.018, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  blade.computeVertexNormals();
  // tiller (CR 5.50, above the deck): from the rudder head, forward over the after deck and a little up into the
  // cockpit, about 12° above level in the boat's frame (worked back into the rudder's raked frame)
  const up = 12 * Math.PI / 180, r = RUDDER_RAKE, wy = Math.sin(up), wz = -Math.cos(up);
  const dir = new THREE.Vector3(0, wy * Math.cos(r) + wz * Math.sin(r), -wy * Math.sin(r) + wz * Math.cos(r)).normalize();
  const head = new THREE.Vector3(0, s0 + 2.62, 0.06), tl = 1.3, tiller = new THREE.CylinderGeometry(0.018, 0.028, tl, 8);
  tiller.translate(0, tl / 2, 0); tiller.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); tiller.translate(head.x, head.y, head.z);
  return { blade, tiller };
}

/** A point on the starboard topsides with its outward normal (for lettering on the hull). */
export function hullFrame(u: number, p: number): { pos: THREE.Vector3; normal: THREE.Vector3 } {
  const a = hullPoint(u, p), du = hullPoint(u + 0.005, p).sub(hullPoint(u - 0.005, p)), dp = hullPoint(u, p + 0.005).sub(hullPoint(u, Math.max(0, p - 0.005)));
  return { pos: a, normal: new THREE.Vector3().crossVectors(du, dp).normalize().multiplyScalar(-1) };
}

/** A point on the planked surface (with the lap of the plank it's on), for things that sit on the planking. */
export function lappedPoint(u: number, p: number): THREE.Vector3 {
  const pt = hullPoint(u, p);
  if (p >= 0.8) return pt;
  const k = Math.min(STRAKES - 1, Math.floor(p / 0.8 * STRAKES)), p0 = strakeP(k), p1 = strakeP(k + 1);
  const f = u / Math.max(0.01, uMax(p)), lap = strakeLap(k, (p - p0) / (p1 - p0)) * Math.min(1, f / 0.04, (1 - f) / 0.03);
  if (lap > 0) lapOut(pt, u, p, lap);
  return pt;
}
/** p (girth position) at station u for a height y on the topsides (between the sheer and the turn of the bilge). */
function pAtY(u: number, y: number): number {
  let lo = 0, hi = 0.6;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sectionPoint(u, m).y > y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/**
 * A patch of the starboard topsides that follows the planking, laps and all, for paint on it (her name): centred at
 * station uc, from height y0 to y1, `width` m long. UVs run 0..1 aft→forward-reading along it and bottom→top.
 */
export function topsidesPatch(uc: number, y0: number, y1: number, width: number, nu = 48, nv = 36): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = uc + (i / nu - 0.5) * width / L, y = y0 + (y1 - y0) * j / nv, pt = lappedPoint(u, pAtY(u, y));
    const fr = hullFrame(u, pAtY(u, y)); pt.addScaledVector(fr.normal.x < 0 ? fr.normal.clone().negate() : fr.normal, 0.003); // a hair off the paint
    pos.push(pt.x, pt.y, pt.z); uv.push(1 - i / nu, j / nv); // bow is −z: the text reads forward to aft on the starboard side
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** A lid over the cockpit at deck level (drawn into the depth buffer only): the sea is never drawn inside the hull. */
export function cockpitLid(): THREE.BufferGeometry {
  const { u0, u1 } = COCKPIT, N = 16, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) { const u = u0 + (u1 - u0) * i / N, w = cockpitHalf(u) + 0.02, y = deckY(u, w) + 0.01; pos.push(-w, y, zAt(u), w, y, zAt(u)); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

/** Station u for a z position (m, aft positive). */
export const uAtZ = (z: number) => (z + L / 2) / L;

/** The hull's half-breadth (m) at station u and height y on the topsides: what the inside of her has room for. */
export const hullHalfAt = (u: number, y: number) => sectionPoint(u, pAtY(u, y)).x;

/**
 * A patch on the starboard cabin side and the coaming that carries its line aft (they're one surface on the boats), for
 * paint and fittings on it: her name, the cabin window. Centred at station uc, `width` m long, from h0 to h1 above the
 * deck at the side. UVs run 0..1 aft→forward (so it reads left to right seen from starboard) and bottom→top.
 */
export function sidePatch(uc: number, width: number, h0: number, h1: number, nu = 40, nv = 8): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = uc + (i / nu - 0.5) * width / L, h = h0 + (h1 - h0) * j / nv, w = sideLine(u);
    const x = w - (u < CABIN.u1 ? CABIN_LEAN * h / CABIN.h : 0) + 0.012; // a hair off the surface
    pos.push(x, deckY(u, w) + h, zAt(u)); uv.push(1 - i / nu, j / nv);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
