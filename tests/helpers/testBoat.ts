import type { Boat } from '../../src/boat/boat';
import { moveBoat, tackTarget } from '../../src/boat/physics';
import { V, KT } from '../../src/core/math';
import { defaultControls } from '../../src/boat/controls';

/** A lone user-steered boat in open water, far from shore, with steady wind on the water and no current. */
export function testBoat(o: { heading: number; kt: number; windFrom?: number; windKt?: number }): Boat {
  const windFrom = o.windFrom ?? 0, windKt = o.windKt ?? 12;
  return {
    id: 0, isUser: true, name: 'Test', no: '', color: '#fff', hullColor: '#fff', sailColor: '#fff', build: { hull: 'fiberglass', spars: 'aluminium' },
    x: 0, y: 3000, h: o.heading, v: o.kt * KT, vx: 0, vy: 0, tack: 'S', tacking: false, lastTackT: -999,
    steer: 0, tiller: 0, turnTarget: null, turnDir: 0, luff: false, desired: o.heading,
    penalty: 0, penaltyTotal: 0, penaltyTurned: 0, penaltyDir: 0, started: true, ocs: false, leg: 0, finished: false, finishT: null,
    prevD: null, prevAng: null, prevPass: null, nearMin: 1e9, forced14: null, markTouch: null,
    cur: { x: 0, y: 0 }, ww: { from: windFrom, kt: windKt }, rel: 0, twa: 90, awa: 90, arel: 90, aws: 0, sheets: { main: 30, jib: 30 }, manualTrim: false, sheetCmd: { main: 0, jib: 0 }, trimAll: false, ctl: defaultControls(), ctlCmd: {}, shape: { main: { depth: 0.12, draft: 0.45, twist: 10 }, jib: null, eff: 1 }, trim: { main: { eff: 1, err: 0, flow: 'good', amount: 0 }, jib: { eff: 1, err: 0, flow: 'good', amount: 0 } }, awaSlow: 90, poleWant: false, pole: 'down', poleT: 0, poleTack: 'S', heel: 0, boom: 0, jib: 0, ai: null
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
