import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { LL } from '../src/geo/geo';
import { HARBOR } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { place } from '../src/sim/places';
import { dropAt } from '../src/ui/planChart';
import type { Vec } from '../src/core/math';

// the owner: "a larger chart view to pick the start and the end in one map, without bouncing between two pickers".
// A pin dropped on the big chart goes where the setup's small chart would put it, with its land checks.
const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', sea: 'flat' };
const w = new World(COURSES[0], S, 7, { freeSail: true });
/** a chart at 0.1 px/m: the screen distance from q */
const far = (q: Vec) => (p: Vec) => Math.hypot(p.x - q.x, p.y - q.y) * 0.1;

describe("the planner's pins", () => {
  it('refuse the land', () => {
    const q = LL(37.7990, -122.4560); expect(onLand(q)).toBe(true); // (the Presidio)
    const d = dropAt(w, q, far(q)); expect('err' in d && d.err).toMatch(/land/);
  });
  it('refuse the inside of a harbor (her slip is the way in)', () => {
    const b = HARBOR.basin, q = { x: b.reduce((s, p) => s + p.x, 0) / b.length, y: b.reduce((s, p) => s + p.y, 0) / b.length };
    const d = dropAt(w, q, far(q));
    expect('err' in d).toBe(true); if ('err' in d) expect(d.err).toMatch(/harbor/);
  });
  it('take a place by its name when dropped on it, and open water as a spot', () => {
    const al = place('alcatraz')!, q = { x: al.p.x + 50, y: al.p.y }; // (5 px off it)
    expect(dropAt(w, q, far(q))).toMatchObject({ id: 'alcatraz' });
    const open = LL(37.8300, -122.4500), d = dropAt(w, open, far(open));
    expect('id' in d && d.id.startsWith('at:')).toBe(true);
  });
});
