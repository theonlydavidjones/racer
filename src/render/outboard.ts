import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { aftLineZ, sheer } from './hull';
import { IDLE, OUTBOARDS, type OutboardHp } from '../boat/motor';

/**
 * Her outboard on its transom bracket, drawn from the motor's state (boat/motor.ts MotorState: tilted up or down, running,
 * in gear, the throttle, the 2.5 swiveled round to go astern).
 *
 * The motors are Tohatsu's small four-strokes, the MFS2.5/3.5 (one family: the same powerhead and leg) and the MFS6, all
 * long-shaft, as a Folkboat needs, her transom's top standing about 0.54 m out of the water (an owner's measurement on the
 * YBW forum, "Spartan outboard bracket on Folkboat"). The 2.5/3.5's sizes are Tohatsu's, from the MFS2.5C/3.5C owner's
 * manual as summarized (manuals.plus, "Tohatsu MFS2.5C portable outboard motor manual"; and toprik.com's MFS3.5S
 * listing): 715 mm long overall (tiller to the cowl's back), 363 mm wide, 1,159 mm high in the long shaft, and its
 * transom height (the clamp's top to the plate) 562 mm. The 6's sizes aren't published where we could reach them: its
 * shaft the nominal 20 in, the rest scaled up from the 3.5 (an estimate). The props are boat/motor.ts's (7.4 in and 7.8
 * in across, three blades). The rest of the shape (the cowl's height against its length, the leg's section, the
 * gearcase, the skeg, where the gear lever sits) is in the proportions of these motors, measured off their pictures: an
 * estimate, to within a few centimetres.
 *
 * The bracket is a stainless lifting one, the kind seen a lot on Folkboats (same thread): a hardwood board that slides on
 * two rails, raised when sailing (the motor tilted up on it, clear of the water) and let down about 0.26 m to motor, so the
 * plate goes 0.1–0.15 m under, deep enough not to suck air in a chop. Folkboats hang the rudder on the transom, so it's
 * on the port quarter, clear of the rudder, the tiller and the ensign staff. Its rails stand vertical, held off the raked
 * transom by a short arm at the top and a long one below (the travel, and the standoff, are estimates).
 *
 * Frames: the boat's (bow toward −z, starboard +x, y up). The motor's own frame has its origin on the clamp's top, the
 * board's aft face at z = 0, y up and +z aft (the prop aft, the tiller forward), so that tilting it up is a turn about x.
 */

/** The motor's sizes (m), by family: the 2.5 and 3.5 share theirs. */
interface Dims { cowlW: number; cowlL: number; cowlH: number; legC: number; legT: number; caseL: number; caseD: number; plateW: number; plateL: number; propD: number; skeg: number; tiller: number; shaft: number }
// (the 2.5/3.5: 0.715 m overall from the tiller's end to the cowl's back, 0.363 wide over the cowl and its lever, 1.159 high
// from the cowl's top to the skeg, the shaft (transom height) 0.562: Tohatsu's, above; the rest estimates)
const SMALL: Dims = { cowlW: 0.33, cowlL: 0.42, cowlH: 0.355, legC: 0.12, legT: 0.048, caseL: 0.25, caseD: 0.075, plateW: 0.22, plateL: 0.17, propD: 7.4 * 0.0254, skeg: 0.09, tiller: 0.3, shaft: 0.562 };
const SIX: Dims = { cowlW: 0.36, cowlL: 0.48, cowlH: 0.41, legC: 0.14, legT: 0.056, caseL: 0.29, caseD: 0.088, plateW: 0.26, plateL: 0.2, propD: 7.8 * 0.0254, skeg: 0.11, tiller: 0.34, shaft: 0.508 };
/** Where the steering (swivel) axis stands, aft of the board, and the tilt tube's place (just aft of the clamp, a little down). */
const SWIVEL_Z = 0.09, TILT = new THREE.Vector3(0, -0.035, 0.045);
/** Full tilt (rad): the motor's own tilt stop, about 75° on these small motors (an estimate). */
export const TILT_UP = 75 * Math.PI / 180;
/** The bracket: the board's top raised and lowered (m above the waterline), and the mount's place on the port quarter. */
export const BOARD_UP = 0.63, BOARD_DOWN = 0.37;
/** The lower arm's foot: the transom's no wider than the mount's offset below about 0.17 m (its half-width 0.62 m at 0.25). */
const TRANSOM_LOW = 0.25;
const MOUNT_X = -0.42, BOARD_W = 0.3, BOARD_H = 0.24, BOARD_T = 0.032;

