import { describe, expect, it } from 'vitest';
import { SLIPS } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';

// At the dock and leaving it under bare poles the crew sit centred, not hiked or to leeward (the owner, 13 Nov 2026):
// physics.ts crewAtDock, and an upright heel aimed for with the sails struck. Their weight moves only her heel.

const atSlip = (windKt: number) => {
  const slip = SLIPS[0], boat = { ...DEFAULT_BOAT, slip: slip.id };
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
  return new World(COURSES[0], S, 1, { freeSail: true });
};
/** The furthest any crew member's arm (|x|, m) is from the middle over `secs`, once they've had 20 s to settle; and the
 * most any of them leaned out. */
function spread(w: World, secs: number) {
  const u = w.user; let far = 0, lean = 0;
  for (let i = 0; i < 20 * 60; i++) w.step(DT);
  for (let i = 0; i < secs * 60; i++) { w.step(DT); for (const p of u.crew!.people.slice(1)) { far = Math.max(far, Math.abs(p.x)); lean = Math.max(lean, p.lean); } }
  return { far, lean };
}

describe('the crew at the dock', () => {
  for (const W of [6, 18])
    it(`in her slip in ${W} kt, made fast, sails down: the crew sit in the middle, not out on the rail or to leeward`, () => {
      const w = atSlip(W), u = w.user; expect(u.docked).toBeTruthy();
      const { far, lean } = spread(w, 30);
      expect(far, 'arm from the middle, m').toBeLessThan(0.3); expect(lean).toBe(0);
      expect(u.crew!.people.slice(1).every(p => p.pose === 'sit')).toBe(true);
    }, 30_000);
  it('pushed off and walked out under bare poles: still in the middle, no hiking', () => {
    const w = atSlip(14), u = w.user;
    for (let i = 0; i < 5 * 60; i++) w.step(DT);
    expect(w.pushOff()).toBe(true);
    for (let i = 0; i < 20 * 60; i++) w.step(DT); // (settled at the dock first)
    let far = 0, lean = 0, n = 0;
    for (let i = 0; i < 60 * 60 && (u.handled || n < 20 * 60); i++) { w.step(DT); if (!u.handled) n++; for (const p of u.crew!.people.slice(1)) { if (p.job?.station) continue; far = Math.max(far, Math.abs(p.x)); lean = Math.max(lean, p.lean); } }
    expect(far, 'arm from the middle, m').toBeLessThan(0.45); expect(lean).toBeLessThan(0.05);
  }, 60_000);
});
