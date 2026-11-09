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
  /** Her heading RULE16_WINDOW seconds ago (for Rule 16.1). Omit if unknown. */
  headingAgo?: number;
  /** She is sailing above her proper course (for Rule 17). Omit if unknown. */
  aboveProper?: boolean;
}

export interface RulesMark {
  name: string;
  p: Vec;
  type: 'round' | 'pass';
  /** True if the leg to this mark is a beat (Rule 18 doesn't apply between boats on opposite tacks there). */
  beat: boolean;
  /** Side to leave it on: 's' starboard, 'p' port. */
  side?: 's' | 'p';
}

export interface RulesContext {
  t: number; // race time, s (negative before the start signal)
  windFrom: number; // true wind direction, deg
  marks: RulesMark[]; // the course's mark sequence
  /** Close-hauled true wind angle, deg (for "fetching" a mark). Default 42. */
  beat?: number;
}

export type RuleId = '10' | '11' | '12' | '13' | '15' | '16.1' | '17' | '18.2(b)' | '18.3' | '20' | '22.1' | '22.2';

/** Who was where when the first of two boats reached the zone. */
export interface MarkRoomState {
  idx: number; // mark index in the course sequence
  overlapped: boolean;
  inside?: number; // boat id entitled to mark-room when overlapped
  ahead?: number; // boat id clear ahead when not overlapped
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
  /** Rule 18.3: a boat that tacked from port to starboard in the zone of a port-hand windward mark, and the mark. */
  r183: { tacker: number; idx: number } | null;
  /** Each boat's lastTackT at the previous step (to see a tack happen). */
  seenTack: Record<number, number>;
}

/** "Room to tack!" (Rule 20, approaching an obstruction) or "Starboard!" (a courtesy that helps the other boat react). */
export interface Hail {
  by: number; at: number; kind: 'room' | 'starboard';
  /** Rule 20.2(c): the hailed boat replied "You tack" at this time, and now owes the hailing boat room to tack and avoid her. */
  replyAt?: number;
}

// Timers start at −Infinity: race time is negative before the start signal, and incidents then must count too.
export const newPairRecord = (): PairRecord => ({ kc: null, rule: null, grace: -Infinity, by: null, byWhy: null, cool: -Infinity, mark: null, r17: null, hail: null, r183: null, seenTack: {} });

export interface Verdict<B> { kc: B; rule: RuleId; mr?: MarkRoomState }

export type IncidentKind = 'contact' | 'swerve' | 'hail';
export interface Incident<B> {
  kind: IncidentKind;
  fouler: B;
  rule: RuleId;
  byWhy: 'tack' | 'overlap' | null;
  /** Rule 16.1: how far (deg) the right-of-way boat turned toward the other boat just before. */
  turned?: number;
  verdict: Verdict<B>; // the plain right-of-way verdict at the moment of the incident
}
