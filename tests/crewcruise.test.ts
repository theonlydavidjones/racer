import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
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
 * - the hips' travel fore and aft (the "crawling along the rail");
 * - the body's lean, pitch and roll (the "flopping");
 * - the knees' movement (the "knee kicking");
 * - the most they turn round in 4 s;
 * - time two of them spend within a body's width of each other while one is moving (the "dancing around each other").
 */
type Watch = { secs: number; trips: number; poses: number; knee: number; lean: number; crawl: number; cross: number; spin: number; turned: number; hist: number[]; dance: number; prev?: { pose: string; gz: number; x: number; yaw: number; knee: number[]; hip: { x: number; y: number; z: number }; pitch: number; roll: number } };

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
        if (Math.sign(now.x) !== Math.sign(q.x) && Math.abs(now.x) > 0.2) s.cross++;
        s.knee += Math.abs(now.knee[0] - q.knee[0]) + Math.abs(now.knee[1] - q.knee[1]);
        s.lean += Math.abs(now.pitch - q.pitch) + Math.abs(now.roll - q.roll);
        s.crawl += Math.abs(now.hip.z - q.hip.z);
        const d = Math.atan2(Math.sin(now.yaw - q.yaw), Math.cos(now.yaw - q.yaw));
        s.turned += d; s.hist.push(s.turned); if (s.hist.length > 4 / DT) s.hist.shift();
        s.spin = Math.max(s.spin, Math.max(...s.hist) - Math.min(...s.hist));
        const moving = Math.hypot(now.hip.x - q.hip.x, now.hip.z - q.hip.z) > 0.003;
        if (i > 0) figs.forEach((g, j) => { if (j > i && moving && c.hip.distanceTo(g.cur!.hip) < 0.55) s.dance += DT; });
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
        expect(o.mins, t).toBeGreaterThan(4);
        // (a job now and then: the cabin top's lines, the jib car. Not a trip every minute)
        expect(o.trips, `${t}: trips a minute`).toBeLessThan(1);
        expect(o.poses, `${t}: pose changes a minute`).toBeLessThan(3);
        // (across the cockpit only when her side changes: not on a cruise holding her course)
        expect(o.cross, `${t}: crossings a minute`).toBe(0);
        // (a trip to the cabin top and back is about 3 m; under one a minute, and nothing else along the deck)
        expect(o.crawl, `${t}: along the boat, m a minute`).toBeLessThan(1.5);
        // (sitting, a body sways a little with the boat; not flopping out and in with each wave)
        expect(o.lean, `${t}: lean, rad a minute`).toBeLessThan(6);
        // (still legs, sitting; a few steps on a trip)
        expect(o.knee, `${t}: knees, rad a minute`).toBeLessThan(15);
        // (turning round to walk aft is half a circle; a spin is a whole one)
        expect(o.spin, `${t}: turned within 4 s`).toBeLessThan(200);
        expect(o.dance, `${t}: seconds close to another while moving`).toBeLessThan(5);
      }
    }, 300000);
  }
});
