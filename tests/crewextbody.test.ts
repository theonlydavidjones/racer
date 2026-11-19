import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { buildCrew, fistAt, syncCrew, tillerJointAt, tillerRootAt, type Figure } from '../src/render/crew';
import { HEEL, RUDDER_RAKE, rudderGeometry, tillerLift, tillerPivot } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The owner, 18 Nov 2026: "handle extension coming through skipper's shoulder" (reference/owner-bugs/
// 2026-11-18-extension-through-shoulder.png: seen from behind, the stick up through the back of the shoulder and the
// upper arm, its D-grip above it). The extension, from its joint on the tiller to its far end, never passes through the
// helm's body: their torso and both arms, as capsules round the drawn bones (ESTIMATES of a sailor in foul-weather gear:
// the torso 13 cm in radius, the upper arm 4.5, the forearm 4), save where it goes into the fist holding it. Every 5° to
// hard over both ways, on both tacks, sitting (8 kt) and hiking (18 kt).
const R = Math.PI / 180, STICK = 0.011;
const V = () => new THREE.Vector3();
function rudder() {
  const rud = new THREE.Group(); rud.position.set(0, HEEL.y, HEEL.z); rud.rotation.x = RUDDER_RAKE;
  const turn = new THREE.Group(); rud.add(turn); const rg = rudderGeometry();
  turn.add(new THREE.Mesh(rg.blade)); const til = new THREE.Mesh(rg.tiller); til.position.copy(tillerPivot()); turn.add(til);
  return { turn, til };
}
/** The closest distance between two segments (Ericson, Real-Time Collision Detection 5.1.9). */
function segSeg(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): { d: number; s: number } {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2), a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return { d: p1.distanceTo(p2), s: 0 };
  if (a <= 1e-12) { t = Math.min(1, Math.max(0, f / e)); }
  else { const c = d1.dot(r); if (e <= 1e-12) { s = Math.min(1, Math.max(0, -c / a)); } else { const b = d1.dot(d2), den = a * e - b * b; s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0; t = (b * s + f) / e; if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); } } }
  return { d: p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t)), s };
}
/** The extension as drawn: from its root to its far end, along its mesh's axis. */
function stick(ex: THREE.Mesh): [THREE.Vector3, THREE.Vector3] {
  ex.updateMatrix(); const g = ex.geometry; g.computeBoundingBox(); const bb = g.boundingBox!;
  return [new THREE.Vector3(0, bb.min.y, 0).applyMatrix4(ex.matrix), new THREE.Vector3(0, bb.max.y, 0).applyMatrix4(ex.matrix)];
}
/** A bone's point in the boat's frame. */
const at = (f: Figure, o: THREE.Object3D, local?: THREE.Vector3) => { const w = local ? o.localToWorld(local.clone()) : o.getWorldPosition(V()); return f.root.parent ? f.root.parent.worldToLocal(w) : w; };

describe('The tiller extension never passes through the helm (render/crew.ts)', () => {
  for (const tack of ['S', 'P'] as const) for (const kt of [8, 18]) it(`${tack === 'S' ? 'starboard' : 'port'} tack, ${kt} kt, every 5° to ±${HARD_OVER}°`, () => {
    const twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 5, windKt: kt }); b.tack = tack;
    b.crew = newCrew(DEFAULT_CREW, tack); sail(b, 10);
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), { turn, til } = rudder(), bad: string[] = [];
    const w = tack === 'S' ? 1 : -1;
    for (let deg = -HARD_OVER; deg <= HARD_OVER + 1e-9; deg += deg + 5 > HARD_OVER && deg < HARD_OVER ? HARD_OVER - deg : 5) {
      turn.rotation.y = deg * R; til.rotation.x = tillerLift(deg * R);
      const joint = tillerJointAt(turn); cr.tillerRoot = tillerRootAt(turn);
      for (let i = 0; i < 75; i++) {
        sail(b, 1 / 30); syncCrew(cr, w, b.crew, 1 / 30, false, joint, b.heel, b.tacking);
        if (i < 45 || i % 5) continue; // (settled at each angle first: the extension's swing and the hand's move)
        const h = cr.helm as Figure; h.root.updateWorldMatrix(true, true);
        if (!cr.extension.visible) continue;
        const [a, e] = stick(cr.extension), sh = [0, 1].map(j => at(h, h.arm[j].root)), el = [0, 1].map(j => at(h, h.arm[j].mid));
        const wr = [0, 1].map(j => at(h, h.arm[j].mid, new THREE.Vector3(0, -0.255, 0))), fi = [fistAt(h, 0), fistAt(h, 1)];
        const neck = sh[0].clone().add(sh[1]).multiplyScalar(0.5), hip = at(h, h.root);
        // (the hand holding it: the fist nearest the stick; the stick may go into that fist, and past its wrist)
        const held = [0, 1].sort((x, y) => segSeg(fi[x], fi[x], a, e).d - segSeg(fi[y], fi[y], a, e).d)[0];
        const parts: [string, THREE.Vector3, THREE.Vector3, number][] = [['torso', hip, neck, 0.13], ['upper arm 0', sh[0], el[0], 0.045], ['upper arm 1', sh[1], el[1], 0.045], ['forearm 0', el[0], wr[0], 0.04], ['forearm 1', el[1], wr[1], 0.04]];
        for (const [name, p, q, r] of parts) {
          if (name === `forearm ${held}`) continue; // (the stick comes into that hand's fist, beside its wrist)
          const { d } = segSeg(a, e, p, q), into = r * h.scale + STICK - d;
          if (into > 0.01) bad.push(`${deg.toFixed(1)}°: the extension ${(into * 100).toFixed(1)} cm into the ${name}`);
        }
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  }, 180_000);
});
