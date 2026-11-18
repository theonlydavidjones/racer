import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CrewState, Person, Pose as Job } from '../boat/crewPhys';
import { DECK_ARM, slotOf } from '../boat/crewPhys';
import { BONE, buildBody, type Body } from './crewBody';
import { sheer, CABIN, COAMING_H, COAMING_T, COCKPIT, COCKPIT_FIT, COMPANIONWAY, canoe, FOOTREST, footrestEdge, JIB_WINCH_Z, L, cabinHalf, cabinTopAt, cockpitHalf, deckY, halfBeam, hullInnerHalf, thwartTop, thwartBottom, uAtZ, benchOut, TILLER, tillerRestDir, RUDDER_RAKE } from './hull';

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
  /** the helm's hand on the tiller itself, the extension stowed along it (helmPose); and how far the extension's swung
   * out on its joint (0 stowed … 1 out, in the hand: syncCrew), and for how long it's been wanted stowed (s) */
  onTiller?: boolean; extOut?: number; stowT?: number;
  /** the cabin-top line they're working (crewPhys.ts Job.line), so both hands go to its drawn tail (crewPose 'piano') */
  pianoLine?: string;
  /** frames in the piano pose so far (0 elsewhere): the arms as drawn are only read once they've come to the line */
  pianoN?: number;
  /** the tail they have in hand at the piano (crewPose 'piano'), and which of the two grips (upper, lower) are on it */
  pianoHeld?: { side: number; i: number; holds: [boolean, boolean]; up: 0 | 1 };
  /** the foot hooked under the thwart (or on its way out from under it): ease reads what's under it at its height */
  hookFoot?: number;
  /** walking this frame: the pose's feet step (syncCrew) */
  walking?: boolean;
  /** (the hips' and the lean's velocities, for their springs; on the move or not; a foot's swing under way) */
  hipV?: THREE.Vector3; pitchV?: number; going?: boolean; /** a turn given its way round (+1, −1): back from facing aft after a tack */ turnDir?: number; route?: { side: number; z: number; goal: number; down?: boolean; /** how long they've been sitting down at its end */ sitT?: number; /** which way they face along the deck: −1 forward, +1 aft (fixed for the route) */ face?: number }; walked?: boolean; /** aft of the thwart, the side deck they're sat on (aftSide) */ aftSide?: number; /** two in the middle, this one on the bench's edge: which side */ benchSide?: number; /** the side the physics is sending them to, if well out to one */ goalSide?: number; vel?: THREE.Vector3; upr?: number; tack?: boolean; swing?: ({ from: THREE.Vector3; to: THREE.Vector3; t: number; top: number; /** the share of the step spent lifting before it sets off along (something high right where it starts) */ hold?: number } | null)[];
}
export interface Crew { /** the cabin-top line someone has in hand (crewPose 'piano'): its tail's side and place on the piano, and the two fists on it, upper first (boatMesh.ts draws that tail to them: pianoTailHeld) */ pianoHold?: { side: number; i: number; fists: [THREE.Vector3, THREE.Vector3] }; /** where the helm has the mainsheet's tail (boat frame, the fist), sat steering; none if not */ mainHand?: THREE.Vector3; /** where the hiker holding the traveller's tail has it (boat frame), for boatMesh.ts to lead it there */ travHand?: THREE.Vector3; /** where the hiker holding the lee jib sheet has its tail (boat frame), for boatMesh.ts to lead it to the hand; none if nobody does */ sheetHand?: THREE.Vector3; /** the working sheet's second hand on it, if both are (the fist) */ sheetHand2?: THREE.Vector3; group: THREE.Group; helm: Figure; crew: Figure[]; helmSide: number; side: number; extension: THREE.Mesh; /** its universal joint on the tiller's end */ ujoint: THREE.Mesh; /** the tiller's root on the rudder head, this frame (boatMesh.ts: tillerRootAt), for laying the extension along it */ tillerRoot?: THREE.Vector3; /** the boom crutch, out for paddling (boat/paddle.ts); and the paddling as drawn: since when (the race's clock), and when it stopped */ crutch: THREE.Mesh; pd?: { key: number; t0: number; end?: number }; /** who paddles (CrewState.people's index) */ pdWho?: number; /** the race's clock at the last frame (CrewState.clock) */ clock?: number; /** her pitch at the last frame, rad, and its rate's smoothed mean square (syncCrew: how rough it is) */ seaP?: number; seaMs?: number;
  /** the jib winch being cranked: its side (+1 starboard) and the handle's turn about the spindle (rad, 0 pointing aft, + toward
   * +x), for boatMesh.ts to draw the handle where the hand has it */ winch?: { side: 1 | -1; turn: number } }
type Limb = Body['arm'][number];

/** A sailor (crewBody.ts): their body, and the state the posing keeps. */
const figure = (p: Person, jacket: number, seed: number): Figure => ({ ...buildBody(p, jacket, seed), gait: 0, speed: 0, swing: [null, null] });

/**
 * The tiller extension (the owner's: all black, a telescoping tube with a D-loop grip at its end, extension-style.png), from
 * its joint (the origin) along +y, EXT_LEN to the grip's far side.
 */
function extensionGeometry(): THREE.BufferGeometry {
  const outer = new THREE.CylinderGeometry(0.013, 0.013, 0.32, 8).translate(0, 0.17, 0), inner = new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8).translate(0, 0.4, 0);
  // the D: a loop of a 0.05 m radius, in the plane of the stick, its near side across the tube's end
  const loop = new THREE.TorusGeometry(0.05, 0.012, 6, 18).translate(0, EXT_LEN - 0.06, 0);
  const g = mergeGeometries([outer, inner, loop].map(q => q.toNonIndexed()));
  return g;
}

/**
 * Where a line's tail ends (boatMesh.ts, the jib sheet's and the traveller's): in the hand of whoever holds it
 * (Crew.sheetHand, led across the cockpit; Crew.travHand, on that side only), else where it falls, `rest`. One place, so a test can check the line ends at the
 * hand.
 */
export function tailEnd(rest: THREE.Vector3, hand?: THREE.Vector3, side?: number): THREE.Vector3 {
  return hand && (side == null || Math.sign(hand.x) === side) ? hand : rest; // (a side given: only a hand on it, the traveller's own end)
}
/** The jib sheet's winch (boatMesh.ts winches: the drum's top, where the sheet comes off it to its tail). */
export const jibWinch = (s: number) => winchAt(s);
/**
 * The jib sheet's tail from its winch (boatMesh.ts draws the sheet through these, after the winch): to the hand of the
 * hiker holding the working sheet (Crew.sheetHand), else over the coaming and down onto the seat. One place, so a test
 * can check the line as drawn.
 */
export function sheetTail(wv: THREE.Vector3, side: number, hand: THREE.Vector3 | undefined, hand2?: THREE.Vector3): THREE.Vector3[] {
  const u = uAtZ(wv.z), ci = cockpitHalf(u), coam = deckY(u, ci + COAMING_T) + COAMING_H(wv.z), e = tailEnd(V(side * (ci - 0.2), wv.y - 0.32, wv.z + 0.3), hand);
  if (e !== hand) { // (off the winch's top, over the coaming, clear of its top now the winch is about flush with it, and down onto the cockpit seat)
    const over = V(side * (ci - 0.01), Math.max(wv.y + 0.02, coam + 0.02), wv.z + 0.04);
    return [over, ...Array.from({ length: SHEET_N - 1 }, (_, j) => over.clone().lerp(e, (j + 1) / (SHEET_N - 1)))];
  }
  // (the working sheet in a hiker's hand: off the winch, lying over the coaming's inner edge, and straight across the
  // cockpit to the fist, above the hikers' knees, with only a light tail's slight sag)
  // (in both hands: through the second fist on its way to the first, the sag before it)
  const edge = sheetEdge(wv, side), mid = hand2 ?? e, n = hand2 ? SHEET_N - 2 : SHEET_N - 1, len = edge.distanceTo(mid);
  return [edge, ...Array.from({ length: n }, (_, j) => { const t = (j + 1) / n; return edge.clone().lerp(mid, t).add(V(0, -TAIL_SAG * len * 4 * t * (1 - t), 0)); }), ...(hand2 ? [e.clone()] : [])];
}
/** Where the held jib sheet lies over the coaming's inner edge, beside its winch: where it leaves the boat for the hand. */
export function sheetEdge(wv: THREE.Vector3, side: number): THREE.Vector3 {
  const u = uAtZ(wv.z), ci = cockpitHalf(u); return V(side * (ci - 0.004), deckY(u, ci + COAMING_T) + COAMING_H(wv.z) + 0.008, wv.z + 0.04);
}
/** The jib sheet tail's points after the winch (boatMesh.ts JIB_HALF_PTS: the winch is the 18th from the clew). */
export const SHEET_N = 6;
/** The traveller's control line's cam: on the thwart's forward face, just outboard of the track's end (boatMesh.ts). */
export const travCam = (s: number) => V(s * (TRAV_END + 0.12), THWART.top - 0.06, THWART.z - THWART.half);
/**
 * The traveller line's tail from its cam (boatMesh.ts draws the line through these, after the cam): to the hand of the
 * hiker holding it on that side (Crew.travHand), else falling from the cam. One place, so a test can check the line as
 * drawn.
 */
export function travTail(cam: THREE.Vector3, hand: THREE.Vector3 | undefined, side: number): THREE.Vector3[] {
  const e = tailEnd(V(cam.x - side * 0.02, cam.y - 0.2, cam.z - 0.03), hand, side);
  if (e !== hand) return Array.from({ length: TAIL_N }, (_, j) => cam.clone().lerp(e, (j + 1) / TAIL_N)); // (let go: hanging from the cam)
  // (held, pulled out and up to a hiker's hand at the rail: up the thwart's face out of the cam, over the top's forward
  // edge and across the top to the coaming, over the coaming's top, and across the side deck to the fist beside the hip,
  // with only a light line's slight sag there. It lies on the boat at each edge it turns on, as a line does; straight
  // from the cam to the coaming it went through the thwart's top and the coaming's face)
  const r = 0.008, s = side, top = V(cam.x, THWART.top + r, cam.z + 0.003), outer = travOuter(s), inner = outer.clone().setX(s * (cockpitHalf(uAtZ(outer.z)) - 0.004)), len = outer.distanceTo(e);
  return [top, inner, outer, ...Array.from({ length: TAIL_N - 3 }, (_, j) => { const t = (j + 1) / (TAIL_N - 3); return outer.clone().lerp(e, t).add(V(0, -TAIL_SAG * len * 4 * t * (1 - t), 0)); })];
}
/** Where the held traveller tail leaves the boat for the hand: over the coaming's outer top edge at the thwart's end. */
export function travOuter(s: number): THREE.Vector3 {
  const z = THWART.z, ci = cockpitHalf(uAtZ(z)); return V(s * (ci + COAMING_T + 0.004), ground(s * (ci + COAMING_T / 2), z) + 0.008, z);
}
/** The traveller tail's points after the cam, and its sag held (m a metre of it): a light line, nearly taut. */
const TAIL_N = 8, TAIL_SAG = 0.015;
/**
 * The middle of the fist (boat frame): the glove (crewBody.ts) runs on from the wrist, the forearm's end, its palm's
 * middle 6.5 cm on, the fingers curled round to it. Where a line held in that hand is (Crew.travHand), drawn from the
 * forearm as it's posed, not from where the hand was aimed.
 */
export function fistAt(f: Figure, i: 0 | 1): THREE.Vector3 {
  const par = f.root.parent; f.root.updateWorldMatrix(true, true);
  const a = f.arm[i].mid, el = a.localToWorld(V(0, 0, 0)), wr = a.localToWorld(V(0, -BONE.fore, 0));
  const at = wr.clone().addScaledVector(wr.clone().sub(el).normalize(), FIST * f.scale);
  return par ? par.worldToLocal(at) : at;
}
const FIST = 0.065;
/**
 * The piano (boatMesh.ts draws it from these): its cleats on the cabin top's after end, inboard to outboard as the sail
 * controls band lays them out, and each line's tail over the top's after edge and down the cabin's face into the cockpit.
 */
export const PIANO_ORDER = { S: ['vang', 'outhaul', 'jibCunningham', 'jibHalyard'], P: ['vang', 'outhaul', 'cunningham', 'jibCunningham', 'downhaul'] } as const;
/** The tail of the `i`th line on side `side` (+1 starboard): the cleat, over the edge, and down the face to its end. */
export function pianoTail(side: number, i: number): THREE.Vector3[] {
  const zA = -L / 2 + CABIN.u1 * L - 0.05, zE = -L / 2 + CABIN.u1 * L, x = side * (0.37 + 0.065 * i);
  const cy = cabinTopAt(uAtZ(zA), x) + 0.025, top = cabinTopAt(uAtZ(zE - 0.004), x) + 0.012;
  return [V(x, cy, zA + 0.02), V(x, top, zE - 0.004), V(x, top - 0.02, zE + 0.012), V(x + side * 0.02, cy - 0.25 - 0.04 * i, zE + 0.05)];
}
/** A tail in hand: from its cleat over the top's after edge, pulled off the cabin's face to the upper fist and on to
 * the lower, where its end hangs (pianoTail's four points, the last two in the fists). */
export function pianoTailHeld(side: number, i: number, fists: [THREE.Vector3, THREE.Vector3]): THREE.Vector3[] { const t = pianoTail(side, i); return [t[0], t[1], fists[0].clone(), fists[1].clone()]; }
/** How far a tail can be pulled off the cabin's face to a hand, from where it comes over the top's after edge (m): its
 * hanging length, about 30 cm (boatMesh.ts: 25 cm and more below the cleat). */
const PIANO_PULL = 0.32;
/** Which tail a crew at the piano on side `s` works for `line` (theirs if it's dual-ended; the vang's if none is known). */
function pianoFor(line: string | undefined, s: number): { side: number; i: number } {
  const own = (s >= 0 ? PIANO_ORDER.S : PIANO_ORDER.P) as readonly string[], j = line ? own.indexOf(line) : -1;
  if (j >= 0) return { side: s >= 0 ? 1 : -1, i: j };
  const other = (s >= 0 ? PIANO_ORDER.P : PIANO_ORDER.S) as readonly string[], o = line ? other.indexOf(line) : -1;
  return o >= 0 ? { side: s >= 0 ? -1 : 1, i: o } : { side: s >= 0 ? 1 : -1, i: 0 };
}
/** A point `t` (0..1) along a polyline, by length. */
function along(pts: THREE.Vector3[], t: number): THREE.Vector3 {
  let tot = 0; for (let i = 0; i + 1 < pts.length; i++) tot += pts[i].distanceTo(pts[i + 1]);
  let d = t * tot; for (let i = 0; i + 1 < pts.length; i++) { const l = pts[i].distanceTo(pts[i + 1]); if (d <= l) return pts[i].clone().lerp(pts[i + 1], l > 0 ? d / l : 0); d -= l; }
  return pts[pts.length - 1].clone();
}
/** How far a point is from the straight run between two others. */
const onRun = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const ab = _ab.copy(b).sub(a), t = Math.max(0, Math.min(1, _ap.copy(p).sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(_ap.copy(a).addScaledVector(ab, t)); };
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
/** The shoulder as drawn (boat frame): the upper arm's root. */
function shoulderDrawn(f: Figure, i: 0 | 1): THREE.Vector3 {
  const par = f.root.parent; f.root.updateWorldMatrix(true, true);
  const at = f.arm[i].root.getWorldPosition(new THREE.Vector3()); return par ? par.worldToLocal(at) : at;
}
/** The wrist as drawn (boat frame): the forearm's end. */
function wristAt(f: Figure, i: 0 | 1): THREE.Vector3 {
  const par = f.root.parent; f.root.updateWorldMatrix(true, true);
  const at = f.arm[i].mid.localToWorld(V(0, -BONE.fore, 0)); return par ? par.worldToLocal(at) : at;
}
export function buildCrew(helm: Person, people: Person[], jackets: number[], seed: number): Crew {
  const group = new THREE.Group();
  const h = figure(helm, jackets[0], seed); group.add(h.root);
  const crew = people.map((p, i) => { const f = figure(p, jackets[(i + 1) % jackets.length], seed + i + 1); group.add(f.root); return f; });
  // the tiller extension (a black glassfibre stick on a universal joint at the tiller's end), in the helm's hand
  const extension = new THREE.Mesh(extensionGeometry(), new THREE.MeshLambertMaterial({ color: 0x141518 }));
  extension.castShadow = true; group.add(extension);
  const ujoint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2a2c30 })); group.add(ujoint);
  const crutch = new THREE.Mesh(crutchGeometry(), new THREE.MeshLambertMaterial({ color: 0x9a6a3c })); crutch.visible = false; crutch.castShadow = true; group.add(crutch);
  return { group, helm: h, crew, helmSide: 1, side: 1, extension, ujoint, crutch };
}

/**
 * The boom crutch (boat/paddle.ts): a varnished wooden post that holds the boom up when she's moored, its foot a flat
 * end about 0.15 × 0.20 m (paddle.ts F_MAX's blade), its head a crotch for the boom. One mesh, along +y from the foot
 * (y 0) to the crotch (1.35 m), the foot's flat faces toward ±z.
 */
function crutchGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.017, 0.019, 1.2, 7).translate(0, 0.75, 0);
  const foot = new THREE.BoxGeometry(0.15, 0.2, 0.022).translate(0, 0.1, 0);
  const prong = (s: number) => new THREE.BoxGeometry(0.03, 0.16, 0.03).translate(0, 0.08, 0).rotateZ(s * 0.45).translate(0, 1.33, 0);
  const g = mergeGeometries([shaft, foot, prong(1), prong(-1)].map(q => q.index ? q.toNonIndexed() : q));
  return g;
}
/** The paddling as the page sees it (boatMesh.ts, from boat/paddle.ts): the side, back-paddling, the time the crutch
 * takes to fetch (s), who paddles (CrewState.people's index: 0 the helm), and its start as a key. */
export interface PaddleDraw { side: 'P' | 'S'; back: boolean; fetch: number; who: number; key: number }
/** This frame's paddler (syncCrew): their figure, how long since the paddling began (s, the race's clock), the fetch
 * time, the side (+1 starboard), back-paddling, and since when it stopped. */
let pdl: { f: Figure; e: number; fetch: number; sd: number; back: boolean; stop?: number } | undefined;

// ———————————————————————————— the boat's surfaces, where people sit and step ————————————————————————————

/** The mast's place (crewPhys.ts Z.mast: its after side), and the farthest forward anyone goes (crewPhys.ts Z.bow). */
const MAST_Z = -0.95, Z_BOW = -3.32;
const smooth01 = (t: number) => { const q = Math.max(0, Math.min(1, t)); return q * q * (3 - 2 * q); };
const COCK0 = -L / 2 + COCKPIT.u0 * L, COCK1 = -L / 2 + COCKPIT.u1 * L, CAB0 = -L / 2 + CABIN.u0 * L;
/** The cockpit, from hull.ts (COCKPIT_FIT, Boat Detail's, to the construction plan): side benches 300 mm over the sole
 * from the bulkhead aft to St. 4¾, a footwell round the thwart, and a
 * footrest, a plank at the benches' height across the after end (slid out, or back under the after deck); the thwart a deep beam across the cockpit, its top a little under
 * the coaming caps, the footwell either side of the sole open to the hull's inside, no post under the thwart. */
const SEAT_Y = COCKPIT_FIT.seat, { benchAft: BENCH_AFT } = COCKPIT_FIT;
/**
 * The footrest (Boat Detail's, the owner's: hull.ts FOOTREST): one teak plank right across the cockpit's after end, its top
 * at the benches' height, slid out from the hollow under the after deck while the helm sits, their feet on it, and back
 * under the deck when they stand to steer. `footrestBack` 0 out (as boatMesh draws it by default) … 1 back: how far it's
 * slid back, as b.footrest. Its front edge, and over it the plank's top; under the deck behind it, the sole carries on.
 */
/** The race's clock as the figures are posed (s): a winch's strokes go by it, not the page's. */
let poseClock = 0;
/** How hard she's moving in the sea, 0 (flat water, a light chop) to 1: the root mean square of her pitch rate, smoothed
 * over some seconds (syncCrew). From the physics' own seaway (boat/seaway.ts waveMotion, which the drawn boat rides): in
 * the Bay's westerly sea about 0.006 rad/s at 6 kt, 0.025 at 14, 0.066 at 22 (measured, an AI boat racing on the default
 * course). Going forward in it, a crew goes lower and slower, both hands down. */
let rough = 0;
/** The tiller extension's length (m): about half the tiller's (the owner: a long one is "visually intrusive and not true
 * to life"), ESTIMATE. And the tiller's root this frame (syncCrew), for folding it back along the tiller. */
const EXT_LEN = 0.6, /** the D-grip's middle, along the extension from its joint */ EXT_GRIP = EXT_LEN - 0.06;
let tRoot: THREE.Vector3 | undefined;
/** Back along the top of the tiller from its end, toward the rudder head: the stowed extension's way. */
const extAlong = (tip: THREE.Vector3) => tRoot ? tRoot.clone().sub(tip).normalize().add(V(0, 0.05, 0)).normalize() : V(0, 0.1, 1).normalize();
/** Between two directions, the share `e` of the way round (on the joint). */
function slerpDir(a: THREE.Vector3, b: THREE.Vector3, e: number): THREE.Vector3 {
  const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (ang < 1e-4) return b.clone();
  const ax = new THREE.Vector3().crossVectors(a, b); if (ax.lengthSq() < 1e-10) ax.set(0, 1, 0); return a.clone().applyAxisAngle(ax.normalize(), ang * e);
}
/** The extension swung out (ESTIMATES): when the helm is hiking (lean past EXT_HIKE) or the tiller's past EXT_TILLER
 * degrees off the centerline; stowed again once neither has been so for EXT_STOW s; the swing takes EXT_SWING s. */
const EXT_HIKE = 0.3, EXT_TILLER = 30, EXT_STOW = 3, EXT_SWING = 0.6;
/** …unless the tiller's end is within EXT_CLOSE m of their hips (ESTIMATE): then the hand's on the tiller. */
const EXT_CLOSE = 0.9;
/** The winch someone is cranking this frame, if anyone (Crew.winch). */
type Cranked = { side: 1 | -1; turn: number; fig?: Figure; hand?: number };
let cranked: Cranked | undefined;
/**
 * The jib winch handle's grip at `turn` (boatMesh.ts winchHandle and WINCH_HANDLE, Boat Detail's: a 10-inch handle in the
 * winch's socket, its spindle under the side deck's edge, the grip on its end, 0 pointing aft). The middle of the grip,
 * where the hand closes on it.
 */
const WH = { drop: 0.05, len: 0.254, grip: 0.1 };
export function winchGrip(side: number, turn: number): THREE.Vector3 {
  const u = uAtZ(JIB_WINCH_Z), x = side * (cockpitHalf(u) + COAMING_T + 0.075), under = deckY(u, Math.abs(x)) - 0.03;
  return V(x + WH.len * Math.sin(turn), under - WH.drop - WH.grip / 2 - 0.005, JIB_WINCH_Z + WH.len * Math.cos(turn));
}
/**
 * The handle's swing for a short pull (rad either side of pointing aft): the handle under the deck's edge can't go round,
 * so the sheet's ground in with short strokes, ratcheting, about 17 degrees either way (Boat Detail: a crank worked in a
 * tight space, its end clear of the lining), about one a second
 * (Lewmar's ratchet handles: worked in part-turns where a full sweep is blocked). An estimate of the stroke's pace.
 */
const SHORT_PULL = { swing: 0.3, hz: 0.9 };
/** The cranker's seat on the bench: the after shoulder about level with the handle's end, the arm in under the deck ahead of the after end of the space there (COCKPIT_FIT.benchAft). */
const BENCH_TOP_AFT = 1.68;
/** How far round toward the winch's handle they turn from facing in (of the whole way): enough for the shoulder to reach. */
const WINCH_TURN = 0;
/**
 * Under the side deck, beside the cockpit: open to it along the bench, from the coaming's foot out to the lining, from the
 * locker lid up to the deck's underside (hull.ts; Boat Detail's, as the owner describes Josephine: the winches turned from
 * below the side deck, the handle reached in under its edge). Where a hand can go in to the winch's grip.
 */
export function underDeck(x: number, y: number, z: number): boolean {
  if (!(z > COCK0 + 0.06 && z < BENCH_AFT)) return false;
  const u = uAtZ(z), ax = Math.abs(x);
  return ax > cockpitHalf(u) - 0.01 && ax < benchOut(u) && y > SEAT_Y && y < deckY(u, ax) - 0.03;
}
/** What's under a hand: the ground, or in under the side deck, the locker lid. */
const handFloor = (x: number, y: number, z: number) => (underDeck(x, y, z) ? SEAT_Y : ground(x, z));
let footrestBack = 0;
export function setFootrest(back: number): void { footrestBack = Math.max(0, Math.min(1, back)); }
const footrestOut = () => FOOTREST.out * (1 - footrestBack);
const onFootrest = (ax: number, z: number) => { const s = footrestOut(); return z >= COCK1 - s && ax < footrestEdge(z + s); };
const THWART = { z: COCKPIT_FIT.thwart.z, half: COCKPIT_FIT.thwart.half, top: thwartTop() };
/** The traveller track's half-length (boatMesh.ts TRAV_HALF): its control lines' cams are just beyond its ends. */
const TRAV_END = 0.5;
const coamH = COAMING_H;
/** The sole's half-width at z (between the benches' fronts, narrowing aft with the hull: hull.ts cockpitGeometry). */
const soleHalf = (z: number) => Math.min(COCKPIT_FIT.soleHalf, Math.max(0, innerHalf(z, COCKPIT.sole) - 0.03));
/**
 * The hull's inner half-breadth over the cockpit's length (m, at z along her and y up), tabled once at 2 cm each way and
 * read by bilinear interpolation (Capacity, 15 Nov 2026): hull.ts hullInnerHalf bisects her section 30 times a call,
 * and ground() asked it 14 times a foot, every frame for every figure, the same answers again and again: about 2 ms of
 * JS a frame headless, 0.4 ms on the owner's Mac. The section's a smooth curve: at 2 cm the table's within a millimetre
 * of it over the cockpit (0.93 mm at worst: tests/crewground.test.ts). Outside the cockpit's length or height, and near the
 * canoe body's bottom, the hull itself.
 */
const IN = { z0: 0.98, z1: 2.84, y0: COCKPIT.sole - 0.5, y1: 1.05, d: 0.02 }; // (the cockpit, the after bulkhead to its after end, and the footwell from half a metre under the sole: where ground() asks)
let inTab: Float64Array | undefined, inBot: Float64Array | undefined;
const inNz = Math.round((IN.z1 - IN.z0) / IN.d) + 1, inNy = Math.round((IN.y1 - IN.y0) / IN.d) + 1;
export function innerHalf(z: number, y: number): number {
  if (z < IN.z0 || z > IN.z1 || y < IN.y0 || y > IN.y1) return hullInnerHalf(uAtZ(z), y);
  if (!inTab) {
    inTab = new Float64Array(inNz * inNy); inBot = new Float64Array(inNz);
    for (let i = 0; i < inNz; i++) { const u = uAtZ(IN.z0 + i * IN.d); inBot[i] = canoe(u); for (let j = 0; j < inNy; j++) inTab[i * inNy + j] = hullInnerHalf(u, IN.y0 + j * IN.d); }
  }
  const fz = (z - IN.z0) / IN.d, fy = (y - IN.y0) / IN.d, i = Math.min(inNz - 2, Math.floor(fz)), j = Math.min(inNy - 2, Math.floor(fy)), a = fz - i, b = fy - j, t = inTab, r = i * inNy + j;
  // (near the canoe body's bottom the section turns sharply into the keel, too sharply for the table: there, the hull)
  if (y < Math.max(inBot![i], inBot![i + 1]) + 0.06) return hullInnerHalf(uAtZ(z), y);
  return (t[r] * (1 - b) + t[r + 1] * b) * (1 - a) + (t[r + inNy] * (1 - b) + t[r + inNy + 1] * b) * a;
}
/** The front edge of the bench beside the sole (|x|, m), where one runs: its depth from there out to the coaming. */
const benchEdge = (z: number) => soleHalf(z);
const chz = (z: number) => cockpitHalf(uAtZ(z));
/** Where along the benches people sit (their hips): clear of the bulkhead forward (half a shoulder's width) and of the
 * benches' after end and the thwart; two on one bench a shoulder's width apart (SEP) fill it. */
const ZC_FWD = COCK0 + 0.3, ZC_AFT = Math.min(BENCH_AFT - 0.09, THWART.z - THWART.half - 0.17), SEP = 0.48;
/** Sitting on the side deck (or hiking from it), legs in over the coaming (crewPhys.ts Z: the owner's choice): from the
 * cockpit's forward corner aft beside the benches, and on past the thwart beside the footwell and the footrest to
 * about 2.5, short of the helm; the shins clear of the thwart either side of it. */
// (out on the side deck, from the cockpit's forward end (the hips half a shoulder's width aft of the cabin's after end),
// a seat either side of the jib winch on its pedestal between the cabin and the thwart (hull.ts JIB_WINCH_Z: the owner
// wants one on the rail forward of it, and one, with a little less room, aft of it), the pedestal's radius and half a
// hip's width clear; not on top of it)
const DECK_FWD = COCK0 + 0.29, DECK_AFT = 2.5, THW_A = THWART.z - THWART.half - 0.13, THW_B = THWART.z + THWART.half + 0.13;
const WIN_A = JIB_WINCH_Z - 0.24, WIN_B = Math.min(JIB_WINCH_Z + 0.24, THW_A); // (its pedestal 0.12 m in radius fore and aft at the deck (Boat Detail), and half a hip)
const deckZ = (z: number) => {
  let q = Math.min(DECK_AFT, Math.max(DECK_FWD, z));
  if (q > WIN_A && q < WIN_B) q = q < JIB_WINCH_Z + 0.1 ? WIN_A : WIN_B; // (forward of it unless clearly aft: the seat aft is the tighter, the thwart at the shins)
  return q > THW_A && q < THW_B ? (q - THW_A < THW_B - q ? THW_A : THW_B) : q;
};
const benchZ = (z: number) => Math.min(ZC_AFT, Math.max(ZC_FWD, z));
const inCockpit = (ax: number, z: number) => z > COCK0 && z < COCK1 && ax < chz(z);
/** The top of whatever is at (x, z) in the boat's frame (m above the waterline): sole, bench, footwell side, footrest, thwart, coaming, deck, cabin top.
 * Given a height `y`, at that height: the thwart is a beam (hull.ts thwartBottom), so under it, what's below it. */
export function ground(x: number, z: number, y?: number): number {
  const ax = Math.abs(x), u = uAtZ(z);
  // (the companionway, open in the cabin's after end down to its sill: hull.ts COMPANIONWAY; a hand reaches down into it
  // for the boom crutch below)
  if (ax < COMPANIONWAY.hw - 0.02 && z < COCK0 + 0.03 && z > COCK0 - COMPANIONWAY.len + 0.02) return COMPANIONWAY.sill; // (through the after bulkhead too: the opening's cut down to the sill)
  if (inCockpit(ax, z)) {
    if (Math.abs(z - THWART.z) < THWART.half && !(y != null && y < thwartBottom(x) - 0.01)) return THWART.top;
    if (onFootrest(ax, z)) return SEAT_Y; // (the footrest, across)
    const sh = soleHalf(z);
    if (ax < sh) return COCKPIT.sole;
    if (z < BENCH_AFT) return SEAT_Y; // (a bench)
    // (the footwell beside the sole: open to the hull's own inside, curving out and up to the deck)
    let lo = COCKPIT.sole - 0.5, hi = deckY(u, chz(z));
    for (let q = 0; q < 14; q++) { const m = (lo + hi) / 2; if (innerHalf(z, m) < ax) lo = m; else hi = m; }
    return hi;
  }
  if (z > CAB0 && z < COCK0 && ax < cabinHalf(u)) return cabinTopAt(u, ax);
  const e = halfBeam(u);
  // (outside the hull's plan, out past the deck's edge or ahead of the stemhead, there's no deck: nothing below but the
  // water (the topsides flare out to the deck's edge, and the stem rakes aft under it). Held up at the deck's height
  // there, the bow hand's lower legs, hanging over the front, stuck out level instead)
  // (a few centimetres' grace past the edge: a foot put at the side deck's edge and moved a step along it, where the deck
  // narrows, came out just past it and down to the water)
  if (ax > e + 0.06 || z < -L / 2 + 0.01) return 0.05;
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
interface PoseT { /** the foot (0, 1) hooked under the thwart: what's under it read at its own height (ground, the thwart a beam) */ hook?: number; /** the feet hang free over the deck's edge (sat on the bow): what's under them is only the deck itself, not its margin */ hang?: boolean; /** walking along the side deck (deckWalk): both feet up out of the cockpit at once */ deck?: boolean; /** which way the knees point (boat frame), if not forward */ knee?: THREE.Vector3; /** how far that's taken over from forward, 0 to 1 (eased: a knee doesn't flip in a frame) */ kneeW?: number; /** the knees come round slowly (sitting down on the side deck, the hips held up clear) */ kneeSlow?: boolean; hip: THREE.Vector3; yaw: number; pitch: number; roll: number; feet: [THREE.Vector3, THREE.Vector3]; hands: [THREE.Vector3, THREE.Vector3]; look: THREE.Vector3; /** walking or crawling: the feet step (planted, then swung) */ step?: boolean; /** which way an elbow points for an arm that isn't down and back (torso frame), by hand */ elbow?: [THREE.Vector3 | undefined, THREE.Vector3 | undefined] }
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
  if (inCockpit(Math.abs(p.x), p.z) && p.z < COCK1 - footrestOut()) {
    if (p.z > THWART.z - THWART.half - 0.07 && p.z < THWART.z + 0.15) p.z = THWART.z - THWART.half - 0.07;
    const e = soleHalf(p.z) - 0.08; if (Math.abs(p.x) > e) p.x = Math.sign(p.x) * Math.max(0, e);
  }
  return p;
};
/** The jib winch on side `ws` (boatMesh.ts buildLines, Boat Detail's, from Josephine's photos: on a moulded pedestal on
 * the side deck against the coaming's outer face, JIB_WINCH_Z aft of amidships; the sheet leading to it 0.07 above its base);
 * `up` higher, as for the handle on top. */
