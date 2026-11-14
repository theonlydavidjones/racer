import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import type { Boat } from '../src/boat/boat';
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { wrap } from '../src/core/math';

/**
 * Which tack a boat is on, by the Racing Rules' own definitions (RRS 2025–2028, Definitions; physics.ts tackStep):
 *   Tack, Starboard or Port: "A boat is on the tack, starboard or port, corresponding to her windward side."
 *   Leeward and Windward: "A boat's leeward side is the side that is or, when she is head to wind, was away from the
 *   wind. However, when sailing by the lee or directly downwind, her leeward side is the side on which her mainsail
 *   lies. The other side is her windward side."
 * Rules 10, 11 and 12 all turn on it. (Debrief, 14 Nov 2026.) The wind is from north in these: `rel` is its bearing off
 * her bow, + over her starboard side. The boom's angle b.boom is + to starboard.
 */
const held = (b: Boat, h: number) => { b.h = (h + 360) % 360; b.turnRate = 0; b.desired = b.h; };
/** By her mainsail: the boom to port is starboard tack. */
const byBoom = (b: Boat) => (b.boom < 0 ? 'S' : 'P');

describe('her tack, by the definitions', () => {
  it('is her windward side: the wind over her starboard side, starboard tack; over her port side, port', () => {
    for (const [h, tack] of [[315, 'S'], [270, 'S'], [200, 'S'], [45, 'P'], [90, 'P'], [160, 'P']] as const) {
      const b = testBoat({ heading: h, kt: 4, windKt: 10 }); sail(b, 10, () => held(b, h));
      expect(b.tack, `heading ${h}`).toBe(tack);
      expect(byBoom(b), `heading ${h}: the main to leeward`).toBe(tack);
    }
  });
  it('head to wind she keeps the tack she had ("was away from the wind"), and changes it as the wind comes onto her other side', () => {
    const b = testBoat({ heading: 320, kt: 4.5, windKt: 10 }); sail(b, 10, () => held(b, 320));
    expect(b.tack).toBe('S');
    sail(b, 2, t => held(b, 320 + 19.5 * t)); // (up to 359°: the wind still a degree on her starboard bow)
    expect(wrap(0 - b.h)).toBeGreaterThan(0); expect(b.tack).toBe('S');
    sail(b, 1, t => held(b, 359 + 2 * t)); // (through head to wind)
    expect(wrap(0 - b.h)).toBeLessThan(0); expect(b.tack).toBe('P'); expect(b.tacking).toBe(true);
  });
  it('directly downwind and by the lee her tack is her mainsail\'s: the wind 3° round her stern, the main where it lay, the same tack', () => {
    for (const [from, tack] of [[170, 'P'], [190, 'S']] as const) {
      const b = testBoat({ heading: from, kt: 4, windKt: 10 }); sail(b, 15, () => held(b, from));
      expect(b.tack).toBe(tack);
      const to = from < 180 ? 183 : 177; // (3° by the lee)
      sail(b, 20, t => held(b, from + (to - from) * Math.min(1, t / 10)));
      expect(Math.sign(wrap(0 - b.h))).toBe(tack === 'S' ? -1 : 1); // (the wind is over what was her leeward side)
      expect(b.tack, 'by the lee: still her main\'s tack').toBe(tack); expect(byBoom(b)).toBe(tack); expect(b.gybeTo).toBeUndefined();
    }
  });
  it('further by the lee the main goes across, and her tack changes when the boom has crossed her centerline: never one tack by the rules and the main on the other side', () => {
    for (const user of [true, false]) {
      const b = testBoat({ heading: 170, kt: 4, windKt: 10 }); b.isUser = user; sail(b, 15, () => held(b, 170));
      expect(b.tack).toBe('P'); expect(b.boom).toBeGreaterThan(30);
      let wrong = 0, gybing = 0, changedAt = NaN, boomThen = NaN, was = b.tack as string;
      sail(b, 40, t => {
        held(b, 170 + Math.min(30, t)); // (a degree a second, to 20° by the lee)
        if (Math.abs(b.boom) >= 1 && byBoom(b) !== b.tack) wrong++;
        if (b.gybeTo) { gybing++; expect(b.gybeTo).toBe('S'); expect(b.tack).toBe('P'); }
        if (b.tack !== was) { changedAt = wrap(0 - b.h); boomThen = b.boom; was = b.tack; }
      });
      expect(wrong, 'steps with the main on one side and her tack the other').toBe(0);
      expect(gybing).toBeGreaterThan(3); // (the boom on its way across for a fraction of a second, her tack still the old one)
      expect(b.tack).toBe('S'); expect(byBoom(b)).toBe('S'); expect(b.gybeTo).toBeUndefined();
      expect(changedAt).toBeGreaterThan(170); expect(changedAt).toBeLessThan(177); // (4 to 6° by the lee: where the main won't stay)
      expect(boomThen).toBeLessThan(1); // (the boom at or past her centerline when the tack changed)
    }
  });
  it('with no mainsail set there\'s none to go by: the wind\'s side, as soon as it\'s past dead astern', () => {
    const b = testBoat({ heading: 170, kt: 2, windKt: 10 }); b.rig = { main: 0, jib: 1, mainUp: false, jibUp: true };
    sail(b, 10, () => held(b, 170)); expect(b.tack).toBe('P');
    sail(b, 12, t => held(b, 170 + Math.min(15, 2 * t)));
    expect(b.tack).toBe('S'); expect(b.gybeTo).toBeUndefined();
  });
});

describe('in a race', () => {
  it('no boat is ever on one tack with her mainsail on the other side, off the wind: a start and three minutes of a fleet of eight in 22 kt', () => {
    const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
    const w = new World(ss10 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: 22, current: 'real', opponents, fleet: 7 }, 3);
    let wrong = 0, offWind = 0, gybes = 0; const was = new Map<number, string>();
    while (w.t < 180) {
      w.step(DT);
      for (const b of w.boats) {
        if (b.isUser || !(b.rig?.mainUp ?? true)) continue;
        if (b.twa > 100 && Math.abs(b.boom) >= 1) { offWind++; if (byBoom(b) !== b.tack) wrong++; }
        if (was.has(b.id) && was.get(b.id) !== b.tack && b.twa > 90) gybes++;
        was.set(b.id, b.tack);
      }
    }
    expect(offWind).toBeGreaterThan(1000); expect(gybes).toBeGreaterThan(2); // (they do run and gybe in it)
    expect(wrong).toBe(0);
  }, 300_000);
});
