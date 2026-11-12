/**
 * Sail controls: every line on the boat, what it does to the sails' shape, and what shape is fast.
 *
 * Layout (from Josephine): the piano on the aft end of the cabin carries the vang, outhaul and jib Cunningham
 * (dual-ended, both sides), the main Cunningham (port) and the downhaul; the mainsheet and traveller are on a
 * wooden thwart across the cockpit, in front of the helmsman, with the backstay's dual-ended control cleated at each end of it, where it meets the hull; the jib sheets run along the side decks to the winches (not self-tailing),
 * through cars on H-shaped tracks on the cabin top (pins, fore–aft and athwartships, one car each side).
 * The main halyard (the sim's `downhaul`) is set at the start and rarely touched; the jib halyard is the jib's luff
 * control, eased off in light air and taken up as the wind builds (North Sails' guide: guideLimits).
 *
 * Shape: each sail has a depth (camber / chord), a draft position (where the deepest point is, as a fraction
 * of the chord from the luff) and twist (how much the head falls off to leeward relative to the foot, deg).
 * The controls set them; the wind pushes the draft aft as it builds. What's fast depends on the wind and the
 * point of sail, following standard trim practice:
 *  - light air: full sails with some twist, to keep the flow attached;
 *  - medium: full power, with the leech closed (least twist that keeps the top telltales flying);
 *  - heavy: depower: flatter (outhaul, backstay), draft forward (Cunningham, downhaul), more twist to spill;
 *  - reaching and running: fuller, sheets eased, the vang stopping the boom lifting and the main over-twisting.
 * Missing the best shape costs a few percent of drive: on top of the sheet angle (angle of attack), which
 * matters most.
 */
import type { Tack } from './boat';
import { jibTune, mainTune, type TuneEffect } from './rigTune';

export interface Controls {
  mainsheet: number; // 0 two-blocked (hard in) .. 1 fully eased
  traveller: number; // −1 car hard to windward .. +1 hard to leeward
  vang: number; // 0 off .. 1 bar tight
  outhaul: number; // 0 eased (3 cm off the black band) .. 1 on the band
  cunningham: number; // main Cunningham, 0 off .. 1 tight
  downhaul: number; // main downhaul (coarse luff tension), 0 .. 1
  backstay: number; // 0 off .. 1 bar tight
  jibsheet: number; // 0 hard in .. 1 eased (on the leeward winch)
  /**
   * The other jib sheet, on the windward winch: 0 hauled hard in .. 1 slack (lazy, as it is sailing normally). Haul it
   * in with the leeward sheet eased and it pulls the clew across to windward: the jib is backed (aback), as when
   * heaving to. The sheets belong to their sides: at a tack the one you're holding stays where you left it.
   */
  jibsheetW: number;
  jibCunningham: number; // 0 .. 1
  /** The jib halyard's tension (starboard, under way): the jib's coarse luff tension, as the main halyard is the main's. 0 .. 1 */
  jibHalyard: number;
  /** Jib car pin per side: fore–aft (0 = forward .. CAR_FORE_PINS−1 = aft) and athwartships (0 = inboard ..). */
  car: Record<Tack, { fore: number; ins: number }>;
}

/** Pin positions on the cabin-top tracks (an estimate until counted: 25 mm apart). */
export const CAR_FORE_PINS = 7, CAR_IN_PINS = 5;

export const defaultControls = (): Controls => ({
  mainsheet: 0.1, traveller: 0, vang: 0.2, outhaul: 0.5, cunningham: 0.2, downhaul: 0.3, backstay: 0.3,
  jibsheet: 0.1, jibsheetW: 1, jibCunningham: 0.3, jibHalyard: 0.3, car: { S: { fore: 3, ins: 1 }, P: { fore: 3, ins: 1 } }
});

/* ---------- from controls to sheet angles ---------- */

/** How far aft of the mast the mainsheet's blocks hang from the boom (m): about a sixth of E (3.38 m) in from its end,
 *  right above the thwart's traveller (the owner's photo of Josephine hauled out; render/hull.ts COCKPIT_FIT.thwart). */
