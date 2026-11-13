import { D2R, KT, wrap } from '../core/math';
import type { SeaHere } from '../environment/sea';
import { N_WAVES, type WaveField } from '../environment/waveField';
import type { Boat } from './boat';
import { HULL, driveFrom, hullResistance, type DriveCurve } from './dynamics';
import { driveCurveFor } from './driveCurve';
import { beatAngle as beatAngleCalm, polar } from './polar';

/**
 * What waves do to a Folkboat.
 *
 * Added resistance: a boat driving into waves pitches and heaves, and the energy that goes into the waves
 * she makes doing it is drag. It scales as ρ·g·H²·B²/L (the standard form, from Gerritsma–Beukelman and
 * its descendants), is worst when the waves are about a boat-length long (she can't ride over them and
 * pitches hardest), worst head-on, and small from astern. The boat settles where the sails' drive meets
 * calm-water drag plus this. A slower boat (pinching) loses a bigger share of her speed to the same added
 * drag, so in a seaway it pays to sail a little lower and keep her going: footing beats pinching. In flat
 * water it's the other way. Calibrated so 2 ft (0.6 m) of boat-length chop costs a Folkboat about 12%
 * of her upwind speed: a judgement, not a measurement.
 *
 * Waves also push her bow around: the yaw is worst with the sea on the quarter, which is why steering
 * downwind in a seaway takes work.
 */

const RHO = 1025, G = 9.81, BEAM = 2.21, LWL = HULL.length;
/** Added-resistance coefficient (dimensionless): the calibration knob. */
export const C_AW = 0.034; // (0.045 with the old flat ×1.6 drive at rest; 0.034 since the drive's shape comes from the sail model, driveCurve.ts, which upwind gives a slowed boat less push: the same 12%)

/** Added resistance (N) in waves of height H (m) and period T (s) meeting the bow at `enc` deg (0 head-on, 180 from astern), at speed v (m/s). */
export function addedResistance(H: number, T: number, enc: number, v: number): number {
  if (H < 0.01) return 0;
  return awAt(H, T, enc) * awSpeed(v);
}
/** The part of addedResistance that doesn't depend on her speed (H ≥ 0.01): worked out once for a search over speed. */
function awAt(H: number, T: number, enc: number): number {
  const lambda = G * T * T / (2 * Math.PI), r = lambda / LWL;
  const len = Math.exp(-((Math.log(r / 1.2)) ** 2) / (2 * 0.6 * 0.6)); // worst at about a boat-length
  const head = 0.05 + 0.95 * Math.pow((1 + Math.cos(enc * D2R)) / 2, 1.3);
  return C_AW * RHO * G * H * H * BEAM * BEAM / LWL * len * head;
}
/** ... and how it grows with her speed (slow, she pitches less into each wave). */
const awSpeed = (v: number): number => 0.4 + 0.6 * Math.min(1, v / 2.5);

/** Added resistance from the whole sea (chop from the wind's direction, swell from its own) for heading h, at speed v. */
export function seaDrag(s: SeaHere, h: number, v: number): number {
  return addedResistance(s.hsW, s.tpW, Math.abs(wrap(s.fromW - h)), v) + addedResistance(s.hsS, s.tpS, Math.abs(wrap(s.fromS - h)), v)
    + (s.wake ? addedResistance(s.wake.h, s.wake.t, Math.abs(wrap(s.wake.from - h)), v) : 0);
}

