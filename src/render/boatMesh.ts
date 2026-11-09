import './three-setup';
import * as THREE from 'three';
import { D2R } from '../core/math';
import type { Boat } from '../boat/boat';
import { P3 } from './coords';

function sailGeom(tack: number[], head: number[], clew: number[], depth: number): THREE.BufferGeometry {
  const R = 8, C = 5, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const lx = tack[1] + (head[1] - tack[1]) * t, lz = tack[2] + (head[2] - tack[2]) * t;
    const fx = clew[1] + (head[1] - clew[1]) * t, fz = clew[2] + (head[2] - clew[2]) * t;
    for (let j = 0; j <= C; j++) { const s = j / C; pos.push(depth * Math.sin(Math.PI * s) * (1 - t * 0.75), lx + (fx - lx) * s, lz + (fz - lz) * s); }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const a = i * (C + 1) + j, b = a + 1, c = a + C + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const MAIN_G = sailGeom([0, 1.05, 0], [0, 9.3, 0.05], [0, 1.05, 3.3], 0.45);
const JIB_G = sailGeom([0, 0, 0], [0, 6.1, 2.35], [0, 0.35, 2.9], 0.38);
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

export interface BoatMesh { grp: THREE.Group; boomPivot: THREE.Group; jibPivot: THREE.Group; main: THREE.Mesh; jib: THREE.Mesh }

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
  const sailMat = new THREE.MeshLambertMaterial({ color: b.sailColor, side: THREE.DoubleSide });
  const boomPivot = new THREE.Group(); boomPivot.position.set(0, 0, -0.6); grp.add(boomPivot);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.3, alu ? 10 : 5), spar); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.05, 1.65); boomPivot.add(boom);
  const main = new THREE.Mesh(MAIN_G, sailMat); boomPivot.add(main);
  const jibPivot = new THREE.Group(); jibPivot.position.set(0, 0.75, -3.7); grp.add(jibPivot);
  const jib = new THREE.Mesh(JIB_G, sailMat); jibPivot.add(jib);
  grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.75, -3.7), new THREE.Vector3(0, 7.2, -0.6)]), MAT.wire));
  const band = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.5), new THREE.MeshBasicMaterial({ color: b.color, side: THREE.DoubleSide })); band.position.set(0, 7.6, 0.6); boomPivot.add(band);
  return { grp, boomPivot, jibPivot, main, jib };
}

/** Pose the mesh from the boat state. `t` is wall-clock seconds, for bobbing and flogging. */
export function syncBoatMesh(m: BoatMesh, b: Boat, t: number): void {
  m.grp.position.copy(P3(b.x, b.y, Math.sin(t * 1.3 + b.id) * 0.06));
  m.grp.rotation.y = -b.h * D2R; m.grp.rotation.z = b.heel * D2R; m.grp.rotation.x = Math.sin(t * 0.9 + b.id) * 0.012;
  // positive rotation swings the boom to starboard (+x); b.boom is negative when the wind is from starboard, so it goes to port, to leeward
  m.boomPivot.rotation.y = b.boom * D2R;
  m.jibPivot.quaternion.setFromAxisAngle(JIB_AXIS, b.jib * D2R);
  const luffing = b.luff || b.twa < 32;
  const flapM = luffing ? 0.25 * Math.sin(t * 17 + b.id) : 1;
  // dead downwind the main blankets the jib, so it collapses and refills
  const flapJ = luffing ? 0.25 * Math.sin(t * 15 + b.id) : b.awa > 160 ? 0.35 + 0.4 * Math.abs(Math.sin(t * 1.7 + b.id)) : 1;
  m.main.scale.x = Math.sign(b.boom || 1) * flapM;
  m.jib.scale.x = Math.sign(b.jib || 1) * flapJ;
}
