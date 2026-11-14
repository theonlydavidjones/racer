// The sim's speed budget (ROADMAP, "Performance review"), headless: a full fleet of eight on the course out toward the
// Gate in a fresh breeze, the worst case for the per-step work (the shore's distance for the wind and the current, the AI's
// look-ahead, the crew). Kept out of test:fast (it sails about ten minutes of race).
//
// Machines differ, and so does the load when the suite runs in parallel, so the step time is judged against a fixed
// reference workload timed alongside it, in the same process, both in CPU time: the ratio holds from one machine to the
// next where the raw time wouldn't. (On the old wall-clock timing, November 2026: 27–32 after the performance review,
// 35–37 before; see the budget for the change of units.)
import { describe, expect, it } from 'vitest';
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { SyncMirror, SyncSource } from '../src/sim/sync';

/** A fixed workload like the sim's (trig, square roots, small arrays). */
/**
 * The mirror's budgets (ratios against the reference workload, as the step's; the second test). Measured 13 Nov 2026,
 * after the sync's walk was made cheaper (one record per object, memos looked up once per object): the page's part
 * 18.0–18.1, the worker's 100–104 (it was 134 before). About a fifth above: room for the noise, not for a creep.
 */
const PAGE_BUDGET = 22, WORKER_BUDGET = 125;
/** The step's budget, in this thread's CPU time against the reference's (the first test; derived there). */
const BUDGET = 43.1;
const scratch = new Float64Array(256);
let sink = 0;
/** The process's own CPU time, ms: unlike the clock on the wall, it doesn't run while the process waits for a core. */
// (Node's process, typed here: the project doesn't take Node's type definitions)
const proc = (globalThis as unknown as { process: { cpuUsage(): { user: number; system: number }; threadCpuUsage?(): { user: number; system: number } } }).process;
const cpu = () => { const c = proc.cpuUsage(); return (c.user + c.system) / 1000; };
/**
 * This thread's own CPU time, ms (Node 22: process.threadCpuUsage). The whole process's (cpu) also counts V8's helper
 * threads, compiling and marking alongside: about a quarter of what it counted as the sim's step, and a share that
 * varies from run to run and machine to machine (docs/CAPACITY.md §1.1a).
 */
const threadCpu = () => { const c = proc.threadCpuUsage!(); return (c.user + c.system) / 1000; };
/** Two million turns of the reference, CPU ms (on the clock given), scaled to 400 000 turns (the size the budget was first set in). */
function reference(clock = cpu): number {
  const t0 = clock();
  for (let i = 0; i < 2_000_000; i++) { const x = i * 0.001; scratch[i & 255] = Math.hypot(Math.sin(x), Math.cos(x * 1.3)) + Math.sqrt(x + scratch[(i + 7) & 255]); sink += scratch[i & 255]; }
  return (clock() - t0) / 5;
}

