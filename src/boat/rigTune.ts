/**
 * The rig's tune: how the mast and its standing rigging are set up at the dock, and what that does to the sails.
 *
 * The class rules fix most of it before the start: "Adjustment of the forestay and shrouds is prohibited while racing.
 * The jumper stays may be adjustable above the deck only" (NFIA Nordic Folkboat Class Rules 2025–2028, March 2026
 * update, 7.40; also 12.10), and the mast foot must be "not capable of being moved while racing" (6.1.5). The
 * backstay's adjustment "is free" (7.70) and stays in the sail controls (controls.ts); the jumpers may be worked under
 * way too (condition.ts wantJumpers). Rake is "optional", with no limit (6.1.5). So the tune is a choice made for the
 * day's forecast.
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
 * The presets here are North Sails'; Heikkilä's is heikkilaFor (the day's wind).
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
 * Heikkilä's tune (above) for a forecast wind (kt), on this boat's scales: what he fixes for every wind, the rake
 * (1.355 m of forestay) and the mast foot (locked where the mast just meets the hole's after edge with a little
 * pressure: his main wants no pre-bend, so 10 mm here, the least of North Sails'); what he sets for the day, the shrouds
 * for his 4–6 cm of sag beating (5 cm, in the day's wind, from 6 to 14 kt: in more, the backstay keeps it there) and
 * the jumpers (loose in light air, tightened in medium, a turn more in a breeze, against the mast bending past the
 * main's luff round; the turns are North Sails' scale, his guide gives none).
 */
export function heikkilaFor(kt: number): RigTune {
  const t0 = { forestayMark: 1.355, footAft: 10, shroudTurns: 0, jumperTurns: 0 };
  const want = tensionFor(0.05, 1.45 * clamp(kt, 6, 14)), turns = (want - forestayTension(t0)) / FORESTAY.perTurn;
  return { ...t0, shroudTurns: clamp(Math.round(turns * 4) / 4, 0, TUNE_RANGE.shroudTurns[1]), jumperTurns: kt < 8.5 ? 0 : kt < 14.5 ? 2.5 : 3.5 };
}
/** The guide's setting for a forecast wind (kt): light to 8 kt, medium 9–14, strong above (a crew picks one). */
export const presetFor = (kt: number): 'light' | 'medium' | 'strong' => kt < 8.5 ? 'light' : kt < 14.5 ? 'medium' : 'strong';

/** Which setting a tune is (for the panel): one of the guides', or your own. */
export function tuneName(t: RigTune): 'light' | 'medium' | 'strong' | 'heikkila' | 'custom' {
  const same = (a: RigTune, b: RigTune) => Math.abs(a.forestayMark - b.forestayMark) < 1e-4 && a.footAft === b.footAft && a.shroudTurns === b.shroudTurns && a.jumperTurns === b.jumperTurns;
  for (const k of ['light', 'medium', 'strong'] as const) if (same(t, TUNE_PRESETS[k])) return k;
  // (Heikkilä's by what he fixes: the rake and the mast foot; the shrouds and jumpers are his for the day)
  return Math.abs(t.forestayMark - 1.355) < 1e-4 && t.footAft === 10 ? 'heikkila' : 'custom';
}
/** The mast's rake from upright (deg, aft +) on this tune: the hounds' setback over their height (geometry, below). */
export const rakeDeg = (t: RigTune) => Math.atan2((t.forestayMark - TUNE_DEFAULT.forestayMark) * HOUNDS_AFT_PER_M, STAY.rise) * 180 / Math.PI;
/** Short notes in the Boat panel. */
export const TUNE_INFO = {
  tune: 'Set before you leave the dock: the class rules forbid adjusting the forestay, the shrouds or the mast\'s foot while racing (CR 7.40, 12.10, 6.1.5); the backstay is free, and the jumpers may be adjusted above deck. "For the forecast": racing, North Sails\' setting for the forecast wind (so a big change in the wind leaves her on the wrong tune); cruising, always right. Heikkilä Sailmaker fixes the rake and the mast foot for every wind and sets the shrouds (for 4–6 cm of sag) and the jumpers for the day: his preset here is for the wind you\'ve set up.',
  forestayMark: 'The forestay laid along the mast, marked at the gooseneck, then measured from the deck: North Sails 131 cm, Heikkilä 135–136. Longer rakes the mast aft and moves the sails\' push aft: more weather helm.',
  footAft: 'How hard the foot is pressed aft along its rail once the mast touches the hole\'s after edge: North Sails 22 mm in 0–8 kt, 16 in 9–14, 10 in a breeze. The deck pushes the mast\'s middle forward: pre-bend (a flatter main) and a slacker forestay (a fuller jib).',
  shroudTurns: 'Turns on the shroud turnbuckles past the light-air setting (about 8 cm of forestay sag in light air): North Sails 1½ in medium air, 3 in a breeze. Tighter shrouds pull the forestay straighter: a flatter jib that points higher.',
  jumperTurns: 'Turns on the jumpers\' common turnbuckle: loose in light air and a breeze, 2–3 turns in medium (North Sails). Tight curves the lower mast and leaves the top straight (a closed upper leech); loose lets the top bend (a more open one).'
};