const GREY = new THREE.MeshPhongMaterial({ color: 0x8e949b, specular: 0x777777, shininess: 60 }); // Tohatsu's gray cowl and leg
const DARK = new THREE.MeshPhongMaterial({ color: 0x2b2e32, specular: 0x333333, shininess: 30 }); // the tiller grip, the lower cowl's seal, the cord's handle
const PROP = new THREE.MeshPhongMaterial({ color: 0x5d6268, specular: 0x999999, shininess: 70, side: THREE.DoubleSide }); // its aluminum prop
const STEEL = new THREE.MeshPhongMaterial({ color: 0xc9cdd1, specular: 0xffffff, shininess: 90 }); // the bracket's stainless
const BOARD = new THREE.MeshPhongMaterial({ color: 0x6e4a2c, specular: 0x222222, shininess: 20 }); // its hardwood board

/**
 * A skin through closed rings of equal length (each a loop of points), capped at both ends: the cowl, the leg, the
 * plate. Rings go in order along the body; their points go round the same way.
 */
function loft(rings: THREE.Vector3[][], caps = true): THREE.BufferGeometry {
  const n = rings[0].length, pos: number[] = [], idx: number[] = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  if (caps) for (const [k, flip] of [[0, true], [rings.length - 1, false]] as const) {
    const ctr = rings[k].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(n), ci = pos.length / 3;
    pos.push(ctr.x, ctr.y, ctr.z);
    for (let j = 0; j < n; j++) { const a = k * n + j, b = k * n + (j + 1) % n; if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
}
/** A superellipse loop in the horizontal plane at height y: half-widths a (x) and b (z), squareness e (2 an ellipse, 4 a rounded box). */
function ring(cx: number, y: number, cz: number, a: number, b: number, e: number, n = 28): THREE.Vector3[] {
  const r: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) {
    const t = 2 * Math.PI * k / n, c = Math.cos(t), s = Math.sin(t);
    r.push(new THREE.Vector3(cx + a * Math.sign(c) * Math.abs(c) ** (2 / e), y, cz + b * Math.sign(s) * Math.abs(s) ** (2 / e)));
  }
  return r;
}
/** A streamlined (teardrop) section at height y: chord c along z, its nose forward (−z) at z0, thickness t. */
function foil(y: number, z0: number, c: number, t: number, n = 24): THREE.Vector3[] {
  const r: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) {
    const th = 2 * Math.PI * k / n, x = (1 - Math.cos(th)) / 2; // 0 nose … 1 tail and back
    const half = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4); // (a NACA 00xx section)
    r.push(new THREE.Vector3((k < n / 2 ? 1 : -1) * half, y, z0 + c * x));
  }
  return r;
}

/** A group's own meshes (not its child groups) merged into one mesh for each material, where they stand in it. */
function mergeByMaterial(g: THREE.Group): void {
  const by = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of g.children) { const m = c as THREE.Mesh; if (m.isMesh) (by.get(m.material as THREE.Material) ?? by.set(m.material as THREE.Material, []).get(m.material as THREE.Material)!).push(m); }
  for (const [mat, ms] of by) {
    if (ms.length < 2) continue;
    const geos = ms.map(m => { m.updateMatrix(); const q = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const a of Object.keys(q.attributes)) if (a !== 'position' && a !== 'normal') q.deleteAttribute(a); return q; });
    const one = new THREE.Mesh(mergeGeometries(geos)!, mat);
    for (const m of ms) { g.remove(m); m.geometry.dispose(); } geos.forEach(q => q.dispose()); g.add(one);
  }
}

