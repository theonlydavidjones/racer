import { describe, it, expect } from 'vitest';
import { ACTIONS } from '../src/ui/keys';

// w033: "Call the turn" and "Turn to starboard" were a whole sentence and a two-clause label in a one-line row. Short
// labels; the detail is a hover.
const by = (id: string) => ACTIONS.find(a => a.id === id)!;
describe('the key list\'s helm labels are short, the detail a hover (w033)', () => {
  it('Call the turn', () => { expect(by('turnHo').label.length).toBeLessThanOrEqual(24); expect(by('turnHo').tip).toContain('Tacking!'); });
  it('Turn to starboard, and its pair, Turn to port', () => {
    expect(by('steerStbd').label).toBe('Turn to starboard'); expect(by('steerStbd').tip).toContain('push the tiller to port');
    expect(by('steerPort').label).toBe('Turn to port'); expect(by('steerPort').tip).toContain('push the tiller to starboard');
  });
  it('no label runs over a short row', () => { for (const a of ACTIONS) if (['turnHo', 'steerStbd', 'steerPort'].includes(a.id)) expect(a.label.length).toBeLessThan(30); });
});
