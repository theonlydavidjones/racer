// The owner was run down by the Alcatraz ferry while cruising (17 Nov 2026: "IRL that ferry would have borne off way
// earlier though. They move fast."). A ferry is power-driven and keeps out of a sailing boat's way (COLREGS Rule 18(a)),
// early and substantially (Rules 8 and 16). Here a boat sails across each ferry's route on a collision course, at 6 kt,
// from either side, holding her course and speed as Rule 17(a) asks. She must never be hit, the ferry must pass well
// clear, and the ferry's alteration must begin when the closest approach is about ACT_S (sim/traffic.ts) away.
// On main the ferries held their line regardless, and every one of these met her.
import { describe, expect, it } from 'vitest';
import { SERVICES, VESSEL, ACT_S, CLEAR, ROUTES, LATE_S, XTRACK, Traffic, newWays, type Craft } from '../src/sim/traffic';
import { trafficWater } from '../src/sim/world';
import type { Vec } from '../src/core/math';
import { crossing, meeting, when, across, T0, V } from './helpers/ferryMeet';

describe('the ferries give way to a boat under sail', () => {
  for (const kind of ['alcatraz', 'ferry'] as const) for (const side of [1, -1] as const) {
    it(`the ${kind === 'alcatraz' ? 'Alcatraz' : 'Sausalito'} ferry, a boat crossing from her ${side > 0 ? 'port' : 'starboard'} side`, () => {
      const r = crossing(kind, side, 3);
      console.log(`${kind} side ${side}: nearest ${r.nearest.toFixed(0)} m, the alteration began ${r.firstAlter.toFixed(0)} s before the closest approach`);
      expect(r.hit, 'hit by the ferry').toBe(false);
      expect(r.nearest, 'the nearest she came (m, center to boat)').toBeGreaterThan(CLEAR * 0.8 + r.half);
      expect(r.firstAlter, 'the alteration began (s before the closest approach)').toBeGreaterThan(ACT_S - 10);
      // (and not before: measured on straight lines as she was going, a few seconds off where her route bends; she decides
      // twice a second, and her turn builds up over a few)
      expect(r.firstAlter).toBeLessThan(ACT_S + 8);
    }, 120_000);
  }
});

describe('the traffic, the same every time and different each run', () => {
  it('the same race gives the same give-way, to the bit', () => {
    const a = crossing('alcatraz', 1, 5), b = crossing('alcatraz', 1, 5);
    expect(a.track.length).toBeGreaterThan(1000);
    expect(a.track.every((x, i) => Object.is(x, b.track[i]))).toBe(true);
  }, 120_000);
  // the owner (17 Nov 2026): a real ferry doesn't keep an exact course on a perfect schedule. Each crossing leaves up to
  // its dwell late (exponential, mean LATE_S) and keeps a line up to XTRACK to one side, from the run's seed
  it('each crossing leaves a little late and keeps its own line, by the seed', () => {
    const id = SERVICES.findIndex(s => s.kind === 'ferry'), svc = SERVICES[id], r = ROUTES[svc.route];
    let total = 0; for (let i = 1; i < r.length; i++) total += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y);
    const period = 2 * (total / (VESSEL.ferry.kt * 0.5144) + svc.dwell);
    const seg = (p: { x: number; y: number }) => { let m = Infinity; for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); m = Math.min(m, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)); } return m; };
    const gaps: number[] = [], offs: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const tr = new Traffic(true, seed);
      // her departures from Sausalito's far end over a day (outbound and back alike: each leaves from a berth)
      let was = tr.vessels(0)[id].moving, home: number[] = [];
      for (let t = 1; t < 86400; t += 1) {
        const v = tr.vessels(t)[id];
        if (v.moving && !was) { home.push(t); const mid = tr.vessels(t + 300)[id]; if (mid.moving) offs.push(seg(mid)); }
        was = v.moving;
      }
      // (every other departure is from the same berth: a schedule's period apart, give or take each one's lateness)
      for (let k = 2; k < home.length; k++) gaps.push(home[k] - home[k - 2] - period);
    }
    expect(gaps.length).toBeGreaterThan(200);
    // lateness: no crossing more than half its dwell late, and they differ (an exponential's spread, mean LATE_S)
    expect(Math.max(...gaps.map(Math.abs))).toBeLessThanOrEqual(svc.dwell / 2 + 2);
    const sd = Math.sqrt(gaps.reduce((a, g) => a + g * g, 0) / gaps.length);
    expect(sd).toBeGreaterThan(LATE_S * 0.8); // (the difference of two lateness draws: its spread is √2 × LATE_S)
    expect(sd).toBeLessThan(LATE_S * 2);
    // her line: every crossing within XTRACK of the one drawn, and most not on it
    expect(Math.max(...offs)).toBeLessThanOrEqual(XTRACK + 1);
    expect(offs.filter(o => o > 5).length).toBeGreaterThan(offs.length / 2);
  }, 120_000);
});

