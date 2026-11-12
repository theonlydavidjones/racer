/**
 * The AI skipper (docs/SKIPPER-MODEL-PROPOSAL.md).
 *
 * Two layers:
 *  - **Attributes**: who she is as a sailor, 0 novice … 1 expert, in the terms a sailor would use (her starts, her
 *    boat speed at the helm, her strategy, her tactics, her rules knowledge, how consistent she is, her nerve in
 *    traffic). These come from the Yacht Club's fleet (its sliders) and are what the player sees and the
 *    calibration fits.
 *  - **Knobs**: the numbers the AI's decisions are made by (src/ai/ai.ts): how big a header she has to see and for how
 *    long before she tacks on it, how much of the current she allows for, how much room she keeps from a boat she must
 *    keep clear of, and so on. One set per boat.
 *
 * Phase 1 (this file as it stands) has only the knobs, set to exactly what the AI decided by before the skipper model
 * (`legacyKnobs`): the same constants for every boat, and the per-race dice each boat already had. Nothing sails
 * differently. Later phases map attributes to knobs (calibrated against the real SF fleet's results) and give each
 * skipper beliefs to act on in place of the true state.
 */

/** A skipper's attributes, each 0 (novice) … 1 (expert). */
export const SKIPPER_ATTRS = ['start', 'speed', 'strategy', 'tactics', 'rules', 'consistency', 'nerve'] as const;
export type SkipperAttr = typeof SKIPPER_ATTRS[number];
export type SkipperAttrs = Record<SkipperAttr, number>;

/** The numbers an AI skipper's decisions are made by (src/ai/ai.ts). */
export interface SkipperKnobs {
  /** How much of the tide's set she allows for, 0–1: on the approach to the line and when crabbing for a mark. */
  currentShare: number;
  /** A header she tacks on: her compass shows the wind at least this far (deg) from its minute's mean, upwind... */
  headerDeg: number;
  /** ...held for at least this long (s)... */
  headerHoldS: number;
  /** ...after which she tacks at this rate (per s: on average 1/rate seconds later), as a sailor makes up her mind. */
  headerTackRate: number;
  /** In another boat's dirty air this long (s) on a beat, she tacks for clear air. */
  dirtyAirS: number;
  /** She acts to keep clear of a boat when they'd come within this distance (m)... */
  keepClearM: number;
  /** ...within this time (s). */
  keepClearS: number;
}

/** The knobs as the AI had them before the skipper model: the same for every boat but for the current, from her dice. */
export function legacyKnobs(aware: boolean): SkipperKnobs {
  return {
    // (a crew that reckons with the current allows for all of it, the others for some)
    currentShare: aware ? 1 : 0.6,
    // (a header of more than 4° held for more than 15 s, as the debrief judges a header worth tacking on: sim/debrief.ts)
    headerDeg: 4, headerHoldS: 15, headerTackRate: 0.35,
    dirtyAirS: 6,
    // (slow, heavy boats need time to respond: she starts keeping clear 12 s out)
    keepClearM: 14, keepClearS: 12
  };
}
