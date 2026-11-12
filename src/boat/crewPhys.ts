import { D2R, clamp } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';
import { HULL } from './dynamics';
import { bestTrim, trimDrag, trimFromMoment } from './hullTrim';
import { polar } from './polar';

/**
 * The people aboard and where they put their weight. Each person has a place on the boat (across and fore-and-aft),
 * moves at a human pace after a human reaction time, tires when hiking, and goes where their job takes them (crewWork.ts:
 * the jib winch, the control lines on the cabin top, the jib car, the mast). The boat answers every move: heel and
 * righting moment (balance.ts), fore-and-aft trim, wetted surface and helm (hullTrim.ts), and so her speed.
 *
 * What a good crew does, by the conditions (and a less skilled one does less of, later and less well):
 * - light air upwind: to leeward and forward, to give her a little heel (the sails fall into shape, the transom lifts
 *   clear) — a novice sits in the middle;
 * - a moderate breeze: up on the windward side, sitting;
 * - only when she'd heel past her best: hiking, leaning out as far as it takes (taller crew reach further);
 * - downwind: the boat flat, weight forward in light air (the bow hand at the mast), aft as she speeds up;
 * - through a tack: a skilled crew roll-tacks: they stay on the old high side as she comes through the wind, so she
 *   heels onto the new leeward side, then cross fast and hike to snap her flat (the rig sweeps to windward through the
 *   air and the sails get a pull from it). RRS 42.3(b) (2025–2028): "A boat's crew may move their bodies to
 *   exaggerate the rolling that facilitates steering the boat through a tack or a gybe, provided that, just after the
 *   tack or gybe is completed, the boat's speed is not greater than it would have been in the absence of the tack or
 *   gybe." A novice crew crosses late and slowly.
 *
 * Hiking a Folkboat is limited by the class rules: upwind, the crew's body from mid-thigh to feet must stay inboard
 * of the sheer line, and no straps or hiking aids are allowed (NFIA Class Rules 2025–2028, CR 13.20; on a reach or a
 * run the legs may go over the side). So a hiker sits with the upper thigh over the deck edge, legs inside, feet braced
 * on the cockpit seat, and leans the upper body out. Where the weight is then, from body-segment proportions (Winter,
 * Biomechanics and Motor Control of Human Movement, table 4.1: head, arms and trunk 67.8% of the mass, their centre
 * 0.18 × height above the hip; thighs 20%, centre 0.43 of the thigh's 0.245 × height from the hip; shanks and feet
 * 12%): with the hip half a thigh outboard of the edge and the torso leaning out at angle λ, the body's centre is
 * (0.063 + 0.122·sin λ) × height outboard of the deck edge. Sitting up on the side deck with the legs in the cockpit,
 * the hip ~0.15 m inboard of the edge, it's 0.15 m + 0.056 × height inboard. Full hiking is about λ = 70°; a novice
 * leans out less. (The ORC VPP assumes 89 kg per crew; the class allows 2 or 3 aboard, 4 if three weigh ≤ 200 kg: CR 13.10.)
 *
 * Hiking tires the thighs (quasi-isometric quadriceps work at about 30% of maximum EMG: Vogiatzis, "The physiological
 * demands of 'hiking' on dinghy sailors", PhD thesis, Glasgow 1995, study I). On a hiking bench held to exhaustion,
 * sailors lasted 5.0–5.5 min untrained and 7.2–8.5 min after seven weeks' training (study II, p. 135), so a novice
 * here lasts about 5 min of full hiking and an expert about 8.5; fatigue builds as the square of how hard they hike
 * (a part hike tires far less: endurance falls steeply with effort), and recovers off the rail with a time constant of
 * a minute (quadriceps oxygenation and heart rate back within about 3 min: Vogiatzis p. 98), and a tired crew leans
 * out less. (A dinghy bench is harder than a Folkboat sit-out, so this is on the tiring side.)
 */

/** height (m), weight (kg), skill (0 novice … 1 expert; club-racing crew ≈ 0.6). */
export interface Person { h: number; w: number; skill?: number }
export interface CrewSpec { helm: Person; crew: Person[] } // 0, 1 or 2 crew besides the helm
export const DEFAULT_SKILL = 0.6;
export const DEFAULT_CREW: CrewSpec = { helm: { h: 1.78, w: 80 }, crew: [{ h: 1.75, w: 78 }, { h: 1.72, w: 72 }] };
export const skillOf = (p: Person) => clamp(p.skill ?? DEFAULT_SKILL, 0, 1);
/** The crew's skill: the average of the crew (alone: the helm's). */
const skillCache = new WeakMap<CrewSpec, number>();
export const crewSkill = (c?: { spec: CrewSpec }) => {
  if (!c) return DEFAULT_SKILL;
  let k = skillCache.get(c.spec);
  if (k == null) { k = c.spec.crew.length ? c.spec.crew.reduce((a, p) => a + skillOf(p), 0) / c.spec.crew.length : skillOf(c.spec.helm); skillCache.set(c.spec, k); }
  return k;
};

/** The hull and rig without people (the ORC sailing displacement includes about three crew, ~240 kg). */
export const HULL_EMPTY = orc.boat.displacementSailing - 240;
export const STANDARD_DISP = orc.boat.displacementSailing;

