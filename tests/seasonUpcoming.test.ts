import { beforeEach, describe, expect, it } from 'vitest';
import { seasons } from '../src/club/season';
import { nextRace, seasonCardHtml, upcomingRace } from '../src/ui/seasonView';

// Once race 1 was sailed the Season page offered only race 1 again, because race 2 (5 Dec) isn't published yet
// (owner, 18 Nov 2026). The calendar's next race is shown as still to come instead.
const mem = new Map<string, string>();
beforeEach(() => { mem.clear(); (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }; });

describe('a season whose next race is not published yet', () => {
  const now = () => seasons().at(-1)!;
  const sailed1: any = { 1: { at: 'x', scores: [{ you: true, points: 3 }] } };
  it('has no race to sail, but a calendar race to come', () => {
    expect(nextRace(now(), sailed1)).toBeNull();
    expect(upcomingRace(now())).toEqual({ no: 2, date: '2026-12-05' });
  });
  it('the Race page card names race 2 and its day, not "All sailed"', () => {
    const html = seasonCardHtml({ series: now(), res: sailed1, burgee: '', place: 2 });
    expect(html).toContain('Race 2 · Dec 5');
    expect(html).not.toContain('All sailed');
  });
  it('before race 1 is sailed, race 1 is the one next', () => {
    expect(nextRace(now(), {})).toBe(1);
    expect(seasonCardHtml({ series: now(), res: {}, burgee: '', place: null })).toContain('Race 1 next');
  });
});
