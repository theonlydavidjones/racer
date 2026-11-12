import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, FUMBLE, STRESS, fumble, newCrew, stressOf, type Attr, type CrewSpec } from '../src/boat/crewPhys';
import { workPace } from '../src/boat/crewWork';
import { crewPressure } from '../src/sim/pressure';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { LOA } from '../src/core/math';
import type { World } from '../src/sim/world';

// The crew model, phase D: composure, pressure and fumbles (crewPhys.ts stressOf, FUMBLE; sim/pressure.ts).

const crewOf = (attr: Partial<Record<Attr, number>>): CrewSpec => ({ helm: { ...DEFAULT_CREW.helm, skill: 0.6, attr }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill: 0.6, attr })) });

describe('pressure, and how much it gets to them', () => {
  it('the moments: the last minute before the gun, the mark\'s zone, a boat close, penalty turns', () => {
    const b = testBoat({ heading: 0, kt: 4 });
    const w = (o: Partial<{ t: number; mark: number; other: number }>) => ({
      t: o.t ?? 300, freeSail: false, boats: o.other != null ? [b, { ...b, x: b.x + o.other, docked: false, finished: false }] : [b],
      nextMark: () => (o.mark != null ? { type: 'round', p: { x: b.x, y: b.y + o.mark } } : null)
    }) as unknown as World;
    expect(crewPressure(w({}), b)).toBe(0);
    expect(crewPressure(w({ t: -50 }), b)).toBeLessThan(crewPressure(w({ t: -5 }), b));
    expect(crewPressure(w({ t: -5 }), b)).toBeGreaterThan(0.9);
    expect(crewPressure(w({ mark: 2 * LOA }), b)).toBeGreaterThan(0.7); expect(crewPressure(w({ mark: 5 * LOA }), b)).toBe(0);
    expect(crewPressure(w({ other: LOA }), b)).toBeGreaterThan(0.5); expect(crewPressure(w({ other: 4 * LOA }), b)).toBe(0);
    b.penalty = 720; expect(crewPressure(w({}), b)).toBe(0); // (owed, not yet being turned)
    b.penaltyDir = 1; expect(crewPressure(w({}), b)).toBeGreaterThan(0.7);
  });
  it('composure holds it off: none gets to a cool head, most of it to a nervous one', () => {
    const p = { h: 1.75, w: 75 };
    expect(stressOf({ pressure: 1 }, { ...p, attr: { composure: 1 } })).toBe(0);
    expect(stressOf({ pressure: 1 }, { ...p, attr: { composure: 0.25 } })).toBeCloseTo(0.75, 9);
    expect(stressOf({ pressure: 0 }, { ...p, attr: { composure: 0 } })).toBe(0);
  });
  it('under pressure their hands are slower', () => {
    const b = testBoat({ heading: 0, kt: 4 }); b.crew = newCrew(crewOf({ composure: 0.2 }), 'S');
    const calm = workPace(b, 2); b.crew.pressure = 1;
    expect(workPace(b, 2)).toBeCloseTo(calm * (1 - STRESS.pace * 0.8), 9);
  });
});

describe('fumbles under pressure (seeded, for every boat; off for yours if you like)', () => {
  const rate = (attr: Partial<Record<Attr, number>>, pressure: number, on = true) => {
    const c = newCrew(crewOf(attr), 'S'); c.pressure = pressure;
    let n = 0, lost = 0; for (let i = 0; i < 400; i++) { const x = fumble(c, c.spec.crew[1], on); if (x > 0) { n++; lost += x; } }
    return { share: n / 400, mean: n ? lost / n : 0 };
  };
  it('a nervous crew at the gun fumbles about one manoeuvre in four; a cool one hardly ever; calm water, never', () => {
    const nervous = rate({ composure: 0.25 }, 1), cool = rate({ composure: 0.95 }, 1);
    expect(nervous.share).toBeGreaterThan(0.18); expect(nervous.share).toBeLessThan(0.34);
    expect(cool.share).toBeLessThan(0.04);
    expect(rate({ composure: 0.25 }, 0).share).toBe(0);
    expect(nervous.mean).toBeGreaterThan(FUMBLE.min); expect(nervous.mean).toBeLessThan(FUMBLE.max);
  });
  it('switched off for your boat: none', () => {
    expect(rate({ composure: 0.1 }, 1, false).share).toBe(0);
  });
  it('the same crew fumble the same manoeuvres every race (a fixed draw, no randomness)', () => {
    const run = () => { const c = newCrew(crewOf({ composure: 0.3 }), 'S'); c.pressure = 1; return Array.from({ length: 30 }, () => fumble(c, c.spec.crew[1], true)); };
    expect(run()).toEqual(run());
  });
});

describe('fumbles happen where they should (the review: through a real tack)', () => {
  /** Twelve tacks in 10 kt under full pressure: how many had a riding turn, and the jib's drive lost through them. */
  function tacks(attr: Partial<Record<Attr, number>>, off = false) {
    const twa = beatAngle(10), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 10 }); b.crew = newCrew(crewOf(attr), 'S'); b.noFumbles = off;
    let snags = 0, was = 0;
    for (let i = 0; i < 12; i++) {
      sail(b, 20, () => { b.crew!.pressure = 1; const s = b.jibSnagT ?? 0; if (s > 0 && was <= 0) snags++; was = s; });
      startTack(b);
    }
    return snags;
  }
  it('a nervous crew under pressure fumbles some tacks; a cool one none; switched off, none', () => {
    expect(tacks({ composure: 0.2 })).toBeGreaterThan(0);
    expect(tacks({ composure: 1 })).toBe(0);
    expect(tacks({ composure: 0.2 }, true)).toBe(0);
  }, 60_000);
  it('a riding turn lets the jib out and holds it there for a few seconds, then it comes in', () => {
    const twa = beatAngle(10), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 10 }); b.crew = newCrew(crewOf({ composure: 0 }), 'S');
    let seen = false, out = 0;
    for (let i = 0; i < 20 && !seen; i++) { sail(b, 15, () => { b.crew!.pressure = 1; if ((b.jibSnagT ?? 0) > 0) { seen = true; out = Math.max(out, b.ctl.jibsheet); } }); startTack(b); }
    expect(seen).toBe(true); expect(out).toBeGreaterThanOrEqual(0.5);
    sail(b, 25); expect(b.ctl.jibsheet).toBeLessThan(0.3);
  }, 60_000);
});
