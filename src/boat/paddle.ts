import type { Boat } from './boat';
import { workPace, ownerOf } from './crewWork';
import { attrOf, crewSkill, type Aboard, type Person } from './crewPhys';
import { HOVE, yawDamping } from './physics';
import { D2R } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';

/**
 * Paddling her with the boom crutch (ROADMAP 8c, the owner's "time to paddle"): one of the crew fetches the crutch from
 * the cabin and paddles over the side called, port or starboard, pushing her along and turning her (paddling on one
 * side swings her bow away from it). A good crew does it unasked in a jam (world.ts crewPaddleCall): no wind to sail
 * by and the stream setting her onto a pier, a mark or the shore.
 *
 * The numbers (none published for paddling a keelboat with a crutch: the researcher, 13 Nov 2026):
 * - POWER: what one person puts into a paddle, and how long they keep it up: the critical-power model (Poole et al.
 *   2016, MSSE, doi 10.1249/MSS.0000000000000939, PMC5070974), P = CP + W′/t: at or under CP (critical power) they can
 *   go on a long while (their subjects all held it the 24 min asked); above it they spend W′, a store of work, which comes back slowly as they rest (Skiba et al.
 *   2012, MSSE 44(8):1526–32: τ = 546·e^(−0.01·DCP) + 316 s, DCP the gap below CP they rest at, in W; fitted on
 *   cycling, used here as it stands). Rowing,
 *   physically active adults: CP 166 W, W′ 16.3 kJ (Frontiers in Physiology 2025, doi 10.3389/fphys.2025.1635684);
 *   trained rowers 272 W (qxmd 21769731). Kneeling on a side deck, reaching half a metre down to the water with a
 *   crutch, a person keeps up a share of that, SIDE 0.45 (an estimate: nothing published on paddling kneeling or arms-only;
 *   a club crewmate's CP comes out at 75 W). Fitness sets where they lie: 0.6 (a club sailor) the active
 *   adults, 1 the trained rowers, geometric between (cpOf). The stroke the job asks is the first push, 150 W (sprint
 *   kayakers make about 200 W at VO2max on an ergometer, Thieme doi 10.1055/s-0032-1301907; a slalom team about 204 W
 *   over a 92 s run, Frontiers in Physiology 2019, doi 10.3389/fphys.2019.00260), no more
 *   than they have in them (CP + W′ left over a minute flat out, ALL_OUT): as W′ runs down they ease to their CP, the
 *   first minute or two, and keep that up as long as their endurance lasts (ENDURE, by fitness). Used up, they rest on
 *   the deck till they've half of it back (RESUME); a crew that knows the job (SWAP_SKILL) hands the crutch to a fresher
 *   crewmate instead (paddleStep).
 * - BLADE_EFF: the share of that power that pushes her (a blade slips: momentum theory, 2/(1 + slip ratio)); a small
 *   flat crutch end, clumsily used, 0.3 (an estimate: nothing published for improvised paddles).
 * - F_MAX: the most a stroke can push at rest, from the blade: the crutch's flat end about 0.15 × 0.20 m, a flat plate's
 *   drag coefficient about 1.18 broadside (Hoerner, Fluid-Dynamic Drag, ch. 3: a small rectangular plate, its sides 3:4;
 *   2 is the infinitely long plate's), drawn through the water at about 2 m/s, for about half of each stroke:
 *   ½ × 1025 × 1.18 × 0.03 × 2² × ½ ≈ 36 N.
 * Her own hull (physics.ts, the ITTC-1957 friction line on her 14.75 m² of wetted surface, ORC) then sets how fast she
 * goes: about a knot and a half (ITTC alone: about 5 W of thrust power holds 1 kt, 18 W 1.5 kt; a club crewmate's
 * stroke, 150 W easing to their CP of 75 W, gives 45 W of thrust easing to about 22 W: she settles at a little over 1.5 kt).
 * - The turn: the stroke's push is ARM off her centreline (the side deck, about 0.95 m out, and the reach), a yaw moment
 *   F × ARM against the water's resistance to her turning: her keel's and rudder's lift with way on (physics.ts
 *   yawDamping, the strips her yaw lag is worked from), and her hull and keel broadside to it, about her middle,
 *   ½·ρ·Cd·(latArea/L)·2∫₀^{L/2} r³ dr = ½·ρ·Cd·latArea·L³/32 (the same as world.ts's swing about her bow, SWING_DRAG,
 *   there /4). Stopped, she pivots at 3–4°/s; making a knot, well under 1°/s, which her helm can hold.
 */
