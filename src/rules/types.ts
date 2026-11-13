import type { Vec } from '../core/math';
import type { Tack } from '../boat/boat';

/** The rules engine only sees this slice of a boat. */
export interface RulesBoat {
  id: number;
  x: number; y: number;
  h: number; // heading, deg
  vx: number; vy: number; // velocity over the ground, m/s
  /** Speed through the water, m/s, and the current she's in (m/s, east and north). Omitted: still water, and her speed
   *  over the ground. (Rule 16.1's room is judged in the water, where the boats steer: a current they share changes
   *  nothing between them.) */
  v?: number; cur?: { x: number; y: number };
  tack: Tack;
  tacking: boolean; // past head to wind, not yet close-hauled
  lastTackT: number; // race time she last changed tack, tacking or gybing (rule 15: a change of tack, either way)
  /** Race time she last passed head to wind: a tack, not a gybe, which passes the wind astern (Definitions, Tack;
   *  rules 18.2(b) and 18.3 turn on it). Undefined: never. */
  headToWindT?: number;
  penalty: number; // degrees of penalty turn still to do
  ocs: boolean; // over early and not yet returned
  /**
   * Rule 21.1: after her starting signal, sailing towards the pre-start side of the starting line or one of its
   * extensions to start (over early, or not yet started: round an end, or above the line at the gun) or to comply with
   * rule 30.1, with her hull not yet completely on the pre-start side. Omitted: taken as `ocs`.
   */
  returning?: boolean;
  started: boolean;
  leg: number; // index of her next mark
  /** The wind she's sailing in (the true wind over the water where she is: her tack is judged from it). Omitted: the
   * course's wind (RulesContext.windFrom). */
  ww?: { from: number };
  /** Her heading RULE16_WINDOW seconds ago (for Rule 16.1). Omit if unknown. */
  headingAgo?: number;
  /** She is sailing above her proper course (for Rules 17 and 23). Omit if unknown. */
  aboveProper?: boolean;
  /** Moving astern, or sideways to windward, through the water by backing a sail (Rule 21.3). */
  backing?: boolean;
  /** She has finished (crossed the finishing line). */
  finished?: boolean;
  /**
   * She has finished and cleared the finishing line and marks, so she is no longer racing (Definitions, Racing: a boat
   * is racing "until she finishes and clears the finishing line and marks"), for rule 23.1. Omitted: as soon as she
   * has finished.
   */
  cleared?: boolean;
  /** She has retired (RET): no longer racing either (the definition of Racing; Rule 23.1). */
  retired?: boolean;
}

export interface RulesMark {
  name: string;
  p: Vec;
  type: 'round' | 'pass';
  /** True if the leg to this mark is a beat (Rule 18 doesn't apply between boats on opposite tacks there). */
  beat: boolean;
  /** Side to leave it on: 's' starboard, 'p' port. */
  side?: 's' | 'p';
  /** An island mark: how far its shore runs out from `p`, by ten-degree sector (see markDist). */
  reach?: number[];
}

export interface RulesContext {
  t: number; // race time, s (negative before the start signal)
  windFrom: number; // true wind direction, deg
  marks: RulesMark[]; // the course's mark sequence
  /** Close-hauled true wind angle, deg (for "fetching" a mark). Default 42. */
  beat?: number;
  /**
   * The nearest obstruction to a point (Rule 19): the shore, and after the start the committee boat. Distance (m) and
   * a unit vector pointing from it toward the water, or null if none is near. `committee`: include the committee boat.
   */
  obstacle?: (p: Vec, committee: boolean) => { d: number; n: Vec; continuing: boolean } | null;
  /**
   * Other boats that can be an obstruction to a pair (Definitions, Obstruction: "a boat racing is not an obstruction to
   * other boats unless they are required to keep clear of her"). The caller passes the fleet and who keeps clear of
   * whom (its own pair records); omitted, only the shore and the committee boat are obstructions.
   */
  fleet?: RulesBoat[];
  /** Must `a` keep clear of `c` (or, under rule 22, avoid her)? From the caller's per-pair verdicts. */
  keepsClearOf?: (a: RulesBoat, c: RulesBoat) => boolean;
}

export type RuleId = '10' | '11' | '12' | '13' | '15' | '16.1' | '16.2' | '17' | '18.2(a)' | '18.2(c)' | '18.3' | '18.4' | '19' | '20' | '21.1' | '21.2' | '21.3' | '23';

/** Who was where when the first of two boats reached the zone. */
export interface MarkRoomState {
  idx: number; // mark index in the course sequence
  overlapped: boolean;
  inside?: number; // boat id entitled to mark-room when overlapped
  ahead?: number; // boat id clear ahead when not overlapped
  /** Rule 18.2(b): the entitled boat has since passed head to wind or left the zone, so 18.2(a) no longer applies. */
  ended?: boolean;
  /** The entitled boat's headToWindT when mark-room began (to see her pass head to wind). */
  tackT?: number;
}

/** Per-pair memory the engine carries between steps. */
/** A boat's recent poses, as this pair has seen them: a ring of samples every 0.1 s (src/rules/pairs.ts recordPose). */
export interface PoseRing { t: Float64Array; x: Float64Array; y: Float64Array; h: Float64Array; v: Float64Array; n: number; i: number }

