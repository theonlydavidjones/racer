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

/** Sheer height above the waterline: high bow, lowest about 60% aft (0.568 m, the class's lowest freeboard), a little rise to the transom. */
export function sheer(u: number): number {
  return u < 0.62 ? 0.568 + 0.40 * Math.pow((0.62 - u) / 0.62, 1.8) : 0.568 + 0.14 * ((u - 0.62) / 0.38) ** 2;
}
/**
 * Half-breadth of the deck (m) at the class's measuring stations, 0.5 m apart (CR 2.14), station 1 at the transom.
 * Station 11's beam, 1910 mm, is the class rule's (CR 2.161); the other given stations are from the class lines as
 * read for the audit (stations 1–4 and 12–15; not reproduced in the rules, so unconfirmed); the maximum, 1100 mm (the
 * 2.20 m beam), is at station 8; stations 5–7, 9 and 10 are faired between them (estimates).
 */
const HB_MM = [655, 760, 860, 948, 1015, 1062, 1090, 1100, 1088, 1040, 955, 849, 705, 530, 315]; // stations 1..15
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
 * The stern: the raked transom and the sternpost are one straight line, from the heel of the keel up to the
 * top of the transom, and the rudder hangs on it. The waterline ends where it crosses y = 0.
 */
export const HEEL = { z: 2.73, y: -1.15 }, TRANSOM_TOP = { z: L / 2, y: sheer(1) };
export const aftLineZ = (y: number) => HEEL.z + (y - HEEL.y) * (TRANSOM_TOP.z - HEEL.z) / (TRANSOM_TOP.y - HEEL.y);

/**
 * Bottom of the canoe body on the centreline: the spoon bow's stem, the hull bottom, rising aft. The stem meets the
 * water 1.21 m aft of the bow at deck level, so with the raked transom's crossing (aftLineZ(0)) she's 6.0 m on the
 * waterline (class Appendix: LWL 6.00 m); the shares of the overhangs between bow and stern are estimates.
 */
const BOW = 0.17; // where the stem's curve meets the forefoot (fraction of L)
function canoe(u: number): number {
  if (u < BOW) return 0.96 - 1.06 * Math.pow(u / BOW, 1.34);
  if (u < 0.45) return -0.1 - 0.38 * ease((u - BOW) / (0.45 - BOW));
  if (u < 0.62) return -0.48;
  return -0.48 + 0.65 * ease((u - 0.62) / 0.38);
}
/** Keel bottom: cutaway forefoot, deepest at the heel (1.2 m draft with the keel band). */
function keel(u: number): number {
  if (u <= BOW) return canoe(u);
  if (u < 0.33) return -0.1 + (-0.95 + 0.1) * ease((u - BOW) / (0.33 - BOW));
  return Math.max(-1.2, -0.95 - 0.25 * (u - 0.33) / 0.53);
}
/** Half-thickness of the keel (ballast keel and deadwood). */
function keelHalf(u: number): number {
  if (u <= BOW) return 0;
  return 0.03 + 0.1 * Math.pow(Math.sin(Math.PI * Math.min(1, (u - BOW) / 0.73)), 0.7);
}
/** Section fullness: V-shaped forward, slack round bilge amidships, firmer aft. */
const sectionN = (u: number) => 1.35 + 1.0 * ease(u / 0.5) - 0.25 * ease((u - 0.6) / 0.4);

const NU = 72, NF = 5, STRAKES = 9, LAP = 0.016;