// (the jib winch's drum, its middle: on the side deck against the coaming between the cabin and the thwart, its top
// about flush with the coaming's (Boat Detail, Josephine's photo: hull.ts JIB_WINCH_Z, boatMesh.ts WINCH_H 0.123))
const winchAt = (ws: number, up = 0) => { const wz = JIB_WINCH_Z, u = uAtZ(wz), xo = chz(wz) + COAMING_T; return V(ws * (xo + 0.075), deckY(u, xo) + coamH(wz) - 0.123 + 0.01 + 0.07 + up, wz); };
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
  // (on their way across, and where they're going now back on the side they're still on (the physics' goal: its person,
  // quicker across, may be partway back already), a tack coming before they'd crossed:
  // they stay, not go on across and turn right round to come back: the owner's "moves restarted before they finish")
  if (q.down && f.cur && f.goalSide === q.side && Math.sign(c.x) === q.side) { q.down = false; q.sitT = undefined; }
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
    // (the knees up as they step up, not fore or aft into the thwart or the bulkhead, nor out toward that side, through the
    // coaming beside them as the hips rise: crewfig, a tack in light air)
    const w = deckWalk(q.side, q.z, q.face ?? (q.goal < q.z ? -1 : 1), k); w.knee = V(0, 1, 0); return w;
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
/**
 * Forward of the cockpit, beside the cabin's after end (crewPhys.ts Z.cabinSide, two crew with the weight wanted forward:
 * the owner's 8w): sat on the cabin top near its edge, which stands about a seat's height over the side deck, facing
 * outboard, the feet on the side deck. Out to its very edge to hike, the body leaning out over the deck.
 */
function onCabinSide(s: number, z: number, lean: number, k: number): PoseT {
  const u = uAtZ(z), ch = cabinHalf(u), e = halfBeam(u), hx = ch - 0.17 + 0.1 * Math.min(1, lean);
  const hip = V(s * hx, cabinTopAt(u, hx) + 0.09 * k, z), yaw = -s * Math.PI / 2, r = right(yaw), f = fwd(yaw);
  const fx = Math.min(e - 0.08, ch + 0.16);
  const foot = (j: number) => { const q = V(s * fx, 0, z).addScaledVector(r, (j ? 1 : -1) * 0.11 * k); return q.setY(deckY(uAtZ(q.z), Math.abs(q.x)) + 0.06); };
  const kneeAt = hip.clone().addScaledVector(f, 0.38 * k).add(V(0, 0.08, 0));
  const hands: [THREE.Vector3, THREE.Vector3] = [kneeAt.clone().addScaledVector(r, -0.1), kneeAt.clone().addScaledVector(r, 0.1)];
  return { hip, yaw, pitch: -0.1 - 0.5 * Math.min(1, lean), roll: 0, feet: [foot(0), foot(1)], hands, look: JIB_LUFF.clone() };
}
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
/** The crutch carried upright in front of them, both hands on it (to the side deck, and back below). */
function carry(p: PoseT, k: number): PoseT {
  const f = fwd(p.yaw), r = right(p.yaw), h = p.hip;
  // (at arm's length ahead and the elbows down and out: held close in, the upper hand by the shoulder folded the arm with
  // its elbow forward, kneeling with it on the side deck)
  p.hands = [h.clone().addScaledVector(f, 0.42 * k).addScaledVector(r, -0.08 * k).setY(h.y + 0.4 * k), h.clone().addScaledVector(f, 0.46 * k).addScaledVector(r, 0.08 * k).setY(h.y + 0.66 * k)];
  p.elbow = [V(0.3, -1, 0.3), V(-0.3, -1, 0.3)]; return p;
}
/**
 * Paddling (boat/paddle.ts): the paddler goes to the companionway, reaches down for the crutch below and comes up with
 * it, in the time the physics gives them (PADDLE.fetchS at their pace); carries it out to the side deck the physics
 * sends them to (world.ts paddleJob: the side deck by the cockpit's forward end, z 1.35); then kneels there facing
 * forward and a little out and paddles over the side: the crutch's foot dips in ahead, is drawn aft through the water,
 * lifted out and swung forward again, a stroke about every 2 s (1.7 in the first push, PADDLE.burstS); back-paddling, the
 * other way. The push itself is the physics' (paddleForce), steady: the strokes only draw it.
 */
