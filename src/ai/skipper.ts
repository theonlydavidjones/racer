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
 * `legacyKnobs` is what the AI decided by before the skipper model: the same constants for every boat, and the dice
 * each boat already had. `knobsFor` maps a skipper's attributes to knobs: a mid-fleet club skipper (0.5 in each) gets
 * the legacy numbers, better ones see smaller shifts sooner, judge the laylines better, steer a truer groove, and so
 * on. The maps' ends are estimates (the science found no measured figures for most: the proposal, §1), and their
 * scale is what the calibration fits (SKIPPER_KNOBS), so that a club fleet spreads out and finishes in as consistent
 * an order as the real SF Folkboat fleet does (src/ai/fleetStats.ts, npm run calibrate).
 *
 * And her **mind**: what she believes, where it differs from the truth. Her judgements are lasting, not jitter: a
 * skipper who misjudges a layline misjudges it by the same few degrees until she's close enough to see better, and
 * a helm who sails a little low sails a little low all beat. Each is drawn when the judgement is made (each leg, each
 * start) from her own seeded generator, so a race replays exactly.
 */
import { makeRng, type Rng } from '../core/rng';
import { clamp } from '../core/math';

/** A skipper's attributes, each 0 (novice) … 1 (expert). */
export const SKIPPER_ATTRS = ['start', 'speed', 'strategy', 'tactics', 'rules', 'consistency', 'nerve'] as const;
export type SkipperAttr = typeof SKIPPER_ATTRS[number];
export type SkipperAttrs = Record<SkipperAttr, number>;

/** The numbers an AI skipper's decisions are made by (src/ai/ai.ts). */
export interface SkipperKnobs {
  /** Her layline judgement's error, deg (one standard deviation, far from the mark): the bias she judges this leg's
   * laylines by. Coaching sources: a layline called from far off can be out "by a lot" (Dellenbaugh, Windcheck). */
  layBiasSd: number;
  /** Her steering's lasting error upwind, deg (one standard deviation): sailing a beat a little high (pinching) or low
   * (footing). The Laser fleets' top ten make 3–8% more VMG upwind than the rest (Heliyon 2022, PMC9719898, Table 2). */
  grooveSd: number;
  /** Her error judging her time to the line at the start, s (one standard deviation). */
  startSd: number;
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
    layBiasSd: 0, grooveSd: 0, startSd: 0,
    // (a crew that reckons with the current allows for all of it, the others for some)
    currentShare: aware ? 1 : 0.6,
    // (a header of more than 4° held for more than 15 s, as the debrief judges a header worth tacking on: sim/debrief.ts)
    headerDeg: 4, headerHoldS: 15, headerTackRate: 0.35,
    dirtyAirS: 6,
    // (slow, heavy boats need time to respond: she starts keeping clear 12 s out)
    keepClearM: 14, keepClearS: 12
  };
}

/**
 * The scale of the attribute → knob maps and of a fleet's skill mix: what the calibration fits (docs/SKIPPER-MODEL-
 * PROPOSAL.md §4). Estimates until then.
 */
export const SKIPPER_KNOBS = {
  /** A club fleet: its skippers' mean ability, and how far apart they are (one standard deviation). */
  club: { level: 0.5, mix: 0.18 },
  /** How far each of a skipper's attributes strays from her overall ability (one standard deviation): profiles, not one number. */
  personal: 0.12,
  /** Layline error (deg, one s.d.) for an expert … a novice; overstanding is the commoner mistake (sailzing, Dellenbaugh). */
  layBias: [1, 8] as [number, number], layOverstand: 0.25,
  /** Steering's lasting error upwind (deg, one s.d.), expert … novice. */
  groove: [0.5, 5.5] as [number, number],
  /** Start timing error (s, one s.d.), expert … novice. */
  start: [1, 6] as [number, number],
  /** Her form on the day: each attribute's swing race to race (one s.d.), for the most … the least consistent. */
  form: [0.05, 0.2] as [number, number]
};

/** A string's 32-bit hash (FNV-1a): a boat's name gives her the same skipper every race (the owner, 12 November). */
export function hashName(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** A standard normal draw (Box–Muller). */
export function gauss(r: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** The skipper who sails the boat of this name, in a fleet of this level and mix: the same every race. */
export function skipperFor(name: string, fleet = SKIPPER_KNOBS.club): SkipperAttrs {
  const r = makeRng(hashName('skipper:' + name)), ability = fleet.level + fleet.mix * gauss(r);
  const sk = {} as SkipperAttrs;
  for (const a of SKIPPER_ATTRS) sk[a] = clamp(ability + SKIPPER_KNOBS.personal * gauss(r), 0, 1);
  return sk;
}

/** Her form on the day: her attributes, each swung a little for this race (the less consistent, the more). */
export function formFor(sk: SkipperAttrs, r: Rng): SkipperAttrs {
  const [lo, hi] = SKIPPER_KNOBS.form, sd = hi + (lo - hi) * sk.consistency, out = { ...sk };
  for (const a of SKIPPER_ATTRS) if (a !== 'consistency') out[a] = clamp(sk[a] + sd * gauss(r), 0, 1);
  return out;
}

/** From expert (1) to novice (0) along [expert, novice]. */
const by = (x: number, [e, n]: [number, number]) => n + (e - n) * x;
/** Her knobs from her attributes: a 0.5 skipper gets the legacy numbers. */
export function knobsFor(sk: SkipperAttrs): SkipperKnobs {
  const nerve = 1.3 - 0.6 * sk.nerve; // (more nerve, smaller margins: 0.5 gives today's)
  return {
    layBiasSd: by(sk.tactics, SKIPPER_KNOBS.layBias), grooveSd: by(sk.speed, SKIPPER_KNOBS.groove), startSd: by(sk.start, SKIPPER_KNOBS.start),
    currentShare: 0.4 + 0.6 * sk.strategy,
    headerDeg: 7 - 6 * sk.strategy, headerHoldS: 27 - 24 * sk.strategy, headerTackRate: 0.35,
    dirtyAirS: 10 - 8 * sk.tactics,
    keepClearM: 14 * nerve, keepClearS: 12 * nerve
  };
}

/** What she believes, where it isn't the truth (see the file's head). */
export interface Mind {
  rng: Rng;
  /** The leg these judgements are for. */
  leg: number;
  /** Her layline bias this leg, deg (+ = she'll overstand: she judges each tack's track below what it is). */
  layBias: number;
  /** Her groove this beat, deg (+ = footing, − = pinching). */
  groove: number;
  /** Her error judging her time to the line, s (+ = she thinks it'll take longer: she goes early). */
  startErr: number;
}
export function newMind(kn: SkipperKnobs, seed: number): Mind {
  const m: Mind = { rng: makeRng(seed), leg: -1, layBias: 0, groove: 0, startErr: 0 };
  m.startErr = kn.startSd * gauss(m.rng);
  return m;
}
/** A new leg: her layline judgement and her groove for it. */
export function judgeLeg(m: Mind, kn: SkipperKnobs, leg: number): void {
  m.leg = leg;
  m.layBias = kn.layBiasSd * (SKIPPER_KNOBS.layOverstand + gauss(m.rng));
  m.groove = kn.grooveSd * gauss(m.rng);
}
/** Her layline bias as she judges it at this distance from the mark (m): out by the full bias far off, by a quarter
 * inside about 10 lengths (75 m), where she can see it (Ed Adams: come in on the layline within about 10 lengths). */
export const layBiasAt = (m: Mind, d: number): number => m.layBias * clamp(d / 300, 0.25, 1);