/** The section point at station u: p from 0 at the sheer to 0.8 at the keel's side (canoe body), 1 at the keel bottom. */
function sectionPoint(u: number, p: number): { x: number; y: number } {
  const b = halfBeam(u), s = sheer(u), kc = canoe(u), wk = keelHalf(u), kb = Math.min(keel(u), kc);
  if (p <= 0.8) {
    const a = (p / 0.8) * Math.PI / 2, n = sectionN(u);
    const xs = b * Math.pow(Math.cos(a), 2 / n), ys = s - (s - kc) * Math.pow(Math.sin(a), 2 / (n * 0.8));
    return { x: p >= 0.8 ? wk : Math.pow(xs ** 4 + wk ** 4, 0.25), y: ys }; // blends smoothly into the keel's side
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
  type Row = { p: number; lap: number; shade?: number }[];
  const strips: Row[] = [];
  for (let k = 0; k < STRAKES; k++) {
    const p0 = 0.8 * k / STRAKES, p1 = 0.8 * (k + 1) / STRAKES, row: Row = [];
    if (k > 0) row.push({ p: p0 - 0.02, lap: 0, shade: 1 }); // the land: this plank's top edge, hidden behind the plank above
    for (let j = 0; j <= 3; j++) row.push({ p: p0 + (p1 - p0) * j / 3, lap: LAP * j / 3, shade: j === 0 && k > 0 ? 0.82 : 1 }); // in the shadow of the lap above
    strips.push(row);
    if (k < STRAKES - 1) strips.push([{ p: p1, lap: LAP }, { p: p1, lap: 0 }]); // the lap's edge, facing down
  }
  { const row: Row = []; for (let j = 0; j <= NF; j++) row.push({ p: 0.8 + 0.2 * j / NF, lap: 0 }); strips.push(row); }
  for (const side of [1, -1]) {
    for (const row of strips) {
      const base = pos.length / 3;
      for (let i = 0; i <= NU; i++) for (const r of row) {
        const f = i / NU, u = f * uMax(r.p), pt = hullPoint(u, r.p);
        // push the lap outward across the section (along the section's outward normal); the planks run out
        // flush at the stem and the transom
        const lap = r.lap * Math.min(1, f / 0.04, (1 - f) / 0.03);
        if (lap > 0) { const q = hullPoint(u, Math.min(0.8, r.p + 0.01)), dx = pt.x - q.x, dy = pt.y - q.y, l = Math.hypot(dx, dy) || 1; pt.x += (-dy / l) * lap; pt.y += (dx / l) * lap; }
        pos.push(pt.x * side, pt.y, pt.z);
        const c = colorAt(pt.y), k = row.length === 2 && row[0].p === row[1].p ? 0.55 : r.shade ?? 1; col.push(c.r * k, c.g * k, c.b * k);
      }
      const W = row.length, ledge = W === 2 && row[0].p === row[1].p; // a lap's edge faces down, into its own shadow
      for (let i = 0; i < NU; i++) for (let j = 0; j < W - 1; j++) {
        const a = base + i * W + j, b = a + 1, c = a + W, d = c + 1;
        if ((side > 0) !== ledge) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
  }
  // transom and sternpost: the hull's aft ends, all on the raked plane, closed with a fan
  { const ring: number[] = [], P = 40;
    const add = (x: number, y: number, z: number) => { pos.push(x, y, z); const c = colorAt(y); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
    for (let j = 0; j <= P; j++) { const p = j / P, pt = hullPoint(uMax(p), p); ring.push(add(pt.x, pt.y, pt.z)); }
    for (let j = P; j >= 0; j--) { const p = j / P, pt = hullPoint(uMax(p), p); ring.push(add(-pt.x, pt.y, pt.z)); }
    const cy = 0.15, ctr = add(0, cy, aftLineZ(cy));
    for (let j = 0; j < ring.length - 1; j++) idx.push(ctr, ring[j], ring[j + 1]);
    idx.push(ctr, ring[ring.length - 1], ring[0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------- deck, cabin, cockpit ---------- */

/** Openings in the deck: the cabin trunk and the cockpit well (u range, half-width). */
/**
 * The cabin trunk starts just aft of the mast, which goes through the foredeck at the sheer's height (the boom's band is
 * 1.00 m above the deck there, CR 6.1.11; a coachroof "extended forward of the mast" is a variation, not the class
 * norm). Its after end and the sizes are estimates. (CR 3.12 puts the cabin's after end within 300 mm forward of
 * station 6; with station 1 at the transom that would be 0.25–0.55 m further aft than drawn, which isn't confirmed.)
 */
export const CABIN = { u0: 0.402, u1: 0.6, w: 0.62, h: 0.32 };
export const COCKPIT = { u0: 0.6, u1: 0.93, w: 0.7, sole: 0.24 };
/** Cockpit half-width: narrows aft with the hull, leaving a side deck. */
export const cockpitHalf = (u: number) => Math.min(COCKPIT.w, halfBeam(u) - 0.24);
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

/** Cabin trunk half-width: rounded in plan at the front. */
function cabinHalf(u: number): number {
  const r = 0.05; // the rounded front, as a fraction of the length
  if (u < CABIN.u0 + r) { const f = (CABIN.u0 + r - u) / r; return CABIN.w * Math.sqrt(Math.max(0, 1 - f * f * 0.85)); }
  return CABIN.w;
}

/** Height of the cabin top (at its sides' top edge) at station u. */
export const cabinTopY = (u: number) => deckY(u, CABIN.w) + CABIN.h + 0.02 * (u - CABIN.u1) / (CABIN.u0 - CABIN.u1);

/** The cabin trunk: sides from below the deck up to a cambered top with rounded edges. Returns [sides, top]. */
export function cabinGeometry(): { sides: THREE.BufferGeometry; top: THREE.BufferGeometry; topY: (u: number) => number } {
  const N = 40, topY = cabinTopY;
  const outline: { u: number; x: number }[] = [];
  for (let i = 0; i <= N; i++) { const u = CABIN.u0 + (CABIN.u1 - CABIN.u0) * i / N; outline.push({ u, x: cabinHalf(u) }); }
  const sides: number[] = [], sIdx: number[] = [];
  const ring = [...outline.map(o => ({ u: o.u, x: o.x })), ...outline.slice().reverse().map(o => ({ u: o.u, x: -o.x }))];
  ring.push(ring[0]); // close the front
  for (const o of ring) {
    const lean = 0.06; // sides lean in toward the top
    sides.push(o.x, 0.45, zAt(o.u), o.x - Math.sign(o.x) * lean, topY(o.u), zAt(o.u));
  }
  for (let i = 0; i < ring.length - 1; i++) { const a = i * 2; sIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  // aft face (closing the ring at the back)
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3)); sg.setIndex(sIdx); sg.computeVertexNormals();
  const top: number[] = [], tIdx: number[] = [], NX = 8;
  for (let i = 0; i <= N; i++) {
    const u = outline[i].u, w = outline[i].x - 0.06;
    for (let j = 0; j <= NX; j++) { const x = -w + 2 * w * j / NX; top.push(x, topY(u) + 0.06 * (1 - (x / CABIN.w) ** 2), zAt(u)); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < NX; j++) { const a = i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1; tIdx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); tg.setIndex(tIdx); tg.computeVertexNormals();
  return { sides: sg, top: tg, topY };
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
  const out = [strip(us.map(u => [V(-cockpitHalf(u), sole, zAt(u)), V(cockpitHalf(u), sole, zAt(u))]), true)]; // sole
  for (const s of [1, -1]) out.push(strip(us.map(u => [V(s * cockpitHalf(u), sole, zAt(u)), V(s * cockpitHalf(u), deckY(u, cockpitHalf(u)), zAt(u))]), s > 0));
  const w1 = cockpitHalf(u1), ya = deckY(u1, 0);
  out.push(quad(V(w1, sole, zAt(u1)), V(-w1, sole, zAt(u1)), V(-w1, ya, zAt(u1)), V(w1, ya, zAt(u1)))); // aft wall
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
export function rail(pts: THREE.Vector3[], h: number, t: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (const p of pts) { pos.push(p.x - t / 2 * Math.sign(p.x || 1), p.y, p.z, p.x - t / 2 * Math.sign(p.x || 1), p.y + h, p.z, p.x + t / 2 * Math.sign(p.x || 1), p.y + h, p.z, p.x + t / 2 * Math.sign(p.x || 1), p.y, p.z); }
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
  const len = Math.hypot(TRANSOM_TOP.z - HEEL.z, TRANSOM_TOP.y - HEEL.y) + 0.1, a = (y: number) => (y - HEEL.y) / Math.cos(RUDDER_RAKE);
  // outline in (chord aft, along the hinge): deep blade, narrowing to the head above the transom
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(0.42, 0.02); sh.quadraticCurveTo(0.5, 0.12, 0.47, 0.4); sh.lineTo(0.36, a(0)); sh.lineTo(0.2, a(0.45)); sh.lineTo(0.1, len); sh.lineTo(0, len); sh.closePath();
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  // shape (x, y) → (z, y); extrusion → x, centred
  blade.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -0.025, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  blade.computeVertexNormals();
  // tiller: from the rudder head, forward and a little up into the cockpit
  const head = new THREE.Vector3(0, len - 0.03, 0.04), dir = new THREE.Vector3(0, -0.317, -0.949).normalize();
  const tl = 1.3, tiller = new THREE.CylinderGeometry(0.018, 0.028, tl, 8);
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
  const k = Math.min(STRAKES - 1, Math.floor(p / 0.8 * STRAKES)), p0 = 0.8 * k / STRAKES, p1 = 0.8 * (k + 1) / STRAKES;
  const f = u / Math.max(0.01, uMax(p)), lap = LAP * ((p - p0) / (p1 - p0)) * Math.min(1, f / 0.04, (1 - f) / 0.03);
  if (lap > 0) { const q = hullPoint(u, Math.min(0.8, p + 0.01)), dx = pt.x - q.x, dy = pt.y - q.y, l = Math.hypot(dx, dy) || 1; pt.x += (-dy / l) * lap; pt.y += (dx / l) * lap; }
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
