/**
 * Sail trim.
 *
 * Each sail has a sheet angle: how far its boom (or clew) is eased out from the centreline, in degrees.
 * Its angle of attack is the apparent wind angle minus the sheet angle. Upwind and reaching, each sail
 * drives best at a particular angle of attack; ease past it and the front of the sail lifts (luffing:
 * the windward telltales lift); trim past it and the flow on the leeward side breaks away (stalled: the
 * leeward telltales droop and the leech telltales hide). From a broad reach to a run the sails are
 * stalled anyway and simply want to be eased right out, square to the wind, for the most area.
 *
 * The polar is the boat's speed with perfect trim, so trim efficiency scales the target speed.
 */
import { BOOM_STOP, carLead } from './controls';

export type SailName = 'main' | 'jib';
export type Flow = 'good' | 'luffing' | 'stalled';

export interface SailSpec {
  aoa: number; // best angle of attack, deg (apparent wind to the sail's chord at mid height)
  min: number; // sheeted hard in, deg from centreline
  max: number; // fully eased: boom on the shroud / clew as far out as the sheet lead allows
  crewRate: number; // how fast the crew trims, deg/s
  handRate: number; // how fast you trim when you do it yourself, deg/s
  share: number; // share of the drive (by area)
}

/**
 * The best angles of attack are estimates: no primary source was reachable for either (Marchaj's 22° for a main is
 * quoted second-hand). The jib's is measured, as everything here is, from the apparent wind to its sheeting angle,
 * which reads low: the main's upwash bends the wind round ahead of it, so the jib meets it at a wider angle than the
 * boat's apparent wind (Gentry, "The Aerodynamics of Sail Interaction", Ancient Interface III, 3rd AIAA Symposium on the Aero/Hydronautics of Sailing, 1971; in degrees, not found). 16.5° is fitted to
 * the lead: North's car track (controls.ts carLead, 11.6–13.7°) puts the jib at its best close-hauled from the beat in
 * light air (apparent wind 28.5°, the inner holes) to a breeze (32°, eased off the outer ones), as a Folkboat sails;
 * at 18° the inner hole was too wide for the beat itself in 8 kt, the jib luffing a little at its own best course.
 */
/**
 * The main's twist between the boom and mid height, deg: `aoa` is the angle at mid height, and the sheet's angle is the
 * boom's, so the boom lies this much nearer the centerline than the mid-height chord. Half the head's twist with the
 * leech closed for a beat (controls.ts mainShape: about 12° at the head in a working breeze). Without it the boom sat 6 to
 * 8° out on a beat at 6 to 12 kt, the traveler car down to leeward with it; sailors carry the boom on the centerline
 * there: North Sails' Nordic Folkboat tuning guide has the traveler cars 15 to 20 cm to windward in 0 to 6 kt, in the
 * middle from 6 to 14 and to leeward above; North's IF-boat guide the boom about 200 mm to leeward in very light air
 * and on the centerline from 6 kt (as the researcher read them, 15 Nov 2026). An ESTIMATE of the twist; the boom's
 * place is the sourced figure it's set to meet.
 */
export const MAIN_TWIST_MID = 6;
export const SAILS: Record<SailName, SailSpec> = {
  main: { aoa: 22 + MAIN_TWIST_MID, min: 0, max: BOOM_STOP, crewRate: 9, handRate: 12, share: 0.7 }, // (max: the boom on the shroud, controls.ts)
  jib: { aoa: 16.5, min: carLead(0), max: 68, crewRate: 14, handRate: 16, share: 0.3 }, // (min: the car's innermost lead, controls.ts)
};

/** Luffing starts this far (deg) below the best angle of attack and is complete 10° further on. */
const LUFF_START = 2, LUFF_SPAN = 10;
/**
 * ... and for the main, measured at the boom, that far past where it began before the boom's best place moved in
 * (MAIN_TWIST_MID): eased from the centerline, the main starts to lift at the same place of the boom as it always has
 * here, and costs there what it cost. So the boom's best place is North's, and between it and where the luff begins
 * (some 8°: the traveler's play in a puff) she loses nothing by the ease, as before. The luff's width and what a
 * luffing main costs are left as they were on purpose: they wait on the owner's answer on the flogging main (ROADMAP,
 * "The boom's place on a beat").
 */
