import { describe, expect, it } from 'vitest';

// The owner's rule (via Ask the Sim, 19 Nov 2026): no brand names in what the player reads. Code comments keep their
// sources; README's credit is the owner's call.
const BRAND = /North Sails|Heikkil|Dacron|Harken|Lewmar|Selden|Ronstan|Sparcraft|Dyneema|Kevlar/;
const src = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const html = import.meta.glob('../index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The code's lines without comments (whole-line, block and trailing ones). */
const code = (t: string) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

describe('no brand names in what the player reads', () => {
  it('src code strings and index.html carry none', () => {
    const hits: string[] = [];
    for (const [f, t] of [...Object.entries(src), ...Object.entries(html)]) {
      const m = code(t).match(new RegExp(BRAND.source, 'g')); if (m) hits.push(`${f}: ${[...new Set(m)].join(', ')}`);
    }
    expect(hits).toEqual([]);
  });
});
