import './three-setup';
import * as THREE from 'three';
import type { CrewState, Person, Pose as Job } from '../boat/crewPhys';
import { BONE, buildBody, type Body } from './crewBody';
import { CABIN, COAMING_H, COAMING_T, COCKPIT, COCKPIT_FIT, HEEL, L, TRANSOM_TOP, cabinHalf, cabinTopAt, cockpitHalf, deckY, halfBeam, hullInnerHalf, thwartTop, uAtZ } from './hull';

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

export interface Figure extends Body {
  /** (render state: the pose being eased toward, where they were last frame, a step's phase, their speed) */
  cur?: PoseT; last?: THREE.Vector3; gait: number; speed: number;
  /** (the hips' and the lean's velocities, for their springs; on the move or not; a foot's swing under way) */
  hipV?: THREE.Vector3; pitchV?: number; going?: boolean; vel?: THREE.Vector3; upr?: number; tack?: boolean; swing?: ({ from: THREE.Vector3; to: THREE.Vector3; t: number; top: number } | null)[];
}
export interface Crew { group: THREE.Group; helm: Figure; crew: Figure[]; helmSide: number; side: number; extension: THREE.Mesh }
type Limb = Body['arm'][number];

/** A sailor (crewBody.ts): their body, and the state the posing keeps. */
const figure = (p: Person, jacket: number, seed: number): Figure => ({ ...buildBody(p, jacket, seed), gait: 0, speed: 0, swing: [null, null] });

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

/** The mast's place (crewPhys.ts Z.mast: its after side), and the farthest forward anyone goes (crewPhys.ts Z.bow). */
const MAST_Z = -0.95, Z_BOW = -3.32;
const smooth01 = (t: number) => { const q = Math.max(0, Math.min(1, t)); return q * q * (3 - 2 * q); };
const COCK0 = -L / 2 + COCKPIT.u0 * L, COCK1 = -L / 2 + COCKPIT.u1 * L, CAB0 = -L / 2 + CABIN.u0 * L;
/** The cockpit, from hull.ts (COCKPIT_FIT, Boat Detail's, to the construction plan): side benches 300 mm over the sole
 * from the bulkhead aft to St. 4¾, a footwell round the thwart, and a
 * shelf at the benches' height across the after end; the thwart a deep beam across the cockpit, its top a little under
 * the coaming caps, the footwell either side of the sole open to the hull's inside, no post under the thwart. */
const SEAT_Y = COCKPIT_FIT.seat, { benchAft: BENCH_AFT, shelfFwd: SHELF_FWD } = COCKPIT_FIT;
const THWART = { z: COCKPIT_FIT.thwart.z, half: COCKPIT_FIT.thwart.half, top: thwartTop() };
const coamH = COAMING_H;
/** The sole's half-width at z (between the benches' fronts, narrowing aft with the hull: hull.ts cockpitGeometry). */
const soleHalf = (z: number) => Math.min(COCKPIT_FIT.soleHalf, Math.max(0, hullInnerHalf(uAtZ(z), COCKPIT.sole) - 0.03));
/** The front edge of the bench beside the sole (|x|, m), where one runs: its depth from there out to the coaming. */
const benchEdge = (z: number) => soleHalf(z);
const chz = (z: number) => cockpitHalf(uAtZ(z));
/** Where along the benches people sit (their hips): clear of the bulkhead forward (half a shoulder's width) and of the
 * benches' after end and the thwart; two on one bench a shoulder's width apart (SEP) fill it. */
