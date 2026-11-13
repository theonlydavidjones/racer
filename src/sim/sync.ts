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

/** The World's own members changed only by being replaced: walked only when replaced. */
const BY_IDENTITY = new Set(['C', 'file', 'sequence', 'weather', 'field', 'opts', 'traffic']);
/** Never sent: the World's own machinery (its random streams and callbacks live on each side), and its events. */
const NEVER = new Set(['rng', 'motorRng', 'emit', 'keepsClearOf', 'obstacle', 'events']);
/** Grown at the end, with the oldest dropped from the front: only what's new is sent. */
const APPEND = new Set(['rec', 'track']);

/** A field's value as sent: a primitive, or another object by its number. */
type Val = string | number | boolean | null | undefined | bigint | { r: number };
/** One object whose contents changed: its number, its class the first time, and what changed. */
export type Node =
  | { i: number; c?: string; o: Record<string, Val>; d?: string[] } // fields set (and deleted)
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
}

/**
 * Memos: each side keeps its own, never sent. They're sums kept to save working them out again, each held with the
 * inputs it was worked out for (tests/independence.test.ts: a memo holds only what its key says), so the mirror working
 * out its own gives the same answers. They must stay local: the page's questions fill the mirror's memos, so the mirror's
 * differ from what the worker last sent, and an update of half a memo (a new key over an old answer) would be wrong.
 * By class (constructor name) and field; 'World' for the World's own.
 */
export const LOCAL: Record<string, ReadonlySet<string>> = {
  World: new Set(['kcMemo']),
  CurrentField: new Set(['vecs', 'stamp', 'bayFlow', 'cells', 'lastKey', 'lastList'])
};
const local = (v: object, key: string) => LOCAL[(v as { constructor?: { name?: string } }).constructor?.name ?? '']?.has(key) ?? false;
const isObj = (v: unknown): v is object => v !== null && typeof v === 'object';
/**
 * Long lists of numbers (the tide stations' predictions, thousands of points each) are replaced, never changed in place
 * (CurrentField.cover): sent once, then known by their identity, not compared number by number every frame. The
 * mirror test (tests/sync.test.ts) would show it if one were ever changed in place.
 */
const LONG = 1000;
const fixedList = (v: object) => Array.isArray(v) && v.length >= LONG && typeof v[0] === 'number';
const kind = (v: object) => ArrayBuffer.isView(v) ? 't' : Array.isArray(v) ? 'a' : v instanceof Map ? 'm' : v instanceof Set ? 's' : 'o';

/** Number every object in a World, in a fixed order: the same on both sides for Worlds built the same way. */
function numberAll(w: World, see: (v: object, id: number) => void): number {
  let next = 1;
  const ids = new WeakSet<object>();
  const visit = (v: unknown): void => {
    if (!isObj(v) || ids.has(v)) return;
    ids.add(v); see(v, next++);
    if (ArrayBuffer.isView(v)) return;
    if (v instanceof Map) { for (const [k, x] of v) { visit(k); visit(x); } return; }
    if (v instanceof Set) { for (const x of v) visit(x); return; }
    for (const k of Object.keys(v)) { const x = (v as Record<string, unknown>)[k]; if (typeof x !== 'function' && !local(v, k)) visit(x); }
  };
  const o = w as unknown as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!NEVER.has(k) && !LOCAL.World.has(k)) visit(o[k]);
  return next;
}

