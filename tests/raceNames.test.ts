import { describe, expect, it } from 'vitest';
import data from '../src/club/data/real-race-names.json';
import { raceDisplayName } from '../src/club/raceNames';
import { realRaces } from '../src/sim/realRaces';

// (w039) The race-name replacements (club/data/real-race-names.json: the owner's parodies of the real, branded names in
// the published results, applied in order at display time). A bad rule would show a wrong name without a sound, so
// every rule is checked against the results' own event names; no real name is written here (they live only in the JSON).
const RULES = (data as unknown as { replace: [string, string][] }).replace;
const EVENTS = [...new Set(realRaces().map(r => r.event))];

describe('The race-name replacements (club/raceNames.ts)', () => {
  it('every rule is a pattern and its replacement, and compiles', () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const [re, to] of RULES) {
      expect(typeof re).toBe('string'); expect(re.length).toBeGreaterThan(0);
      expect(typeof to).toBe('string');
      expect(() => new RegExp(re)).not.toThrow();
    }
  });
  // (most rules are for events the published results don't hold yet, so each rule is also tried on names made from its
  // own pattern: each optional group left out and put in, a year where it takes one; no real name written here)
  const samples = (re: string): string[] => {
    const opt = [...re.matchAll(/\(([^()]*)\)\?/g)], lit = (t: string) => t.replace(/\\d\{4\}/g, '2026').replace(/\\(.)/g, '$1');
    const out: string[] = [];
    for (let m = 0; m < 1 << opt.length; m++) {
      let k = 0; const body = re.replace(/\(([^()]*)\)\?/g, (_, g: string) => (m >> k++) & 1 ? lit(g) : '');
      const core = lit(body.replace(/^\^/, '').replace(/\$$/, ''));
      out.push(re.startsWith('^') ? core + ' 2026' : 'Fall' + (core.startsWith(' ') ? '' : ' ') + core + ' 2026');
    }
    return out;
  };
  it('every rule renames the names it is written for: renamed, no rule\'s target left, no stray $, trimmed, and stable', () => {
    let tried = 0;
    for (const [re] of RULES) for (const n of samples(re)) {
      tried++;
      expect(new RegExp(re).test(n), `${re} → ${n}`).toBe(true); // (the made-up name is one the rule is for)
      const shown = raceDisplayName(n);
      expect(shown, n).not.toBe(n);
      for (const [r2] of RULES) expect(new RegExp(r2).test(shown), `${n} → ${shown} (${r2})`).toBe(false);
      expect(shown).not.toMatch(/\$\d/);
      expect(shown).toBe(shown.trim()); expect(shown).not.toMatch(/\s{2,}/);
      expect(raceDisplayName(shown)).toBe(shown);
    }
    expect(tried).toBeGreaterThan(RULES.length); // (each rule tried, most more than once)
  });
  it('no event shows a rule\'s target once renamed, and renaming again changes nothing', () => {
    for (const e of EVENTS) {
      const shown = raceDisplayName(e);
      for (const [re] of RULES) expect(new RegExp(re).test(shown), `${shown} (${re})`).toBe(false);
      expect(raceDisplayName(shown)).toBe(shown);
    }
  });
  it('trims what the rules leave, and keeps a name no rule touches', () => {
    for (const e of EVENTS) { const shown = raceDisplayName(e); expect(shown).toBe(shown.trim()); expect(shown).not.toMatch(/\s{2,}/); expect(shown.length).toBeGreaterThan(0); }
    expect(raceDisplayName('Practice race 3')).toBe('Practice race 3');
    expect(raceDisplayName('  Practice race 3  ')).toBe('Practice race 3');
  });
});
