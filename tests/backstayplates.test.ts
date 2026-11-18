import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HEEL, RUDDER_RAKE, TRANSOM_TOP, rudderGeometry, tillerPivot } from '../src/render/hull';
import { tillerRootAt, tillerTip } from '../src/render/crew';
import { BACKSTAY_PLATES, bridleLegs } from '../src/render/boatMesh';
import { HARD_OVER } from '../src/boat/balance';

// The owner, 18 Nov 2026 (ROADMAP 8q4, r248): "backstay attachments are too far forward. the tiller would run right into
// them. they should sit about one inch forward of the aft edge of the deck, about six inches from the tiller on either
// side." The tiller, swung on its arc to hard over each way (the deck's stop, balance.ts HARD_OVER), clears both
// chainplates and both of the bridle's legs up from them, its axis kept a 2.8 cm tiller's radius and 2 cm more away.
const R = Math.PI / 180, CLEAR = 0.028 + 0.02;
function rudder() {
  const rud = new THREE.Group(); rud.position.set(0, HEEL.y, HEEL.z); rud.rotation.x = RUDDER_RAKE;
  const turn = new THREE.Group(); rud.add(turn); const rg = rudderGeometry();
  turn.add(new THREE.Mesh(rg.blade)); const til = new THREE.Mesh(rg.tiller); til.position.copy(tillerPivot()); turn.add(til);
  return { turn, til };
}
function segSeg(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): number {
  let best = Infinity; const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i <= 60; i++) { a.lerpVectors(p1, q1, i / 60); for (let j = 0; j <= 60; j++) best = Math.min(best, a.distanceTo(b.lerpVectors(p2, q2, j / 60))); }
  return best;
}
describe('The backstay chainplates sit where the owner has them, clear of the tiller (boatMesh.ts)', () => {
  it('on the after deck an inch forward of its aft edge, each side of the tiller', () => {
    for (const p of BACKSTAY_PLATES) { expect(TRANSOM_TOP.z - p.z).toBeGreaterThan(0.015); expect(TRANSOM_TOP.z - p.z).toBeLessThan(0.04); }
  });
  for (const apexY of [2.7, 1.4]) it(`the tiller clears the plates and the bridle's legs to ±${HARD_OVER}°, the backstay ${apexY > 2 ? 'off' : 'on hard'}`, () => {
    const { turn } = rudder(), bad: string[] = [];
    for (let deg = -HARD_OVER; deg <= HARD_OVER + 1e-9; deg += 0.5) {
      turn.rotation.y = deg * R; turn.updateMatrixWorld(true);
      const a = tillerRootAt(turn), e = tillerTip(turn);
      for (const [n, p] of BACKSTAY_PLATES.entries()) { const top = p.clone().add(new THREE.Vector3(0, 0.05, 0)), d = segSeg(a, e, p, top); if (d < CLEAR) bad.push(`${deg}°: the tiller ${(d * 100).toFixed(1)} cm from the ${n ? 'starboard' : 'port'} plate`); }
      for (const [n, [p, q]] of bridleLegs(apexY).entries()) { const d = segSeg(a, e, p, q); if (d < CLEAR) bad.push(`${deg}°: the tiller ${(d * 100).toFixed(1)} cm from the ${n ? 'starboard' : 'port'} leg`); }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });
});
