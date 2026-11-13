/**
 * Keeping a copy of the race in step with the real one (docs/CAPACITY.md, step 3).
 *
 * In step 3 the World sails in a Web Worker, and the page keeps its own copy of it, the mirror: a World built from the
 * same course, settings and seed, which never steps. After each frame's steps the worker sends what changed, and the
 * page writes it onto the mirror. Then every question the page asks (the current at a mooring, the wind map, the
 * laylines, the strategist's briefing, the debriefs) runs on the mirror, exactly as it ran on the real World: the same
 * code on the same numbers.
 *
 * How: both sides walk their World's whole object graph once, in the same order, and number every object (the two
 * Worlds are built the same way, so the numbers match). From then on the worker sends, under its number, each object
 * whose own fields changed since the last packet, and only those fields (a field that holds an object holds its number).
 * The mirror updates its own object of that number in place, or makes a new one of the same class, so its objects keep
 * the identities the page relies on (a boat is the same boat from frame to frame; a new destination is a new object).
 * Functions aren't sent: the mirror has its own, built the same way. Parts changed only by being replaced (the course,
 * the weather, the wind field) aren't walked unless replaced; the recorded frames and the track send only what's new.
 * The race's events go separately (SimHost.drainEvents), so they're not part of the World's state here.
 */
import type { World } from './world';
import { CurrentField } from '../environment/tide';
import { SeaField } from '../environment/sea';

/** The World's own members changed only by being replaced: walked only when replaced. */
const BY_IDENTITY = new Set(['C', 'file', 'sequence', 'weather', 'field', 'opts', 'traffic']);
/** Never sent: the World's own machinery (its random streams and callbacks live on each side), and its events. */
const NEVER = new Set(['rng', 'motorRng', 'emit', 'keepsClearOf', 'obstacle', 'events']);
/** Grown at the end, with the oldest dropped from the front: only what's new is sent. */
const APPEND = new Set(['rec', 'track']);
/**
 * The mirror's check (every CHECK_EVERY frames, in the published page too): a few numbers from the worker's World and
 * the same worked out on the mirror must agree to the last bit: every boat's place, heading, speed and heel, the clock,
 * the wind, and the answers to three of the page's questions (the current, the wind field, the wind) at the course's
 * middle. A difference is counted and reported (sim/host.ts): the mirror isn't the race.
 */
export const CHECK_EVERY = 20;
export function checkOf(w: World): number[] {
  const out: number[] = [w.t, w.steps, w.wind.from, w.wind.kt];
  for (const b of w.boats) out.push(b.x, b.y, b.h, b.v, b.heel);
  const p = w.C.center, c = w.currentAt(p), f = w.fieldAt(p), h = w.windHere(p);
  out.push(c.x, c.y, f.k, f.turn, f.extra, h.from, h.kt);
  return out;
}
/** How often (frames) both sides forget the objects the World no longer holds. */
export const SWEEP_EVERY = 300;

/** A field's value as sent: a primitive, or another object by its number. */
type Val = string | number | boolean | null | undefined | bigint | { r: number };
/** One object whose contents changed: its number, its class the first time (by its place in both sides' list), and what changed. */
export type Node =
  | { i: number; c?: number; o: Record<string, Val>; d?: string[] } // fields set (and deleted)
  | { i: number; a: Val[] } // an array, whole
  | { i: number; m: [Val, Val][] } // a Map, whole
  | { i: number; s: Val[] } // a Set, whole
  | { i: number; t: ArrayBufferView }; // a typed array, copied

export interface Packet {
  /** The World's own members that changed (the BY_IDENTITY ones only when replaced). */
  top: Record<string, Val>;
  /** Every object whose contents changed, and every new one. */
  nodes: Node[];
  /** New recorded frames and track points (by number: their contents are among the nodes), and how many each list holds. */
  rec: { add: Val[]; len: number }; track: { add: Val[]; len: number };
  /** The race's events since the last packet (sim/events.ts), by number. */
  events: Val[];
  /** Both sides forget the objects their World no longer holds, after this packet. */
  sweep?: true;
  /** After a rebuild (new conditions): how many objects the worker numbered, for the mirror to check its own count. */
  count?: number;
}

