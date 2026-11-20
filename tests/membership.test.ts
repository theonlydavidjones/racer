import { describe, expect, it } from 'vitest';
import { canEnterSeason, clubFromBoats, joinableClubs, myClub, setClub } from '../src/club/membership';
import { NEW_BOAT } from '../src/boat/spec';

describe('membership (r276)', () => {
  it('any racing club opens the season; none, or a club that is not joinable, does not', () => {
    expect(canEnterSeason({})).toBe(false);
    expect(canEnterSeason({ club: '' })).toBe(false);
    expect(canEnterSeason({ club: 'nope' })).toBe(false);
    expect(canEnterSeason({ club: 'mbyc' })).toBe(false); // (tier 2: a label on the chart, not joinable)
    for (const c of joinableClubs()) expect(canEnterSeason({ club: c.id }), c.id).toBe(true);
  });
  it('the sponsor\'s club is not required: a member of any club may enter', () => {
    expect(canEnterSeason({ club: 'byc' })).toBe(true);
    expect(myClub({ club: 'byc' })?.name).toBe('Campanile Yacht Club');
  });
  it('the joinable clubs are the 27 racing clubs', () => {
    expect(joinableClubs()).toHaveLength(27);
  });
  it('an older save belongs to the club its boats fly', () => {
    expect(clubFromBoats([])).toBe('');
    expect(clubFromBoats([{ id: 'a', club: '' }, { id: 'b', club: 'mbyc' }])).toBe('');
    expect(clubFromBoats([{ id: 'a', club: 'ggyc' }])).toBe('ggyc');
    expect(clubFromBoats([{ id: 'a', club: 'ggyc' }, { id: 'b', club: 'byc' }, { id: 'c', club: 'byc' }], 'a')).toBe('byc');
    expect(clubFromBoats([{ id: 'a', club: 'ggyc' }, { id: 'b', club: 'byc' }], 'b')).toBe('byc');
  });

  it('your boats fly your club\'s burgee, all of them, whoever skippers them (r293)', () => {
    const a = { ...NEW_BOAT, id: 'a', club: 'ggyc' }, b = { ...NEW_BOAT, id: 'b', club: '', skipper: 'ai' as const };
    const S = { club: 'ggyc', boats: [a, b], boat: a, boatId: 'a' };
    setClub(S, 'byc');
    expect(S.club).toBe('byc'); expect(S.boats.map(x => x.club)).toEqual(['byc', 'byc']); expect(S.boat).toBe(S.boats[0]);
    setClub(S, ''); expect(S.boats.every(x => x.club === '')).toBe(true);
  });
});
