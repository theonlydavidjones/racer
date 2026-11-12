import './three-setup';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Person } from '../boat/crewPhys';

/**
 * A sailor's body: one skinned mesh on eleven bones (hips, spine, head, shoulders, elbows, hips, knees), so a person is
 * one draw call however they're posed (tests/perf.test.ts: under 2,000 calls in every view). Dressed as the people in
 * the owner's photos of Folkboats racing on the Bay (reference/photos): a spray top, bib trousers (salopettes) over it
 * with their straps and bib showing, a life jacket (an inflatable's slim yoke or a foam vest), sailing gloves, boots,
 * a cap or a visor and sunglasses. Proportions from body-segment lengths as fractions of height (Winter, Biomechanics
 * and Motor Control of Human Movement, fig. 4.1, after Drillis & Contini): thigh 0.245 H, shank 0.246 H, upper arm
 * 0.186 H, forearm 0.146 H, shoulder width 0.259 H, hip width 0.191 H; built for 1.75 m and scaled to the person.
 */

/** Bone lengths (m at 1.75 m tall): hip to knee, knee to ankle, shoulder to elbow, elbow to wrist (Winter, above). */
export const BONE = { thigh: 0.43, shin: 0.43, upper: 0.30, fore: 0.255, shoulderY: 0.47, hipX: 0.095, shoulderX: 0.2, headY: 0.57 };

export interface Limb { root: THREE.Object3D; mid: THREE.Object3D }
export interface Body { root: THREE.Group; torso: THREE.Bone; head: THREE.Bone; arm: [Limb, Limb]; leg: [Limb, Limb]; scale: number; mesh: THREE.SkinnedMesh }

/**
 * Who they are: a crew's looks drawn from realistic ranges, each choice from its own hash of the person's seed (stable
 * race to race for the same boat). Skin from very fair to very dark, about evenly across the range (the Bay's sailors
 * aren't all one people); hair by skin (dark hair with dark skin, the full range with fair), some worn long in a ponytail
 * out of the back of a cap (as in the CircleSea photo); a cap, a visor, a beanie or nothing; the life jacket an
 * inflatable's yoke or a foam vest in its makers' usual colours; a spray top in their own colour or the boat's team one.
 */
const SKINS = [0xf3d6c4, 0xe9c3a6, 0xdcae8c, 0xc9966f, 0xb27c57, 0x986445, 0x7d4f35, 0x633c28, 0x4b2d1f, 0x3a2219];
const HAIR_FAIR = [0x2b2018, 0x4a3322, 0x6b4a2e, 0x8a6a3e, 0xb89466, 0xd8be8a, 0x8c3f22, 0x9a9a96, 0xd9d6cf];
const HAIR_DARK = [0x15110e, 0x1d1712, 0x2b2018, 0x3b2a1e, 0x9a9a96];
const PFDS: { body: number; trim: number; foam: boolean }[] = [
  { body: 0x1c2026, trim: 0xe0482c, foam: false }, { body: 0x24406e, trim: 0x1c2026, foam: true },
  { body: 0x1c2026, trim: 0x2e8fbf, foam: false }, { body: 0xd8432e, trim: 0x1c2026, foam: true },
  { body: 0x22314f, trim: 0xe8b21c, foam: false }, { body: 0xe8b21c, trim: 0x1c2026, foam: true },
  { body: 0xb8322a, trim: 0xd8d4cc, foam: false }, { body: 0x2a2d33, trim: 0x8fc93a, foam: true }
];
const BIBS = [0x23272e, 0x2c3440, 0x3a3f47, 0x1e2a3a, 0x8f2a24, 0x4a4f57];
const HATS = [0x1d2330, 0xe8e4d8, 0xc8372d, 0x2b4f8a, 0xd9c9a3, 0x2e6b4f, 0x5d6670, 0xf0f0ea];
/** Foul-weather tops in the colours they come in. */
const TOPS = [0xc8372d, 0x1f3a5f, 0xe8b21c, 0x3a3f47, 0xd8d4c8, 0x2b8a8a, 0xe36a1e, 0x6f8fb3, 0x23272e, 0x8a2f4a, 0x4e7a3a];
/** A hash of a seed and a salt to 0..1 (each choice independent of the others). */
const hash = (seed: number, salt: number) => { let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const pick = <T,>(arr: readonly T[], seed: number, salt: number) => arr[Math.floor(hash(seed, salt) * arr.length)];

/** A piece of the body on one bone: its geometry in that bone's frame, and its colour. */
interface Piece { g: THREE.BufferGeometry; bone: number; color: number }

const tube = (r0: number, r1: number, len: number, seg = 10) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false); g.translate(0, -len / 2, 0); return g; }; // from y 0 down to −len, r0 at the top
const ball = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))); return g;
};
/** A body of revolution (y up) from a profile of (radius, y), flattened front to back by `flat`. */
const lathe = (pts: [number, number][], flat: number, seg = 14) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.scale(1, 1, flat); return g; };

