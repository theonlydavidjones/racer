import { SAIL_WEAR, type SailRig, type SailWear } from './controls';
import type { BoatSpec } from './spec';
import { HULL } from './dynamics';
import { dCfAt, fouling, type Fouling } from './fouling';

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
 *   good one (NFIA, 2000), so they race as equals. What differs: a wooden rig weighs about 9 kg more, high up (an
 *   aluminium-rigged boat at the class minimum carries those 9 kg as correctors in the bilge instead), and a wooden
 *   mast bends more in its middle, so the backstay flattens the main further.
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
  /** Mass added to the boat (kg) and its fore–aft moment in the crew-trim units of crewPhys (kg × station, 0 helm .. 1 mast, minus 0.5). */
  extraKg: number; extraMoment: number;
  /** Change in righting moment (N·m) at heel h (deg): weight aloft (a wooden rig) reduces it. */
  rightingDelta: (heelDeg: number) => number;
}

const G = 9.81;
/** A wooden rig's extra weight aloft (kg) and how far above the bilge correctors it sits (m). */
const WOOD_RIG = { kg: 9, dz: 5.3 };
const OUTBOARD_KG = 13;
/** Fore–aft stations in crewPhys units (0 at the helm, 1 at the mast): the transom, and a cockpit locker. */
const STATION = { transom: -0.28, locker: 0.0 };

/** Her condition from how you've set her up, in the month (1–12) she's sailing (fouling grows faster in warm water). */
export function condition(s: BoatSpec, month = 9): Condition {
  const f = fouling(s.perf.cleanedWeeks, month), finish = s.perf.finish;
  const ob = s.perf.outboard;
  const extraKg = s.perf.gearKg + (ob === 'none' ? 0 : OUTBOARD_KG);
  // gear sits about amidships (no moment); the outboard aft
  const extraMoment = ob === 'bracket' ? OUTBOARD_KG * (STATION.transom - 0.5) : ob === 'stowed' ? OUTBOARD_KG * (STATION.locker - 0.5) : 0;
  const wood = s.perf.mast === 'wood';
  return {
    fouling: f, dCf: v => dCfAt(f, finish, v),
    main: { wear: SAIL_WEAR[s.perf.mainAge], bend: wood ? 1.2 : 1 },
    jib: SAIL_WEAR[s.perf.jibAge],
    extraKg, extraMoment,
    rightingDelta: h => (wood ? -WOOD_RIG.kg * G * WOOD_RIG.dz * Math.sin(Math.abs(h) * Math.PI / 180) : 0)
      + (ob === 'bracket' ? -OUTBOARD_KG * G * 0.9 * Math.sin(Math.abs(h) * Math.PI / 180) : 0) // on the bracket it's up near deck level
  };
}

/** Added skin friction (N) at speed v (m/s) from roughness over the smooth-hull friction line, with the form factor. */
export const foulingDrag = (c: Condition, v: number) => v <= 0 ? 0 : 0.5 * 1025 * HULL.wettedSurface * c.dCf(v) * v * v * 1.15;

/** Short notes under each setting in the Boat panel. */
export const PERF_INFO = {
  weeks: 'Slime builds over the first weeks; copper antifouling holds off barnacles for about six, then they come fast (faster in late-summer water than in January). A slow boat feels it most: in light air, skin friction is most of her drag. Racing Folkboats are scrubbed every week or two.',
  finish: 'A burnished racing bottom has about 3% less skin friction than antifouling as it was rolled on (Schultz 2002). Worth a fraction of a percent; most in light air.',
  sails: 'Old Dacron sits deeper with the draft further aft, stretches more as the breeze builds and hooks at the leech: more heel and weather helm, less drive and pointing. A deeper sail can help a little in very light air.',
  spars: 'The class built the aluminium mast to bend like an average wooden one. A wooden rig is about 9 kg heavier aloft (a little less stability), and bends more in the middle (the backstay flattens the main further). The boom makes no measured difference.',
  outboard: 'About 13 kg. On the transom bracket it\'s weight at the very stern (and against the class rules while racing); stowed below it costs less.',
  gear: 'Gear and stores, or an old wooden hull\'s soaked planking, over the class minimum of 1930 kg (wooden and fiberglass alike). Slower in light air; a little more stable in a breeze.'
};

/** The reference boat the costs are measured against: clean bottom, new sails, aluminium spars, nothing extra aboard. */
export const referencePerf = (s: BoatSpec): BoatSpec => ({ ...s, perf: { ...s.perf, cleanedWeeks: 0, finish: 'antifouling', mainAge: 'new', jibAge: 'new', mast: 'aluminium', boom: 'aluminium', outboard: 'none', gearKg: 0 } });

/** Each thing about your boat that costs (or gains) speed, as a change from the reference boat. */
export function conditionItems(s: BoatSpec, month = 9): { label: string; spec: BoatSpec }[] {
  const ref = referencePerf(s), p = s.perf, items: { label: string; spec: BoatSpec }[] = [];
  const w = (label: string, perf: Partial<BoatSpec['perf']>) => items.push({ label, spec: { ...ref, perf: { ...ref.perf, ...perf } } });
  if (p.cleanedWeeks > 0 || p.finish !== 'antifouling') w(`Bottom (${p.cleanedWeeks ? fouling(p.cleanedWeeks, month).label : 'clean'}${p.finish === 'race' ? ', racing finish' : ''})`, { cleanedWeeks: p.cleanedWeeks, finish: p.finish });
  if (p.mainAge !== 'new' || p.jibAge !== 'new') w(`Sails (main ${AGE[p.mainAge]}, jib ${AGE[p.jibAge]})`, { mainAge: p.mainAge, jibAge: p.jibAge });
  if (p.mast === 'wood') w('Wooden mast', { mast: 'wood' });
  if (p.outboard !== 'none') w(p.outboard === 'bracket' ? 'Outboard on the bracket' : 'Outboard stowed below', { outboard: p.outboard });
  if (p.gearKg > 0) w(`${Math.round(p.gearKg / 0.4536)} lb over the minimum`, { gearKg: p.gearKg });
  return items;
}
const AGE = { new: 'new', mid: 'midlife', old: 'end of life' } as const;
