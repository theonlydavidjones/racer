import { describe, expect, it } from 'vitest';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { LINE_TAU, TACK_SETTLE, TACK_SPEED } from '../src/boat/crewWork';
import { beatAngle, polar } from '../src/boat/polar';
import type { Boat } from '../src/boat/boat';

// After a tack the helm and the sheets build her speed again, and the crew don't go to the cabin top for a line that
// isn't urgent until she's going (crewWork.ts TACK_SETTLE, TACK_SPEED); and never longer than TACK_SETTLE, so a slow
// light-air tack doesn't leave a line wrong for the beat.
const TOP = new Set(['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard']);
/** A beat in `k0` kt, settled; a tack at 120 s, as the breeze steps to `k1` (a change for the cabin top's lines); then the
 * new tack. The cabin-top jobs started after it, with her speed as a share of what she's to be back up to. */
function tackInto(k0: number, k1: number) {
  const b: Boat = testBoat({ heading: 360 - beatAngle(k0), kt: 3, windKt: k0 }); b.crew = newCrew(JSON.parse(JSON.stringify(DEFAULT_CREW)), 'S');
  const had = b.crew.people.map(() => null as string | null), jobs: { t: number; line: string; share: number }[] = [];
  let tacked = false;
  sail(b, 300, t => {
    if (t >= 120 && !tacked) { tacked = true; b.ww.kt = k1; startTack(b); }
    b.crew!.people.forEach((a, i) => { const j = a.job?.line ?? null;
      if (j && j !== had[i] && TOP.has(j) && t >= 120) jobs.push({ t, line: j, share: b.v / polar(b.ww.kt, Math.max(beatAngle(b.ww.kt), Math.min(180, Math.abs(b.twa ?? 0) + (b.leeway ?? 0)))) });
      had[i] = j; });
  });
  return jobs;
}

describe('Back up to speed after a tack before the cabin top (crewWork.ts TACK_SETTLE)', () => {
  it('in 10 kt, a new breeze at the tack: the lines for it wait till she\'s back to speed, then go', () => {
    const jobs = tackInto(10, 13);
    expect(jobs.length, 'the lines are set for the new breeze').toBeGreaterThan(0);
    // (without the wait: the outhaul at 131 s with her at 72% of her speed, and again at 208 s; with it, once, at 148 s)
    expect(TACK_SETTLE).toBe(60); expect(TACK_SPEED).toBe(0.95);
    for (const j of jobs.filter(j => j.t < 120 + 60)) expect(j.share, `${j.line} at ${j.t.toFixed(1)} s: her speed`).toBeGreaterThanOrEqual(0.945);
  });
  it('in light air, a slow tack: no line left for the beat, at most TACK_SETTLE after the tack', () => {
    // (3 kt to 5 kt at the tack: she's slow to get going, at 90% of her speed when the wait ends, and the guide's
    // settings step at 5 kt. The wait ends TACK_SETTLE after the tack; their own wait for a change that's come to stay,
    // LINE_TAU, can follow it: the outhaul at 201 s, 80 s after the tack, against 159 s without the wait. Not a beat
    // sailed with it wrong: a beat in 3-5 kt is ten minutes and more)
    const jobs = tackInto(3, 5);
    expect(jobs.length, 'the lines are set for the new breeze').toBeGreaterThan(0);
    expect(jobs[0]!.t, 'the first within TACK_SETTLE and LINE_TAU of the tack').toBeLessThan(120 + TACK_SETTLE + LINE_TAU + 5);
  });
});
