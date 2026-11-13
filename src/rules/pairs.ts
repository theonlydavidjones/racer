import { LOA, V, ZONE, brg, clamp, markDist, dot, segPt, wrap, type Vec } from '../core/math';
import { clearAstern, cpa, hullGap } from './geometry';
import { returning, rightOfWay } from './rightOfWay';
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

/** Rule 20.2: "as soon as possible", modelled as starting to respond within this many seconds. It applies to the
 * hailed boat (tack, or reply "You tack") and then to the hailing boat (tack once the hailed boat has responded). */
export const HAIL_RESPONSE = 5;
/**
 * Rule 20.2(c) and (d) ask each boat to "respond ... by tacking as soon as possible": the response is starting the tack,
 * not getting through it. A boat slowed in another's dirty air turns slowly (her rudder needs water over it, physics.ts
 * maxTurnRate): at 1.5 m/s she takes 4–5 s from close-hauled to head to wind, so judging her by when she passes head to
 * wind would call a breach on a boat that put her helm down at once. Turned this many degrees toward the wind from her
 * heading at the hail, she has begun to tack. (A modelling threshold, not a number from the rules: well above the few
 * degrees the sea knocks a close-hauled boat's bow about, and reached in about a second at the sim's turn rates.)
 */
export const TACK_BEGUN = 15;
/** ... and is above any course she'd sail close-hauled: no more than this far off the wind (a Folkboat's beat is 40–45°,
 * polar.ts beatAngle), so a boat footing when hailed gets no credit for merely coming up to close-hauled. */
const BEGUN_TWA = 30;
/**
 * Begun to tack, she's through head to wind within this many seconds, or she didn't really tack. (In the sim a boat
 * keeps turning at the rudder's least authority, dynamics.ts HANDLING.minTurnRate, so even at 1 m/s she's through in
 * well under 15 s: a modelling allowance, not a number from the rules.)
 */
export const THROUGH_WIND = 15;

/**
 * Is `b` tacking (in the act of it) since the hail `h`: through head to wind, or turned TACK_BEGUN° up from her heading
 * at the hail (in the wind she had then) and now pinching above close-hauled (in the wind she has now)?
 * Not latched: bear away again and she's no longer tacking. `started`: she'd begun (the clock is running).
 */
export function begunTack(b: RulesBoat, h: { at: number; headAt?: Record<number, { h: number; wind: number }> }, windFrom: number, started = false): boolean {
  if (b.lastTackT >= h.at || b.tacking) return true;
  const at = h.headAt?.[b.id];
  if (!at) return false;
  // turned up from her heading at the hail, in the wind she had then; and pinching now, in the wind she has now (so a
  // lift she followed, or coming up from footing to close-hauled, isn't a tack begun)
  // (her turn by her heading alone, toward the side the wind was on; the wind now unsigned, so a few degrees' shift as
  // she nears head to wind doesn't throw her back out of it)
  const now = b.ww?.from ?? windFrom, then = Number.isFinite(at.wind) ? at.wind : now;
  const up = Math.sign(wrap(then - at.h)) * wrap(b.h - at.h);
  // (once started, she's still at it while she stays turned up: a shift that frees her mid-luff doesn't undo it)
  return up >= TACK_BEGUN && (started || Math.abs(wrap(now - b.h)) <= BEGUN_TWA);
}

/**
 * Rule 20.2: has someone failed to respond to a hail for room to tack? Keeps `respondedAt` and `clearAt` up to date and
 * returns the boat in breach:
 * - the hailed boat (20.2(c)) if within HAIL_RESPONSE she neither began to tack nor replied "You tack", or began and
 *   didn't go through the wind within THROUGH_WIND (bearing away again undoes her start). After passing the hail on
 *   (20.3) her clocks run from when the boat she hailed is through the wind;
 * - the hailing boat (20.2(d)), on the same terms, from when the hailed boat is through the wind or replied.
 */
