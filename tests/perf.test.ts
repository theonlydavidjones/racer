// The sim's speed budget (ROADMAP, "Performance review"), headless: a full fleet of eight on the course out toward the
// Gate in a fresh breeze, the worst case for the per-step work (the shore's distance for the wind and the current, the AI's
// look-ahead, the crew). Kept out of test:fast (it sails about ten minutes of race).
//
// Machines differ, and so does the load when the suite runs in parallel, so the step time is judged against a fixed
// reference workload timed in the same process just before: the ratio holds from one machine to the next where the
// raw time wouldn't. Measured November 2026: a ratio of 27–32 (µs per step over the reference's ms) after the performance review, 35–37 before.
import { describe, expect, it } from 'vitest';
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';

/** A fixed workload like the sim's (trig, square roots, small arrays): the time it takes, ms (the best of three). */
function reference(): number {
  let best = Infinity, sink = 0;
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now(), a = new Float64Array(256);
    for (let i = 0; i < 400_000; i++) { const x = i * 0.001; a[i & 255] = Math.hypot(Math.sin(x), Math.cos(x * 1.3)) + Math.sqrt(x + a[(i + 7) & 255]); sink += a[i & 255]; }
    best = Math.min(best, performance.now() - t0);
  }
  if (!Number.isFinite(sink)) throw new Error('unreachable');
  return best;
}

describe('performance budget: the sim', () => {
  it('a full fleet of eight steps fast enough (µs per step, against the reference workload)', () => {
    const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
    const w = new World(ss10 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: 22, current: 'real', opponents, fleet: 7 }, 3);
    expect(w.boats.length).toBe(8);
    // through the start and five minutes of racing, a minute at a time, each minute in 10-second pieces timed against
    // the reference just before each (the load from the rest of the suite, or the machine's, comes and goes). Load only
    // ever slows a piece down, so each minute counts its fastest piece; then the median minute (a GC pause or a busy
    // core in one minute doesn't count)
    const per: { us: number; ref: number; ratio: number }[] = [];
    while (w.t < 5 * 60) {
      let best: { us: number; ref: number; ratio: number } | null = null;
      for (let k = 0; k < 6; k++) {
        const ref = reference(), t0 = performance.now(), end = w.t + 10;
        let n = 0; while (w.t < end) { w.step(DT); n++; }
        const us = (performance.now() - t0) * 1000 / n;
        if (!best || us / ref < best.ratio) best = { us, ref, ratio: us / ref };
      }
      per.push(best!);
    }
    per.sort((a, b) => a.ratio - b.ratio);
    const { us, ref, ratio } = per[Math.floor(per.length / 2)];
    console.log(`full fleet: ${us.toFixed(0)} µs per step (${(1e6 / us).toFixed(0)} steps/s), reference ${ref.toFixed(1)} ms, ratio ${ratio.toFixed(2)}`);
    // the budget: at 4× speed, 60 frames a second, the sim's four steps a frame within about 3 ms on a laptop
    // (27–32 after the review, 35–37 before it; noise about ±10%, more under the suite's load. Raised from 38 to 40 with
    // the gusts (environment/gusts.ts, November 2026): the livelier wind costs about 5%, measured, mostly the crew and the
    // boat answering it, which is what it's for). Timed by each minute's fastest piece since leeway (November 2026), which
    // the machine's load can't push up: 29–34 with leeway and without, on a container with a load average of 1–2)
    expect(ratio).toBeLessThan(40);
  }, 120_000);
});
