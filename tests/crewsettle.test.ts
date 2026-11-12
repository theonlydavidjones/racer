import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { buildCrew, syncCrew } from '../src/render/crew';
import type { CourseFile } from '../src/courses/course';

/**
 * Settled crew stay settled (the owner, v146: "lots of weird movement from the middle crew. He keeps pumping his knees,
 * spinning around in 360s, just generally fussing about in unnatural ways"). A short race of AI boats, three aboard
 * each, in the Bay's gusty westerly; each figure drawn every step (render/crew.ts) and watched while she sails steadily
 * (more than 10 s from a tack or gybe). Three causes were found: a figure whose way along the side deck had stopped at
 * an old seat aft of the thwart, its next place now forward of it, stepping on the spot for good; the forward hand
 * called to the cabin top's lines every 20 s for changes of a few per cent, and back to the seat between for a jib
 * tweak; and a short move aft along the deck made by turning right round, then round again for the next job forward.
 */
describe('Settled crew stay settled (render/crew.ts, boat/crewWork.ts)', () => {
  for (const kt of [12, 18]) it(`in steady sailing in ${kt} kt: few trips, no pose flicker, no stepping on the spot, no spinning round`, () => {
    const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, sea: 'flat', traffic: 0, tideDate: '2026-11-14', fleet: 2, opponents: ['stock:1', 'stock:2'] } as never, 1);
    const ai = w.boats.filter(b => !b.isUser);
    const crs = ai.map(b => buildCrew(b.crew!.spec.helm, b.crew!.spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1));
    const lastTurn = ai.map(() => -99), side = ai.map(b => Math.sign(b.rel));
    type Watch = { secs: number; poses: number; trips: number; knee: number; spin: number; turned: number; hist: number[]; prev?: { pose: string; gx: number; gz: number; yaw: number; knee: number[] } };
    const watch: Watch[][] = ai.map(b => b.crew!.people.slice(1).map(() => ({ secs: 0, poses: 0, trips: 0, knee: 0, spin: 0, turned: 0, hist: [] })));
    while (w.t < 420) {
      w.step(DT);
      ai.forEach((b, k) => {
        syncCrew(crs[k], b.rel >= 0 ? 1 : -1, b.crew, DT, false, undefined, b.heel, b.tacking);
        if (Math.sign(b.rel) !== side[k] || b.tacking || b.crew!.roll) { lastTurn[k] = w.t; side[k] = Math.sign(b.rel); }
        const steady = w.t > 0 && b.started && !b.finished && w.t - lastTurn[k] > 10;
        crs[k].crew.forEach((f, i) => {
          const a = b.crew!.people[i + 1], s = watch[k][i], p = s.prev;
          const now = { pose: a.pose, gx: a.goal?.x ?? a.x, gz: a.goal?.z ?? a.z, yaw: f.cur!.yaw, knee: f.leg.map(l => l.mid.rotation.x) };
          if (p && steady) {
            s.secs += DT;
            if (now.pose !== p.pose) s.poses++;
            // (a trip: along the boat to a new place, or off to a job's station. Not out onto the rail and in again with
            // the puffs, which is hiking, as it should be)
            const job = (q: string) => q === 'piano' || q === 'winch' || q === 'car' || q === 'mast' || q === 'fore' || q === 'bow';
            if (Math.abs(now.gz - p.gz) > 0.3 || (job(now.pose) && !job(p.pose))) s.trips++;
            s.knee += Math.abs(now.knee[0] - p.knee[0]) + Math.abs(now.knee[1] - p.knee[1]);
            // (the body's heading, unwrapped step by step: a reset by whole turns isn't a turn)
            const d = Math.atan2(Math.sin(now.yaw - p.yaw), Math.cos(now.yaw - p.yaw));
            s.turned += d; s.hist.push(s.turned); if (s.hist.length > 4 / DT) s.hist.shift();
            s.spin = Math.max(s.spin, Math.max(...s.hist) - Math.min(...s.hist));
          } else s.hist = [];
          s.prev = now;
        });
      });
    }
    const out = watch.flatMap((ws, k) => ws.map((s, i) => {
      const m = s.secs / 60;
      return { who: `boat ${k} crew ${i + 1}`, mins: m, poses: s.poses / m, trips: s.trips / m, knee: s.knee / m, spin: s.spin * 180 / Math.PI };
    }));
    console.log(out.map(o => `${o.who}: ${o.mins.toFixed(1)} min steady, poses ${o.poses.toFixed(1)}/min, trips ${o.trips.toFixed(1)}/min, knees ${o.knee.toFixed(1)} rad/min, most turned in 4 s ${o.spin.toFixed(0)}°`).join('\n'));
    for (const o of out) {
      expect(o.mins, o.who).toBeGreaterThan(2);
      // (turning round to walk aft along the deck is half a circle, and a little more as they swing out of a seat: a spin
      // is a whole one, as the owner saw, turning the long way or round and back again)
      expect(o.spin, `${o.who}: turned ${o.spin.toFixed(0)}° within 4 s`).toBeLessThan(270);
      // (a visit to the cabin top counts twice, there and back; in a breeze the forward hand has the depowering lines and
      // the cars too. On v146's code, 12 kt: 6.4 a minute, 14 pose changes, knees 67 rad a minute, a 367° spin)
      expect(o.trips, `${o.who}: trips a minute`).toBeLessThan(kt > 15 ? 4.5 : 3);
      expect(o.poses, `${o.who}: pose changes a minute (sitting, hiking in the puffs, a job)`).toBeLessThan(8);
      expect(o.knee, `${o.who}: knee movement, rad a minute (stepping on the spot was over 120)`).toBeLessThan(40);
    }
  }, 600000);
});
