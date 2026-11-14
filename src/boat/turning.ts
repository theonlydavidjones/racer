/**
 * How she turns: the moments about her keel, one model at every speed (docs/TURNING-PROPOSAL.md, the owner's approval
 * 13 Nov 2026). Her rudder's lift and drag at the angle the water meets it, her hull and keel's resistance to turning
 * (strip by strip, as the hove-to model has it), the sails' own turning moment (balance.ts sailYaw) and the wind on her
 * topsides, rig and crew, against her yaw inertia. Nothing here is a turn rate set by hand: her turning circle, how
 * fast she answers, what a turn costs in speed and which way her bow goes under bare poles all come out of the forces.
 *
 * Frame: everything "toward the wind" (+: her bow turning toward the wind; sway + to leeward), as heaveTo works it.
 */
import orc from './data/nordic-folkboat-orc.json';
import { D2R, clamp } from '../core/math';
import { FULL_RUDDER, RUDDER } from './balance';
import { HANDLING, HULL } from './dynamics';
import { HOVE } from './physics';

const RHO = 1025;

/**
 * The rudder's stall (rad): about 15° for a blade of this aspect ratio. An estimate: Whicker & Fehlner's (DTMB 933,
 * 1958) all-movable rudders of aspect ratio 2–3 stall at 20–25°, higher aspect ratios nearer 15–18°, and a rudder hung
 * on a keel (a flap, no gap: CR 4.70, 5.40) keeps lifting to larger blade angles than a free blade; their report itself
 * was not reached (DTIC refuses automated downloads). Past it the blade is a plate broadside-on: its force square to
 * it, Cn rising from the stall's to 1.2 at 90° (Hoerner, Fluid-Dynamic Drag, 3-16: a flat plate; as the backed jib).
 */
export const RUDDER_STALL = 15 * D2R;
/** How far past the stall the blade's force takes to lie square to it (rad): 10°, an estimate (a stall isn't a step). */
const STALL_BLEND = 10 * D2R;
/** Section drag of the blade, unstalled (a faired wooden blade at Reynolds numbers near 10⁶: about 0.01–0.02; Hoerner 6-2). */
const RUDDER_CD0 = 0.015;

/** The blade's lift and drag coefficients at angle of attack `a` (rad, signed): lift with the sign of `a`. */
export function rudderCoef(a: number): { cl: number; cd: number } {
  const s = Math.abs(a);
  if (s <= RUDDER_STALL + 1e-9) { const cl = RUDDER.slope * a; return { cl, cd: RUDDER_CD0 + cl * cl / (Math.PI * RUDDER.aspect) }; }
  // stalled: a plate, its force square to it. Continuous with the stall's own lift and drag: the force's size goes from
  // the stall's to the plate's 1.2 at 90°, and its direction swings from where it lay at the stall (a few degrees aft
  // of square to the flow) to square to the blade over the next STALL_BLEND of angle, as the flow lets go of its back
  const clS = RUDDER.slope * RUDDER_STALL, cdS = RUDDER_CD0 + clS * clS / (Math.PI * RUDDER.aspect);
  const cn0 = Math.hypot(clS, cdS), t = Math.min(1, (s - RUDDER_STALL) / (Math.PI / 2 - RUDDER_STALL)), cn = cn0 + (1.2 - cn0) * t;
  const psi0 = Math.atan2(cdS, clS), psi = psi0 + (s - psi0) * Math.min(1, (s - RUDDER_STALL) / STALL_BLEND);
  return { cl: Math.sign(a) * cn * Math.cos(psi), cd: cn * Math.sin(psi) };
}

/**
 * The rudder's side force and drag (N). `u` her speed through the water (m/s, + ahead, − astern), `d` her sway to
 * leeward (m/s), `r` her turn toward the wind (rad/s), `delta` the blade's angle (rad, + turning her toward the wind).
 * The water at the blade: her own speed, and across it her sway and her stern's swing (r × arm), half straightened by
 * the long keel ahead of it (HOVE.rudderFlow, an estimate). Going astern the water meets it from aft: the same blade
 * angle pushes the other way, and less well (0.7: a blade trailing-edge first; an estimate).
 * Returns y: the side force at the stern, + pushing the stern to leeward (turning her toward the wind); x: the drag,
 * against her motion (negative ahead).
 */
