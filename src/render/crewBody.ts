import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

const SKINS = [0xe0b99a, 0xc99b78, 0x9c6b4c, 0x6e4a33, 0xf0cfb4, 0xd9a886];
const HAIR = [0x3b2a1e, 0x1d1712, 0x8a6a3e, 0xc9b28a, 0x6b4a2e, 0x9a9a96];
/** Life jackets: an inflatable's slim yoke (dark, with a coloured trim, as the Gill in Josephine's photo) or a foam vest. */
const PFDS: { body: number; trim: number; foam: boolean }[] = [
  { body: 0x1c2026, trim: 0xe0482c, foam: false }, { body: 0x24406e, trim: 0x1c2026, foam: true },
  { body: 0x1c2026, trim: 0x2e8fbf, foam: false }, { body: 0xd8432e, trim: 0x1c2026, foam: true }
];
const BIBS = [0x23272e, 0x2c3440, 0x3a3f47, 0x1e2a3a];
const HATS = [0x1d2330, 0xe8e4d8, 0xc8372d, 0x2b4f8a, 0xd9c9a3];

/** A piece of the body on one bone: its geometry in that bone's frame, and its colour. */
interface Piece { g: THREE.BufferGeometry; bone: number; color: number }

const tube = (r0: number, r1: number, len: number, seg = 10) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false); g.translate(0, -len / 2, 0); return g; }; // from y 0 down to −len, r0 at the top
const ball = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))); return g;
};
/** A body of revolution (y up) from a profile of (radius, y), flattened front to back by `flat`. */
const lathe = (pts: [number, number][], flat: number, seg = 14) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.scale(1, 1, flat); return g; };

export function buildBody(p: Person, jacket: number, seed: number): Body {
  const s = p.h / 1.75, girth = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24))), g = girth;
  const skin = SKINS[seed % SKINS.length], hair = HAIR[(seed * 7) % HAIR.length], pfd = PFDS[seed % PFDS.length], bib = BIBS[(seed * 3) % BIBS.length];
  const hat = HATS[(seed * 5) % HATS.length], glove = 0x15171a, boot = 0x2a2d33, sole = 0xd8d4cc;
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
  add(at(new THREE.CylinderGeometry(0.098, 0.098, 0.03, 12, 1, true, Math.PI - 1.05, 2.1), 0, 0.145, -0.004, 0.92, 1, 1.02), 2, 0x101214); // sunglasses, wrapped round the face
  const visor = seed % 4 === 2;
  if (!visor) add(at(new THREE.SphereGeometry(0.107, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.17, 0.008, 0.95, 0.85, 1.0), 2, hat);
  else add(at(tube(0.104, 0.104, 0.035, 12), 0, 0.2, 0.008, 0.93, 1, 1), 2, hat);
  add(at(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 12, 1, false, -Math.PI / 2, Math.PI), 0, 0.175, -0.07, 1, 1, 1.15, 0.12, 0, 0), 2, hat); // the peak
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
