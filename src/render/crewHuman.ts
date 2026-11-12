import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Person } from '../boat/crewPhys';
import { BONE, kitFor, hash, type Body } from './crewBody';
import H from './human.json';

/**
 * Design examples for the owner: crew built on a real human body, MakeHuman's base mesh (CC0 1.0; decimated, re-posed
 * and skinned to the sim's eleven-bone skeleton by scripts/assets/build-human.py → render/human.json). Clothes are the
 * body's own surface pushed out region by region (a loose jacket, salopettes, sea boots, gloves, a cap or a hood), so
 * they bend with the body for no extra triangles; folds are ripples in that push, different for each person.
 * Round 3 (round 2's realistic faces were "uncanny valley"): people, not photographs. The four looks are in LOOKS.
 */
export type HumanStyle = 'hidden' | 'figurine' | 'soft' | 'friendly';

/** Round 3 (after "uncanny valley" on round 2's faces): people, not photographs. What each direction does. */
interface Look {
  loose: number; fold: number; collarTop: number; collarR: number; collarZ: number; // the kit
  face: 'none' | 'dots'; smooth: number; headScale: number; // the face: no features or dots for eyes; smoothing passes
  hats: 'always' | 'kit'; shades: 'always' | 'kit' | 'none'; hood: boolean; detail: boolean; mat: THREE.Material; skinMix: number;
}
const MATTE = new THREE.MeshLambertMaterial({ vertexColors: true });

const N = H.pos.length / 3;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Per vertex: the weight of each of the 11 bones (from the two the asset stores). */
const WB = (() => {
  const w = new Float32Array(N * 11);
  for (let v = 0; v < N; v++) { const t = H.w[v]; w[v * 11 + H.bone[2 * v]] += 1 - t; w[v * 11 + H.bone[2 * v + 1]] += t; }
  return w;
})();
const wt = (v: number, ...bones: number[]) => bones.reduce((s, b) => s + WB[v * 11 + b], 0);
const J = H.joints as Record<string, number[]>;

type Hair = 'crop' | 'short' | 'long' | 'curly' | 'bald' | 'bun';
const PEOPLE: { hair: Hair; beard: 'none' | 'full' | 'stubble'; older: boolean }[] = [
  { hair: 'long', beard: 'none', older: false }, { hair: 'short', beard: 'full', older: false }, { hair: 'curly', beard: 'stubble', older: false },
  { hair: 'bun', beard: 'none', older: false }, { hair: 'bald', beard: 'full', older: true }, { hair: 'crop', beard: 'stubble', older: false }];

const MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10, specular: 0x141414 });

const LOOKS: Record<HumanStyle, Look> = {
  // faces hidden as sailors' are: a cap, a beanie or the hood up, wraparound glasses, the collar zipped to the chin
  hidden: { loose: 1, fold: 0.006, collarTop: 0.612, collarR: 0.092, collarZ: -0.012, face: 'none', smooth: 2, headScale: 1, hats: 'always', shades: 'always', hood: true, detail: true, mat: MAT, skinMix: 0.25 },
  // a well-made figurine: matte, soft light, crisp clothes without folds, the face in simple planes
  figurine: { loose: 0.85, fold: 0, collarTop: 0.585, collarR: 0.077, collarZ: 0.005, face: 'none', smooth: 14, headScale: 1, hats: 'kit', shades: 'kit', hood: false, detail: false, mat: MATTE, skinMix: 0.35 },
  // real at 5–10 m: the kit as round 2, the face only a nose and a brow line in soft shade
  soft: { loose: 1, fold: 0.006, collarTop: 0.585, collarR: 0.08, collarZ: 0.005, face: 'none', smooth: 3, headScale: 1, hats: 'kit', shades: 'kit', hood: false, detail: true, mat: MAT, skinMix: 0.25 },
  // friendly, as an animated film draws people: a slightly larger head, softened features, dots for eyes
  friendly: { loose: 0.9, fold: 0.003, collarTop: 0.585, collarR: 0.079, collarZ: 0.005, face: 'dots', smooth: 9, headScale: 1.2, hats: 'kit', shades: 'none', hood: false, detail: false, mat: MAT, skinMix: 0.2 },
};

