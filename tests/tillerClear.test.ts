import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COAMING_H, COCKPIT, HEEL, L, RUDDER_RAKE, cockpitHalf, deckY, halfBeam, sheer, tillerPath, uAtZ } from '../src/render/hull';
import { HARD_OVER } from '../src/boat/balance';

// The tiller put over to hard over either way (balance.ts HARD_OVER, 75°: the owner's own boat), turning about her raked
// hinge: no part of it below the deck, the toerail (3.5 cm on the sheer), the coaming or, out past the rail, the deck's
// edge (hull.ts TILLER: its rise from the rudder head)
const COCK1 = -L / 2 + COCKPIT.u1 * L, X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
describe('The tiller clears the deck at every angle to hard over (hull.ts tillerPath)', () => {
  it(`clear by 2 cm or more, to ±${HARD_OVER}°`, () => {
    const pts = tillerPath(60); let worst = 9, at = '';
    for (let deg = -HARD_OVER; deg <= HARD_OVER; deg += 2.5) pts.forEach((p, i) => {
      const q = p.clone().applyAxisAngle(Y, deg * Math.PI / 180).applyAxisAngle(X, RUDDER_RAKE).add(new THREE.Vector3(0, HEEL.y, HEEL.z));
      const u = uAtZ(q.z); if (u > 1) return; // (aft of the transom: the rudder head, over the water)
      const hb = halfBeam(u), ax = Math.abs(q.x), rad = 0.028 + (0.018 - 0.028) * i / (pts.length - 1);
      let floor = ax < hb ? deckY(u, ax) : sheer(u);
      if (ax > hb - 0.08) floor = Math.max(floor, sheer(u) + 0.035); // (the toerail, and the deck's edge outboard of it)
      if (q.z < COCK1 + 0.02 && ax > cockpitHalf(u) - 0.02 && ax < cockpitHalf(u) + 0.06) floor = Math.max(floor, deckY(u, ax) + COAMING_H(q.z)); // (the coaming)
      const c = q.y - rad - floor; if (c < worst) { worst = c; at = `${deg}°, (${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)})`; }
    });
    expect(worst, at).toBeGreaterThan(0.02);
  });
});