/** The parts that move: drawn by syncOutboard. */
export interface OutboardMesh {
  group: THREE.Group;
  /** the bracket's board and everything on it (slides up and down its rails) */
  board: THREE.Group;
  /** the motor, turned about its tilt tube (x) */
  tilt: THREE.Group;
  /** the motor, turned about its steering axis (y): 0 ahead, π swiveled round to go astern */
  swivel: THREE.Group;
  /** the prop, turning about its shaft (z) */
  prop: THREE.Group;
  /** its wash on the water astern of the prop (when running in gear) */
  wash: THREE.Mesh;
  hp: number;
  /** where things are now: the board's top (m), the tilt (rad), the swivel (rad), the prop's turn (rad) */
  at: { board: number; tilt: number; swivel: number; spin: number };
}

/** The outboard (2.5, 3.5 or 6 hp) and its lifting bracket, on her port quarter. */
export function buildOutboard(hp: number): OutboardMesh {
  const D = hp >= 5 ? SIX : SMALL, group = new THREE.Group(); group.name = 'outboard';
  // the bracket's fixed part: two vertical rails, held off the raked transom by a short arm at the top and a long one low down
  const zRail = sheer(1) > 0 ? aftLineZ(BOARD_UP) + 0.06 : 0, yLo = BOARD_DOWN - BOARD_H - 0.02, yHi = BOARD_UP + 0.03;
  const steel: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const x = MOUNT_X + sx * (BOARD_W / 2 + 0.012);
    steel.push(new THREE.CylinderGeometry(0.011, 0.011, yHi - yLo, 10).translate(x, (yHi + yLo) / 2, zRail));
    for (const y of [yHi - 0.03, TRANSOM_LOW]) { // the arms back to the transom (where it's wide enough there), and their feet
      const z1 = aftLineZ(y) + 0.005, len = zRail - z1;
      steel.push(new THREE.CylinderGeometry(0.009, 0.009, len, 8).rotateX(Math.PI / 2).translate(x, y, (zRail + z1) / 2));
      steel.push(new THREE.BoxGeometry(0.05, 0.07, 0.006).rotateX(-Math.atan2(aftLineZ(1) - aftLineZ(0), 1)).translate(x, y, z1));
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(steel), STEEL));
  // the board, sliding on the rails: the motor's clamped to its top
  const board = new THREE.Group(); board.position.set(MOUNT_X, BOARD_UP, zRail); group.add(board);
  board.add(new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_T).translate(0, -BOARD_H / 2, 0), BOARD));
  const slides: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const y of [-0.03, -BOARD_H + 0.03]) slides.push(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10).translate(sx * (BOARD_W / 2 + 0.012), y, 0));
  board.add(new THREE.Mesh(mergeGeometries(slides), STEEL));
  // the clamp bracket over the board's top: its aft plate, its top, and the two clamp screws' handles inside the board
  const motorAt = BOARD_T / 2; // (the motor's frame: the board's aft face)
  const clamp = [
    new THREE.BoxGeometry(0.17, 0.15, 0.03).translate(0, -0.06, motorAt + 0.015),
    new THREE.BoxGeometry(0.17, 0.02, BOARD_T + 0.05).translate(0, 0.01, 0.005),
    ...[-0.05, 0.05].flatMap(x => [new THREE.BoxGeometry(0.04, 0.06, 0.012).translate(x, -0.03, -motorAt - 0.006), new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6).rotateZ(Math.PI / 2).translate(x, -0.06, -motorAt - 0.03)])
  ];
  board.add(new THREE.Mesh(mergeGeometries(clamp), GREY));
  const tilt = new THREE.Group(); tilt.position.set(0, TILT.y, motorAt + TILT.z); board.add(tilt);
  const swivel = new THREE.Group(); swivel.position.set(0, -TILT.y, SWIVEL_Z - TILT.z); tilt.add(swivel); // (on the steering axis)
  // the swivel case round the steering axis
  swivel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14).translate(0, -0.07, 0), GREY));
  // the powerhead's cowl: rounded, a little longer aft than forward of the leg, narrowing to its top
  const cz = 0.03, y0 = 0.04, rings: THREE.Vector3[][] = [];
  for (const [f, k, e] of [[0, 0.92, 3], [0.08, 0.98, 3.2], [0.35, 1, 3.4], [0.75, 0.97, 3.2], [0.92, 0.86, 2.8], [1, 0.62, 2.4]] as const) rings.push(ring(0, y0 + f * D.cowlH, cz, D.cowlW / 2 * k, D.cowlL / 2 * k, e));
  swivel.add(new THREE.Mesh(loft(rings), GREY));
  swivel.add(new THREE.Mesh(loft([ring(0, y0 - 0.005, cz, D.cowlW / 2 * 0.93, D.cowlL / 2 * 0.93, 3), ring(0, y0 + 0.012, cz, D.cowlW / 2 * 0.94, D.cowlL / 2 * 0.94, 3)]), DARK)); // the seal between the cowls
  // the leg: a streamlined strut from under the cowl down to the plate, a touch fuller at the top
  const plateY = -D.shaft, legRings: THREE.Vector3[][] = [];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) { const y = y0 - 0.01 + (plateY - y0 + 0.01) * f, c = D.legC * (1.15 - 0.15 * f); legRings.push(foil(y, -c * 0.38, c, D.legT * (1.1 - 0.1 * f))); }
  swivel.add(new THREE.Mesh(loft(legRings), GREY));
  // the anti-ventilation plate
  const pz = D.plateL * 0.12;
  swivel.add(new THREE.Mesh(loft([ring(0, plateY - 0.004, pz, D.plateW / 2, D.plateL / 2, 3.2), ring(0, plateY + 0.004, pz, D.plateW / 2, D.plateL / 2, 3.2)]), GREY));
  // the gearcase: a torpedo under the plate, the prop on its aft end, and the skeg below
  const caseY = plateY - 0.035 - D.caseD / 2, z0 = -D.caseL * 0.42, prof: THREE.Vector2[] = [];
  for (let k = 0; k <= 14; k++) { const f = k / 14, r = D.caseD / 2 * Math.sqrt(Math.sin(Math.PI * f)) * (f < 0.6 ? 1 : 1 - 0.45 * (f - 0.6) / 0.4); prof.push(new THREE.Vector2(Math.max(0.003, r), z0 + f * D.caseL)); } // (round-nosed, tapering aft to the prop)
  swivel.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 16).rotateX(Math.PI / 2).translate(0, caseY, 0), GREY));
  swivel.add(new THREE.Mesh(loft([foil(plateY - 0.004, -D.legC * 0.38, D.legC, D.legT), foil(caseY, -D.legC * 0.4, D.legC * 1.05, D.legT * 0.9)]), GREY)); // the leg on into the case
  swivel.add(new THREE.Mesh(loft([foil(caseY, -0.02, D.caseL * 0.35, 0.02), foil(caseY - D.caseD / 2 - D.skeg, 0.0, D.caseL * 0.22, 0.012)]), GREY)); // the skeg
  // the prop: three blades and the hub, on the gearcase's aft end
  const prop = new THREE.Group(); prop.position.set(0, caseY, z0 + D.caseL + 0.012); swivel.add(prop);
  prop.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.06, 12).rotateX(Math.PI / 2), PROP));
  const R = D.propD / 2, blade: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const sh = new THREE.Shape(); sh.moveTo(0.02, -0.015); sh.bezierCurveTo(R * 0.55, -0.045, R * 1.02, -0.03, R, 0.005); sh.bezierCurveTo(R * 0.92, 0.04, R * 0.45, 0.04, 0.02, 0.018); sh.lineTo(0.02, -0.015);
    blade.push(new THREE.ShapeGeometry(sh, 6).rotateX(-0.75).rotateZ(2 * Math.PI * k / 3)); // (pitched about 43° at the root: 7 in of pitch on a 7.4–7.8 in prop)
  }
  prop.add(new THREE.Mesh(mergeGeometries(blade), PROP));
  // the tiller arm: forward from the cowl's front, a little up, its twist-grip throttle; the gear lever on the starboard side, the cord's handle on the front
  const tz = cz - D.cowlL / 2 + 0.02, ty = y0 + 0.07;
  swivel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, D.tiller * 0.7, 10).rotateX(Math.PI / 2 - 0.14).translate(0, ty + D.tiller * 0.35 * Math.sin(0.14), tz - D.tiller * 0.35), GREY));
  swivel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, D.tiller * 0.3, 10).rotateX(Math.PI / 2 - 0.14).translate(0, ty + D.tiller * 0.85 * Math.sin(0.14), tz - D.tiller * 0.85), DARK));
  swivel.add(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.09).rotateX(0.5).translate(D.cowlW / 2 * 0.95, y0 + 0.04, cz - 0.05), DARK));
  swivel.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.025).translate(0, y0 + D.cowlH * 0.55, cz - D.cowlL / 2 * 0.98 - 0.008), DARK));
  // its wash: churned water astern of the prop, on the surface (drawn in the boat's frame, below)
  const wash = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(0.16, 1, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  wash.visible = false; group.add(wash);
  // (each moving part's pieces merged, one mesh a material: about eight draw calls for the whole motor and bracket)
  for (const g of [board, swivel, prop]) mergeByMaterial(g);
  return { group, board, tilt, swivel, prop, wash, hp, at: { board: BOARD_UP, tilt: TILT_UP, swivel: 0, spin: 0 } };
}