/** Design examples (dev only, for the owner to choose between): `?crewStyle=refined|smooth|dressed` in the page's URL.
 * Today's figures otherwise. The same skeleton and bones whichever, so the animation and the physics are untouched. */
const STYLE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('crewStyle') : null;
export function buildBody(p: Person, jacket: number, seed: number): Body {
  if (STYLE === 'refined' || STYLE === 'smooth' || STYLE === 'dressed') return buildLook(STYLE, p, jacket, seed);
  return buildClassic(p, jacket, seed);
}
function buildClassic(p: Person, jacket: number, seed: number): Body {
  const s = p.h / 1.75, girth = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24))), g = girth;
  const tone = Math.floor(hash(seed, 1) * SKINS.length), skin = SKINS[tone];
  const hair = pick(tone >= 6 ? HAIR_DARK : HAIR_FAIR, seed, 2), pfd = pick(PFDS, seed, 3), bib = pick(BIBS, seed, 4), hat = pick(HATS, seed, 5);
  const headwear = (['cap', 'cap', 'cap', 'visor', 'beanie', 'none'] as const)[Math.floor(hash(seed, 6) * 6)];
  const ponytail = hash(seed, 7) < 0.3, shades = hash(seed, 8) < 0.7, glove = 0x15171a, boot = pick([0x2a2d33, 0x3a3f47, 0x1e2a3a], seed, 9), sole = 0xd8d4cc;
  // their spray top: the boat's team colour, or their own
  if (hash(seed, 10) < 0.5) jacket = pick(TOPS, seed, 11);
  // the bones, at rest (standing, arms down): the hips the root
  const root = new THREE.Group(); root.scale.setScalar(s);
  const B = (parent: THREE.Object3D | null, x: number, y: number, z: number) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent?.add(b); return b; };
  const hips = B(null, 0, 0, 0), spine = B(hips, 0, 0, 0), head = B(spine, 0, BONE.headY, 0);
  const sh = [-1, 1].map(sx => B(spine, sx * BONE.shoulderX * g, BONE.shoulderY, 0)), el = sh.map(b => B(b, 0, -BONE.upper, 0));
  const hp = [-1, 1].map(sx => B(hips, sx * BONE.hipX * g, 0, 0)), kn = hp.map(b => B(b, 0, -BONE.thigh, 0));
  head.rotation.order = 'YXZ';
  const bones = [hips, spine, head, sh[0], el[0], sh[1], el[1], hp[0], kn[0], hp[1], kn[1]];
  const P: Piece[] = [], add = (g2: THREE.BufferGeometry, bone: number, color: number) => P.push({ g: g2, bone, color });

  // hips and seat: the bib trousers
  add(at(new THREE.CapsuleGeometry(0.115 * g, 0.12 * g, 4, 12), 0, 0.03, 0.01, 1, 1, 0.82, 0, 0, Math.PI / 2), 0, bib);
  // the torso: the spray top, tapered from the waist to the shoulders, a high collar
  add(lathe([[0.001, 0.0], [0.125 * g, 0.02], [0.135 * g, 0.12], [0.145 * g, 0.27], [0.16 * g, 0.4], [0.15 * g, 0.45], [0.1 * g, 0.5], [0.055, 0.53], [0.001, 0.535]], 0.7), 1, jacket);
  add(at(tube(0.062, 0.066, 0.07, 12), 0, 0.57, 0.005), 1, jacket); // collar
  // the bib of the trousers up the front and back, and its straps over the shoulders
  add(lathe([[0.001, 0.0], [0.133 * g, 0.02], [0.142 * g, 0.12], [0.146 * g, 0.24], [0.001, 0.245]], 0.73), 1, bib);
  for (const sx of [-1, 1]) add(at(new THREE.BoxGeometry(0.035, 0.24, 0.235 * g), sx * 0.085 * g, 0.36, 0, 1, 1, 1, 0, 0, sx * 0.12), 1, bib);
  // the life jacket: a foam vest (a thick shell round the chest) or an inflatable's yoke (two slim lobes down the front,
  // round the neck), with its waist belt
  if (pfd.foam) {
    add(lathe([[0.001, 0.18], [0.168 * g, 0.19], [0.172 * g, 0.3], [0.178 * g, 0.42], [0.13 * g, 0.47], [0.07, 0.5], [0.001, 0.5]], 0.8), 1, pfd.body);
    add(at(new THREE.BoxGeometry(0.02, 0.2, 0.01), 0, 0.33, -0.142 * g * 0.8 - 0.01), 1, pfd.trim); // the zip
  } else {
    for (const sx of [-1, 1]) add(at(new THREE.CapsuleGeometry(0.042, 0.2, 4, 8), sx * 0.07 * g, 0.36, -0.108 * g, 1, 1, 0.7, -0.08, 0, sx * -0.12), 1, pfd.body);
    add(at(new THREE.TorusGeometry(0.088, 0.02, 5, 14), 0, 0.5, 0.0, 1, 1, 0.85, Math.PI / 2 - 0.2, 0, 0), 1, pfd.body);
    for (const sx of [-1, 1]) add(at(new THREE.BoxGeometry(0.012, 0.16, 0.012), sx * 0.07 * g, 0.36, -0.14 * g), 1, pfd.trim);
  }
  add(at(new THREE.TorusGeometry(0.136 * g, 0.008, 4, 18), 0, 0.17, 0, 1, 1, 0.74, Math.PI / 2, 0, 0), 1, 0x15171a); // the waist belt
  // the head: neck, skull, face (nose, ears), hair, sunglasses, and a cap with a peak or a visor
  add(at(tube(0.05, 0.055, 0.1, 8), 0, 0.07, 0), 2, skin);
  add(at(ball(0.1, 14, 10), 0, 0.13, 0.0, 0.9, 1.08, 1.0), 2, skin);
  add(at(ball(0.022, 6, 5), 0, 0.115, -0.098, 0.8, 1.1, 1), 2, skin); // nose
  for (const sx of [-1, 1]) add(at(ball(0.022, 6, 5), sx * 0.09, 0.125, 0.005, 0.5, 1, 0.8), 2, skin);
  add(at(ball(0.103, 12, 8), 0, 0.14, 0.012, 0.92, 1.0, 1.0), 2, hair);
  if (ponytail) add(at(new THREE.CapsuleGeometry(0.03, 0.12, 3, 8), 0, 0.09, 0.115, 1, 1, 1, -0.5, 0, 0), 2, hair);
  if (shades) add(at(new THREE.CylinderGeometry(0.098, 0.098, 0.03, 12, 1, true, Math.PI - 1.05, 2.1), 0, 0.145, -0.004, 0.92, 1, 1.02), 2, 0x101214); // sunglasses, wrapped round the face
  if (headwear === 'cap' || headwear === 'visor') {
    if (headwear === 'cap') add(at(new THREE.SphereGeometry(0.107, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.17, 0.008, 0.95, 0.85, 1.0), 2, hat);
    else add(at(tube(0.104, 0.104, 0.035, 12), 0, 0.2, 0.008, 0.93, 1, 1), 2, hat);
    add(at(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 12, 1, false, -Math.PI / 2, Math.PI), 0, 0.175, -0.07, 1, 1, 1.15, 0.12, 0, 0), 2, hat); // the peak
  } else if (headwear === 'beanie') add(at(new THREE.SphereGeometry(0.11, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.15, 0.01, 0.95, 1.05, 1.0), 2, pick([0x1d2330, 0x8f2a24, 0x2b4f8a, 0x3a3f47], seed, 12));
  // arms: the spray top's sleeves (a deltoid at the shoulder), the cuffs, sailing gloves
  for (const i of [0, 1]) {
    add(at(ball(0.057 * g, 10, 8), 0, -0.02, 0, 1, 1, 0.95), 3 + 2 * i, jacket);
    add(tube(0.058 * g, 0.046 * g, BONE.upper, 10), 3 + 2 * i, jacket);
    add(at(ball(0.047 * g, 8, 6), 0, 0, 0), 4 + 2 * i, jacket); // the elbow
    add(tube(0.046 * g, 0.038, BONE.fore - 0.03, 10), 4 + 2 * i, jacket);
    add(at(tube(0.042, 0.042, 0.03, 8), 0, -BONE.fore + 0.03, 0), 4 + 2 * i, 0x101214); // cuff
    add(at(new THREE.CapsuleGeometry(0.036, 0.05, 3, 8), 0, -BONE.fore - 0.05, -0.008, 1.05, 1, 0.65), 4 + 2 * i, glove);
    add(at(new THREE.CapsuleGeometry(0.014, 0.03, 2, 6), (i ? -1 : 1) * 0.03, -BONE.fore - 0.04, -0.03, 1, 1, 1, 0.5, 0, (i ? 1 : -1) * 0.5), 4 + 2 * i, glove); // the thumb
  }
  // legs: the bib trousers over the thighs and shins, knees, sailing boots with pale soles
  for (const i of [0, 1]) {
    add(at(ball(0.088 * g, 10, 8), 0, 0, 0, 1, 1, 0.95), 7 + 2 * i, bib);
    add(tube(0.085 * g, 0.06 * g, BONE.thigh, 12), 7 + 2 * i, bib);
    add(at(ball(0.062 * g, 8, 6), 0, 0, -0.005), 8 + 2 * i, bib); // the knee
    add(tube(0.06 * g, 0.05, BONE.shin - 0.1, 10), 8 + 2 * i, bib);
    add(at(tube(0.056, 0.05, 0.14, 10), 0, -BONE.shin + 0.12, 0), 8 + 2 * i, boot); // the boot's leg
    add(at(new THREE.CapsuleGeometry(0.048, 0.17, 4, 8), 0, -BONE.shin - 0.02, -0.06, 1.05, 0.9, 1, Math.PI / 2, 0, 0), 8 + 2 * i, boot);
    add(at(new THREE.BoxGeometry(0.1, 0.022, 0.27), 0, -BONE.shin - 0.065, -0.06), 8 + 2 * i, sole);
  }

  // into one skinned geometry: each piece moved to its bone's rest place and weighted wholly to it, coloured per vertex
  hips.updateMatrixWorld(true);
  const parts = P.map(({ g: g2, bone, color }) => {
    const geo = (g2.index ? g2.toNonIndexed() : g2); geo.deleteAttribute('uv');
    geo.applyMatrix4(bones[bone].matrixWorld);
    const n = geo.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; si[v * 4] = bone; sw[v * 4] = 1; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    return geo;
  });
  const geom = mergeGeometries(parts)!; parts.forEach(q => q.dispose());
  const mesh = new THREE.SkinnedMesh(geom, BODY_MAT);
  mesh.add(hips); root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  return { root, torso: spine, head, arm: [{ root: sh[0], mid: el[0] }, { root: sh[1], mid: el[1] }], leg: [{ root: hp[0], mid: kn[0] }, { root: hp[1], mid: kn[1] }], scale: s, mesh };
}

