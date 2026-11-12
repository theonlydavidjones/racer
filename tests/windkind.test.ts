import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, chooseWindKind, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { compassPoint, degAndPoint, turnWords } from '../src/core/compass';
import { wrap } from '../src/core/math';

// Owner, Nov 2026: picked "Westerly", then dragged every slider to its maximum, which left "Wind from" at 355°: the sim
// rightly sailed a northerly while the panel read westerly. Then: "clean this UI up", option A: Kind of wind is the one
// choice, and Turn the wind nudges that kind up to 30° either way, keeping its pattern from the records.
const cruise = (o: Partial<Settings>) => new World(COURSES[0], { ...structuredClone(DEFAULT_SETTINGS), mode: 'sail', current: 'slack', tideDate: '2026-07-14', ...o } as Settings, 1, { freeSail: true });

describe('Kind of wind and Wind from', () => {
  it('names the compass point: 355° is N, 270° W, 22° NNE', () => {
    expect(compassPoint(355)).toBe('N'); expect(compassPoint(270)).toBe('W'); expect(compassPoint(22)).toBe('NNE');
    expect(compassPoint(-10)).toBe('N'); expect(degAndPoint(355)).toBe('355° (N)'); expect(degAndPoint(5)).toBe('005° (N)');
  });
  it('turning the wind: the same kind of day, its direction turned (a veer clockwise, a back anticlockwise)', () => {
    for (const kind of ['west', 'north', 'south', 'auto'] as const) {
      const usual = cruise({ windKind: kind }).wind.from;
      expect(Math.abs(wrap(cruise({ windKind: kind, windTurn: 20 }).wind.from - (usual + 20))), kind).toBeLessThan(1);
      expect(Math.abs(wrap(cruise({ windKind: kind, windTurn: -30 }).wind.from - (usual - 30))), kind).toBeLessThan(1);
    }
    // a westerly at a set strength blows from the course's own westerly: turned too
    const set = cruise({ windKind: 'west', windKt: 14 }).wind.from;
    expect(Math.abs(wrap(cruise({ windKind: 'west', windKt: 14, windTurn: 15 }).wind.from - (set + 15)))).toBeLessThan(1);
    expect(turnWords(20)).toBe('veered 20° (clockwise)'); expect(turnWords(-15)).toBe('backed 15° (anticlockwise)'); expect(turnWords(0)).toBe('as usual');
  });
  it('an older replay\'s pinned direction still sails as it did (westerly, then 355°)', () => {
    const s = { windKind: 'west', windDir: 355 } as Partial<Settings>;
    expect(Math.abs(wrap(cruise(s).wind.from - 355))).toBeLessThan(1);
  });
  it('picking a kind clears any pinned direction and any turn, so she gets that kind\'s own wind', () => {
    const s = { ...structuredClone(DEFAULT_SETTINGS), windKind: 'west', windDir: 355 } as Settings;
    s.windTurn = 25; chooseWindKind(s, 'west');
    expect(s.windDir).toBeNull(); expect(s.windTurn).toBe(0);
    const from = cruise(s).wind.from;
    expect(Math.abs(wrap(from - 270))).toBeLessThan(45); // a westerly: through the Gate, roughly from the west
    chooseWindKind(s, 'north'); expect(s.windDir).toBeNull();
    expect(Math.abs(wrap(cruise(s).wind.from - 0))).toBeLessThan(60);
  });
});
