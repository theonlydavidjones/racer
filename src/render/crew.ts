import './three-setup';
import * as THREE from 'three';
import type { CrewState, Person, Pose as Job } from '../boat/crewPhys';
import { CABIN, COCKPIT, HEEL, L, TRANSOM_TOP, cabinHalf, cabinTopAt, cockpitHalf, deckY, fairCurve, halfBeam, uAtZ } from './hull';

/**
 * The people aboard, drawn as people: a jointed figure for each (pelvis, torso, head, arms with elbows and hands,
 * legs with knees and feet), sized to their height and build, in spray tops and life jackets. Where they are comes from
 * the crew physics (crewPhys.ts: where their weight is across and fore and aft, how hard they hike, their job); this
 * file finds what they're sitting on there and poses them on it:
 * - the side deck, legs over the coaming into the cockpit, feet on the seat (sitting up to windward, or to leeward in
 *   light air), and hiking from its edge with the backs of the knees over the coaming (no straps: CR 13.20);
 * - the cockpit seats, feet on the sole; the sole itself, knees up, when they're in the middle;
 * - kneeling at the cabin-top lines, beside the cabin at the jib car, on the cabin top at the mast;
 * - the helm on the after deck (or the after end of the side deck), legs down into the cockpit's after end, the tiller
 *   extension in hand (the owner's photos of Josephine and CircleSea, reference/photos).
 * Each limb is placed by two-bone inverse kinematics from the hip or shoulder to a foot or hand on something real (a
 * seat, the sole, the coaming, the tiller extension, a winch, a line), so nothing is held in the air or pushed through
 * the boat. Moving, they crouch and step over what's under them (the ground: seats, coaming, thwart, deck, cabin top),
 * ducking under the boom, at the physics' pace.
 */

interface Limb { root: THREE.Object3D; mid: THREE.Object3D }
export interface Figure {
  root: THREE.Group; torso: THREE.Group; head: THREE.Group;
  arm: [Limb, Limb]; leg: [Limb, Limb]; scale: number;
  /** (render state: the pose being eased toward, where they were last frame, a step's phase) */
  cur?: PoseT; last?: THREE.Vector3; gait: number; speed: number;
}
export interface Crew { group: THREE.Group; helm: Figure; crew: Figure[]; helmSide: number; side: number; extension: THREE.Mesh }

const SKINS = [0xe0b99a, 0xc99b78, 0x9c6b4c, 0x6e4a33, 0xf0cfb4];
const mat = (c: number, shine = 0) => shine ? new THREE.MeshPhongMaterial({ color: c, shininess: shine, specular: 0x333333 }) : new THREE.MeshLambertMaterial({ color: c });
const cap = (r: number, len: number, m: THREE.Material, y: number) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m); o.position.y = y; o.castShadow = true; return o; };

/** The figure's bones (m, before scaling to their height): hip to knee, knee to ankle, shoulder to elbow, elbow to wrist. */
const BONE = { thigh: 0.44, shin: 0.44, upper: 0.29, fore: 0.28, shoulderY: 0.46, hipX: 0.1 };

/** A jointed sailor. Origin at the hips; facing −z; limbs hang straight down until posed. */
function figure(p: Person, jacket: number, seed: number): Figure {
  const s = p.h / 1.75, girth = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24))); // build from BMI
  const skin = mat(SKINS[seed % SKINS.length]), J = mat(jacket, 30), PFD = mat(seed % 2 ? 0x1c2733 : 0xd8432e, 20), pants = mat(0x2a2e36), boots = mat(0x1b1d20, 40);
  const root = new THREE.Group(); root.scale.setScalar(s);
  // pelvis and torso, a little tapered, with the life jacket over the spray top
  const pelvis = cap(0.13 * girth, 0.14, pants, 0.02); pelvis.rotation.z = Math.PI / 2; root.add(pelvis);
  const torso = new THREE.Group(); root.add(torso);
  const chest = cap(0.15 * girth, 0.3, J, 0.27); chest.scale.set(1.05, 1, 0.75); torso.add(chest);
  const vest = cap(0.16 * girth, 0.2, PFD, 0.31); vest.scale.set(1.08, 1, 0.82); torso.add(vest);
  // head: neck, skull, a cap with a peak
  const head = new THREE.Group(); head.position.y = 0.56; head.rotation.order = 'YXZ'; torso.add(head);
  head.add(cap(0.05, 0.05, skin, 0.0));
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), skin); skull.scale.set(0.92, 1.08, 1); skull.position.y = 0.12; head.add(skull);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(seed % 3 ? 0x1d2330 : 0xe8e4d8)); hat.position.y = 0.16; head.add(hat);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), hat.material); peak.position.set(0, 0.165, -0.06); peak.scale.set(1, 1, 1.1); head.add(peak);
  // arms: shoulder → upper arm → elbow → forearm → hand
  const arm = ([-1, 1] as const).map(sx => {
    const root2 = new THREE.Group(); root2.position.set(sx * 0.2 * girth, BONE.shoulderY, 0); torso.add(root2);
    root2.add(cap(0.052 * girth, 0.2, J, -0.14));
    const mid = new THREE.Group(); mid.position.y = -BONE.upper; root2.add(mid);
    mid.add(cap(0.045, 0.19, J, -0.13));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin); hand.position.y = -BONE.fore; hand.scale.set(0.8, 1.1, 0.6); mid.add(hand);
    return { root: root2, mid };
  }) as unknown as [Limb, Limb];
  // legs: hip → thigh → knee → shin → foot
  const leg = ([-1, 1] as const).map(sx => {
    const root2 = new THREE.Group(); root2.position.set(sx * BONE.hipX, 0, 0); root.add(root2);
    root2.add(cap(0.075 * girth, 0.3, pants, -0.21));
    const mid = new THREE.Group(); mid.position.y = -BONE.thigh; root2.add(mid);
    mid.add(cap(0.06, 0.32, pants, -0.21));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), boots); foot.position.set(0, -BONE.shin, -0.07); mid.add(foot);
    return { root: root2, mid };
  }) as unknown as [Limb, Limb];
  root.traverse(o => { o.castShadow = true; });
  return { root, torso, head, arm, leg, scale: s, gait: 0, speed: 0 };
}

