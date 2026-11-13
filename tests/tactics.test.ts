import { describe, expect, it } from 'vitest';
import type { Frame } from '../src/replay/recorder';
import { tactics, type TacIn } from '../src/replay/tactics';

/** Three boats on one beat due north, 1000 m: each straight up at her own speed, x offset, current (north +) and headed shift. */
function race(b: { v: number; x: number; cur: number; shift: number; start: number }[]): TacIn {
  const F: Frame[] = [];
  for (let t = 0; t <= 600; t++) F.push({ t, b: b.map(o => [o.x, Math.min(1000, Math.max(0, (t - o.start) * o.v)), 0, 'S', 0, o.shift, 0, 0, 0, o.cur]) as Frame['b'] });
  return { frames: F, you: 0, beat: 40,
    boats: b.map((o, id) => ({ id, name: ['You', 'Blue', 'Red'][id], color: '#fff', start: o.start, marks: [], finishT: o.start + 1000 / o.v })),
    legs: [{ name: 'Finish', from: { x: 0, y: 0 }, to: { x: 0, y: 1000 }, kind: 'beat', ideal: 300 }], logged: [{ laylines: 0, clearAir: 0, manoeuvres: 0 }] };
}

describe('the tactical debrief', () => {
  it('each leg against the middle, the best and the ideal; the causes add up to your difference from the middle', () => {
    const T = tactics(race([{ v: 2.8, x: -150, cur: 0.1, shift: 6, start: 4 }, { v: 3, x: 0, cur: 0.3, shift: 0, start: 2 }, { v: 3.1, x: 20, cur: 0.3, shift: 0, start: 1 }]));
    const S = T.rows[0], L = T.rows[1];
    expect(S.kind).toBe('start'); expect(S.vsMid).toBe(2); expect(S.causes.start).toBe(2); expect(S.take).toBe('Even with the fleet');
    expect(L.mid).toBeCloseTo(1000 / 3, 1); expect(L.best.id).toBe(2); expect(L.ideal).toBe(300);
    expect(L.vsMid).toBeCloseTo(1000 / 2.8 - 1000 / 3, 1);
    const sum = Object.values(L.causes).reduce((a, v) => a + v!, 0);
    expect(sum).toBeCloseTo(L.vsMid, 0);
    // less current under you than the fleet's middle (0.1 against 0.3 m/s): a tide cost; held a 6° header: a shifts cost
    expect(L.causes.tide!).toBeCloseTo(0.2 * (1000 / 2.8) / 2.8, 0); expect(L.causes.shifts!).toBeGreaterThan(0);
    expect(L.side).toBe('left'); // 150 m left of the fleet, looking up the beat
    expect(T.top.slice(0, 2).map(t => t.cause).sort()).toEqual(['shifts', 'tide']); // (the 6° header held all the way up costs most)
  });

  it('a leg where you gained says so; the takeaways stay short', () => {
    const T = tactics(race([{ v: 3.3, x: 0, cur: 0.3, shift: 0, start: 1 }, { v: 3, x: 0, cur: 0.3, shift: 0, start: 4 }, { v: 3.1, x: 0, cur: 0.3, shift: 0, start: 5 }]));
    expect(T.rows[1].take).toBe('Good leg'); expect(T.rows[0].take).toBe('Good start');
    for (const r of T.rows) expect(r.take.split(' ').length).toBeLessThanOrEqual(8);
  });
});
