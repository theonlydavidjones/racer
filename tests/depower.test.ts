import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

/** Sail her close-hauled (the crew trimming) for a while; returns her lines, heel, helm and speed (m/s) at the end. */
function beat(kt: number, holdFullPower = false) {
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, mode: 'sail', sailFrom: 'cityfront', tideDate: '2026-07-11', current: 'slack', sea: 'flat' };
  const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user;
  // (the wind gusts: her heel is taken as its mean over the last minute)
  let vmg = 0, n = 0, heel = 0;
  for (let i = 0; i < 60 * 150; i++) {
    u.h = (w.wind.from + 42 + 360) % 360; u.turnTarget = null; u.steer = 0; u.tiller = 0;
    if (holdFullPower) u.depower = 0;
    w.step(DT);
    if (i > 60 * 90) { vmg += u.v * Math.cos(42 * Math.PI / 180); heel += u.heelMag ?? 0; n++; }
  }
  return { ctl: { ...u.ctl }, depower: u.depower ?? 0, heel: heel / n, helm: u.helmNeed ?? 0, vmg: vmg / n };
}

describe('the crew depowers when she is overpowered upwind', () => {
  it('in a gale: backstay, outhaul, Cunningham and vang on hard, traveller down to leeward; and it pays', () => {
    const d = beat(28), full = beat(28, true);
    expect(d.depower).toBeGreaterThan(0.8);
    expect(d.ctl.backstay).toBeGreaterThan(0.95); expect(d.ctl.outhaul).toBeGreaterThan(0.9);
    expect(d.ctl.cunningham).toBeGreaterThan(0.9); expect(d.ctl.vang).toBeGreaterThan(0.85);
    expect(d.ctl.traveller).toBeGreaterThan(0.3); // down, to leeward (−1 windward … +1 leeward)
    expect(d.heel).toBeLessThan(full.heel);
    expect(d.vmg).toBeGreaterThanOrEqual(full.vmg * 0.99);
  });
  it('in a moderate breeze she keeps her power', () => {
    const d = beat(8);
    expect(d.depower).toBeLessThan(0.15); expect(d.ctl.backstay).toBeLessThan(0.3); expect(d.ctl.traveller).toBeLessThan(0.1); // traveller up in light air
  });
});