const luffStart = (sail: SailName) => (sail === 'main' ? LUFF_START + MAIN_TWIST_MID : LUFF_START);
/**
 * The traveler's play: what the main loses as the boom is eased across the band between its best place and where it
 * begins to lift (the first LUFF_START degrees cost nothing, as ever; then MAIN_TWIST_MID more).
 *
 * MEASURED, on another boat: Tahara, Masuyama, Fukasawa & Katori, "Sail Performance Analysis of Sailing Yachts by
 * Numerical Calculations and Experiments" (in Fluid Dynamics, Computational Modeling and Applications, InTech 2012;
 * docs/sources), section 5.3.2, Fig. 15 and Table 3: the sail dynamometer boat Fujin under sail, main and 130% jib,
 * apparent wind 30 +/- 2 degrees at 7.2 m/s, the boom held on the centerline with the traveler and the mainsheet eased,
 * the jib untouched. From 8.2 to 24.1 degrees of twist (boom to the chord at 80% of the height), for the whole rig:
 *   side force CY 1.37 -> 1.23 (-10%), drive CX 0.37 -> 0.33 (-11%), the center of effort 5.96 -> 5.47 m (-8%),
 *   her heel 16.8 -> 12.3 degrees. Over the series (4.5 to 24.9 degrees) CY 1.39 -> 1.16, CX 0.33 to 0.39 with the
 *   most drive "at a twist angle of around 15 degrees". Each point carries error bars of about +/- 0.1.
 * So what heels her, CY x the center's height, fell 17.6% over 15.9 degrees of twist: 1.1% a degree.
 *
 * CARRIED ACROSS, as ESTIMATES:
 * - twist at 80% of the height to the ease of the sail as a whole: about half (the twist grows from nothing at the boom,
 *   and most of the cloth is low), so 2.2% of the rig's heeling moment per degree of mean ease;
 * - to the main alone: only the main was eased, so all of that loss was the main's. Her main makes between 56% of the
 *   rig's heeling moment (its share of the sail area, 33.2 of 59.3 m2) and 68% (area times the height of each sail's
 *   centroid, about 6.2 m against 3.7 m), so the main lost 2.2 / 0.68 to 2.2 / 0.56 = 3.2 to 3.9% of its own a degree;
 *   3.4% here, toward the low end as the heavier weighting is the truer one for a moment (the Coordinator's ruling,
 *   16 Nov 2026: the main alone, at the middle of the range). With the error bars it could be half or nearly twice that;
 * - to this boat: Fujin is a 10.35 m, 3.86 t fractional sloop; the Folkboat's main is about 70% of her sail area, so
 *   the same loss on her main takes a little more off the whole rig;
 * - the drive: flat to the best trim, then falling in step with the side force (Table 3: -11% against -10%), the same
 *   share of the rig's drive as of its side force.
 * Past the band she luffs as she always has: the luff's width and what a luffing main costs are unchanged.
 */
export const BAND_HEEL_PER_DEG = 0.034;
/** Degrees the main is eased into the band (0 to MAIN_TWIST_MID), from its trim's `err`. */
export const mainBandDeg = (err: number): number => clamp(-err - LUFF_START, 0, MAIN_TWIST_MID);
/** The share of the main's heeling force lost there, at `rate` a degree (BAND_HEEL_PER_DEG; a test tries others). */
export const mainBandLoss = (err: number, rate = BAND_HEEL_PER_DEG): number => Math.min(1, rate * mainBandDeg(err));
/** Stalling starts this far above the best angle of attack. */
const STALL_START = 4;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** How downwind the sail is working: 0 = flow along the sail (AWA ≤ 90°), 1 = pushed from behind (AWA ≥ 120°). */
export const downwindness = (awa: number) => smooth((Math.abs(awa) - 90) / 30);

/** Best sheet angle for this apparent wind angle. */
export function optimalSheet(sail: SailName, awa: number): number {
  const s = SAILS[sail], a = Math.abs(awa);
  const upwind = clamp(a - s.aoa, s.min, s.max);
  return upwind + (s.max - upwind) * downwindness(a);
}

export interface SailTrim { eff: number; err: number; flow: Flow; amount: number }

/**
 * How well a sail is drawing. err = angle of attack minus the best one (deg): negative is under-trimmed
 * (luffing), positive over-trimmed (stalled). amount (0..1) is how strongly it luffs or stalls, for the
 * telltales and the sail's shape.
 */
export function sailTrim(sail: SailName, awa: number, sheet: number): SailTrim {
  const a = Math.abs(awa), dw = downwindness(a);
  // Angle of attack against the best one. Sheeted hard in, pointing too high still luffs the sail.
  const err = (a - sheet) - SAILS[sail].aoa;
  // flow along the sail (upwind/reaching)
  let effUp = 1, flow: Flow = 'good', amount = 0;
  const ls = luffStart(sail);
  if (err < -ls) { amount = clamp((-err - ls) / LUFF_SPAN, 0, 1); effUp = 1 - amount * amount; flow = 'luffing'; }
  else if (err > STALL_START) { amount = clamp((err - STALL_START) / 25, 0, 1); effUp = 1 - 0.5 * Math.pow(amount, 1.3); flow = 'stalled'; }
  // (the main eased across the band: the rig's drive goes in step with its side force, the main making
  // SAILS.main.share of both; as a share of the main's own drive, for trimDrive's weighing)
  if (sail === 'main') effUp *= 1 - mainBandLoss(err);
  // downwind: drive comes from area presented to the wind, so trimmed in means less drive
  const effDown = 0.4 + 0.6 * Math.sin(clamp(sheet, 0, 90) * Math.PI / 180) / Math.sin(clamp(optimalSheet(sail, a), 1, 90) * Math.PI / 180);
  if (dw > 0.5) { flow = 'good'; amount = 0; } // stalled is normal downwind; the telltales just hang
  return { eff: clamp(effUp * (1 - dw) + clamp(effDown, 0, 1) * dw, 0, 1), err, flow, amount };
}

/** Combined drive from both sails (1 = perfect trim). A poled-out jib or a jib that's down is handled by the sail plan. */
export function trimDrive(main: SailTrim, jib: SailTrim | null): number {
  if (!jib) return main.eff;
  return SAILS.main.share * main.eff + SAILS.jib.share * jib.eff;
}
