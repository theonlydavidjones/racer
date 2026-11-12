/**
 * The rig's tune: how the mast and its standing rigging are set up at the dock, and what that does to the sails.
 *
 * The class rules fix all of it before the start: "Adjustment of the forestay and shrouds is prohibited while racing"
 * (NFIA Nordic Folkboat Class Rules 2025–2028, March 2026 update, 7.40; also 12.10), and the mast foot must be "not
 * capable of being moved while racing" (6.1.5). The backstay's adjustment "is free" (7.70): it is the one rig control
 * under way, and stays in the sail controls (controls.ts). Rake is "optional", with no limit (6.1.5). So the tune is a
 * choice made for the day's forecast.
 *
 * The settings, as North Sails' "Nordic Folkboat Tuning Guide for Aluminium Masts" sets them up
 * (northsails.com/sailing/en/resources/nordic-folkboat-tuning-guide, read 2026-11-12):
 * - Rake: the forestay is laid along the mast and marked level with the top of the gooseneck mark; reattached, "the
 *   mark should be 1.31 m from the deck along the forestay". A longer forestay puts the mark further up and rakes the
 *   mast aft.
 * - Mast foot: moved aft until the mast touches the after edge of the hole in the deck, then "pressed 22 mm aft along
 *   the mast foot rail" in 0–8 kt, 16 mm in 9–14 kt and 10 mm in strong winds. "The mast hole helps to push the mast
 *   forward and thus get the forestay loose": the more the foot is pressed aft, the more the deck pushes the mast's
 *   middle forward (pre-bend) and the slacker the forestay.
 * - Shrouds: tightened, in light air, until the forestay sags about 8 cm; "In medium wind, tighten the shroud turnbuckles
 *   1½ turns and a further 1½ turns in strong wind, thus tightening the forestay under increased wind pressure." (The
 *   chainplates are 280–360 mm aft of the mast, CR 7.20: the shrouds pull the hounds aft against the forestay.)
 * - Jumpers: "set relatively loose in light winds and strong winds. In medium winds, tighten the common turnbuckle 2-3
 *   turns ... If the jumpers are too tight, the mast will curve too much in the bottom and be too straight in the top.
 *   If the jumpers are too loose, the bottom will be straight and the top will curve".
 *
 * North Sails' guide is also in Theis Palm's 2023 talk to the Finnish class (Helsinki; the same text, plus: the vang
 * "never ... upwind in less than 16 knots" where the web page says 18, and "with a medium set up the forestay moves
 * 28 cm from max SB side to max BB side").
 *
 * Another sailmaker's guide disagrees in places: Heikkilä Sailmaker, "Kansanveneen trimmiohje" (2021, Finnish; for a
 * mast through the deck, the foot just under 1.1 m below the partner, referenced to Folkebådcentralen boats of
 * 1980–90):
 * - rake: the forestay's mark (the lower band's top edge) 1350–1360 mm from the deck at the stemhead (4–5 cm more
 *   forestay than North Sails' 1.31 m: more aft rake);
 * - the mast foot locked in one place (A, 4970–5000 mm from the corner of the transom and deck to the foot's after
 *   edge) whatever the wind;
 * - the jib cut for 4–6 cm of sag beating in light and medium air, set by the shrouds and the lines under way, "but not
 *   by the forestay's length";
 * - the main cut for very little or no pre-bend at rest;
 * - the jumpers may be adjusted while racing (CR 7.40 allows the jumper stays to be adjusted above deck): loose in
 *   light air, tightened in medium "so the crew hiking can keep her pointing and fast", and tightened again in a
 *   strong wind if the mast bends past the main's luff round.
 * The presets here are North Sails'; Heikkilä's is TUNE_HEIKKILA.
 *
 * The sim's sail shapes (controls.ts) were set up as a well-tuned boat's, whatever the wind: a boat on the guide's tune
 * for that wind (guideTune, blended between its three settings). So every effect here is the difference between her
 * tune and the guide's for the wind she's in: on the guide's tune she sails as before, and a boat with no tune set
 * (none chosen yet) is taken to be on it. A tune set for 18 kt sails like the guide's in 18 kt and costs in 5 kt.
 *
 * The tune's own part is worked out once when it changes (condition.ts, a TuneEffect); per call, only the guide's tune
 * for the wind and the forestay's sag in the wind's load (a few multiplications).
 */

export interface RigTune {
  /** The forestay's mark (m along the stay from the deck): the rake. The guide's 1.31 m. */
  forestayMark: number;
  /** The mast foot pressed aft along its rail (mm) from where the mast first touches the hole's after edge. */
  footAft: number;
  /** Turns on the shroud turnbuckles past the light-air setting (8 cm of forestay sag in light air). */
  shroudTurns: number;
  /** Turns on the jumpers' common turnbuckle from slack: the guide's "relatively loose" is 0, its medium 2–3 (2.5). */
  jumperTurns: number;
}