export function buildCrew(helm: Person, people: Person[], jackets: number[], seed: number): Crew {
  const group = new THREE.Group();
  const h = figure(helm, jackets[0], seed); group.add(h.root);
  const crew = people.map((p, i) => { const f = figure(p, jackets[(i + 1) % jackets.length], seed + i + 1); group.add(f.root); return f; });
  // the tiller extension (a black glassfibre stick on a universal joint at the tiller's end), in the helm's hand
  const extension = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 6), new THREE.MeshLambertMaterial({ color: 0x1b1d20 }));
  extension.castShadow = true; group.add(extension);
  return { group, helm: h, crew, helmSide: 1, side: 1, extension };
}

// ———————————————————————————— the boat's surfaces, where people sit and step ————————————————————————————

const COCK0 = -L / 2 + COCKPIT.u0 * L, COCK1 = -L / 2 + COCKPIT.u1 * L, CAB0 = -L / 2 + CABIN.u0 * L;
/** The cockpit seats' top and depth (hull.ts cockpitSeats), the thwart's place and top (boatMesh.ts buildLines). */
const SEAT = { y: 0.42, d: 0.3 }, THWART = { z: 2.35, half: 0.12 };
/** The coaming's height above the deck along the cockpit (boatMesh.ts COAMING_H: CR 3.22's minimums, a little over). */
const coamH = fairCurve([[COCK0, 0.22], [L / 2 - 3.5 * 0.5, 0.15], [L / 2 - 2 * 0.5, 0.09]]);
const chz = (z: number) => cockpitHalf(uAtZ(z));
const inCockpit = (ax: number, z: number) => z > COCK0 && z < COCK1 && ax < chz(z);
/** The top of whatever is at (x, z) in the boat's frame (m above the waterline): sole, seat, thwart, coaming, deck, cabin top. */
export function ground(x: number, z: number): number {
  const ax = Math.abs(x), u = uAtZ(z);
  if (inCockpit(ax, z)) {
    if (Math.abs(z - THWART.z) < THWART.half) return deckY(uAtZ(THWART.z), chz(THWART.z)) + 0.055;
    return ax > chz(z) - SEAT.d ? SEAT.y : COCKPIT.sole;
  }
  if (z > CAB0 && z < COCK0 && ax < cabinHalf(u)) return cabinTopAt(u, ax);
  const e = halfBeam(u);
  if (z > COCK0 && z < COCK1 && ax < chz(z) + 0.04) return deckY(u, ax) + coamH(z);
  return deckY(u, Math.min(ax, e));
}
/** The highest ground within `r` of (x, z): a body moving over it rises before it reaches a step up, and keeps clear. */
function groundNear(x: number, z: number, r: number): number {
  let m = ground(x, z);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; m = Math.max(m, ground(x + r * Math.cos(a), z + r * Math.sin(a))); }
  return m;
}

// ———————————————————————————— poses: where the hips, hands and feet go ————————————————————————————

/** A pose in the boat's frame: the hips, which way they face (yaw: 0 forward, + turning to port), the torso's lean
 * (+ back, − forward) and roll, the ankles and the hands (left, right), and what they're looking at. */
