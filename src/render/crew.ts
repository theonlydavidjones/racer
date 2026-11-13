import './three-setup';
import * as THREE from 'three';
import type { CrewState, Person, Pose as Job } from '../boat/crewPhys';
import { DECK_ARM, Z } from '../boat/crewPhys';
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
  hipV?: THREE.Vector3; pitchV?: number; going?: boolean; route?: { side: number; z: number; goal: number; down?: boolean; /** how long they've been sitting down at its end */ sitT?: number; /** which way they face along the deck: −1 forward, +1 aft (fixed for the route) */ face?: number }; walked?: boolean; /** aft of the thwart, the side deck they're sat on (aftSide) */ aftSide?: number; /** two in the middle, this one on the bench's edge: which side */ benchSide?: number; vel?: THREE.Vector3; upr?: number; tack?: boolean; swing?: ({ from: THREE.Vector3; to: THREE.Vector3; t: number; top: number } | null)[];
}
export interface Crew { group: THREE.Group; helm: Figure; crew: Figure[]; helmSide: number; side: number; extension: THREE.Mesh; /** the race's clock at the last frame (CrewState.clock) */ clock?: number }
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
/** Sitting on the side deck (or hiking from it), legs in over the coaming (crewPhys.ts Z: the owner's choice): from the
 * cockpit's forward corner aft beside the benches, and on past the thwart beside the footwell and the after shelf to
 * about 2.5, short of the helm; the shins clear of the thwart either side of it. */
// (out on the side deck, no further forward than just aft of the jib winch on its pedestal there: winchAt, at 1.4, its
// pedestal's radius and half a hip's width clear; crewPhys.ts Z.deckFwd)
const DECK_FWD = Z.deckFwd, DECK_AFT = 2.5, THW_A = THWART.z - THWART.half - 0.13, THW_B = THWART.z + THWART.half + 0.13;
const deckZ = (z: number) => { const q = Math.min(DECK_AFT, Math.max(DECK_FWD, z)); return q > THW_A && q < THW_B ? (q - THW_A < THW_B - q ? THW_A : THW_B) : q; };
const benchZ = (z: number) => Math.min(ZC_AFT, Math.max(ZC_FWD, z));
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
interface PoseT { /** walking along the side deck (deckWalk): both feet up out of the cockpit at once */ deck?: boolean; /** which way the knees point (boat frame), if not forward */ knee?: THREE.Vector3; /** how far that's taken over from forward, 0 to 1 (eased: a knee doesn't flip in a frame) */ kneeW?: number; /** the knees come round slowly (sitting down on the side deck, the hips held up clear) */ kneeSlow?: boolean; hip: THREE.Vector3; yaw: number; pitch: number; roll: number; feet: [THREE.Vector3, THREE.Vector3]; hands: [THREE.Vector3, THREE.Vector3]; look: THREE.Vector3; /** walking or crawling: the feet step (planted, then swung) */ step?: boolean }
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
/** The jib winch on side `ws` (boatMesh.ts buildLines, Boat Detail's, from Josephine's photos: on a moulded pedestal on
 * the side deck against the coaming's outer face, 1.4 m aft of amidships; the sheet leading to it 0.07 above its base);
 * `up` higher, as for the handle on top. */
const winchAt = (ws: number, up = 0) => { const wz = 1.4, u = uAtZ(wz), xo = chz(wz) + COAMING_T; return V(ws * (xo + 0.075), deckY(u, xo) + coamH(wz) + 0.03 + 0.07 + up, wz); };
/** What the crew watch: the jib's luff (its telltales). */
const JIB_LUFF = V(0, 1.5, -1.6);

/** Sitting on the side deck at its edge, the backs of the knees over the coaming and the feet on the seat below it,
 * leaning back out (`lean` 0 sitting … 1 hiking flat out: about 70°, crewPhys.ts hikeArm). `s` the side (+1 starboard). */
function onDeck(s: number, z: number, lean: number, k: number): PoseT {
  const u = uAtZ(z), c = chz(z), e = halfBeam(u);
  const knee = V(s * (c - 0.1), deckY(u, c) + coamH(z) + 0.1, z - 0.04);
  const hipY = deckY(u, e - 0.1) + 0.09 * k, dy = hipY - knee.y, l1 = BONE.thigh * k;
  const hipX = Math.min(e + 0.06 * lean, Math.abs(knee.x) + Math.sqrt(Math.max(0.01, l1 * l1 - dy * dy)));
  // (at the cockpit's forward corner they face straight across, legs down beside them, clear of the bulkhead ahead)
  const corner = 1 - smooth01((z - COCK0 - 0.14) / 0.3), yaw = s * (Math.PI / 2 - 0.2 * (1 - corner) + 0.15 * lean), r = right(yaw);
  // (the backs of the knees over the coaming and the shins hanging down inside it: in the cockpit to the plan the bench is
  // some 0.55 m under the coaming's top, about a shin and a foot, so the feet rest on it or just off it, not pulled in
  // under the knees, which would drag the thighs down through the coaming)
  const footY = (q: THREE.Vector3) => Math.max(ground(q.x, q.z) + 0.06, knee.y - 0.03 - BONE.shin * k);
  const foot = (j: number) => { const q = V(s * (c - 0.13), 0, z - 0.06 * (1 - corner) + 0.04 * corner).addScaledVector(r, (j ? 1 : -1) * 0.09 * k); return q.setY(footY(q)); };
  const hip = V(s * hipX, hipY, z), f = fwd(yaw);
  // hands: sitting, on the knees; hiking, one on the coaming beside them and one across the chest (on the sheet)
  const hands: [THREE.Vector3, THREE.Vector3] = lean > 0.15
    ? [hip.clone().addScaledVector(f, 0.12 * k).add(V(0, 0.38 * k, 0)).addScaledVector(r, 0.08), V(s * (c + 0.02), knee.y + 0.02, z - 0.12)]
    : [knee.clone().addScaledVector(r, -0.1 * k).add(V(0, 0.08, 0)), knee.clone().addScaledVector(r, 0.1 * k).add(V(0, 0.08, 0))];
  return { hip, yaw, pitch: -0.15 + 1.35 * lean, roll: 0, feet: [foot(0), foot(1)], hands, look: JIB_LUFF.clone() };
}
/**
 * Moving fore and aft along the side deck (`dir` −1 forward, +1 aft), past the thwart, as crew do: crouched low on the
 * deck, weight down, facing the way they go, stepping along it; the inboard hand on the coaming's top ahead of them, the
 * outboard one low on the deck by the toe rail.
 */