function paddleWant(f: Figure, want: PoseT, q: NonNullable<typeof pdl>, px: number, z: number, going: boolean, windward: number, idx: number): PoseT {
  const k = f.scale, e = q.e, F = q.fetch, cu = f.cur?.hip;
  if (q.stop != null) return carry(want, k); // (stopped: carried back, and below)
  if (e < 0.62 * F) {
    // to the companionway, kneeling at its foot facing forward, reaching down into it; the crutch comes up from 0.42
    const cz = COCK0 + 0.5;
    // (on the way there, as any trip in the cockpit is posed: crewPose, which steps down off the side deck and over the coaming)
    if (cu && Math.hypot(cu.x, cu.z - cz) > 0.3) return crewPose(f, 0.05 * Math.sign(cu.x || 1), cz, 0, 'sit', windward, true, Math.atan2(cu.x, cu.z - cz), idx);
    const up = Math.max(0, Math.min(1, (e - 0.42 * F) / (0.2 * F))), zh = COCK0 - 0.12 + 0.3 * up;
    const hy = (j: number) => COMPANIONWAY.sill + 0.3 + up * (0.62 + j * 0.25);
    // (the hands close together and the elbows down and in, inside the opening's 0.55 m: splayed, the forearms crossed its jambs)
    const p = kneel(0, cz, 0, [V(-0.06, hy(0), zh), V(0.06, hy(1), zh)], k, V(0, COMPANIONWAY.sill, COCK0 - 0.4));
    p.pitch = -0.95 + 0.6 * up; p.elbow = [V(0.3, -1, 0.4), V(-0.3, -1, 0.4)]; return p;
  }
  // (out to the side deck with it; and paddling once they're there)
  const u = uAtZ(z), hb = halfBeam(u);
  // (still on the way out to it: walked there, stepping up out of the cockpit and over the coaming, not glided in to the
  // place where the physics, there already, has them kneeling; crewPose posed it sat on the deck, the feet sliding up)
  const far = !cu || Math.hypot(Math.abs(cu.x) - (hb - 0.2), cu.z - z) > 0.3;
  if (far && !going) return carry(moving(f, px, z, Math.atan2(-(px - cu!.x), -(z - cu!.z)), k), k); // (moving's way up out of the cockpit onto the side deck: the pole trip's, crewfig)
  if (going || far) return carry(want, k);
  // (kneeling on the side deck, outboard of the cabin's side or the coaming's, whichever is there, the inboard knee and foot
  // clear of it: beside the cockpit the deck's only 0.3 m wide; there with the crutch before the first stroke, too: the
  // physics' own kneel there, the jib car's, put the inboard foot on the coaming)
  const sd = q.sd, dk = deckY(u, hb), wall = Math.max(z < COCK0 ? cabinHalf(u) : 0, z > COCK0 - 0.05 ? chz(z) + COAMING_T : 0), x = sd * Math.max(wall + 0.12, hb - 0.24);
  const knelt = (hands: [THREE.Vector3, THREE.Vector3], look: THREE.Vector3) => {
    const p = kneel(x, z, -sd * 0.45, hands, k, look);
    for (const ft of p.feet) if (Math.abs(ft.x) < wall + 0.06) ft.setX(sd * (wall + 0.06)).setY(ground(ft.x, ft.z) + 0.07);
    p.pitch = -0.5; return p;
  };
  if (e < F) return carry(knelt([V(0, 0, 0), V(0, 0, 0)], V(sd * 3, 0, z - 2)), k);
  const ep = e - F, per = q.back ? 2.2 : ep < 20 ? 1.7 : 2.1, ph = (ep / per) % 1, pull = ph < 0.6;
  const w = pull ? ph / 0.6 : (ph - 0.6) / 0.4;
  let sw = pull ? -Math.cos(Math.PI * w) : Math.cos(Math.PI * w); // (−1 at the catch, ahead; +1 drawn aft)
  if (q.back) sw = -sw;
  const z0 = z - 0.15;
  const P = V(sd * (hb + 0.03), dk + 0.16, z0 + 0.22 * sw); // (the lower hand, at the rail)
  const B = V(sd * (hb + 0.38), pull ? -0.1 : 0.08 + 0.14 * Math.sin(Math.PI * w), z0 + 0.7 * sw); // (the foot: in the water pulling, lifted to swing forward)
  const d = P.clone().sub(B).normalize(), T = P.clone().addScaledVector(d, 0.66); // (the upper hand, up the shaft)
  return knelt(sd > 0 ? [T, P] : [P, T], B);
}
/** Moving about the boat: crouched under the boom, stepping over what's beneath, facing the way they're going. */
function moving(fig: Figure, x: number, z: number, yaw: number, k: number): PoseT {
  // (from where the figure is, a stride on toward where the physics has them: they walk at their feet's pace, behind it
  // on a long way; from its place, the hands went to the mast and the foredeck 1.2 to 3 m ahead of the hips, the arms
  // flung out at full stretch. Once out of the cockpit: stepping up out of it, as before, over the coaming as the pose has it)
  const cu = fig.cur?.hip; if (cu && fig.cur!.feet.some(ft => inCockpit(Math.abs(ft.x), ft.z))) { const dz = z - cu.z, lead = 0.35 * k; if (Math.abs(dz) > lead) z = cu.z + Math.sign(dz) * lead; } // (along the boat only, a foot still in the cockpit: aimed straight at the mast, the hips cut across the cabin's after corner)
  else if (cu) { const dx = x - cu.x, dz = z - cu.z, d = Math.hypot(dx, dz), lead = 0.35 * k; if (d > lead) { x = cu.x + dx * lead / d; z = cu.z + dz * lead / d; } }
  // (along the side deck beside the cabin, facing along it, fore or aft, as it runs: not the way the physics' person
  // heads, slantwise across the cabin top to the mast, which turned them to face out and leant them over the water)
  if (!inCockpit(Math.abs(x), z) && z > CAB0 - 0.7 && z < COCK0 + 0.6) yaw = Math.cos(yaw) >= 0 ? 0 : Math.PI;
  const g = groundNear(x, z, 0.22), f = fwd(yaw), r = right(yaw), ph = fig.gait;
  if (!inCockpit(Math.abs(x), z) && z < COCK1) {
    // forward of the cockpit (along the side deck, on the foredeck): a low crouch, the knees bent and the weight over the
    // feet, stepping, a foot at a time lifted clear of the deck; one hand for the boat: the inboard hand on the cabin top's
    // edge beside the cabin (its handrail), on the mast going past it; the other on the shroud by its chainplate, or
    // steadying on the knee. (On hands and knees with the shins trailing flat behind, the owner: "the way the head forward
    // looks like they're dragging their legs like paralyzed people")
    // (round the mast, not through it)
    if (Math.abs(z - MAST_Z) < 0.35 && Math.abs(x) < 0.32) x = (x >= 0 ? 1 : -1) * 0.32;
    const ch = (q: number) => q > CAB0 - 0.1 && q < COCK0 + 0.05 ? cabinHalf(uAtZ(q)) : 0;
    // (beside the cabin, along the side deck on the side they're on, holding its handrail, as anyone goes forward: not up
    // over the cabin top, though the physics' person takes the straight line over it. Drawn from where the figure was,
    // a third of a metre toward the middle, the hips came onto the cabin top's edge and off it again: a leap up, a foot
    // lifted onto it with the knee at the chest, and down)
    // (and out to it before the cabin's end, coming aft off the foredeck: moved out only once beside it, the foot left
    // behind swung diagonally across its forward corner at the top's height)
    const chA = Math.max(ch(z), ch(z + fwd(yaw).z * 0.6 * k));
    if (chA > 0.05) { const sd = fig.cur && Math.abs(fig.cur.hip.x) > 0.05 ? Math.sign(fig.cur.hip.x) : x >= 0 ? 1 : -1; x = sd * Math.min(Math.max(Math.abs(x) * (Math.sign(x) === sd ? 1 : 0), chA + 0.1), Math.max(chA + 0.1, halfBeam(uAtZ(z)) - 0.22)); }
    // (the hips over the inner part of the side deck, leaning in over the cabin's edge, its handrail in hand: the deck's
    // only a quarter metre wide beside it, and with the hips 0.18 out from the cabin the body hung out over the water)
    // (from the deck under them, not the highest thing near them: beside the cabin that was its top, 0.36 m up, and they
    // walked stood up on straight legs)
    // (and lower in a seaway, the weight down over the feet: the owner, "slower and more on all fours in a seaway")
    const s = x >= 0 ? 1 : -1, rl = z < COCK0 - 0.3 ? rough : 0, gx = ch(z) > 0.05 ? s * Math.max(Math.abs(x), ch(z) + 0.12) : x, hip = V(x, ground(gx, z) + (0.70 - 0.18 * rl) * k, z); // (over the side deck beside the cabin: from its height, the hips leaning in over the cabin's edge, not up on its top)
    // (beside the cabin, the feet on the side deck outboard of its side, not in over it: its side stands up to 0.38 m
    // above the deck aft, hull.ts cabinSideH)
    const outside = Math.abs(hip.x) > ch(hip.z);
    // (a stride of about a third of a metre, the feet a hand's width either side of the hips, each a step ahead in turn:
    // the stepping itself, lifting each clear and down again, is ease()'s)
    const feet = [0, 1].map(j => { const ft = hip.clone().addScaledVector(f, 0.17 * k * Math.sin(ph + j * Math.PI)).addScaledVector(r, (j ? 1 : -1) * 0.1 * k);
      if (outside) { const e = ch(ft.z) + 0.16; if (e > 0.16 && Math.abs(ft.x) < e) ft.x = s * e; }
      // (and never down in the cockpit beside the cabin's after end: out on the side deck, past the coaming. A foot put in
      // from the hips there stepped back down onto the bench, the shin through the cabin's corner)
      if (ft.z > COCK0 - 0.05 && ft.z < COCK1 && Math.abs(ft.x) < chz(ft.z) + 0.13) ft.x = s * (chz(ft.z) + 0.13); // (clear of the coaming's top too: within 12 cm of its inner face, onGround puts a foot inside it)
      const e2 = halfBeam(uAtZ(ft.z)) - 0.05; if (Math.abs(ft.x) > e2) ft.x = Math.sign(ft.x) * e2;
      return ft.setY(ground(ft.x, ft.z) + 0.07); }) as [THREE.Vector3, THREE.Vector3];
    const zh = z + f.z * 0.2 * k; // (a little ahead, the way they're going)
    const inb = ch(zh) > 0.05 && outside ? V(s * (ch(zh) - 0.05), cabinTopAt(uAtZ(zh), ch(zh) - 0.05) + 0.04, zh) // (the cabin top's edge: its handrail)
      : Math.abs(z - MAST_Z) < 0.6 ? V(s * 0.07, g + 0.75 * k, MAST_Z) // (the mast)
      : V(hip.x - s * 0.18 * k, 0, zh).setY(ground(hip.x - s * 0.18 * k, zh) + 0.05); // (the deck ahead, inboard)
    const shroudZ = MAST_Z + 0.1, nearShroud = Math.abs(z - shroudZ) < 0.5;
    const out = nearShroud ? V(s * (halfBeam(uAtZ(shroudZ)) - 0.08), deckY(uAtZ(shroudZ), halfBeam(uAtZ(shroudZ))) + (0.75 - 0.3 * rl) * k, shroudZ) // (the shroud, above its chainplate)
      : rl > 0.4 ? (() => { const h = hip.clone().addScaledVector(f, 0.55 * k); h.x = s * Math.min(halfBeam(uAtZ(h.z)) - 0.1, Math.abs(hip.x) + 0.1 * k); return h.setY(ground(h.x, h.z) + 0.05); })() // (in a seaway, down on the deck ahead too: on all fours, near enough)
      : hip.clone().addScaledVector(f, 0.3 * k).addScaledVector(r, s * Math.sign(r.x || 1) * 0.12 * k).setY(hip.y - 0.12 * k); // (on the knee)
    const rightIsIn = Math.sign(r.x) === -s;
    const p: PoseT = { hip, yaw, pitch: -0.55 - 0.3 * rl, roll: 0, feet, hands: rightIsIn ? [out, inb] : [inb, out], look: hip.clone().addScaledVector(f, 2).setY(hip.y + 0.4), step: true };
    // (by the cabin's after end, stepping up out of the cockpit beside it: the knees forward and a little out, clear of its
    // corner. Not along the rest of it: further out, the knees went over the side, past the hull)
    if (outside && ch(z) > 0.05 && z > COCK0 - 0.5) { p.knee = f.clone().add(V(s * 0.35, 0.5, 0)); p.kneeW = 1; }
    // (and beside the cockpit, the hips near the coaming's line on the way up out of it onto the side deck: the knees
    // forward and out over the deck too, not folded onto the coaming's top under hips still rising; going out to paddle)
    else if (z > COCK0 - 0.05 && z < COCK1 && Math.abs(hip.x) > chz(z) - 0.1) { p.knee = f.clone().add(V(s * 0.35, 0.5, 0)); p.kneeW = 1; }
    // (and the hips stay inside the coaming's line until no foot is left down in the cockpit: out over it with a foot
    // still on the bench, that knee went with them and the shin crossed the coaming's inner face, climbing out from the
    // cockpit's after stations (crew-seat-swap's) at z 1.6)
    if (fig.cur?.feet.some(ft => inCockpit(Math.abs(ft.x), ft.z) && ft.y < SEAT_Y + 0.2)) { const lim = chz(hip.z) - 0.02; if (lim > 0.2 && Math.abs(hip.x) > lim) hip.x = Math.sign(hip.x) * lim; }
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
function crewPose(fig: Figure, x: number, z: number, lean: number, job: Job, windward: number, isMoving: boolean, motion: number, idx: number, tackRole: 'jib' | 'main' | null = null, dest = z, jibTrim = idx === 0): PoseT {
  const k = fig.scale, s = Math.abs(x) > 0.05 ? Math.sign(x) : windward, ax = Math.abs(x);
  if (tackRole) {
    // through a tack, down in the cockpit and across under the boom (the owner): the forward crew on one knee working
    // the jib sheets at the leeward winch, the middle crew up in a crouch tacking the main from the thwart
    // (the jib hand forward by the winches, the main hand aft by the thwart, clear of each other)
    const zz = tackRole === 'jib' ? COCK0 + 0.5 : THWART.z - THWART.half - 0.6, lim = benchEdge(zz) - (tackRole === 'jib' ? 0.2 : 0.1), px = Math.max(-lim, Math.min(lim, x));
    if (tackRole === 'jib') {
      // (on one knee on the leeward locker lid beside the winch, which stands out on its pedestal past the coaming:
      // within arm's reach of it, the sheet in the inboard hand. Just forward of it, abreast: the winch between the cabin
      // and the thwart (JIB_WINCH_Z), the kneeling shin behind them clear of the thwart and the front foot of the bulkhead)
      const ws = -windward, w = winchAt(ws), wz = w.z - 0.05, bx = ws * (chz(wz) - 0.22);
      const yaw = -ws * 0.15, hold = V(bx - ws * 0.12, SEAT_Y + 0.6 * k, wz - 0.25);
      // (the inboard knee up and the outboard one down on the lid by the coaming: the other way round, the forward thigh
      // would lie along the coaming and through it)
      return kneelOne(bx, wz, yaw, ws > 0 ? 0 : 1, ws > 0 ? [hold, w] : [w, hold], k, w);
    }
    // (facing aft, the mainsheet on the thwart in front of them, as anyone tacks the main from forward of it: facing forward
    // with their hands on it behind them, the arms went back through the elbows, the owner's "backwards arms"; and back from
    // it far enough that, bent over in the crouch toward it, their hands are in front of the chest and their knees clear of
    // the thwart)
    const sheet = V(px * 0.4, 0.9, THWART.z - 0.25); // (the tail hauled in front of the thwart, not over it: an elbow below the hands lay on its top)
    return crouch(px, zz, Math.PI, [sheet.clone().add(V(0.07, 0.05, 0)), sheet.clone().add(V(-0.07, -0.05, 0))], k, sheet.clone().add(V(0, 1.2, 0.4)));
  }
  // (moving: crouched in the cockpit, on hands and knees on deck; arriving at the side deck they step up onto it)
  // (somewhere forward of the cockpit with no job there, as after setting the pole, waiting to see where they go next:
  // on deck on hands and knees where they are, not drawn back in the cockpit)
  // (a place up forward, not yet reached: still on the way there, along the side deck)
  if ((job === 'fore' || job === 'bow') && z > CAB0) { isMoving = true; dest = Math.min(dest, CAB0 - 0.5); }
  // (and crawling on until they're there, not sat down while still on the way)
  else if ((job === 'fore' || job === 'bow') && fig.cur && Math.abs(fig.cur.hip.z - z) > 0.15) { isMoving = true; dest = z; }
  // (to the mast, too, from a job well aft of it: walked there, not the standing pose eased up out of the cockpit, the
  // feet together and gliding up a metre onto the cabin top)
  else if (job === 'mast' && fig.cur && Math.abs(fig.cur.hip.z - Math.max(z, CAB0 + 0.45)) > 0.4) { isMoving = true; dest = z; } // (where its pose kneels: below)
  if (z < COCK0 - 0.3 && (job === 'sit' || job === 'lee' || job === 'hike' || job === 'cross')) isMoving = true;
  // (sat beside the cabin's after end, by the physics, while they're out on the side deck aft of it, as when the cabin-top
  // lines are done from there and the physics sits them down where its weight is: they stay sat on the deck at its
  // forward end, half a meter aft. Eased up on to the cabin top's edge, the hips came up over the deck's corner on the
  // way and they stood straight-legged at the rail (the owner: "bro just out here standing on the rail"))
  else if (z < COCK0 && z >= COCK0 - 0.3 && (job === 'sit' || job === 'lee' || job === 'hike') && fig.cur && fig.cur.hip.z > COCK0 && Math.abs(fig.cur.hip.x) > chz(fig.cur.hip.z) - 0.05) z = DECK_FWD;
  // (at the station beside the cabin's after end, sat there: on the cabin top's edge, the side the weight's on)
  else if (!isMoving && z < COCK0 && (job === 'sit' || job === 'lee' || job === 'hike')) return onCabinSide(Math.abs(x) > 0.05 ? Math.sign(x) : windward, z, lean, k);
  // (seated along the cockpit, they're on its benches or the side deck beside them: the weight's place from the physics,
  // drawn within the benches' length)
  else if (z < COCK1 && (job === 'sit' || job === 'lee' || job === 'hike' || job === 'cross')) {
    // (on the side deck, or aft of the benches, which is the side deck: there; on a bench, within its length)
    const deck = job === 'hike' || z > ZC_AFT + 0.05 || ax >= chz(benchZ(z)) - 0.06, at = deck ? deckZ : benchZ;
    z = at(z); if (dest >= COCK0 - 0.3) dest = at(dest);
  }
  const sideways = Math.abs(motion) > 0.6 && Math.abs(motion) < 2.5, alongside = z > COCK0 && z < COCK1 && ax > chz(z) - 0.2;
  // (moving fore and aft from a place on the side deck to another within the cockpit's length: down into the footwell,
  // along it crouched, and back up, as anyone gets round in a cockpit: not squat-crawling along the deck between the
  // coaming and the toe rail, the owner: "any human crew would step into the cockpit to get around". Up the deck past the
  // cabin to the mast or the car, and back, the side deck's the only way)
  if (isMoving && !sideways && alongside && z >= ZC_FWD - 0.01 && dest >= ZC_FWD - 0.01 && dest < COCK1 && job !== 'car' && job !== 'mast') {
    const fx = s * Math.max(0.12, soleHalf(z) - 0.12);
    return moving(fig, fx, z, Math.cos(motion) >= 0 || !fig.cur || Math.cos(fig.cur.yaw) >= 0 ? 0 : Math.PI, k);
  }
  if (isMoving && !(alongside && sideways)) {
    // (across the cockpit they shuffle sideways facing forward, under the boom; fore and aft, the way they're going)
    // (on the way to the cabin-top lines, which they work from the cockpit's forward end: through the cockpit)
    // (in the cockpit, a crouched shuffle facing forward whichever way they go: turning round there sweeps the knees into
    // the seats.) Going forward past the cabin, along the side deck: out of the cockpit's forward end onto it, past the
    // cabin on hands and knees, and in again on the foredeck, not over the companionway and the cabin top
    if (job === 'piano') return moving(fig, x, Math.max(z, COCK0 + 0.5), inCockpit(ax, z) ? 0 : motion, k);
    let zz = Math.max(z, Z_BOW); const forward = Math.min(z, dest) < COCK0 - 0.2;
    // (out of the cockpit's forward corner onto the side deck first, then forward: not diagonally across the cabin's corner)
    // (and both feet up out of it onto the deck before setting off forward along it: walked on with a foot still on the
    // bench, the leg left behind went across the cabin's after corner)
    if (forward && fig.cur && zz < COCK0 + 0.35 && zz > CAB0 && (Math.abs(fig.cur.hip.x) < cabinHalf(uAtZ(COCK0 - 0.1)) + 0.06 || fig.cur.feet.some(ft => inCockpit(Math.abs(ft.x), ft.z)))) zz = Math.max(zz, Math.min(fig.cur.hip.z, COCK0 + 0.35));
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
    // deep downwind with the pole out: sitting on the foredeck forward of the forestay, facing forward, the thighs along
    // the deck to the stemhead and the lower legs hanging down over the bow, one either side of the stem, knees bent
    // (the owner: "hang his legs over the front"). Where the physics has the weight (crewPhys.ts Z.bow, 0.5 m aft of the
    // stem): the stem rakes aft below the deck (render/hull.ts canoe), so the shins hang in clear air in front of it,
    // half a metre above the water. Hands on the deck beside the hips. Before, the legs stuck straight out sideways along
    // the deck's edge, knees locked: "look at this dork".
    const u = uAtZ(z), d = deckY(u, 0), hip = V(0, d + 0.09 * k, z);
    const zk = Math.max(-L / 2 + 0.05, z - 0.4 * k), dk = deckY(uAtZ(zk), 0);
    const feet = [-1, 1].map(sx => V(sx * 0.12 * k, dk + 0.06 - 0.44 * k, zk + 0.05)) as [THREE.Vector3, THREE.Vector3];
    const hand = (sx: number) => V(sx * 0.17, deckY(u, 0.17) + 0.03, z + 0.06);
    return { hip, yaw: 0, pitch: 0.1, roll: 0, feet, hands: [hand(-1), hand(1)], look: V(0, 1, z - 6), knee: V(0, 0.2, -1), kneeW: 1, hang: true };
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
    // forward to them on the cabin top beside the companionway, both fists on the line's tail where it comes aft over
    // the top to its edge (the owner, 18 Nov 2026: "still holding an invisible line": the hands were put beside the cleats)
    const p = onDeck(s, DECK_FWD, 0, k), { side, i } = pianoFor(fig.pianoLine, s), tl = pianoTail(side, i); fig.pianoN = (fig.pianoN ?? 0) + 1;
    p.pitch = -0.4; const g = pianoGrips(p, k, tl, [0.12, 0.3]); fig.pianoHeld = { side, i, holds: g.holds, up: gripLine(p, k, g.at, fig) }; p.look = tl[0].clone();
    return p;
  }
  if (job === 'piano') {
    // the cabin-top lines at its after end: kneeling on the sole at the forward end of the cockpit, facing forward, both
    // fists on the tail of the line they're working where it hangs over the top's after edge and down the cabin's face
    // (the owner, 18 Nov 2026: "still holding an invisible line": the hands were aimed at the far side's cleats, beyond
    // the arm's reach, and stopped short in the air a hand's width from every tail)
    const { side, i } = pianoFor(fig.pianoLine, s), tl = pianoTail(side, i), zk = COCK0 + 0.55, px = s * Math.min(ax, benchEdge(zk) - 0.14);
    const p = kneel(px, zk, 0, [tl[1].clone(), tl[2].clone()], k);
    fig.pianoN = (fig.pianoN ?? 0) + 1;
    // (both fists on the tail, the upper where it comes over the top's after edge, the lower a little down: the line pulled
    // off the cabin's face to them, boatMesh.ts drawing it there (Crew.pianoHold). Where it's out of an arm's reach, an
    // outer tail from the far side of the sole, the hand goes as far toward it as the arm does and the line comes to it, up
    // to its length; beyond that the hand braces on the top's after edge instead: the owner's "in simplest case, they can
    // just hold on to the rail")
    const g = pianoGrips(p, k, tl, [0.42, 0.75]);
    p.pitch = -0.25; fig.pianoHeld = { side, i, holds: g.holds, up: gripLine(p, k, g.at, fig) }; p.look = tl[0].clone();
    return p;
  }
  let p: PoseT;
  if (onDeckHere) p = onDeck(s, zc, lean, k);
  else if (ax >= 0.3) p = onSeat(s, x, zc, k);
  else p = onSole(x, zc, k);
  if (job === 'winch') {
    // cranking the jib sheet in on the winch at the coaming's forward end (on the leeward side), one hand on the handle
    // (the handle in its socket under the side deck's edge: short pulls, the hand on the grip, the handle drawn there with
    // it, boatMesh.ts by Crew.winch; the other hand tailing the sheet off the drum)
    // (the winch on the side they're on: to leeward in light air, to windward in a breeze, the jib cross-sheeted there so
    // the trimmer can sit out to it (crewWork.ts stationFor's winch))
    const ws = (Math.abs(x) > 0.3 ? Math.sign(x) : windward > 0 ? -1 : 1) as 1 | -1;
    // (sat on the bench beside it, just forward of the handle's end, reaching out under the side deck: from up on the
    // deck the handle under it is out of reach, about 0.7 m from the shoulder)
    p = onSeat(ws, ws * Math.max(ax, 0.45), Math.min(Math.max(zc, JIB_WINCH_Z), BENCH_TOP_AFT), k);
    const turn = SHORT_PULL.swing * Math.sin(2 * Math.PI * SHORT_PULL.hz * poseClock + idx);
    cranked = { side: ws, turn, fig };
    // (turned toward it, half round from sitting facing in, so the reaching shoulder comes to it)
    { const g0 = winchGrip(ws, 0), dx = g0.x - p.hip.x, dz = g0.z - p.hip.z, face = Math.atan2(-dx, -dz), d = Math.atan2(Math.sin(face - p.yaw), Math.cos(face - p.yaw)), q = WINCH_TURN * d;
      // (the feet come round with the hips, about them: not left where they were for facing in, the shins in the bench)
      p.yaw += q; const c = Math.cos(q), sn = Math.sin(q);
      for (const ft of p.feet) { const fx = ft.x - p.hip.x, fz = ft.z - p.hip.z; ft.x = p.hip.x + fx * c + fz * sn; ft.z = p.hip.z - fx * sn + fz * c; onGround(ft); } }
    // (the hand on the winch's side cranks, the other tails the sheet)
    // (the hand round the grip's lower half: the forearm under the deck's edge, not up against its underside)
    const g = winchGrip(ws, turn).add(V(0, -0.03, 0)), rr = right(p.yaw);
    g.x = ws * Math.min(Math.abs(g.x), benchOut(uAtZ(g.z)) - 0.02); // (the hand round the grip, inside the lining at the stroke's outboard end)
    // (sat facing in, the after arm cranks: its shoulder about level with the handle's end, the elbow down inside the
    // coaming, the forearm out under the deck's edge. The forward one, nearer in a straight line, would reach through the
    // winch's pedestal. The other hand tails the sheet off the drum, inboard of it)
    const near = rr.z > 0 ? 1 : 0;
    const tail = V(ws * (chz(JIB_WINCH_Z) - 0.1), deckY(uAtZ(JIB_WINCH_Z), chz(JIB_WINCH_Z)) + coamH(JIB_WINCH_Z) + 0.02, JIB_WINCH_Z - 0.05);
    p.hands = near ? [tail, g] : [g, tail]; cranked.hand = near;
    // (the cranking elbow down and a little out, below the deck's edge, the forearm level in under it to the grip: not
    // back past the handle's end)
    // (and the tailing elbow down by their side, inboard of the coaming beside them, not out over it)
    { const e = V((near ? 1 : -1) * 0.3, -1, 0.2), t = V((near ? 1 : -1) * 0.3, -1, 0.3); p.elbow = near ? [t, e] : [e, t]; }
    p.pitch = 0.05; p.look = winchGrip(ws, 0); // (sat up, back to the coaming: leant forward, the shoulder came inboard, away from the handle)
  } else if (jibTrim && lean <= 0.15) {
    // the jib trimmer: the sheet in the forward hand, led from the leeward winch (whoever trims it: the forward crew of two,
    // crewPhys.ts slotOf, not crew 1 by their place in the list)
    const w = winchAt(-windward);
    const hold = p.hip.clone().add(V(0, 0.26 * k, 0)).addScaledVector(fwd(p.yaw), 0.5 * k).lerp(w, 0.15); // (at arm's length, the elbow easy)
    // (in front of them, not reached back aft: sat at the bench's forward end turned a little aft, the sheet hand went back
    // into the next crew's place, sat at the winch, the two arms through each other)
    hold.z = Math.min(hold.z, p.hip.z + 0.05);
    p.hands[s > 0 ? 0 : 1] = hold;
  }
  return p;
}

/** The helm: on the after deck (or the after end of the side deck), facing forward and a little inboard, feet down in
 * the cockpit's after end, the extension in the inboard hand and the mainsheet's tail in the other. */
function helmPose(fig: Figure, x: number, z: number, lean: number, windward: number, tip: THREE.Vector3): PoseT {
  const k = fig.scale, s = Math.abs(x) > 0.05 ? Math.sign(x) : windward, u = uAtZ(z), e = halfBeam(u);
  // (the tiller pushed far across the other way, the extension out: hiked right out, the hand can't reach its grip even
  // slid along the deck toward it; a helm comes in off the rail to push it across. Drawn sat up as far as that needs:
  // the physics' lean is theirs, this is only the pose)
  // (the seat stays where hiking put it: only the torso comes up)
  const hx = Math.min(e - 0.04 + 0.06 * lean, Math.max(0.3, Math.abs(x) + 0.1 + 0.12 * lean));
  if ((fig.extOut ?? 0) > 0) for (let ln = lean; ln >= 0; ln -= 0.1) {
    const shl = shoulderAt({ hip: V(s * hx, deckY(u, hx) + 0.09 * k, z), yaw: s * (0.55 + 0.5 * ln), pitch: 0.05 + 1.1 * ln, roll: 0 } as PoseT, k, s > 0 ? 0 : 1);
    lean = Math.max(0, ln); if (tip.distanceTo(shl) - 0.7 <= EXT_GRIP + (BONE.upper + BONE.fore) * k * 0.85) break;
  }
  const hip = V(s * hx, deckY(u, hx) + 0.09 * k, z), yaw = s * (0.55 + 0.5 * lean), r = right(yaw);
  // (the tiller hard over away from them, to 75°: its end across the far quarter, out of reach of the extension and an
  // arm from where they sit. They slide aft and in along the after deck toward it, as a helm does, as far as they need
  // and up to 0.7 m, to the middle of the after deck at most, ESTIMATES; their feet come aft with them)
  let fz = COCK1 - 0.24;
  // (the reach is from the shoulder the hand hangs from, not the hip: sat out hiking, leant back, it's well aft and out
  // of the hip, and a hand reaching from it fell short of the grip of a stick only half the tiller's length)
  { const sh = shoulderAt({ hip, yaw, pitch: 0.05 + 1.1 * lean, roll: 0 } as PoseT, k, s > 0 ? 0 : 1);
    // (and the extension stowed, the tiller's end come round behind them, hard over their way: the hand on the tiller
    // itself, the reach the arm's alone; they shuffle toward it, no more than 0.2 m, not into the tiller's sweep)
    const stowedBehind = (fig.extOut ?? 0) < 0.02 && tip.clone().sub(hip).dot(fwd(yaw)) < 0.1;
    const farHand = stowedBehind ? Math.min(0.2, tip.distanceTo(sh) - (BONE.upper + BONE.fore) * k * 0.8) : -1;
    const far = Math.max(Math.hypot(tip.x - hip.x, tip.z - hip.z) - (EXT_LEN + 0.5 * k), tip.distanceTo(sh) - (EXT_GRIP + (BONE.upper + BONE.fore) * k * 0.75), farHand);
    if (far > 0) {
      const dx = tip.x - hip.x, dz = tip.z - hip.z, n = Math.hypot(dx, dz) || 1, go = Math.min(0.7, far);
      const nz = Math.min(L / 2 - 0.5, hip.z + go * dz / n), nu = uAtZ(nz);
      // (to the middle of the after deck at most; beside the cockpit, still on the side deck, not over the well)
      const nx = s * Math.max(nz < COCK1 + 0.05 ? chz(nz) + 0.12 : 0.08, s * (hip.x + go * dx / n));
      fz = Math.min(COCK1 - 0.12, fz + (nz - hip.z));
      hip.set(nx, Math.max(deckY(nu, Math.min(Math.abs(nx), halfBeam(nu))), ground(nx, nz)) + 0.09 * k, nz);
    } }
  const fc = chz(fz) - 0.16; // (feet on the seat inside the coaming, the shins clear of it)
  const foot = (j: number) => { const q = V(s * Math.min(fc - 0.1 * lean, Math.max(0.12, hx - (0.3 + 0.2 * lean) * k)), 0, fz).addScaledVector(r, (j ? 1 : -1) * 0.12 * k); q.x = Math.sign(q.x) * Math.min(Math.abs(q.x), chz(q.z) - 0.16); onGround(q);
    // (sitting out on the side deck, the knees over the coaming: the feet hang from them, on the footrest or just off it)
    if (hx > chz(fz) - 0.05) q.y = Math.max(q.y, deckY(uAtZ(fz), chz(fz)) + coamH(fz) + 0.04 - BONE.shin * k);
    return q; }
  // the extension (EXT_LEN, on its universal joint on the tiller's top, EXT_AFT short of its end: the owner). Stowed (extOut 0), lying back along
  // the top of the tiller, the hand on the tiller just short of its end (the owner's photo of hers); swung out, its grip in
  // the hand: out toward where a hand rests in front of them, or as far toward the tiller's end as they reach when it's
  // across the far quarter. Between, the hand carries the grip round on the joint
  const chest = hip.clone().add(V(0, 0.42 * k, 0)), rest = chest.clone().addScaledVector(fwd(yaw), 0.3 * k).add(V(0, -0.22 * k, 0));
  const along = extAlong(tip), eo = fig.extOut ?? 0;
  let out = rest.clone().sub(tip).normalize(), reaching = false;
  if (tip.clone().addScaledVector(out, EXT_LEN).distanceTo(chest) > 0.62 * k) { out = chest.clone().sub(tip).normalize(); reaching = true; } // (reaching for it)
  fig.onTiller = eo < 0.02;
  // (on the tiller, the hand just short of its end; or, its end come round by them, behind the hip, where along it the
  // hand reaches from its shoulder: a hand takes the tiller where it can, nearer the rudder head)
  const onAt = () => { const a = tip.clone().addScaledVector(along, 0.1); if (!tRoot || !fig.cur) return a;
    const sh = shoulderDrawn(fig, s > 0 ? 0 : 1), b = tRoot.clone().lerp(tip, 0.15), ab = a.clone().sub(b), t = Math.max(0, Math.min(1, sh.clone().sub(b).dot(ab) / Math.max(1e-9, ab.lengthSq())));
    const q = b.addScaledVector(ab, t); return q.distanceTo(sh) < a.distanceTo(sh) ? q.add(V(0, 0.03, 0)) : a; };
  let ext = fig.onTiller ? onAt() : tip.clone().addScaledVector(slerpDir(along, out, eo), Math.min(EXT_GRIP, eo >= 1 && reaching ? Math.max(0.2, tip.distanceTo(chest) - 0.28 * k) : EXT_GRIP));
  // (the hand on the tiller: the fist round it there, the wrist's target back by the fist's offset as drawn)
  if (fig.onTiller && fig.cur) { const iT = s > 0 ? 0 : 1; ext.sub(fistAt(fig, iT).sub(wristAt(fig, iT))); }
  if (!fig.onTiller) {
    // the grip within the arm's reach of its shoulder: swung toward the shoulder on its joint where it would be out of
    // reach (the fist fell short of a stick of its own length), then the wrist's target a fist's length back from the
    // grip, so the fist closes round the grip (the hand's target is the wrist: fistAt)
    // (the shoulder as drawn, once there is a figure drawn: leant out hiking, it's well back of where the pose's own
    // reckoning has it)
    const iE = s > 0 ? 0 : 1, sh = fig.cur ? shoulderDrawn(fig, iE) : shoulderAt({ hip, yaw, pitch: 0.05 + 1.1 * lean, roll: 0 } as PoseT, k, iE), reach = (BONE.upper + BONE.fore) * k * 0.92;
    if (ext.distanceTo(sh) > reach - FIST * k) ext = tip.clone().addScaledVector(sh.clone().sub(tip).normalize(), Math.max(0.2, Math.min(EXT_GRIP, tip.distanceTo(sh) - reach + FIST * k)));
    // (the fist's offset from the wrist as the arm is drawn, once there is one: where the elbow is decides it; before, back
    // toward the shoulder)
    if (fig.cur) ext.sub(fistAt(fig, iE).sub(wristAt(fig, iE))); else ext.addScaledVector(sh.clone().sub(ext).normalize(), FIST * k);
  }
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
  // (the knees over the cockpit, inboard and up, as they turn to face forward: turned with the body, the knee of a foot
  // still on the seat inside the coaming swung out over it, the shin through its top)
  if (Math.abs(p.hip.x) > 0.3) { p.knee = V(-Math.sign(p.hip.x) * 0.5, 0.7, -0.5); p.kneeW = 1; }
  return p;
}

/** Where a figure's shoulders are about, in a pose (the chest's middle, between them). */
const chest = (p: PoseT, k: number) => p.hip.clone().addScaledVector(fwd(p.yaw), -Math.sin(p.pitch) * BONE.shoulderY * k).add(V(0, Math.cos(p.pitch) * BONE.shoulderY * k, 0));
/** Where a pose's shoulder (0 left, 1 right) is about. */
const shoulderAt = (p: PoseT, k: number, i: number) => chest(p, k).addScaledVector(right(p.yaw), (i ? 1 : -1) * BONE.shoulderX * k);
/**
 * The hand on `to`'s side of the body: the arm whose shoulder is nearer it. (The hand that happened to be nearer reached
 * across the chest, through the torso: the owner's "his right arm seems to extend through his torso to grab the
 * traveler line".)
 */
const sideHand = (p: PoseT, k: number, to: THREE.Vector3) => shoulderAt(p, k, 0).distanceToSquared(to) <= shoulderAt(p, k, 1).distanceToSquared(to) ? 0 : 1;
/** The hand of a pose on `to`'s side, moved there, or as far toward it as an arm reaches from the chest; none if it's behind them. */
/**
 * Where a crew at the piano takes a tail (`tl`, on side `side`): at `t` along it (upper, lower) where the arm reaches; out of
 * reach, as far toward it as the arm goes, the line pulled to the hand if that's within its length of where it comes over
 * the edge; else braced on the top's after edge toward it (holds false).
 */
function pianoGrips(p: PoseT, k: number, tl: THREE.Vector3[], t: [number, number]): { at: [THREE.Vector3, THREE.Vector3]; holds: [boolean, boolean] } {
  const REACH = (BONE.upper + BONE.fore + 0.03) * k, at: [THREE.Vector3, THREE.Vector3] = [along(tl, t[0]), along(tl, t[1])], holds: [boolean, boolean] = [true, true], rest = [false, false];
  for (const j of [0, 1] as const) {
    const sh = [shoulderAt(p, k, 0), shoulderAt(p, k, 1)].sort((a, b) => a.distanceTo(at[j]) - b.distanceTo(at[j]))[0], d = sh.distanceTo(at[j]);
    if (d <= REACH) continue;
    const q = sh.clone().add(at[j].clone().sub(sh).setLength(REACH));
    if (q.distanceTo(tl[1]) <= PIANO_PULL) { at[j] = q; continue; }
    // (none of it in reach: that hand rests on its own thigh, the other on the line, as the owner allows a hand with no
    // line: "on a knee")
    holds[j] = false; at[j] = V(0, 0, 0); rest[j] = true;
  }
  if (!holds[0] && holds[1]) { const s0 = at[0]; at[0] = at[1]; at[1] = s0; holds[0] = true; holds[1] = false; rest[0] = false; rest[1] = true; } // (the one holding takes the upper place)
  // (the resting hand on the top of the thigh on its side, most of the way to the knee: kneel's knee is 0.33 m ahead of the hips)
  const thigh = (side: number) => p.hip.clone().addScaledVector(right(p.yaw), side * BONE.hipX * k).addScaledVector(fwd(p.yaw), 0.22 * k).add(V(0, -0.1 * k, 0));
  if (rest[0]) { at[0] = thigh(-1); at[1] = thigh(1); } // (neither in reach: both on the thighs)
  else if (rest[1]) { const sh0 = shoulderAt(p, k, 0), sh1 = shoulderAt(p, k, 1); at[1] = thigh(sh0.distanceTo(at[0]) <= sh1.distanceTo(at[0]) ? 1 : -1); }
  return { at, holds };
}
/**
 * Both fists on a line, at `g` (two points on its tail, the upper first): each hand's target is its wrist, a fist's
 * length back from the grip toward its shoulder, so the fist closes round the line itself (fistAt). The nearer hand takes
 * the upper grip.
 */
function gripLine(p: PoseT, k: number, g: [THREE.Vector3, THREE.Vector3], fig?: Figure): 0 | 1 {
  const sh = [shoulderAt(p, k, 0), shoulderAt(p, k, 1)], up = sh[0].distanceTo(g[0]) <= sh[1].distanceTo(g[0]) ? 0 : 1;
  // (once the figure's drawn, the fist's offset from the wrist as that arm is drawn, as hikeHold's: the fist then lands
  // on the grip, not a fist's length along a guessed forearm)
  const drawn = !!fig?.cur && (fig.pianoN ?? 0) > 10;
  for (const [h, q] of [[up, g[0]], [1 - up, g[1]]] as const) p.hands[h] = drawn ? q.clone().sub(fistAt(fig, h as 0 | 1).sub(wristAt(fig, h as 0 | 1))) : q.clone().addScaledVector(q.clone().sub(sh[h]).normalize(), -FIST * k);
  p.elbow = undefined;
  return up as 0 | 1;
}
function reachTo(p: PoseT, to: THREE.Vector3, k: number): void {
  const i = sideHand(p, k, to), c = chest(p, k), max = 0.55 * k;
  const d = to.clone().sub(c);
  // (only to something in front of them: the mainsheet behind someone sat facing forward, aft of the thwart, had the hand
  // go back past the shoulder, the arm bent backwards. They leave it, and only look up)
  if (d.dot(fwd(p.yaw)) < 0.15 * k) return;
  if (d.length() > max) d.setLength(max);
  p.hands[i] = c.add(d);
  if (p.elbow) p.elbow[i] = undefined;
}
/**
 * Ready for the turn coming (crewPhys.ts `ready`: the call heard, or seen coming): for a tack, a look up at the sails and
 * a hand to their sheet, the lazy jib sheet loaded on the windward winch (it's the working one once she's through) for
 * the jib hand, the mainsheet for the others; for a jibe, heads down for the boom coming over (the US Naval Academy's
 * Navy 44 tacking and gybing guides: boat/calls.ts).
 */
function ready(p: PoseT, k: number, windward: number, jibe: boolean, jibHand: boolean): void {
  if (jibe) {
    p.pitch -= 0.3; p.look = p.hip.clone().addScaledVector(fwd(p.yaw), 0.8).setY(p.hip.y - 0.4);
    return;
  }
  p.look = V(-windward * 0.3, 4.5, -1.2); // (the jib's luff and the main above, from wherever they sit)
  reachTo(p, jibHand ? winchAt(windward) : V(0, 0.95, THWART.z - 0.25), k); // (the mainsheet's tail in front of the thwart, as tacking it: tackRole 'main')
}
/**
 * Hiking, the hands on what a hiker holds (the owner, 16 Nov: "when hiking out, crew seem to be holding on to thin air.
 * IRL, when beating, forward crew would be holding the lee jib sheet, and middle crew would be holding the traveller
 * and/or mainsheet ... if only one crew, they would hold the jib sheet and the traveller"): the lee jib sheet's tail,
 * led across the cockpit from its winch to the hand (boatMesh.ts draws it there: Crew.sheetHand); the traveller's tail at
 * its cam on the windward end of the thwart. Each as far as an arm reaches from the chest, or not at all. Returns where
 * the sheet's in the hand, if it is.
 */
/**
 * A hand's grip beside a hiker: the toerail just outboard and forward of the hip, the arm down the side to it (fully
 * hiked, the hand hangs about there: the hiking rail's inboard edge, forward of the thigh, was a reach forward and down
 * that brought the elbow forward). boatMesh.ts: the toerail 3 cm in from the sheer, 3.5 cm high.
 */
const railGrip = (p: PoseT, k: number, s: number, dir: number) => { const z = p.hip.z + dir * 0.2 * k, u = uAtZ(z); return V(s * (halfBeam(u) - 0.03), sheer(u) + 0.035, z); };
/** Where the hook's reach is measured from: low on the thwart's windward end, by the cam (only a hiker within an arm's
 * reach of it, not at full stretch, tucks the aft foot under the thwart; hikeHold). */
const HOOK_REACH = (s: number) => V(s * (TRAV_END + 0.12), THWART.top - 0.12, THWART.z - THWART.half - 0.02);
function hikeHold(p: PoseT, k: number, s: number, jib: boolean, trav: boolean, off?: THREE.Vector3[]): { sheet?: THREE.Vector3; sheet2?: THREE.Vector3; trav?: THREE.Vector3 } {
  const c = chest(p, k), reach = 0.58 * k;
  // (the sheet from the leeward winch across to them: the hand on it out toward the winch, an arm's length)
  // (the fist out toward the lee winch, and up above the knees: the sheet runs straight across the cockpit from the lee
  // coaming to it, clear of the hikers' legs. The wrist's aimed short of the fist by the hand's own length)
  const lw = winchAt(-s), sf = c.clone().add(lw.clone().add(V(0, 0.15, 0)).sub(c).setLength(reach * 0.8)); sf.y = Math.max(sf.y, p.hip.y + 0.34 * k);
  // (the wrist aimed beyond the fist, straight on from the line coming into it: the forearm in line with the pull, the
  // line into the fist's front, never along the forearm)
  const aim = (f: THREE.Vector3, from: THREE.Vector3) => f.clone().addScaledVector(f.clone().sub(from).normalize(), FIST * k);
  let sheet = jib ? aim(sf, sheetEdge(lw, -s)) : null;
  // (the traveller's tail hanging from its cam on the thwart's windward end, just below it)
  // (the traveller's tail from its cam on the thwart's windward end up to the hand, as the sheet's: boatMesh.ts leads it
  // there, Crew.travHand. Fully hiked out the cam itself is beyond an arm's reach, and the tail's what they hold)
  // (the fist down beside the hip, on its after side, aft of the after thigh, on the side deck: the tail comes off the cam
  // to it there, as it falls, clear of the legs. Held in front of the chest it ran up through the thigh and along the
  // forearm, ending short of the hand, the owner's "not gripping the line". The wrist's aimed short of the fist by the
  // hand's own length, along the arm from the shoulder)
  const fist = V(p.hip.x - s * 0.03 * k, p.hip.y + 0.01 * k, p.hip.z + 0.22 * k);
  const tv = trav ? aim(fist, travOuter(s)) : null;
  const near = (q: THREE.Vector3) => sideHand(p, k, q); // (each line in the hand on its own side of the body)
  // (the middle hand, at the traveller beside the thwart: the aft leg tucked under the thwart for a purchase, the foot in
  // under it near its end (the owner: "often tucking their aft leg under the thwart for stability"))
  // (only within an arm's reach of the cam, a hiker not right out at full stretch: fully out, the aft leg's beside the
  // thwart, over the coaming, and there's no room for the shin under it without another hiking pose)
  if (tv && HOOK_REACH(s).distanceTo(c) <= reach + 0.25 && Math.abs(p.hip.z - THWART.z) < 0.45 && p.hip.z < THWART.z) {
    const j = p.feet[0].z >= p.feet[1].z ? 0 : 1, x = s * (cockpitHalf(uAtZ(THWART.z)) - 0.16);
    p.feet[j] = V(x, Math.max(ground(x, THWART.z, 0) + 0.08, thwartBottom(x) - 0.2), THWART.z - THWART.half + 0.04); p.hook = j; // (low, so the shin from the knee over the coaming passes well under the beam's forward edge)
  }
  // (and the other hand holds on too, never in the air (the owner: "They can hold on to the rail, they can hold on with
  // both hands to the line they're holding"): the jib sheet's hand has both on it, the second further along toward the
  // winch; the traveller's, whose tail the other hand can't reach, holds the hiking rail beside them, forward of the
  // forward thigh, at its inboard edge. Alone, both hands are on the lines)
  let sheet2: THREE.Vector3 | undefined;
  // (the rail, if it's in the arm's reach: not yet, still on the way out across the cockpit to the rail, the hand left where
  // the pose has it rather than stretched a metre to it)
  // (and only once they're there, sat out where the pose has them: `off`, from the arm as drawn, given only then)
  const rail = (i: number) => { const g = railGrip(p, k, s, -1); if (off && g.distanceTo(shoulderAt(p, k, i)) - FIST * k <= 0.55 * k) p.hands[i] = fromShoulder(g, i); };
  // (a hand's grip, its fist where it's put: the wrist back from it by the fist's offset from the wrist as that arm was
  // drawn last frame, or at first along the arm from the shoulder)
  const fromShoulder = (g: THREE.Vector3, i: number) => off?.[i] ? g.clone().sub(off[i]) : g.clone().addScaledVector(g.clone().sub(shoulderAt(p, k, i)).normalize(), -FIST * k);
  if (sheet && tv) { const i = near(tv); p.hands[i] = tv; p.hands[1 - i] = sheet; } // (alone: the traveller's on the side it's on, aft; the sheet in the other)
  else if (sheet) { const i = near(sheet), ed = sheetEdge(lw, -s), dir = ed.clone().sub(sf).normalize(), sh = shoulderAt(p, k, 1 - i);
    // (the second hand on the sheet beside the first, where it's nearest that shoulder along it, 8 cm on at least; out of
    // the arm's reach, fully hiked, it holds the rail instead)
    const t = Math.max(0.08 * k, sh.clone().sub(sf).dot(dir)), f2 = sf.clone().addScaledVector(dir, t);
    if (off && f2.distanceTo(sh) - FIST * k <= 0.55 * k) { sheet2 = p.hands[1 - i] = fromShoulder(f2, 1 - i); if (off?.[i]) sheet = sf.clone().sub(off[i]); } // (both fists on the line, where they're put)
    else rail(1 - i);
    p.hands[i] = sheet; }
  else if (tv) { const i = near(tv); p.hands[i] = tv; rail(1 - i); }
  else return {};
  p.elbow = undefined;
  return { sheet: sheet ?? undefined, sheet2, trav: tv ?? undefined };
}

/**
 * Struck by the boom in a crash jibe (crewPhys.ts `outUntil`): slumped forward where they sit, the head in a hand,
 * looking down.
 */
function struck(p: PoseT, k: number, head: THREE.Vector3 | null): void {
  const hiking = p.pitch > 0.4; // (leant right back out over the rail: the torso's down is forward)
  p.pitch -= 0.45;
  // (the hand to the brow where the head's drawn, just ahead of it: from the pose's own lean, a hiker's hand went up over
  // their head, the drawn torso less leant back than the pose's pitch)
  const brow = (head ?? chest(p, k).add(V(0, 0.2 * k, 0))).clone().addScaledVector(fwd(p.yaw), 0.12 * k).add(V(0, -0.02 * k, 0));
  const i = 1; // (the right hand)
  p.hands[i] = brow.addScaledVector(right(p.yaw), 0.02 * k);
  // (the forehead in the hand, the elbow down toward the knee: not out to the side, the hand coming up across the chest.
  // Hiking, leant back over the rail, the elbow out to the side instead: "down" in their leant-back frame was forward)
  p.elbow = [p.elbow?.[0], hiking ? V(1, 0.3, 0.8) : V(0.25, -1, -0.15)];
  p.look = p.hip.clone().addScaledVector(fwd(p.yaw), 0.5).setY(p.hip.y - 0.5);
}

// ———————————————————————————— inverse kinematics ————————————————————————————

/** How fast a knee or an elbow swings round to point a new way (rad/s), and this frame's time step. */
const BEND_RATE = 8; let ikDt = 1 / 30, ikFrame = 0;
/** How fast an elbow goes round the shoulder at most (m/s): a quick reach, not a flick. */
const ELBOW_SPEED = 3;
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
  // (an elbow goes at most ELBOW_SPEED about the shoulder: with the hand in close by it, folded on the mainsheet, a few
  // centimeters of the hand and the shoulder rising as they come up off the rail turned the arm's plane half a radian a
  // frame, the elbow whipping round at 6 m/s as a tack ended. Held, the forearm points at the hand from where the elbow
  // has got to, and catches up in a frame or two)
  if (back < 0) {
    const ud = limb.root.userData;
    if (ud.uf !== ikFrame) { ud.uf = ikFrame; ud.u0 = ud.u1 ? (ud.u0 ?? new THREE.Vector3()).copy(ud.u1) : undefined; }
    const u0 = ud.u0 as THREE.Vector3 | undefined, max = ELBOW_SPEED * ikDt / l1;
    if (u0) { const ang = Math.acos(Math.max(-1, Math.min(1, u0.dot(u1))));
      if (ang > max) { const ax = _y.crossVectors(u0, u1); if (ax.lengthSq() > 1e-10) { ax.normalize(); u1.copy(u0).applyAxisAngle(ax, max); } } }
    (ud.u1 ??= new THREE.Vector3()).copy(u1);
  }
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

const _kn = V(0, 0, 0), _kn2 = V(0, 0, 0), _p2 = V(0, 0, 0), _p = V(0, 0, 0), _h = V(0, 0, 0), _inv = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _e = new THREE.Euler();
/** Put a figure in a pose: the hips placed and turned, the torso leaned, each limb reaching its foot or hand. */
const _ax = V(0, 0, 0), _qc = new THREE.Quaternion();
/** Put a figure in a pose (`upright` rad: how far the torso leans against the boat's heel, to stay over the hips as she
 * heels: a sitter keeps their body nearly upright, a hiker braced on the rail less so). */
function apply(f: Figure, p: PoseT, upright = 0, dt = 1 / 30): void {
  ikDt = dt > 0 && dt < 0.5 ? dt : 10; ikFrame++; // (no swing to ease on a first frame)
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
  // (the elbows down and back, the one way an elbow bends; and where that puts one into what's beside them, the thwart
  // behind a crewmate sat just forward of it, out to the side instead, at once. Pointed "away from the thwart" whichever
  // way they faced, at the cabin top's lines it pointed forward, toward the hands, and both arms were bent backwards:
  // the owner, "these arms are backwards. poor guy")
  f.arm.forEach((a, i) => {
    const tgt = local(p.hands[i], _p).applyQuaternion(_tq).clone();
    // (a pose that says which way an elbow goes has it go that way, not the way the last one bent it)
    if (p.elbow?.[i]) a.root.userData.bend = a.root.userData.u1 = undefined; // (nor held to ELBOW_SPEED from it)
    ik(a, a.root.position, tgt, BONE.upper, BONE.fore, p.elbow?.[i] ?? V((i ? 1 : -1) * 0.5, -0.3, 1), -1);
    const par = f.root.parent; if (!par) return;
    f.root.updateMatrixWorld(true);
    const sd = i ? 1 : -1, hints = [V(sd * 0.9, -0.2, 0.7), V(sd * 1, 0, 0.3)];
    const bad = () => {
      f.root.updateMatrixWorld(true);
      const el = par.worldToLocal(a.mid.getWorldPosition(_h));
      if (!underDeck(el.x, el.y, el.z) && el.y < ground(el.x, el.z) + 0.04 && Math.abs(el.x) < halfBeam(uAtZ(el.z))) return true; // (in under the side deck is open: the winch)
      // (nor an elbow stuck out forward of the line from shoulder to wrist, the way an elbow doesn't bend: a hand drawn in
      // close to the shoulder, turned aft to the mainsheet in a tack, folded the arm up with the elbow out in front)
      const sh = a.root.getWorldPosition(_s), wr = a.mid.localToWorld(_u.set(0, -BONE.fore, 0)), w = a.mid.getWorldPosition(_t);
      const line = wr.sub(sh), tt = w.clone().sub(sh).dot(line) / Math.max(1e-9, line.lengthSq()), off = w.sub(sh).addScaledVector(line, -tt);
      const fw = f.root.localToWorld(_kn2.set(0, 0, -1)).sub(f.root.getWorldPosition(_p2)).setY(0), ahead = off.dot(fw) / Math.max(1e-9, fw.length());
      return ahead > 0.05 && -off.y < ahead;
    };
    for (let h = 0; h < hints.length && bad(); h++) { a.root.userData.bend = undefined; ik(a, a.root.position, tgt, BONE.upper, BONE.fore, hints[h], -1); }
  });
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
  // (shuffling along a side deck sat on it, the legs in over the coaming: the seat lifted a little on the way, as anyone's
  // is, not slid along at the same height into the coaming's top where it rises forward; after a tack in 18 kt, to the
  // cabin-top lines from the deck aft, the thigh went 5 cm into it)
  if (!rising && Math.abs(want.hip.z - c.hip.z) > 0.05 && Math.sign(c.hip.x) === Math.sign(want.hip.x) && Math.abs(c.hip.x) > chz(c.hip.z) + COAMING_T && Math.abs(want.hip.x) > chz(want.hip.z) + COAMING_T)
    aim.y = Math.max(aim.y, want.hip.y + 0.14 * f.scale * Math.min(1, Math.abs(want.hip.z - c.hip.z) / 0.15));
  // (walking: at the feet's pace. While one foot swings, the hips go no further than a stride from the one planted, as
  // anyone's do; free to run on, they went 1.3 m past it, the next step 1.6 m long, the leg stretched back through the
  // cabin's side)
  if (want.step && f.swing) for (let i = 0; i < 2; i++) {
    if (!f.swing[1 - i] || f.swing[i]) continue;
    const pf = c.feet[i], dx = aim.x - pf.x, dz = aim.z - pf.z, d = Math.hypot(dx, dz), reach = (0.32 - 0.06 * rough) * f.scale; // (a short crouched step, about a quarter metre either side of the hips; shorter in a seaway)
    if (d > reach) { aim.x = pf.x + dx * reach / d; aim.z = pf.z + dz * reach / d; }
  }
  const y0 = c.hip.y;
  // (the spring, held to a person's pace: no faster than HIP.speed along the deck and HIP.up up or down, setting off and
  // pulling up at no more than HIP.acc. On the spring alone, the pose jumping to a new place took the hips 1 m in a
  // quarter of a second, at up to 5 m/s, setting off at up to 136 m/s²)
  { const vx = v.x, vy = v.y, vz = v.z;
    v.addScaledVector(_s.copy(aim).sub(c.hip), W * W * dt).multiplyScalar(Math.max(0, 1 - 2 * W * dt));
    const ax = v.x - vx, az = v.z - vz, ah = Math.hypot(ax, az), lim = HIP.acc * dt;
    if (ah > lim) { v.x = vx + ax * lim / ah; v.z = vz + az * lim / ah; }
    v.y = vy + Math.max(-HIP.upAcc * dt, Math.min(HIP.upAcc * dt, v.y - vy));
    const sh = Math.hypot(v.x, v.z); if (sh > HIP.speed) { v.x *= HIP.speed / sh; v.z *= HIP.speed / sh; }
    v.y = Math.max(-HIP.up, Math.min(HIP.up, v.y)); }
  c.hip.addScaledVector(v, dt);
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
    // (only when the one way round is clearly out over the water: facing straight inboard, both ways pass fore or aft, and
    // the test's sign flipped each frame, so they turned a step one way and a step back for ever, the knees with them, 70
    // rad a minute, sat on the cabin top's edge)
    // (out on the deck only, outboard of the coaming: kneeling in the cockpit at the cabin top's lines, half a metre off its
    // middle, a turn to walk forward went the long way round, 320 degrees)
    if (Math.abs(d) > 2.6 && Math.abs(c.hip.x) > chz(c.hip.z) - 0.05 && Math.sin(c.yaw + d / 2) * sx < -0.3) d -= Math.sign(d) * 2 * Math.PI;
    // (a turn given its way round, back from facing aft at the mainsheet after a tack (syncCrew): on that way until it's
    // nearly done)
    if (f.turnDir != null) { if (Math.abs(d) < 0.6) f.turnDir = undefined; else if (Math.sign(d) !== f.turnDir) d += f.turnDir * 2 * Math.PI; }
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
      // (going in under the side deck to the winch's grip: down inside the cockpit first, to the grip's height, then out
      // under the deck's edge to it, not down through the deck)
      const gw = want.hands[i], inTo = !passes && underDeck(gw.x, gw.y, gw.z) && !underDeck(hd.x, hd.y, hd.z) && Math.abs(hd.y - gw.y) > 0.03;
      if (inTo) _w.set(Math.sign(gw.x) * (chz(gw.z) - 0.08), gw.y, gw.z);
      // (and coming out from under it, the other way round: in to the cockpit's edge below the deck first, then up. Rising
      // where it was, it came up past the deck's underside and was put on top of the deck in a frame, 0.27 m: a hand at
      // the winch's grip off forward to the cabin top's lines)
      const wasUnder = underDeck(hx, hy, hz), outOf = !passes && !inTo && wasUnder && !underDeck(gw.x, gw.y, gw.z);
      if (outOf) _w.set(Math.sign(hx) * (chz(hz) - 0.08), Math.min(hy, gw.y), hz);
      toward(hd, passes || inTo || outOf ? _w : gw, a, LIMB_SPEED * dt);
      // (coming to a step up, the bench's edge or the coaming, it stops and rises to it at a hand's pace: never snapped up onto it)
      if (handFloor(hd.x, hd.y, hd.z) + 0.02 > hy + LIMB_SPEED * dt) { hd.x = hx; hd.z = hz; hd.y = Math.max(hy, handFloor(hx, hy, hz) + 0.02) + LIMB_SPEED * dt; }
      // (rising early to clear an edge it's coming to, at a hand's pace; never inside what's under it)
      // (only over something on its way that's higher than both ends, the coaming between the deck and the cockpit: not
      // whatever's merely near it, which held a hand up beside the coaming on its way down to a locker lid)
      let clear = 0;
      // (not going in under the side deck: that's below the coaming, not over it)
      if (far && !inTo) { let top = 0; for (let q = 1; q < 5; q++) { _u.copy(hd).lerp(want.hands[i], q / 5); top = Math.max(top, ground(_u.x, _u.z)); }
        if (top > Math.max(ground(hd.x, hd.z), ground(want.hands[i].x, want.hands[i].z)) + 0.03) clear = top + 0.04; }
      // (the rise from where it was this frame, at a hand's pace in all: not that on top of the move toward its place)
      hd.y = Math.max(hd.y, Math.min(clear, hy + LIMB_SPEED * dt), handFloor(hd.x, hd.y, hd.z) + 0.02);
      // (still in under the side deck: below its underside, never up through it)
      if (wasUnder && underDeck(hd.x, SEAT_Y + 0.01, hd.z)) hd.y = Math.min(hd.y, deckY(uAtZ(hd.z), Math.abs(hd.x)) - 0.031); }
    const foot = c.feet[i], sw = f.swing![i];
    if (want.step || sw) {
      // walking or crawling (and a step under way is finished, whatever comes next): each foot stays planted until it's left behind, then swings (lifted) to a new place
      // ahead, one foot at a time, about a quarter of a second a step: no foot slides on the deck
      if (sw) {
        // (a step over something high takes longer: the foot goes up and over it, not just along)
        // (and a high step's lift at a foot's pace: over 1.3 s a metre of it at least. The sole to the side deck, 0.9 m up,
        // in a quarter of a second, the foot left the sole at 13 m/s)
        const over = 0.07; // (over the top of what it passes, itself 6 cm over what's there: sw.top)
        const pk = Math.max(sw.top, sw.from.y, sw.to.y) + over - (sw.from.y + sw.to.y) / 2;
        sw.t = Math.min(1, sw.t + dt / Math.max(0.22, (sw.from.distanceTo(sw.to) + 0.6 * Math.max(0, sw.top - Math.min(sw.from.y, sw.to.y))) / 1.4 / (1 - (sw.hold ?? 0)) * (1 + 0.6 * rough), 1.3 * pk)); // (slower in a seaway, each foot put down with care; and longer by the share spent lifting first: the way along at the same pace, not squeezed into the rest)
        // (along: eased out and in; with something high right where it starts, the coaming beside a foot on the bench, up
        // first and then along, not along into it and popped up onto it in a frame)
        const h0 = sw.hold ?? 0, th = Math.max(0, (sw.t - h0) / (1 - h0)), e = th * th * (3 - 2 * th), wasY = foot.y;
        foot.copy(sw.from).lerp(sw.to, e);
        // (lifted clear of whatever it passes over, highest mid-step)
        const peak = pk;
        // (lifted a little early, so what it steps over near either end, the thwart, a seat's edge, is cleared on the way)
        foot.y += Math.max(0, peak) * Math.sin(Math.PI * sw.t) ** 0.6;
        // (but up no faster than a foot's quick lift, twice its pace: that early rise is steepest at the very start, and a
        // short step's first frame threw the foot up 12 cm, at 7 m/s)
        foot.y = Math.min(foot.y, wasY + 2 * LIMB_SPEED * dt);
        // (never down inside what's under it; but brought up out of it at a foot's pace if it was in it, not in a frame: a
        // foot left inside the thwart's edge went up 0.67 m at once)
        foot.y = Math.max(foot.y, Math.min(ground(foot.x, foot.z) + 0.06, wasY + 1.5 * LIMB_SPEED * dt));
        // (coming down off something it stepped over: at a foot's pace, not dropped in a frame; the step's done when it's down)
        foot.y = Math.max(foot.y, wasY - LIMB_SPEED * dt); // (at twice it, a step down off the cabin top came down at 4.4 m/s)
        if (sw.t >= 1 && foot.y <= sw.to.y + 0.01) f.swing![i] = null;
      } else if (want.step && foot.distanceTo(want.feet[i]) > 0.16 * f.scale && (!f.swing![1 - i] || (want.deck && inCockpit(Math.abs(foot.x), foot.z)))) {
        // (one at a time; but setting off along the side deck, a foot still down in the cockpit comes up out of it at once)
        const ahead = want.feet[i].clone().addScaledVector(_s.copy(want.feet[i]).sub(foot).setY(0).normalize(), 0.08 * f.scale);
        // (a stride, not a leap: at most 0.35 m ahead of the hips along the boat. Put down where the pose is headed, 0.7 m on,
        // each step was 1.2 to 2 m long and took up to 1.5 s, the other foot planted far behind all the while, the leg
        // stretched back through the cabin's side)
        const reach = 0.3 * f.scale, dzh = ahead.z - c.hip.z; if (Math.abs(dzh) > reach) ahead.z = c.hip.z + Math.sign(dzh) * reach;
        // (and never past the deck's edge: carried on the way it was going, out across the side deck, a foot was put down
        // 2 cm outboard of it, hung over the topsides)
        { const e = halfBeam(uAtZ(ahead.z)) - 0.06; if (Math.abs(ahead.x) > e) ahead.x = Math.sign(ahead.x) * e; }
        // (and where it's meant to go is out on the side deck beside the cockpit, it stays out there: carried 8 cm on
        // the way it was going, partly inboard, onto the coaming's line, onGround put it back down on the bench)
        { const wf = want.feet[i], wo = chz(wf.z) + COAMING_T; if (wf.z > COCK0 - 0.05 && wf.z < COCK1 && Math.abs(wf.x) >= wo && ahead.z > COCK0 - 0.05 && ahead.z < COCK1) { const ao = chz(ahead.z) + 0.13; if (Math.abs(ahead.x) < ao) ahead.x = Math.sign(wf.x) * ao; } } // (onGround's margin: 12 cm from its inner face)
        const to = want.deck ? ahead.setX(want.feet[i].x).setY(ground(want.feet[i].x, ahead.z) + 0.06) : onGround(ahead); let top = Math.max(foot.y, to.y); // (on the side deck, as far out as it's meant to be)
        // (every 1.2 cm, finer than the coaming's 2.5 cm width: at twelve looks a long step out of the cockpit passed between
        // two of them and the shin went through its top; and what's within the first third of the way)
        let near = 0; const nq = Math.max(12, Math.ceil(foot.distanceTo(to) / 0.012)); for (let q = 1; q < nq; q++) { _t.copy(foot).lerp(to, q / nq); const g = ground(_t.x, _t.z) + 0.06; top = Math.max(top, g); if (q <= nq / 3) near = Math.max(near, g); }
        f.swing![i] = { from: foot.clone(), to, t: 0, top, hold: near > foot.y + 0.03 ? 0.25 : 0 };
      }
    } else if (!rising && !f.going && !f.swing![1 - i] && Math.abs(want.feet[i].y - foot.y) < 0.15 && foot.distanceTo(want.feet[i]) > 0.5 * f.scale && !outOfReach(c.hip, want.feet[i], f.scale)) {
      // (a foot left well behind, half a metre and more from its place (out on the far bench after a crossing, its owner
      // already sat on the cabin top's edge), is picked up and put down there, not slid across the cockpit at 2 m/s. Along
      // the level only, once they've arrived, and to a place the hips can reach: a leap across the cockpit to where they
      // weren't yet, or lifted in an arc to a kneeling place up a step, the leg went into the cabin's after end)
      const to = want.feet[i].clone(); let top = Math.max(foot.y, to.y), near = 0;
      const nq = Math.max(12, Math.ceil(foot.distanceTo(to) / 0.012)); for (let q = 1; q < nq; q++) { _t.copy(foot).lerp(to, q / nq); const g = ground(_t.x, _t.z) + 0.06; top = Math.max(top, g); if (q <= nq / 3) near = Math.max(near, g); }
      f.swing![i] = { from: foot.clone(), to, t: 0, top, hold: near > foot.y + 0.03 ? 0.25 : 0 };
    } else {
      f.swing![i] = null;
      // (on its way, it clears what it passes over; once there, it rests on what's under it)
      // (clearing what's between only on a real step to a new place: a foot following a lean, a few centimetres, stays down)
      const going = foot.distanceTo(want.feet[i]) > 0.15;
      // (sat on the bow, the legs over its edge: down past it once outboard of the deck, not held up on ground()'s margin
      // beside it, which propped the feet on the stemhead)
      // (a foot hooked under the thwart, or still under it coming out: what's under it read at its own height, the thwart a
      // beam; coming out, straight forward from under it first, then where it's going)
      if (want.hook === i) f.hookFoot = i;
      const hooked = f.hookFoot === i, under = hooked && Math.abs(foot.z - THWART.z) < THWART.half + 0.03;
      if (hooked && want.hook !== i && !under) f.hookFoot = undefined;
      const gr = want.hang ? (gx: number, gz: number) => Math.abs(gx) < halfBeam(uAtZ(gz)) && gz > -L / 2 ? ground(gx, gz) : -1
        : hooked ? (gx: number, gz: number) => ground(gx, gz, foot.y) : ground;
      const fx = foot.x, fz = foot.z, fy = foot.y;
      // (a foot down on the sole is a little in from the bench's face, not tucked under its lip with the knee still out over
      // the bench, the shin through its edge: getting down off the bench by the winch in a tack)
      const ft = hooked && want.hook !== i && under ? _fw.set(foot.x, foot.y, THWART.z - THWART.half - 0.1) : want.hook === i ? want.feet[i] : want.feet[i].y < SEAT_Y - 0.1 ? keepOnSole(_fw.copy(want.feet[i])) : want.feet[i];
      toward(foot, ft, a, LIMB_SPEED * dt * (rising ? 0.3 : 1));
      // (coming to a step up, the bench's edge or the coaming: it stops and lifts to it at a foot's pace, never snapped up)
      if (gr(foot.x, foot.z) + 0.06 > fy + LIMB_SPEED * dt) { foot.x = fx; foot.z = fz; foot.y = Math.max(fy, gr(fx, fz) + 0.06) + LIMB_SPEED * dt; }
      // (rising to clear what's near it as it goes, at a foot's pace; never below what's under it)
      let clear = 0;
      if (going) {
        // (only over something on the way that's higher than both ends: the coaming, a seat's edge between the sole and the deck)
        let top = 0; for (let q = 1; q < 5; q++) { _u.copy(foot).lerp(want.feet[i], q / 5); top = Math.max(top, gr(_u.x, _u.z)); }
        if (top > Math.max(gr(foot.x, foot.z), gr(want.feet[i].x, want.feet[i].z)) + 0.03) clear = top + 0.06;
      }
      foot.y = Math.max(foot.y, gr(foot.x, foot.z) + 0.06, Math.min(clear, fy + LIMB_SPEED * dt)); // (from where it was this frame, as a hand's)
      // (while the hips are still out on the side deck, the knees are over the coaming: the feet hang from them, not
      // down on the bench, which would drag the thighs through it)
      // (raised to it at a foot's pace: set there, the feet jumped 0.28 m off the sole in a frame as the hips came to the deck's edge)
      if (c.hip.z > COCK0 && c.hip.z < COCK1 && Math.abs(c.hip.x) > chz(c.hip.z) - 0.05) foot.y = Math.max(foot.y, Math.min(deckY(uAtZ(c.hip.z), chz(c.hip.z)) + coamH(c.hip.z) + 0.04 - BONE.shin * f.scale, foot.y + LIMB_SPEED * dt));
    }
  }
  // (the hips stay a shin's length or so above the feet: someone stepping up onto the deck rises with the step, they
  // don't fold up under it)
  // (only on the move: seated, the feet may well be level with the hips, as when sitting on the deck with them on the seat)
  // (walking along the side deck, from where the feet are on average, so a foot lifted mid-step doesn't hoist the hips:
  // the weight stays low)
  const lowest = want.deck ? (c.feet[0].y + c.feet[1].y) / 2 + 0.26 * f.scale : Math.max(c.feet[0].y, c.feet[1].y) + 0.32 * f.scale;
  // (rising with the step, at a person's pace: 1.5 m/s in all from where they were this frame, not that on top of the
  // spring's rise and the push off the seat, which came to 3.7 m/s getting up from the winch)
  if (want.step && c.hip.y < lowest) { c.hip.y = Math.min(lowest, Math.max(c.hip.y, y0 + 1.5 * dt)); if (v.y < 0) v.y = 0; }
  c.look.lerp(want.look, a);
  // (the knees turn to where the pose points them over a tenth of a second, and back to forward the same way; but at
  // once as a foot steps down inside the coaming, so that knee drops in with it rather than dragging across the top;
  // and slowly, a third of a second, sitting down on the side deck with the hips held up clear of the coaming; and
  // turning to the new way over a fifth when both feet are out on the deck already, as she sets off along it turning to
  // face along it (the knee swung out at more than 5 m/s); stepping up out of the cockpit, over the coaming, as before)
  const kw = c.kneeW ?? (c.knee ? 1 : 0), tk = want.kneeSlow ? 0.3 : !want.knee && c.feet.some(p => Math.abs(p.x) < chz(p.z) + 0.03) ? 1e-3 : want.knee && c.feet.every(p => Math.abs(p.x) > chz(p.z)) ? 0.2 : 0.1;
  c.kneeW = kw + Math.max(-dt / tk, Math.min(dt / tk, (want.knee ? 1 : 0) - kw));
  if (want.knee) c.knee = want.knee.clone(); else if (c.kneeW <= 0) c.knee = undefined;
  c.elbow = want.elbow; // (the way an elbow's to go, as the pose has it now: not as it was when they were first drawn)
  return c;
}
const _fw = V(0, 0, 0);
const _s = V(0, 0, 0), _t = V(0, 0, 0), _u = V(0, 0, 0), _sh = V(0, 0, 0), _v = V(0, 0, 0), _w = V(0, 0, 0);
/** How fast a hand or a foot moves to its new place at most (m/s): briskly, as a sailor's do (an estimate). */
const LIMB_SPEED = 2.2;
/**
 * The most the hips' spring is let move: at most `speed` (m/s), setting off and pulling up at `acc` (m/s²); up and
 * down, `up` and `upAcc`. A person's own pace is lower: a crew crosses the cockpit in a tack at about 1 m/s
 * (crewPhys.ts), a walk from standing reaches its pace in a step or two, about 1.5 to 2 m/s², and sit-to-stand the hips
 * rise at 0.6 to 1 m/s at most (estimates). These are as low as the poses' in-between steps allow for now: at 1.6 m/s
 * and 5 m/s² a shin or an elbow goes into the boat in a hiking tack and a two-handed tack (crewfig). Working those
 * through is what brings it down to a person's pace.
 */
