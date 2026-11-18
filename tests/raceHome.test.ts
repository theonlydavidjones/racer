// Sail home in a race (the owner, 18 Nov 2026: "sail home should work in a race and retire you, but should surface a
// dialog first"): the page asks first (scripts/check/race-home.cjs); retiring, she's scored RET and her slip's the
// destination, with the navigator's passage to it.
import { describe, expect, it } from 'vitest';
import { slipById } from '../src/geo/marina';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { passageNow } from '../src/sim/navigator';

describe('Sail home in a race', () => {
  it('retires her (RET), makes her slip the destination, and the navigator has the passage there', () => {
    const s = slipById('gashouse-cove:572')!, boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
    const S = { ...DEFAULT_SETTINGS, mode: 'race', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack', windKind: 'west', windKt: 12 } as Settings;
    const w = new World(COURSES[0], S, 1), u = w.user; for (let i = 0; i < 60; i++) w.step(DT);
    expect(w.freeSail).toBe(false); expect(u.retired ?? false).toBe(false); expect(w.dest?.key).not.toBe('slip');
    expect(w.sendHome()).toBe(true);
    expect(u.retired).toBe(true); // (scored RET in the results: app/results.ts)
    expect(w.dest?.key).toBe('slip');
    expect(w.drainEvents().some(e => e.type === 'toast' && /Retired \(RET, RRS A5\.1\)/.test((e as { msg: string }).msg))).toBe(true);
    const pn = passageNow(w); expect(pn, 'the passage home').toBeTruthy();
  }, 300_000);
});
