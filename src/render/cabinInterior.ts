import './three-setup';
import * as THREE from 'three';
import { CABIN, CABIN_LEAN, COMPANIONWAY, L, WINDOW, cabinHalf, cabinTopAt, cabinTopY, deckY, halfBeam, hullInnerHalf } from './hull';

/**
 * The cabin's inside, to the class construction plan (1:10, rev. 2024; read from its St. 8 section and profile):
 * the cabin sole 280 mm below the waterline and 700 mm wide (the plan's "280", "350/350"); a settee berth each side,
 * its top about 20 mm below the waterline and its inner edge 280 mm off the centreline, the berth's front board
 * sloping out to about 360 mm at the sole (scaled from the section); the hull's lining up to the side decks, the cabin
 * sides and the underside of the arched cabin top; the main bulkhead aft (St. 6.6, CR 3.12) with the companionway in
 * it, and forward the cabin's end where the trunk rounds in (the plan draws no forward bulkhead; CR 2.405 allows one).
 * The berths run the cabin's length, 1.85 m (CR 3.15: at least 1.80 m).
 *
 * It's one inward-facing shell just inside the hull, deck and cabin trunk, seen only through the companionway and the
 * windows. Its light is one lantern hanging in the middle of the cabin, swinging on its chain as she moves
 * (swingLantern): worked out where it hangs now as falling off with the square of the distance and with the angle the
 * surface turns from it, plus the light bounced round the cabin's pale lining (taken as an even share). By day it's lit only by what comes in through the openings, dimly.
 */

const zAt = (u: number) => -L / 2 + u * L;
const uAt = (z: number) => (z + L / 2) / L;
/** The plan's heights (m, from the waterline) and half-widths. */
export const INTERIOR = { sole: -0.28, soleHalf: 0.35, berth: -0.02, berthIn: 0.28, berthFoot: 0.36 };
/** The lantern: hanging from the cabin top's centreline halfway along the cabin, about 0.3 m down. */
export const LANTERN = new THREE.Vector3(0, 0, 0);
{ const um = (CABIN.u0 + 0.06 + CABIN.u1) / 2; LANTERN.set(0, cabinTopAt(um, 0) - 0.3, zAt(um)); }

const INSET = 0.025; // how far inside the outer surfaces the lining lies (m)
const LINING = new THREE.Color(0xe8e3d6), WOOD = new THREE.Color(0x8a5a36), TEAK = new THREE.Color(0x9a6b3e), SEAM = new THREE.Color(0x2a1d14), CUSHION = new THREE.Color(0x6b4428), SPAR = new THREE.Color(0xb9bec4);

/** The cross-section of the cabin's inside at station u, starboard half, from the sole's middle round to the cabin top's. */
function section(u: number): { x: number; y: number; wood: boolean; win?: boolean; top?: boolean }[] {
  const { sole, soleHalf, berth, berthIn, berthFoot } = INTERIOR;
  const hull = (y: number) => Math.min(hullInnerHalf(u, y), halfBeam(u)) - INSET;
  const ch = cabinHalf(u) - INSET, dS = deckY(u, cabinHalf(u)), top = cabinTopY(u);
  const pts: { x: number; y: number; wood: boolean; win?: boolean; top?: boolean }[] = [
    { x: 0, y: sole, wood: true }, { x: Math.min(soleHalf, hull(sole) - 0.01), y: sole, wood: true },
    { x: Math.min(berthFoot, hull(sole)), y: sole, wood: false }, // the berth's front, up to its top edge (the GRP inner moulding, CR 2.405)
    { x: berthIn, y: berth, wood: false }, { x: hull(berth), y: berth, wood: false }, // the berth top, out to the hull
  ];
  const sheerY = deckY(u, halfBeam(u)) - INSET;
  for (let k = 1; k <= 4; k++) { const y = berth + (sheerY - berth) * k / 4; pts.push({ x: hull(y), y, wood: false }); } // the lining
  pts.push({ x: ch + 0.01, y: dS - INSET, wood: false }); // under the side deck, in to the cabin side
  // the cabin side, up past the window to the top's edge (the window's band marked, for the opening)
  for (const h of [0, WINDOW.h0, WINDOW.h1, CABIN.h]) pts.push({ x: ch - CABIN_LEAN * h / CABIN.h, y: dS + h - (h === CABIN.h ? INSET : 0), wood: false, win: h === WINDOW.h0 });
  const w = ch - CABIN_LEAN;
  // the cabin top's underside, in to the centreline (a point at the hatch opening's edge, where it's cut through)
  const xs = [...[1, 2, 3, 4, 5].map(k => w * (1 - k / 5)), COMPANIONWAY.hw].sort((a, b) => b - a);
  for (const x of xs) pts.push({ x, y: cabinTopAt(u, x) - INSET, wood: false, top: true });
  // keep every point within the cabin's own height (the arch at the rounded front, where the trunk narrows)
  for (const q of pts) q.y = Math.min(q.y, top + CABIN.crown - INSET);
  return pts;
}

