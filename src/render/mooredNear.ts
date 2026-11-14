import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MOORED, type MooredPart } from './mooredBoats';

/**
 * The boats in the slips as you see them close by, walking the docks or motoring down a fairway (render/marina.ts draws
 * these for the few dozen slips nearest the camera, and the simpler mooredBoats.ts ones for the rest): the hull a smooth
 * canoe body with its boot stripe and bottom paint at the waterline; a cambered deck with the cockpit well let into it and
 * its coamings; the cabin trunk raked at the front with a long window each side and the companionway; a hatch on the
 * foredeck; the rig's shrouds over spreaders, the forestay and backstay; the bow and stern pulpits, stanchions and
 * lifelines. A powerboat: the same hull, her deckhouse with its raked windshield, the flybridge, a bow rail and her
 * cockpit aft. Built for a boat 1 m long (bow toward −z, starboard +x, the waterline at y = 0), scaled to hers.
 *
 * Proportions as mooredBoats.ts's (the J/105's for the sailboats); the fittings' sizes are a typical 30–36 footer's:
 * lifelines about 60 cm high (a 24 in minimum, ISAF/World Sailing Offshore Special Regulations 3.14, for boats this size),
 * the boot stripe a few centimetres, the cockpit well about 45 cm deep: estimates, as fractions of her length.
 */

type Lines = typeof MOORED.sail | typeof MOORED.power;
const BOOT_TOP = 0.012, BOOT_LOW = 0.004; // the boot stripe, above the waterline (fractions of her length)
const C = (hex: number): [number, number, number] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
/** The hull's colors, multiplied by each boat's own (instance) color: her topsides as she's painted; a dark boot stripe and bottom paint (a near-black blue antifouling, the commonest in the Bay's yards). */
const TOPSIDE = C(0xffffff), BOOT = C(0x223a5c), BOTTOM = C(0x1b2230);

/** Her half-breadth at the sheer (u: 0 the stem … 1 the transom), as mooredBoats.ts's hull. */
const halfOf = (L: Lines) => (u: number) => {
  const b = L.beam / 2;
  return u < 0.55 ? b * Math.pow(Math.sin((Math.PI / 2) * (u / 0.55)), 0.75) : b * (1 - (1 - L.transom) * ((u - 0.55) / 0.45) ** 2);
};
const sheerOf = (L: Lines) => (u: number) => L.fbBow + (L.fbStern - L.fbBow) * u - 0.012 * Math.sin(Math.PI * u);

/** A grid between two lists of points along her (each station a row), both sides (mirrored), one color. */
type Band = { pos: number[]; col: number[]; nrm: number[] };
function band(rows: [number, number, number][][], col: [number, number, number], out: Band[]): void {
  for (const s of [1, -1]) {
    const pos: number[] = [], cc: number[] = [], idx: number[] = [], W = rows[0].length;
    for (const r of rows) for (const [x, y, z] of r) { pos.push(s * x, y, z); cc.push(...col); }
    for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < W; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const ng = g.toNonIndexed(), arr = (k: string) => [...(ng.attributes[k].array as Float32Array)];
    out.push({ pos: arr('position'), col: arr('color'), nrm: arr('normal') });
  }
}

/**
 * The hull: topsides, boot stripe and bottom, each its own band (crisp lines between them), and the transom. Each section
 * from the sheer, its topside a little flared, down to the waterline, round a soft turn of the bilge to the keel; below
 * the water the stem's rake carries it aft (the bow overhangs).
 */
