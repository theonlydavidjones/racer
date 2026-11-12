import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Person } from '../boat/crewPhys';
import { BONE, kitFor, hash, type Body } from './crewBody';
import H from './human.json';

/**
 * Design examples (round 2) for the owner: crew built on a real human body, MakeHuman's base mesh (CC0 1.0; decimated,
 * re-posed and skinned to the sim's eleven-bone skeleton by scripts/assets/build-human.py → render/human.json).
 * Clothes are the body's own surface pushed out region by region (a jacket over the chest and arms, salopettes on the
 * legs, boots, gloves, a life jacket, a cap), so they bend with the body for no extra triangles; folds are ripples in
 * that push, different for each person. Four directions:
 *   anatomy — the body itself in close-fitting kit (a racing spray top, hiking trousers, dinghy boots): its shape shows;
 *   kit     — real foul-weather gear as its own silhouette: a loose jacket with a stand-up collar and the hood rolled
 *             in it, salopettes, sea boots, an inflatable life jacket, gloves, folds at elbows, knees and waist;
 *   people  — faces and hair that read as different people (hair styles, beards, grey hair, eyes, brows, lips), the kit
 *             lighter, most bareheaded;
 *   drawn   — an illustrator's look: the kit silhouette in flat toon shading with ink outlines.
 */
export type HumanStyle = 'anatomy' | 'kit' | 'people' | 'drawn';

const N = H.pos.length / 3;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Per vertex: the weight of each of the 11 bones (from the two the asset stores). */
const WB = (() => {
  const w = new Float32Array(N * 11);
  for (let v = 0; v < N; v++) { const t = H.w[v]; w[v * 11 + H.bone[2 * v]] += 1 - t; w[v * 11 + H.bone[2 * v + 1]] += t; }
  return w;
})();
const wt = (v: number, ...bones: number[]) => bones.reduce((s, b) => s + WB[v * 11 + b], 0);
/** Bind-pose normals of the bare body (smooth: the asset's vertices are shared between faces). */
const BASE_N = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(H.pos, 3)); g.setIndex(H.idx); g.computeVertexNormals(); return g.attributes.normal.array as Float32Array; })();
const J = H.joints as Record<string, number[]>;

type Hair = 'crop' | 'short' | 'long' | 'curly' | 'bald' | 'bun';
const PEOPLE: { hair: Hair; beard: 'none' | 'full' | 'stubble'; older: boolean }[] = [
  { hair: 'long', beard: 'none', older: false }, { hair: 'bald', beard: 'full', older: true }, { hair: 'curly', beard: 'stubble', older: false },
  { hair: 'bun', beard: 'none', older: false }, { hair: 'short', beard: 'full', older: false }, { hair: 'crop', beard: 'stubble', older: false }];

const MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10, specular: 0x141414 });
const TOON = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: t });
})();
const INK = new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.BackSide });

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
  const skin = mixHex(K.skin, 0xb07a58, 0.25); // (a little sun and wind: sailors are seldom pale)
  const headwear = style === 'people' ? (r(7) < 0.25 ? 'cap' : 'none') : K.headwear === 'visor' ? 'cap' : K.headwear; // (a visor drawn as a cap)
  const shades = style !== 'people' && K.shades && headwear !== 'beanie';
  const iris = [0x4a2f1d, 0x2d1d12, 0x3f6a8a, 0x5b6b4a][Math.floor(r(8) * (skin > 0x986445 ? 4 : 2))];

  // ——— the kit for each direction: how far each garment stands off the body (m), how deep its folds
  const loose = style === 'kit' || style === 'drawn' ? 1 : style === 'people' ? 0.6 : 0.25;
  const fold = style === 'kit' ? 0.006 : style === 'people' ? 0.004 : style === 'anatomy' ? 0.0025 : 0;
  const hem = style === 'anatomy' ? 0.02 : -0.085; // (where the jacket ends, m below/above the hip joints)
  const bootTop = style === 'anatomy' ? -0.76 : -0.58; // (dinghy boots to the ankle, or sea boots to mid-calf)
  const collarTop = style === 'anatomy' ? 0.545 : 0.585, collarR = 0.058 + 0.022 * loose;
  const fitted = style === 'anatomy', jacket = fitted ? 0x2b2f37 : K.jacket, panel = K.jacket, salop = fitted ? 0x33373e : K.bib, glove = 0x17191d, bootC = style === 'anatomy' ? 0x2a2d33 : K.boot, sole = 0xd2cec4, tape = 0xb4b9bc;
  const ph = [0, 1, 2, 3, 4, 5].map(i => hash(seed, 60 + i) * Math.PI * 2);

  // ——— the body pushed out into its clothes; the colour of each place
  const P = new Float32Array(H.pos.length), C = new Float32Array(H.pos.length);
  const v3 = new THREE.Vector3(), col = new THREE.Color();
  for (let v = 0; v < N; v++) {
    const x = H.pos[3 * v], y = H.pos[3 * v + 1], z = H.pos[3 * v + 2], nx = BASE_N[3 * v], ny = BASE_N[3 * v + 1], nz = BASE_N[3 * v + 2];
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
      if (z < -0.095 && y > 0.684 && y < 0.699 && hx > 0.012 && hx < 0.058) c = shadeHex(hairCol === 0xc9c6bf ? 0x9a9a96 : hairCol, 0.9);
      if (z < -0.105 && hx < 0.027 && y > 0.616 && y < 0.638) c = mixHex(skin, 0x9a4a48, 0.4);
      if (beard !== 'none' && z < 0.0 && y < 0.645 && y > 0.545 && !(hx < 0.027 && y > 0.616 && y < 0.638 && z < -0.105) && !(y > 0.625 && hx > 0.05 && z < -0.08)) {
        c = beard === 'full' ? hairCol : mixHex(skin, hairCol, 0.35); if (beard === 'full') off = 0.005;
      }
      if (scalp) {
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
    } else if (hand) { c = glove; off = 0.003; }
    else if (foot) {
      c = y < -0.925 ? sole : bootC; off = 0.012 + (style === 'anatomy' ? 0 : 0.01 * sstep(bootTop - 0.04, bootTop, y));
    } else if (legs) {
      c = salop; off = 0.006 + 0.018 * loose + 0.01 * loose * sstep(-0.4, -0.58, y);
      if (style === 'kit' && wShin > 0.4 && Math.abs(y + 0.43) < 0.06 && z < 0) c = shadeHex(salop, 0.75); // (knee patches)
      // folds: behind the knee and round the seat, ripples down the shin
      const ax = Math.sign(x) * BONE.hipX, th = Math.atan2(z, x - ax);
      off += fold * Math.sin(y / 0.1 * Math.PI * 2 + 1.6 * Math.sin(th + ph[0]) + ph[1]) * (0.5 + sstep(0.12, 0, Math.abs(y + 0.43)));
    } else {
      // the jacket (spray top): the torso, the arms to the wrist, a collar standing up round the neck
      c = jacket; off = 0.006 + 0.022 * loose;
      if (fitted && ((wArm > 0.5 && y > 0.2) || (wArm <= 0.5 && y > 0.43))) c = panel; // (a racing top's coloured shoulder panels)
      if (wArm > 0.5) {
        const ax = Math.sign(x) * BONE.shoulderX, th = Math.atan2(z, x - ax);
        off = 0.006 + 0.02 * loose + 0.008 * loose * sstep(0.2, -0.05, y); // (sleeves fuller to the cuff)
        off += fold * Math.sin(y / 0.09 * Math.PI * 2 + 1.8 * Math.sin(th + ph[2]) + ph[3]) * (0.45 + sstep(0.1, 0, Math.abs(y - (BONE.shoulderY - BONE.upper))));
        if (y < -0.03 && y > -0.05) { c = style === 'anatomy' ? 0x1d2026 : tape; off += 0.002; } // the cuff (neoprene, or a reflective band)
      } else {
        const th = Math.atan2(z, x);
        off += 0.012 * loose * sstep(0.12, -0.04, y); // (the hem stands off the hips: the jacket hangs, it isn't skin)
        off += fold * (Math.sin(th * 6 + ph[4]) * sstep(0.3, 0.05, y) + 0.7 * Math.sin(y / 0.08 * Math.PI * 2 + ph[5]) * sstep(0.2, 0.05, y) * sstep(-0.04, 0.05, y));
        // the life jacket: an inflatable's yoke (bands up the chest, over the shoulders, round the back of the neck) or a foam vest
        const hx = Math.abs(x);
        if (K.pfd.foam && style !== 'anatomy') {
          if (y > 0.17 && y < 0.49) { c = K.pfd.body; off += 0.03; if (hx < 0.008 && z < 0) c = K.pfd.trim; }
        } else {
        }
        if (style !== 'anatomy' && hx < 0.005 && z < 0 && y > 0.1 && y < 0.44 && !(K.pfd.foam)) c = 0x101214; // the zip
      }
      if (y > 0.5 && wHead < 0.9 && y < collarTop) { // the collar: round the neck at a jacket's own radius
        const rr = Math.hypot(x, z - 0.005); radial = Math.max(0, collarR - rr) * sstep(collarTop, collarTop - 0.025, y);
        c = jacket; off = 0;
      }
    }
    if (hairStyle === 'long' && headwear !== 'cap' && z > 0.0 && y > 0.545 && y < 0.64 && wHead > 0.5 && !(y < collarTop && y < 0.555)) { c = hairCol; off = Math.max(off, 0.014); }
    if (wHead > 0.5 && y <= 0.555 && y > 0.5) { // (the neck between the collar and the chin)
      if (y < collarTop) { const rr = Math.hypot(x, z - 0.005); radial = Math.max(0, collarR - rr) * sstep(collarTop, collarTop - 0.025, y); c = jacket; } else c = skin;
    }
    // girth for build: the body wider for a heavier person, not the head
    const gx = 1 + (g - 1) * (1 - wHead), gz = 1 + (Math.sqrt(g) - 1) * (1 - wHead);
    let px = x * gx + nx * off, py = y + ny * off, pz = z * gz + nz * off;
    if (radial > 0) { const rr = Math.hypot(x, z - 0.005) || 1; px += x / rr * radial; pz += (z - 0.005) / rr * radial; }
    P[3 * v] = px; P[3 * v + 1] = py; P[3 * v + 2] = pz;
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
  for (const k of ['l-eye', 'r-eye']) {
    const [ex, ey, ez] = J[k];
    if (style === 'drawn') { add(new THREE.SphereGeometry(0.0075, 8, 6), 2, 0x15171c, M(ex, ey, ez - 0.006)); continue; }
    add(new THREE.SphereGeometry(0.0118, 10, 8), 2, 0xe8e2d8, M(ex, ey, ez));
    add(new THREE.SphereGeometry(0.0058, 8, 6), 2, iris, M(ex, ey, ez - 0.0075, 1, 1, 0.6));
  }
  if (headwear === 'cap') {
    add(new THREE.CylinderGeometry(0.078, 0.078, 0.006, 14, 1, false, Math.PI / 2, Math.PI), 2, K.hat, M(0, 0.744, -0.098, 0.95, 1, 1.05, 0.2, 0, 0));
  }
  if (shades) add(new THREE.CylinderGeometry(0.1, 0.1, 0.028, 14, 1, true, Math.PI - 1.0, 2.0), 2, 0x101214, M(0, 0.674, -0.036, 0.86, 1, 1));
  if (style !== 'anatomy') add(new THREE.TorusGeometry(collarR - 0.004, 0.016 * loose + 0.006, 6, 16, Math.PI * 1.3), 1, jacket, M(0, collarTop - 0.01, 0.006, 1, 1, 0.95, Math.PI / 2, 0, -Math.PI * 0.15 + Math.PI)); // the hood, rolled
  if (hairStyle === 'long' && headwear !== 'cap') add(new THREE.CapsuleGeometry(0.06, 0.07, 4, 10), 2, hairCol, M(0, 0.655, 0.045, 1.25, 1, 0.55, -0.15, 0, 0)); // (worn down, to the collar)
  else if (hairStyle === 'long' || (K.ponytail && headwear === 'cap' && hairStyle !== 'bald')) add(new THREE.CapsuleGeometry(0.024, 0.1, 3, 8), 2, hairCol, M(0, 0.655, 0.1, 1, 1, 0.8, -0.45, 0, 0));
  if (hairStyle === 'bun') add(new THREE.SphereGeometry(0.035, 10, 8), 2, hairCol, M(0, 0.735, 0.085));

  // the life jacket (an inflatable's yoke): a tube up each side of the chest, over the shoulders and round the back of
  // the neck, laid on the jacket as built (each point on the surface the jacket has there); its waist strap round it
  if (!(K.pfd.foam && style !== 'anatomy')) {
    const surf = (x: number, y: number, front: boolean) => { // the jacket's surface at (x, y), front or back: its z
      let best = 1e9, bz = 0;
      for (let v = 0; v < N; v++) { if ((P[3 * v + 2] < 0) !== front || wt(v, 2) > 0.5) continue; const d = (P[3 * v] - x) ** 2 + (P[3 * v + 1] - y) ** 2; if (d < best) { best = d; bz = P[3 * v + 2]; } }
      return bz;
    };
    const tr = 0.017 * (style === 'anatomy' ? 0.8 : 1), pts: THREE.Vector3[] = [];
    const side = (sx: number) => [[0.075, 0.26, 1], [0.08, 0.36, 1], [0.085, 0.45, 1], [0.1, 0.52, 0], [0.075, 0.52, -1], [0.035, 0.5, -1]].map(([x, y, f]) =>
      new THREE.Vector3(sx * x * g, y, f === 0 ? 0.004 : surf(sx * x * g, y, f > 0) + (f > 0 ? -tr * 0.7 : tr * 0.7)));
    pts.push(...side(-1), new THREE.Vector3(0, 0.5, surf(0, 0.5, false) + tr * 0.7), ...side(1).reverse());
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, tr, 7, false), 1, K.pfd.body);
    for (const sx of [-1, 1]) add(new THREE.SphereGeometry(tr, 7, 5), 1, K.pfd.body, M(sx * 0.075 * g, 0.26, surf(sx * 0.075 * g, 0.26, true) - tr * 0.7));
    if (style === 'kit') for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.01, 0.12, 0.004), 1, tape, M(sx * 0.08 * g, 0.38, surf(sx * 0.08 * g, 0.38, true) - tr * 1.7));
    // the strap: an ellipse round the jacket at that height
    let mx = 0, zf = 0, zb = 0;
    for (let v = 0; v < N; v++) { const y = P[3 * v + 1]; if (Math.abs(y - 0.245) > 0.012 || wt(v, 3, 4, 5, 6) > 0.3) continue; mx = Math.max(mx, Math.abs(P[3 * v])); zf = Math.min(zf, P[3 * v + 2]); zb = Math.max(zb, P[3 * v + 2]); }
    add(new THREE.TorusGeometry(1, 0.006 / Math.max(mx, 0.05), 4, 24), 1, 0x15171a, M(0, 0.245, (zf + zb) / 2, mx + 0.003, (zb - zf) / 2 + 0.003, Math.max(mx, 0.05), Math.PI / 2, 0, 0));
  }
  const geom = mergeGeometries([body, ...extra])!; extra.forEach(e => e.dispose()); body.dispose();
  const mesh = new THREE.SkinnedMesh(geom, style === 'drawn' ? TOON : MAT);
  mesh.add(hips); root.add(mesh);
  const skel = new THREE.Skeleton(bones); mesh.bind(skel);
  mesh.castShadow = true;
  if (style === 'drawn') { // ink outlines: the same skin pushed out a little along its normals, drawn from behind
    const o = geom.clone(), op = o.attributes.position, on = o.attributes.normal;
    for (let k = 0; k < op.count; k++) op.setXYZ(k, op.getX(k) + on.getX(k) * 0.01, op.getY(k) + on.getY(k) * 0.01, op.getZ(k) + on.getZ(k) * 0.01);
    o.deleteAttribute('color');
    const ink = new THREE.SkinnedMesh(o, INK); root.add(ink); ink.bind(skel, mesh.bindMatrix);
  }
  return { root, torso: spine, head, arm: [{ root: sh[0], mid: el[0] }, { root: sh[1], mid: el[1] }], leg: [{ root: hp[0], mid: kn[0] }, { root: hp[1], mid: kn[1] }], scale: s, mesh };
}

function shadeHex(c: number, k: number) { return new THREE.Color(c).multiplyScalar(k).getHex(); }
function mixHex(a: number, b: number, t: number) { return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex(); }
