import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { beatAngle } from '../src/boat/polar';
import type { Boat } from '../src/boat/boat';

// A crew resets the cabin top's lines for the course she's on, not for the angles she swings through (physics.ts
// trimSails: settled first; controls.ts GUIDE_BACKLASH). North Sails' Nordic Folkboat guide: "Never use the kickingstrap
// upwind in less than 18 knots"; downwind the kicker holds "the top batten parallel to the boom" (northsails.com, Nordic
// Folkboat Tuning Guide for Aluminium Masts): the vang off on the beat and on on a reach are both the guide's, and in a
// drifter's failed tack, falling off and round, a crew going up for one and back for the other was main's 6 kt seed 4,
// 34 trips (crewstation.test.ts, the cap's history).
const TOP = new Set(['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard']);
/** Steered along `twaAt(t)` (deg off the wind, which is from the north), turning at what that asks: the cabin-top jobs started. */
function steer(kt: number, secs: number, twaAt: (t: number) => number) {
  const b: Boat = testBoat({ heading: 360 - beatAngle(kt), kt: 2.5, windKt: kt }); b.crew = newCrew(JSON.parse(JSON.stringify(DEFAULT_CREW)), 'S');
  const had = b.crew.people.map(() => null as string | null), started: { t: number; line: string }[] = [];
  let was = twaAt(0);
  sail(b, secs, t => {
    const twa = twaAt(t); b.h = (360 - twa) % 360; b.turnRate = -(twa - was) * 60; b.desired = b.h; was = twa;
    b.crew!.people.forEach((a, i) => { const j = a.job?.line ?? null; if (j && j !== had[i] && TOP.has(j)) started.push({ t, line: j }); had[i] = j; });
  });
  return { b, started };
}

describe('In light air the crew set the lines for her course, not the angles she swings through', () => {
  // (5 kt: a beat, settled; then falling off to a reach and back to the wind, again and again, the failed tack's sweep;
  // then held on the reach)
  const beat = beatAngle(5);
  // (at a steady 6°/s each way, as seed 4's boats swung, 60° in 10 s: a sweep, not a course held a while at each end)
  const span = 110 - beat, per = 2 * span / 6, tri = (t: number) => { const u = ((t - 60) % per) / per; return u < 0.5 ? 2 * u : 2 - 2 * u; };
  const swing = (t: number) => t < 60 ? beat : t < 60 + 5 * per + per / 2 ? beat + span * tri(t) : 110;
  it('swinging between the beat and a reach, nobody goes to the cabin top; held on the reach, they set it', () => {
    const r = steer(5, 260, swing);
    expect(r.started.filter(s => s.t >= 60 && s.t < 60 + 5.5 * per), 'cabin-top trips while she swings').toEqual([]);
    expect(r.started.some(s => s.t >= 60 + 5.5 * per && s.line === 'vang'), 'the vang on for the reach once she\'s on it').toBe(true);
  });
  it('a course wandering either side of the guide\'s change from beat to reach, slowly: at most one trip for it', () => {
    // (apparent about 31 to 48°, at half a degree a second: not a turn, but into the guide's 40-60° blend and out; with
    // no backlash, 4 trips in the 340 s)
    const r = steer(5, 400, t => t < 60 ? beat + 20 : beat + 20 + 15 * Math.sin(((t - 60) / 90) * Math.PI));
    expect(r.started.filter(s => s.t >= 60).length, 'cabin-top trips as she wanders').toBeLessThanOrEqual(1);
  });
});
