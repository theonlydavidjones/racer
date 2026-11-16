import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { World } from '../src/sim/world';
import { passageNow } from '../src/sim/navigator';
import { harborRoute, slipById, SLIPS } from '../src/geo/marina';
import { landAlong, wharfNearest } from '../src/geo/shore';
import { dist } from '../src/core/math';

/**
 * Home to her slip, the whole way (the owner, 15 Nov 2026: "navigator just cannot take her home to her slip"): the passage
 * plan from the Bay to the harbor's mouth (sim/navigator.ts, the router), then on from there along the fairways to the
 * fairway off her slip (geo/marina.ts harborRoute, Marinas'). In each harbor the way in reaches: the passage arrives at the
 * mouth itself (within a few meters, so the line on into the fairway is the router's own last test: within 30 m she can
 * be on the other side of a breakwater end, as at South Beach), nothing in the whole track crosses anything a boat runs
 * aground on, and the sea part keeps clear of the piers and wharves away from its two ends.
 */
const home = (slipId: string, from: string) => {
  const s = slipId.includes(':') ? slipById(slipId)! : SLIPS.find(x => x.marina === slipId && harborRoute(x))!;
  const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windKt: 12, current: 'real', tideDate: '2026-11-25', tideTime: '13:00', sailFrom: from, sailTo: 'slip', boats: [boat], boat, boatId: boat.id } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true });
  return { r: passageNow(w as never)!, way: harborRoute(s)!, key: (w as unknown as { dest: { key: string } }).dest.key };
};

describe('the passage home to her slip', () => {
  for (const [slip, from] of [['gashouse-cove:572', 'cityfront'], ['west-harbor', 'cityfront'], ['horseshoe-bay', 'sausalito'], ['south-beach', 'baybridge'], ['corinthian', 'raccoon'], ['richmond-yc', 'berkeley']] as const)
    it(`${slip} from ${from}: to the mouth, then the way in to the fairway off her slip, through nothing`, () => {
      const { r, way, key } = home(slip, from), tr = r.track, nSea = tr.length - way.path.length;
      expect(key).toBe('slip');
      expect(r.ok).toBe(true);
      expect(dist(tr[nSea - 1].p, way.entry), 'the passage arrives at the mouth').toBeLessThan(3.5);
      expect(dist(tr[tr.length - 1].p, way.approach), 'and the track ends off her slip').toBeLessThan(0.01);
      expect(tr.slice(nSea).every(q => q.t === tr[nSea - 1].t), 'the way in untimed (the passage\'s minutes are to the mouth)').toBe(true);
      for (let k = 1; k < tr.length; k++) expect(landAlong(tr[k - 1].p, tr[k].p), `segment ${k} of ${tr.length}`).toBe(Infinity);
      const near = tr.slice(0, nSea).filter(q => dist(q.p, tr[0].p) > 80 && dist(q.p, way.entry) > 80 && wharfNearest(q.p, 15));
      expect(near.length, 'sea points within 15 m of a pier or wharf').toBe(0);
    }, 180_000);
});
