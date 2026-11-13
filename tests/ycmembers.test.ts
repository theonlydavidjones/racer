import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';
import { YOU, type Member } from '../src/club/members';
import { applyMemberInput, berth, membersGrid, memberPage, whoLine } from '../src/ui/members';

// The Yacht Club's Members tab (ui/members.ts, phase 2, crew half): plain words, everyone's ratings shown, edits.

const you: Member = { id: YOU, name: 'You', roles: ['skipper', 'crew'], origin: 'yours', seed: 1, h: 1.78, w: 80 };
const sam: Member = { id: 'crew-1', name: 'Sam', roles: ['crew'], origin: 'yours', seed: 2, h: 1.75, w: 78, skill: 0.6 };
const ines: Member = { id: 'c9', name: 'Ines', roles: ['crew'], origin: 'club', seed: 3, h: 1.7, w: 65, skill: 0.85 };
const boats = [fixSpec({ ...DEFAULT_BOAT, name: 'Josephine', crewIds: ['crew-1'] })];

describe('the Members tab', () => {
  it('says who they are in plain words, no badges (the owner)', () => {
    expect(whoLine(you)).toBe('Your member · Skipper & crew');
    expect(whoLine(sam)).toBe('Your member · Crew');
    expect(whoLine({ ...ines, roles: ['skipper'] })).toBe('Club member · Skipper');
    expect(berth(sam, boats)).toBe('Crew on Josephine · crew');
    expect(berth(ines, boats)).toBe('Free · not on a boat');
  });
  it('lists you and your crew, then the club, with no filter and no badges (docs/UI-AUDIT.md §4.8)', () => {
    const g = membersGrid([ines, sam, you], boats);
    expect(g.match(/class="mcard"/g)).toHaveLength(3);
    expect(g).not.toContain('data-f="mfilter"'); expect(g).not.toContain('Your member'); expect(g).not.toContain('Club member');
    const yours = g.indexOf('You and your crew'), club = g.indexOf('The club');
    expect(yours).toBeGreaterThan(-1); expect(club).toBeGreaterThan(yours);
    expect(g.indexOf('<b>You</b>')).toBeLessThan(g.indexOf('<b>Sam</b>')); expect(g.indexOf('<b>Sam</b>')).toBeLessThan(club); expect(g.indexOf('<b>Ines</b>')).toBeGreaterThan(club);
    // one line who they are and where they sail; three ratings, the ones for the seat
    expect(g).toMatch(/Crew on Josephine [A-Z]{3} \d+ \(main and jib\)/); expect(g).toContain('Free: not on a boat');
    const samCard = g.slice(g.indexOf('<b>Sam</b>'), g.indexOf('</button>', g.indexOf('<b>Sam</b>')));
    expect(samCard.match(/class="mbar"/g)).toHaveLength(3); expect(samCard).toContain('Trim'); expect(samCard).not.toContain('Composure');
  });
  it('edits your members, not the club\'s; your own name stays "You"', () => {
    const m = { ...sam };
    expect(applyMemberInput(m, 'name', 'Sam Okafor')).toBe(true); expect(m.name).toBe('Sam Okafor');
    expect(applyMemberInput(m, 'h', `5'11"`)).toBe(true); expect(m.h).toBeCloseTo(1.803, 3);
    expect(applyMemberInput(m, 'w', '180')).toBe(true); expect(m.w).toBeCloseTo(81.6, 1);
    expect(applyMemberInput(m, 'attr', '0.8', 'eyes')).toBe(true); expect(m.attr?.eyes).toBe(0.8);
    expect(applyMemberInput(m, 'skipper', '', undefined, true)).toBe(true); expect(m.roles).toEqual(['crew', 'skipper']);
    expect(applyMemberInput({ ...ines }, 'skill', '0.25')).toBe(false);
    expect(applyMemberInput({ ...you }, 'name', 'Bob')).toBe(false);
    expect(memberPage(ines, boats, false)).toContain('disabled');
  });
});
