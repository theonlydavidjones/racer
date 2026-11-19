// Lines joined from parts never show a blank or a stray separator (the owner's "Bottom: ," report): the setup page's
// boat summary for every topsides paint, and the log's line at the start for every place, with and without a destination.
import { describe, expect, it } from 'vitest';
import { BRIGHT_FINISH, HULL_COLORS, newBoat } from '../src/boat/spec';
import { PLACES } from '../src/sim/places';
import { boatSummaryText, startHead } from '../src/ui/readouts';

const MIXED = '#3a4b5c';

describe('joined readouts: no blank parts', () => {
  it("the boat's one-line summary names her topsides for every paint, a mixed one and a preset in capitals", () => {
    const b = newBoat('Test');
    for (const upper of [...[...HULL_COLORS, BRIGHT_FINISH].map(x => x[1]), MIXED, HULL_COLORS[3][1].toUpperCase()])
      for (const material of ['wood', 'fiberglass'] as const) for (const cleanedWeeks of [0, 6]) {
        const t = boatSummaryText({ ...b, hull: { ...b.hull, upper, material }, perf: { ...b.perf, cleanedWeeks } });
        expect(/^\s|\s\s|,\s*[,;.]|undefined/.test(t), t).toBe(false);
      }
    expect(boatSummaryText({ ...b, hull: { ...b.hull, upper: MIXED } })).toMatch(/^Custom-painted fiberglass hull; /);
  });
  it('the log line at the start: no trailing or doubled separator, from her slip or anywhere', () => {
    for (const from of [...PLACES.map(p => p.name), 'her slip', undefined]) for (const dest of [undefined, 'Alcatraz'])
      for (const mode of ['sail', 'race', 'drill']) { const t = startHead(mode, { from, dest, course: 'Cityfront' }); expect(/·\s*$|·\s*·|\s\s/.test(t), t).toBe(false); }
    expect(startHead('sail', { from: 'her slip', dest: 'Alcatraz', course: 'X' })).toBe('— Cruise · her slip to Alcatraz');
    expect(startHead('race', { course: 'Cityfront' })).toBe('— Race · Cityfront');
  });
});