/** The middle setting: the zero each tune's own part is measured from (not what a boat with no tune sails on: that's
 * the guide's tune for the wind). Also what a partly saved tune is filled in from (fixTune). */
export const TUNE_DEFAULT: RigTune = TUNE_PRESETS.medium;
/** The range each setting can take in the boat panel. */
export const TUNE_RANGE = { forestayMark: [1.21, 1.41], footAft: [6, 26], shroudTurns: [0, 4.5], jumperTurns: [0, 5] } as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A saved tune made whole and within range (its missing settings from the middle setting). Only for a tune that's set:
 * a boat with none is on the guide's tune for the wind. */
export function fixTune(t: Partial<RigTune> | undefined): RigTune {
  const d = TUNE_DEFAULT, n = (v: unknown, k: keyof typeof TUNE_RANGE) => clamp(Number.isFinite(Number(v)) ? Number(v) : d[k], TUNE_RANGE[k][0], TUNE_RANGE[k][1]);
  if (!t) return { ...d };
  return {
    forestayMark: n(t.forestayMark ?? d.forestayMark, 'forestayMark'), footAft: n(t.footAft ?? d.footAft, 'footAft'),
    shroudTurns: n(t.shroudTurns ?? d.shroudTurns, 'shroudTurns'), jumperTurns: n(t.jumperTurns ?? d.jumperTurns, 'jumperTurns')
  };
}

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
/** Heights above the deck at the mast (m) of each sail's centre of effort (balance.ts: the main 4.44, the jib 2.2). */
const CE_UP = { main: 4.44, jib: 2.2 };
/**
 * How far each sail's centre moves aft as the mast rakes, as a height on the mast (m above the deck) that moves the same:
 * the main's corners each move with their own point (the tack and the clew, on the boom, at the gooseneck 1.0 m up; the
 * head 9.75 m up, CR 6.1.11), so its centroid goes aft by their average, 0.60 of the hounds' move (3.9 m up); the jib's
 * luff pivots on the stem, so its centre moves as the mast does at its own height.
 */
const RAKE_UP = { main: (1.0 + 1.0 + 9.75) / 3, jib: CE_UP.jib };
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
 * published. Its size here: the mast as a continuous beam on the foot, the deck partner just under 1.1 m above it
 * (Heikkilä Sailmaker, "Kansanveneen trimmiohje" 2021, for a mast through the deck) and the hounds 6.5 m above the deck.
 * The foot moved δ puts a moment 3EIδ/(L1(L1+L2)) on the mast at the partner (the three-moment equation), and that bows
 * the span above by 0.0642·M·L2²/EI: about 0.97 δ, a millimetre of bow per millimetre at the foot (the stays taken as
 * rigid: their stretch makes it less). Taking the backstay's full range as about 60 mm of bend (an estimate) for the
 * 2.5% of camber the sim gives it (mainShape), that is about 0.04% of camber per mm.
 * (Heikkilä: his main is cut for "very little or no" pre-bend at rest: "Prebend flattens the mainsail unnecessarily".)
 */