interface PoseT { hip: THREE.Vector3; yaw: number; pitch: number; roll: number; feet: [THREE.Vector3, THREE.Vector3]; hands: [THREE.Vector3, THREE.Vector3]; look: THREE.Vector3 }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The figure's forward and right in the boat frame for a yaw (it faces −z at yaw 0). */
const fwd = (yaw: number) => V(-Math.sin(yaw), 0, -Math.cos(yaw)), right = (yaw: number) => V(Math.cos(yaw), 0, -Math.sin(yaw));
/** An ankle standing on whatever is there (the boot's sole on it). */
const onGround = (p: THREE.Vector3) => p.setY(ground(p.x, p.z) + 0.06);
/** What the crew watch: the jib's luff (its telltales). */
const JIB_LUFF = V(0, 1.5, -1.6);

/** Sitting on the side deck at its edge, the backs of the knees over the coaming and the feet on the seat below it,
 * leaning back out (`lean` 0 sitting … 1 hiking flat out: about 70°, crewPhys.ts hikeArm). `s` the side (+1 starboard). */
function onDeck(s: number, z: number, lean: number, k: number): PoseT {
  const u = uAtZ(z), c = chz(z), e = halfBeam(u);
  const knee = V(s * (c - 0.07), deckY(u, c) + coamH(z) + 0.07, z - 0.04);
  const hipY = deckY(u, e - 0.1) + 0.09 * k, dy = hipY - knee.y, l1 = BONE.thigh * k;
  const hipX = Math.min(e + 0.06 * lean, Math.abs(knee.x) + Math.sqrt(Math.max(0.01, l1 * l1 - dy * dy)));
  const yaw = s * (Math.PI / 2 - 0.35 + 0.25 * lean), r = right(yaw);
  const foot = (j: number) => onGround(V(s * (c - 0.16), 0, z - 0.06).addScaledVector(r, (j ? 1 : -1) * 0.09 * k));
  const hip = V(s * hipX, hipY, z), f = fwd(yaw);
  // hands: sitting, on the knees; hiking, one on the coaming beside them and one across the chest (on the sheet)
  const hands: [THREE.Vector3, THREE.Vector3] = lean > 0.15
    ? [hip.clone().addScaledVector(f, 0.12 * k).add(V(0, 0.38 * k, 0)).addScaledVector(r, 0.08), V(s * (c + 0.02), knee.y + 0.02, z - 0.3)]
    : [knee.clone().addScaledVector(r, -0.1 * k).add(V(0, 0.08, 0)), knee.clone().addScaledVector(r, 0.1 * k).add(V(0, 0.08, 0))];
  return { hip, yaw, pitch: -0.15 + 1.35 * lean, roll: 0, feet: [foot(0), foot(1)], hands, look: JIB_LUFF.clone() };
}
/** On the cockpit seat, back to the coaming, feet on the sole. */
function onSeat(s: number, x: number, z: number, k: number): PoseT {
  const c = chz(z), hx = Math.min(c - 0.1, Math.max(c - SEAT.d + 0.1, Math.abs(x) + 0.08));
  const yaw = s * (Math.PI / 2 - 0.45), r = right(yaw), f = fwd(yaw);
  const hip = V(s * hx, SEAT.y + 0.09 * k, z);
  const foot = (j: number) => onGround(V(s * (hx - 0.4 * k), 0, z - 0.12).addScaledVector(r, (j ? 1 : -1) * 0.11 * k));
  const kneeAt = hip.clone().addScaledVector(f, 0.4 * k).add(V(0, 0.1, 0));
  return { hip, yaw, pitch: -0.1, roll: 0, feet: [foot(0), foot(1)], hands: [kneeAt.clone().addScaledVector(r, -0.1), kneeAt.clone().addScaledVector(r, 0.1)], look: JIB_LUFF.clone() };
}
/** On the cockpit sole, facing forward, knees up and arms round them (in the middle of the boat in light air). */
function onSole(x: number, z0: number, k: number): PoseT {
  const z = Math.max(z0, COCK0 + 0.55), hip = V(x, COCKPIT.sole + 0.09 * k, z), yaw = 0;
  const foot = (j: number) => V(x + (j ? 1 : -1) * 0.13 * k, COCKPIT.sole + 0.06, z - 0.42 * k);
  const knees = V(x, COCKPIT.sole + 0.42 * k, z - 0.28 * k);
  return { hip, yaw, pitch: -0.25, roll: 0, feet: [foot(0), foot(1)], hands: [knees.clone().add(V(-0.08, 0, -0.04)), knees.clone().add(V(0.08, 0, -0.04))], look: JIB_LUFF.clone() };
}
/** Kneeling on the surface at (x, z), facing `yaw`, shins flat behind, hands at `reach`. */
function kneel(x: number, z: number, yaw: number, reach: [THREE.Vector3, THREE.Vector3], k: number, lookAt = JIB_LUFF): PoseT {
  // (the hips 0.34 m up, so with the thigh leaning forward the knee is on the surface and the shin lies flat behind it:
  // the knee 0.33 m ahead of the hips, the ankle 0.11 m behind them)
  const g = ground(x, z), f = fwd(yaw), r = right(yaw);
  const hip = V(x, g + 0.37 * k, z).addScaledVector(f, -0.12 * k);
  const foot = (j: number) => hip.clone().addScaledVector(f, -0.11 * k).addScaledVector(r, (j ? 1 : -1) * 0.1 * k).setY(g + 0.07);
  return { hip, yaw, pitch: -0.45, roll: 0, feet: [foot(0), foot(1)], hands: reach, look: lookAt.clone() };
}
/** Moving about the boat: crouched under the boom, stepping over what's beneath, facing the way they're going. */
function moving(fig: Figure, x: number, z: number, yaw: number, k: number): PoseT {
  const g = groundNear(x, z, 0.22), f = fwd(yaw), r = right(yaw), ph = fig.gait;
  if (!inCockpit(Math.abs(x), z)) {
    // out of the cockpit (along the side deck, over the cabin top): on hands and knees, a knee and a hand at a time
    const p = kneel(x, z, yaw, [V(0, 0, 0), V(0, 0, 0)], k);
    p.hip.y = g + 0.37 * k; p.pitch = -1.05;
    p.hands = [0, 1].map(j => { const h = p.hip.clone().addScaledVector(f, (0.42 + 0.08 * Math.sin(ph + j * Math.PI)) * k).addScaledVector(r, (j ? 1 : -1) * 0.16 * k); return h.setY(ground(h.x, h.z) + 0.05); }) as [THREE.Vector3, THREE.Vector3];
    p.look = p.hip.clone().addScaledVector(f, 2).setY(p.hip.y + 0.4);
    return p;
  }
  // in the cockpit: crouched under the boom, stepping over the seats and the thwart (with room ahead for the knees)
  z = Math.max(z, COCK0 + 0.5);
  const hip = V(x, g + 0.42 * k, z);
  const foot = (j: number) => { const sw = Math.sin(ph + j * Math.PI), p = V(x, 0, z).addScaledVector(f, 0.12 * sw * k).addScaledVector(r, (j ? 1 : -1) * 0.13 * k); return p.setY(ground(p.x, p.z) + 0.06 + 0.07 * Math.max(0, Math.cos(ph + j * Math.PI))); };
  // hands down to the seat or the coaming for balance
  const hand = (j: number) => { const h = hip.clone().addScaledVector(f, 0.28 * k).addScaledVector(r, (j ? 1 : -1) * 0.25 * k); return h.setY(Math.max(ground(h.x, h.z), hip.y - 0.3) + 0.05); };
  return { hip, yaw, pitch: -0.85, roll: 0, feet: [foot(0), foot(1)], hands: [hand(0), hand(1)], look: hip.clone().addScaledVector(f, 2).setY(hip.y + 0.6) };
}

