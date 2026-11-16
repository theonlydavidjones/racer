import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { passageNow } from '../src/sim/navigator';
import { dist, type Vec } from '../src/core/math';
import { landAlong, wharfNearest } from '../src/geo/shore';
import { HARBORS, inBasin, SLIPS } from '../src/geo/marina';

/**
 * The passage plan never takes her through or close by a pier, a wharf, a breakwater or a dock (the owner: "navigator
 * not detecting this pier. I ran right into it", an Embarcadero pier; the Coordinator, 15 Nov 2026). Along and across the
 * Embarcadero's piers, the Wharf and Fort Mason, every segment of the planned track is clear of everything a boat runs
 * aground on (geo/shore.ts landAlong, exact), and no point of it is within 20 m of a wharf or pier (router.ts
 * WHARF_CLEAR, less a few meters for the track's midpoints) away from its two ends. Her slip in a marina: the plan
 * starts or ends at the marina's entrance, never in its basin (the way to the slip is the marina's own).
 */
const plan = (S: Partial<Settings>, place?: (w: World) => void) => {
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windKt: 14, current: 'real', tideDate: '2026-11-25', ...S } as Settings, 7, { freeSail: true });
  place?.(w);
  return passageNow(w as never)!;
};
const sound = (track: { p: Vec }[]) => {
  const a = track[0].p, b = track[track.length - 1].p;
  let crossings = 0, near = 0, basin = 0;
  for (let k = 1; k < track.length; k++) if (landAlong(track[k - 1].p, track[k].p) !== Infinity) crossings++;
  for (const q of track) {
    if (dist(q.p, a) < 80 || dist(q.p, b) < 80) continue;
    if (wharfNearest(q.p, 15) !== null) near++;
    if (inBasin(q.p)) basin++;
  }
  return { crossings, near, basin };
};

describe('the passage plan and the piers, wharves, breakwaters and docks', () => {
  for (const [from, to] of [['pier39', 'baybridge'], ['baybridge', 'pier39'], ['pier39', 'm-6'], ['m-6', 'pier39'], ['cityfront', 'pier39'], ['alcatraz', 'baybridge']] as const)
    for (const tideTime of ['13:00', '16:00'])
      it(`${from} to ${to} at ${tideTime}: through nothing, and no nearer a pier than its clearance`, () => {
        const r = plan({ sailFrom: from, sailTo: to, tideTime });
        expect(r.ok).toBe(true);
        expect(sound(r.track)).toEqual({ crossings: 0, near: 0, basin: 0 });
      }, 180_000);

  const slip = SLIPS.find(s => s.marina === 'west-harbor')!, H = HARBORS.find(h => h.id === 'west-harbor')!;
  it('from her slip in the West Harbor: the plan starts at the marina\'s entrance', () => {
    const r = plan({ sailFrom: 'cityfront', sailTo: 'alcatraz', tideTime: '13:00' }, w => { w.user.x = slip.p.x; w.user.y = slip.p.y; });
    expect(r.ok).toBe(true);
    expect(Math.min(...H.exits.map(e => dist(e, r.track[0].p)))).toBeLessThan(1);
    expect(sound(r.track)).toEqual({ crossings: 0, near: 0, basin: 0 });
  }, 180_000);
  it('home to her slip: the plan ends at the marina\'s entrance', () => {
    const r = plan({ sailFrom: 'alcatraz', sailTo: 'cityfront', tideTime: '13:00' }, w => { (w as unknown as { dest: unknown }).dest = { p: { ...slip.p }, name: 'her slip' }; });
    expect(r.ok).toBe(true);
    expect(Math.min(...H.exits.map(e => dist(e, r.track[r.track.length - 1].p)))).toBeLessThan(31);
    expect(sound(r.track)).toEqual({ crossings: 0, near: 0, basin: 0 });
  }, 180_000);
});
