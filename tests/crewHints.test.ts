import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
import { crewSideHints } from '../src/ui/crewWords';

// w032: the crew-placement hints mixed "stbd · heels her", "port side deck" and "port rail · holds her up". One style:
// the side, then a dot, then what it does.
describe('the crew placement hints are in one style (w032)', () => {
  for (const [lw, ww] of [['stbd', 'port'], ['port', 'stbd']]) {
    it(`leeward ${lw}, windward ${ww}`, () => {
      const h = crewSideHints(lw, ww);
      expect(Object.keys(h).sort()).toEqual(['hike', 'lee', 'up']);
      for (const t of Object.values(h)) expect(t).toMatch(/^(port|stbd) · [a-z]+( [a-z]+)*$/);
      expect(h.lee.startsWith(lw)).toBe(true); expect(h.up.startsWith(ww)).toBe(true); expect(h.hike.startsWith(ww)).toBe(true);
    });
  }
  it('the page\'s own text before the first update is in the same style', () => {
    const html = readFileSync('index.html', 'utf8') as string;
    const smalls = [...html.matchAll(/<small data-side="(?:lee|up|hike)">([^<]*)<\/small>/g)].map(m => m[1].replace(/&middot;/g, '·'));
    expect(smalls.length).toBe(3);
    for (const t of smalls) expect(t).toMatch(/^(port|stbd) · [a-z]+( [a-z]+)*$/);
  });
});