const PREBEND_DEPTH_PER_MM = 0.025 * (0.0642 * 3 * 6.5 ** 2 / (1.1 * (1.1 + 6.5))) / 60;
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
    mainCeAft: 2 * aft(RAKE_UP.main) / CHORD.main,
    // (the jib's tack stays on the stem fitting and its head goes aft with the hounds: a point on the luff h up moves as
    // the mast does at that height)
    jibCeAft: 2 * aft(RAKE_UP.jib) / CHORD.jib
  };
}
export const tuneEffect = (t: RigTune, bend = 1): TuneEffect => ({ ...parts(t, bend), bend });

/**
 * How far (0..1) the guide's tune is from light toward medium, and from medium toward strong, at a true wind (kt): its
 * bands are 0–8, 9–14 and above, so the change runs from 8 to 9 kt and from 14 to 15 kt, and each setting is the
 * guide's right across its own band. (The forestay's sag is touchy on a soft rig, sag ∝ 1/tension: in the knot
 * between two settings either one costs a percent or so.)
 */
const guideWeights = (tws: number): [number, number] => [clamp(tws - 8, 0, 1), clamp(tws - 14, 0, 1)];

/**
 * The guide's tune for a true wind (kt): light to 8 kt, medium 9–14, strong above, changing over the knot between
 * (a crew between two settings would pick one or the other; the blend is the sim's, so nothing jumps as the wind
 * changes).
 */
export function guideTune(tws: number): RigTune {
  const L = TUNE_PRESETS.light, M = TUNE_PRESETS.medium, S = TUNE_PRESETS.strong;
  const [a, b] = guideWeights(tws);
  const mix = (k: keyof RigTune) => (L[k] + (M[k] - L[k]) * a) * (1 - b) + S[k] * b;
  return { forestayMark: mix('forestayMark'), footAft: mix('footAft'), shroudTurns: mix('shroudTurns'), jumperTurns: mix('jumperTurns') };
}
/**
 * The guide's tune's part at a true wind: every part is linear in the tune's settings (forestayTension's floor never
 * binds on the guide's), so it's the three settings' parts blended with guideTune's weights: exact, and smooth in the
 * wind (no steps for a puff to cross). Each setting's part is worked out once per mast bendiness.
 */
const presetParts = new Map<number, [TuneParts, TuneParts, TuneParts]>();
/** The guide's part at a true wind: the three settings' parts blended (exact: every part is linear in the settings). */
function guideParts(tws: number, bend: number): TuneParts {
  let p = presetParts.get(bend);
  if (!p) presetParts.set(bend, p = [parts(TUNE_PRESETS.light, bend), parts(TUNE_PRESETS.medium, bend), parts(TUNE_PRESETS.strong, bend)]);
  const a = clamp(tws - 8, 0, 1), b = clamp(tws - 14, 0, 1), L = p[0], M = p[1], S = p[2]; // (guideWeights, inline)
  const wl = (1 - a) * (1 - b), wm = a * (1 - b);
  return { stay: wl * L.stay + wm * M.stay + b * S.stay, mainDepth: wl * L.mainDepth + wm * M.mainDepth + b * S.mainDepth,
    mainTwist: wl * L.mainTwist + wm * M.mainTwist + b * S.mainTwist, mainCeAft: wl * L.mainCeAft + wm * M.mainCeAft + b * S.mainCeAft,
    jibCeAft: wl * L.jibCeAft + wm * M.jibCeAft + b * S.jibCeAft };
}

/** A tune's changes to both sails at one wind and backstay, kept on her tune (one entry each: rigTune's per-call cost is
 * paid once for the main and the jib, and the crew's search (crewSolve) tries most settings at an unchanged backstay). */