export function hailBreach<B extends RulesBoat>(rec: PairRecord, A: B, B: B, t: number, windFrom = NaN): { boat: B; role: 'hailed' | 'hailer' } | null {
  const h = rec.hail;
  if (!h || h.kind !== 'room') return null;
  const hailer = h.by === A.id ? A : B, hailed = hailer === A ? B : A;
  if (h.clearAt == null && (h.replyAt != null || hailed.lastTackT >= h.at || hailed.tacking)) h.clearAt = h.replyAt ?? t;
  if (h.replyAt != null) h.respondedAt ??= h.replyAt;
  else if (h.clearAt == null) h.respondedAt = begunTack(hailed, h, windFrom, h.respondedAt != null) ? h.respondedAt ?? t : undefined;
  if (h.clearAt == null) {
    // Rule 20.3: she passed the hail on to a boat to windward of her that stops her tacking. She can't tack until that
    // boat is through the wind, so her own "as soon as possible" runs from then; and if that boat never responds (her
    // breach), she was never able to (rule 43.1(a)'s reasoning: compelled by another boat's breach).
    const po = h.passedOn;
    if (po && (po.failed || po.respondedAt == null)) return null;
    const from = po ? po.respondedAt! : h.at;
    const late = h.respondedAt == null ? t >= from + HAIL_RESPONSE : t >= Math.max(h.respondedAt, from) + THROUGH_WIND;
    return late ? { boat: hailed, role: 'hailed' } : null;
  }
  if (hailer.lastTackT >= h.at || hailer.tacking) return null; // she's tacked
  h.hailerBegunAt = begunTack(hailer, h, windFrom, h.hailerBegunAt != null) ? h.hailerBegunAt ?? t : undefined;
  const late = h.hailerBegunAt == null ? t >= h.clearAt + HAIL_RESPONSE : t >= Math.max(h.hailerBegunAt, h.clearAt) + THROUGH_WIND;
  return late ? { boat: hailer, role: 'hailer' } : null;
}

/** Room for a Folkboat to pass between a boat and a mark or obstruction: her beam and a little, m. */
export const ROOM_GAP = 3.5;
/** Rule 19: a boat this close to an obstruction (m) is at it, and needs room to pass it. */
export const AT_OBSTRUCTION = 1.5 * LOA;

/** The hull's gap to a point, m (her bow-to-stern line). */
function gapTo(b: RulesBoat, p: Vec): number {
  const u = V(b.h), h = LOA / 2;
  return segPt(p, { x: b.x + u.x * h, y: b.y + u.y * h }, { x: b.x - u.x * h, y: b.y - u.y * h });
}

/**
 * The wind she's in (deg): her own, where she is, as her tack is judged from it (the wind shifts across the course, so
 * two boats a few hundred metres apart can be in winds degrees apart); the course's wind if it isn't known.
 */
const windOf = (b: RulesBoat, ctx: RulesContext) => b.ww?.from ?? ctx.windFrom;
/** True wind angle, deg (0..180), in the wind she's in. */
const twaOf = (b: RulesBoat, ctx: RulesContext) => Math.abs(wrap(windOf(b, ctx) - b.h));
/** The tack she'd be on sailing `course`. */
const tackFor = (course: number, windFrom: number) => (wrap(windFrom - course) >= 0 ? 'S' : 'P');

/**
 * Rule 18.4: an inside overlapped right-of-way boat that must gybe at the mark to sail her proper course shall, until
 * she gybes, sail no farther from the mark than needed. Is `b` sailing away from the mark when she should be gybing?
 */
export function wideOfGybe(b: RulesBoat, idx: number, ctx: RulesContext): boolean {
  const mk = ctx.marks[idx], next = ctx.marks[idx + 1];
  if (!next || mk.type !== 'round') return false;
  const course = brg(next.p.x - mk.p.x, next.p.y - mk.p.y);
  const wf = windOf(b, ctx), mustGybe = twaOf(b, ctx) > 90 && Math.abs(wrap(wf - course)) > 60 && tackFor(course, wf) !== b.tack;
  if (!mustGybe) return false;
  const d = markDist(b, mk), away = d > 0 ? ((b.x - mk.p.x) * b.vx + (b.y - mk.p.y) * b.vy) / d : 0;
  return d > 1.2 * LOA && away > 0.3;
}

