import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BS_CHAINPLATE, BS_LEG, ENSIGN_STAFF } from '../src/render/boatMesh';
import { TRANSOM_TOP, deckY, tillerAxis, uAtZ } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The backstay's chainplates (the owner, 18 Nov 2026): "backstay attachments are too far forward. the tiller would run
// right into them. they should sit about one inch forward of the aft edge of the deck, about six inches from the tiller
// on either side." Each plate, and the bridle's leg up from it, stays clear of the tiller through its whole swing.
const R = Math.PI / 180, IN = 0.0254;
/** A plate as drawn (deckFittings): 2.5 cm across, 4 cm high, 4 cm fore and aft, on the deck. */
const plate = (sx: number) => { const { x, z } = BS_CHAINPLATE, y = deckY(uAtZ(z), x) + 0.02; return new THREE.Box3(new THREE.Vector3(sx * x - 0.0125, y - 0.02, z - 0.02), new THREE.Vector3(sx * x + 0.0125, y + 0.02, z + 0.02)); };
/** A leg from its plate up toward the apex at its lowest (the backstay hard on: 1.4 m up, just forward of the plates). */
const leg = (sx: number) => new THREE.Line3(new THREE.Vector3(sx * BS_LEG.x, BS_LEG.y, BS_LEG.z), new THREE.Vector3(0, 1.4, BS_CHAINPLATE.z - 0.1));
/** The tiller's least clearance (m, its round off) from a plate and a leg, turned `deg`. */
function clear(deg: number): number {
  let w = 9; const q = new THREE.Vector3();
  for (const { p, r } of tillerAxis(deg * R, 200)) for (const sx of [-1, 1]) {
    w = Math.min(w, plate(sx).distanceToPoint(p) - r, leg(sx).closestPointToPoint(p, true, q).distanceTo(p) - r);
  }
  return w;
}
describe("The backstay's chainplates (render/boatMesh.ts BS_CHAINPLATE)", () => {
  it('one inch forward of the after deck\'s aft edge, and six inches clear of the tiller amidships', () => {
    expect(TRANSOM_TOP.z - BS_CHAINPLATE.z).toBeCloseTo(IN, 4);
    const tiller = tillerAxis(0, 200), at = tiller.reduce((a, t) => Math.abs(t.p.z - BS_CHAINPLATE.z) < Math.abs(a.p.z - BS_CHAINPLATE.z) ? t : a);
    expect(plate(1).min.x - (at.p.x + at.r)).toBeCloseTo(6 * IN, 2);
  });
  it(`the tiller, swung to hard over (±${HARD_OVER}°) each way, clears both plates and both legs`, () => {
    const bad: string[] = [];
    for (let d = -HARD_OVER; d <= HARD_OVER; d += 0.5) if (clear(d) < 0.005) bad.push(`${d}°: ${(clear(d) * 100).toFixed(1)} cm`);
    expect(bad).toEqual([]);
  });
  it('the ensign staff stays where the owner measured it, clear of the starboard plate', () => {
    expect(ENSIGN_STAFF.base.x).toBeCloseTo(0.46, 2);
    expect(ENSIGN_STAFF.base.x - BS_CHAINPLATE.x).toBeGreaterThan(0.15);
  });
});