export type CrewMode = 'leeward' | 'centre' | 'windward' | 'hike' | 'downwind' | 'foredeck';
/** What a person's body is doing, for the figures: at the tiller, sitting, hiking, to leeward, crossing, at a winch, at the cabin-top lines, at the jib car, at the mast, sitting astride the bow forward of the forestay, sitting on the foredeck. */
export type Pose = 'helm' | 'sit' | 'hike' | 'lee' | 'cross' | 'winch' | 'piano' | 'car' | 'mast' | 'bow' | 'fore';
/** A person aboard. Positions in the boat's frame: x across (+ starboard), z fore-and-aft (+ aft, the bow at −3.84 m). */
export interface Aboard {
  /** The centre of their weight across the boat, m (+ starboard). */
  x: number;
  /** Fore and aft, m (+ aft). */
  z: number;
  /** How hard they're hiking (0 sitting … 1 leaning right out). */
  lean: number;
  pose: Pose;
  /** Their job (crewWork.ts), or null: free to go where the weight is wanted. */
  job: Job | null;
  /** Seconds until they act on a new call (reaction time), and the position they've decided on. */
  react: number; goal: { x: number; z: number } | null;
  /** 0 fresh … 1 spent (hiking). */
  fatigue: number;
}
/** A job: a line to work, the jib car to move, the pole; `reach` s still to get there; `work` s of work left (car, pole). */
export interface Job {
  line: string; reach: number; work: number; station: Station | null;
  /** (The jib car) the tack it was started on, and the pins it's going to. */
  side?: 'S' | 'P'; target?: { fore: number; ins: number };
  /** (A control line) where they're setting it. */
  to?: number;
  /** A trip a crew you've placed makes only for a big change (crewWork.ts PLACED_TRIP). */
  big?: boolean;
}
/** Where a job puts a person: across (m, + to windward), fore-and-aft (m), and how they're posed. */
export interface Station { arm: number; z: number; pose: Pose }
type Target = Station;

/** You placing the crew: across (to leeward, the middle, sitting up to windward, hiking) and fore-and-aft. null = their call. */
export type PlaceAcross = 'lee' | 'mid' | 'up' | 'hike';
export type PlaceFore = 'fwd' | 'mid' | 'aft';
export interface CrewPlace { across: PlaceAcross | null; fore: PlaceFore | null }

export interface CrewState {
  spec: CrewSpec;
  /** [helm, crew…]. */
  people: Aboard[];
  /** Where you've put them (absent: the crew's own call). */
  place?: CrewPlace;
  /** A roll tack in progress: holding the old high side, then flattening; and its clock. */
  roll?: { phase: 'lead' | 'hold' | 'flatten'; t: number } | null;
  /** The windward side last step (+1 starboard), to see a tack or gybe. */
  wind: number;
  // summaries, for the figures, the coach and tests
  /** The weight's average moment arm (m, + to windward). */
  arm: number;
  /** Fore and aft: the crew's average place, 0 at the helm … 1 at the mast. */
  fore: number;
  mode: CrewMode;
  /** 0..1: how hard the crew are hiking (the hardest of them). */
  hike: number;
  /** Everyone free is hiking as far as they can now (their own reach, by skill and how tired they are). */
  allOut?: boolean;
  /** The tack they were set up for. */
  side: 'S' | 'P';
  /** Trim (m, + bow down) their weight gives her, and the fore-and-aft moment (kg·m, + forward of the reference). */
  trim: number; trimMoment: number;
  /** The fore-and-aft place they've chosen (0 aft … 1 forward), and seconds until they think about it again. */
  fore01?: number; foreT?: number;
  /** Downwind, whether the bow-down trim with the bow hand at the mast pays (re-thought with the fore-and-aft place), and
   * whether, with the pole out, both crew right forward on the foredeck pays more: `layout`, and seconds since it changed. */
  layout?: 'cockpit' | 'mast' | 'foredeck'; layoutT?: number; vAvg?: number; twsAvg?: number; poleWas?: boolean;
  /** (true while both crew are right forward on the foredeck: the helm has the main then, crewWork.ts mainHand) */
  foredeck?: boolean;
  /** Where each wants to be (re-thought 20 times a second), and seconds until they think again. */
  tgt?: Target[]; decideT?: number;
  /** Where each has settled (HOLD: they stay there until a change is worth a move), the crew's clock (s), and what you'd set. */
  held?: (Held | null)[]; clock?: number; holdT?: number; settleT?: number; placeKey?: string;
  /** Seconds until they look round for the next job (crewWork.ts), and where they've wanted each cabin-top line lately. */
  jobT?: number; lineWant?: Record<string, number>; lineT?: number; lineSet?: Record<string, number>;
  /** (Everyone aboard, their weights and the total: worked out once.) */
  ppl?: Person[]; W?: number[]; total?: number; sitA?: number;
  /** They've sailed a step (before that, they're put on the side the wind is on, not sent across). */
  sailing?: boolean;
}

export const crewMass = (s: CrewSpec) => s.helm.w + s.crew.reduce((a, p) => a + p.w, 0);
export const displacement = (s: CrewSpec) => HULL_EMPTY + crewMass(s);
export const allAboard = (s: CrewSpec): Person[] => [s.helm, ...s.crew];

/**
 * Half-breadth of the deck at the sheer (m) at each station, from the class's construction plan (Scandinavian Sailing
 * Association / NFIA, Nordic Folkboat Construction Plan, 1:10, drawn 1947, rev. 3 July 2024, folkboat.com): station 1
 * at the transom, stations 500 mm apart forward, the widest (1100 mm, the 2.20 m class beam) at station 8; the stem
 * 7.64 m from the transom. In this frame (z + aft, the stem at −3.82) station n is at z = 3.82 − 0.5 (n − 1).
 */
const HALF_BREADTH = [0.655, 0.760, 0.860, 0.948, 1.017, 1.067, 1.094, 1.100, 1.080, 1.028, 0.955, 0.849, 0.705, 0.530, 0.315];
export function deckHalf(z: number): number {
  const n = (3.82 - z) / 0.5; // stations forward of station 1
  if (n <= 0) return HALF_BREADTH[0];
  if (n >= HALF_BREADTH.length - 1) return Math.max(0, HALF_BREADTH[HALF_BREADTH.length - 1] * (1 - (n - (HALF_BREADTH.length - 1)) / 1.28)); // to the stem
  const i = Math.floor(n), f = n - i;
  return HALF_BREADTH[i] * (1 - f) + HALF_BREADTH[i + 1] * f;
}
/**
 * Stations along the boat (m, + aft; the stem at −3.82): the helm at the tiller (sitting on the after deck or the
 * coaming's after end, just aft of the cockpit, which ends at station 3, z 2.82 (CR 3.22), legs down into its after
 * end and steering with the tiller extension: the owner's photos of Josephine and CircleSea under way, reference/photos), the cockpit's forward and after ends
 * where the crew sit, the cabin top's control lines at its after end, the mast (its forward face 2000 mm aft of where
 * the forestay meets the deck, which is 800 mm aft of the stem: construction plan, CR 6.1.7), and the jib cars (North
 * Sails' Nordic Folkboat tuning guide: the cabin-top lead 2.65 m from the forestay pin, the track centred 58 cm off the
 * centreline: on the cabin top about 0.6 m aft of the mast).
 */