describe('performance budget: the sim', () => {
  it('a full fleet of eight steps fast enough (CPU µs per step on its own thread, against the reference workload; the median of three races)', () => {
    // (no quiet fallback to the process's time: that's the old units, and the budget below isn't in them)
    expect(typeof proc.threadCpuUsage, 'process.threadCpuUsage (Node 22)').toBe('function');
    const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
    reference(threadCpu); // (warm it up)
    // Through the start and five minutes of racing, in 10-second pieces with a run of the reference before each, all
    // timed in this thread's CPU time and totalled. Timed on the wall clock, the machine's load (or the rest of the
    // suite's) went straight into the numbers, and no way of picking pieces kept it out: under a heavy load a piece and
    // the reference beside it were slowed by different amounts. In CPU time the load only shows as what it does to the
    // caches. The same race three times over (a fresh World each, the same seed: the same steps), and the median of the
    // three judged: a shared machine's memory and caches drift by several per cent from one minute to the next, and slow
    // the sim (memory, allocation) more than the reference (arithmetic in the cache).
    const race = () => {
      const w = new World(ss10 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: 22, current: 'real', opponents, fleet: 7 }, 3);
      expect(w.boats.length).toBe(8);
      let simMs = 0, refMs = 0, steps = 0, pieces = 0;
      while (w.t < 5 * 60) {
        refMs += reference(threadCpu); pieces++;
        const c0 = threadCpu(), end = w.t + 10;
        while (w.t < end) { w.step(DT); steps++; }
        simMs += threadCpu() - c0;
      }
      return { us: simMs * 1000 / steps, ref: refMs / pieces };
    };
    const runs = [race(), race(), race()].map(r => ({ ...r, ratio: r.us / r.ref }));
    if (!Number.isFinite(sink)) throw new Error('unreachable');
    const { us, ref, ratio } = runs.slice().sort((a, b) => a.ratio - b.ratio)[1];
    console.log(`full fleet: ${us.toFixed(0)} CPU µs per step on its thread, reference ${ref.toFixed(1)} CPU ms, ratio ${ratio.toFixed(2)} (the median of ${runs.map(r => r.ratio.toFixed(2)).join(', ')})`);
    // The budget: at 4× speed, 60 frames a second, the sim's four steps a frame within about 3 ms on a laptop. It was 40
    // on the old wall-clock timing (raised from 38 with the gusts). The same code (v128) measured both ways in one session:
    // 36.4 the old way (three runs, 35.9–37.0), 49.8 in the process's CPU time (five runs, 48.7–50.3: that counts V8's
    // own helper threads too), so 40 × 49.8 / 36.4 = 54.7 in those units. And again (v168, 425a5eb, 13 Nov 2026):
    // in the process's CPU time a median of 53.74 (twelve runs, 51.52–58.16), and in this thread's own a median of 42.31
    // (the same twelve runs, timed both ways at once, 39.84–45.34; this thread's share 0.787, steady within ±1.2%), so
    // 54.7 × 42.31 / 53.74 = 43.06, set as 43.1. A change of units both times, not a raise.
    expect(ratio).toBeLessThan(BUDGET);
  }, 600_000);

  it('keeping the page\'s mirror in step costs little on either side (CPU µs per 4× frame, against the reference)', () => {
    // (docs/CAPACITY.md step 3: with the race in its worker, each frame the worker works out what changed and the page
    // writes it onto its mirror. The page's part is on the thread that draws, so it must stay small; the worker's comes
    // out of the room the worker gave the physics. The same busy race as above, four steps a frame, as at 4×.)
    const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
    const mk = () => new World(ss10 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: 22, current: 'real', opponents, fleet: 7 }, 3);
    const A = mk(), M = mk(), src = new SyncSource(A), mirror = new SyncMirror(M);
    reference();
    let workerMs = 0, pageMs = 0, refMs = 0, frames = 0, pieces = 0;
    while (A.t < 120) {
      refMs += reference(); pieces++;
      const end = A.t + 10;
      while (A.t < end) {
        for (let i = 0; i < 4; i++) A.step(DT);
        let c0 = cpu(); const p = structuredClone(src.capture(A.drainEvents())); workerMs += cpu() - c0; // (the clone: postMessage's, on both sides; counted once, here)
        c0 = cpu(); mirror.apply(p); pageMs += cpu() - c0; frames++;
      }
    }
    if (!Number.isFinite(sink)) throw new Error('unreachable');
    const ref = refMs / pieces, worker = workerMs * 1000 / frames / ref, page = pageMs * 1000 / frames / ref;
    console.log(`mirror: the worker's part ${(workerMs * 1000 / frames).toFixed(0)} CPU µs a frame (ratio ${worker.toFixed(1)}), the page's ${(pageMs * 1000 / frames).toFixed(0)} (ratio ${page.toFixed(1)}), reference ${ref.toFixed(1)} CPU ms`);
    // (the budgets give room for the noise and no more: a creep past them is the sync sending, or the page applying,
    // more than it should)
    expect(page).toBeLessThan(PAGE_BUDGET);
    expect(worker).toBeLessThan(WORKER_BUDGET);
  }, 180_000);
});
