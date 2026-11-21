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
