import { describe, expect, it } from 'vitest';
import { simCrew, roundingCoach, roundingKey, type RoundingScore, type CrewRounding } from '../src/sim/roundings';

// (the full-World test, driving the sim crew round the course, is tests/roundings-crew.test.ts — excluded from test:fast)

describe('The rounding coach: the costly mistakes, each in its own words (sim/roundings.ts roundingCoach)', () => {
  const base = (kind: 'windward' | 'leeward', over: Partial<RoundingScore> = {}): RoundingScore => ({
    kind, scored: true, tws: 12, hs: 0, lostM: simCrew(kind, 12).lostM, goodM: simCrew(kind, 12).lostM, tacks: 1, freeS: 0, pinchS: 0,
    stallS: 0, poleS: kind === 'windward' ? 15 : null, dropS: kind === 'leeward' ? 28 : null, entryD: 20, exitD: simCrew(kind, 12).exitD, closest: 5, peakRate: 12, minSpeed: 0.8, slackS: 0, touched: false, coach: '', ...over
  });
  const g = (kind: 'windward' | 'leeward'): CrewRounding => simCrew(kind, 12);

  it('a touch is called first of all', () => {
    expect(roundingCoach(base('leeward', { touched: true }), g('leeward'))).toMatch(/touched the mark/);
  });
  it('short of the layline (pinching or an extra tack) is told', () => {
    expect(roundingCoach(base('windward', { pinchS: 8, lostM: 60 }), g('windward'))).toMatch(/Short of the layline/);
    expect(roundingCoach(base('windward', { tacks: 3, lostM: 60 }), g('windward'))).toMatch(/Short of the layline/);
  });
  it('overstanding (reaching in) is told', () => {
    expect(roundingCoach(base('windward', { freeS: 20, lostM: 60 }), g('windward'))).toMatch(/Overstood/);
  });
  it('a late pole after the windward mark is told, but not in light air where the crew does not pole', () => {
    expect(roundingCoach(base('windward', { poleS: null, lostM: 60 }), g('windward'))).toMatch(/pole/i);
    const light = { ...simCrew('windward', 6) };
    expect(roundingCoach(base('windward', { tws: 6, poleS: null, lostM: light.lostM, goodM: light.lostM }), light)).not.toMatch(/pole/i);
  });
  it('easing the main late on the bear-away is told', () => {
    expect(roundingCoach(base('windward', { stallS: 6 }), g('windward'))).toMatch(/Ease the main/);
  });
  it('a late drop and a wide exit at the leeward mark are each told', () => {
    expect(roundingCoach(base('leeward', { dropS: null, lostM: 50 }), g('leeward'))).toMatch(/Pole down late/);
    expect(roundingCoach(base('leeward', { exitD: 40, lostM: 50 }), g('leeward'))).toMatch(/Wide out/);
  });
  it('turning too hard onto the wind (slowing right down) is told', () => {
    expect(roundingCoach(base('leeward', { peakRate: 30, minSpeed: 0.5, lostM: 50 }), g('leeward'))).toMatch(/too hard/);
  });
  it('a good rounding is praised', () => {
    expect(roundingCoach(base('windward'), g('windward'))).toMatch(/good rounding/);
    expect(roundingCoach(base('leeward'), g('leeward'))).toMatch(/good rounding/);
  });
  it('the best is kept by mark and wind band', () => {
    expect(roundingKey({ kind: 'windward', tws: 6 })).toBe('wmark-light');
    expect(roundingKey({ kind: 'leeward', tws: 12 })).toBe('lmark-medium');
    expect(roundingKey({ kind: 'windward', tws: 20 })).toBe('wmark-fresh');
  });
});
