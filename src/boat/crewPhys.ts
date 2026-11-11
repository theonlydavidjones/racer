import { D2R, clamp } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';
import { HULL } from './dynamics';
import { bestTrim, trimFromMoment } from './hullTrim';

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
 *   air and the sails get a pull from it: RRS 42.3(b) allows it so long as she's no faster just after the tack than
 *   she'd have been without it). A novice crew crosses late and slowly.
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
 * Hiking tires the thighs (quasi-isometric quadriceps work): sailors hold a full hike on a hiking bench about 200 s
 * (less highly ranked) to 300 s (highly ranked) before failure (Vogiatzis et al., hiking endurance; secondary
 * summaries). Here a person's fatigue builds as the square of how hard they hike against that endurance and recovers
 * over a couple of minutes off the rail (the recovery time is an estimate), and a tired crew leans out less.
 */

/** height (m), weight (kg), skill (0 novice … 1 expert; club-racing crew ≈ 0.6). */
export interface Person { h: number; w: number; skill?: number }
export interface CrewSpec { helm: Person; crew: Person[] } // 0, 1 or 2 crew besides the helm
export const DEFAULT_SKILL = 0.6;
export const DEFAULT_CREW: CrewSpec = { helm: { h: 1.78, w: 80 }, crew: [{ h: 1.75, w: 78 }, { h: 1.72, w: 72 }] };
export const skillOf = (p: Person) => clamp(p.skill ?? DEFAULT_SKILL, 0, 1);
/** The crew's skill: the average of the crew (alone: the helm's). */
export const crewSkill = (c?: { spec: CrewSpec }) => !c ? DEFAULT_SKILL : c.spec.crew.length ? c.spec.crew.reduce((a, p) => a + skillOf(p), 0) / c.spec.crew.length : skillOf(c.spec.helm);

/** The hull and rig without people (the ORC sailing displacement includes about three crew, ~240 kg). */
export const HULL_EMPTY = orc.boat.displacementSailing - 240;
export const STANDARD_DISP = orc.boat.displacementSailing;

export type CrewMode = 'leeward' | 'centre' | 'windward' | 'hike' | 'downwind' | 'foredeck';
/** What a person's body is doing, for the figures: at the tiller, sitting, hiking, to leeward, crossing, at a winch, at the cabin-top lines, at the jib car, at the mast. */
export type Pose = 'helm' | 'sit' | 'hike' | 'lee' | 'cross' | 'winch' | 'piano' | 'car' | 'mast';
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
}
/** Where a job puts a person: across (m, + to windward), fore-and-aft (m), and how they're posed. */
export interface Station { arm: number; z: number; pose: Pose }

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
  roll?: { phase: 'hold' | 'flatten'; t: number } | null;
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
  /** The tack they were set up for. */
  side: 'S' | 'P';
  /** Trim (m, + bow down) their weight gives her, and the fore-and-aft moment (kg·m, + forward of the reference). */
  trim: number; trimMoment: number;
  /** The fore-and-aft place they've chosen (0 aft … 1 forward), and seconds until they think about it again. */
  fore01?: number; foreT?: number;
  /** They've sailed a step (before that, they're put on the side the wind is on, not sent across). */
  sailing?: boolean;
}

export const crewMass = (s: CrewSpec) => s.helm.w + s.crew.reduce((a, p) => a + p.w, 0);
export const displacement = (s: CrewSpec) => HULL_EMPTY + crewMass(s);
export const allAboard = (s: CrewSpec): Person[] => [s.helm, ...s.crew];

/** Half-beam at the sheer abreast the cockpit (m): the class's 2.20 m beam is just forward of it (an estimate from the hull's shape). */
export const EDGE = 1.05;
/** Stations along the boat (m, + aft; the bow at −3.84): the helm at the tiller, the cockpit's forward and after ends where the crew sit, the cabin top's control lines at its after end, the jib cars (North Sails' Folkboat guide: the cabin-top lead 2.65 m from the forestay, the track 58 cm off the centreline), the mast. */
export const Z = { helm: 2.7, cockpitFwd: 1.0, cockpitAft: 2.1, piano: 0.85, car: -1.0, mast: -0.95, gap: 0.6 };
/** Where the person moving a jib car kneels: on the side deck beside the cabin, reaching the track (58 cm out) on its top. */
export const CAR_ARM = 0.8;
/** The reference places (m) the polar is sailed from: the crew in the middle of the cockpit, the helm at the tiller. */
const zRef = (i: number, n: number) => (i === 0 ? Z.helm : n === 1 ? 1.5 : i === 1 ? 1.2 : 1.8);

