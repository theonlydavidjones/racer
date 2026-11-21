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

describe('copy sweep D: the past-race caveats are short, their hovers one line', () => {
  it('the words under a row, and the hovers through shortTip', () => {
    const a = read('src/app.ts');
    expect(a).not.toContain('course from a sailor in the race (a last-minute change)');
    expect(a).not.toContain('the published distance disagrees with the course sheet');
    expect(a).toContain("title=\"${esc(shortTip('The course from ' + r.courseFrom))}\"");
    expect(a).toContain('title="${esc(shortTip(r.uncertain))}"');
    expect(a).toContain('title="${esc(shortTip(r.doubt))}"');
  });
});

describe('copy sweep F: the drill flag hovers are one line', () => {
  it('cut through shortTip', () => { expect(read('src/app/setup.ts')).toContain('title="${app.esc(shortTip(PREP_MEANING[f]))}"'); });
});
describe('copy sweep G: the tiller-lashed toasts are one short line each', () => {
  it('no toast over 110 characters for the lashing', () => {
    const a = read('src/app.ts'), i = a.indexOf("Tiller lashed to leeward with way on"), seg = a.slice(i - 40, i + 900);
    expect(seg).not.toContain('To heave to, back the jib first and let her slow to a knot or two, then lash.');
    expect(seg).not.toContain('To lash it elsewhere, take the tiller, move it, and right-click (or double-click).');
    expect(seg).not.toContain('right-click or double-click lashes it again.');
  });
});

describe('copy sweep I: the results\' debrief takes carry a one-line hover', () => {
  it('the tip goes through shortTip', () => { expect(read('src/app/results.ts')).toContain('app.esc(shortTip(f.tip))'); });
});
