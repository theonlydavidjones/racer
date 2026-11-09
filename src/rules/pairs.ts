import { ZONE, dist } from '../core/math';
import { clearAstern, hullGap } from './geometry';
import { rightOfWay } from './rightOfWay';
import type { Incident, PairRecord, RulesBoat, RulesContext, Verdict } from './types';

/** Hulls closer than this count as contact, m. */
export const CONTACT_GAP = 2.2;
/** Rule 15: how long a boat that just acquired right of way must give the other boat room, s. */
export const RULE15_GRACE = 3.5;
/** A boat counts as having "just tacked" for this long after passing head to wind, s. */
export const JUST_TACKED = 2;
/** After an incident, the same pair can't foul again for this long, s. */
export const INCIDENT_COOLDOWN = 6;

export interface PairObservation {
  /** A right-of-way boat had to change course to avoid the other boat (Rule 14 / "forced to swerve"). */
  swerve: boolean;
}

export interface PairAssessment<B> { verdict: Verdict<B>; incident: Incident<B> | null }

/** One step of the rules for a pair of boats. Updates `rec` (the pair's memory) in place and
 * reports any incident. Deterministic: depends only on its arguments. */
export function assessPair<B extends RulesBoat>(rec: PairRecord, A: B, B: B, ctx: RulesContext, obs: PairObservation): PairAssessment<B> {
  const n = ctx.marks.length;
  // Mark-room: freeze who is inside / clear ahead when the first boat reaches the zone.
  if (A.leg === B.leg && A.leg < n && ctx.marks[A.leg].type === 'round' && A.started && B.started) {
    const mk = ctx.marks[A.leg], dA = dist(A, mk.p), dB = dist(B, mk.p);
    if (!rec.mark && (dA < ZONE || dB < ZONE) && (A.tack === B.tack || !mk.beat)) {
      const ov = !clearAstern(A, B) && !clearAstern(B, A);
      rec.mark = ov
        ? { idx: A.leg, overlapped: true, inside: dA < dB ? A.id : B.id }
        : { idx: A.leg, overlapped: false, ahead: clearAstern(A, B) ? B.id : A.id };
    }
    if (rec.mark && dA > ZONE * 2.2 && dB > ZONE * 2.2) rec.mark = null;
  } else if (rec.mark && (A.leg !== rec.mark.idx || B.leg !== rec.mark.idx)) {
    if (A.leg > rec.mark.idx && B.leg > rec.mark.idx) rec.mark = null;
  }

  const r = rightOfWay(A, B, ctx, rec);
  // Rule 15: right of way just changed hands because of a tack or an overlap from astern.
  if (rec.kc != null && r.kc.id !== rec.kc) {
    const newRow = r.kc === A ? B : A, tacked = ctx.t - newRow.lastTackT < JUST_TACKED;
    if (tacked || (rec.rule === '12' && rec.kc === newRow.id)) {
      rec.grace = ctx.t + RULE15_GRACE; rec.by = newRow.id; rec.byWhy = tacked ? 'tack' : 'overlap';
    }
  }
  rec.kc = r.kc.id; rec.rule = r.rule;
  if (rec.cool > ctx.t) return { verdict: r, incident: null };

  let kind: 'contact' | 'swerve' | null = null;
  if (hullGap(A, B) < CONTACT_GAP) kind = 'contact';
  else if (obs.swerve) kind = 'swerve';
  if (!kind) return { verdict: r, incident: null };

  rec.cool = ctx.t + INCIDENT_COOLDOWN;
  let fouler = r.kc, rule = r.rule, byWhy: 'tack' | 'overlap' | null = null;
  if (rec.grace > ctx.t && rec.by != null && rec.by !== r.kc.id) {
    fouler = rec.by === A.id ? A : B; rule = '15'; byWhy = rec.byWhy;
  }
  return { verdict: r, incident: { kind, fouler, rule, byWhy, verdict: r } };
}
