import { LOA, V, ZONE, brg, dist, wrap } from '../core/math';
import { clearAstern, hullGap } from './geometry';
import { rightOfWay } from './rightOfWay';
import type { Incident, PairRecord, RulesBoat, RulesContext, RulesMark, Verdict } from './types';

/** Hulls closer than this count as contact, m. */
export const CONTACT_GAP = 2.2;
/** Rule 15: how long a boat that just acquired right of way must give the other boat room, s. */
export const RULE15_GRACE = 3.5;
/** A boat counts as having "just tacked" for this long after passing head to wind, s. */
export const JUST_TACKED = 2;
/** After an incident, the same pair can't foul again for this long, s. */
export const INCIDENT_COOLDOWN = 6;
/** Rule 16.1: a right-of-way boat that turned toward the other boat within this many seconds before
 * the incident didn't give her room to keep clear. (About the time a Folkboat needs to respond.) */
export const RULE16_WINDOW = 3;
/** Rule 16.1: a turn smaller than this (deg) is ordinary steering, not a course change. */
export const RULE16_MIN_TURN = 12;
/** Rule 17 applies when the leeward overlap starts within two hull lengths. */
export const RULE17_RANGE = 2 * LOA;

/** Rule 20.2(b): a boat hailed for room to tack must start to respond (by tacking) within this many seconds. */
export const HAIL_RESPONSE = 5;

/**
 * Rule 20: has the boat hailed for room to tack failed to respond? Returns the hailed boat if so.
 * (She may also reply "You tack" and give room; that reply isn't modelled, so tacking is the response.)
 */
export function hailIgnored<B extends RulesBoat>(rec: PairRecord, A: B, B: B, t: number): B | null {
  const h = rec.hail;
  if (!h || h.kind !== 'room' || h.replyAt != null) return null; // replying "You tack" is a response
  const hailed = h.by === A.id ? B : A;
  if (t < h.at + HAIL_RESPONSE) return null;
  return hailed.lastTackT >= h.at || hailed.tacking ? null : hailed;
}

/** Rule 20.2(c): how long after a "You tack" reply the hailing boat has to get round and clear, s. */
export const REPLY_ROOM = 25;

/**
 * Definitions, Fetching: she is sailing toward a position close to and to windward of the mark, and will
 * pass it on the required side without changing tack. Approximated as: on her present tack she can reach a
 * point a few metres to windward of the mark without sailing above close-hauled.
 */
export function fetching(b: RulesBoat, mk: RulesMark, ctx: RulesContext): boolean {
  const n = V(ctx.windFrom), P = { x: mk.p.x + n.x * 3, y: mk.p.y + n.y * 3 };
  const twa = wrap(ctx.windFrom - brg(P.x - b.x, P.y - b.y)); // + = wind from her starboard side
  return (b.tack === 'S' ? twa : -twa) >= (ctx.beat ?? 42) - 2;
}

