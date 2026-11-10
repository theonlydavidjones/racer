import { D2R, clamp } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';

/**
 * The people aboard and where they put their weight. The helm steers from the aft end of the cockpit; up to two crew
 * go where the boat needs them, as a good crew does:
 * - light air upwind: to leeward and forward, to give her a little heel (the sails fall into shape, less wetted
 *   surface) and lift the transom;
 * - a moderate breeze: up on the windward side, sitting;
 * - only when she'd heel past about 17°: hiking, leaning out as far as it takes (taller crew reach further out);
 * - downwind: the boat flat, weight forward (the pole hand up at the mast); in a big breeze downwind, aft, to keep
 *   the bow from burying.
 * They move at a human pace, so a gust heels her before they've hiked, and after a tack they have to cross the boat.
 * Their weight is part of the displacement (heavier: slower in light air, more power to carry in a breeze).
 */

export interface Person { h: number; w: number } // height (m), weight (kg)
export interface CrewSpec { helm: Person; crew: Person[] } // 0, 1 or 2 crew besides the helm
export const DEFAULT_CREW: CrewSpec = { helm: { h: 1.78, w: 80 }, crew: [{ h: 1.75, w: 78 }, { h: 1.72, w: 72 }] };

/** The hull and rig without people (the ORC sailing displacement includes about three crew, ~240 kg). */
export const HULL_EMPTY = orc.boat.displacementSailing - 240;
export const STANDARD_DISP = orc.boat.displacementSailing;

export type CrewMode = 'leeward' | 'centre' | 'windward' | 'hike' | 'downwind' | 'foredeck';
export interface CrewState {
  spec: CrewSpec;
  /** Where the crew's weight is across the boat: their moment arm (m, + to windward), averaged by weight; it lags. */
  arm: number;
  /** Fore and aft: 0 at the helm, 1 at the mast. */
  fore: number;
  mode: CrewMode;
  /** 0..1: how hard they're hiking. */
  hike: number;
  /** The tack they were set up for (to see a tack and send them across). */
  side: 'S' | 'P';
}

export const crewMass = (s: CrewSpec) => s.helm.w + s.crew.reduce((a, p) => a + p.w, 0);
export const displacement = (s: CrewSpec) => HULL_EMPTY + crewMass(s);
/** How far out (m from the centreline) a person's weight can go: sitting on the rail, leaning out by their height. */
const ARM = { leeward: -0.55, centre: 0.1, sit: 0.95, helmSeat: 0.55, helmMax: 0.85 };
export const hikeArm = (p: Person) => 1.05 + 0.2 * p.h;

export function newCrew(spec: CrewSpec, tack: 'S' | 'P'): CrewState { return { spec, arm: 0.6, fore: 0.4, mode: 'windward', hike: 0, side: tack }; }

/** Pace of crew work (lines, the pole) for the number of hands: alone, the helm does it all. */
export const handsFactor = (s: CrewSpec) => [0.5, 0.8, 1][Math.min(2, s.crew.length)];

/**
 * Where the crew go now. `need`: the crew moment (N·m) that would hold the boat at her best heel; `twa`, `tws`;
 * `pole`: the pole is set. Updates the state with a human lag.
 */
export function placeCrew(c: CrewState, need: number, twa: number, tws: number, pole: boolean, tack: 'S' | 'P', dt: number): void {
  const s = c.spec, W = crewMass(s) * 9.81;
  if (tack !== c.side) { c.arm = -c.arm; c.side = tack; } // after a tack the crew are on the new leeward side, and must cross
  const crewOnly = s.crew.reduce((a, p) => a + p.w, 0) * 9.81;
  // the arm they'd go to: the helm stays near the seat; the crew take whatever is needed, within reach
  const maxArm = (s.helm.w * ARM.helmMax + s.crew.reduce((a, p) => a + p.w * hikeArm(p), 0)) * 9.81 / W;
  const minArm = (s.helm.w * -0.35 + s.crew.reduce((a, p) => a + p.w * ARM.leeward, 0)) * 9.81 / W;
  const sitArm = (s.helm.w * ARM.helmSeat + s.crew.reduce((a, p) => a + p.w * ARM.sit, 0)) * 9.81 / W;
  // light air upwind: to leeward for a little heel; from about 7 kt they sit up to windward as a matter of course
  // (the heel limit is a ceiling, not a goal), and hike only when that isn't enough; downwind, whatever keeps her flat
  const breeze = Math.min(1, Math.max(0, (tws - 6) / 2));
  const want = twa > 120 ? clamp(need / W, minArm, maxArm)
    : breeze <= 0 ? clamp(Math.min(need / W, -0.3), minArm, 0) // light air: to leeward, always
    : clamp(Math.max(need / W, sitArm * breeze), minArm, maxArm);
  // human pace: a couple of seconds to move across the boat, faster to lean out a bit more
  c.arm += clamp(want - c.arm, -dt * 0.55, dt * 0.7);
  c.hike = crewOnly > 0 ? clamp((c.arm - sitArm) / Math.max(0.05, maxArm - sitArm), 0, 1) : 0;
  const downwind = twa > 120;
  c.mode = downwind ? (pole && s.crew.length ? 'foredeck' : 'downwind') : c.arm < -0.05 ? 'leeward' : c.arm < sitArm * 0.6 ? 'centre' : c.hike > 0.08 ? 'hike' : 'windward';
  // fore and aft
  const want2 = bestFore(twa, tws, pole);
  c.fore += clamp(want2 - c.fore, -dt * 0.25, dt * 0.25);
}

/** Where a crew's weight is best fore and aft (0 helm .. 1 mast) for the conditions. */
export function bestFore(twa: number, tws: number, pole: boolean): number {
  if (twa > 120) return tws > 17 ? 0.35 : pole ? 0.95 : 0.85;
  return tws < 7 ? 0.8 : tws < 13 ? 0.6 : 0.45;
}

/**
 * Speed factor from where the weight is fore and aft: forward in light air and downwind lifts the wide transom
 * clear; aft in a big breeze downwind keeps the bow up. The helm can't leave the tiller, so with no crew she can't
 * be trimmed forward. Up to about 2.5% at worst. `fore`: the crew's position (0..1); `extra`: other weight's moment.
 */
export function trimFactor(s: CrewSpec, fore: number, twa: number, tws: number, pole: boolean, extra = 0): number {
  const crew = s.crew.reduce((a, p) => a + p.w, 0);
  const moment = crew * (fore - 0.5) + s.helm.w * (0.05 - 0.5) + extra; // `extra`: other weight's moment (an outboard aft)
  const ref = 160 * (bestFore(twa, tws, pole) - 0.5) + 80 * (0.05 - 0.5); // a standard crew in the right place
  return 1 - 0.025 * Math.min(1, ((moment - ref) / 110) ** 2);
}

/** Speed factor from the displacement: a heavy boat is slower in light air (more to push), no matter in a breeze. */
export function displacementFactor(disp: number, tws: number): number {
  const k = clamp(0.16 - 0.009 * (tws - 4), 0, 0.16);
  return Math.pow(STANDARD_DISP / disp, k);
}

/** The crew's righting moment (N·m) at heel `heelDeg`: their weight times their arm, + to windward. */
export const crewMoment = (c: CrewState, heelDeg: number) => crewMass(c.spec) * 9.81 * c.arm * Math.cos(heelDeg * D2R);