export const PADDLE = {
  /** What a club sailor keeps up (W: with no crew modelled), and the stroke the job asks of a fresh paddler (W). */
  power: 75, burst: 150,
  /** How much of that power pushes her: a small flat blade, clumsily used (an estimate). */
  bladeEff: 0.3,
  /** The most a stroke pushes at rest (N), from the blade: ½ρ·Cd·A·u²·½ with A 0.03 m², Cd 1.18, u 2 m/s. */
  fMax: 0.5 * 1025 * 1.18 * 0.03 * 4 * 0.5,
  /** Off her centreline (m): the side deck, about 0.95 m out at the cockpit's forward end, and the reach. */
  arm: 1.2,
  /** Fetching the crutch from the cabin and getting to the side deck (s): an estimate. */
  fetchS: 8,
  /** The share of a person's rowing CP and W′ they keep up kneeling on a side deck with a crutch (an estimate). */
  side: 0.45,
  /** Rowing CP (W) and W′ (J): physically active adults (fitness 0.6), and trained rowers' CP (fitness 1). */
  cpClub: 166, cpFit: 272, wClub: 16300,
  /** Over how long (s) flat out a fresh paddler could spend all of W′ on top of CP: the most they can stroke (an estimate,
   * from the 3-min all-out test's own pace, which spends it over 180 s at an even effort). */
  allOut: 60,
  /** How long they keep going at their CP (s): endure0 + endure1 × fitness, 5 min to 25 min (estimates; Poole 2016's
   * subjects held CP the 24 min asked). Used up, they rest till they've RESUME of it back, by RECOVER (s; an estimate). */
  endure0: 300, endure1: 1200, recover: 300, resume: 0.5,
  /** The crew's skill (crewSkill) from which they swap paddlers rather than rest (an estimate). */
  swapSkill: 0.45,
  /** Handing the crutch over: the one coming out to the side deck and taking it (s; an estimate). */
  handS: 4,
  /** Strokes a minute at the job's stroke, and how it goes with the power (a slower, shorter stroke as they tire). Trained
   * outrigger paddlers' slow pace is 54 a minute (Sealey et al. 2011, J Sports Sci Med 10:52, PMC3737920); a long reach
   * down from a side deck with a crutch, slower: an estimate. */
  rate: 40
};
/** The water's resistance to her turning about her middle, N·m per (rad/s)². */
const yawDrag = () => 0.5 * 1025 * HOVE.crossCd * HOVE.latArea * orc.boat.imsL ** 3 / 32; // (worked when used: physics.ts imports this file)

/** Paddling: the side, when it began (sim time), and whether the crew called it themselves (a jam) or you did. */
export interface PaddleState {
  side: 'P' | 'S'; t0: number; auto: boolean; back?: boolean; /** when the side was last chosen (sim time) */ aimT?: number;
  /** who has the crutch (crew index), once it's been handed on; till then the forward hand (paddler) */
  who?: number;
  /** resting on the deck, spent (paddleStep), the crutch out still */
  rest?: boolean;
  /** the crutch being handed over until this time (sim time) */
  handT?: number;
  /** strokes a minute now (0 resting or handing over): for the figures (render/crew.ts) */
  rate?: number;
}

/** Who paddles: the forward hand (the crutch's job, as the pole's), or with no crew the helm; once they've swapped, whoever has it. */
export const paddler = (b: Boat): number => b.paddle?.who ?? forwardHand(b);
const forwardHand = (b: Boat): number => { const n = b.crew?.spec.crew.length ?? 0; return n === 0 ? 0 : ownerOf('pole', n, b.crew!.spec); };

/** A person's critical power and W′ paddling from a side deck (W, J), by their fitness: cpClub at 0.6, cpFit at 1,
 * geometric between and below (so a sedentary 0 keeps about half a club sailor's), W′ going with the square root of CP
 * (an estimate: fitter people have a bigger store, but less than in proportion). */
export function cpOf(p: Person): { cp: number; wp: number } {
  const r = (PADDLE.cpFit / PADDLE.cpClub) ** ((attrOf(p, 'fitness') - 0.6) / 0.4);
  return { cp: PADDLE.side * PADDLE.cpClub * r, wp: PADDLE.side * PADDLE.wClub * Math.sqrt(r) };
}
/** Skiba's W′ recovery time constant (s), resting `dcp` W below CP. His fit is in whole-body (cycling) watts, so it's
 * fed the whole-body gap (the side deck's over SIDE): applied outside the range it was fitted on, an estimate. */