/** Where a crew member is and what they're doing (crewPhys.ts), as a pose on something real. */
function crewPose(fig: Figure, x: number, z: number, lean: number, job: Job, windward: number, isMoving: boolean, motion: number, idx: number): PoseT {
  const k = fig.scale, s = Math.abs(x) > 0.05 ? Math.sign(x) : windward, ax = Math.abs(x);
  // (moving: crouched in the cockpit, on hands and knees on deck; arriving at the side deck they step up onto it)
  const sideways = Math.abs(motion) > 0.6 && Math.abs(motion) < 2.5, alongside = z > COCK0 && z < COCK1 && ax > chz(z) - 0.2;
  if (isMoving && !(alongside && sideways)) {
    // (across the cockpit they shuffle sideways facing forward, under the boom; fore and aft, the way they're going)
    return moving(fig, x, Math.max(z, CAB0 - 0.6), sideways && inCockpit(ax, z) ? 0 : motion, k);
  }
  if (job === 'mast') {
    // kneeling on the cabin top just aft of the mast (the pole, a halyard), hands up on it
    const zz = Math.max(z, CAB0 + 0.45);
    return kneel(s * 0.22, zz, 0, [V(-0.06, ground(0, zz) + 0.75, CAB0 + 0.08), V(0.06, ground(0, zz) + 0.95, CAB0 + 0.08)], k, V(0, 3, -2.5));
  }
  if (job === 'car') {
    // kneeling on the side deck beside the cabin, facing forward along it, reaching in to the car on its track
    const u = uAtZ(z), px = s * Math.min(halfBeam(u) - 0.16, Math.max(cabinHalf(u) + 0.14, ax));
    const car = V(s * 0.58, cabinTopAt(u, 0.58) + 0.06, z - 0.2);
    return kneel(px, z, 0, [car.clone().add(V(0, 0, 0.06)), car.clone().add(V(s * 0.04, 0.02, -0.06))], k, car);
  }
  const zc = Math.min(THWART.z - THWART.half - 0.2, Math.max(COCK0 + 0.42, z));
  if (job === 'piano') {
    // the cabin-top lines at its after end: kneeling on the sole at the forward end of the cockpit,
    // facing forward, hands on the lines
    const zk = COCK0 + 0.35, px = s * Math.min(ax, chz(zk) - SEAT.d - 0.14), top = cabinTopAt(uAtZ(COCK0 - 0.12), Math.abs(px));
    return kneel(px, zk, 0, [V(px - 0.12, top + 0.05, COCK0 - 0.14), V(px + 0.12, top + 0.05, COCK0 - 0.1)], k);
  }
  let p: PoseT;
  if (ax >= chz(zc) - 0.06 || job === 'hike') p = onDeck(s, zc, lean, k);
  else if (ax >= 0.3) p = onSeat(s, x, zc, k);
  else p = onSole(x, zc, k);
  if (job === 'winch') {
    // cranking the jib sheet in on the winch at the coaming's forward end (on the leeward side), one hand on the handle
    const wz = COCK0 + 0.03 * L, ws = -windward, w = V(ws * (chz(wz) + 0.06), deckY(uAtZ(wz), chz(wz)) + coamH(wz) + 0.16, wz);
    const a = performance.now() / 1000 * 5 + idx; // (about a turn a second)
    p.hands = [w.clone().add(V(Math.cos(a) * 0.16, 0.05, Math.sin(a) * 0.16)), w.clone().add(V(-ws * 0.12, -0.05, 0.25))];
    p.pitch = -0.35; p.look = w;
  } else if (idx === 0 && lean <= 0.15) {
    // the jib trimmer: the sheet in the forward hand, led from the leeward winch
    const wz = COCK0 + 0.03 * L, w = V(-windward * (chz(wz) + 0.06), deckY(uAtZ(wz), chz(wz)) + coamH(wz) + 0.1, wz);
    const hold = p.hip.clone().add(V(0, 0.32 * k, 0)).addScaledVector(fwd(p.yaw), 0.3 * k).lerp(w, 0.15);
    p.hands[s > 0 ? 0 : 1] = hold;
  }
  return p;
}