export const Z = { helm: 2.95, cockpitFwd: 1.0, cockpitAft: 2.1, piano: 0.85, car: -3.82 + 0.8 + 2.65, mast: -0.95, gap: 0.6, bow: -3.82 + 0.8 - 0.3, foredeck: -2.0 };
/**
 * Deep downwind with the pole out in light air, the crew go right forward to put her bow down (the owner, who races
 * them: "normally people sit all the way up on the foredeck. usually one crew will sit in front of the forestay with both
 * legs dangling over, one on each side. the second crew sits down between the mast and the forestay"): `Z.bow` just
 * forward of where the forestay meets the deck (0.8 m aft of the stem), `Z.foredeck` between the mast and the forestay.
 * Whether it pays is the hull's trim (hullTrim.ts bestTrim), as for the bow hand at the mast.
 */
/** Half-beam at the sheer where the crew sit (between the cockpit's forward end and its middle), from the plan. */
export const EDGE = deckHalf(1.3);
/** Where the person moving a jib car kneels: on the side deck beside the cabin, reaching in to the track (58 cm out). */
export const CAR_ARM = 0.8;
/** The reference places (m) the polar is sailed from: the crew in the middle of the cockpit, the helm at the tiller. */
const zRef = (i: number, n: number) => (i === 0 ? Z.helm : n === 1 ? 1.5 : i === 1 ? 1.2 : 1.8);

/** Arms (m from the centreline, + to windward) for a person: sitting up on the side deck, hiking flat out (by the deck's
 * half-breadth `edge` where they are). */
export const sitArm = (p: Person, edge = EDGE) => edge - 0.15 - 0.056 * p.h;
export const hikeArm = (p: Person, lean = 1, edge = EDGE) => edge + (0.063 + 0.122 * Math.sin(70 * lean * D2R)) * p.h;
/** To leeward: sitting on the leeward side deck, legs in the cockpit (the mirror of sitting up to windward). */
export const leeArm = (p: Person, edge = EDGE) => -sitArm(p, edge);
/** The helm, aft at the tiller where the deck is narrower (its half-breadth there from the plan): sitting up, leaning out
 * as far as they will with a hand on the tiller extension, and to leeward. */
export const helmArms = (p: Person, fatigue = 0) => {
  const e = deckHalf(Z.helm);
  return { sit: sitArm(p, e), max: hikeArm(p, leanCap(p, fatigue), e), lee: leeArm(p, e) };
};

/** How far out a person will lean (0..1) for their skill and how tired they are. */
const leanCap = (p: Person, fatigue: number) => (0.55 + 0.45 * skillOf(p)) * (1 - 0.6 * fatigue);
/** Reaction time (s) to a new call: an expert ~0.4 s, a novice ~1.6 s (simple visual reaction is 0.2–0.3 s; choosing what to do takes longer). Estimates. */
export const reactTime = (p: Person) => 1.6 - 1.2 * skillOf(p);
/** Pace of a person's work and movement against a club crew (1 at skill 0.6): an expert ~1.3×, a novice ~0.55×. Estimate. */
export const pace = (p: Person) => 0.55 + 0.75 * skillOf(p);
/** Hiking endurance (s at a full hike) and recovery time constant (s): Vogiatzis 1995 (above). */
const ENDURE = (p: Person) => 300 + 210 * skillOf(p), RECOVER = 60;

export function newCrew(spec: CrewSpec, tack: 'S' | 'P'): CrewState {
  const w = tack === 'S' ? 1 : -1, n = spec.crew.length;
  const people: Aboard[] = allAboard(spec).map((p, i) => ({
    x: w * (i === 0 ? helmArms(p).sit : sitArm(p)), z: zRef(i, n), lean: 0, pose: i === 0 ? 'helm' : 'sit', job: null, react: 0, goal: null, fatigue: 0
  }));
  const c: CrewState = { spec, people, wind: w, arm: 0.6, fore: 0.4, mode: 'windward', hike: 0, side: tack, trim: 0, trimMoment: 0 };
  summarise(c, w);
  return c;
}

/** Pace of crew work for the number of hands (alone, the helm does it all with one hand on the tiller). */
export const handsFactor = (s: CrewSpec) => [0.5, 0.8, 1][Math.min(2, s.crew.length)];

/** The heel (deg) the crew sails her at, by their skill: a few degrees in light air, about 16° upwind in a breeze (a novice lets her heel more before doing anything about it), flat downwind. */
export function crewBestHeel(twa: number, tws: number, skill = DEFAULT_SKILL): number {
  if (twa > 120) return 1;
  return tws < 7 ? 6 : 16 + 4 * Math.max(0, 0.5 - clamp(skill, 0, 1)) / 0.5;
}

/** What the crew decide and do this step. */
export interface CrewCall {
  /** The crew moment (N·m, + to windward) that would hold her at the heel they want. */
  need: number;
  twa: number; tws: number;
  /** Boat speed (m/s), for where the weight goes fore and aft. */
  v: number;
  pole: boolean;
  tack: 'S' | 'P';
  /** +1 when the wind is over the starboard side. */
  windward: number;
  /** Close-hauled angle now (deg), to know when a tack is complete. */
  beat: number;
  /** Other weight's fore-and-aft moment (kg·m, + forward of the centre of flotation): an outboard on the transom. */
  extraMoment?: number;
  /** The waves' added resistance as a share of the calm-water resistance (hullTrim.ts: bow-down ploughs into a chop). */
  sea?: number;
  /** Her heel now (deg, + to leeward), for the roll tack's flatten: out hard until she's upright. */
  heel?: number;
  /** A tack is coming: she's turning up toward the wind to tack (a roll tack starts here). */
  tackComing?: boolean;
  /** Her stiffness here (N·m of righting moment per degree of heel), to size the crew's dead band (HOLD). */
  rmPerDeg?: number;
}

