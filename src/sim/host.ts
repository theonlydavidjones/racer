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
import { DT, type World } from './world';

/** Read-only all the way down, except arrays (left mutable so a view can still be handed to code that takes a Boat). */
export type RO<T> = T extends (...a: never[]) => unknown ? T
  : T extends readonly unknown[] ? T
  : T extends object ? { readonly [K in keyof T]: RO<T[K]> }
  : T;

/** The World's members that change the race: the page reaches them only through SimHost (commands and steps). */
type Changes = 'step' | 'idle' | 'drainEvents' | 'pushOff' | 'setSail' | 'setDest' | 'retire' | 'motorTilt' | 'motorStart'
  | 'motorStop' | 'motorGear' | 'motorThrottle' | 'motorSwivel' | 'castOff' | 'sendHome' | 'moveHere' | 'applyConditions'
  | 'userHail' | 'assignPenalty' | 'hail' | 'replyYouTack' | 'passOnHail';

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
  /** The race as it stands after the last frame's steps. */
  readonly view: SimView;
  /** A frame: the steps due for `dt` seconds of the page's time (at the race's speed), while it runs and isn't paused. */
  frame(dt: number): void;
  /** Nothing running (the start page, setup, the showroom): she still sails, in the real wind and physics. */
  idle(dt: number, twa?: number): void;
  /** Do something to the race (sim/commands.ts). In this thread the answer comes at once. */
  send(c: Command): CommandResult;
  /** What happened in the race since the last call (toasts, horns, incidents). */
  drainEvents(): SimEvent[];
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
  /** Time not yet stepped, s (the race's time: the page's time × its speed). */
  private acc = 0;
  /** The view the page reads: the World itself, or (?simguard, dev only) a proxy that refuses writes. */
  readonly view: SimView;
  constructor(readonly world: World, guard = false) { this.view = guard ? guarded(world) : world; }
  frame(dt: number): void {
    const w = this.world;
    this.acc += dt * w.speed;
    while (this.acc >= DT) {
      w.step(DT); this.acc -= DT;
      if (w.paused) { this.acc = 0; break; }
    }
  }
  idle(dt: number, twa?: number): void {
    this.acc += dt; while (this.acc >= DT) { this.world.idle(DT, twa); this.acc -= DT; }
  }
  send(c: Command): CommandResult { return applyCommand(this.world, c); }
  drainEvents(): SimEvent[] { return this.world.drainEvents(); }
}