const ZC_FWD = COCK0 + 0.3, ZC_AFT = Math.min(BENCH_AFT - 0.09, THWART.z - THWART.half - 0.17), SEP = 0.48;
const inCockpit = (ax: number, z: number) => z > COCK0 && z < COCK1 && ax < chz(z);
/** The top of whatever is at (x, z) in the boat's frame (m above the waterline): sole, bench, footwell side, shelf, thwart, coaming, deck, cabin top. */
export function ground(x: number, z: number): number {
  const ax = Math.abs(x), u = uAtZ(z);
  if (inCockpit(ax, z)) {
    if (Math.abs(z - THWART.z) < THWART.half) return THWART.top;
    if (z >= SHELF_FWD) return SEAT_Y; // (the after shelf, across)
    const sh = soleHalf(z);
    if (ax < sh) return COCKPIT.sole;
    if (z < BENCH_AFT) return SEAT_Y; // (a bench)
    // (the footwell beside the sole: open to the hull's own inside, curving out and up to the deck)
    let lo = COCKPIT.sole - 0.5, hi = deckY(u, chz(z));
    for (let q = 0; q < 14; q++) { const m = (lo + hi) / 2; if (hullInnerHalf(u, m) < ax) lo = m; else hi = m; }
    return hi;
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
interface PoseT { hip: THREE.Vector3; yaw: number; pitch: number; roll: number; feet: [THREE.Vector3, THREE.Vector3]; hands: [THREE.Vector3, THREE.Vector3]; look: THREE.Vector3; /** walking or crawling: the feet step (planted, then swung) */ step?: boolean }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The figure's forward and right in the boat frame for a yaw (it faces −z at yaw 0). */
const fwd = (yaw: number) => V(-Math.sin(yaw), 0, -Math.cos(yaw)), right = (yaw: number) => V(Math.cos(yaw), 0, -Math.sin(yaw));
/** An ankle standing on whatever is there (the boot's sole on it). */
const onGround = (p: THREE.Vector3) => {
  // (never on the coaming's narrow top: a foot near it goes inside it, on the seat)
  if (p.z > COCK0 && p.z < COCK1) {
    const c = chz(p.z), ax = Math.abs(p.x), edge = p.z < BENCH_AFT ? benchEdge(p.z) : -1;
    if (ax > c - 0.08 && ax < c + 0.12) p.x = Math.sign(p.x) * (c - 0.08);
    // (nor right against the seat's front: on the sole a hand's breadth clear of it, so the shin clears its edge)
    else if (edge > 0 && ax > edge - 0.1 && ax < edge + 0.04) p.x = Math.sign(p.x) * (edge - 0.1);
  }
  return p.setY(ground(p.x, p.z) + 0.06);
};
/** A knee or shin down on the cockpit sole between the benches stays on it, clear of the benches' fronts and the thwart. */
const keepOnSole = (p: THREE.Vector3) => {
  if (inCockpit(Math.abs(p.x), p.z) && p.z < SHELF_FWD) {
    if (p.z > THWART.z - THWART.half - 0.07 && p.z < THWART.z + 0.15) p.z = THWART.z - THWART.half - 0.07;
    const e = soleHalf(p.z) - 0.08; if (Math.abs(p.x) > e) p.x = Math.sign(p.x) * Math.max(0, e);
  }
  return p;
};
/** The jib winch on side `ws` (hull.ts, Boat Detail's: centred on the coaming at the cockpit's forward end, on a 25 mm pad,
 * the sheet leading to it 0.07 above its base); `up` higher, as for the handle on top. */
const winchAt = (ws: number, up = 0) => { const wz = COCK0 + 0.03 * L, c = chz(wz); return V(ws * (c + COAMING_T / 2), deckY(uAtZ(wz), c) + coamH(wz) + 0.025 + 0.07 + up, wz); };
/** What the crew watch: the jib's luff (its telltales). */
const JIB_LUFF = V(0, 1.5, -1.6);

/** Sitting on the side deck at its edge, the backs of the knees over the coaming and the feet on the seat below it,
 * leaning back out (`lean` 0 sitting … 1 hiking flat out: about 70°, crewPhys.ts hikeArm). `s` the side (+1 starboard). */
function onDeck(s: number, z: number, lean: number, k: number): PoseT {
  const u = uAtZ(z), c = chz(z), e = halfBeam(u);
  const knee = V(s * (c - 0.1), deckY(u, c) + coamH(z) + 0.1, z - 0.04);
  const hipY = deckY(u, e - 0.1) + 0.09 * k, dy = hipY - knee.y, l1 = BONE.thigh * k;
  const hipX = Math.min(e + 0.06 * lean, Math.abs(knee.x) + Math.sqrt(Math.max(0.01, l1 * l1 - dy * dy)));
  const yaw = s * (Math.PI / 2 - 0.2 + 0.15 * lean), r = right(yaw);
  // (the backs of the knees over the coaming and the shins hanging down inside it: in the cockpit to the plan the bench is
  // some 0.55 m under the coaming's top, about a shin and a foot, so the feet rest on it or just off it, not pulled in
  // under the knees, which would drag the thighs down through the coaming)
  const footY = (q: THREE.Vector3) => Math.max(ground(q.x, q.z) + 0.06, knee.y - 0.03 - BONE.shin * k);
  const foot = (j: number) => { const q = V(s * (c - 0.13), 0, z - 0.06).addScaledVector(r, (j ? 1 : -1) * 0.09 * k); return q.setY(footY(q)); };
  const hip = V(s * hipX, hipY, z), f = fwd(yaw);
  // hands: sitting, on the knees; hiking, one on the coaming beside them and one across the chest (on the sheet)
  const hands: [THREE.Vector3, THREE.Vector3] = lean > 0.15
    ? [hip.clone().addScaledVector(f, 0.12 * k).add(V(0, 0.38 * k, 0)).addScaledVector(r, 0.08), V(s * (c + 0.02), knee.y + 0.02, z - 0.12)]
    : [knee.clone().addScaledVector(r, -0.1 * k).add(V(0, 0.08, 0)), knee.clone().addScaledVector(r, 0.1 * k).add(V(0, 0.08, 0))];
  return { hip, yaw, pitch: -0.15 + 1.35 * lean, roll: 0, feet: [foot(0), foot(1)], hands, look: JIB_LUFF.clone() };
}
/** On the cockpit seat, back to the coaming, feet on the sole. */
function onSeat(s: number, x: number, z: number, k: number): PoseT {
  const c = chz(z), hx = Math.min(c - 0.1, Math.max(benchEdge(z) + 0.12, Math.abs(x) + 0.08));
  const yaw = s * (Math.PI / 2 - 0.45), r = right(yaw), f = fwd(yaw);
  const hip = V(s * hx, SEAT_Y + 0.09 * k, z);
  const foot = (j: number) => onGround(V(s * (hx - 0.4 * k), 0, z - 0.12).addScaledVector(r, (j ? 1 : -1) * 0.11 * k));
  const kneeAt = hip.clone().addScaledVector(f, 0.4 * k).add(V(0, 0.1, 0));
  return { hip, yaw, pitch: -0.1, roll: 0, feet: [foot(0), foot(1)], hands: [kneeAt.clone().addScaledVector(r, -0.1), kneeAt.clone().addScaledVector(r, 0.1)], look: JIB_LUFF.clone() };
}
/**
 * Low in the cockpit, nobody sits on the sole: they kneel on one knee (the owner: "nobody sits in the bottom of the
 * cockpit. they would kneel, usually on one knee"), the other foot planted ahead, out from under the boom and with
 * leverage on the lines. `front` which leg is forward (0 left, 1 right).
 */
function kneelOne(x: number, z: number, yaw: number, front: number, hands: [THREE.Vector3, THREE.Vector3], k: number, lookAt = JIB_LUFF): PoseT {
  const g = ground(x, z), f = fwd(yaw), r = right(yaw);
  // (the kneeling thigh near upright, its knee on the sole under the hips and the shin flat behind; the front foot
  // a stride ahead, its thigh about level)
  const hip = V(x, g + 0.47 * k, z);
  const feet = [0, 1].map(j => j === front
    ? onGround(hip.clone().addScaledVector(f, 0.36 * k).addScaledVector(r, (j ? 1 : -1) * 0.13 * k))
    : keepOnSole(hip.clone().addScaledVector(f, -0.4 * k).addScaledVector(r, (j ? 1 : -1) * 0.1 * k)).setY(g + 0.07)) as [THREE.Vector3, THREE.Vector3];
  return { hip, yaw, pitch: -0.2, roll: 0, feet, hands, look: lookAt.clone() };
}
/** Up in a crouch, a slight bend at the waist and the knees, under the boom (the middle crew tacking the main). */
function crouch(x: number, z: number, yaw: number, hands: [THREE.Vector3, THREE.Vector3], k: number, lookAt = JIB_LUFF): PoseT {
  // (the head well under the boom, about 1.66 m above the waterline over the cockpit)
  const g = groundNear(x, z, 0.15), f = fwd(yaw), r = right(yaw), hip = V(x, g + 0.55 * k, z);
  const feet = [0, 1].map(j => onGround(hip.clone().addScaledVector(f, (j ? 0.08 : -0.05) * k).addScaledVector(r, (j ? 1 : -1) * 0.15 * k))) as [THREE.Vector3, THREE.Vector3];
  return { hip, yaw, pitch: -0.6, roll: 0, feet, hands, look: lookAt.clone() };
}
/** In the middle, low: on one knee on the sole, facing forward, a hand on the forward knee and one on the seat's edge. */
function onSole(x0: number, z0: number, k: number): PoseT {
  // (between the benches: the sole's only 0.7 m wide, so the kneeling knee and the shin behind it stay on it)
  const x = Math.max(-1, Math.min(1, x0 / 0.3)) * Math.max(0, benchEdge(Math.min(z0, BENCH_AFT - 0.1)) - 0.2);
  const z = Math.min(THWART.z - THWART.half - 0.45, Math.max(z0, COCK0 + 0.55)), s = x >= 0 ? 1 : -1, front = s > 0 ? 0 : 1;
  const p = kneelOne(x, z, 0, front, [V(0, 0, 0), V(0, 0, 0)], k);
  const knee = p.feet[front].clone().add(V(0, 0.4 * k, 0.05));
  const he = benchEdge(z) + 0.03; p.hands = front === 0 ? [knee, V(he, SEAT_Y + 0.05, z - 0.1)] : [V(-he, SEAT_Y + 0.05, z - 0.1), knee];
  return p;
}
/** Kneeling on the surface at (x, z), facing `yaw`, shins flat behind, hands at `reach`. */
function kneel(x: number, z: number, yaw: number, reach: [THREE.Vector3, THREE.Vector3], k: number, lookAt = JIB_LUFF): PoseT {
  // (the hips 0.34 m up, so with the thigh leaning forward the knee is on the surface and the shin lies flat behind it:
  // the knee 0.33 m ahead of the hips, the ankle 0.11 m behind them)
  const g = ground(x, z), f = fwd(yaw), r = right(yaw);
  const hip = V(x, g + 0.37 * k, z).addScaledVector(f, -0.12 * k);
  const foot = (j: number) => { const q = hip.clone().addScaledVector(f, -0.11 * k).addScaledVector(r, (j ? 1 : -1) * 0.1 * k); return q.setY(Math.max(g, ground(q.x, q.z)) + 0.07); };
  return { hip, yaw, pitch: -0.45, roll: 0, feet: [foot(0), foot(1)], hands: reach, look: lookAt.clone() };
}
/** Moving about the boat: crouched under the boom, stepping over what's beneath, facing the way they're going. */
function moving(fig: Figure, x: number, z: number, yaw: number, k: number): PoseT {
  const g = groundNear(x, z, 0.22), f = fwd(yaw), r = right(yaw), ph = fig.gait;
  if (!inCockpit(Math.abs(x), z) && z < COCK1) {
    // forward of the cockpit (along the side deck, over the cabin top): on hands and knees, a knee and a hand at a time
    // (round the mast, not through it)
    if (Math.abs(z - MAST_Z) < 0.35 && Math.abs(x) < 0.32) x = (x >= 0 ? 1 : -1) * 0.32;
    const p = kneel(x, z, yaw, [V(0, 0, 0), V(0, 0, 0)], k);
    p.hip.y = g + 0.45 * k; p.pitch = -1.05;
    p.hands = [0, 1].map(j => { const h = p.hip.clone().addScaledVector(f, (0.42 + 0.08 * Math.sin(ph + j * Math.PI)) * k).addScaledVector(r, (j ? 1 : -1) * 0.16 * k); return h.setY(ground(h.x, h.z) + 0.05); }) as [THREE.Vector3, THREE.Vector3];
    p.look = p.hip.clone().addScaledVector(f, 2).setY(p.hip.y + 0.4); p.step = true;
    return p;
  }
  // in the cockpit (or across the after deck): crouched under the boom, stepping over the seats and the thwart (with
  // room ahead for the knees)
  // (clear of the thwart, a thigh's length: the knees lead aft facing aft, and sweep round as they turn)
  if (z < COCK1) { const aft = Math.cos(yaw) < 0; z = Math.max(z, COCK0 + (aft ? 0.2 : 0.45)); if (z < THWART.z) z = Math.min(z, THWART.z - THWART.half - 0.3); }
  // (low: crouched over the sole or a seat, not stood up because the coaming is near)
  const hip = V(x, groundNear(x, z, 0.08) + 0.42 * k, z);
  const foot = (j: number) => onGround(V(x, 0, z).addScaledVector(f, (j ? 0.06 : -0.06) * k).addScaledVector(r, (j ? 1 : -1) * 0.13 * k));
  // hands down to the seat or the coaming for balance
  const hand = (j: number) => { const h = hip.clone().addScaledVector(f, 0.28 * k).addScaledVector(r, (j ? 1 : -1) * 0.25 * k); return h.setY(Math.max(ground(h.x, h.z), hip.y - 0.3) + 0.05); };
  // (the cockpit's under a metre long between the bulkhead and the thwart: crouched, but not so far over that the head
  // meets the cabin's after end)
  return { hip, yaw, pitch: inCockpit(Math.abs(x), z) ? -0.6 : -0.85, roll: 0, feet: [foot(0), foot(1)], hands: [hand(0), hand(1)], look: hip.clone().addScaledVector(f, 2).setY(hip.y + 0.6), step: true };
}

/** Where a crew member is and what they're doing (crewPhys.ts), as a pose on something real. */
function crewPose(fig: Figure, x: number, z: number, lean: number, job: Job, windward: number, isMoving: boolean, motion: number, idx: number, tackRole: 'jib' | 'main' | null = null, dest = z): PoseT {
  const k = fig.scale, s = Math.abs(x) > 0.05 ? Math.sign(x) : windward, ax = Math.abs(x);
  if (tackRole) {
    // through a tack, down in the cockpit and across under the boom (the owner): the forward crew on one knee working
    // the jib sheets at the leeward winch, the middle crew up in a crouch tacking the main from the thwart
    // (the jib hand forward by the winches, the main hand aft by the thwart, clear of each other)
    const zz = tackRole === 'jib' ? COCK0 + 0.5 : THWART.z - THWART.half - 0.1, lim = benchEdge(zz) - (tackRole === 'jib' ? 0.2 : 0.1), px = Math.max(-lim, Math.min(lim, x));
    if (tackRole === 'jib') {
      const ws = -windward, w = winchAt(ws);
      const yaw = ws * 0.5, hold = V(px + ws * 0.15, ground(px, zz) + 0.75 * k, zz - 0.3);
      return kneelOne(px, zz, yaw, ws > 0 ? 1 : 0, ws > 0 ? [hold, w] : [w, hold], k, w);
    }
    const sheet = V(px * 0.4, 0.9, THWART.z - 0.08);
    return crouch(px, zz, 0, [sheet.clone().add(V(-0.07, 0.05, 0)), sheet.clone().add(V(0.07, -0.05, 0))], k, sheet.clone().add(V(0, 1.2, -1)));
  }
  // (moving: crouched in the cockpit, on hands and knees on deck; arriving at the side deck they step up onto it)
  // (somewhere forward of the cockpit with no job there, as after setting the pole, waiting to see where they go next:
  // on deck on hands and knees where they are, not drawn back in the cockpit)
  // (a place up forward, not yet reached: still on the way there, along the side deck)
  if ((job === 'fore' || job === 'bow') && z > CAB0) { isMoving = true; dest = Math.min(dest, CAB0 - 0.5); }
  if (z < COCK0 - 0.3 && (job === 'sit' || job === 'lee' || job === 'hike' || job === 'cross')) isMoving = true;
  // (seated along the cockpit, they're on its benches or the side deck beside them: the weight's place from the physics,
  // drawn within the benches' length)
  else if (z < COCK1 && (job === 'sit' || job === 'lee' || job === 'hike' || job === 'cross')) { z = Math.min(ZC_AFT, Math.max(ZC_FWD, z)); if (dest >= COCK0 - 0.3) dest = Math.min(ZC_AFT, Math.max(ZC_FWD, dest)); }
  const sideways = Math.abs(motion) > 0.6 && Math.abs(motion) < 2.5, alongside = z > COCK0 && z < COCK1 && ax > chz(z) - 0.2;
  // (moving fore and aft along the side deck within the cockpit's length: they slide along it sitting, not walk the coaming)
  if (isMoving && !sideways && alongside && z >= ZC_FWD - 0.01 && job !== 'car' && job !== 'mast') return onDeck(s, Math.min(ZC_AFT, Math.max(ZC_FWD, z)), 0, k);
  if (isMoving && !(alongside && sideways)) {
    // (across the cockpit they shuffle sideways facing forward, under the boom; fore and aft, the way they're going)
    // (on the way to the cabin-top lines, which they work from the cockpit's forward end: through the cockpit)
    // (in the cockpit, a crouched shuffle facing forward whichever way they go: turning round there sweeps the knees into
    // the seats.) Going forward past the cabin, along the side deck: out of the cockpit's forward end onto it, past the
    // cabin on hands and knees, and in again on the foredeck, not over the companionway and the cabin top
    if (job === 'piano') return moving(fig, x, Math.max(z, COCK0 + 0.5), inCockpit(ax, z) ? 0 : motion, k);
    let zz = Math.max(z, Z_BOW); const forward = Math.min(z, dest) < COCK0 - 0.2;
    // (out of the cockpit's forward corner onto the side deck first, then forward: not diagonally across the cabin's corner)
    if (forward && fig.cur && zz < COCK0 + 0.35 && zz > CAB0 && Math.abs(fig.cur.hip.x) < cabinHalf(uAtZ(COCK0 - 0.1)) + 0.06) zz = Math.max(zz, Math.min(fig.cur.hip.z, COCK0 + 0.35));
    const u = uAtZ(zz), side = cabinHalf(u) + 0.18;
    const out = !forward ? 0 : smooth01((COCK0 + 1.1 - zz) / 0.6) * smooth01((zz - (CAB0 - 0.2)) / 0.35); // (out to the side well before the knees, ahead of the hips, reach the cabin)
    const px = out > 0 ? s * Math.max(ax, ax + (Math.max(ax, side) - ax) * out) : x;
    // (along the side deck, straight along it, fore or aft: the shins trailing behind on the deck, not across the cabin)
    const along = out > 0.3 ? (Math.cos(motion) >= 0 ? 0 : Math.PI) : motion;
    return moving(fig, px, zz, inCockpit(Math.abs(px), zz) ? 0 : along, k);
  }
  if (job === 'bow') {
    // deep downwind with the pole out: sitting astride the bow just forward of the forestay, a leg over each side, hands
    // on the deck beside them (the owner: "one crew will sit in front of the forestay with both legs dangling over")
    const u = uAtZ(z), e = halfBeam(u), d = deckY(u, 0), hip = V(0, d + 0.09 * k, z);
    const feet = [-1, 1].map(sx => V(sx * (e + 0.1), d - 0.38, z - 0.06)) as [THREE.Vector3, THREE.Vector3];
    return { hip, yaw: 0, pitch: 0.12, roll: 0, feet, hands: [V(-0.13, deckY(u, 0.13) + 0.03, z + 0.06), V(0.13, deckY(u, 0.13) + 0.03, z + 0.06)], look: V(0, 1, z - 6) };
  }
  if (job === 'fore') {
    // on the foredeck between the mast and the forestay, knees up, feet on the deck ahead, watching the jib on its pole
    const u = uAtZ(z), hip = V(x, deckY(u, ax) + 0.09 * k, z);
    const feet = [0, 1].map(j => onGround(V(x + (j ? 1 : -1) * 0.13 * k, 0, z - 0.42 * k))) as [THREE.Vector3, THREE.Vector3];
    const knees = V(x, hip.y + 0.32 * k, z - 0.26 * k);
    return { hip, yaw: 0, pitch: -0.2, roll: 0, feet, hands: [knees.clone().add(V(-0.08, 0, -0.03)), knees.clone().add(V(0.08, 0, -0.03))], look: JIB_LUFF.clone() };
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
  const zc = Math.min(ZC_AFT, Math.max(ZC_FWD, z));
  if (job === 'piano' && ax > 0.55) {
    // the dual-ended lines worked from the side deck (crewWork.ts BOTH_SIDES): sitting at its forward end, leaning
    // forward to them on the cabin top beside the companionway
    const p = onDeck(s, COCK0 + 0.5, 0, k), zl = COCK0 - 0.08, cl = V(s * 0.47, cabinTopAt(uAtZ(zl), 0.47) + 0.05, zl);
    p.pitch = -0.4; p.hands = [cl.clone().add(V(-0.05, 0, 0.03)), cl.clone().add(V(0.05, 0, -0.03))]; p.look = cl;
    return p;
  }
  if (job === 'piano') {
    // the cabin-top lines at its after end: kneeling on the sole at the forward end of the cockpit,
    // facing forward, hands on the lines at their jammers on the cabin top's after edge, either side of the hatch (Boat Detail: |x| 0.37–0.50)
    const zk = COCK0 + 0.55, px = s * Math.min(ax, benchEdge(zk) - 0.14);
    { const p = kneel(px, zk, 0, [V(-0.43, cabinTopAt(uAtZ(COCK0 - 0.08), 0.43) + 0.05, COCK0 - 0.08), V(0.43, cabinTopAt(uAtZ(COCK0 - 0.08), 0.43) + 0.05, COCK0 - 0.08)], k); p.pitch = -0.25; return p; }
  }
  let p: PoseT;
  if (ax >= chz(zc) - 0.06 || job === 'hike') p = onDeck(s, zc, lean, k);
  else if (ax >= 0.3) p = onSeat(s, x, zc, k);
  else p = onSole(x, zc, k);
  if (job === 'winch') {
    // cranking the jib sheet in on the winch at the coaming's forward end (on the leeward side), one hand on the handle
    const ws = -windward, w = winchAt(ws, 0.04);
    const a = performance.now() / 1000 * 5 + idx; // (about a turn a second)
    p.hands = [w.clone().add(V(Math.cos(a) * 0.16, 0.05, Math.sin(a) * 0.16)), w.clone().add(V(-ws * 0.12, -0.05, 0.25))];
    p.pitch = -0.35; p.look = w;
  } else if (idx === 0 && lean <= 0.15) {
    // the jib trimmer: the sheet in the forward hand, led from the leeward winch
    const w = winchAt(-windward);
    const hold = p.hip.clone().add(V(0, 0.26 * k, 0)).addScaledVector(fwd(p.yaw), 0.5 * k).lerp(w, 0.15); // (at arm's length, the elbow easy)
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
  const fz = COCK1 - 0.24, fc = chz(fz) - 0.16; // (feet on the seat inside the coaming, the shins clear of it)
  const foot = (j: number) => { const q = V(s * Math.min(fc - 0.1 * lean, Math.max(0.12, hx - (0.3 + 0.2 * lean) * k)), 0, fz).addScaledVector(r, (j ? 1 : -1) * 0.12 * k); q.x = Math.sign(q.x) * Math.min(Math.abs(q.x), chz(q.z) - 0.16); onGround(q);
    // (sitting out on the side deck, the knees over the coaming: the feet hang from them, on the shelf or just off it)
    if (hx > chz(fz) - 0.05) q.y = Math.max(q.y, deckY(uAtZ(fz), chz(fz)) + coamH(fz) + 0.04 - BONE.shin * k);
    return q; }
  // the extension: from the tiller's end toward the chest, as long as the hand is from it (it's about a metre long)
  const chest = hip.clone().add(V(0, 0.42 * k, 0)), d = chest.clone().sub(tip), reach = Math.min(0.95, d.length() - 0.28 * k);
  const ext = tip.clone().addScaledVector(d.normalize(), Math.max(0.2, reach));
  const sheet = V(s * 0.12, 0.95, THWART.z + 0.15).lerp(chest, 0.35);
  const hands: [THREE.Vector3, THREE.Vector3] = s > 0 ? [ext, sheet] : [sheet, ext];
  return { hip, yaw, pitch: 0.05 + 1.1 * lean, roll: 0, feet: [foot(0), foot(1)], hands, look: JIB_LUFF.clone() };
}

/** The helm crossing in a tack or gybe: crouched across the after deck under the boom, the extension kept in hand
 * (swapped across behind them as they go). */
function helmCrossing(h: Figure, x: number, z: number, dir: number, tip: THREE.Vector3): PoseT {
  // (facing forward as they shuffle across behind the tiller, so the knees stay over the cockpit's after end)
  void dir; const p = moving(h, x, z, 0, h.scale), chest = p.hip.clone().add(V(0, 0.35 * h.scale, 0));
  const d = chest.sub(tip), ext = tip.clone().addScaledVector(d.normalize(), Math.max(0.2, Math.min(0.95, d.length() - 0.25)));
  ext.y = Math.min(ext.y, p.hip.y + 0.2 * h.scale); // (low, at the hip, as they pass the stick behind them)
  p.hands[x >= 0 ? 0 : 1] = ext;
  return p;
}

// ———————————————————————————— inverse kinematics ————————————————————————————

/** How fast a knee or an elbow swings round to point a new way (rad/s), and this frame's time step. */
const BEND_RATE = 8; let ikDt = 1 / 30;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _d = V(0, 0, 0), _x = V(0, 0, 0), _y = V(0, 0, 0), _z = V(0, 0, 0);
/**
 * Two bones from `base` (the joint's position in the parent's frame) to `target` (in the same frame), lengths l1 and l2,
 * the middle joint bending toward `hint`; `back` +1 for a leg (the shin swings back), −1 for an arm. Sets the limb's
 * rotations: each bone lies along its own −y.
 */
function ik(limb: Limb, base: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, hint: THREE.Vector3, back: number): void {
  const d = _a.copy(target).sub(base); let len = d.length();
  // (a soft reach: near full stretch the limb straightens gradually instead of the knee or elbow whipping across as the
  // target comes within reach and goes out of it)
  const Lm = l1 + l2, soft = 0.9 * Lm;
  if (len > soft) len = soft + (Lm - soft) * (1 - Math.exp(-(len - soft) / (Lm - soft)));
  len = Math.min(Math.max(len, Math.abs(l1 - l2) + 1e-3), Lm * 0.999); d.normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // (the way the knee or elbow points: the hint, steadied by where it pointed last frame, so it never flips across
  // when the hint lines up with the limb)
  const bend = _b.copy(hint).addScaledVector(d, -hint.dot(d)), last = limb.root.userData.bend as THREE.Vector3 | undefined;
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, -1); bend.normalize();
  if (last) {
    // (turning toward the hint from last frame's way, at most BEND_RATE: a knee swings round, it doesn't flick across)
    const prev = _x.copy(last).addScaledVector(d, -last.dot(d));
    if (prev.lengthSq() > 1e-6) {
      prev.normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, prev.dot(bend)))), max = BEND_RATE * ikDt;
      if (ang > max) { const ax = _y.crossVectors(prev, bend); if (ax.lengthSq() < 1e-8) ax.copy(d); ax.normalize(); bend.copy(prev).applyAxisAngle(ax, max); }
    }
  }
  (limb.root.userData.bend ??= new THREE.Vector3()).copy(bend);
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
const _ax = V(0, 0, 0), _qc = new THREE.Quaternion();
/** Put a figure in a pose (`upright` rad: how far the torso leans against the boat's heel, to stay over the hips as she
 * heels: a sitter keeps their body nearly upright, a hiker braced on the rail less so). */
function apply(f: Figure, p: PoseT, upright = 0, dt = 1 / 30): void {
  ikDt = dt > 0 && dt < 0.5 ? dt : 10; // (no swing to ease on a first frame)
  const k = f.scale;
  f.root.position.copy(p.hip); f.root.rotation.set(0, p.yaw, 0);
  // (the heel's axis, the boat's fore-and-aft line, in the figure's own turned frame)
  _ax.set(0, 0, 1).applyAxisAngle(V(0, 1, 0), -p.yaw);
  f.torso.quaternion.setFromEuler(_e.set(p.pitch, 0, p.roll)).premultiply(_qc.setFromAxisAngle(_ax, upright));
  _inv.setFromEuler(_e.set(0, p.yaw, 0)).invert();
  // (into the figure's own frame: unturned, unscaled)
  const local = (w: THREE.Vector3, out: THREE.Vector3) => out.copy(w).sub(p.hip).applyQuaternion(_inv).multiplyScalar(1 / k);
  f.leg.forEach((l, i) => ik(l, l.root.position, local(p.feet[i], _p), BONE.thigh, BONE.shin, V((i ? 1 : -1) * 0.05, 0.3, -1), 1));
  _tq.copy(f.torso.quaternion).invert();
  f.arm.forEach((a, i) => ik(a, a.root.position, local(p.hands[i], _p).applyQuaternion(_tq), BONE.upper, BONE.fore, V((i ? 1 : -1) * 0.5, -0.3, 1), -1));
  // the head turns to what they're watching (within a neck's reach)
  local(p.look, _h).applyQuaternion(_tq).sub(f.head.position);
  f.head.rotation.set(Math.max(-0.6, Math.min(0.5, Math.atan2(_h.y - 0.1, Math.hypot(_h.x, _h.z)))), Math.max(-1.3, Math.min(1.3, Math.atan2(-_h.x, -_h.z))), 0);
}
/** Ease the pose shown toward the pose wanted (a quarter of a second or so). */
function ease(f: Figure, want: PoseT, dt: number): PoseT {
  if (!f.cur || dt <= 0 || dt > 0.5) {
    f.cur = { ...want, hip: want.hip.clone(), feet: [want.feet[0].clone(), want.feet[1].clone()], hands: [want.hands[0].clone(), want.hands[1].clone()], look: want.look.clone() };
    f.hipV = V(0, 0, 0); f.pitchV = 0; f.swing = [null, null]; return f.cur;
  }
  const c = f.cur, a = 1 - Math.exp(-dt * 9);
  // the hips on a critically damped spring (about a fifth of a second): a person sets off and stops smoothly, not at
  // once, and a change of seat is a step: up off one and over whatever is between (the coaming, a seat's edge) onto the next
  const jump = c.hip.distanceTo(want.hip), W = 11, v = f.hipV ??= V(0, 0, 0);
  const aim = _t.copy(want.hip);
  // (lifted only over something on the way that's higher than where they're going, the coaming between the deck and the
  // cockpit: not as a hiker leans out and in, which once floated them above the rail)
  let rising = false;
  if (jump > 0.08) {
    let top = 0; for (let q = 0; q <= 6; q++) { _u.copy(c.hip).lerp(want.hip, q / 6); top = Math.max(top, ground(_u.x, _u.z)); }
    if (top > ground(want.hip.x, want.hip.z) + 0.04 && top > ground(c.hip.x, c.hip.z) - 0.3) {
      aim.y = Math.max(aim.y, top + 0.3 * f.scale * Math.max(0.6, Math.min(1, jump / 0.25)));
      rising = c.hip.y < top + 0.2 * f.scale; // (the feet wait while they rise over it, and they go over it slowly)
      if (rising) { aim.x = c.hip.x + (want.hip.x - c.hip.x) * 0.3; aim.z = c.hip.z + (want.hip.z - c.hip.z) * 0.3; }
    }
  }
  v.addScaledVector(_s.copy(aim).sub(c.hip), W * W * dt).multiplyScalar(Math.max(0, 1 - 2 * W * dt)); c.hip.addScaledVector(v, dt);
  if (rising) c.hip.y = Math.min(aim.y, Math.max(c.hip.y, c.hip.y + 1.0 * dt)); // (pushing up off the seat: briskly)
  // (turning: eased, and no quicker than a person turns their body, about 3 rad/s)
  // (and not while rising over the coaming out of a seat on the side deck: up first, knees still over it, then round)
  if (!rising) { const dy = Math.atan2(Math.sin(want.yaw - c.yaw), Math.cos(want.yaw - c.yaw)) * a; c.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy)); }
  // the lean on a slower spring (leaning out as a puff comes, in as it goes: about a third of a second, never a snap)
  const P = 7; f.pitchV = ((f.pitchV ?? 0) + P * P * (want.pitch - c.pitch) * dt) * Math.max(0, 1 - 2 * P * dt); c.pitch += f.pitchV * dt;
  c.roll += (want.roll - c.roll) * a;
  for (let i = 0; i < 2; i++) {
    // (a hand moving to its new place goes over what's between, not through it)
    { const hd = c.hands[i], far = hd.distanceTo(want.hands[i]) > 0.15, hx = hd.x, hz = hd.z, hy = hd.y;
      // (a hand whose way to its new place passes by its own shoulder, from the sheet overhead down to the seat, goes
      // round it, out to the side, as an arm does: not through it, folding the elbow right over)
      const out = right(c.yaw).multiplyScalar(i ? 1 : -1), shY = BONE.shoulderY * f.scale;
      const sh = _sh.copy(c.hip).addScaledVector(fwd(c.yaw), -Math.sin(c.pitch) * shY).add(_v.set(0, Math.cos(c.pitch) * shY, 0)).addScaledVector(out, BONE.shoulderX * f.scale);
      const seg = _v.copy(want.hands[i]).sub(hd), tq = Math.max(0, Math.min(1, _w.copy(sh).sub(hd).dot(seg) / Math.max(1e-6, seg.lengthSq())));
      const passes = seg.lengthSq() > 0.0025 && _w.copy(hd).addScaledVector(seg, tq).distanceTo(sh) < 0.2;
      toward(hd, passes ? _w.copy(sh).addScaledVector(out, 0.28).setY(Math.min(sh.y, Math.max(hd.y, want.hands[i].y))) : want.hands[i], a, LIMB_SPEED * dt);
      // (coming to a step up, the bench's edge or the coaming, it stops and rises to it at a hand's pace: never snapped up onto it)
      if (ground(hd.x, hd.z) + 0.02 > hy + LIMB_SPEED * dt) { hd.x = hx; hd.z = hz; hd.y = Math.max(hy, ground(hx, hz) + 0.02) + LIMB_SPEED * dt; }
      // (rising early to clear an edge it's coming to, at a hand's pace; never inside what's under it)
      const clear = far ? groundNear(hd.x, hd.z, 0.3) + 0.04 : 0;
      hd.y = Math.max(hd.y, Math.min(clear, hd.y + LIMB_SPEED * dt), ground(hd.x, hd.z) + 0.02); }
    const foot = c.feet[i], sw = f.swing![i];
    if (want.step) {
      // walking or crawling: each foot stays planted until it's left behind, then swings (lifted) to a new place
      // ahead, one foot at a time, about a quarter of a second a step: no foot slides on the deck
      if (sw) {
        sw.t = Math.min(1, sw.t + dt / Math.max(0.22, sw.from.distanceTo(sw.to) / 1.4));
        const e = sw.t * sw.t * (3 - 2 * sw.t);
        foot.copy(sw.from).lerp(sw.to, e);
        // (lifted clear of whatever it passes over, highest mid-step)
        const peak = Math.max(sw.top, sw.from.y, sw.to.y) + 0.07 - (sw.from.y + sw.to.y) / 2;
        foot.y += Math.max(0, peak) * Math.sin(Math.PI * sw.t); foot.y = Math.max(foot.y, ground(foot.x, foot.z) + 0.06);
        if (sw.t >= 1) f.swing![i] = null;
      } else if (!f.swing![1 - i] && foot.distanceTo(want.feet[i]) > 0.16 * f.scale) {
        const ahead = want.feet[i].clone().addScaledVector(_s.copy(want.feet[i]).sub(foot).setY(0).normalize(), 0.08 * f.scale);
        const to = onGround(ahead); let top = Math.max(foot.y, to.y);
        for (let q = 1; q < 6; q++) { _t.copy(foot).lerp(to, q / 6); top = Math.max(top, ground(_t.x, _t.z) + 0.06); }
        f.swing![i] = { from: foot.clone(), to, t: 0, top };
      }
    } else {
      f.swing![i] = null;
      // (on its way, it clears what it passes over; once there, it rests on what's under it)
      // (clearing what's between only on a real step to a new place: a foot following a lean, a few centimetres, stays down)
      const going = foot.distanceTo(want.feet[i]) > 0.15;
      const fx = foot.x, fz = foot.z, fy = foot.y;
      toward(foot, want.feet[i], a, LIMB_SPEED * dt * (rising ? 0.3 : 1));
      // (coming to a step up, the bench's edge or the coaming: it stops and lifts to it at a foot's pace, never snapped up)
      if (ground(foot.x, foot.z) + 0.06 > fy + LIMB_SPEED * dt) { foot.x = fx; foot.z = fz; foot.y = Math.max(fy, ground(fx, fz) + 0.06) + LIMB_SPEED * dt; }
      // (rising to clear what's near it as it goes, at a foot's pace; never below what's under it)
      let clear = 0;
      if (going) {
        // (only over something on the way that's higher than both ends: the coaming, a seat's edge between the sole and the deck)
        let top = 0; for (let q = 1; q < 5; q++) { _u.copy(foot).lerp(want.feet[i], q / 5); top = Math.max(top, ground(_u.x, _u.z)); }
        if (top > Math.max(ground(foot.x, foot.z), ground(want.feet[i].x, want.feet[i].z)) + 0.03) clear = top + 0.06;
      }
      foot.y = Math.max(foot.y, ground(foot.x, foot.z) + 0.06, Math.min(clear, foot.y + LIMB_SPEED * dt));
      // (while the hips are still out on the side deck, the knees are over the coaming: the feet hang from them, not
      // down on the bench, which would drag the thighs through it)
      if (c.hip.z > COCK0 && c.hip.z < COCK1 && Math.abs(c.hip.x) > chz(c.hip.z) - 0.05) foot.y = Math.max(foot.y, deckY(uAtZ(c.hip.z), chz(c.hip.z)) + coamH(c.hip.z) + 0.04 - BONE.shin * f.scale);
    }
  }
  // (the hips stay a shin's length or so above the feet: someone stepping up onto the deck rises with the step, they
  // don't fold up under it)
  // (only on the move: seated, the feet may well be level with the hips, as when sitting on the deck with them on the seat)
  const lowest = Math.max(c.feet[0].y, c.feet[1].y) + 0.32 * f.scale;
  if (want.step && c.hip.y < lowest) { c.hip.y = lowest; if (v.y < 0) v.y = 0; }
  c.look.lerp(want.look, a);
  return c;
}
const _s = V(0, 0, 0), _t = V(0, 0, 0), _u = V(0, 0, 0), _sh = V(0, 0, 0), _v = V(0, 0, 0), _w = V(0, 0, 0);
/** How fast a hand or a foot moves to its new place at most (m/s): briskly, as a sailor's do (an estimate). */
const LIMB_SPEED = 2.2;
/** Ease `p` toward `q` by the share `a`, but no further than `max`. */
function toward(p: THREE.Vector3, q: THREE.Vector3, a: number, max: number): void {
  const d = _s.copy(q).sub(p).multiplyScalar(a), l = d.length(); if (l > max) d.multiplyScalar(max / l); p.add(d);
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
  // which way they're going: their velocity, smoothed over a few tenths of a second (so the body doesn't swing about
  // as they slow and stop)
  const vel = f.vel ??= V(0, 0, 0);
  if (dt > 0 && dt < 0.5) vel.lerp(_s.set(dx / dt, 0, dz / dt), Math.min(1, dt * 5));
  return Math.atan2(-vel.x, -vel.z);
}