const HIP = { speed: 2.0, acc: 8, up: 1.6, upAcc: 8 };
/** A foot's place further from the hips than the leg reaches, near enough (both bones nearly straight). */
const outOfReach = (hip: THREE.Vector3, foot: THREE.Vector3, k: number) => hip.distanceTo(foot) > 0.92 * (BONE.thigh + BONE.shin) * k;
/** Ease `p` toward `q` by the share `a`, but no further than `max`. */
function toward(p: THREE.Vector3, q: THREE.Vector3, a: number, max: number): void {
  const d = _s.copy(q).sub(p).multiplyScalar(a), l = d.length(); if (l > max) d.multiplyScalar(max / l); p.add(d);
}

/** Where the tiller's end is in the boat's frame, from the rudder (boatMesh.ts: the group turned to steer). */
// (the tiller's end and its pin, in the tiller's own frame: it's turned with the rudder and lifted on its pin, boatMesh.ts)
const TILLER_TIP = tillerRestDir().multiplyScalar(TILLER.len), TILLER_PIN = V(0, 0, 0);
/** The extension's universal joint: on the tiller's top, 18 cm short of its end (the owner: 6–8 in), ESTIMATE. */
const EXT_AFT = 0.18, TILLER_JOINT = (() => { const d = tillerRestDir(), r = RUDDER_RAKE, up = V(0, Math.cos(r), -Math.sin(r)); // (the boat's up, in the rudder's frame)
  up.addScaledVector(d, -up.dot(d)).normalize(); return d.clone().multiplyScalar(TILLER.len - EXT_AFT).addScaledVector(up, 0.03); })();
