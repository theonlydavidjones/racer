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
 * The berths run the cabin's length, 1.85 m (CR 3.15: at least 1.80 m); the companionway's steps go down to the sole.
 *
 * It's one inward-facing shell just inside the hull, deck and cabin trunk, seen only through the companionway and the
 * windows. Its light is one lantern hanging in the middle of the cabin: worked out at each vertex as falling off with
 * the square of the distance and with the angle the surface turns from it, plus the light bounced round the cabin's
 * pale lining (taken as an even share). By day it's lit only by what comes in through the openings, dimly.
 */

const zAt = (u: number) => -L / 2 + u * L;
const uAt = (z: number) => (z + L / 2) / L;
/** The plan's heights (m, from the waterline) and half-widths. */
export const INTERIOR = { sole: -0.28, soleHalf: 0.35, berth: -0.02, berthIn: 0.28, berthFoot: 0.36 };
/** The lantern: hanging from the cabin top's centreline halfway along the cabin, about 0.3 m down. */
export const LANTERN = new THREE.Vector3(0, 0, 0);
{ const um = (CABIN.u0 + 0.06 + CABIN.u1) / 2; LANTERN.set(0, cabinTopAt(um, 0) - 0.3, zAt(um)); }

const INSET = 0.025; // how far inside the outer surfaces the lining lies (m)
const LINING = new THREE.Color(0xe2d9c6), WOOD = new THREE.Color(0x8a5a36);

/** The cross-section of the cabin's inside at station u, starboard half, from the sole's middle round to the cabin top's. */
function section(u: number): { x: number; y: number; wood: boolean; win?: boolean }[] {
  const { sole, soleHalf, berth, berthIn, berthFoot } = INTERIOR;
  const hull = (y: number) => Math.min(hullInnerHalf(u, y), halfBeam(u)) - INSET;
  const ch = cabinHalf(u) - INSET, dS = deckY(u, cabinHalf(u)), top = cabinTopY(u);
  const pts: { x: number; y: number; wood: boolean; win?: boolean }[] = [
    { x: 0, y: sole, wood: true }, { x: Math.min(soleHalf, hull(sole) - 0.01), y: sole, wood: true },
    { x: Math.min(berthFoot, hull(sole)), y: sole, wood: true }, // the berth's front board, up to its top edge
    { x: berthIn, y: berth, wood: true }, { x: hull(berth), y: berth, wood: true }, // the berth top, out to the hull
  ];
  const sheerY = deckY(u, halfBeam(u)) - INSET;
  for (let k = 1; k <= 4; k++) { const y = berth + (sheerY - berth) * k / 4; pts.push({ x: hull(y), y, wood: false }); } // the lining
  pts.push({ x: ch + 0.01, y: dS - INSET, wood: false }); // under the side deck, in to the cabin side
  // the cabin side, up past the window to the top's edge (the window's band marked, for the opening)
  for (const h of [0, WINDOW.h0, WINDOW.h1, CABIN.h]) pts.push({ x: ch - CABIN_LEAN * h / CABIN.h, y: dS + h - (h === CABIN.h ? INSET : 0), wood: false, win: h === WINDOW.h0 });
  const w = ch - CABIN_LEAN;
  for (let k = 1; k <= 5; k++) { const x = w * (1 - k / 5); pts.push({ x, y: cabinTopAt(u, x) - INSET, wood: false }); }
  // keep every point within the cabin's own height (the arch at the rounded front, where the trunk narrows)
  for (const q of pts) q.y = Math.min(q.y, top + CABIN.crown - INSET);
  return pts;
}

/** The light the lantern gives a point with (unit) normal n: falling off with distance and angle, plus bounce. */
function lampAt(p: THREE.Vector3, n: THREE.Vector3): number {
  const l = LANTERN.clone().sub(p), d = l.length(); l.divideScalar(d || 1);
  return Math.max(0, n.dot(l)) / (1 + (d / 0.7) ** 2) + 0.12;
}

