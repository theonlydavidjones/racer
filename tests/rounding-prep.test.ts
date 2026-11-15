import { describe, expect, it } from 'vitest';
import { World, DT } from '../src/sim/world';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { crewSkill } from '../src/boat/crewPhys';
import { LOA } from '../src/core/math';

/**
 * The crew get ready for the next leg before a rounding (sim/world.ts roundingPrep): bearing away at the windward mark,
 * the backstay and Cunningham come off before she's turned; rounding up at the leeward mark, the outhaul goes on before.
 * A fleet race on the practice course; the AI boats' crews, each watched up to their first two roundings.
 */
describe('Ready before the mark (crew prep for the next leg)', () => {
  it('in a breeze, the vang and backstay come off before she bears away at the windward mark, and the prep ends once she\'s round', { timeout: 300_000 }, () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'race' as const, windKt: 20, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] };
    const w = new World(courseFile('train'), S, 7);
    const ai = w.boats.filter(b => !b.isUser && crewSkill(b.crew!) >= 0.4);
    expect(ai.length).toBeGreaterThan(0);
    // per boat: the backstay when the prep began, and when she'd borne away past 110° true; whether the prep ended after
    const seen = new Map<number, { at?: number; d?: number; bsAt?: number; bsOff?: number; vAt?: number; vOff?: number; vRun?: number; bsMax?: number; bs2?: number; ended?: boolean; leg0: number }>();
    for (const b of ai) seen.set(b.id, { leg0: -1 });
    for (let i = 0; i < 60 * 900; i++) {
      w.step(DT);
      for (const b of ai) {
        const s = seen.get(b.id)!;
        if (b.leg !== 0 && s.at == null) continue; // (the first mark: the windward one on the practice course)
        if (s.at == null && b.crewPrep?.lines.includes('vang')) { s.at = w.t; s.bsAt = b.ctl.backstay; s.vAt = b.ctl.vang; s.d = Math.hypot(b.x - w.C.marks[0].p.x, b.y - w.C.marks[0].p.y) / LOA; }
        if (s.at != null && s.vRun == null && b.crewPrep?.plan) s.vRun = b.crewPrep.plan.vang; // (what the run wants)
        // (from when the backstay joins the prep, as she starts to turn: never hauled back on through the rest of it)
        if (s.at != null && s.bs2 == null && b.crewPrep?.lines.includes('backstay')) s.bs2 = b.ctl.backstay;
        if (s.bs2 != null && s.bsOff == null) s.bsMax = Math.max(s.bsMax ?? 0, b.ctl.backstay);
        if (s.at != null && s.bsOff == null && Math.abs(b.twa) > 110) { s.bsOff = b.ctl.backstay; s.vOff = b.ctl.vang; }
        if (s.bsOff != null && !s.ended && b.crewPrep == null) s.ended = true;
      }
      if ([...seen.values()].every(s => s.ended)) break;
    }
    const done = [...seen.values()].filter(s => s.at != null);
    expect(done.length, 'some crew got ready before the windward mark').toBeGreaterThan(0);
    expect(done.some(s => s.vAt! > s.vRun! + 0.05), 'at least one crew with the vang harder than the run wants (20 kt)').toBe(true);
    for (const s of done) {
      expect(s.d!, 'just before the mark (the vang, a few seconds out)').toBeLessThan(5);
      expect(s.bs2, 'the backstay joined the prep as she turned').not.toBeUndefined();
      expect(s.bsMax!, 'and was never harder than then, through the bear-away').toBeLessThanOrEqual(s.bs2! + 1e-9);
      expect(s.bsOff!, 'eased by the time she was off').toBeLessThanOrEqual(s.bs2! + 1e-9);
      // (the vang: eased before she bore away where it was harder than the run wants, North Sails: "or the boom might
      // break"; a run often wants more vang than the beat had, and that they set once she's off)
      if (s.vAt! > s.vRun! + 0.05) expect(s.vOff!, 'the vang eased before she bore away').toBeLessThan(s.vAt!);
      expect(s.ended, 'and the prep over once she was round').toBe(true);
    }
  });
});

