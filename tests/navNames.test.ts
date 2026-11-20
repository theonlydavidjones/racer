import { describe, expect, it } from 'vitest';
import { PLACES } from '../src/sim/places';
import { destName, shortName } from '../src/ui/navNames';

// The nav strip's names (the owner, 20 Nov 2026, r272): brief, never truncated, never coordinates or qualifiers.
describe('the nav strip’s names', () => {
  it('follows the owner’s examples', () => {
    expect(shortName('Off Alcatraz (south side)')).toBe('Alcatraz');
    expect(shortName('Clipper Cove, Treasure Island')).toBe('Clipper Cove');
    expect(shortName('Corte Madera Channel light R "2"')).toBe('Corte Madera Channel');
    expect(shortName('Raccoon Strait mid-channel')).toBe('Raccoon Strait');
    expect(destName({ name: 'Her slip, West Harbor 101', key: 'slip', p: { x: 0, y: 0 } })).toBe('Home');
    expect(shortName('A · St. Felix outer buoy', { race: true })).toBe('A');
  });
  it('every place in the sim comes to a short bare name, none truncated or qualified', () => {
    for (const pl of PLACES) {
      const n = shortName(pl.name);
      expect(n.length, pl.name).toBeGreaterThan(1);
      expect(n.length, pl.name).toBeLessThanOrEqual(20); // (the strip's name cell fits 20 characters at its type size)
      expect(n, pl.name).not.toMatch(/^(off|under|the)\b|\(|\)|,|"|°|′/i);
    }
  });
  it('a spot on open water takes the nearest named place, never coordinates', () => {
    const al = PLACES.find(p => /alcatraz/i.test(p.name))!;
    expect(destName({ name: '37°49.60′N 122°25.30′W', p: { x: al.p.x + 50, y: al.p.y } })).toBe('Alcatraz');
  });
});
