import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, KeyMap, TackKeys } from '../src/ui/keys';

/**
 * r026, the owner (20 Nov 2026): the main's and the traveler's keys "match their actual direction on the screen, meaning
 * the controls need to switch with the tacks" (a Keys option, off by default). On starboard tack each pair trades its
 * keys; they change once she's through the tack, never under a held key.
 */
describe('the sheet and traveler keys follow the tack', () => {
  it('they follow her tack once she has held it for two seconds, not mid-turn', () => {
    const k = new TackKeys();
    expect(k.update('P', 0, false)).toBe(false);
    expect(k.update('S', 10, false)).toBe(false); // (just through the tack)
    expect(k.update('S', 11.9, false)).toBe(false);
    expect(k.update('S', 12, false)).toBe(true); // (two seconds on it)
    expect(k.update('P', 20, false)).toBe(true); // (and back, the same way)
    expect(k.update('P', 22, false)).toBe(false);
  });
  it('a key held through the tack keeps working the way it was till it is let go', () => {
    const k = new TackKeys();
    k.update('P', 0, true); k.update('S', 5, true);
    expect(k.update('S', 30, true)).toBe(false); // (held all along: no reversal under the finger)
    expect(k.update('S', 31, false)).toBe(true); // (let go: they follow the tack)
  });
  it('a quick swing through the wind and back changes nothing', () => {
    const k = new TackKeys();
    k.update('P', 0, false); k.update('S', 3, false);
    expect(k.update('P', 4, false)).toBe(false); expect(k.update('P', 10, false)).toBe(false);
  });
  it('swapped, the main\'s and the traveler\'s pairs trade keys; nothing else changes', () => {
    const m = new KeyMap(); m.keys = structuredClone(DEFAULT_KEYS);
    expect(m.effective('mainIn')).toEqual(DEFAULT_KEYS.mainIn);
    m.swap = true;
    expect(m.effective('mainIn')).toEqual(DEFAULT_KEYS.mainOut); expect(m.effective('mainOut')).toEqual(DEFAULT_KEYS.mainIn);
    expect(m.effective('travUp')).toEqual(DEFAULT_KEYS.travDown); expect(m.effective('travDown')).toEqual(DEFAULT_KEYS.travUp);
    expect(m.effective('jibIn')).toEqual(DEFAULT_KEYS.jibIn); expect(m.effective('steerPort')).toEqual(DEFAULT_KEYS.steerPort);
    expect(m.label('mainIn')).toBe('X');
  });
});
