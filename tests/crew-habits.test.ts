import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, Z, newCrew } from '../src/boat/crewPhys';
import type { Boat } from '../src/boat/boat';

// Two of the crew's habits in light air, from Deep Physics' traces of crewstation's 6 kt races (16 Nov 2026).
const crew = () => newCrew(JSON.parse(JSON.stringify(DEFAULT_CREW)), 'S');

describe('Not moved for a point of sail she only passes through (crewWork.ts courseHeld, crewPhys.ts CrewCall.held)', () => {
  it('a slow penalty circle in 6 kt: nobody goes forward for the run, nor back for the beat', () => {
    // (a minute on a beat, then circling at 4°/s with a quarter of a knot of way, as a penalty turned at a crawl: before,
    // the bow hand went to the mast each time she passed about 120° off the wind and back as she came up)
    const b: Boat = testBoat({ heading: 315, kt: 0.5, windKt: 6 }); b.crew = crew();
    const gz = b.crew.people.map(a => a.goal?.z ?? a.z), moves: string[] = []; let h = 315;
    sail(b, 360, t => {
      if (t > 60) { h = (h + 4 / 60) % 360; b.h = h; b.turnRate = 4; b.desired = h; if (b.v > 0.15) b.v = 0.13; }
      b.crew!.people.forEach((a, j) => { if (j === 0) return; const g = a.goal?.z ?? a.z; if (t > 60 && !a.job && Math.abs(g - gz[j]!) > 0.3) moves.push(`${t.toFixed(0)} s: crew ${j} ${gz[j]!.toFixed(2)} → ${g.toFixed(2)}`); gz[j] = g; });
    });
    expect(moves, 'moves along the boat with no job while she circles').toEqual([]);
  });
  it('a bear-away onto a run, held: the bow hand still goes to the mast for it', () => {
    const b: Boat = testBoat({ heading: 315, kt: 3, windKt: 6 }); b.crew = crew();
    let atMast = 0;
    sail(b, 300, t => { if (t > 60) { const a = Math.min(160, 45 + (t - 60) * 6); b.h = (360 - a + 360) % 360; }
      if (t > 200 && b.crew!.people.some(p => Math.abs(p.z - Z.mast) < 0.3)) atMast++; });
    expect(atMast, 'at the mast on the run once she holds it').toBeGreaterThan(0);
  });
});

describe('The outhaul set for the breeze, not re-trimmed as a light wind wanders across 5 kt (controls.ts guideLimits)', () => {
  it('a beat in 4 to 6 kt for ten minutes: the outhaul isn\'t moved every minute and a half', () => {
    // (the guide's ranges, North Sails: "very light winds (0-5 knots)" 3 cm from the mark, "medium winds (5-12 knots)"
    // 1.5 cm; the wind wandering across 5 kt, every two minutes. Blended across the knot, the guide's band slid out from
    // under the setting each time the wind it was read at moved, and they went up to move it, about every 95 s:
    // Deep Physics' trace, crewstation's 6 kt seed 15)
    const b: Boat = testBoat({ heading: 315, kt: 2.5, windKt: 5 }); b.crew = crew();
    const had = b.crew.people.map(() => null as string | null); let trips = 0;
    sail(b, 660, t => { b.ww.kt = 5 + 1.2 * Math.sin(2 * Math.PI * t / 120) + 0.3 * Math.sin(2 * Math.PI * t / 23);
      b.crew!.people.forEach((a, i) => { const j = a.job?.line ?? null; if (j === 'outhaul' && j !== had[i] && t > 60) trips++; had[i] = j; }); });
    expect(trips, 'outhaul trips in ten minutes').toBeLessThanOrEqual(1);
  });
});