/** The helm: on the after deck (or the after end of the side deck), facing forward and a little inboard, feet down in
 * the cockpit's after end, the extension in the inboard hand and the mainsheet's tail in the other. */
function helmPose(fig: Figure, x: number, z: number, lean: number, windward: number, tip: THREE.Vector3): PoseT {
  const k = fig.scale, s = Math.abs(x) > 0.05 ? Math.sign(x) : windward, u = uAtZ(z), e = halfBeam(u);
  const hx = Math.min(e - 0.04 + 0.06 * lean, Math.max(0.3, Math.abs(x) + 0.1 + 0.12 * lean));
  const hip = V(s * hx, deckY(u, hx) + 0.09 * k, z), yaw = s * (0.55 + 0.5 * lean), r = right(yaw);
  const fz = COCK1 - 0.24, fc = chz(fz) - 0.12;
  const foot = (j: number) => onGround(V(s * Math.min(fc - 0.1 * lean, Math.max(0.12, hx - (0.3 + 0.2 * lean) * k)), 0, fz).addScaledVector(r, (j ? 1 : -1) * 0.12 * k));
  // the extension: from the tiller's end toward the chest, as long as the hand is from it (it's about a metre long)
  const chest = hip.clone().add(V(0, 0.42 * k, 0)), d = chest.clone().sub(tip), reach = Math.min(0.95, d.length() - 0.28 * k);
  const ext = tip.clone().addScaledVector(d.normalize(), Math.max(0.2, reach));
  const sheet = V(s * 0.12, 0.95, THWART.z + 0.15).lerp(chest, 0.35);
  const hands: [THREE.Vector3, THREE.Vector3] = s > 0 ? [ext, sheet] : [sheet, ext];
  return { hip, yaw, pitch: 0.05 + 1.1 * lean, roll: 0, feet: [foot(0), foot(1)], hands, look: JIB_LUFF.clone() };
}

