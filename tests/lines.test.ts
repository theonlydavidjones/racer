import { describe, expect, it } from 'vitest';
import { LINE_ENDS, LINE_LABEL, LINE_NAME, LINE_WHAT, lineHelp, type LineUiKey } from '../src/ui/lines';

// (w042) The sail lines in sailors' words (ui/lines.ts): the trim panel, the band and the coach share them
const KEYS = Object.keys(LINE_LABEL) as LineUiKey[];

describe('The lines in sailors\' words (ui/lines.ts)', () => {
  it('every line has its label, what it does, and both ends with their effects, all in words', () => {
    expect(KEYS.length).toBeGreaterThan(10);
    for (const k of KEYS) {
      expect(LINE_LABEL[k].trim(), k).not.toBe('');
      expect(LINE_WHAT[k].trim(), k).not.toBe('');
      expect(LINE_ENDS[k], k).toHaveLength(4);
      for (const w of LINE_ENDS[k]) expect(w.trim(), k).not.toBe('');
      expect(LINE_ENDS[k][0], k).not.toBe(LINE_ENDS[k][2]); // (two different ends)
    }
  });
  it('a line\'s help names both ends, capitalized, with what each does, then when it\'s used; the cars lead with when', () => {
    for (const k of KEYS) {
      const h = lineHelp(k), [a, ae, b, be] = LINE_ENDS[k], cap = (t: string) => t[0].toUpperCase() + t.slice(1);
      expect(h, k).toContain(`${cap(a)}: ${ae}.`); expect(h, k).toContain(`${cap(b)}: ${be}.`);
      expect(h, k).toContain(LINE_WHAT[k]);
      expect(h, k).not.toMatch(/undefined|\.\./);
      if (k === 'carFore' || k === 'carIn') expect(h.startsWith(LINE_WHAT[k]), k).toBe(true);
      else expect(h.endsWith(LINE_WHAT[k]), k).toBe(true);
    }
  });
  it('the names the player reads are in US spelling (traveler, not traveller)', () => {
    for (const t of [...Object.values(LINE_NAME), ...Object.values(LINE_LABEL), ...Object.values(LINE_WHAT), ...Object.values(LINE_ENDS).flat()])
      expect(t, t).not.toMatch(/travell|colour|centre|harbour|favour/i);
    expect(LINE_NAME.traveller).toBe('traveler'); // (the toast: "The traveler is yours")
  });
});
