// The sim's speed budget (ROADMAP, "Performance review"), headless: a full fleet of eight on the course out toward the
// Gate in a fresh breeze, the worst case for the per-step work (the shore's distance for the wind and the current, the AI's
// look-ahead, the crew). Kept out of test:fast (it sails about ten minutes of race).
//
// Machines differ, and a shared one drifts within the hour, so the step is judged paired: this tree's sim against v168's,
// sailed by turns in one process (scripts/check/perf-pair.mjs), the budget a ratio to v168. The mirror's costs (the
// second test) are still judged against a fixed reference workload timed alongside, in the same process.
import { describe, expect, it } from 'vitest';
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { SyncMirror, SyncSource } from '../src/sim/sync';
// @ts-expect-error (a plain .mjs script, no types)
import { BUDGET_MAX, BUDGET_REF, measure } from '../scripts/check/perf-pair.mjs';

/** A fixed workload like the sim's (trig, square roots, small arrays). */
/**
 * The mirror's budgets (ratios against the reference workload, as the step's; the second test). Measured 13 Nov 2026,
 * after the sync's walk was made cheaper (one record per object, memos looked up once per object): the page's part
 * 18.0–18.1, the worker's 100–104 (it was 134 before). About a fifth above: room for the noise, not for a creep.
 */
const PAGE_BUDGET = 22, WORKER_BUDGET = 125;
const scratch = new Float64Array(256);
let sink = 0;
/** The process's own CPU time, ms: unlike the clock on the wall, it doesn't run while the process waits for a core. */
// (Node's process, typed here: the project doesn't take Node's type definitions)
const proc = (globalThis as unknown as { process: { cpuUsage(): { user: number; system: number }; } }).process;
const cpu = () => { const c = proc.cpuUsage(); return (c.user + c.system) / 1000; };
/** Two million turns of the reference, CPU ms (on the clock given), scaled to 400 000 turns (the size the budget was first set in). */
function reference(clock = cpu): number {
  const t0 = clock();
  for (let i = 0; i < 2_000_000; i++) { const x = i * 0.001; scratch[i & 255] = Math.hypot(Math.sin(x), Math.cos(x * 1.3)) + Math.sqrt(x + scratch[(i + 7) & 255]); sink += scratch[i & 255]; }
  return (clock() - t0) / 5;
}

describe('performance budget: the sim', () => {
  it('a full fleet of eight steps fast enough: paired against v168 in one process, at most 1.9% slower (the owner\'s 43.1)', () => {
    // The step's budget, measured without the machine's drift (scripts/check/perf-pair.mjs; the owner's method, 14 Nov
    // 2026): this tree's sim and v168's (425a5eb, the commit the budget was set on) loaded in one process and sailed in
    // alternating 10-second pieces, timed on this thread, twice (each loaded first once), three races each. A shared
    // machine's speed drifts by several per cent within the hour; paired, the drift lands on both alike.
    // The budget, unchanged: 43.1 in this thread's CPU time against the reference workload, and v168 measured 42.31 in the
    // same units (twelve runs), so 43.1 is v168 × 43.1 / 42.31 = v168 × 1.019. (Before: the ratio to a fixed arithmetic
    // workload in the same process, which a shared machine's memory and caches moved by ±5–6% within a day, more than
    // the room the budget leaves. The derivations of 54.7 and 43.1 are in docs/CAPACITY.md §1.1a.)
    const m = measure(BUDGET_REF, 3);
    console.log(`full fleet, paired against v168: ${m.runs.map((r: { here: number; there: number }) => `${r.here.toFixed(0)}/${r.there.toFixed(0)} µs`).join(', ')}: ratio ${m.ratio.toFixed(4)} (budget ${BUDGET_MAX})`);
    expect(m.ratio).toBeLessThan(BUDGET_MAX);
  }, 900_000);

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