// ———————————————————————————— inverse kinematics ————————————————————————————

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _d = V(0, 0, 0), _x = V(0, 0, 0), _y = V(0, 0, 0), _z = V(0, 0, 0);
/**
 * Two bones from `base` (the joint's position in the parent's frame) to `target` (in the same frame), lengths l1 and l2,
 * the middle joint bending toward `hint`; `back` +1 for a leg (the shin swings back), −1 for an arm. Sets the limb's
 * rotations: each bone lies along its own −y.
 */
function ik(limb: Limb, base: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, hint: THREE.Vector3, back: number): void {
  const d = _a.copy(target).sub(base); let len = d.length();
  len = Math.min(Math.max(len, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999); d.normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = _b.copy(hint).addScaledVector(d, -hint.dot(d)); if (bend.lengthSq() < 1e-8) bend.set(0, 0, -1); bend.normalize();
  const u1 = _c.copy(d).multiplyScalar(a).addScaledVector(bend, h).normalize(); // base → the middle joint
  // the bone's frame: −y along it, +z the way the lower bone swings away (back for the shin, forward for the forearm)
  _y.copy(u1).negate();
  _z.copy(bend).multiplyScalar(-back).addScaledVector(u1, (bend.dot(u1)) * back).normalize();
  _x.crossVectors(_y, _z).normalize(); _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z); limb.root.quaternion.setFromRotationMatrix(_m);
  // the lower bone: from the middle joint to the target, in the upper bone's frame, a turn about its x
  const mid = _d.copy(base).addScaledVector(u1, l1), v = mid.sub(target).negate().normalize();
  _q.copy(limb.root.quaternion).invert(); v.applyQuaternion(_q);
  limb.mid.rotation.set(Math.atan2(-v.z, -v.y), 0, 0);
}

const _p = V(0, 0, 0), _h = V(0, 0, 0), _inv = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _e = new THREE.Euler();
/** Put a figure in a pose: the hips placed and turned, the torso leaned, each limb reaching its foot or hand. */
function apply(f: Figure, p: PoseT): void {
  const k = f.scale;
  f.root.position.copy(p.hip); f.root.rotation.set(0, p.yaw, 0);
  f.torso.rotation.set(p.pitch, 0, p.roll);
  _inv.setFromEuler(_e.set(0, p.yaw, 0)).invert();
  // (into the figure's own frame: unturned, unscaled)
  const local = (w: THREE.Vector3, out: THREE.Vector3) => out.copy(w).sub(p.hip).applyQuaternion(_inv).multiplyScalar(1 / k);
  f.leg.forEach((l, i) => ik(l, l.root.position, local(p.feet[i], _p), BONE.thigh, BONE.shin, V((i ? 1 : -1) * 0.05, 0.3, -1), 1));
  _tq.setFromEuler(_e.set(p.pitch, 0, p.roll)).invert();
  f.arm.forEach((a, i) => ik(a, a.root.position, local(p.hands[i], _p).applyQuaternion(_tq), BONE.upper, BONE.fore, V((i ? 1 : -1) * 0.5, -0.3, 1), -1));
  // the head turns to what they're watching (within a neck's reach)
  local(p.look, _h).applyQuaternion(_tq).sub(f.head.position);
  f.head.rotation.set(Math.max(-0.6, Math.min(0.5, Math.atan2(_h.y - 0.1, Math.hypot(_h.x, _h.z)))), Math.max(-1.3, Math.min(1.3, Math.atan2(-_h.x, -_h.z))), 0);
}
/** Ease the pose shown toward the pose wanted (a quarter of a second or so). */
function ease(f: Figure, want: PoseT, dt: number): PoseT {
  if (!f.cur || dt <= 0 || dt > 0.5) { f.cur = { ...want, hip: want.hip.clone(), feet: [want.feet[0].clone(), want.feet[1].clone()], hands: [want.hands[0].clone(), want.hands[1].clone()], look: want.look.clone() }; return f.cur; }
  const c = f.cur, a = 1 - Math.exp(-dt * 9);
  // (the hips follow the physics' place, which already moves at a human pace; eased only where a seat changes under them)
  // (a change of seat is a step: up off one and over whatever is between, the coaming or a seat's edge, onto the next)
  const jump = c.hip.distanceTo(want.hip);
  c.hip.lerp(want.hip, Math.min(1, a * 1.5));
  if (jump > 0.08) c.hip.y = Math.max(c.hip.y, groundNear(c.hip.x, c.hip.z, 0.25) + 0.3 * f.scale * Math.min(1, jump / 0.25));
  c.yaw += Math.atan2(Math.sin(want.yaw - c.yaw), Math.cos(want.yaw - c.yaw)) * a;
  c.pitch += (want.pitch - c.pitch) * a; c.roll += (want.roll - c.roll) * a;
  // (a foot or a hand moving to its new place goes over what's between, not through it)
  for (let i = 0; i < 2; i++) {
    for (const [p, q, lift] of [[c.feet[i], want.feet[i], 0.06], [c.hands[i], want.hands[i], 0.04]] as const) {
      p.lerp(q, a); p.y = Math.max(p.y, (jump > 0.08 ? groundNear(p.x, p.z, 0.12) : ground(p.x, p.z)) + lift);
    }
  }
  c.look.lerp(want.look, a);
  return c;
}