/**
 * The longest a crew holds the old high side once she's through the wind (s), before crossing under the boom as it
 * comes over. A 2-tonne keelboat's roll is a small one: the crew go across just after the boom, not seconds after it (the
 * owner, watching it: they sat on the old side long after she'd tacked). An estimate.
 */
export const ROLL_HOLD = 2;
/**
 * How often a crew moves. A real crew moves on a puff, a lull, a tack or a job, and otherwise sits still: coaches have
 * the crew hold a steady angle of heel, not a precise one (weight first in light to moderate air, and once the boat is
 * set up only small, smooth moves: Sailing World, North Sails, Yachting World on keelboat heel), and the main is played
 * for the short puffs. So each free person keeps the place they've settled in until the change the crew would make is
 * worth a move:
 * - `heel`: the move would change her heel by more than this many degrees if the crew all moved by it together (the
 *   dead band, sized by her stiffness there: about 0.18 m of arm each for three people on a Folkboat);
 * - `last`: and the change has lasted this long (s) — a flicker that's gone again isn't worth moving for (gusts mostly
 *   last under 20 s, WMO's gust is a 3 s mean; the gust-lull cycle on the water is about a minute: Bethwaite, High
 *   Performance Sailing);
 * - `dwell`: and, moving in, it's this long (s) since they last moved, so they don't shuffle back and forth;
 * - `urgent`: a puff that needs them out by this many dead bands is answered at once (only their reaction time):
 *   crews hike as a puff hits, and ease in on a lull when it has lasted. Hiking harder or easing on the rail is the
 *   body, not a move.
 * Through a tack or gybe and for `settle` s after, to a job, or where you've put them, they go at once. The numbers are estimates: no coaching
 * source gives them, and no count of a Folkboat crew's moves on a beat was found.
 */
export const HOLD = { heel: 2, last: 3, dwell: 10, urgent: 2, fore: 0.3, settle: 4 };
interface Held { arm: number; z: number; since: number; off: number }

/**
 * Where the crew go now, at a human pace. Each free person goes where the weight is wanted (or where you've put them);
 * a person on a job goes to its station.
 */
