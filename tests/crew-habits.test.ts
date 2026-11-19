import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, Z, newCrew } from '../src/boat/crewPhys';
import { SETTLE, type Boat } from '../src/boat/boat';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { LL } from '../src/geo/geo';
import { n360 } from '../src/core/math';
import { carInFor, defaultControls } from '../src/boat/controls';
import { optimalSheet } from '../src/boat/trim';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';

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
  // (a trip off only the guide's settings is judged by what it's worth and how long the breeze has held past the step,
  // not forced by the band: crewWork.ts GUIDE_HOLD. The two cases left after the steps were read as ranges, the physics
  // review of the crew habits, 16 Nov 2026)
  const outhaulTrips = (kt: (t: number) => number, s0: number, secs: number) => {
    const b: Boat = testBoat({ heading: 315, kt: s0, windKt: kt(0) }); b.crew = crew();
    const had = b.crew.people.map(() => null as string | null), trips: string[] = [];
    sail(b, secs, t => { b.ww.kt = kt(t);
      b.crew!.people.forEach((a, i) => { const j = a.job?.line ?? null; if (j === 'outhaul' && j !== had[i] && t > 60) trips.push(`${t.toFixed(0)} s: ${b.ctl.outhaul.toFixed(2)} → ${a.job!.to?.toFixed(2)}`); had[i] = j; }); });
    return { b, trips };
  };
  it('a light-air beat whose breeze swings across both 4 and 5 kt: not at the outhaul every minute and a half', () => {
    // (3.5 to 5.7 kt: the guide's ceiling 3 cm off the mark under 4 kt read, its floor 1.5 cm from 5; before, 0.05 to 0.45
    // and back, a trip each 50-220 s, five in fifteen minutes, for moves worth under 0.02% of drive)
    const { trips } = outhaulTrips(t => 4.6 + 1.1 * Math.sin(2 * Math.PI * t / 150) + 0.3 * Math.sin(2 * Math.PI * t / 23), 2.5, 900);
    expect(trips, 'outhaul trips in fifteen minutes').toHaveLength(0);
  });
  it('a beat in 11.5 ± 1.2 kt: the outhaul not taken to the mark and eased back each puff and lull', () => {
    // (the guide's medium ceiling, 1.5 cm off, read under 11 kt, its "all the way to the mark" from 12: before, 1 to 0.55
    // and back, ten trips in fifteen minutes)
    const { trips } = outhaulTrips(t => 11.5 + 1.2 * Math.sin(2 * Math.PI * t / 150) + 0.3 * Math.sin(2 * Math.PI * t / 23), 4.5, 900);
    expect(trips, 'outhaul trips in fifteen minutes').toHaveLength(0);
  });
  it('a breeze that builds across 12 kt and stays: the outhaul still goes to the mark, in one trip, once it has held', () => {
    const { b, trips } = outhaulTrips(t => (t < 120 ? 10 : Math.min(14, 10 + (t - 120) / 30)) + 0.3 * Math.sin(2 * Math.PI * t / 23), 4.5, 600);
    expect(trips, 'outhaul trips').toHaveLength(1);
    expect(b.ctl.outhaul, 'on the mark in 14 kt').toBeGreaterThan(0.9);
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
  it('a shift that stays under a held heading, wandering about 15° past the course read: the bow hand isn\'t sent forward and back', () => {
    // (the course read at 110° true; then the breeze backs 17° and stays, wandering ±5°: her angle 122-132°. Snapped back
    // to the course read each time it came within 15° of it, the minute's mean saw-toothed about 120° and the bow hand went
    // to the mast and back, the physics review: the snap is once for each course read)
    const b: Boat = testBoat({ heading: 110, kt: 3, windKt: 6 }); b.crew = crew();
    const moves: string[] = []; let lay = 'cockpit';
    sail(b, 600, t => {
      b.h = 110; b.desired = 110;
      if (t > 60) b.ww.from = n360(-17 + 5 * Math.sin(2 * Math.PI * t / 40));
      const l = b.crew!.layout ?? 'cockpit'; if (t > 150 && l !== lay) moves.push(`${t.toFixed(0)} s: ${lay} → ${l}`); lay = l;
    });
    expect(moves.length, moves.join(', ')).toBeLessThanOrEqual(1);
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


describe('The lazy jib car planned for the course she holds, not each wander of the wind (physics.ts, the crew\'s plan)', () => {
  it('a beat in the Bay\'s gusty 12 kt westerly: the lazy car\'s plan holds while her guide does, and the crew go forward only for one that has lasted', () => {
    // (crewstation's 12 kt seed 2, with helm-travel's quicker turn: the plan for the lazy car was read from the jib's
    // wanted angle at her apparent wind of a few seconds, and on a beat it hunted across all five athwartships holes every
    // few seconds; the crew's wait for a change that had lasted ran on through the hunting, and the bow hand went forward
    // to move the lazy car twice on the beat for a wish that had lasted a second, and the race went over the trips' backstop)
    const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 2, opponents: ['stock:1', 'stock:2'] } as unknown as Settings, 2);
    const ai = w.boats.filter(x => !x.isUser), flips = ai.map(() => 0), was = ai.map(() => ''), changed = ai.map(() => -1e9), busy = ai.map(() => false);
    const quick: string[] = [], far: string[] = [];
    const setUp: string[] = [], ready = ai.map(() => false);
    while (w.t < 360) {
      w.step(DT);
      // (set up before she sails, both cars at the hole for the wind she has: not left at the boat's default hole)
      ai.forEach((b, k) => { if (b.crewReady && !ready[k]) { ready[k] = true; const want = carInFor(optimalSheet('jib', b.settle![SETTLE.guideAwa]) - 0.25);
        for (const t of ['P', 'S'] as const) if (b.ctl.car[t].ins !== want) setUp.push(`boat ${k + 1} ${t}: hole ${b.ctl.car[t].ins}, ${want} for the wind`);
        if (want === defaultControls().car.P.ins) setUp.push(`boat ${k + 1}: the wind's hole is the default's, ${want}: this race can't tell them apart`); } });
      if (w.t < 20) continue;
      ai.forEach((b, k) => {
        const p = b.carPlan ? `${b.carPlan.fore}/${b.carPlan.ins}` : ''; if (p !== was[k]) changed[k] = w.t;
        // (a trip to the lazy car: for a plan that has stood 30 s at least, CAR.hold's least, an expert's)
        const onCar = b.crew!.people.some(a => a.job?.line === 'car');
        if (onCar && !busy[k] && w.t - changed[k] < 30) quick.push(`boat ${k + 1} at ${w.t.toFixed(0)} s: the plan ${(w.t - changed[k]).toFixed(0)} s old`);
        busy[k] = onCar;
        if (b.leg !== 0 || b.tacking) { was[k] = p; return; }
        // (while she holds her course, 10 s and more since she last swung, crewSettle's NEW_HELD: out of a tack her
        // apparent wind swings 15-45° as she gathers way; the crew don't go to a car then)
        if (was[k] && p !== was[k] && b.settle![SETTLE.since] >= 10) flips[k]++; was[k] = p;
        // (and no lazy car's lead CAR_HOLES (3) or more outboard of the hole for her guide's angle, the jib held off its
        // angle, once she's held a course past the crew's wait: brought in for a lasting change)
        const ideal = carInFor(optimalSheet('jib', b.settle![SETTLE.guideAwa]) - 0.25);
        // (once the plan and her course have stood longer than the crew's wait, CAR.hold's most, 90 s, and the trip itself;
        // crewWork.ts carJob can still hold a right trip back, with the hand hiking, heeled 20° or more, or the car set on
        // that side since the breeze last changed (`real`): on this race none of those holds it)
        if (w.t - changed[k] >= 110 && b.settle![SETTLE.since] >= 110 && !onCar) { const lz = b.ctl.car[b.tack].ins; if (lz - ideal >= 3) far.push(`boat ${k + 1} at ${w.t.toFixed(0)} s: hole ${lz}, ${ideal} for her guide`); }
      });
    }
    // (a few in these five minutes, for a new breeze: before, 168 on the first boat)
    flips.forEach((f, k) => expect(f, `boat ${k + 1}: changes of the lazy car's plan on the beat`).toBeLessThanOrEqual(6));
    expect(setUp, 'the cars as set up before she sails').toEqual([]);
    expect(quick, 'trips forward to the lazy car for a plan that had only just come').toEqual([]);
    expect(far.slice(0, 3), 'the lazy car left far from where her guide wants it, past the crew\'s wait').toEqual([]);
  }, 300_000);
});
