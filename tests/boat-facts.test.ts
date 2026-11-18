// The fleet page's particulars never show a blank (the owner's "Bottom: ," report): every row for every paint a player
// can pick (each preset, one mixed in the picker, and a preset's hex in capitals), on wood and fiberglass, teak and
// painted decks, every cabin top, clean and fouled.
import { describe, expect, it } from 'vitest';
import { BOTTOM_COLORS, BRIGHT_FINISH, HULL_COLORS, TEAK_DECKS, newBoat, type BoatSpec } from '../src/boat/spec';
import { boatFacts } from '../src/ui/boatFacts';

const MIXED = '#3a4b5c';
const paints = (list: [string, string][]) => [...list.map(x => x[1]), MIXED, list[0][1].toUpperCase()];
const blank = (v: string) => !v.trim() || /^[\s,;·]|[,;·]\s*$|,\s*,|undefined|null|NaN/.test(v);

function* boats(): Generator<BoatSpec> {
  const base = newBoat('Test');
  for (const material of ['wood', 'fiberglass'] as const)
    for (const lower of paints(BOTTOM_COLORS))
      for (const cleanedWeeks of [0, 6])
        yield { ...base, hull: { ...base.hull, material, lower }, perf: { ...base.perf, cleanedWeeks } };
  for (const upper of paints([...HULL_COLORS, BRIGHT_FINISH])) yield { ...base, hull: { ...base.hull, upper } };
  for (const deck of [...TEAK_DECKS.map(x => x[1]), ...paints(HULL_COLORS)])
    for (const cabinTop of [undefined, ...paints(HULL_COLORS)]) { const b = { ...base, deck } as BoatSpec; if (cabinTop) b.cabinTop = cabinTop; else delete b.cabinTop; yield b; }
}

describe('the fleet page: no particular is blank', () => {
  it('every row has a value, for every paint, deck and cabin top', () => {
    let n = 0;
    for (const b of boats()) for (const [k, v] of boatFacts(b)) {
      n++;
      expect(blank(v), `${k}: "${v}" (bottom ${b.hull.lower}, topsides ${b.hull.upper}, deck ${b.deck}, cabin top ${b.cabinTop})`).toBe(false);
    }
    expect(n).toBeGreaterThan(500);
  });
  it('a bottom paint mixed in the picker reads as custom, and a preset in capitals by its name', () => {
    const b = newBoat('Test');
    expect(boatFacts({ ...b, hull: { ...b.hull, lower: MIXED } }).find(r => r[0] === 'Bottom')![1]).toMatch(/^Custom, /);
    expect(boatFacts({ ...b, hull: { ...b.hull, lower: BOTTOM_COLORS[2][1].toUpperCase() } }).find(r => r[0] === 'Bottom')![1]).toMatch(new RegExp(`^${BOTTOM_COLORS[2][0]}, `));
  });
});