export const SHEET_ON_BOOM = 2.96;
/** Boom angle off the centreline (deg) from the traveller and mainsheet. */
export function boomAngle(c: Controls): number {
  // the traveller is on a wooden thwart across the cockpit, in front of the helmsman, under the sheet's blocks on the
  // boom (SHEET_ON_BOOM): the car's ±0.5 m of travel swings the boom about ±9.5° (atan(0.5/2.96)); centred, on the centreline
  const car = 9.5 * c.traveller;
  return Math.min(85, Math.max(-2, car + 80 * Math.pow(c.mainsheet, 1.5)));
}
/** Sheet length that puts the boom at an angle, for a traveller position (inverse of boomAngle). */
export function mainsheetFor(angle: number, traveller: number): number {
  return Math.min(1, Math.max(0, Math.pow(Math.max(0, angle - 9.5 * traveller) / 80, 1 / 1.5)));
}
/** Where the traveller puts the boom at `angle` with the mainsheet at `sheet` (inverse of boomAngle), within [floor, 1]. */
export const travellerFor = (angle: number, sheet: number, floor = -1) => Math.min(1, Math.max(floor, (angle - 80 * Math.pow(sheet, 1.5)) / 9.5));
/** The jib sheet's lead angle (deg off the centreline, seen from the tack) for a car on athwartships pin `ins`. */
export const carLead = (ins: number) => 8 + 1.25 * ins;
/** Jib sheet angle (deg) from the sheet and the car's athwartships position (the lead angle). */
export function jibAngle(c: Controls, tack: Tack): number {
  const lead = carLead(c.car[tack === 'S' ? 'P' : 'S'].ins); // the loaded car is the leeward one
  return Math.min(68, lead + 70 * Math.pow(c.jibsheet, 1.4));
}
export function jibsheetFor(angle: number, c: Controls, tack: Tack): number {
  const lead = carLead(c.car[tack === 'S' ? 'P' : 'S'].ins);
  return Math.min(1, Math.max(0, Math.pow(Math.max(0, angle - lead) / 70, 1 / 1.4)));
}
/**
 * Where the jib's clew sits (deg off the centreline, + to leeward, − to windward: backed). The wind pushes the clew to
 * leeward until a sheet stops it: the leeward sheet through its car (jibAngle), or the windward sheet through the
 * windward car. That one runs across in front of the mast, so it only comes tight once it's hauled well in; hauled
 * hard home it holds the clew at its own car, as far to windward as the leeward car is to leeward.
 */
export function jibClew(c: Controls, tack: Tack): number {
  const lee = jibAngle(c, tack), wlead = carLead(c.car[tack].ins); // the windward car is on the tack's own side
  return Math.min(lee, -wlead + 140 * Math.pow(clamp(c.jibsheetW, 0, 1), 1.4));
}
/** Windward-sheet setting that holds the clew `angle` deg to windward (inverse of jibClew's windward stop). */
export function jibsheetWFor(angle: number, c: Controls, tack: Tack): number {
  const wlead = carLead(c.car[tack].ins);
  return clamp(Math.pow(Math.max(0, wlead - angle) / 140, 1 / 1.4), 0, 1);
}
/** The leeward (loaded) jib car. */
export const loadedCar = (c: Controls, tack: Tack) => c.car[tack === 'S' ? 'P' : 'S'];

/* ---------- shape ---------- */

export interface Shape {
  depth: number; draft: number; twist: number;
  /** The sail's profile drag coefficient and a lift factor, when they differ from a sound new sail (0.07, 1). */
  cd0?: number; clMul?: number;
  /** How much further aft (fraction of chord) a worn sail's draft has gone: its force moves aft with it (more weather helm). */
  ceAft?: number;
}

/**
 * How a sail has aged (boat/condition.ts has the sources). Woven polyester stretches most on the bias once its resin
 * finish breaks down, so an older sail sits deeper with its draft further aft, deepens and moves its draft aft more
 * as the wind loads it, opens at the head in the gusts, and its leech hooks (more profile drag; heel and weather
 * helm go up, drive down). The crew can't flatten it as far: the whole range moves.
 */
export interface SailWear { depth: number; draft: number; stretchDepth: number; stretchDraft: number; headTwist: number; dcd: number; clMul: number }
/**
 * Static offsets (depth, draft: fractions of chord), then per knot of apparent wind over 10 kt (the cloth's load:
 * stretch and draft creep aft), the head twisting open per knot over 14 kt, and the hooked leech's extra profile drag
 * (dcd, fully there by about 22 kt apparent: in light air the leech isn't loaded enough to hook).
 */
