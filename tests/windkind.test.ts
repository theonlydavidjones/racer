import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, chooseWindKind, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { compassPoint, degAndPoint } from '../src/core/compass';
import { wrap } from '../src/core/math';

// Owner, Nov 2026: picked "Westerly", then dragged every slider to its maximum, which left "Wind from" at 355°: the sim
// rightly sailed a northerly while the panel read westerly. Picking a kind now takes its own direction; a direction set
// afterwards overrides it, and the panel says so in degrees and words.
const cruise = (o: Partial<Settings>) => new World(COURSES[0], { ...structuredClone(DEFAULT_SETTINGS), mode: 'sail', current: 'slack', tideDate: '2026-07-14', ...o } as Settings, 1, { freeSail: true });

describe('Kind of wind and Wind from', () => {
  it('names the compass point: 355° is N, 270° W, 22° NNE', () => {
    expect(compassPoint(355)).toBe('N'); expect(compassPoint(270)).toBe('W'); expect(compassPoint(22)).toBe('NNE');
    expect(compassPoint(-10)).toBe('N'); expect(degAndPoint(355)).toBe('355° (N)'); expect(degAndPoint(5)).toBe('005° (N)');
  });
  it('a direction you set overrides the kind (the owner\'s day: westerly, then 355°)', () => {
    const s = { windKind: 'west', windDir: 355 } as Partial<Settings>;
    expect(Math.abs(wrap(cruise(s).wind.from - 355))).toBeLessThan(1);
  });
  it('picking a kind clears the set direction, so she gets that kind\'s wind', () => {
    const s = { ...structuredClone(DEFAULT_SETTINGS), windKind: 'west', windDir: 355 } as Settings;
    chooseWindKind(s, 'west');
    expect(s.windDir).toBeNull();
    const from = cruise(s).wind.from;
    expect(Math.abs(wrap(from - 270))).toBeLessThan(45); // a westerly: through the Gate, roughly from the west
    chooseWindKind(s, 'north'); expect(s.windDir).toBeNull();
    expect(Math.abs(wrap(cruise(s).wind.from - 0))).toBeLessThan(60);
  });
});
