import { describe, it, expect } from 'vitest';
import { APPROVED_BURGEE_IDS, flownBurgees } from '../src/render/burgees';
import { PARODY_BURGEES } from '../src/render/burgeeArt';
import { CLUB_TABLE } from '../src/club/clubs';

// The owner approved 20 parody burgees to fly (17 Nov 2026); only those fly, each drawn and each a real club id.
describe('the flown burgees', () => {
  it('are exactly the 20 approved, each with a drawing and a club', () => {
    expect(new Set(APPROVED_BURGEE_IDS).size).toBe(20);
    const ids = flownBurgees().map(b => b.id).sort();
    expect(ids).toEqual([...APPROVED_BURGEE_IDS].sort());
    const clubIds = new Set((CLUB_TABLE as readonly { id: string }[]).map(c => c.id));
    for (const id of APPROVED_BURGEE_IDS) expect(clubIds.has(id), id).toBe(true);
    expect(PARODY_BURGEES.length).toBeGreaterThan(20); // the rest stay unflown
  });
});