/**
 * Memos: each side keeps its own, never sent. They're sums kept to save working them out again, each held with the
 * inputs it was worked out for (tests/independence.test.ts: a memo holds only what its key says), so the mirror working
 * out its own gives the same answers. They must stay local: the page's questions fill the mirror's memos, so the mirror's
 * differ from what the worker last sent, and an update of half a memo (a new key over an old answer) would be wrong.
 * By class (the class itself, not its name: the page's and the worker's code are minified apart) and field.
 * (Not every memo can be local: the piers' wakes, World.flows, are refreshed every 30 s of race from whenever they're
 * first asked for, so their value depends on who asks first; they're sent, as the worker's.)
 */
const LOCAL_WORLD = new Set(['kcMemo']);
const LOCAL = new Map<object, ReadonlySet<string>>([
  [CurrentField.prototype, new Set(['vecs', 'stamp', 'bayFlow', 'cells', 'lastKey', 'lastList'])],
  // (the fetch on a 150 m grid by wind direction, worked out at the grid's node: the same whoever asks first)
  [SeaField.prototype, new Set(['cache'])]
]);
/** (tests: each side's own memos, by class) */
export const localOf = (v: object, key: string): boolean => LOCAL.get(Object.getPrototypeOf(v))?.has(key) ?? false;
export const LOCAL_WORLD_KEYS: ReadonlySet<string> = LOCAL_WORLD;
const local = localOf;
const isObj = (v: unknown): v is object => v !== null && typeof v === 'object';
/**
 * Long lists of numbers (the tide stations' predictions, thousands of points each) are replaced, never changed in place
 * (CurrentField.cover): sent once, then known by their identity (and their length, in case one ever grows), not compared
 * number by number every frame.
 */
const LONG = 1000;
const fixedList = (v: object) => Array.isArray(v) && v.length >= LONG && typeof v[0] === 'number';
const kind = (v: object) => ArrayBuffer.isView(v) ? 't' : Array.isArray(v) ? 'a' : v instanceof Map ? 'm' : v instanceof Set ? 's' : 'o';
/** A class's prototype, if the object is an instance of one (not a plain object, array, Map, Set or typed array). */
const classOf = (v: object): object | null => { const p = Object.getPrototypeOf(v); return p && p !== Object.prototype && kind(v) === 'o' ? p : null; };

/** Walk every object in a World's state, in a fixed order: the same on both sides for Worlds built the same way. */
function walkAll(w: World, see: (v: object) => void): void {
  const ids = new WeakSet<object>();
  const visit = (v: unknown): void => {
    if (!isObj(v) || ids.has(v)) return;
    ids.add(v); see(v);
    if (ArrayBuffer.isView(v)) return;
    if (v instanceof Map) { for (const [k, x] of v) { visit(k); visit(x); } return; }
    if (v instanceof Set) { for (const x of v) visit(x); return; }
    for (const k of Object.keys(v)) { const x = (v as Record<string, unknown>)[k]; if (typeof x !== 'function' && !local(v, k)) visit(x); }
  };
  const o = w as unknown as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!NEVER.has(k) && !LOCAL_WORLD.has(k)) visit(o[k]);
}