function deckWalk(s: number, z: number, dir: number, k: number): PoseT {
  const u = uAtZ(z), c = chz(z), xo = c + COAMING_T, e = halfBeam(u), dx = s * Math.min(e - 0.13, xo + 0.15);
  const g = deckY(u, Math.abs(dx)), yaw = dir < 0 ? -s * 0.12 : Math.PI + s * 0.12, f = fwd(yaw), r = right(yaw); // (angled a touch outboard: the knees clear of the coaming)
  const hip = V(dx, g + 0.36 * k, z);
  // (the side deck's about 0.3 m wide: feet close under them and in its outboard part, so the knees stay over the deck)
  // (outside onGround's band by the coaming, which would put a foot back inside it)
  const onDeckAt = (q: THREE.Vector3) => { const uq = uAtZ(q.z), lo = chz(q.z) + 0.15, hi = halfBeam(uq) - 0.03; q.x = Math.sign(q.x || s) * Math.min(hi, Math.max(lo, Math.abs(q.x))); return q.setY(deckY(uq, Math.abs(q.x)) + 0.06); };
  const feet = [0, 1].map(j => onDeckAt(hip.clone().addScaledVector(f, (j ? 0.12 : -0.08) * k).addScaledVector(r, (j ? 1 : -1) * 0.05 * k))) as [THREE.Vector3, THREE.Vector3];
  const zc = z + dir * 0.3 * k, inboard = V(s * (chz(zc) + COAMING_T / 2), deckY(uAtZ(zc), chz(zc)) + coamH(zc) + 0.03, zc);
  const zo = z + dir * 0.36 * k, outboard = onDeckAt(V(s * (halfBeam(uAtZ(zo)) - 0.06), 0, zo)).add(V(0, -0.01, 0));
  // (which hand is inboard: the one on the cockpit's side of them as they face along the deck)
  const rightIsOut = Math.sign(r.x) === s;
  return { hip, yaw, pitch: -0.75, roll: 0, feet, hands: rightIsOut ? [inboard, outboard] : [outboard, inboard], look: hip.clone().addScaledVector(f, 2).setY(hip.y + 0.5), step: true, deck: true, knee: f.clone().add(V(s * 0.35, 0.6, 0)) };
}
/**
 * Sitting down on the side deck from the crouch along it: the hips kept up in the crouch (no higher) and the weight
 * forward until the feet are in over the coaming, the knees coming round slowly; let down first, the thighs would be
 * level with the coaming's top and the knees swept through it. Not stood up straight with the legs hanging.
 */
function sitDown(s: number, z: number, hip: THREE.Vector3, k: number): PoseT {
  const d = onDeck(s, z, 0, k), crouch = deckWalk(s, z, -1, k).hip.y;
  d.hip.y = Math.max(d.hip.y, Math.min(hip.y, crouch)); d.pitch = Math.min(d.pitch, -0.5); d.kneeSlow = true;
  return d;
}
/**
 * The way from where someone is to where they're going, when it passes the thwart: not through the cockpit over it,
 * but along the side deck (deckWalk), on the side of the seat aft of it, up onto the deck forward of the thwart (or down
 * off it there). Null when the way's clear and the pose they're going to does it all. A move once begun goes on to its
 * end, at a walking pace (about 0.9 m/s), so it isn't undone half way.
 */
