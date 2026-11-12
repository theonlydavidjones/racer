import { describe, expect, it } from 'vitest';
import { ONTO_DOCK, SLIPS, WALKWAY_W, berthClear, harborOf, pushOffPlan, pushOffPoses, slipById, type Slip } from '../src/geo/marina';
import { segPt } from '../src/core/math';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';

/** Leaving an end tie with the wind blowing her onto the dock, and the wind setting a boat sideways onto anything solid. */
const world = (slipId: string, windDir: number, kt: number) => {
  const boat = { ...DEFAULT_BOAT, marina: slipId.split(':')[0], slip: slipId };
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windTurn: 0, windDir, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  return new World(COURSES[0], S, 1, { freeSail: true });
};
/** How far her middle is from the nearest dock's edge (m): alongside, half her beam (1.1 m) and a fender. */
const offDock = (s: Slip, p: { x: number; y: number }) => Math.min(...harborOf(s.marina)!.walkways.flatMap(w => w.slice(1).map((q, k) => segPt(p, w[k], q)))) - WALKWAY_W / 2;
const rel = (a: number) => ((a + 540) % 360) - 180;

describe('an end tie with the wind onto the dock', () => {
  it('the berths at the docks\' ends are found by their own ids (West Harbor\'s Docks E, F and G among them)', () => {
    for (const s of SLIPS.filter(x => x.kind === 'alongside')) expect(slipById(s.id)?.id).toBe(s.id);
  });
  it('her bow\'s pushed off just far enough to point her close-hauled, away from the dock; she gets clear; with no room, she\'s warned', () => {
    let angled = 0, straight = 0;
    for (const s of SLIPS.filter(x => x.kind === 'alongside')) for (const kt of [8, 15, 20]) for (const off of [60, 90, 120]) for (const sd of [1, -1]) {
      const from = (s.heading + off * sd + 360) % 360;
      if (!pushOffPlan(s, from, kt).setBack) continue;
      const w = world(s.id, from, kt), u = w.user;
      expect(u.docked).toBeTruthy(); const at = w.windHere(u, u, false).from; w.pushOff();
      // (the plan she's given: worked out from the wind at the dock, gusts and all)
      const p = u.handled?.plan; if (!p || p.kind !== 'off' || !p.setBack) continue;
      expect(pushOffPoses(s, p).every(q => berthClear(q.c, q.h, s))).toBe(true);
      const turned = Math.abs(rel(p.h - s.heading)), toWind = Math.abs(rel(at - p.h)), offNow = Math.abs(rel(at - s.heading));
      const msg = w.drainEvents().map(e => e.type === 'toast' ? e.msg : '').join(' ');
      if (turned < 5) { straight++; expect(msg).toMatch(/no room to angle her out/); continue; }
      angled++;
      expect(turned).toBeLessThanOrEqual(Math.max(10, offNow - 40) + 0.1); // (no further than close-hauled: the plans take the wind to 10°)
      if (!p.headToWind) expect(toWind).toBeGreaterThanOrEqual(38); // (not left in irons: the wind to 10°, give or take a gust)
      if (kt < 20 && off === 120) continue; // (sails down, and the wind on her quarter: she's carried along the dock, not off it)
      for (let i = 0; i < 60 * 60 && u.handled; i++) w.step(DT);
      let closest = Infinity;
      for (let i = 0; i < 60 * 15; i++) { w.step(DT); closest = Math.min(closest, offDock(s, u)); }
      expect(closest).toBeGreaterThan(0.9); // (fifteen seconds, sails down, to get the jib up: and she's never back against the dock)
    }
    expect(angled).toBeGreaterThan(20); expect(ONTO_DOCK).toBe(4);
    console.log(`end ties, wind onto the dock: ${angled} angled off, ${straight} with no room (warned)`);
  }, 600000);
  it('set sideways toward a dock, she stops against it, her side at the fenders, not through it', () => {
    const s = slipById('west-harbor:G end 1')!;
    // (beam-on, 3 m off the dock's edge, the wind across her toward it, and no way on)
    for (const sd of [90, -90]) {
      const w = world(s.id, (s.heading + sd + 360) % 360, 20), u = w.user;
      w.step(DT); u.docked = undefined;
      const toward = { x: s.p.x - (s.p.x + 0), y: 0 }; void toward;
      // her middle moved out from the berth, square to the dock, and turned to lie beam-on to the wind
      const d0 = offDock(s, u), n = { x: Math.cos(s.heading * Math.PI / 180), y: -Math.sin(s.heading * Math.PI / 180) };
      const side = offDock(s, { x: u.x + n.x, y: u.y + n.y }) > d0 ? 1 : -1; // (away from the dock)
      u.x += n.x * side * 1.5; u.y += n.y * side * 1.5;
      const windOnto = Math.sign(Math.cos(((s.heading + sd) * Math.PI / 180)) * n.x * side + Math.sin(((s.heading + sd) * Math.PI / 180)) * n.y * side) > 0;
      let closest = Infinity;
      for (let i = 0; i < 60 * 40; i++) { w.step(DT); u.v = 0; u.astern = 0; closest = Math.min(closest, offDock(s, u)); }
      if (windOnto) { expect(closest).toBeLessThan(d0 + 1.0); expect(closest).toBeGreaterThan(1.1 - 0.15 - 0.05); } // (set onto it, and stopped at it)
      else expect(offDock(s, u)).toBeGreaterThan(d0 + 1.5); // (blown off it)
    }
  }, 60000);
});
