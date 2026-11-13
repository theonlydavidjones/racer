import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { Z } from '../src/boat/crewPhys';
import { buildCrew, syncCrew } from '../src/render/crew';
import { LL } from '../src/geo/geo';
import { n360 } from '../src/core/math';

/**
 * A crew sits still on a cruise (the owner on v162: "still so fidgety. Way more movement than you'd see in real life,
 * especially during cruises: dancing around each other, crawling along the rail, flopping around, still doing the knee
 * kicking"). Real crews sit for minutes at a time and move for a manoeuvre, a big puff or a job, and that's all.
 *
 * Your boat cruising in the open Bay east of Alcatraz on the tiller pilot, holding a compass course, at each point of
 * sail (close-hauled, a beam reach, a broad reach, a run), in light air and a breeze, in the Bay's gusty westerly and its
 * sea. Every figure is drawn each step (render/crew.ts) and watched while she sails steadily (more than 10 s from a tack
 * or gybe), counting:
 * - trips: along the boat to a new place, or out to a job;
 * - pose changes (sitting, hiking, to leeward, a job);
 * - crossings of the cockpit that her side didn't call for;
 * - the hips' travel fore and aft while they're not on the way anywhere (the "crawling along the rail");
 * - the body's lean, pitch and roll (the "flopping");
 * - the knees' movement while they're not walking anywhere (the "knee kicking");
 * - the most they turn round in 4 s;
 * - time two of them spend within a body's width of each other both moving at once (the "dancing around each other").
 */
type Watch = { seat?: number; secs: number; trips: number; poses: number; knee: number; lean: number; crawl: number; cross: number; spin: number; turned: number; hist: number[]; dance: number; prev?: { pose: string; gz: number; x: number; yaw: number; knee: number[]; hip: { x: number; y: number; z: number }; pitch: number; roll: number } };

function cruise(twa: number, kt: number, mins: number) {
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0 } as Settings;
  const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user;
  const p = LL(37.835, -122.40); u.x = p.x; u.y = p.y;
  w.step(DT); u.h = n360(u.ww.from + twa); u.v = 2.5; engage(u, w.pilot, 'auto');
  const cr = buildCrew(u.crew!.spec.helm, u.crew!.spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), figs = [cr.helm, ...cr.crew];
  const ws: Watch[] = figs.map(() => ({ secs: 0, trips: 0, poses: 0, knee: 0, lean: 0, crawl: 0, cross: 0, spin: 0, turned: 0, hist: [], dance: 0 }));
  let lastTurn = 0, side = Math.sign(u.rel);
  while (w.t < mins * 60) {
    w.step(DT);
    syncCrew(cr, u.rel >= 0 ? 1 : -1, u.crew, DT, false, undefined, u.heel, u.tacking);
    if (Math.sign(u.rel) !== side || u.tacking || u.crew!.roll) { lastTurn = w.t; side = Math.sign(u.rel); }
    const steady = w.t > 30 && w.t - lastTurn > 10;
    const job = (q: string) => ['piano', 'winch', 'car', 'mast', 'fore', 'bow'].includes(q);
    figs.forEach((f, i) => {
      const a = u.crew!.people[i], s = ws[i], q = s.prev, c = f.cur!;
      const now = { pose: a.pose, gz: a.goal?.z ?? a.z, x: a.x, yaw: c.yaw, knee: f.leg.map(l => l.mid.rotation.x), hip: { x: c.hip.x, y: c.hip.y, z: c.hip.z }, pitch: c.pitch, roll: c.roll };
      if (q && steady) {
        s.secs += DT;
        if (now.pose !== q.pose) s.poses++;
        if (Math.abs(now.gz - q.gz) > 0.3 || (job(now.pose) && !job(q.pose))) s.trips++;
        // (a crossing: from a seat out beyond 0.15 m on one side to one on the other; a few centimetres either way about
        // the middle isn't one: tests/crewcross.test.ts's own)
        // (and only in the cockpit: forward of it, at the mast or on the foredeck, they're not on a side, and back from there
        // to a seat on the other side is a trip, counted as one, not a crossing)
        if (a.z < Z.cockpitFwd) s.seat = undefined;
        else if (Math.abs(now.x) > 0.15 && !job(now.pose)) { const sd = Math.sign(now.x); if (s.seat && sd !== s.seat) s.cross++; s.seat = sd; }
        // (the knees while they're not on their way anywhere: walking is legs moving, as it should be, and the trips and
        // the travel along the deck are counted on their own; the "knee kicking" was legs moving while sat still)
        if (!f.going && !f.route) s.knee += Math.abs(now.knee[0] - q.knee[0]) + Math.abs(now.knee[1] - q.knee[1]);
        s.lean += Math.abs(now.pitch - q.pitch) + Math.abs(now.roll - q.roll);
        if (!f.going && !f.route) s.crawl += Math.abs(now.hip.z - q.hip.z); // (sliding along the deck while not going anywhere: a trip is counted as one)
        const d = Math.atan2(Math.sin(now.yaw - q.yaw), Math.cos(now.yaw - q.yaw));
        s.turned += d; s.hist.push(s.turned); if (s.hist.length > 4 / DT) s.hist.shift();
        s.spin = Math.max(s.spin, Math.max(...s.hist) - Math.min(...s.hist));
        // (both on the move at once, within a body's width: one sliding along the bench past the other, sat still, is
        // ordinary; two shuffling round each other isn't)
        const moved = (h: { x: number; z: number }, g: THREE.Vector3) => Math.hypot(g.x - h.x, g.z - h.z) > 0.003;
        if (i > 0) figs.forEach((g, j) => { const o = ws[j].prev; if (j > i && o && moved(q.hip, c.hip) && moved(o.hip, g.cur!.hip) && c.hip.distanceTo(g.cur!.hip) < 0.5) s.dance += DT; });
      } else s.hist = [];
      s.prev = now;
    });
  }
  return ws.map((s, i) => { const m = s.secs / 60; return { who: i ? `crew ${i}` : 'helm', mins: m, trips: s.trips / m, poses: s.poses / m, cross: s.cross / m, crawl: s.crawl / m, lean: s.lean / m, knee: s.knee / m, spin: s.spin * 180 / Math.PI, dance: s.dance }; });
}