describe('the ferries give way in the harder meetings too', () => {
  for (const kind of ['alcatraz', 'ferry'] as const) {
    const id = SERVICES.findIndex(s => s.kind === kind), half = VESSEL[kind].len / 2;
    it(`the ${kind === 'alcatraz' ? 'Alcatraz' : 'Sausalito'} ferry, a boat crossing within a minute of her berth: no contact`, () => {
      // (near her berth she can't turn off her line: she slows, or stops)
      for (const side of [1, -1]) {
        const T = when(id, 3, T0, 120, (a, b, c) => a.moving && b.moving && !c.moving);
        const r = meeting(id, 3, T, [across(id, 3, T, 120, side)], 300);
        expect(r.nearest[0], `side ${side}`).toBeGreaterThan(half + 20);
      }
    });
    it(`the ${kind === 'alcatraz' ? 'Alcatraz' : 'Sausalito'} ferry, two boats, one already within her clearance: she doesn't turn onto either`, () => {
      const T = when(id, 3, T0, 150, (a, b, c) => a.moving && b.moving && c.moving);
      const m = new Traffic(true, 3).vessels(T + 40)[id], u = { x: Math.sin(m.h * Math.PI / 180), y: Math.cos(m.h * Math.PI / 180) };
      // (one crossing her bow from starboard, to meet in 150 s; one lying stopped 100 m to port of where she'll be in 40 s)
      const still: Craft = { x: m.x - u.y * 100, y: m.y + u.x * 100, vx: 0, vy: 0 };
      const r = meeting(id, 3, T, [across(id, 3, T, 150, -1), still], 300);
      expect(r.nearest[0]).toBeGreaterThan(half + 20);
      expect(r.nearest[1]).toBeGreaterThan(half + 20);
    });
  }
  it('the Sausalito ferry, a boat crossing just past the bend off the Wharf: well clear', () => {
    const id = SERVICES.findIndex(s => s.kind === 'ferry'), r = ROUTES.sausalito, bend = r[3];
    const T = when(id, 3, T0, 150, (a, b) => a.moving && b.moving && Math.hypot(b.x - bend.x, b.y - bend.y) < 150 && Math.hypot(a.x - r[5].x, a.y - r[5].y) > Math.hypot(b.x - r[5].x, b.y - r[5].y));
    for (const side of [1, -1]) expect(meeting(id, 3, T, [across(id, 3, T, 150, side)], 300).nearest[0], `side ${side}`).toBeGreaterThan(CLEAR * 0.8 + VESSEL.ferry.len / 2);
  });
  it('the Sausalito ferry, kept off her line by a boat lying on it, never runs into the piers: real water', () => {
    // (the second review's case: she turns off her line for a boat crossing 4 km out from the Ferry Building, inbound, and
    // a boat lying stopped on her line 2.3 km out keeps her from going back to it, toward the pier heads)
    const id = SERVICES.findIndex(s => s.kind === 'ferry'), r = ROUTES.sausalito;
    let L = 0, stop: Vec = r[0]; for (let i = 1; i < r.length && L < 2300; i++) { const d = Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y); if (L + d >= 2300) { const f = (2300 - L) / d; stop = { x: r[i - 1].x + (r[i].x - r[i - 1].x) * f, y: r[i - 1].y + (r[i].y - r[i - 1].y) * f }; } L += d; }
    const ferryBldg = r[0];
    const T = when(id, 3, T0, 150, (a, b) => a.moving && b.moving && Math.hypot(a.x - ferryBldg.x, a.y - ferryBldg.y) > 5000 && Math.hypot(b.x - ferryBldg.x, b.y - ferryBldg.y) < Math.hypot(a.x - ferryBldg.x, a.y - ferryBldg.y));
    for (const side of [1, -1]) {
      const m = meeting(id, 3, T, [across(id, 3, T, 150, side), { x: stop.x, y: stop.y, vx: 0, vy: 0 }], 900, trafficWater);
      expect(m.land, `side ${side}: her nearest to land or a pier away from her berths (m)`).toBeGreaterThan(VESSEL.ferry.beam / 2 + 20);
      expect(Math.min(...m.nearest), `side ${side}: the nearest boat`).toBeGreaterThan(VESSEL.ferry.len / 2 + 20);
    }
  }, 120_000);
  it('a ferry overtaking a boat on her line follows or passes, and never stops a mile back', () => {
    for (const kind of ['ferry', 'alcatraz', 'coastguard'] as const) {
      const id = SERVICES.findIndex(s => s.kind === kind);
      const T = when(id, 3, T0, 200, (a, b, c) => a.moving && b.moving && c.moving);
      const v = new Traffic(true, 3).vessels(T)[id], u = { x: Math.sin(v.h * Math.PI / 180), y: Math.cos(v.h * Math.PI / 180) };
      // (a boat ahead on her line going her way; and, the third review's case, one crossing her way 1.6 km off as well)
      for (const crossing of [false, true]) {
        const boats: Craft[] = [{ x: v.x + u.x * 600, y: v.y + u.y * 600, vx: u.x * V, vy: u.y * V }];
        if (crossing) boats.push(across(id, 3, T, 170, 1));
        const m = meeting(id, 3, T, boats, 400, trafficWater);
        // (following a boat ahead she can't yet pass is seamanlike, near her berth where her room is small; stopping for one is not)
        expect(m.slowFar, `${kind}${crossing ? ', and a crossing boat' : ''}: her least speed with no boat within a minute of her`).toBeGreaterThan(0.25);
        for (const d of m.nearest) expect(d, `${kind}: the nearest she came`).toBeGreaterThan(VESSEL[kind].len / 2 + 20);
      }
    }
  }, 120_000);

  it('a decision with a fleet about her is quick (wall clock: rerun alone once if it fails under load)', () => {
    const id = SERVICES.findIndex(s => s.kind === 'ferry'), tr = new Traffic(true, 3), ways = newWays();
    const T = when(id, 3, T0, 120, (a, b) => a.moving && b.moving), m = tr.vessels(T + 120)[id];
    let seed = 9; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    const fleet: Craft[] = Array.from({ length: 20 }, () => ({ x: m.x + (rnd() - 0.5) * 600, y: m.y + (rnd() - 0.5) * 600, vx: (rnd() - 0.5) * 6, vy: (rnd() - 0.5) * 6 }));
    for (let k = 0; k < 5; k++) tr.decide(T, ways, fleet, trafficWater, id); // (warm: the water's cells, the compiler)
    const t0 = performance.now(); for (let k = 0; k < 20; k++) { ways[id].tgt = 0; ways[id].slowTgt = 1; tr.decide(T + k * 0.5, ways, fleet, trafficWater, id); }
    const ms = (performance.now() - t0) / 20;
    console.log(`one decision, 20 boats about her: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(8); // (one service a step: a frame is 16 ms)
  }, 60_000);


});
