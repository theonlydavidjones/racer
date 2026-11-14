import { LOA, V, ZONE, brg, clamp, markDist, dot, segPt, wrap, type Vec } from '../core/math';
import { escapes, straightOn, type Pose } from '../boat/arcs';
import { clearAstern, cpa, hullGap } from './geometry';
import { returning, rightOfWay } from './rightOfWay';
import type { Incident, PairRecord, PoseRing, RulesBoat, RulesContext, RulesMark, Verdict } from './types';

/**
 * Hulls closer than this count as contact, m: measured centreline to centreline (geometry.ts hullGap), so exact for two
 * boats side by side at their widest (2 × 1.1 m half-beam), and early for a bow into a side (about 1.1 m there). No
 * published distance: rule 14's "contact" includes booms, rigging and crew (WS Case Book 2025–2028, Cases 7 and 49),
 * which touch before hulls do, so a margin is defensible.
 */
export const CONTACT_GAP = 2.2;
/** When she last passed head to wind (a tack). Rule 20's hails are about tacking: a gybe neither answers "Room to tack"
 * nor does the hailing boat's duty to tack, so the hail logic reads this, not lastTackT (any change of tack). */
const htw = (b: { headToWindT?: number }) => b.headToWindT ?? -Infinity;
/**
 * Rule 15: how long a boat that just acquired right of way must give the other boat room, s. The rules and cases give no
 * number: "space and time for response", protecting her "only temporarily, and only if [she] responds promptly" (WS Case
 * Book 2025–2028, Case 24; also Cases 7, 53). Case 27 has the keep-clear boat with "perhaps one to two seconds"; Perry
 * (Understanding the Racing Rules of Sailing through 2028, rule 15) "a second or two" to react, the protection fading "as
 * the seconds go by". So 3.5 s is at the generous end.
 */
export const RULE15_GRACE = 3.5;
/**
 * How long a boat counts as having "just tacked", s: after any change of tack for rule 15, after passing head to wind for
 * 18.2(d). Not a rules term: rule 13 runs from head to wind until she's on a close-hauled course, and rule 15 starts there
 * (Case 27; Perry, rule 15).
 */
export const JUST_TACKED = 2;
/** After an incident, the same pair can't foul again for this long, s. */
export const INCIDENT_COOLDOWN = 6;
/** Rule 16.1: a right-of-way boat that turned toward the other boat within this many seconds before
 * the incident didn't give her room to keep clear. (About the time a Folkboat needs to respond.) */
export const RULE16_WINDOW = 3;
/**
 * Rule 16.1: a turn smaller than this (deg) is ordinary steering, not a course change. A modelling choice: the rules set no
 * least angle ("to change course means to change the direction in which the boat is heading or moving": US Sailing
 * Appeal 33). What decides is whether the change left the other boat room (Case 7: a slight luff with room to spare
 * breaks nothing). The window above has no published number either; Perry (rule 16) calls any change within about two
 * lengths of the other boat risky, about 5–6 s for a Folkboat at 5–6 kt.
 */
export const RULE16_MIN_TURN = 12;
/** Rule 17 applies when the leeward overlap starts within two hull lengths. */
export const RULE17_RANGE = 2 * LOA;

/** Rule 20.2: "as soon as possible", modelled as starting to respond within this many seconds. It applies to the
 * hailed boat (tack, or reply "You tack") and then to the hailing boat (tack once the hailed boat has responded).
 * No published number: the hailed boat must reply "immediately" or give "the time required for a competent, but not
 * expert, crew to prepare for and execute her tack" (WS Case 54); the hailer must "put your helm down within a couple of
 * seconds" of the other's, and breaks 20.2(d) if she goes "another couple of boat-lengths" (Perry, rule 20): 2 s to
 * about 5–6 s at a Folkboat's speed. */
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
  if (htw(b) >= h.at || b.tacking) return true;
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
  if (h.clearAt == null && (h.replyAt != null || htw(hailed) >= h.at || hailed.tacking)) h.clearAt = h.replyAt ?? t;
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
  if (htw(hailer) >= h.at || hailer.tacking) return null; // she's tacked
  h.hailerBegunAt = begunTack(hailer, h, windFrom, h.hailerBegunAt != null) ? h.hailerBegunAt ?? t : undefined;
  const late = h.hailerBegunAt == null ? t >= h.clearAt + HAIL_RESPONSE : t >= Math.max(h.hailerBegunAt, h.clearAt) + THROUGH_WIND;
  return late ? { boat: hailer, role: 'hailer' } : null;
}

