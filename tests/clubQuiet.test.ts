import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';

// The UI audit (21 Nov): the Yacht Club opened over the setup race's own displays (the start clock, the strategist, the
// messages, the inset map and the NEXT strip), and at 1280 its panel covered half the inset. Behind the club the game's
// displays go quiet, as behind the setup (body.still).
describe('the Yacht Club has no game displays behind it', () => {
  const css = readFileSync('src/styles/09-audit.css', 'utf8') as string;
  const still = css.split('\n').filter(l => l.startsWith('body.still #'));
  const club = css.split('\n').filter(l => l.startsWith('body:has(#fleet:not([hidden])) #'));
  it('hides every display the setup does', () => {
    expect(still.length).toBeGreaterThan(1);
    for (const l of still) {
      const sel = l.slice(0, l.indexOf('{')).split(',').map(s => s.trim().replace('body.still', 'body:has(#fleet:not([hidden]))'));
      for (const s of sel) expect(club.join('\n'), s).toContain(s);
    }
  });
  it('and the NEXT strip and the compass', () => {
    expect(readFileSync('src/styles/18-layout-d.css', 'utf8') as string).toMatch(/body:has\(#fleet:not\(\[hidden\]\)\) #navStrip/);
  });
});

// The Season tab's head said "no throwout" over a footer saying "one throwout after all five races" (the UI audit):
// the head names a throwout only once there is one.
describe('the Season head and footer do not contradict', () => {
  it('no "no throwout" in the head', () => {
    const s = readFileSync('src/ui/season.ts', 'utf8') as string;
    expect(s).not.toContain("'no throwout'");
    expect(s).toContain("${discards ? ` · ${discards} throwout` : ''}</span>");
  });
});
