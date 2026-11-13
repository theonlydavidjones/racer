import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { fillFleet, genericBoat, genericSpec, genericTag, isGeneric } from '../src/boat/generic';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DEFAULT_SETTINGS, MAX_OPPONENTS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current: 'slack', tideDate: '2026-11-14', traffic: 0, ...o });

describe('generic club Folkboats', () => {
  it('each is the same boat every time, with her own name and sail number', () => {
    expect(genericBoat(3)).toEqual(genericBoat(3));
    const fleet = Array.from({ length: 12 }, (_, i) => genericBoat(i + 1));
    expect(new Set(fleet.map(b => b.name)).size).toBe(12);
    expect(new Set(fleet.map(b => b.sails.number)).size).toBe(12); // no two generic boats share a number either
    for (const b of fleet) {
      expect(b.skipper).toBe('ai');
      expect(['87', '104', '92', '120', '63', '122']).not.toContain(b.sails.number); // not a club boat's or yours
    }
  });
  it('steers clear of your boats\' sail numbers', () => {
    const n = genericBoat(1).sails.number;
    expect(genericBoat(1, [n]).sails.number).not.toBe(n);
  });
  it('varied a little in condition: bottoms within two months of a scrub, sails new to old, a few kg of gear', () => {
    const fleet = Array.from({ length: 20 }, (_, i) => genericBoat(i + 1)), p = fleet.map(b => b.perf);
    expect(Math.max(...p.map(x => x.cleanedWeeks))).toBeLessThanOrEqual(8);
    expect(new Set(p.map(x => x.mainAge)).size).toBeGreaterThan(1);
    expect(p.every(x => x.outboard !== 'bracket' && x.gearKg <= 40)).toBe(true);
  });
  it('fills a fleet to a number, keeping the boats already chosen', () => {
    expect(fillFleet(['stock:1', 'mine'], 4, MAX_OPPONENTS)).toEqual(['stock:1', 'mine', 'gen:1', 'gen:2']);
    expect(fillFleet(['stock:1', 'gen:1', 'gen:2', 'gen:5'], 2, MAX_OPPONENTS)).toEqual(['stock:1', 'gen:1']);
    expect(fillFleet(['stock:1', 'stock:2'], 1, MAX_OPPONENTS)).toEqual(['stock:1', 'stock:2']); // never drops a boat you chose
    expect(fillFleet([], 20, MAX_OPPONENTS)).toHaveLength(MAX_OPPONENTS);
    expect(isGeneric('gen:3') && !isGeneric('stock:3') && !isGeneric('gen:x') && !isGeneric('gen:0')).toBe(true);
  });
  it('race beside the club boats and your own, sailed by the AI, with their condition in the physics', () => {
    const mine = { ...DEFAULT_BOAT, id: 'b2', name: 'SECOND', sails: { ...DEFAULT_BOAT.sails, number: String(genericBoat(1).sails.number) } };
    const opponents = fillFleet(['stock:1', 'b2'], 5, MAX_OPPONENTS);
    const w = new World(ss2 as unknown as CourseFile, settings({ boats: [DEFAULT_BOAT, mine], opponents, fleet: opponents.length }), 1);
    expect(w.boats).toHaveLength(6);
    const gens = w.boats.filter(b => b.spec?.id.startsWith('gen:'));
    expect(gens).toHaveLength(3);
    for (const g of gens) { expect(g.ai).not.toBeNull(); expect(g.cond).toBeDefined(); expect(g.name).toBe(genericSpec(g.spec!.id)!.name.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())); }
    expect(new Set(w.boats.map(b => b.no)).size).toBe(6); // no two boats carry the same number
    for (const g of gens) expect(g.color).toBe(genericTag(g.spec!.id)); // the colour her chip shows in setup
  });
});
