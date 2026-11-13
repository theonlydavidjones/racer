/**
 * The race in its own thread (docs/CAPACITY.md, step 3): the World sails here, in a Web Worker, on a core of its own,
 * and the page draws it. Each frame the page sends the time that's passed and what you did (sim/commands.ts); the
 * worker does it, sails the steps that are due (the same fixed step and accumulator as LocalHost), and sends back what
 * changed (sim/sync.ts), the race's events and the commands' answers. The page keeps its mirror World in step with
 * that, and draws and asks its questions of the mirror.
 */
import { applyCommand, type Command, type CommandResult } from './commands';
import { SyncSource, type Packet } from './sync';
import { DT, World, type WorldOptions } from './world';
import type { CourseFile } from '../courses/course';
import type { Settings } from '../settings';

/** What the page sends. */
export type ToWorker =
  | { k: 'init'; file: CourseFile; settings: Settings; seed: number; opts: WorldOptions }
  /** A frame: the page's time since the last (s), the showroom's point of sail if it's showing her, and what you did. */
  | { k: 'frame'; dt: number; twa?: number; cmds: { c: Command; id?: number }[] };
/** What the worker sends back after each frame. */
export type FromWorker =
  | { k: 'state'; packet: Packet; results: { id: number; r: CommandResult }[]; ms: number; steps: number }
  | { k: 'failed'; msg: string };

let w: World | null = null, src: SyncSource | null = null, acc = 0;

/** One frame, as LocalHost and the page's own loop did it: commands first, then the steps due. */
function frame(m: Extract<ToWorker, { k: 'frame' }>): FromWorker {
  const t0 = performance.now(), world = w!, results: { id: number; r: CommandResult }[] = [];
  for (const { c, id } of m.cmds) { const r = applyCommand(world, c); if (id != null) results.push({ id, r }); }
  const steps0 = world.steps;
  if (world.running && !world.paused) {
    acc += m.dt * world.speed;
    while (acc >= DT) { world.step(DT); acc -= DT; if (world.paused) { acc = 0; break; } }
  } else if (!world.running) {
    acc += m.dt; while (acc >= DT) { world.idle(DT, m.twa); acc -= DT; }
  }
  const ms = performance.now() - t0;
  return { k: 'state', packet: src!.capture(world.drainEvents()), results, ms, steps: world.steps - steps0 };
}

/** The worker's message loop (in a Web Worker only: imported elsewhere, this file defines its types and nothing runs). */
const scope = globalThis as unknown as { postMessage?: (m: FromWorker) => void; onmessage?: ((e: MessageEvent<ToWorker>) => void) | null; document?: unknown };
if (typeof scope.document === 'undefined' && typeof scope.postMessage === 'function' && 'WorkerGlobalScope' in globalThis) {
  scope.onmessage = e => {
    const m = e.data;
    try {
      if (m.k === 'init') { w = new World(m.file, m.settings, m.seed, m.opts); src = new SyncSource(w); acc = 0; return; }
      if (!w) return;
      scope.postMessage!(frame(m));
    } catch (err) {
      scope.postMessage!({ k: 'failed', msg: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) });
    }
  };
}