export function placeCrew(c: CrewState, k: CrewCall, dt: number): void {
  const s = c.spec, ppl = c.ppl ??= allAboard(s), W = c.W ??= ppl.map(p => p.w), total = c.total ??= W.reduce((a, b) => a + b, 0), n = s.crew.length;
  const w = k.windward;
  // the crew's skill: the average of the crew (alone: the helm's)
  const skill = n ? s.crew.reduce((a, p) => a + skillOf(p), 0) / n : skillOf(s.helm);
  // (the first time: they were set up on the side the wind is on)
  if (!c.sailing) { c.sailing = true; if (w !== c.wind) { for (const a of c.people) a.x = -a.x; c.wind = w; c.side = k.tack; } }
  // a tack or gybe: a skilled crew roll-tacks through the wind
  const tacked = w !== c.wind;
  // a roll tack starts as she luffs up to tack: they go up onto the windward side (in light air, from sitting to leeward)
  // so she rolls to windward through the wind
  const canRoll = skill >= 0.45 && c.place?.across == null;
  if (!tacked && k.tackComing && canRoll && !c.roll) c.roll = { phase: 'lead', t: 0 };
  if (tacked) {
    const through = k.twa < 90;
    c.roll = through && canRoll ? { phase: 'hold', t: 0 } : null;
    c.wind = w; c.side = k.tack;
  }
  if (c.roll) {
    c.roll.t += dt;
    // hold the old high side until she's well round onto the new tack (or a few seconds), then flatten hard
    if (c.roll.phase === 'lead' && (!k.tackComing && c.roll.t > 1 || c.roll.t > 8)) c.roll = null; // (no tack after all)
    else if (c.roll.phase === 'hold' && (k.twa > Math.min(k.beat - 12, 32) || c.roll.t > ROLL_HOLD)) { c.roll.phase = 'flatten'; c.roll.t = 0; }
    // (flattening her to upright: once she's there, or after a second and a half, they settle onto the new side)
    else if (c.roll.phase === 'flatten' && (c.roll.t > 1.6 || (k.heel != null && c.roll.t > 0.3 && k.heel < 1))) c.roll = null;
  }
  const downwind = k.twa > 120;
  // where everyone wants to be: thought about 20 times a second (far quicker than anyone reacts), and at once at a tack
  c.decideT = (c.decideT ?? 0) - dt;
  if (!c.tgt || c.decideT <= 0 || tacked || c.roll) {
    c.decideT = 0.05;
    // across: the average arm the crew want, as before by the conditions, by their skill
    const breeze = clamp((k.tws - 6) / 2, 0, 1);
    const HELM = helmArms(s.helm, c.people[0].fatigue);
    const maxes = ppl.map((p, i) => (i === 0 ? HELM.max : hikeArm(p, leanCap(p, c.people[i].fatigue)))), maxOf = (i: number) => maxes[i];
    const maxArm = ppl.reduce((a, p, i) => a + p.w * maxOf(i), 0) / total;
    const minArm = (s.helm.w * HELM.lee + s.crew.reduce((a, p) => a + p.w * leeArm(p), 0)) / total;
    const sit = (s.helm.w * HELM.sit + s.crew.reduce((a, p) => a + p.w * sitArm(p), 0)) / total;
    const needArm = k.need / (total * 9.81);
    let want = downwind ? clamp(needArm, minArm, maxArm)
      : breeze <= 0 ? clamp(needArm, minArm, maxArm) * smoothSkill(skill) + 0.1 * (1 - smoothSkill(skill)) // light air: a good crew as far to leeward as gives her the light-air heel; a novice in the middle
      : clamp(Math.max(needArm, sit * breeze), minArm, maxArm);
    const pl = c.place;
    if (pl?.across) want = pl.across === 'lee' ? minArm : pl.across === 'mid' ? 0.1 : pl.across === 'up' ? sit : maxArm;
    // fore and aft: the trim with least resistance (hullTrim.ts) for a skilled crew; a novice stays in the middle
    // (they think about it every second or so, not every moment)
    c.foreT = (c.foreT ?? 0) - Math.max(dt, 0.05); // (this runs 20 times a second)
    if (c.fore01 == null || c.foreT <= 0) { chooseFore(c, k, skill); c.foreT = 1; }
    const foreF = pl?.fore ? { fwd: 1, mid: 0.5, aft: 0 }[pl.fore] : c.fore01!;
    // downwind, a good crew goes forward: with the pole out and two crew, both right up on the foredeck as it goes out
    // (unless there's a breeze: chooseLayout); without it, the bow hand to the mast when the hull's trim says it pays
    // (hullTrim.ts: in light air the transom lifts clear). Re-thought once a second, moved back only for a real gain and
    // not within LAYOUT_STAY of the last move, so they don't shuttle along the deck; through a pole gybe they stay forward
    c.layoutT = (c.layoutT ?? 1e9) + Math.max(dt, 0.05);
    // (her speed over about a gust-lull cycle, a minute: the layout is for the wind there is, not each puff)
    c.vAvg = c.vAvg == null ? k.v : c.vAvg + (k.v - c.vAvg) * Math.min(1, Math.max(dt, 0.05) / 60);
    c.twsAvg = c.twsAvg == null ? k.tws : c.twsAvg + (k.tws - c.twsAvg) * Math.min(1, Math.max(dt, 0.05) / 60);
    const canGo = n > 0 && downwind && !pl?.fore && skill > 0.5;
    if (c.foreT === 1 && canGo) c.layout = chooseLayout(c, k, foreF);
    else if (!canGo) { c.layout = 'cockpit'; c.foredeck = false; }
    const atMast = c.layout === 'mast' || c.layout === 'foredeck', forward = c.layout === 'foredeck';
    // targets for each person: jobs first, then the helm, then the free crew share what's left of the wanted moment
    const tgt: Target[] = new Array(ppl.length);
    let fixedM = 0, freeW = 0;
    const free: number[] = [];
    c.people.forEach((a, i) => {
      const st = a.job?.station;
      if (st) { tgt[i] = { ...st }; fixedM += W[i] * st.arm; }
      else if (i === 0) { /* the helm: below */ }
      else if (i === n && forward) { tgt[i] = { arm: 0, z: Z.bow, pose: 'bow' }; }
      else if (i === n - 1 && forward) { tgt[i] = { arm: 0.15, z: Z.foredeck, pose: 'fore' }; fixedM += W[i] * 0.15; }
      else if (i === n && atMast) { tgt[i] = { arm: 0.25, z: Z.mast, pose: 'mast' }; fixedM += W[i] * 0.25; }
      else { free.push(i); freeW += W[i]; }
    });
    // the helm sits to windward at the tiller (to leeward in light air); leans out only when the crew can't do more
    const helmBusy = !!tgt[0];
    let helmArm = want < 0 ? HELM.lee : HELM.sit;
    if (pl?.across === 'lee') helmArm = HELM.lee;
    if (!helmBusy) fixedM += W[0] * helmArm;
    let crewArm = freeW > 0 ? (want * total - fixedM) / freeW : 0;
    if (!helmBusy && freeW > 0) {
      const crewMax = free.reduce((a, i) => a + W[i] * maxOf(i), 0) / freeW;
      if (crewArm > crewMax) { // the crew are out as far as they go: the helm leans out too
        const short = (crewArm - crewMax) * freeW;
        const h2 = clamp(helmArm + short / W[0], helmArm, HELM.max); crewArm = crewMax + (short - (h2 - helmArm) * W[0]) / freeW; helmArm = h2;
      }
    } else if (!helmBusy) helmArm = clamp((want * total - (fixedM - W[0] * helmArm)) / W[0], HELM.lee, HELM.max);
    if (!helmBusy) tgt[0] = { arm: helmArm, z: Z.helm, pose: 'helm' };
    // the free crew, front to back in the cockpit, sharing the moment (each within their own reach)
    // (where you've put them: each of them there, not just their average)
    const placed = pl?.across ? { lee: -Infinity, mid: 0.1, up: NaN, hike: Infinity }[pl.across] : null;
    free.forEach((i, j) => {
      const lo = leeArm(ppl[i]);
      const arm = placed == null ? clamp(crewArm, lo, maxOf(i)) : clamp(Number.isNaN(placed) ? sitArm(ppl[i]) : placed, lo, maxOf(i));
      const zf = Z.cockpitFwd + j * Z.gap, za = Z.cockpitAft - (free.length - 1 - j) * Z.gap;
      tgt[i] = { arm, z: za + (zf - za) * foreF, pose: arm < -0.05 ? 'lee' : arm > sitArm(ppl[i]) + 0.04 ? 'hike' : 'sit' };
    });
    // the roll tack: as she luffs up they're out on the windward side (in light air, from sitting to leeward), so she rolls
    // to windward through the wind and comes out heeled on the new tack; they hold there, then everyone out hard
    if (c.roll?.phase === 'lead') for (const i of free) tgt[i] = { arm: Math.max(c.people[i].x * w, sitArm(ppl[i])), z: c.people[i].z, pose: 'sit' };
    if (c.roll?.phase === 'hold') for (const i of free) tgt[i] = { arm: Math.min(c.people[i].x * w, -sitArm(ppl[i])), z: c.people[i].z, pose: 'sit' };
    if (c.roll?.phase === 'flatten') for (const i of free) tgt[i] = { arm: maxOf(i), z: tgt[i].z, pose: 'hike' };
    if (c.roll?.phase === 'hold' && !helmBusy) tgt[0] = { arm: c.people[0].x * w, z: Z.helm, pose: 'helm' };
    hold(c, tgt, k, tacked, W, maxOf);
    c.tgt = tgt;
  }
  c.clock = (c.clock ?? 0) + dt;
  const tgt = c.tgt;
  // move each person toward their target: decide (after a reaction time, for a big change), then go at a human pace
  c.people.forEach((a, i) => {
    const p = ppl[i], t = tgt[i], tx = t.arm * w, tz = t.z;
    const gx = a.goal ? a.goal.x : a.x, gz = a.goal ? a.goal.z : a.z;
    const big = Math.abs(tx - gx) > 0.25 || Math.abs(tz - gz) > 0.4;
    const rolling = c.roll?.phase === 'flatten' || (a.job && a.job.reach > 0);
    if (big && !rolling) {
      if (a.react <= 0 && a.goal && (Math.abs(tx - a.goal.x) > 0.25 || Math.abs(tz - a.goal.z) > 0.4)) a.react = reactTime(p);
      a.react -= dt;
      if (a.react <= 0) { setGoal(a, tx, tz); a.react = 0; }
      else if (!a.goal) a.goal = { x: a.x, z: a.z };
    } else { setGoal(a, tx, tz); a.react = 0; }
    const goal = a.goal!;
    // across: crossing the cockpit (ducking under the boom) about 1 m/s for a club crew; leaning out or in, about 0.7 m/s
    const crossing = Math.sign(goal.x) !== Math.sign(a.x) && Math.abs(goal.x - a.x) > 0.5;
    const vx = (crossing ? 1.0 : 0.7) * pace(p) * (c.roll?.phase === 'flatten' ? 1.3 : 1);
    a.x += clamp(goal.x - a.x, -vx * dt, vx * dt);
    a.z += clamp(goal.z - a.z, -0.6 * pace(p) * dt, 0.6 * pace(p) * dt);
    const arm = a.x * w;
    const he = i === 0 ? deckHalf(Z.helm) : EDGE;
    a.lean = clamp((arm - sitArm(p, he)) / Math.max(0.05, hikeArm(p, 1, he) - sitArm(p, he)), 0, 1);
    // (sitting, hiking or to leeward: by where they actually are, so the figure matches the weight)
    const free = t.pose === 'sit' || t.pose === 'hike' || t.pose === 'lee';
    const settled: Pose = free ? (arm < -0.05 ? 'lee' : a.lean > 0.05 ? 'hike' : 'sit') : t.pose;
    a.pose = Math.abs(goal.x - a.x) > 0.35 || Math.abs(goal.z - a.z) > 0.5 ? (crossing || Math.abs(goal.z - a.z) <= 0.5 ? 'cross' : t.pose) : settled;
    // fatigue: builds as the square of the effort against their endurance; recovers off the rail
    const e = downwind ? 0 : a.lean;
    a.fatigue = clamp(a.fatigue + dt * (e * e / ENDURE(p) - (1 - e) * a.fatigue / RECOVER), 0, 1);
  });
  summarise(c, w, downwind, k.pole, k.extraMoment ?? 0);
}

