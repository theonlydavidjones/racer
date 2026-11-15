import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, KeyMap, keyLabel, keyOf, type Action } from '../src/ui/keys';

// The keys (ui/keys.ts). No function keys (the owner, 15 Nov 2026: on a Mac F1–F12 are the brightness, volume and
// Mission Control keys unless Fn is held, so they "do weird things"); no key does two things.
describe('the keys', () => {
  it('no action is bound to a function key', () => {
    for (const [a, ks] of Object.entries(DEFAULT_KEYS)) for (const k of ks) expect(/^F\d{1,2}$/.test(k), `${a}: ${k}`).toBe(false);
  });
  it('no key is bound to two actions', () => {
    const seen = new Map<string, string>();
    for (const [a, ks] of Object.entries(DEFAULT_KEYS)) for (const k of ks) { expect(seen.get(k), `${k}: ${a} and ${seen.get(k)}`).toBeUndefined(); seen.set(k, a); }
  });
  it('Shift and a letter is its own key, told by the Shift key, so Caps Lock changes nothing', () => {
    expect(keyOf({ key: 't', shiftKey: true })).toBe('Shift+T');
    expect(keyOf({ key: 'T', shiftKey: true })).toBe('Shift+T');
    expect(keyOf({ key: 'T', shiftKey: false })).toBe('T'); // (Caps Lock on: the plain letter)
    expect(keyOf({ key: '?', shiftKey: true })).toBe('?');
    const m = new KeyMap();
    expect(m.actionFor(keyOf({ key: 'T', shiftKey: true }))).toBe('trimNotes' as Action);
    expect(m.actionFor(keyOf({ key: 'T', shiftKey: false }))).toBe('takeTiller' as Action);
    // the traveler beside the mainsheet (the owner, 15 Nov 2026): Shift+Z up to windward, Shift+X down to leeward
    expect(m.actionFor(keyOf({ key: 'Z', shiftKey: true }))).toBe('travUp' as Action);
    expect(m.actionFor(keyOf({ key: 'x', shiftKey: true }))).toBe('travDown' as Action);
    // (Shift with a letter that has no Shift binding: the letter, as before)
    expect(m.actionFor(keyOf({ key: 'S', shiftKey: true }))).toBe('luff' as Action);
    expect(keyLabel('Shift+T')).toBe('⇧T');
  });
});