/** The guide's three settings. */
export const TUNE_PRESETS: Record<'light' | 'medium' | 'strong', RigTune> = {
  light: { forestayMark: 1.31, footAft: 22, shroudTurns: 0, jumperTurns: 0 },
  medium: { forestayMark: 1.31, footAft: 16, shroudTurns: 1.5, jumperTurns: 2.5 },
  strong: { forestayMark: 1.31, footAft: 10, shroudTurns: 3, jumperTurns: 0 }
};
/**
 * Heikkilä's tune (above), on this boat's scales: 1.355 m of forestay; the foot locked where the mast just meets the
 * hole's after edge with a little pressure (his main wants no pre-bend: 10 mm here, the least of North Sails'); the
 * shrouds set for his 4–6 cm in light and medium air (a quarter turn past North Sails' light setting gives about
 * 2.5 cm in 6 kt, 5 cm in 9 kt and 8.5 cm in 12 kt, beating: forestaySag); the jumpers
 * at North Sails' medium. (Its use for every wind is his; the fit to these scales is the sim's.)
 */
export const TUNE_HEIKKILA: RigTune = { forestayMark: 1.355, footAft: 10, shroudTurns: 0.25, jumperTurns: 2.5 };
/** The middle setting: the zero the effects below are measured from. */
export const TUNE_DEFAULT: RigTune = TUNE_PRESETS.medium;
/** The range each setting can take in the boat panel. */
export const TUNE_RANGE = { forestayMark: [1.21, 1.41], footAft: [6, 26], shroudTurns: [0, 4.5], jumperTurns: [0, 5] } as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A saved tune made whole and within range (older saves have none: the default). */
export function fixTune(t: Partial<RigTune> | undefined): RigTune {
  const d = TUNE_DEFAULT, n = (v: unknown, k: keyof typeof TUNE_RANGE) => clamp(Number.isFinite(Number(v)) ? Number(v) : d[k], TUNE_RANGE[k][0], TUNE_RANGE[k][1]);
  if (!t) return { ...d };
  return {
    forestayMark: n(t.forestayMark ?? d.forestayMark, 'forestayMark'), footAft: n(t.footAft ?? d.footAft, 'footAft'),
    shroudTurns: n(t.shroudTurns ?? d.shroudTurns, 'shroudTurns'), jumperTurns: n(t.jumperTurns ?? d.jumperTurns, 'jumperTurns')
  };
}
export const isDefaultTune = (t: RigTune) => t.forestayMark === TUNE_DEFAULT.forestayMark && t.footAft === TUNE_DEFAULT.footAft
  && t.shroudTurns === TUNE_DEFAULT.shroudTurns && t.jumperTurns === TUNE_DEFAULT.jumperTurns;

/* ---------- the geometry (class rules) ---------- */

/** The forestay meets the deck 2.00 m ahead of the mast's fore side (CR 6.1.7: 1990–2000 mm) and the mast 6.50 m up
 * (CR 6.1.11: no more than 5.50 m above the lower band, which is 1.00 m above the deck). */
const STAY = { run: 2.0, rise: 6.5 };
const STAY_LEN = Math.hypot(STAY.run, STAY.rise);
/**
 * Lengthen the forestay by dL and the hounds go aft by dL·L/run (the stay pivots about its deck fitting, the shrouds
 * hold the hounds' height): 3.4 cm per cm. The mast pivots about the deck, so a point h up moves aft by that × h/rise.
 */
export const HOUNDS_AFT_PER_M = STAY_LEN / STAY.run;
/** Heights above the sheer (m) of each sail's centre of effort (balance.ts SAIL_GEOM: the main 4.44, the jib 2.2). */
const CE_UP = { main: 4.44, jib: 2.2 };
/** Chords at the centre of effort (balance.ts CHORD): the lever shift goes into Shape.ceAft, a share of half the chord. */
const CHORD = { main: 2.4, jib: 2.0 };

/* ---------- the forestay ---------- */

