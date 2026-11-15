/**
 * The page's side of the race (docs/CAPACITY.md, step 2): what the page reads, and how it changes anything.
 *
 * The page (app.ts, the HUD, the 3D scene, the maps and panels) reads the race through a `SimView`. A SimView is the
 * World as the page may see it: its state and its questions (where the wind and the current are, who has right of
 * way), all read-only, and none of what changes the race. Changes go through `SimHost.send` as commands
 * (sim/commands.ts), and the steps through `SimHost.frame`.
 *
 * Today the host runs the World in the page's own thread, and the view is the World itself, typed read-only: nothing
 * changes in how the race is sailed, to the last bit. Step 3 runs the same World in a Web Worker. Then the view is
 * the World's state sent back after each frame's steps, and the commands are sent to the worker. The types here are
 * the contract between the two. The compiler refuses a write to any field of the view, and any call of the World's
 * own methods that change the race. It doesn't see everything: arrays in the view stay mutable (so a boat from the view
 * can still be handed to the many read-only helpers in src/boat that take a Boat), a view passed to code typed `Boat`
 * can be written there, and methods of the World's parts (the race log's note, say) stay callable. Those holes are
 * closed by review and by the dev-only guard below (scripts/check/simguard.cjs), which refuses writes, in-place array
 * changes and the race log's note at run time. Before step 3 makes a stray write silently go to a stale copy, the plan
 * is to type the boat helpers' parameters read-only and close the holes at compile time too.
 */
import type { Boat } from '../boat/boat';
import type { SimEvent } from './events';
import { applyCommand, type Command, type CommandResult } from './commands';
import { DT, World, type WorldOptions } from './world';
import { SyncMirror, checkOf } from './sync';
import type { FromWorker, ToWorker } from './worker';
import type { CourseFile } from '../courses/course';
import type { Settings } from '../settings';

/** Read-only all the way down, except arrays (left mutable so a view can still be handed to code that takes a Boat). */
export type RO<T> = T extends (...a: never[]) => unknown ? T
  : T extends readonly unknown[] ? T
  : T extends object ? { readonly [K in keyof T]: RO<T[K]> }
  : T;

/** The World's members that change the race: the page reaches them only through SimHost (commands and steps). */
type Changes = 'step' | 'idle' | 'drainEvents' | 'pushOff' | 'setSail' | 'setDest' | 'retire' | 'motorTilt' | 'motorStart'
  | 'motorStop' | 'motorGear' | 'motorThrottle' | 'motorSwivel' | 'castOff' | 'sendHome' | 'moveHere' | 'applyConditions'
  | 'userHail' | 'assignPenalty' | 'hail' | 'replyYouTack' | 'passOnHail' | 'paddle' | 'rule42';

/*
 * What the page reads, for step 3 (when the view is the worker's state sent back each frame, not the World itself):
 * - state: the clock, the wind, the boats (each boat's every field: the 3D boat, the crew figures and the HUD read
 *   most of them), the flags and signals, the pilot, the destination, the scores' inputs, settings;
 * - the World's questions the page asks: currentAt (the moorings, the flow maps, the chart's readout), seaHere,
 *   windHere, fieldAt and fieldExtra (the wind map), nextMark, rights and pairRecord (the HUD's situation), lineD,
 *   laylineTransit, hailOption and canPassOn; and the puffs' at() and the tide's stations (the HUD and the maps);
 * - the analyses the page runs on the whole view: the strategist's briefing and passage plan (raceBrief, passagePlan,
 *   outlookFor), the laylines, the start's debrief and the race log's moments and findings (sim/debrief.ts);
 * - at the end of a race: the track, the recorded frames and the log, for the replays.
 * Some of the questions keep memos inside the World (the tide's nearest stations, for one): memos of pure sums,
 * which give the same answer whoever asks first (tests/independence.test.ts).
 */

/** A boat as the page sees her. */
export type BoatView = RO<Boat>;
/** The race as the page sees it. */
export type SimView = RO<Omit<World, Changes | 'boats' | 'user'>> & { readonly boats: readonly BoatView[]; readonly user: BoatView };

