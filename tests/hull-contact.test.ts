import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { CONTACT_GAP, INCIDENT_COOLDOWN, hullGap } from '../src/rules';
import { HALF, LOA, V } from '../src/core/math';
import type { Boat } from '../src/boat/boat';

// Two hulls together: the contact's physics every step they touch, not only when the rules judge a contact (a pair's
// incidents wait INCIDENT_COOLDOWN between them). Deep Physics' turn-drag, crewstation 6 kt seed 4 (18 Nov 2026): Blue
// lying against Red lost 65% of her way every 6.0 s exactly, and between those the hulls had no contact at all.
// One boat on a beam reach in 6 kt, her bow against the side of another held still across her path (a jetty's corner,
// a committee boat): she leans on her, sails pushing, for 40 s.
function world() {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, tideDate: '2026-11-14', fleet: 2, current: 'slack' } as Settings, 4);
  w.t = 60; w.exactPairs = true;
  for (const b of w.boats) Object.assign(b, { started: true, ocs: false });
  w.boats[0].x += 500; // (the third boat well out of it)
  return w;
}
function lean(user: boolean, w = world(), secs = 40, retired = false) {
  const A = user ? w.user : w.boats[1], B = w.boats[2];
  const incidents: number[] = []; w.onIncident = (a, b, inc) => { if ((a === A && b === B) || (a === B && b === A)) { incidents.push(w.t); void inc; } };
  const hA = (w.wind.from + 95) % 360, hB = (hA + 90) % 360, ahead = V(hA), B0 = { x: A.x + ahead.x * 6, y: A.y + ahead.y * 6 };
  Object.assign(A, { h: hA, desired: hA, v: 1.0 });
  const hits: number[] = [], tw = w as unknown as { touching: Set<string> }, key = `${Math.min(A.id, B.id)}-${Math.max(A.id, B.id)}`; let was = false, minGap = Infinity, drop = 0, prev = NaN;
  for (let i = 0; i < Math.round(secs / DT); i++) {
    if (retired) Object.assign(A, { retired: true, penalty: 0, penaltyTotal: 0, penaltyDir: 0 }); // (not racing: her contacts carry no penalty)
    Object.assign(B, { x: B0.x, y: B0.y, h: hB, desired: hB, v: 0, turnRate: 0, yawRate: 0 });
    Object.assign(A, { desired: hA, h: hA, turnRate: 0, yawRate: 0 }); // (held on her heading: leaning on her all along)
    w.step(DT); w.paused = false;
    const now = tw.touching.has(key); if (now && !was) hits.push(w.t); was = now; // (an impact: the pair's contact begun)
    if (hits.length && w.t > hits[0] + 1) { minGap = Math.min(minGap, hullGap(A, B)); drop = Math.max(drop, prev - A.v); }
    prev = A.v;
  }
  return { hits, minGap, drop, incidents };
}

