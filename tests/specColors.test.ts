import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';

/** Any #rrggbb the boat editor's picker gives is kept; teak stays a deck and cabin-top material; junk falls back. */
describe('colors', () => {
  it('keeps any hex color', () => {
    const s = fixSpec({ name: 'X', hull: { material: 'fiberglass', upper: '#123456', lower: '#abcdef', stripe: '#0F0F0F' }, deck: '#654321', cabinTop: '#a1b2c3', nameColor: '#fedcba', sails: { country: 'USA', number: '5', color: 'white', numberColor: '#112233', insigniaColor: '#445566' } });
    expect([s.hull.upper, s.hull.lower, s.hull.stripe, s.deck, s.cabinTop, s.nameColor, s.sails.numberColor, s.sails.insigniaColor]).toEqual(['#123456', '#abcdef', '#0F0F0F', '#654321', '#a1b2c3', '#fedcba', '#112233', '#445566']);
  });
  it('keeps teak decks and cabin tops', () => {
    const s = fixSpec({ deck: 'teak-silver', cabinTop: 'teak-polished' });
    expect([s.deck, s.cabinTop]).toEqual(['teak-silver', 'teak-polished']);
  });
  it('falls back from anything else', () => {
    const s = fixSpec({ hull: { material: 'fiberglass', upper: 'red', lower: '#zzzzzz', stripe: 'blue' }, deck: 'url(x)', cabinTop: 'nope' } as never);
    expect(s.hull.upper).toBe(DEFAULT_BOAT.hull.upper); expect(s.hull.lower).toBe(DEFAULT_BOAT.hull.lower); expect(s.hull.stripe).toBe(DEFAULT_BOAT.hull.stripe);
    expect(s.deck).toBe(DEFAULT_BOAT.deck); expect(s.cabinTop).toBeUndefined();
  });
});

/** The cockpit's floor and lazarettes: teak (Josephine's, and older saves') or fiberglass with the deck's non-skid. */
describe('cockpit', () => {
  it('is teak unless fiberglass is chosen', () => {
    expect(fixSpec({}).cockpit).toBe('teak');
    expect(fixSpec({ cockpit: 'fiberglass' }).cockpit).toBe('fiberglass');
    expect(fixSpec({ cockpit: 'marble' } as never).cockpit).toBe('teak');
  });
});
