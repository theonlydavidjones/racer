import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';

/**
 * Lashing the tiller at the angle the page meant (sim/commands.ts 'lash' with `at`). The owner, 15 Nov 2026: "tiller
 * lashing is glitching when I try to lash it less than 13ish degrees off centerline. it just lashes it amidships." The
 * page's own copy of the race is a frame or two behind, and its tiller spring had eased a small angle to amidships by the
 * time the lash landed; the lash now carries the angle meant.
 */
const fresh = () => new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [] } as Settings, 1);
describe("The tiller lashed where it's meant (sim/commands.ts lash)", () => {
  it('at 5°, 10° and 15° of rudder each way, whatever the tiller is when the command lands', () => {
    for (const deg of [5, 10, 15, -5, -10, -15]) {
      const w = fresh(), at = deg / 30;
      applyCommand(w, { k: 'tiller', v: 0 }); // (the spring had already eased it to amidships)
      applyCommand(w, { k: 'lash', on: true, at });
      expect(w.user.lashed).toBeCloseTo(at, 6); expect(w.user.tiller).toBeCloseTo(at, 6);
    }
  });
  it('without an angle, where the tiller is (as before); a tiller command moves a lashing (dragging it); off is off', () => {
    const w = fresh();
    applyCommand(w, { k: 'tiller', v: 0.4 }); applyCommand(w, { k: 'lash', on: true }); expect(w.user.lashed).toBeCloseTo(0.4, 6);
    applyCommand(w, { k: 'tiller', v: -0.2 }); expect(w.user.lashed).toBeCloseTo(-0.2, 6);
    applyCommand(w, { k: 'lash', on: false }); expect(w.user.lashed).toBeNull();
    // (an angle that isn't a number, a page with no width: where the tiller is, never NaN into the physics)
    applyCommand(w, { k: 'tiller', v: 0.25 }); applyCommand(w, { k: 'lash', on: true, at: NaN }); expect(w.user.lashed).toBeCloseTo(0.25, 6);
  });
});
