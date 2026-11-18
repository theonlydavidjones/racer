// The passage home ends where the pilot hands her over (the physics review of the navigator, 17 Nov 2026: at South Beach
// the plan ended at the entrance nearest her slip as the crow flies, the pilot steered for the one nearest by water, and
// for 431 of its 674 slips those were different entrances): both at geo/marina.ts harborRoute's mouth.
import { describe, expect, it } from 'vitest';
import { HARBORS, SLIPS, harborRoute } from '../src/geo/marina';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { passageNow } from '../src/sim/navigator';

describe('the passage home ends at the pilot\'s mouth', () => {
  it('a South Beach slip whose entrance by water isn\'t its nearest as the crow flies: the plan ends at the one by water', () => {
    const H = HARBORS.find(h => h.id === 'south-beach')!;
    const near = (p: { x: number; y: number }) => H.exits.reduce((a, e) => Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? e : a);
    const s = SLIPS.find(q => { if (q.marina !== 'south-beach' || q.kind !== 'bow-in') return false; const r = harborRoute(q); return !!r && Math.hypot(r.mouth.x - near(q.p).x, r.mouth.y - near(q.p).y) > 50; })!;
    expect(s, 'a slip whose mouths differ').toBeTruthy();
    const r = harborRoute(s)!, boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, windDir: 270, mode: 'sail', sailFrom: 'cityfront', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }); w.step(DT);
    expect(w.sendHome()).toBe(true);
    const pn = passageNow(w)!;
    expect(pn).toBeTruthy();
    const end = pn.route[pn.route.length - 1];
    expect(Math.hypot(end.x - r.mouth.x, end.y - r.mouth.y), `${s.id}: the plan's end against the pilot's mouth (m)`).toBeLessThan(1);
  }, 300_000);
});