describe('Ready before the leeward mark', () => {
  it.each([14, 18])('at %i kt, rounding up for a beat, the outhaul (and backstay, Cunningham) go on before she\'s round, never off; in a breeze the backstay for the beat', { timeout: 900_000 }, (kt) => {
    const S = { ...DEFAULT_SETTINGS, mode: 'race' as const, course: 'ss2', windKt: kt, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] };
    const w = new World(courseFile('ss2'), S, 11);
    const ai = w.boats.filter(b => !b.isUser);
    type Seen = { oAt?: number; oUp?: number; oBeat?: number; bsBeat?: number; bsAt?: number; bsUp?: number; tUp?: number; bs10?: number; prepUp?: boolean };
    const seen = new Map<number, Seen>(ai.map(b => [b.id, {}]));
    for (let i = 0; i < 60 * 1500; i++) {
      w.step(DT);
      for (const b of ai) {
        const s = seen.get(b.id)!;
        if (s.tUp != null) { if (s.bs10 == null && w.t - s.tUp >= 10) s.bs10 = b.ctl.backstay; continue; } // (and 10 s on, still)
        if (s.oAt == null && b.crewPrep?.up && b.crewPrep.lines.includes('outhaul')) { s.oAt = b.ctl.outhaul; s.bsAt = b.ctl.backstay; s.prepUp = true; }
        if (s.oAt != null && s.oBeat == null && b.crewPrep?.plan) { s.oBeat = b.crewPrep.plan.outhaul; s.bsBeat = b.crewPrep.plan.backstay; }
        if (s.oAt != null && s.oUp == null && Math.abs(b.twa) < 70) { s.oUp = b.ctl.outhaul; s.bsUp = b.ctl.backstay; s.tUp = w.t; }
      }
      if ([...seen.values()].some(s => s.oUp != null) && w.t > 0 && [...seen.values()].every(s => s.bs10 != null || s.oAt == null) && [...seen.values()].filter(s => s.bs10 != null).length >= 2) break;
    }
    const done = [...seen.values()].filter(s => s.bs10 != null);
    expect(done.length, 'some crew got ready before a leeward mark').toBeGreaterThan(0);
    if (kt === 14) expect(done.some(s => s.oBeat! > s.oAt! + 0.05), 'a crew whose run had the outhaul easier than the beat wants').toBe(true);
    // (in a breeze the beat wants the backstay on, depowered as a beat in this wind is: the plan says so, and it goes on)
    if (kt === 18) for (const s of done) { expect(s.bsBeat!, 'the beat\'s backstay, depowered').toBeGreaterThan(0.3); expect(s.bsUp!, 'on by the time she\'s on the wind').toBeGreaterThan(s.bsAt! - 1e-9); expect(s.bs10!, 'and still on 10 s later: the crew\'s own depowering starts where they set her').toBeGreaterThan(0.8 * s.bsBeat! - 0.05); }
    for (const s of done) {
      expect(s.oUp!, 'the outhaul never eased on the way in').toBeGreaterThanOrEqual(s.oAt! - 1e-9);
      if (s.oBeat! > s.oAt! + 0.05) expect(s.oUp!, 'and on toward the beat\'s setting by the time she\'s on the wind').toBeGreaterThan(s.oAt!);
    }
  });
});

import { testBoat, sail } from './helpers/testBoat';
import { startThreshold } from '../src/boat/crewWork';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { beatAngle } from '../src/boat/polar';
describe('A small change for the next leg still goes before the mark (crewJobs: on what they want now)', () => {
  it('the outhaul a little harder for the beat, 1.5 times the least change they bother with: set within a few seconds', () => {
    const b = testBoat({ heading: 360 - 160, kt: 4, windKt: 12 }); b.crew ??= newCrew(DEFAULT_CREW, 'S');
    sail(b, 60); // (settled on the run)
    const skill = crewSkill(b.crew!), o0 = b.ctl.outhaul, step = 1.5 * startThreshold('outhaul', skill, o0 + 0.1);
    const plan = { ...b.crewPlan!, outhaul: Math.min(1, o0 + step) };
    b.crewPrep = { key: 'test', t0: 0, lines: ['outhaul'], awa: 40, aws: 12, depower: 0, up: true, plan };
    let moved = -1; sail(b, 8, t => { if (moved < 0 && b.ctl.outhaul > o0 + 0.005) moved = t; });
    expect(moved, 'the outhaul on its way within 8 s').toBeGreaterThanOrEqual(0);
    expect(b.ctl.outhaul).toBeGreaterThan(o0);
    void beatAngle;
  });
});