function route(f: Figure, want: PoseT, dt: number, k: number): PoseT | null {
  const c = f.cur?.hip; if (!c) return null;
  if (dt <= 0) return f.route ? deckWalk(f.route.side, f.route.z, f.route.face ?? (f.route.goal < c.z ? -1 : 1), k) : null; // (no time passed: as it was)
  if (dt > 0.5) { f.route = undefined; return null; } // (a jump, as on a new start: everyone's straight where they're going)
  const inLen = (z: number) => z > COCK0 && z < COCK1 + 0.2;
  const tAft = inLen(want.hip.z) && want.hip.z > THWART.z + 0.05, cAft = inLen(c.z) && c.z > THWART.z + 0.05; // (aft of the thwart's line)
  const r = f.route;
  if (!r) {
    // (a move past the thwart, or from one side's seat aft of it to the other's)
    const across = tAft && cAft && Math.sign(c.x) !== Math.sign(want.hip.x);
    if (tAft === cAft && !across) return null;
    const side = cAft ? Math.sign(c.x) || 1 : Math.sign(want.hip.x) || 1;
    const z0 = Math.min(c.z, cAft ? c.z : THW_A - 0.05), goal = tAft && !across ? want.hip.z : THW_A - 0.05;
    // (facing forward for a short shuffle aft when they're facing forward already, kneeling at the cabin top's lines or
    // crouched after a tack, as anyone backs a step or two along a side deck: not turning right round to go half a
    // metre and round again for the next job forward, the owner's "spinning around in 360s". A longer way aft, or from a
    // seat facing inboard, they turn and walk)
    f.route = { side, z: z0, goal, face: goal < z0 || (goal - z0 < 1 && Math.cos(f.cur!.yaw) > 0.5) ? -1 : 1 };
  }
  const q = f.route!;
  if (q.down && f.cur) {
    // (across to the other side's seat aft of the thwart: sat on this side's deck, the legs swung in; down into the
    // cockpit forward of the thwart and across it low, under the boom; then up on to the other side's deck and aft along
    // it. Not slid through the air from one side deck to the other)
    if (f.cur.feet.some(p => Math.abs(p.x) > chz(p.z)) && (q.sitT = (q.sitT ?? 0) + dt) < 1.5) return sitDown(q.side, q.goal, c, k); // (as below: not for good)
    if (Math.sign(c.x) === q.side && Math.abs(c.x) > 0.15) return moving(f, 0, q.goal, q.side * Math.PI / 2, k);
    { const goal = tAft ? want.hip.z : THW_A - 0.05; f.route = { side: -q.side, z: c.z, goal, face: goal < c.z || (goal - c.z < 1 && Math.cos(f.cur.yaw) > 0.5) ? -1 : 1 }; }
    return route(f, want, dt, k);
  }
  if (tAft && Math.sign(want.hip.x) === q.side) q.goal = want.hip.z; // (going to a seat aft of it: wherever that is now)
  // (up onto the side deck first, where they are, if they're down in the cockpit)
  if (Math.abs(c.x) < chz(c.z) && Math.abs(q.z - c.z) < 0.3) {
    // (the knees out toward that side as they step up, not fore or aft into the thwart or the bulkhead)
    const w = deckWalk(q.side, q.z, q.face ?? (q.goal < q.z ? -1 : 1), k); w.knee = V(q.side * 0.15, 1, 0); return w;
  }
  // (up into the crouch first, weight forward, facing as they were and feet where they are, so the thighs rise off the
  // coaming rather than sweep along it; then they turn and step along the deck: not slid along it still sitting up)
  const w0 = deckWalk(q.side, q.z, q.face ?? (q.goal < q.z ? -1 : 1), k), ready = c.y > w0.hip.y - 0.12 && (f.cur?.pitch ?? 0) < -0.35;
  if (!ready && f.cur) {
    w0.yaw = f.cur.yaw; w0.feet = [f.cur.feet[0].clone(), f.cur.feet[1].clone()]; w0.step = false; w0.deck = false;
    // (well inboard, the knees toward the side they're getting out on, not folded fore or aft under the thwart; by the
    // coaming, left to the legs)
    w0.knee = Math.abs(c.x) < chz(c.z) - 0.25 ? V(q.side, 0.6, 0) : undefined;
    return w0;
  }
  // (and no foot still down in the cockpit before they set off along it: a trailing leg would drag along the coaming.
  // By the coaming's own width, so a foot resting at its edge, a step from where it's going, doesn't hold them for good)
  if (f.cur && f.cur.feet.some(p => Math.abs(p.x) < chz(p.z) - 0.06)) { w0.knee = undefined; return w0; }
  // (about 0.9 m/s along the deck; backing a step or two, facing the other way, slower: a shuffle, about 0.55 m/s)
  const step = (q.face != null && q.face !== Math.sign(q.goal - q.z) ? 0.55 : 0.9) * dt;
  q.z += Math.max(-step, Math.min(step, q.goal - q.z));
  // (no further ahead of where they are than a step: the body leads, the feet don't reach out ahead of it)
  if (Math.abs(q.z - c.z) > 0.15) q.z = c.z + Math.sign(q.z - c.z) * 0.15;
  if (Math.abs(q.goal - q.z) < 0.01 && Math.abs(c.z - q.goal) < 0.06) {
    // (there, at the seat aft of the thwart they were going back to, but where they're going now is forward of it, a job
    // there come up on the way: on forward along the deck, not sat down here for good with the feet never in)
    if (!tAft && q.goal > THWART.z + 0.05) { q.goal = THW_A - 0.05; q.face = -1; return deckWalk(q.side, q.z, -1, k); }
    // (there. Going on down into the cockpit: first sat on the side deck, the legs swung in over the coaming, as anyone
    // sits there; then down)
    // (by where their feet are going, not their hips: kneeling up at the cabin top's lines the hips are over the coaming)
    // (never for good, though: by a second and a half the legs are in, or this seat won't take them (at the thwart's end,
    // say), and the pose they're going to does the rest; it waited for ever once, the figure stepping on the spot)
    if ((!tAft || Math.sign(want.hip.x) === q.side) && want.feet.some(p => Math.abs(p.x) < chz(p.z)) && f.cur && f.cur.feet.some(p => Math.abs(p.x) > chz(p.z)) && (q.sitT = (q.sitT ?? 0) + dt) < 1.5) return sitDown(q.side, q.goal, c, k);
    if (tAft && Math.sign(want.hip.x) !== q.side) { q.down = true; return route(f, want, dt, k); }
    f.route = undefined; return null;
  }
  const w = deckWalk(q.side, q.z, q.face ?? (q.goal < c.z ? -1 : 1), k);
  // (the knees out over the deck once both feet are on it; stepping out of the cockpit, up over the coaming as usual)
  if (f.cur?.feet.some(p => Math.abs(p.x) < chz(p.z) + 0.03)) w.knee = undefined;
  return w;
}
/** On the cockpit seat, back to the coaming, feet on the sole. */
function onSeat(s: number, x: number, z: number, k: number): PoseT {
  const c = chz(z), hx = Math.min(c - 0.1, Math.max(benchEdge(z) + 0.12, Math.abs(x) + 0.08));
  // (facing inboard and a little forward; at the bench's forward end, inboard and a little aft, the knees clear of the
  // bulkhead, and kept clear as they turn to go forward)
  const yaw = s * (Math.PI / 2 - 0.45 + 0.65 * (1 - smooth01((z - COCK0 - 0.3) / 0.35))), r = right(yaw), f = fwd(yaw);
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
/** On a locker lid: inside the coaming (the shin lying on the lid, not out through the coaming onto the deck). */
const inLid = (q: THREE.Vector3) => { const m = chz(q.z) - 0.08; if (Math.abs(q.x) > m) q.x = Math.sign(q.x) * m; return q; };
function kneelOne(x: number, z: number, yaw: number, front: number, hands: [THREE.Vector3, THREE.Vector3], k: number, lookAt = JIB_LUFF): PoseT {
  const g = ground(x, z), f = fwd(yaw), r = right(yaw);
  // (the kneeling thigh near upright, its knee on the sole under the hips and the shin flat behind; the front foot
  // a stride ahead, its thigh about level)
  const hip = V(x, g + 0.47 * k, z);
  const feet = [0, 1].map(j => j === front
    ? onGround((g < SEAT_Y - 0.05 ? (q: THREE.Vector3) => q : inLid)(hip.clone().addScaledVector(f, 0.36 * k).addScaledVector(r, (j ? 1 : -1) * 0.13 * k)))
    : (g < SEAT_Y - 0.05 ? keepOnSole : inLid)(hip.clone().addScaledVector(f, -0.4 * k).addScaledVector(r, (j ? 1 : -1) * 0.1 * k)).setY(g + 0.07)) as [THREE.Vector3, THREE.Vector3]; // (kneeling on the sole, the knee stays on it; on a lid, on the lid)
  return { hip, yaw, pitch: -0.2, roll: 0, feet, hands, look: lookAt.clone() };
}
/** Up in a crouch, a slight bend at the waist and the knees, under the boom (the middle crew tacking the main). */
function crouch(x: number, z: number, yaw: number, hands: [THREE.Vector3, THREE.Vector3], k: number, lookAt = JIB_LUFF): PoseT {
  // (the head well under the boom, about 1.66 m above the waterline over the cockpit)
  const g = ground(x, z), f = fwd(yaw), r = right(yaw), hip = V(x, g + 0.55 * k, z); // (from the sole under them, not the thwart beside them)
  const feet = [0, 1].map(j => onGround(keepOnSole(hip.clone().addScaledVector(f, (j ? 0.08 : -0.05) * k).addScaledVector(r, (j ? 1 : -1) * 0.15 * k)))) as [THREE.Vector3, THREE.Vector3];
  return { hip, yaw, pitch: -0.6, roll: 0, feet, hands, look: lookAt.clone() };
}
/** In the middle, low: on one knee on the sole, facing forward, a hand on the forward knee and one on the seat's edge. */
function onSole(x0: number, z0: number, k: number): PoseT {
  // (between the benches: the sole's only 0.7 m wide, so the kneeling knee and the shin behind it stay on it)
  const lim = Math.max(0, benchEdge(Math.min(z0, BENCH_AFT - 0.1)) - 0.12), x = Math.max(-lim, Math.min(lim, x0));
  const z = Math.min(THWART.z - THWART.half - 0.45, Math.max(z0, COCK0 + 0.55)), s = x >= 0 ? 1 : -1, front = s > 0 ? 1 : 0; // (the outer foot forward, the inner knee down: two abreast keep their legs to themselves)
  const p = kneelOne(x, z, 0, front, [V(0, 0, 0), V(0, 0, 0)], k);
  const knee = p.feet[front].clone().add(V(0, 0.4 * k, 0.05));
  // (hands resting on their thighs: kept to themselves beside a crewmate, and nothing to swap over as they move across)
  void knee; const thigh = (j: number) => V(p.hip.x + (j ? 1 : -1) * 0.11 * k, p.hip.y + 0.04, z - 0.2 * k);
  p.hands = [thigh(0), thigh(1)];
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
  const hand = (j: number) => { const h = hip.clone().addScaledVector(f, 0.42 * k).addScaledVector(r, (j ? 1 : -1) * 0.25 * k); // (well ahead, at arm's length: not folded under the shoulder)
    if (inCockpit(Math.abs(hip.x), hip.z)) { const lim = chz(h.z) - 0.08; if (Math.abs(h.x) > lim) h.x = Math.sign(h.x) * lim; } // (inside the coaming, on the lid or the sole)
    return h.setY(Math.max(ground(h.x, h.z), hip.y - 0.3) + 0.05); };
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
      // (on one knee on the leeward locker lid beside the winch, which stands out on its pedestal past the coaming:
      // within arm's reach of it, the sheet in the inboard hand)
      const ws = -windward, w = winchAt(ws), wz = w.z + 0.2, bx = ws * (chz(wz) - 0.22); // (the forward knee clear of the bulkhead)
      const yaw = -ws * 0.15, hold = V(bx - ws * 0.12, SEAT_Y + 0.6 * k, wz - 0.25);
      // (the inboard knee up and the outboard one down on the lid by the coaming: the other way round, the forward thigh
      // would lie along the coaming and through it)
      return kneelOne(bx, wz, yaw, ws > 0 ? 0 : 1, ws > 0 ? [hold, w] : [w, hold], k, w);
    }
    const sheet = V(px * 0.4, 0.9, THWART.z - 0.08);
    return crouch(px, zz, 0, [sheet.clone().add(V(-0.07, 0.05, 0)), sheet.clone().add(V(0.07, -0.05, 0))], k, sheet.clone().add(V(0, 1.2, -1)));
  }
  // (moving: crouched in the cockpit, on hands and knees on deck; arriving at the side deck they step up onto it)
  // (somewhere forward of the cockpit with no job there, as after setting the pole, waiting to see where they go next:
  // on deck on hands and knees where they are, not drawn back in the cockpit)
  // (a place up forward, not yet reached: still on the way there, along the side deck)
  if ((job === 'fore' || job === 'bow') && z > CAB0) { isMoving = true; dest = Math.min(dest, CAB0 - 0.5); }
  // (and crawling on until they're there, not sat down while still on the way)
  else if ((job === 'fore' || job === 'bow') && fig.cur && Math.abs(fig.cur.hip.z - z) > 0.15) { isMoving = true; dest = z; }
  if (z < COCK0 - 0.3 && (job === 'sit' || job === 'lee' || job === 'hike' || job === 'cross')) isMoving = true;
  // (seated along the cockpit, they're on its benches or the side deck beside them: the weight's place from the physics,
  // drawn within the benches' length)
  else if (z < COCK1 && (job === 'sit' || job === 'lee' || job === 'hike' || job === 'cross')) {
    // (on the side deck, or aft of the benches, which is the side deck: there; on a bench, within its length)
    const deck = job === 'hike' || z > ZC_AFT + 0.05 || ax >= chz(benchZ(z)) - 0.06, at = deck ? deckZ : benchZ;
    z = at(z); if (dest >= COCK0 - 0.3) dest = at(dest);
  }
  const sideways = Math.abs(motion) > 0.6 && Math.abs(motion) < 2.5, alongside = z > COCK0 && z < COCK1 && ax > chz(z) - 0.2;
  // (moving fore and aft along the side deck within the cockpit's length: they slide along it sitting, not walk the coaming)
  if (isMoving && !sideways && alongside && z >= ZC_FWD - 0.01 && job !== 'car' && job !== 'mast') return onDeck(s, deckZ(z), 0, k);
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
    // (in the cockpit, facing forward: except someone coming aft into it already facing aft, back from the mast along
    // the side deck, who walks on aft as they are. Turned round to face forward at the cockpit's end, then round again
    // to sit, they spun most of a circle in four seconds)
    const inC = inCockpit(Math.abs(px), zz), aftNow = !!fig.cur && Math.cos(fig.cur.yaw) < 0 && Math.cos(motion) < 0;
    return moving(fig, px, zz, inC ? (aftNow ? Math.PI : 0) : along, k);
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
  const onDeckHere = job === 'hike' || z > ZC_AFT + 0.05 || ax >= chz(benchZ(z)) - 0.06, zc = onDeckHere ? deckZ(z) : benchZ(z);
  if (job === 'piano' && ax > 0.55) {
    // the dual-ended lines worked from the side deck (crewWork.ts BOTH_SIDES): sitting at its forward end, leaning
    // forward to them on the cabin top beside the companionway
    const p = onDeck(s, DECK_FWD, 0, k), zl = COCK0 - 0.08, cl = V(s * 0.47, cabinTopAt(uAtZ(zl), 0.47) + 0.05, zl);
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
  if (onDeckHere) p = onDeck(s, zc, lean, k);
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
  // (sat out on the side deck, the knees up over the coaming's top as the legs come in over it, not let down level with
  // it: a helm sat out in a breeze had the top of the shin through it)
  const kneeUp = hx > chz(fz) - 0.05 ? V(-s * 0.5, 1, -0.2) : undefined;
  return { hip, yaw, pitch: 0.05 + 1.1 * lean, roll: 0, feet: [foot(0), foot(1)], hands, look: JIB_LUFF.clone(), knee: kneeUp };
}

