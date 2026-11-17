// Shared by the ferry give-way tests (tests/ferry-giveway*.test.ts): a boat crossing a ferry in the World, and the
// traffic stepped on its own with boats on straight courses.
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import { COURSES } from '../../src/courses/registry';
import { DT, World } from '../../src/sim/world';
import { SERVICES, VESSEL, ROUTES, Traffic, newWays, type Craft } from '../../src/sim/traffic';
import { landDist as terrainLandDist, shoreDist, wharfNearest } from '../../src/geo/shore';
import type { Vec } from '../../src/core/math';

export const V = 3; // (m/s, about 6 kt)

export function crossing(kind: string, side: 1 | -1, seed: number) {
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

/**
 * The traffic on its own, stepped as the World steps it (advance every 1/60 s, each give-way vessel deciding every half
 * second), with boats on straight courses: for the harder meetings. Each boat's nearest approach to the vessel's middle;
 * the vessel's largest jump in one step (× her speed), her fastest turn over a second (°/s), how far her reported speed
 * is from how fast she actually moved (worst share), how often her chosen side flips, her least share of speed while
 * no boat is within a minute of her, and her nearest to land or a pier away from her berths (m, her middle).
 */
export function meeting(id: number, seed: number, T: number, boats: Craft[], secs: number, clearOf: (p: Vec) => boolean = () => true, endsOff = 500) {
  const tr = new Traffic(true, seed), ways = newWays(), dt = 1 / 60, nearest = boats.map(() => Infinity), sv = SERVICES[id];
  const vs = VESSEL[sv.kind].kt * 0.5144, ends = [ROUTES[sv.route][0], ROUTES[sv.route][ROUTES[sv.route].length - 1]];
  let last = tr.vessels(T, ways)[id], jump = 0, turn = 0, speedErr = 0, flips = 0, side = 0, slowFar = 1, land = Infinity, skew = 0, kink = 0, frozen = 0, still = 0, slowedS = 0;
  const hs: number[] = [];
  for (let n = 1; n <= secs * 60; n++) {
    const t = T + n * dt, now = boats.map(b => ({ x: b.x + b.vx * n * dt, y: b.y + b.vy * n * dt, vx: b.vx, vy: b.vy }));
    tr.advance(t, dt, ways); if (n % 30 === id % 30) tr.decide(t, ways, now, clearOf, id); // (on her own step, as the World does)
    const v = tr.vessels(t, ways)[id], moved = Math.hypot(v.x - last.x, v.y - last.y);
    jump = Math.max(jump, moved / (vs * dt));
    if (v.moving && last.moving && v.v > 1) {
      speedErr = Math.max(speedErr, Math.abs(moved / dt - v.v) / v.v);
      // her heading against the way she actually moved, and how far it turns in one step
      skew = Math.max(skew, Math.abs(((v.h - Math.atan2(v.x - last.x, v.y - last.y) * 180 / Math.PI + 540) % 360) - 180));
      // (after her first two seconds: her first heading is from her line's shape, before she's moved; it settles by 4° over
      // the first two steps, once, as the race starts)
      if (n > 120) kink = Math.max(kink, Math.abs(((v.h - last.h + 540) % 360) - 180));
    }
    // (reported under way at speed, and not moving: frozen)
    if (v.moving && v.v > 1 && moved < 0.1 * v.v * dt) { still++; frozen = Math.max(frozen, still); } else still = 0;
    // (her turning while under way the whole second: leaving her berth she's simply facing the other way, as on main)
    if (!v.moving) hs.length = 0; else { hs.push(v.h); if (hs.length > 60) { const a = hs.shift()!; turn = Math.max(turn, Math.abs(((v.h - a + 540) % 360) - 180)); } }
    const sd = Math.sign(ways[id].tgt); if (sd !== 0 && side !== 0 && sd !== side) flips++; if (sd !== 0) side = sd;
    const gap = Math.min(...now.map(b => Math.hypot(b.x - v.x, b.y - v.y) / Math.max(1, v.v + 3)));
    if (v.moving && gap > 60) { slowFar = Math.min(slowFar, ways[id].slow); if (ways[id].slow < 0.95) slowedS += dt; }
    if (v.moving && Math.min(...ends.map(e => Math.hypot(v.x - e.x, v.y - e.y))) > endsOff) land = Math.min(land, terrainLandDist(v), shoreDist(v), wharfNearest(v, 200)?.d ?? Infinity);
    last = v;
    now.forEach((b, j) => { nearest[j] = Math.min(nearest[j], Math.hypot(v.x - b.x, v.y - b.y)); });
  }
  return { nearest, jump, turn, speedErr, flips, slowFar, land, skew, kink, frozen: frozen * dt, slowedS };
}
/** The first time from T (s, whole seconds) that `ok` holds of the vessel then and `meet` s later. */
export function when(id: number, seed: number, T: number, meet: number, ok: (now: ReturnType<Traffic['vessels']>[number], then: ReturnType<Traffic['vessels']>[number], after: ReturnType<Traffic['vessels']>[number]) => boolean): number {
  const tr = new Traffic(true, seed);
  for (let k = 0; k < 86400; k++) if (ok(tr.vessels(T + k)[id], tr.vessels(T + k + meet)[id], tr.vessels(T + k + meet + 60)[id])) return T + k;
  return NaN;
}
/** A boat at 3 m/s meeting the vessel `meet` s from T where she'll be then, across her line from `side`. */
export function across(id: number, seed: number, T: number, meet: number, side: number): Craft {
  const m = new Traffic(true, seed).vessels(T + meet)[id], u = { x: Math.sin(m.h * Math.PI / 180), y: Math.cos(m.h * Math.PI / 180) };
  const dir = { x: u.y * side, y: -u.x * side };
  return { x: m.x - dir.x * V * meet, y: m.y - dir.y * V * meet, vx: dir.x * V, vy: dir.y * V };
}
export const T0 = 1_794_960_000; // (a day in November 2026, seconds since the epoch)

