import { V, ZONE, brg, markDist, wrap } from '../core/math';
import { clearAstern } from './geometry';
import type { PairRecord, RulesBoat, RulesContext, Verdict } from './types';

/** Who must keep clear, and under which rule (RRS 2025–2028). Rules are checked in order of precedence:
 * 21 (returning to start, taking a penalty, backing a sail: Section A doesn't apply), 20.2(c) (replied "You tack"),
 * 18.3 (tacked in the zone), 18.2(a) and 18.2(c) mark-room (not while a hail for room to tack is under way: 20.2(e)), 13 (tacking), 10, 12, 11.
 * (Rule 19, room at an obstruction, is settled when there's an incident: see assessPair.) */
/** Rule 21.1: is she returning to start (the World's judgement, or, if it hasn't made one, her being over early)? */
export const returning = (b: RulesBoat): boolean => b.returning ?? b.ocs;

export function rightOfWay<B extends RulesBoat>(A: B, B_: B, ctx: RulesContext, rec?: PairRecord | null): Verdict<B> {
  const B = B_;
  const after = ctx.t > 0;
  // Rule 21.1: a boat sailing back toward the pre-start side after her starting signal, to start or to comply with rule
  // 30.1, keeps clear of one not doing so, until her hull is completely on the pre-start side. (Over early but sailing on
  // away from the line, she keeps her rights until she turns back: the World's `returning`.)
  // Rule 22: "If possible, a boat shall avoid a boat that is capsized or has not regained control after capsizing, is
  // anchored or aground, or is trying to help a person or vessel in danger." Between the two, Section A doesn't apply
  // (Part 2, Section D preamble): whatever their tacks, the boat under way avoids her. (Not modelled: capsizing and
  // rescuing, which the sim doesn't have; "if possible", beyond what the incident tests already ask; and rule 19 room
  // for two boats passing her, an obstruction to them by the definition's last sentence)
  const held = (b: RulesBoat) => !!(b.anchored || b.aground);
  if (held(A) && !held(B)) return { kc: B, rule: '22' };
  if (held(B) && !held(A)) return { kc: A, rule: '22' };
  const ret = returning(A), retB = returning(B);
  if (after && ret && !retB) return { kc: A, rule: '21.1' };
  if (after && retB && !ret) return { kc: B, rule: '21.1' };
  if (A.penalty > 0 && !(B.penalty > 0)) return { kc: A, rule: '21.2' };
  if (B.penalty > 0 && !(A.penalty > 0)) return { kc: B, rule: '21.2' };
  if (A.backing && !B.backing) return { kc: A, rule: '21.3' };
  if (B.backing && !A.backing) return { kc: B, rule: '21.3' };
  // (Rule 20.2(c), "You tack": the boat that replied owes the hailing boat room to tack and avoid her, but right of way
  // doesn't pass with it: the hailing boat keeps clear under 13 while tacking and 10 after, as WS Case 101 has it. The
  // room is judged at an incident, src/rules/pairs.ts.)
  // Rule 18.3: she tacked onto starboard in the zone. 18.2 is off between them (pairs.ts clears the mark-room record), and
  // 18.3 adds two duties, not right of way: (a) she shall not cause the boat fetching the mark to sail above close-hauled
  // to avoid contact, and (b) she shall give it mark-room if it becomes overlapped inside her. So she keeps clear here
  // only where the basic rules wouldn't make her: with the fetching boat to windward of her (the outside, at a mark left
  // to port on starboard), where rule 11 alone would have that boat luff above close-hauled to keep clear. To leeward,
  // inside, the fetching boat has right of way under 11 anyway, and rules 15 and 16 govern her as usual (WS Case 93:
  // the boat that gets that leeward overlap from clear astern and luffs at once into the tacker broke 15 and 16.1).
  // Only bites while they're overlapped.
  const r3 = rec?.r183;
  if (r3 && A.leg === r3.idx && B.leg === r3.idx) {
    const mk = ctx.marks[r3.idx], z = ZONE * 1.4;
    const T = r3.tacker === A.id ? A : B, O = T === A ? B : A;
    if (r3.binds && markDist(A, mk) < z && markDist(B, mk) < z && T.tack === 'S' && !T.tacking && O.tack === 'S' && !O.tacking && !clearAstern(A, B) && !clearAstern(B, A) && windward(T, O, ctx) === O) return { kc: T, rule: '18.3' };
  }
  // Rule 18.2(a): fixed when the first boat reached the zone; ends (18.2(b)) once the entitled boat passes
  // head to wind or leaves the zone. Rule 18 doesn't apply on opposite tacks on a beat (18.1(a)(1)).
  // Rule 18.2(d): an inside overlap got from clear astern or by tacking to windward, when the outside boat couldn't give
  // mark-room from the moment it began, earns no mark-room under 18.2(a) or (c).
  const noRoom18 = (inside: number) => { const o = rec?.ovStart; return !!o && o.insideMark === inside && o.markUnable && (o.astern === inside || o.tacker === inside); };
  // Rule 20.2(e): from the time a boat hails for room to tack until she has tacked and avoided the hailed boat, rule
  // 18.2 does not apply between them (rec.r202e, kept by assessPair until then, outlasting the hail itself).
  const hailing = rec?.hail?.kind === 'room' || !!rec?.r202e;
  if (!hailing && rec && rec.mark && !rec.mark.ended && A.leg === rec.mark.idx && B.leg === rec.mark.idx) {
    const mk = ctx.marks[rec.mark.idx], m = rec.mark;
    if (A.tack === B.tack || !mk.beat) {
      if (m.overlapped && !noRoom18(m.inside!)) return { kc: m.inside === A.id ? B : A, rule: '18.2(a)', mr: m };
      if (!m.overlapped) return { kc: m.ahead === A.id ? B : A, rule: '18.2(a)', mr: m };
    }
  }
  // Rule 18.2(c): when 18.2(a) doesn't apply (it ended under 18.2(b)) and the boats are overlapped with at least one in
  // the zone, the outside boat gives the inside boat mark-room.
  if (!hailing && rec && rec.mark?.ended && !rec.r183 && A.leg === rec.mark.idx && B.leg === rec.mark.idx) {
    const mk = ctx.marks[rec.mark.idx], dA = markDist(A, mk), dB = markDist(B, mk);
    if ((A.tack === B.tack || !mk.beat) && Math.min(dA, dB) < ZONE && !clearAstern(A, B) && !clearAstern(B, A)) {
      const inside = dA < dB ? A : B;
      if (!noRoom18(inside.id)) return { kc: inside === A ? B : A, rule: '18.2(c)', mr: { ...rec.mark, overlapped: true, inside: inside.id } };
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
  return { kc: windward(A, B, ctx), rule: '11' };
}

/**
 * Of two boats overlapped on the same tack, the windward one: the one on the other's windward side (Definitions,
 * Leeward and Windward). Sides are measured across the boats' mean heading: on starboard tack the wind comes over the
 * starboard side, so the boat farther to starboard is windward; on port, farther to port.
 */
function windward<B extends RulesBoat>(A: B, B: B, ctx: RulesContext): B {
  const ua = V(A.h), ub = V(B.h);
  let mx = ua.x + ub.x, my = ua.y + ub.y;
  if (Math.hypot(mx, my) < 0.2) { const n = V(ctx.windFrom); mx = n.y; my = -n.x; } // nearly opposite headings: fall back to the wind
  const stbd = { x: my, y: -mx }, side = A.tack === 'S' ? 1 : -1;
  const aOut = ((A.x - B.x) * stbd.x + (A.y - B.y) * stbd.y) * side;
  return aOut > 0 ? A : B;
}
