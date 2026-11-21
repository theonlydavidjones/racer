import { describe, expect, it } from 'vitest';
import { SEASON_NEEDS_CLUB, canEnterSeason, clubFromBoats, isMember, joinableClubs, myClub, setClub } from '../src/club/membership';
import { seasons } from '../src/club/season';
import { seasonRaceFor } from '../src/club/practice';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { NEW_BOAT } from '../src/boat/spec';

describe('membership (r276)', () => {
  it('any racing club makes you a member; none, or a club that is not joinable, does not', () => {
    expect(isMember({})).toBe(false);
    expect(isMember({ club: '' })).toBe(false);
    expect(isMember({ club: 'nope' })).toBe(false);
    expect(isMember({ club: 'mbyc' })).toBe(false); // (tier 2: a label on the chart, not joinable)
    for (const c of joinableClubs()) expect(isMember({ club: c.id }), c.id).toBe(true);
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

  it('until the club browser lands, the gate is off: a member of no club sails a season race, and it counts', () => {
    expect(SEASON_NEEDS_CLUB).toBe(false); // (turning it on is a deliberate change: this test with it)
    expect(canEnterSeason({ club: '' })).toBe(true); expect(canEnterSeason({})).toBe(true);
    const series = seasons().find(x => x.races.some(r => !r.abandoned && r.courseId))!, r = series.races.find(x => !x.abandoned && x.courseId)!;
    const S: Settings = { ...DEFAULT_SETTINGS, club: '', mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, windTurn: 0, windDir: null, current: 'real', opponents: [...series.fleet], fleet: series.fleet.length };
    expect(canEnterSeason(S) ? seasonRaceFor(S, { series, no: r.no }, false) : null).toEqual({ series, no: r.no });
  });
});
