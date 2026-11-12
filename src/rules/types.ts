import type { Vec } from '../core/math';
import type { Tack } from '../boat/boat';

/** The rules engine only sees this slice of a boat. */
export interface RulesBoat {
  id: number;
  x: number; y: number;
  h: number; // heading, deg
  vx: number; vy: number; // velocity over the ground, m/s
  tack: Tack;
  tacking: boolean; // past head to wind, not yet close-hauled
  lastTackT: number; // race time she last passed head to wind
  penalty: number; // degrees of penalty turn still to do
  ocs: boolean; // over early and not yet returned
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
  /** The entitled boat's lastTackT when mark-room began (to see her pass head to wind). */
  tackT?: number;
}

/** Per-pair memory the engine carries between steps. */
export interface PairRecord {
  kc: number | null; // id of the keep-clear boat at the last step
  rule: RuleId | null;
  grace: number; // Rule 15 grace lasts until this time
  by: number | null; // id of the boat that just acquired right of way
  byWhy: 'tack' | 'overlap' | null;
  cool: number; // no new incident for this pair until this time
  mark: MarkRoomState | null;
  /** Rule 17: id of the boat that became overlapped to leeward from clear astern within two lengths. */
  r17: number | null;
  /** A hail between the pair: who hailed, when, and what. */
  hail: Hail | null;
  /** Rule 18.3: a boat that passed head to wind from port to starboard in the zone of a mark left to port, and the
   * mark. `binds`: the other boat had been on starboard since entering the zone, so 18.3(a) and (b) apply. */
  r183: { tacker: number; idx: number; binds: boolean } | null;
  /** Each boat's lastTackT at the previous step (to see a tack happen). */
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
  /** No new rule 23 blanketing call for this pair until this time (its own, so it doesn't stop contact or a hail being judged). */
  blanketCool: number;
  /**
   * Rule 23, interference by taking a boat's wind: how long (s) each boat has been blanketing the other (keyed by the
   * id of the boat doing it), and how the blanketing began (her turn just before, for 23.2's proper course).
   */
  blanket: Record<number, { since: number; turned: number }>;
}

/** "Room to tack!" (Rule 20, approaching an obstruction) or "Starboard!" (a courtesy that helps the other boat react). */
export interface Hail {
  by: number; at: number; kind: 'room' | 'starboard';
  /** Rule 20.2(c): the hailed boat replied "You tack" at this time, and now owes the hailing boat room to tack and avoid her. */
  replyAt?: number;
  /** When the hailed boat responded (tacked, or replied "You tack"). Rule 20.2(d): the hailing boat must then tack as soon as possible. */
  respondedAt?: number;
  /**
   * Rule 20.3: the hailed boat, meaning to respond by tacking, passed the hail on to a boat on the same tack that stops
   * her tacking: that boat's id, when, and (kept up to date by the caller from that pair's record) when that boat
   * responded, or that she failed to. Until then the hailed boat can't tack, so she isn't late responding.
   */
  passedOn?: { to: number; at: number; respondedAt?: number; failed?: boolean };
  /** Rule 20.3: this hail is one passed on (she may hail even if it doesn't meet the conditions of rule 20.1). */
  relayed?: boolean;
}

// Timers start at −Infinity: race time is negative before the start signal, and incidents then must count too.
export const newPairRecord = (): PairRecord => ({ kc: null, rule: null, grace: -Infinity, by: null, byWhy: null, cool: -Infinity, mark: null, r17: null, hail: null, r183: null, seenTack: {}, stbdInZone: {}, wasOverlapped: false, ovStart: null, r202e: null, blanketCool: -Infinity, blanket: {} });

export interface Verdict<B> { kc: B; rule: RuleId; mr?: MarkRoomState }

/** 'blanket': she took the other boat's wind (Rule 23's interference without contact). */
export type IncidentKind = 'contact' | 'swerve' | 'hail' | 'blanket';
export interface Incident<B> {
  kind: IncidentKind;
  fouler: B;
  rule: RuleId;
  byWhy: 'tack' | 'overlap' | null;
  /** Rule 16.1: how far (deg) the right-of-way boat turned toward the other boat just before. */
  turned?: number;
  /** Rule 20 hail incidents: whether the fouler was the hailed boat (didn't respond) or the hailing boat (didn't tack after the response). */
  hailRole?: 'hailed' | 'hailer';
  /** Which part of the rule: '19.2(b)' or '19.2(c)'; '23.1' or '23.2'. */
  part?: string;
  /** Rule 43.1(a): she broke the rule only because another boat's breach compelled her to: no penalty. The other boat's id. */
  exoneratedBy?: number;
  verdict: Verdict<B>; // the plain right-of-way verdict at the moment of the incident
}