describe('A crew sits still on a cruise (render/crew.ts, boat/crewPhys.ts, boat/crewWork.ts)', () => {
  for (const kt of [6, 14]) for (const [twa, name] of [[45, 'close-hauled'], [90, 'a beam reach'], [135, 'a broad reach'], [170, 'a run']] as const) {
    it(`on the tiller pilot, ${name} in ${kt} kt`, () => {
      const out = cruise(twa, kt, 6);
      console.log(`${name} ${kt} kt\n` + out.map(o => `  ${o.who}: ${o.mins.toFixed(1)} min, trips ${o.trips.toFixed(1)}/min, poses ${o.poses.toFixed(1)}/min, crossings ${o.cross.toFixed(2)}/min, crawl ${o.crawl.toFixed(2)} m/min, lean ${o.lean.toFixed(1)} rad/min, knees ${o.knee.toFixed(1)} rad/min, turned ${o.spin.toFixed(0)}° in 4 s, close and moving ${o.dance.toFixed(1)} s`).join('\n'));
      for (const o of out) {
        const t = `${o.who}, ${name} in ${kt} kt`;
        expect(o.mins, t).toBeGreaterThan(3); // (of six: the first half-minute, and 10 s after any gybe she makes, aren't counted)
        // (a job now and then: the cabin top's lines, the jib car. Not a trip every minute)
        expect(o.trips, `${t}: trips a minute`).toBeLessThan(1);
        expect(o.poses, `${t}: pose changes a minute`).toBeLessThan(3);
        // (off the wind, across the cockpit only when she gybes; close-hauled in light air, to leeward for a lull that
        // lasts, heeling her, and back up as the breeze fills: a move each way in a few minutes, not each puff)
        if (twa > 75) expect(o.cross, `${t}: crossings a minute`).toBe(0);
        else expect(o.cross, `${t}: crossings a minute`).toBeLessThan(0.5);
        // (sliding along the deck, sat or kneeling, not on the way anywhere: settling into a place, no more)
        expect(o.crawl, `${t}: along the boat while not going anywhere, m a minute`).toBeLessThan(1);
        // (sitting, a body sways a little with the boat; not flopping out and in with each wave)
        expect(o.lean, `${t}: lean, rad a minute`).toBeLessThan(6);
        // (still legs, sitting: the knees moved in a minute while sat, or at a job, not walking)
        expect(o.knee, `${t}: knees, rad a minute`).toBeLessThan(15);
        // (turning round to walk aft is half a circle; back from a job on one side deck to a seat on the other, inboard to
        // go aft and on round to sit facing inboard, three-quarters, all one way, as anyone does it (the other way round
        // is out over the water). A spin is a whole circle, or round and back again)
        expect(o.spin, `${t}: turned within 4 s`).toBeLessThan(320);
        expect(o.dance, `${t}: seconds close to another while moving`).toBeLessThan(5);
      }
    }, 300000);
  }

  // (v162 sails the race in a Web Worker and draws its copy a frame later: a frame gets no steps, one, or two, as it
  // always could in the page too (and three to five at 4x). The figures walk by the race's own clock, so the uneven
  // frames don't show: no stepping and stopping)
  it('drawn with uneven frames (0, 1 or 2 steps each), they move as with one step every frame', () => {
    const drawn = (pattern: number[]) => {
      const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0 } as Settings;
      const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user;
      const p = LL(37.835, -122.40); u.x = p.x; u.y = p.y; w.step(DT); u.h = n360(u.ww.from + 135); u.v = 2.5; engage(u, w.pilot, 'auto');
      const cr = buildCrew(u.crew!.spec.helm, u.crew!.spec.crew, [1, 2, 3], 1), figs = [cr.helm, ...cr.crew], sp = figs.map(() => 0);
      let k = 0, jerk = 0;
      while (w.t < 240) {
        for (let i = pattern[k++ % pattern.length]; i > 0; i--) w.step(DT);
        syncCrew(cr, u.rel >= 0 ? 1 : -1, u.crew, DT, false, undefined, u.heel, u.tacking);
        if (w.t > 30) figs.forEach((f, i) => { jerk += Math.abs(f.speed - sp[i]); sp[i] = f.speed; });
      }
      return jerk;
    };
    const even = drawn([1]), uneven = drawn([1, 0, 2, 1, 1, 0, 2, 1]);
    console.log(`walking speed's frame-to-frame change: one step a frame ${even.toFixed(1)}, uneven ${uneven.toFixed(1)} (by the page's frame time it was 38.5)`);
    expect(uneven).toBeLessThan(even * 1.2);
  }, 300000);
});
