import './three-setup';
import * as THREE from 'three';
import { D2R } from '../core/math';
import { FLEET, type Boat, type Tack } from '../boat/boat';
import { CAR_FORE_PINS, CAR_IN_PINS } from '../boat/controls';
import { sailPlan } from '../boat/physics';
import { P3 } from './coords';
import { buildCrew, syncCrew, type Crew } from './crew';
import { burgeeCanvas } from './burgees';
import { flagArtCanvas, needsCourtesy } from './flagArt';
import { DEFAULT_CREW } from '../boat/crewPhys';
import { CABIN, COCKPIT, HEEL, L, PAINT_LINES, RUDDER_RAKE, cabinGeometry, cockpitLid, topsidesPatch, cabinTopY, sheer, uAtZ, cockpitGeometry, cockpitHalf, cockpitSeats, deckGeometry, deckY, hullFrame, hullGeometry, rail, rudderGeometry, sheerLine } from './hull';
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

/** Glossy materials that reflect the sky (the scene sets their environment map from the sky as it changes). */
export const REFLECTIVE: { mat: THREE.MeshPhongMaterial; amount: number }[] = [];
const reflect = <T extends THREE.MeshPhongMaterial>(m: T, amount: number): T => { m.combine = THREE.MixOperation; m.reflectivity = amount; REFLECTIVE.push({ mat: m, amount }); return m; };
const MAT = {
  deck: new THREE.MeshLambertMaterial({ color: 0xb98d5c, side: THREE.DoubleSide }), // laid teak / varnish
  cabin: new THREE.MeshLambertMaterial({ color: 0xece6d8 }),
  spar: new THREE.MeshLambertMaterial({ color: 0xc7a06a }), // varnished spruce
  // fiberglass boats: off-white non-skid gelcoat deck, anodised aluminium spars
  deckGrp: new THREE.MeshLambertMaterial({ color: 0xb9b5ab, side: THREE.DoubleSide }), // matte non-skid reads darker than the glossy cabin top
  sparAlu: reflect(new THREE.MeshPhongMaterial({ color: 0xaeb5bc, specular: 0x9aa0a6, shininess: 70 }), 0.22),
  wire: new THREE.LineBasicMaterial({ color: 0x333333 }),
  wood: reflect(new THREE.MeshPhongMaterial({ color: 0x8a5a30, specular: 0x553322, shininess: 40 }), 0.06), // varnished trim
  tiller: new THREE.MeshPhongMaterial({ color: 0xb07a44, specular: 0x664422, shininess: 50 }),
  cream: new THREE.MeshLambertMaterial({ color: 0xebe5d6, side: THREE.DoubleSide }),
  mahogany: new THREE.MeshPhongMaterial({ color: 0x6e3f22, specular: 0x442211, shininess: 45, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhongMaterial({ color: 0x1d2a33, specular: 0xaabbcc, shininess: 90 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x1a1d22 })
};

/** Rig points below were laid out for a deck 0.42 m above the water; the hull's real freeboard is about 0.18 m more. */
const RIG_LIFT = 0.18;

/**
 * Paint by height, per pixel, so the lines are crisp: bottom paint, the boot stripe, the topsides (paintLines in
 * hull.ts). The vertex colours carry only the light and shade of the laps. `rudder`: the blade's own frame is raked
 * and turns, so its height is taken in the boat's frame.
 */
function paintMaterial(m: THREE.MeshPhongMaterial, top: THREE.Color, boot: THREE.Color, bottom: THREE.Color, rudder = false): THREE.MeshPhongMaterial {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTop: { value: top }, uBoot: { value: boot }, uBottom: { value: bottom }, uL: { value: L }, uRake: { value: rudder ? RUDDER_RAKE : 0 }, uHeel: { value: new THREE.Vector2(HEEL.y, HEEL.z) },
      uLines: { value: new THREE.Vector4(PAINT_LINES.wl, PAINT_LINES.wlRise, PAINT_LINES.stripe, PAINT_LINES.stripeRise) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uRake; uniform vec2 uHeel; varying vec2 vPaint;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${rudder ? 'vPaint = vec2(uHeel.x + position.y * cos(uRake) - position.z * sin(uRake), uHeel.y + position.y * sin(uRake) + position.z * cos(uRake));' : 'vPaint = vec2(position.y, position.z);'}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTop; uniform vec3 uBoot; uniform vec3 uBottom; uniform float uL; uniform vec4 uLines; varying vec2 vPaint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float e = pow(2.0 * vPaint.y / uL, 2.0), wl = uLines.x + uLines.y * e, tp = uLines.x + uLines.z + (uLines.y + uLines.w) * e;
        float aw = max(fwidth(vPaint.x) * 0.6, 0.0006);
        vec3 paintC = mix(uBottom, mix(uBoot, uTop, smoothstep(tp - aw, tp + aw, vPaint.x)), smoothstep(wl - aw, wl + aw, vPaint.x));
        diffuseColor.rgb *= paintC;`);
  };
  m.customProgramCacheKey = () => 'hullpaint' + (rudder ? 'R' : 'H');
  return m;
}

/** Hull, deck, cabin, cockpit, rudder and tiller, painted for this boat. The rudder group turns about its hinge. */
function buildHull(b: Boat, grp: THREE.Group): THREE.Group {
  const F = FLEET[b.id] ?? FLEET[1], glass = b.build.hull === 'fiberglass', paint = b.paint ?? F.paint;
  const C = (h: string) => new THREE.Color(h), boot = paint.boot || b.hullColor; // no boot stripe: the topsides run down to the bottom paint
  const hullMat = glass
    ? reflect(new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x777777, shininess: 75 }), 0.14) // glossy gelcoat, reflecting the sky
    : reflect(new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x333333, shininess: b.hullColor === '#9a6a36' ? 60 : 25 }), b.hullColor === '#9a6a36' ? 0.08 : 0.04); // painted or varnished planking
  paintMaterial(hullMat, C(b.hullColor), C(boot), C(paint.bottom));
  grp.add(new THREE.Mesh(hullGeometry(), hullMat));
  // the sea is never drawn inside the hull: a lid over the cockpit at deck level, in the depth buffer only (drawn after
  // the boat and before the water, which scene.ts draws last of the solid things)
  const lid = new THREE.Mesh(cockpitLid(), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })); lid.renderOrder = 1; grp.add(lid);
  // deck: non-skid on glassfibre boats, painted canvas or laid teak on the wooden ones
  const teak = paint.deck.startsWith('teak'), silver = paint.deck === 'teak-silver';
  const deckMat = teak ? new THREE.MeshLambertMaterial({ color: 0xffffff, map: teakTexture(silver), side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: paint.deck, side: THREE.DoubleSide });
  const flatMat = teak ? new THREE.MeshLambertMaterial({ color: silver ? 0xa6a197 : 0xa8723f, side: THREE.DoubleSide }) : deckMat; // cockpit sole (teak, no planking drawn)
  const cabinTopMat = teak ? new THREE.MeshLambertMaterial({ color: 0xd9cfb6, side: THREE.DoubleSide }) : deckMat; // a teak-decked boat's cabin top: painted canvas
  grp.add(new THREE.Mesh(deckGeometry(), deckMat));
  // cabin trunk: cream sides (varnished mahogany on the wooden boats), deck-coloured top
  const cab = cabinGeometry();
  grp.add(new THREE.Mesh(cab.sides, glass ? MAT.cream : MAT.mahogany));
  grp.add(new THREE.Mesh(cab.top, cabinTopMat));
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
  const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), MAT.dark); compass.rotation.x = Math.PI / 2; compass.position.set(0.42, topAft - CABIN.h * 0.5, zAft + 0.016); compass.name = 'compass'; grp.add(compass);
  // wooden grab rails on the cabin top
  for (const s of [1, -1]) {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.2), MAT.wood);
    gr.position.set(s * (CABIN.w - 0.17), cab.topY((CABIN.u0 + CABIN.u1) / 2 + 0.03) + 0.06, zc((CABIN.u0 + CABIN.u1) / 2 + 0.03)); grp.add(gr);
  }
  // cockpit well, seats, and coamings
  cockpitGeometry().forEach((g, i) => grp.add(new THREE.Mesh(g, i === 0 ? flatMat : MAT.cream))); // non-skid sole, cream sides
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
  const cols = new Float32Array(rg.blade.attributes.position.count * 3).fill(1);
  rg.blade.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  turn.add(new THREE.Mesh(rg.blade, paintMaterial(hullMat.clone() as THREE.MeshPhongMaterial, C(b.hullColor), C(boot), C(paint.bottom), true)));
  turn.add(new THREE.Mesh(rg.tiller, MAT.tiller));
  grp.add(rud);
  // an outboard on its transom bracket, tilted up (port quarter, clear of the rudder, the tiller and the ensign staff)
  if (b.spec?.perf.outboard === 'bracket') {
    const ob = new THREE.Group(), grey = new THREE.MeshPhongMaterial({ color: 0x9aa0a6, specular: 0x666666, shininess: 50 }), blk = MAT.dark;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.34), blk); head.position.set(0, 0.13, 0.12); ob.add(head);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), grey); leg.position.set(0, 0.0, -0.2); ob.add(leg); // tilted up: the leg lies forward along the bracket
    const brk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.04), grey); brk.position.set(0, -0.05, -0.12); ob.add(brk);
    ob.position.set(-0.42, sheer(1) - 0.12, L / 2 + 0.12); ob.rotation.x = 0.35; grp.add(ob);
  }
  // her name on both quarters
  if (paint.boatName) for (const s of [1, -1]) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const ctx = cv.getContext('2d')!; ctx.fillStyle = nameColor(b.hullColor, paint.boot); ctx.font = 'italic 600 64px Georgia, "Times New Roman", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(paint.boatName, 256, 50);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    // painted on the planking: the patch follows the planks and their laps (it's built on the starboard side; mirrored to port, read the other way)
    const y0 = hullFrame(0.84, 0.13).pos.y - 0.085, geo = topsidesPatch(0.84, y0, y0 + 0.17, 0.9);
    if (s < 0) { geo.scale(-1, 1, 1); const uv = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); geo.index!.array.reverse(); geo.computeVertexNormals(); }
    const nm = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    grp.add(nm);
  }
  return turn;
}

interface FlyingFlag { mesh: THREE.Mesh<THREE.PlaneGeometry>; base: Float32Array; fly: number }
interface Ribbon { geom: THREE.BufferGeometry; anchor: THREE.Vector3; phase: number }
export interface BoatMesh {
  grp: THREE.Group; boomPivot: THREE.Group; jibPivot: THREE.Group; main: Sail; jib: Sail;
  jibTells: { windward: Telltale[]; leeward: Telltale[] }; leechTells: Telltale[];
  pole: THREE.Mesh; ribbons: Ribbon[];
  rudder: THREE.Group; prevH: number; prevT: number;
  /** The masthead windex (turns to the apparent wind) and the bulkhead compass card (turns with the heading). */
  windex: THREE.Group; card: THREE.CanvasTexture;
  /** Her flags (stream in the apparent wind and flutter): ensign, burgee or officer's flag, courtesy flag. */
  flags: FlyingFlag[];
  /** The crew, and whether to hide the helm (you're looking through their eyes in the cockpit view). */
  crew: Crew; hideHelm: boolean;
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
const TRAV_Z = 2.35, TRAV_HALF = 0.5, MASTHEAD = new THREE.Vector3(0, 9.4 + 0.18, -0.58);
function line(points: THREE.Vector3[], mat: THREE.Material = LINE_MAT): THREE.Line {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat); l.frustumCulled = false; return l;
}

/** Fittings and lines: traveller, backstay with its bridle, vang, winches, jib cars and sheets, and the piano. */
function buildLines(grp: THREE.Group, boomPivot: THREE.Group): Lines {
  // traveller: a wooden thwart across the cockpit in front of the helmsman, the track on top, and its car
  const tu = uAtZ(TRAV_Z), tw = cockpitHalf(tu), ty = deckY(tu, tw) + 0.03;
  const thwart = new THREE.Mesh(new THREE.BoxGeometry(tw * 2 + 0.12, 0.05, 0.22), MAT.wood); thwart.position.set(0, ty - 0.03, TRAV_Z); grp.add(thwart);
  const track = new THREE.Mesh(new THREE.BoxGeometry(TRAV_HALF * 2 + 0.08, 0.02, 0.035), STEEL); track.position.set(0, ty + 0.005, TRAV_Z); grp.add(track);
  const travCar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.06), BLACK); travCar.position.set(0, ty + 0.03, TRAV_Z); grp.add(travCar);
  // backstay: masthead down to a bridle, which splits to both quarters (pulling the bridle down tensions it)
  const backstay = line([MASTHEAD, MASTHEAD, MASTHEAD, MASTHEAD, MASTHEAD], MAT.wire); grp.add(backstay);
  // its dual-ended control line: from the blocks on the quarters, forward along the inside of the hull to a cam
  // cleat at each end of the thwart, where the thwart meets the hull
  for (const side of [1, -1]) {
    const x = side * (tw - 0.02), foot = new THREE.Vector3(side * 0.3, sheer(1) - 0.05, 3.62);
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.06), BLACK); cl.position.set(x, ty + 0.01, TRAV_Z + 0.06); grp.add(cl);
    grp.add(line([foot, new THREE.Vector3(side * (tw - 0.04), ty - 0.04, (TRAV_Z + foot.z) / 2), new THREE.Vector3(x, ty + 0.02, TRAV_Z + 0.06)]));
    grp.add(line([new THREE.Vector3(x, ty + 0.02, TRAV_Z + 0.03), new THREE.Vector3(x - side * 0.03, ty - 0.25, TRAV_Z - 0.04)])); // the tail
  }
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
/** The spreaders: one pair, about half way up, pushing the shrouds out (tip, starboard side). */
const SPREADER = new THREE.Vector3(0.68, 4.5, -0.56);
const POLE_INBOARD = new THREE.Vector3(0, 1.5, -0.6); // pole fitting on the front of the mast
const JIB_CLEW = new THREE.Vector3(0, 0.35, 2.9); // in the jib pivot's frame
// Cassette-tape telltales: old audio tape tied to the shrouds, about 1.4 m above the deck (low enough to
// see from the cockpit). Dark brown and shiny, like the real thing.
const TAPE_HEIGHT = 1.4, RIBBON_LEN = 0.45, RIBBON_W = 0.025, RIBBON_N = 8;
const RIBBON_MAT = new THREE.MeshPhongMaterial({ color: 0x3b2516, specular: 0x8a7a6a, shininess: 80, side: THREE.DoubleSide });
const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x9aa1a8 });

export function buildBoatMesh(b: Boat): BoatMesh {
  const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
  const alu = b.build.spars === 'aluminium', aluBoom = (b.build.boom ?? b.build.spars) === 'aluminium';
  const spar = alu ? MAT.sparAlu : MAT.spar, boomMat = aluBoom ? MAT.sparAlu : MAT.spar;
  const rudder = buildHull(b, grp);
  // the rig sits on the real deck height
  const rig = new THREE.Group(); rig.position.y = RIG_LIFT; grp.add(rig);
  // aluminium extrusion: constant section; wooden mast: tapered
  const mast = new THREE.Mesh(alu ? new THREE.CylinderGeometry(0.055, 0.06, 9.0, 10) : new THREE.CylinderGeometry(0.05, 0.08, 9.0, 6), spar); mast.position.set(0, 4.9, -0.6); rig.add(mast);
  // Your own sails are slightly see-through, as Dacron is in daylight, so the leeward telltales show through.
  // Dacron sails: crosscut panel seams, the class letter, and the sail number on the main (starboard side higher, RRS
  // Appendix G), each side its own picture so the numbers read the right way round from both sides
  // Each side of the cloth has its own picture, by which way it faces (the sail mesh is mirrored to the boom's side,
  // which swaps the faces: syncBoatMesh puts the right picture on each face)
  const pics = { mainStbd: sailTexture(b.sailColor, b.no, 'stbd', true), mainPort: sailTexture(b.sailColor, b.no, 'port', true), jibStbd: sailTexture(b.sailColor, '', 'stbd', false), jibPort: sailTexture(b.sailColor, '', 'port', false) };
  const sm = (side: 'front' | 'back', map: THREE.Texture) => new THREE.MeshLambertMaterial({
    map, side: side === 'front' ? THREE.FrontSide : THREE.BackSide, transparent: b.isUser, opacity: b.isUser ? 0.86 : 1
  });
  const sailMat = sm('front', pics.mainStbd), sailBack = sm('back', pics.mainPort), jibMat = sm('front', pics.jibStbd), jibBack = sm('back', pics.jibPort);
  sailPics.set(sailMat, { front: sailMat, back: sailBack, stbd: pics.mainStbd, port: pics.mainPort });
  sailPics.set(jibMat, { front: jibMat, back: jibBack, stbd: pics.jibStbd, port: pics.jibPort });
  const boomPivot = new THREE.Group(); boomPivot.position.set(0, 0, -0.6); rig.add(boomPivot);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.3, aluBoom ? 10 : 5), boomMat); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.05, 1.65); boomPivot.add(boom);
  const main = new Sail(MAIN_DEF, sailMat, WINDOW_MAT, sailBack); boomPivot.add(main.mesh);
  const jibPivot = new THREE.Group(); jibPivot.position.set(0, 0.75, -3.7); rig.add(jibPivot);
  const jib = new Sail(JIB_DEF, jibMat, null, jibBack); jibPivot.add(jib.mesh);
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
    const foot = new THREE.Vector3(sx * CHAINPLATE_X, DECK_Y, CHAINPLATE_Z), tip = new THREE.Vector3(sx * SPREADER.x, SPREADER.y, SPREADER.z);
    // the spreader, and the shroud over its tip to the hounds
    const spr = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, tip.x * sx, 5), spar); spr.rotation.z = Math.PI / 2; spr.position.set(tip.x / 2, SPREADER.y, (SPREADER.z + -0.6) / 2); rig.add(spr);
    rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([foot, tip, HOUNDS]), MAT.wire));
    const anchor = foot.clone().lerp(tip, TAPE_HEIGHT / (tip.y - DECK_Y));
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
  // her flags (yachting etiquette: render/flagArt.ts): the ensign on its staff at the stern; the club burgee, or an officer's flag in its place, on the flag halyard under the
  // starboard spreader (the masthead has the windex). Flying a foreign ensign on the Bay, she flies the US flag as a
  // courtesy flag at the starboard spreader and moves her burgee to port.
  const flags: FlyingFlag[] = [];
  const hoist = (canvas: HTMLCanvasElement | null, at: THREE.Vector3, h: number, parent: THREE.Object3D, tail = true) => {
    if (!canvas) return;
    const fly = h * canvas.width / canvas.height, geo = new THREE.PlaneGeometry(fly, h, 10, 2); geo.translate(fly / 2, -h / 2, 0); // hoisted at its top corner
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, alphaTest: 0.5 }));
    mesh.position.copy(at); parent.add(mesh);
    if (tail) parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(at.x, at.y - h - 0.05, at.z), new THREE.Vector3(at.x, DECK_Y + 0.3, at.z)]), MAT.wire)); // the halyard's tail
    flags.push({ mesh, base: (geo.attributes.position.array as Float32Array).slice(), fly });
  };
  const club = b.special ? flagArtCanvas(b.special) : b.burgee ? burgeeCanvas(b.burgee) : null;
  const spreader = (side: number) => new THREE.Vector3(side * (SPREADER.x - 0.06), SPREADER.y - 0.06, SPREADER.z);
  if (needsCourtesy(b.ensign)) { hoist(flagArtCanvas('us'), spreader(1), 0.25, rig); hoist(club, spreader(-1), b.special ? 0.3 : 0.3, rig); }
  else hoist(club, spreader(1), 0.3, rig);
  if (b.ensign) {
    // on an ensign staff in a socket on the starboard quarter, close to the centreline (the backstay and tiller have the
    // middle of the transom), raked aft; the flag about an inch of fly per foot of boat (a 24-inch fly)
    const ens = flagArtCanvas(b.ensign), staffH = 1.0, rake = 0.22, base = new THREE.Vector3(0.3, sheer(1) + 0.02, L / 2 - 0.08);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, staffH, 6), MAT.wood);
    const top = base.clone().add(new THREE.Vector3(0, Math.cos(rake) * staffH, Math.sin(rake) * staffH));
    staff.position.copy(base.clone().lerp(top, 0.5)); staff.rotation.x = rake; grp.add(staff);
    const truck = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), MAT.wood); truck.position.copy(top); grp.add(truck);
    if (ens) hoist(ens, top.clone().add(new THREE.Vector3(0, -0.03, 0)), 0.61 * ens.height / ens.width, grp, false);
  }
  // the windex on the masthead: an arrow that swings into the apparent wind, between two reference tabs
  const windex = new THREE.Group(); windex.position.set(0, 9.45, -0.6); rig.add(windex);
  { const blk = new THREE.MeshLambertMaterial({ color: 0x1b1d20 }), red = new THREE.MeshLambertMaterial({ color: 0xd8342a });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 5), blk); rod.rotation.x = Math.PI / 2; rod.position.set(0, 0.12, -0.05); windex.add(rod);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), red); head.rotation.x = -Math.PI / 2; head.position.set(0, 0.12, -0.35); windex.add(head);
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), red); fin.rotation.y = Math.PI / 2; fin.position.set(0, 0.12, 0.2); windex.add(fin);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), blk); post.position.set(0, 0.06, 0); windex.add(post);
    // the fixed reference tabs, set to the close-hauled apparent wind angle either side of the bow
    for (const sx of [-1, 1]) { const tab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.22), blk); const a = sx * 28 * Math.PI / 180; tab.position.set(Math.sin(a) * 0.14, 0.05, -Math.cos(a) * 0.14).add(windex.position); tab.rotation.y = -a; rig.add(tab); }
  }
  // a compass card behind the glass of the bulkhead compass
  const cc = document.createElement('canvas'); cc.width = cc.height = 256; const g = cc.getContext('2d')!;
  g.fillStyle = '#10161c'; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8e4d8'; g.fillStyle = '#e8e4d8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = d * Math.PI / 180, r0 = d % 30 === 0 ? 92 : d % 10 === 0 ? 100 : 106;
    g.lineWidth = d % 30 === 0 ? 3 : 1.5; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118); g.stroke();
    if (d % 30 === 0) { g.save(); g.translate(128 + Math.sin(a) * 74, 128 - Math.cos(a) * 74); g.rotate(a); g.font = `bold ${d % 90 === 0 ? 30 : 22}px sans-serif`; g.fillStyle = d === 0 ? '#ff5a3c' : '#e8e4d8'; g.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[d] ?? String(d / 10), 0, 0); g.restore(); }
  }
  const card = new THREE.CanvasTexture(cc); card.center.set(0.5, 0.5);
  const cmp = grp.getObjectByName('compass')!;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.068, 32), new THREE.MeshBasicMaterial({ map: card }));
  face.position.copy(cmp.position); face.position.z += 0.017; grp.add(face);
  const lubber = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.03), new THREE.MeshBasicMaterial({ color: 0xffb35c })); lubber.position.copy(face.position); lubber.position.y += 0.055; lubber.position.z += 0.001; grp.add(lubber);
  const JACKETS = [[0xc8372d, 0x2b4f8a, 0xe8b21c], [0x1f3a5f, 0xd8d4c8, 0xb03a2e], [0x2e6b4f, 0xf2c14e, 0x3a3f47], [0xe36a1e, 0x274060, 0xdedad0]];
  const spec = b.crew?.spec ?? DEFAULT_CREW;
  const crew = buildCrew(spec.helm, spec.crew, JACKETS[b.id % JACKETS.length], b.id * 3); grp.add(crew.group);
  return { grp, boomPivot, jibPivot, main, jib, jibTells, leechTells, pole, ribbons, rudder, prevH: b.h, prevT: -1, mainsheet, lines, windex, card, crew, flags, hideHelm: false };
}

/** Pose the mesh from the boat state. `t` is wall-clock seconds, for bobbing and flogging. */
export function syncBoatMesh(m: BoatMesh, b: Boat, t: number, wave?: { heave: number; pitch: number; roll: number }): void {
  // riding the waves: heave, pitch and roll from the sea surface under her (or a gentle bob in flat water)
  const heave = wave ? wave.heave : Math.sin(t * 1.3 + b.id) * 0.03, pitch = wave ? wave.pitch : Math.sin(t * 0.9 + b.id) * 0.006;
  m.grp.position.copy(P3(b.x, b.y, heave));
  m.grp.rotation.y = -b.h * D2R; m.grp.rotation.z = b.heel * D2R + (wave ? wave.roll : 0); m.grp.rotation.x = pitch;
  // rudder and tiller: the helm. Turning to port (heading falling) means the tiller is pushed to starboard.
  // rudder and tiller follow the helm the sim is using (steady, not estimated from frame-to-frame heading changes,
  // which jitter with the frame rate); eased so it swings like a real tiller
  const dt = m.prevT < 0 ? 0 : Math.min(0.1, t - m.prevT); m.prevT = t;
  const want = Math.max(-0.5, Math.min(0.5, (b.helm ?? 0) * 0.5)); // full helm ~0.5 rad
  m.rudder.rotation.y += (want - m.rudder.rotation.y) * Math.min(1, dt * 8);
  // the windex swings into the apparent wind (damped, as a real one is); the compass card turns with the heading
  const wantW = -b.arel * D2R, curW = m.windex.rotation.y, dW = Math.atan2(Math.sin(wantW - curW), Math.cos(wantW - curW));
  m.windex.rotation.y = curW + dW * Math.min(1, dt * 5);
  if (m.flags.length) {
    // the fly streams downwind of the halyard, fluttering harder in more wind; in light air it droops
    const k = Math.min(1, b.aws / 8);
    for (const f of m.flags) {
      const p = f.mesh.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
      f.mesh.rotation.y = m.windex.rotation.y - Math.PI / 2;
      for (let i = 0; i < a.length; i += 3) { const x = f.base[i]; a[i + 2] = Math.sin(x * 9 / f.fly * 1.4 - t * (8 + 6 * k)) * 0.035 * x / f.fly * (0.4 + k); a[i + 1] = f.base[i + 1] - (1 - k) * x * 0.5; }
      p.needsUpdate = true;
    }
  }
  m.card.rotation = b.h * D2R;
  // the crew on the windward side, hiking as hard as she needs
  syncCrew(m.crew, b.rel >= 0 ? 1 : -1, b.crew, dt, m.hideHelm);
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
  // the cloth's front face looks along the mesh's +x, which the mirroring turns to starboard (+1) or port (−1)
  for (const [sail, sgn] of [[m.main, Math.sign(b.boom || 1)], [m.jib, Math.sign(b.jib || 1)]] as const) {
    const mats = sail.mesh.material as THREE.MeshLambertMaterial[], pr = sailPics.get(mats[0]);
    if (pr) { const want = sgn > 0 ? pr.stbd : pr.port, other = sgn > 0 ? pr.port : pr.stbd; if (pr.front.map !== want) { pr.front.map = want; pr.back.map = other; } }
  }
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

/**
 * A sail's picture (u: luff → leech, v: foot → head): sailcloth, crosscut seams, and on the main the class insignia
 * (the letter F), the national letters and the sail number, as the class rules lay them down (NFIA class rules 9.14:
 * as in the Racing Rules' Appendix G): the insignia above the national letters, the national letters above the number,
 * figures at least 300 mm high and 200 mm wide with a 40 mm stroke and 60 mm between them, in a sans-serif face, all
 * above the arc 60% of the leech length from the head, and the starboard side's set higher than the port side's so
 * they don't sit back to back. `side`: which side of the sail this picture is seen from. Sizes are in metres on the real sail.
 */
/** Which picture goes on which face of a sail's cloth (by the front material). */
const sailPics = new WeakMap<THREE.Material, { front: THREE.MeshLambertMaterial; back: THREE.MeshLambertMaterial; stbd: THREE.Texture; port: THREE.Texture }>();
function sailTexture(color: string, no: string, side: 'stbd' | 'port', main: boolean): THREE.CanvasTexture {
  // seen from starboard the leech is on your left, so that side's picture is drawn mirrored to read the right way round
  const mirror = side === 'stbd';
  const W = main ? 512 : 256, H = main ? 2048 : 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const dark = lum(color) < 0.3; // black sails: lighter seams, white numbers
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  // crosscut panels: seams across the sail, roughly square to the leech
  g.strokeStyle = dark ? 'rgba(200,200,200,.16)' : 'rgba(120,115,100,.28)'; g.lineWidth = main ? 4 : 2;
  for (let i = 1; i < (main ? 12 : 8); i++) { const y = H - i * H / (main ? 12 : 8); g.beginPath(); g.moveTo(0, y + 10 * H / 512); g.lineTo(W, y - 6 * H / 512); g.stroke(); }
  if (main && no) {
    const pxV = H / MAIN_LUFF; // canvas px per metre up the sail
    /** One line of figures, centred at height fraction t, each figure 0.30 m × 0.20 m (a "1" or "I" narrower), 0.06 m apart. */
    const line = (txt: string, t: number, col: string) => {
      const chord = MAIN_FOOT * (1 - t), pxU = W / chord; // px per metre across the sail at this height
      const glyphs = [...txt].filter(ch => ch !== ' '), widths = glyphs.map(ch => (ch === '1' || ch === 'I' ? 0.09 : 0.2));
      const total = widths.reduce((a, w) => a + w, 0) + 0.06 * (glyphs.length - 1) + (txt.includes(' ') ? 0.12 : 0);
      let x = 0.46 * chord - total / 2; // metres from the luff: a little forward of the middle of the cloth at this height
      g.fillStyle = col;
      glyphs.forEach((ch, k) => {
        const size = 0.3 * pxV * 1.37; // a bold sans-serif's cap height is about 0.73 of its em
        g.save(); g.font = `bold ${size}px "Helvetica Neue", Arial, sans-serif`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
        const m = g.measureText(ch), sx = (widths[k] * pxU) / Math.max(1, m.width);
        const cx = (x + widths[k] / 2) * pxU, xx = mirror ? W - cx : cx, y = H * (1 - t) + 0.15 * pxV;
        g.translate(xx, y); g.scale(sx * (mirror ? -1 : 1), 1); g.fillText(ch, -m.width / 2, 0); g.restore();
        x += widths[k] + 0.06;
      });
    };
    const ink = dark ? '#f2f2ee' : '#1c2128', letters = (no.match(/^[A-Z]+/)?.[0] ?? '').replace(/^US$/, 'USA'), digits = no.replace(/^[A-Z]+\s*/, '');
    const step = 0.36 / MAIN_LUFF, top = side === 'stbd' ? 0.805 : 0.735; // the starboard set higher, the port set 0.58 m lower (RRS G1.3)
    line('F', top, dark ? '#e8edf5' : '#1d3f8f'); // the class insignia
    if (letters) line(letters, top - step, ink);
    line(digits, top - step * (letters ? 2 : 1), ink);
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

/** Relative luminance of a hex colour (0 black .. 1 white). */
function lum(hex: string): number { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
/** Her name on the quarters: in the boot stripe's colour, or whatever reads against the topsides. */
function nameColor(hull: string, boot: string): string {
  if (boot && Math.abs(lum(boot) - lum(hull)) > 0.25) return boot;
  return lum(hull) > 0.45 ? '#1f2c4f' : '#f2eee4';
}

const teakCache = new Map<boolean, THREE.CanvasTexture>();
/** Laid teak: planks with black caulked seams and grain; weathered silver-grey, or oiled and polished. */
function teakTexture(silver: boolean): THREE.CanvasTexture {
  const hit = teakCache.get(silver); if (hit) return hit;
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, planks = 4, pw = W / planks;
  let seed = silver ? 7 : 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < planks; i++) {
    const base = silver ? [168, 163, 152] : [176, 116, 62], k = 0.9 + rnd() * 0.18;
    g.fillStyle = `rgb(${base.map(v => Math.round(v * k)).join(',')})`; g.fillRect(i * pw, 0, pw, H);
    for (let j = 0; j < 40; j++) { // grain: long thin streaks along the plank
      const x = i * pw + 3 + rnd() * (pw - 6), a = (silver ? 0.1 : 0.14) * rnd();
      g.strokeStyle = rnd() < 0.5 ? `rgba(60,40,20,${a})` : `rgba(255,240,210,${a * 0.7})`; g.lineWidth = 0.6 + rnd() * 1.2;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 6, H * 0.33, x + (rnd() - 0.5) * 6, H * 0.66, x + (rnd() - 0.5) * 4, H); g.stroke();
    }
  }
  g.fillStyle = silver ? '#3b3a37' : '#17130f';
  for (let i = 0; i < planks; i++) g.fillRect(i * pw, 0, 2.5, H); // caulked seams
  for (let i = 0; i < planks; i++) { const y = (rnd() * 0.8 + 0.1) * H; g.fillRect(i * pw, y, pw, 2); } // butt joints, staggered
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  teakCache.set(silver, t); return t;
}