export function rudderForce(u: number, d: number, r: number, delta: number): { y: number; x: number } {
  rudderInto(u, d, r, delta);
  return { y: RUD.y, x: RUD.x };
}
/** rudderForce's answer left in RUD, for every boat every step (nothing made to throw away). */
export const RUD = { y: 0, x: 0 };
export function rudderInto(u: number, d: number, r: number, delta: number): void {
  const back = u < 0, uf = Math.abs(u), vy = HOVE.rudderFlow * (d + r * RUDDER.arm), v2 = u * u + vy * vy;
  const a = clamp((back ? -delta : delta) - inflowAngle(vy, uf), -Math.PI / 2, Math.PI / 2), q = 0.5 * RHO * v2 * RUDDER.area;
  let cl: number, cd: number;
  // (below the stall: rudderCoef's own first line, written out; past it, rudderCoef)
  if (Math.abs(a) <= RUDDER_STALL + 1e-9) { cl = RUDDER.slope * a; cd = RUDDER_CD0 + cl * cl / (Math.PI * RUDDER.aspect); } else { const c = rudderCoef(a); cl = c.cl; cd = c.cd; }
  RUD.y = q * cl * (back ? 0.7 : 1); RUD.x = -q * cd * (back ? -1 : 1);
}
/** The angle the water meets the blade at from her stern's sideways motion (rad): asked twice a step for the same water
 * (the helm for a turn, then the force it makes), so the last answer is kept. */
let inVy = NaN, inUf = NaN, inA = 0;
function inflowAngle(vy: number, uf: number): number {
  if (vy !== inVy || uf !== inUf) { inVy = vy; inUf = uf; inA = Math.atan2(vy, Math.max(0.01, uf)); }
  return inA;
}

const STRIPS = 8;
/** The strips' places along her (m, + forward) and the sums the hull's forces need, worked out once (HOVE is read when
 * first asked, not when this file loads: physics.ts and this file read each other). */
let strips: { xs: Float64Array; S2: number; S4: number; k: number; aL: number; kD: number; half: number } | null = null;
function stripsOf() {
  if (strips) return strips;
  const L = orc.boat.imsL, N = STRIPS, xs = new Float64Array(N); let S2 = 0, S4 = 0;
  for (let i = 0; i < N; i++) { const x = -L / 2 + (i + 0.5) * L / N; xs[i] = x; S2 += x * x; S4 += x * x * x * x; }
  return strips = { xs, S2, S4, k: 0.5 * RHO * HOVE.latArea / N, aL: Math.PI * HOVE.aspect / 2, kD: -HOVE.dragAft / (S2 / N), half: L / 2 };
}

/**
 * Her hull and keel against the water sideways, strip by strip along the waterline: each strip's lift (with way on,
 * either way: trailing edge first about half of it, an estimate) and its broadside drag (Hoerner's cross-flow, more of
 * it aft: HOVE.dragAft). Returns y: the side force (+ to leeward: negative, it resists her sway), m: the moment (+
 * turning her toward the wind): what damps her turn, and what swings her as she slides.
 */
export function hullSide(u: number, d: number, r: number): { y: number; m: number } {
  const { xs, k, aL, kD } = stripsOf(), uEff = u >= 0 ? u : 0.5 * -u, cd = HOVE.crossCd;
  let y = 0, m = 0;
  for (let i = 0; i < STRIPS; i++) {
    const x = xs[i], vy = d - r * x; // (x + forward) the water's sideways speed past the strip
    const f = -k * (aL * uEff * vy + cd * (1 + kD * x) * vy * Math.abs(vy));
    y += f; m -= f * x; // a push to windward ahead of the centre turns her toward the wind
  }
  return { y, m };
}

/**
 * hullSide's moment alone, for every boat every step: the strips summed in closed form where the water passes them all
 * the same way (her sway more than her ends' swing, as it is sailing; S2 and S4 the strips' Σx² and Σx⁴), strip by
 * strip otherwise. The same numbers as hullSide's.
 */

