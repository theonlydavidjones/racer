import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { beatAngle } from '../src/boat/polar';
import type { Boat } from '../src/boat/boat';
import { depowerLimits } from '../src/boat/controls';
import { LINE_GAP } from '../src/boat/crewWork';

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
  it('the breeze coming on while you work the helm: they depower as soon as with a steady helm, the helm\'s corrections no swing (the physics review)', () => {
    // (a beat in 8 kt; at 120 s, 16 kt and staying; your helm tapping a key a fifth of a second every 4 s, each way: up to
    // 5°/s for a moment. Before the gate read a kept-up turn, that held the outhaul's trip 100 s behind a steady helm's,
    // and the jib halyard unset after 6 minutes. The guide reads the breeze she's sailing in, her 20 s wind, so the new
    // breeze is seen within a gust-lull cycle, LINE_GAP, either way)
    const run = (tap: boolean) => {
      const b: Boat = testBoat({ heading: 360 - beatAngle(8), kt: 4, windKt: 8 }); b.crew = newCrew(JSON.parse(JSON.stringify(DEFAULT_CREW)), 'S');
      const had = b.crew.people.map(() => null as string | null), first: Record<string, number> = {};
      sail(b, 300, t => {
        b.ww.kt = t < 120 ? 8 : 16; const u = t % 4; b.steer = !tap ? 0 : u < 0.2 ? 1 : u >= 2 && u < 2.2 ? -1 : 0;
        b.crew!.people.forEach((a, i) => { const j = a.job?.line ?? null; if (j && j !== had[i] && TOP.has(j) && t >= 120) first[j] ??= t; had[i] = j; });
      });
      return { b, first };
    };
    const steady = run(false), worked = run(true);
    expect(worked.first.outhaul, 'the outhaul flattened within a gust-lull cycle of the breeze').toBeLessThan(120 + LINE_GAP);
    expect(Math.abs(worked.first.outhaul! - steady.first.outhaul!), 'as soon as with a steady helm').toBeLessThan(5);
    const b = worked.b, L = depowerLimits(b.depower ?? 0, b.awaSlow, 16, b.guideAwa);
    for (const k of ['outhaul', 'cunningham'] as const) expect(b.ctl[k], `${k} up to its floor`).toBeGreaterThan((L.min[k] ?? 0) - 0.05);
  });
  it('a steady close reach is set the same whichever way she came to it: from the beat or from a broad reach', () => {
    // (the backlash stops a wandering course flipping the guide's settings, then gives way to her angle: held at the
    // beat's for the leg, the vang stayed off for the reach, against the guide's top batten parallel to the boom)
    const reach = (from: number) => {
      const b: Boat = testBoat({ heading: 360 - from, kt: 4, windKt: 8 }); b.crew = newCrew(JSON.parse(JSON.stringify(DEFAULT_CREW)), 'S');
      sail(b, 420, t => { const a = t < 60 ? from : from + (85 - from) * Math.min(1, (t - 60) / 20); b.h = (360 - a) % 360; });
      return { ga: b.guideAwa!, cap: depowerLimits(b.depower ?? 0, b.awaSlow, 8, b.guideAwa).max.vang ?? 1, awa: Math.abs(b.awaSlow) };
    };
    const up = reach(42), down = reach(120);
    expect(Math.abs(up.ga - up.awa), 'come to her angle from the beat').toBeLessThan(1);
    expect(Math.abs(down.ga - down.awa), 'and from a broad reach').toBeLessThan(1);
    expect(Math.abs(up.cap - down.cap), 'the guide\'s vang ceiling the same either way').toBeLessThan(0.02);
  });
});