/** Steady speed (m/s) when the sails would drive her at `vt` in flat water and the sea adds `drag(v)` newtons. */
export function steadySpeed(vt: number, drag: (v: number) => number, k?: DriveCurve): number {
  if (vt <= 0) return 0;
  const rvt = hullResistance(vt), f = (v: number) => driveFrom(rvt, v, vt, k) - hullResistance(v) - drag(v);
  // (the one crossing between rest and vt, by false position with the Illinois step: to 1 ppm of vt in a handful of
  // looks where bisection took 30; it's asked for every boat in the sea, every step)
  let a = 0, fa = f(0), c = vt, fc = f(c), side = 0;
  if (fc >= 0) return vt;
  if (fa <= 0) return 0;
  for (let i = 0; i < 40; i++) {
    const m = (a * fc - c * fa) / (fc - fa), fm = f(m);
    if (Math.abs(c - a) < 1e-6 * vt || Math.abs(fm) < 1e-7 * rvt) return m;
    if (fm > 0) { a = m; fa = fm; if (side === 1) fc /= 2; side = 1; } else { c = m; fc = fm; if (side === -1) fa /= 2; side = -1; }
  }
  return (a + c) / 2;
}

/** Target speed (m/s) for wind `kt` at true wind angle `twa`, in chop of height `hs` and period `tp` coming from the wind's direction. */
export function speedInChop(kt: number, twa: number, hs: number, tp: number): number {
  const vt = polar(kt, twa);
  if (hs < 0.01) return vt;
  // (the AI asks again with the same numbers several times a step: the last few answers kept, exactly as worked out)
  for (let i = 0; i < CHOP_MEMO; i++) { const m = chopMemo[i]; if (m.kt === kt && m.twa === twa && m.hs === hs && m.tp === tp) return m.v; }
  const k = awAt(hs, tp, twa);
  const v = steadySpeed(vt, u => k * awSpeed(u), driveCurveFor(kt, twa, vt)); // (addedResistance(hs, tp, twa, v), its fixed part worked out once; slowed by the sea, the sails' drive as the apparent wind then gives it)
  const m = chopMemo[chopNext]; chopNext = (chopNext + 1) % CHOP_MEMO;
  m.kt = kt; m.twa = twa; m.hs = hs; m.tp = tp; m.v = v;
  return v;
}
const CHOP_MEMO = 16, chopMemo = Array.from({ length: CHOP_MEMO }, () => ({ kt: NaN, twa: NaN, hs: NaN, tp: NaN, v: 0 }));
let chopNext = 0;

function beatSearch(kt: number, hs: number, tp: number): number {
  let best = 40, bestV = -1;
  for (let t = 30; t <= 65; t += 0.5) { const v = speedInChop(kt, t, hs, tp) * Math.cos(t * D2R); if (v > bestV) { bestV = v; best = t; } }
  // (no headway at any angle, light air in a big chop: not "pinch hardest", as the first angle tried would say, but the
  // widest, footing off for speed being her only hope)
  return bestV > 0 ? best : 65;
}
const beatCache = new Map<number, number>();
/** Best upwind VMG angle (true) in chop: wider than in flat water, by how much the chop punishes pinching. */
export function beatInChop(kt: number, hs: number, tp: number): number {
  // (a number for the key, each rounded value in its own field: kt·4 < 4096, hs·50 and tp·10 < 2^20; no string per look)
  if (!Number.isFinite(kt + hs + tp)) return beatSearch(kt, hs, tp); // (no key for a NaN: worked out, not cached)
  const k4 = Math.round(kt * 4), h50 = Math.round(hs * 50), t10 = Math.round(tp * 10), key = (k4 * 1048576 + h50) * 1048576 + t10;
  let a = beatCache.get(key);
  if (a === undefined) {
    // (worked out from the rounded values the key holds, not the first caller's exact ones: otherwise the angle cached
    // for everyone after depends on which boat, in which World, asked first, and the same seed sails a different race)
    a = beatSearch(k4 / 4, h50 / 50, t10 / 10);
    if (beatCache.size > 20000) beatCache.clear();
    beatCache.set(key, a);
  }
  return a;
}

