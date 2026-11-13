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

/** The worker's side of the race: the World, what it last sent, and the time not yet stepped. */
export class RaceWorker {
  private w: World | null = null;
  private src: SyncSource | null = null;
  private acc = 0;
  /** A message from the page; the answer to send back, if any. */
  handle(m: ToWorker): FromWorker | null {
    try {
      if (m.k === 'init') { this.w = new World(m.file, m.settings, m.seed, m.opts); this.src = new SyncSource(this.w); this.acc = 0; return null; }
      return this.w ? this.frame(m) : null;
    } catch (err) {
      return { k: 'failed', msg: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) };
    }
  }
  /** One frame, as LocalHost and the page's own loop did it: commands first, then the steps due. */
  private frame(m: Extract<ToWorker, { k: 'frame' }>): FromWorker {
    const t0 = performance.now(), world = this.w!, results: { id: number; r: CommandResult }[] = [];
    for (const { c, id } of m.cmds) { const r = applyCommand(world, c); if (id != null) results.push({ id, r }); }
    const steps0 = world.steps;
    if (world.running && !world.paused) {
      this.acc += m.dt * world.speed;
      while (this.acc >= DT) { world.step(DT); this.acc -= DT; if (world.paused) { this.acc = 0; break; } }
    } else if (!world.running) {
      this.acc += m.dt; while (this.acc >= DT) { world.idle(DT, m.twa); this.acc -= DT; }
    }
    const ms = performance.now() - t0;
    return { k: 'state', packet: this.src!.capture(world.drainEvents()), results, ms, steps: world.steps - steps0 };
  }
  /** (tests: the World sailing here) */
  get world(): World | null { return this.w; }
}

/** The worker's message loop (in a Web Worker only: imported elsewhere, this file defines its types and nothing runs). */
const scope = globalThis as unknown as { postMessage?: (m: FromWorker) => void; onmessage?: ((e: MessageEvent<ToWorker>) => void) | null; document?: unknown };
if (typeof scope.document === 'undefined' && typeof scope.postMessage === 'function' && 'WorkerGlobalScope' in globalThis) {
  const race = new RaceWorker();
  scope.onmessage = e => { const out = race.handle(e.data); if (out) scope.postMessage!(out); };
}
