import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { HELM_STALL, helmFor, rudderTurn } from '../src/boat/balance';
import { moveBoat } from '../src/boat/physics';
import type { CourseFile } from '../src/courses/course';

// The AI's tiller has the same swing as yours (#437: 75° each side, the blade stalling at 40°). Her helmsman tacks and
// steers on up to full helm, 30°, as before; about to touch another boat (rule 14, ai.ts urgent) he puts it to the
// stall, her quickest turn; never past it, where the blade brakes and turns her less.
describe('the AI helmsman and the tiller', () => {
  it('helmFor is rudderTurn turned round, up to the stall', () => {
    for (let h = 0; h <= HELM_STALL + 1e-9; h += 0.05) expect(helmFor(rudderTurn(h))).toBeCloseTo(h, 6);
    expect(helmFor(rudderTurn(HELM_STALL) * 2)).toBeCloseTo(HELM_STALL, 6); // (more than the stall gives: the stall)
  });
  it('a fleet race: never past the stall; past full helm only about to touch, and then used', () => {
    const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'] } as never, 1);
    let most = 0, pastFull = 0, pastFullCalm = 0, steps = 0;
    while (w.t < 600) {
      w.step(DT);
      for (const b of w.boats) {
        if (b.isUser) continue;
        const a = Math.abs(b.helm ?? 0); steps++; most = Math.max(most, a);
        if (a > 1 + 1e-9) { pastFull++; if (!b.ai?.urgent && !(b.penalty > 0)) pastFullCalm++; }
      }
    }
    expect(most).toBeLessThanOrEqual(HELM_STALL + 1e-9); // (never slammed hard over)
    expect(pastFullCalm).toBe(0); // (her tacks and her own steering: full helm at most)
    expect(pastFull / steps).toBeLessThan(0.01);
  }, 120000);
  it('about to touch, a big turn: the helm to the stall, not past it; otherwise full helm', () => {
    const helmAt = (urgent: boolean) => {
      const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 1, opponents: ['stock:1'] } as never, 1);
      while (w.t < 90) w.step(DT);
      const b = w.boats.find(o => !o.isUser)!;
      expect(b.v).toBeGreaterThan(1.5); // (way on: the rudder has water past it)
      b.desired = b.h + (b.tack === 'S' ? -60 : 60); b.ai!.turnCommit = 0; b.ai!.urgent = urgent; b.turnRate = 0;
      moveBoat(b, DT, w.t, () => {}, { t: 0 });
      return Math.abs(b.helm ?? 0);
    };
    const calm = helmAt(false), urgent = helmAt(true);
    expect(calm).toBeCloseTo(1, 6); // (full helm, as on main)
    expect(urgent).toBeGreaterThan(1.2); // (to the stall, about: on main she never had it)
    expect(urgent).toBeLessThanOrEqual(HELM_STALL + 1e-9);
  }, 120000);
});
