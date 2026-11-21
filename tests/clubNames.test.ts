import { describe, expect, it } from 'vitest';
import { CLUB_TABLE } from '../src/club/clubs';

/**
 * The owner's parody clubs (17 Nov 2026): no real club's name or abbreviation may reach a player-facing string. The real
 * names are listed here only (tests aren't shipped). Citations in comments, data provenance fields and the published
 * results (src/boat/data/sf-folkboat-results.json, club/data/real-club-codes.json) may keep them.
 */
const REAL_NAMES = [
  'St. Francis Yacht', 'St Francis Yacht', 'Golden Gate Yacht', 'South Beach Yacht', 'Bay View Boat', 'Mariposa Hunters Point',
  'Treasure Island Yacht', 'San Francisco Yacht', 'Corinthian Yacht', 'Tiburon Yacht', 'Presidio Yacht', 'Sausalito Yacht',
  'Marin Yacht Club', 'San Rafael Yacht', 'Richmond Yacht', 'Berkeley Yacht', 'Cal Sailing', 'Emeryville Yacht', 'Encinal Yacht',
  'Oakland Yacht', 'Island Yacht', 'Aeolian Yacht', 'Ballena Bay Yacht', 'Vallejo Yacht', 'Benicia Yacht', 'Sequoia Yacht',
  'Coyote Point', 'Sierra Point Yacht', 'Alameda Yacht', 'Metropolitan Yacht', 'Marina Bay Yacht', 'Point San Pablo Yacht Club',
  'Oyster Point Yacht', 'Peninsula Yacht', 'South Bay Yacht', 'San Leandro Yacht', 'Loch Lomond Yacht', 'Bel Marin Keys',
  'Petaluma Yacht', 'Napa Valley Yacht', 'Glen Cove Yacht', 'Martinez Yacht', 'Pittsburg Yacht', 'Sausalito Cruising',
  'Seattle Yacht', 'Seaweed Soup', 'Manuel Fagundes', 'Resin Regatta', 'Resin Invitational', 'Classic Boat Invitational', 'Big Boat Series', 'St. Francis outer', 'St Francis outer'
];
const REAL_ABBR = ['StFYC', 'GGYC', 'SBYC', 'BVBC', 'MHPYC', 'TIYC', 'SFYC', 'CYC', 'TYC', 'PYC', 'SYC', 'RYC', 'BYC', 'CSC', 'EYC',
  'OYC', 'IYC', 'AYC', 'BBYC', 'VYC', 'SeqYC', 'CPYC', 'SPYC', 'MBYC', 'SLYC', 'SSYC', 'St. Francis YC', 'Golden Gate YC',
  'Oakland YC', 'Richmond YC', 'Berkeley YC', 'Encinal YC', 'Island YC', 'Corinthian YC', 'Coyote Point YC', 'Sequoia YC'];
const ABBR_RE = new RegExp(`\\b(${REAL_ABBR.map(a => a.replace(/[.]/g, '\\.')).join('|')})\\b`);

const TS = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const JSONS = import.meta.glob(['../src/**/*.json', '!**/sf-folkboat-results.json', '!**/real-club-codes.json'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const DOCS = import.meta.glob(['../index.html', '../README.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** Whole names that contain a banned one but aren't a club's: each blanked out of a line before it's checked, so a club's
 * name beside one is still caught. r274 (the owner's rule, docs/FTUE-BRIEF.md §2): a publicly owned marina keeps its
 * real name: Marina Bay Yacht Harbor (the City of Richmond's) and Coyote Point Marina (San Mateo County's). */
const ALLOWED: string[] = ['Marina Bay Yacht Harbor', 'Coyote Point Marina'];
/** Source with comments removed (what's left is code and strings, which the player can see). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}
function hits(text: string): string[] {
  const out: string[] = [];
  text.split('\n').forEach((l, i) => {
    l = l.replace(/'m-[A-Za-z0-9]+'/g, "''"); // (mark ids are internal, never shown)
    for (const a of ALLOWED) l = l.split(a).join('');
    if (REAL_NAMES.some(n => l.includes(n)) || ABBR_RE.test(l)) out.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
  });
  return out;
}

describe('no real yacht club name reaches the player', () => {
    it('code and strings in src/*.ts', () => {
    const bad: string[] = [];
    for (const [f, t] of Object.entries(TS)) for (const h of hits(code(t))) bad.push(`${f}:${h}`);
    expect(bad).toEqual([]);
  });
  it('the shown fields of the data files (label, title, name, short)', () => {
    const bad: string[] = [];
    const visit = (v: unknown, f: string, key = ''): void => {
      if (typeof v === 'string') { if (/^(label|title|name|short|group)$/.test(key) && hits(v).length) bad.push(`${f}: ${key}=${v.slice(0, 80)}`); }
      else if (Array.isArray(v)) v.forEach(x => visit(x, f, key));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, f, k);
    };
    for (const [f, t] of Object.entries(JSONS)) visit(JSON.parse(t), f);
    expect(bad).toEqual([]);
  });
  it('index.html and the README', () => {
    const bad: string[] = [];
    for (const [f, t] of Object.entries(DOCS)) for (const h of hits(t)) bad.push(`${f}:${h}`);
    expect(bad).toEqual([]);
  });
});

describe('the allowed public marinas let no club through (r274)', () => {
  it('the clubs beside them, and their abbreviations, are still caught', () => {
    for (const l of ['Marina Bay Yacht Club', 'Coyote Point Yacht Club', 'Coyote Point YC', 'MBYC', 'CPYC', 'Marina Bay Yacht Harbor, home of the Marina Bay Yacht Club', 'Coyote Point Marina · CPYC'])
      expect(hits(l), l).toHaveLength(1);
    for (const l of ['Marina Bay Yacht Harbor', 'Coyote Point Marina']) expect(hits(l), l).toEqual([]);
  });
});

describe('the club table', () => {
  it('has unique ids and short forms, none a real club\'s abbreviation', () => {
    const ids = CLUB_TABLE.map(c => c.id), shorts = CLUB_TABLE.map(c => c.short.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(shorts).size).toBe(shorts.length);
    const real = REAL_ABBR.map(a => a.toLowerCase());
    expect(CLUB_TABLE.filter(c => real.includes(c.short.toLowerCase())).map(c => c.short)).toEqual([]);
  });
  it('has the owner\'s 27 racing clubs, and St. Felix is always shown in full', () => {
    expect(CLUB_TABLE.filter(c => c.tier === 1).length).toBe(27);
    expect(CLUB_TABLE.find(c => c.id === 'stfyc')).toMatchObject({ name: 'St. Felix Yacht Club', short: 'StFelYC' });
  });
  it('keeps the internal ids that saves already hold', () => {
    for (const id of ['bvbc', 'ggyc', 'stfyc', 'sfyc', 'cyc', 'tyc', 'ssyc', 'sbyc', 'seqyc', 'cpyc', 'ryc', 'oyc', 'iyc', 'eyc', 'byc', 'vyc', 'tiyc', 'mbyc', 'slyc'])
      expect(CLUB_TABLE.some(c => c.id === id), id).toBe(true);
  });
});
