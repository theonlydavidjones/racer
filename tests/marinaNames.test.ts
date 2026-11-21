import { describe, expect, it } from 'vitest';
import { MARINA_NAMES } from '../src/geo/marinaNames';
import { HARBORS } from '../src/geo/marina';

/**
 * r274 (the owner's picks, 20 Nov 2026): a privately owned marina is shown by its parody name; one owned by a city,
 * county, port district or park keeps its real name. The private marinas' real names are listed here only (tests aren't
 * shipped); NOAA's charted names of the water (e.g. "Fortmann Basin") are geography, not the marina's, and may stay.
 */
const REAL_PRIVATE = [
  'Pier 39 Marina', 'Clipper Yacht Harbor', 'Sausalito Yacht Harbor', 'Pelican Harbo', 'Loch Lomond Marina', 'Brickyard Marina',
  'Emery Cove', 'Marina Village', 'Fortmann Marina', 'Fortman Marina', 'Grand Marina', 'Ballena Isle', 'Westpoint Harbor',
  'Glen Cove Marina', 'Schoonmaker', 'Richardson Bay Marina', 'Blue Water Yacht Harbor', 'Paradise Cay Yacht Harbor'
];
const TS = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const JSONS = import.meta.glob(['../src/**/*.json', '!**/enc-chart.json'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const DOCS = import.meta.glob(['../index.html', '../README.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** Source with comments removed (what's left is code and strings, which the player can see). */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const hits = (text: string) => text.split('\n').flatMap((l, i) => REAL_PRIVATE.some(n => l.includes(n)) ? [`${i + 1}: ${l.trim().slice(0, 120)}`] : []);

describe("no private marina's real name reaches the player", () => {
  it('code and strings in src/*.ts', () => {
    const bad = Object.entries(TS).flatMap(([f, t]) => hits(code(t)).map(h => `${f}:${h}`));
    expect(bad).toEqual([]);
  });
  it('the shown fields of the data files', () => {
    const bad: string[] = [];
    const visit = (v: unknown, f: string, key = ''): void => {
      if (typeof v === 'string') { if (/^(label|title|name|short|t)$/.test(key) && hits(v).length) bad.push(`${f}: ${key}=${v.slice(0, 80)}`); }
      else if (Array.isArray(v)) v.forEach(x => visit(x, f, key));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, f, k);
    };
    for (const [f, t] of Object.entries(JSONS)) visit(JSON.parse(t), f);
    expect(bad).toEqual([]);
  });
  it('index.html and the README', () => {
    expect(Object.entries(DOCS).flatMap(([f, t]) => hits(t).map(h => `${f}:${h}`))).toEqual([]);
  });
});

describe("the marinas' names", () => {
  it("the game's own private harbors by the owner's picks", () => {
    const shown = (id: string) => HARBORS.find(m => m.id === id)?.name ?? '';
    expect(shown('marina-village')).toMatch(/^Harbor Town Yacht Harbor/);
    expect(shown('fortmann')).toMatch(/^Fortitude Marina/);
    expect(shown('grand-marina')).toMatch(/^Great Street Marina/);
    expect(shown('alameda-marina')).toMatch(/^Alameda Marina/); // (the owner: real)
  });
  it("every name in the table is unique, and none is a private marina's real name", () => {
    const names = Object.values(MARINA_NAMES).map(m => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter(n => REAL_PRIVATE.some(r => n.includes(r)))).toEqual([]);
  });
  it("Fisherman's Wharf's marina reads apart from Hyde Street Harbor, at the same wharf", () => {
    expect(MARINA_NAMES['pier-39'].name).toBe("Fisherman's Wharf Marina");
    expect(MARINA_NAMES['hyde-street'].name).toBe('Hyde Street Harbor');
  });
});