const tauOf = (dcp: number) => 546 * Math.exp(-0.01 * dcp / PADDLE.side) + 316;
/** How long (s) a person keeps going at their CP before they must rest, by fitness: an estimate, its top at Poole 2016's
 * 24 min held at CP, less for the less fit, and less for work on the knees reaching down to the water. */
const endureOf = (p: Person) => PADDLE.endure0 + PADDLE.endure1 * attrOf(p, 'fitness');
/** The share of W′ a person has at `t`, recovered since they were last stamped while not paddling (resting, or at other
 * work, which a crutch's muscles don't do: as at rest). */
export function wLeft(a: Aboard, p: Person, t: number): number {
  const w = a.wBal; if (w >= 1) return 1;
  return 1 - (1 - w) * Math.exp(-Math.max(0, t - a.wT) / tauOf(cpOf(p).cp));
}
/** The share of their endurance used at `t`, recovered (RECOVER) since they were last stamped while not paddling. */
export function usedNow(a: Aboard, t: number): number {
  const u = a.wUsed; if (u <= 0) return 0;
  return u * Math.exp(-Math.max(0, t - a.wT) / PADDLE.recover);
}
/** Brought up to `t` and stamped (someone not paddling). */
const stamp = (a: Aboard, p: Person, t: number) => { a.wBal = wLeft(a, p, t); a.wUsed = usedNow(a, t); a.wT = t; };
/** Ready to paddle: rested back to RESUME of their endurance. */
const ready = (a: Aboard, t: number) => usedNow(a, t) <= PADDLE.resume;
/** The power (W) a paddler with `w` of their W′ left puts into the stroke: the job's (the first push), or less, what
 * they have in them over their CP (CP + W′ left over a minute flat out). As W′ runs down they ease to their CP, which
 * they keep up until their endurance is used (paddleStep). */
const effort = (cp: number, wp: number, w: number) => Math.min(PADDLE.burst, cp + wp * w / PADDLE.allOut);

const personOf = (b: Boat, i: number): Person | undefined => { const s = b.crew?.spec; return !s ? undefined : i === 0 ? s.helm : s.crew[i - 1]; };

/** The power going into the paddle at `t` (W): nothing till the crutch is out, while they rest, or while it's handed
 * over; else the paddler's stroke for what they have left (paddleStep spends it). */
export function paddlePower(b: Boat, t: number): number {
  const p = b.paddle; if (!p || p.rest) return 0;
  const who = paddler(b);
  const s = t - p.t0 - PADDLE.fetchS / workPace(b, who); if (s < 0 || (p.handT != null && t < p.handT)) return 0;
  const pace = Math.min(1, workPace(b, who)); // (a clumsier crewmate gets less from each stroke)
  const a = b.crew?.people[who], person = personOf(b, who);
  if (!a || !person) return pace * PADDLE.power; // (no crew modelled: what a club sailor keeps up)
  const { cp, wp } = cpOf(person);
  return pace * effort(cp, wp, a.wBal);
}

/** A crew that knows the job (SWAP_SKILL, two crew besides the helm): the freshest of them other than `not`, ready to
 * paddle and not at another committed job; or -1. */
function freshest(b: Boat, t: number, not: number): number {
  const c = b.crew!, n = c.spec.crew.length;
  if (n < 2 || crewSkill(c) < PADDLE.swapSkill) return -1;
  let best = -1, bu = Infinity;
  for (let i = 1; i <= n; i++) {
    const q = c.people[i]; if (i === not || !q) continue;
    const j = q.job?.line; if (j === 'car' || j === 'pole' || j === 'hoist' || j === 'outboard') continue;
    const u = usedNow(q, t); if (u <= PADDLE.resume && u < bu) { bu = u; best = i; }
  }
  return best;
}
/** Who picks the crutch up for a new spell at `t`: the forward hand, unless they're still tired and a crew that knows the
 * job has someone ready; and whether they must rest first (nobody ready). */
export function paddleStart(b: Boat, t: number): { who: number | undefined; rest: boolean } {
  const c = b.crew; if (!c) return { who: undefined, rest: false };
  const first = forwardHand(b), a = c.people[first];
  if (!a || ready(a, t)) return { who: undefined, rest: false };
  const f = freshest(b, t, first);
  return f > 0 ? { who: f, rest: false } : { who: undefined, rest: true };
}

