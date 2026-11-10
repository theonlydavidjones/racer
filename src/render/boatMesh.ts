import './three-setup';
import * as THREE from 'three';
import { D2R } from '../core/math';
import { FLEET, type Boat, type Tack } from '../boat/boat';
import { CAR_FORE_PINS, CAR_IN_PINS } from '../boat/controls';
import { sailPlan } from '../boat/physics';
import { P3 } from './coords';
import { CABIN, COCKPIT, HEEL, L, RUDDER_RAKE, cabinGeometry, cabinTopY, sheer, uAtZ, cockpitGeometry, cockpitHalf, cockpitSeats, deckGeometry, deckY, hullFrame, hullGeometry, rail, rudderGeometry, sheerLine } from './hull';
import { Sail, Telltale, luffTellStates, type SailDef, type SailShape, type TellState } from './sails';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Main: on the mast and boom, three battens, and a long, low rectangular window parallel to the boom
 * (about 1.8 m by 0.35 m, starting about 0.3 m above the boom), as on most Folkboat mains. */
const MAIN_LUFF = 8.25, MAIN_FOOT = 3.3;
const MAIN_DEF: SailDef = {
  tack: V3(0, 1.05, 0), head: V3(0, 9.3, 0.05), clew: V3(0, 1.05, MAIN_FOOT), depth: 0.42, rows: 16, cols: 10,
  window: { t0: 0.3 / MAIN_LUFF, t1: 0.65 / MAIN_LUFF, s0: 0.18, s1: 0.18 + 1.8 / MAIN_FOOT },
  battens: [{ t: 0.3, len: 0.75 }, { t: 0.55, len: 0.75 }, { t: 0.8, len: 0.5 }]
};
/** Jib: hanked on the forestay. */
const JIB_DEF: SailDef = { tack: V3(0, 0, 0), head: V3(0, 6.1, 2.35), clew: V3(0, 0.35, 2.9), depth: 0.36, rows: 8, cols: 6 };
const WINDOW_MAT = new THREE.MeshPhongMaterial({ color: 0xd8e8ee, transparent: true, opacity: 0.22, shininess: 90, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
const JIB_AXIS = new THREE.Vector3(0, 6.1, 2.35).normalize(); // the forestay: the jib swings around it, so its luff stays on the stay

const MAT = {
  deck: new THREE.MeshLambertMaterial({ color: 0xb98d5c, side: THREE.DoubleSide }), // laid teak / varnish
  cabin: new THREE.MeshLambertMaterial({ color: 0xece6d8 }),
  spar: new THREE.MeshLambertMaterial({ color: 0xc7a06a }), // varnished spruce
  // fiberglass boats: off-white non-skid gelcoat deck, anodised aluminium spars
  deckGrp: new THREE.MeshLambertMaterial({ color: 0xb9b5ab, side: THREE.DoubleSide }), // matte non-skid reads darker than the glossy cabin top
  sparAlu: new THREE.MeshPhongMaterial({ color: 0xaeb5bc, specular: 0x9aa0a6, shininess: 70 }),
  wire: new THREE.LineBasicMaterial({ color: 0x333333 }),
  wood: new THREE.MeshPhongMaterial({ color: 0x8a5a30, specular: 0x553322, shininess: 40 }), // varnished trim
  tiller: new THREE.MeshPhongMaterial({ color: 0xb07a44, specular: 0x664422, shininess: 50 }),
  cream: new THREE.MeshLambertMaterial({ color: 0xebe5d6, side: THREE.DoubleSide }),
  mahogany: new THREE.MeshPhongMaterial({ color: 0x6e3f22, specular: 0x442211, shininess: 45, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhongMaterial({ color: 0x1d2a33, specular: 0xaabbcc, shininess: 90 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x1a1d22 })
};

/** Rig points below were laid out for a deck 0.42 m above the water; the hull's real freeboard is about 0.18 m more. */
const RIG_LIFT = 0.18;

/** Hull, deck, cabin, cockpit, rudder and tiller, painted for this boat. The rudder group turns about its hinge. */
function buildHull(b: Boat, grp: THREE.Group): THREE.Group {
  const F = FLEET[b.id] ?? FLEET[1], glass = b.build.hull === 'fiberglass';
  const C = (h: string) => new THREE.Color(h);
  const hullMat = glass
    ? new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x777777, shininess: 75 }) // glossy gelcoat
    : new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x333333, shininess: b.hullColor === '#9a6a36' ? 60 : 25 }); // painted or varnished planking
  grp.add(new THREE.Mesh(hullGeometry({ topsides: C(b.hullColor), boot: C(F.paint.boot), bottom: C(F.paint.bottom) }), hullMat));
  // deck: non-skid on glassfibre boats, painted canvas on the wooden ones
  const deckMat = new THREE.MeshLambertMaterial({ color: F.paint.deck, side: THREE.DoubleSide });
  grp.add(new THREE.Mesh(deckGeometry(), deckMat));
  // cabin trunk: cream sides (varnished mahogany on the wooden boats), deck-coloured top
  const cab = cabinGeometry();
  grp.add(new THREE.Mesh(cab.sides, glass ? MAT.cream : MAT.mahogany));
  grp.add(new THREE.Mesh(cab.top, deckMat));
  const zc = (u: number) => -L / 2 + u * L;
  // portlights: two each side
  for (const s of [1, -1]) for (const u of [CABIN.u0 + 0.075, CABIN.u0 + 0.155]) {
    const pl = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), MAT.glass); pl.scale.set(1.9, 0.75, 1);
    pl.position.set(s * (CABIN.w - 0.027), deckY(u, CABIN.w) + CABIN.h * 0.55, zc(u)); pl.rotation.y = s * Math.PI / 2; pl.rotation.x = 0;
    pl.rotateX(-s * 0.1); grp.add(pl);
  }
  const topAft = cab.topY(CABIN.u1), zAft = zc(CABIN.u1);
  // companionway, sliding hatch and the compass on the aft end of the cabin (as on Josephine)
  const cw = new THREE.Mesh(new THREE.PlaneGeometry(0.5, CABIN.h * 0.8), MAT.dark); cw.position.set(0, topAft - CABIN.h * 0.45, zAft + 0.004); grp.add(cw);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.62), MAT.wood); hatch.position.set(0, topAft + 0.08, zAft - 0.28); grp.add(hatch);
  const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), MAT.dark); compass.rotation.x = Math.PI / 2; compass.position.set(0.42, topAft - CABIN.h * 0.5, zAft + 0.016); grp.add(compass);
  // wooden grab rails on the cabin top
  for (const s of [1, -1]) {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.2), MAT.wood);
    gr.position.set(s * (CABIN.w - 0.17), cab.topY((CABIN.u0 + CABIN.u1) / 2 + 0.03) + 0.06, zc((CABIN.u0 + CABIN.u1) / 2 + 0.03)); grp.add(gr);
  }
  // cockpit well, seats, and coamings
  cockpitGeometry().forEach((g, i) => grp.add(new THREE.Mesh(g, i === 0 ? deckMat : MAT.cream))); // non-skid sole, cream sides
  for (const g of cockpitSeats()) grp.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x8a5a30, specular: 0x553322, shininess: 40, side: THREE.DoubleSide })));
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const u = COCKPIT.u0 + (COCKPIT.u1 - COCKPIT.u0) * i / 12; pts.push(new THREE.Vector3(s * (cockpitHalf(u) + 0.01), deckY(u, cockpitHalf(u)), zc(u))); }
    grp.add(new THREE.Mesh(rail(pts, 0.13, 0.025), MAT.wood));
    // toerail along the sheer
    grp.add(new THREE.Mesh(rail(sheerLine(s, 0.03), 0.035, 0.03), MAT.wood));
  }
  // rudder and tiller, hinged on the raked sternpost/transom line
  const rud = new THREE.Group(); rud.position.set(0, HEEL.y, HEEL.z); rud.rotation.x = RUDDER_RAKE;
  const turn = new THREE.Group(); rud.add(turn);
  const rg = rudderGeometry();
  // the blade: bottom paint below the boot stripe, topsides colour above (fixed paint line in the boat's frame)
  const pos = rg.blade.attributes.position, cols: number[] = [], cr = Math.cos(RUDDER_RAKE), sr = Math.sin(RUDDER_RAKE);
  for (let i = 0; i < pos.count; i++) { const y = HEEL.y + pos.getY(i) * cr - pos.getZ(i) * sr, c = y < 0.04 ? C(F.paint.bottom) : y < 0.1 ? C(F.paint.boot) : C(b.hullColor); cols.push(c.r, c.g, c.b); }
  rg.blade.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  turn.add(new THREE.Mesh(rg.blade, hullMat));
  turn.add(new THREE.Mesh(rg.tiller, MAT.tiller));
  grp.add(rud);
  // her name on both quarters
  if (F.paint.boatName) for (const s of [1, -1]) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const ctx = cv.getContext('2d')!; ctx.fillStyle = F.paint.boot; ctx.font = 'italic 600 64px Georgia, "Times New Roman", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(F.paint.boatName, 256, 50);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    const fr = hullFrame(0.84, 0.13);
    const n = fr.normal.clone(); if (n.x < 0) n.negate(); n.x *= s; // outward on this side
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, n).normalize(), up2 = new THREE.Vector3().crossVectors(n, right);
    nm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up2, n));
    nm.position.set(s * fr.pos.x, fr.pos.y, fr.pos.z).addScaledVector(n, 0.03); grp.add(nm);
  }
  return turn;
}

