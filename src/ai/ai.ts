import { bow, type Boat } from '../boat/boat';
import { coastDistance, maxTurnRate, timeToCover } from '../boat/dynamics';
import { beatAngle, polar } from '../boat/polar';
import { V, brg, clamp, cross, dist, dot, n360, segCross, sub, unit, wrap, type Vec } from '../core/math';
import { onLand } from '../geo/shore';
import { cpa } from '../rules';
import type { World } from '../sim/world';

/** A boat owing a penalty first gets this far (m) from other boats before turning. */
const PENALTY_CLEAR = 25;

/** Close-hauled course on the current tack, or the requested heading if it is sailable. */
export function sailable(b: Boat, desired: number): number {
  const from = b.ww.from, rel = wrap(from - desired), ch = beatAngle(b.ww.kt) + 1;
  if (Math.abs(rel) >= ch) return n360(desired);
  if (b.tack === 'S' && rel < -25) return n360(from + ch);
  if (b.tack === 'P' && rel > 25) return n360(from - ch);
  return b.tack === 'S' ? n360(from - ch) : n360(from + ch);
}

function blocked(w: World, b: Boat, h: number, d: number): boolean {
  const u = V(h), q = { x: b.x + u.x * d, y: b.y + u.y * d };
  if (onLand(q)) return true;
  if (w.obstructed(b) && segCross(b, q, w.pin, w.committee)) return true;
  return false;
}

/** Where the AI steers for its next mark: a little wide of rounding marks, well clear of pass marks. */
export function aimPoint(w: World, b: Boat): Vec {
  const m = w.nextMark(b);
  if (!m) {
    const f = b.ai ? b.ai.f : 0.5;
    return { x: w.center.x + w.L.x * (f - 0.5) * w.lineLen * 0.6, y: w.center.y + w.L.y * (f - 0.5) * w.lineLen * 0.6 };
  }
  const M = m.p;
  if (m.type === 'pass') return { x: M.x + m.sv.x * 24, y: M.y + m.sv.y * 24 };
  const d = dist(b, M);
  if (d > 35) {
    const dx = (M.x - b.x) / d, dy = (M.y - b.y) / d;
    const s = m.side === 's' ? { x: -dy, y: dx } : { x: dy, y: -dx };
    return { x: M.x + s.x * 10, y: M.y + s.y * 10 };
  }
  return { x: M.x + m.r.x * 12, y: M.y + m.r.y * 12 };
}

/**
 * The fastest way to the start line from here: of close-hauled or a close reach on either tack, the
 * heading that gets to the line soonest, crossing it between its ends, counting a tack as lost time.
 * Returns the heading and its component toward the line.
 */
export function bestApproach(w: World, b: Boat): { h: number; along: number } {
  const ww = b.ww, N = w.N, beat = beatAngle(ww.kt), d = w.lineD(bow(b)), a = w.lineA(b), half = w.lineLen / 2 - 8;
  let best = { h: b.h, along: 0 }, bestT = Infinity;
  for (const tack of ['S', 'P'] as const) for (const twa of [beat + 1, 55, 70]) {
    const h = n360(tack === 'S' ? ww.from - twa : ww.from + twa), u = V(h), uN = u.x * N.x + u.y * N.y;
    if (uN < 0.2) continue;
    const vmg = polar(ww.kt, twa) * uN + (b.cur.x * N.x + b.cur.y * N.y);
    if (vmg <= 0.1) continue;
    const cross = a + (u.x * w.L.x + u.y * w.L.y) / uN * Math.max(0, -d); // where along the line we'd cross
    let t = Math.max(0, -d) / vmg + (tack !== b.tack ? 8 : 0);
    if (Math.abs(cross) > half) t += 30 + (Math.abs(cross) - half) / 2; // would miss the line: strongly discouraged
    if (t < bestT) { bestT = t; best = { h, along: uN }; }
  }
  return best;
}

