import { describe, it, expect, vi, afterEach } from 'vitest';
import { PLACES, place } from '../src/sim/places';
import { PICKABLE, placeLabel, spotName } from '../src/ui/placeNames';
import { dropAt } from '../src/ui/planChart';
import { loadSettings, isRemovedSpot } from '../src/settings';

afterEach(() => vi.unstubAllGlobals());

describe('the old named launch points are gone from what the player picks (owner chart, r270, 20 Nov)', () => {
  it('only marks and buoys are offered; the spots stay as plain positions for the AI and the tests', () => {
    expect(PICKABLE.length).toBeGreaterThan(20);
    expect(PICKABLE.every(p => p.buoy)).toBe(true);
    for (const id of ['cityfront', 'crissy', 'gate', 'alcatraz']) { expect(place(id)).not.toBeNull(); expect(isRemovedSpot(id)).toBe(true); expect(PICKABLE.some(p => p.id === id)).toBe(false); }
    expect(PLACES.some(p => p.id === 'crissy' && p.name === 'Off Crissy Field')).toBe(true); // (unchanged: nothing fingerprinted moves)
    expect(isRemovedSpot('m-A')).toBe(false);
  });
  it('her slip reads Home, a clicked spot reads the nearest place\'s bare name, never coordinates', () => {
    expect(placeLabel('slip')).toBe('Home');
    expect(placeLabel('')).toBe('nowhere in particular');
    const here = place('crissy')!.p, l = placeLabel('at:37.8115,-122.4590');
    expect(l).toBe(spotName(here));
    expect(l).not.toMatch(/\d/);
    expect(placeLabel('crissy')).not.toMatch(/Off Crissy Field/);
    expect(placeLabel('m-A')).toBe(place('m-A')!.name); // (a mark keeps its name)
  });
  it('a drop right on a removed spot lands as an open-water pin, not on the spot', () => {
    const q = place('crissy')!.p;
    const d = dropAt({ homeSlip: null } as never, q, p => Math.hypot(p.x - q.x, p.y - q.y) / 10);
    expect('id' in d && d.id).toMatch(/^at:/);
    expect('name' in d && d.name).not.toBe('Off Crissy Field');
    expect('name' in d && d.name).not.toMatch(/\d/);
  });
  it('an older save that starts from a removed spot starts from her slip', () => {
    const store: Record<string, string> = { 'fbsim-settings-v2': JSON.stringify({ sailFrom: 'gate', sailTo: 'crissy' }) };
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
    const s = loadSettings();
    expect(s.sailFrom).toBe('slip');
    expect(s.sailTo).toBe('');
    store['fbsim-settings-v2'] = JSON.stringify({ sailFrom: 'm-A', sailTo: 'm-6' });
    expect(loadSettings().sailFrom).toBe('m-A');
    expect(loadSettings().sailTo).toBe('m-6');
  });
});