/**
 * Yaw the sea puts into her heading (deg/s) at time t: a wave-by-wave push. The yaw moment a wave puts on a slender hull
 * is the sway force along her length (the wave's pressure difference across her, Froude–Krylov: ρ·g·ζ·k·sin β per
 * metre of side, fading with depth as e^(−kT)) times its lever about her middle. A wave meets her bow and stern in
 * different phases, so integrated over her length, ∫ x·sin(ωt − k·x·cos β) dx, the moment goes as
 * 2(sin q − q·cos q)/a², a = k·cos β, q = a·L/2 (strip theory: Faltinsen, Sea Loads on Ships and Offshore Structures,
 * 1990, ch. 3; Newman, Marine Hydrodynamics, §6.17). That is nothing head-on, beam-on or dead astern, most with the sea
 * on the bow or the quarter, and next to nothing in a long swell (as k² once the wave is much longer than she is): a
 * 13 s ocean swell, 260 m long, lifts her whole and barely turns her; a boat-length chop on the quarter slews her about.
 * Its size is kept where the sim had it for a boat-length chop on the quarter (about 3.2°/s per metre of wave height, peaks to 4.9:
 * a judgement, not a measurement: she has no yaw inertia while sailing, so the moment is felt as a rate). Deterministic
 * (the same race replays the same).
 */
const YAW_DEPTH = 0.6; // (m: the mean depth of her side area, hull and keel, for e^(−kT): about half her 1.2 m draft)
function yawMoment(H: number, k: number, encRad: number): number {
  const a = k * Math.cos(encRad), q = a * LWL / 2;
  // (the length integral, 2(sin q − q cos q)/a², tends to a·L³/12 for a short boat in a long wave)
  const lever = Math.abs(q) < 1e-3 ? a * LWL ** 3 / 12 : 2 * (Math.sin(q) - q * Math.cos(q)) / (a * a);
  return H * k * Math.abs(Math.sin(encRad)) * Math.exp(-k * YAW_DEPTH) * Math.abs(lever);
}
/** The moment for a boat-length wave on the quarter (135°), 1 m high: the scale's reference. */
const YAW_REF = yawMoment(1, 2 * Math.PI / LWL, 135 * D2R);
/** Yaw rate (deg/s) per metre of wave height for that reference wave, as the sim had it (7 × the old 0.463; its peak
 * half as much again with the second harmonic). */
const YAW_RATE = 3.24;
export function waveYaw(s: SeaHere, h: number, v: number, t: number, seed: number): number {
  const one = (H: number, T: number, from: number, ph: number) => {
    if (H < 0.03) return 0;
    const enc = Math.abs(wrap(from - h)) * D2R, k = 2 * Math.PI / (G * T * T / (2 * Math.PI));
    const we = Math.abs(2 * Math.PI / T + k * v * Math.cos(enc)) + 0.3; // encounter frequency
    return YAW_RATE * yawMoment(H, k, enc) / YAW_REF * (Math.sin(we * t + ph) + 0.5 * Math.sin(1.7 * we * t + 2 * ph));
  };
  return one(s.hsW, s.tpW, s.fromW, seed * 1.7) + one(s.hsS, s.tpS, s.fromS, seed * 2.9 + 1) + (s.wake ? 1.6 * one(s.wake.h, s.wake.t, s.wake.from, seed * 4.1 + 2) : 0);
}

/** Speed lost to the sea (fraction), for messages. */
export const chopLoss = (kt: number, twa: number, hs: number, tp: number) => 1 - speedInChop(kt, twa, hs, tp) / Math.max(1e-6, polar(kt, twa));
export const KNOTS = (v: number) => v / KT;

/** This boat's best upwind angle (true) in the chop she's in. */
export const beatFor = (b: { ww: { kt: number }; sea: SeaHere }): number => b.sea.hsW < 0.02 ? beatAngleCalm(b.ww.kt) : beatInChop(b.ww.kt, b.sea.hsW, b.sea.tpW);
/** This boat's target speed (m/s) at a true wind angle, in the chop she's in (the swell barely matters). */
export const targetFor = (b: { ww: { kt: number }; sea: SeaHere }, twa: number): number => speedInChop(b.ww.kt, twa, b.sea.hsW, b.sea.tpW);

/* ---------- heave and pitch: the waves under her, wave by wave ---------- */

