import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';

// w029: the "Retire to use her motor?" dialog was a long RRS 42 citation block on a player screen. One short line now;
// the citations are behind a "Why?" disclosure.
const html = readFileSync('index.html', 'utf8') as string;
const dlg = html.slice(html.indexOf('id="motorAsk"'), html.indexOf('id="leaveAsk"'));
describe('the motor dialog is one short line, the rule behind a "Why?" (w029)', () => {
  it('the line the player reads is short and says what happens', () => {
    const line = /<p class="ask-line">([^<]*(?:<b>[^<]*<\/b>[^<]*)*)<\/p>/.exec(dlg)?.[1] ?? '';
    expect(line.replace(/<[^>]*>/g, '').length).toBeGreaterThan(10);
    expect(line.replace(/<[^>]*>/g, '').length).toBeLessThanOrEqual(80);
    expect(line).toContain('RET');
  });
  it('the citations are inside the "Why?" disclosure, not in the open', () => {
    const open = dlg.replace(/<details[\s\S]*?<\/details>/, '');
    expect(open).not.toMatch(/RRS|42\.1|A5\.1/);
    expect(dlg).toMatch(/<details[^>]*><summary><u>Why\?[\s\S]*RRS 42\.1[\s\S]*A5\.1/);
  });
});
