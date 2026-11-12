import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { D2R, type Vec } from '../core/math';
import { LL } from '../geo/geo';
import { P3 } from './coords';

/**
 * The Bay's wildlife, in the numbers you'd see from a boat (visual only: none of it touches the sailing).
 *
 * - **Harbor porpoises** came back to the Bay around 2008 and feed in the tidal flow by the Golden Gate, along the
 *   Marin side (Lime Point, Horseshoe Bay, Yellow Bluff) and in Raccoon Strait: pairs and small groups. Shy: a few
 *   quick rolls showing a small dark triangular fin, then a dive of a minute or two. They keep away from boats.
 * - **Harbor seals:** a mottled head at the surface near the shores and Alcatraz ("bottling": the head and a little
 *   of the neck straight up, eyes just clear), watching you; it sinks out of sight, without a splash, when you come close.
 * - **California sea lions:** the colony on the floats at Pier 39 (K-dock), most in spring and in autumn, fewest in
 *   June and July when the males are away at the breeding rookeries in the Channel Islands; and a few swimming off the
 *   Wharf, porpoising now and then (low leaps clear of the water).
 * - **Birds:** western gulls overhead and sitting on the water (they lift off as you sail up); lines of brown pelicans
 *   gliding just above the waves, plunging now and then (summer to late autumn, after they've bred in the south);
 *   double-crested cormorants flying fast and low, beating all the way.
 *
 * Sizes and colours: Wikipedia's species pages (California sea lion, Harbor seal, Harbour porpoise, Brown pelican,
 * Western gull, Double-crested cormorant), November 2026; flight and diving manners from the field guides, as typical
 * figures (wingbeat rates in particular are estimates). Each animal is one lofted body, its sections drawn along a
 * curved spine so the head, neck and body run into one another, coloured by vertex; a bird's wings are four panels (arm
 * and hand, each side) with their own upper and under colours.
 */

const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const C = (h: number) => new THREE.Color(h);
const VC = new THREE.MeshLambertMaterial({ vertexColors: true });

/* ---------- shapes ---------- */

/** A section of a lofted body: its centre on the spine (y up, z back), half-width w and half-height h. */
interface Station { y: number; z: number; w: number; h: number; x?: number }
/**
 * A body lofted through its stations (head first): elliptical sections at right angles to the spine, which may bend
 * up and down (a sea lion's neck, a cormorant's kinked neck), capped at both ends. `paint(i, a)`: the colour at
 * station i, angle a round the section (0 = right side, π/2 = top).
 */
function loft(st: Station[], sides: number, paint: (i: number, a: number, s: Station) => THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const n = st.length;
  for (let i = 0; i < n; i++) {
    const a0 = st[Math.max(0, i - 1)], a1 = st[Math.min(n - 1, i + 1)], ty = a1.y - a0.y, tz = a1.z - a0.z, tl = Math.hypot(ty, tz) || 1;
    const ny = tz / tl, nz = -ty / tl; // (the section's "up", at right angles to the spine in its own plane)
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), S = st[i];
      pos.push((S.x ?? 0) + S.w * c, S.y + ny * S.h * s, S.z + nz * S.h * s);
      const k3 = paint(i, a, S); col.push(k3.r, k3.g, k3.b);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + (k + 1) % sides, c = a + sides, d = b + sides;
    idx.push(a, c, b, b, c, d);
  }
  // the end caps, to a point a little beyond each end section
  for (const [i, dir] of [[0, -1], [n - 1, 1]] as const) {
    const S = st[i], O = st[i - dir] ?? S, ty = S.y - O.y, tz = S.z - O.z, tl = Math.hypot(ty, tz) || 1, e = Math.min(S.w, S.h) * 0.6;
    const ci = pos.length / 3; pos.push(S.x ?? 0, S.y + ty / tl * e, S.z + tz / tl * e);
    const k3 = paint(i, Math.PI / 2, S); col.push(k3.r, k3.g, k3.b);
    for (let k = 0; k < sides; k++) { const a = i * sides + k, b = i * sides + (k + 1) % sides; if (dir < 0) idx.push(ci, b, a); else idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** A flat shape (a flipper, a fin, a fluke) as a thin double-faced plate, its outline in (x, z) at height y, one colour. */
function plate(outline: [number, number][], y: number, color: THREE.Color, t = 0.008): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [], n = outline.length;
  for (const dy of [t / 2, -t / 2]) for (const [x, z] of outline) { pos.push(x, y + dy, z); col.push(color.r, color.g, color.b); }
  for (let k = 1; k < n - 1; k++) { idx.push(0, k + 1, k); idx.push(n, n + k, n + k + 1); } // (a fan: the outlines are convex enough)
  for (let k = 0; k < n; k++) { const a = k, b = (k + 1) % n; idx.push(a, b, n + a, b, n + b, n + a); } // (the edge)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** A small ball (an eye), coloured. */
function ball(r: number, x: number, y: number, z: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 6, 4); g.deleteAttribute('uv'); g.translate(x, y, z);
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [color.r, color.g, color.b]).flat(), 3));
  return g;
}
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs, false)!;

/* ---------- porpoises ---------- */

interface Porpoise { g: THREE.Group; home: Vec; p: Vec; h: number; t: number; rolls: number; dive: number; off: Vec }
const POD_ZONES: [number, number, number][] = [[37.8285, -122.4745, 350], [37.8320, -122.4640, 400], [37.8395, -122.4650, 350], [37.8655, -122.4420, 300], [37.8170, -122.4760, 300]];

/**
 * A harbor porpoise, 1.5 m: small and stocky, a blunt rounded head with no beak, greatest girth just ahead of the
 * fin; the fin low and triangular (about 13 cm), a little behind the middle; small flippers; the tail stock flattened
 * side to side before the flukes. Dark grey back, the flanks paler grey, the belly white, a dark stripe from the chin
 * to the flipper. Head toward −z.
 */