/** The shell: positions, the lining's or the woodwork's colour, and the lantern's light, per vertex. */
export function cabinInteriorGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], lamp: number[] = [];
  const centre = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, open = 1) => {
    // the face's normal, turned to look into the cabin (toward its middle line)
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    centre.set(0, (INTERIOR.sole + cabinTopY(uAt(a.z)) + CABIN.crown) / 2, a.z);
    if (n.dot(centre.clone().sub(a)) < 0) { n.negate(); [b, c] = [c, b]; [cb, cc] = [cc, cb]; }
    for (const [p, cl] of [[a, ca], [b, cb], [c, cc]] as const) { pos.push(p.x, p.y, p.z); col.push(cl.r, cl.g, cl.b); lamp.push(lampAt(p, n) * open); }
  };
  // stations from the main bulkhead forward to where the trunk's rounded front begins, and the windows' ends
  const uA = CABIN.u1 - 0.002, uF = CABIN.u0 + 0.06, NS = 16;
  const us = [...Array.from({ length: NS + 1 }, (_, i) => uF + (uA - uF) * i / NS), WINDOW.hole0, WINDOW.hole1].sort((a, b) => a - b);
  const secs = us.map(u => section(u));
  for (const side of [1, -1]) for (let i = 0; i < us.length - 1; i++) {
    const A = secs[i], B = secs[i + 1], za = zAt(us[i]), zb = zAt(us[i + 1]), um = (us[i] + us[i + 1]) / 2;
    for (let j = 0; j < A.length - 1; j++) {
      if (A[j].win && um > WINDOW.hole0 && um < WINDOW.hole1) continue; // the window's opening
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
  const zF = zAt(uF), fy0 = INTERIOR.berth + 0.04, fy1 = Math.min(deckY(uF, 0), cabinTopY(uF)) - 0.06, fw = 0.24;
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
  // the lantern itself, hanging from the cabin top on a short chain: a small brass lamp, its glass bright when lit
  { const v = (x: number, y: number, z: number) => new THREE.Vector3(LANTERN.x + x, LANTERN.y + y, LANTERN.z + z), N = 8, r = 0.045, BRASS = new THREE.Color(0xb08a4a), GLOW = new THREE.Color(1, 0.95, 0.85);
    for (let k = 0; k < N; k++) {
      const a0 = 2 * Math.PI * k / N, a1 = 2 * Math.PI * (k + 1) / N, c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
      const glass = [v(c0, -0.05, s0), v(c1, -0.05, s1), v(c1, 0.05, s1), v(c0, 0.05, s0)];
      for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) { pos.push(glass[a].x, glass[a].y, glass[a].z, glass[b].x, glass[b].y, glass[b].z, glass[c].x, glass[c].y, glass[c].z); for (let q = 0; q < 3; q++) { col.push(GLOW.r, GLOW.g, GLOW.b); lamp.push(2.5); } }
      for (const y of [0.05, -0.05]) { const cap3 = [v(0, y + (y > 0 ? 0.03 : -0.02), 0), v(c0, y, s0), v(c1, y, s1)]; for (const p of cap3) { pos.push(p.x, p.y, p.z); col.push(BRASS.r, BRASS.g, BRASS.b); lamp.push(0.4); } }
    }
    const top = cabinTopAt(uAt(LANTERN.z), 0) - INSET; // the chain
    for (const p of [v(-0.004, 0.08, 0), v(0.004, 0.08, 0), new THREE.Vector3(LANTERN.x, top, LANTERN.z)]) { pos.push(p.x, p.y, p.z); col.push(BRASS.r, BRASS.g, BRASS.b); lamp.push(0.3); } }
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
  // the companionway's steps, from the sill down to the sole: three treads, each its top and its face
  { const { hw, sill } = COMPANIONWAY, z1 = zAt(CABIN.u1), x = hw - 0.04;
    for (let k = 1; k <= 3; k++) {
      const y = INTERIOR.sole + (sill - INTERIOR.sole) * k / 4, zc = z1 - 0.5 * (0.15 + 0.2 * k), z0 = zc - 0.1, zb = zc + 0.1;
      const v = (xx: number, yy: number, zz: number) => new THREE.Vector3(xx, yy, zz);
      tri(v(-x, y, z0), v(x, y, z0), v(x, y, zb), WOOD, WOOD, WOOD); tri(v(-x, y, z0), v(x, y, zb), v(-x, y, zb), WOOD, WOOD, WOOD);
      tri(v(-x, y - 0.03, zb), v(x, y - 0.03, zb), v(x, y, zb), WOOD, WOOD, WOOD); tri(v(-x, y - 0.03, zb), v(x, y, zb), v(-x, y, zb), WOOD, WOOD, WOOD);
    } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aLamp', new THREE.Float32BufferAttribute(lamp, 1));
  return g;
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
export function cabinInteriorMaterial(): THREE.MeshBasicMaterial & { uniforms: { uDay: { value: number }; uLamp: { value: number } } } {
  const uniforms = { uDay: { value: 0.3 }, uLamp: { value: 0 } };
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }) as THREE.MeshBasicMaterial & { uniforms: typeof uniforms };
  m.uniforms = uniforms;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute float aLamp;\nvarying float vLamp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aLamp;');
    sh.fragmentShader = 'uniform float uDay;\nuniform float uLamp;\nvarying float vLamp;\n' + sh.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.indirectDiffuse;',
      // a lamp's warm light (about 2700 K) on the cabin's colours, and the dim day
      'vec3 outgoingLight = reflectedLight.indirectDiffuse * (uDay + uLamp * vLamp * vec3(1.5, 1.1, 0.7));');
  };
  m.customProgramCacheKey = () => 'cabinInterior';
  return m;
}