/**
 * Heave and pitch, from the shared wave field (environment/waveField.ts) under her, as two damped oscillators forced by
 * the waves (linear strip theory, in the time domain: Journée & Massie, Offshore Hydromechanics, TU Delft 2001, ch. 6;
 * Faltinsen, Sea Loads on Ships and Offshore Structures, 1990, ch. 3).
 *
 * - **The restoring forces** are her own hydrostatics, measured from the drawn hull (render/hull.ts's sections, sliced
 *   at its drawn waterline; tests/seakeeping.test.ts keeps them in step): waterplane area 8.9 m² (heave: ρ·g·Awp,
 *   89 kN/m) and its moment of inertia about the centre of flotation 17.2 m⁴ (pitch: ρ·g·I_L, taking GM_L ≈ BM_L =
 *   I_L/∇ ≈ 7.6 m, the 0.3 m between G and B being nothing beside it). The centre of flotation is 0.22 m aft of the
 *   middle of her length. (Whether the drawn hull floats her sailing displacement at that line isn't settled: its
 *   volume doesn't slice reliably. A few centimetres either way changes these by a few percent.)
 * - **The added mass** of the water she moves with her, from strip theory: each section's two-dimensional heave added
 *   mass ρ·π/8·B²·C, C from its Lewis form (Lewis 1929; Journée & Massie ch. 6, the conformal mapping by the section's
 *   beam/draft ratio and area coefficient), integrated along her length for heave and with the square of the distance
 *   from the centre of flotation for pitch: 5,240 kg (2.3 × her mass: shallow, beamy sections carry a lot of water) and
 *   8,120 kg·m². These are the high-frequency limits, and strip theory leaves out the ends' three-dimensional relief, a
 *   real effect on a hull only 2.9 beams long: estimates, until the Delft series' seakeeping tests can replace them.
 * - **Her pitch inertia:** a radius of gyration of a quarter of her length overall (1.91 m), the usual figure for a yacht
 *   with her rig: an estimate.
 * - **Damping:** the waves she makes as she heaves and pitches carry energy away. A damping ratio of 0.25 in each, an
 *   estimate (of the order the radiation damping of ship sections gives near resonance; to be replaced by her sections'
 *   own wave damping, or the Delft tests).
 * - That gives natural periods of about 1.8 s in heave and 2.0 s in pitch. Close-hauled at 5 kt, the Bay's 2.5–3 s chop
 *   meets her every 1.7–2.1 s: on them, which is the hobby-horsing of a Folkboat in the Cityfront chop (her pitch, for
 *   the waves' slope, peaks in a 3 s chop at about 1.2 times what a long sea gives, a broad peak: tests/seakeeping.test.ts).
 * - **The waves' push** on a rectangle with her waterplane's area and moment of inertia (4.82 × 1.85 m), worked out in
 *   closed form for each wave component: along her length a sinc for the force and the yaw lever's 2(sin q − q·cos q)/a²
 *   for the moment, across her beam a sinc, and the pressure fading with depth as e^(−k·T), T her mean draft (∇/Awp,
 *   0.26 m; the Smith effect). Strip theory's relative-motion form (Korvin-Kroukovsky; Journée & Massie ch. 6): each
 *   strip feels c'·ζ* + a'·ζ̈* + b'·ζ̇*, ζ* the wave's (Smith-reduced) surface there as she meets it. So besides the
 *   undisturbed wave's pressure (Froude–Krylov, c'·ζ*) the water's own acceleration and the waves she'd radiate push back
 *   (diffraction): a factor (1 − a33·ω²/C33) on it, and a part in quadrature, b·ω/C33, ω the wave's frequency. For the
 *   Bay's chop that's 0.6–0.85 of the pressure alone. (The section ratios a'/c', b'/c' taken uniform, as
 *   the rectangle is; forward speed's own extra terms left out.) A wave much longer than she is lifts and tilts her with
 *   it (she follows the surface: force C33·ζ, moment C55·slope); one much shorter cancels along her and leaves her still.
 * - Worked out where she is, every step, as she sails through the field: the frequency she meets the waves at (faster
 *   into them, slower running with them) needs no formula of its own.
 */