function porpoiseMesh(): THREE.Group {
  const back = C(0x3f444a), flank = C(0x8a9196), belly = C(0xe1e3e1), stripe = C(0x4a4f55);
  const st: Station[] = [
    { y: 0, z: -0.75, w: 0.04, h: 0.045 }, { y: 0.0, z: -0.70, w: 0.10, h: 0.10 }, { y: 0.01, z: -0.58, w: 0.17, h: 0.16 },
    { y: 0.01, z: -0.38, w: 0.22, h: 0.20 }, { y: 0.01, z: -0.12, w: 0.235, h: 0.215 }, { y: 0.01, z: 0.14, w: 0.20, h: 0.18 },
    { y: 0.02, z: 0.36, w: 0.12, h: 0.12 }, { y: 0.03, z: 0.54, w: 0.05, h: 0.075 }, { y: 0.03, z: 0.66, w: 0.03, h: 0.045 }
  ];
  const body = loft(st, 12, (i, a) => {
    const up = Math.sin(a);
    if (up > 0.35) return back;
    if (up < -0.55) return belly;
    if (i <= 2 && up < 0 && up > -0.5) return stripe; // (the chin-to-flipper stripe)
    return flank.clone().lerp(back, Math.max(0, up) / 0.35 * 0.6);
  });
  // the fin: a low triangle standing on the back, swept back a little
  const fg = new THREE.BufferGeometry(), fp = [0, 0.2, -0.16, 0, 0.36, 0.04, 0, 0.2, 0.16], fc = Array(9).fill(0).map((_, i) => [back.r, back.g, back.b][i % 3]);
  fg.setAttribute('position', new THREE.Float32BufferAttribute([...fp, ...fp.map((v, i) => i % 3 === 0 ? v + 0.012 : v)], 3));
  fg.setAttribute('color', new THREE.Float32BufferAttribute([...fc, ...fc], 3)); fg.setIndex([0, 1, 2, 3, 5, 4, 0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 2, 5, 0, 0, 5, 3]); fg.translate(-0.006, 0, 0); fg.computeVertexNormals();
  const flukes = plate([[0, 0.64], [0.24, 0.8], [0.2, 0.86], [0, 0.78], [-0.2, 0.86], [-0.24, 0.8]], 0.03, back, 0.012);
  const flippers = [-1, 1].map(sx => { const g = plate([[0, -0.42], [sx * 0.2, -0.3], [sx * 0.2, -0.24], [0, -0.32]], -0.1, back, 0.012); g.rotateZ(sx * -0.5); return g; });
  const g = new THREE.Group(); g.add(new THREE.Mesh(merge([body, fg, flukes, ...flippers]), VC));
  return g;
}

/* ---------- harbor seals ---------- */

interface Seal { g: THREE.Group; p: Vec; up: number; down: number; t: number }
const SEAL_SPOTS: [number, number][] = [[37.8085, -122.4515], [37.8105, -122.4330], [37.8250, -122.4185], [37.8290, -122.4255], [37.8135, -122.3655], [37.8570, -122.4795], [37.8285, -122.4720]];

/**
 * A harbor seal at the surface, "bottling": the head and a little of the neck held up out of the water, the nose tipped
 * up. A round head with no ear flaps, a short dog-like muzzle with V-set nostrils, big dark eyes; silver-grey or
 * darker, densely spotted (some Bay seals are rusty). Faces −z.
 */