/**
 * The forestay's tension (N) and its sag in the jib's load, as a cable: sag = w·L²/(8·T), with w the jib's pull on the
 * luff per metre (standard statics for a taut wire under a spread load).
 * - The light-air setting gives the guide's 8 cm in about 9 kt apparent (6 kt true, beating): the jib's force there,
 *   q·A·C with A 7.30 m² (ORC certificate) and C about 1.2, half of it carried by the luff (an estimate: the rest by
 *   the clew and head), is 8.4 N/m along 6.8 m, so T ≈ 600 N.
 * - A turn on a turnbuckle draws both its screws: two threads' pitch, about 3 mm for a ½" (12 mm) screw (CR 7.10: at
 *   least 11 mm). On 7 mm 1×19 wire (EA ≈ 3.6 MN: 29 mm² of steel at about 125 GPa) 6.57 m long, 3 mm is 1650 N in
 *   each shroud if nothing else gave; their pull aft (0.37 m in 6.57) against the forestay's forward lean (2.0 in
 *   6.8) puts 0.37 of it in the forestay: about 610 N a turn. (An upper bound: the mast's compression and the hull give.)
 * - The foot pressed aft slackens the stay (the guide). How much isn't published: it's set so that the guide's medium
 *   tune holds the light-air sag in medium air's load (the guide's "thus tightening the forestay under increased wind
 *   pressure"), which needs about 110 N per mm (FORESTAY.perMmFoot). An estimate, flagged.
 * - The backstay adds tension: full on, about 2500 N (3 mm wire, CR 7.10, breaking near 7 kN; about a third of it,
 *   through the mast's lever from the masthead to the hounds: an estimate).
 */
const JIB_LOAD = 0.5 * 1.225 * 7.30 * 1.2 * 0.5 / STAY_LEN; // N/m of luff per (m/s)² of apparent wind
const sagOf = (tension: number, awsKt: number) => JIB_LOAD * (awsKt * 0.5144) ** 2 * STAY_LEN * STAY_LEN / (8 * tension);
const tensionFor = (sag: number, awsKt: number) => sagOf(1, awsKt) / sag;
/** The guide's light-air sag and the apparent winds (kt) taken for its light (6 kt true) and medium (12 kt) settings, beating. */
const GUIDE_SAG = 0.08, LIGHT_AWS = 9, MEDIUM_AWS = 17;
const FORESTAY = (() => {
  const light = tensionFor(GUIDE_SAG, LIGHT_AWS), perTurn = 610, L = TUNE_PRESETS.light, M = TUNE_PRESETS.medium;
  const perMmFoot = (tensionFor(GUIDE_SAG, MEDIUM_AWS) - light - perTurn * (M.shroudTurns - L.shroudTurns)) / (L.footAft - M.footAft);
  return { light, perTurn, perMmFoot, backstay: 2500 };
})();
/** The forestay's static tension (N) for a tune, before the backstay. */
export const forestayTension = (t: RigTune) =>
  Math.max(150, FORESTAY.light + FORESTAY.perTurn * t.shroudTurns - FORESTAY.perMmFoot * (t.footAft - TUNE_PRESETS.light.footAft));
/** Forestay sag (m) for a tension (N, with the backstay's share) in an apparent wind of `aws` kt. */
export function forestaySag(tension: number, aws: number): number {
  // (capped at 20 cm, 3% of the stay: past that the luff's own tension and the hanks carry the load, and the cable law
  // with a fixed load no longer holds)
  return Math.min(0.2, sagOf(Math.max(150, tension), aws));
}
/** The forestay's tension with the backstay (0..1) on. */
export const withBackstay = (t0: number, backstay: number) => t0 + FORESTAY.backstay * clamp(backstay, 0, 1);
/**
 * The jib's camber per metre of extra sag: set so that the forestay's sag explains the backstay's effect on the jib the
 * sim already has (jibShape: 3.5% of camber over the backstay's range). On the medium tune in 12 kt (17 kt apparent) the
 * backstay full on takes the sag from 8.0 to 3.7 cm, so a centimetre of sag is about 0.8% of camber: the luff falling
 * off to leeward puts about as much depth into the jib's front as it sags, on a 1.3 m chord at mid height.
 */
export const JIB_DEPTH_PER_M = 0.035 / (forestaySag(forestayTension(TUNE_DEFAULT), 17) - forestaySag(withBackstay(forestayTension(TUNE_DEFAULT), 1), 17));

/* ---------- the effect on the sails ---------- */

/** A tune's own part, against the middle setting. */
interface TuneParts { stay: number; mainDepth: number; mainTwist: number; mainCeAft: number; jibCeAft: number }
/** A tune's effect, computed once: its own part, and the mast's bendiness (condition.ts MAST_BEND) to work out the guide's. */
export interface TuneEffect extends TuneParts { bend: number }

/**
 * Pre-bend from the foot pressed aft: the deck pushes the mast's middle forward. The bend per millimetre isn't
 * published. Its size here: the deck partner just under 1.1 m above the mast's foot (Heikkilä Sailmaker, "Kansanveneen
 * trimmiohje" 2021, for a mast through the deck), so 6 mm more at the foot leans the mast's top 6.5/1.1 × 6 = 35 mm
 * forward of the line the stays hold it to, bending its middle forward about half of
 * that (a beam pinned at the hounds, pushed at the deck: an estimate). Taking the backstay's full range as about 60 mm of
 * bend (an estimate) for the 2.5% of camber the sim gives it (mainShape), that is about 0.12% of camber per mm.
 * (Heikkilä: his main is cut for "very little or no" pre-bend at rest: "Prebend flattens the mainsail unnecessarily".)
 */
