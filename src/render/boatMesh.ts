import './three-setup';
import * as THREE from 'three';
import { D2R } from '../core/math';
import type { Boat } from '../boat/boat';
import { sailPlan } from '../boat/physics';
import { P3 } from './coords';
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

function hullShape(k: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 3.82 * k); s.quadraticCurveTo(1.15 * k, 2.2 * k, 1.1 * k, 0); s.quadraticCurveTo(1.05 * k, -2.6 * k, 0.62 * k, -3.82 * k);
  s.lineTo(-0.62 * k, -3.82 * k); s.quadraticCurveTo(-1.05 * k, -2.6 * k, -1.1 * k, 0); s.quadraticCurveTo(-1.15 * k, 2.2 * k, 0, 3.82 * k);
  return s;
}
const HULL_G = (() => {
  const g = new THREE.ExtrudeGeometry(hullShape(1), { depth: 0.85, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.translate(0, -0.45, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.2) p.setX(i, p.getX(i) * 0.55);
  g.computeVertexNormals(); return g;
})();
const DECK_G = (() => { const g = new THREE.ShapeGeometry(hullShape(0.93)); g.rotateX(-Math.PI / 2); g.translate(0, 0.41, 0); return g; })();
const MAT = {
  deck: new THREE.MeshLambertMaterial({ color: 0xb98d5c, side: THREE.DoubleSide }), // laid teak / varnish
  cabin: new THREE.MeshLambertMaterial({ color: 0xece6d8 }),
  spar: new THREE.MeshLambertMaterial({ color: 0xc7a06a }), // varnished spruce
  // fiberglass boats: off-white non-skid gelcoat deck, anodised aluminium spars
  deckGrp: new THREE.MeshLambertMaterial({ color: 0xb9b5ab, side: THREE.DoubleSide }), // matte non-skid reads darker than the glossy cabin top
  sparAlu: new THREE.MeshPhongMaterial({ color: 0xaeb5bc, specular: 0x9aa0a6, shininess: 70 }),
  wire: new THREE.LineBasicMaterial({ color: 0x333333 })
};

interface Ribbon { geom: THREE.BufferGeometry; anchor: THREE.Vector3; phase: number }
export interface BoatMesh {
  grp: THREE.Group; boomPivot: THREE.Group; jibPivot: THREE.Group; main: Sail; jib: Sail;
  jibTells: { windward: Telltale[]; leeward: Telltale[] }; leechTells: Telltale[];
  pole: THREE.Mesh; ribbons: Ribbon[];
}

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
  const glass = b.build.hull === 'fiberglass', alu = b.build.spars === 'aluminium';
  const hullMat = glass
    ? new THREE.MeshPhongMaterial({ color: b.hullColor, specular: 0x666666, shininess: 60 }) // glossy gelcoat
    : new THREE.MeshLambertMaterial({ color: b.hullColor });
  const spar = alu ? MAT.sparAlu : MAT.spar;
  grp.add(new THREE.Mesh(HULL_G, hullMat));
  grp.add(new THREE.Mesh(DECK_G, glass ? MAT.deckGrp : MAT.deck));
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 2.1), MAT.cabin); cab.position.set(0, 0.56, -0.7); grp.add(cab);
  // aluminium extrusion: constant section; wooden mast: tapered
  const mast = new THREE.Mesh(alu ? new THREE.CylinderGeometry(0.055, 0.06, 9.0, 10) : new THREE.CylinderGeometry(0.05, 0.08, 9.0, 6), spar); mast.position.set(0, 4.9, -0.6); grp.add(mast);
  // Your own sails are slightly see-through, as Dacron is in daylight, so the leeward telltales show through.
  const sailMat = b.isUser
    ? new THREE.MeshLambertMaterial({ color: b.sailColor, side: THREE.DoubleSide, transparent: true, opacity: 0.86 })
    : new THREE.MeshLambertMaterial({ color: b.sailColor, side: THREE.DoubleSide });
  const boomPivot = new THREE.Group(); boomPivot.position.set(0, 0, -0.6); grp.add(boomPivot);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.3, alu ? 10 : 5), spar); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.05, 1.65); boomPivot.add(boom);
  const main = new Sail(MAIN_DEF, sailMat, WINDOW_MAT); boomPivot.add(main.mesh);
  const jibPivot = new THREE.Group(); jibPivot.position.set(0, 0.75, -3.7); grp.add(jibPivot);
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
  grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.75, -3.7), new THREE.Vector3(0, 7.2, -0.6)]), MAT.wire));
  // upper shrouds, each with a cassette-tape telltale tied on low enough to see from the cockpit
  const ribbons: Ribbon[] = [];
  for (const sx of [-1, 1]) {
    const foot = new THREE.Vector3(sx * CHAINPLATE_X, DECK_Y, CHAINPLATE_Z);
    grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([foot, HOUNDS]), MAT.wire));
    const anchor = foot.clone().lerp(HOUNDS, TAPE_HEIGHT / (HOUNDS.y - DECK_Y));
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIBBON_N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < RIBBON_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geom.setIndex(idx);
    const mesh = new THREE.Mesh(geom, RIBBON_MAT); mesh.frustumCulled = false; grp.add(mesh);
    ribbons.push({ geom, anchor, phase: sx * 1.7 + b.id });
  }
  // whisker pole: from the mast to the jib clew when wing-on-wing
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), POLE_MAT); pole.visible = false; grp.add(pole);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.5), new THREE.MeshBasicMaterial({ color: b.color, side: THREE.DoubleSide })); band.position.set(0, 7.6, 0.6); boomPivot.add(band);
  return { grp, boomPivot, jibPivot, main, jib, jibTells, leechTells, pole, ribbons };
}

/** Pose the mesh from the boat state. `t` is wall-clock seconds, for bobbing and flogging. */
export function syncBoatMesh(m: BoatMesh, b: Boat, t: number): void {
  m.grp.position.copy(P3(b.x, b.y, Math.sin(t * 1.3 + b.id) * 0.06));
  m.grp.rotation.y = -b.h * D2R; m.grp.rotation.z = b.heel * D2R; m.grp.rotation.x = Math.sin(t * 0.9 + b.id) * 0.012;
  // positive rotation swings the boom to starboard (+x); b.boom is negative when the wind is from starboard, so it goes to port, to leeward
  m.boomPivot.rotation.y = b.boom * D2R;
  m.jibPivot.quaternion.setFromAxisAngle(JIB_AXIS, b.jib * D2R);
  const plan = sailPlan(b), headToWind = b.twa < 32;
  // main: twists more as the sheet is eased; bubbles at the luff when under-trimmed; flogs when let go
  const tm = b.trim.main, sheetM = Math.abs(b.boom);
  const mainShape: SailShape = {
    twist: 5 + 12 * Math.min(1, sheetM / 50), time: t + b.id,
    bubble: tm.flow === 'luffing' ? Math.min(1, tm.amount * 1.4) : 0,
    flog: b.luff || headToWind ? 0.85 : tm.flow === 'luffing' ? Math.max(0, tm.amount - 0.6) * 2 : 0
  };
  // jib: full when poled out; hangs while the crew handles the pole; collapses behind the main dead downwind
  const tj = b.trim.jib;
  const jibShape: SailShape = {
    twist: 4 + 10 * Math.min(1, Math.abs(b.jib) / 40), time: t * 1.1 + b.id,
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