export interface PairRecord {
  /** Each boat's recent poses (rule 16.1's room to keep clear: where they were when the right-of-way boat began to turn). */
  hist?: Record<number, PoseRing>;
  kc: number | null; // id of the keep-clear boat at the last step
  rule: RuleId | null;
  grace: number; // Rule 15 grace lasts until this time
  by: number | null; // id of the boat that just acquired right of way
  byWhy: 'tack' | 'overlap' | 'rule21' | null;
  cool: number; // no new incident for this pair until this time
  mark: MarkRoomState | null;
  /** Rule 17: id of the boat that became overlapped to leeward from clear astern within two lengths. */
  r17: number | null;
  /** A hail between the pair: who hailed, when, and what. */
  hail: Hail | null;
  /** Rule 18.3: a boat that passed head to wind from port to starboard in the zone of a mark left to port, and the
   * mark. `binds`: the other boat had been on starboard since entering the zone, so 18.3(a) and (b) apply. */
  r183: { tacker: number; idx: number; binds: boolean } | null;
  /** Each boat's headToWindT at the previous step (to see her pass head to wind, rule 18.3). */
  seenTack: Record<number, number>;
  /** For each boat in the zone of the next mark: has she been on starboard tack since entering it? (Rule 18.3) */
  stbdInZone: Record<number, boolean>;
  /** Were they overlapped at the last step (to see an overlap begin)? */
  wasOverlapped: boolean;
  /**
   * How the present overlap began: which boat had been clear astern, which had just tacked, and at that moment who was
   * inside at the mark and whether the outside boat could give mark-room (Rule 18.2(d)), and who was inside at an
   * obstruction and whether the outside boat could give room there (Rule 19.2(b), and 19.2(c) at a continuing one).
   */
  ovStart: { t: number; astern: number | null; tacker: number | null; insideMark: number | null; markUnable: boolean; insideObst: number | null; obstUnable: boolean } | null;
  /**
   * Rule 20.2(e): from the time a boat hails for room to tack until she has tacked and avoided the hailed boat, rule
   * 18.2 does not apply between them. Kept apart from `hail` because it outlasts it: a hail can lapse (a breach is
   * called, or it goes stale) before the hailing boat has tacked and got clear.
   */
  r202e: { hailer: number; at: number } | null;
}

/** "Room to tack!" (Rule 20, approaching an obstruction) or "Starboard!" (a courtesy that helps the other boat react). */
export interface Hail {
  by: number; at: number; kind: 'room' | 'starboard';
  /** Rule 20.2(c): the hailed boat replied "You tack" at this time, and now owes the hailing boat room to tack and avoid her. */
  replyAt?: number;
  /** Her speed when she replied (taken at the first look after it): slowing down into the hailing boat's way is not giving room. */
  replyV?: number;
  /** When the hailed boat responded (tacked, or replied "You tack"). Rule 20.2(d): the hailing boat must then tack as soon as possible. */
  respondedAt?: number;
  /** When the hailed boat was through head to wind (or replied "You tack"): clear of her, the hailing boat can tack, and
   * rule 20.2(d)'s "as soon as possible" runs from here. (Starting to tack, respondedAt, is her response; the hailing
   * boat turning up under her while she's still swinging through the wind would only put them together.) */
  clearAt?: number;
  /** Each boat's heading, and the wind she had, when the hail was made: turned TACK_BEGUN° up from it, she has begun to
   * tack (pairs.ts begunTack). Omitted: only passing head to wind counts. */
  headAt?: Record<number, { h: number; wind: number }>;
  /** When the hailing boat began her tack (pairs.ts hailBreach), while she's in the act of it. */
  hailerBegunAt?: number;
  /**
   * Rule 20.3: the hailed boat, meaning to respond by tacking, passed the hail on to a boat on the same tack that stops
   * her tacking: that boat's id, when, and (kept up to date by the caller from that pair's record) when that boat
   * responded, or that she failed to. Until then the hailed boat can't tack, so she isn't late responding.
   */
  passedOn?: { to: number; at: number; /** when that boat was through head to wind (its hail's clearAt) */ respondedAt?: number; failed?: boolean };
  /** Rule 20.3: this hail is one passed on (she may hail even if it doesn't meet the conditions of rule 20.1). */
  relayed?: boolean;
}

// Timers start at −Infinity: race time is negative before the start signal, and incidents then must count too.
export const newPairRecord = (): PairRecord => ({ kc: null, rule: null, grace: -Infinity, by: null, byWhy: null, cool: -Infinity, mark: null, r17: null, hail: null, r183: null, seenTack: {}, stbdInZone: {}, wasOverlapped: false, ovStart: null, r202e: null });

export interface Verdict<B> { kc: B; rule: RuleId; mr?: MarkRoomState }

export type IncidentKind = 'contact' | 'swerve' | 'hail';
export interface Incident<B> {
  kind: IncidentKind;
  fouler: B;
  rule: RuleId;
  byWhy: 'tack' | 'overlap' | 'rule21' | null;
  /** Rule 16.1: how far (deg) the right-of-way boat turned toward the other boat just before. */
  turned?: number;
  /** Rule 20 hail incidents: whether the fouler was the hailed boat (didn't respond) or the hailing boat (didn't tack after the response). */
  hailRole?: 'hailed' | 'hailer';
  /** Which part of the rule: '19.2(b)' or '19.2(c)'; '23.1' or '23.2'. */
  part?: string;
  /** Rule 43.1(a): she broke the rule only because another boat's breach compelled her to: no penalty. The other boat's id. */
  exoneratedBy?: number;
  /** Part 2 preamble: the boat that broke the rule wasn't racing (before her preparatory signal, after a postponement or
   * abandonment, or finished and clear, or retired), so she isn't penalized for it. */
  notRacing?: boolean;
  verdict: Verdict<B>; // the plain right-of-way verdict at the moment of the incident
}
