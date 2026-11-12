import { describe, expect, it } from 'vitest';
import { headline } from '../src/ui/feedback';

// One-line messages on screen, the full text in the log (owner, 12 Nov 2026): ui/feedback.ts headline
describe('A message\'s one-line headline', () => {
  const h = (m: string) => headline(m).head;
  it('the words before a colon, when they say something', () => {
    expect(h('Sight the line: from the GGYC flagpole end, X lines up with the shore of Belvedere and Tiburon. Near the line…')).toBe('Sight the line');
    expect(h('Weather helm: she wants to round up into the wind. Let go of the tiller and she will.')).toBe('Weather helm');
  });
  it('a word or two before the colon runs on to the end of the clause', () => {
    expect(h('Crew: setting the whisker pole (about 8 s). It pays sailing deep.')).toBe('Crew: setting the whisker pole');
    expect(h('Great start: +1.2 s, mid-line, 4.1 kt')).toBe('Great start: +1.2 s, mid-line, 4.1 kt');
  });
  it('otherwise the first sentence, or its first clause before a bracket', () => {
    expect(h('Over early! Return below the line, then start.')).toBe('Over early!');
    expect(h('Course 46, in numeral pennants on the flagpole (Rule 27.1: signalled by the warning signal). Westerly, 7 kt.')).toBe('Course 46, in numeral pennants on the flagpole');
    expect(h('Rounded 18 off St. Francis Yacht Club. Next: 4.')).toBe('Rounded 18 off St. Francis Yacht Club');
  });
  it('a short message is whole, and not marked as cut', () => {
    expect(headline('Finished!')).toEqual({ head: 'Finished!', cut: false });
    expect(headline('Main up.')).toEqual({ head: 'Main up', cut: false });
    expect(headline('Sight the line: from the flagpole.').cut).toBe(true);
  });
  it('never more than about 70 characters', () => {
    const long = 'The committee has signalled a course that runs north from the club along the shore past the Marina and back again to the line';
    expect(h(long).length).toBeLessThanOrEqual(71);
    expect(h(long).endsWith('…')).toBe(true);
  });
});
