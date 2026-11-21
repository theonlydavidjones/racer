import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
const read = (f: string) => readFileSync(f, 'utf8') as string;
// The copy sweep (docs/ui/copy-sweep.md): the cuts, one block each.
describe('copy sweep A: the Past races card is one short line', () => {
  it('under 70 characters', () => {
    const t = /id="bPast"[^>]*><b>Past races<\/b><span>([^<]*)<\/span>/.exec(read('index.html'))?.[1] ?? '';
    expect(t.length).toBeGreaterThan(10); expect(t.length).toBeLessThanOrEqual(70);
  });
});

describe('copy sweep B: "Retire and head home?" is one line, the rules behind a Why?', () => {
  it('as the motor dialog is', () => {
    const html = read('index.html'), dlg = html.slice(html.indexOf('id="homeAsk"'), html.indexOf('id="homeAsk"') + 1500);
    const open = dlg.replace(/<details[\s\S]*?<\/details>/, '');
    expect(open).not.toMatch(/RRS|A5\.1|23\.1/);
    expect(/<p class="ask-line">([^<]*(?:<b>[^<]*<\/b>[^<]*)*)<\/p>/.exec(dlg)?.[1].replace(/<[^>]*>/g, '').length).toBeLessThanOrEqual(80);
    expect(dlg).toMatch(/<details[^>]*><summary><u>Why\?[\s\S]*RRS A5\.1[\s\S]*23\.1/);
  });
});
