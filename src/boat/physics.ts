import { KT, V, brg, clamp, wrap, n360, D2R } from '../core/math';
import { onLand } from '../geo/shore';
import type { Emit } from '../sim/events';
import { bow, type Boat } from './boat';
import { HANDLING, airDrag, flogAmount, maxTurnRate, surgeAccel } from './dynamics';
import { NO_GO, beatAngle, polar } from './polar';

export function moveBoat(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  const ww = b.ww;
  // turn rate falls off at low speed: a Folkboat needs water flowing over the rudder
  const maxRate = maxTurnRate(b.v);
  let rate: number;
  if (b.isUser) {
    if (b.turnTarget != null && b.steer === 0) {
      const err = wrap(b.turnTarget - b.h);
      rate = b.turnDir * maxRate;
      if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) { rate = 0; b.h = b.turnTarget; b.turnTarget = null; }
    } else { rate = b.steer * maxRate; if (b.steer !== 0) b.turnTarget = null; }
  } else rate = b.penalty > 0 ? maxRate : clamp(wrap(b.desired - b.h) * 1.6, -maxRate, maxRate);
  const dh = rate * dt;
  b.h = n360(b.h + dh);
  if (b.penalty > 0) {
    b.penalty -= Math.abs(dh);
    if (b.penalty <= 0) { b.penalty = 0; if (b.isUser) emit({ type: 'toast', msg: 'Penalty turns done. Back to racing.' }); }
  }
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel);
  b.rel = rel; b.twa = twa;
  let tk: 'S' | 'P' = rel >= 0 ? 'S' : 'P';
  if (twa > 176) tk = b.tack; // dead downwind: keep the tack you had until the boom crosses
  if (tk !== b.tack) { if (twa < 90) b.tacking = true; b.tack = tk; b.lastTackT = t; }
  if (b.tacking && twa >= Math.min(40, beatAngle(ww.kt) - 3)) b.tacking = false; // close-hauled: Rule 13 ends
  let target = polar(ww.kt, twa);
  if (b.luff) target *= HANDLING.luffFactor;
  if (b.penalty > 0) target *= 0.7;
  const beat = beatAngle(ww.kt);
  const ap = apparent(ww.from, ww.kt, b.h, b.v);
  const a = surgeAccel(b.v, target, airDrag(ap.aws, ap.awa, flogAmount(twa, beat, NO_GO, b.luff)));
  b.v = Math.max(0, b.v + a * dt);
  b.v = Math.max(0, b.v * (1 - HANDLING.turnDrag * Math.abs(rate) * D2R * dt)); // turning bleeds speed
  const u = V(b.h);
  b.vx = u.x * b.v + b.cur.x; b.vy = u.y * b.v + b.cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (onLand(bow(b))) {
    b.x -= u.x * 0.6; b.y -= u.y * 0.6; b.v = 0;
    if (b.isUser && t - groundToast.t > 4) { groundToast.t = t; emit({ type: 'toast', msg: 'Aground! Steer back out to open water.' }); }
  }
  // trim to the apparent wind: wind over the water minus the boat's own motion through it
  const { arel, awa } = apparent(ww.from, ww.kt, b.h, b.v);
  b.awa = awa;
  const side = arel >= 0 ? -1 : 1; // sails go to leeward: wind from starboard puts them to port
  const boomT = clamp((awa - 18) * 0.55, 4, 85);
  const jibT = clamp((awa - 18) * 0.5 + 7, 8, 68);
  const k = Math.min(1, dt * 3);
  b.boom += (side * boomT - b.boom) * k;
  b.jib += (side * jibT - b.jib) * k;
  const heelT = (b.luff ? 0.25 : 1) * Math.min(24, ww.kt * 1.25) * (twa < 35 ? 0.2 : twa < 100 ? 1 : 0.45) * (rel >= 0 ? 1 : -1);
  b.heel += (heelT - b.heel) * Math.min(1, dt * 1.5);
}

/** Apparent wind: wind over the water minus the boat's motion through it. aws in m/s, arel signed (+ from starboard). */
export function apparent(from: number, windKt: number, h: number, v: number): { aws: number; arel: number; awa: number } {
  const wv = V(from), u = V(h), ax = -wv.x * windKt * KT - u.x * v, ay = -wv.y * windKt * KT - u.y * v;
  const arel = wrap(brg(-ax, -ay) - h);
  return { aws: Math.hypot(ax, ay), arel, awa: Math.abs(arel) };
}

/** Heading a user tack/gybe aims for: the matching course on the other side of the wind. */
export function tackTarget(b: Boat): { dir: number; target: number } {
  const rel = b.rel, twa = b.twa, from = b.ww.from;
  // upwind: tack to the same angle on the other side, but at least close-hauled; downwind: gybe to the mirror angle
  if (twa < 100) return { dir: rel >= 0 ? 1 : -1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.max(beatAngle(b.ww.kt), Math.min(twa, 60))) };
  return { dir: rel >= 0 ? -1 : 1, target: n360(from + rel) };
}
