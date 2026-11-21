import { describe, expect, it } from 'vitest';
import type { Boat, LineKey } from '../src/boat/boat';
import type { LineNote, Situation } from '../src/boat/coach';
import { trimNotesHtml } from '../src/ui/trimNotes';

// (w042) Trim Notes (ui/trimNotes.ts): a line's setting drawn as how much is on, 0 … 1, its fix ranked by its worth
const S = { label: 'Upwind · medium 12 kt', speedKt: 4.6, targetKt: 5.1 } as unknown as Situation;
const boat = (ctl: Partial<Record<LineKey, number>>) => ({ ctl }) as unknown as Boat;
const ok = (line: LineKey, who: 'you' | 'crew' = 'crew'): LineNote => ({ line, who, fix: null, ok: 'Right for the wind', tick: true });
const fix = (line: LineKey, to: number, gain: number, now = 'Too far out'): LineNote =>
  ({ line, who: 'you', ok: '', tick: false, fix: { id: `line:${line}`, who: 'you', line, to, head: 'Trim the main in, till the leech telltales stream.', why: 'Power', now, short: 'More power', look: '', gain } as unknown as LineNote['fix'] });
/** The track's white marker (where the line is now), as a share of the way on. */
const nowAt = (html: string, line: LineKey) => +(html.match(new RegExp(`data-line="${line}"[\\s\\S]*?class="now" style="left:([\\d.]+)%`))?.[1] ?? NaN);

describe('Trim Notes (ui/trimNotes.ts)', () => {
  it('draws each setting as how much is on: a sheet hard in is all the way on, the traveler from windward to leeward, a string as it is', () => {
    const h = (k: LineKey, v: number) => nowAt(trimNotesHtml(boat({ [k]: v }), S, [ok(k)]), k);
    expect(h('mainsheet', 0)).toBe(100); expect(h('mainsheet', 1)).toBe(0); expect(h('jibsheet', 0.25)).toBe(75);
    expect(h('traveller', -1)).toBe(0); expect(h('traveller', 0)).toBe(50); expect(h('traveller', 1)).toBe(100);
    expect(h('backstay', 0.3)).toBe(30); expect(h('vang', 0)).toBe(0);
  });
  it('shows a fix\'s way from now to the ideal (the teal mark), the fixes numbered by what they\'re worth', () => {
    const html = trimNotesHtml(boat({ mainsheet: 0.6, backstay: 0.2 }), S, [fix('mainsheet', 0.2, 0.1), fix('backstay', 0.5, 0.3), ok('vang')]);
    expect(html).toMatch(/data-line="mainsheet"[\s\S]*?class="now" style="left:40\.0%"[\s\S]*?class="way" style="left:40\.0%;width:40\.0%"[\s\S]*?class="cue-target" style="left:80\.0%"/);
    expect(html).toMatch(/data-line="backstay"[\s\S]*?<span class="tn-n">1<\/span>/); // (worth more: first)
    expect(html).toMatch(/data-line="mainsheet"[\s\S]*?<span class="tn-n">2<\/span>/);
    expect(html).toMatch(/data-line="vang"[\s\S]*?cue-ok/);
    expect(html).toContain('<dd class="sh">In, till the leech telltales stream</dd>'); // (the ideal, short)
    expect(html).not.toContain('Every line right');
  });
  it('lists only the lines it has notes for, escapes their words, and says so when every line is right', () => {
    const html = trimNotesHtml(boat({}), S, [fix('outhaul', 0.5, 0.2, 'Foot <too> full & deep'), ok('vang')]);
    expect(html).toContain('Foot &lt;too> full &amp; deep');
    expect(html).not.toContain('data-line="backstay"');
    expect(html).not.toContain('The jib\'s luff'); // (a group with none of its lines here: not drawn)
    const all = trimNotesHtml(boat({}), S, [ok('vang'), ok('mainsheet')]);
    expect(all).toContain('Every line right for this wind and angle.');
    expect(trimNotesHtml(boat({}), S, [ok('car')])).toContain('tn-tr off'); // (the car: no track)
  });
});
