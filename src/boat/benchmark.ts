import { FLAT_SEA } from '../environment/sea';
import { KT, wrap } from '../core/math';
import type { Boat } from './boat';
import { moveBoat } from './physics';
import { FULL_RUDDER } from './balance';
import { defaultControls } from './controls';
import { beatAngle, polar } from './polar';
import type { BoatSpec } from './spec';
import { condition } from './condition';

/**
 * Sail a lone boat in steady wind on flat water with a helmsman holding her straight, and measure her settled speed.
 * Used by the Boat panel to show what your boat's condition costs, measured by the same physics you sail with.
 */
/** (She starts near her polar speed, so she settles quickly.) */
export function benchBoat(heading: number, windKt: number, spec?: BoatSpec, month = 9): Boat {
  return {
    id: 0, isUser: true, name: 'Bench', no: '', color: '#fff', hullColor: '#fff', sailColor: '#fff', build: { hull: 'fiberglass', spars: 'aluminium' },
    sea: FLAT_SEA, x: 0, y: 3000, h: heading, v: polar(windKt, heading) * 0.95, vx: 0, vy: 0, tack: 'S', tacking: false, lastTackT: -999,
    steer: 0, tiller: 0, turnTarget: null, turnDir: 0, luff: false, desired: heading,
    penalty: 0, penaltyTotal: 0, penaltyTurned: 0, penaltyDir: 0, started: true, ocs: false, leg: 0, finished: false, finishT: null,
    prevD: null, prevAng: null, prevPass: null, nearMin: 1e9, forced14: null, markTouch: null,
    cur: { x: 0, y: 0 }, ww: { from: 0, kt: windKt }, rel: 0, twa: 90, awa: 90, arel: 90, aws: 0, sheets: { main: 30, jib: 30 }, manualTrim: false, sheetCmd: { main: 0, jib: 0 }, trimAll: false,
    ctl: defaultControls(), ctlCmd: {}, shape: { main: { depth: 0.12, draft: 0.45, twist: 10 }, jib: null, eff: 1 },
    trim: { main: { eff: 1, err: 0, flow: 'good', amount: 0 }, jib: { eff: 1, err: 0, flow: 'good', amount: 0 } }, awaSlow: 90, poleWant: false, pole: 'down', poleT: 0, poleTack: 'S',
    heel: 0, boom: 0, jib: 0, ai: null, ...(spec ? { spec, cond: condition(spec, month), ...(spec.perf.tune ? { tune: spec.perf.tune } : {}) } : {})
  };
}

/** Settled speed (kt), heel and helm at a true wind angle, after `seconds` (averaged over the last third). */
export function benchSpeed(windKt: number, twa: number, spec?: BoatSpec, month = 9, seconds = 40): { kt: number; heel: number; helm: number; arm: number; depower: number } {
  const b = benchBoat(twa, windKt, spec, month), dt = 1 / 60, g = { t: -99 }, noop = () => {};
  let v = 0, heel = 0, helm = 0, n = 0;
  for (let i = 0; i < seconds * 60; i++) {
    const toWind = wrap(b.ww.from - b.h) >= 0 ? 1 : -1;
    b.tiller = Math.max(-0.4, Math.min(0.4, (b.helmNeed ?? 0) / FULL_RUDDER)) * toWind; // (as much as the boat's own turning, physics.ts balRate)
    moveBoat(b, dt, i * dt, noop, g);
    if (i > seconds * 40) { v += b.v; heel += b.heelMag ?? 0; helm += b.helmNeed ?? 0; n++; }
  }
  return { kt: v / n / KT, heel: heel / n, helm: helm / n, arm: b.crew?.arm ?? 0, depower: b.depower ?? 0 };
}

/** The angles the panel measures at: close-hauled, a beam reach, a broad run. */
export const benchAngles = (windKt: number) => ({ up: beatAngle(windKt) + 2, reach: 90, down: 150 });
