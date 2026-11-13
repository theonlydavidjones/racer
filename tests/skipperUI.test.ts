// The skipper half of the Yacht Club's Members tab (src/ui/skipperUI.ts): her seven ratings shown on her card, her sliders
// yours to set (the club's own shown, not edited), and what's said of her at the club.
import { describe, expect, it } from 'vitest';
import { SKIPPER_ATTRS } from '../src/ai/skipper';
import { SKIPPER_LABELS, installSkipperUI, skipperBars, skipperGossip, skipperOf, skipperSection } from '../src/ui/skipperUI';
import { SKIPPER_UI, applyMemberInput } from '../src/ui/members';
import type { Member } from '../src/club/members';

const member = (o: Partial<Member>): Member => ({ id: 'm1', name: 'Pat Example', roles: ['skipper'], origin: 'yours', seed: 1, h: 1.75, w: 75, skill: 0.6, ...o } as Member);

describe('the Members tab: the skipper half', () => {
  it('a label for every rating, in the attributes\' order', () => {
    expect(SKIPPER_LABELS.map(l => l[0])).toEqual([...SKIPPER_ATTRS]);
  });
  it('her card shows all seven ratings, her own where set', () => {
    const html = skipperBars(member({ skipper: { start: 0.9 } }));
    expect(html.match(/class="mbar"/g)).toHaveLength(7);
    expect(html).toContain('width:90%');
    expect(skipperOf(member({})).nerve).toBe(0.5);
  });
  it('your members\' sliders are yours to set; the club\'s are shown, not edited', () => {
    expect(skipperSection(member({}))).not.toContain('disabled');
    expect(skipperSection(member({ origin: 'club' })).match(/disabled/g)).toHaveLength(7);
    const m = member({});
    expect(applyMemberInput(m, 'sk', '0.8', 'tactics')).toBe(true);
    expect(m.skipper?.tactics).toBe(0.8);
    expect(applyMemberInput(m, 'sk', '0.8', 'bogus')).toBe(false);
    const club = member({ origin: 'club' });
    expect(applyMemberInput(club, 'sk', '0.8', 'tactics')).toBe(false);
  });
  it('the club gossip speaks of what stands out, and nothing of a mid-fleet skipper', () => {
    const mid = skipperOf(member({}));
    expect(skipperGossip(mid)).toEqual([]);
    const g = skipperGossip({ ...mid, start: 0.9, tactics: 0.2 });
    expect(g.join(' ')).toMatch(/off the line well/);
    expect(g.join(' ')).toMatch(/overstands/);
  });
  it('installed into the Members tab\'s hooks', () => {
    installSkipperUI();
    expect(SKIPPER_UI.bars(member({}))).toContain('mbars-sk');
  });
});