/**
 * Room for a Folkboat to pass between a boat and a mark or obstruction: her beam and a little, m. No metric figure in the
 * rules ("the space a boat needs ... while manoeuvring promptly in a seamanlike way", the definition Room; Case 103: a
 * "competent, but not expert, crew"). The cases' own clearances: a stern passed by 1 m or more was room (Case 35); one
 * passed within 0.6 m at hard-over helm wasn't keeping clear (Case 88). Her 2.2 m beam plus 1.3 m fits them.
 */
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
/** The tack she'd be on sailing `course`, now on `tack`: within RUN_HOLD of dead downwind her main stays where it is
 * (boat/physics.ts), so she'd sail it on the tack she's on (Definitions, Tack: by the lee or dead downwind, her
 * mainsail's side); otherwise the side the wind would come over. */
const RUN_HOLD = 4;
const tackFor = (course: number, windFrom: number, tack: 'S' | 'P') => Math.abs(wrap(windFrom + 180 - course)) <= RUN_HOLD ? tack : (wrap(windFrom - course) >= 0 ? 'S' : 'P');

/**
 * Rule 18.4: an inside overlapped right-of-way boat that must gybe at the mark to sail her proper course shall, until
 * she gybes, sail no farther from the mark than needed. Is `b` sailing away from the mark when she should be gybing?
 */
export function wideOfGybe(b: RulesBoat, idx: number, ctx: RulesContext): boolean {
  const mk = ctx.marks[idx], next = ctx.marks[idx + 1];
  if (!next || mk.type !== 'round') return false;
  const course = brg(next.p.x - mk.p.x, next.p.y - mk.p.y);
  const wf = windOf(b, ctx), mustGybe = twaOf(b, ctx) > 90 && Math.abs(wrap(wf - course)) > 60 && tackFor(course, wf, b.tack) !== b.tack;
  if (!mustGybe) return false;
  const d = markDist(b, mk), away = d > 0 ? ((b.x - mk.p.x) * b.vx + (b.y - mk.p.y) * b.vy) / d : 0;
  return d > 1.2 * LOA && away > 0.3;
}

/** Rule 20.2(c): how long a "You tack" reply's room lasts if the hailing boat hasn't tacked, s: a stale-hail cap. Once
 * the hailed boat has responded the hailing boat "shall tack as soon as possible" (20.2(d), called after HAIL_RESPONSE),
 * which after "You tack" is "normally immediately" (Dave Perry, Understanding the Racing Rules of Sailing through 2028,
 * rule 20); the room clears 4 s after her tack. A modelling choice, cut from 25 s (Bay East's audit, 13 Nov 2026). No published basis; the test is whether she could tack and clear
 * "promptly in a seamanlike way" (Case 35). */
export const REPLY_ROOM = 10;

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

/** How many poses a pair keeps of each boat, and how often: 8 s at 0.1 s. */
const RING = 80, RING_DT = 0.1;

/**
 * Keep `b`'s pose in her history (at most every RING_DT s, however many pairs she's in): a fixed ring, no allocation once
 * made. Kept in the
 * water's frame (her position less the current's drift, her speed through the water), where boats steer and turn: a
 * current both are in changes nothing between them.
 */
