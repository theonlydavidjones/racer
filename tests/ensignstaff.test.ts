import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ENSIGN_STAFF } from '../src/render/boatMesh';
import { HEEL, RUDDER_RAKE, deckY, halfBeam, rudderGeometry, tillerLift, tillerPivot, uAtZ } from '../src/render/hull';
import { tillerRootAt, tillerTip } from '../src/render/crew';
import { HARD_OVER } from '../src/boat/balance';

// The ensign staff stands in a socket in the after deck at the starboard quarter, as Josephine's does (the owner's
// photos, reference/photos/josephine-ensign-socket-port-quarter.jpg and josephine-helm-on-aft-deck-underway.jpg); not floating (the owner, 18 Nov 2026: its foot ended in
// the air past the transom), and clear of the tiller's sweep to hard over both ways. The staff is part of the hull's own
// frame, drawn in her group: what holds here holds at every heel and on either tack, the boat heeling and turning with it.
const segDist = (a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3) => {
  let best = Infinity; const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i <= 40; i++) { p.lerpVectors(a0, a1, i / 40); for (let j = 0; j <= 40; j++) best = Math.min(best, p.distanceTo(q.lerpVectors(b0, b1, j / 40))); }
  return best;
};
describe('The ensign staff (boatMesh.ts ENSIGN_STAFF)', () => {
  const { base, top } = ENSIGN_STAFF, u = uAtZ(base.z);
  it('its foot is seated on the deck, inboard of the rail', () => {
    expect(Math.abs(base.y - deckY(u, Math.abs(base.x)))).toBeLessThan(0.003);
    expect(Math.abs(base.x)).toBeLessThan(halfBeam(u) - 0.03); // (a socket's room inside the rail)
    expect(base.x).toBeGreaterThan(0); // (the starboard quarter, as hers)
  });
  it(`clear of the tiller swept to ±${HARD_OVER}°: 2 cm between them at the least`, () => {
    const rud = new THREE.Group(); rud.position.set(0, HEEL.y, HEEL.z); rud.rotation.x = RUDDER_RAKE;
    const turn = new THREE.Group(); rud.add(turn); const rg = rudderGeometry(); turn.add(new THREE.Mesh(rg.blade));
    const til = new THREE.Mesh(rg.tiller); til.position.copy(tillerPivot()); turn.add(til);
    const bad: string[] = [];
    for (let deg = -HARD_OVER; deg <= HARD_OVER; deg += 5) {
      turn.rotation.y = deg * Math.PI / 180; til.rotation.x = tillerLift(deg * Math.PI / 180);
      // (axis to axis, less the tiller's 2.8 cm and the staff's 1.6 cm at their thickest)
      const gap = segDist(base, top, tillerRootAt(turn), tillerTip(turn)) - 0.028 - 0.016;
      if (gap < 0.02) bad.push(`${deg}°: ${(gap * 100).toFixed(1)} cm`);
    }
    expect(bad).toEqual([]);
  });
});