interface Ribbon { geom: THREE.BufferGeometry; anchor: THREE.Vector3; phase: number }
export interface BoatMesh {
  grp: THREE.Group; boomPivot: THREE.Group; jibPivot: THREE.Group; main: Sail; jib: Sail;
  jibTells: { windward: Telltale[]; leeward: Telltale[] }; leechTells: Telltale[];
  pole: THREE.Mesh; ribbons: Ribbon[];
  rudder: THREE.Group; prevH: number; prevT: number;
  mainsheet: THREE.Line;
  lines: Lines;
}
/** The working lines drawn on the boat: they move with the controls. */
interface Lines {
  travCar: THREE.Mesh; backstay: THREE.Line; cars: Record<Tack, THREE.Mesh>; jibSheets: Record<Tack, THREE.Line>; winches: Record<Tack, THREE.Vector3>;
}
const LINE_MAT = new THREE.LineBasicMaterial({ color: 0x5c7f76 }); // sheets and control lines (the boat's green-grey braid)
const STEEL = new THREE.MeshPhongMaterial({ color: 0xc9ced3, specular: 0xffffff, shininess: 90 });
const BLACK = new THREE.MeshLambertMaterial({ color: 0x1b1d20 });
/** Jib car on its cabin-top track: x across (pins 25 mm apart, inboard first), z fore–aft. */
const carPos = (side: number, fore: number, ins: number) => { const z = -0.15 + 0.025 * fore, x = side * (0.34 + 0.025 * ins); return new THREE.Vector3(x, cabinTopY(uAtZ(z)) + 0.065, z); };
const TRAV_Z = 3.66, TRAV_HALF = 0.32, MASTHEAD = new THREE.Vector3(0, 9.4 + 0.18, -0.58);
function line(points: THREE.Vector3[], mat: THREE.Material = LINE_MAT): THREE.Line {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat); l.frustumCulled = false; return l;
}

