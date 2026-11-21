import { describe, expect, it } from 'vitest';
import { PLACES, spotLabel } from '../src/sim/places';
import { canLay, destName, shortName } from '../src/ui/navNames';

// The nav strip's names (the owner, 20 Nov 2026, r272): brief, never truncated, never coordinates or qualifiers.
describe('the nav strip’s names', () => {
  it('follows the owner’s examples', () => {
    expect(shortName('Off Alcatraz (south side)')).toBe('Alcatraz');
    expect(shortName('Clipper Cove, Treasure Island')).toBe('Clipper Cove');
    expect(shortName('Corte Madera Channel light R "2"')).toBe('Corte Madera Channel');
    expect(shortName('Raccoon Strait mid-channel')).toBe('Raccoon Strait');
    expect(destName({ name: 'Her slip, West Harbor 101', key: 'slip' })).toBe('Home');
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
  it('a spot on open water, as the sim names it (spotLabel), comes to the feature\'s bare name, never coordinates', () => {
    const al = PLACES.find(p => /alcatraz/i.test(p.name))!;
    expect(destName({ name: spotLabel({ x: al.p.x + 50, y: al.p.y }) })).toBe('Alcatraz');
    expect(destName({ name: spotLabel({ x: al.p.x + 2200, y: al.p.y }) })).not.toMatch(/^Near\b/); // (the strip's reminder: bare)
  });
  // (the owner, 20 Nov 2026: VMC when she can lay the mark, VMG when she must tack or jibe to reach it, by the laylines)
  it('lays the mark on her tack on or past its layline; short of it, or on the other tack, she has to tack or jibe', () => {
    const from = 270, beat: [number, number] = [225, 315], run: [number, number] = [120, 60]; // a westerly; 45° and 150° off
    // on a beat: the mark straight upwind she can't lay on either tack; well off to one side she lays it on that tack
    expect(canLay(270, from, 'up', 'S', beat)).toBe(false); expect(canLay(270, from, 'up', 'P', beat)).toBe(false);
    expect(canLay(220, from, 'up', 'S', beat)).toBe(true); expect(canLay(220, from, 'up', 'P', beat)).toBe(false);
    expect(canLay(320, from, 'up', 'P', beat)).toBe(true); expect(canLay(320, from, 'up', 'S', beat)).toBe(false);
    // on a run: dead downwind she has to jibe for it; up toward her jibe's track she lays it
    expect(canLay(90, from, 'down', 'S', run)).toBe(false); expect(canLay(90, from, 'down', 'P', run)).toBe(false);
    expect(canLay(125, from, 'down', 'S', run)).toBe(true); expect(canLay(55, from, 'down', 'P', run)).toBe(true);
    expect(canLay(125, from, 'down', 'P', run)).toBe(false);
  });
});