const RINGS = new WeakMap<object, PoseRing>(); // (one per boat, made once: pairs come and go as boats meet and part)
export function recordPose(b: RulesBoat, t: number): void {
  let r = RINGS.get(b);
  if (!r) RINGS.set(b, r = { t: new Float64Array(RING), x: new Float64Array(RING), y: new Float64Array(RING), h: new Float64Array(RING), v: new Float64Array(RING), dx: new Float64Array(RING), dy: new Float64Array(RING), n: 0, i: 0 });
  const last = r.n ? (r.i + RING - 1) % RING : -1;
  // (time went back, a new race or a test re-run; or a gap, the pair not looked at while apart: start afresh)
  if (last >= 0 && (t < r.t[last] || t - r.t[last] > 1)) r.n = r.i = 0;
  else if (last >= 0 && t - r.t[last] < RING_DT - 1e-9) return;
  // (the drift: the current she's in now over the time since her last sample, added to what she'd had)
  const c = b.cur, prev = r.n ? (r.i + RING - 1) % RING : -1, dt = prev >= 0 ? t - r.t[prev] : 0;
  r.dx[r.i] = (prev >= 0 ? r.dx[prev] : 0) + (c ? c.x * dt : 0); r.dy[r.i] = (prev >= 0 ? r.dy[prev] : 0) + (c ? c.y * dt : 0);
  r.t[r.i] = t; r.x[r.i] = b.x; r.y[r.i] = b.y; r.h[r.i] = b.h;
  r.v[r.i] = b.v ?? Math.hypot(b.vx, b.vy);
  r.i = (r.i + 1) % RING; r.n = Math.min(RING, r.n + 1);
}

/** The k-th newest sample's index (0 = the newest). */
const at = (r: PoseRing, k: number) => (r.i + RING - 1 - k) % RING;

/** Her pose at time t from the ring, between samples (headings the short way round); before the oldest, the oldest. In the
 * water's frame as it is now: her position less the drift the current has given her since t, so two boats in different
 * currents, or one crossing a current's edge, are where the water has carried them, and a current both share changes
 * nothing between them. */
function poseAt(r: PoseRing, t: number): Pose {
  const n0 = at(r, 0);
  let a = at(r, r.n - 1), b = a, f = 0;
  for (let k = 0; k < r.n - 1; k++) {
    const p = at(r, k + 1), q = at(r, k);
    if (r.t[p] <= t && t <= r.t[q]) { a = p; b = q; f = r.t[q] > r.t[p] ? (t - r.t[p]) / (r.t[q] - r.t[p]) : 1; break; }
  }
  const lerp = (A: Float64Array) => A[a] + (A[b] - A[a]) * f;
  return { x: lerp(r.x) + r.dx[n0] - lerp(r.dx), y: lerp(r.y) + r.dy[n0] - lerp(r.dy), h: r.h[a] + wrap(r.h[b] - r.h[a]) * f, v: lerp(r.v) };
}

/** Rule 16.1's "room to keep clear": the reaction time of a helmsman watching the other boat ("promptly", Definitions,
 * Room; WS Case 103's "competent, but not expert" crew), s. A modelling choice (docs/ROOM-TO-RESPOND.md): human
 * reaction to a visual cue is about 0.7–1.5 s. */
export const RESPOND_DELAY = 1;
/** The gap that counts as having kept clear, m: hull to hull, a half metre more than touching (CONTACT_GAP is beam to
 * beam). Definitions, Keep Clear (b): the right-of-way boat "can also change course in both directions without
 * immediately making contact"; and the room is to be "seamanlike". A modelling choice. */
export const KEEP_CLEAR_GAP = CONTACT_GAP + 0.5;
/** Turns are judged over this long a window, s: long enough to see through the yaw a seaway gives her every wave. */
const TURN_WINDOW = 1;

/**
 * Rule 16.1: when the right-of-way boat `row` changed course, did she leave `kc` room to keep clear? Definitions, Room:
 * "the space a boat needs ... while manoeuvring promptly in a seamanlike way". From where both were when her latest turn
 * toward the other began (this pair's history), the other boat, reacting promptly, turns away the way a helmsman would
 * choose from what she could see then (WS Case 92: she "is required to act only in response to what the right-of-way
 * boat is doing at the time; she is not required to anticipate"): does that keep her clear of the right-of-way boat's
 * actual course? WS Case 105: the boat that could have kept clear (there, by gybing away) and didn't broke the basic
 * rule; the one that luffed broke nothing. Without a history, the turn is taken as leaving no room.
 */