/**
 * Daylight inside: what comes in through the openings, each taken as a patch of bright sky facing into the cabin. A
 * surface takes light from an opening by how squarely it faces it, how squarely the opening faces it, and the square of
 * the distance; plus a little bounced round the cabin. The companionway and the hatch's opening over it let in the
 * most, so the cabin is brightest aft and darkens forward and down.
 */
const OPENINGS: { at: THREE.Vector3; dir: THREE.Vector3; k: number }[] = [];
function dayAt(p: THREE.Vector3, n: THREE.Vector3): number {
  if (!OPENINGS.length) {
    const z1 = zAt(CABIN.u1), zs = z1 - COMPANIONWAY.len / 2;
    OPENINGS.push({ at: new THREE.Vector3(0, (COMPANIONWAY.sill + cabinTopY(CABIN.u1)) / 2, z1), dir: new THREE.Vector3(0, -0.3, -1).normalize(), k: 1.0 }); // the doorway
    OPENINGS.push({ at: new THREE.Vector3(0, cabinTopAt(uAt(zs), 0), zs), dir: new THREE.Vector3(0, -1, 0), k: 1.1 }); // the hatch's opening
    for (const sx of [1, -1]) OPENINGS.push({ at: new THREE.Vector3(sx * (cabinHalf(WINDOW.uc) - 0.03), deckY(WINDOW.uc, cabinHalf(WINDOW.uc)) + (WINDOW.h0 + WINDOW.h1) / 2, zAt(WINDOW.uc)), dir: new THREE.Vector3(-sx, -0.2, 0).normalize(), k: 0.35 }); // the windows
  }
  let e = 0.05;
  for (const o of OPENINGS) {
    const l = o.at.clone().sub(p), d = l.length(); l.divideScalar(d || 1);
    e += o.k * Math.max(0, n.dot(l)) * Math.max(0, -o.dir.dot(l)) / (1 + (d / 0.6) ** 2);
  }
  return e;
}
/**
 * Contact shading: where two surfaces meet (the sole and the berth fronts, the berths and the hull, the lining and the
 * deck over it, the bulkheads' corners) less of the room's light reaches, so corners and the far ends read darker.
 */
function aoAt(p: THREE.Vector3): number {
  const u = uAt(p.z), ax = Math.abs(p.x), near = (d: number, k: number) => 1 - k * Math.exp(-Math.max(0, d) / 0.09);
  const roof = ax < cabinHalf(u) - 0.02 ? cabinTopAt(u, Math.min(ax, cabinHalf(u) - CABIN_LEAN - 0.01)) : deckY(u, ax);
  return near(p.y - INTERIOR.sole, 0.35) * near(roof - INSET - p.y, 0.3) * near(halfBeam(u) - INSET - ax, 0.2) * near(zAt(CABIN.u1) - p.z, 0.3) * near(p.z - zAt(CABIN.u0 + 0.06), 0.3)
    * near(Math.abs(p.y - INTERIOR.berth) + Math.max(0, INTERIOR.berthIn - ax), 0.2);
}

