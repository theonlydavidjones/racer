import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
const css = (f: string) => readFileSync(`src/styles/${f}`, 'utf8') as string;
const rule = (s: string, sel: string) => new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}\\{([^}]*)\\}`).exec(s)?.[1] ?? '';

// The in-race audit's S items (docs/ui/in-race-audit.md), one block each.
describe('audit 1, 2: the Strategist card\'s lines take two lines, not an ellipsis mid-sentence', () => {
  it('the headline and the race line wrap, clamped to two lines', () => {
    const r = rule(css('08-chase.css'), '#trimPanel #situ .msg,#trimPanel .tp-race .msg');
    expect(r).not.toContain('nowrap'); expect(r).not.toContain('text-overflow:ellipsis');
    expect(r).toContain('-webkit-line-clamp:2');
  });
});

describe('audit 6: the chart\'s info box clears the scale bar', () => {
  it('its bottom is above the bar and its label (the bar is drawn 13 to 23 px up)', () => {
    const r = rule(css('04-screens.css'), '.ch-info');
    const bottom = +/bottom:(\d+)px/.exec(r)![1];
    expect(bottom).toBeGreaterThanOrEqual(40);
  });
});
