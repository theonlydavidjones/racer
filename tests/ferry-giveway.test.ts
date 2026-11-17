// The owner was run down by the Alcatraz ferry while cruising (17 Nov 2026: "IRL that ferry would have borne off way
// earlier though. They move fast."). A ferry is power-driven and keeps out of a sailing boat's way (COLREGS Rule 18(a)),
// early and substantially (Rules 8 and 16). Here a boat sails across each ferry's route on a collision course, at 6 kt,
// from either side, holding her course and speed as Rule 17(a) asks. She must never be hit, the ferry must pass well
// clear, and the ferry's alteration must begin when the closest approach is about ACT_S (sim/traffic.ts) away.
// On main the ferries held their line regardless, and every one of these met her.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { SERVICES, VESSEL, ACT_S, CLEAR, TURN_DEG_S, ROUTES, LATE_S, XTRACK, Traffic, newWays, type Craft } from '../src/sim/traffic';
import { trafficWater } from '../src/sim/world';
import { landDist as terrainLandDist, shoreDist, wharfNearest } from '../src/geo/shore';
import type { Vec } from '../src/core/math';

const V = 3; // (m/s, about 6 kt)

function crossing(kind: string, side: 1 | -1, seed: number) {
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'slack', tideDate: '2026-11-14', traffic: 1, fleet: 0, opponents: [], windKind: 'west', windKt: 12 } as Settings, seed, { freeSail: true });
  w.step(DT);
  const id = SERVICES.findIndex(s => s.kind === kind), ty = VESSEL[SERVICES[id].kind];
  // a moment when she's under way now and still under way 260 s on: the clock moved there
  const T = w.trafficT; let k = 0;
  for (; k < 7200; k++) { const a = w.traffic.vessels(T + k)[id], b = w.traffic.vessels(T + k + 260)[id]; if (a.moving && b.moving) break; }
  (w as unknown as { gunUtc: number }).gunUtc += k / 60; w.step(DT);
  // where she'll be in 200 s on her line, and a boat that will be there then, across her bow
  const m = w.traffic.vessels(w.trafficT + 200)[id], u = { x: Math.sin(m.h * Math.PI / 180), y: Math.cos(m.h * Math.PI / 180) };
  const dir = { x: u.y * side, y: -u.x * side }, start = { x: m.x - dir.x * V * 200, y: m.y - dir.y * V * 200 }, t0 = w.t;
  const b = w.user; let nearest = Infinity, firstAlter = NaN, hit = false; const track: number[] = [];
  for (let n = 0; n < 400 * 60; n++) {
    const s = w.t - t0; b.x = start.x + dir.x * V * s; b.y = start.y + dir.y * V * s; b.vx = dir.x * V; b.vy = dir.y * V; b.v = V; b.h = (Math.atan2(dir.x, dir.y) * 180 / Math.PI + 360) % 360;
    w.step(DT);
    const v = w.vessels[id]; if (!v) continue;
    if (n % 30 === 0) for (const o of w.vessels) track.push(o.x, o.y, o.h, o.v);
    const d = Math.hypot(v.x - b.x, v.y - b.y); nearest = Math.min(nearest, d);
    if ((b.lastHitT ?? -1) >= t0 || b.wrecked) hit = true;
    const way = (w as unknown as { ways?: { tgt: number; slow: number }[] }).ways?.[id];
    if (way && (way.tgt !== 0 || way.slow < 1) && firstAlter !== firstAlter) { // (she turns off her line, or slows)
      // her time to the closest approach as she was going when she began to turn
      firstAlter = 200 - (w.t - t0); // (they'd have met at m, 200 s from the start)
    }
  }
  return { nearest, firstAlter, hit, half: ty.len / 2, track };
}

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

/**
 * The traffic on its own, stepped as the World steps it (advance every 1/60 s, each give-way vessel deciding every half
 * second), with boats on straight courses: for the harder meetings. Each boat's nearest approach to the vessel's middle;
 * the vessel's largest jump in one step (× her speed), her fastest turn over a second (°/s), how far her reported speed
 * is from how fast she actually moved (worst share), how often her chosen side flips, her least share of speed while
 * no boat is within a minute of her, and her nearest to land or a pier away from her berths (m, her middle).
 */
