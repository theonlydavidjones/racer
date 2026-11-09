import type { Boat } from '../../src/boat/boat';
import { moveBoat, tackTarget } from '../../src/boat/physics';
import { V, KT } from '../../src/core/math';

/** A lone user-steered boat in open water, far from shore, with steady wind on the water and no current. */
export function testBoat(o: { heading: number; kt: number; windFrom?: number; windKt?: number }): Boat {
  const windFrom = o.windFrom ?? 0, windKt = o.windKt ?? 12;
  return {
    id: 0, isUser: true, name: 'Test', no: '', color: '#fff', hullColor: '#fff', sailColor: '#fff',
    x: 0, y: 3000, h: o.heading, v: o.kt * KT, vx: 0, vy: 0, tack: 'S', tacking: false, lastTackT: -999,
    steer: 0, turnTarget: null, turnDir: 0, luff: false, desired: o.heading,
    penalty: 0, started: true, ocs: false, leg: 0, finished: false, finishT: null,
    prevD: null, prevAng: null, prevPass: null, nearMin: 1e9, forced14: null,
    cur: { x: 0, y: 0 }, ww: { from: windFrom, kt: windKt }, rel: 0, twa: 90, awa: 90, heel: 0, boom: 0, jib: 0, ai: null
  };
}

const DT = 1 / 60;
const noop = () => {};
/** Sail for `seconds`, calling `each(t)` every step. Returns elapsed time. */
export function sail(b: Boat, seconds: number, each?: (t: number) => boolean | void): number {
  const g = { t: -99 };
  for (let i = 0; i < seconds * 60; i++) {
    const t = i * DT;
    if (each && each(t) === true) return t;
    moveBoat(b, DT, t, noop, g);
  }
  return seconds;
}
export const kt = (b: Boat) => b.v / KT;
export const upwindProgress = (b: Boat, windFrom = 0) => { const n = V(windFrom); return b.x * n.x + b.y * n.y; };
export function startTack(b: Boat) { const t = tackTarget(b); b.turnDir = t.dir; b.turnTarget = t.target; }
