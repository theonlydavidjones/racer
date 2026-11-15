import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';

// (in each other's way: closer along than two seats side by side, Z.gap's 0.5 m, and within a body's width across; the
// physics keeps a stride and a body's width, crewPhys.ts CREW_SEP and CREW_PASS)
const SEP = 0.45, PASS = 0.35;
import { testBoat, sail } from './helpers/testBoat';

// Two crew going forward together (crewPhys.ts CREW_SEP, CREW_PASS): on a run in light air, the pole called for, both go
// up to the foredeck, the bow hand on to the stem. Never level with each other, a body's width apart or less: the one
// behind keeps back, one passing steps aside first.
describe('two crew on the move keep clear of each other (crewPhys.ts CREW_SEP, CREW_PASS)', () => {
  for (const side of [1, -1]) it(`going forward for the pole, on ${side > 0 ? 'starboard' : 'port'}`, () => {
    const twa = 172, b = testBoat({ heading: (360 + side * -twa) % 360, kt: 3, windKt: 7 });
    b.crew = newCrew(DEFAULT_CREW, side > 0 ? 'S' : 'P');
    sail(b, 60, () => { b.h = (360 + side * -twa) % 360; });
    (b as unknown as { poleWant: boolean }).poleWant = true;
    // (from the cockpit, as Crew Figures' clip has it: the one going furthest, the bow hand, behind the other and on the
    // same side, so they set off in file and the bow hand has to get by)
    const [, p1, p2] = b.crew.people; p1.x = 0.15 * side; p1.z = 1.37; p2.x = 0.18 * side; p2.z = 1.87; p1.goal = p2.goal = null;
    const z0 = b.crew.people.map(p => p.z);
    let worst = Infinity, foreBy = Infinity, at = 0, moved = 0;
    sail(b, 40, t => { b.h = (360 + side * -twa) % 360;
      const [, p, q] = b.crew!.people, dz = Math.abs(p.z - q.z), dx = Math.abs(p.x - q.x);
      // (how far inside both the stride and the width they come: 0 is touching the edge of it)
      if (dz < SEP && dx < PASS) { const d = Math.max(dz / SEP, dx / PASS); if (d < worst) { worst = d; at = t; } }
      foreBy = Math.min(foreBy, p.z, q.z); });
    moved = Math.max(...b.crew.people.slice(1).map((p, i) => z0[i + 1] - p.z));
    expect(moved, 'went forward').toBeGreaterThan(2);
    expect(foreBy, 'one up on the foredeck').toBeLessThan(-1.5);
    expect(worst, `level with each other, within a body (at ${at.toFixed(1)} s)`).toBe(Infinity);
  }, 120_000);
});