/** (how upright they hold themselves against the heel, eased as they change what they're doing) */
function upright(f: Figure, want: number, dt: number): number { f.upr = f.upr == null || dt > 0.5 ? want : f.upr + (want - f.upr) * Math.min(1, dt * 4); return f.upr; }

/**
 * On their way somewhere: across the boat to the other side, or fore and aft to a job (where the physics is taking
 * them: crewPhys.ts goal), until they're nearly there. Moving out to hike, or in from it, on the same side is the body
 * leaning out and in, not a walk.
 */
function travelling(f: Figure, a: CrewState['people'][number] | undefined, x: number): boolean {
  const g = a?.goal; if (!a || !g) return false;
  const across = Math.sign(g.x) !== Math.sign(x) && Math.abs(g.x - x) > 0.25, along = Math.abs(g.z - a.z) > 0.4;
  if (f.going) return Math.abs(g.x - x) > 0.08 || Math.abs(g.z - a.z) > 0.08;
  return across || along;
}

/**
 * Place and pose the crew from the crew physics: each person where their weight is (crewPhys.ts: across, fore and aft,
 * how hard they're leaning out) and doing what their job is (crewWork.ts: at a winch, the cabin-top lines, the jib car,
 * the mast). `windward` +1 when the wind is over the starboard side; `c` the crew state (null: a default);
 * `hideHelm` when you're looking through the helm's eyes; `dt` for easing; `tip` the tiller's end (tillerTip).
 */