/**
 * The dead band (HOLD): each free person (and the helm, when not steering from a job) stays where they've settled
 * unless the new place is worth a move. Run as the crew decide (20 times a second); changes `tgt` in place.
 */
function hold(c: CrewState, tgt: Target[], k: CrewCall, tacked: boolean, W: number[], maxOf: (i: number) => number): void {
  const held = c.held ??= [], now = c.clock ?? 0, step = Math.max(0, now - (c.holdT ?? now));
  c.holdT = now;
  const key = c.place ? `${c.place.across}/${c.place.fore}` : '';
  // (through a tack or gybe and for a few seconds after, while they settle on the new side, they go where they're
  // wanted; where you've put them, they stay on your word, not their own judgment)
  if (tacked || c.roll) c.settleT = now;
  const reset = now - (c.settleT ?? -1e9) < HOLD.settle || key !== c.placeKey || !!c.place?.across;
  c.placeKey = key;
  // the arm a move has to be worth: the dead band's heel over her stiffness, as if the whole crew moved by it (with one
  // of them away at a job, a move by the rest is needed more, not less)
  const dead = HOLD.heel * (k.rmPerDeg ?? 250) / (9.81 * W.reduce((a, w) => a + w, 0));
  const ppl = c.ppl!;
  c.people.forEach((a, i) => {
    const t = tgt[i], h = held[i];
    // (at a job or the mast: settled afresh wherever they come back to)
    if (!t || a.job?.station || t.pose === 'mast' || t.pose === 'bow' || t.pose === 'fore') { held[i] = null; return; }
    // (and back from forward of the cockpit, the mast or the foredeck, they come all the way back, not stop on the way)
    if (reset || !h || a.z < Z.cockpitFwd - 0.5 || h.z < Z.cockpitFwd - 0.5) { held[i] = { arm: t.arm, z: t.z, since: 0, off: 0 }; return; }
    h.since += step;
    // (out on the rail, hiking harder in a puff and easing in a lull, or leaning in as they tire or sitting up on the rail
    // again, is the body, not a move)
    const sa = i === 0 ? helmArms(ppl[0]).sit : sitArm(ppl[i]);
    if (h.arm > sa + 0.04 && t.arm > sa - 0.02 && Math.abs(t.z - h.z) <= HOLD.fore) { h.arm = t.arm; h.z = t.z; return; }
    const dArm = Math.abs(t.arm - h.arm), dz = Math.abs(t.z - h.z), out = t.arm > h.arm;
    const worth = dArm > dead || dz > HOLD.fore;
    h.off = worth ? h.off + step : 0;
    // a puff that needs them out goes now (the reaction time is the only wait: they hike as it hits); a lull, or a
    // change of place for the trim, waits until it has lasted, and the dwell
    const go = (out && dArm > HOLD.urgent * dead) || (worth && h.off >= HOLD.last && (out || h.since >= HOLD.dwell));
    if (go) { h.arm = t.arm; h.z = t.z; h.since = 0; h.off = 0; return; }
    // (stay put: sitting, hiking or to leeward by where they stay, but no further out than they can reach now)
    h.arm = Math.min(h.arm, maxOf(i));
    t.arm = h.arm; t.z = h.z;
    if (i === 0) t.pose = 'helm';
    else if (t.pose === 'sit' || t.pose === 'hike' || t.pose === 'lee') t.pose = h.arm < -0.05 ? 'lee' : h.arm > sitArm(ppl[i]) + 0.04 ? 'hike' : 'sit';
  });
}