export function leftRoom(row: RulesBoat, kc: RulesBoat, ctx: RulesContext): boolean {
  return roomGap(row, kc, ctx) >= KEEP_CLEAR_GAP;
}

/** The gap `kc` keeps from `row` by the turn away a prompt helmsman would make once `row` began her turn, m (leftRoom). */
export function roomGap(row: RulesBoat, kc: RulesBoat, ctx: RulesContext): number {
  const R = RINGS.get(row), K = RINGS.get(kc);
  if (!R || !K || R.n < 2) return 0;
  const now = R.t[at(R, 0)], oldest = R.t[at(R, R.n - 1)];
  const dir = Math.sign(wrap(row.h - (row.headingAgo ?? row.h))) || Math.sign(wrap(R.h[at(R, 0)] - R.h[at(R, 1)]));
  if (!dir) return 0;
  const W = Math.min(TURN_WINDOW, now - oldest);
  const turned = (t: number) => wrap(poseAt(R, t).h - poseAt(R, t - W).h) * dir / W; // deg/s her way, over the window
  // the end of her latest turn: within the last RULE16_WINDOW (the turn may be over by the time they touch, Case 105)
  let tEnd: number | null = null;
  for (let t = now; t >= Math.max(oldest + W, now - RULE16_WINDOW) - 1e-9; t -= RING_DT) if (turned(t) >= 1.5) { tEnd = t; break; }
  if (tEnd == null) return 0;
  // and its start: back while she was still turning that way, at 1°/s or more
  let t0 = tEnd - W;
  for (let t = tEnd; t - W >= oldest - 1e-9; t -= RING_DT) { if (turned(t) < 1) break; t0 = t - W; }
  // where the keep-clear boat was then, and the turn she was already making
  const kOld = K.t[at(K, K.n - 1)], kw = Math.min(TURN_WINDOW, t0 - kOld), k0 = poseAt(K, t0);
  const kc0 = { ...k0, turnRate: kw > 0.2 ? wrap(k0.h - poseAt(K, t0 - kw).h) / kw : 0 }; // (over a window, through the waves' yaw)
  // the right-of-way boat's actual course from t0 (then on as she is)
  const v = row.v ?? Math.hypot(row.vx, row.vy), last = poseAt(R, now);
  const actual = (tau: number): Pose => {
    const t = t0 + tau;
    if (t <= now) return poseAt(R, t);
    const u = V(last.h), d = t - now;
    return { x: last.x + u.x * v * d, y: last.y + u.y * v * d, h: last.h, v };
  };
  // what the keep-clear boat could see when she reacted: the other carrying on as she was then
  const tr = Math.min(now, t0 + RESPOND_DELAY), seen = poseAt(R, tr), sw = Math.min(TURN_WINDOW, tr - oldest);
  const seenRate = sw > 0.2 ? wrap(seen.h - poseAt(R, tr - sw).h) / sw : 0;
  const ahead = straightOn(seen, seenRate);
  const predicted = (tau: number): Pose => t0 + tau <= tr ? actual(tau) : ahead(t0 + tau - tr);
  const wind = kc.ww?.from ?? ctx.windFrom, o = { delay: RESPOND_DELAY, horizon: now - t0 + 2 };
  const choices = escapes(kc0, [predicted], wind, o);
  const choice = choices.reduce((a, b) => b.minGap > a.minGap + 0.05 || (Math.abs(b.minGap - a.minGap) <= 0.05 && Math.abs(b.turn) < Math.abs(a.turn)) ? b : a);
  return escapes(kc0, [actual], wind, { ...o, turns: choice.turn ? [choice.turn] : [] }).find(q => q.turn === choice.turn)!.minGap;
}

/**
 * Rule 16.2 (2025–2028): "In addition, on a beat to windward when a port-tack boat is keeping clear by sailing to pass
 * to leeward of a starboard-tack boat, the starboard-tack boat shall not bear away if as a result the port-tack boat
 * must change course immediately to continue keeping clear." Is `P` sailing to pass astern of (to leeward of) `S`?
 * Her course crosses S's track behind S. "On a beat" runs from the starting signal (WS Case 132).
 */