export function syncCrew(cr: Crew, windward: number, c: CrewState | undefined, dt: number, hideHelm: boolean, tip?: THREE.Vector3, heelDeg = 0, tacking = false): void {
  // (sitting, people hold their bodies near upright as she heels; hiking or kneeling at a job, braced, less)
  const heel = heelDeg * Math.PI / 180, against = (pose: string) => -heel * (pose === 'sit' || pose === 'lee' || pose === 'helm' ? 0.55 : pose === 'cross' ? 0.3 : 0.2);
  const ppl = c?.people;
  // (two of them on the same side don't sit in each other's laps: at least a shoulder's width apart fore and aft)
  const ZMIN = ZC_FWD, ZMAX = ZC_AFT, inC = (z: number) => z > COCK0 - 0.1 && z < THWART.z;
  const zs = cr.crew.map((_, i) => { const z = ppl?.[i + 1]?.z ?? 1.3 + 0.6 * i; return inC(z) ? Math.min(ZMAX, Math.max(ZMIN, z)) : z; });
  for (let i = 1; i < zs.length; i++) for (let j = 0; j < i; j++) {
    const a = ppl?.[i + 1], o = ppl?.[j + 1];
    const seated = (q: typeof a) => !!q && (q.pose === 'sit' || q.pose === 'lee' || q.pose === 'hike' || q.pose === 'cross');
    if (seated(a) && seated(o) && (Math.sign(o!.x) === Math.sign(a!.x) || a!.pose === 'cross' || o!.pose === 'cross') && inC(zs[i]) && inC(zs[j]) && Math.abs(zs[i] - zs[j]) < SEP) {
      const fore = Math.min(zs[i], zs[j]), lo = Math.min(fore, ZMAX - SEP);
      if (zs[i] >= zs[j]) { zs[j] = lo; zs[i] = lo + SEP; } else { zs[i] = lo; zs[j] = lo + SEP; }
    }
  }
  // (two of them in the middle sit side by side on the sole)
  const mids = cr.crew.map((_, i) => { const a = ppl?.[i + 1]; return !!a && Math.abs(a.x) < 0.3 && (a.pose === 'sit' || a.pose === 'lee') && inC(zs[i]); });
  const nMid = mids.filter(Boolean).length; let m = 0;
  // a tack under way: from the helm putting her about (the roll's lead) through the wind until they're across. The forward
  // crew works the jib on one knee, the others tack the main in a crouch (alone with the helm, the one crew does the jib)
  const tackOn = !!c && (tacking || !!c.roll);
  const fore = cr.crew.reduce((best, _, i) => (ppl?.[i + 1]?.z ?? 9) < (ppl?.[best + 1]?.z ?? 9) ? i : best, 0);
  cr.crew.forEach((f, i) => {
    const a = ppl?.[i + 1];
    let x = a ? a.x : windward * 0.8;
    if (nMid > 1 && mids[i]) x = (m++ ? 0.21 : -0.21) * windward; // (mirrored on the other tack)
    const lean = a?.lean ?? 0, pose = a?.pose ?? 'sit';
    const z = mids[i] && nMid > 1 ? Math.max(zs[i], COCK0 + 0.6) : zs[i];
    const dir = track(f, x, a?.z ?? z, dt);
    // (on the move from 0.22 m/s, settled again under 0.1: no flicker between walking and sitting)
    const go = f.going = travelling(f, a, x);
    // (in the tack while it's under way, and until they're across; a job elsewhere, the mast or the car, comes first)
    const busy = pose === 'mast' || pose === 'car' || pose === 'piano' || pose === 'bow' || pose === 'fore';
    f.tack = !busy && (tackOn || (!!f.tack && go));
    const role = f.tack ? (i === fore ? 'jib' : 'main') : null;
    const want = crewPose(f, x, z, lean, pose, windward, go && !role, f.speed > 0.05 ? dir : (pose === 'cross' ? -Math.sign(x) * Math.PI / 2 : 0), i, role, a?.goal?.z ?? z);
    apply(f, ease(f, want, dt), upright(f, against(pose), dt), dt);
    f.root.visible = true;
  });
  // the helm
  const hp = ppl?.[0], h = cr.helm, x = hp ? hp.x : windward * 0.55, z = hp?.z ?? 2.95;
  cr.helmSide = Math.abs(x) > 0.05 ? Math.sign(x) : windward;
  const away = hp?.pose === 'piano'; // single-handed, gone forward to the cabin-top lines
  const dir = track(h, x, z, dt);
  const t = tip ?? V(0, 0.8, 2.6);
  const want = away ? crewPose(h, x, z, hp?.lean ?? 0, 'piano', windward, h.speed > 0.18, dir, 9)
    : (h.going = travelling(h, hp, x)) ? helmCrossing(h, x, z, dir, t) : helmPose(h, x, z, hp?.lean ?? 0, windward, t);
  apply(h, ease(h, want, dt), upright(h, against(hp?.pose ?? 'helm'), dt), dt);
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