/** Where the tiller's end is in the boat's frame, from the rudder (boatMesh.ts: the group turned to steer). */
const TILLER_TIP = (() => {
  // (rudderGeometry: the tiller from the rudder head, 1.3 m forward and a little up, in the hinge's frame)
  const len = Math.hypot(TRANSOM_TOP.z - HEEL.z, TRANSOM_TOP.y - HEEL.y) + 0.1;
  return V(0, len - 0.03, 0.04).addScaledVector(V(0, -0.317, -0.949).normalize(), 1.3);
})();
export function tillerTip(turn: THREE.Object3D): THREE.Vector3 {
  const rud = turn.parent!; turn.updateMatrix(); rud.updateMatrix();
  return TILLER_TIP.clone().applyMatrix4(turn.matrix).applyMatrix4(rud.matrix);
}

/** (Moving, and which way: from where the physics has them now against last frame.) */
function track(f: Figure, x: number, z: number, dt: number): number {
  const was = f.last ?? V(x, 0, z), dx = x - was.x, dz = z - was.z, dist = Math.hypot(dx, dz);
  f.last = V(x, 0, z);
  const v = dt > 0 && dt < 0.5 ? dist / dt : 0;
  f.speed += (v - f.speed) * Math.min(1, dt * 6);
  f.gait += dist / 0.32 * Math.PI; // (a step about every 0.3 m)
  return Math.atan2(-dx, -dz);
}

/**
 * Place and pose the crew from the crew physics: each person where their weight is (crewPhys.ts: across, fore and aft,
 * how hard they're leaning out) and doing what their job is (crewWork.ts: at a winch, the cabin-top lines, the jib car,
 * the mast). `windward` +1 when the wind is over the starboard side; `c` the crew state (null: a default);
 * `hideHelm` when you're looking through the helm's eyes; `dt` for easing; `tip` the tiller's end (tillerTip).
 */
export function syncCrew(cr: Crew, windward: number, c: CrewState | undefined, dt: number, hideHelm: boolean, tip?: THREE.Vector3): void {
  const ppl = c?.people;
  // (two of them on the same side don't sit in each other's laps: at least a shoulder's width apart fore and aft)
  const ZMIN = COCK0 + 0.42, ZMAX = THWART.z - THWART.half - 0.2, inC = (z: number) => z > COCK0 - 0.1 && z < THWART.z;
  const zs = cr.crew.map((_, i) => { const z = ppl?.[i + 1]?.z ?? 1.3 + 0.6 * i; return inC(z) ? Math.min(ZMAX, Math.max(ZMIN, z)) : z; });
  for (let i = 1; i < zs.length; i++) for (let j = 0; j < i; j++) {
    const a = ppl?.[i + 1], o = ppl?.[j + 1];
    if (a && o && Math.sign(o.x) === Math.sign(a.x) && inC(zs[i]) && inC(zs[j]) && Math.abs(zs[i] - zs[j]) < 0.55) {
      const fore = Math.min(zs[i], zs[j]), lo = Math.min(fore, ZMAX - 0.55);
      if (zs[i] >= zs[j]) { zs[j] = lo; zs[i] = lo + 0.55; } else { zs[i] = lo; zs[j] = lo + 0.55; }
    }
  }
  // (two of them in the middle sit side by side on the sole)
  const mids = cr.crew.map((_, i) => { const a = ppl?.[i + 1]; return !!a && Math.abs(a.x) < 0.3 && (a.pose === 'sit' || a.pose === 'lee') && inC(zs[i]); });
  const nMid = mids.filter(Boolean).length; let m = 0;
  cr.crew.forEach((f, i) => {
    const a = ppl?.[i + 1];
    let x = a ? a.x : windward * 0.8;
    if (nMid > 1 && mids[i]) x = (m++ ? 0.21 : -0.21);
    const lean = a?.lean ?? 0, pose = a?.pose ?? 'sit';
    const z = mids[i] && nMid > 1 ? Math.max(zs[i], COCK0 + 0.6) : zs[i];
    const dir = track(f, x, a?.z ?? z, dt);
    const go = f.speed > 0.18 || pose === 'cross';
    const want = crewPose(f, x, z, lean, pose, windward, go, f.speed > 0.05 ? dir : (pose === 'cross' ? -Math.sign(x) * Math.PI / 2 : 0), i);
    apply(f, ease(f, want, dt));
    f.root.visible = true;
  });
  // the helm
  const hp = ppl?.[0], h = cr.helm, x = hp ? hp.x : windward * 0.55, z = hp?.z ?? 2.95;
  cr.helmSide = Math.abs(x) > 0.05 ? Math.sign(x) : windward;
  const away = hp?.pose === 'piano'; // single-handed, gone forward to the cabin-top lines
  const dir = track(h, x, z, dt);
  const t = tip ?? V(0, 0.8, 2.6);
  const want = away ? crewPose(h, x, z, hp?.lean ?? 0, 'piano', windward, h.speed > 0.18, dir, 9)
    : hp?.pose === 'cross' && h.speed > 0.18 ? moving(h, x, z, dir, h.scale) : helmPose(h, x, z, hp?.lean ?? 0, windward, t);
  apply(h, ease(h, want, dt));
  h.root.visible = !hideHelm;
  // the extension, from the tiller's end to the helm's hand (and a little past it), unless they've let go
  const hand = h.cur!.hands[cr.helmSide > 0 ? 0 : 1], ex = cr.extension, held = !away && !hideHelm;
  ex.visible = held;
  if (held) {
    const d = hand.clone().sub(t), len = d.length() + 0.1;
    ex.position.copy(t).addScaledVector(d.normalize(), len / 2); ex.scale.set(1, len, 1);
    ex.quaternion.setFromUnitVectors(V(0, 1, 0), d);
  }
}

