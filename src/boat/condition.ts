import { SAIL_WEAR, STD_RIG, type SailRig, type SailWear } from './controls';
import type { Boat } from './boat';
import { fixTune, guideTune, tuneEffect, tuneName } from './rigTune';
import type { BoatSpec } from './spec';
import { HULL } from './dynamics';
import { dCfAt, fouling, type Fouling } from './fouling';
import { OUTBOARDS } from './motor';

/**
 * Your boat's condition, in physical terms: what each setting in the Boat panel does to her.
 *
 * - **Bottom:** weeks since it was cleaned → the fouling on it → added skin friction (fouling.ts).
 * - **Sails** (main and jib separately): new, midlife or end of life. Aged Dacron sits deeper with the draft further
 *   aft, stretches more as the wind builds, twists open at the head in the gusts and hooks at the leech (more profile
 *   drag). The direction of every effect is agreed by sailmakers (Quantum, UK Sailmakers, North); the sizes are
 *   estimates bounded by their examples (a main cut with the draft at 45% ends up at 55–60%) and by lift–camber data
 *   (Dayman 1953). See controls.ts SAIL_WEAR.
 * - **Mast:** the class designed the aluminium mast to bend like an average wooden one and to be no better than a
 *   good one (NFIA, 2000). Aluminium masts are all alike; wooden ones vary, soft to stiff. A softer mast starts flatter
 *   (more pre-bend), flattens further under backstay, and bends more under the sail's load, so it depowers by itself
 *   in a gust (the main flattens and its upper leech opens): an advantage in a gusty breeze, less power in moderate
 *   air. A stiff mast holds its power, but heels her more in the gusts. A wooden rig also weighs about 9 kg more,
 *   high up (an aluminium-rigged boat at the class minimum carries those 9 kg as correctors in the bilge instead).
 * - **Boom:** the class sets an aluminium boom's minimum weight (9 kg) about where a spruce boom comes out: no measured
 *   difference in speed. It changes her looks only.
 * - **Outboard:** about 13 kg (a 2.5 hp four-stroke). Stowed below, it's weight low and a little aft; on the transom
 *   bracket (leg up) it's weight at the very stern. (Racing with it on the bracket is against the class rules.)
 * - **Weight over the class minimum** (1930 kg, the same for wood and fibreglass): gear and stores, or an old wooden
 *   hull's soaked planking. Displacement goes up: slower in light air, and more inertia.
 */

export interface Condition {
  fouling: Fouling;
  /** Added skin-friction coefficient (ΔC_F) over the smooth-hull ITTC-57 line, at speed v (m/s): fouling and the paint's finish. */
  dCf: (v: number) => number;
  main: SailRig; jib: SailWear;
  /** Mass added to the boat (kg) and its fore–aft moment (kg·m, + forward of the centre of flotation: hullTrim.ts trims her by it). */
  extraKg: number; extraMoment: number;
  /** Change in righting moment (N·m) at heel h (deg): weight aloft (a wooden rig) reduces it. */
  rightingDelta: (heelDeg: number) => number;
}

const G = 9.81;
/** A wooden rig's extra weight aloft (kg) and how far above the bilge correctors it sits (m). */
const WOOD_RIG = { kg: 9, dz: 5.3 };
/** Her outboard's weight (kg): boat/motor.ts OUTBOARDS, by her motor (the 3.5's unless she says). */
const outboardKg = (s: BoatSpec) => OUTBOARDS[s.perf.outboardHp ?? 3.5].kg;
/**
 * How much a mast bends, relative to aluminium (all alike) and to the average wooden mast, which the aluminium mast
 * was designed to match: in the class bend test (16 kg hung 4.8 m from the top), wooden masts measure about
 * 105–145 mm and aluminium about 125 mm (folkebaad.dk), so a soft wooden mast bends ~16% more, a stiff one ~16% less.
 */
const MAST_BEND = { soft: 145 / 125, average: 1, stiff: 105 / 125 };
/** Fore–aft places (m aft of the centre of flotation, which sits about 0.3 m aft of the middle of the boat's length: an
 * estimate): the outboard on its transom bracket, and stowed in a cockpit locker. */
const STATION = { transom: 3.45, locker: 2.3 };