/** Arms (m from the centreline, + to windward) for a person: sitting up on the side deck, hiking flat out, to leeward. */
export const sitArm = (p: Person) => EDGE - 0.15 - 0.056 * p.h;
export const hikeArm = (p: Person, lean = 1) => EDGE + (0.063 + 0.122 * Math.sin(70 * lean * D2R)) * p.h;
export const LEE_ARM = -0.55;
/** The helm, aft at the tiller where the boat is narrower (half-beam ~0.8 m there): sitting, leaning out, to leeward. */
const HELM = { sit: 0.55, max: 0.85, lee: -0.35 };

/** How far out a person will lean (0..1) for their skill and how tired they are. */
const leanCap = (p: Person, fatigue: number) => (0.55 + 0.45 * skillOf(p)) * (1 - 0.6 * fatigue);
/** Reaction time (s) to a new call: an expert ~0.4 s, a novice ~1.6 s (simple visual reaction is 0.2–0.3 s; choosing what to do takes longer). Estimates. */
export const reactTime = (p: Person) => 1.6 - 1.2 * skillOf(p);
/** Pace of a person's work and movement against a club crew (1 at skill 0.6): an expert ~1.3×, a novice ~0.55×. Estimate. */
export const pace = (p: Person) => 0.55 + 0.75 * skillOf(p);
/** Hiking endurance (s at a full hike): ~200 s for less and ~300 s for highly ranked sailors (hiking-bench studies); recovery off the rail (estimate). */
const ENDURE = (p: Person) => 200 + 100 * skillOf(p), RECOVER = 120;