function hullNear(L: Lines, N = 28): THREE.BufferGeometry {
  const half = halfOf(L), sheer = sheerOf(L);
  const top: [number, number, number][][] = [], boot: [number, number, number][][] = [], bot: [number, number, number][][] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, z = u - 0.5, zw = -0.5 + L.rake + u * (1 - L.rake), uw = zw + 0.5, b = half(u), bw = half(uw) * 0.95, y = sheer(u);
    const zAt = (f: number) => z + (zw - z) * f; // (f 0 at the sheer … 1 at the waterline)
    top.push([[b, y, z], [Math.max(bw, b * 0.98) * 1.0 + (b - bw) * 0.15, y * 0.55, zAt(0.5)], [bw, BOOT_TOP, zAt(0.97)]]);
    boot.push([[bw, BOOT_TOP, zAt(0.97)], [bw * 0.995, BOOT_LOW, zw]]);
    bot.push([[bw * 0.995, BOOT_LOW, zw], [bw * 0.93, -L.draft * 0.25, zw], [bw * 0.72, -L.draft * 0.6, zw], [bw * 0.38, -L.draft * 0.88, zw], [0, -L.draft, zw]]);
  }
  const parts: Band[] = [];
  band(top, TOPSIDE, parts); band(boot, BOOT, parts); band(bot, BOTTOM, parts);
  // the transom: the last section, both sides, fanned from its middle (it's convex), facing aft
  const last = [...top[N], ...boot[N].slice(1), ...bot[N].slice(1)], ring = [...last, ...last.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z] as [number, number, number]), last[0]]; // (round to the start again)
  const cy = (sheer(1) - L.draft) / 2, cz = ring.reduce((s, p) => s + p[2], 0) / ring.length, tp: number[] = [], tc: number[] = [], tn: number[] = [];
  for (let k = 0; k + 1 < ring.length; k++) {
    const a = ring[k], b = ring[k + 1];
    tp.push(0, cy, cz, b[0], b[1], b[2], a[0], a[1], a[2]);
    for (let q = 0; q < 3; q++) { tc.push(...(a[1] > BOOT_TOP ? TOPSIDE : a[1] > BOOT_LOW ? BOOT : BOTTOM)); tn.push(0, 0.1, 1); }
  }
  const pos = [...parts.flatMap(p => p.pos), ...tp], col = [...parts.flatMap(p => p.col), ...tc], nrm = [...parts.flatMap(p => p.nrm), ...tn];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A flat quad (two triangles), its corners in order round it; non-indexed. `face`: the way it looks (its outside, the
 * side drawn), whichever way round the corners were given.
 */
function quad(a: number[], b: number[], c: number[], d: number[], face?: [number, number, number]): THREE.BufferGeometry {
  let p = [...a, ...b, ...c, ...a, ...c, ...d];
  if (face) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * face[0] + n[1] * face[1] + n[2] * face[2] < 0) p = [...a, ...c, ...b, ...a, ...d, ...c];
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
  return g;
}
const UP: [number, number, number] = [0, 1, 0];

/**
 * The deck, cambered, from sheer to sheer; the cockpit well (u0…u1, half-width w) let into it, its sole `deep` below the
 * deck and its coamings `coam` above it along the sides. Returns the deck and the well's sole (its own color).
 */
function deckNear(L: Lines, ck: { u0: number; u1: number; w: number; deep: number; coam: number } | null, N = 28): { deck: THREE.BufferGeometry; sole: THREE.BufferGeometry | null } {
  const half = halfOf(L), sheer = sheerOf(L), camber = 0.02;
  const yAt = (u: number, x: number) => { const b = Math.max(1e-4, half(u)); return sheer(u) + camber * b * Math.max(0, 1 - (x / b) ** 2); };
  const us = [...new Set([...Array.from({ length: N + 1 }, (_, i) => i / N), ...(ck ? [ck.u0, ck.u1] : [])])].sort((a, b) => a - b);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 1; i < us.length; i++) {
    const ua = us[i - 1], ub = us[i], za = ua - 0.5, zb = ub - 0.5, ba = half(ua), bb = half(ub);
    const inCk = !!ck && ua >= ck.u0 - 1e-9 && ub <= ck.u1 + 1e-9;
    const wa = Math.min(ck ? ck.w : 0.6 * ba, ba * 0.97), wb = Math.min(ck ? ck.w : 0.6 * bb, bb * 0.97);
    for (const s of [1, -1]) // the side decks (outboard of the well's edge)
      geos.push(quad([s * ba, yAt(ua, ba), za], [s * bb, yAt(ub, bb), zb], [s * wb, yAt(ub, wb), zb], [s * wa, yAt(ua, wa), za], UP));
    if (!inCk) geos.push(quad([wa, yAt(ua, wa), za], [-wa, yAt(ua, wa), za], [-wb, yAt(ub, wb), zb], [wb, yAt(ub, wb), zb], UP));
  }
  let sole: THREE.BufferGeometry | null = null;
  if (ck) {
    const { u0, u1, w, deep, coam } = ck, z0 = u0 - 0.5, z1 = u1 - 0.5, y0 = yAt(u0, w), y1 = yAt(u1, w), f0 = y0 - deep, f1 = y1 - deep;
    sole = quad([w, f0, z0], [-w, f0, z0], [-w, f1, z1], [w, f1, z1], UP);
    // the well's sides (up to the coamings' tops) and its ends, from the deck down to the sole, all looking into the well
    for (const s of [1, -1]) geos.push(quad([s * w, y0 + coam, z0], [s * w, y1 + coam, z1], [s * w, f1, z1], [s * w, f0, z0], [-s, 0, 0]));
    geos.push(quad([-w, y0, z0], [w, y0, z0], [w, f0, z0], [-w, f0, z0], [0, 0, 1]), quad([w, y1, z1], [-w, y1, z1], [-w, f1, z1], [w, f1, z1], [0, 0, -1]));
    // the coamings' outer faces and tops (a coaming 1/120 of her length thick)
    const t = 1 / 120;
    for (const s of [1, -1]) {
      const xo = s * (w + t), xi = s * w;
      geos.push(quad([xo, y0, z0], [xo, y1, z1], [xo, y1 + coam, z1], [xo, y0 + coam, z0], [s, 0, 0]), quad([xi, y0 + coam, z0], [xi, y1 + coam, z1], [xo, y1 + coam, z1], [xo, y0 + coam, z0], UP));
    }
  }
  const deck = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g))!;
  return { deck, sole };
}

