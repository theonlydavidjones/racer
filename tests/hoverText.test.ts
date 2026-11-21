import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
import { shortTip, TIP_MAX } from '../src/ui/hoverText';

// A hover is one short line (the owner's rule on copy; the in-race audit's item 10). Long ones are cut at a sentence or a
// clause, else at a word; the detail that matters is in the page.
describe('shortTip: a hover is one short line', () => {
  it('leaves a short one as it is', () => { expect(shortTip('Where next. Click for the course.')).toBe('Where next. Click for the course.'); });
  it('cuts a long one at the last sentence or clause that fits', () => {
    const t = 'Line transit: X in line with the shore of Belvedere and Tiburon means you\'re on the line · X is 3° left of it · Click for the course and the strategist';
    const s = shortTip(t);
    expect(s.length).toBeLessThanOrEqual(TIP_MAX);
    expect(s).toBe('Line transit: X in line with the shore of Belvedere and Tiburon means you\'re on the line');
  });
  it('else at a word, with an ellipsis', () => {
    const s = shortTip('word '.repeat(60));
    expect(s.length).toBeLessThanOrEqual(TIP_MAX); expect(s.endsWith('…')).toBe(true); expect(s).not.toMatch(/\s…$/);
  });
  it('never cuts an HTML entity', () => {
    const s = shortTip('a &quot;quoted&quot; thing '.repeat(12)); expect(s).not.toMatch(/&[a-z]*$/);
  });
});

describe('the page\'s own hovers are one short line (audit 10)', () => {
  it('index.html has none over 130 characters but the chart\'s field rows (w037, Charts\')', () => {
    const html = readFileSync('index.html', 'utf8') as string;
    const long = [...html.matchAll(/ title="([^"]{131,})"/g)].map(m => m[1].slice(0, 40)).filter(t => !/^The current's speed/.test(t));
    expect(long).toEqual([]);
  });
  it('setTitle, the message rows and the setup cells go through shortTip', () => {
    expect(readFileSync('src/ui/dom.ts', 'utf8')).toContain('shortTip(t)');
    expect(readFileSync('src/app.ts', 'utf8')).toMatch(/shortTip\(m\.msg\)/);
    expect(readFileSync('src/app/setup.ts', 'utf8')).toContain('title="${shortTip(title)}"');
  });
  it('the drills\' "How it\'s scored" is a disclosure, not a 250-character hover', () => {
    const d = readFileSync('src/app/drills.ts', 'utf8') as string;
    expect(d).not.toMatch(/title="Lost: what you gave away/);
    expect(d.match(/<details class="more"><summary><u>How it's scored/g)?.length).toBe(2);
  });
});