/** Did `row` turn toward `other` over the last RULE16_WINDOW seconds? Returns the turn in degrees, or 0. */
export function turnedToward(row: RulesBoat, other: RulesBoat): number {
  if (row.headingAgo == null) return 0;
  const turn = wrap(row.h - row.headingAgo);
  if (Math.abs(turn) < RULE16_MIN_TURN) return 0;
  const b = brg(other.x - row.x, other.y - row.y);
  const before = Math.abs(wrap(b - row.headingAgo)), after = Math.abs(wrap(b - row.h));
  return after < before - 5 ? Math.abs(turn) : 0;
}

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
    // Rule 18.3: a boat passing head to wind from port to starboard in the zone of a mark left to port, when
    // the other boat is on starboard fetching it. Rule 18.2 then stops applying between them.
    for (const [T, O] of [[A, B], [B, A]] as const) {
      const seen = rec.seenTack[T.id];
      if (seen != null && T.lastTackT > seen && T.tack === 'S' && mk.beat && mk.side === 'p' && dist(T, mk.p) < ZONE
        && O.tack === 'S' && !O.tacking && fetching(O, mk, ctx)) { rec.r183 = { tacker: T.id, idx: A.leg }; rec.mark = null; }
    }
    if (!rec.mark && !rec.r183 && (dA < ZONE || dB < ZONE) && (A.tack === B.tack || !mk.beat)) {
      const ov = !clearAstern(A, B) && !clearAstern(B, A);
      rec.mark = ov
        ? { idx: A.leg, overlapped: true, inside: dA < dB ? A.id : B.id }
        : { idx: A.leg, overlapped: false, ahead: clearAstern(A, B) ? B.id : A.id };
    }
    if (dA > ZONE * 2.2 && dB > ZONE * 2.2) { rec.mark = null; rec.r183 = null; }
  } else {
    if (rec.mark && A.leg > rec.mark.idx && B.leg > rec.mark.idx) rec.mark = null;
    if (rec.r183 && (A.leg !== rec.r183.idx || B.leg !== rec.r183.idx)) rec.r183 = null;
  }
  rec.seenTack[A.id] = A.lastTackT; rec.seenTack[B.id] = B.lastTackT;

  const r = rightOfWay(A, B, ctx, rec);
  // Rule 15: right of way just changed hands because of a tack or an overlap from astern.
  // (Not when the change comes from the other boat's own action: a "You tack" reply, or a tack into the zone.)
  if (rec.kc != null && r.kc.id !== rec.kc && r.rule !== '20' && r.rule !== '18.3') {
    const newRow = r.kc === A ? B : A, tacked = ctx.t - newRow.lastTackT < JUST_TACKED;
    if (tacked || (rec.rule === '12' && rec.kc === newRow.id)) {
      rec.grace = ctx.t + RULE15_GRACE; rec.by = newRow.id; rec.byWhy = tacked ? 'tack' : 'overlap';
    }
  }
  // Rule 17: overlap established to leeward from clear astern within two lengths, on the same tack.
  const gap = hullGap(A, B);
  if (r.rule === '11' && rec.rule === '12' && rec.kc != null && r.kc.id !== rec.kc && gap < RULE17_RANGE) rec.r17 = rec.kc; // the boat that was astern is now leeward
  if (rec.r17 != null && (A.tack !== B.tack || r.rule !== '11' || gap > RULE17_RANGE)) rec.r17 = null;
  rec.kc = r.kc.id; rec.rule = r.rule;
  if (rec.cool > ctx.t) return { verdict: r, incident: null };

  // Rule 20: ignoring a hail for room to tack is a breach in itself
  const ignored = hailIgnored(rec, A, B, ctx.t);
  if (ignored) {
    rec.hail = null; rec.cool = ctx.t + INCIDENT_COOLDOWN;
    return { verdict: r, incident: { kind: 'hail', fouler: ignored, rule: '20', byWhy: null, verdict: r } };
  }
  // a hail is answered (or stale) once the hailed boat has tacked, or after half a minute; after a
  // "You tack" reply, once the hailing boat has tacked and got going (or the room has run out)
  const hl = rec.hail;
  if (hl && hl.replyAt != null) {
    const hailer = hl.by === A.id ? A : B;
    if (ctx.t > hl.replyAt + REPLY_ROOM || (hailer.lastTackT >= hl.replyAt && !hailer.tacking && ctx.t - hailer.lastTackT > 6)) rec.hail = null;
  } else if (hl && (ctx.t > hl.at + 30 || [A, B].some(x => x.id !== hl.by && x.lastTackT >= hl.at + 0.01 && !x.tacking))) rec.hail = null;

  let kind: 'contact' | 'swerve' | null = null;
  if (gap < CONTACT_GAP) kind = 'contact';
  else if (obs.swerve) kind = 'swerve';
  if (!kind) return { verdict: r, incident: null };

  rec.cool = ctx.t + INCIDENT_COOLDOWN;
  let fouler = r.kc, rule = r.rule, byWhy: 'tack' | 'overlap' | null = null, turned: number | undefined;
  const row = r.kc === A ? B : A;
  if (rec.grace > ctx.t && rec.by != null && rec.by !== r.kc.id) {
    // Rule 15: she only just got right of way
    fouler = rec.by === A.id ? A : B; rule = '15'; byWhy = rec.byWhy;
  } else if ((r.rule === '10' || r.rule === '11' || r.rule === '12') && (turned = turnedToward(row, r.kc)) > 0) {
    // Rule 16.1: the right-of-way boat changed course into the other boat without leaving her room to respond
    fouler = row; rule = '16.1';
  } else if (r.rule === '11' && rec.r17 === row.id && ctx.t > 0 && row.aboveProper) {
    // Rule 17: overlapped from astern within two lengths, then sailed above her proper course
    fouler = row; rule = '17';
  }
  return { verdict: r, incident: { kind, fouler, rule, byWhy, turned, verdict: r } };
}