export interface SimHost {
  /** Where the World sails: in the page's own thread, or in a Web Worker (the page then reads its mirror). */
  readonly mode: 'local' | 'worker';
  /** The race as it stands after the last frame's steps. */
  readonly view: SimView;
  /** The World on the page's side (the real one, or the mirror): for the dev handles only. */
  readonly world: World;
  /**
   * A frame of the page's time: while the race runs (and isn't paused) the steps due for `dt` seconds at its speed;
   * with nothing running (the start page, setup, the showroom) she still sails, in the real wind and physics, on the
   * showroom's point of sail (`twa`) if she's on show. The time the steps took, ms (from the worker: its last frame's).
   */
  advance(dt: number, twa?: number): number;
  /** Do something to the race (sim/commands.ts), at the next step boundary, in the order sent. */
  send(c: Command): void;
  /** Do something whose answer the page needs (the motor's start, home, move her here). */
  ask(c: Command): Promise<CommandResult>;
  /** What happened in the race since the last call (toasts, horns, incidents). */
  drainEvents(): SimEvent[];
  /** Done with this race (a new one's being built): the worker stops. */
  dispose(): void;
  /**
   * A new race in place (the setup's changes), keeping the worker: read `view` again after. `mirror`: the page's own
   * World built from these args and untouched, to be used rather than building another.
   */
  rebuild(args: WorldArgs, mirror?: World): void;
}

/**
 * A check for development (the dev server with ?simguard): the view as a proxy that throws on any write, however the
 * page's code is typed, so a write that slips past the compiler (code that takes a mutable Boat, a method that changes
 * its object) shows as an error with its stack. Reads pass through, objects read from it are guarded in turn; Maps,
 * Sets and typed arrays are handed out as they are (their methods need the real object), as are functions called on
 * them. Slow: never in the published page.
 */