/** Fittings and lines: traveller, backstay with its bridle, vang, winches, jib cars and sheets, and the piano. */
function buildLines(grp: THREE.Group, boomPivot: THREE.Group): Lines {
  // traveller: a track across the aft deck, and its car
  const ty = sheer(1) + 0.03;
  const track = new THREE.Mesh(new THREE.BoxGeometry(TRAV_HALF * 2 + 0.06, 0.025, 0.04), STEEL); track.position.set(0, ty, TRAV_Z); grp.add(track);
  const travCar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.06), BLACK); travCar.position.set(0, ty + 0.03, TRAV_Z); grp.add(travCar);
  // backstay: masthead down to a bridle, which splits to both quarters (pulling the bridle down tensions it)
  const backstay = line([MASTHEAD, MASTHEAD, MASTHEAD, MASTHEAD, MASTHEAD], MAT.wire); grp.add(backstay);
  // vang: a tackle from the boom down to the foot of the mast
  for (const dx of [-0.03, 0.03]) boomPivot.add(line([new THREE.Vector3(dx, 1.0, 0.7), new THREE.Vector3(dx * 0.5, 0.82, 0.07)]));
  // winches on the cockpit coamings, near the forward end
  const winches = {} as Record<Tack, THREE.Vector3>, cars = {} as Record<Tack, THREE.Mesh>, jibSheets = {} as Record<Tack, THREE.Line>;
  for (const [tk, side] of [['S', 1], ['P', -1]] as const) {
    const u = 0.66, zw = -L / 2 + u * L, wx = side * (cockpitHalf(u) + 0.06), wy = deckY(u, cockpitHalf(u)) + 0.13 + 0.07;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.13, 16), STEEL); w.position.set(wx, wy, zw); grp.add(w);
    winches[tk] = new THREE.Vector3(wx, wy + 0.04, zw);
    // H-shaped car track on the cabin top: two short fore–aft rails and the cross rail
    const a = carPos(side, 0, 0), b2 = carPos(side, CAR_FORE_PINS - 1, CAR_IN_PINS - 1);
    for (const x of [a.x, b2.x]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, b2.z - a.z + 0.06), STEEL); r.position.set(x, a.y - 0.05, (a.z + b2.z) / 2); grp.add(r); }
    const cr = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(b2.x - a.x) + 0.025, 0.02, 0.025), STEEL); cr.position.set((a.x + b2.x) / 2, a.y - 0.05, (a.z + b2.z) / 2); grp.add(cr);
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.07), BLACK); grp.add(car); cars[tk] = car;
    const js = line(Array.from({ length: 5 }, () => new THREE.Vector3())); grp.add(js); jibSheets[tk] = js;
  }
  // the piano: three cam cleats a side on the aft end of the cabin, and the lines running forward to the mast
  const zA = -L / 2 + CABIN.u1 * L, yA = cabinTopY(CABIN.u1) - 0.06;
  for (const side of [1, -1]) for (let i = 0; i < 3; i++) {
    const x = side * (0.33 + 0.07 * i);
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.05), BLACK); cl.position.set(x, yA, zA + 0.03); grp.add(cl);
    grp.add(line([new THREE.Vector3(x, yA + 0.02, zA + 0.03), new THREE.Vector3(x * 0.6, cabinTopY(0.5) + 0.075, -0.2), new THREE.Vector3(side * 0.06, cabinTopY(0.42) + 0.075, -0.52)]));
    grp.add(line([new THREE.Vector3(x, yA - 0.01, zA + 0.05), new THREE.Vector3(x + side * 0.02, yA - 0.2 - 0.04 * i, zA + 0.07)])); // the tail
  }
  return { travCar, backstay, cars, jibSheets, winches };
}
/** Mainsheet: from the end of the boom down to the traveller on the transom. */
const BOOM_END = { y: 1.05 + 0.18, r: 3.2 }; // height (with the rig lift) and distance from the gooseneck
const TRAVELLER = new THREE.Vector3(0, 0.78, 3.62);

