import { describe, expect, it } from 'vitest';
import { slipsIn } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { boomAngle } from '../src/boat/controls';
import { DT, World } from '../src/sim/world';

/**
 * Let go with the main up (a sprint bug, 18 Nov 2026: a crash jibe 4 s after letting go from Josephine's slip, 572, bow
 * east on a dead run in 12 kt from 274). At the dock and through the walk-out a main that's up is let fly, its boom out
 * on the shroud; its sheet had been left made fast hard in from when it was down (the owner's 8q), so the moment she was
 * let go the crew's trim started from that and the boom was hauled from the shroud to her centerline in under a second,
 * then eased out again over 8 s. Dead downwind with the boom amidships the main has nothing to hold it: the wind a degree
 * past her stern and it's across (physics.ts boomStep). A main that's up and let fly has its sheet let run with it.
 */
function leave(mainUp: boolean, windDir = 274) {
  const s = slipsIn('gashouse-cove').find(x => x.id === 'gashouse-cove:572')!;
  const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, windDir, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings, 2, { freeSail: true });
  for (let i = 0; i < 30; i++) w.step(DT);
  const u = w.user;
  const docked = boomAngle(u.ctl);
  if (mainUp) w.setSail('main', true);
  for (let i = 0; i < 60 * 20; i++) w.step(DT); // (hoisted at the dock)
  const hoisted = { boom: Math.abs(u.boom), sheet: boomAngle(u.ctl) };
  w.pushOff();
  for (let t = 0; t < 60 * 150 && (u.handled || u.pushing); t++) { w.step(DT); if (u.handled?.held) w.pushOff(); }
  let least = 99;
  for (let t = 0; t < 60 * 10; t++) { w.step(DT); least = Math.min(least, Math.abs(u.boom)); }
  return { docked, hoisted, least, twa: u.twa, tack: u.tack };
}

describe('let go with the main up', () => {
  it('her main let fly at the dock has its sheet let run: let go on a dead run, the boom stays out on the shroud, not hauled amidships', () => {
    const r = leave(true);
    expect(r.hoisted.boom, 'hoisted at the dock: let fly').toBeGreaterThan(65);
    expect(r.hoisted.sheet, 'and its sheet let run with it').toBeGreaterThan(65);
    expect(r.twa, 'she\'s running').toBeGreaterThan(150);
    // (before the fix, 18 Nov 2026: hauled in to 5° within a second of letting go)
    expect(r.least, 'the boom through the 10 s after she\'s let go').toBeGreaterThan(55);
  }, 120_000);
  it('the main down in her slip, the sheet stays hauled in and made fast, the boom on her centerline (8q)', () => {
    const r = leave(false);
    expect(r.docked).toBeLessThan(10); expect(r.hoisted.boom).toBeLessThan(3); expect(r.hoisted.sheet).toBeLessThan(10);
  }, 120_000);
  it('on the other tack, the wind from 250 (she lies on starboard after her swing): the same, the boom out to port', () => {
    const r = leave(true, 250);
    expect(r.hoisted.sheet).toBeGreaterThan(65); expect(r.least).toBeGreaterThan(55);
  }, 120_000);
});
