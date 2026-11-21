// w040: the screen back-stack (ui/nav.ts; docs/UI-AUDIT.md §3, the owner's "yes", 13 Nov 2026). Its rules are subtle: going
// to a place already on the stack goes back to it (no loops), a boat is its own place by its id, reset sets the stack
// outright with the start page always at the bottom, and the back link is named for the place under you.
import { describe, expect, it } from 'vitest';
import { Nav, type Place } from '../src/ui/nav';

const NAMES: Record<Place['k'], string> = { home: 'Start', race: 'Race', past: 'Past races', drill: 'Drills', season: 'Season', setup: 'Setup', club: 'Yacht Club', boat: '' };
function nav() {
  const shown: string[] = [];
  const n = new Nav(p => shown.push(p.k + (p.k === 'boat' ? ':' + p.id : '')), p => p.k === 'boat' ? p.id.toUpperCase() : NAMES[p.k]);
  return { n, shown };
}

describe('the screen back-stack (w040)', () => {
  it('starts at the start page, with no back link, and back there does nothing', () => {
    const { n, shown } = nav();
    expect(n.trail).toBe('home'); expect(n.here.k).toBe('home'); expect(n.backLabel()).toBe('');
    n.back(); expect(n.trail).toBe('home'); expect(shown).toEqual([]);
  });
  it('opening a screen puts it on top and shows it; back takes it off and shows the one under it', () => {
    const { n, shown } = nav();
    n.go({ k: 'club', tab: 'boats' }); n.go({ k: 'boat', id: 'josephine' });
    expect(n.trail).toBe('home › club › boat:josephine'); expect(shown).toEqual(['club', 'boat:josephine']);
    expect(n.backLabel()).toBe('‹ Yacht Club');
    n.back(); expect(n.trail).toBe('home › club'); expect(shown.at(-1)).toBe('club'); expect(n.backLabel()).toBe('‹ Start');
    n.back(); expect(n.trail).toBe('home'); expect(shown.at(-1)).toBe('home'); expect(n.backLabel()).toBe('');
  });
  it('going to a place already on the stack goes back to it: no loops, and what was above it is gone', () => {
    const { n, shown } = nav();
    n.go({ k: 'setup' }); n.go({ k: 'club' }); n.go({ k: 'boat', id: 'josephine' });
    n.go({ k: 'setup' });
    expect(n.trail).toBe('home › setup'); expect(shown.at(-1)).toBe('setup');
    n.go({ k: 'home' }); expect(n.trail).toBe('home'); expect(n.backLabel()).toBe('');
  });
  it('going back to a place takes the new one: the club opened on another tab is that tab', () => {
    const { n } = nav();
    n.go({ k: 'club', tab: 'boats' }); n.go({ k: 'boat', id: 'a' });
    n.go({ k: 'club', tab: 'members' });
    expect(n.trail).toBe('home › club'); expect(n.here).toEqual({ k: 'club', tab: 'members' });
  });
  it('a boat is its own place by its id: another boat goes on top, the same boat goes back to it', () => {
    const { n } = nav();
    n.go({ k: 'boat', id: 'a' }); n.go({ k: 'boat', id: 'b' });
    expect(n.trail).toBe('home › boat:a › boat:b'); expect(n.backLabel()).toBe('‹ A');
    n.go({ k: 'boat', id: 'a' }); expect(n.trail).toBe('home › boat:a');
  });
  it('a season is one place whatever its id: another season takes its place, not a second one on top', () => {
    const { n } = nav();
    n.go({ k: 'season', id: 's1' }); n.go({ k: 'race' }); n.go({ k: 'season', id: 's2', no: 3 });
    expect(n.trail).toBe('home › season'); expect(n.here).toEqual({ k: 'season', id: 's2', no: 3 });
  });
  it('reset sets the stack outright (going sailing: [start page, setup]), the start page always at the bottom, nothing shown', () => {
    const { n, shown } = nav();
    n.go({ k: 'club' }); n.go({ k: 'boat', id: 'a' }); const before = shown.length;
    n.reset({ k: 'setup' });
    expect(n.trail).toBe('home › setup'); expect(shown.length).toBe(before); expect(n.backLabel()).toBe('‹ Start');
    n.back(); expect(n.trail).toBe('home'); expect(shown.at(-1)).toBe('home'); // (back from the setup you sailed from: the start page)
    n.reset({ k: 'home' }, { k: 'setup' }); expect(n.trail).toBe('home › setup'); // (a start page passed in isn't doubled)
    n.reset(); expect(n.trail).toBe('home'); expect(n.backLabel()).toBe('');
  });
});