/** A box narrowing toward its top (mooredBoats.ts's `trunk`), with no bottom: a cabin trunk, a hatch, a deckhouse. */
function trunk(wBot: number, wTop: number, zf: number, za: number, zfTop: number, zaTop: number, y0: number, y1: number): THREE.BufferGeometry {
  const v = [[wBot, y0, zf], [-wBot, y0, zf], [-wBot, y0, za], [wBot, y0, za], [wTop, y1, zfTop], [-wTop, y1, zfTop], [-wTop, y1, zaTop], [wTop, y1, zaTop]];
  const f = [[4, 5, 6], [4, 6, 7], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2]];
  const pos: number[] = []; for (const tri of f) for (const k of tri) pos.push(...v[k]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

/** A window on a trunk's side (its sloping side plane), from z0 to z1, between fractions h0…h1 of its height, just proud of it; its forward end raked as the trunk's front. */
function sideWindows(wBot: number, wTop: number, y0: number, y1: number, z0: number, z1: number, h0: number, h1: number, rake: number): THREE.BufferGeometry {
  const xAt = (f: number) => wBot + (wTop - wBot) * f + 0.0012, yAt = (f: number) => y0 + (y1 - y0) * f;
  const geos: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    geos.push(quad([s * xAt(h0), yAt(h0), z0], [s * xAt(h0), yAt(h0), z1], [s * xAt(h1), yAt(h1), z1], [s * xAt(h1), yAt(h1), z0 + rake * (h1 - h0)], [s, 0, 0]));
  }
  return mergeGeometries(geos)!;
}

/** A round rod between two points (a spar, a wire, a rail), r thick, `seg` sides; non-indexed, no uv. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 3): THREE.BufferGeometry {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); g.deleteAttribute('uv');
  return g.toNonIndexed();
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** A polyline of rods. */
const rail = (pts: THREE.Vector3[], r: number) => pts.slice(1).map((p, i) => rod(pts[i], p, r));

/**
 * The guardrails, stainless: the bow pulpit round the stemhead, the stern pulpit round the transom, stanchions between,
 * two lifelines along each side. `h`: their height above the deck (fractions of her length); `aftFrom`: where the stern
 * pulpit begins (u).
 */