export function guarded<T extends object>(o: T, path = 'w', seen = new WeakMap<object, object>()): T {
  const hit = seen.get(o); if (hit) return hit as T;
  const fail = (what: string, k: PropertyKey) => { throw new Error(`simguard: the page ${what} ${path}.${String(k)} (send a command: sim/commands.ts)`); };
  const p = new Proxy(o, {
    get(t, k) {
      const v = Reflect.get(t, k, t);
      if (typeof v === 'function') {
        // an array changed in place, or a note in the race log, is the page writing to the race
        if ((Array.isArray(t) && MUTATORS.has(k)) || k === 'note') return () => fail('called', k);
        // the sim's own methods (the page's questions: the current here, the wind there) run on the real object, with
        // real arguments (a boat from the view is the World's own boat to them: they compare boats by identity), and some
        // keep memos of their sums, which are the sim's business; what they hand back is the page's (often a new object)
        return (...a: unknown[]) => v.apply(t, a.map(x => (x !== null && typeof x === 'object' && REAL.get(x)) || x));
      }
      if (v === null || typeof v !== 'object' || v instanceof Map || v instanceof Set || ArrayBuffer.isView(v)) return v;
      return guarded(v as object, `${path}.${String(k)}`, seen);
    },
    set(_t, k) { return fail('wrote', k); },
    deleteProperty(_t, k) { return fail('deleted', k); },
    defineProperty(_t, k) { return fail('defined', k); }
  });
  seen.set(o, p); REAL.set(p, o); return p;
}
/** The real object behind each guard (for a sim method's arguments). */
const REAL = new WeakMap<object, object>();
const MUTATORS = new Set<PropertyKey>(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

/** The World in the page's own thread, as it has always run. */
export class LocalHost implements SimHost {
  readonly mode = 'local';
  /** Time not yet stepped, s (the race's time: the page's time × its speed). */
  private acc = 0;
  /** The view the page reads: the World itself, or (?simguard, dev only) a proxy that refuses writes. */
  view: SimView;
  constructor(public world: World, private guard = false) { this.view = guard ? guarded(world) : world; }
  rebuild(args: WorldArgs, mirror?: World): void {
    this.world = mirror && mirror.steps === 0 && !mirror.running ? mirror : new World(args.file, args.settings, args.seed, args.opts);
    this.view = this.guard ? guarded(this.world) : this.world; this.acc = 0;
  }
  advance(dt: number, twa?: number): number {
    const w = this.world, t0 = performance.now();
    if (w.running && !w.paused) {
      this.acc += dt * w.speed;
      while (this.acc >= DT) {
        w.step(DT); this.acc -= DT;
        if (w.paused) { this.acc = 0; break; }
      }
    } else if (!w.running) {
      this.acc += dt; while (this.acc >= DT) { w.idle(DT, twa); this.acc -= DT; }
    }
    return performance.now() - t0;
  }
  send(c: Command): void { applyCommand(this.world, c); }
  ask(c: Command): Promise<CommandResult> { return Promise.resolve(applyCommand(this.world, c)); }
  drainEvents(): SimEvent[] { return this.world.drainEvents(); }
  dispose(): void { /* (nothing running apart from the page) */ }
}

/** What a World is built from: the same on both sides of the worker (the mirror is built from it too). */
export interface WorldArgs { file: CourseFile; settings: Settings; seed: number; opts: WorldOptions }

/**
 * The World in a Web Worker (sim/worker.ts), the page drawing its mirror (sim/sync.ts). Each frame the page sends the
 * time that's passed and the commands since the last, and draws what the worker last sent: the picture is a frame
 * behind the race, the worker sailing the next frame's steps while the page draws. At most two frames are in flight;
 * past that (the worker behind) the page's time waits, as a slow frame's does now (up to a tenth of a second of it).
 * If the worker fails, the mirror, a whole World in step with the race to the last frame, sails on in the page's thread.
 */
export class WorkerHost implements SimHost {
  mode: 'local' | 'worker' = 'worker';
  world: World;
  view: SimView;
  /** Which World the worker sails (rebuild makes a new one): answers from an older one are dropped. */
  private gen = 0;
  private mirror: SyncMirror;
  private queue: { c: Command; id?: number }[] = [];
  /** The frames sent and not yet answered: their commands, and when each was sent (ms, the page's clock). */
  private sent: { cmds: { c: Command; id?: number }[]; at: number; frame: number }[] = [];
  private frames = 0;
  private asks = new Map<number, (r: CommandResult) => void>();
  private nextAsk = 1; private inflight = 0; private due = 0; private lastMs = 0;
  private events: SimEvent[] = [];
  /** Checks the mirror failed (sim/sync.ts checkOf): 0, or the mirror isn't the race. */
  faults = 0;
  /** Checks made. */
  checks = 0;
  /**
   * The answers that reached the page since its last frame, and the steps they carried (for the checks and the dev
   * handles: one a frame as a rule; none, then two, when the worker's frame ran long). And how often each count came up.
   */
  packetsLastFrame = 0; stepsLastFrame = 0;
  readonly packetsPerFrame = [0, 0, 0, 0];
  private packetsNow = 0; private stepsNow = 0;
  /** After a failure: the mirror, sailing in the page's thread. */
  private local: LocalHost | null = null;
  /**
   * `mirror`: a World the page already built from these same args (the setup's, for its cards), to be the mirror rather
   * than building a second. It must be untouched: never stepped, idled or sent a command (else a fresh one is built).
   * The worker then sends everything in its first packet; if the two Worlds were numbered apart (a question on the
   * setup's World made something the worker's hasn't), the race sails on that World in the page instead.
   */
  constructor(private worker: Worker, args: WorldArgs, private guard = false, private onFail?: (why: string) => void, mirror?: World) {
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    worker.onerror = e => { e.preventDefault(); this.fail(e.message || 'the worker stopped'); };
    // (set by begin, here as for a rebuild)
    this.world = null as unknown as World; this.view = null as unknown as SimView; this.mirror = null as unknown as SyncMirror;
    this.begin(args, mirror);
  }
  /** A World for these args (or the page's own untouched one) as the mirror, and the worker told to build its own. */
  private begin(args: WorldArgs, mirror?: World): void {
    const adopt = !!mirror && mirror.steps === 0 && !mirror.running;
    this.world = adopt ? mirror! : new World(args.file, args.settings, args.seed, args.opts);
    this.mirror = new SyncMirror(this.world);
    this.view = this.guard ? guarded(this.world) : this.world;
    this.worker.postMessage({ k: 'init', ...args, gen: this.gen, ...(adopt ? { fresh: true } : {}) } satisfies ToWorker);
  }
  /**
   * A new race in the same worker (the setup's changes: another course, boat, day or fleet): no new worker started. The
   * page reads the new `view` after this (the old one is the old race). What was sent and not yet answered is dropped
   * (its answers, if they come, are for the old World); questions asked of the old race come back unanswered.
   * `mirror`: the page's own untouched World for these args, as in the constructor.
   */
  rebuild(args: WorldArgs, mirror?: World): void {
    for (const [, res] of this.asks) res(undefined);
    this.asks.clear(); this.queue = []; this.sent = []; this.inflight = 0; this.due = 0; this.events = [];
    if (this.local) { // (the worker failed earlier: the page sails the new race itself)
      const adopt = !!mirror && mirror.steps === 0 && !mirror.running;
      this.world = adopt ? mirror! : new World(args.file, args.settings, args.seed, args.opts);
      this.local = new LocalHost(this.world, this.guard); this.view = this.local.view; return;
    }
    this.gen++;
    this.begin(args, mirror);
  }
  private receive(m: FromWorker): void {
    if (this.local || m.gen !== this.gen) return; // (an answer for a World since replaced)
    if (m.k === 'failed') { this.fail(m.msg); return; }
    // (an adopted mirror numbered apart from the worker's World: the race sails on it here, which is right, if slower)
    if (m.packet.count != null && m.resync == null && m.packet.count !== this.mirror.count) { this.fail(`the page's World and the worker's were numbered apart (${this.mirror.count} against ${m.packet.count})`); return; }
    this.inflight--;
    this.packetsNow++; this.stepsNow += m.steps;
    const frame = this.sent.shift();
    if (m.resync != null && frame) {
      // new conditions: the same commands to the mirror, up to them (the mirror is the race as the worker had it before
      // the frame), then both Worlds numbered afresh, and the packet with everything in it
      for (const { c } of frame.cmds.slice(0, m.resync + 1)) applyCommand(this.world, c);
      this.world.drainEvents(); // (the mirror's own toasts: the worker's come in the packet)
      this.mirror = new SyncMirror(this.world);
    }
    this.events.push(...(this.mirror.apply(m.packet) as SimEvent[]));
    if (m.check) {
      this.checks++;
      const mine = checkOf(this.world), k = mine.findIndex((x, i) => !Object.is(x, m.check![i]));
      if (k >= 0 || mine.length !== m.check.length) { this.faults++; console.error(`sim/sync: the mirror differs from the race (check number ${k}: ${mine[k]} against ${m.check[k]})`); }
    }
    for (const { id, r } of m.results) { this.asks.get(id)?.(r); this.asks.delete(id); }
    this.lastMs = m.ms;
  }
  private fail(why: string): void {
    if (this.local) return;
    console.error('The race\'s worker failed; it sails on in the page:', why);
    this.worker.terminate();
    this.local = new LocalHost(this.world, this.guard); this.mode = 'local';
    // (the mirror is the race as of the worker's last answer: the commands of the frames sent since, and those not yet
    // sent, are done here, in order; one that throws (perhaps what broke the worker) is left out. The race sails on from
    // where it was, but not exactly as the worker would have sailed it: the random streams (the puffs', the AI's) are
    // each side's own, and the mirror's never ran)
    for (const { c, id } of [...this.sent.flatMap(f => f.cmds), ...this.queue]) {
      let r: CommandResult;
      try { r = applyCommand(this.world, c); } catch (e) { console.error('A command failed after the worker did:', c, e); }
      if (id != null) { this.asks.get(id)?.(r); this.asks.delete(id); }
    }
    for (const [, res] of this.asks) res(undefined);
    this.queue = []; this.sent = []; this.asks.clear();
    this.onFail?.(why);
  }
  advance(dt: number, twa?: number): number {
    this.packetsLastFrame = this.packetsNow; this.stepsLastFrame = this.stepsNow; this.packetsNow = this.stepsNow = 0;
    this.packetsPerFrame[Math.min(3, this.packetsLastFrame)]++;
    if (this.local) return this.local.advance(dt, twa);
    this.due = Math.min(0.1, this.due + dt);
    const now = performance.now();
    // (a worker that's stopped answering, stuck or gone: the race carries on in the page. Its answers come between the
    // page's frames, so a frame waiting through 30 of the page's frames and 5 seconds wasn't answered; a slow page alone
    // (a frame of seconds) isn't taken for a stuck worker)
    this.frames++;
    if (this.sent.length && now - this.sent[0].at > 5000 && this.frames - this.sent[0].frame > 30) { this.fail('the worker stopped answering'); return this.local!.advance(dt, twa); }
    if (this.inflight >= 2) return this.lastMs;
    const cmds = this.queue, due = this.due; this.queue = []; this.due = 0; this.inflight++;
    this.sent.push({ cmds, at: now, frame: this.frames });
    this.worker.postMessage({ k: 'frame', dt: due, twa, cmds } satisfies ToWorker);
    return this.lastMs;
  }
  send(c: Command): void { if (this.local) this.local.send(c); else this.queue.push({ c }); }
  ask(c: Command): Promise<CommandResult> {
    if (this.local) return this.local.ask(c);
    const id = this.nextAsk++;
    return new Promise(res => { this.asks.set(id, res); this.queue.push({ c, id }); });
  }
  drainEvents(): SimEvent[] { if (this.local) return this.local.drainEvents(); const e = this.events; this.events = []; return e; }
  dispose(): void { if (!this.local) this.worker.terminate(); }
}
