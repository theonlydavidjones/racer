import { V, ZONE, dist } from '../core/math';
import { clearAstern } from './geometry';
import type { PairRecord, RulesBoat, RulesContext, Verdict } from './types';

/** Who must keep clear, and under which rule. Rules are checked in order of precedence:
 * 22 (over early, taking a penalty), 18.2(b) mark-room, 13 (tacking), 10, 12, 11. */
export function rightOfWay<B extends RulesBoat>(A: B, B_: B, ctx: RulesContext, rec?: PairRecord | null): Verdict<B> {
  const B = B_;
  const after = ctx.t > 0;
  if (after && A.ocs && !B.ocs) return { kc: A, rule: '22.1' };
  if (after && B.ocs && !A.ocs) return { kc: B, rule: '22.1' };
  if (A.penalty > 0 && !(B.penalty > 0)) return { kc: A, rule: '22.2' };
  if (B.penalty > 0 && !(A.penalty > 0)) return { kc: B, rule: '22.2' };
  if (rec && rec.mark && A.leg === rec.mark.idx && B.leg === rec.mark.idx) {
    const mk = ctx.marks[rec.mark.idx], z = ZONE * 1.4;
    // Mark-room is only modelled for same-tack or downwind approaches.
    if ((A.tack === B.tack || !mk.beat) && dist(A, mk.p) < z && dist(B, mk.p) < z) {
      const m = rec.mark;
      if (m.overlapped) return { kc: m.inside === A.id ? B : A, rule: '18.2(b)', mr: m };
      return { kc: m.ahead === A.id ? B : A, rule: '18.2(b)', mr: m };
    }
  }
  if (A.tacking && !B.tacking) return { kc: A, rule: '13' };
  if (B.tacking && !A.tacking) return { kc: B, rule: '13' };
  if (A.tack !== B.tack) return A.tack === 'P' ? { kc: A, rule: '10' } : { kc: B, rule: '10' };
  if (clearAstern(A, B)) return { kc: A, rule: '12' };
  if (clearAstern(B, A)) return { kc: B, rule: '12' };
  // Overlapped on the same tack: the boat farther upwind is windward.
  const n = V(ctx.windFrom);
  return (A.x * n.x + A.y * n.y) > (B.x * n.x + B.y * n.y) ? { kc: A, rule: '11' } : { kc: B, rule: '11' };
}