/** How far out a person can lean now, as a fraction of the span from sitting to a full hike (the scale `lean` is on):
 * their reach (skill, fatigue: leanCap) through the hiking geometry (hikeArm). */
const reachLean = (p: Person, fatigue: number, edge = EDGE) => {
  const sit = sitArm(p, edge); return clamp((hikeArm(p, leanCap(p, fatigue), edge) - sit) / Math.max(0.05, hikeArm(p, 1, edge) - sit), 0, 1);
};
/** (in place: this runs for everyone aboard every step) */
const setGoal = (a: Aboard, x: number, z: number) => { if (a.goal) { a.goal.x = x; a.goal.z = z; } else a.goal = { x, z }; };
const smoothSkill = (s: number) => { const t = clamp((s - 0.2) / 0.4, 0, 1); return t * t * (3 - 2 * t); };

/** The least time a crew stays in a fore-and-aft layout once they've moved to it (s): a trip to the foredeck is a few
 * metres along the deck, not undone on the next lull; longer than a gust-lull cycle (about a minute: Bethwaite). An
 * estimate. */
export const LAYOUT_STAY = 60;
/**
 * Where the crew go downwind: in the cockpit (at `foreF`), the bow hand at the mast, or (the pole out, two crew) one astride
 * the bow and one on the foredeck: the least resistance by the hull's trim (hullTrim.ts trimDrag), with hysteresis.
 */
function chooseLayout(c: CrewState, k: CrewCall, foreF: number): 'cockpit' | 'mast' | 'foredeck' {
  const cr = c.spec.crew, n = cr.length, m0 = k.extraMoment ?? 0, sea = k.sea ?? 0;
  const cockpitZ = (j: number, count: number) => { const zf = Z.cockpitFwd + j * Z.gap, za = Z.cockpitAft - (count - 1 - j) * Z.gap; return za + (zf - za) * foreF; };
  const dragAt = (v: number, zOf: (j: number) => number) => {
    let m = 0; cr.forEach((p, j) => { m += p.w * (zRef(j + 1, n) - zOf(j)); });
    return trimDrag(v, trimFromMoment(m0 + m), sea);
  };
  const now = c.layout ?? 'cockpit', settled = (c.layoutT ?? 1e9) >= LAYOUT_STAY;
  const go = (l: 'cockpit' | 'mast' | 'foredeck') => { if (l !== now) c.layoutT = 0; c.foredeck = l === 'foredeck'; return l; };
  const justOut = k.pole && !c.poleWas; c.poleWas = k.pole;
  if (k.pole && n >= 2) {
    // the pole out on a run: up on the foredeck is the norm (the owner; the Folk Boat Year Book 2022, p. 44: "crew weight
    // forward downwind in light to moderate weather to go bow down"), and they go as the pole goes out, not after a
    // stop at the mast. They stay aft (or come back) only in a breeze, where the bow-down trim plainly costs (hullTrim.ts:
    // she's near her hull speed and the bow digs in; the North Sails Dragon guide too: "When it's breezy, we bring the
    // forward person back to cockpit"): with this hull's resistance, from about 11 kt of true wind on a run (an estimate:
    // hullTrim.ts's wave term; the Year Book's "moderate" runs to about 16 kt, so this may be a knot or two early).
    // Judged at her wing-on-wing polar speed (polar.ts: knots in, m/s out) in the wind over the last minute, not each puff,
    // with a dead band (forward while it costs under 0.3%, back once it costs over 0.8%: about half a knot of wind) and LAYOUT_STAY between moves
    // (but straight up as the pole goes out), so in a gusty 13 kt they don't walk the deck with every puff and lull
    const vt = Math.max(0.5, polar(c.twsAvg ?? k.tws, k.twa, 'wing'));
    const cost = dragAt(vt, j => j === n - 1 ? Z.bow : j === n - 2 ? Z.foredeck : cockpitZ(j, n - 2)) - dragAt(vt, j => cockpitZ(j, n));
    if (now === 'foredeck') return go(cost > 0.008 && settled ? 'cockpit' : 'foredeck');
    return go(cost < 0.003 && (settled || justOut) ? 'foredeck' : now === 'mast' ? 'cockpit' : now);
  }
  // no pole: the bow hand to the mast when the hull's trim says it pays (at her speed over the last minute), for a real
  // gain (0.1%), not within LAYOUT_STAY of the last move (and off the foredeck at once when the pole's stowed: there's
  // nothing for them up there)
  const v = Math.max(0.5, c.vAvg ?? k.v);
  const cockpit = dragAt(v, j => cockpitZ(j, n)), mast = dragAt(v, j => j === n - 1 ? Z.mast : cockpitZ(j, n - 1));
  if (now === 'foredeck') return go(mast < cockpit ? 'mast' : 'cockpit');
  const cur = now === 'mast' ? mast : cockpit, best = Math.min(mast, cockpit), bestL = mast < cockpit ? 'mast' : 'cockpit';
  if (bestL !== now && cur - best > 0.001 && settled) return go(bestL);
  return go(now);
}

