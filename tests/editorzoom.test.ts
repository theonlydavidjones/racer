import { describe, expect, it } from 'vitest';
import { FAR, NEAR, SHOW_CHASE, zoomShowroom } from '../src/app/boatLesson';

// r292, the owner: "let me zoom in on the boat in the boat editor." The wheel over her in the showroom (the editor, her page,
// lesson 1) brings the camera in or out from SHOW_CHASE, within the showroom's limits. (Before, the editor put the camera
// back at 10 m every frame, so the wheel did nothing there: scripts in the r292 commit measured 10.33 m before and after.)
describe('The boat editor zooms (src/app/boatLesson.ts zoomShowroom, r292)', () => {
  it('a notch up comes closer, a notch down goes farther', () => {
    expect(zoomShowroom(SHOW_CHASE, -100)).toBeLessThan(SHOW_CHASE);
    expect(zoomShowroom(SHOW_CHASE, 100)).toBeGreaterThan(SHOW_CHASE);
    expect(zoomShowroom(zoomShowroom(SHOW_CHASE, -100), 100)).toBeCloseTo(SHOW_CHASE, 9); // (in and back out: where it was)
  });
  it('never nearer than NEAR or farther than FAR, however far the wheel turns', () => {
    let d = SHOW_CHASE; for (let i = 0; i < 100; i++) d = zoomShowroom(d, -100); expect(d).toBe(NEAR);
    for (let i = 0; i < 100; i++) d = zoomShowroom(d, 100); expect(d).toBe(FAR);
    expect(NEAR).toBeLessThan(SHOW_CHASE); expect(FAR).toBeGreaterThan(SHOW_CHASE);
  });
});