/** The shell: positions, the lining's or the woodwork's colour, and the lantern's light, per vertex. */
export function cabinInteriorGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], lamp: number[] = [], day: number[] = [], nrm: number[] = [], lit: number[] = [];
  const centre = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, open = 1) => {
    // the face's normal, turned to look into the cabin (toward its middle line)
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    centre.set(0, (INTERIOR.sole + cabinTopY(uAt(a.z)) + CABIN.crown) / 2, a.z);
    if (n.dot(centre.clone().sub(a)) < 0) { n.negate(); [b, c] = [c, b]; [cb, cc] = [cc, cb]; }
    for (const [p, cl] of [[a, ca], [b, cb], [c, cc]] as const) { const ao = aoAt(p); pos.push(p.x, p.y, p.z); col.push(cl.r, cl.g, cl.b); lamp.push(0); nrm.push(n.x, n.y, n.z); lit.push(open * ao); day.push(dayAt(p, n) * ao); }
  };
  // stations from the main bulkhead forward to where the trunk's rounded front begins, and the windows' ends
  const uA = CABIN.u1 - 0.002, uF = CABIN.u0 + 0.06, NS = 16;
  const us = [...Array.from({ length: NS + 1 }, (_, i) => uF + (uA - uF) * i / NS), WINDOW.hole0, WINDOW.hole1].sort((a, b) => a - b);
  const secs = us.map(u => section(u));
  for (const side of [1, -1]) for (let i = 0; i < us.length - 1; i++) {
    const A = secs[i], B = secs[i + 1], za = zAt(us[i]), zb = zAt(us[i + 1]), um = (us[i] + us[i + 1]) / 2;
    for (let j = 0; j < A.length - 1; j++) {
      if (A[j].win && um > WINDOW.hole0 && um < WINDOW.hole1) continue; // the window's opening
      if (A[j].top && A[j + 1].top && A[j].x <= COMPANIONWAY.hw + 1e-6 && um > CABIN.u1 - COMPANIONWAY.len / L) continue; // the hatch's opening
      const p = (q: typeof A[0], z: number) => new THREE.Vector3(side * q.x, q.y, z);
      const a = p(A[j], za), b = p(A[j + 1], za), cc = p(B[j], zb), d = p(B[j + 1], zb);
      const wj = A[j].wood && A[j + 1].wood ? WOOD : LINING;
      tri(a, b, cc, wj, wj, wj); tri(b, d, cc, wj, wj, wj);
    }
  }
  // the two ends: the main bulkhead's inside face (the companionway cut down to its sill), and the forward bulkhead
  const cap = (u: number, notch: boolean, colour: THREE.Color, hole: THREE.Vector2[] = []) => {
    const hw = COMPANIONWAY.hw, z = zAt(u);
    // round the section, starboard then port; with the doorway, the arch inside its width gives way to its posts and sill
    const keep = (q: { x: number; y: number }) => !notch || !(q.x < hw && q.y > COMPANIONWAY.sill);
    const stbd = section(u).filter(keep), ring: THREE.Vector2[] = stbd.map(q => new THREE.Vector2(q.x, q.y));
    if (notch) { const yt = cabinTopAt(u, hw) - INSET; ring.push(new THREE.Vector2(hw, yt), new THREE.Vector2(hw, COMPANIONWAY.sill), new THREE.Vector2(-hw, COMPANIONWAY.sill), new THREE.Vector2(-hw, yt)); }
    for (let k = stbd.length - 1; k >= 1; k--) if (stbd[k].x > 1e-4) ring.push(new THREE.Vector2(-stbd[k].x, stbd[k].y));
    const clean = ring.filter((q, k) => k === 0 || q.distanceTo(ring[k - 1]) > 1e-4);
    const all = [...clean, ...hole];
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(clean, hole.length ? [hole] : [])) tri(new THREE.Vector3(all[a].x, all[a].y, z), new THREE.Vector3(all[b].x, all[b].y, z), new THREE.Vector3(all[c].x, all[c].y, z), colour, colour, colour);
  };
  cap(uA, true, WOOD);
  // forward, the opening into the forepeak (CR 2.405), and through it the forepeak itself: the berths' platform running
  // on forward under the foredeck, rising toward the bow (the plan's forepeak shelf, about 190 mm over the waterline
  // at St. 12.4), its lining going dark with the distance from the lantern
  const zF = zAt(uF), fy0 = INTERIOR.berth + 0.04, fy1 = Math.min(deckY(uF, 0), cabinTopY(uF)) - 0.06, fw = 0.33; // (the opening at least 0.55 m², CR 2.405)
  cap(uF, false, WOOD, [new THREE.Vector2(fw, fy0), new THREE.Vector2(fw, fy1), new THREE.Vector2(-fw, fy1), new THREE.Vector2(-fw, fy0)]);
  { const NF = 6, len = 1.0, v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z), rows: { z: number; w: number; f: number; t: number }[] = [];
    for (let k = 0; k <= NF; k++) {
      const z = zF - len * k / NF, u = uAt(z), f = fy0 + (0.19 - fy0) * k / NF, t = deckY(u, 0) - INSET;
      rows.push({ z, f, t: Math.max(f + 0.1, Math.min(t, fy1)), w: Math.max(0.05, Math.min(fw, hullInnerHalf(u, f + 0.05) - INSET)) });
    }
    for (let k = 0; k < NF; k++) {
      const a = rows[k], b = rows[k + 1];
      tri(v(-a.w, a.f, a.z), v(a.w, a.f, a.z), v(b.w, b.f, b.z), WOOD, WOOD, WOOD); tri(v(-a.w, a.f, a.z), v(b.w, b.f, b.z), v(-b.w, b.f, b.z), WOOD, WOOD, WOOD); // the platform
      tri(v(-a.w, a.t, a.z), v(a.w, a.t, a.z), v(b.w, b.t, b.z), LINING, LINING, LINING); tri(v(-a.w, a.t, a.z), v(b.w, b.t, b.z), v(-b.w, b.t, b.z), LINING, LINING, LINING); // under the deck
      for (const sx of [1, -1]) { tri(v(sx * a.w, a.f, a.z), v(sx * a.w, a.t, a.z), v(sx * b.w, b.t, b.z), LINING, LINING, LINING); tri(v(sx * a.w, a.f, a.z), v(sx * b.w, b.t, b.z), v(sx * b.w, b.f, b.z), LINING, LINING, LINING); }
    }
    const e = rows[NF]; tri(v(-e.w, e.f, e.z), v(e.w, e.f, e.z), v(e.w, e.t, e.z), LINING, LINING, LINING); tri(v(-e.w, e.f, e.z), v(e.w, e.t, e.z), v(-e.w, e.t, e.z), LINING, LINING, LINING); }
  // the furniture, as boxes (each face its own colour, lit by the lantern like the rest)
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: THREE.Color) => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const f = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3) => { tri(a, b, cc, c, c, c); tri(a, cc, d, c, c, c); };
    f(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)); // top
    f(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)); f(v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0)); // ends
    f(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)); f(v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0)); // sides
  };
  const zMain = zAt(uA), zEnd = zAt(uF) + 0.01, um = (uA + uF) / 2;
  for (const sx of [1, -1]) {
    const lo = (a: number, b: number) => (sx > 0 ? [a, b] : [-b, -a]) as [number, number];
    // the berth's varnished trim along its front edge, and the brown cushions: a seat and a back against the hull
    box(...lo(INTERIOR.berthIn - 0.02, INTERIOR.berthIn + 0.01), INTERIOR.berth - 0.06, INTERIOR.berth + 0.005, zEnd, zMain - 0.005, TEAK);
    const hb = Math.min(hullInnerHalf(um, INTERIOR.berth + 0.1), halfBeam(um)) - INSET - 0.02;
    box(...lo(INTERIOR.berthIn + 0.01, hb - 0.12), INTERIOR.berth, INTERIOR.berth + 0.09, zEnd + 0.02, zMain - 0.03, CUSHION);
    box(...lo(hb - 0.12, hb - 0.02), INTERIOR.berth + 0.09, INTERIOR.berth + 0.45, zEnd + 0.02, zMain - 0.03, CUSHION);
    // a shelf along the hull above the berth, its fiddle rail along the front
    const ys = deckY(um, halfBeam(um)) - 0.16, hs = Math.min(hullInnerHalf(um, ys), halfBeam(um)) - INSET;
    box(...lo(hs - 0.13, hs), ys - 0.015, ys, zEnd + 0.05, zMain - 0.08, WOOD);
    box(...lo(hs - 0.135, hs - 0.12), ys, ys + 0.045, zEnd + 0.05, zMain - 0.08, WOOD);
    // the plywood knees under the deck at the cabin's forward end, where the deck is supported (CR 2.409)
    { const kz = zEnd + 0.01, kx = cabinHalf(uF) - INSET, ky = deckY(uF, cabinHalf(uF)) - INSET, v = (x: number, y: number) => new THREE.Vector3(sx * x, y, kz);
      tri(v(kx, ky), v(kx - 0.2, ky), v(kx, ky - 0.22), WOOD, WOOD, WOOD); }
  }
  // the floorboards' seams, along the sole (CR 3.40: wooden boards between the berths)
  for (const x of [-0.12, 0.12]) box(x - 0.004, x + 0.004, INTERIOR.sole, INTERIOR.sole + 0.002, zEnd, zMain - 0.01, SEAM);
  // a hanging locker to port by the companionway, from the berth up under the side deck (as on Wilma)
  { const zl0 = zMain - 0.42, zl1 = zMain - 0.01, xi = -(INTERIOR.berthIn + 0.02), xo = -(Math.min(...[zl0, zl1].map(z => Math.min(hullInnerHalf(uAt(z), INTERIOR.berth), halfBeam(uAt(z))))) - INSET - 0.01) /* (its back as far out as the hull allows at its foot, the narrowest place, so no corner shows through the planking) */, yt = deckY(uAt(zMain - 0.2), cabinHalf(uAt(zMain - 0.2))) - INSET;
    box(xo, xi, INTERIOR.berth, yt, zl0, zl1, WOOD);
    box(xi - 0.004, xi + 0.001, INTERIOR.berth + 0.06, yt - 0.06, zl0 + 0.04, zl1 - 0.04, SEAM); } // its door's outline
  // the mast, stepped on the keel: through the forepeak from the deck down (aluminium, 133 × 110 mm; boatMesh MAST_Z)
  { const mz = -L / 2 + 0.8 + 2.0 + 0.0665, top = deckY(uAt(mz), 0) - INSET;
    box(-0.055, 0.055, INTERIOR.sole, top, mz - 0.0665, mz + 0.0665, SPAR); }
  // each window's reveal: the cabin side's thickness round the opening, lining to the outside skin, so no gap shows
  for (const side of [1, -1]) {
    const N = 8, outer = (u: number, h: number) => cabinHalf(u) - CABIN_LEAN * h / CABIN.h, inner = (u: number, h: number) => outer(u, h) - INSET;
    const P = (u: number, h: number, x: number) => new THREE.Vector3(side * x, deckY(u, cabinHalf(u)) + h, zAt(u));
    for (const h of [WINDOW.h0, WINDOW.h1]) for (let i = 0; i < N; i++) { // the sill and the head
      const ua = WINDOW.hole0 + (WINDOW.hole1 - WINDOW.hole0) * i / N, ub = WINDOW.hole0 + (WINDOW.hole1 - WINDOW.hole0) * (i + 1) / N;
      tri(P(ua, h, outer(ua, h)), P(ub, h, outer(ub, h)), P(ub, h, inner(ub, h)), LINING, LINING, LINING); tri(P(ua, h, outer(ua, h)), P(ub, h, inner(ub, h)), P(ua, h, inner(ua, h)), LINING, LINING, LINING);
    }
    for (const u of [WINDOW.hole0, WINDOW.hole1]) { // the ends
      const a = P(u, WINDOW.h0, outer(u, WINDOW.h0)), b = P(u, WINDOW.h1, outer(u, WINDOW.h1)), c = P(u, WINDOW.h1, inner(u, WINDOW.h1)), d = P(u, WINDOW.h0, inner(u, WINDOW.h0));
      tri(a, b, c, LINING, LINING, LINING); tri(a, c, d, LINING, LINING, LINING);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aLamp', new THREE.Float32BufferAttribute(lamp, 1));
  g.setAttribute('aDay', new THREE.Float32BufferAttribute(day, 1));
  g.setAttribute('aN', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aLit', new THREE.Float32BufferAttribute(lit, 1));
  return g;
}

/** Where the lantern's chain is shackled to the cabin top's underside (on the centreline), and the chain's length to the lamp's middle. */
export const LANTERN_PIVOT = new THREE.Vector3(LANTERN.x, cabinTopAt(uAt(LANTERN.z), 0) - INSET, LANTERN.z);
export const LANTERN_DROP = LANTERN_PIVOT.y - LANTERN.y;

/**
 * The lantern itself, drawn in its own frame (the chain's shackle at the origin, hanging along −y) so it can swing: a
 * small brass lamp on a short chain, its glass bright when lit. It gives no light to itself from the room (aLit 0); its
 * glass and brass carry their own brightness (aLamp).
 */
export function lanternGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], lamp: number[] = [], day: number[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y - LANTERN_DROP, z), N = 8, r = 0.045, BRASS = new THREE.Color(0xb08a4a), GLOW = new THREE.Color(1, 0.95, 0.85);
  const put = (p: THREE.Vector3, c: THREE.Color, l: number, d: number) => { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); lamp.push(l); day.push(d); };
  for (let k = 0; k < N; k++) {
    const a0 = 2 * Math.PI * k / N, a1 = 2 * Math.PI * (k + 1) / N, c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
    const glass = [v(c0, -0.05, s0), v(c1, -0.05, s1), v(c1, 0.05, s1), v(c0, 0.05, s0)];
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) for (const q of [a, b, c]) put(glass[q], GLOW, 2.5, 0.12); // (its glass by day: unlit, only the daylight on it)
    for (const y of [0.05, -0.05]) for (const p of [v(0, y + (y > 0 ? 0.03 : -0.02), 0), v(c0, y, s0), v(c1, y, s1)]) put(p, BRASS, 0.4, 0.35); // the brass top and font
  }
  for (const p of [v(-0.004, 0.08, 0), v(0.004, 0.08, 0), new THREE.Vector3(0, 0, 0)]) put(p, BRASS, 0.3, 0.3); // the chain
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aLamp', new THREE.Float32BufferAttribute(lamp, 1));
  g.setAttribute('aDay', new THREE.Float32BufferAttribute(day, 1));
  g.setAttribute('aN', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('aLit', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  return g;
}

/**
 * The lantern swinging on its chain: a damped pendulum hung from a point that moves with the hull. It's worked out in
 * a frame that keeps her place but not her turn, where gravity is simply down, so what the hull does to the shackle (heel,
 * rolling and pitching in the waves, heaving) reaches the lamp only through the chain, as it does in a real boat. (Her
 * way over the ground is left out, and with it her surging and the sideways pull of a turn: for a Folkboat those are a
 * few hundredths of g, small beside the seaway's.) The chain is taken as a light rigid link of length ℓ to the lamp's middle (a simple pendulum):
 *   ẍ = g − 2ζω₀ (ẋ − ẋ_pivot) + T,  with T the chain's pull keeping |x − x_pivot| = ℓ,
 * which for small swings from a still pivot is θ̈ = −(g/ℓ)·θ − 2ζω₀·θ̇, period 2π√(ℓ/g) ≈ 1.1 s for ℓ ≈ 0.28 m
 * (e.g. Halliday, Resnick & Walker, Fundamentals of Physics, ch. 15: the simple and the damped pendulum). The damping (the
 * chain's links rubbing at the shackle, and the still air in the cabin, so it acts on the lamp's motion relative to the
 * boat, not to the world) is light: ζ ≈ 0.03, a swing dying away to a third in about 6 s. Its period is well under a
 * Folkboat's roll period in a seaway (about 2.5–4 s), so it mostly stays plumb while she rolls under it: from aboard,
 * it swings against the cabin by the roll's own angle, a little more and a little late, and hangs off her centreline
 * by the heel.
 */
export interface LanternSwing { arm: THREE.Group; x: THREE.Vector3; v: THREE.Vector3; p: THREE.Vector3; ok: boolean }
const G = new THREE.Vector3(0, -9.81, 0), ZETA = 0.03, W0 = Math.sqrt(9.81 / LANTERN_DROP);
const _p1 = new THREE.Vector3(), _r = new THREE.Vector3(), _vp = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _pp = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
export function makeLanternSwing(arm: THREE.Group): LanternSwing { return { arm, x: new THREE.Vector3(), v: new THREE.Vector3(), p: new THREE.Vector3(), ok: false }; }
/**
 * One frame of swinging (dt s of sim time), the hull already turned and heaved (grp).
 * Turns the arm to the chain's new direction in the boat's frame, and returns the lamp's middle in the boat's frame.
 */
export function swingLantern(s: LanternSwing, grp: THREE.Object3D, dt: number, out: THREE.Vector3): THREE.Vector3 {
  // the shackle as she turns and heaves about her own middle; her way over the ground is left out (steady, it does
  // nothing to a pendulum, and the sim moves her in steps that would only jerk it)
  _p1.copy(LANTERN_PIVOT).applyQuaternion(grp.quaternion); _p1.y += grp.position.y;
  // the first frame, or she's been moved or turned at a stroke (a restart, a new scene): start hanging still, plumb.
  // (Her own motion carries the shackle a few centimetres a frame at most; a jerk of more would only whip it round.)
  if (!s.ok || _p1.distanceToSquared(s.p) > 0.25 * 0.25) { s.p.copy(_p1); s.x.copy(_p1).addScaledVector(DOWN, LANTERN_DROP); s.v.set(0, 0, 0); s.ok = true; }
  if (dt > 0) {
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n; // (small steps: the link's constraint holds without drifting)
    _vp.subVectors(_p1, s.p).divideScalar(dt);
    for (let i = 1; i <= n; i++) {
      // worked relative to the shackle: where the lamp is from it (_d) and how it moves against it (_r). A change in the
      // shackle's own speed between frames shows here as the lamp lagging behind it (its inertia).
      _d.subVectors(s.x, _pp.lerpVectors(s.p, _p1, (i - 1) / n)).normalize();
      _r.subVectors(s.v, _vp);
      // gravity, and the damping on its motion relative to the cabin; the chain's pull takes out any motion along it
      _r.addScaledVector(G, h).multiplyScalar(1 - 2 * ZETA * W0 * h);
      _r.addScaledVector(_d, -_r.dot(_d));
      // swing round the shackle on the chain's length, the motion turned to run across the chain's new line
      const sp = _r.length();
      _d.multiplyScalar(LANTERN_DROP).addScaledVector(_r, h).normalize();
      _r.addScaledVector(_d, -_r.dot(_d)); const sp2 = _r.length(); if (sp2 > 1e-9) _r.multiplyScalar(sp / sp2);
      _pp.lerpVectors(s.p, _p1, i / n);
      s.x.copy(_pp).addScaledVector(_d, LANTERN_DROP); s.v.copy(_vp).add(_r);
    }
    s.p.copy(_p1);
  }
  // the chain's direction in the boat's own frame
  _d.subVectors(s.x, s.p).normalize();
  _q.copy(grp.quaternion); // (the hull's turn in the scene, the frame the swing is worked in)
  _q.invert(); _d.applyQuaternion(_q);
  s.arm.position.copy(LANTERN_PIVOT); s.arm.quaternion.setFromUnitVectors(DOWN, _d);
  return out.copy(LANTERN_PIVOT).addScaledVector(_d, LANTERN_DROP);
}

/** Depth-only covers over the windows' openings (as over the cockpit): the sea isn't drawn inside her through them. */
export function windowLids(): THREE.BufferGeometry {
  const pos: number[] = [], N = 8;
  for (const side of [1, -1]) for (let i = 0; i < N; i++) {
    const ua = WINDOW.hole0 + (WINDOW.hole1 - WINDOW.hole0) * i / N, ub = WINDOW.hole0 + (WINDOW.hole1 - WINDOW.hole0) * (i + 1) / N;
    const pt = (u: number, h: number) => { const w = cabinHalf(u) - CABIN_LEAN * h / CABIN.h; return [side * w, deckY(u, cabinHalf(u)) + h, zAt(u)]; };
    const a = pt(ua, WINDOW.h0), b = pt(ub, WINDOW.h0), c = pt(ub, WINDOW.h1), d = pt(ua, WINDOW.h1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}

/**
 * The interior's material: its colours lit by the day coming in (uDay) and by the lantern's warm light (uLamp, the
 * lantern's brightness, set each frame by navLights.ts on the boat-lights clock).
 */
export function cabinInteriorMaterial(): THREE.MeshBasicMaterial & { uniforms: { uDay: { value: number }; uLamp: { value: number }; uLampAt: { value: THREE.Vector3 }; uLampUp: { value: THREE.Vector3 } } } {
  const uniforms = { uDay: { value: 0.3 }, uLamp: { value: 0 }, uLampAt: { value: LANTERN.clone() }, uLampUp: { value: new THREE.Vector3(0, 1, 0) } };
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }) as THREE.MeshBasicMaterial & { uniforms: typeof uniforms };
  m.uniforms = uniforms;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute float aLamp;\nattribute float aDay;\nattribute vec3 aN;\nattribute float aLit;\nvarying float vLamp;\nvarying float vDay;\nvarying vec3 vP;\nvarying vec3 vN;\nvarying float vLit;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aLamp; vDay = aDay; vP = position; vN = aN; vLit = aLit;');
    sh.fragmentShader = 'uniform float uDay;\nuniform float uLamp;\nuniform vec3 uLampAt;\nuniform vec3 uLampUp;\nvarying float vLamp;\nvarying float vDay;\nvarying vec3 vP;\nvarying vec3 vN;\nvarying float vLit;\n' + sh.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.indirectDiffuse;',
      // The lantern's light where it hangs now (it swings, so this is worked out here, not baked): falling off with the
      // square of the distance and with the angle the surface turns from it, plus the light bounced round the pale lining.
      // Its brass top hides the glass from straight above and its font from below (each about 0.045 m across 0.05 m from
      // the glass's middle, so within about 42° of the lamp's own up or down, softened by the glass's height): a dark
      // patch on the deckhead over it and a dimmer one on the sole, both sliding as it swings.
      `vec3 toL = uLampAt - vP; float dL = length(toL); toL /= max(dL, 1e-4);
      float cU = -dot(toL, uLampUp), hide = 1.0 - smoothstep(0.62, 0.82, cU) - 0.35 * smoothstep(0.62, 0.82, -cU);
      float lampHere = vLamp + vLit * (max(0.0, dot(normalize(vN + 1e-6), toL)) * hide / (1.0 + (dL / 0.7) * (dL / 0.7)) + 0.12);
      // a lamp's warm light (about 2700 K) on the cabin's colours, and the dim day
      vec3 outgoingLight = reflectedLight.indirectDiffuse * (uDay * vDay + uLamp * lampHere * vec3(1.5, 1.1, 0.7));`);
  };
  m.customProgramCacheKey = () => 'cabinInterior';
  return m;
}