/** The worker's side: what changed since the last packet. */
export class SyncSource {
  private ids = new WeakMap<object, number>();
  private next = 1;
  /** The classes met in the first walk, in order: both sides' lists match, so a class is sent as its place in the list. */
  private protoAt = new Map<object, number>();
  /** One reference per object, made once: compared by identity, so an unchanged field costs nothing. */
  private refs = new WeakMap<object, { r: number }>();
  /**
   * What each object held when last sent, kept up to date in place: fields, list items, or a copy of a typed array.
   * (Held weakly, as the numbers are: the World makes new objects every step, a new wind for one, and drops the old.)
   */
  private last = new WeakMap<object, Val[] | Record<string, Val> | ArrayBufferView>();
  /** The sweep each object was last seen alive in (SWEEP_EVERY): one the World let go of and took back is sent afresh. */
  private seen = new WeakMap<object, number>();
  private sweepNo = 0; private frames = 0;
  private lastTop = new Map<string, unknown>();
  private lastTopVal = new Map<string, Val>();
  private lastRec: unknown = null; private lastTrack = 0;
  /** This capture's walk: the objects seen, and the nodes made. */
  private done = new Set<number>(); private nodes: Node[] = [];
  /** How many objects were numbered to begin with; and whether the first packet is to send them all (after a rebuild). */
  readonly count: number; private fresh: boolean;
  /**
   * `fresh`: the mirror is to be sent everything (after new conditions, when both sides have rebuilt their World's
   * conditions and numbered afresh): the mirror's own sums of the moment may differ from the worker's.
   */
  constructor(private w: World, fresh = false) {
    const all: object[] = [];
    walkAll(w, v => { this.ids.set(v, this.next++); all.push(v); const p = classOf(v); if (p && !this.protoAt.has(p)) this.protoAt.set(p, this.protoAt.size); });
    this.count = all.length; this.fresh = fresh;
    // (what the mirror holds to begin with: the same World, built the same way)
    if (!fresh) for (const v of all) this.last.set(v, this.contents(v));
    const o = w as unknown as Record<string, unknown>;
    for (const k of Object.keys(o)) { this.lastTop.set(k, o[k]); if (!fresh || BY_IDENTITY.has(k)) this.lastTopVal.set(k, this.ref(o[k])); }
    this.lastRec = w.rec[w.rec.length - 1] ?? null; this.lastTrack = w.track.length;
  }
  /** A value as sent, without walking: primitives as they are, objects by number. */
  private ref(v: unknown): Val {
    if (!isObj(v)) return typeof v === 'function' ? undefined : v as Val;
    let r = this.refs.get(v);
    if (!r) { let id = this.ids.get(v); if (id == null) { id = this.next++; this.ids.set(v, id); } r = { r: id }; this.refs.set(v, r); }
    return r;
  }
  /** A value as sent, walking into an object (its changes go into this capture's nodes). */
  private val(v: unknown): Val {
    const r = this.ref(v);
    if (isObj(v)) this.walk(v, (r as { r: number }).r);
    return r;
  }
  /** An object's contents as sent (its children by number), not walked. */
  private contents(v: object): Val[] | Record<string, Val> | ArrayBufferView {
    const k = kind(v);
    if (k === 't') return (v as unknown as { slice(): ArrayBufferView }).slice();
    if (k === 'a') return (v as unknown[]).map(x => this.ref(x));
    if (k === 'm') { const out: Val[] = []; for (const [a, b] of v as Map<unknown, unknown>) out.push(this.ref(a), this.ref(b)); return out; }
    if (k === 's') return [...(v as Set<unknown>)].map(x => this.ref(x));
    const o: Record<string, Val> = {};
    for (const key of Object.keys(v)) { const x = (v as Record<string, unknown>)[key]; if (typeof x !== 'function' && !local(v, key)) o[key] = this.ref(x); }
    return o;
  }
  /** Compare one object with what was last sent, record its changes, and walk on into its children. */
  private walk(v: object, id: number): void {
    if (this.done.has(id)) return; this.done.add(id);
    // (an object the World let go of before the last sweep, and holds again: the mirror forgot it, so it's sent afresh)
    const ep = this.seen.get(v); this.seen.set(v, this.sweepNo);
    const was = ep !== undefined && ep < this.sweepNo ? undefined : this.last.get(v);
    if (fixedList(v) && was && (was as Val[]).length === (v as unknown[]).length) return;
    const k = kind(v);
    if (k === 't') {
      const a = v as unknown as ArrayLike<number>, b = was as unknown as ArrayLike<number> | undefined;
      let eq = !!b && b.length === a.length && (was as object).constructor === v.constructor;
      for (let i = 0; eq && i < a.length; i++) eq = Object.is(a[i], b![i]);
      if (!eq) { const c = (v as unknown as { slice(): ArrayBufferView }).slice(); this.nodes.push({ i: id, t: c }); this.last.set(v, (c as unknown as { slice(): ArrayBufferView }).slice()); }
      return;
    }
    if (k === 'a') {
      const a = v as unknown[], b = Array.isArray(was) ? was as Val[] : undefined;
      let eq = !!b && b.length === a.length;
      for (let i = 0; i < a.length; i++) { const x = this.val(a[i]); if (eq && !Object.is(x, b![i])) eq = false; }
      if (!eq) { const c = a.map(x => this.ref(x)); this.nodes.push({ i: id, a: c }); this.last.set(v, c); }
      return;
    }
    if (k === 'm' || k === 's') {
      const flat: Val[] = [];
      if (k === 'm') for (const [x, y] of v as Map<unknown, unknown>) flat.push(this.val(x), this.val(y));
      else for (const x of v as Set<unknown>) flat.push(this.val(x));
      const b = Array.isArray(was) ? was as Val[] : undefined;
      let eq = !!b && b.length === flat.length;
      for (let i = 0; eq && i < flat.length; i++) eq = Object.is(flat[i], b![i]);
      if (!eq) {
        this.nodes.push(k === 's' ? { i: id, s: flat } : { i: id, m: Array.from({ length: flat.length / 2 }, (_, j) => [flat[2 * j], flat[2 * j + 1]] as [Val, Val]) });
        this.last.set(v, flat);
      }
      return;
    }
    const o = v as Record<string, unknown>;
    let b = (was && !Array.isArray(was) && !ArrayBuffer.isView(was) ? was : undefined) as Record<string, Val> | undefined;
    const fresh = !b; if (!b) { b = {}; this.last.set(v, b); }
    let set: Record<string, Val> | null = fresh ? {} : null, keys = 0;
    for (const key in o) {
      if (!Object.prototype.hasOwnProperty.call(o, key)) continue;
      const x = o[key]; if (typeof x === 'function' || local(v, key)) continue;
      keys++;
      const s = this.val(x);
      if (fresh || !(key in b) || !Object.is(s, b[key])) { (set ??= {})[key] = s; b[key] = s; }
    }
    let del: string[] | undefined;
    if (!fresh && Object.keys(b).length !== keys) {
      for (const key of Object.keys(b)) if (!Object.prototype.hasOwnProperty.call(o, key) || typeof o[key] === 'function' || local(v, key)) { (del ??= []).push(key); delete b[key]; }
    }
    if (set || del) {
      const p = fresh ? classOf(v) : null;
      let c: number | undefined;
      if (p) { c = this.protoAt.get(p); if (c == null) console.error('sim/sync: a class the mirror has never met; it gets a plain object', v.constructor?.name); }
      this.nodes.push({ i: id, ...(c != null ? { c } : {}), o: set ?? {}, ...(del ? { d: del } : {}) });
    }
  }
  /** What changed since the last packet, and the race's events since then (their boats by number: the mirror's own). */
  capture(events: readonly object[] = []): Packet {
    const w = this.w, o = w as unknown as Record<string, unknown>;
    this.done.clear(); this.nodes = [];
    const top: Record<string, Val> = {};
    for (const key of Object.keys(o)) {
      if (NEVER.has(key) || APPEND.has(key) || LOCAL_WORLD.has(key)) continue;
      const v = o[key];
      if (BY_IDENTITY.has(key) && v === this.lastTop.get(key)) continue; // (unchanged: not walked)
      const s = this.val(v);
      if (!Object.is(s, this.lastTopVal.get(key))) { top[key] = s; this.lastTopVal.set(key, s); }
      this.lastTop.set(key, v);
    }
    const grown = (list: unknown[], last: unknown) => { const i = last == null ? -1 : list.lastIndexOf(last); return list.slice(i + 1); };
    // (after a rebuild the mirror's lists are its own: all of them are sent, the mirror's emptied first)
    const recAdd = this.fresh ? w.rec : grown(w.rec, this.lastRec), trackAdd = this.fresh ? w.track : w.track.slice(this.lastTrack);
    const rec = { add: recAdd.map(x => this.val(x)), len: w.rec.length }; this.lastRec = w.rec[w.rec.length - 1] ?? null;
    const track = { add: trackAdd.map(x => this.val(x)), len: w.track.length }; this.lastTrack = w.track.length;
    const ev = events.map(e => this.val(e));
    const p: Packet = { top, nodes: this.nodes, rec, track, events: ev };
    if (this.fresh) { p.count = this.count; this.fresh = false; }
    // the sweep: every object the World still holds is marked alive (the course and the weather too, though not walked
    // every frame); the mirror does the same after this packet, and both forget the rest
    if (++this.frames % SWEEP_EVERY === 0) { this.sweepNo++; walkAll(w, v => this.seen.set(v, this.sweepNo)); p.sweep = true; }
    return p;
  }
}