/** How far forward (0 aft … 1 forward of the cockpit) the crew sit: where the trim has the least resistance, for a skilled crew. */
function chooseFore(c: CrewState, k: CrewCall, skill: number): number {
  const n = c.spec.crew.length; if (!n) return 0.5;
  const best = bestTrim(Math.max(0.5, k.v), k.sea ?? 0), m0 = k.extraMoment ?? 0;
  // the crew's own moment over their range, against the trim it gives
  let f = 0.5, err = Infinity;
  for (let x = 0; x <= 1.0001; x += 0.125) {
    const t = trimFromMoment(m0 + momentOfCrewFore(c, x));
    const e = Math.abs(t - best); if (e < err - 1e-9) { err = e; f = x; }
  }
  const sk = smoothSkill(skill), want = 0.5 + (f - 0.5) * sk;
  // (a move along the cockpit for a real gain only, 0.05%: the drag is nearly straight in the trim, so the best place is
  // an end of the cockpit, and near the crossover it isn't worth the move. An estimate.)
  if (c.fore01 != null && Math.abs(want - c.fore01) > 1e-6) {
    const v = Math.max(0.5, k.v), sea = k.sea ?? 0, dOf = (x: number) => trimDrag(v, trimFromMoment(m0 + momentOfCrewFore(c, x)), sea);
    if (dOf(c.fore01) - dOf(want) < 0.0005) return c.fore01;
  }
  c.fore01 = want;
  return c.fore01;
}
/** The free crew's fore-and-aft moment (kg·m, + forward of their reference places) with them at `f` along the cockpit. */
function momentOfCrewFore(c: CrewState, f: number): number {
  const cr = c.spec.crew, n = cr.length; let m = 0;
  cr.forEach((p, j) => {
    const zf = Z.cockpitFwd + j * Z.gap, za = Z.cockpitAft - (n - 1 - j) * Z.gap;
    m += p.w * (zRef(j + 1, n) - (za + (zf - za) * f));
  });
  return m;
}

/** Work out the summaries (arm, fore, mode, hike, trim) from where everyone is. */
function summarise(c: CrewState, w: number, downwind = false, pole = false, extra = 0): void {
  // (plain loops: this runs every step for every boat)
  const ppl = c.ppl ??= allAboard(c.spec), total = c.total ??= crewMass(c.spec), n = c.spec.crew.length, P = c.people;
  let arm = 0, m = 0, hike = 0, fore = 0, mast = false, out = n > 0;
  for (let i = 0; i < P.length; i++) {
    const q = P[i], wt = ppl[i].w;
    arm += wt * q.x * w; m += wt * (zRef(i, n) - q.z);
    if (i > 0) {
      hike = Math.max(hike, q.lean); fore += clamp((Z.helm - q.z) / (Z.helm - Z.mast), 0, 1); if (q.pose === 'mast' || q.pose === 'bow' || q.pose === 'fore') mast = true;
      // (out as far as they can go now: their own reach, which tires; someone away at a job doesn't count either way)
      const onRail = q.pose === 'sit' || q.pose === 'hike' || q.pose === 'lee' || q.pose === 'cross';
      if (onRail && (q.pose !== 'hike' || q.lean < reachLean(ppl[i], q.fatigue) - 0.03)) out = false;
    }
  }
  c.allOut = n ? out : P[0].lean >= reachLean(ppl[0], P[0].fatigue, deckHalf(Z.helm)) - 0.03;
  c.arm = arm / total;
  c.trimMoment = m + extra; c.trim = trimFromMoment(m + extra, HULL.displacement);
  c.hike = n ? hike : P[0].lean;
  c.fore = n ? fore / n : 0;
  const sitA = c.sitA ??= (c.spec.helm.w * helmArms(c.spec.helm).sit + c.spec.crew.reduce((a, p) => a + p.w * sitArm(p), 0)) / total;
  c.mode = downwind ? (mast && (pole || n) ? 'foredeck' : 'downwind')
    : c.arm < -0.05 ? 'leeward' : c.arm < sitA * 0.6 ? 'centre' : c.hike > 0.08 ? 'hike' : 'windward';
}

/** The crew's righting moment (N·m, + to windward) at heel `heelDeg`: each person's weight times their arm. */
export const crewMoment = (c: CrewState, heelDeg: number) => crewMass(c.spec) * 9.81 * c.arm * Math.cos(heelDeg * D2R);

/** Speed factor from the displacement: a heavy boat is slower in light air (more to push), no matter in a breeze. */
export function displacementFactor(disp: number, tws: number): number {
  const k = clamp(0.16 - 0.009 * (tws - 4), 0, 0.16);
  return Math.pow(STANDARD_DISP / disp, k);
}

/**
 * (For the strategist's advice) where a good crew's weight goes fore and aft, 0 at the helm … 1 at the mast: downwind,
 * by the same test the crew uses on the water (placeCrew: forward to the mast while the hull's best trim at her speed is
 * more than 3 cm by the bow, hullTrim.ts), at the polar's speed; upwind, toward the front of the cockpit in light air.
 */
export function bestFore(twa: number, tws: number, pole: boolean): number {
  if (twa > 120) return bestTrim(Math.max(0.5, polar(tws, twa, pole ? 'wing' : 'jib')), 0) > 0.03 ? (pole ? 0.95 : 0.85) : 0.35;
  return tws < 7 ? 0.8 : tws < 13 ? 0.6 : 0.45;
}

/**
 * The righting moment (N·m, upright) of a crew all hiking as far as they reach (their skill, and how tired: `fatigue`
 * per person, helm first). The polar's crew: the ORC certificates the polar comes from declare 240–300 kg of crew; the
 * sim's standard three (DEFAULT_CREW, 230 kg) at a club crew's reach, fresh.
 */
export function hikingMoment(s: CrewSpec, fatigue: number[] = []): number {
  return 9.81 * (s.helm.w * helmArms(s.helm, fatigue[0] ?? 0).max + s.crew.reduce((a, p, i) => a + p.w * hikeArm(p, leanCap(p, fatigue[i + 1] ?? 0)), 0));
}
export const standardCrewMoment = () => hikingMoment(DEFAULT_CREW);
/** The righting moment (N·m, upright) of a crew sitting out on the windward deck, not hiking: the least a crew that's
 * sitting up to windward gives her (placeCrew). */
export function sittingMoment(s: CrewSpec): number {
  return 9.81 * (s.helm.w * helmArms(s.helm).sit + s.crew.reduce((a, p) => a + p.w * sitArm(p), 0));
}
