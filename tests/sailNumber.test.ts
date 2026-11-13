import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';

/** Josephine's real sail number, USA 122 (the owner; the 2026–27 Seaweed Soup results), and older saves' 110. */
describe('sail number', () => {
  it('Josephine is USA 122', () => {
    expect(DEFAULT_BOAT.sails).toMatchObject({ country: 'USA', number: '122' });
    expect(fixSpec(undefined).sails.number).toBe('122');
  });
  it('an older save of JOSEPHINE on 110 takes 122', () => {
    expect(fixSpec({ name: 'JOSEPHINE', sails: { country: 'USA', number: '110', color: 'white' } }).sails.number).toBe('122');
    expect(fixSpec({ name: 'Josephine ', sails: { country: 'USA', number: '110', color: 'white' } }).sails.number).toBe('122');
  });
  it("leaves any other boat's number alone, 110 included", () => {
    expect(fixSpec({ name: 'VARNISH', sails: { country: 'USA', number: '110', color: 'white' } }).sails.number).toBe('110');
    expect(fixSpec({ name: 'JOSEPHINE', sails: { country: 'USA', number: '57', color: 'white' } }).sails.number).toBe('57');
  });
});
