import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { YOU, ensureMembers, pullCrew, pushCrew, type Member } from '../src/club/members';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';

// The Yacht Club's members, phase 1 (club/members.ts): you and your crew as members, your boat's seats, the race's crew
// drawn from them, and the old crew settings carried over without loss.

const settings = (crew: Settings['crew']): Settings => ({ ...structuredClone(DEFAULT_SETTINGS), crew: structuredClone(crew), boats: [{ ...DEFAULT_BOAT }], boat: { ...DEFAULT_BOAT }, boatId: DEFAULT_BOAT.id });

describe('the Yacht Club\'s members (phase 1)', () => {
  it('carries the old crew settings over: you and your crew, with everything you\'d set, assigned to your boat', () => {
    const s = settings({ n: 2, helm: { h: 1.8, w: 82, skill: 0.9 }, people: [{ h: 1.7, w: 70, skill: 0.25, attr: { eyes: 0.8 } }, { h: 1.9, w: 90 }] });
    s.boat = s.boats[0];
    const ms: Member[] = [];
    expect(ensureMembers(s, ms)).toBe(true);
    expect(ms.map(m => m.id)).toEqual([YOU, 'crew-1', 'crew-2']);
    expect(ms[0]).toMatchObject({ name: 'You', h: 1.8, w: 82, skill: 0.9, origin: 'yours' });
    expect(ms[1]).toMatchObject({ h: 1.7, w: 70, skill: 0.25, attr: { eyes: 0.8 }, roles: ['crew'] });
    expect(s.boat.crewIds).toEqual(['crew-1', 'crew-2']);
    expect(ensureMembers(s, ms)).toBe(false); // (once)
  });
  it('the race\'s crew is your boat\'s seats; the count and the rows write back', () => {
    const s = settings({ n: 1, helm: { h: 1.8, w: 82 }, people: [{ h: 1.7, w: 70 }, { h: 1.9, w: 90 }] }); s.boat = s.boats[0];
    const ms: Member[] = []; ensureMembers(s, ms);
    expect(s.boat.crewIds).toHaveLength(1); expect(ms).toHaveLength(3); // (the second is still a member, free)
    pullCrew(s, ms);
    expect(s.crew.n).toBe(1); expect(s.crew.people[0]).toMatchObject({ h: 1.7, w: 70 }); expect(s.crew.people[1]).toMatchObject({ h: 1.9, w: 90 });
    // (You + 2 in the setup, and the forward hand made heavier)
    s.crew.n = 2; s.crew.people[1].w = 95; pushCrew(s, ms);
    expect(s.boat.crewIds).toEqual(['crew-1', 'crew-2']); expect(ms.find(m => m.id === 'crew-2')!.w).toBe(95);
    // (and You alone: the seats empty, the members kept)
    s.crew.n = 0; pushCrew(s, ms); expect(s.boat.crewIds).toEqual([]); expect(ms).toHaveLength(3);
    pullCrew(s, ms); expect(s.crew.n).toBe(0);
  });
  it('another boat of yours gets the crew you have, not new people', () => {
    const s = settings({ n: 2, helm: { h: 1.8, w: 82 }, people: [{ h: 1.7, w: 70 }, { h: 1.9, w: 90 }] }); s.boat = s.boats[0];
    const ms: Member[] = []; ensureMembers(s, ms);
    const b2 = fixSpec({ ...DEFAULT_BOAT, id: 'b2', name: 'Second' }); s.boats.push(b2); s.boat = b2; s.boatId = b2.id;
    ensureMembers(s, ms);
    expect(ms).toHaveLength(3); expect(b2.crewIds).toEqual(['crew-1', 'crew-2']);
  });
  it('a boat\'s seats survive saving and loading (fixSpec keeps them, ids only, at most two)', () => {
    expect(fixSpec({ ...DEFAULT_BOAT, crewIds: ['a', 'b', 'c'] }).crewIds).toEqual(['a', 'b']);
    expect(fixSpec({ ...DEFAULT_BOAT, crewIds: ['a', 7 as unknown as string] }).crewIds).toEqual(['a']);
    expect(fixSpec({ ...DEFAULT_BOAT }).crewIds).toBeUndefined();
  });
});
