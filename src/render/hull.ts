import './three-setup';
import * as THREE from 'three';
import { L, fairCurve, halfBeam, uAtZ, zAt } from '../boat/hullPlan';

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
export { L, fairCurve, halfBeam, uAtZ } from '../boat/hullPlan'; // (the deck's plan, shared with the rules: boat/hullPlan.ts)

/**
 * Sheer height above the waterline: high bow, lowest about 60% aft (0.568 m, the class's lowest freeboard), and only a
 * little rise to the transom: the class's construction plan (1:10, folkboat.com, rev. 2024) dimensions the deck line
 * 598 mm above the waterline at the transom, then 588, 578 and 573 going forward, which this curve meets within a few mm.
 */
export function sheer(u: number): number {
  return u < 0.62 ? 0.568 + 0.40 * Math.pow((0.62 - u) / 0.62, 1.8) : 0.568 + 0.030 * ((u - 0.62) / 0.38) ** 2;
}
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
 * of the transom, from the plan) she's 6.0 m on the waterline (class Appendix: LWL 6.00 m). The stem and the
 * forefoot are one long, gentle curve (below).
 */
const BOW = 0.144; // where the keel's thickness begins, just aft of the stem's foot (fraction of L)
/**
 * The bow's profile, from the stemhead to the keel's bottom, as one long, flat, gentle S with no straight stretch and no
 * corner anywhere (the owner, from Josephine's haul-out photos and the lines plans): steep at the stemhead and easing
 * all the way down through the waterline, steepening again a little into the ballast keel's leading edge, then easing
 * out into the keel's bottom about 4.2 m aft of the stemhead, which runs on nearly level to the heel at 1.2 m. It's drawn
 * by its slope (m of height per unit of u), eased between its values by cosines so the curvature changes smoothly too,
 * and summed up from the stemhead. It meets the water about 0.97 m aft of the stemhead (the class's 6.00 m waterline).
 * The canoe body, the hull's bottom above the keel, leaves it at U_SPLIT and eases out to its depth amidships, 0.62 m
 * (the plan's main section at St. 8).
 */