function meeting(id: number, seed: number, T: number, boats: Craft[], secs: number, clearOf: (p: Vec) => boolean = () => true) {
  const tr = new Traffic(true, seed), ways = newWays(), dt = 1 / 60, nearest = boats.map(() => Infinity), sv = SERVICES[id];
  const vs = VESSEL[sv.kind].kt * 0.5144, ends = [ROUTES[sv.route][0], ROUTES[sv.route][ROUTES[sv.route].length - 1]];
  let last = tr.vessels(T, ways)[id], jump = 0, turn = 0, speedErr = 0, flips = 0, side = 0, slowFar = 1, land = Infinity;
  const hs: number[] = [];
  for (let n = 1; n <= secs * 60; n++) {
    const t = T + n * dt, now = boats.map(b => ({ x: b.x + b.vx * n * dt, y: b.y + b.vy * n * dt, vx: b.vx, vy: b.vy }));
    tr.advance(t, dt, ways); if (n % 30 === 7) tr.decide(t, ways, now, clearOf);
    const v = tr.vessels(t, ways)[id], moved = Math.hypot(v.x - last.x, v.y - last.y);
    jump = Math.max(jump, moved / (vs * dt));
    if (v.moving && last.moving && v.v > 1) speedErr = Math.max(speedErr, Math.abs(moved / dt - v.v) / v.v);
    // (her turning while under way the whole second: leaving her berth she's simply facing the other way, as on main)
    if (!v.moving) hs.length = 0; else { hs.push(v.h); if (hs.length > 60) { const a = hs.shift()!; turn = Math.max(turn, Math.abs(((v.h - a + 540) % 360) - 180)); } }
    const sd = Math.sign(ways[id].tgt); if (sd !== 0 && side !== 0 && sd !== side) flips++; if (sd !== 0) side = sd;
    const gap = Math.min(...now.map(b => Math.hypot(b.x - v.x, b.y - v.y) / Math.max(1, v.v + 3)));
    if (v.moving && gap > 60) slowFar = Math.min(slowFar, ways[id].slow);
    if (v.moving && Math.min(...ends.map(e => Math.hypot(v.x - e.x, v.y - e.y))) > 500) land = Math.min(land, terrainLandDist(v), shoreDist(v), wharfNearest(v, 200)?.d ?? Infinity);
    last = v;
    now.forEach((b, j) => { nearest[j] = Math.min(nearest[j], Math.hypot(v.x - b.x, v.y - b.y)); });
  }
  return { nearest, jump, turn, speedErr, flips, slowFar, land };
}
/** The first time from T (s, whole seconds) that `ok` holds of the vessel then and `meet` s later. */
function when(id: number, seed: number, T: number, meet: number, ok: (now: ReturnType<Traffic['vessels']>[number], then: ReturnType<Traffic['vessels']>[number], after: ReturnType<Traffic['vessels']>[number]) => boolean): number {
  const tr = new Traffic(true, seed);
  for (let k = 0; k < 86400; k++) if (ok(tr.vessels(T + k)[id], tr.vessels(T + k + meet)[id], tr.vessels(T + k + meet + 60)[id])) return T + k;
  return NaN;
}
/** A boat at 3 m/s meeting the vessel `meet` s from T where she'll be then, across her line from `side`. */
function across(id: number, seed: number, T: number, meet: number, side: number): Craft {
  const m = new Traffic(true, seed).vessels(T + meet)[id], u = { x: Math.sin(m.h * Math.PI / 180), y: Math.cos(m.h * Math.PI / 180) };
  const dir = { x: u.y * side, y: -u.x * side };
  return { x: m.x - dir.x * V * meet, y: m.y - dir.y * V * meet, vx: dir.x * V, vy: dir.y * V };
}
const T0 = 1_794_960_000; // (a day in November 2026, seconds since the epoch)

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
  it('a ferry overtaking a boat on her line slows or passes, and never stops a mile back', () => {
    for (const kind of ['ferry', 'alcatraz', 'coastguard'] as const) {
      const id = SERVICES.findIndex(s => s.kind === kind);
      const T = when(id, 3, T0, 200, (a, b, c) => a.moving && b.moving && c.moving);
      const v = new Traffic(true, 3).vessels(T)[id], u = { x: Math.sin(v.h * Math.PI / 180), y: Math.cos(v.h * Math.PI / 180) };
      const m = meeting(id, 3, T, [{ x: v.x + u.x * 600, y: v.y + u.y * 600, vx: u.x * V, vy: u.y * V }], 200, trafficWater);
      expect(m.slowFar, `${kind}: her least speed while the boat was over a minute off`).toBeGreaterThan(0.25);
      expect(m.nearest[0], `${kind}: the nearest she came`).toBeGreaterThan(VESSEL[kind].len / 2 + 20);
    }
  }, 120_000);
  it("in a cluster of boats she doesn't swing from side to side, turn faster than she can, or misreport her speed", () => {
    for (const kind of ['ferry', 'alcatraz', 'tour', 'coastguard'] as const) {
      const id = SERVICES.findIndex(s => s.kind === kind);
      const T = when(id, 7, T0, 150, (a, b, c) => a.moving && b.moving && c.moving);
      const m0 = new Traffic(true, 7).vessels(T + 120)[id], u = { x: Math.sin(m0.h * Math.PI / 180), y: Math.cos(m0.h * Math.PI / 180) };
      // (three boats crossing where she'll be in two minutes, a fourth lying still just off her line there)
      const boats = [across(id, 7, T, 120, 1), across(id, 7, T, 140, -1), across(id, 7, T, 160, 1), { x: m0.x + u.y * 80, y: m0.y - u.x * 80, vx: 0, vy: 0 }];
      const m = meeting(id, 7, T, boats, 400, trafficWater);
      console.log(`${kind}: side flips ${m.flips}, fastest turn ${m.turn.toFixed(1)}°/s, speed reported off by up to ${(m.speedErr * 100).toFixed(1)}%, nearest ${m.nearest.map(x => x.toFixed(0)).join(', ')} m`);
      expect(m.flips, kind).toBeLessThanOrEqual(2);
      // (an alteration turns her at up to TURN_DEG_S, and rounding a corner of her route at up to TURN_DEG_S again: at
      // most both at once, with her line's own easing in to her berth)
      expect(m.turn, kind).toBeLessThan(2 * TURN_DEG_S + 4);
      expect(m.speedErr, kind).toBeLessThan(0.15);
      for (const d of m.nearest) expect(d, kind).toBeGreaterThan(VESSEL[kind].len / 2 + 10);
    }
  }, 180_000);
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
  it('no vessel jumps: every service for an hour, on her line and 300 m off it, a step (1/60 s) at a time; and on her line alongside', () => {
    for (let id = 0; id < SERVICES.length; id++) {
      const v = VESSEL[SERVICES[id].kind].kt * 0.5144, tr = new Traffic(true, 3), ways = newWays(), dt = 1 / 60;
      let last = tr.vessels(T0, ways)[id], worst = 0;
      for (let n = 1; n < 3600 * 60; n++) {
        const t = T0 + n * dt;
        tr.advance(t, dt, ways);
        if (n % 18000 === 0 && SERVICES[id].kind !== 'container' && SERVICES[id].kind !== 'tanker') ways[id].tgt = (n / 18000) % 2 < 1 ? 300 : -300;
        const now = tr.vessels(t, ways)[id];
        worst = Math.max(worst, Math.hypot(now.x - last.x, now.y - last.y) / (v * dt));
        if (!now.moving && !last.moving) expect(ways[id].off).toBe(0); // (alongside a whole step: on her line)
        last = now;
      }
      // (her speed, and what easing off her line where the room for it grows adds: never a jump)
      console.log(`${SERVICES[id].kind}: the fastest step, ${worst.toFixed(3)} × her speed`);
      expect(worst, SERVICES[id].kind).toBeLessThan(1.6);
    }
  }, 120_000);
});