export function newCrew(spec: CrewSpec, tack: 'S' | 'P'): CrewState {
  const w = tack === 'S' ? 1 : -1, n = spec.crew.length;
  const people: Aboard[] = allAboard(spec).map((p, i) => ({
    x: w * (i === 0 ? HELM.sit : sitArm(p)), z: zRef(i, n), lean: 0, pose: i === 0 ? 'helm' : 'sit', job: null, react: 0, goal: null, fatigue: 0
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
}

/**
 * Where the crew go now, at a human pace. Each free person goes where the weight is wanted (or where you've put them);
 * a person on a job goes to its station.
 */
export function placeCrew(c: CrewState, k: CrewCall, dt: number): void {
  const s = c.spec, ppl = allAboard(s), W = ppl.map(p => p.w), total = W.reduce((a, b) => a + b, 0), n = s.crew.length;
  const w = k.windward;
  // the crew's skill: the average of the crew (alone: the helm's)
  const skill = n ? s.crew.reduce((a, p) => a + skillOf(p), 0) / n : skillOf(s.helm);
  // (the first time: they were set up on the side the wind is on)
  if (!c.sailing) { c.sailing = true; if (w !== c.wind) { for (const a of c.people) a.x = -a.x; c.wind = w; c.side = k.tack; } }
  // a tack or gybe: a skilled crew roll-tacks through the wind
  if (w !== c.wind) {
    const through = k.twa < 90;
    c.roll = through && skill >= 0.45 && c.place?.across == null ? { phase: 'hold', t: 0 } : null;
    c.wind = w; c.side = k.tack;
  }
  if (c.roll) {
    c.roll.t += dt;
    // hold the old high side until she's well round onto the new tack (or a few seconds), then flatten hard
    if (c.roll.phase === 'hold' && (k.twa > Math.min(k.beat - 12, 32) || c.roll.t > 3.5)) { c.roll.phase = 'flatten'; c.roll.t = 0; }
    else if (c.roll.phase === 'flatten' && c.roll.t > 1.6) c.roll = null;
  }
  const downwind = k.twa > 120;
  // across: the average arm the crew want, as before by the conditions, by their skill
  const breeze = clamp((k.tws - 6) / 2, 0, 1);
  const maxes = ppl.map((p, i) => (i === 0 ? HELM.max : hikeArm(p, leanCap(p, c.people[i].fatigue)))), maxOf = (i: number) => maxes[i];
  const maxArm = ppl.reduce((a, p, i) => a + p.w * maxOf(i), 0) / total;
  const minArm = (s.helm.w * HELM.lee + s.crew.reduce((a, p) => a + p.w * LEE_ARM, 0)) / total;
  const sit = (s.helm.w * HELM.sit + s.crew.reduce((a, p) => a + p.w * sitArm(p), 0)) / total;
  const needArm = k.need / (total * 9.81);
  let want = downwind ? clamp(needArm, minArm, maxArm)
    : breeze <= 0 ? clamp(Math.min(needArm, -0.3), minArm, 0) * smoothSkill(skill) + 0.1 * (1 - smoothSkill(skill)) // light air: a good crew to leeward, a novice in the middle
    : clamp(Math.max(needArm, sit * breeze), minArm, maxArm);
  const pl = c.place;
  if (pl?.across) want = pl.across === 'lee' ? minArm : pl.across === 'mid' ? 0.1 : pl.across === 'up' ? sit : maxArm;
  // fore and aft: the trim with least resistance (hullTrim.ts) for a skilled crew; a novice stays in the middle
  // (they think about it every second or so, not every moment)
  c.foreT = (c.foreT ?? 0) - dt;
  if (c.fore01 == null || c.foreT <= 0) { chooseFore(c, k, skill); c.foreT = 1; }
  const foreF = pl?.fore ? { fwd: 1, mid: 0.5, aft: 0 }[pl.fore] : c.fore01!;
  // the bow hand goes to the mast downwind in light air (or for the pole), if they know to
  const atMast = n > 0 && downwind && (k.pole || (k.tws < 10 && skill > 0.5 && foreF > 0.8));
  // targets for each person: jobs first, then the helm, then the free crew share what's left of the wanted moment
  const tgt: { arm: number; z: number; pose: Pose }[] = new Array(ppl.length);
  let fixedM = 0, freeW = 0;
  const free: number[] = [];
  c.people.forEach((a, i) => {
    const st = a.job?.station;
    if (st) { tgt[i] = { ...st }; fixedM += W[i] * st.arm; }
    else if (i === 0) { /* the helm: below */ }
    else if (i === n && atMast) { tgt[i] = { arm: 0.25, z: Z.mast, pose: 'mast' }; fixedM += W[i] * 0.25; }
    else { free.push(i); freeW += W[i]; }
  });
  // the helm sits to windward at the tiller (to leeward in light air); leans out only when the crew can't do more
  const helmBusy = !!tgt[0];
  let helmArm = want < 0 ? HELM.lee : HELM.sit;
  if (pl?.across === 'lee') helmArm = HELM.lee;
  if (!helmBusy) fixedM += W[0] * helmArm;
  let crewArm = freeW > 0 ? (want * total - fixedM) / freeW : 0;
  const lo = LEE_ARM;
  if (!helmBusy && freeW > 0) {
    const crewMax = free.reduce((a, i) => a + W[i] * maxOf(i), 0) / freeW;
    if (crewArm > crewMax) { // the crew are out as far as they go: the helm leans out too
      const short = (crewArm - crewMax) * freeW;
      const h2 = clamp(helmArm + short / W[0], helmArm, HELM.max); crewArm = crewMax + (short - (h2 - helmArm) * W[0]) / freeW; helmArm = h2;
    }
  } else if (!helmBusy) helmArm = clamp((want * total - (fixedM - W[0] * helmArm)) / W[0], HELM.lee, HELM.max);
  if (!helmBusy) tgt[0] = { arm: helmArm, z: Z.helm, pose: 'helm' };
  // the free crew, front to back in the cockpit, sharing the moment (each within their own reach)
  free.forEach((i, j) => {
    const arm = clamp(crewArm, lo, maxOf(i));
    const zf = Z.cockpitFwd + j * Z.gap, za = Z.cockpitAft - (free.length - 1 - j) * Z.gap;
    tgt[i] = { arm, z: za + (zf - za) * foreF, pose: arm < -0.05 ? 'lee' : arm > sitArm(ppl[i]) + 0.04 ? 'hike' : 'sit' };
  });
  // the roll tack: holding the old high side (now the low side) as she comes through the wind, then everyone out hard
  if (c.roll?.phase === 'hold') for (const i of free) tgt[i] = { arm: c.people[i].x * w, z: c.people[i].z, pose: 'sit' };
  if (c.roll?.phase === 'flatten') for (const i of free) tgt[i] = { arm: maxOf(i), z: tgt[i].z, pose: 'hike' };
  if (c.roll?.phase === 'hold' && !helmBusy) tgt[0] = { arm: c.people[0].x * w, z: Z.helm, pose: 'helm' };
  // move each person toward their target: decide (after a reaction time, for a big change), then go at a human pace
  c.people.forEach((a, i) => {
    const p = ppl[i], t = tgt[i], tx = t.arm * w, tz = t.z;
    const g = a.goal ?? { x: a.x, z: a.z };
    const big = Math.abs(tx - g.x) > 0.25 || Math.abs(tz - g.z) > 0.4;
    const rolling = c.roll?.phase === 'flatten' || (a.job && a.job.reach > 0);
    if (big && !rolling) {
      if (a.react <= 0 && a.goal && (Math.abs(tx - a.goal.x) > 0.25 || Math.abs(tz - a.goal.z) > 0.4)) a.react = reactTime(p);
      a.react -= dt;
      if (a.react <= 0) { a.goal = { x: tx, z: tz }; a.react = 0; }
      else if (!a.goal) a.goal = { x: a.x, z: a.z };
    } else { a.goal = { x: tx, z: tz }; a.react = 0; }
    const goal = a.goal!;
    // across: crossing the cockpit (ducking under the boom) about 1 m/s for a club crew; leaning out or in, about 0.7 m/s
    const crossing = Math.sign(goal.x) !== Math.sign(a.x) && Math.abs(goal.x - a.x) > 0.5;
    const vx = (crossing ? 1.0 : 0.7) * pace(p) * (c.roll?.phase === 'flatten' ? 1.3 : 1);
    a.x += clamp(goal.x - a.x, -vx * dt, vx * dt);
    a.z += clamp(goal.z - a.z, -0.6 * pace(p) * dt, 0.6 * pace(p) * dt);
    const arm = a.x * w;
    a.lean = i === 0 ? clamp((arm - HELM.sit) / (HELM.max - HELM.sit), 0, 1) : clamp((arm - sitArm(p)) / Math.max(0.05, hikeArm(p) - sitArm(p)), 0, 1);
    a.pose = Math.abs(goal.x - a.x) > 0.35 || Math.abs(goal.z - a.z) > 0.5 ? (crossing || Math.abs(goal.z - a.z) <= 0.5 ? 'cross' : t.pose) : t.pose === 'hike' && a.lean < 0.05 ? 'sit' : t.pose;
    // fatigue: builds as the square of the effort against their endurance; recovers off the rail
    const e = downwind ? 0 : a.lean;
    a.fatigue = clamp(a.fatigue + dt * (e * e / ENDURE(p) - (1 - e) * a.fatigue / RECOVER), 0, 1);
  });
  summarise(c, w, downwind, k.pole, k.extraMoment ?? 0);
}

const smoothSkill = (s: number) => { const t = clamp((s - 0.2) / 0.4, 0, 1); return t * t * (3 - 2 * t); };

/** How far forward (0 aft … 1 forward of the cockpit) the crew sit: where the trim has the least resistance, for a skilled crew. */
function chooseFore(c: CrewState, k: CrewCall, skill: number): number {
  const n = c.spec.crew.length; if (!n) return 0.5;
  const best = bestTrim(Math.max(0.5, k.v)), m0 = k.extraMoment ?? 0;
  // the crew's own moment over their range, against the trim it gives
  let f = 0.5, err = Infinity;
  for (let x = 0; x <= 1.0001; x += 0.125) {
    const t = trimFromMoment(m0 + momentOfCrewFore(c, x));
    const e = Math.abs(t - best); if (e < err - 1e-9) { err = e; f = x; }
  }
  const sk = smoothSkill(skill);
  c.fore01 = 0.5 + (f - 0.5) * sk;
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
  const ppl = allAboard(c.spec), total = crewMass(c.spec), n = c.spec.crew.length;
  c.arm = c.people.reduce((a, q, i) => a + ppl[i].w * q.x * w, 0) / total;
  let m = 0; c.people.forEach((q, i) => { m += ppl[i].w * (zRef(i, n) - q.z); });
  c.trimMoment = m + extra; c.trim = trimFromMoment(m + extra, HULL.displacement);
  const crew = c.people.slice(1);
  c.hike = crew.length ? Math.max(...crew.map(q => q.lean)) : c.people[0].lean;
  c.fore = crew.length ? crew.reduce((a, q) => a + clamp((Z.helm - q.z) / (Z.helm - Z.mast), 0, 1), 0) / crew.length : 0;
  const sitA = (c.spec.helm.w * HELM.sit + c.spec.crew.reduce((a, p) => a + p.w * sitArm(p), 0)) / total;
  c.mode = downwind ? (crew.some(q => q.pose === 'mast') && (pole || n) ? 'foredeck' : 'downwind')
    : c.arm < -0.05 ? 'leeward' : c.arm < sitA * 0.6 ? 'centre' : c.hike > 0.08 ? 'hike' : 'windward';
}

/** The crew's righting moment (N·m, + to windward) at heel `heelDeg`: each person's weight times their arm. */
export const crewMoment = (c: CrewState, heelDeg: number) => crewMass(c.spec) * 9.81 * c.arm * Math.cos(heelDeg * D2R);

/** Speed factor from the displacement: a heavy boat is slower in light air (more to push), no matter in a breeze. */
export function displacementFactor(disp: number, tws: number): number {
  const k = clamp(0.16 - 0.009 * (tws - 4), 0, 0.16);
  return Math.pow(STANDARD_DISP / disp, k);
}

/** (For the strategist's advice) where a good crew's weight goes fore and aft, 0 at the helm … 1 at the mast. */
export function bestFore(twa: number, tws: number, pole: boolean): number {
  if (twa > 120) return tws > 17 ? 0.35 : pole ? 0.95 : 0.85;
  return tws < 7 ? 0.8 : tws < 13 ? 0.6 : 0.45;
}