const U_HEEL = (HEEL.z + L / 2) / L;
const ease2 = (a: number, b: number, t: number) => a + (b - a) * (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2;
const SLOPE_KNOTS: [number, number][] = [[0, -8.5], [0.3, -2.2], [0.43, -3.0], [0.55, -0.3]];
const profileSlope = (u: number) => {
  let i = 0; while (i < SLOPE_KNOTS.length - 2 && u > SLOPE_KNOTS[i + 1][0]) i++;
  const [u0, m0] = SLOPE_KNOTS[i], [u1, m1] = SLOPE_KNOTS[i + 1]; return ease2(m0, m1, (u - u0) / (u1 - u0));
};
const U_SPLIT = 0.2, U_CANOE = 0.33, DU = 0.001, PROFILE: number[] = [0.96], CANOE: number[] = [0.96];
for (let k = 1; k * DU <= 0.62 + 1e-9; k++) {
  const um = (k - 0.5) * DU;
  PROFILE.push(PROFILE[k - 1] + profileSlope(Math.min(um, 0.55)) * DU);
  CANOE.push(CANOE[k - 1] + (um < U_SPLIT ? profileSlope(um) : ease2(profileSlope(U_SPLIT), 0, (um - U_SPLIT) / (U_CANOE - U_SPLIT))) * DU);
}
const table = (t: number[], u: number) => { const f = Math.min(t.length - 1.001, Math.max(0, u / DU)), i = Math.floor(f); return t[i] + (t[i + 1] - t[i]) * (f - i); };
const Y_KEEL = table(PROFILE, 0.55);
export function canoe(u: number): number {
  if (u < 0.62) return Math.min(table(CANOE, u), 0.96);
  return table(CANOE, 0.62) + (0.17 - table(CANOE, 0.62)) * ease((u - 0.62) / 0.38);
}
/** Keel bottom: the bow's profile, then the ballast keel's bottom, deepest at the heel (1.2 m with the keel band). */
export function keel(u: number): number {
  const y = u < 0.55 ? table(PROFILE, u) : Y_KEEL + (-1.2 - Y_KEEL) * Math.min(1, (u - 0.55) / (U_HEEL - 0.55));
  return Math.max(-1.2, Math.min(y, canoe(u)));
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
 * forward (the topsides still rounding out at the bow, as on Josephine: the owner), and aft the same wineglass narrowing to the sternpost, which gives the flat transom its shape: wide and
 * nearly upright-sided at the deck, curving in to meet the sternpost near the waterline (the owner's photos).
 */
function sectionShape(u: number): { al: number; be: number } {
  // toward the transom the hollow gives way to a full, round run (Josephine hauled out: the owner's photo), so the
  // transom's foot is a broad, nearly flat U at about the waterline, not a point
  const mid = ease((u - 0.12) / 0.3), aft = ease((u - 0.62) / 0.38), tr = ease((u - 0.78) / 0.18);
  return { al: 1.7 + 2.3 * mid + 1.8 * aft - 1.2 * tr, be: 1.0 + 0.6 * mid + 0.9 * aft - 1.85 * tr };
}

/** 16 planks a side (CR 2.207.5: no fewer than 16 at station 8; 2.207.6: none but the keel plank over 130 mm wide), each lapping 13 mm over the one below (about the plank's thickness, CR 2.207.2) */
const NU_NEAR = 72, NU_MID = 54, NU_FAR = 36, NF_NEAR = 5, STRAKES = 16, LAP = 0.013;
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
/** (the station's own figures, kept for the last station asked: the searches along a section ask the same u again and
 * again, the crew's footing every frame among them, ROADMAP 8x) */
let secU = NaN, secB = 0, secS = 0, secKc = 0, secWk = 0, secKb = 0, secAl = 0, secBe = 0;
function sectionPoint(u: number, p: number): { x: number; y: number } {
  if (u !== secU) { secU = u; secB = halfBeam(u); secS = sheer(u); secKc = canoe(u); secWk = keelHalf(u); secKb = Math.min(keel(u), secKc); const sh = sectionShape(u); secAl = sh.al; secBe = sh.be; }
  const b = secB, s = secS, kc = secKc, wk = secWk, kb = secKb;
  if (p <= 0.8) {
    // heights spread down the section (the strakes a little closer near the keel), the breadth from the wineglass curve
    const a = (p / 0.8) * Math.PI / 2, g = Math.pow(Math.sin(a), 1.15), ys = s - (s - kc) * g;
    const al = secAl, be = secBe, w = Math.min(wk, b), F = Math.pow(1 - Math.pow(g, al), be);
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

/**
 * The planks' widths. A clinker plank keeps nearly its width the whole length of the hull, narrowing only a little toward
 * the ends (to about 80%), so where the hull's section is shorter than the planks' sum, toward the bow and the stern, the
 * lower planks run out one after another on the stem, the forefoot and the keel, rather than all narrowing to a point at
 * the stemhead (the owner's photos: Josephine, and Inga hauled out). So the plank edges are laid off down each section
 * by girth (distance round the section from the sheer): edge k at k plank widths, up to the section's whole girth; the
 * garboard, the lowest, takes up what's left down to the keel.
 */
const GIRTH_N = 48, girthCache = new Map<number, Float64Array>();
/** The section's girth from the sheer (p = 0) to each of GIRTH_N + 1 points down to the keel's side (p = 0.8). */
function girthTable(u: number): Float64Array {
  const key = Math.round(u * 1e6), c = girthCache.get(key); if (c) return c;
  const t = new Float64Array(GIRTH_N + 1); let prev = sectionPoint(u, 0);
  for (let i = 1; i <= GIRTH_N; i++) { const q = sectionPoint(u, 0.8 * i / GIRTH_N); t[i] = t[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
  girthCache.set(key, t); return t;
}
/** p at girth g down the section at u. */
function pAtGirth(u: number, g: number): number {
  const t = girthTable(u), G = t[GIRTH_N]; if (g <= 0) return 0; if (g >= G - 0.002) return 0.8; // (within 2 mm of the keel's side: on it, so a plank that's all but run out ends exactly on the keel)
  let i = 0; while (i < GIRTH_N - 1 && t[i + 1] < g) i++;
  return 0.8 * (i + (g - t[i]) / Math.max(1e-9, t[i + 1] - t[i])) / GIRTH_N;
}
/** The girth down to p at u. */
function girthAtP(u: number, p: number): number {
  const t = girthTable(u), f = Math.min(GIRTH_N, Math.max(0, p / 0.8 * GIRTH_N)), i = Math.min(GIRTH_N - 1, Math.floor(f));
  return t[i] + (t[i + 1] - t[i]) * (f - i);
}
/** A plank's width at u: the widest section's girth shared among the planks, narrowing a little toward the ends. */
let plankRef = 0;
const plankW = (u: number) => { if (!plankRef) plankRef = girthTable(0.52)[GIRTH_N] / STRAKES; return plankRef * (1 - 0.2 * ((u - 0.52) / 0.52) ** 2); };
/** Plank edge k's girth at u (0 the sheer … STRAKES the keel's side). */
function edgeGirth(u: number, k: number): number {
  const G = girthTable(u)[GIRTH_N];
  return k >= STRAKES ? G : Math.min(G, k * plankW(u));
}
/** Plank k's width at u (0 where it has run out on the stem or keel). */
const plankWidthAt = (u: number, k: number) => edgeGirth(u, k + 1) - edgeGirth(u, k);

export interface HullPaint { topsides: THREE.Color; boot: THREE.Color; bottom: THREE.Color }

/** The hull shell (both sides), clinker planked, painted: bottom paint below the waterline, a boot stripe, topsides. */
/**
 * The paint lines, struck level the way a yard marks them, with the usual slight rise toward the bow and the stern:
 * the top of the bottom paint (just above the waterline), and the top of the boot stripe. y as a function of z.
 */
export const PAINT_LINES = { wl: 0.045, wlRise: 0.035, stripe: 0.065, stripeRise: 0.02 };
export const paintLines = (z: number) => { const e = (2 * z / L) ** 2; return { wl: PAINT_LINES.wl + PAINT_LINES.wlRise * e, top: PAINT_LINES.wl + PAINT_LINES.stripe + (PAINT_LINES.wlRise + PAINT_LINES.stripeRise) * e }; };

/** The shell's geometry; its vertex colours are only the light and shade of the laps (the paint is per pixel: boatMesh.ts). */
function hullGeometryBuild(_paint?: HullPaint, level = 0): THREE.BufferGeometry {
  // further off (boatMesh's levels of detail), the same planking more coarsely: each plank's face one band and its land
  // left out (level 1, from where a plank is a few pixels wide), and fewer stations too (2, from where a lap's 13 mm is
  // a fraction of a pixel). The hull's outline and the planks' shading are all that show from there.
  const far = level > 0, NU = [NU_NEAR, NU_MID, NU_FAR][level], J = far ? 1 : 3, NF = far ? 2 : NF_NEAR;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const white = new THREE.Color(1, 1, 1), colorAt = (_y: number) => white;
  // rows: the planked canoe body in STRAKES bands (each plank's lower edge stands out by LAP), then the keel. Each entry
  // is a line along the hull: a place across plank `k` (t 0 its top edge … 1 its lower), or a fixed p on the keel.
  type Entry = { k?: number; t?: number; dg?: number; p?: number; pl?: number; lap: number; shade?: number; land?: boolean };
  type Row = Entry[];
  const strips: Row[] = [];
  for (let k = 0; k < STRAKES; k++) {
    const row: Row = [];
    if (k > 0 && !far) row.push({ k, t: 0, dg: -0.025, pl: k, lap: 0, shade: 1, land: true }); // the land: this plank's top edge, hidden behind the plank above
    for (let j = 0; j <= J; j++) row.push({ k, t: j / J, pl: k, lap: strakeLap(k, j / J), shade: j === 0 && k > 0 ? 0.82 : 1 }); // in the shadow of the lap above
    strips.push(row);
    if (k < STRAKES - 1) strips.push([{ k: k + 1, t: 0, pl: k, lap: LAP }, { k: k + 1, t: 0, pl: k, lap: 0 }]); // the lap's edge, facing down
  }
  // the keel, from the garboard's lower edge (the same vertices: the garboard lands in the keel's rabbet, no gap)
  { const row: Row = []; for (let j = 0; j <= NF; j++) row.push({ p: j === 0 ? 0.8 : 0.8 + 0.2 * j / NF, lap: 0 }); strips.push(row); }
  /** An entry's p at u. */
  const pOf = (r: Entry, u: number) => {
    if (r.p != null) return r.p;
    const g = edgeGirth(u, r.k!) + (r.t ? (edgeGirth(u, r.k! + 1) - edgeGirth(u, r.k!)) * r.t : 0) + (r.dg ?? 0);
    return pAtGirth(u, Math.max(0, g));
  };
  /** Where an entry's line meets the raked transom / sternpost plane. */
  const endCache = new Map<string, number>();
  const uEnd = (r: Entry) => {
    if (r.p != null) return uMax(r.p);
    const key = `${r.k},${r.t},${r.dg ?? 0}`, c = endCache.get(key); if (c != null) return c;
    let lo = 0.6, hi = 1;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, q = sectionPoint(m, pOf(r, m)); if (zAt(m) < aftLineZ(q.y)) lo = m; else hi = m; }
    endCache.set(key, lo); return lo;
  };
  for (const side of [1, -1]) {
    for (const row of strips) {
      const base = pos.length / 3;
      for (let i = 0; i <= NU; i++) for (const r of row) {
        const f = i / NU, u = f * uEnd(r), p = pOf(r, u), pt = hullPoint(u, p);
        // push the lap outward across the section (along the section's outward normal); it runs out flush where its
        // plank runs out on the stem or the keel, and at the transom
        const lap = r.lap * (r.pl != null ? Math.min(1, plankWidthAt(u, r.pl) / (0.5 * plankW(u))) : 1) * Math.min(1, (1 - f) / 0.03);
        if (lap > 0) lapOut(pt, u, p, lap);
        pos.push(pt.x * side, pt.y, pt.z);
        const c = colorAt(pt.y), k = row.length === 2 && row[0].k === row[1].k && row[0].t === row[1].t ? 0.55 : r.shade ?? 1; col.push(c.r * k, c.g * k, c.b * k);
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
  { const ends = strips.flatMap(row => row.filter(r => !r.land)).map(r => { const u = uEnd(r), p = pOf(r, u); return { p, pt: hullPoint(u, p) }; }).sort((a, b) => a.p - b.p);
    const ps = ends.map(e => e.pt), outline: THREE.Vector3[] = [...ps];
    for (let j = ps.length - 2; j >= 0; j--) { const pt = ps[j]; outline.push(new THREE.Vector3(-pt.x, pt.y, pt.z)); }
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
export const CABIN = { u0: zU(-0.79) /* (the front's foot a strip of deck aft of the mast foot's horseshoe, the owner; and CR 3.11's least deck-line length, 1850 mm, to u1, so no further aft) */, u1: zU(1.06), w: 0.79, h: 0.20, crown: 0.17 };
export const COCKPIT = { u0: zU(1.06), u1: zU(L / 2 - 2 * 0.5), sole: -0.08 };
/**
 * The cockpit's furniture, from the construction plan's profile and cockpit section (1:10; the arrangement is free,
 * CR 3.21, so these are the plan's): the sole flat at 80 mm under the waterline ("80"), 700 mm wide ("350/350"); side
 * benches and a shelf across the after end, their tops 300 mm over the sole ("300"); the benches from the main bulkhead
 * aft to St. 4¾, the after shelf from St. 3 forward to about St. 4.05, and between them a footwell, where the thwart
 * stands at St. 4½. Stations 500 mm apart, St. 3 at the cockpit's after end. z: m aft
 * of amidships. The thwart (the traveller's beam; its size isn't drawn) is a deep varnished beam across the cockpit,
 * its top a little under the coaming caps, its underside curved: about 6 in deep at the middle, tapering to about 4 in
 * at its ends (the owner, from Josephine).
 */
const stZ = (st: number) => L / 2 - 2 * 0.5 - (st - 3) * 0.5;
/**
 * The hollow under the after deck (Josephine, the owner): open to the cockpit at its after end and open under the
 * plank, it runs aft to z1, its floor the cockpit sole's level carried aft (or the hull's inside, where that rises
 * higher), its sides the hull's own inside; storage, and room for the footrest to slide back
 * into. The footrest: one teak plank right across the cockpit's after end, about 2 ft (`len`) fore and aft, its top
 * level with the seats. (On Josephine it rides on two slim metal rails screwed flat to the hull's inside; they aren't
 * drawn, for simplicity: the owner.) Slid out, its forward edge is halfway between the thwart's after edge
 * and the cockpit's after end (`out` m forward of it), a footrest for the helm sitting on the after deck; slid back,
 * flush with the cockpit's after end under the deck, so they can stand to steer (the owner): out while the helm sits, back when they stand. It's cut to the hull's
 * shape where it slides back to (footrestEdge), so slid out, where she's wider, it stands a little clear of the hull.
 * (The hollow's size is an estimate from the photo.)
 */
export const HOLLOW = { z1: L / 2 - 0.41 };
/** `y`: the plank's underside (its top, 25 mm up, level with the seats, COCKPIT_FIT.seat). */
export const FOOTREST = { y: COCKPIT.sole + 0.30 - 0.025, len: 0.61, out: 0.35, rail: 0.022 };
/** The hull's lining's half-breadth at the footrest's rails, at z (the lining stands 30 mm in from hullInnerHalf). */
export const footrestWall = (z: number) => hullInnerHalf(uAtZ(z), FOOTREST.y) - 0.03;
/** The plank's half-width at z, slid back: cut to the hull there, as far out as the rails' middle. */
export const footrestEdge = (z: number) => footrestWall(z) - FOOTREST.rail / 2 - 0.004;
export const COCKPIT_FIT = {
  seat: -0.08 + 0.30, soleHalf: 0.35,
  benchAft: stZ(4.75), shelfFwd: stZ(4.05),
  thwart: { z: stZ(4.5), half: 0.045, depth: 0.15, depthEnd: 0.10, belowCap: 0.06 },
};
/** The coaming's height above the deck along the cockpit (z): CR 3.22's least heights, 200 mm aft of the cabin, 140 at St. 4½, 80 at St. 3, a little over. */
export const COAMING_H = fairCurve([[-L / 2 + COCKPIT.u0 * L, 0.22], [L / 2 - 3.5 * 0.5, 0.15], [L / 2 - 2 * 0.5, 0.09]]);
/** The thwart's top (m over the waterline). */
/**
 * Where the jib winches stand fore and aft (m aft of amidships): about a third of the way aft along the cockpit, 0.58 m
 * aft of the cabin's after end and 0.39 m forward of the thwart's front face, so a crew sits on the rail between it and
 * the cabin, and another, with a little less room, between it and the thwart (the owner, and Josephine's profile photo).
 */
export const JIB_WINCH_Z = 1.64;
export const thwartTop = () => { const u = zU(COCKPIT_FIT.thwart.z), w = cockpitHalf(u); return deckY(u, w) + COAMING_H(COCKPIT_FIT.thwart.z) - COCKPIT_FIT.thwart.belowCap; };
/** How far out a bench or the after shelf reaches under the side deck at station u (m from the centreline). */
export const benchOut = (u: number) => Math.min(hullInnerHalf(u, COCKPIT_FIT.seat) - 0.03, cockpitHalf(u) + 0.2);
/**
 * The companionway in the after end of the cabin, drawn open (as she's sailed): the sliding hatch 550 mm wide and
 * 460 mm long, from the after bulkhead forward (the construction plan's deck plan, "sliding hatch"), slid forward over
 * the cabin top; the doors (carried while racing, CR 3.18) stowed below. The doorway runs from the top down nearly to
 * the cockpit sole, as on Josephine (the owner's photo): its sill isn't on the plan, about 150 mm over the sole is
 * estimated. Inside, the companionway's well and its steps down to the cabin floor, 1230 mm under the cabin top
 * (CR 3.14, at least, at St. 8); `well` how far forward of the bulkhead the well is drawn (m).
 */
export const COMPANIONWAY = { hw: 0.275, len: 0.46, sill: COCKPIT.sole + 0.03, /* (a slight sill just above the cockpit floor: Josephine, the owner) */ headroom: 1.23, well: 0.5 };
/** The coaming's thickness (m): the cockpit opening is its inside face. */
export const COAMING_T = 0.025;
/** Cockpit half-width: inside the coaming, which follows the side line, narrowing aft with the hull. */
export const cockpitHalf = (u: number) => sideLine(u) - COAMING_T;
const CAMBER = 0.05;
export const deckY = (u: number, x: number) => sheer(u) + CAMBER * Math.max(0, 1 - (x / Math.max(0.05, halfBeam(u))) ** 2) * halfBeam(u) / 1.1;

/** The deck: cambered, following the sheer, open where the cabin and cockpit are. */
function deckGeometryBuild(): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const us: number[] = [];
  for (let i = 0; i <= NU_NEAR; i++) us.push(i / NU_NEAR);
  for (const e of [CABIN.u0, CABIN.u1, COCKPIT.u1]) us.push(e - 1e-4, e + 1e-4);
  us.sort((a, b) => a - b);
  const inner = (u: number) => (u > CABIN.u0 && u < CABIN.u1 ? cabinHalf(u) : u > COCKPIT.u0 && u < COCKPIT.u1 ? cockpitHalf(u) : 0);
  const NX = 8;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (const u of us) {
      // out to the sheer and a hair over it (under the toerail), so no slit opens between the deck and the planking
      const b = Math.max(0.001, halfBeam(u) + 0.004), xi = Math.min(inner(u), b - 0.05);
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
export const CABIN_LEAN = 0.015;
/**
 * The long cabin light each side, as on Josephine (the owner's answers and photos; portholes' shape is free, CR 3.19):
 * about 1 m of glass from about half a metre aft of the cabin's front edge to just forward of the name (z0..z1), its
 * bottom edge straight, h0 above the deck at the cabin side, and its top tapering down toward the bow, the glass hAft
 * tall at its after end and hFwd at its forward end; both ends rounded; in a brushed aluminium frame about 3/4 in wide
 * (frame), riveted all round. The glass's heights are read off the owner's side photo (an estimate, within a cm).
 * Its opening is cut through the cabin side between hole0 and hole1 (the frame covers its rounded ends), and the
 * cabin's inside is seen through it. h1 is the glass's top at its tallest, the after end.
 */
const WIN = { z0: -0.35, z1: 0.65, h0: 0.085, hAft: 0.095, hFwd: 0.06, frame: 0.019 };
export const WINDOW = { ...WIN, uc: zU((WIN.z0 + WIN.z1) / 2), len: WIN.z1 - WIN.z0, h1: WIN.h0 + WIN.hAft, hole0: zU(WIN.z0 + 0.025), hole1: zU(WIN.z1 - 0.03) };
/** The window glass's top edge (m above the deck at the cabin side) at station u: tapering down toward the bow. */
export const winTop = (u: number) => WIN.h0 + WIN.hFwd + (WIN.hAft - WIN.hFwd) * Math.min(1, Math.max(0, (u - zU(WIN.z0)) / (zU(WIN.z1) - zU(WIN.z0))));

/** Height of the cabin sides' top edge at station u. */
/**
 * The cabin top's edge rises toward its after end (Josephine's profile, the owner's photo: the roof slants up aft while the
 * sheer falls), so the cabin side stands CABIN.h above the deck at its front and CABIN_RISE more at the main bulkhead
 * (an estimate from the photo, within a few centimetres).
 */
export const CABIN_RISE = 0.18;
export const cabinTopY = (u: number) => deckY(u, cabinHalf(u)) + cabinSideH(u);
/** The cabin side's height above the deck at station u. */
export const cabinSideH = (u: number) => { const h = rawSideH(u), c = AFT_ROUND.coaming; return h <= c ? h : c + (h - c) * aftRound(u, 1); };
/** The cabin side's height before its after corner is rounded off (below). */
const rawSideH = (u: number) => (CABIN.h + CABIN_RISE * Math.min(1, Math.max(0, (u - CABIN.u0) / (CABIN.u1 - CABIN.u0)))) * cabinNose(u);
/**
 * The cabin's after outboard corners are rounded off, down to the coaming (Josephine, the owner's photo from the
 * starboard quarter): seen from the cockpit, the after end's outline sweeps down from the roof in a big curve to the
 * coaming's top; seen from the side, the cabin side's top edge bends down into the coaming the same way as it reaches the
 * after end. A rounded corner: across it reaches about `across` m in from the side; fore and aft, about `along` m forward
 * of the after end (both read off the photo, estimates); the coaming itself is unchanged. aftRound(u, b) is how much of
 * the height over the coaming is left (1 untouched … 0 down to the coaming), b how far across the rounding (0 at its
 * inner edge … 1 at the side).
 */
const AFT_ROUND = { across: 0.2, along: 0.3, coaming: 0.22 };
function aftRound(u: number, b: number): number {
  const a = Math.min(1, Math.max(0, 1 - (CABIN.u1 - u) * L / AFT_ROUND.along)), bb = Math.min(1, Math.max(0, b));
  return Math.sqrt(Math.max(0, 1 - (a * bb) ** 2));
}
/**
 * The cabin's front is a raked face, not an upright one (Josephine: the owner's side photo, as Rigging measured it,
 * about 700 px/m; CR 3.11 agrees, the roof at least 1785 mm long against at least 1850 mm at the deck line): from the
 * deck a strip aft of the mast foot's horseshoe (MAST_RING, the owner) it rises to the cabin side's height over about
 * CABIN_NOSE m, about 45° to the deck, steepest at its foot and easing round onto the roof, which it reaches where the
 * side photo shows. The roof's crown comes down with it in the same proportion: the
 * side photo can't show the centreline's height at the front, so that much is an estimate.
 */
export const CABIN_NOSE = 0.208;
function cabinNose(u: number): number { const d = Math.max(0, (u - CABIN.u0) * L); return d >= CABIN_NOSE ? 1 : Math.sin(Math.PI / 2 * d / CABIN_NOSE); }
/** The cabin top's surface at station u, x across: arched from the sides' top edges up to the centreline. */
/**
 * The cabin top is a slice of a cone lying on its side, its point toward the bow (the owner, of Josephine): each section
 * across it is a circular arc whose radius goes with the roof's width (CONE_K the radius over the half-width), so it
 * narrows with the trunk forward. How high the arc stands over the sides' top edges grows from nothing at the cabin's
 * front to about 13 cm halfway aft and stays so: the roof's outline, seen from the side, falls away forward in one long
 * slope (Josephine's profile photo, the roof's outline measured over the deck at about 147 px/m: 19, 27, 34, 42, 46 and
 * 51 cm at 0.1, 0.38, 0.65, 1.0, 1.3 and 1.8 m aft of its front; within a few cm, the photo being a little oblique).
 */
const CONE_K = 1.9;
const CROWN = fairCurve([[-0.79, 0], [-0.6, 0.012], [-0.47, 0.035], [-0.2, 0.08], [0.14, 0.12], [0.6, 0.13], [1.1, 0.13]]);
export const cabinTopAt = (u: number, x: number) => {
  const w = Math.max(0.05, cabinHalf(u) - CABIN_LEAN), r = CONE_K * w, xc = Math.min(Math.abs(x), w), full = r - Math.sqrt(r * r - w * w);
  const arch = (Math.sqrt(r * r - xc * xc) - Math.sqrt(r * r - w * w)) / full; // (0 at the sides' top edges … 1 on the centreline)
  const deck = deckY(u, cabinHalf(u)), raw = deck + rawSideH(u) + arch * Math.max(0, CROWN(zAt(u)));
  // (the after corners rounded off down to the coaming: no higher than the rounding allows there)
  const c = deck + AFT_ROUND.coaming, cap = c + (deck + rawSideH(u) + arch * Math.max(0, CROWN(zAt(u))) - c) * aftRound(u, (xc - (w - AFT_ROUND.across)) / AFT_ROUND.across);
  return raw <= c ? raw : Math.min(raw, cap);
};

/** The cabin trunk: sides from below the deck up to an arched top, and the after end (the main bulkhead's face). */
function cabinGeometryBuild(): { sides: THREE.BufferGeometry; top: THREE.BufferGeometry; aft: THREE.BufferGeometry; topY: (u: number) => number } {
  const N = 40, topY = cabinTopY;
  const outline: { u: number; x: number }[] = [];
  // (with stations at the windows' openings' ends, so the openings' edges are grid lines)
  const us = [...Array.from({ length: N + 1 }, (_, i) => CABIN.u0 + (CABIN.u1 - CABIN.u0) * i / N), WINDOW.hole0, WINDOW.hole1].sort((a, b) => a - b);
  for (const u of us) outline.push({ u, x: cabinHalf(u) });
  const sides: number[] = [], sIdx: number[] = [];
  const ring = [...outline.map(o => ({ u: o.u, x: o.x })), ...outline.slice().reverse().map(o => ({ u: o.u, x: -o.x }))];
  ring.push(ring[0]); // close the front
  // four rows up each side: from below the deck, the window's sill and head, the top edge; the window's band is open
  const R = 4;
  for (const o of ring) {
    const d = deckY(o.u, Math.abs(o.x)), t = topY(o.u), hs = [0.45, Math.min(d + WINDOW.h0, t), Math.min(d + winTop(o.u), t), t]; // (where the nose is lower than the window's band, the rows close up under the top)
    for (const y of hs) { const f = t - d > 1e-4 ? Math.max(0, (y - d) / (t - d)) : 1; sides.push(o.x - Math.sign(o.x) * CABIN_LEAN * f, y, zAt(o.u)); }
  }
  // (all round but the after end: that's the bulkhead, with the companionway in it)
  const aftSeg = outline.length - 1;
  for (let i = 0; i < ring.length - 1; i++) {
    if (i === aftSeg) continue;
    const um = (ring[i].u + ring[i + 1].u) / 2, inWin = um > WINDOW.hole0 && um < WINDOW.hole1;
    for (let r = 0; r < R - 1; r++) {
      if (r === 1 && inWin) continue; // the window
      const a = i * R + r, b = a + 1, c = a + R, d = c + 1; sIdx.push(a, c, b, b, c, d);
    }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3)); sg.setIndex(sIdx); sg.computeVertexNormals();
  // the top, open over the companionway aft of where the sliding hatch's opening begins (its edges are grid lines)
  const top: number[] = [], tIdx: number[] = [], NX = 24, hw = COMPANIONWAY.hw, uSlot = CABIN.u1 - COMPANIONWAY.len / L;
  const rows = [...outline.map(o => o.u), uSlot].sort((a, b) => a - b), NC = NX + 2;
  for (const u of rows) {
    const w = cabinHalf(u) - CABIN_LEAN, h = Math.min(hw, w * 0.99);
    const xs = [...Array.from({ length: NX + 1 }, (_, j) => -w + 2 * w * j / NX), -h, h].sort((a, b) => a - b);
    for (const x of xs) top.push(x, cabinTopAt(u, x), zAt(u));
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < NC; j++) {
    const a = i * (NC + 1) + j, b = a + 1, c = a + NC + 1, d = c + 1;
    const xm = (top[3 * a] + top[3 * b]) / 2, um = (rows[i] + rows[i + 1]) / 2;
    if (um > uSlot && Math.abs(xm) < hw) continue; // the open companionway
    tIdx.push(a, b, c, b, d, c);
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); tg.setIndex(tIdx); tg.computeVertexNormals();
  // the after end: from the deck up the sides and over the arch of the top, facing aft into the cockpit
  const u1 = CABIN.u1, w1 = cabinHalf(u1), z1 = zAt(u1) + 0.002, rim: THREE.Vector2[] = [new THREE.Vector2(w1, COCKPIT.sole)];
  // over the arch, with the companionway's opening cut down from the top to its sill
  for (let j = 0; j <= 48; j++) {
    const x = (w1 - CABIN_LEAN) * (1 - 2 * j / 48), xn = (w1 - CABIN_LEAN) * (1 - 2 * (j + 1) / 48);
    if (Math.abs(x) >= hw) rim.push(new THREE.Vector2(x, cabinTopAt(u1, x)));
    if (x > hw && xn <= hw) rim.push(new THREE.Vector2(hw, cabinTopAt(u1, hw)), new THREE.Vector2(hw, COMPANIONWAY.sill), new THREE.Vector2(-hw, COMPANIONWAY.sill), new THREE.Vector2(-hw, cabinTopAt(u1, -hw)));
  }
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

/**
 * The cockpit, to the plan (COCKPIT_FIT): the sole; the side benches (their fronts, tops, ends, and the backs under the
 * side decks); in the footwell the hull's own inside up to the deck; the after shelf (its front and top) and above it the after
 * wall up to the deck. The benches are lazarettes, solid lockers with lids. Surfaces only: the sole, the lids and the
 * shelf's top laid teak (`teak`), the lockers' fronts and ends varnished panels (`panel`), the hull's inside and the
 * after wall the smooth moulded lining (`lining`).
 */
/** A function of a station u, worked out once per u (the cockpit's linings ask for the same station's points again and again). */
function memoU<T>(f: (u: number) => T): (u: number) => T { const m = new Map<number, T>(); return u => { let v = m.get(u); if (v === undefined) { v = f(u); m.set(u, v); } return v; }; }
function cockpitGeometryBuild(): { teak: THREE.BufferGeometry[]; lining: THREE.BufferGeometry[]; panel: THREE.BufferGeometry[] } {
  const { u0, u1, sole } = COCKPIT, { seat, soleHalf, benchAft, shelfFwd } = COCKPIT_FIT, V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const strip = (pts: [THREE.Vector3, THREE.Vector3][]) => {
    const pos: number[] = [], idx: number[] = [];
    for (const [a, b] of pts) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const span = (za: number, zb: number, n = 12) => Array.from({ length: n + 1 }, (_, i) => zU(za + (zb - za) * i / n));
  const sh = (u: number) => Math.min(soleHalf, hullInnerHalf(u, sole) - 0.03);
  const zA = zAt(u1), z0 = zAt(u0), out: THREE.BufferGeometry[] = [], lining: THREE.BufferGeometry[] = [], panel: THREE.BufferGeometry[] = [];
  // a flat panel across the boat at z, its outline (x, y) given round; and the hull's side at station u from the sole up
  // to the seat (or down), just inside it and never past where the bench reaches, so no panel pokes through the hull
  const face = (z: number, ring: number[][]) => {
    const pts = ring.map(([x, y]) => new THREE.Vector2(x, y)).filter((q, i, a) => i === 0 || q.distanceTo(a[i - 1]) > 1e-4), pos: number[] = [];
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) for (const q of [pts[a], pts[b], pts[c]]) pos.push(q.x, q.y, z);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  };
  const hullSide = (u: number, s: number, up: boolean) => {
    const out2: number[][] = [];
    for (let k = 0; k <= 6; k++) { const y = sole + (seat - sole) * (up ? k : 6 - k) / 6; out2.push([s * Math.max(sh(u), Math.min(benchOut(u), hullInnerHalf(u, y) - 0.03)), y]); }
    return out2;
  };
  out.push(strip(span(z0, zA, 16).map(u => [V(-sh(u), sole, zAt(u)), V(sh(u), sole, zAt(u))]))); // the sole
  for (const s of [1, -1]) {
    const bench = span(z0, benchAft), well = span(benchAft, zA, 8), WELL_K = 14; void shelfFwd; // (WELL_K: steps up the hull's curve, fine enough to follow it) // (no after shelf: the footwell runs to the cockpit's after end, where the sliding footrest comes out from under the after deck)
    // the bench is a lazarette, a solid locker: its front a varnished panel up to the lid, and the lid on top, 25 mm
    // thick, its edge standing a little proud of the front
    const lid = 0.025;
    panel.push(strip(bench.map(u => [V(s * sh(u), sole, zAt(u)), V(s * sh(u), seat - lid, zAt(u))]))); // the locker's front
    panel.push(strip(bench.map(u => [V(s * (sh(u) - 0.012), seat - lid, zAt(u)), V(s * (sh(u) - 0.012), seat, zAt(u))]))); // the lid's edge
    panel.push(strip(bench.map(u => [V(s * (sh(u) - 0.012), seat, zAt(u)), V(s * benchOut(u), seat, zAt(u))]))); // the lid: a solid varnished panel
    lining.push(strip(bench.map(u => [V(s * benchOut(u), seat, zAt(u)), V(s * benchOut(u), deckY(u, benchOut(u)) - 0.02, zAt(u))]))); // the back, under the side deck
    // the footwell's sides: no panel, just the hull's own inside, curving up from the sole's edge to the deck over it
    const prof = memoU((u: number) => { const pts: THREE.Vector3[] = [V(s * sh(u), sole, zAt(u))], top = deckY(u, halfBeam(u)) - 0.02;
      for (let k = 0; k <= WELL_K; k++) { const y = sole + (top - sole) * k / WELL_K; pts.push(V(s * Math.max(sh(u), Math.min(hullInnerHalf(u, y), halfBeam(u)) - 0.03), y, zAt(u))); }
      return pts; }); // (once per station: each strip of the lining takes two points of it)
    for (let k = 0; k <= WELL_K; k++) lining.push(strip(well.map(u => { const q = prof(u); return [q[k], q[k + 1]] as [THREE.Vector3, THREE.Vector3]; })));
    const ub = zU(benchAft); panel.push(face(benchAft, [[s * (sh(ub) - 0.012), sole], ...hullSide(ub, s, true), [s * (sh(ub) - 0.012), seat]])); // the locker's end, out to the hull
  }
  // the cockpit's after end, and under the after deck a hollow (Josephine, the owner's photo): open to the cockpit and
  // open under the footrest plank, its floor the cockpit sole's level carried on aft until the hull's own inside rises
  // above that (the hull lifting towards the transom), running aft to HOLLOW.z1, lined; the plank slides in and out of it
  // (boatMesh)
  { const { z1 } = HOLLOW, zs = span(zA - 0.04, z1, 10); // (begun a little forward of the after end, under the well's lining, so the two meet without a seam)
    // (the floor's height: the lowest the hull's inside is 10 cm out from the middle, found by halving, once per station)
    const floorY = memoU((u: number) => { if (hullInnerHalf(u, sole) - 0.03 >= 0.1) return sole; let lo = sole, hi = sole + 0.4; for (let n = 0; n < 16; n++) { const m = (lo + hi) / 2; if (hullInnerHalf(u, m) - 0.03 < 0.1) lo = m; else hi = m; } return hi; });
    const wF = memoU((u: number) => Math.max(0.07, hullInnerHalf(u, floorY(u)) - 0.03));
    lining.push(strip(zs.map(u => [V(-wF(u), floorY(u), zAt(u)), V(wF(u), floorY(u), zAt(u))]))); // its floor
    // its sides: the hull's inside, from the floor up to the deck over it
    const profOf = (s: number) => memoU((u: number) => { const f = floorY(u), top = deckY(u, halfBeam(u)) - 0.02, q: THREE.Vector3[] = [];
        for (let k = 0; k <= 14; k++) { const y = f + (top - f) * k / 14; q.push(V(s * Math.max(wF(u), Math.min(hullInnerHalf(u, y), halfBeam(u)) - 0.03), y, zAt(u))); }
        return q; });
    // the step up from the sole into it, where the hull's bottom rises above the sole's level: the well's lining at the
    // cockpit's after end (upright at the sole's edge, then the hull's inside) below the hollow's floor
    const ua = zU(zA), fa = floorY(ua), wa = wF(ua), sa = sh(ua);
    if (fa > sole + 0.005) {
      const side: number[][] = [];
      for (let k = 1; k <= 24; k++) { const y = sole + (fa - sole) * k / 24; side.push([Math.min(wa, Math.max(sa, Math.min(hullInnerHalf(ua, y), halfBeam(ua)) - 0.03)), y]); }
      lining.push(face(zA, [[-sa, sole], [sa, sole], ...side, ...side.slice().reverse().map(([x, y]) => [-x, y])])); }
    const profS = { 1: profOf(1), [-1]: profOf(-1) } as Record<number, (u: number) => THREE.Vector3[]>;
    for (const s of [1, -1]) { const prof = profS[s]; for (let k = 0; k < 14; k++) lining.push(strip(zs.map(u => { const q = prof(u); return [q[k], q[k + 1]] as [THREE.Vector3, THREE.Vector3]; }))); }
    // its after end, closing it off from the floor to the deck, hull side to hull side
    const ub = zU(z1), sb = profS[1](ub), pt = profS[-1](ub).slice(), top: number[][] = [];
    for (let i = 1; i < 8; i++) { const x = sb[14].x - (sb[14].x - pt[14].x) * i / 8; top.push([x, deckY(ub, Math.abs(x)) - 0.01]); }
    lining.push(face(z1, [...sb.map(q => [q.x, q.y]), ...top, ...pt.reverse().map(q => [q.x, q.y])])); }
  return { teak: out, lining, panel };
}

/**
 * Each lazarette's lid, where it lifts (for its seam, hinges and finger-hole): x from its front edge out to near the
 * coaming, z along the locker, at the seat's height; starboard positive.
 */
export function lazaretteLids(): { x0: number; x1: number; z0: number; z1: number; y: number }[] {
  const ua = COCKPIT.u0, ub = zU(COCKPIT_FIT.benchAft), um = (ua + ub) / 2, x0 = Math.min(COCKPIT_FIT.soleHalf, hullInnerHalf(um, COCKPIT.sole) - 0.03) + 0.025, x1 = cockpitHalf(um) - 0.03;
  return [1, -1].map(s => ({ x0: s * x0, x1: s * x1, z0: zAt(ua) + 0.06, z1: COCKPIT_FIT.benchAft - 0.05, y: COCKPIT_FIT.seat }));
}

/** The thwart: a beam across the cockpit between the coamings, its top flat and its underside curved (boat's frame). */
function thwartGeometryBuild(): THREE.BufferGeometry[] {
  const { z, half, depth, depthEnd } = COCKPIT_FIT.thwart, top = thwartTop(), w = cockpitHalf(zU(z)) + COAMING_T, N = 16;
  const bot = (x: number) => top - (depthEnd + (depth - depthEnd) * (1 - (x / w) ** 2));
  const pos: number[] = [], P = (x: number, y: number, zz: number) => pos.push(x, y, zz);
  const q = (a: number[], b: number[], c: number[], d: number[]) => { P(a[0], a[1], a[2]); P(b[0], b[1], b[2]); P(c[0], c[1], c[2]); P(a[0], a[1], a[2]); P(c[0], c[1], c[2]); P(d[0], d[1], d[2]); };
  for (let i = 0; i < N; i++) {
    const xa = -w + 2 * w * i / N, xb = -w + 2 * w * (i + 1) / N;
    for (const zz of [z - half, z + half]) q([xa, bot(xa), zz], [xb, bot(xb), zz], [xb, top, zz], [xa, top, zz]); // the faces
    q([xa, top, z - half], [xb, top, z - half], [xb, top, z + half], [xa, top, z + half]); // the top
    q([xa, bot(xa), z + half], [xb, bot(xb), z + half], [xb, bot(xb), z - half], [xa, bot(xa), z - half]); // the curved underside
  }
  for (const x of [-w, w]) q([x, bot(x), z - half], [x, bot(x), z + half], [x, top, z + half], [x, top, z - half]); // the ends
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return [g];
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
function rudderGeometryBuild(): { blade: THREE.BufferGeometry; tiller: THREE.BufferGeometry } {
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
  const g = girthAtP(u, p); let k = 0; while (k < STRAKES - 1 && edgeGirth(u, k + 1) <= g) k++;
  const g0 = edgeGirth(u, k), g1 = edgeGirth(u, k + 1), f = u / Math.max(0.01, uMax(p));
  const lap = strakeLap(k, (g - g0) / Math.max(1e-6, g1 - g0)) * Math.min(1, plankWidthAt(u, k) / (0.5 * plankW(u)), (1 - f) / 0.03);
  if (lap > 0) lapOut(pt, u, p, lap);
  return pt;
}
/** The hull's half-breadth (m) at station u and height y anywhere on the canoe body, sheer to the keel's side. */
export function hullInnerHalf(u: number, y: number): number {
  let lo = 0, hi = 0.8;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sectionPoint(u, m).y > y) lo = m; else hi = m; }
  return sectionPoint(u, (lo + hi) / 2).x;
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
function cockpitLidBuild(): THREE.BufferGeometry {
  const { u0, u1 } = COCKPIT, N = 16, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) { const u = u0 + (u1 - u0) * i / N, w = cockpitHalf(u) + 0.02, y = deckY(u, w) + 0.01; pos.push(-w, y, zAt(u), w, y, zAt(u)); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

/** Depth-only covers over the companionway's openings (as cockpitLid): the sea isn't drawn inside her through them. */
function companionwayLidBuild(): THREE.BufferGeometry {
  const { hw, len, sill } = COMPANIONWAY, u1 = CABIN.u1, z1 = zAt(u1) + 0.003, uS = u1 - len / L, V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // (flat at the crown's height: over the arch's edges they stand at most a couple of cm proud, and draw nothing)
  const yc = cabinTopAt(u1, 0) + 0.005, zS = zAt(uS);
  const pts = [V(-hw, sill, z1), V(hw, sill, z1), V(hw, yc, z1), V(-hw, sill, z1), V(hw, yc, z1), V(-hw, yc, z1), // the doorway
    V(-hw, yc, z1), V(hw, yc, z1), V(hw, yc, zS), V(-hw, yc, z1), V(hw, yc, zS), V(-hw, yc, zS)]; // the hatch's opening
  return new THREE.BufferGeometry().setFromPoints(pts);
}
/**
 * The sliding hatch at `t` (0 shut, slid aft over the opening, its after edge flush with the top washboard; 1 slid
 * forward its own length): a board lying on the cabin top's curve both ways (across the arch, and along the roof as it
 * rises aft), a skirt down to the roof all round, and a thick rounded after edge that follows the arch (the owner's
 * photos of Josephine).
 */
export function slidingHatch(t = 1): THREE.BufferGeometry {
  const hw = COMPANIONWAY.hw + 0.03, lift = 0.05, uShut = CABIN.u1 + 0.01 / L, uOpen = CABIN.u1 - COMPANIONWAY.len / L + 0.02 / L;
  const uA = uShut + (uOpen - uShut) * Math.min(1, Math.max(0, t)), uF = uA - (COMPANIONWAY.len + 0.04) / L;
  const NXh = 10, NZ = 8, pos: number[] = [], idx: number[] = [];
  const P = (u: number, x: number, dy: number) => pos.push(x, cabinTopAt(u, x) + dy, zAt(u));
  // the top: a grid over the roof's curve, forward to aft
  for (let i = 0; i <= NZ; i++) for (let j = 0; j <= NXh; j++) P(uF + (uA - uF) * i / NZ, -hw + 2 * hw * j / NXh, lift);
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NXh; j++) { const a = i * (NXh + 1) + j, c = a + NXh + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); } // (facing up)
  // the skirt down to the roof all round
  const ring: [number, number][] = [];
  for (let j = 0; j <= NXh; j++) ring.push([uA, -hw + 2 * hw * j / NXh]);
  for (let i = NZ - 1; i >= 0; i--) ring.push([uF + (uA - uF) * i / NZ, hw]);
  for (let j = NXh - 1; j >= 0; j--) ring.push([uF, -hw + 2 * hw * j / NXh]);
  for (let i = 1; i <= NZ; i++) ring.push([uF + (uA - uF) * i / NZ, -hw]);
  const b0 = pos.length / 3;
  for (const [u, x] of ring) { P(u, x, lift); P(u, x, 0.005); }
  for (let i = 0; i < ring.length - 1; i++) { const a = b0 + 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  // the thick rounded after edge, following the arch: a half-round 3 cm across along the after edge
  const b1 = pos.length / 3, NR = 6;
  for (let j = 0; j <= NXh; j++) { const x = -hw + 2 * hw * j / NXh, y = cabinTopAt(uA, x) + lift - 0.025, z = zAt(uA);
    for (let k = 0; k <= NR; k++) { const a = -Math.PI / 2 + Math.PI * k / NR; pos.push(x, y + 0.03 * Math.sin(a), z + 0.03 * Math.cos(a)); } }
  for (let j = 0; j < NXh; j++) for (let k = 0; k < NR; k++) { const a = b1 + j * (NR + 1) + k, c = a + NR + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}


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
    const x = w - (u < CABIN.u1 ? CABIN_LEAN * h / cabinSideH(u) : 0) + 0.012; // a hair off the surface
    pos.push(x, deckY(u, w) + h, zAt(u)); uv.push(1 - i / nu, j / nv);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ———————————————————————————— the geometry, built once ————————————————————————————
/**
 * These shapes don't change from boat to boat (the hull's lines, the cabin, the cockpit), and they're slow to work out
 * (the cockpit's linings follow the hull's curves, point by point): so each is built once, and every boat, the boat
 * editor's every rebuild included, gets its own copy (ROADMAP 8v: an editor click rebuilt them all, seconds a click).
 */
const GEO_CACHE: Record<string, unknown> = {};
function cloneGeo(v: unknown): unknown {
  if (v instanceof THREE.BufferGeometry) return v.clone();
  if (Array.isArray(v)) return v.map(cloneGeo);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneGeo(x)]));
  return v; // (numbers, and the functions that go with them, as the cabin's topY)
}
export function hullGeometry(_paint?: HullPaint): THREE.BufferGeometry { return cloneGeo(GEO_CACHE.hullGeometry ??= hullGeometryBuild(_paint)) as ReturnType<typeof hullGeometryBuild>; }
/** The hull drawn from further off (boatMesh's levels of detail, 1 or 2): the same lines, planked more coarsely. */
export function hullGeometryFar(level: 1 | 2 = 2): THREE.BufferGeometry { return cloneGeo(hullLevel(level)) as THREE.BufferGeometry; }
/**
 * The hull at a level of detail (0 in full … 2 the coarsest), one copy every boat draws: nothing changes a hull's shape
 * from boat to boat (her paint is in her material), so the fleet needn't hold eight of each. (render/dispose.ts frees it
 * only once no boat in the scene draws it; three.js sends it to the GPU again if a later boat does.)
 */
export function hullLevel(level: 0 | 1 | 2): THREE.BufferGeometry {
  return (GEO_CACHE['hullLevel' + level] ??= hullGeometryBuild(undefined, level)) as THREE.BufferGeometry;
}
export function deckGeometry(): THREE.BufferGeometry { return cloneGeo(GEO_CACHE.deckGeometry ??= deckGeometryBuild()) as ReturnType<typeof deckGeometryBuild>; }
export function cabinGeometry(): { sides: THREE.BufferGeometry; top: THREE.BufferGeometry; aft: THREE.BufferGeometry; topY: (u: number) => number } { return cloneGeo(GEO_CACHE.cabinGeometry ??= cabinGeometryBuild()) as ReturnType<typeof cabinGeometryBuild>; }
export function cockpitGeometry(): { teak: THREE.BufferGeometry[]; lining: THREE.BufferGeometry[]; panel: THREE.BufferGeometry[] } { return cloneGeo(GEO_CACHE.cockpitGeometry ??= cockpitGeometryBuild()) as ReturnType<typeof cockpitGeometryBuild>; }
export function thwartGeometry(): THREE.BufferGeometry[] { return cloneGeo(GEO_CACHE.thwartGeometry ??= thwartGeometryBuild()) as ReturnType<typeof thwartGeometryBuild>; }
export function rudderGeometry(): { blade: THREE.BufferGeometry; tiller: THREE.BufferGeometry } { return cloneGeo(GEO_CACHE.rudderGeometry ??= rudderGeometryBuild()) as ReturnType<typeof rudderGeometryBuild>; }
export function cockpitLid(): THREE.BufferGeometry { return cloneGeo(GEO_CACHE.cockpitLid ??= cockpitLidBuild()) as ReturnType<typeof cockpitLidBuild>; }
export function companionwayLid(): THREE.BufferGeometry { return cloneGeo(GEO_CACHE.companionwayLid ??= companionwayLidBuild()) as ReturnType<typeof companionwayLidBuild>; }