/** The page's side: the mirror World, kept in step by each packet. */
export class SyncMirror {
  /** The mirror's objects by number (forgotten at the sweeps, when the World no longer holds them). */
  private objs = new Map<number, object>();
  /** The classes met in the first walk, in order (as the worker's list). */
  private protos: object[] = [];
  readonly count: number;
  constructor(readonly w: World) {
    let id = 1; const seenP = new Set<object>();
    walkAll(w, v => { this.objs.set(id++, v); const p = classOf(v); if (p && !seenP.has(p)) { seenP.add(p); this.protos.push(p); } });
    this.count = id - 1;
  }
  private val(v: Val): unknown { return isObj(v) ? this.objs.get((v as { r: number }).r) : v; }
  /** Write a packet onto the mirror; its events come back as the mirror's own objects. */
  apply(p: Packet): unknown[] {
    if (p.count != null && p.count !== this.count) console.error(`sim/sync: the mirror numbered ${this.count} objects, the worker ${p.count}: the two Worlds weren't built alike`);
    // new objects first (the changed ones can refer to them), then every changed object's contents
    for (const n of p.nodes) {
      const cur = this.objs.get(n.i), want = 't' in n ? 't' : 'a' in n ? 'a' : 'm' in n ? 'm' : 's' in n ? 's' : 'o';
      const proto = 'c' in n && n.c != null ? this.protos[n.c] : undefined;
      if (cur && kind(cur) === want && (want !== 't' || (cur as ArrayBufferView).constructor === (n as { t: ArrayBufferView }).t.constructor) && (!proto || Object.getPrototypeOf(cur) === proto)) continue;
      this.objs.set(n.i, want === 'a' ? [] : want === 'm' ? new Map() : want === 's' ? new Set() : want === 't' ? (n as { t: ArrayBufferView }).t as unknown as object : proto ? Object.create(proto) as object : {});
    }
    for (const n of p.nodes) {
      const cur = this.objs.get(n.i)!;
      if ('t' in n) { const t = cur as unknown as { length: number; set(a: ArrayBufferView): void }; if (t !== n.t as unknown) { if (t.length === (n.t as unknown as { length: number }).length) t.set(n.t); else this.objs.set(n.i, n.t as unknown as object); } }
      else if ('a' in n) { const a = cur as unknown[]; a.length = n.a.length; for (let i = 0; i < n.a.length; i++) a[i] = this.val(n.a[i]); }
      else if ('m' in n) { const m = cur as Map<unknown, unknown>; m.clear(); for (const [k, x] of n.m) m.set(this.val(k), this.val(x)); }
      else if ('s' in n) { const s = cur as Set<unknown>; s.clear(); for (const x of n.s) s.add(this.val(x)); }
      else { const o = cur as Record<string, unknown>; for (const [k, x] of Object.entries(n.o)) o[k] = this.val(x); if (n.d) for (const k of n.d) delete o[k]; }
    }
    const w = this.w as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(p.top)) w[k] = this.val(v);
    for (const [k, part] of [['rec', p.rec], ['track', p.track]] as const) {
      const list = w[k] as unknown[];
      if (p.count != null) list.length = 0;
      for (const x of part.add) list.push(this.val(x));
      while (list.length > part.len) list.shift();
    }
    const events = p.events.map(e => this.val(e));
    if (p.sweep) {
      const alive = new WeakSet<object>(); walkAll(this.w, v => alive.add(v));
      for (const [id, v] of this.objs) if (!alive.has(v)) this.objs.delete(id);
    }
    return events;
  }
}
