import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { boatShadows, farShadows, CAST_FAR, CAST_BACK } from '../src/render/fittings';

// far boats cast no shadow (under a texel of the sun's map), with a gap so a boat on the line doesn't flicker
describe('far boats cast no shadow', () => {
  const g = new THREE.Group(); const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 7)); g.add(hull); boatShadows(g);
  it('casts near, stops past CAST_FAR, and only starts again inside CAST_BACK', () => {
    expect(hull.castShadow).toBe(true);
    farShadows(g, CAST_FAR - 1); expect(hull.castShadow).toBe(true);
    farShadows(g, CAST_FAR + 1); expect(hull.castShadow).toBe(false);
    farShadows(g, (CAST_FAR + CAST_BACK) / 2); expect(hull.castShadow).toBe(false); // (in the gap: stays as it was)
    farShadows(g, CAST_BACK - 1); expect(hull.castShadow).toBe(true);
    farShadows(g, (CAST_FAR + CAST_BACK) / 2); expect(hull.castShadow).toBe(true);
  });
});
