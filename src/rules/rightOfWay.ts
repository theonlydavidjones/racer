import { V, ZONE, brg, dist, wrap } from '../core/math';
import { clearAstern } from './geometry';
import type { PairRecord, RulesBoat, RulesContext, Verdict } from './types';

/** Who must keep clear, and under which rule (RRS 2025–2028). Rules are checked in order of precedence:
 * 21 (returning to start, taking a penalty: Section A doesn't apply), 20.2(c) (replied "You tack"),
 * 18.3 (tacked in the zone), 18.2(a) mark-room, 13 (tacking), 10, 12, 11. */
export function rightOfWay<B extends RulesBoat>(A: B, B_: B, ctx: RulesContext, rec?: PairRecord | null): Verdict<B> {
  const B = B_;
  const after = ctx.t > 0;
  if (after && A.ocs && !B.ocs) return { kc: A, rule: '21.1' };
  if (after && B.ocs && !A.ocs) return { kc: B, rule: '21.1' };
  if (A.penalty > 0 && !(B.penalty > 0)) return { kc: A, rule: '21.2' };
  if (B.penalty > 0 && !(A.penalty > 0)) return { kc: B, rule: '21.2' };
  // Rule 20.2(c): she replied "You tack", so she gives the hailing boat room to tack and avoid her.
  const h = rec?.hail;
  if (h && h.kind === 'room' && h.replyAt != null) return h.by === A.id ? { kc: B, rule: '20' } : { kc: A, rule: '20' };
  // Rule 18.3: she tacked onto starboard in the zone; she must not make the boat fetching the mark sail above
  // close-hauled to avoid her, and gives it mark-room if it gets inside her. Only bites while they're overlapped.
  const r3 = rec?.r183;
  if (r3 && A.leg === r3.idx && B.leg === r3.idx) {
    const mk = ctx.marks[r3.idx], z = ZONE * 1.4;
    const T = r3.tacker === A.id ? A : B, O = T === A ? B : A;
    if (r3.binds && dist(A, mk.p) < z && dist(B, mk.p) < z && T.tack === 'S' && !T.tacking && O.tack === 'S' && !O.tacking && !clearAstern(A, B) && !clearAstern(B, A)) return { kc: T, rule: '18.3' };
  }
  // Rule 18.2(a): fixed when the first boat reached the zone; ends (18.2(b)) once the entitled boat passes
  // head to wind or leaves the zone. Rule 18 doesn't apply on opposite tacks on a beat (18.1(a)(1)).
  if (rec && rec.mark && !rec.mark.ended && A.leg === rec.mark.idx && B.leg === rec.mark.idx) {
    const mk = ctx.marks[rec.mark.idx], m = rec.mark;
    if (A.tack === B.tack || !mk.beat) {
      if (m.overlapped) return { kc: m.inside === A.id ? B : A, rule: '18.2(a)', mr: m };
      return { kc: m.ahead === A.id ? B : A, rule: '18.2(a)', mr: m };
    }
  }
  if (A.tacking && !B.tacking) return { kc: A, rule: '13' };
  if (B.tacking && !A.tacking) return { kc: B, rule: '13' };
  if (A.tacking && B.tacking) {
    // Both tacking: the one on the other's port side, or the one astern, keeps clear.
    if (clearAstern(A, B)) return { kc: A, rule: '13' };
    if (clearAstern(B, A)) return { kc: B, rule: '13' };
    return wrap(brg(A.x - B.x, A.y - B.y) - B.h) < 0 ? { kc: A, rule: '13' } : { kc: B, rule: '13' };
  }
  if (A.tack !== B.tack) return A.tack === 'P' ? { kc: A, rule: '10' } : { kc: B, rule: '10' };
  if (clearAstern(A, B)) return { kc: A, rule: '12' };
  if (clearAstern(B, A)) return { kc: B, rule: '12' };
  // Overlapped on the same tack: the windward boat is the one on the other's windward side (Definitions,
  // Leeward and Windward). Sides are measured across the boats' mean heading: on starboard tack the wind
  // comes over the starboard side, so the boat farther to starboard is windward; on port, farther to port.
  const ua = V(A.h), ub = V(B.h);
  let mx = ua.x + ub.x, my = ua.y + ub.y;
  if (Math.hypot(mx, my) < 0.2) { const n = V(ctx.windFrom); mx = n.y; my = -n.x; } // nearly opposite headings: fall back to the wind
  const stbd = { x: my, y: -mx }, side = A.tack === 'S' ? 1 : -1;
  const aOut = ((A.x - B.x) * stbd.x + (A.y - B.y) * stbd.y) * side;
  return aOut > 0 ? { kc: A, rule: '11' } : { kc: B, rule: '11' };
}
