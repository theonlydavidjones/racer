import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, Z, newCrew } from '../src/boat/crewPhys';
import type { Boat } from '../src/boat/boat';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { LL } from '../src/geo/geo';
import { n360 } from '../src/core/math';

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
  it('a 12 s luff to keep clear on a run, the pole out: nobody re-stations for it', () => {
    // (a run at 165° in 6 kt with the pole set and the crew forward for it; then up to 115° at 6°/s, 12 s there, and back,
    // as she keeps clear of a boat crossing: before, the layout went foredeck, cockpit, foredeck, Deep Physics' trace of
    // crewstation's 12 kt seed 1)
    const b: Boat = testBoat({ heading: 360 - 165, kt: 3, windKt: 6 }); b.crew = crew(); b.pole = 'set'; b.poleWant = true;
    let twa = 165; const gz = b.crew.people.map(a => a.goal?.z ?? a.z), moves: string[] = [];
    sail(b, 220, t => {
      if (t > 120 && t < 175) twa = t < 128.3 ? Math.max(115, twa - 6 / 60) : t < 140.3 ? 115 : Math.min(165, twa + 6 / 60);
      b.h = (360 - twa + 360) % 360;
      b.crew!.people.forEach((a, j) => { if (j === 0) return; const g = a.goal?.z ?? a.z; if (t > 118 && !a.job && Math.abs(g - gz[j]!) > 0.3) moves.push(`${t.toFixed(0)} s: crew ${j} ${gz[j]!.toFixed(2)} → ${g.toFixed(2)}`); gz[j] = g; });
    });
    expect(b.crew.layout, 'forward for the run with the pole').not.toBe('cockpit');
    expect(moves, 'moves along the boat with no job through the luff and after').toEqual([]);
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

describe('Up at the cabin top, they see to what\'s coming due there in the same trip (crewWork.ts BATCH)', () => {
  it('a beam reach on the tiller pilot in 6 kt, the light breeze shifting under her: the vang not eased and set again, nobody to the mast', () => {
    // (crewcruise's beam reach, seed 2: on a held heading her angle wandered 39-76° off the wind with the shifts, and each
    // read the guide afresh as a new course, the vang eased at 331 s and set again at 356 s. Only her heading moving
    // makes a new course, physics.ts NEW_HEADING)
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0 } as Settings;
    const w = new World(COURSES[0], S, 2, { freeSail: true }), u = w.user, p = LL(37.835, -122.40); u.x = p.x; u.y = p.y;
    w.step(DT); u.h = n360(u.ww.from + 90); u.v = 2.5; engage(u, w.pilot, 'auto');
    const had = u.crew!.people.map(() => null as string | null), vang: number[] = [];
    const mast: number[] = [];
    while (w.t < 360) {
      w.step(DT); u.crew!.people.forEach((a, i) => { const j = a.job?.line ?? null; if (j === 'vang' && j !== had[i] && w.t > 60) vang.push(Math.round(w.t)); had[i] = j; });
      if (u.crew!.layout === 'mast' && !mast.length) mast.push(Math.round(w.t));
    }
    const back = vang.filter((t, i) => i > 0 && t - vang[i - 1]! < 30);
    expect(back, `vang trips at ${vang.join(', ')} s`).toEqual([]);
    // (nor the bow hand to the mast for the run, as a shift takes her angle past 120° for a few seconds)
    expect(mast, 'to the mast on a beam reach').toEqual([]);
  });
  it('going forward to the mast on a run: not drawn at the mast while still sat in the cockpit, before they get up', () => {
    // (a broad reach in 6 kt on the tiller pilot, the bow hand to the mast for the trim: before, for the second of their
    // reaction they were posed at the mast where they sat, then crossing, then at the mast again, three moves for one)
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0 } as Settings;
    const w = new World(COURSES[0], S, 2, { freeSail: true }), u = w.user, p = LL(37.835, -122.40); u.x = p.x; u.y = p.y;
    w.step(DT); u.h = n360(u.ww.from + 150); u.v = 2.5; engage(u, w.pilot, 'auto');
    const fwd = new Set(['mast', 'bow', 'fore']), bad: string[] = []; let atMast = 0;
    while (w.t < 240) {
      w.step(DT);
      u.crew!.people.forEach((a, i) => {
        if (!fwd.has(a.pose) || a.job) return;
        if ((a.goal?.z ?? a.z) > Z.cockpitFwd - 0.05) bad.push(`${w.t.toFixed(1)} s: crew ${i} at z ${a.z.toFixed(2)}`); else atMast++;
      });
    }
    expect(atMast, 'the bow hand forward at some point').toBeGreaterThan(0);
    expect(bad.slice(0, 5), 'posed forward with their place still in the cockpit').toEqual([]);
  });
  it('sent up for the Cunningham, the outhaul a little off is trimmed while they\'re there, not a trip of its own later', () => {
    // (a beat in 16 kt, settled; then the Cunningham let right off, below the guide's floor, a trip at once, and the outhaul 3% off where they want it, not urgent
    // want it, set half a minute ago, so a trip for it waits till a minute, LINE_GAP. Before, it got a trip of its own when the wait ran out:
    // the Cunningham and the outhaul a trip each, 94 s apart, crewcruise's 6 kt beam reach)
    const b: Boat = testBoat({ heading: 315, kt: 5, windKt: 16 }); b.crew = crew();
    const c = b.crew, jobs: { t: number; line: string }[] = [], had = c.people.map(() => null as string | null);
    sail(b, 300, t => {
      if (Math.abs(t - 120) < 1 / 120) { b.ctl.cunningham = 0; b.ctl.outhaul = Math.max(0, (b.crewPlan?.outhaul ?? b.ctl.outhaul) - 0.03); (c.lineSet ??= {}).outhaul = (c.clock ?? 0) - 30; }
      c.people.forEach((a, i) => { const j = a.job?.line ?? null; if (j && j !== had[i] && t > 120 && (j === 'cunningham' || j === 'outhaul')) jobs.push({ t, line: j }); had[i] = j; });
    });
    const cun = jobs.find(j => j.line === 'cunningham'), out = jobs.find(j => j.line === 'outhaul');
    expect(cun, 'up for the Cunningham').toBeDefined(); expect(out, 'the outhaul trimmed').toBeDefined();
    expect(out!.t - cun!.t, 'the outhaul in the same trip, seconds after the Cunningham').toBeLessThan(15);
  });
});