const WM = {
  awp: 8.9, il: 17.2, cfAft: 0.22, a33: 5240, a55: 8120, gyr: 0.25 * 7.64, zeta: 0.25,
  /** The equivalent rectangle's length and beam (m): L·B = Awp, B·L³/12 = I_L. */
  le: Math.sqrt(12 * 17.2 / 8.9), be: 8.9 / Math.sqrt(12 * 17.2 / 8.9),
};
const WM_T = HULL.displacement / RHO / WM.awp; // her mean draft for the Smith effect, m
const C33 = RHO * G * WM.awp, C55 = RHO * G * WM.il;
const M33 = HULL.displacement + WM.a33, I55 = HULL.displacement * WM.gyr ** 2 + WM.a55;
const B33 = 2 * WM.zeta * Math.sqrt(M33 * C33), B55 = 2 * WM.zeta * Math.sqrt(I55 * C55);
/** The strips' added mass and damping against their restoring (s², s): the diffraction's share of the push. */
const RA = WM.a33 / C33, RB = B33 / C33;
/** Natural periods (s) of heave and pitch. */
export const NATURAL = { heave: 2 * Math.PI * Math.sqrt(M33 / C33), pitch: 2 * Math.PI * Math.sqrt(I55 / C55) };
const sinc = (x: number) => Math.abs(x) < 1e-4 ? 1 - x * x / 6 : Math.sin(x) / x;

/**
 * The waves' heave force (N) and pitch moment (N·m, bow up) on her at point p, heading h (deg), at wave time t; and,
 * from the same waves (phase 2), the water's orbital velocity under her, U along her and V across her (m/s, + forward
 * and to starboard), and the effective slope across her S (rad, + the water higher to starboard).
 * - **Surge and sway:** the water in a wave moves in orbits, forward under a crest and back under a trough, and a
 *   floating hull goes with it. The Froude–Krylov push along her (her weight × the wave's slope along her) is just what
 *   it takes to carry her mass, and the added mass of the water she moves, along with the water's own acceleration
 *   (∂u/∂t = −g·∂ζ/∂x at the surface): written for her speed through the water the two cancel, and she moves through the
 *   water as she would in calm water while the water itself carries her (Newman, Marine Hydrodynamics §6.18, a body
 *   small against the wavelength). So the orbit goes where the current does: into her motion over the ground and into
 *   the wind her sails meet (physics.ts), not into her speed through the water (her log, her resistance, her rudder,
 *   the AI's "is she going fast enough to tack"). Averaged over her length and beam with the Smith factor, as the force
 *   would be. That's exact for a boat at rest. Under way she also sails through the orbit, from water moving one way
 *   into water moving another: her speed through the water changes by −U·∂u/∂ξ (U her speed through the water, ξ along
 *   her), the convective part of the water's acceleration along her path (the physics review: dv_rel/dt = (T −
 *   R(v_rel))/m′ − U·∂u/∂ξ). It's nothing when she's stopped and grows with her speed; as she nears the waves' own
 *   speed it and the orbit together make the whole Froude–Krylov push of a wave face, so running before a chop that
 *   travels a little faster than she sails (a 2.5–3 s wave runs at 3.9–4.7 m/s, she at about 3) she can be picked up and
 *   carried on a face: surf-riding (Grim 1951; Spyrou 2006), from the physics, not a rule. A 12–18 s swell (19–28 m/s)
 *   only rocks her to and fro. The mean loss in waves stays seaDrag's (the second-order drift).
 * - **Roll:** the same slope across her beam: a wave tilts the water under her and she heels to follow it, a moment
 *   ρ·g·∇·GM × that effective slope (the standard beam-sea simplification, Journée & Massie ch. 6). The slope is the
 *   Froude–Krylov one, averaged across her beam and along her length with the Smith factor, so in a long swell it's
 *   the surface's own slope (a free hull follows the surface normal there; IMO's weather criterion takes a smaller
 *   effective slope, r = 0.73 + 0.6·OG/d, for a ship's deep hull and its centre of gravity, a different case). It goes
 *   to the heel balance (balance.ts rollStep) as a change in the heel she settles to. Her roll period, about 3.5 s, is
 *   longer than the Bay's chop, so a beam chop rocks her little; a long swell tilts her with its slope, gently.
 */