// Rig points in the boat group's frame: x to starboard, y up, z aft (the bow is at z = −3.82).
const HOUNDS = new THREE.Vector3(0, 7.2, -0.6); // where the forestay and upper shrouds meet the mast
const CHAINPLATE_Z = -0.45, CHAINPLATE_X = 1.0, DECK_Y = 0.42;
const POLE_INBOARD = new THREE.Vector3(0, 1.5, -0.6); // pole fitting on the front of the mast
const JIB_CLEW = new THREE.Vector3(0, 0.35, 2.9); // in the jib pivot's frame
// Cassette-tape telltales: old audio tape tied to the shrouds, about 1.4 m above the deck (low enough to
// see from the cockpit). Dark brown and shiny, like the real thing.
const TAPE_HEIGHT = 1.4, RIBBON_LEN = 0.45, RIBBON_W = 0.025, RIBBON_N = 8;
const RIBBON_MAT = new THREE.MeshPhongMaterial({ color: 0x3b2516, specular: 0x8a7a6a, shininess: 80, side: THREE.DoubleSide });
const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x9aa1a8 });

export function buildBoatMesh(b: Boat): BoatMesh {
  const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
  const alu = b.build.spars === 'aluminium';
  const spar = alu ? MAT.sparAlu : MAT.spar;
  const rudder = buildHull(b, grp);
  // the rig sits on the real deck height
  const rig = new THREE.Group(); rig.position.y = RIG_LIFT; grp.add(rig);
  // aluminium extrusion: constant section; wooden mast: tapered
  const mast = new THREE.Mesh(alu ? new THREE.CylinderGeometry(0.055, 0.06, 9.0, 10) : new THREE.CylinderGeometry(0.05, 0.08, 9.0, 6), spar); mast.position.set(0, 4.9, -0.6); rig.add(mast);
  // Your own sails are slightly see-through, as Dacron is in daylight, so the leeward telltales show through.
  const sailMat = b.isUser
    ? new THREE.MeshLambertMaterial({ color: b.sailColor, side: THREE.DoubleSide, transparent: true, opacity: 0.86 })
    : new THREE.MeshLambertMaterial({ color: b.sailColor, side: THREE.DoubleSide });
  const boomPivot = new THREE.Group(); boomPivot.position.set(0, 0, -0.6); rig.add(boomPivot);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.3, alu ? 10 : 5), spar); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.05, 1.65); boomPivot.add(boom);
  const main = new Sail(MAIN_DEF, sailMat, WINDOW_MAT); boomPivot.add(main.mesh);
  const jibPivot = new THREE.Group(); jibPivot.position.set(0, 0.75, -3.7); rig.add(jibPivot);
  const jib = new Sail(JIB_DEF, sailMat, null); jibPivot.add(jib.mesh);
  // Telltales on your own boat: three pairs on the jib luff, one at each batten on the main leech.
  const jibTells = { windward: [] as Telltale[], leeward: [] as Telltale[] }, leechTells: Telltale[] = [];
  if (b.isUser) {
    [0.25, 0.5, 0.75].forEach((t, i) => {
      jibTells.windward.push(new Telltale(jib, t, 0.13, false, 0.26, i * 1.9));
      jibTells.leeward.push(new Telltale(jib, t, 0.13, true, 0.26, i * 2.3 + 1));
    });
    for (const bt of MAIN_DEF.battens!) leechTells.push(new Telltale(main, bt.t, 0.995, true, 0.3, bt.t * 7));
  }
  rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.75, -3.7), new THREE.Vector3(0, 7.2, -0.6)]), MAT.wire));
  // upper shrouds, each with a cassette-tape telltale tied on low enough to see from the cockpit
  const ribbons: Ribbon[] = [];
  for (const sx of [-1, 1]) {
    const foot = new THREE.Vector3(sx * CHAINPLATE_X, DECK_Y, CHAINPLATE_Z);
    rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([foot, HOUNDS]), MAT.wire));
    const anchor = foot.clone().lerp(HOUNDS, TAPE_HEIGHT / (HOUNDS.y - DECK_Y));
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIBBON_N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < RIBBON_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geom.setIndex(idx);
    const mesh = new THREE.Mesh(geom, RIBBON_MAT); mesh.frustumCulled = false; rig.add(mesh);
    ribbons.push({ geom, anchor, phase: sx * 1.7 + b.id });
  }
  // whisker pole: from the mast to the jib clew when wing-on-wing
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), POLE_MAT); pole.visible = false; rig.add(pole);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.5), new THREE.MeshBasicMaterial({ color: b.color, side: THREE.DoubleSide })); band.position.set(0, 7.6, 0.6); boomPivot.add(band);
  const mainsheet = line([TRAVELLER, TRAVELLER]); grp.add(mainsheet);
  const lines = buildLines(grp, boomPivot);
  return { grp, boomPivot, jibPivot, main, jib, jibTells, leechTells, pole, ribbons, rudder, prevH: b.h, prevT: -1, mainsheet, lines };
}