const PREBEND_DEPTH_PER_MM = 0.025 * (0.5 * (6.5 / 1.1)) / 60;
/**
 * The jumpers (the guide: too tight curves the bottom and leaves the top straight; too loose, the reverse). Per turn
 * from the guide's medium 2.5: tighter flattens the lower main a little and closes the upper leech, looser opens the
 * top. Sizes are estimates: about 1.5° of twist and a fifth of a percent of camber over the guide's range.
 */
const JUMPER = { twistPerTurn: -0.6, depthPerTurn: -0.0008 };

function parts(t: RigTune, bend: number): TuneParts {
  const d = TUNE_DEFAULT, dl = t.forestayMark - d.forestayMark; // m more forestay: more aft rake
  const aft = (h: number) => dl * HOUNDS_AFT_PER_M * h / STAY.rise; // how far aft (m) a point h above the deck goes
  const dj = t.jumperTurns - d.jumperTurns;
  return {
    stay: forestayTension(t),
    mainDepth: (-PREBEND_DEPTH_PER_MM * (t.footAft - d.footAft) + JUMPER.depthPerTurn * dj) * bend,
    mainTwist: JUMPER.twistPerTurn * dj * bend,
    mainCeAft: 2 * aft(CE_UP.main) / CHORD.main,
    // (the jib's tack stays on the stem fitting and its head goes aft with the hounds: a point on the luff h up moves as
    // the mast does at that height)
    jibCeAft: 2 * aft(CE_UP.jib) / CHORD.jib
  };
}
export const tuneEffect = (t: RigTune, bend = 1): TuneEffect => ({ ...parts(t, bend), bend });

/**
 * The guide's tune for a true wind (kt): light to 8 kt, medium 9–14, strong above, changing over a knot and a half
 * past each band's edge (a crew between two settings would pick one or the other; the blend is the sim's, so nothing
 * jumps as the wind changes).
 */
export function guideTune(tws: number): RigTune {
  const L = TUNE_PRESETS.light, M = TUNE_PRESETS.medium, S = TUNE_PRESETS.strong;
  // (the forestay's sag is touchy on a soft rig, sag ∝ 1/tension, so in between two settings either costs a percent or
  // two: the blend starts at the guide's band edges, so a tune is right across its whole band)
  const a = clamp((tws - 8) / 1.5, 0, 1), b = clamp((tws - 14) / 1.5, 0, 1);
  const mix = (k: keyof RigTune) => (L[k] + (M[k] - L[k]) * a) * (1 - b) + S[k] * b;
  return { forestayMark: mix('forestayMark'), footAft: mix('footAft'), shroudTurns: mix('shroudTurns'), jumperTurns: mix('jumperTurns') };
}
const guideCache = new Map<number, TuneParts>();
function guideParts(tws: number, bend: number): TuneParts {
  const k = Math.round(clamp(tws, 0, 40) * 4) * 8 + Math.round(bend * 4);
  let p = guideCache.get(k); if (!p) guideCache.set(k, p = parts(guideTune(Math.round(clamp(tws, 0, 40) * 4) / 4), bend));
  return p;
}

/** The forestay's extra sag (m) over the guide's tune for this wind, at this backstay (0..1) and apparent wind (kt). */
export function sagDelta(e: TuneEffect, tws: number, backstay: number, aws: number): number {
  const g = guideParts(tws, e.bend);
  return forestaySag(withBackstay(e.stay, backstay), aws) - forestaySag(withBackstay(g.stay, backstay), aws);
}
/** The masthead falling off to leeward with a slacker rig opens the main's upper leech: a degree per 10 cm more sag (an estimate). */
const MAIN_TWIST_PER_M_SAG = 10;

/** The main's changes (camber, twist deg, ceAft) from her tune against the guide's for the wind. */
export function mainTune(e: TuneEffect, tws: number, backstay: number, aws: number): { depth: number; twist: number; ceAft: number } {
  const g = guideParts(tws, e.bend);
  return { depth: e.mainDepth - g.mainDepth, twist: e.mainTwist - g.mainTwist + MAIN_TWIST_PER_M_SAG * Math.max(0, sagDelta(e, tws, backstay, aws)), ceAft: e.mainCeAft - g.mainCeAft };
}
/** The jib's changes (camber, ceAft): a forestay that sags more than the guide's puts depth into the jib's front. */
export function jibTune(e: TuneEffect, tws: number, backstay: number, aws: number): { depth: number; ceAft: number } {
  return { depth: JIB_DEPTH_PER_M * sagDelta(e, tws, backstay, aws), ceAft: e.jibCeAft - guideParts(tws, e.bend).jibCeAft };
}