/** Her condition from how you've set her up, in the month (1–12) she's sailing (fouling grows faster in warm water). */
export function condition(s: BoatSpec, month = 9): Condition {
  const f = fouling(s.perf.cleanedWeeks, month), finish = s.perf.finish;
  const ob = s.perf.outboard;
  const extraKg = s.perf.gearKg + (ob === 'none' ? 0 : outboardKg(s));
  // gear sits about amidships (no moment); the outboard aft
  const extraMoment = ob === 'bracket' ? -outboardKg(s) * STATION.transom : ob === 'stowed' ? -outboardKg(s) * STATION.locker : 0;
  const wood = s.perf.mast === 'wood';
  return {
    fouling: f, dCf: v => dCfAt(f, finish, v),
    main: { wear: SAIL_WEAR[s.perf.mainAge], bend: wood ? MAST_BEND[s.perf.mastStiffness] ?? 1 : 1 },
    jib: SAIL_WEAR[s.perf.jibAge],
    extraKg, extraMoment,
    rightingDelta: h => (wood ? -WOOD_RIG.kg * G * WOOD_RIG.dz * Math.sin(h * Math.PI / 180) : 0)
      + (ob === 'bracket' ? -outboardKg(s) * G * 0.9 * Math.sin(h * Math.PI / 180) : 0) // on the bracket it's up near deck level
  };
}

/** Set the jumpers (turns, under way: CR 7.40 lets them be adjusted above deck while racing): the rig is worked out again. */
export function setJumpers(b: Pick<Boat, 'tune' | 'rigMain'>, turns: number, tws: number): void {
  // (with no tune set she was on the guide's for the wind: the rest of it stays where that had it)
  const t = fixTune({ ...(b.tune ?? guideTune(tws)), jumperTurns: turns });
  b.tune = t; b.rigMain = undefined;
}

/**
 * The jumpers under way (CR 7.40 allows them to be adjusted above deck while racing; Heikkilä Sailmaker's guide adjusts
 * them during a race): you ask for a setting (turns, 0–5 in half turns) and the crew works the turnbuckle toward it, a
 * half turn at a time. JUMPER_HALF_TURN_S: how long a half turn takes, by hand, with the rig loaded (an estimate).
 */
export const JUMPER_HALF_TURN_S = 4;
export function wantJumpers(b: Pick<Boat, 'jumperTarget'>, turns: number): void {
  b.jumperTarget = Math.max(0, Math.min(5, Math.round(turns * 2) / 2));
}
/** The crew on the jumpers: a half turn every JUMPER_HALF_TURN_S toward the target (world.ts, each step). */
export function stepJumpers(b: Pick<Boat, 'tune' | 'rigMain' | 'jumperTarget' | 'jumperT'>, dt: number, tws: number): void {
  if (b.jumperTarget == null) return;
  const now = (b.tune ?? guideTune(tws)).jumperTurns;
  if (Math.abs(b.jumperTarget - now) < 1e-6) { b.jumperTarget = undefined; b.jumperT = 0; return; }
  b.jumperT = (b.jumperT ?? 0) + dt;
  if (b.jumperT < JUMPER_HALF_TURN_S) return;
  b.jumperT = 0;
  setJumpers(b, now + Math.sign(b.jumperTarget - now) * Math.min(0.5, Math.abs(b.jumperTarget - now)), tws);
}

/**
 * The rig the main is set on, with her tune this outing (b.tune: the Boat panel's, or the one she was set to at the
 * dock for a race's forecast, rigTune.ts): worked out once and kept on the boat (b.rigMain), until the tune changes
 * (the jumpers, under way: setJumpers). No tune: her condition's rig, as before.
 */
export function mainRig(b: Pick<Boat, 'tune' | 'rigMain' | 'cond'> & { spec?: BoatSpec }): SailRig | undefined {
  if (b.spec && !b.cond) b.cond = condition(b.spec); // (as physics.ts does: her condition before her rig)
  if (!b.tune) return b.cond?.main;
  const base = b.cond?.main ?? STD_RIG;
  return b.rigMain ??= { ...base, tune: tuneEffect(b.tune, base.bend) };
}

/** Added skin friction (N) at speed v (m/s) from roughness over the smooth-hull friction line, with the form factor. */
export const foulingDrag = (c: Condition, v: number) => v <= 0 ? 0 : 0.5 * 1025 * HULL.wettedSurface * c.dCf(v) * v * v * 1.15;

