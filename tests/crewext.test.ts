import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { buildCrew, syncCrew, tillerJointAt, tillerRootAt, tillerTip } from '../src/render/crew';
import { HEEL, RUDDER_RAKE, rudderGeometry, tillerLift, tillerPivot } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The tiller extension hangs from a universal joint on the tiller's top, near its end: its root stays there, on the
// tiller, whichever way the helm steers and whether it's swung out to the hand or stowed along the tiller. (The old
// extension was placed by its middle, between the joint and the hand, and its root came off the tiller.)
const R = Math.PI / 180;
// the rudder and tiller, put together as boatMesh.ts does: hinged on the raked rudder line, the tiller on its pin
function rudder() {
  const rud = new THREE.Group(); rud.position.set(0, HEEL.y, HEEL.z); rud.rotation.x = RUDDER_RAKE;
  const turn = new THREE.Group(); rud.add(turn); const rg = rudderGeometry();
  turn.add(new THREE.Mesh(rg.blade)); const til = new THREE.Mesh(rg.tiller); til.position.copy(tillerPivot()); turn.add(til);
  return { turn, til };
}
// the extension's root as drawn: the end of the mesh nearest the tiller, along the stick's own axis (wherever the mesh
// is placed from, its middle or its end)
function rootOf(ex: THREE.Mesh): THREE.Vector3 {
  ex.updateMatrix(); const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(ex.quaternion), p = ex.geometry.attributes.position, v = new THREE.Vector3();
  let best = Infinity;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(ex.matrix); const k = v.dot(axis); if (k < best) best = k; }
  // (the axis point at that end: the tube's center, not a vertex on its skin; the tube starts 1 cm out from the joint, inside the joint's fitting)
  const c = new THREE.Vector3().setFromMatrixPosition(ex.matrix); return c.addScaledVector(axis, best - c.dot(axis));
}
// how far a point is from the tiller as drawn: the nearest point of its mesh's surface
function offMesh(p: THREE.Vector3, til: THREE.Mesh) {
  til.parent!.parent!.updateMatrixWorld(true); const g = til.geometry.index ? til.geometry.toNonIndexed() : til.geometry, q = g.attributes.position;
  const tri = new THREE.Triangle(), at = new THREE.Vector3(); let best = Infinity;
  for (let i = 0; i < q.count; i += 3) {
    tri.a.fromBufferAttribute(q, i).applyMatrix4(til.matrixWorld); tri.b.fromBufferAttribute(q, i + 1).applyMatrix4(til.matrixWorld); tri.c.fromBufferAttribute(q, i + 2).applyMatrix4(til.matrixWorld);
    tri.closestPointToPoint(p, at); best = Math.min(best, at.distanceTo(p));
  }
  return best;
}
// how far along the tiller a point is, from its pin to its end
function offTiller(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return { d: p.distanceTo(a.clone().addScaledVector(ab, t)), t };
}

describe("The tiller extension's root sits on the tiller (crew.ts: its joint, tillerJointAt)", () => {
  for (const tack of ['S', 'P'] as const) for (const kt of [8, 18]) it(`${tack === 'S' ? 'starboard' : 'port'} tack, ${kt} kt, to ±${HARD_OVER}°`, () => {
    const twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 5, windKt: kt }); b.tack = tack;
    b.crew = newCrew(DEFAULT_CREW, tack); sail(b, 10);
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), { turn, til } = rudder(), bad: string[] = [];
    const w = tack === 'S' ? 1 : -1;
    for (let deg = -HARD_OVER; deg <= HARD_OVER; deg += 15) {
      turn.rotation.y = deg * R; til.rotation.x = tillerLift(deg * R);
      const joint = tillerJointAt(turn), a = tillerRootAt(turn), e = tillerTip(turn);
      for (let i = 0; i < 20; i++) { sail(b, 1 / 30); syncCrew(cr, w, b.crew, 1 / 30, false, joint, b.heel, b.tacking); }
      const root = rootOf(cr.extension), off = offMesh(root, til), { t } = offTiller(root, a, e);
      // (on the tiller as drawn: its root within 2.5 cm of the tiller's surface (the tube starts 1 cm out of the joint's
      // fitting on its top), at the joint, and in the tiller's outer quarter)
      if (off > 0.025 || root.distanceTo(joint) > 0.02 || t < 0.75) bad.push(`${deg}°: root ${(off * 100).toFixed(1)} cm off the tiller, ${(root.distanceTo(joint) * 100).toFixed(1)} cm from the joint, ${(t * 100).toFixed(0)}% along it`);
    }
    expect(bad).toEqual([]);
  }, 60_000);
});