export function duckingAstern(P: RulesBoat, S: RulesBoat, ctx: RulesContext): boolean {
  if (ctx.t <= 0 || P.tack !== 'P') return false;
  const p = V(P.headingAgo ?? P.h), s = V(S.headingAgo ?? S.h), cross = p.x * s.y - p.y * s.x;
  if (Math.abs(cross) < 1e-3) return false;
  const dx = S.x - P.x, dy = S.y - P.y, alongS = (dx * p.y - dy * p.x) / cross; // where P's course meets S's track, from S
  const alongP = (dx * s.y - dy * s.x) / cross; // and from P: still ahead of her (not a wake she's already crossed)
  return alongS < 0 && alongP > 0;
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
  recordPose(A, ctx.t); recordPose(B, ctx.t);
  const n = ctx.marks.length;
  // (rule 18 applies between boats required to leave a mark on the same side (18.1): a boat that's retired has no mark to
  // leave, so no mark-room either way between her and anyone)
  const out = !!A.retired || !!B.retired;
  if (out) { rec.mark = null; rec.r183 = null; }
  // Mark-room (Rule 18.2(a)): fixed when the first boat reaches the zone (three lengths from the mark).
  if (!out && A.leg === B.leg && A.leg < n && ctx.marks[A.leg].type === 'round' && A.started && B.started) {
    const mk = ctx.marks[A.leg], dA = markDist(A, mk), dB = markDist(B, mk);
    // Rule 18.3 needs to know who has been on starboard since entering the zone.
    const zone = (X: B, d: number) => {
      if (d >= ZONE) delete rec.stbdInZone[X.id];
      else if (!(X.id in rec.stbdInZone)) rec.stbdInZone[X.id] = X.tack === 'S' && !X.tacking;
      else if (X.tack !== 'S' || X.tacking) rec.stbdInZone[X.id] = false;
    };
    zone(A, dA); zone(B, dB); // (A then B, as before; no arrays a pair a step)
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
    // (18.2(d): an overlap obtained "by tacking to windward": through head to wind, not a gybe)
    const tacker = ctx.t - (A.headToWindT ?? -Infinity) < JUST_TACKED + 1 ? A.id : ctx.t - (B.headToWindT ?? -Infinity) < JUST_TACKED + 1 ? B.id : null;
    let insideMark: number | null = null, markUnable = false, insideObst: number | null = null, obstUnable = false;
    if (!out && A.leg === B.leg && A.leg < n && ctx.marks[A.leg].type === 'round') {
      const mk = ctx.marks[A.leg], ins = markDist(A, mk) < markDist(B, mk) ? A : B, out = ins === A ? B : A;
      insideMark = ins.id; markUnable = gapTo(out, mk.p) - 1 < ROOM_GAP;
    }
    const [oA, oB] = obstructionsFor(A, B, ctx, rec);
    // (could the outside boat give room then: the space between the inside boat and the obstruction plus what lies between
    // the two hulls, less her half-beam, against the room the inside boat needs: the old outside-distance test, whichever is nearer)
    if (oA && oB) { const ins = insideAt(A, B, oA, oB), oi = ins === A ? oA : oB; insideObst = ins.id; obstUnable = oi.d + hullGap(A, B) - 1.1 < ROOM_GAP; }
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
    const avoided = htw(H) >= rec.r202e.at && !H.tacking && ctx.t - htw(H) > 2 && g > ROOM_GAP && cpa(H, O).d > LOA;
    if (avoided || g > 6 * LOA) rec.r202e = null;
  }
  const r = rightOfWay(A, B, ctx, rec);
  // Rule 15: right of way just changed hands because of a tack or an overlap from astern.
  // (Not when the change comes from the other boat's own action: a tack into the zone.)
  if (rec.kc != null && r.kc.id !== rec.kc && r.rule !== '18.3') {
    const newRow = r.kc === A ? B : A, tacked = ctx.t - newRow.lastTackT < JUST_TACKED;
    // (or by her own doing, coming out from under rule 21: her hull back below the line, or her penalty turns done; if the
    // other boat began returning or taking a penalty, she got right of way by the other boat's actions, so no grace)
    const out21 = (rec.rule === '21.1' || rec.rule === '21.2') && rec.kc === newRow.id;
    // (and the boat that had been clear astern only by her own overlap to leeward: when the boat ahead tacks or gybes in
    // front of her, she gets right of way by that boat's action, and rule 15 is the other's, as in WS Case 27)
    // (a tack counts too when she got right of way by finishing it, from 13 to 10, 11 or 12: reaching close-hauled can
    // come later than JUST_TACKED after head to wind, and WS Case 27 has rule 15 bind her then)
    const tackDone = rec.rule === '13' && rec.kc === newRow.id && ['10', '11', '12'].includes(r.rule);
    if (tacked || tackDone || out21 || (rec.rule === '12' && rec.kc === newRow.id && r.rule === '11')) {
      rec.grace = ctx.t + RULE15_GRACE; rec.by = newRow.id; rec.byWhy = tacked || tackDone ? 'tack' : out21 ? 'rule21' : 'overlap';
    }
  }
  // Rule 17: overlap established to leeward from clear astern within two lengths, on the same tack.
  const gap = hullGap(A, B);
  if (r.rule === '11' && rec.rule === '12' && rec.kc != null && r.kc.id !== rec.kc && gap < RULE17_RANGE) rec.r17 = rec.kc; // the boat that was astern is now leeward
  if (rec.r17 != null && (A.tack !== B.tack || r.rule !== '11' || gap > RULE17_RANGE)) rec.r17 = null;
  rec.kc = r.kc.id; rec.rule = r.rule;
  // (the replying boat's speed at "You tack", taken at once, before any cooldown: slowing into the hailing boat's way is
  // not giving room. A modelling sign, and a big lull would read the same; it only counts at contact while the hail is live)
  const hr = rec.hail;
  if (hr?.kind === 'room' && hr.replyAt != null && hr.replyV == null) { const Hd = hr.by === A.id ? B : A; hr.replyV = Math.hypot(Hd.vx, Hd.vy); }
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
    const hailerDone = htw(hailer) >= hl.at && !hailer.tacking && ctx.t - htw(hailer) > 4;
    if (hl.replyAt != null) { if (ctx.t > hl.replyAt + REPLY_ROOM || hailerDone) rec.hail = null; }
    // (stale half a minute after the last thing that started a clock: the hail, the hailed boat through the wind, or
    // the boat a 20.3 relay went to through it; every deadline falls within 20 s of one of those)
    else if (ctx.t > Math.max(hl.at, hl.clearAt ?? -Infinity, hl.passedOn?.respondedAt ?? -Infinity) + 30 || (hailerDone && htw(hailed) >= hl.at && !hailed.tacking)) rec.hail = null;
  }

  let kind: 'contact' | 'swerve' | null = null;
  if (gap < CONTACT_GAP) kind = 'contact';
  else if (obs.swerve) kind = 'swerve';
  if (!kind) return { verdict: r, incident: null };
  // Rule 15: a boat that has just got right of way and changes course to give the other boat room to keep clear is
  // complying with it, not being forced to swerve (WS Case 53)
  if (kind === 'swerve' && rec.grace > ctx.t && rec.by != null && rec.by !== r.kc.id) return { verdict: r, incident: null };
  // Rule 20.2(c): nor is the boat that replied "You tack", changing course to give the hailing boat the room she owes her
  const yt = rec.hail?.kind === 'room' && rec.hail.replyAt != null ? rec.hail : null;
  if (kind === 'swerve' && yt && yt.by === r.kc.id) return { verdict: r, incident: null };

  // boats that have both finished (or retired) aren't racing: no penalties between them
  const done = (b: typeof A) => b.finished || !!b.retired;
  if (done(A) && done(B)) return { verdict: r, incident: null };
  rec.cool = ctx.t + INCIDENT_COOLDOWN;
  let fouler = r.kc, rule = r.rule, byWhy: PairRecord['byWhy'] = null, turned: number | undefined, part: string | undefined;
  const row = r.kc === A ? B : A, kc = r.kc;
  const youTack = yt ? { hailer: yt.by === A.id ? A : B, hailed: yt.by === A.id ? B : A, v0: yt.replyV ?? Infinity } : null;
  const obst = rule19(A, B, r.rule, rec, ctx);
  // Rule 18.3(a): the boat that tacked in the zone shall not cause a boat fetching the mark (on starboard since entering
  // the zone) to sail above close-hauled to avoid contact. It doesn't switch off the basic rules: a fetching boat that
  // bears away into her broke them (11). Overlapped with the fetching boat to windward (rightOfWay's '18.3'), bearing
  // away only takes her into the tacker, so contact or a swerve while she's at or above close-hauled and not turning
  // toward her is the tacker's breach. (Not modelled: the fetching boat clear astern made to luff above close-hauled,
  // where she could usually bear away instead and rule 12 holds; whether bearing away would also have cleared her is
  // docs/ROOM-TO-RESPOND.md's escapes(), not yet built.)
  const r3 = rec.r183;
  const r183T = r3?.binds && r.rule === '18.3' ? (r3.tacker === A.id ? A : B) : null;
  const r183O = r183T ? (r183T === A ? B : A) : null;
  const r183a = !!r183T && !!r183O && turnedToward(r183O, r183T) === 0 && twaOf(r183O, ctx) <= (ctx.beat ?? 42) + 3;
  // Rule 18.3(b): the boat that tacked shall give mark-room to the fetching boat if she becomes overlapped inside her, and
  // a boat sailing within the mark-room she's entitled to is exonerated for breaking rule 15 (43.1(b)). So the fetching
  // boat that gets the inside (leeward) overlap from clear astern and holds her course to the mark isn't the one at fault
  // for not giving the tacker time: the tacker keeps clear (11). (Luffing at once is not sailing within mark-room: WS
  // Case 93, she broke 15 and 16.1.)
  const r183b = !!r3?.binds && r.rule === '11' && kc.id === r3.tacker && rec.by === row.id && turnedToward(row, kc) === 0;
  if (notRacing(kc) && !notRacing(row)) {
    // Rule 23.1: a boat not racing (she has retired, or finished and cleared the line) shall not interfere with a boat that is racing
    rule = '23'; part = '23.1';
  } else if (r183a) {
    fouler = r183T!; rule = '18.3'; part = '18.3(a)';
  } else if (r.rule === '18.3' && r183O && kc === r183T && turnedToward(r183O, r183T) > 0) {
    // the fetching boat to windward bore away into the boat that tacked: 18.3 gave her no right of way, and 18.2 is off,
    // so rounding the mark she still had to keep clear (rule 11)
    fouler = r183O; rule = '11';
  } else if (rec.grace > ctx.t && rec.by != null && rec.by !== r.kc.id && !r183b) {
    // Rule 15: she only just got right of way
    fouler = rec.by === A.id ? A : B; rule = '15'; byWhy = rec.byWhy;
  } else if (youTack && (kc === youTack.hailed || turnedToward(youTack.hailed, youTack.hailer) > 0 || Math.hypot(youTack.hailed.vx, youTack.hailed.vy) < 0.6 * youTack.v0)) {
    // Rule 20.2(c): she replied "You tack" and didn't give the hailing boat room to tack and avoid her. Right of way
    // doesn't pass with that room (WS Case 101): the hailing boat keeps clear under 13, then 10, and if she tacks too
    // close or sails into the other boat that is hers. The replying boat failed to give the room if she turned toward the
    // hailing boat, slowed down into her way (under 60% of her speed at the reply: a modelling threshold), or was the one
    // keeping clear anyway.
    fouler = youTack.hailed; rule = '20';
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
  } else if (['10', '11', '12', '13', '21.1', '21.2', '21.3'].includes(r.rule) && (turned = turnedToward(row, r.kc)) > 0
    && ((r.rule === '10' && boreAwayOnBeat(row, ctx) && duckingAstern(r.kc, row, ctx)) || !leftRoom(row, r.kc, ctx))) {
    // (rule 16.1 whatever gave her right of way: the basic rules, or a tacking boat, or one returning, taking a penalty or
    // backing a sail keeping clear of her under 13 or 21)
    // Rule 16.1: the right-of-way boat changed course toward the other boat without leaving her room to keep clear (from
    // where they were when her turn began, could the other have turned away in time: leftRoom). A turn that left room
    // is no breach, and contact after it is the keep-clear boat's (WS Case 105).
    // Rule 16.2: on a beat, a starboard boat bearing away onto a port boat that is sailing to pass to leeward of her.
    // Stricter: she "shall not bear away if as a result the port-tack boat must change course immediately to continue
    // keeping clear", room or no room (WS Case 92).
    fouler = row; rule = r.rule === '10' && boreAwayOnBeat(row, ctx) && duckingAstern(r.kc, row, ctx) ? '16.2' : '16.1';
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
    // (which way she lies from each: from where she'll be as the pair passes her, by their motion relative to hers, so a
    // starboard boat still on the port boats' bow, that they'll pass astern of, lies on the side they'll leave her: WS
    // Case 125. Rule 19.2(a): the right-of-way boat chooses the side; the pair passing astern of her, it's that side)
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, wx = C.vx - (A.vx + B.vx) / 2, wy = C.vy - (A.vy + B.vy) / 2, ww = wx * wx + wy * wy;
    const tc = ww > 1e-4 ? clamp(-((C.x - mx) * wx + (C.y - my) * wy) / ww, 0, 15) : 0, cx = C.x + wx * tc, cy = C.y + wy * tc;
    const toward = (X: RulesBoat) => { const u = V(C.h), k = clamp((X.x - cx) * u.x + (X.y - cy) * u.y, -LOA / 2, LOA / 2), dx = X.x - cx - u.x * k, dy = X.y - cy - u.y * k, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
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
 * Of two overlapped boats at an obstruction, the inside one: the one between the other and the obstruction (Definitions,
 * Room, Rule 19.2(b): "room between her and the obstruction"). Judged across the pair, square to their mean heading, by
 * which side the obstruction lies on, not by which is nearer it: with the obstruction still ahead on the bow (a
 * starboard boat they'll pass astern of, WS Case 125) the outside boat can be the nearer one. Dead ahead or astern,
 * where the sides don't tell, the nearer.
 */
function insideAt<B extends RulesBoat>(A: B, B: B, oA: { d: number; n: Vec }, oB: { d: number; n: Vec }): B {
  const ua = V(A.h), ub = V(B.h), mx = ua.x + ub.x, my = ua.y + ub.y, l = Math.hypot(mx, my);
  if (l > 0.2) {
    const ab = { x: -my / l, y: mx / l }; // square to the mean heading
    const sep = (A.x - B.x) * ab.x + (A.y - B.y) * ab.y, toward = -((oA.n.x + oB.n.x) * ab.x + (oA.n.y + oB.n.y) * ab.y); // (n points out from the obstruction)
    if (Math.abs(sep) > 0.5 && Math.abs(toward) > 0.3) return sep * toward > 0 ? A : B;
  }
  return oA.d < oB.d ? A : B;
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
  const I = insideAt(A, B, oA, oB), O = I === A ? B : A, oI = I === A ? oA : oB;
  if (Math.min(oA.d, oB.d) > AT_OBSTRUCTION) return null; // (at it: either of them near it, Rule 19.1)
  const ov = rec.ovStart, unable = !!ov && ov.insideObst === I.id && ov.obstUnable;
  if (oI.continuing && unable && ov!.astern === I.id) return { fouler: I, part: '19.2(c)' };
  // squeezing: the outside boat moving in toward the obstruction (and the inside boat), more than the inside boat is
  // moving out toward her
  const inward = -dot({ x: O.vx, y: O.vy }, oI.n), outward = dot({ x: I.vx, y: I.vy }, oI.n);
  const squeeze = inward > 0.15 && inward > outward;
  if (squeeze && !unable) return { fouler: O, part: '19.2(b)' };
  return null;
}