export function hullYawM(u: number, d: number, r: number): number {
  if (d === 0 && r === 0) return 0;
  const { xs, S2, S4, k, aL, kD, half } = stripsOf(), uEff = u >= 0 ? u : 0.5 * -u, cd = HOVE.crossCd;
  if (Math.abs(d) > Math.abs(r) * half) return k * (aL * uEff * -r * S2 + Math.sign(d) * cd * (-2 * d * r * S2 + kD * (d * d * S2 + r * r * S4)));
  let m = k * aL * uEff * -r * S2; // (the lift's part is the same sum either way; the broadside drag's strip by strip, where the water passes her ends opposite ways)
  for (let i = 0; i < STRIPS; i++) { const x = xs[i], vy = d - r * x; m += k * cd * (1 + kD * x) * vy * Math.abs(vy) * x; }
  return m;
}

let yawI = 0;
export const yawInertia = (disp: number = HULL.displacement) => disp === HULL.displacement ? (yawI ||= disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded)) : disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);

/**
 * What a turn costs her in drag beyond the rudder's own (N; negative: it saves her some). To go round, the water must
 * push her sideways toward the centre of the turn, m·u·r, and her keel makes that as lift, with its induced drag:
 * D = F²/(ρ·πT²·u²) for a side force F on her draft T (the slender wing of her leeway, Newman §5.12; ORC's eq. 6.37).
 * Her keel is already carrying her sails' side force `side` (N, to windward), whose drag the polar's speeds have in
 * them, so the turn's part is ((side + m·u·r)² − side²)/(ρ·πT²·u²), `r` her turn toward the wind (rad/s): luffing, the
 * keel is loaded harder and it costs more than the bare (m·u·r)²; bearing away it's unloaded. Square in the turn rate
 * either way, so a helmsman's small corrections cost next to nothing and a hard turn brakes her. With little way on the
 * drift this asks of her is no small angle and the wing's result fails: there the whole of the side force stands for
 * its drag, m·|u·r|, and it goes to nothing as she stops (no way, no centripetal force).
 * `m`: her mass with the water she carries fore and aft (HANDLING.mass's share).
 */
export function turnDragN(r: number, u: number, side = 0, disp: number = HULL.displacement): number {
  const m = disp * HANDLING.mass / HULL.displacement, F = m * Math.abs(u) * r, cap = Math.abs(F);
  if (cap < 1e-9) return 0;
  const d = ((side + F) * (side + F) - side * side) / (KEEL_SPAN * Math.max(1e-6, u * u));
  return clamp(d, -cap, cap);
}

/**
 * The blade angle (rad, toward the wind) that gives her rudder the moment `want` (N·m, toward the wind) in this flow, as
 * a helmsman who feels the blade would hold it: never past the stall (more helm than that only brakes her), nor past
 * hard over. Solved on the unstalled lift, which is a straight line in the angle.
 */
export function helmForMoment(want: number, u: number, d: number, r: number): number {
  const back = u < 0, uf = Math.abs(u), vy = HOVE.rudderFlow * (d + r * RUDDER.arm), v2 = u * u + vy * vy;
  const q = 0.5 * RHO * v2 * RUDDER.area * RUDDER.slope * RUDDER.arm * (back ? 0.7 : 1);
  const inflow = inflowAngle(vy, uf);
  const lim = RUDDER_STALL - 1e-6, aoa = q > 1e-6 ? clamp(want / q, -lim, lim) : Math.sign(want) * lim; // (just inside it: the angles are summed and taken apart again)
  return clamp((aoa + inflow) * (back ? -1 : 1), -FULL_RUDDER * D2R, FULL_RUDDER * D2R);
}

/**
 * The steady turn she can hold at speed `u` (m/s, ahead) with the blade just short of its stall and no help from her
 * sails: rad/s. Her turning circle, u / r, comes out near constant: about 9 m, 1.2 boat lengths (the hull's damping and
 * the rudder's moment both go with her speed). Solved once (bisection on the moments).
 */
/** ρ·π·T²: the keel's span in its induced drag (turnDragN) */
const KEEL_SPAN = RHO * Math.PI * orc.boat.draft ** 2;

