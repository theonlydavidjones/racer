import { bow, type Boat } from '../boat/boat';
import { coastDistance, timeToCover } from '../boat/dynamics';
import { beatAngle, polar } from '../boat/polar';
import { V, brg, cross, dist, dot, n360, segCross, sub, unit, wrap, type Vec } from '../core/math';
import { onLand } from '../geo/shore';
import { cpa } from '../rules';
import type { World } from '../sim/world';

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

/** One decision step for an AI boat: sets b.desired and b.luff. */
export function aiThink(w: World, b: Boat, dt: number): void {
  const ai = b.ai!, ww = b.ww, L = w.L, N = w.N, c = b.cur;
  const beat = beatAngle(ww.kt), csS = n360(ww.from - beat), csP = n360(ww.from + beat);
  let desired = b.h, luff = false, beating = false;
  if (b.penalty > 0) { b.desired = b.h + 60; b.luff = false; return; }
  if (b.finished) { b.desired = n360(ww.from + 90); b.luff = true; return; }
  const tl = -w.t; // time to the start signal
  if (w.t < 0) {
    const tgt = { x: w.center.x + L.x * (ai.f - 0.5) * w.lineLen - N.x * 2, y: w.center.y + L.y * (ai.f - 0.5) * w.lineLen - N.y * 2 };
    if (ai.mode === 'hold') {
      // reach back and forth below the line
      const H = { x: w.center.x - N.x * ai.depth, y: w.center.y - N.y * ai.depth }, s = ai.wp ? 1 : -1;
      const reach = Math.min(42, w.lineLen * 0.3);
      const wp = { x: H.x + L.x * reach * s, y: H.y + L.y * reach * s };
      if (dist(b, wp) < 12) ai.wp = ai.wp ? 0 : 1;
      desired = sailable(b, brg(wp.x - b.x, wp.y - b.y));
      luff = tl > 35 && Math.sin(w.t * 0.25 + b.id * 2) > 0.3;
      if (tl < dist(b, tgt) / (polar(ww.kt, 60) * 0.9) + 12 + ai.aggr) ai.mode = 'approach';
    }
    if (ai.mode === 'approach') {
      desired = sailable(b, brg(tgt.x - b.x, tgt.y - b.y));
      const d = w.lineD(bow(b)), uv = V(desired), twaD = Math.abs(wrap(ww.from - desired));
      // time to the line if we sheet in now, allowing for acceleration and current
      const tReach = timeToCover(-d, b.v, polar(ww.kt, twaD), uv.x * N.x + uv.y * N.y, c.x * N.x + c.y * N.y);
      if (tReach < tl - 2.5) luff = true; // early: burn time
      // where we'd end up at the gun if we eased the sails now: coasting plus (for current-aware boats) drift
      const coast = coastDistance(b.v, tl, ww.kt, b.twa) * (V(b.h).x * N.x + V(b.h).y * N.y);
      const drift = ai.aware ? (c.x * N.x + c.y * N.y) * tl : 0;
      if (d + drift + coast > -2 && tl > 3) { luff = true; if (d + drift + coast > 0) desired = sailable(b, brg(-N.x, -N.y)); }
    }
  } else {
    if (ai.mode === 'hold' || ai.mode === 'approach') ai.mode = 'race';
    let P: Vec;
    if (b.ocs) P = { x: w.center.x - N.x * 18 + L.x * (ai.f - 0.5) * w.lineLen, y: w.center.y - N.y * 18 + L.y * (ai.f - 0.5) * w.lineLen };
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
    if (r.kc === b && cp.t < 9 && cp.d < 12) {
      const away = sailable(b, brg(-dx, -dy));
      if (r.rule === '10') desired = sailable(b, b.tack === 'P' ? b.h + 32 : b.h - 32);
      else if (r.rule === '11') { desired = sailable(b, b.tack === 'P' ? b.h - 20 : b.h + 20); luff = true; }
      else { luff = true; desired = away; }
    } else if (r.kc === o && o.isUser && cp.t < 2.4 && cp.d < 4.5) {
      // right-of-way boat forced to swerve by the user
      desired = sailable(b, brg(-dx, -dy)); luff = true;
      if (Math.hypot(dx, dy) < 10) b.forced14 = o.id;
    }
  }
  b.desired = desired; b.luff = luff;
}
