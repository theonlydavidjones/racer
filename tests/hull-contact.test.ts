import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { CONTACT_GAP, INCIDENT_COOLDOWN, hullGap } from '../src/rules';
import { V } from '../src/core/math';

// Two hulls together: the contact's physics every step they touch, not only when the rules judge a contact (a pair's
// incidents wait INCIDENT_COOLDOWN between them). Deep Physics' turn-drag, crewstation 6 kt seed 4 (18 Nov 2026): Blue
// lying against Red lost 65% of her way every 6.0 s exactly, and between those the hulls had no contact at all.
// One boat on a beam reach in 6 kt, her bow against the side of another held still across her path (a jetty's corner,
// a committee boat): she leans on her, sails pushing, for 40 s.
function lean(user: boolean) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, tideDate: '2026-11-14', fleet: 2, current: 'slack' } as Settings, 4);
  w.t = 60; w.exactPairs = true;
  const A = user ? w.user : w.boats[1], B = w.boats[2];
  for (const b of w.boats) Object.assign(b, { started: true, ocs: false });
  w.boats.find(b => b !== A && b !== B)!.x += 500; // (the third boat well out of it)
  const hA = (w.wind.from + 95) % 360, hB = (hA + 90) % 360, ahead = V(hA), B0 = { x: A.x + ahead.x * 6, y: A.y + ahead.y * 6 };
  Object.assign(A, { h: hA, desired: hA, v: 1.0 });
  const hits: number[] = []; let last = A.lastHitT, minGap = Infinity;
  for (let i = 0; i < Math.round(40 / DT); i++) {
    Object.assign(B, { x: B0.x, y: B0.y, h: hB, desired: hB, v: 0, turnRate: 0, yawRate: 0 });
    Object.assign(A, { desired: hA, h: hA, turnRate: 0, yawRate: 0 }); // (held on her heading: leaning on her all along)
    w.step(DT); w.paused = false;
    if (A.lastHitT !== last) { hits.push(w.t); last = A.lastHitT; }
    if (hits.length && w.t > hits[0] + 1) minGap = Math.min(minGap, hullGap(A, B));
  }
  return { hits, minGap };
}

describe('Hulls together: the contact\'s physics every step, not on the rules\' cooldown', () => {
  it('a boat leaning on another for 40 s: one impact, not one every INCIDENT_COOLDOWN, and the hulls held at touching, not through each other', () => {
    for (const user of [false, true]) {
      const { hits, minGap } = lean(user);
      expect(hits.length, `impacts at ${hits.map(t => t.toFixed(2)).join(', ')} (cooldown ${INCIDENT_COOLDOWN} s)`).toBe(1);
      expect(minGap).toBeGreaterThan(CONTACT_GAP - 0.3);
    }
  }, 60000);
});