/** Short notes under each setting in the Boat panel. */
export const PERF_INFO = {
  weeks: 'Slime builds over the first weeks; copper antifouling holds off barnacles for about six, then they come fast (faster in late-summer water than in January). A slow boat feels it most: in light air, skin friction is most of her drag. Racing Folkboats are scrubbed every week or two.',
  finish: 'A burnished racing bottom has about 3% less skin friction than antifouling as it was rolled on (Schultz 2002). Worth a fraction of a percent; most in light air.',
  sails: 'Old Dacron sits deeper with the draft further aft, stretches more as the breeze builds and hooks at the leech: more heel and weather helm, less drive and pointing. A deeper sail can help a little in very light air.',
  spars: 'The class built the aluminum mast to bend like an average wooden one; wooden masts vary. A soft mast flattens the main and opens its leech by itself in a gust (good in a gusty breeze) but has less power in moderate air; a stiff one keeps its power but heels more in the gusts. A wooden rig is also about 9 kg heavier aloft. The boom makes no measured difference.',
  outboard: 'Tohatsu-class four-strokes: 2.5 hp (about 13 kg, no reverse gear: it swivels to push astern), 3.5 hp (about 18 kg) or 6 hp (about 26 kg). On the bracket you can motor (the Motor button); it\'s weight at the very stern, and the class rules don\'t allow racing with it mounted aft (NFIA, 2006, rule 1.11): race setup stows it. Stowed below it costs less.',
  gear: 'Gear and stores, or an old wooden hull\'s soaked planking, over the class minimum of 1930 kg (wooden and fiberglass alike). Slower in light air; a little more stable in a breeze.'
};

/** The reference boat the costs are measured against: clean bottom, new sails, aluminium spars, nothing extra aboard. */
export const referencePerf = (s: BoatSpec): BoatSpec => ({ ...s, perf: { ...s.perf, cleanedWeeks: 0, finish: 'antifouling', mainAge: 'new', jibAge: 'new', mast: 'aluminium', boom: 'aluminium', mastStiffness: 'average', outboard: 'none', gearKg: 0 , tune: undefined} });

/** Each thing about your boat that costs (or gains) speed, as a change from the reference boat. */
export function conditionItems(s: BoatSpec, month = 9): { label: string; spec: BoatSpec }[] {
  const ref = referencePerf(s), p = s.perf, items: { label: string; spec: BoatSpec }[] = [];
  const w = (label: string, perf: Partial<BoatSpec['perf']>) => items.push({ label, spec: { ...ref, perf: { ...ref.perf, ...perf } } });
  if (p.cleanedWeeks > 0 || p.finish !== 'antifouling') w(`Bottom (${p.cleanedWeeks ? fouling(p.cleanedWeeks, month).label : 'clean'}${p.finish === 'race' ? ', racing finish' : ''})`, { cleanedWeeks: p.cleanedWeeks, finish: p.finish });
  if (p.mainAge !== 'new' || p.jibAge !== 'new') w(`Sails (main ${AGE[p.mainAge]}, jib ${AGE[p.jibAge]})`, { mainAge: p.mainAge, jibAge: p.jibAge });
  if (p.mast === 'wood') w(`Wooden mast${p.mastStiffness !== 'average' ? ` (${p.mastStiffness})` : ''}`, { mast: 'wood', mastStiffness: p.mastStiffness });
  // (the rig's tune against the guide's for the wind the panel measures in: none set, nothing to count)
  if (p.tune) w(`Rig tune (${TUNE_LABEL[tuneName(fixTune(p.tune))]})`, { tune: p.tune });
  if (p.outboard !== 'none') w(p.outboard === 'bracket' ? 'Outboard on the bracket' : 'Outboard stowed below', { outboard: p.outboard });
  if (p.gearKg > 0) w(`${Math.round(p.gearKg / 0.4536)} lb over the minimum`, { gearKg: p.gearKg });
  return items;
}
const AGE = { new: 'new', mid: 'midlife', old: 'end of life' } as const;
const TUNE_LABEL = { light: 'North Sails light', medium: 'North Sails medium', strong: 'North Sails strong', heikkila: 'Heikkilä', custom: 'your own' } as const;