/** One material for everyone (the colours are in the vertices): a little sheen, as on wet foul-weather gear. */
const BODY_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 22, specular: 0x2a2a2a });

// ———————————————————————————— design examples ————————————————————————————

interface Kit { skin: number; hair: number; pfd: { body: number; trim: number; foam: boolean }; bib: number; hat: number; headwear: 'cap' | 'visor' | 'beanie' | 'none'; ponytail: boolean; shades: boolean; boot: number; jacket: number; beanie: number }
function kitFor(seed: number, jacket: number): Kit {
  const tone = Math.floor(hash(seed, 1) * SKINS.length);
  return {
    skin: SKINS[tone], hair: pick(tone >= 6 ? HAIR_DARK : HAIR_FAIR, seed, 2), pfd: pick(PFDS, seed, 3), bib: pick(BIBS, seed, 4), hat: pick(HATS, seed, 5),
    headwear: (['cap', 'cap', 'cap', 'visor', 'beanie', 'none'] as const)[Math.floor(hash(seed, 6) * 6)], ponytail: hash(seed, 7) < 0.3, shades: hash(seed, 8) < 0.7,
    boot: pick([0x2a2d33, 0x3a3f47, 0x1e2a3a], seed, 9), jacket: hash(seed, 10) < 0.5 ? pick(TOPS, seed, 11) : jacket, beanie: pick([0x1d2330, 0x8f2a24, 0x2b4f8a, 0x3a3f47], seed, 12)
  };
}

