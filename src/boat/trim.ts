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

export const SAILS: Record<SailName, SailSpec> = {
  main: { aoa: 22, min: 2, max: BOOM_STOP, crewRate: 9, handRate: 12, share: 0.7 }, // (max: the boom on the shroud, controls.ts)
  jib: { aoa: 18, min: carLead(0), max: 68, crewRate: 14, handRate: 16, share: 0.3 }, // (min: the car's innermost lead, controls.ts)
};

/** Luffing starts this far (deg) below the best angle of attack and is complete 10° further on. */
const LUFF_START = 2, LUFF_SPAN = 10;
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
  if (err < -LUFF_START) { amount = clamp((-err - LUFF_START) / LUFF_SPAN, 0, 1); effUp = 1 - amount * amount; flow = 'luffing'; }
  else if (err > STALL_START) { amount = clamp((err - STALL_START) / 25, 0, 1); effUp = 1 - 0.5 * Math.pow(amount, 1.3); flow = 'stalled'; }
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