function guardrails(L: Lines, h: number, stanchions: number[], aftFrom: number): THREE.BufferGeometry[] {
  const half = halfOf(L), sheer = sheerOf(L), at = (u: number, s: number, k = 0.9) => V(s * half(u) * k, sheer(u), u - 0.5);
  const up = (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy);
  const out: THREE.BufferGeometry[] = [], uB = 0.07, nose = V(0, sheer(0.012) + h, -0.5 + 0.012);
  for (const s of [1, -1]) {
    const bowLeg = at(uB, s), sternLeg = at(0.985, s, 0.85), aftLeg = at(aftFrom, s);
    out.push(rod(bowLeg, up(bowLeg, h), 0.0016), rod(sternLeg, up(sternLeg, h), 0.0016), rod(aftLeg, up(aftLeg, h), 0.0016)); // the pulpits' legs
    out.push(...rail([nose, up(bowLeg, h)], 0.0016), ...rail([up(aftLeg, h), up(sternLeg, h), V(0, sheer(0.985) + h, 0.485)], 0.0016)); // their top rails
    const line = [up(bowLeg, h), ...stanchions.map(u => up(at(u, s), h)), up(aftLeg, h)], mid = line.map(p => up(p, -h * 0.5));
    for (const u of stanchions) { const p = at(u, s); out.push(rod(p, up(p, h), 0.0012)); } // the stanchions
    out.push(...rail(line, 0.0008), ...rail(mid, 0.0008)); // the upper and lower lifelines
  }
  return out;
}

/** A sailboat close by. */
export function sailPartsNear(): MooredPart[] {
  const M = MOORED.sail, half = halfOf(M), sheer = sheerOf(M);
  const ck = { u0: 0.7, u1: 0.93, w: half(0.8) * 0.52, deep: 0.045, coam: 0.012 };
  const { deck, sole } = deckNear(M, ck);
  // the cabin trunk: raked at the front, from a little aft of the foredeck hatch to the cockpit's forward end
  const u0 = 0.32, u1 = ck.u0, y0 = Math.min(sheer(u0), sheer(u1)) + 0.004, y1 = y0 + M.cabin, wB = half(0.5) * 0.62, wT = wB * 0.84;
  const zf = u0 - 0.5, za = u1 - 0.5, rakeF = 0.07;
  const cabin = trunk(wB, wT, zf, za, zf + rakeF, za - 0.004, y0, y1);
  const windows = mergeGeometries([
    sideWindows(wB, wT, y0, y1, zf + rakeF * 0.45 + 0.02, za - 0.07, 0.4, 0.75, rakeF),
    quad([0.045, y0 + 0.006, za + 0.0015], [-0.045, y0 + 0.006, za + 0.0015], [-0.04, y1 - 0.004, za - 0.003], [0.04, y1 - 0.004, za - 0.003], [0, 0, 1]) // the companionway's washboards, aft
  ].map(g => g.index ? g.toNonIndexed() : g))!;
  const hatch = trunk(0.04, 0.036, 0.19 - 0.5, 0.25 - 0.5, 0.192 - 0.5, 0.248 - 0.5, sheer(0.22) + 0.008, sheer(0.22) + 0.02);
  // the rig: the mast stepped on the cabin top, the shrouds over the spreaders to the chainplates at the rail, forestay and backstay
  const mastZ = M.mastAt - 0.5, foot = V(0, y1, mastZ), head = V(0, M.mastAbove, mastZ), hounds = V(0, M.mastAbove * 0.96, mastZ);
  const spY = y1 + (M.mastAbove - y1) * 0.5, spW = half(M.mastAt) * 0.75;
  const boomY = y1 + M.boom * 0.5, boomEnd = V(0, boomY, M.boomTo - 0.5);
  const rig: THREE.BufferGeometry[] = [
    rod(foot, head, 0.008, 6), rod(V(0, boomY, mastZ), boomEnd, 0.005, 5),
    rod(head, V(0, sheer(0.004) + 0.004, -0.497), 0.0011), rod(head, V(0, sheer(1) + 0.012, 0.495), 0.0011)
  ];
  for (const s of [1, -1]) {
    const tip = V(s * spW, spY, mastZ), plate = V(s * half(M.mastAt) * 0.94, sheer(M.mastAt), mastZ + 0.01);
    rig.push(rod(V(0, spY, mastZ), tip, 0.0022), rod(hounds, tip, 0.0011), rod(tip, plate, 0.0011), rod(V(0, spY - 0.02, mastZ), plate, 0.0011)); // the spreader, the cap shroud over it, the lower shroud
  }
  rig.push(...guardrails(M, 0.075, [0.3, 0.5, 0.68], 0.9));
  rig.push(rod(V(0, sheer(0.93) + 0.004, 0.93 - 0.5 - 0.02), V(0, sheer(0.93) + 0.004, 0.8 - 0.5), 0.0035)); // the tiller, lashed amidships
  const cover = rod(V(0, boomY + 0.016, mastZ + 0.01), V(0, boomY + 0.01, boomEnd.z - 0.03), 0.017, 8);
  return [
    { geo: hullNear(M), colour: 0xffffff, own: 'hull', vc: true },
    { geo: deck, colour: 0xece8de }, { geo: sole!, colour: 0xb9ad94 }, { geo: cabin, colour: 0xf3f0e8 }, { geo: hatch, colour: 0xdedad0 },
    { geo: windows, colour: 0x1d2328 }, { geo: mergeGeometries(rig)!, colour: 0xc8cdd2 }, { geo: cover, colour: 0xffffff, own: 'cover' }
  ];
}