/** One decision step for an AI boat: sets b.desired and b.luff. */
export function aiThink(w: World, b: Boat, dt: number): void {
  const ai = b.ai!, ww = b.ww, L = w.L, N = w.N, c = b.cur;
  const beat = beatAngle(ww.kt), csS = n360(ww.from - beat), csP = n360(ww.from + beat);
  let desired = b.h, luff = false, beating = false;
  if (b.penalty > 0) {
    // Take the penalty in clear water: first sail away from nearby boats, then spin.
    let near: Boat | null = null, nd = PENALTY_CLEAR;
    for (const o of w.boats) if (o !== b) { const d = dist(o, b); if (d < nd) { nd = d; near = o; } }
    ai.clearing = !!near && b.penalty >= 719;
    b.desired = near && ai.clearing ? sailable(b, brg(b.x - near.x, b.y - near.y)) : b.h + 60;
    b.luff = false; return;
  }
  ai.clearing = false;
  if (b.finished) { b.desired = n360(ww.from + 90); b.luff = true; return; }
  const tl = -w.t; // time to the start signal
  const refresh = (w.steps + b.id) % 6 === 0; // heavy predictions 10× a second
  if (w.t < 0) {
    if (ai.mode === 'hold') {
      // reach back and forth below the line, each boat below her own part of it
      const off = (ai.f - 0.5) * w.lineLen * 0.7;
      const H = { x: w.center.x - N.x * ai.depth + L.x * off, y: w.center.y - N.y * ai.depth + L.y * off }, s = ai.wp ? 1 : -1;
      const reach = Math.min(40, w.lineLen * 0.25);
      const wp = { x: H.x + L.x * reach * s, y: H.y + L.y * reach * s };
      if (dist(b, wp) < 12) ai.wp = ai.wp ? 0 : 1;
      desired = sailable(b, brg(wp.x - b.x, wp.y - b.y));
      // dawdle, but keep enough way on to steer (about 2 kt)
      luff = tl > 35 && Math.sin(w.t * 0.25 + b.id * 2) > 0.3 && b.v > 1.0;
      // Time to get to the line from here: turn onto the approach (slowly, if we're slow), then sail
      // there accelerating, with the current. Leave when that plus a margin is all the time left.
      if (refresh || Number.isNaN(ai.plan.leave)) { // NaN: not worked out yet
        const app = bestApproach(w, b), d = w.lineD(bow(b));
        const turn = Math.abs(wrap(app.h - b.h)) / Math.max(4, maxTurnRate(Math.max(b.v, 1.2)) * 0.7);
        ai.plan.leave = turn + timeToCover(-d, b.v, polar(ww.kt, Math.abs(wrap(ww.from - app.h))), app.along, c.x * N.x + c.y * N.y);
      }
      if (tl < ai.plan.leave + 8 + ai.aggr) ai.mode = 'approach';
    }
    if (ai.mode === 'approach') {
      const app = bestApproach(w, b), goH = app.h;
      const d = w.lineD(bow(b)), twaD = Math.abs(wrap(ww.from - goH));
      if (refresh) {
        // Time to the line if we go now: turn onto the approach, then accelerate there, with the current.
        const turn = Math.abs(wrap(goH - b.h)) / Math.max(4, maxTurnRate(Math.max(b.v, 1)) * 0.7);
        ai.plan.tReach = turn + timeToCover(-d, b.v, polar(ww.kt, twaD), app.along, c.x * N.x + c.y * N.y);
        // how far toward the line we'd coast if we eased the sails now
        ai.plan.coast = coastDistance(b.v, tl, ww.kt, b.twa) * (V(b.h).x * N.x + V(b.h).y * N.y);
      }
      desired = goH;
      // aim to hit the line 1–3 s after the gun at full speed (the bolder the boat, the closer)
      if (ai.plan.tReach < tl + 3 - ai.aggr * 0.33) {
        // Early: burn time. Where would we be at the gun if we eased the sails now? Coasting plus drift
        // with the current (current-aware boats allow for all of it; the others underestimate it).
        const drift = (c.x * N.x + c.y * N.y) * tl * (ai.aware ? 1 : 0.6), atGun = d + drift + Math.max(0, ai.plan.coast); // coasting away from the line is no safety margin
        // with hysteresis, so she commits to a plan instead of dithering between two
        if (atGun > -3 && drift > 2) ai.plan.back = true;
        else if (atGun < -12 || drift <= 2) ai.plan.back = false;
        if (ai.plan.back) desired = sailable(b, brg(-N.x, -N.y)); // being set onto the line: sail away with way on, come back later
        else { luff = true; if (d + ai.plan.coast > 0) desired = sailable(b, brg(-N.x, -N.y)); }
      } else ai.plan.back = false;
    }
  } else {
    if (ai.mode === 'hold' || ai.mode === 'approach') ai.mode = 'race';
    let P: Vec;
    const along = (clamp(ai.f, 0.15, 0.85) - 0.5) * w.lineLen;
    if (b.ocs) P = { x: w.center.x - N.x * 18 + L.x * along, y: w.center.y - N.y * 18 + L.y * along };
    else if (!b.started) P = { x: w.center.x + N.x * 10 + L.x * along, y: w.center.y + N.y * 10 + L.y * along }; // haven't started yet: cross the line between its ends
    else P = aimPoint(w, b);
    const bP = brg(P.x - b.x, P.y - b.y);
    if (Math.abs(wrap(ww.from - bP)) < 44 && !b.ocs) {
      beating = true;
      desired = b.tack === 'S' ? csS : csP;
      if (w.t - b.lastTackT > 9) {
        const d = sub(P, b), vs = polar(ww.kt, beat);
        // can we fetch P on tack tk, allowing for current?
        const fetch = (tk: 'S' | 'P') => {
          const uu = V(tk === 'S' ? csS : csP), g = unit({ x: uu.x * vs + c.x, y: uu.y * vs + c.y });
          if (dot(g, d) <= 0) return false;
          const lat = cross(g, d);
          return tk === 'S' ? lat > 3 : lat < -3;
        };
        const other = b.tack === 'S' ? 'P' : 'S', fCur = fetch(b.tack), fOther = fetch(other);
        let doTack = false;
        if (fOther && !fCur) doTack = true; // on the layline
        else if (!fCur) {
          const dev = wrap(w.wind.from - w.avgFrom), headed = b.tack === 'S' ? dev < -3.5 : dev > 3.5;
          const u = V(w.C.base), sv = { x: u.y, y: -u.x };
          const lat = (b.x - P.x) * sv.x + (b.y - P.y) * sv.y;
          const width = ai.width * Math.min(1, Math.hypot(d.x, d.y) / 500) + 25;
          if (headed && w.rng() < dt * 0.35) doTack = true; // tack on headers
          else if (Math.abs(lat) > width && dot(V(b.h), sv) * lat > 0) doTack = true; // don't sail too far off the rhumb line
        }
        if (doTack) desired = b.tack === 'S' ? csP : csS;
      }
    } else desired = sailable(b, bP);
  }
  // keep off the shore (and off the line mid-race)
  if (blocked(w, b, desired, 45)) {
    if (beating && w.t - b.lastTackT > 4) desired = b.tack === 'S' ? csP : csS;
    else for (const k of [25, -25, 45, -45, 70, -70, 100, -100]) { const cand = sailable(b, desired + k); if (!blocked(w, b, cand, 45)) { desired = cand; break; } }
  }
  // collision avoidance under the rules
  for (const o of w.boats) {
    if (o === b) continue;
    const dx = o.x - b.x, dy = o.y - b.y;
    if (dx * dx + dy * dy > 3600) continue;
    const r = w.rights(b, o), cp = cpa(b, o);
    // keep clear early: slow, heavy boats need time to respond
    if (r.kc === b && cp.t < 12 && cp.d < 14) {
      const away = sailable(b, brg(-dx, -dy));
      if (r.rule === '10') desired = sailable(b, b.tack === 'P' ? b.h + 32 : b.h - 32);
      else if (r.rule === '11') { desired = sailable(b, b.tack === 'P' ? b.h - 20 : b.h + 20); luff = true; }
      else { luff = true; desired = away; }
    } else if (r.kc === o && cp.t < 2.4 && cp.d < 4.5) {
      // Rule 14: even a right-of-way boat must avoid contact if she reasonably can
      desired = sailable(b, brg(-dx, -dy)); luff = true;
      if (o.isUser && Math.hypot(dx, dy) < 10) b.forced14 = o.id; // the user made her swerve: that's a foul
    }
  }
  b.desired = desired; b.luff = luff;
  // whisker pole: wing-on-wing when running deep, stowed before the next rounding mark
  const nm = w.nextMark(b), nearMark = !!nm && nm.type === 'round' && dist(b, nm.p) < 45;
  if (w.t < 0 || nearMark || b.twa < 146) b.poleWant = false;
  else if (b.twa > 156) b.poleWant = true;
}