/** A piece weighted to one or two bones per vertex (its geometry already in the rest pose's frame, the hips at 0). */
interface Soft { g: THREE.BufferGeometry; w: (v: THREE.Vector3) => [number, number, number]; color: (v: THREE.Vector3, n: THREE.Vector3) => number }
const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A tube down from `top` along −y through rings at depths `d` (m below the top), each an ellipse (half-width, half-depth). */
function ringTube(top: THREE.Vector3, d: number[], rx: number[], rz: number[], seg = 12, zOff: number[] = []): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  d.forEach((dy, i) => { for (let j = 0; j < seg; j++) { const a = j / seg * Math.PI * 2; pos.push(top.x + Math.sin(a) * rx[i], top.y - dy, top.z + Math.cos(a) * rz[i] + (zOff[i] ?? 0)); } });
  for (let i = 0; i < d.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, e = b + seg; idx.push(a, c, b, b, c, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function buildLook(style: 'refined' | 'smooth' | 'dressed', p: Person, jacketIn: number, seed: number): Body {
  const s = p.h / 1.75, g = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24))), K = kitFor(seed, jacketIn), jacket = K.jacket;
  const bulk = style === 'dressed' ? 1.1 : 1; // (foul-weather layers: a spray top over a fleece, bibs over thermals)
  const root = new THREE.Group(); root.scale.setScalar(s);
  const B = (parent: THREE.Object3D | null, x: number, y: number, z: number) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent?.add(b); return b; };
  const hips = B(null, 0, 0, 0), spine = B(hips, 0, 0, 0), head = B(spine, 0, BONE.headY, 0);
  const sh = [-1, 1].map(sx => B(spine, sx * BONE.shoulderX * g, BONE.shoulderY, 0)), el = sh.map(b => B(b, 0, -BONE.upper, 0));
  const hp = [-1, 1].map(sx => B(hips, sx * BONE.hipX * g, 0, 0)), kn = hp.map(b => B(b, 0, -BONE.thigh, 0));
  head.rotation.order = 'YXZ';
  const bones = [hips, spine, head, sh[0], el[0], sh[1], el[1], hp[0], kn[0], hp[1], kn[1]];
  hips.updateMatrixWorld(true);
  const rigid: Piece[] = [], soft: Soft[] = [];
  const add = (g2: THREE.BufferGeometry, bone: number, color: number) => rigid.push({ g: g2, bone, color });
  const tape = 0xd9dcd6; // (reflective tape, pale grey in daylight)
  const smooth = style !== 'refined';

  if (smooth) {
    // ——— one continuous body: torso, legs, arms and neck as swept tubes, each joint's rings shared between its two bones
    // torso: from the seat up to the base of the neck, the hips' bone below the waist and the spine's above, blended
    // between (y −0.02 to 0.18) so the waist bends as one; the bibs below the chest, the spray top above
    const ty = [-0.125, -0.06, 0, 0.08, 0.16, 0.235, 0.245, 0.26, 0.36, 0.44, 0.5, 0.545, 0.575]; // ring heights (m) above the hips (two close at 0.24: a clean hem between bibs and top)
    const wX = [0.12, 0.155, 0.16, 0.148, 0.145, 0.152, 0.154, 0.155, 0.17, 0.185, 0.16, 0.09, 0.06].map(r => r * g * bulk);
    const wZ = [0.1, 0.12, 0.118, 0.105, 0.1, 0.107, 0.109, 0.11, 0.12, 0.115, 0.1, 0.07, 0.055].map(r => r * Math.sqrt(g) * bulk);
    soft.push({ g: ringTube(V3(0, 0, 0), ty.map(y => -y), wX, wZ, 16, ty.map(y => y > 0.3 && y < 0.5 ? -0.01 : 0)), w: v => { const t = sstep(-0.02, 0.18, v.y); return [0, 1, t]; },
      color: v => v.y < 0.24 ? K.bib : jacket });
    // legs: from inside the seat down to the ankle, the hip's bone above the knee and the knee's below, blended over
    // 0.12 m at the knee; the top rings shared with the hips' bone (the seat bends with the pelvis, not torn from it)
    for (const i of [0, 1]) {
      const x = (i ? 1 : -1) * BONE.hipX * g, d = [-0.06, 0, 0.12, 0.3, 0.4, 0.43, 0.46, 0.56, 0.7, 0.715, 0.725, 0.8, 0.86];
      const r = [0.1, 0.098, 0.088, 0.072, 0.062, 0.06, 0.06, 0.062, 0.05, 0.049, 0.052, 0.047, 0.045].map(q => q * g * bulk);
      soft.push({ g: ringTube(V3(x, 0, 0), d, r, r.map(q => q * 0.95), 12), w: v => {
        const y = -v.y; if (y < 0.08) return [0, 7 + 2 * i, sstep(-0.06, 0.08, y)];
        return [7 + 2 * i, 8 + 2 * i, sstep(BONE.thigh - 0.06, BONE.thigh + 0.06, y)]; },
        color: v => -v.y > 0.72 ? K.boot : (style === 'dressed' && Math.abs(-v.y - BONE.thigh) < 0.05 ? shade(K.bib, 0.7) : K.bib) });
    }
    // arms: from inside the shoulder down to the wrist, shared with the spine at the top (the shoulder rounds into the
    // chest), the upper arm's bone above the elbow and the forearm's below
    for (const i of [0, 1]) {
      const x = (i ? 1 : -1) * BONE.shoulderX * g, d = [-0.04, 0, 0.05, 0.16, 0.27, 0.3, 0.33, 0.45, 0.52, 0.555];
      const r = [0.06, 0.066, 0.062, 0.054, 0.047, 0.046, 0.046, 0.04, 0.036, 0.037].map(q => q * g * bulk);
      soft.push({ g: ringTube(V3(x, BONE.shoulderY, 0), d, r, r.map(q => q * 0.9), 10), w: v => {
        const y = BONE.shoulderY - v.y; if (y < 0.06) return [1, 3 + 2 * i, sstep(-0.04, 0.06, y)];
        return [3 + 2 * i, 4 + 2 * i, sstep(BONE.upper - 0.05, BONE.upper + 0.05, y)]; },
        color: v => { const y = BONE.shoulderY - v.y; return style === 'dressed' && y > 0.44 && y < 0.47 ? tape : y > 0.535 ? 0x101214 : jacket; } });
    }
    // the neck: the spine's at its base, the head's above
    soft.push({ g: ringTube(V3(0, 0.66, 0), [0, 0.06, 0.12, 0.17], [0.05, 0.05, 0.055, 0.06], [0.05, 0.052, 0.058, 0.06], 10), w: v => [1, 2, sstep(0.52, 0.6, v.y)], color: v => v.y < 0.53 ? jacket : K.skin });
    // hood rolled at the collar (dressed) or a plain high collar
    add(at(new THREE.TorusGeometry(0.075 * bulk, style === 'dressed' ? 0.032 : 0.018, 6, 16), 0, 0.555, 0.012, 1, 1, 0.9, Math.PI / 2, 0, 0), 1, jacket);
  } else {
    // ——— refined, in pieces as today, each on its bone: a shaped torso (chest, waist, shoulders), deltoids, a neck
    add(at(new THREE.CapsuleGeometry(0.118 * g, 0.12 * g, 6, 16), 0, 0.03, 0.01, 1, 1, 0.82, 0, 0, Math.PI / 2), 0, K.bib);
    add(lathe([[0.001, 0.0], [0.128 * g, 0.02], [0.14 * g, 0.1], [0.138 * g, 0.2], [0.155 * g, 0.32], [0.172 * g, 0.42], [0.16 * g, 0.47], [0.11 * g, 0.51], [0.06, 0.54], [0.001, 0.545]], 0.68, 18), 1, jacket);
    add(lathe([[0.001, 0.0], [0.135 * g, 0.02], [0.145 * g, 0.12], [0.148 * g, 0.24], [0.001, 0.245]], 0.72, 18), 1, K.bib);
    add(at(tube(0.05, 0.055, 0.12, 10), 0, 0.1, 0), 2, K.skin); // neck (in the head's frame)
    add(at(new THREE.TorusGeometry(0.072, 0.02, 6, 16), 0, 0.555, 0.01, 1, 1, 0.88, Math.PI / 2, 0, 0), 1, jacket); // the hood rolled at the collar
    add(at(new THREE.BoxGeometry(0.012, 0.26, 0.006), 0, 0.4, -0.118 * g), 1, 0x101214); // the zip
    for (const i of [0, 1]) {
      add(at(ball(0.066 * g, 12, 9), 0, -0.015, 0, 1.05, 1.1, 1), 3 + 2 * i, jacket); // deltoid
      add(tube(0.06 * g, 0.047 * g, BONE.upper, 12), 3 + 2 * i, jacket);
      add(at(ball(0.048 * g, 10, 8), 0, 0, 0), 4 + 2 * i, jacket);
      add(tube(0.047 * g, 0.037, BONE.fore - 0.03, 12), 4 + 2 * i, jacket);
      add(at(tube(0.04, 0.04, 0.025, 10), 0, -BONE.fore + 0.06, 0), 4 + 2 * i, tape); // reflective cuff tape
      add(at(tube(0.041, 0.041, 0.03, 10), 0, -BONE.fore + 0.03, 0), 4 + 2 * i, 0x101214); // cuff
      add(at(ball(0.088 * g, 12, 9), 0, 0, 0, 1, 1, 0.95), 7 + 2 * i, K.bib);
      add(tube(0.086 * g, 0.06 * g, BONE.thigh, 14), 7 + 2 * i, K.bib);
      add(at(ball(0.064 * g, 10, 8), 0, 0, -0.006), 8 + 2 * i, shade(K.bib, 0.72)); // knee patch
      add(tube(0.06 * g, 0.05, BONE.shin - 0.14, 12), 8 + 2 * i, K.bib);
      add(at(tube(0.058, 0.05, 0.2, 12), 0, -BONE.shin + 0.18, 0), 8 + 2 * i, K.boot); // a taller boot
    }
    for (const sx of [-1, 1]) add(at(new THREE.BoxGeometry(0.035, 0.24, 0.235 * g), sx * 0.085 * g, 0.36, 0, 1, 1, 1, 0, 0, sx * 0.12), 1, K.bib); // the straps
  }

  // ——— shared: the life jacket, the waist belt, the head and face, hands, boots' feet
  if (K.pfd.foam) {
    add(lathe([[0.001, 0.18], [0.17 * g * bulk, 0.19], [0.176 * g * bulk, 0.3], [0.182 * g * bulk, 0.42], [0.134 * g * bulk, 0.47], [0.075, 0.5], [0.001, 0.5]], 0.8, 16), 1, K.pfd.body);
    add(at(new THREE.BoxGeometry(0.02, 0.2, 0.01), 0, 0.33, -0.146 * g * bulk * 0.8 - 0.01), 1, K.pfd.trim);
    if (style === 'dressed') add(at(new THREE.TorusGeometry(0.176 * g * bulk, 0.008, 4, 20), 0, 0.36, 0, 1, 1, 0.8, Math.PI / 2, 0, 0), 1, tape);
  } else {
    for (const sx of [-1, 1]) add(at(new THREE.CapsuleGeometry(0.044, 0.2, 4, 10), sx * 0.072 * g, 0.36, -0.112 * g * bulk, 1, 1, 0.7, -0.08, 0, sx * -0.12), 1, K.pfd.body);
    add(at(new THREE.TorusGeometry(0.09, 0.021, 6, 16), 0, 0.5, 0.0, 1, 1, 0.85, Math.PI / 2 - 0.2, 0, 0), 1, K.pfd.body);
    for (const sx of [-1, 1]) add(at(new THREE.BoxGeometry(0.012, 0.16, 0.012), sx * 0.072 * g, 0.36, -0.146 * g * bulk), 1, style === 'dressed' ? tape : K.pfd.trim);
  }
  // (no waist belt on the one-piece bodies: bib salopettes have none, and the life jacket's own is part of it)
  if (!smooth) add(at(new THREE.TorusGeometry(0.14 * g * bulk, 0.008, 4, 20), 0, 0.17, 0, 1, 1, 0.74, Math.PI / 2, 0, 0), 1, 0x15171a);
  // the head: a skull with a jaw and chin, a brow, cheekbones, the nose, ears; hair, sunglasses, the cap or beanie
  add(at(ball(0.098, 18, 14), 0, 0.14, 0.004, 0.88, 1.06, 1.0), 2, K.skin);
  add(at(ball(0.06, 12, 8), 0, 0.075, -0.035, 1.15, 0.8, 1.0), 2, K.skin); // jaw
  add(at(ball(0.024, 8, 6), 0, 0.06, -0.075, 1.1, 0.9, 0.9), 2, K.skin); // chin
  add(at(ball(0.05, 10, 6), 0, 0.175, -0.07, 1.5, 0.45, 0.7), 2, shade(K.skin, 0.95)); // the brow
  add(at(ball(0.02, 8, 6), 0, 0.125, -0.1, 0.75, 1.25, 1.05), 2, K.skin); // nose
  for (const sx of [-1, 1]) {
    add(at(ball(0.023, 8, 6), sx * 0.088, 0.13, 0.008, 0.45, 1, 0.8), 2, K.skin); // ears
    if (!K.shades) add(at(ball(0.012, 6, 5), sx * 0.034, 0.152, -0.091, 1.2, 0.7, 0.5), 2, 0x2a1d15); // eyes in shadow
  }
  add(at(ball(0.1, 14, 10), 0, 0.15, 0.014, 0.92, 1.0, 1.0), 2, K.hair);
  if (K.ponytail) add(at(new THREE.CapsuleGeometry(0.03, 0.12, 3, 8), 0, 0.09, 0.115, 1, 1, 1, -0.5, 0, 0), 2, K.hair);
  if (K.shades) add(at(new THREE.CylinderGeometry(0.097, 0.097, 0.03, 14, 1, true, Math.PI - 1.05, 2.1), 0, 0.15, -0.004, 0.9, 1, 1.02), 2, 0x101214);
  if (K.headwear === 'cap' || K.headwear === 'visor') {
    if (K.headwear === 'cap') add(at(new THREE.SphereGeometry(0.106, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.175, 0.01, 0.94, 0.85, 1.0), 2, K.hat);
    else add(at(tube(0.103, 0.103, 0.035, 14), 0, 0.205, 0.01, 0.92, 1, 1), 2, K.hat);
    add(at(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 12, 1, false, -Math.PI / 2, Math.PI), 0, 0.18, -0.07, 1, 1, 1.15, 0.12, 0, 0), 2, K.hat);
  } else if (K.headwear === 'beanie') add(at(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.155, 0.012, 0.95, 1.05, 1.0), 2, K.beanie);
  // hands: a sailing glove's palm and four fingers together, the thumb apart, a little curled (as round a sheet)
  for (const i of [0, 1]) {
    const sx = i ? -1 : 1;
    add(at(new THREE.BoxGeometry(0.075, 0.075, 0.03, 2, 2, 1), 0, -BONE.fore - 0.035, -0.006), 4 + 2 * i, 0x15171a);
    add(at(new THREE.CapsuleGeometry(0.016, 0.05, 3, 6), 0, -BONE.fore - 0.09, -0.016, 2.3, 1, 1, 0.35, 0, 0), 4 + 2 * i, 0x15171a);
    add(at(new THREE.CapsuleGeometry(0.012, 0.035, 2, 6), sx * 0.04, -BONE.fore - 0.035, -0.025, 1, 1, 1, 0.5, 0, sx * 0.6), 4 + 2 * i, 0x15171a);
    // boots: the foot, a pale sole, and (dressed) a tread band
    add(at(new THREE.CapsuleGeometry(0.05, 0.17, 4, 10), 0, -BONE.shin - 0.02, -0.06, 1.05, 0.9, 1, Math.PI / 2, 0, 0), 8 + 2 * i, K.boot);
    add(at(new THREE.BoxGeometry(0.1, 0.022, 0.27), 0, -BONE.shin - 0.066, -0.06), 8 + 2 * i, 0xd8d4cc);
    if (smooth) add(at(tube(0.05, 0.05, 0.03, 10), 0, -BONE.shin + 0.15, 0), 8 + 2 * i, style === 'dressed' ? shade(K.boot, 1.6) : K.boot); // the boot's top
  }

  // ——— into one skinned mesh
  const ao = style === 'dressed'; // (baked shade: under the arms, between the legs, the undersides; as daylight falls on a figure)
  const parts: THREE.BufferGeometry[] = [];
  const finish = (geo: THREE.BufferGeometry, si: (v: THREE.Vector3) => [number, number, number], col: (v: THREE.Vector3, n: THREE.Vector3) => number) => {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const n = geo.attributes.position.count, P = geo.attributes.position, N = geo.attributes.normal, cA = new Float32Array(n * 3), sI = new Uint16Array(n * 4), sW = new Float32Array(n * 4);
    const v = new THREE.Vector3(), nn = new THREE.Vector3(), c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      v.fromBufferAttribute(P, k); nn.fromBufferAttribute(N, k);
      const [a, b, t] = si(v); sI[k * 4] = a; sI[k * 4 + 1] = b; sW[k * 4] = 1 - t; sW[k * 4 + 1] = t;
      c.setHex(col(v, nn));
      if (ao) { const inward = Math.abs(v.x) > 0.02 ? -Math.sign(v.x) * nn.x : 0; c.multiplyScalar(1 - 0.28 * Math.max(0, -nn.y) - 0.22 * Math.max(0, inward) * (v.y < 0.1 || Math.abs(v.x) > 0.15 ? 1 : 0)); }
      cA[k * 3] = c.r; cA[k * 3 + 1] = c.g; cA[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cA, 3)); geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sI, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    parts.push(geo);
  };
  for (const r of rigid) { const geo = r.g.index ? r.g.toNonIndexed() : r.g; geo.applyMatrix4(bones[r.bone].matrixWorld); geo.computeVertexNormals(); finish(geo, () => [r.bone, r.bone, 0], () => r.color); }
  for (const q of soft) { const geo = q.g.toNonIndexed(); geo.computeVertexNormals(); finish(geo, q.w, q.color); }
  const geom = mergeGeometries(parts)!; parts.forEach(q => q.dispose());
  if (smooth) { // (smooth shading across each tube's faces, not faceted: the positions welded for the normals only)
    const welded = mergeVertices(geom.clone().deleteAttribute('normal').deleteAttribute('color').deleteAttribute('skinIndex').deleteAttribute('skinWeight'), 1e-4); welded.computeVertexNormals();
    // (copy normals back by position)
    const map = new Map<string, number>(), WP = welded.attributes.position, WN = welded.attributes.normal;
    for (let k = 0; k < WP.count; k++) map.set(`${WP.getX(k).toFixed(4)},${WP.getY(k).toFixed(4)},${WP.getZ(k).toFixed(4)}`, k);
    const GP = geom.attributes.position, GN = geom.attributes.normal;
    for (let k = 0; k < GP.count; k++) { const j = map.get(`${GP.getX(k).toFixed(4)},${GP.getY(k).toFixed(4)},${GP.getZ(k).toFixed(4)}`); if (j != null) GN.setXYZ(k, WN.getX(j), WN.getY(j), WN.getZ(j)); }
    GN.needsUpdate = true; welded.dispose();
  }
  const mesh = new THREE.SkinnedMesh(geom, style === 'dressed' ? DRESSED_MAT : BODY_MAT);
  mesh.add(hips); root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  return { root, torso: spine, head, arm: [{ root: sh[0], mid: el[0] }, { root: sh[1], mid: el[1] }], leg: [{ root: hp[0], mid: kn[0] }, { root: hp[1], mid: kn[1] }], scale: s, mesh };
}
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Dressed: a matte waterproof cloth, a soft sheen, not the wet shine. */
const DRESSED_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10, specular: 0x1a1a1a });