/**
 * Pushing off: the bow crew member standing on the finger beside her (the shrouds), leaning in with both hands on her
 * and walking her back; then, as her bow comes level with the end of the finger, a jump across onto her side deck.
 * `p.side` +1 starboard / −1 port, `p.lat` m out to the finger's middle, `p.jump` 0 … 1; `dockY` the finger's top
 * above her waterline, `deckY` her side deck's, `t` s for the walking.
 */
export function dockhand(cr: Crew, p: { side: number; lat: number; jump: number }, dockY: number, deckYAt: number, t: number): void {
  const f = cr.crew[cr.crew.length - 1]; if (!f) return;
  const k = f.scale, z = -0.55, xDock = p.side * Math.max(1.4, p.lat - 0.35), xDeck = p.side * 0.78;
  const yaw = p.side * Math.PI / 2, fw = fwd(yaw), r = right(yaw); // facing the boat
  const hull = V(p.side * 1.05, deckYAt + 0.05, z);
  let pose: PoseT;
  if (p.jump <= 0) {
    // walking her back along the finger, leaning in, hands on her rail
    const ph = t * 5.5, hip = V(xDock, dockY + 0.93 * k, z);
    const foot = (j: number) => V(xDock, dockY + 0.06 + 0.05 * Math.max(0, Math.cos(ph + j * Math.PI)), z).addScaledVector(r, (j ? 1 : -1) * 0.12 * k).addScaledVector(fw, -0.15 + 0.12 * Math.sin(ph + j * Math.PI));
    pose = { hip, yaw, pitch: -0.35, roll: 0, feet: [foot(0), foot(1)], hands: [hull.clone().add(V(0, 0, 0.25)), hull.clone().add(V(0, 0, -0.25))], look: hull };
  } else {
    // across: up off the dock, over the gap and down onto the side deck, knees tucked, then crouching to land
    const j = Math.min(1, p.jump), e = j * j * (3 - 2 * j), arc = Math.sin(Math.PI * j) * 0.55;
    const hip = V(xDock + (xDeck - xDock) * e, dockY + 0.93 * k + (deckYAt + 0.55 - dockY - 0.93 * k) * e + arc, z);
    const tuck = 0.35 * Math.sin(Math.PI * j) + 0.25 * e;
    const foot = (i: number) => hip.clone().add(V(0, -(0.86 - tuck) * k, 0)).addScaledVector(r, (i ? 1 : -1) * 0.12 * k).addScaledVector(fw, 0.05);
    pose = { hip, yaw, pitch: -0.3 - 0.3 * Math.sin(Math.PI * j), roll: 0, feet: [foot(0), foot(1)], hands: [hip.clone().add(V(0, 0.5, 0)).addScaledVector(fw, 0.4).addScaledVector(r, -0.25), hip.clone().add(V(0, 0.5, 0)).addScaledVector(fw, 0.4).addScaledVector(r, 0.25)], look: hull };
  }
  f.cur = undefined; apply(f, pose); f.root.visible = true;
}
