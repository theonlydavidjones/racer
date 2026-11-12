/**
 * The outboard on her transom bracket: what it pushes, and what it costs her when it's down and not pushing.
 *
 * The motors (a small four-stroke, as a Folkboat carries): Tohatsu's MFS2.5, MFS3.5 and MFS6 classes. The 3.5's figures
 * (gear ratio 2.15:1, full throttle 5,000–6,000 rpm, its standard prop 7.4 in across by 7.0 in pitch, three blades, about
 * 18.4 kg) and the 2.5's gearbox (forward and neutral only: no reverse, the motor swivels round to go astern) are from
 * Tohatsu's specifications as summarised by retailers (tohatsu.com itself wasn't reachable from the session that wrote this).
 * The 2.5's and the 6's props are assumed the 3.5's, and the 6's weight (26 kg) is Tohatsu's, as summarised: to check.
 *
 * Thrust: no published bollard pull for these motors was found, so it's worked out from the prop's size and the motor's
 * power by propeller momentum (actuator-disc) theory, the textbook starting point (e.g. Carlton, Marine Propellers and
 * Propulsion, ch. 8): an ideal disc of area A absorbing power P at rest gives T = (2ρA)^(1/3)·P^(2/3); a real prop gets a
 * fraction of that, its figure of merit (FIGURE_OF_MERIT, an estimate). Moving through the water at v the thrust falls
 * (approximated as a straight line: an estimate of the shape, the usual first approximation) to nothing at the prop's pitch speed (where each turn advances the boat one pitch: no slip,
 * no thrust), pitch × prop rpm. Reverse is weaker than ahead (the blades work backwards: REVERSE, an estimate). The rated
 * power is the crank's; the gearbox takes perhaps 5–10% of it, inside the figure of merit's uncertainty.
 * For the 3.5 that's about 400 N at rest (90 lbf), falling to nothing at about 7.6 m/s (15 kt).
 */
import type { Boat } from './boat';

const RHO = 1025; // sea water, kg/m³
const HP = 745.7; // W

export type OutboardHp = 2.5 | 3.5 | 6;
export interface Outboard { hp: OutboardHp; kg: number; reverse: boolean; propD: number; pitch: number; rpm: number; gear: number }
/** The motors on offer (see above for where the figures come from). */
export const OUTBOARDS: Record<OutboardHp, Outboard> = {
  2.5: { hp: 2.5, kg: 13, reverse: false, propD: 7.4 * 0.0254, pitch: 7.0 * 0.0254, rpm: 5500, gear: 2.15 },
  3.5: { hp: 3.5, kg: 18.4, reverse: true, propD: 7.4 * 0.0254, pitch: 7.0 * 0.0254, rpm: 5500, gear: 2.15 },
  6: { hp: 6, kg: 26, reverse: true, propD: 7.8 * 0.0254, pitch: 7.0 * 0.0254, rpm: 5500, gear: 2.08 }
};
/** A small outboard's prop: how much of the ideal disc's thrust it gets at rest (an estimate: small props do 0.5–0.7). */
export const FIGURE_OF_MERIT = 0.55;
/** Astern, the share of the thrust ahead (an estimate: the blades' sections work backwards, and the exhaust's in the way). */
export const REVERSE = 0.5;
/** The leg and the stopped prop down in the water, not driving: drag area (Cd·A, m²). An estimate: a streamlined strut about
 * 4 cm thick by 35 cm deep (Cd about 0.1 on its frontal area, 0.014 m²) and the prop's disc (0.028 m², Cd about 0.3
 * stopped). Tilted up: nothing. */
export const LEG_CDA = 0.010;
/** Tick-over's share of full power: (1,150 / 5,500 rpm)³ (an estimate: a small four-stroke's usual idle, and a fixed prop's
 * power going as its rpm cubed). */
export const IDLE = (1150 / 5500) ** 3;

/** Her motor's state (on her, while she has one on the bracket). */
export interface MotorState {
  hp: OutboardHp;
  /** tilted down into the water */
  down: boolean;
  running: boolean;
  gear: 'F' | 'N' | 'R';
  /** 0 (tick-over) … 1 (full) */
  throttle: number;
  /** the 2.5, with no reverse gear, turned round on its bracket to push astern */
  swivel?: boolean;
  /** pulling the starter cord: seconds left of this pull, and whether it'll catch */
  pulling?: { left: number; catches: boolean };
  /** it's run already this sail: a warm motor starts more readily */
  warm?: boolean;
}

/** The prop's static thrust at full power (N), from momentum theory and the figure of merit. */
export function staticThrust(o: Outboard): number {
  const A = Math.PI * (o.propD / 2) ** 2, P = o.hp * HP;
  return FIGURE_OF_MERIT * Math.cbrt(2 * RHO * A) * Math.pow(P, 2 / 3);
}
/** The prop's pitch speed at full throttle (m/s): one pitch a turn of the prop. */
export const pitchSpeed = (o: Outboard): number => o.pitch * (o.rpm / o.gear) / 60;

/**
 * The motor's push along her (N, + ahead, − astern), going at `vAhead` m/s through the water (+ ahead, − astern). At a
 * throttle t the power is t of full (tick-over pushes nothing to speak of), so the thrust at rest goes as t^(2/3) and the
 * prop turns slower: its pitch speed as t^(1/3).
 */
export function thrust(m: MotorState, vAhead: number): number {
  if (!m.running || !m.down || m.pulling) return 0;
  const o = OUTBOARDS[m.hp], astern = m.gear === 'R' || (m.gear === 'F' && !!m.swivel);
  if (m.gear === 'N') return 0;
  // (the throttle from tick-over to full: at tick-over, about 1,150 rpm of 5,500, the power is (1150/5500)³ of full, which
  // in gear still creeps her along at a knot or so, as you come into a slip; a fixed prop's power goes as its rpm cubed)
  const t = Math.max(0, Math.min(1, m.throttle)), pw = IDLE + (1 - IDLE) * t, T0 = staticThrust(o) * Math.pow(pw, 2 / 3) * (m.gear === 'R' ? REVERSE : 1);
  const vp = pitchSpeed(o) * Math.cbrt(pw) * (m.gear === 'R' ? 0.8 : 1), v = astern ? -vAhead : vAhead; // (speed along the way it pushes)
  const T = T0 * Math.min(1, Math.max(0, 1 - v / vp)); // (pushing against her way, no more than at rest: the engine lugs)
  return astern ? -T : T;
}

/** The leg's drag when it's down and not driving (N, against her motion through the water at `speed` m/s). */
export const legDrag = (m: MotorState | undefined, speed: number): number =>
  m && m.down && !(m.running && m.gear !== 'N' && !m.pulling) ? 0.5 * RHO * LEG_CDA * speed * speed : 0;

/** The motor's net push on her along her heading (N): the thrust, less the leg's drag when it isn't driving. */
export function motorForce(b: Boat): number {
  const m = b.motor; if (!m) return 0;
  const vAhead = b.v - (b.astern ?? 0);
  return thrust(m, vAhead) - Math.sign(vAhead) * legDrag(m, Math.abs(vAhead));
}