/** The bare body with its face smoothed by `n` passes (Taubin's λ|μ, which smooths without shrinking), and its normals. */
const ADJ = (() => { const a: Set<number>[] = Array.from({ length: N }, () => new Set()); for (let i = 0; i < H.idx.length; i += 3) { const [x, y, z] = [H.idx[i], H.idx[i + 1], H.idx[i + 2]]; a[x].add(y).add(z); a[y].add(x).add(z); a[z].add(x).add(y); } return a.map(s => [...s]); })();
const baseCache = new Map<number, { pos: Float32Array; nrm: Float32Array }>();
function base(n: number) {
  let b = baseCache.get(n); if (b) return b;
  const pos = Float32Array.from(H.pos), tmp = new Float32Array(pos.length);
  // (the face only: the front of the head from the chin to the hairline, fading out toward the ears)
  const m = new Float32Array(N); for (let v = 0; v < N; v++) { const y = H.pos[3 * v + 1], z = H.pos[3 * v + 2]; m[v] = wt(v, 2) > 0.5 ? sstep(-0.01, -0.07, z) * sstep(0.555, 0.58, y) * sstep(0.77, 0.74, y) : 0; }
  for (let k = 0; k < 2 * n; k++) {
    const f = k % 2 ? -0.53 : 0.5;
    for (let v = 0; v < N; v++) {
      if (!m[v]) { tmp[3 * v] = pos[3 * v]; tmp[3 * v + 1] = pos[3 * v + 1]; tmp[3 * v + 2] = pos[3 * v + 2]; continue; }
      let ax = 0, ay = 0, az = 0; const nb = ADJ[v]; for (const u of nb) { ax += pos[3 * u]; ay += pos[3 * u + 1]; az += pos[3 * u + 2]; }
      const w = f * m[v]; tmp[3 * v] = pos[3 * v] + w * (ax / nb.length - pos[3 * v]); tmp[3 * v + 1] = pos[3 * v + 1] + w * (ay / nb.length - pos[3 * v + 1]); tmp[3 * v + 2] = pos[3 * v + 2] + w * (az / nb.length - pos[3 * v + 2]);
    }
    pos.set(tmp);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(H.idx); g.computeVertexNormals();
  b = { pos, nrm: g.attributes.normal.array as Float32Array }; baseCache.set(n, b); return b;
}

export function buildHuman(style: HumanStyle, p: Person, jacketIn: number, seed: number): Body {
  const s = p.h / 1.75, g = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24))), K = kitFor(seed, jacketIn);
  const root = new THREE.Group(); root.scale.setScalar(s);
  const B = (parent: THREE.Object3D | null, x: number, y: number, z: number) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent?.add(b); return b; };
  const hips = B(null, 0, 0, 0), spine = B(hips, 0, 0, 0), head = B(spine, 0, BONE.headY, 0);
  const sh = [-1, 1].map(sx => B(spine, sx * BONE.shoulderX * g, BONE.shoulderY, 0)), el = sh.map(b => B(b, 0, -BONE.upper, 0));
  const hp = [-1, 1].map(sx => B(hips, sx * BONE.hipX * g, 0, 0)), kn = hp.map(b => B(b, 0, -BONE.thigh, 0));
  head.rotation.order = 'YXZ';
  const bones = [hips, spine, head, sh[0], el[0], sh[1], el[1], hp[0], kn[0], hp[1], kn[1]];
  hips.updateMatrixWorld(true);

  // ——— who: hair, face, headwear (the people direction bareheaded mostly, to show them)
  const r = (salt: number) => hash(seed, 40 + salt);
  // (a boat's crew have consecutive seeds, so its people come from this cycle in turn and never look alike)
  const who = PEOPLE[((seed % PEOPLE.length) + PEOPLE.length) % PEOPLE.length];
  const older = who.older, hairStyle = who.hair, beard = who.beard;
  const hairCol = older ? [0x6e6a64, 0x5c5955, 0x7a766f][Math.floor(r(4) * 3)] : K.hair;
  const L = LOOKS[style];
  const skin = mixHex(K.skin, 0xb07a58, L.skinMix); // (a little sun and wind: sailors are seldom pale)
  // (hidden: a third of them with the hood up; the rest in a cap, or a beanie in place of nothing)
  const hoodUp = L.hood && r(9) < 0.34;
  const kitHat = K.headwear === 'visor' ? 'cap' : K.headwear;
  const headwear = hoodUp ? 'none' : L.hats === 'always' && kitHat === 'none' ? 'beanie' : kitHat;
  const shades = L.shades === 'always' || (L.shades === 'kit' && K.shades && headwear !== 'beanie');

  // ——— the kit for each direction: how far each garment stands off the body (m), how deep its folds
  const loose = L.loose, fold = L.fold, hem = -0.085, bootTop = -0.58; // (the jacket to below the hips; sea boots to mid-calf)
  const collarTop = L.collarTop, collarR = L.collarR, cz = L.collarZ;
  const jacket = K.jacket, salop = K.bib, glove = 0x17191d, bootC = K.boot, sole = 0xd2cec4, tape = 0xb4b9bc;
  const BP = base(L.smooth).pos, BN = base(L.smooth).nrm;
  const ph = [0, 1, 2, 3, 4, 5].map(i => hash(seed, 60 + i) * Math.PI * 2);

  // ——— the body pushed out into its clothes; the colour of each place
  const P = new Float32Array(H.pos.length), C = new Float32Array(H.pos.length);
  const v3 = new THREE.Vector3(), col = new THREE.Color();
  for (let v = 0; v < N; v++) {
    const x = BP[3 * v], y = BP[3 * v + 1], z = BP[3 * v + 2], nx = BN[3 * v], ny = BN[3 * v + 1], nz = BN[3 * v + 2];
    const wHead = wt(v, 2), wArm = wt(v, 3, 4, 5, 6), wFore = wt(v, 4, 6), wLeg = wt(v, 7, 8, 9, 10), wShin = wt(v, 8, 10);
    let off = 0, c = jacket, radial = 0;
    const hand = wFore > 0.5 && y < -0.05, foot = wShin > 0.5 && y < bootTop, legs = (wLeg > 0.6 || y < hem) && !foot && wArm < 0.5;
    const isHead = wHead > 0.5 && y > 0.555;
    if (isHead) {
      c = skin; off = 0;
      const hx = Math.abs(x), ear = hx > 0.068 && y < 0.7 && y > 0.62 && z > -0.045 && z < 0.035;
      const line = 0.742 - 0.135 * sstep(-0.11, 0.07, z) + (hairStyle === 'bald' ? 0.0 : 0);
      const scalp = y > line && !ear;
      // the face: brows (in the hair's colour), lips, a beard
      if (beard !== 'none' && z < 0.0 && y < 0.645 && y > 0.545 && !(y > 0.625 && hx > 0.05 && z < -0.08)) {
        c = beard === 'full' ? hairCol : mixHex(skin, hairCol, 0.35); if (beard === 'full') off = 0.005;
      }
      const faceOval = z < -0.055 && (x / 0.064) ** 2 + ((y - 0.655) / 0.088) ** 2 < 1;
      if (hoodUp && faceOval) c = shadeHex(skin, 0.55); // (the face in the hood's shadow)
      if (style === 'soft' || style === 'hidden') { // (the eyes as soft shade under the brow, as a face reads at 5–10 m)
        const d = Math.min(...(['l-eye', 'r-eye'].map(k => Math.hypot(x - J[k][0], (y - J[k][1]) * 1.4))));
        if (z < -0.06) c = mixHex(c, shadeHex(skin, 0.62), sstep(0.024, 0.01, d));
      }
      if (L.face === 'dots' && z < -0.07 && Math.abs(hx - 0.045) < 0.018 && y > 0.625 && y < 0.655) c = mixHex(skin, 0xd8705e, 0.35); // (rosy cheeks)
      if (hoodUp && !faceOval && y > 0.565) { c = jacket; off = 0.026 + 0.012 * sstep(-0.04, 0.06, z); }
      else if (scalp) {
        let hairOn = true, t = 0.005;
        if (hairStyle === 'bald') { hairOn = y < 0.722 && z > -0.03; t = 0.003; }
        else if (hairStyle === 'crop') t = 0.004;
        else if (hairStyle === 'short') t = 0.008 + 0.008 * sstep(0.72, 0.79, y);
        else if (hairStyle === 'curly') t = 0.026 * sstep(line - 0.01, line + 0.04, y) + 0.008;
        else t = 0.01 + 0.004 * sstep(0.72, 0.79, y);
        if (hairOn) { c = hairCol; off = t; }
        if (headwear === 'cap' || headwear === 'beanie') {
          const capLine = headwear === 'cap' ? 0.738 - 0.04 * sstep(-0.1, 0.06, z) : 0.705 - 0.045 * sstep(-0.1, 0.06, z);
          if (y > capLine) { c = headwear === 'cap' ? K.hat : K.beanie; off = (headwear === 'cap' ? 0.011 : 0.014) + Math.max(0, off - 0.008); }
          if (headwear === 'beanie' && y > capLine && y < capLine + 0.025) off += 0.004; // (its turned-up cuff)
        }
      } else if (headwear === 'beanie' && y > 0.705 - 0.045 * sstep(-0.1, 0.06, z) && !ear && z > -0.13) { c = K.beanie; off = 0.014; }
      if (y < collarTop && y > 0.5) { const rr = Math.hypot(x, z - cz); radial = Math.max(0, collarR - rr) * sstep(collarTop, collarTop - 0.025, y); c = jacket; off = 0; }
    } else if (hand) { c = glove; off = 0.003; }
    else if (foot) {
      c = y < -0.925 ? sole : bootC; off = 0.012 + 0.01 * sstep(bootTop - 0.04, bootTop, y);
    } else if (legs) {
      c = salop; off = 0.006 + 0.018 * loose + 0.01 * loose * sstep(-0.4, -0.58, y);
      if (L.detail && wShin > 0.4 && Math.abs(y + 0.43) < 0.06 && z < 0) c = shadeHex(salop, 0.75); // (knee patches)
      // folds: behind the knee and round the seat, ripples down the shin
      const ax = Math.sign(x) * BONE.hipX, th = Math.atan2(z, x - ax);
      off += fold * Math.sin(y / 0.1 * Math.PI * 2 + 1.6 * Math.sin(th + ph[0]) + ph[1]) * (0.5 + sstep(0.12, 0, Math.abs(y + 0.43)));
    } else {
      // the jacket (spray top): the torso, the arms to the wrist, a collar standing up round the neck
      c = jacket; off = 0.006 + 0.022 * loose;
      if (wArm > 0.5) {
        const ax = Math.sign(x) * BONE.shoulderX, th = Math.atan2(z, x - ax);
        off = 0.006 + 0.02 * loose + 0.008 * loose * sstep(0.2, -0.05, y); // (sleeves fuller to the cuff)
        off += fold * Math.sin(y / 0.09 * Math.PI * 2 + 1.8 * Math.sin(th + ph[2]) + ph[3]) * (0.45 + sstep(0.1, 0, Math.abs(y - (BONE.shoulderY - BONE.upper))));
        if (y < -0.03 && y > -0.05) { c = L.detail ? tape : shadeHex(jacket, 0.8); off += 0.002; } // the cuff (neoprene, or a reflective band)
      } else {
        const th = Math.atan2(z, x);
        off += 0.012 * loose * sstep(0.12, -0.04, y); // (the hem stands off the hips: the jacket hangs, it isn't skin)
        off += fold * (Math.sin(th * 6 + ph[4]) * sstep(0.3, 0.05, y) + 0.7 * Math.sin(y / 0.08 * Math.PI * 2 + ph[5]) * sstep(0.2, 0.05, y) * sstep(-0.04, 0.05, y));
        // the life jacket: an inflatable's yoke (bands up the chest, over the shoulders, round the back of the neck) or a foam vest
        const hx = Math.abs(x);
        if (K.pfd.foam) {
          if (y > 0.17 && y < 0.49) { c = K.pfd.body; off += 0.03; if (hx < 0.008 && z < 0) c = K.pfd.trim; }
        } else {
        }
        if (hx < 0.005 && z < 0 && y > 0.1 && y < 0.44 && !(K.pfd.foam)) c = 0x101214; // the zip
      }
      if (y > 0.5 && wHead < 0.9 && y < collarTop) { // the collar: round the neck at a jacket's own radius
        const rr = Math.hypot(x, z - cz); radial = Math.max(0, collarR - rr) * sstep(collarTop, collarTop - 0.025, y);
        c = jacket; off = 0;
      }
    }
    if (hairStyle === 'long' && !hoodUp && headwear !== 'cap' && z > 0.0 && y > 0.545 && y < 0.64 && wHead > 0.5 && !(y < collarTop && y < 0.555)) { c = hairCol; off = Math.max(off, 0.014); }
    if (wHead > 0.5 && y <= 0.555 && y > 0.5) { // (the neck between the collar and the chin)
      if (y < collarTop) { const rr = Math.hypot(x, z - cz); radial = Math.max(0, collarR - rr) * sstep(collarTop, collarTop - 0.025, y); c = jacket; } else c = skin;
    }
    // girth for build: the body wider for a heavier person, not the head
    const gx = 1 + (g - 1) * (1 - wHead), gz = 1 + (Math.sqrt(g) - 1) * (1 - wHead);
    let px = x * gx + nx * off, py = y + ny * off, pz = z * gz + nz * off;
    if (radial > 0) { const rr = Math.hypot(x, z - cz) || 1; px += x / rr * radial; pz += (z - cz) / rr * radial; }
    P[3 * v] = px; P[3 * v + 1] = py; P[3 * v + 2] = pz;
    if (L.mat === MATTE) c = mixHex(c, 0xefe6d6, 0.18);
    col.setHex(c); C[3 * v] = col.r; C[3 * v + 1] = col.g; C[3 * v + 2] = col.b;
  }
  const SI = new Uint16Array(N * 4), SW = new Float32Array(N * 4);
  for (let v = 0; v < N; v++) { SI[4 * v] = H.bone[2 * v]; SI[4 * v + 1] = H.bone[2 * v + 1]; SW[4 * v] = 1 - H.w[v]; SW[4 * v + 1] = H.w[v]; }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(P, 3)); body.setIndex(H.idx); body.computeVertexNormals();
  body.setAttribute('color', new THREE.BufferAttribute(C, 3)); body.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); body.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  v3.set(0, 0, 0);

  // ——— the pieces that aren't skin: eyes, a cap's peak, sunglasses, a hood rolled in the collar, a ponytail or bun
  const extra: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, bone: number, color: number, m?: THREE.Matrix4) => {
    if (m) geo.applyMatrix4(m);
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (!geo.index) { const n = geo.attributes.position.count; geo.setIndex([...Array(n).keys()]); }
    const n = geo.attributes.position.count, cc = new THREE.Color(color), ca = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) { ca[3 * k] = cc.r; ca[3 * k + 1] = cc.g; ca[3 * k + 2] = cc.b; si[4 * k] = bone; sw[4 * k] = 1; }
    geo.setAttribute('color', new THREE.BufferAttribute(ca, 3)); geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    extra.push(geo);
  };
  const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  if (L.face === 'dots' && !shades) for (const k of ['l-eye', 'r-eye']) { // (dark dots on the smoothed face, as an animator draws eyes)
    const [ex, ey] = J[k]; let best = 1e9, sz = 0;
    for (let v = 0; v < N; v++) { if (P[3 * v + 2] > -0.05 || wt(v, 2) < 0.5) continue; const d = (P[3 * v] - ex) ** 2 + (P[3 * v + 1] - ey) ** 2; if (d < best) { best = d; sz = P[3 * v + 2]; } }
    add(new THREE.SphereGeometry(0.0105, 8, 6), 2, 0x1c1814, M(ex * 1.1, ey, sz - 0.002, 1, 1.3, 0.5));
  }
  if (headwear === 'cap') {
    add(new THREE.CylinderGeometry(0.078, 0.078, 0.006, 14, 1, false, Math.PI / 2, Math.PI), 2, K.hat, M(0, 0.744, -0.098, 0.95, 1, 1.05, 0.2, 0, 0));
  }
  if (shades) add(new THREE.CylinderGeometry(0.1, 0.1, 0.028, 14, 1, true, Math.PI - 1.0, 2.0), 2, 0x101214, M(0, 0.674, -0.036, 0.86, 1, 1));
  if (!hoodUp) add(new THREE.TorusGeometry(collarR - 0.004, 0.016 * loose + 0.006, 6, 16, Math.PI * 1.3), 1, jacket, M(0, collarTop - 0.01, cz + 0.001, 1, 1, 0.95, Math.PI / 2, 0, -Math.PI * 0.15 + Math.PI)); // the hood, rolled
  if (hoodUp) { /* (the hair inside the hood) */ } else if (hairStyle === 'long' && headwear !== 'cap') add(new THREE.CapsuleGeometry(0.06, 0.07, 4, 10), 2, hairCol, M(0, 0.655, 0.045, 1.25, 1, 0.55, -0.15, 0, 0)); // (worn down, to the collar)
  else if (hairStyle === 'long' || (K.ponytail && headwear === 'cap' && hairStyle !== 'bald')) add(new THREE.CapsuleGeometry(0.024, 0.1, 3, 8), 2, hairCol, M(0, 0.655, 0.1, 1, 1, 0.8, -0.45, 0, 0));
  if (hairStyle === 'bun' && !hoodUp) add(new THREE.SphereGeometry(0.035, 10, 8), 2, hairCol, M(0, 0.735, 0.085));

  // the life jacket (an inflatable's yoke): a tube up each side of the chest, over the shoulders and round the back of
  // the neck, laid on the jacket as built (each point on the surface the jacket has there); its waist strap round it
  if (!K.pfd.foam) {
    const surf = (x: number, y: number, front: boolean) => { // the jacket's surface at (x, y), front or back: its z
      let best = 1e9, bz = 0;
      for (let v = 0; v < N; v++) { if ((P[3 * v + 2] < 0) !== front || wt(v, 2) > 0.5) continue; const d = (P[3 * v] - x) ** 2 + (P[3 * v + 1] - y) ** 2; if (d < best) { best = d; bz = P[3 * v + 2]; } }
      return bz;
    };
    const tr = 0.017, pts: THREE.Vector3[] = [];
    const side = (sx: number) => [[0.075, 0.26, 1], [0.08, 0.36, 1], [0.085, 0.45, 1], [0.1, 0.52, 0], [0.075, 0.52, -1], [0.035, 0.5, -1]].map(([x, y, f]) =>
      new THREE.Vector3(sx * x * g, y, f === 0 ? 0.004 : surf(sx * x * g, y, f > 0) + (f > 0 ? -tr * 0.7 : tr * 0.7)));
    pts.push(...side(-1), new THREE.Vector3(0, 0.5, surf(0, 0.5, false) + tr * 0.7), ...side(1).reverse());
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, tr, 7, false), 1, K.pfd.body);
    for (const sx of [-1, 1]) add(new THREE.SphereGeometry(tr, 7, 5), 1, K.pfd.body, M(sx * 0.075 * g, 0.26, surf(sx * 0.075 * g, 0.26, true) - tr * 0.7));
    if (L.detail) for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.01, 0.12, 0.004), 1, tape, M(sx * 0.08 * g, 0.38, surf(sx * 0.08 * g, 0.38, true) - tr * 1.7));
    // the strap: an ellipse round the jacket at that height
    let mx = 0, zf = 0, zb = 0;
    for (let v = 0; v < N; v++) { const y = P[3 * v + 1]; if (Math.abs(y - 0.245) > 0.012 || wt(v, 3, 4, 5, 6) > 0.3) continue; mx = Math.max(mx, Math.abs(P[3 * v])); zf = Math.min(zf, P[3 * v + 2]); zb = Math.max(zb, P[3 * v + 2]); }
    add(new THREE.TorusGeometry(1, 0.006 / Math.max(mx, 0.05), 4, 24), 1, 0x15171a, M(0, 0.245, (zf + zb) / 2, mx + 0.003, (zb - zf) / 2 + 0.003, Math.max(mx, 0.05), Math.PI / 2, 0, 0));
  }
  const geom = mergeGeometries([body, ...extra])!; extra.forEach(e => e.dispose()); body.dispose();
  const mesh = new THREE.SkinnedMesh(geom, L.mat);
  mesh.add(hips); root.add(mesh);
  const skel = new THREE.Skeleton(bones); mesh.bind(skel);
  head.scale.setScalar(L.headScale); // (after the bind: the head drawn larger about the top of the neck)
  mesh.castShadow = true;
  return { root, torso: spine, head, arm: [{ root: sh[0], mid: el[0] }, { root: sh[1], mid: el[1] }], leg: [{ root: hp[0], mid: kn[0] }, { root: hp[1], mid: kn[1] }], scale: s, mesh };
}

function shadeHex(c: number, k: number) { return new THREE.Color(c).multiplyScalar(k).getHex(); }
function mixHex(a: number, b: number, t: number) { return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex(); }
