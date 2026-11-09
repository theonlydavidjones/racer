import { KT, V, brg, clamp, wrap, n360 } from '../core/math';
import { onLand } from '../geo/shore';
import type { Emit } from '../sim/events';
import { bow, type Boat } from './boat';
import { polar } from './polar';

/** Advance one boat by dt: steering, tack detection, speed, drift, grounding, sail trim and heel.
 * Expects b.ww (wind on the water) and b.cur (current) to be set for this step. */
export function moveBoat(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  const ww = b.ww;
  // turn rate falls off at low speed: a Folkboat needs water over the rudder
  const maxRate = 30 * (0.35 + 0.65 * Math.min(1, b.v / 2.6));
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
  if (b.tacking && twa >= 40) b.tacking = false;
  let target = polar(ww.kt, twa);
  if (b.luff) target *= 0.12;
  if (b.penalty > 0) target *= 0.7;
  b.v += (target - b.v) * dt / (target > b.v ? 5.5 : 3.2);
  b.v = Math.max(0, b.v * (1 - 0.004 * Math.abs(rate) * dt)); // turning bleeds speed
  const u = V(b.h);
  b.vx = u.x * b.v + b.cur.x; b.vy = u.y * b.v + b.cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (onLand(bow(b))) {
    b.x -= u.x * 0.6; b.y -= u.y * 0.6; b.v = 0;
    if (b.isUser && t - groundToast.t > 4) { groundToast.t = t; emit({ type: 'toast', msg: 'Aground! Steer back out to open water.' }); }
  }
  // trim to the apparent wind: wind over the water minus the boat's own motion through it
  const wv = V(ww.from), ax = -wv.x * ww.kt * KT - u.x * b.v, ay = -wv.y * ww.kt * KT - u.y * b.v;
  const arel = wrap(brg(-ax, -ay) - b.h), awa = Math.abs(arel);
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

/** Heading a user tack/gybe aims for: the matching course on the other side of the wind. */
export function tackTarget(b: Boat): { dir: number; target: number } {
  const rel = b.rel, twa = b.twa, from = b.ww.from;
  if (twa < 100) return { dir: rel >= 0 ? 1 : -1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.max(42, Math.min(twa, 60))) };
  return { dir: rel >= 0 ? -1 : 1, target: n360(from + rel) };
}
