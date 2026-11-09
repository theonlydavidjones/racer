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
  /** True if the leg to this mark is a beat (boats on opposite tacks there are outside the model). */
  beat: boolean;
}

export interface RulesContext {
  t: number; // race time, s (negative before the start signal)
  windFrom: number; // true wind direction, deg
  marks: RulesMark[]; // the course's mark sequence
}

export type RuleId = '10' | '11' | '12' | '13' | '15' | '16.1' | '17' | '18.2(b)' | '22.1' | '22.2';

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
}

// Timers start at −Infinity: race time is negative before the start signal, and incidents then must count too.
export const newPairRecord = (): PairRecord => ({ kc: null, rule: null, grace: -Infinity, by: null, byWhy: null, cool: -Infinity, mark: null, r17: null });

export interface Verdict<B> { kc: B; rule: RuleId; mr?: MarkRoomState }

export type IncidentKind = 'contact' | 'swerve';
export interface Incident<B> {
  kind: IncidentKind;
  fouler: B;
  rule: RuleId;
  byWhy: 'tack' | 'overlap' | null;
  /** Rule 16.1: how far (deg) the right-of-way boat turned toward the other boat just before. */
  turned?: number;
  verdict: Verdict<B>; // the plain right-of-way verdict at the moment of the incident
}