interface TuneAt { tws: number; bs: number; aws: number; mDepth: number; mTwist: number; mCe: number; jDepth: number; jCe: number; g: TuneParts | null; gTws: number }
const atCache = new WeakMap<TuneEffect, TuneAt>();
function tuneAt(e: TuneEffect, tws0: number, backstay0: number, aws0: number): TuneAt {
  // (the true wind to a fiftieth of a knot, the apparent to a twentieth and the backstay to a hundredth: the wind moves a
  // little every step, and at most these move the jib's camber by about 0.1% (in the knot where the guide changes
  // setting, the touchiest), below anything the sails or the coach can tell; the cost is then paid every few steps)
  const tws = Math.round(tws0 * 50) / 50, aws = Math.round(aws0 * 20) / 20, backstay = Math.round(backstay0 * 100) / 100;
  let c = atCache.get(e);
  if (!c) atCache.set(e, c = { tws: NaN, bs: NaN, aws: NaN, mDepth: 0, mTwist: 0, mCe: 0, jDepth: 0, jCe: 0, g: null, gTws: NaN });
  if (c.tws === tws && c.bs === backstay && c.aws === aws) return c;
  if (c.gTws !== tws) { c.g = guideParts(tws, e.bend); c.gTws = tws; }
  const g = c.g!, sag = forestaySag(withBackstay(e.stay, backstay), aws) - forestaySag(withBackstay(g.stay, backstay), aws);
  c.tws = tws; c.bs = backstay; c.aws = aws;
  c.mDepth = e.mainDepth - g.mainDepth; c.mTwist = e.mainTwist - g.mainTwist + MAIN_TWIST_PER_M_SAG * sag; c.mCe = e.mainCeAft - g.mainCeAft;
  c.jDepth = JIB_DEPTH_PER_M * sag; c.jCe = e.jibCeAft - g.jibCeAft;
  return c;
}
/** The forestay's extra sag (m) over the guide's tune for this wind, at this backstay (0..1) and apparent wind (kt). */
export function sagDelta(e: TuneEffect, tws: number, backstay: number, aws: number): number {
  return tuneAt(e, tws, backstay, aws).jDepth / JIB_DEPTH_PER_M;
}
/** The masthead falling off to leeward with a slacker rig opens the main's upper leech, a tighter one holds it closed: a
 * degree per 10 cm of sag more or less than the guide's (an estimate). */
const MAIN_TWIST_PER_M_SAG = 10;

/** The main's changes (camber, twist deg, ceAft) from her tune against the guide's for the wind. */
export function mainTune(e: TuneEffect, tws: number, backstay: number, aws: number): { depth: number; twist: number; ceAft: number } {
  const c = tuneAt(e, tws, backstay, aws);
  return { depth: c.mDepth, twist: c.mTwist, ceAft: c.mCe };
}
/** The jib's changes (camber, ceAft): a forestay that sags more than the guide's puts depth into the jib's front. */
export function jibTune(e: TuneEffect, tws: number, backstay: number, aws: number): { depth: number; ceAft: number } {
  const c = tuneAt(e, tws, backstay, aws);
  return { depth: c.jDepth, ceAft: c.jCe };
}

/* ---------- the coach's words ---------- */

const NAMES = { light: 'North Sails\' light-air setting (0–8 kt)', medium: 'North Sails\' medium setting (9–14 kt)', strong: 'North Sails\' strong-wind setting', heikkila: 'Heikkilä Sailmaker\'s tune', custom: 'your own tune' } as const;
/** A tune in words. */
export const tuneWords = (t: RigTune) => NAMES[tuneName(t)];
const fmtSet = (t: RigTune) => `forestay mark ${(t.forestayMark * 100).toFixed(1)} cm, foot ${Math.round(t.footAft)} mm aft, shrouds ${t.shroudTurns ? `+${t.shroudTurns} turns` : 'at the light-air setting'}, jumpers ${t.jumperTurns ? `${t.jumperTurns} turns` : 'loose'}`;

/**
 * What the coach says about her tune for the day, before the start: the wind's range over the race (kt, the
 * forecast's low and high), and the forecast the boats were tuned for at the dock (`mean`: world.ts forecastKt), against
 * the guide's settings. `jumpers`: rigged to adjust them under way. Beating, the apparent wind is about 1.45 × the true.
 */
