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
    const seen = new Map<number, { at?: number; d?: number; bsAt?: number; bsOff?: number; vAt?: number; vOff?: number; vRun?: number; ended?: boolean; leg0: number }>();
    for (const b of ai) seen.set(b.id, { leg0: -1 });
    for (let i = 0; i < 60 * 900; i++) {
      w.step(DT);
      for (const b of ai) {
        const s = seen.get(b.id)!;
        if (b.leg !== 0 && s.at == null) continue; // (the first mark: the windward one on the practice course)
        if (s.at == null && b.crewPrep?.lines.includes('vang')) { s.at = w.t; s.bsAt = b.ctl.backstay; s.vAt = b.ctl.vang; s.d = Math.hypot(b.x - w.C.marks[0].p.x, b.y - w.C.marks[0].p.y) / LOA; }
        if (s.at != null && s.vRun == null && b.crewPrep?.plan) s.vRun = b.crewPrep.plan.vang; // (what the run wants)
        if (s.at != null && s.bsOff == null && Math.abs(b.twa) > 110) { s.bsOff = b.ctl.backstay; s.vOff = b.ctl.vang; }
        if (s.bsOff != null && !s.ended && b.crewPrep == null) s.ended = true;
      }
      if ([...seen.values()].every(s => s.ended)) break;
    }
    const done = [...seen.values()].filter(s => s.at != null);
    expect(done.length, 'some crew got ready before the windward mark').toBeGreaterThan(0);
    expect(done.some(s => s.vAt! > s.vRun! + 0.05), 'at least one crew with the vang harder than the run wants (20 kt)').toBe(true);
    for (const s of done) {
      expect(s.d!, 'a few lengths out').toBeLessThan(5);
      expect(s.bsOff!, 'the backstay no harder by the time she\'d borne away').toBeLessThanOrEqual(s.bsAt!);
      // (the vang: eased before she bore away where it was harder than the run wants, North Sails: "or the boom might
      // break"; a run often wants more vang than the beat had, and that they set once she's off)
      if (s.vAt! > s.vRun! + 0.05) expect(s.vOff!, 'the vang eased before she bore away').toBeLessThan(s.vAt!);
      expect(s.ended, 'and the prep over once she was round').toBe(true);
    }
  });
});

describe('Ready before the leeward mark', () => {
  it('rounding up for a beat, the outhaul (and backstay, Cunningham) go on before she\'s round, never off', { timeout: 600_000 }, () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'race' as const, course: 'ss2', windKt: 14, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] };
    const w = new World(courseFile('ss2'), S, 11);
    const ai = w.boats.filter(b => !b.isUser);
    type Seen = { oAt?: number; oUp?: number; oBeat?: number; prepUp?: boolean };
    const seen = new Map<number, Seen>(ai.map(b => [b.id, {}]));
    for (let i = 0; i < 60 * 1500; i++) {
      w.step(DT);
      for (const b of ai) {
        const s = seen.get(b.id)!; if (s.oUp != null) continue;
        if (s.oAt == null && b.crewPrep?.up && b.crewPrep.lines.includes('outhaul')) { s.oAt = b.ctl.outhaul; s.prepUp = true; }
        if (s.oAt != null && s.oBeat == null && b.crewPrep?.plan) s.oBeat = b.crewPrep.plan.outhaul;
        if (s.oAt != null && Math.abs(b.twa) < 70) s.oUp = b.ctl.outhaul;
      }
      if ([...seen.values()].some(s => s.oUp != null) && w.t > 0 && [...seen.values()].every(s => s.oUp != null || s.oAt == null) && [...seen.values()].filter(s => s.oUp != null).length >= 2) break;
    }
    const done = [...seen.values()].filter(s => s.oUp != null);
    expect(done.length, 'some crew got ready before a leeward mark').toBeGreaterThan(0);
    expect(done.some(s => s.oBeat! > s.oAt! + 0.05), 'a crew whose run had the outhaul easier than the beat wants').toBe(true);
    for (const s of done) {
      expect(s.oUp!, 'the outhaul never eased on the way in').toBeGreaterThanOrEqual(s.oAt! - 1e-9);
      if (s.oBeat! > s.oAt! + 0.05) expect(s.oUp!, 'and on toward the beat\'s setting by the time she\'s on the wind').toBeGreaterThan(s.oAt!);
    }
  });
});