const onTiller = (turn: THREE.Object3D, local: THREE.Vector3) => {
  const rud = turn.parent!, til = turn.children[1]; til.updateMatrix(); turn.updateMatrix(); rud.updateMatrix();
  return local.clone().applyMatrix4(til.matrix).applyMatrix4(turn.matrix).applyMatrix4(rud.matrix);
};
/** Where the tiller's pin (its root, on the rudder head) is in the boat's frame. */
export const tillerRootAt = (turn: THREE.Object3D) => onTiller(turn, TILLER_PIN);
/** Where the tiller's end is in the boat's frame, from the rudder (boatMesh.ts: the group turned to steer). */
export const tillerTip = (turn: THREE.Object3D) => onTiller(turn, TILLER_TIP);
/** Where the extension's joint is in the boat's frame: the helm's hold on the tiller, whichever way they steer. */
export const tillerJointAt = (turn: THREE.Object3D) => onTiller(turn, TILLER_JOINT);

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
/** The tail of a cabin-top line in this figure's hands, as drawn (Crew.pianoHold): both fists on it, or the one that has
 * it with the end hanging below. */
function holdPiano(cr: Crew, f: Figure): void {
  const ph = f.pianoHeld; if (!ph || !ph.holds[0] || (f.pianoN ?? 0) < 6) return;
  const up = fistAt(f, ph.up), lo = ph.holds[1] ? fistAt(f, (1 - ph.up) as 0 | 1) : up.clone().add(V(0, -0.12, 0));
  cr.pianoHold = { side: ph.side, i: ph.i, fists: [up, lo] };
}
export function syncCrew(cr: Crew, windward: number, c: CrewState | undefined, dt: number, hideHelm: boolean, tip?: THREE.Vector3, heelDeg = 0, tacking = false, pitch?: number, paddle?: PaddleDraw | null, jibe = false): void {
  // (how she's moving in the sea, from her pitch as drawn, rad: its rate's mean square over about four seconds)
  if (pitch != null && dt > 0 && dt < 0.5) { if (cr.seaP != null) { const r = (pitch - cr.seaP) / dt; cr.seaMs = (cr.seaMs ?? 0) + (r * r - (cr.seaMs ?? 0)) * (1 - Math.exp(-dt / 4)); } cr.seaP = pitch; }
  rough = Math.max(0, Math.min(1, (Math.sqrt(cr.seaMs ?? 0) - 0.012) / 0.04));
  tRoot = cr.tillerRoot;
  cr.pianoHold = undefined; // (set again below by whoever has a cabin-top line in hand this frame)
  // (sitting, people hold their bodies near upright as she heels; hiking or kneeling at a job, braced, less)
  const heel = heelDeg * Math.PI / 180, against = (pose: string) => -heel * (pose === 'sit' || pose === 'lee' || pose === 'helm' ? 0.55 : pose === 'cross' ? 0.3 : 0.2);
  const ppl = c?.people;
  // (the time the race moved since the last frame, for their walking: track)
  const clk = c?.clock, sdt = clk == null || cr.clock == null || clk < cr.clock ? dt : clk - cr.clock; cr.clock = clk;
  poseClock = clk ?? poseClock + dt; cranked = undefined;
  // (paddling: since when, by the race's clock as the drawing first sees it; and once stopped, the crutch carried back
  // below for 2.5 s)
  if (paddle && (!cr.pd || cr.pd.key !== paddle.key || cr.pd.end != null)) cr.pd = { key: paddle.key, t0: poseClock };
  else if (!paddle && cr.pd && cr.pd.end == null) cr.pd.end = poseClock;
  if (cr.pd?.end != null && poseClock - cr.pd.end > 2.5) cr.pd = undefined;
  if (cr.pd && paddle) cr.pdWho = paddle.who;
  const pf = cr.pd && cr.pdWho != null ? (cr.pdWho === 0 ? cr.helm : cr.crew[cr.pdWho - 1]) : undefined; // (alone, the helm: boat/paddle.ts paddler)
  pdl = cr.pd && pf ? { f: pf, e: poseClock - cr.pd.t0, fetch: paddle?.fetch ?? 0, sd: paddle?.side === 'S' ? 1 : paddle?.side === 'P' ? -1 : 0, back: !!paddle?.back, stop: cr.pd.end } : undefined;
  // (two of them on the same side don't sit in each other's laps: at least a shoulder's width apart fore and aft)
  // (out on a side deck, not forward of the winch there; in the middle, on the benches, on forward)
  const ZMAX = DECK_AFT, inC = (z: number) => z > COCK0 - 0.1 && z < COCK1;
  const zs = cr.crew.map((_, i) => { const a = ppl?.[i + 1], z = a?.z ?? 1.3 + 0.6 * i, lo = Math.abs(a?.x ?? 1) > DECK_ARM ? DECK_FWD : ZC_FWD; return inC(z) ? Math.min(ZMAX, Math.max(lo, z)) : z; });
  for (let i = 1; i < zs.length; i++) for (let j = 0; j < i; j++) {
    const a = ppl?.[i + 1], o = ppl?.[j + 1];
    const seated = (q: typeof a) => !!q && (q.pose === 'sit' || q.pose === 'lee' || q.pose === 'hike' || q.pose === 'cross');
    if (seated(a) && seated(o) && (Math.sign(o!.x) === Math.sign(a!.x) || a!.pose === 'cross' || o!.pose === 'cross') && inC(zs[i]) && inC(zs[j]) && Math.abs(zs[i] - zs[j]) < SEP) {
      // (both forward of the thwart, they stay forward of it: the pair moved forward along the bench rather than the aft
      // one pushed back into the thwart's line, where the side deck's seat is beyond it, and they set off round it)
      const fore = Math.min(zs[i], zs[j]), fwdOf = Math.max(zs[i], zs[j]) < THW_A;
      const lo = fwdOf && fore + SEP > THW_A - 0.05 ? Math.max(ZC_FWD, THW_A - 0.05 - SEP) : Math.min(fore, ZMAX - SEP);
      // (in their order along the cockpit, front to back, as the physics keeps them (crewPhys.ts stationZ): not by where
      // each is this moment. One still crossing can be a little forward of the other for a second, and the one sat
      // forward was put aft past the thwart, then left there when the other moved on)
      // (by their stations' order, crewPhys.ts slotOf, not their place in the list: the main trimmer, crew 1, sits aft of
      // the jib hand now, and put forward by their number the two swapped places across the winch)
      const n = cr.crew.length, [front, back] = slotOf(i, n) <= slotOf(j, n) ? [i, j] : [j, i]; zs[front] = lo; zs[back] = lo + SEP;
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
    // (at their own stations well apart fore and aft, the winch's and forward of it (crewPhys.ts Z), neither kneels: each
    // sits on the bench's edge at their own place. One knelt on the sole's spot, its shins back toward the thwart, and the
    // one sat at the winch had their feet in among them)
    const zs2 = mids.map(i => ppl![i + 1].z), apart = Math.max(...zs2) - Math.min(...zs2) >= 0.4;
    for (const i of apart ? mids : mids.slice(1)) onBench[i] = true;
  }
  // (and once sat on the bench's edge, they stay there while they're in the middle: not down onto the sole to kneel and
  // back up each time the other's weight drifts out of the middle and back, the knees kicking 46 rad a minute on a 6 kt
  // broad reach)
  cr.crew.forEach((f, i) => { if (inMid[i] && f.benchSide != null) onBench[i] = true; });
  const tackOn = !!c && (tacking || !!c.roll);
  const fore = cr.crew.reduce((best, _, i) => (ppl?.[i + 1]?.z ?? 9) < (ppl?.[best + 1]?.z ?? 9) ? i : best, 0);
  let sheetHand: THREE.Vector3 | undefined, sheetHand2: THREE.Vector3 | undefined, travHand: THREE.Vector3 | undefined;
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
      // (clearly on one side by the physics, that side; about the middle, where the pose seats them by the wind, the side
      // they're sat on: kept from before they came to the middle, it was the other side from the deck they sat on, and
      // a step outboard sent them round by both side decks to the seat they were already beside)
      if (Math.abs(x) > AFT_MID) f.aftSide = Math.sign(x);
      else if (f.aftSide == null || Math.abs(x) <= 0.05) f.aftSide = Math.sign(f.cur?.hip.x ?? 0) || Math.sign(x) || windward;
      x = aftSide(f, x, a.z);
    } else f.aftSide = undefined;
    f.goalSide = a?.goal && Math.abs(a.goal.x) > 0.3 ? Math.sign(a.goal.x) : undefined;
    const dir = track(f, x, a?.z ?? z, sdt);
    // (on the move from 0.22 m/s, settled again under 0.1: no flicker between walking and sitting)
    const go = f.going = travelling(f, a, x);
    // (in the tack while it's under way, and until they're across; a job elsewhere, the mast or the car, comes first)
    const busy = pose === 'mast' || pose === 'car' || pose === 'piano' || pose === 'bow' || pose === 'fore';
    // (but only once the physics brings them in off the rail: a roll tack holds them out on the old high side as she comes
    // up and through the wind (crewPhys.ts roll), and drawn down in the cockpit from its start, they were 0.9 m from where
    // their weight was, and were carried there at 3.7 m/s as it began; then back out to the new rail)
    const inboard = !a || Math.abs(a.x) < benchEdge(a.z) || pose === 'cross';
    const wasTack = !!f.tack;
    f.tack = !busy && ((tackOn && (inboard || !!f.tack)) || (!!f.tack && go));
    // (back from facing aft at the mainsheet, round through facing inboard, away from the bench they're going to: round the
    // other way, the knee of a foot planted on the sole swung out over the bench, the shin through its edge)
    // (the side they're going to, the physics' own: at the role's end they can be just across the middle from it)
    if (wasTack && !f.tack && f.cur && Math.cos(f.cur.yaw) < -0.3) f.turnDir = -Math.sign(x) || -Math.sign(f.cur.hip.x) || 1;
    const role = f.tack ? (i === fore ? 'jib' : 'main') : null;
    f.pianoLine = a?.job?.line; if (pose !== 'piano') f.pianoN = 0;
    let want = crewPose(f, x, z, lean, pose, windward, go && !role, f.speed > 0.05 ? dir : (pose === 'cross' ? -Math.sign(x) * Math.PI / 2 : 0), i, role, a?.goal?.z ?? z, cr.crew.length < 2 || i === fore);
    // (struck by the boom, out of it a while; or ready for the turn coming: sat or hiking where they are, not on the way
    // anywhere, and not at a job)
    if (a && !role && !busy && !go && pdl?.f !== f) {
      if (a.outUntil > (c?.clock ?? 0))
        struck(want, f.scale, f.root.parent && f.cur ? f.root.parent.worldToLocal(f.head.localToWorld(_hd.set(0, 0.1, 0))) : null); // (the head's middle, above its pivot at the neck)
      else if (a.ready) ready(want, f.scale, windward, jibe, cr.crew.length < 2 || i === fore);
    }
    // (hiking, hands on the lines: the forward hand (or a lone one) the lee jib sheet, the middle hand (or a lone one too)
    // the traveller)
    if (a && !role && !busy && !go && pose === 'hike' && lean > 0.3 && !a.ready && !(((a as { outUntil?: number }).outUntil ?? 0) > (c?.clock ?? 0))) {
      const lone = cr.crew.length < 2, jibH = lone || i === fore, h = hikeHold(want, f.scale, Math.sign(x) || windward, jibH, lone || !jibH, f.cur && f.cur.hip.distanceTo(want.hip) < 0.1 ? [0, 1].map(j => fistAt(f, j as 0 | 1).sub(wristAt(f, j as 0 | 1))) : undefined);
      if (h.sheet) sheetHand = h.sheet; if (h.sheet2) sheetHand2 = h.sheet2; if (h.trav) travHand = h.trav;
    }
    if (pdl?.f === f) want = paddleWant(f, want, pdl, x, a?.z ?? z, go, windward, i);
    // (on the way along the side deck, and settling into the new place after it)
    f.walking = !!want.step; // (on their feet going somewhere, a step at a time)
    const routed = route(f, want, dt, f.scale);
    if (routed) f.walked = true; else if (f.walked && f.cur && f.cur.hip.distanceTo(want.hip) < 0.03) f.walked = false;
    apply(f, ease(f, routed ?? want, dt), upright(f, against(pose), dt), dt);
    if (pose === 'piano' && !routed) holdPiano(cr, f);
    f.root.visible = true;
  });
  // (the lee jib sheet's tail to the hiker's hand on it, where it's drawn this frame: eased there as the hand is)
  const drawnHand = (q?: THREE.Vector3) => q && cr.crew.find(f => f.cur && f.cur.hands.some(h => h.distanceTo(q) < 0.25))?.cur?.hands.reduce((a, h) => h.distanceTo(q) < a.distanceTo(q) ? h : a);
  // (the traveller's tail into the middle of the fist that holds it, as that arm's drawn: not the wrist)
  { const q = drawnHand(travHand), f = q && cr.crew.find(g => g.cur!.hands.includes(q)); cr.travHand = f ? fistAt(f, f.cur!.hands[0] === q ? 0 : 1) : undefined; }
  { const q = drawnHand(sheetHand), f = q && cr.crew.find(g => g.cur!.hands.includes(q)), i = f && f.cur!.hands[0] === q ? 0 : 1; cr.sheetHand = f ? fistAt(f, i) : undefined;
    // (and the second hand on it, when it's there: near where it was put on the sheet, the other hand of the same figure)
    // (through it only once it's there, on the sheet: within 3 cm of the sheet's straight run from the lee coaming to the
    // first hand. On its way to it, the hand isn't holding it yet)
    const f2 = f && sheetHand2 && f.cur!.hands[1 - i].distanceTo(sheetHand2) < 0.25 ? fistAt(f, (1 - i) as 0 | 1) : undefined;
    cr.sheetHand2 = f2 && cr.sheetHand && onRun(f2, sheetEdge(winchAt(-Math.sign(cr.sheetHand.x)), -Math.sign(cr.sheetHand.x)), cr.sheetHand) < 0.03 * f!.scale ? f2 : undefined; }
  // (boatMesh.ts turns the handle with the hand: where the hand has got to, a step behind the stroke it's making, so the
  // grip's in it, not a few centimetres ahead)
  const ck = cranked as Cranked | undefined; // (set while posing them, above)
  if (ck?.fig?.cur && ck.hand != null) { const h = ck.fig.cur.hands[ck.hand], p0 = winchGrip(ck.side, 0), pv = p0.clone().setZ(p0.z - WH.len);
    const t = Math.atan2(h.x - pv.x, h.z - pv.z); if (Math.abs(t) < 1.2) ck.turn = t; }
  cr.winch = ck ? { side: ck.side, turn: ck.turn } : undefined;
  // the helm
  const hp = ppl?.[0], h = cr.helm, x = hp ? hp.x : windward * 0.55, z = hp?.z ?? 2.95;
  cr.helmSide = Math.abs(x) > 0.05 ? Math.sign(x) : windward;
  // single-handed, gone forward to the cabin-top lines, or paddling: off the tiller (the pilot or the lashing has her)
  const paddling = pdl?.f === h, away = hp?.pose === 'piano' || paddling;
  const dir = track(h, x, z, sdt);
  const t = tip ?? V(0, 0.8, 2.6);
  { const ang = cr.tillerRoot ? Math.atan2(Math.abs(t.x - cr.tillerRoot.x), Math.max(1e-3, cr.tillerRoot.z - t.z)) * 180 / Math.PI : 0;
    // (but the tiller's end come round close by them, hard over their way, they take the tiller itself)
    const close = !!h.cur && t.distanceTo(h.cur.hip) < EXT_CLOSE;
    // (and out whenever the tiller's end is beyond the hand's reach from its shoulder: the tiller pushed across toward
    // the far side short of EXT_TILLER, its end out of reach, the hand reached for it in the air)
    const iE = cr.helmSide > 0 ? 0 : 1, beyond = !!h.cur && t.distanceTo(shoulderDrawn(h, iE)) > (BONE.upper + BONE.fore) * h.scale * 0.95;
    // (but not swung out at the body: the tiller's end come round behind them, the stick would run through them; the hand
    // takes the tiller where it reaches it, helmPose)
    const behind = !!h.cur && _t.copy(t).sub(h.cur.hip).dot(fwd(h.cur.yaw)) < 0.1;
    // (hard over their way, hiked out or not, the tiller's end is right by them: they hold the tiller itself)
    const want = !!h.going || (!behind && ((hp?.lean ?? 0) > EXT_HIKE || (ang > EXT_TILLER && !close) || beyond));
    h.stowT = want ? 0 : (h.stowT ?? EXT_STOW) + dt; // (how long it's been wanted stowed, s)
    const goOut = want || (h.stowT < EXT_STOW && (h.extOut ?? 0) > 0);
    h.extOut = Math.max(0, Math.min(1, (h.extOut ?? 0) + (goOut ? 1 : -1) * dt / EXT_SWING)); }
  h.pianoLine = hp?.job?.line; if (!away) h.pianoN = 0;
  let want = paddling ? crewPose(h, x, z, 0, hp?.pose ?? 'car', windward, (h.going = travelling(h, hp, x)) && h.speed > 0.18, dir, 9)
    : away ? crewPose(h, x, z, hp?.lean ?? 0, 'piano', windward, h.speed > 0.18, dir, 9)
    : (h.going = travelling(h, hp, x)) ? helmCrossing(h, x, z, dir, t) : helmPose(h, x, z, hp?.lean ?? 0, windward, t);
  // (alone, the helm paddles: below for the crutch, out to the side deck with it, and over the side, as a crew member does)
  if (paddling) want = paddleWant(h, want, pdl!, x, z, !!h.going, windward, 9);
  apply(h, ease(h, want, dt), upright(h, against(hp?.pose ?? 'helm'), dt), dt);
  if (away && !paddling && !h.going) holdPiano(cr, h);
  h.root.visible = !hideHelm;
  // the extension, from the tiller's end to the helm's hand (and a little past it), unless they've let go
  // (a straight stick of its own length from its joint on the tiller's end, swung to the hand: to the middle of the fist
  // round its grip, not the wrist beside it; or, the hand on the tiller, folded back along it. Let go, it lies along the
  // tiller too)
  const hi = cr.helmSide > 0 ? 0 : 1, hand = fistAt(h, hi), ex = cr.extension, held = !away && !hideHelm;
  ex.visible = !hideHelm; cr.ujoint.visible = !hideHelm; cr.ujoint.position.copy(t);
  // (the mainsheet's tail in the other hand, sat at the helm: boatMesh.ts leads it from the car's block to the fist)
  cr.mainHand = held && !h.going && !paddling ? fistAt(h, hi ? 0 : 1) : undefined;
  { const d = !held || h.onTiller ? extAlong(t) : hand.clone().sub(t).normalize();
    ex.position.copy(t); ex.quaternion.setFromUnitVectors(V(0, 1, 0), d); }
  // the crutch, in the paddler's hands from when it comes up out of the companionway: along the line from the lower hand
  // to the upper, its foot below the lower (over the side and in the water, paddling)
  const cf = pdl?.f, cu = cr.crutch;
  cu.visible = !!cf && (pdl!.stop != null || pdl!.e > 0.47 * pdl!.fetch);
  if (cu.visible && cf?.cur) {
    const [h0, h1] = cf.cur.hands, lo = h0.y < h1.y ? h0 : h1, hi = lo === h0 ? h1 : h0;
    const d = _t.copy(hi).sub(lo); if (d.lengthSq() < 1e-6) d.set(0, 1, 0); d.normalize();
    const paddling = pdl!.stop == null && pdl!.e >= pdl!.fetch && Math.abs(lo.x) > 0.9;
    cu.position.copy(lo).addScaledVector(d, paddling ? -0.85 : -0.45);
    // (the foot's flat faces fore and aft, square to the stroke)
    const zAx = _s.set(0, 0, 1).addScaledVector(d, -d.z); if (zAx.lengthSq() < 1e-6) zAx.set(1, 0, 0); zAx.normalize();
    const xAx = _u.copy(d).cross(zAx);
    cu.quaternion.setFromRotationMatrix(_m4.makeBasis(xAx, d, zAx));
  }
}
const _m4 = new THREE.Matrix4(), _hd = V(0, 0, 0);

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
