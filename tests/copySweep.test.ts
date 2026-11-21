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

describe('copy sweep C: the Season footer is short', () => {
  it('the rules line is under 70 characters', () => {
    const t = /<div class="sfoot"><span[^>]*>([^<]*)<\/span>/.exec(read('src/ui/season.ts'))?.[1] ?? '';
    expect(t.length).toBeGreaterThan(10); expect(t.length).toBeLessThanOrEqual(70);
  });
});
describe('copy sweep H: no dangling separator before the season picker', () => {
  it('the head puts the host and the picker without a stray dot', () => {
    expect(read('src/ui/season.ts')).not.toMatch(/<b>\$\{esc\(series\.host\)\} · \$\{all\.length > 1 \? `<select/);
  });
});

describe('copy sweep E: the Keys labels are short, the detail a hover', () => {
  it('four labels that ran to 91–164 characters', async () => {
    const { ACTIONS } = await import('../src/ui/keys');
    for (const id of ['autopilot', 'pushOff', 'windLadder', 'weatherHelm']) {
      const a = ACTIONS.find(x => x.id === id)!;
      expect(a.label.length, id).toBeLessThanOrEqual(60); expect(a.tip, id).toBeTruthy();
    }
    expect(ACTIONS.filter(a => a.label.length > 90).map(a => a.id)).toEqual([]);
  });
});
