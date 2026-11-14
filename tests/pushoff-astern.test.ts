import { describe, expect, it } from 'vitest';
import { HARBORS, hitsHarbor, hitsMooredBoat, pushOffPlan, slipsIn } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { bow, stern } from '../src/boat/boat';

/**
 * Shoved off astern (marina.ts pushOffPlan 'astern'), hands off: the crew gauges the shove to the room (world.ts, the
 * Coordinator's ruling on #317), so she coasts stern first into the fairway and her way's gone before she reaches anything.
 * From when she's clear of her own slip until her sternway is spent, nothing touched: a dock, a finger, the shore or a boat
 * in a slip. Every harbor, in a westerly.
 *
 * In near calm (1 kt) that's what the gauged shove does. In a breeze it can't: the wind on her bare rig keeps driving her
 * astern after the shove (in 12 kt to 0.52 m/s, more than any shove), on her hull's own sternway drag, so hands off she
 * reaches the far side whatever the shove (at 4 kt 4 of the 45 or so touch, 8 kt 11, 12 kt 13). Nobody drifts out of a
 * slip unattended in a breeze: those wait on the steered stern-first exit (helm astern, then the jib up; ROADMAP, after
 * #289's turning at rest), expected failures until it clears all of them.
 */
const WIND = 270;
function astern(kt: number): string[] {
  const bad: string[] = []; let n = 0;
  for (const H of HARBORS) {
    const slips = slipsIn(H.id).filter(s => s.kind === 'bow-in' && pushOffPlan(s, WIND, kt).kind === 'astern');
    for (const s of slips.filter((_, i) => i % Math.max(1, Math.ceil(slips.length / 8)) === 0)) {
      const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
      const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: WIND, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
      const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user; for (let i = 0; i < 30; i++) w.step(DT);
      w.pushOff(); for (let i = 0; i < 60 * 150 && (u.handled || u.pushing); i++) w.step(DT);
      if (u.handled) continue;
      n++;
      const touch = () => [bow(u), stern(u), u].some(p => hitsHarbor(p) || hitsMooredBoat(p, s));
      let clear = false, what = '';
      for (let i = 0; i < 60 * 120; i++) {
        w.step(DT);
        if (!clear) { if (!touch()) clear = true; continue; }
        if (touch()) { what = `touched at ${(u.astern ?? 0).toFixed(2)} m/s astern`; break; }
        if ((u.astern ?? 0) < 0.02) break; // (her way's gone: the helm and her sails take her from here)
      }
      if (!clear) what = 'never clear of her slip';
      if (what) bad.push(`${s.id}: ${what}`);
    }
  }
  expect(n).toBeGreaterThan(30);
  return bad;
}
describe('shoved off astern, hands off, in a westerly', () => {
  it('near calm (1 kt), every harbor: her sternway is spent before she touches anything', () => {
    const bad = astern(1); expect(bad, bad.join('; ')).toEqual([]);
  }, 900_000);
  // (expected failures: the steered stern-first exit, ROADMAP; turn each back to a plain test when it passes)
  for (const kt of [4, 8, 12]) it.fails(`${kt} kt, hands off: waits on the steered stern-first exit`, () => {
    const bad = astern(kt); expect(bad, bad.join('; ')).toEqual([]);
  }, 900_000);
});
