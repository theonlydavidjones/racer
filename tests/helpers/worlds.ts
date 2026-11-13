// Comparing two Worlds whole (tests/sync.test.ts, tests/worker.test.ts): the real one and the page's mirror.
import type { World } from '../../src/sim/world';
import { LOCAL_WORLD_KEYS, localOf } from '../../src/sim/sync';

const NEVER = new Set(['rng', 'motorRng', 'emit', 'keepsClearOf', 'obstacle', 'events']);

/** The first place two Worlds differ, walking both together (objects must correspond one to one), or null. */
export function firstDifference(A: World, M: World): string | null {
  const pair = new Map<object, object>();
  const go = (a: unknown, b: unknown, path: string): string | null => {
    if (typeof a === 'function') return typeof b === 'function' ? null : `${path}: a function on the real side, ${typeof b} on the mirror`; // (each side has its own)
    if (a === null || typeof a !== 'object') return Object.is(a, b) ? null : `${path}: ${String(a)} ≠ ${String(b)}`;
    if (b === null || typeof b !== 'object') return `${path}: an object ≠ ${String(b)}`;
    const p = pair.get(a); if (p) return p === b ? null : `${path}: not the same object as elsewhere`;
    pair.set(a, b);
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b) && a.constructor.name !== b.constructor.name) return `${path}: ${a.constructor.name} ≠ ${b.constructor.name}`;
    if (ArrayBuffer.isView(a)) { const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>; if (x.length !== y.length) return `${path}: length`; for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) return `${path}[${i}]`; return null; }
    if (a instanceof Map) { const e = [...a], f = [...(b as Map<unknown, unknown>)]; if (e.length !== f.length) return `${path}: size`; for (let i = 0; i < e.length; i++) { const d = go(e[i][0], f[i][0], `${path}<key ${i}>`) ?? go(e[i][1], f[i][1], `${path}<${i}>`); if (d) return d; } return null; }
    if (a instanceof Set) { const e = [...a], f = [...(b as Set<unknown>)]; if (e.length !== f.length) return `${path}: size`; for (let i = 0; i < e.length; i++) { const d = go(e[i], f[i], `${path}<${i}>`); if (d) return d; } return null; }
    // (each side's own memos aside: sim/sync.ts LOCAL)
    const mine = (o: object, k: string) => typeof (o as Record<string, unknown>)[k] === 'function' || localOf(o, k);
    const ka = Object.keys(a).filter(k => !mine(a, k)), kb = Object.keys(b).filter(k => !mine(b, k));
    if (ka.length !== kb.length) return `${path}: keys ${ka.filter(k => !kb.includes(k)).concat(kb.filter(k => !ka.includes(k))).join(',')}`;
    for (const k of ka) { const d = go((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`); if (d) return d; }
    return null;
  };
  for (const k of Object.keys(A)) { if (NEVER.has(k) || LOCAL_WORLD_KEYS.has(k)) continue; const d = go((A as unknown as Record<string, unknown>)[k], (M as unknown as Record<string, unknown>)[k], k); if (d) return d; }
  return null;
}