export function tuneBrief(t: RigTune, lo: number, mean: number, hi: number, jumpers = false): string {
  const want = presetFor(mean), name = tuneName(t), g = TUNE_PRESETS[want];
  const T = forestayTension(t), sag = (kt: number) => Math.round(100 * forestaySag(T, kt * 1.45));
  const sagNow = `Beating with the backstay off, her forestay sags about ${sag(lo)}–${sag(hi)} cm in ${Math.round(lo)}–${Math.round(hi)} kt.`;
  const locked = `It's set now: the forestay and shrouds can't be touched while racing (CR 7.40), nor the mast foot (CR 6.1.5); the backstay is free${jumpers ? ', and so are the jumpers, rigged to adjust above deck' : ''}.`;
  // the wind crossing a setting: her rig against the settings for the day's low and high ends
  const T_lo = forestayTension(TUNE_PRESETS[presetFor(lo)]), T_hi = forestayTension(TUNE_PRESETS[presetFor(hi)]);
  const spans = presetFor(lo) === presetFor(hi) ? '' : T < T_hi * 0.87 ? ` The wind crosses a setting today (${Math.round(lo)}–${Math.round(hi)} kt): her rig is soft for the top of it, so in the stronger part the backstay goes on harder and sooner than usual.`
    : T > T_lo * 1.15 ? ` The wind crosses a setting today (${Math.round(lo)}–${Math.round(hi)} kt): her rig is tight for the bottom of it, so in the lighter part ease the backstay right off for a fuller jib.` : '';
  if (name === want) return `She's on ${NAMES[name]}, right for ${Math.round(mean)} kt. ${sagNow}${spans} ${locked}`;
  if (name === 'heikkila' || name === 'custom') {
    const tighter = T > forestayTension(g) * 1.15, softer = T < forestayTension(g) / 1.15;
    return `She's on ${NAMES[name]} (${fmtSet(t)}). For ${Math.round(mean)} kt North Sails would set ${fmtSet(g)}. ${sagNow} ${softer ? 'Her forestay is softer than theirs: a fuller jib with a rounder entry, more power and less pointing, and in the gusts she\'ll need the backstay on hard.' : tighter ? 'Her forestay is tighter than theirs: a flatter jib that points but has less punch through the chop.' : 'Her forestay comes out about as tight as theirs.'}${t.forestayMark > g.forestayMark + 0.01 ? ' Raked further aft: a little more weather helm.' : t.forestayMark < g.forestayMark - 0.01 ? ' More upright: a little less weather helm.' : ''}${spans} ${locked}`;
  }
  const order = ['light', 'medium', 'strong'], soft = order.indexOf(name) < order.indexOf(want);
  return `She's on ${NAMES[name]}, with ${Math.round(lo)}–${Math.round(hi)} kt forecast: ${soft
    ? 'too soft a rig for it. The forestay will sag (a full jib with a round entry that won\'t point), and she\'ll heel and carry more helm: get the backstay on early and hard, and the traveler down sooner.'
    : 'too tight a rig for it. The forestay will be straight and the jib flat: it points, but has no power to drive through a lull or the chop. Keep the backstay right off, ease the jib sheet a touch, and foot for speed.'} ${sagNow} For next time, North Sails' setting: ${fmtSet(g)}. ${locked}`;
}

/** Heikkilä's tune for a medium day (12 kt), worked out once the forestay's figures above are (for the tests). */
export const TUNE_HEIKKILA: RigTune = heikkilaFor(12);

/* ---------- the rig as drawn (render/boatMesh.ts) ---------- */

/**
 * What the eye sees of the tune: the forestay's sag (m, to leeward in the jib's pull: the cable law above) and the
 * mast's fore-and-aft bend (m): its middle bowed forward (pre-bend from the foot pressed aft, about a millimetre per
 * millimetre, PREBEND above, and the backstay's bend, about 60 mm full on: the same estimates the main's camber uses,
 * and the jumpers': tighter curves the lower mast more, about 2 mm a turn for the 0.08% of camber JUMPER gives a turn),
 * and the backstay's own bend of the topmast above the hounds, on top of the tangent the bow leaves it on (an
 * estimate: 40 mm at the head full on, more with the jumpers loose, which let the top bend, less with them tight).
 * `bend`: the mast's bendiness against aluminium.
 */
export function rigDrawn(t: RigTune, backstay: number, aws: number, bend = 1): { sag: number; bow: number; topAft: number } {
  const bs = clamp(backstay, 0, 1);
  const bow = bend * Math.max(0, 0.97 * Math.max(0, t.footAft) / 1000 + 0.06 * bs + 0.0019 * (t.jumperTurns - TUNE_DEFAULT.jumperTurns));
  const topAft = bend * 0.04 * bs * (1 + 0.15 * (TUNE_DEFAULT.jumperTurns - t.jumperTurns));
  return { sag: forestaySag(withBackstay(forestayTension(t), bs), aws), bow, topAft };
}
