// The AI skipper (src/ai/skipper.ts): the same skipper for a boat's name every race, a mid-fleet skipper deciding by
// the numbers the AI used before the skipper model, and better skippers making smaller mistakes.
import { describe, expect, it } from 'vitest';
import { SKIPPER_ATTRS, formFor, judgeLeg, knobsFor, layBiasAt, legacyKnobs, newMind, skipperFor, type SkipperAttrs } from '../src/ai/skipper';
import { makeRng } from '../src/core/rng';

const all = (x: number) => Object.fromEntries(SKIPPER_ATTRS.map(a => [a, x])) as SkipperAttrs;

describe('the AI skipper', () => {
  it('a boat has the same skipper every race; different boats, different skippers', () => {
    expect(skipperFor('Polperro')).toEqual(skipperFor('Polperro'));
    expect(skipperFor('Polperro')).not.toEqual(skipperFor('Freja'));
    for (const v of Object.values(skipperFor('Thea'))) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it('a mid-fleet skipper (0.5) decides by the legacy numbers', () => {
    const k = knobsFor(all(0.5)), L = legacyKnobs(true);
    for (const key of ['headerDeg', 'headerHoldS', 'headerTackRate', 'dirtyAirS', 'keepClearM', 'keepClearS'] as const) expect(k[key]).toBeCloseTo(L[key], 9);
  });
  it('an expert errs less than a novice in every judgement, and sees smaller shifts sooner', () => {
    const e = knobsFor(all(1)), n = knobsFor(all(0));
    expect(e.layBiasSd).toBeLessThan(n.layBiasSd); expect(e.grooveSd).toBeLessThan(n.grooveSd); expect(e.startSd).toBeLessThan(n.startSd);
    expect(e.headerDeg).toBeLessThan(n.headerDeg); expect(e.headerHoldS).toBeLessThan(n.headerHoldS);
    expect(e.currentShare).toBeGreaterThan(n.currentShare);
  });
  it('form on the day swings a skipper less the more consistent she is', () => {
    const swing = (c: number) => { const r = makeRng(1); let s = 0; for (let i = 0; i < 400; i++) s += Math.abs(formFor({ ...all(0.5), consistency: c }, r).tactics - 0.5); return s; };
    expect(swing(1)).toBeLessThan(swing(0) * 0.5);
  });
  it('her layline bias is lasting through a leg, redrawn for the next, and shrinks close to the mark', () => {
    const kn = knobsFor(all(0.3)), m = newMind(kn, 7);
    judgeLeg(m, kn, 1); const b1 = m.layBias;
    expect(layBiasAt(m, 600)).toBe(b1); expect(Math.abs(layBiasAt(m, 40))).toBeCloseTo(Math.abs(b1) * 0.25, 9);
    judgeLeg(m, kn, 2); expect(m.layBias).not.toBe(b1);
  });
});
