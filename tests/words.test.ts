import { describe, expect, it } from 'vitest';
import { plural, turnsWord } from '../src/ui/words';

describe('one wording for a passage\'s turns (w034)', () => {
  it('counts each, plural past one, both when there are both', () => {
    expect(plural(1, 'tack')).toBe('1 tack'); expect(plural(2, 'jibe')).toBe('2 jibes');
    expect(turnsWord(0, 0)).toBe(''); expect(turnsWord(3, 0)).toBe('3 tacks'); expect(turnsWord(0, 1)).toBe('1 jibe');
    expect(turnsWord(2, 1)).toBe('2 tacks and 1 jibe');
  });
});
