import { describe, expect, it } from 'vitest';
import { escapes, straightOn } from '../src/boat/arcs';
import { flowTurnRate } from '../src/boat/dynamics';

// Wind from the north (0°). Headings: 0 north, 90 east.
const best = (c: { minGap: number }[]) => Math.max(...c.map(k => k.minGap));

describe('escapes(): room to respond (docs/ROOM-TO-RESPOND.md)', () => {
  it('holding on parallel to a boat 10 m abeam stays 10 m off', () => {
    const c = escapes({ x: 0, y: 0, h: 90, v: 2 }, [straightOn({ x: 0, y: 10, h: 90, v: 2 })], 0, { delay: 1, horizon: 6 });
    const hold = c.find(k => k.turn === 0)!;
    expect(hold.minGap).toBeCloseTo(10, 0);
    expect(hold.heading).toBeCloseTo(90, 5);
  });

  it('she turns at the rudder\'s own rate: a 90° turn at 2 m/s takes about 90° / flowTurnRate(2) plus her yaw lag', () => {
    const r = flowTurnRate(2); // deg/s, from the turning radius
    const quick = escapes({ x: 0, y: 0, h: 90, v: 2 }, [], 0, { delay: 0, horizon: 90 / r + 0.5, turns: [90] }).find(k => k.turn === 90)!;
    const slow = escapes({ x: 0, y: 0, h: 90, v: 2 }, [], 0, { delay: 0, horizon: 90 / r - 1.5, turns: [90] }).find(k => k.turn === 90)!;
    expect(quick.heading).toBeGreaterThan(170); // nearly round to 180 in that time
    expect(slow.heading).toBeLessThan(170); // and not much sooner
  });

  it('head on, 40 m apart and closing at 4 m/s: holding on hits, a turn either way clears', () => {
    const other = straightOn({ x: 0, y: 40, h: 180, v: 2 });
    const c = escapes({ x: 0, y: 0, h: 0, v: 2 }, [other], 0, { delay: 1, horizon: 12 });
    expect(c.find(k => k.turn === 0)!.minGap).toBeLessThan(0.5);
    expect(c.find(k => k.turn === 60)!.minGap).toBeGreaterThan(2.2);
    expect(c.find(k => k.turn === -60)!.minGap).toBeGreaterThan(2.2);
  });

  it('head on, 10 m apart: nothing she can do in time', () => {
    const c = escapes({ x: 0, y: 0, h: 0, v: 2 }, [straightOn({ x: 0, y: 10, h: 180, v: 2 })], 0, { delay: 1, horizon: 6 });
    expect(best(c)).toBeLessThan(2.2);
  });

  it('a later reaction leaves less room', () => {
    const other = [straightOn({ x: 0, y: 30, h: 180, v: 2 })], at = (delay: number) => best(escapes({ x: 0, y: 0, h: 0, v: 2 }, other, 0, { delay, horizon: 10 }));
    expect(at(0.5)).toBeGreaterThan(at(2.5));
  });

  it('holding on carries on the turn she is already making (mid-tack)', () => {
    const c = escapes({ x: 0, y: 0, h: 320, v: 1.5, turnRate: 12 }, [], 0, { delay: 1, horizon: 3 });
    expect(c.find(k => k.turn === 0)!.heading).toBeGreaterThan(340); // through the wind, not frozen at 320
  });

  it('running, she can gybe away: a turn through dead downwind is allowed', () => {
    const c = escapes({ x: 0, y: 0, h: 175, v: 2.5 }, [], 0, { delay: 0.5, horizon: 8, turns: [30] });
    expect(c[1].heading).toBeGreaterThan(200); // from port tack (175) through 180 onto starboard
  });

  it('turning bleeds speed (physics\' own turnBleed): held in a steady turn, her circle shrinks as she slows', () => {
    // at a steady 15°/s and 2.5 m/s she'd sail a circle of radius v/ω, reaching the point 2R to starboard after half of
    // it; slowing as the turn bleeds her speed, she turns inside it
    const R = 2.5 / (15 * Math.PI / 180), post = straightOn({ x: 2 * R, y: 0, h: 0, v: 0 });
    const c = escapes({ x: 0, y: 0, h: 0, v: 2.5, turnRate: 15 }, [post], 0, { delay: 99, horizon: 13, turns: [] })[0];
    expect(c.minGap).toBeGreaterThan(1);
    expect(c.heading).toBeGreaterThan(180); // (and she did come round past the half circle)
  });

  it('a tack loses more speed than the same turn bearing away: through the no-go zone her sails give no drive', () => {
    // close-hauled on starboard (wind from 0°), 2.5 m/s: 90° up through the wind onto port, or 90° down onto a reach
    const [tack] = escapes({ x: 0, y: 0, h: 315, v: 2.5 }, [], 0, { delay: 0, horizon: 8, turns: [90], windKt: 12 }).slice(1);
    const [bear] = escapes({ x: 0, y: 0, h: 315, v: 2.5 }, [], 0, { delay: 0, horizon: 8, turns: [-90], windKt: 12 }).slice(1);
    expect(tack.v).toBeLessThan(bear.v - 0.3);
  });
});