/**
 * Each step while she's paddled: the paddler spends W′ over their CP (Skiba's balance) and uses their endurance as they
 * go; used up, they rest on the deck, or a crew that knows the job hands the crutch to whoever's freshest, and they rest
 * off it (while one rests, the crutch goes to whoever is ready first). Returns what changed, for the word to you.
 */
export function paddleStep(b: Boat, t: number, dt: number): 'rest' | 'swap' | 'resume' | null {
  const p = b.paddle, c = b.crew; if (!p || !c) return null;
  const who = paddler(b), a = c.people[who], person = personOf(b, who); if (!a || !person) return null;
  const swap = (to: number): 'swap' => {
    stamp(c.people[to]!, personOf(b, to)!, t);
    if (a.job?.line === 'paddle') a.job = null;
    p.who = to; p.handT = t + PADDLE.handS; p.rate = 0; p.rest = false;
    return 'swap';
  };
  if (p.rest) {
    // (resting on the deck, the crutch beside them: both stores coming back, stamped as they go; a fresher hand takes it)
    stamp(a, person, t); p.rate = 0;
    if (ready(a, t)) { p.rest = false; return 'resume'; }
    const f = freshest(b, t, who); return f > 0 ? swap(f) : null;
  }
  const { cp, wp } = cpOf(person);
  const P = paddlePower(b, t), pace = Math.min(1, workPace(b, who)), Pin = pace > 0 ? P / pace : 0;
  if (Pin <= 0) { stamp(a, person, t); p.rate = 0; return null; } // (fetching it, or the handover: resting)
  // (over CP W′ is spent at the excess; under it, it comes back as resting does, by Skiba's τ for that gap: not reached
  // while the job's stroke is over everyone's CP, effort, but kept so a gentler stroke stays right)
  a.wBal = Pin >= cp ? Math.max(0, a.wBal - (Pin - cp) * dt / wp) : 1 - (1 - a.wBal) * Math.exp(-dt / tauOf(cp - Pin));
  a.wUsed += dt * (Pin / cp) / endureOf(person); // (their endurance, at the pace of their CP: faster over it)
  a.wT = t;
  p.rate = PADDLE.rate * Math.sqrt(Pin / PADDLE.burst);
  if (a.wUsed < 1) return null;
  const f = freshest(b, t, who); if (f > 0) return swap(f);
  p.rest = true; p.rate = 0;
  return 'rest';
}

/** The paddle's push along her heading (N): the thrust power over her speed through the water, up to what a stroke can
 * do; astern when back-paddling. */
export function paddleForce(b: Boat, t: number): number {
  const p = b.paddle, P = paddlePower(b, t); if (!p || P <= 0) return 0;
  const vAhead = b.v - (b.astern ?? 0), dir = p.back ? -1 : 1;
  const along = Math.max(0.05, dir * vAhead); // (her speed the way the stroke pushes)
  return dir * Math.min(PADDLE.fMax, PADDLE.bladeEff * P / along);
}

/** The paddle's turning moment about her middle (N·m, + to starboard): its push, out on the side deck (hove to, the
 * strips there resist it: physics.ts heaveTo). */
export function paddleMoment(b: Boat, t: number): number {
  const p = b.paddle, F = Math.abs(paddleForce(b, t)); if (!p || F <= 0) return 0;
  return (p.side === 'P' ? 1 : -1) * (p.back ? -1 : 1) * F * PADDLE.arm;
}

/** The turn paddling on one side gives her (deg/s, + to starboard): the stroke's moment against the water's resistance
 * to her turning. Paddling on port pushes the port side ahead and swings her bow to starboard (back-paddling, the other way). */
export function paddleYawRate(b: Boat, t: number): number {
  const p = b.paddle, F = Math.abs(paddleForce(b, t)); if (!p || F <= 0) return 0;
  const sign = (p.side === 'P' ? 1 : -1) * (p.back ? -1 : 1);
  // the moment against the water's damping: the keel's and rudder's lift with way on (linear in the turn: physics.ts
  // yawDamping), and her hull and keel broadside to the water (quadratic: all there is at a standstill), together:
  // M = N·ω + Q·ω², so ω = (√(N² + 4QM) − N) / 2Q. Stopped she pivots at 3–4°/s; at a knot she only drifts round slowly
  const M = F * PADDLE.arm, N = yawDamping(Math.abs(b.v - (b.astern ?? 0))), Q = yawDrag();
  return sign * (Math.sqrt(N * N + 4 * Q * M) - N) / (2 * Q) / D2R;
}