/** The helm crossing in a tack or gybe: crouched across the after deck under the boom, the extension kept in hand
 * (swapped across behind them as they go). */
function helmCrossing(h: Figure, x: number, z: number, dir: number, tip: THREE.Vector3): PoseT {
  // (facing forward as they shuffle across behind the tiller, so the knees stay over the cockpit's after end)
  void dir; const p = moving(h, x, z, 0, h.scale);
  // (low across the after deck, ducking the boom: barely up off the deck, not stood up into a crouch)
  p.hip.y = Math.min(p.hip.y, ground(p.hip.x, p.hip.z) + 0.3 * h.scale);
  const chest = p.hip.clone().add(V(0, 0.35 * h.scale, 0));
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

const _kn = V(0, 0, 0), _p2 = V(0, 0, 0), _p = V(0, 0, 0), _h = V(0, 0, 0), _inv = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _e = new THREE.Euler();
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
  const kneeHint = (q: PoseT, i: number) => { _kn.set((i ? 1 : -1) * 0.05, 0.3, -1); return q.knee ? _kn.lerp(_p2.copy(q.knee).applyQuaternion(_inv), q.kneeW ?? 1) : _kn; };
  // (the knees forward and a little up; or where the pose says, in the boat's frame: walking the side deck, out over it)
  f.leg.forEach((l, i) => ik(l, l.root.position, local(p.feet[i], _p), BONE.thigh, BONE.shin, kneeHint(p, i), 1));
  _tq.copy(f.torso.quaternion).invert();
  // (the elbows down and back; but sat just by the thwart, down and away from it, whichever way they face: back, reaching
  // up for the mainsheet, they went into the thwart behind)
  const byThwart = inCockpit(Math.abs(p.hip.x), p.hip.z) && Math.abs(p.hip.z - THWART.z) < 0.5;
  const away = byThwart ? _p2.set(0, -0.6, Math.sign(p.hip.z - THWART.z) || -1).applyQuaternion(_inv).applyQuaternion(_tq) : null;
  f.arm.forEach((a, i) => ik(a, a.root.position, local(p.hands[i], _p).applyQuaternion(_tq), BONE.upper, BONE.fore, away ? V((i ? 1 : -1) * 0.4, 0, 0).add(away) : V((i ? 1 : -1) * 0.5, -0.3, 1), -1));
  // the head turns to what they're watching (within a neck's reach)
  local(p.look, _h).applyQuaternion(_tq).sub(f.head.position);
  f.head.rotation.set(Math.max(-0.6, Math.min(0.5, Math.atan2(_h.y - 0.1, Math.hypot(_h.x, _h.z)))), Math.max(-1.3, Math.min(1.3, Math.atan2(-_h.x, -_h.z))), 0);
}
/** Ease the pose shown toward the pose wanted (a quarter of a second or so). */
function ease(f: Figure, want: PoseT, dt: number): PoseT {
  // (no time passed, a frame drawn twice: nothing moves; a jump, a new start: straight there)
  if (f.cur && dt <= 0) return f.cur;
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
    // (or up onto something higher than where they are, from the sole onto a locker lid: up first, then across onto it)
    const gw = ground(want.hip.x, want.hip.z), gc = ground(c.hip.x, c.hip.z);
    if ((top > gw + 0.04 && top > gc - 0.3) || gw > gc + 0.15) {
      const up = gw > gc + 0.15 ? 0.45 : 0.3; // (stepping up onto it: up as high as a shin over it first, the knees with them)
      aim.y = Math.max(aim.y, top + up * f.scale * Math.max(0.6, Math.min(1, jump / 0.25)));
      rising = c.hip.y < top + (up - 0.1) * f.scale; // (the feet wait while they rise over it, and they go over it slowly)
      if (rising) { aim.x = c.hip.x + (want.hip.x - c.hip.x) * 0.3; aim.z = c.hip.z + (want.hip.z - c.hip.z) * 0.3; }
    }
  }
  const y0 = c.hip.y;
  v.addScaledVector(_s.copy(aim).sub(c.hip), W * W * dt).multiplyScalar(Math.max(0, 1 - 2 * W * dt)); c.hip.addScaledVector(v, dt);
  // (getting up, off the rail or a seat, takes a moment: the hips rise no faster than about 1.2 m/s)
  if (c.hip.y > y0 + 1.2 * dt) { c.hip.y = y0 + 1.2 * dt; if (v.y > 1.2) v.y = 1.2; }
  if (rising) c.hip.y = Math.min(aim.y, Math.max(c.hip.y, c.hip.y + 1.0 * dt)); // (pushing up off the seat: briskly)
  // (turning: eased, and no quicker than a person turns their body, about 3 rad/s)
  // (and not while rising over the coaming out of a seat on the side deck: up first, knees still over it, then round)
  if (!rising) {
    let d = Math.atan2(Math.sin(want.yaw - c.yaw), Math.cos(want.yaw - c.yaw));
    // (turning round on a side deck, about half a turn: through facing inboard, toward the cockpit, as anyone turns there,
    // not out over the water; then the turn to sit facing in is back the other way, not on round a whole circle)
    const sx = Math.sign(c.hip.x);
    if (Math.abs(d) > 2.6 && Math.abs(c.hip.x) > 0.3 && Math.sin(c.yaw + d / 2) * sx < 0) d -= Math.sign(d) * 2 * Math.PI;
    const dy = d * a; c.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy));
  }
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
      const passes = seg.lengthSq() > 0.0025 && Math.min(Math.abs(hd.y - sh.y), Math.abs(want.hands[i].y - sh.y)) > 0.05 && (hd.y - sh.y) * (want.hands[i].y - sh.y) < 0 && _w.copy(hd).addScaledVector(seg, tq).distanceTo(sh) < 0.2; // (only crossing the shoulder's height, from well above it to well below or back: one at it goes straight)
      if (passes) { _w.copy(sh).addScaledVector(out, 0.28).setY(Math.min(sh.y, Math.max(hd.y, want.hands[i].y)));
        // (and round it inside the cockpit, not out through the coaming)
        if (inCockpit(Math.abs(c.hip.x), c.hip.z)) { const lim = chz(_w.z) - 0.1; if (Math.abs(_w.x) > lim) _w.x = Math.sign(_w.x) * lim; } }
      toward(hd, passes ? _w : want.hands[i], a, LIMB_SPEED * dt);
      // (coming to a step up, the bench's edge or the coaming, it stops and rises to it at a hand's pace: never snapped up onto it)
      if (ground(hd.x, hd.z) + 0.02 > hy + LIMB_SPEED * dt) { hd.x = hx; hd.z = hz; hd.y = Math.max(hy, ground(hx, hz) + 0.02) + LIMB_SPEED * dt; }
      // (rising early to clear an edge it's coming to, at a hand's pace; never inside what's under it)
      // (only over something on its way that's higher than both ends, the coaming between the deck and the cockpit: not
      // whatever's merely near it, which held a hand up beside the coaming on its way down to a locker lid)
      let clear = 0;
      if (far) { let top = 0; for (let q = 1; q < 5; q++) { _u.copy(hd).lerp(want.hands[i], q / 5); top = Math.max(top, ground(_u.x, _u.z)); }
        if (top > Math.max(ground(hd.x, hd.z), ground(want.hands[i].x, want.hands[i].z)) + 0.03) clear = top + 0.04; }
      hd.y = Math.max(hd.y, Math.min(clear, hd.y + LIMB_SPEED * dt), ground(hd.x, hd.z) + 0.02); }
    const foot = c.feet[i], sw = f.swing![i];
    if (want.step || sw) {
      // walking or crawling (and a step under way is finished, whatever comes next): each foot stays planted until it's left behind, then swings (lifted) to a new place
      // ahead, one foot at a time, about a quarter of a second a step: no foot slides on the deck
      if (sw) {
        // (a step over something high takes longer: the foot goes up and over it, not just along)
        sw.t = Math.min(1, sw.t + dt / Math.max(0.22, (sw.from.distanceTo(sw.to) + 0.6 * Math.max(0, sw.top - Math.min(sw.from.y, sw.to.y))) / 1.4));
        const e = sw.t * sw.t * (3 - 2 * sw.t), wasY = foot.y;
        foot.copy(sw.from).lerp(sw.to, e);
        // (lifted clear of whatever it passes over, highest mid-step)
        const peak = Math.max(sw.top, sw.from.y, sw.to.y) + 0.07 - (sw.from.y + sw.to.y) / 2;
        // (lifted a little early, so what it steps over near either end, the thwart, a seat's edge, is cleared on the way)
        foot.y += Math.max(0, peak) * Math.sin(Math.PI * sw.t) ** 0.6; foot.y = Math.max(foot.y, ground(foot.x, foot.z) + 0.06);
        // (coming down off something it stepped over: at a foot's pace, not dropped in a frame; the step's done when it's down)
        foot.y = Math.max(foot.y, wasY - 2 * LIMB_SPEED * dt);
        if (sw.t >= 1 && foot.y <= sw.to.y + 0.01) f.swing![i] = null;
      } else if (want.step && foot.distanceTo(want.feet[i]) > 0.16 * f.scale && (!f.swing![1 - i] || (want.deck && inCockpit(Math.abs(foot.x), foot.z)))) {
        // (one at a time; but setting off along the side deck, a foot still down in the cockpit comes up out of it at once)
        const ahead = want.feet[i].clone().addScaledVector(_s.copy(want.feet[i]).sub(foot).setY(0).normalize(), 0.08 * f.scale);
        const to = want.deck ? ahead.setX(want.feet[i].x).setY(ground(want.feet[i].x, ahead.z) + 0.06) : onGround(ahead); let top = Math.max(foot.y, to.y); // (on the side deck, as far out as it's meant to be)
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
  // (walking along the side deck, from where the feet are on average, so a foot lifted mid-step doesn't hoist the hips:
  // the weight stays low)
  const lowest = want.deck ? (c.feet[0].y + c.feet[1].y) / 2 + 0.26 * f.scale : Math.max(c.feet[0].y, c.feet[1].y) + 0.32 * f.scale;
  if (want.step && c.hip.y < lowest) { c.hip.y = Math.min(lowest, c.hip.y + 1.5 * dt); if (v.y < 0) v.y = 0; } // (rising with the step, at a person's pace)
  c.look.lerp(want.look, a);
  // (the knees turn to where the pose points them over a tenth of a second, and back to forward the same way; but at
  // once as a foot steps down inside the coaming, so that knee drops in with it rather than dragging across the top;
  // and slowly, a third of a second, sitting down on the side deck with the hips held up clear of the coaming; and
  // turning to the new way over a fifth when both feet are out on the deck already, as she sets off along it turning to
  // face along it (the knee swung out at more than 5 m/s); stepping up out of the cockpit, over the coaming, as before)
  const kw = c.kneeW ?? (c.knee ? 1 : 0), tk = want.kneeSlow ? 0.3 : !want.knee && c.feet.some(p => Math.abs(p.x) < chz(p.z) + 0.03) ? 1e-3 : want.knee && c.feet.every(p => Math.abs(p.x) > chz(p.z)) ? 0.2 : 0.1;
  c.kneeW = kw + Math.max(-dt / tk, Math.min(dt / tk, (want.knee ? 1 : 0) - kw));
  if (want.knee) c.knee = want.knee.clone(); else if (c.kneeW <= 0) c.knee = undefined;
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

/**
 * (Moving, and which way: from where the physics has them now against last frame, over the time the race moved
 * between them, `dt` here: the sim clock's change, not the page's frame. A frame gets no steps, one, or two (and three
 * to five at 4×), and the race in its worker answers a frame late or two at once; by the page's frame time the speed went
 * from nothing to double and back, the feet stepping and stopping. A frame the race didn't move in, they go on as they
 * were.)
 */
function track(f: Figure, x: number, z: number, dt: number): number {
  const vel = f.vel ??= V(0, 0, 0);
  if (dt <= 0 && f.last) return Math.atan2(-vel.x, -vel.z);
  const was = f.last ?? V(x, 0, z), dx = x - was.x, dz = z - was.z, dist = Math.hypot(dx, dz);
  f.last = V(x, 0, z);
  const v = dt > 0 && dt < 0.5 ? dist / dt : 0;
  f.speed += (v - f.speed) * Math.min(1, dt * 6);
  f.gait += dist / 0.32 * Math.PI; // (a step about every 0.3 m)
  // which way they're going: their velocity, smoothed over a few tenths of a second (so the body doesn't swing about
  // as they slow and stop)
  if (dt > 0 && dt < 0.5) vel.lerp(_s.set(dx / dt, 0, dz / dt), Math.min(1, dt * 5));
  return Math.atan2(-vel.x, -vel.z);
}

/** (how upright they hold themselves against the heel, eased as they change what they're doing) */
function upright(f: Figure, want: number, dt: number): number { f.upr = f.upr == null || dt > 0.5 ? want : f.upr + (want - f.upr) * Math.min(1, dt * 4); return f.upr; }

/**
 * Aft of the thwart there's no seat in the middle, only the side decks: someone the physics has near the centreline there
 * (on a run, weight about level, a little either side with each puff) sits on the side deck they're on, and goes across
 * only when the physics puts them well over on the other side. Drawn by its sign alone, each small shift of weight across
 * the middle had them get up, along the deck forward past the thwart, across and back aft again: the owner's "crawling
 * along the rail" (v162, cruising downwind).
 */
const AFT_MID = 0.45;
function aftSide(f: Figure, x: number, z: number): number {
  if (!(z > THWART.z + 0.05 && z < COCK1 + 0.2) || f.aftSide == null || Math.abs(x) > AFT_MID) return x;
  return f.aftSide * Math.abs(x);
}

/**
 * On their way somewhere: across the boat to the other side, or fore and aft to a job (where the physics is taking
 * them: crewPhys.ts goal), until they're nearly there. Moving out to hike, or in from it, on the same side is the body
 * leaning out and in, not a walk.
 */
function travelling(f: Figure, a: CrewState['people'][number] | undefined, x: number): boolean {
  const g = a?.goal; if (!a || !g) return false;
  const gx = aftSide(f, g.x, g.z);
  const across = Math.sign(gx) !== Math.sign(x) && Math.abs(gx - x) > 0.25, along = Math.abs(g.z - a.z) > 0.4;
  if (f.going) return Math.abs(gx - x) > 0.08 || Math.abs(g.z - a.z) > 0.08;
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
  // (the time the race moved since the last frame, for their walking: track)
  const clk = c?.clock, sdt = clk == null || cr.clock == null || clk < cr.clock ? dt : clk - cr.clock; cr.clock = clk;
  // (two of them on the same side don't sit in each other's laps: at least a shoulder's width apart fore and aft)
  // (out on a side deck, not forward of the winch there; in the middle, on the benches, on forward)
  const ZMAX = DECK_AFT, inC = (z: number) => z > COCK0 - 0.1 && z < COCK1;
  const zs = cr.crew.map((_, i) => { const a = ppl?.[i + 1], z = a?.z ?? 1.3 + 0.6 * i, lo = Math.abs(a?.x ?? 1) > DECK_ARM ? DECK_FWD : ZC_FWD; return inC(z) ? Math.min(ZMAX, Math.max(lo, z)) : z; });
  for (let i = 1; i < zs.length; i++) for (let j = 0; j < i; j++) {
    const a = ppl?.[i + 1], o = ppl?.[j + 1];
    const seated = (q: typeof a) => !!q && (q.pose === 'sit' || q.pose === 'lee' || q.pose === 'hike' || q.pose === 'cross');
    if (seated(a) && seated(o) && (Math.sign(o!.x) === Math.sign(a!.x) || a!.pose === 'cross' || o!.pose === 'cross') && inC(zs[i]) && inC(zs[j]) && Math.abs(zs[i] - zs[j]) < SEP) {
      const fore = Math.min(zs[i], zs[j]), lo = Math.min(fore, ZMAX - SEP);
      // (in their order along the cockpit, front to back, as the physics keeps them (crewPhys.ts stationZ): not by where
      // each is this moment. One still crossing can be a little forward of the other for a second, and the one sat
      // forward was put aft past the thwart, then left there when the other moved on)
      zs[j] = lo; zs[i] = lo + SEP;
    }
  }
  // a tack under way: from the helm putting her about (the roll's lead) through the wind until they're across. The forward
  // crew works the jib on one knee, the others tack the main in a crouch (alone with the helm, the one crew does the jib)
  // (one kneels in the middle of the sole, between the companionway's step and the thwart: there's room there for one,
  // onSole's single spot. Two in the middle at once: the one whose place is nearer it kneels there, the other sits on
  // the bench's edge on their side at their own place. Both drawn kneeling there, they were within a few centimetres of
  // each other, and shuffled past each other each time the light air's puffs took the weight to the middle and back:
  // the owner's "dancing around each other")
  const SOLE_Z = THWART.z - THWART.half - 0.45;
  const inMid = cr.crew.map((_, i) => { const a = ppl?.[i + 1]; return !!a && Math.abs(a.x) < 0.3 && (a.pose === 'sit' || a.pose === 'lee') && a.z > COCK0 && a.z < THWART.z - 0.05; });
  const onBench = cr.crew.map(() => false);
  if (inMid.filter(Boolean).length > 1) {
    const mids = cr.crew.map((_, i) => i).filter(i => inMid[i]).sort((i, j) => Math.abs(ppl![i + 1].z - SOLE_Z) - Math.abs(ppl![j + 1].z - SOLE_Z));
    for (const i of mids.slice(1)) onBench[i] = true;
  }
  const tackOn = !!c && (tacking || !!c.roll);
  const fore = cr.crew.reduce((best, _, i) => (ppl?.[i + 1]?.z ?? 9) < (ppl?.[best + 1]?.z ?? 9) ? i : best, 0);
  cr.crew.forEach((f, i) => {
    const a = ppl?.[i + 1];
    let x = a ? a.x : windward * 0.8;
    // (on the side they're on, kept while they sit there: the weight a few centimetres either side of the middle isn't a crossing)
    if (onBench[i]) x = (f.benchSide ??= Math.sign(f.cur?.hip.x ?? x) || windward) * 0.3; else f.benchSide = undefined;
    const lean = a?.lean ?? 0, pose = a?.pose ?? 'sit';
    // (two in the middle at once too: each where the physics has their weight, at their own place fore and aft, already a
    // shoulder's width apart. Brought together abreast at one place, either side of the centreline by their order aboard,
    // the pair came together, one crossing the other's line, and parted again each time the light air's puffs took the
    // weight to the middle and back: the owner's "dancing around each other", v162)
    const z = zs[i];
    // (aft of the thwart, the side they're sitting on until the physics has them clearly on the other: aftSide)
    if (a && a.z > THWART.z + 0.05 && a.z < COCK1 + 0.2) {
      if (f.aftSide == null || Math.abs(x) > AFT_MID) f.aftSide = Math.sign(x) || windward;
      x = aftSide(f, x, a.z);
    } else f.aftSide = undefined;
    const dir = track(f, x, a?.z ?? z, sdt);
    // (on the move from 0.22 m/s, settled again under 0.1: no flicker between walking and sitting)
    const go = f.going = travelling(f, a, x);
    // (in the tack while it's under way, and until they're across; a job elsewhere, the mast or the car, comes first)
    const busy = pose === 'mast' || pose === 'car' || pose === 'piano' || pose === 'bow' || pose === 'fore';
    f.tack = !busy && (tackOn || (!!f.tack && go));
    const role = f.tack ? (i === fore ? 'jib' : 'main') : null;
    const want = crewPose(f, x, z, lean, pose, windward, go && !role, f.speed > 0.05 ? dir : (pose === 'cross' ? -Math.sign(x) * Math.PI / 2 : 0), i, role, a?.goal?.z ?? z);
    // (on the way along the side deck, and settling into the new place after it)
    const routed = route(f, want, dt, f.scale);
    if (routed) f.walked = true; else if (f.walked && f.cur && f.cur.hip.distanceTo(want.hip) < 0.03) f.walked = false;
    apply(f, ease(f, routed ?? want, dt), upright(f, against(pose), dt), dt);
    f.root.visible = true;
  });
  // the helm
  const hp = ppl?.[0], h = cr.helm, x = hp ? hp.x : windward * 0.55, z = hp?.z ?? 2.95;
  cr.helmSide = Math.abs(x) > 0.05 ? Math.sign(x) : windward;
  const away = hp?.pose === 'piano'; // single-handed, gone forward to the cabin-top lines
  const dir = track(h, x, z, sdt);
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