/** A powerboat close by: her deckhouse with a raked windshield, the flybridge on top, a bow rail, her cockpit aft. */
export function powerPartsNear(): MooredPart[] {
  const M = MOORED.power, half = halfOf(M), sheer = sheerOf(M);
  const ck = { u0: 0.76, u1: 0.96, w: half(0.86) * 0.82, deep: 0.04, coam: 0 };
  const { deck, sole } = deckNear(M, ck);
  const y0 = sheer(0.45) - 0.004, y1 = y0 + M.house, wB = half(0.5) * 0.8, wT = half(0.5) * 0.72, zf = -0.12, za = ck.u0 - 0.5, rake = 0.11;
  const house = trunk(wB, wT, zf, za, zf + rake, za - 0.01, y0, y1);
  const windows = mergeGeometries([
    sideWindows(wB, wT, y0, y1, zf + rake * 0.45 + 0.01, za - 0.04, 0.45, 0.85, rake),
    // the windshield: across the raked front, between the same heights
    (() => { const f0 = 0.45, f1 = 0.85, x0 = wB + (wT - wB) * f0, x1 = wB + (wT - wB) * f1, yA = y0 + (y1 - y0) * f0, yB = y0 + (y1 - y0) * f1, zA = zf + rake * f0 - 0.0015, zB = zf + rake * f1 - 0.0015;
      return quad([x0 * 0.92, yA, zA], [-x0 * 0.92, yA, zA], [-x1 * 0.92, yB, zB], [x1 * 0.92, yB, zB], [0, 0.4, -1]); })()
  ].map(g => g.index ? g.toNonIndexed() : g))!;
  const top = y1, bridge: THREE.BufferGeometry[] = [
    trunk(0.07, 0.06, -0.02, 0.1, 0.0, 0.1, top, top + 0.05).toNonIndexed(),
    rod(V(0.11, top + 0.06, -0.06), V(0.11, top + 0.06, 0.26), 0.003), rod(V(-0.11, top + 0.06, -0.06), V(-0.11, top + 0.06, 0.26), 0.003),
    rod(V(0, top, 0.02), V(0, top + 0.16, 0.02), 0.004)
  ];
  for (const s of [1, -1]) for (const z of [-0.06, 0.1, 0.26]) bridge.push(rod(V(s * 0.11, top, z), V(s * 0.11, top + 0.06, z), 0.002)); // the flybridge rail's posts
  // the bow rail: legs at the bow, a rail round the stem and back along each side to the deckhouse
  const at = (u: number, s: number) => V(s * half(u) * 0.9, sheer(u), u - 0.5), h = 0.05, nose = V(0, sheer(0.01) + h, -0.49);
  for (const s of [1, -1]) {
    const pts = [0.08, 0.2, 0.32].map(u => at(u, s));
    for (const p of pts) bridge.push(rod(p, p.clone().setY(p.y + h), 0.0016));
    bridge.push(...rail([nose, ...pts.map(p => p.clone().setY(p.y + h))], 0.0016));
  }
  return [
    { geo: hullNear(M), colour: 0xffffff, own: 'hull', vc: true },
    { geo: deck, colour: 0xece8de }, { geo: sole!, colour: 0xd9d4c8 }, { geo: house, colour: 0xf4f2ec },
    { geo: windows, colour: 0x1a2026 }, { geo: mergeGeometries(bridge)!, colour: 0xd8dadc }
  ];
}