function sealHead(r: () => number): THREE.Group {
  const base = C([0x9a9a94, 0x7c7870, 0x8a8178, 0xa0643c][Math.floor(r() * 3.25)]), spot = C(0x3b3a37), pale = base.clone().lerp(C(0xd8d4cc), 0.35);
  // the neck rising from the water to the head, the muzzle forward (−z)
  const st: Station[] = [
    { y: -0.32, z: 0.05, w: 0.15, h: 0.15 }, { y: -0.12, z: 0.03, w: 0.13, h: 0.13 }, { y: 0.03, z: 0.0, w: 0.115, h: 0.12 },
    { y: 0.1, z: -0.06, w: 0.11, h: 0.1 }, { y: 0.11, z: -0.13, w: 0.08, h: 0.075 }, { y: 0.09, z: -0.19, w: 0.05, h: 0.045 }, { y: 0.075, z: -0.22, w: 0.03, h: 0.028 }
  ];
  const spots = Array.from({ length: 40 }, () => [r() * (st.length - 2), r() * Math.PI * 2] as [number, number]);
  const g0 = loft(st, 14, (i, a) => {
    if (i >= 6) return C(0x2e2a26); // (the dark nose at the muzzle's tip)
    const near = spots.some(([si, sa]) => Math.abs(si - i) < 0.6 && Math.abs(((a - sa + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.4);
    return near ? spot : Math.sin(a) < -0.6 && i >= 2 ? pale : base;
  });
  const eyes = [-1, 1].map(sx => ball(0.013, sx * 0.072, 0.13, -0.115, C(0x0b0b0b)));
  const g = new THREE.Group(), tilt = new THREE.Group(); g.add(tilt); g.userData.tilt = tilt;
  tilt.add(new THREE.Mesh(merge([g0, ...eyes]), VC));
  return g;
}

/* ---------- sea lions ---------- */

/**
 * A California sea lion, about 2.1 m (a female; a bull 2.5 m and far bulkier): a dog-like head with a long pointed
 * snout and small ear flaps, a long neck, the body carried on long foreflippers, the hind flippers turned forward
 * under it on land. Lying (sprawled flat, the head down or resting) or sitting up (propped on the foreflippers, the
 * neck craned and the nose up). Females and young tawny brown (dry: paler, almost silver), bulls dark brown to near
 * black with a pale crest on the forehead. Vertex colours carry the pattern (flippers darker, crest paler); each
 * animal's coat is its instance colour.
 */
function seaLionGeo(sitting: boolean, bull: boolean, swimming = false): THREE.BufferGeometry {
  const k = bull ? 1.2 : 1, fat = bull ? 1.25 : 1, coat = C(0xffffff), flip = C(0x8a8a8a), crest = C(0xffffff).multiplyScalar(bull ? 2.4 : 1);
  const st: Station[] = swimming ? [
    // swimming at the surface: the head held up clear of the water, the back just awash, the hips and tail below
    { y: 0.42, z: -0.86, w: 0.035, h: 0.035 }, { y: 0.43, z: -0.78, w: 0.07, h: 0.06 }, { y: 0.42, z: -0.68, w: 0.1, h: 0.1 },
    { y: 0.3, z: -0.6, w: 0.11, h: 0.11 }, { y: 0.12, z: -0.5, w: 0.15, h: 0.14 }, { y: -0.02, z: -0.3, w: 0.22, h: 0.18 },
    { y: -0.04, z: -0.02, w: 0.25, h: 0.2 }, { y: -0.1, z: 0.3, w: 0.22, h: 0.17 }, { y: -0.16, z: 0.6, w: 0.14, h: 0.11 },
    { y: -0.21, z: 0.82, w: 0.08, h: 0.065 }, { y: -0.24, z: 0.94, w: 0.04, h: 0.035 }
  ] : sitting ? [
    // nose up, the neck nearly upright, the chest raised on the foreflippers, the hips on the float
    { y: 1.0, z: -0.55, w: 0.035, h: 0.035 }, { y: 0.96, z: -0.46, w: 0.07, h: 0.06 }, { y: 0.92, z: -0.36, w: 0.1, h: 0.1 },
    { y: 0.80, z: -0.30, w: 0.11, h: 0.11 }, { y: 0.62, z: -0.26, w: 0.15, h: 0.15 }, { y: 0.44, z: -0.18, w: 0.21, h: 0.2 },
    { y: 0.3, z: 0.02, w: 0.25, h: 0.22 }, { y: 0.22, z: 0.32, w: 0.22, h: 0.18 }, { y: 0.17, z: 0.62, w: 0.15, h: 0.12 },
    { y: 0.13, z: 0.86, w: 0.08, h: 0.07 }, { y: 0.11, z: 1.0, w: 0.04, h: 0.04 }
  ] : [
    // sprawled: the head forward and low, the body flat on the float
    { y: 0.16, z: -1.1, w: 0.035, h: 0.035 }, { y: 0.18, z: -1.02, w: 0.07, h: 0.06 }, { y: 0.21, z: -0.92, w: 0.1, h: 0.1 },
    { y: 0.21, z: -0.8, w: 0.11, h: 0.11 }, { y: 0.21, z: -0.62, w: 0.15, h: 0.14 }, { y: 0.21, z: -0.38, w: 0.22, h: 0.18 },
    { y: 0.2, z: -0.08, w: 0.26, h: 0.2 }, { y: 0.18, z: 0.25, w: 0.23, h: 0.17 }, { y: 0.15, z: 0.55, w: 0.15, h: 0.11 },
    { y: 0.12, z: 0.78, w: 0.08, h: 0.065 }, { y: 0.1, z: 0.9, w: 0.04, h: 0.035 }
  ];
  for (const s of st) { s.w *= k * (s.w > 0.12 ? fat : 1); s.h *= k * (s.h > 0.12 ? fat : 1); s.y *= k; s.z *= k; }
  // (a bull's crest: the forehead swells, pale)
  if (bull) { st[2].h *= 1.35; st[3].h *= 1.25; }
  const body = loft(st, 12, (i, a) => (bull && (i === 2 || i === 3) && Math.sin(a) > 0.2 ? crest : i === 0 ? C(0x555555) : coat));
  // (the eyes on the head between the snout and the crown; the small ear flaps just behind them)
  const mid = (a: Station, b: Station, f: number) => ({ y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
  const ey = mid(st[1], st[2], 0.6), ea = mid(st[2], st[3], 0.6);
  const ears = [-1, 1].map(sx => ball(0.012 * k, sx * 0.08 * k, ea.y + 0.05 * k, ea.z, C(0xb0b0b0)));
  const eyes = [-1, 1].map(sx => ball(0.012 * k, sx * 0.07 * k, ey.y + 0.03 * k, ey.z, C(0x181818)));
  // the foreflippers: long paddles out from the chest, flat on the float (sitting: planted ahead, the body on them)
  const chest = st[5];
  const fore = [-1, 1].map(sx => {
    // (a quarter of the body's length; swimming, laid back along the flanks)
    const g = plate([[0, 0], [sx * 0.34, 0.14], [sx * 0.38, 0.24], [sx * 0.06, 0.14]].map(([x, z]) => [x * k, z * k] as [number, number]), 0.02, flip, 0.02);
    g.rotateY(sx * (swimming ? -1.4 : sitting ? 0.4 : -0.55)); g.translate(sx * chest.w * (swimming ? 0.5 : 0.8), swimming ? chest.y - chest.h * 1.1 : 0, chest.z + (sitting ? -0.05 : 0.05)); // (swimming: laid back under the flanks)
    return g;
  });
  // the hind flippers: two broad lobes at the tail, turned forward under the body
  const tail = st[st.length - 1];
  const hind = [-1, 1].map(sx => { const g = plate([[0, 0], [sx * 0.2, -0.05], [sx * 0.28, 0.18], [sx * 0.08, 0.12]].map(([x, z]) => [x * k, z * k] as [number, number]), 0.02, flip, 0.02); g.translate(sx * 0.04, 0, tail.z - 0.12 * k); return g; });
  return merge([body, ...ears, ...eyes, ...fore, ...hind]);
}
/** The coats: females and young tawny brown, some dry and pale, some wet and dark; bulls dark brown. */
const COATS = { cow: [0x8a6a4a, 0x9a7d5c, 0x6e5238, 0xa8977f, 0x4a3828], bull: [0x3a2c22, 0x2b211b, 0x45352a] };
const PIER39 = LL(37.80945, -122.41145); // the floats on the west side of Pier 39 (K-dock)
/**
 * How many sea lions are drawn on the Pier 39 floats, by month. The colony's own counts run to hundreds (900–1,000 in
 * late April 2024; a record 1,701 in November 2009: press reports of Pier 39's figures, which publishes no monthly
 * table): most from March to May and from August to November, fewest in June and July when the males are at the
 * breeding rookeries. The shape is theirs; the numbers drawn are what the floats here hold.
 */
const PIER39_COUNT = [70, 75, 95, 110, 100, 35, 25, 60, 90, 105, 110, 85];
const FLOATS = 12, PER_FLOAT = 10;

/* ---------- birds ---------- */

type BirdKind = 'gull' | 'pelican' | 'cormorant';
/** A wing: the arm (shoulder to wrist) and the hand (wrist to tip), each hinged so the wing flexes as it beats. */
interface Wing { arm: THREE.Object3D; hand: THREE.Object3D }
interface Bird {
  kind: BirdKind; g: THREE.Group; wings: [Wing, Wing]; p: THREE.Vector3; v: THREE.Vector3; flap: number; sit: boolean;
  dive: number; t: number; bank: number; glide: number; neck?: THREE.Object3D;
}
/**
 * Sizes, colours, cruising speed (m/s) and wingbeat (Hz). Western gull: 55–68 cm long, wingspan 1.30–1.44 m; white
 * with a dark slate-grey back and wings, black wingtips with small white spots, a white trailing edge, a big yellow
 * bill with a red spot, pink legs; flaps easily (about 2.5 Hz), glides and soars a lot, 8–12 m/s. Brown pelican: 1.0–1.5
 * m long, wingspan 2.0–2.3 m; grey-brown, the upper wing silvery, the flight feathers dark, the head and neck white
 * (non-breeding, as most are on the Bay in late summer and autumn) with a yellowish crown; the head drawn back on the
 * shoulders, the bill resting on the neck; three to five slow beats (about 1.7 Hz) then a long glide, in lines, just
 * above the waves. Double-crested cormorant: 70–90 cm long, wingspan 1.14–1.23 m; black, an orange-yellow face and
 * throat, a hooked bill tilted up, the neck stretched out with a slight crook; fast steady beats (about 4 Hz), low and
 * straight. (Wikipedia's species pages for the sizes and colours; the wingbeats and speeds are typical figures.)
 */
const BIRD = {
  gull: { speed: 10, hz: 2.5, span: 1.37 },
  pelican: { speed: 11, hz: 1.7, span: 2.15 },
  cormorant: { speed: 15, hz: 4, span: 1.2 }
};
/** One wing panel, arm or hand: a grid along the span, cambered over the chord, with its own upper and under colours. */
function wingPanel(sx: number, len: number, le: (u: number) => number, te: (u: number) => number, top: (u: number, v: number) => THREE.Color, under: (u: number, v: number) => THREE.Color, camber: number): THREE.BufferGeometry {
  const N = 6, M = 4, pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (const [face, f] of [[0, top], [1, under]] as const) for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
    const u = i / N, v = j / M, z = le(u) + (te(u) - le(u)) * v, c = te(u) - le(u);
    pos.push(sx * u * len, camber * c * 4 * v * (1 - v) + (face ? -0.003 : 0.003), z);
    const k = f(u, v); col.push(k.r, k.g, k.b);
  }
  const W = M + 1, F = (N + 1) * W;
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * W + j, b = a + W, c = a + 1, d = b + 1;
    // (top faces up, under faces down, whichever side the wing is on)
    if (sx > 0) { idx.push(a, c, b, b, c, d); idx.push(F + a, F + b, F + c, F + b, F + d, F + c); }
    else { idx.push(a, b, c, b, d, c); idx.push(F + a, F + c, F + b, F + b, F + c, F + d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function birdMesh(kind: BirdKind): { g: THREE.Group; wings: [Wing, Wing]; neck?: THREE.Object3D } {
  const g = new THREE.Group(), parts: THREE.BufferGeometry[] = [];
  let neck: THREE.Object3D | undefined, shoulder = { x: 0.06, y: 0.03, z: -0.06 }, arm = 0.26, hand = 0.34;
  let wingTop: (u: number, v: number, isHand: boolean) => THREE.Color, wingUnder: (u: number, v: number, isHand: boolean) => THREE.Color;
  let armLe = (_u: number) => -0.07, armTe = (u: number) => 0.13 - 0.02 * u, handLe = (u: number) => -0.07 + 0.08 * u * u, handTe = (u: number) => 0.11 - 0.12 * u;
  if (kind === 'gull') {
    const white = C(0xf5f5f2), mantle = C(0x5b6670), bill = C(0xe9c23a), red = C(0xc8352a), black = C(0x16171a);
    const st: Station[] = [
      { y: 0.035, z: -0.345, w: 0.006, h: 0.008 }, { y: 0.035, z: -0.32, w: 0.011, h: 0.014 }, { y: 0.038, z: -0.295, w: 0.015, h: 0.02 },
      { y: 0.045, z: -0.27, w: 0.034, h: 0.036 }, { y: 0.047, z: -0.235, w: 0.045, h: 0.044 }, { y: 0.035, z: -0.2, w: 0.042, h: 0.042 },
      { y: 0.012, z: -0.155, w: 0.05, h: 0.052 }, { y: 0.0, z: -0.09, w: 0.07, h: 0.068 }, { y: 0.0, z: -0.01, w: 0.075, h: 0.07 },
      { y: 0.006, z: 0.07, w: 0.062, h: 0.056 }, { y: 0.014, z: 0.14, w: 0.042, h: 0.035 }, { y: 0.018, z: 0.2, w: 0.05, h: 0.012 }, { y: 0.018, z: 0.25, w: 0.055, h: 0.007 }
    ];
    parts.push(loft(st, 10, (i, a) => i <= 2 ? (i === 1 && Math.sin(a) < -0.3 ? red : bill) : Math.sin(a) > 0.4 && i >= 6 && i <= 10 ? mantle : white));
    parts.push(...[-1, 1].map(sx => ball(0.008, sx * 0.03, 0.06, -0.255, C(0x111111))));
    wingTop = (u, v, h) => h && u > 0.52 ? (u > 0.9 && v > 0.25 && v < 0.6 ? white : black) : v > 0.82 ? white : mantle;
    wingUnder = (u, v, h) => h && u > 0.62 ? black : v > 0.7 ? C(0xd8dcdf) : white;
  } else if (kind === 'pelican') {
    const body = C(0x6d6657), silver = C(0x9a948a), white = C(0xf2eee6), crown = C(0xe8d48a), billC = C(0xb8986e), pouch = C(0x5c5444), dark = C(0x2a2622);
    shoulder = { x: 0.12, y: 0.06, z: -0.12 }; arm = 0.42; hand = 0.52;
    armLe = u => -0.1 + 0.01 * u; armTe = u => 0.24 - 0.02 * u; handLe = u => -0.09 + 0.03 * u * u; handTe = u => 0.22 - 0.1 * u * u; // (broad, blunt tips: the pelican's fingered primaries)
    // the body; the neck drawn back in an S, the head resting on the shoulders
    const st: Station[] = [
      { y: 0.14, z: -0.46, w: 0.03, h: 0.035 }, { y: 0.16, z: -0.42, w: 0.055, h: 0.06 }, { y: 0.16, z: -0.36, w: 0.06, h: 0.065 },
      { y: 0.12, z: -0.32, w: 0.08, h: 0.08 }, { y: 0.06, z: -0.27, w: 0.12, h: 0.11 }, { y: 0.0, z: -0.15, w: 0.165, h: 0.15 },
      { y: 0.0, z: 0.05, w: 0.175, h: 0.15 }, { y: 0.02, z: 0.24, w: 0.125, h: 0.1 }, { y: 0.04, z: 0.38, w: 0.075, h: 0.05 },
      { y: 0.05, z: 0.47, w: 0.08, h: 0.016 }, { y: 0.05, z: 0.53, w: 0.07, h: 0.01 }
    ];
    parts.push(loft(st, 12, (i, a) => i <= 2 ? (Math.sin(a) > 0.5 && i >= 1 ? crown : white) : i === 3 ? white : i >= 8 ? dark : Math.sin(a) > 0.35 ? silver : body));
    // the long bill lying forward along the neck, the pouch slung under it
    const bl: Station[] = [{ y: 0.15, z: -0.45, w: 0.03, h: 0.016 }, { y: 0.13, z: -0.6, w: 0.026, h: 0.013 }, { y: 0.1, z: -0.74, w: 0.02, h: 0.01 }, { y: 0.085, z: -0.79, w: 0.012, h: 0.009 }];
    parts.push(loft(bl, 6, () => billC));
    const pc: Station[] = [{ y: 0.11, z: -0.44, w: 0.035, h: 0.035 }, { y: 0.09, z: -0.56, w: 0.03, h: 0.04 }, { y: 0.085, z: -0.68, w: 0.02, h: 0.02 }];
    parts.push(loft(pc, 6, () => pouch));
    parts.push(...[-1, 1].map(sx => ball(0.01, sx * 0.05, 0.18, -0.4, C(0x111111))));
    wingTop = (u, v, h) => h ? (u > 0.25 || v > 0.55 ? dark : silver) : v > 0.62 ? dark : silver;
    wingUnder = (_u, v, h) => h ? dark : v > 0.6 ? dark : body;
  } else {
    const black = C(0x1b1c1f), sheen = C(0x2c3034), face = C(0xe39a32), bill = C(0x3a3a36);
    shoulder = { x: 0.06, y: 0.03, z: -0.1 }; arm = 0.22; hand = 0.3;
    armLe = () => -0.06; armTe = () => 0.12; handLe = u => -0.06 + 0.04 * u * u; handTe = u => 0.12 - 0.1 * u * u;
    // a slender body; the neck stretched out ahead with a slight crook, the bill tilted up; a long tail
    const st: Station[] = [
      { y: 0.07, z: -0.53, w: 0.006, h: 0.007 }, { y: 0.06, z: -0.5, w: 0.01, h: 0.012 }, { y: 0.05, z: -0.46, w: 0.022, h: 0.026 },
      { y: 0.045, z: -0.42, w: 0.03, h: 0.03 }, { y: 0.03, z: -0.36, w: 0.025, h: 0.028 }, { y: 0.03, z: -0.28, w: 0.028, h: 0.03 },
      { y: 0.02, z: -0.2, w: 0.04, h: 0.042 }, { y: 0.0, z: -0.12, w: 0.065, h: 0.06 }, { y: 0.0, z: 0.0, w: 0.07, h: 0.063 },
      { y: 0.01, z: 0.12, w: 0.05, h: 0.042 }, { y: 0.02, z: 0.2, w: 0.04, h: 0.014 }, { y: 0.025, z: 0.32, w: 0.045, h: 0.008 }
    ];
    parts.push(loft(st, 10, (i, a) => i <= 1 ? bill : i === 2 && Math.sin(a) < 0.3 ? face : Math.sin(a) > 0.4 ? sheen : black));
    parts.push(...[-1, 1].map(sx => ball(0.006, sx * 0.024, 0.06, -0.425, C(0x2a6a4a))));
    wingTop = (_u, v) => v > 0.5 ? black : sheen;
    wingUnder = () => black;
  }
  g.add(new THREE.Mesh(merge(parts), VC));
  const wings = [-1, 1].map(sx => {
    const a = new THREE.Group(); a.position.set(sx * shoulder.x, shoulder.y, shoulder.z); g.add(a);
    a.add(new THREE.Mesh(wingPanel(sx, arm, armLe, armTe, (u, v) => wingTop(u, v, false), (u, v) => wingUnder(u, v, false), 0.05), VC));
    const h = new THREE.Group(); h.position.x = sx * arm; a.add(h);
    h.add(new THREE.Mesh(wingPanel(sx, hand, handLe, handTe, (u, v) => wingTop(u, v, true), (u, v) => wingUnder(u, v, true), 0.04), VC));
    return { arm: a, hand: h };
  }) as unknown as [Wing, Wing];
  return { g, wings, neck };
}

/* ---------- sea lions swimming ---------- */

interface Swimmer { g: THREE.Group; home: Vec; p: Vec; h: number; t: number; leap: number }
/** Where sea lions are often seen swimming: off the Wharf and Pier 39, along the Cityfront, off Alcatraz. */
const SWIM_ZONES: [number, number][] = [[37.8115, -122.4140], [37.8105, -122.4200], [37.8145, -122.4060], [37.8235, -122.4210]];

export class Wildlife {
  private root = new THREE.Group();
  private porpoises: Porpoise[] = [];
  private seals: Seal[] = [];
  private lions = new THREE.Group();
  /** The colony: each place on the floats (a posture, a coat, where), and the instanced bodies by kind. */
  private spots: { kind: number; m: THREE.Matrix4; c: THREE.Color; up: boolean }[] = [];
  private kinds: THREE.InstancedMesh[] = [];
  private swimmers: Swimmer[] = [];
  private birds: Bird[] = [];
  private r = rng(2718);
  private month = 0;

  constructor(scene: THREE.Scene, private isWater: (p: Vec) => boolean) {
    scene.add(this.root);
    const r = this.r;
    // porpoise pods: one to three animals each
    POD_ZONES.forEach(([la, lo, rad], i) => {
      const home = LL(la, lo), n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const g = porpoiseMesh(); g.visible = false; this.root.add(g);
        this.porpoises.push({ g, home: { x: home.x + (r() - 0.5) * rad, y: home.y + (r() - 0.5) * rad }, p: { x: home.x, y: home.y }, h: r() * 360, t: -r() * 60 - i * 7, rolls: 0, dive: 40 + r() * 60, off: { x: (k - 1) * 3, y: (r() - 0.5) * 4 } });
      }
    });
    // a minute or so at the surface, then a dive of 3–7 minutes (typical harbor seal dives)
    for (const [la, lo] of SEAL_SPOTS) { const g = sealHead(r); g.visible = false; this.root.add(g); this.seals.push({ g, p: LL(la, lo), up: 40 + r() * 60, down: 180 + r() * 240, t: r() * 300 }); }
    // the Pier 39 floats (K-dock: low, weathered timber floats in two rows), and the sea lions on them
    const floats: THREE.BufferGeometry[] = [], fw = 3.2, fl = 6.2, wood = C(0x5e5a52);
    for (let i = 0; i < FLOATS; i++) {
      const fx = (i % 6) * (fw + 0.7) - 9, fz = Math.floor(i / 6) * (fl + 1.2) - 3.7, b = new THREE.BoxGeometry(fw, 0.3, fl); b.deleteAttribute('uv'); b.translate(fx, 0.12, fz);
      const shade = wood.clone().multiplyScalar(0.85 + r() * 0.3);
      b.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: b.attributes.position.count }, () => [shade.r, shade.g, shade.b]).flat(), 3));
      floats.push(b);
      // up to ten on each, lying every way, some sitting up, a few lying across others
      for (let j = 0; j < PER_FLOAT; j++) {
        const bull = r() < 0.55, sit = r() < 0.3, kind = (bull ? 2 : 0) + (sit ? 1 : 0), coat = C((bull ? COATS.bull : COATS.cow)[Math.floor(r() * (bull ? 3 : 5))]);
        const x = fx + (r() - 0.5) * (fw - 0.8), z = fz + (r() - 0.5) * (fl - 1.6), y = 0.27 + (j >= 7 ? 0.22 : 0);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(1, 1, 1));
        this.spots.push({ kind, m, c: coat, up: sit });
      }
    }
    this.lions.add(new THREE.Mesh(merge(floats), VC));
    for (let k = 0; k < 4; k++) {
      const im = new THREE.InstancedMesh(seaLionGeo(k % 2 === 1, k >= 2), VC, FLOATS * PER_FLOAT); im.count = 0; im.frustumCulled = false;
      this.lions.add(im); this.kinds.push(im);
    }
    this.lions.position.copy(P3(PIER39.x, PIER39.y, 0)); this.lions.rotation.y = 12 * D2R; this.root.add(this.lions);
    // a few swimming off the Wharf
    for (const [la, lo] of SWIM_ZONES) {
      const g = new THREE.Group(); g.add(new THREE.Mesh(seaLionGeo(false, r() < 0.5, true), new THREE.MeshLambertMaterial({ vertexColors: true, color: COATS.cow[4] })));
      g.visible = false; this.root.add(g); const home = LL(la, lo);
      this.swimmers.push({ g, home, p: { ...home }, h: r() * 360, t: r() * 30, leap: -1 });
    }
    // birds: gulls (some sitting on the water), a line of pelicans, a couple of cormorants
    const add = (kind: BirdKind, sit = false) => { const m = birdMesh(kind); this.root.add(m.g); this.birds.push({ kind, g: m.g, wings: m.wings, neck: m.neck, p: new THREE.Vector3(), v: new THREE.Vector3(), flap: r() * 6, sit, dive: 0, t: 0, bank: 0, glide: 0 }); };
    for (let i = 0; i < 5; i++) add('gull'); for (let i = 0; i < 4; i++) add('gull', true);
    for (let i = 0; i < 6; i++) add('pelican'); for (let i = 0; i < 2; i++) add('cormorant');
    this.fillFloats(0);
  }

  /** Put `n` sea lions on the floats, the instanced bodies of each kind. */
  private fillFloats(n: number): void {
    const counts = [0, 0, 0, 0];
    this.spots.forEach((s, i) => {
      if (i >= n) return;
      const im = this.kinds[s.kind], k = counts[s.kind]++;
      im.setMatrixAt(k, s.m); im.setColorAt(k, s.c);
    });
    this.kinds.forEach((im, k) => { im.count = counts[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  }

  /** The month (1–12) sets the season: pelicans and sea lions come and go. */
  setMonth(month: number): void {
    if (month === this.month) return;
    this.month = month;
    // (the places are dealt round the floats, so a thinner colony is spread across them, not packed on the first)
    const n = PIER39_COUNT[(month - 1 + 12) % 12], order = this.spots.map((_, i) => i).sort((a, b) => (a % PER_FLOAT) - (b % PER_FLOAT) || a - b);
    this.spots = order.map(i => this.spots[i]);
    this.fillFloats(n);
    // brown pelicans are on the Bay from about June to November, after nesting in the south; a few linger into winter
    this.pelicans = month >= 6 && month <= 11 || (month === 5 || month === 12) && this.r() < 0.4;
  }
  private pelicans = false;

  /**
   * Move them. `focus`: the boat you're watching (birds stay around her); `boats`: everyone afloat (the animals keep
   * clear); `sea(x, y)`: the water's height; `t` the time (s).
   */
  update(dt: number, t: number, focus: Vec, boats: Vec[], sea: (x: number, y: number) => number): void {
    const r = this.r, near = (p: Vec, d: number) => boats.some(b => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < d * d);
    // porpoises: a bout of three or four quick rolls, ten seconds or so apart, then a long dive; keeping clear of boats
    for (const a of this.porpoises) {
      a.t += dt;
      if (a.t > 0 && near(a.p, 35)) { a.t = -a.dive; a.rolls = 0; a.h += 120 + r() * 120; } // spooked: down and away
      const u = { x: Math.sin(a.h * D2R), y: Math.cos(a.h * D2R) };
      const speed = a.t > 0 ? 2.4 : 1.6; // swimming: quicker in a breathing bout, slower down below
      a.p.x += u.x * speed * dt; a.p.y += u.y * speed * dt;
      if ((a.p.x - a.home.x) ** 2 + (a.p.y - a.home.y) ** 2 > 250 * 250) a.h = Math.atan2(a.home.x - a.p.x, a.home.y - a.p.y) / D2R + (r() - 0.5) * 40;
      else if (r() < dt * 0.05) a.h += (r() - 0.5) * 50; // wandering as it feeds
      // a breath every 7 s or so in a bout, each pod member a moment after the last (their offset)
      const T = 1.45, cyc = (a.t - a.off.y * 0.12 + 20) % 7;
      const rolling = a.t > 0 && cyc < T && this.isWater(a.p);
      a.g.visible = rolling;
      if (rolling) {
        // the roll: the body runs along an arc in the vertical plane, like a wheel turning over through the surface:
        // the head breaks first, the back and fin turn over, the tail stock slips under; no leap, no splash
        const ph = cyc / T, ang = (ph - 0.5) * 1.75, Rc = 1.15, depth = 1.2;
        const x = a.p.x + a.off.x * u.y + u.x * Rc * Math.sin(ang), y = a.p.y - a.off.x * u.x + u.y * Rc * Math.sin(ang);
        a.g.position.copy(P3(x, y, sea(x, y) - depth + Rc * Math.cos(ang)));
        a.g.rotation.set(0, -a.h * D2R, 0); a.g.rotateX(-ang); // nose up as it rises, down as it goes under
      }
      if (a.t > 0 && a.t > 7 * (2 + (a.rolls % 3))) { a.t = -(a.dive = 30 + r() * 90); a.rolls++; } // two to four rolls, then a dive of half a minute to two
    }
    // harbor seals: a head up for half a minute or so, then down for a couple of minutes; down at once if you come close
    for (const s of this.seals) {
      s.t += dt; const cyc = s.t % (s.up + s.down);
      if (cyc < s.up && near(s.p, 25)) s.t += s.up - cyc; // into the dive
      const ph = s.t % (s.up + s.down), up = ph < s.up + 3;
      s.g.visible = up;
      if (up) {
        // rising and sinking slowly (no splash), bobbing with the waves, the nose tipped up, turning slowly to look
        // about (toward the nearest boat, when one's about)
        const sink = ph < 3 ? 1 - ph / 3 : ph > s.up ? (ph - s.up) / 3 : 0, bob = Math.sin(t * 1.3 + s.p.x) * 0.02;
        s.g.position.copy(P3(s.p.x, s.p.y, sea(s.p.x, s.p.y) + 0.02 + bob - sink * 0.5));
        const b0 = boats.reduce((m, b) => (b.x - s.p.x) ** 2 + (b.y - s.p.y) ** 2 < (m.x - s.p.x) ** 2 + (m.y - s.p.y) ** 2 ? b : m, boats[0] ?? s.p);
        const look = (b0.x - s.p.x) ** 2 + (b0.y - s.p.y) ** 2 < 150 * 150 ? Math.atan2(b0.x - s.p.x, b0.y - s.p.y) : Math.sin(t * 0.15 + s.p.y) * 2;
        s.g.rotation.y += ((((-look - s.g.rotation.y) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 0.5);
        (s.g.userData.tilt as THREE.Group).rotation.x = 0.1 + Math.sin(t * 0.3 + s.p.x) * 0.1;
      }
    }
    // sea lions on the floats: now and then one sits up or lies back down
    if (r() < dt * 0.15 && this.spots.length) {
      const s = this.spots[Math.floor(r() * this.spots.length)]; s.up = !s.up; s.kind = (s.kind & 2) + (s.up ? 1 : 0);
      this.fillFloats(PIER39_COUNT[(this.month - 1 + 12) % 12]);
    }
    this.lions.position.y = sea(PIER39.x, PIER39.y) * 0.4;
    // sea lions swimming: cruising at the surface, the head and the top of the back showing, about 3 m/s; now and then
    // a low leap clear of the water and back in (porpoising)
    for (const s of this.swimmers) {
      s.t += dt;
      const u = { x: Math.sin(s.h * D2R), y: Math.cos(s.h * D2R) }, sp = s.leap >= 0 ? 4.5 : 2.2;
      s.p.x += u.x * sp * dt; s.p.y += u.y * sp * dt;
      if ((s.p.x - s.home.x) ** 2 + (s.p.y - s.home.y) ** 2 > 200 * 200) s.h = Math.atan2(s.home.x - s.p.x, s.home.y - s.p.y) / D2R;
      else if (r() < dt * 0.1) s.h += (r() - 0.5) * 60;
      if (s.leap < 0 && r() < dt * 0.06) s.leap = 0;
      const water = this.isWater(s.p); s.g.visible = water && (s.leap >= 0 || (s.t % 40) < 25); // (and under for a spell)
      if (!s.g.visible) continue;
      let lift = -0.06, pitch = 0; // (cruising: only the head and the top of the back above the water)
      if (s.leap >= 0) {
        // a leap: 1.2 s, half a metre clear at the top, nose up going out, down going in
        s.leap += dt; const f = s.leap / 1.2; lift = -0.06 + Math.sin(Math.PI * f) * 0.75; pitch = (0.5 - f) * 1.4;
        if (f >= 1) s.leap = -1;
      }
      s.g.position.copy(P3(s.p.x, s.p.y, sea(s.p.x, s.p.y) + lift)); s.g.rotation.set(0, -s.h * D2R, 0); s.g.rotateX(pitch);
    }
    // birds, around the boat you're watching
    const F = P3(focus.x, focus.y, 0), sea3 = (v: THREE.Vector3) => sea(v.x, -v.z);
    let pel = 0;
    const lead = this.birds.find(x => x.kind === 'pelican')!;
    for (const b of this.birds) {
      const k = BIRD[b.kind], w0 = b.v.clone();
      if (b.kind === 'pelican') {
        // a line of pelicans: in season, just above the waves (the wingtips a few tens of centimetres up: ground
        // effect, which carries the long glides), following the swell, on a long straight pass
        b.g.visible = this.pelicans; if (!this.pelicans) continue;
        const i = pel++;
        if (i === 0) {
          if (b.t <= 0 || b.p.distanceTo(F) > 700) { // a new pass
            const a = r() * 6.28, d = 450; b.p.set(F.x + Math.cos(a) * d, 1.2, F.z + Math.sin(a) * d);
            const aim = new THREE.Vector3(F.x + (r() - 0.5) * 120, 0, F.z + (r() - 0.5) * 120); b.v.copy(aim.sub(b.p).setY(0).normalize().multiplyScalar(k.speed)); b.t = 90;
          }
          b.t -= dt; b.p.addScaledVector(b.v, dt); b.p.y = sea3(b.p) + 0.7 + Math.sin(t * 0.5) * 0.12;
        } else if (b.dive > 0) {
          // a plunge for a fish: up to 10–15 m, a twisting fall bill-first into the water, a few seconds sitting on the
          // surface swallowing, then a run back up to the line
          b.dive -= dt; const T = 9 - b.dive;
          if (T < 2.5) { b.p.addScaledVector(b.v, dt * 0.6); b.p.y += (13 - b.p.y) * dt * 1.2; }
          else if (T < 3.6) { b.p.addScaledVector(b.v, dt * 0.3); b.p.y = Math.max(sea3(b.p) - 0.3, b.p.y - 16 * dt); }
          else if (T < 7) { b.p.y = sea3(b.p) + 0.12; }
          else { b.p.y += (sea3(b.p) + 0.7 - b.p.y) * dt * 2; b.p.addScaledVector(b.v, dt * 1.2); }
          if (b.dive <= 0) b.t = -1; // rejoin
        } else {
          const back = lead.v.clone().normalize(), slot = lead.p.clone().addScaledVector(back, -3.4 * i).add(new THREE.Vector3(back.z, 0, -back.x).multiplyScalar(1.1 * i));
          // fly to its place in the line (a bird that has just been fishing catches up)
          const to = slot.sub(b.p).setY(0); b.v.copy(lead.v).addScaledVector(to, Math.min(1.5, b.t < 0 ? 0.6 : 2));
          if (to.length() < 2) b.t = 1;
          b.p.addScaledVector(b.v, dt); b.p.y = sea3(b.p) + 0.7 + Math.sin(t * 0.7 + i) * 0.1;
          if (r() < dt * 0.008) b.dive = 9;
        }
        // three to five slow beats, then a long glide (followers take the rhythm from the leader, a beat behind each)
        const diving = b.dive > 0 && 9 - b.dive < 3.6 && 9 - b.dive > 2.5, sitting = b.dive > 0 && 9 - b.dive >= 3.6 && 9 - b.dive < 7;
        b.glide = (t - i * 0.45) % 8; const beating = b.glide < 2.2 || (b.dive > 0 && !sitting && !diving);
        if (beating) b.flap += dt * k.hz * Math.PI * 2;
        else b.flap = 0; // (gliding: the wings held level)
        this.pose(b, w0, dt, sitting ? 'sit' : diving ? 'dive' : beating ? Math.sin(b.flap) * 0.45 : -0.03);
        continue;
      }
      if (b.sit) {
        // a gull resting on the water: lifts off when a boat comes close, or when it drifts out of the picture
        if (b.t <= 0 || b.p.distanceTo(F) > 450) { const a = r() * 6.28, d = 60 + r() * 220; b.p.set(F.x + Math.cos(a) * d, 0, F.z + Math.sin(a) * d); b.t = 1; b.v.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.01); }
        const wp = { x: b.p.x, y: -b.p.z };
        if (!this.isWater(wp)) { b.t = 0; b.g.visible = false; continue; }
        b.g.visible = true; b.p.y = sea(wp.x, wp.y) + 0.02;
        if (near(wp, 22)) { b.sit = false; b.v.set((r() - 0.5) * 8, 3, (r() - 0.5) * 8); b.t = 20; }
        this.pose(b, w0, dt, 'sit');
        continue;
      }
      // flying: gulls wheel round the boat, gliding and soaring with spells of flapping; cormorants fly fast and
      // straight, a metre or two above the water, beating all the way
      b.g.visible = true;
      if (b.t <= 0 || b.p.distanceTo(F) > 600) {
        const a = r() * 6.28, d = b.kind === 'cormorant' ? 400 : 80 + r() * 200;
        b.p.set(F.x + Math.cos(a) * d, b.kind === 'cormorant' ? 1.5 : 10 + r() * 20, F.z + Math.sin(a) * d);
        const head = b.kind === 'cormorant' ? Math.atan2(F.z - b.p.z, F.x - b.p.x) + (r() - 0.5) * 0.6 : r() * 6.28;
        b.v.set(Math.cos(head) * k.speed, 0, Math.sin(head) * k.speed); b.t = b.kind === 'cormorant' ? 60 : 30 + r() * 30;
      }
      b.t -= dt;
      let wing: number;
      if (b.kind === 'gull') {
        // wheeling: turning slowly one way then the other, rising and sinking; sometimes dropping to sit on the water
        b.v.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.3 * Math.sin(t * 0.1 + b.flap * 0.01));
        b.v.y = (15 - b.p.y) * 0.1 + Math.sin(t * 0.5 + b.p.x) * 0.6;
        if (b.t < 2 && b.t > 0 && r() < dt * 0.3) { b.sit = true; b.t = 1; }
        // spells of flapping (a few seconds) between glides, more when climbing
        b.glide += dt; const flapping = (b.glide % 9) < 2.5 + Math.max(0, b.v.y) * 2;
        if (flapping) b.flap += dt * k.hz * Math.PI * 2;
        wing = flapping ? Math.sin(b.flap) * 0.6 : 0.1 + 0.04 * Math.sin(t * 2 + b.p.z); // gliding: the wings a little raised
      } else {
        b.v.y = (sea3(b.p) + 1.4 - b.p.y) * 0.8;
        b.flap += dt * k.hz * Math.PI * 2; wing = Math.sin(b.flap) * 0.55;
      }
      b.p.addScaledVector(b.v, dt);
      this.pose(b, w0, dt, wing);
    }
  }

  /**
   * Place a bird and set its wings. `wing`: the beat angle (rad, + up), or a posture. It banks into its turns as a
   * flying bird must: tan(bank) = v·ω / g, from how fast its heading is turning.
   */
  private pose(b: Bird, vPrev: THREE.Vector3, dt: number, wing: number | 'sit' | 'dive'): void {
    b.g.position.copy(b.p);
    const sp = Math.hypot(b.v.x, b.v.z);
    if (sp > 0.05) {
      const h = Math.atan2(b.v.x, b.v.z), hp = Math.atan2(vPrev.x, vPrev.z), om = dt > 0 ? (((h - hp + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) / dt : 0;
      const bank = typeof wing === 'number' ? Math.atan(sp * om / 9.81) : 0;
      b.bank += (Math.max(-0.8, Math.min(0.8, bank)) - b.bank) * Math.min(1, dt * 4);
      b.g.rotation.set(0, h + Math.PI, 0, 'YXZ');
      b.g.rotation.x = wing === 'dive' ? -1.3 : Math.atan2(b.v.y, sp) * 0.5; // nose down in a plunge, a little with the climb
      b.g.rotation.z = b.bank; // + rolls the right wing up: a left turn
    }
    const [L, R] = b.wings;
    if (wing === 'sit') { b.bank = 0; b.g.rotation.x = 0; b.g.rotation.z = 0; } // sitting level on the water
    if (wing === 'sit' || wing === 'dive') {
      // folded: the arm back along the body, the hand tucked under it alongside (in a plunge, swept right back)
      // (a turn of + about y swings a right wing forward: back is −)
      // (the hand folded back over the arm, so the wing lies along the body: the tips at the tail, not beyond it)
      for (const [w, sx] of [[L, -1], [R, 1]] as const) { w.arm.rotation.set(0, -sx * 1.48, -sx * 0.04); w.hand.rotation.set(0, sx * 2.95, 0); }
      return;
    }
    // the beat: the arm swings through the angle, the hand follows a moment later (it lags, and flexes on the upstroke,
    // folding a little in toward the body), the wing sweeping back a little at the top
    const lag = Math.sin(b.flap - 0.7) * 0.35 * Math.min(1, Math.abs(wing) * 3);
    const up = Math.max(0, Math.sin(b.flap + 1.2)) * Math.min(1, Math.abs(wing) * 3); // (the upstroke: the hand partly folds)
    for (const [w, sx] of [[L, -1], [R, 1]] as const) {
      w.arm.rotation.set(0, sx * (0.06 * Math.max(0, wing) + 0.15 * up), sx * wing); // (+ about z lifts the right wing)
      // a gull's hand droops in the glide (the gull-wing bend); a pelican's tips droop a little
      const droop = b.kind === 'gull' ? -0.18 : b.kind === 'pelican' ? -0.06 : 0;
      w.hand.rotation.set(0, sx * 0.35 * up, sx * (lag + droop));
    }
  }
}