/** The worker's side: what changed since the last packet. */
export class SyncSource {
  private ids = new WeakMap<object, number>();
  private next: number;
  /** One reference per number, made once: compared by identity, so an unchanged field costs nothing. */
  private refs: { r: number }[] = [];
  /** What each object held when last sent, kept up to date in place: fields, list items, or a copy of a typed array. */
  private last = new Map<number, Val[] | Record<string, Val> | ArrayBufferView>();
  private lastTop = new Map<string, unknown>();
  private lastTopVal = new Map<string, Val>();
  private lastRec: unknown = null; private lastTrack = 0;
  /** This capture's walk: the objects seen, and the nodes made. */
  private done = new Set<number>(); private nodes: Node[] = [];
  constructor(private w: World) {
    const all: [object, number][] = [];
    this.next = numberAll(w, (v, id) => { this.ids.set(v, id); all.push([v, id]); });
    // (what the mirror holds to begin with: the same World, built the same way)
    for (const [v, id] of all) this.last.set(id, this.contents(v));
    const o = w as unknown as Record<string, unknown>;
    for (const k of Object.keys(o)) { this.lastTop.set(k, o[k]); this.lastTopVal.set(k, this.ref(o[k])); }
    this.lastRec = w.rec[w.rec.length - 1] ?? null; this.lastTrack = w.track.length;
  }
  /** A value as sent, without walking: primitives as they are, objects by number. */
  private ref(v: unknown): Val {
    if (!isObj(v)) return typeof v === 'function' ? undefined : v as Val;
    let id = this.ids.get(v); if (id == null) { id = this.next++; this.ids.set(v, id); }
    return this.refs[id] ??= { r: id };
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
    const was = this.last.get(id);
    if (fixedList(v) && was) return;
    const k = kind(v);
    if (k === 't') {
      const a = v as unknown as ArrayLike<number>, b = was as unknown as ArrayLike<number> | undefined;
      let eq = !!b && b.length === a.length && (was as object).constructor === v.constructor;
      for (let i = 0; eq && i < a.length; i++) eq = Object.is(a[i], b![i]);
      if (!eq) { const c = (v as unknown as { slice(): ArrayBufferView }).slice(); this.nodes.push({ i: id, t: c }); this.last.set(id, (c as unknown as { slice(): ArrayBufferView }).slice()); }
      return;
    }
    if (k === 'a') {
      const a = v as unknown[], b = Array.isArray(was) ? was as Val[] : undefined;
      let eq = !!b && b.length === a.length;
      for (let i = 0; i < a.length; i++) { const x = this.val(a[i]); if (eq && !Object.is(x, b![i])) eq = false; }
      if (!eq) { const c = a.map(x => this.ref(x)); this.nodes.push({ i: id, a: c }); this.last.set(id, c); }
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
        this.last.set(id, flat);
      }
      return;
    }
    const o = v as Record<string, unknown>;
    let b = (was && !Array.isArray(was) && !ArrayBuffer.isView(was) ? was : undefined) as Record<string, Val> | undefined;
    const fresh = !b; if (!b) { b = {}; this.last.set(id, b); }
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
      const ctor = (v as { constructor?: { name?: string } }).constructor;
      this.nodes.push({ i: id, ...(fresh && ctor && ctor !== Object && ctor.name ? { c: ctor.name } : {}), o: set ?? {}, ...(del ? { d: del } : {}) });
    }
  }
  /** What changed since the last packet. */
  capture(): Packet {
    const w = this.w, o = w as unknown as Record<string, unknown>;
    this.done.clear(); this.nodes = [];
    const top: Record<string, Val> = {};
    for (const key of Object.keys(o)) {
      if (NEVER.has(key) || APPEND.has(key) || LOCAL.World.has(key)) continue;
      const v = o[key];
      if (BY_IDENTITY.has(key) && v === this.lastTop.get(key)) continue; // (unchanged: not walked)
      const s = this.val(v);
      if (!Object.is(s, this.lastTopVal.get(key))) { top[key] = s; this.lastTopVal.set(key, s); }
      this.lastTop.set(key, v);
    }
    const grown = (list: unknown[], last: unknown) => { const i = last == null ? -1 : list.lastIndexOf(last); return list.slice(i + 1); };
    const rec = { add: grown(w.rec, this.lastRec).map(x => this.val(x)), len: w.rec.length }; this.lastRec = w.rec[w.rec.length - 1] ?? null;
    const track = { add: w.track.slice(this.lastTrack).map(x => this.val(x)), len: w.track.length }; this.lastTrack = w.track.length;
    return { top, nodes: this.nodes, rec, track };
  }
}

/** The page's side: the mirror World, kept in step by each packet. */
export class SyncMirror {
  private objs = new Map<number, object>();
  private protos = new Map<string, object>();
  constructor(readonly w: World) {
    numberAll(w, (v, id) => {
      this.objs.set(id, v);
      const ctor = (v as { constructor?: { name?: string } }).constructor;
      if (ctor && ctor !== Object && ctor !== Array && ctor.name && !this.protos.has(ctor.name)) this.protos.set(ctor.name, Object.getPrototypeOf(v));
    });
  }
  private val(v: Val): unknown { return isObj(v) ? this.objs.get((v as { r: number }).r) : v; }
  /** Write a packet onto the mirror. */
  apply(p: Packet): void {
    // new objects first (the changed ones can refer to them), then every changed object's contents
    for (const n of p.nodes) {
      const cur = this.objs.get(n.i), want = 't' in n ? 't' : 'a' in n ? 'a' : 'm' in n ? 'm' : 's' in n ? 's' : 'o';
      if (cur && kind(cur) === want && (want !== 't' || (cur as ArrayBufferView).constructor === (n as { t: ArrayBufferView }).t.constructor)) continue;
      const proto = 'c' in n && n.c ? this.protos.get(n.c) : undefined;
      this.objs.set(n.i, want === 'a' ? [] : want === 'm' ? new Map() : want === 's' ? new Set() : want === 't' ? (n as { t: ArrayBufferView }).t : proto ? Object.create(proto) : {});
    }
    for (const n of p.nodes) {
      const cur = this.objs.get(n.i)!;
      if ('t' in n) { const t = cur as unknown as { length: number; set(a: ArrayBufferView): void }; if (t !== n.t as unknown) { if (t.length === (n.t as unknown as { length: number }).length) t.set(n.t); else this.objs.set(n.i, n.t); } }
      else if ('a' in n) { const a = cur as unknown[]; a.length = n.a.length; for (let i = 0; i < n.a.length; i++) a[i] = this.val(n.a[i]); }
      else if ('m' in n) { const m = cur as Map<unknown, unknown>; m.clear(); for (const [k, x] of n.m) m.set(this.val(k), this.val(x)); }
      else if ('s' in n) { const s = cur as Set<unknown>; s.clear(); for (const x of n.s) s.add(this.val(x)); }
      else { const o = cur as Record<string, unknown>; for (const [k, x] of Object.entries(n.o)) o[k] = this.val(x); if (n.d) for (const k of n.d) delete o[k]; }
    }
    const w = this.w as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(p.top)) w[k] = this.val(v);
    for (const [k, part] of [['rec', p.rec], ['track', p.track]] as const) {
      const list = w[k] as unknown[];
      for (const x of part.add) list.push(this.val(x));
      while (list.length > part.len) list.shift();
    }
  }
}