/** Rule 20.2(c): how long after a "You tack" reply the hailing boat has to get round and clear, s. */
export const REPLY_ROOM = 25;

/**
 * Definitions, Fetching: she is sailing toward a position close to and to windward of the mark, and will
 * pass it on the required side without changing tack. Approximated as: on her present tack she can reach a
 * point a few metres to windward of the mark without sailing above close-hauled.
 */
export function fetching(b: RulesBoat, mk: RulesMark, ctx: RulesContext): boolean {
  const wf = windOf(b, ctx), n = V(wf), P = { x: mk.p.x + n.x * 3, y: mk.p.y + n.y * 3 };
  const twa = wrap(wf - brg(P.x - b.x, P.y - b.y)); // + = wind from her starboard side
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

/** Rule 16.2: was she on a beat and did she bear away over the last RULE16_WINDOW seconds? */
function boreAwayOnBeat(b: RulesBoat, ctx: RulesContext): boolean {
  if (b.headingAgo == null || b.tack !== 'S') return false;
  const wf = windOf(b, ctx), before = Math.abs(wrap(wf - b.headingAgo)), now = Math.abs(wrap(wf - b.h));
  return before < (ctx.beat ?? 42) + 15 && now > before;
}

export interface PairObservation {
  /** A right-of-way boat had to change course to avoid the other boat (Rule 14 / "forced to swerve"). */
  swerve: boolean;
}

/** Not racing (Definitions, Racing: a boat races "until she finishes and clears the finishing line and marks or retires"). */
export const notRacing = (b: RulesBoat): boolean => !!b.retired || (!!b.finished && (b.cleared ?? true));

export interface PairAssessment<B> { verdict: Verdict<B>; incident: Incident<B> | null }

/** One step of the rules for a pair of boats. Updates `rec` (the pair's memory) in place and
 * reports any incident. Deterministic: depends only on its arguments. */
export function assessPair<B extends RulesBoat>(rec: PairRecord, A: B, B: B, ctx: RulesContext, obs: PairObservation): PairAssessment<B> {
  const n = ctx.marks.length;
  // (rule 18 applies between boats required to leave a mark on the same side (18.1): a boat that's retired has no mark to
  // leave, so no mark-room either way between her and anyone)
  const out = !!A.retired || !!B.retired;
  if (out) { rec.mark = null; rec.r183 = null; }
  // Mark-room (Rule 18.2(a)): fixed when the first boat reaches the zone (three lengths from the mark).
  if (!out && A.leg === B.leg && A.leg < n && ctx.marks[A.leg].type === 'round' && A.started && B.started) {
    const mk = ctx.marks[A.leg], dA = markDist(A, mk), dB = markDist(B, mk);
    // Rule 18.3 needs to know who has been on starboard since entering the zone.
    for (const [X, d] of [[A, dA], [B, dB]] as const) {
      if (d >= ZONE) delete rec.stbdInZone[X.id];
      else if (!(X.id in rec.stbdInZone)) rec.stbdInZone[X.id] = X.tack === 'S' && !X.tacking;
      else if (X.tack !== 'S' || X.tacking) rec.stbdInZone[X.id] = false;
    }
    // Rule 18.3: a boat passing head to wind from port to starboard in the zone of a mark to be left to port.
    // Rule 18.2 then doesn't apply between her and a starboard-tack boat fetching the mark.
    for (const [T, O] of [[A, B], [B, A]] as const) {
      const seen = rec.seenTack[T.id];
      if (seen != null && (T.headToWindT ?? -Infinity) > seen && T.tack === 'S' && mk.side === 'p' && markDist(T, mk) < ZONE
        && O.tack === 'S' && !O.tacking && fetching(O, mk, ctx)) {
        rec.r183 = { tacker: T.id, idx: A.leg, binds: rec.stbdInZone[O.id] === true }; rec.mark = null;
      }
    }
    if (!rec.mark && !rec.r183 && (dA < ZONE || dB < ZONE) && (A.tack === B.tack || !mk.beat)) {
      const ov = !clearAstern(A, B) && !clearAstern(B, A);
      const entitled = ov ? (dA < dB ? A : B) : (dA < ZONE && dB >= ZONE ? A : dB < ZONE && dA >= ZONE ? B : clearAstern(A, B) ? B : A);
      rec.mark = ov
        ? { idx: A.leg, overlapped: true, inside: entitled.id, tackT: entitled.headToWindT ?? -Infinity }
        : { idx: A.leg, overlapped: false, ahead: entitled.id, tackT: entitled.headToWindT ?? -Infinity };
    }
    // Rule 18.2(b): 18.2(a) no longer applies once the entitled boat passes head to wind or leaves the zone.
    const m = rec.mark;
    if (m && !m.ended) {
      const E = (m.overlapped ? m.inside : m.ahead) === A.id ? A : B;
      if ((E.headToWindT ?? -Infinity) > (m.tackT ?? -Infinity) || markDist(E, mk) > ZONE + 2) m.ended = true; // (a gybe doesn't: it passes the wind astern)
    }
    if (dA > ZONE * 2.2 && dB > ZONE * 2.2) { rec.mark = null; rec.r183 = null; }
  } else {
    if (rec.mark && A.leg > rec.mark.idx && B.leg > rec.mark.idx) rec.mark = null;
    if (rec.r183 && (A.leg !== rec.r183.idx || B.leg !== rec.r183.idx)) rec.r183 = null;
  }
  // How an overlap began (Rules 18.2(d), 19.2(b) and 19.2(c)): who came from clear astern or tacked, and could the
  // outside boat give room at that moment?
  const overlapped = !clearAstern(A, B) && !clearAstern(B, A);
  if (overlapped && !rec.wasOverlapped) {
    const astern = rec.rule === '12' && rec.kc != null ? rec.kc : null;
    const tacker = ctx.t - A.lastTackT < JUST_TACKED + 1 ? A.id : ctx.t - B.lastTackT < JUST_TACKED + 1 ? B.id : null;
    let insideMark: number | null = null, markUnable = false, insideObst: number | null = null, obstUnable = false;
    if (!out && A.leg === B.leg && A.leg < n && ctx.marks[A.leg].type === 'round') {
      const mk = ctx.marks[A.leg], ins = markDist(A, mk) < markDist(B, mk) ? A : B, out = ins === A ? B : A;
      insideMark = ins.id; markUnable = gapTo(out, mk.p) - 1 < ROOM_GAP;
    }
    const [oA, oB] = obstructionsFor(A, B, ctx, rec);
    if (oA && oB) { const ins = oA.d < oB.d ? A : B, oo = ins === A ? oB : oA; insideObst = ins.id; obstUnable = oo.d - 1.1 < ROOM_GAP; }
    rec.ovStart = { t: ctx.t, astern, tacker, insideMark, markUnable, insideObst, obstUnable };
  } else if (!overlapped) rec.ovStart = null;
  rec.wasOverlapped = overlapped;
  rec.seenTack[A.id] = A.headToWindT ?? -Infinity; rec.seenTack[B.id] = B.headToWindT ?? -Infinity;

  // Rule 20.2(e): 18.2 is off from the hail until the hailing boat has tacked and avoided the hailed boat. Set when a
  // hail for room to tack is made (on her record before this step), ended here once she has tacked, is out of the tack
  // and won't meet the hailed boat, or once they're far enough apart to have nothing more to do with each other.
  if (rec.hail?.kind === 'room' && rec.r202e?.at !== rec.hail.at) rec.r202e = { hailer: rec.hail.by, at: rec.hail.at };
  if (rec.r202e) {
    const H = rec.r202e.hailer === A.id ? A : B, O = H === A ? B : A, g = hullGap(A, B);
    const avoided = H.lastTackT >= rec.r202e.at && !H.tacking && ctx.t - H.lastTackT > 2 && g > ROOM_GAP && cpa(H, O).d > LOA;
    if (avoided || g > 6 * LOA) rec.r202e = null;
  }
  const r = rightOfWay(A, B, ctx, rec);
  // Rule 15: right of way just changed hands because of a tack or an overlap from astern.
  // (Not when the change comes from the other boat's own action: a "You tack" reply, or a tack into the zone.)
  if (rec.kc != null && r.kc.id !== rec.kc && r.rule !== '20' && r.rule !== '18.3') {
    const newRow = r.kc === A ? B : A, tacked = ctx.t - newRow.lastTackT < JUST_TACKED;
    // (or by her own doing, coming out from under rule 21: her hull back below the line, or her penalty turns done; if the
    // other boat began returning or taking a penalty, she got right of way by the other boat's actions, so no grace)
    const out21 = (rec.rule === '21.1' || rec.rule === '21.2') && rec.kc === newRow.id;
    if (tacked || out21 || (rec.rule === '12' && rec.kc === newRow.id)) {
      rec.grace = ctx.t + RULE15_GRACE; rec.by = newRow.id; rec.byWhy = tacked ? 'tack' : out21 ? 'rule21' : 'overlap';
    }
  }
  // Rule 17: overlap established to leeward from clear astern within two lengths, on the same tack.
  const gap = hullGap(A, B);
  if (r.rule === '11' && rec.rule === '12' && rec.kc != null && r.kc.id !== rec.kc && gap < RULE17_RANGE) rec.r17 = rec.kc; // the boat that was astern is now leeward
  if (rec.r17 != null && (A.tack !== B.tack || r.rule !== '11' || gap > RULE17_RANGE)) rec.r17 = null;
  rec.kc = r.kc.id; rec.rule = r.rule;
  if (rec.cool > ctx.t) return { verdict: r, incident: null };

  // Rule 20: not responding to a hail for room to tack is a breach in itself (and so is the hailing
  // boat not tacking once the hailed boat has responded)
  const breach = hailBreach(rec, A, B, ctx.t, ctx.windFrom);
  if (breach) {
    rec.hail = null; rec.cool = ctx.t + INCIDENT_COOLDOWN;
    return { verdict: r, incident: { kind: 'hail', fouler: breach.boat, rule: '20', byWhy: null, hailRole: breach.role, verdict: r } };
  }
  // A hail is done once both boats have tacked (or after a "You tack" reply, once the hailing boat has tacked
  // and got going, or the room has run out), and stale after half a minute.
  const hl = rec.hail;
  if (hl) {
    const hailer = hl.by === A.id ? A : B, hailed = hailer === A ? B : A;
    const hailerDone = hailer.lastTackT >= hl.at && !hailer.tacking && ctx.t - hailer.lastTackT > 4;
    if (hl.replyAt != null) { if (ctx.t > hl.replyAt + REPLY_ROOM || hailerDone) rec.hail = null; }
    // (stale half a minute after the last thing that started a clock: the hail, the hailed boat through the wind, or
    // the boat a 20.3 relay went to through it; every deadline falls within 20 s of one of those)
    else if (ctx.t > Math.max(hl.at, hl.clearAt ?? -Infinity, hl.passedOn?.respondedAt ?? -Infinity) + 30 || (hailerDone && hailed.lastTackT >= hl.at && !hailed.tacking)) rec.hail = null;
  }

  let kind: 'contact' | 'swerve' | null = null;
  if (gap < CONTACT_GAP) kind = 'contact';
  else if (obs.swerve) kind = 'swerve';
  if (!kind) return { verdict: r, incident: null };

  // boats that have both finished (or retired) aren't racing: no penalties between them
  const done = (b: typeof A) => b.finished || !!b.retired;
  if (done(A) && done(B)) return { verdict: r, incident: null };
  rec.cool = ctx.t + INCIDENT_COOLDOWN;
  let fouler = r.kc, rule = r.rule, byWhy: PairRecord['byWhy'] = null, turned: number | undefined, part: string | undefined;
  const row = r.kc === A ? B : A, kc = r.kc;
  const obst = rule19(A, B, r.rule, rec, ctx);
  if (notRacing(kc) && !notRacing(row)) {
    // Rule 23.1: a boat not racing (she has retired, or finished and cleared the line) shall not interfere with a boat that is racing
    rule = '23'; part = '23.1';
  } else if (rec.grace > ctx.t && rec.by != null && rec.by !== r.kc.id) {
    // Rule 15: she only just got right of way
    fouler = rec.by === A.id ? A : B; rule = '15'; byWhy = rec.byWhy;
  } else if (obst) {
    // Rule 19: room to pass an obstruction
    fouler = obst.fouler; rule = '19'; part = obst.part;
  } else if ((r.rule === '18.2(a)' || r.rule === '18.2(c)') && r.mr?.overlapped && r.mr.inside === row.id && wideOfGybe(row, r.mr.idx, ctx)) {
    // Rule 18.4: the inside boat had to gybe at the mark, and sailed on past it instead, taking the outside boat wide
    fouler = row; rule = '18.4';
  } else if (!done(row) && (((kc.leg !== row.leg && kc.started && row.started) || kc.penalty > 0 || (returning(kc) && ctx.t > 0)) && (ctx.t > 0 ? !!row.aboveProper : turnedToward(row, kc) > 0))) {
    // Rule 23.2: she interfered with a boat taking a penalty, on another leg or returning to start, when not on her proper
    // course. "However, after the starting signal this rule does not apply when the boat is sailing her proper course": so
    // after the start only leaving it counts (the sim's sign: sailing above it), not merely turning toward the other boat,
    // which her proper course itself does at a mark she's rounding or when she keeps clear of a third boat (a turn into a
    // boat she must give room to is still rule 16.1's, below). Before the start there's no proper course: a turn onto her
    // is the sign.
    fouler = row; rule = '23'; part = '23.2'; turned = turnedToward(row, kc) || undefined;
  } else if (['10', '11', '12', '13', '21.1', '21.2', '21.3'].includes(r.rule) && (turned = turnedToward(row, r.kc)) > 0) {
    // (rule 16.1 whatever gave her right of way: the basic rules, or a tacking boat, or one returning, taking a penalty or
    // backing a sail keeping clear of her under 13 or 21)
    // Rule 16.1: the right-of-way boat changed course into the other boat without leaving her room to respond.
    // Rule 16.2: on a beat, a starboard boat bearing away onto a port boat that is passing astern of her.
    fouler = row; rule = r.rule === '10' && boreAwayOnBeat(row, ctx) ? '16.2' : '16.1';
  } else if (r.rule === '11' && rec.r17 === row.id && ctx.t > 0 && row.aboveProper) {
    // Rule 17: overlapped from astern within two lengths, then sailed above her proper course
    fouler = row; rule = '17';
  }
  return { verdict: r, incident: { kind, fouler, rule, byWhy, turned, part, verdict: r } };
}

/**
 * The boat that is an obstruction to both A and B, if one is near (Definitions, Obstruction: "a boat racing is not an
 * obstruction to other boats unless they are required to keep clear of her". "A vessel under way, including a boat
 * racing, is never a continuing obstruction"). Each boat's gap to her hull and the unit vector from her toward each.
 * Rule 19.1(b): not when rule 18 applies between A and B and that boat is overlapped with each of them.
 */
function boatObstruction<B extends RulesBoat>(A: B, B: B, ctx: RulesContext, rec: PairRecord): [{ d: number; n: Vec; continuing: false }, { d: number; n: Vec; continuing: false }] | null {
  if (!ctx.fleet || !ctx.keepsClearOf) return null;
  const r18 = !!rec.mark && !rec.mark.ended && A.leg === rec.mark.idx && B.leg === rec.mark.idx;
  const ov = (X: RulesBoat, Y: RulesBoat) => !clearAstern(X, Y) && !clearAstern(Y, X);
  let best: [{ d: number; n: Vec; continuing: false }, { d: number; n: Vec; continuing: false }] | null = null, bd = 30;
  for (const C of ctx.fleet) {
    if (C.id === A.id || C.id === B.id) continue;
    if (Math.abs(C.x - A.x) > 45 || Math.abs(C.y - A.y) > 45) continue;
    const dA = hullGap(A, C), dB = hullGap(B, C);
    // (a boat no longer racing is just a vessel in the way: an obstruction to everyone, like the committee boat)
    if (Math.min(dA, dB) >= bd || (!notRacing(C) && (!ctx.keepsClearOf(A, C) || !ctx.keepsClearOf(B, C)))) continue;
    if (r18 && ov(A, C) && ov(B, C)) continue;
    const toward = (X: RulesBoat) => { const u = V(C.h), k = clamp((X.x - C.x) * u.x + (X.y - C.y) * u.y, -LOA / 2, LOA / 2), dx = X.x - C.x - u.x * k, dy = X.y - C.y - u.y * k, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
    best = [{ d: dA, n: toward(A), continuing: false }, { d: dB, n: toward(B), continuing: false }]; bd = Math.min(dA, dB);
  }
  return best;
}

/** The obstruction nearest each of A and B: the shore, the committee boat after the start, or a boat both keep clear of. */
function obstructionsFor<B extends RulesBoat>(A: B, B: B, ctx: RulesContext, rec: PairRecord): [{ d: number; n: Vec; continuing: boolean } | null, { d: number; n: Vec; continuing: boolean } | null] {
  const com = ctx.t > 0 && A.started && B.started;
  let oA = ctx.obstacle?.(A, com) ?? null, oB = ctx.obstacle?.(B, com) ?? null;
  const bo = boatObstruction(A, B, ctx, rec);
  // the boat, if she is nearer the pair than the shore is: then she is the obstruction they're at
  if (bo && (!oA || !oB || Math.min(bo[0].d, bo[1].d) < Math.min(oA.d, oB.d))) { oA = bo[0]; oB = bo[1]; }
  return [oA, oB];
}

/**
 * Rule 19 at an incident between overlapped boats at an obstruction (the shore, or the committee boat after the start).
 * The boat nearer it is inside. 19.2(b): the outside boat gives the inside boat room between her and the obstruction,
 * unless she couldn't from the moment the overlap began; squeezing the inside boat toward it breaks the rule.
 * 19.2(c): at a continuing obstruction (the shore), a boat that came from clear astern into a gap that wasn't there
 * isn't entitled to room, and keeps clear. Only in place of the basic rules (10–13), not Section D, 18 or 20.
 */
function rule19<B extends RulesBoat>(A: B, B: B, basic: string, rec: PairRecord, ctx: RulesContext): { fouler: B; part: string } | null {
  if ((!ctx.obstacle && !ctx.fleet) || !['10', '11', '12', '13'].includes(basic)) return null;
  const sameTackOrDeep = A.tack === B.tack || (twaOf(A, ctx) > 90 && twaOf(B, ctx) > 90); // Definitions, Overlap (each in the wind she's in)
  if (!sameTackOrDeep || clearAstern(A, B) || clearAstern(B, A)) return null;
  const [oA, oB] = obstructionsFor(A, B, ctx, rec);
  if (!oA || !oB) return null;
  const I = oA.d < oB.d ? A : B, O = I === A ? B : A, oI = I === A ? oA : oB;
  if (oI.d > AT_OBSTRUCTION) return null;
  const ov = rec.ovStart, unable = !!ov && ov.insideObst === I.id && ov.obstUnable;
  if (oI.continuing && unable && ov!.astern === I.id) return { fouler: I, part: '19.2(c)' };
  // squeezing: the outside boat moving in toward the obstruction (and the inside boat), more than the inside boat is
  // moving out toward her
  const inward = -dot({ x: O.vx, y: O.vy }, oI.n), outward = dot({ x: I.vx, y: I.vy }, oI.n);
  const squeeze = inward > 0.15 && inward > outward;
  if (squeeze && !unable) return { fouler: O, part: '19.2(b)' };
  return null;
}
