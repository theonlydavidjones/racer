import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, FOOTWELL_MOVE, FOOTWELL_STEP, FOOTWELL_X, Z, newCrew } from '../src/boat/crewPhys';
import { beatAngle } from '../src/boat/polar';
import { testBoat, sail, startTack } from './helpers/testBoat';

// Along the cockpit the crew go by the footwell (crewPhys.ts FOOTWELL_MOVE): in off the bench, fore or aft, then out,
// not along the bench or the side deck past the others and the winch. Sailed through what moves them: a beat in light
// air and a breeze, tacks, a bear-away to a run and back up, the cabin-top lines seen to as she goes.
describe('the crew walk the footwell along the cockpit (crewPhys.ts FOOTWELL_MOVE)', () => {
  for (const kt of [6, 12, 20]) it(`in ${kt} kt: anyone going fore or aft in the cockpit is in the footwell`, () => {
    const twa = beatAngle(kt), b = testBoat({ heading: 360 - twa, kt: 4, windKt: kt });
    b.crew = newCrew(DEFAULT_CREW, 'S');
    let moves = 0, wide = 0, worst = 0;
    const was = b.crew.people.map(p => ({ x: p.x, z: p.z }));
    const watch = () => {
      b.crew!.people.forEach((p, i) => {
        const dz = Math.abs(p.z - was[i].z) * 60, inside = p.z > Z.bulkhead && p.z < Z.thwart;
        // (on a long way along: their goal still more than FOOTWELL_MOVE off; a shuffle along the rail hiking isn't one)
        const far = p.goal != null && Math.min(Math.max(p.z, p.goal.z), Z.thwart) - Math.max(Math.min(p.z, p.goal.z), Z.bulkhead) > FOOTWELL_MOVE;
        if (i > 0 && inside && dz > 0.1 && far) { moves++; if (Math.abs(p.x) > FOOTWELL_X + FOOTWELL_STEP + 0.01) { wide++; worst = Math.max(worst, Math.abs(p.x)); } }
        was[i].x = p.x; was[i].z = p.z;
      });
    };
    sail(b, 60, () => { watch(); });
    for (let k = 0; k < 2; k++) { startTack(b); sail(b, 40, () => { watch(); }); }
    const run = b.tack === 'S' ? 360 - 170 : 170; b.turnTarget = (b.ww.from + run) % 360; b.turnDir = b.tack === 'S' ? -1 : 1;
    sail(b, 60, () => { watch(); });
    b.turnTarget = (b.ww.from + (b.tack === 'S' ? 360 - twa : twa)) % 360; b.turnDir = b.tack === 'S' ? 1 : -1;
    sail(b, 60, () => { watch(); });
    expect(moves, 'steps taken fore and aft in the cockpit').toBeGreaterThan(0);
    expect(wide, `steps fore and aft out on the bench (furthest out ${worst.toFixed(2)} m)`).toBe(0);
  }, 120_000);
});