describe('Hulls together: the contact\'s physics every step, not on the rules\' cooldown', () => {
  it('a boat leaning on another for 40 s: one impact, not one every INCIDENT_COOLDOWN, and the hulls held at touching, not through each other', () => {
    for (const user of [false, true]) {
      const { hits, minGap, drop } = lean(user);
      expect(hits.length, `impacts at ${hits.map(t => t.toFixed(2)).join(', ')} (cooldown ${INCIDENT_COOLDOWN} s)`).toBe(1);
      expect(minGap).toBeGreaterThan(CONTACT_GAP - 0.3);
      expect(drop, 'the most way she loses in one step, after the first second (no knock every cooldown)').toBeLessThan(0.05);
    }
  }, 60000);
  it('a contact with no penalty (she\'s not racing), the boat leaning on with no way to steer off: the same incident all along, not one every cooldown (44.1, US Appeal 65)', () => {
    // (the hulls stay at touching after the impact now, nothing shoves them apart, so they're still pressed together
    // when the cooldown runs out: before, the shove put them 1.6 m apart and the next touch was judged afresh)
    const { incidents } = lean(false, world(), 40, true);
    expect(incidents.length, `incidents at ${incidents.map(t => t.toFixed(2)).join(', ')}`).toBe(1);
  }, 60000);
  it('rule 42.3(h): still against her after 30 s, she may still paddle to get clear', () => {
    // (lastHitT kept up while the hulls touch, not only at the first: paddleAllowed's 30 s runs from the last contact)
    const w = world(); const [A, B] = [w.boats[1], w.boats[2]];
    Object.assign(A, { paddle: { side: 1 } });
    lean(false, w, 35);
    expect(w.t - (A.lastHitT ?? -Infinity)).toBeLessThan(1);
    void B;
  }, 60000);

  // (the hold, the same contact going on: called directly, the pair already touching)
  const hold = (setup: (A: Boat, B: Boat) => void) => {
    const w = world(), A = w.boats[1], B = w.boats[2]; setup(A, B);
    for (const b of [A, B]) { const u = V(b.h); b.vx = u.x * (b.v - (b.astern ?? 0)); b.vy = u.y * (b.v - (b.astern ?? 0)); }
    const hw = w as unknown as { touching: Set<string>; hulls(A: Boat, B: Boat, g: number): void };
    hw.touching.add(`${Math.min(A.id, B.id)}-${Math.max(A.id, B.id)}`); hw.hulls(A, B, hullGap(A, B));
    return { A, B };
  };
  it('the hold takes out only the closing speed, shared between them: a nudge from astern leaves both near the mean', () => {
    // (two 1930 kg boats, the one astern at 1.11 m/s on the other's transom at 0.86: both near 0.985 after, not one stopped)
    const { A, B } = hold((A, B) => { Object.assign(B, { x: 0, y: 0, h: 0, v: 0.86, astern: 0, sway: 0 }); Object.assign(A, { x: 0, y: -(LOA + 2.0), h: 0, v: 1.11, astern: 0, sway: 0 }); });
    expect(A.v).toBeCloseTo(0.985, 2); expect(B.v).toBeCloseTo(0.985, 2);
  });
  it('an overlapped rub, converging at 3°, costs next to nothing: the normal is abeam, from the hulls, not their centers', () => {
    const { A, B } = hold((A, B) => { Object.assign(A, { x: 0, y: 0, h: 0, v: 1.9, astern: 0, sway: 0 }); Object.assign(B, { x: 2.1, y: -3.5, h: 357, v: 1.9, astern: 0, sway: 0 }); });
    expect(A.v).toBeGreaterThan(1.85); expect(B.v).toBeGreaterThan(1.85);
  });
  it('against a boat that can\'t move (wrecked aground), the free one takes it all, and the other isn\'t shoved', () => {
    const { A, B } = hold((A, B) => { Object.assign(B, { x: 0, y: 0, h: 90, v: 0, astern: 0, sway: 0, wrecked: { how: 'aground' } }); Object.assign(A, { x: 0, y: -(HALF + 1.5), h: 0, v: 1.0, astern: 0, sway: 0 }); });
    expect(A.v).toBeLessThan(0.05); expect(B.x).toBe(0); expect(B.y).toBe(0);
  });
  it('one hull put through the other (a placement, hullGap 0): backed out the way she came, not driven deeper', () => {
    // (physics-review, 18 Nov 2026: past the other's centerline the nearest end's vector points back toward her stern)
    for (const depth of [0.3, 3.0]) {
      const y0 = depth - HALF; // (her bow `depth` m through the other's side)
      const { A, B } = hold((A, B) => { Object.assign(B, { x: 0, y: 0, h: 90, v: 0, astern: 0, sway: 0 }); Object.assign(A, { x: 0, y: y0, h: 0, v: 1.0, astern: 0, sway: 0 }); });
      expect(A.y, `${depth} m through`).toBeLessThan(y0); expect(hullGap(A, B), `${depth} m through`).toBeGreaterThan(CONTACT_GAP - 0.05);
    }
  });
  it('once they\'ve parted, the next touch is a new impact: a boat into another\'s transom, then that one sailing on 30 m', () => {
    const w = world(), A = w.boats[1], B = w.boats[2], hw = w as unknown as { touching: Set<string> };
    const h = (w.wind.from + 95) % 360, u = V(h);
    Object.assign(A, { h, desired: h, v: 1.5 }); const B0 = { x: A.x + u.x * (LOA + 2.5), y: A.y + u.y * (LOA + 2.5) };
    let s = 0, away = false;
    for (let i = 0; i < Math.round(20 / DT); i++) {
      if (hw.touching.size) away = true;
      s += (away ? 4 : 0.3) * DT; // (B slow till A's on her, then away at 4 m/s)
      Object.assign(B, { x: B0.x + u.x * s, y: B0.y + u.y * s, h, desired: h, v: 1.5, turnRate: 0, yawRate: 0 });
      Object.assign(A, { desired: h, h, turnRate: 0, yawRate: 0 });
      w.step(DT); w.paused = false;
      if (s > 40) break;
    }
    expect(A.lastHitT).toBeDefined(); expect(hullGap(A, B)).toBeGreaterThan(20);
    expect(hw.touching.size).toBe(0);
  }, 60000);
});