/** What syncOutboard reads of her motor (boat/motor.ts MotorState); with none, it's tilted up for sailing. */
export interface OutboardState { down: boolean; running: boolean; gear: 'F' | 'N' | 'R'; throttle: number; swivel?: boolean; pulling?: unknown }

/**
 * Move the outboard toward its state, at a person's pace (the board let down or hauled up in a second or two, the motor
 * tilted in about one, the 2.5 swung round in one), and turn the prop: in gear at its shaft's speed (the throttle's power
 * share's cube root of full, as boat/motor.ts: about 1,150 rpm at tick-over to its full rpm, through its gearbox),
 * shown as a blur once it's too fast to see. dt in seconds.
 */
export function syncOutboard(o: OutboardMesh, m: OutboardState | undefined, dt: number): void {
  const down = !!m?.down, ease = (cur: number, want: number, rate: number) => cur + Math.max(-rate * dt, Math.min(rate * dt, want - cur));
  // let down: the board first, then the motor tilted down; hauled up: tilted, then the board
  const wantTilt = down ? 0 : TILT_UP, wantBoard = down ? BOARD_DOWN : BOARD_UP;
  if (down) { o.at.board = ease(o.at.board, wantBoard, 0.2); if (o.at.board < BOARD_DOWN + 0.05) o.at.tilt = ease(o.at.tilt, wantTilt, 1.4); }
  else { o.at.tilt = ease(o.at.tilt, wantTilt, 1.4); if (o.at.tilt > TILT_UP - 0.1) o.at.board = ease(o.at.board, wantBoard, 0.2); }
  o.at.swivel = ease(o.at.swivel, m?.swivel ? Math.PI : 0, Math.PI);
  o.board.position.y = o.at.board; o.tilt.rotation.x = -o.at.tilt; o.swivel.rotation.y = o.at.swivel;
  // the prop: turning when it's running and in gear (right-handed: clockwise from astern ahead, the other way astern)
  const inGear = !!m && m.running && !m.pulling && m.gear !== 'N';
  const spec = OUTBOARDS[(o.hp as OutboardHp)] ?? OUTBOARDS[3.5];
  const power = inGear ? IDLE + (1 - IDLE) * Math.max(0, Math.min(1, m!.throttle)) : 0;
  const revs = inGear ? (spec.rpm / 60) * Math.cbrt(power) / spec.gear : 0; // (prop rev/s: the engine's rpm through its gearbox, boat/motor.ts)
  o.at.spin = (o.at.spin + (m?.gear === 'R' ? -1 : 1) * 2 * Math.PI * revs * dt) % (2 * Math.PI);
  o.prop.rotation.z = -o.at.spin;
  // its wash: a patch of churned water astern, brighter and longer with the throttle (only with the prop down in the water)
  const w = inGear && down && o.at.tilt < 0.1 ? 0.25 + 0.75 * power : 0, mat = o.wash.material as THREE.MeshBasicMaterial;
  mat.opacity = ease(mat.opacity, 0.3 * w, 1.5); o.wash.visible = mat.opacity > 0.01;
  const astern = (m?.gear === 'R') !== !!m?.swivel;
  o.wash.position.set(MOUNT_X, 0.02, o.board.position.z + (astern ? -1 : 1) * (0.25 + 0.35 * w)); o.wash.scale.set(1, 1, 0.5 + 0.8 * w); // (thrown forward, under her quarter, going astern)
}
