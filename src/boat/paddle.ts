import type { Boat } from './boat';
import { workPace, ownerOf } from './crewWork';
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
 * - POWER: what one person puts into a paddle, about 75 W kept up and 150 W for the first 20 s, falling to the 75 W over
 *   the next half minute. Estimates under the published figures for trained paddlers: sprint kayakers about 200 W at
 *   VO2max on an ergometer (Thieme, doi 10.1055/s-0032-1301907), a slalom team about 204 W over a 92 s run (Frontiers
 *   in Physiology 2019, doi 10.3389/fphys.2019.00260); a crewman kneeling on a side deck reaching half a metre down to
 *   the water can't stroke like a kayaker.
 * - BLADE_EFF: the share of that power that pushes her (a blade slips: momentum theory, 2/(1 + slip ratio)); a small
 *   flat crutch end, clumsily used, 0.3 (an estimate: nothing published for improvised paddles).
 * - F_MAX: the most a stroke can push at rest, from the blade: the crutch's flat end about 0.15 × 0.20 m, a flat plate's
 *   drag coefficient about 2 broadside (Hoerner, Fluid-Dynamic Drag), drawn through the water at about 2 m/s, for about
 *   half of each stroke: ½ × 1025 × 2 × 0.03 × 2² × ½ ≈ 60 N.
 * Her own hull (physics.ts, the ITTC-1957 friction line on her 14.75 m² of wetted surface, ORC) then sets how fast she
 * goes: about a knot and a half (ITTC alone: about 5 W of thrust power holds 1 kt, 18 W 1.5 kt; the 22 W kept up here
 * holds a little over 1.5 kt).
 * - The turn: the stroke's push is ARM off her centreline (the side deck, about 0.95 m out, and the reach), a yaw moment
 *   F × ARM against the water's resistance to her turning: her keel's and rudder's lift with way on (physics.ts
 *   yawDamping, the strips her yaw lag is worked from), and her hull and keel broadside to it, about her middle,
 *   ½·ρ·Cd·(latArea/L)·2∫₀^{L/2} r³ dr = ½·ρ·Cd·latArea·L³/32 (the same as world.ts's swing about her bow, SWING_DRAG,
 *   there /4). Stopped, she pivots at 3–4°/s; making a knot, well under 1°/s, which her helm can hold.
 */
export const PADDLE = {
  /** The power one person keeps up (W), and the first push (W) and how long it lasts before it tails off (s). */
  power: 75, burst: 150, burstS: 20, fadeS: 30,
  /** How much of that power pushes her: a small flat blade, clumsily used (an estimate). */
  bladeEff: 0.3,
  /** The most a stroke pushes at rest (N), from the blade: ½ρ·Cd·A·u²·½ with A 0.03 m², Cd 2, u 2 m/s. */
  fMax: 0.5 * 1025 * 2 * 0.03 * 4 * 0.5,
  /** Off her centreline (m): the side deck, about 0.95 m out at the cockpit's forward end, and the reach. */
  arm: 1.2,
  /** Fetching the crutch from the cabin and getting to the side deck (s): an estimate. */
  fetchS: 8
};
/** The water's resistance to her turning about her middle, N·m per (rad/s)². */
const yawDrag = () => 0.5 * 1025 * HOVE.crossCd * HOVE.latArea * orc.boat.imsL ** 3 / 32; // (worked when used: physics.ts imports this file)

/** Paddling: the side, when it began (sim time), and whether the crew called it themselves (a jam) or you did. */
export interface PaddleState { side: 'P' | 'S'; t0: number; auto: boolean; back?: boolean; /** when the side was last chosen (sim time) */ aimT?: number }

/** Who paddles: the forward hand (the crutch's job, as the pole's), or with no crew the helm. */
export const paddler = (b: Boat): number => { const n = b.crew?.spec.crew.length ?? 0; return n === 0 ? 0 : ownerOf('pole', n, b.crew!.spec); };

/** The power going into the paddle at `t` (W): the first push, then what they keep up; nothing till the crutch is out. */
export function paddlePower(b: Boat, t: number): number {
  const p = b.paddle; if (!p) return 0;
  const s = t - p.t0 - PADDLE.fetchS / workPace(b, paddler(b)); if (s < 0) return 0;
  const pace = Math.min(1, workPace(b, paddler(b))); // (a slower crewmate paddles less hard)
  const burst = s < PADDLE.burstS ? 1 : Math.max(0, 1 - (s - PADDLE.burstS) / PADDLE.fadeS);
  return pace * (PADDLE.power + (PADDLE.burst - PADDLE.power) * burst);
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
