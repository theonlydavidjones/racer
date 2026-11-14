import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { wrap } from '../src/core/math';
import type { Boat } from '../src/boat/boat';

/**
 * Steering her going astern, shoved off with no sail set (the owner, 14 Nov 2026: "check the boat steers when pushed
 * back with no sail"). She does, the right way round (her stern goes where the blade points, so her bow swings the
 * other way from going ahead), but a rudder's force goes as the square of the water's speed past it, so her turn goes
 * with her sternway: a crew's full shove gives her steerage; a gentle one gives none. Bare poles, next to no wind.
 */
type Helm = Boat & { handsOff?: boolean };
function shoved(astern: number, helm: (b: Helm) => void, secs = 10) {
  const b = testBoat({ heading: 0, kt: 0, windKt: 0.5, windFrom: 90 }) as Helm; b.isUser = true;
  b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.v = 0; b.astern = astern;
  sail(b, secs, () => helm(b));
  return { turned: wrap(b.h), astern: b.astern ?? 0, ahead: b.v };
}
const key = (b: Helm) => { b.steer = 1; }, tiller = (b: Helm) => { b.tiller = 1; b.steer = 0; b.handsOff = true; };

describe('steering astern, shoved off under bare poles', () => {
  it('at a crew\'s full shove (0.5 m/s) she answers her helm: over 10° in ten seconds, by a held key or the tiller in your hand, and still has most of her way', () => {
    for (const helm of [key, tiller]) {
      const r = shoved(0.5, helm);
      expect(Math.abs(r.turned)).toBeGreaterThan(10); expect(Math.abs(r.turned)).toBeLessThan(30);
      expect(r.astern).toBeGreaterThan(0.35); expect(r.ahead).toBe(0);
    }
  });
  it('the helm works the other way round from going ahead: the same key swings her bow the opposite way', () => {
    const back = shoved(0.5, key).turned;
    const b = testBoat({ heading: 0, kt: 0, windKt: 0.5, windFrom: 90 }) as Helm; b.isUser = true; b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.v = 1;
    sail(b, 5, () => key(b));
    expect(Math.sign(wrap(b.h))).toBe(-Math.sign(back)); expect(Math.abs(wrap(b.h))).toBeGreaterThan(5);
  });
  it('a tiller held over near head to wind keeps turning her the same way as her sternway dies: no swing back the other way while she has any way on', () => {
    // (it used to steer her by the flow above 0.2 m/s and scull her the other way, four times as fast, below it)
    for (const off of [15, -15, 0]) {
      const b = testBoat({ heading: (270 + off + 360) % 360, kt: 0, windKt: 4, windFrom: 270 }) as Helm; b.isUser = true;
      b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.v = 0; b.astern = 0.3;
      let dir = 0, flips = 0, lowest = 1;
      sail(b, 150, () => { tiller(b); const a = b.astern ?? 0, r = b.turnRate ?? 0; if (a < 0.06 || b.v > 0) return; lowest = Math.min(lowest, a);
        if (Math.abs(r) > 0.05) { if (dir && Math.sign(r) !== dir) flips++; dir = Math.sign(r); } });
      expect(lowest, `${off}° off the wind: her sternway did fall through 0.2 m/s`).toBeLessThan(0.15);
      expect(flips, `${off}° off the wind`).toBe(0);
    }
  });
  it('her turn goes with her sternway: a few degrees at 0.2 m/s, under 3° at 0.08', () => {
    const fast = Math.abs(shoved(0.5, key).turned), slow = Math.abs(shoved(0.2, key).turned), creep = Math.abs(shoved(0.08, key).turned);
    expect(slow).toBeGreaterThan(1.5); expect(slow).toBeLessThan(fast / 2);
    expect(creep).toBeLessThan(3); expect(creep).toBeLessThan(slow);
  });
});