export function waveForces(f: WaveField, p: { x: number; y: number }, h: number, t: number, kW: number, kS: number): { F: number; M: number; U: number; V: number; DU: number; S: number } {
  const fx = Math.sin(h * D2R), fy = Math.cos(h * D2R); // forward
  const cx = p.x - fx * WM.cfAft, cy = p.y - fy * WM.cfAft; // the centre of flotation
  let F = 0, M = 0, U = 0, V = 0, DU = 0, S = 0;
  for (let i = 0; i < N_WAVES; i++) {
    const a = f.amp[i] * (f.swell[i] ? kS : kW); if (a < 1e-5) continue;
    const k = f.k[i], sd = f.sd[i], cd = f.cd[i];
    const ax = k * (sd * fx + cd * fy), ay = k * (sd * fy - cd * fx); // the wavenumber along her and across her
    const th = k * (sd * cx + cd * cy) - f.w[i] * t + f.phase[i];
    const A = a * Math.exp(-k * WM_T) * sinc(ay * WM.be / 2), q = ax * WM.le / 2;
    // the diffraction's two parts (see above), at the wave's own frequency: the water's acceleration is the orbit's,
    // ω²ζ, whatever her speed. (The relative-motion form's ωe², her speed through the wave counted in, grows without
    // bound in short head seas, where strip theory's high-frequency added mass is least right; the forward-speed terms,
    // Salvesen–Tuck–Faltinsen's, are left out with it)
    const w = f.w[i], inPhase = 1 - RA * w * w, quad = RB * w, s = Math.sin(th), c = Math.cos(th);
    F += A * WM.le * sinc(q) * (inPhase * s - quad * c);
    M += A * (Math.abs(q) < 1e-3 ? ax * WM.le ** 3 / 12 : 2 * (Math.sin(q) - q * Math.cos(q)) / (ax * ax)) * (inPhase * c + quad * s);
    // the slope across her and the orbit's horizontal velocity (a·ω, in phase with the surface, along the wave's travel),
    // averaged over her waterplane
    const av = A * sinc(q); S += ay * av * c;
    const u = av * f.w[i] * s / k; U += ax * u; V += ay * u;
    DU += av * f.w[i] * c * ax * ax / k; // (∂U/∂ξ: the along-her orbit's change along her)
  }
  return { F: RHO * G * WM.be * F, M: RHO * G * WM.be * M, U, V, DU, S };
}

/** Step her heave and pitch `dt` seconds on the waves of field `f` at wave time t (semi-implicit Euler: stable at the sim's step). */
export function waveMotion(b: Boat, f: WaveField, t: number, dt: number): void {
  const s = b.sea; if (!s) return;
  const { kW, kS } = f.scaleFor(s), { F, M, U, V, DU, S } = waveForces(f, b, b.h, t, kW, kS);
  b.waveU = U; b.waveV = V; b.waveDU = DU; b.waveRoll = S / D2R; // (for physics.ts: the water's orbit under her, and the heel the slope across her asks, deg + to port)
  let z = b.heave ?? 0, zr = b.heaveRate ?? 0, th = b.pitch ?? 0, thr = b.pitchRate ?? 0;
  zr += (F - C33 * z - B33 * zr) / M33 * dt; z += zr * dt;
  thr += (M - C55 * th - B55 * thr) / I55 * dt; th += thr * dt;
  b.heave = z; b.heaveRate = zr; b.pitch = th; b.pitchRate = thr;
}
