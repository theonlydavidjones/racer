import { describe, expect, it } from 'vitest';
import { boatLabel, racingLine, type RacingLineIn } from '../src/ui/racingLine';
import type { BoatSpec } from '../src/boat/spec';

const quiet: RacingLineIn = { over: false, penalty: 0, penaltyDeg: 360, toGun: -300, burnS: null, toLineS: null, leg: null };

describe("The Strategist card's racing line (ui/racingLine.ts, r298)", () => {
  it('ranks over early, then a penalty, then the start in its last minute, then the strategist\'s leg call', () => {
    const leg = { name: 'Leg 2', best: 'left' as const, certainty: 'likely' as const };
    const all: RacingLineIn = { over: true, penalty: 1, penaltyDeg: 720, toGun: 30, burnS: 12, toLineS: 18, leg };
    expect(racingLine(all)!.tag).toBe('OCS');
    expect(racingLine({ ...all, over: false })).toEqual({ tag: 'PEN', text: 'Do your two turns now', kind: 'alarm' });
    expect(racingLine({ ...all, over: false, penalty: 0 })!.text).toBe('Burn 12 s, then go for the line');
    expect(racingLine({ ...all, over: false, penalty: 0, burnS: 0 })!.text).toBe('18 s to the line: go');
    expect(racingLine({ ...all, over: false, penalty: 0, toGun: 90 })!.text).toBe('Leg 2: the left side pays'); // (not yet the last minute)
    expect(racingLine({ ...quiet, leg: { ...leg, best: 'middle' } })!.text).toBe('Leg 2: the middle pays');
  });
  it('says nothing rather than guess: no call when the strategist rates the leg open, or has none', () => {
    expect(racingLine(quiet)).toBeNull();
    expect(racingLine({ ...quiet, leg: { name: 'Leg 1', best: 'right', certainty: 'open' } })).toBeNull();
  });
  it('names a boat by country and sail number; the club\'s default boats by name (the owner, 21 Nov 2026)', () => {
    expect(boatLabel({ name: 'Red', spec: undefined })).toBe('Red');
    expect(boatLabel({ name: 'Josephine', spec: { sails: { country: 'USA', number: '110' } } as unknown as BoatSpec })).toBe('USA 110');
  });
});