/** Pose the mesh from the boat state. `t` is wall-clock seconds, for bobbing and flogging. */
export function syncBoatMesh(m: BoatMesh, b: Boat, t: number): void {
  m.grp.position.copy(P3(b.x, b.y, Math.sin(t * 1.3 + b.id) * 0.06));
  m.grp.rotation.y = -b.h * D2R; m.grp.rotation.z = b.heel * D2R; m.grp.rotation.x = Math.sin(t * 0.9 + b.id) * 0.012;
  // rudder and tiller: the helm. Turning to port (heading falling) means the tiller is pushed to starboard.
  const dt = m.prevT < 0 ? 0 : t - m.prevT; m.prevT = t;
  const rate = dt > 0 ? (((b.h - m.prevH + 540) % 360) - 180) / dt : 0; m.prevH = b.h; // deg/s
  const want = Math.max(-0.5, Math.min(0.5, rate / 22 * 0.5)); // full helm (~0.5 rad) at the fastest turn
  m.rudder.rotation.y += (want - m.rudder.rotation.y) * 0.25;
  // positive rotation swings the boom to starboard (+x); b.boom is negative when the wind is from starboard, so it goes to port, to leeward
  m.boomPivot.rotation.y = b.boom * D2R;
  m.jibPivot.quaternion.setFromAxisAngle(JIB_AXIS, b.jib * D2R);
  const plan = sailPlan(b), headToWind = b.twa < 32;
  // main: twists more as the sheet is eased; bubbles at the luff when under-trimmed; flogs when let go
  const tm = b.trim.main;
  const mainShape: SailShape = {
    twist: b.shape.main.twist, depth: b.shape.main.depth, draft: b.shape.main.draft, time: t + b.id,
    bubble: tm.flow === 'luffing' ? Math.min(1, tm.amount * 1.4) : 0,
    flog: b.luff || headToWind ? 0.85 : tm.flow === 'luffing' ? Math.max(0, tm.amount - 0.6) * 2 : 0
  };
  // jib: full when poled out; hangs while the crew handles the pole; collapses behind the main dead downwind
  const tj = b.trim.jib;
  const jibShape: SailShape = {
    twist: b.shape.jib?.twist ?? 4 + 10 * Math.min(1, Math.abs(b.jib) / 40), depth: b.shape.jib?.depth, draft: b.shape.jib?.draft, time: t * 1.1 + b.id,
    bubble: tj && tj.flow === 'luffing' ? Math.min(1, tj.amount * 1.6) : 0,
    flog: plan === 'main' ? 0.7 : b.luff || headToWind ? 0.85 : plan === 'jib' && b.awa > 160 ? 0.35 + 0.35 * Math.abs(Math.sin(t * 1.7 + b.id))
      : tj && tj.flow === 'luffing' ? Math.max(0, tj.amount - 0.6) * 2 : 0
  };
  m.main.update(mainShape); m.jib.update(jibShape);
  m.main.mesh.scale.x = Math.sign(b.boom || 1);
  m.jib.mesh.scale.x = Math.sign(b.jib || 1);
  if (b.isUser) {
    const st = b.luff ? { windward: 'lift' as TellState, leeward: 'hang' as TellState } : luffTellStates(plan === 'jib' ? tj : null, b.awa);
    const amt = tj?.amount ?? 0, mirJ = m.jib.mesh.scale.x < 0;
    m.jibTells.windward.forEach(tt => tt.update(jibShape, st.windward, amt, mirJ));
    m.jibTells.leeward.forEach(tt => tt.update(jibShape, st.leeward, amt, mirJ));
    const leech: TellState = b.awa > 115 || b.luff ? 'hang' : tm.flow === 'stalled' && tm.amount > 0.12 ? 'curl' : 'stream';
    m.leechTells.forEach(tt => tt.update(mainShape, leech, tm.amount, m.main.mesh.scale.x < 0));
  }
  syncPole(m, plan === 'wing');
  syncLines(m, b);
  for (const r of m.ribbons) syncRibbon(r, b, t);
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function syncPole(m: BoatMesh, on: boolean): void {
  m.pole.visible = on;
  if (!on) return;
  const clew = tmpA.copy(JIB_CLEW).applyQuaternion(m.jibPivot.quaternion).add(m.jibPivot.position);
  const d = tmpB.copy(clew).sub(POLE_INBOARD), len = d.length();
  m.pole.position.copy(POLE_INBOARD).addScaledVector(d, 0.5);
  m.pole.quaternion.setFromUnitVectors(UP, d.normalize());
  m.pole.scale.set(1, len, 1);
}

/** A cassette tape streams the way the apparent wind blows, droops when it's light, and flutters. */
function syncRibbon(r: Ribbon, b: Boat, t: number): void {
  const pos = r.geom.attributes.position as THREE.BufferAttribute, arr = pos.array as Float32Array;
  const th = b.arel * D2R;
  const fx = -Math.sin(th), fz = Math.cos(th); // flow direction in the boat frame (x starboard, z aft)
  const stream = Math.min(1, b.aws / 3); // fully streaming above ~6 kt apparent
  const px = -fz, pz = fx; // horizontal, across the flow: the ribbon's width and flutter direction
  let x = r.anchor.x, y = r.anchor.y, z = r.anchor.z;
  const seg = RIBBON_LEN / (RIBBON_N - 1);
  for (let i = 0; i < RIBBON_N; i++) {
    if (i > 0) {
      const flutter = Math.sin(t * (9 + 6 * stream) - i * 1.1 + r.phase) * 0.35 * (i / RIBBON_N);
      const h = stream * seg, v = Math.sqrt(Math.max(0, seg * seg - h * h));
      x += (fx + px * flutter) * h; z += (fz + pz * flutter) * h; y -= v;
    }
    const k = i * 6;
    arr[k] = x - px * RIBBON_W / 2; arr[k + 1] = y; arr[k + 2] = z - pz * RIBBON_W / 2;
    arr[k + 3] = x + px * RIBBON_W / 2; arr[k + 4] = y; arr[k + 5] = z + pz * RIBBON_W / 2;
  }
  pos.needsUpdate = true;
}

const tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
/** Move the traveller car, tension the backstay, set the jib cars on their pins and run the jib sheets. */
function syncLines(m: BoatMesh, b: Boat): void {
  const L2 = m.lines, c = b.ctl, lee = b.tack === 'S' ? -1 : 1; // the leeward side (x sign)
  // traveller car: +1 is to leeward; the mainsheet runs from the boom end down to it
  const cx = lee * c.traveller * TRAV_HALF; L2.travCar.position.x = cx;
  const a = b.boom * D2R, p = m.mainsheet.geometry.attributes.position as THREE.BufferAttribute;
  p.setXYZ(0, cx, L2.travCar.position.y + 0.02, TRAV_Z);
  p.setXYZ(1, Math.sin(a) * BOOM_END.r, BOOM_END.y, -0.6 + Math.cos(a) * BOOM_END.r); p.needsUpdate = true;
  // backstay: the bridle's apex is pulled down as the backstay goes on
  { const q = L2.backstay.geometry.attributes.position as THREE.BufferAttribute, foot = new THREE.Vector3(0, sheer(1), 3.74);
    const ay = 2.7 - 1.3 * c.backstay, f = (MASTHEAD.y - ay) / (MASTHEAD.y - foot.y), apex = MASTHEAD.clone().lerp(foot, f);
    q.setXYZ(0, MASTHEAD.x, MASTHEAD.y, MASTHEAD.z); q.setXYZ(1, apex.x, apex.y, apex.z);
    q.setXYZ(2, 0.3, foot.y + 0.02, foot.z - 0.1); q.setXYZ(3, apex.x, apex.y, apex.z); q.setXYZ(4, -0.3, foot.y + 0.02, foot.z - 0.1); q.needsUpdate = true; }
  // jib cars and sheets: the leeward sheet runs taut from the clew through its car to the winch; the lazy one hangs slack
  const clew = tmpC.copy(JIB_CLEW).applyQuaternion(m.jibPivot.quaternion).add(m.jibPivot.position); clew.y += 0.18; // rig lift
  for (const [tk, side] of [['S', 1], ['P', -1]] as const) {
    const pin = c.car[tk], car = carPos(side, pin.fore, pin.ins);
    L2.cars[tk].position.copy(car);
    const wv = L2.winches[tk], q = L2.jibSheets[tk].geometry.attributes.position as THREE.BufferAttribute, loaded = side === lee;
    const sag = loaded ? 0 : 0.25;
    const mid1 = tmpD.copy(clew).lerp(car, 0.5); mid1.y -= sag;
    q.setXYZ(0, clew.x, clew.y, clew.z); q.setXYZ(1, mid1.x, mid1.y, mid1.z); q.setXYZ(2, car.x, car.y + 0.03, car.z);
    const mid2 = car.clone().lerp(wv, 0.5); mid2.y -= loaded ? 0 : 0.1;
    q.setXYZ(3, mid2.x, mid2.y, mid2.z); q.setXYZ(4, wv.x, wv.y, wv.z); q.needsUpdate = true;
  }
}
