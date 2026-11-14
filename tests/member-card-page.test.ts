// A member's card and her page show the same numbers for the same ratings (the owner, v194: an Expert's own page read
// 100s while her card, "Skipper of …", read 50s: the card's skipper ratings ignored her Skill and weren't on her page).
import { describe, expect, it } from 'vitest';
import { membersGrid, memberPage } from '../src/ui/members';
import { installSkipperUI } from '../src/ui/skipperUI';
import { YOU, type Member } from '../src/club/members';
import { DEFAULT_BOAT, type BoatSpec } from '../src/boat/spec';

installSkipperUI();
const member = (o: Partial<Member>): Member => ({ id: 'm1', name: 'Pat Example', roles: ['skipper'], origin: 'yours', seed: 1, h: 1.75, w: 75, skill: 0.6, ...o } as Member);
const boats: BoatSpec[] = [{ ...DEFAULT_BOAT, name: 'No Inheritance', skipper: 'you', crewIds: [] }];

/** label → number, from a card's bars (label, bar, number) or a page's sliders (label, slider, number). */
function ratings(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of html.matchAll(/<span>([^<]+)<\/span><div class="mbar">.*?<\/div><span>(\d+)<\/span>/g)) out[m[1]] = +m[2];
  for (const m of html.matchAll(/<span>([^<]+)<\/span><input type="range"[^>]*><output>(\d+)/g)) out[m[1]] = +m[2];
  return out;
}
function cardOf(m: Member): Record<string, number> {
  const html = membersGrid([m], boats), i = html.indexOf(`data-v="${m.id}"`);
  return ratings(html.slice(i, html.indexOf('</button>', i)));
}
function agree(m: Member) {
  const card = cardOf(m), page = ratings(memberPage(m, boats, false));
  expect(Object.keys(card).length, 'the card shows three ratings').toBe(3);
  for (const [l, v] of Object.entries(card)) expect(page[l], `${l}: on the card ${v}, on the page ${page[l]}`).toBe(v);
}

describe('a member\'s card and page agree', () => {
  it('you, an Expert: your card shows ratings your page has, at the same numbers (no skipper ratings for you: you\'re the helm)', () => {
    const you = member({ id: YOU, name: 'You', skill: 0.9, roles: ['skipper', 'crew'] });
    agree(you);
    expect(Object.values(cardOf(you))).toEqual([90, 90, 90]);
    agree(member({ id: YOU, name: 'You', skill: 0.9, roles: ['skipper', 'crew'], attr: { trim: 0.4 } }));
  });
  it('a skipper of the club and one of yours: unset ratings follow their Skill on both, set ones are theirs on both', () => {
    agree(member({ id: 'c1', origin: 'club', skill: 0.25 }));
    agree(member({ id: 'm2', skill: 0.9, skipper: { start: 0.35 } }));
    expect(cardOf(member({ id: 'c2', origin: 'club', skill: 0.25 }))).toEqual({ Starts: 25, 'Boat speed': 25, Tactics: 25 });
  });
  it('a crew member: the card\'s three are on the page too', () => {
    agree(member({ id: 'k1', roles: ['crew'], skill: 0.25, attr: { eyes: 0.7 } }));
  });
});