let turnK = 0;
export function steadyTurnRate(u: number): number {
  if (!turnK) {
    // (every term goes as her speed squared when the turn rate goes as her speed, so one solution serves: at 1 m/s. The
    // moment left over at turn rate r, the blade held at the stall's angle of attack: it falls as r grows)
    const cl = RUDDER.slope * RUDDER_STALL;
    const left = (r: number) => { const vy = HOVE.rudderFlow * r * RUDDER.arm; return 0.5 * RHO * (1 + vy * vy) * RUDDER.area * cl * RUDDER.arm + hullSide(1, 0, r).m; };
    let lo = 0, hi = 3;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (left(mid) > 0) lo = mid; else hi = mid; }
    turnK = (lo + hi) / 2;
  }
  return turnK * Math.max(0, u);
}

/** The steady turn her rudder can hold at speed `v` (m/s), deg/s: nothing without way on. */
export const flowTurnRate = (v: number): number => steadyTurnRate(Math.max(0, v)) / D2R;
/** The fastest she can be turned at speed `v`, deg/s: by her rudder, or sculled when that's faster (scullTurnRate). */
export const maxTurnRate = (v: number): number => Math.max(scullTurnRate(), flowTurnRate(v));

/** The blade's drag sailing straight with the little weather helm the polar's speeds have in them (N), at speed u (m/s). */
let cdIdeal = 0;
export function rudderDragIdeal(u: number, idealDeg: number): number {
  if (!cdIdeal) cdIdeal = rudderCoef(idealDeg * D2R).cd;
  return 0.5 * RHO * u * u * RUDDER.area * cdIdeal;
}

/**
 * Sculling: working the tiller to turn her with no way on. The blade swung about its hinge through still water is a
 * plate moving broadside-on: its force is square to it, against its motion, F = ρ·Cd·b·ω²·c³/6 for a plate of span b and
 * chord c turning about its leading edge at ω (Cd 1.2, Hoerner's flat plate, as the stalled blade's: each strip's speed
 * is ω times its distance from the hinge). It goes as the square of the swing's rate, so a symmetric wag nets nothing,
 * and a fast stroke one way with a slow return leaves a net push at her stern: that is the sculling stroke.
 * (The blade's added mass gives a larger force through the stroke, but it nets to nothing over it. Thrust: this term
 * nets none fore and aft either; the pitching-foil thrust scalings, Floryan et al. 2017, JFM, are fitted far from a
 * standstill and give more than anyone's sculled speed implies, so no propulsion is taken from it.
 * reference/research/sculling.md.)
 *
 * The stroke a helmsman sculls with (`SCULL`) is an estimate: no measured stroke for a keelboat was found. 60° of blade
 * once a second, the fast stroke a third of it; and a hand can't swing the blade faster than `maxSwing` (that stroke's
 * fast half: about 150 N at the tiller by the blade's hinge moment, heavy work).
 */
export const SCULL = { swing: 60 * D2R, period: 1, fast: 1 / 3, maxSwing: 180 * D2R };
const bladeSpan = () => Math.sqrt(RUDDER.aspect * RUDDER.area), bladeChord = () => RUDDER.area / bladeSpan();
/** The swung blade's force at her stern (N, with the sign of the swing: a swing that would turn her toward the wind
 * pushes her stern to leeward, as that helm's lift does with way on). `omega` rad/s, `delta` the blade's angle. */
export const bladeSwingForce = (omega: number, delta: number): number => RHO * 1.2 * bladeSpan() * bladeChord() ** 3 / 6 * omega * Math.abs(omega) * Math.cos(delta);
/** The standard stroke's mean turning moment about her keel (N·m): the fast stroke's push less the slow return's, over
 * the cycle (the blade within ±swing/2 of amidships: the mean of the cosine). About 65 N·m. */
let scullM = 0;
export function scullMoment(): number {
  if (!scullM) {
    const w = SCULL.swing / SCULL.period, half = SCULL.swing / 2;
    scullM = bladeSwingForce(w, 0) * (1 / SCULL.fast - 1 / (1 - SCULL.fast)) * (Math.sin(half) / half) * RUDDER.arm;
  }
  return scullM;
}
/** The steady turn that stroke holds with no way on, against her hull and keel broadside to the water (deg/s): about 4. */
let scullR = 0;
export function scullTurnRate(): number {
  if (!scullR) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (scullMoment() + hullSide(0, 0, mid).m > 0) lo = mid; else hi = mid; }
    scullR = (lo + hi) / 2 / D2R;
  }
  return scullR;
}
