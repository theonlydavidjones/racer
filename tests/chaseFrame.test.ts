import { describe, expect, it } from 'vitest';
import { fitChase } from '../src/render/scene';
import { RIG } from '../src/render/boatMesh';
const L = 6.0; // (her waterline: the hull nearest the camera at the water)

// where a point (forward distance z, height y, from the camera) lands on screen, as a fraction of the height down, for a
// camera pitched down by beta with a vertical field of view fov
const screenY = (z: number, y: number, h: number, beta: number, fov: number) => (1 - Math.tan(Math.atan2(y - h, z) + beta) / Math.tan(fov * Math.PI / 360)) / 2;

describe('the chase camera\'s framing (design/chase-layout.html)', () => {
  it('starts with the whole boat between the top strip and the band: masthead an eighth down, the transom just above the band', () => {
    for (const [fov, band] of [[60, 0.82], [60, 0.75], [72, 0.8]]) {
      const ratio = 9 / 24, f = fitChase(fov, band, 0, ratio), h = ratio * f.dist;
      const beta = Math.atan(f.tBot) - Math.atan2(-h, f.dist - L / 2);
      expect(screenY(f.dist - RIG.MAST_Z, RIG.MAST_TOP, h, beta, fov), `${fov}° ${band}`).toBeCloseTo(1 / 8, 2);
      expect(screenY(f.dist - L / 2, 0, h, beta, fov), `${fov}° ${band}`).toBeCloseTo(band - 0.02, 2);
    }
  });
  it('stands further off for a taller band gap, and closer abeam (her beam is nearer than her transom)', () => {
    expect(fitChase(60, 0.7, 0, 0.375).dist).toBeGreaterThan(fitChase(60, 0.85, 0, 0.375).dist);
    expect(fitChase(60, 0.82, Math.PI / 2, 0.375).dist).toBeLessThan(fitChase(60, 0.82, 0, 0.375).dist + L);
  });
});