export const SAIL_WEAR: Record<'new' | 'mid' | 'old', SailWear> = {
  new: { depth: 0, draft: 0, stretchDepth: 0, stretchDraft: 0, headTwist: 0, dcd: 0, clMul: 1 },
  mid: { depth: 0.01, draft: 0.03, stretchDepth: 0.0004, stretchDraft: 0.0015, headTwist: 0.12, dcd: 0.006, clMul: 1 },
  old: { depth: 0.025, draft: 0.06, stretchDepth: 0.0008, stretchDraft: 0.0035, headTwist: 0.3, dcd: 0.015, clMul: 0.98 }
};
/** The rig a sail is set on: its wear, and (the main) how much the mast bends to flatten it under backstay, and the rig's
 * tune at the dock (rigTune.ts; absent: on the guide's tune for the wind, which the shapes here were set up as). */
export interface SailRig { wear: SailWear; bend: number; tune?: TuneEffect }
/** A new sail on an aluminium mast: the reference the trim settings were tuned on. */
export const STD_RIG: SailRig = { wear: SAIL_WEAR.new, bend: 1 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

const age = (sh: Shape, w: SailWear, aws: number): Shape => {
  if (w === SAIL_WEAR.new) return sh;
  const load = Math.max(0, aws - 10); // the cloth stretches with the wind's pressure on it
  const cd0 = 0.07 + w.dcd * smooth((aws - 8) / 14);
  const aft = w.draft + w.stretchDraft * load;
  return {
    ceAft: aft,
    depth: sh.depth + w.depth + w.stretchDepth * load,
    draft: clamp(sh.draft + aft, 0.3, 0.66),
    twist: clamp(sh.twist + w.headTwist * Math.max(0, aws - 14), 3, 26),
    ...(cd0 > 0.0701 ? { cd0 } : {}), ...(w.clMul !== 1 ? { clMul: w.clMul } : {})
  };
};

/** The main's shape from the controls, in a true wind of `tws` knots. */
/** `aws`: the apparent wind (kt), the load on the cloth (an aged sail stretches with it); defaults to the true wind. */
export function mainShape(c: Controls, tws: number, rig: SailRig = STD_RIG, aws = tws): Shape {
  const luff = 0.6 * c.downhaul + 0.4 * c.cunningham; // luff tension
  // leech tension: the sheet's pull down on the boom end, and the vang (more effective as the sheet is eased). The sheet
  // is taut whenever the sail is drawing, and holds the leech by its vertical part: steep while the boom end is over the
  // traveller car, slanting away as the boom swings outboard of it (why North Sails' Folkboat guide sails medium air with
  // the cars in the middle and the sheet "sheeted tight": the leech closes). The sheet's blocks hang from the boom about
  // a sixth of its length from the end, right above the thwart's car: 2.96 m aft of the mast (the owner's photo of
  // Josephine hauled out, reference/photos/josephine-hauled-out-starboard-boom.jpg; the thwart's place, render/hull.ts
  // COCKPIT_FIT, as Rigging draws the sheet). The car ±0.5 m on the thwart (boomAngle), and the boom about 1.25 m above
  // it (BAS 1.0 m above the sheer, the thwart a little below it: an estimate). With the sheet nearly straight down the
  // crew can haul the leech closed; once it slants about 25° (its blocks half a metre outboard of the car) the sail lifts
  // the boom and the leech opens: the guide's light air, cars to windward and the sheet eased "so that the top tell-tale
  // flies straight". (The curve between, an estimate.)
  const out = SHEET_ON_BOOM * Math.sin(boomAngle(c) * Math.PI / 180) - 0.5 * c.traveller, vf = 1.25 / Math.hypot(1.25, out);
  const sheetT = smooth((vf - 0.9) / 0.09), vangT = c.vang * (0.12 + 0.88 * smooth(c.mainsheet / 0.4));
  const leech = Math.min(1.15, sheetT + 0.9 * vangT);
  // a mast that bends more or less than the average (rig.bend: 1 for aluminium and an average wooden mast) has more
  // or less pre-bend (flatter or fuller to start with), and bends more or less under the sail's load as the apparent
  // wind's pressure rises, flattening the main and opening the upper leech by itself, at once, in a gust
  const soft = rig.bend - 1, load = Math.min(3, (aws / 14) ** 2);
  // the rig's tune (rigTune.ts): pre-bend from the mast foot and the jumpers, and the masthead falling off to leeward
  // with a slacker rig (the forestay's extra sag), against the guide's tune for the wind: none set, nothing changes
  const tu = rig.tune ? mainTune(rig.tune, tws, c.backstay, aws) : null;
  return tuned(age({
    // (a hard vang with the sheet in pushes the boom into the gooseneck and bends the lower mast: a little flatter)
    // the backstay bends the mast and flattens the main: more with a mast that bends more (rig.bend)
    // (the outhaul: 0 is 3 cm off the black band, 1 on it, North Sails' light-air and breeze settings (guideLimits); it
    // flattens the foot, the lower part of the sail: about 1.5% of camber over its range, light air's 14% to medium's 12.5%)
    depth: 0.145 - 0.015 * c.outhaul - 0.025 * rig.bend * c.backstay - 0.01 * luff - 0.012 * c.vang * sheetT - 0.03 * soft - 0.012 * soft * load,
    draft: clamp(0.5 - 0.1 * luff + 0.004 * (tws - 10) + 0.02 * c.backstay, 0.3, 0.6),
    twist: clamp(19 - 12 * Math.min(1, leech) + 3 * c.backstay + 5 * soft * load, 4, 24) // a bent mast opens the upper leech a little
  }, rig.wear, aws), tu);
}

/** A shape with the rig tune's changes on top (none: the same shape back, untouched). */
function tuned(sh: Shape, t: { depth: number; twist?: number; ceAft: number } | null): Shape {
  if (!t) return sh;
  const { depth, twist = 0, ceAft } = t;
  if (!depth && !twist && !ceAft) return sh;
  return { ...sh, depth: sh.depth + depth, twist: twist ? clamp(sh.twist + twist, 4, 24) : sh.twist, ...(ceAft ? { ceAft: (sh.ceAft ?? 0) + ceAft } : {}) };
}

/** The jib's shape: the car sets its twist and foot depth, the backstay its luff sag. */
export function jibShape(c: Controls, tws: number, tack: Tack, wear: SailWear = SAIL_WEAR.new, aws = tws, tune?: TuneEffect): Shape {
  const car = loadedCar(c, tack), aft = car.fore / (CAR_FORE_PINS - 1); // 0 forward .. 1 aft
  const sheetT = smooth((0.28 - c.jibsheet) / 0.28);
  // luff tension, as the main's: the halyard coarse, the Cunningham fine (at their defaults, 0.3 each, the same as the
  // jib Cunningham alone gave before the halyard was a control)
  const luff = 0.6 * (c.jibHalyard ?? 0.3) + 0.4 * c.jibCunningham; // (the split mirrors the main's: an estimate)
  // (the rig's tune, rigTune.ts: a forestay that sags more than on the guide's tune for the wind puts depth into the jib's front)
  return tuned(age({
    depth: 0.135 - 0.035 * c.backstay + 0.012 * (0.5 - aft) - 0.01 * luff,
    draft: clamp(0.44 - 0.09 * luff + 0.004 * (tws - 10), 0.28, 0.55),
    twist: clamp(9 + 12 * aft - 6 * sheetT, 3, 24)
  }, wear, aws), tune ? jibTune(tune, tws, c.backstay, aws) : null);
}

/** The fastest shape for a sail in this wind (kt) and apparent wind angle. */
export function targetShape(sail: 'main' | 'jib', tws: number, awa: number, overpowered?: number): Shape {
  const a = Math.abs(awa), reach = smooth((a - 55) / 45), run = smooth((a - 120) / 40);
  // upwind: power up to the middle of the range, then depower: by how overpowered she is (heel and helm, when known:
  // a heavier crew or a stiffer boat carries full power longer), or else by the wind
  const powerUp = smooth((tws - 4) / 6), depower = overpowered ?? smooth((tws - 12) / 8);
  const base = sail === 'main'
    // (fully depowered, as flat as the rig will make them: the main to about 8% camber (the outhaul on its band from
    // 12 kt, then the backstay bending the mast, the luff and the vang), the jib about 7.5%)
    ? { depth: lerp(0.14, 0.125, powerUp) - 0.045 * depower, draft: lerp(0.48, 0.46, powerUp) - 0.04 * depower, twist: lerp(13, 7, powerUp) + 8 * depower }
    : { depth: lerp(0.135, 0.12, powerUp) - 0.045 * depower, draft: lerp(0.42, 0.4, powerUp) - 0.03 * depower, twist: lerp(12, 9, powerUp) + 6 * depower };
  // off the wind: fuller; twist held near 10–12° (the vang's job)
  return {
    depth: lerp(base.depth, sail === 'main' ? 0.14 : 0.135, reach),
    draft: lerp(base.draft, 0.47, reach),
    twist: lerp(lerp(base.twist, 11, reach), 12, run)
  };
}

/** How much drive the shape gives relative to the best shape (1 = ideal; a badly set sail loses up to ~8%). */
export function shapeEfficiency(s: Shape, t: Shape): number {
  const pen = ((s.depth - t.depth) / 0.025) ** 2 + ((s.draft - t.draft) / 0.08) ** 2 + ((s.twist - t.twist) / 6) ** 2;
  return 1 - 0.08 * (1 - Math.exp(-pen / 2));
}

/* ---------- the crew ---------- */

/** How fast the crew (or you) can work each control, in full range per second. Hauling in a loaded line is slower. */
export const CONTROL_RATE: Record<Exclude<keyof Controls, 'car'>, number> = {
  mainsheet: 0.12, traveller: 0.6, vang: 0.25, outhaul: 0.3, cunningham: 0.3, downhaul: 0.2, backstay: 0.3, jibsheet: 0.16, jibsheetW: 0.16, jibCunningham: 0.3, jibHalyard: 0.2
};

/** Winch: hauling the jib sheet in gets slower as the breeze builds (one hand cranks, the other tails). Easing is quick. */
export const winchFactor = (tws: number, hauling: boolean) => (hauling ? clamp(1.25 - tws / 24, 0.35, 1) : 1.6);

/**
 * What a good crew sets: the control positions whose sail shapes come closest to the fastest shape, for the
 * sheet angles the conditions call for (`mainAngle`, `jibAngle` in deg). A small coordinate search over the
 * controls; the jib car's fore–aft pin is searched too (it's set on the lazy side, before the tack).
 */
export interface CrewSettings { traveller: number; vang: number; outhaul: number; cunningham: number; downhaul: number; backstay: number; jibCunningham: number; jibHalyard: number; carFore: number; carIn: number }
/**
 * Where a Folkboat crew sets the lines upwind for the wind speed, from North Sails' Nordic Folkboat tuning guide (Theis
 * Palm; northsails.com/sailing/en/resources/nordic-folkboat-tuning-guide, read 2026-11-11):
 * - Outhaul: "In very light winds (0-5 knots) the sail should be 3 cm from the mark. In medium winds (5-12 knots) about
 *   1.5 cm from the mark and in more wind than this pull the sail all the way to the mark." (The outhaul's 0..1
 *   is 3 cm off the mark at 0, 1.5 cm at 0.5, on the mark at 1: mainShape.)
 * - Cunningham: "Do not set the cunningham in light winds. In medium winds set the cunningham so that the wrinkles in the
 *   luff disappear. When the wind exceeds 15 knots it is pulled hard".
 * - Traveller: "In light winds (0-6 knots) pull the traveller cars 15-20 cm to windward. In medium winds (6-14 knots) set
 *   them in the middle. In higher wind the cars are eased to leeward to decrease heel and thus rudder pressure." (The
 *   traveller's ±1 is ±9.5° of boom, ±0.5 m of car under the end of the boom (boomAngle): 15–20 cm is −0.3 to −0.4.)
 * - Vang: "Never use the kickingstrap upwind in less than 18 knots"; above that it's on, to hold the leech when the main
 *   is eased in the gusts.
 * - Jib halyard: "Never pull the halyard too tight. This will cause the draft of the jib to move too far forward. Pull it
 *   until the wrinkles in the luff disappear. In light wind the best shape is obtained when leaving small wrinkles in the
 *   luff." The guide gives no jib Cunningham setting: the halyard is the jib's luff control (as on Josephine). Its
 *   most: 0.3 (the default, small wrinkles) below 5 kt, 0.6 (just smooth) to 15 kt, then free, as the main's Cunningham
 *   goes hard above 15 kt. The 0.3 and 0.6 are estimates of where the wrinkles go, not measured.
 * Each line's least and most, upwind (`tws` kt); off the wind, the crew sets them for shape alone. A setting changes
 * over a knot or so either side of the guide's wind, as a crew would.
 */
export function guideLimits(tws: number, awa: number): { min: Partial<Record<keyof CrewSettings, number>>; max: Partial<Record<keyof CrewSettings, number>> } {
  // (the guide's settings are for sailing upwind: full to 40° apparent, gone by a close reach at 60°, where the crew sets
  // the lines for shape alone)
  const u = smooth((60 - Math.abs(awa)) / 20);
  if (u <= 0) return { min: {}, max: {} };
  const over = (kt: number) => smooth((tws - kt + 1) / 2); // 0 below the guide's wind, 1 above, over ±1 kt
  const outhaul = 0.5 * over(5) + 0.5 * over(12);
  const lo = (v: number, free = 0) => free + (v - free) * u, hi = (v: number) => 1 + (v - 1) * u;
  return {
    min: { outhaul: lo(Math.max(0, outhaul - 0.05 * (1 - over(12)))), // (above 12 kt "all the way to the mark")
      cunningham: lo(0.9 * over(15)), traveller: lo(-0.4 + 0.35 * over(6) + 0.05 * over(14), -1), vang: lo(0.3 * over(18)) },
    max: { outhaul: hi(Math.min(1, outhaul + 0.05)), cunningham: hi(over(5) > 0 ? 1 : 0), jibHalyard: hi(0.3 + 0.3 * over(5) + 0.4 * over(15)), traveller: hi(-0.3 + 0.35 * over(6) + 0.95 * over(14)), vang: hi(0.1 + 0.9 * over(18)) }
  };
}

/**
 * Depowering, in the usual order as she gets overpowered upwind (`depower` 0 … 1: the step that's fastest for her crew,
 * physics.ts powerFactor): flatten first (outhaul, then backstay, with the Cunningham and downhaul pulling the draft
 * forward again as the mast bends), the vang on hard (so the leech holds when the main is eased), the jib cars aft
 * (twisting off the jib's top), and last the traveller down to leeward. Each line's least setting at that level, on top
 * of the guide's settings for the wind (guideLimits, with `tws`): where the guide says a line stays off (the vang under
 * 18 kt), it stays off. The jib's luff tension steps up on its halyard alone: the jib Cunningham does the same job
 * (jibShape), and a floor on both would send the forward hand to two lines for the one change.
 */
export function depowerLimits(depower: number, awa: number, tws?: number): { min: Partial<Record<keyof CrewSettings, number>>; max: Partial<Record<keyof CrewSettings, number>>; carAft: number } {
  const d = Math.abs(awa) < 70 ? depower : 0, st = (a: number, b: number) => smooth((d - a) / (b - a));
  const steps: Partial<Record<keyof CrewSettings, number>> = { outhaul: 0.95 * st(0, 0.4), backstay: st(0.1, 0.75), cunningham: st(0.25, 0.8), downhaul: 0.9 * st(0.3, 0.85), jibHalyard: 0.9 * st(0.3, 0.85), vang: 0.9 * st(0.3, 0.8), traveller: -1 + 1.6 * st(0.6, 1) };
  const g = tws == null ? { min: {}, max: {} } : guideLimits(tws, awa);
  const min: Partial<Record<keyof CrewSettings, number>> = {}, max: Partial<Record<keyof CrewSettings, number>> = { ...g.max };
  for (const k of Object.keys(steps) as (keyof CrewSettings)[]) {
    const lo = Math.max(steps[k] ?? -1, g.min[k] ?? -1), hi = g.max[k] ?? 1;
    min[k] = Math.min(lo, hi);
  }
  for (const k of Object.keys(g.min) as (keyof CrewSettings)[]) if (min[k] == null) min[k] = g.min[k];
  return { min, max, carAft: Math.round(2 * st(0.4, 0.8)) };
}

export function crewSolve(tws: number, awa: number, tack: Tack, mainAngle: number, jibAng: number, from?: Partial<CrewSettings>, rig: SailRig = STD_RIG, jibWear: SailWear = SAIL_WEAR.new, aws = tws, depower?: number, fixed: Partial<CrewSettings> & { mainsheet?: number } = {}): CrewSettings {
  const tm = targetShape('main', tws, awa, depower), tj = targetShape('jib', tws, awa, depower), lim = depowerLimits(depower ?? 0, awa, tws);
  // lines you hold are fixed where you have them: the crew sets the rest around them
  // (with your mainsheet held, the traveller is their only way to put the boom where it should be: the guide's traveller
  // settings assume a main sheeted for the conditions, so then only the depowering floor holds it)
  const free = fixed.mainsheet != null ? depowerLimits(depower ?? 0, awa) : null;
  const lo = (k: keyof CrewSettings) => fixed[k] ?? (k === 'traveller' && free ? free.min.traveller : lim.min[k]) ?? (k === 'traveller' ? -1 : 0);
  const hi = (k: keyof CrewSettings) => fixed[k] ?? (k === 'traveller' && free ? 1 : lim.max[k]) ?? 1;
  // inboard as the sheeting angle allows (points higher), never so far in the jib can't reach its angle
  const carIn = clamp(Math.floor((jibAng - 1 - 8) / 1.25), 0, CAR_IN_PINS - 1);
  const x: CrewSettings = { traveller: 0, vang: 0.3, outhaul: 0.5, cunningham: 0.3, downhaul: 0.3, backstay: 0.3, jibCunningham: 0.3, jibHalyard: 0.3, carFore: 3, carIn, ...from };
  const keys = ['traveller', 'vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard'] as const;
  for (const k of keys) x[k] = clamp(x[k], lo(k), hi(k)); // the depowering steps first, then the best shape within them
  // with your mainsheet held, the traveller is how the crew puts the boom where they want it (up to windward in light
  // air with your sheet eased; never below their depowering floor), aimed at their angle, not yours: it doesn't run away
  if (fixed.mainsheet != null && fixed.traveller == null) fixed = { ...fixed, traveller: travellerFor(mainAngle, fixed.mainsheet, lo('traveller')) };
  if (fixed.traveller != null) x.traveller = fixed.traveller;
  const carMin = fixed.carFore ?? Math.min(CAR_FORE_PINS - 1, 3 + lim.carAft), carMax = fixed.carFore ?? CAR_FORE_PINS - 1;
  x.carFore = clamp(x.carFore, carMin, carMax); if (fixed.carIn != null) x.carIn = fixed.carIn;
  const score = (v: CrewSettings) => {
    // (your mainsheet, when you hold it, stays where it is: the crew sets the traveller for the conditions around it, and
    // doesn't chase your boom with it)
    // a hair of preference for easy settings, so the crew doesn't haul on lines that make no difference
    let ease = 0; for (const k of keys) ease += (v[k] - (k === 'traveller' ? 0 : 0.2)) ** 2;
    return settingsDrive(v, tws, tack, mainAngle, jibAng, tm, tj, rig, jibWear, aws, fixed.mainsheet) - 0.0005 * ease;
  };
  let best = score(x);
  for (const step of [0.25, 0.1, 0.04]) for (let pass = 0; pass < 3; pass++) {
    for (const k of keys) for (const d of [-step, step]) {
      const v = { ...x, [k]: clamp(x[k] + d, lo(k), hi(k)) }, sc = score(v);
      if (sc > best) { best = sc; Object.assign(x, v); }
    }
    for (const d of [-1, 1]) { const v = { ...x, carFore: clamp(x.carFore + d, carMin, carMax) }, sc = score(v); if (sc > best) { best = sc; Object.assign(x, v); } }
  }
  return x;
}

/**
 * The sails as a crew sets them at depowering step `depower` (crewSolve, within the step's floors on each line: a step
 * flattens her more than its target shape alone), for the main and jib at these sheet angles, standard rig and new
 * sails. For physics.ts powerFactor's search over the steps. (Cached by half a knot, a degree and a sixteenth of a step.)
 */
const crewShapeCache = new Map<number, { main: Shape; jib: Shape }>();
export function crewShapes(tws: number, awa: number, depower: number, mainAngle: number, jibAng: number): { main: Shape; jib: Shape } {
  const t = Math.round(clamp(tws, 0, 45) * 2), a = Math.round(clamp(Math.abs(awa), 0, 180)), d = Math.round(clamp(depower, 0, 1) * 16);
  const ma = Math.round(clamp(mainAngle, 0, 90)), ja = Math.round(clamp(jibAng, 0, 90)), key = (((t * 181 + a) * 17 + d) * 91 + ma) * 91 + ja;
  const hit = crewShapeCache.get(key); if (hit) return hit;
  const v = crewSolve(t / 2, a, 'S', ma, ja, undefined, STD_RIG, SAIL_WEAR.new, t / 2, d / 16);
  const c: Controls = { mainsheet: mainsheetFor(ma, v.traveller), traveller: v.traveller, vang: v.vang, outhaul: v.outhaul, cunningham: v.cunningham, downhaul: v.downhaul,
    backstay: v.backstay, jibsheet: 0, jibsheetW: 1, jibCunningham: v.jibCunningham, jibHalyard: v.jibHalyard, car: { S: { fore: v.carFore, ins: v.carIn }, P: { fore: v.carFore, ins: v.carIn } } };
  c.jibsheet = jibsheetFor(ja, c, 'S');
  const out = { main: mainShape(c, t / 2, STD_RIG, t / 2), jib: jibShape(c, t / 2, 'S', SAIL_WEAR.new, t / 2) };
  crewShapeCache.set(key, out);
  return out;
}

/** The drive (as a share of the best) the sails' shapes give with these settings, for the sheet angles wanted. */
function settingsDrive(v: CrewSettings, tws: number, tack: Tack, mainAngle: number, jibAng: number, tm: Shape, tj: Shape, rig: SailRig, jibWear: SailWear, aws: number, mainsheet?: number): number {
  const c: Controls = { mainsheet: mainsheet ?? mainsheetFor(mainAngle, v.traveller), traveller: v.traveller, vang: v.vang, outhaul: v.outhaul, cunningham: v.cunningham, downhaul: v.downhaul,
    backstay: v.backstay, jibsheet: 0, jibsheetW: 1, jibCunningham: v.jibCunningham, jibHalyard: v.jibHalyard, car: { S: { fore: v.carFore, ins: v.carIn }, P: { fore: v.carFore, ins: v.carIn } } };
  c.jibsheet = jibsheetFor(jibAng, c, tack);
  return 0.7 * shapeEfficiency(mainShape(c, tws, rig, aws), tm) + 0.3 * shapeEfficiency(jibShape(c, tws, tack, jibWear, aws, rig.tune), tj);
}

/**
 * What moving each line from where it is to the crew's plan is worth: the drive it gains (a share: 0.002 = 0.2%), or 1
 * when the depowering steps call for it (she's overpowered: it's for her heel and helm, not the sail's shape). A crew
 * gets up to move a line only when it's worth it (crewWork.ts).
 */
export function planWorth(c: Controls, plan: CrewSettings, tws: number, awa: number, tack: Tack, mainAngle: number, jibAng: number, rig: SailRig = STD_RIG, jibWear: SailWear = SAIL_WEAR.new, aws = tws, depower?: number, mainsheet?: number): Partial<Record<keyof CrewSettings, number>> {
  const tm = targetShape('main', tws, awa, depower), tj = targetShape('jib', tws, awa, depower), lim = depowerLimits(depower ?? 0, awa, tws);
  const loaded = loadedCar(c, tack);
  const now: CrewSettings = { traveller: c.traveller, vang: c.vang, outhaul: c.outhaul, cunningham: c.cunningham, downhaul: c.downhaul, backstay: c.backstay, jibCunningham: c.jibCunningham, jibHalyard: c.jibHalyard ?? 0.3, carFore: loaded.fore, carIn: loaded.ins };
  const base = settingsDrive(now, tws, tack, mainAngle, jibAng, tm, tj, rig, jibWear, aws, mainsheet), out: Partial<Record<keyof CrewSettings, number>> = {};
  for (const k of ['traveller', 'vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard'] as const) {
    const m = lim.min[k], mx = lim.max[k];
    if ((m != null && now[k] < m - 0.02) || (mx != null && now[k] > mx + 0.02)) { out[k] = 1; continue; }
    // with your mainsheet held, the traveller is how they put the boom where it should be: that's the sheet's angle of
    // attack, worth more than any shape
    if (k === 'traveller' && mainsheet != null) { out[k] = Math.abs(plan.traveller - now.traveller) > 0.02 ? 1 : 0; continue; }
    out[k] = settingsDrive({ ...now, [k]: plan[k] }, tws, tack, mainAngle, jibAng, tm, tj, rig, jibWear, aws, mainsheet) - base;
  }
  return out;
}
