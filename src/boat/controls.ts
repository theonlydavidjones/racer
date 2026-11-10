/**
 * Sail controls: every line on the boat, what it does to the sails' shape, and what shape is fast.
 *
 * Layout (from Josephine): the piano on the aft end of the cabin carries the vang, outhaul and jib Cunningham
 * (dual-ended, both sides), the main Cunningham (port) and the downhaul; the mainsheet and traveller are on a
 * wooden thwart across the cockpit, in front of the helmsman, with the backstay's dual-ended control cleated at each end of it, where it meets the hull; the jib sheets run along the side decks to the winches (not self-tailing),
 * through cars on H-shaped tracks on the cabin top (pins, fore–aft and athwartships, one car each side).
 * The halyards are set before the race and left alone.
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

export interface Controls {
  mainsheet: number; // 0 two-blocked (hard in) .. 1 fully eased
  traveller: number; // −1 car hard to windward .. +1 hard to leeward
  vang: number; // 0 off .. 1 bar tight
  outhaul: number; // 0 eased .. 1 tight
  cunningham: number; // main Cunningham, 0 off .. 1 tight
  downhaul: number; // main downhaul (coarse luff tension), 0 .. 1
  backstay: number; // 0 off .. 1 bar tight
  jibsheet: number; // 0 hard in .. 1 eased (on the leeward winch)
  jibCunningham: number; // 0 .. 1
  /** Jib car pin per side: fore–aft (0 = forward .. CAR_FORE_PINS−1 = aft) and athwartships (0 = inboard ..). */
  car: Record<Tack, { fore: number; ins: number }>;
}

/** Pin positions on the cabin-top tracks (an estimate until counted: 25 mm apart). */
export const CAR_FORE_PINS = 7, CAR_IN_PINS = 5;

export const defaultControls = (): Controls => ({
  mainsheet: 0.1, traveller: 0, vang: 0.2, outhaul: 0.5, cunningham: 0.2, downhaul: 0.3, backstay: 0.3,
  jibsheet: 0.1, jibCunningham: 0.3, car: { S: { fore: 3, ins: 1 }, P: { fore: 3, ins: 1 } }
});

/* ---------- from controls to sheet angles ---------- */

/** Boom angle off the centreline (deg) from the traveller and mainsheet. */
export function boomAngle(c: Controls): number {
  // the traveller is on a wooden thwart across the cockpit, in front of the helmsman, under the end of the boom:
  // the car's ±0.5 m of travel swings the boom about ±9.5°; centred, the boom is on the centreline
  const car = 9.5 * c.traveller;
  return Math.min(85, Math.max(-2, car + 80 * Math.pow(c.mainsheet, 1.5)));
}
/** Sheet length that puts the boom at an angle, for a traveller position (inverse of boomAngle). */
export function mainsheetFor(angle: number, traveller: number): number {
  return Math.min(1, Math.max(0, Math.pow(Math.max(0, angle - 9.5 * traveller) / 80, 1 / 1.5)));
}
/** Jib sheet angle (deg) from the sheet and the car's athwartships position (the lead angle). */
export function jibAngle(c: Controls, tack: Tack): number {
  const lead = 8 + 1.25 * c.car[tack === 'S' ? 'P' : 'S'].ins; // the loaded car is the leeward one
  return Math.min(68, lead + 70 * Math.pow(c.jibsheet, 1.4));
}
export function jibsheetFor(angle: number, c: Controls, tack: Tack): number {
  const lead = 8 + 1.25 * c.car[tack === 'S' ? 'P' : 'S'].ins;
  return Math.min(1, Math.max(0, Math.pow(Math.max(0, angle - lead) / 70, 1 / 1.4)));
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
/** The rig a sail is set on: its wear, and (the main) how much the mast bends to flatten it under backstay. */
export interface SailRig { wear: SailWear; bend: number }
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
  // leech tension: the sheet (only when it's nearly in) and the vang (more effective as the sheet is eased)
  const sheetT = smooth((0.32 - c.mainsheet) / 0.32), vangT = c.vang * (0.12 + 0.88 * smooth(c.mainsheet / 0.4));
  const leech = Math.min(1.15, sheetT + 0.9 * vangT);
  // a mast that bends more or less than the average (rig.bend: 1 for aluminium and an average wooden mast) has more
  // or less pre-bend (flatter or fuller to start with), and bends more or less under the sail's load as the apparent
  // wind's pressure rises, flattening the main and opening the upper leech by itself, at once, in a gust
  const soft = rig.bend - 1, load = Math.min(3, (aws / 14) ** 2);
  return age({
    // (a hard vang with the sheet in pushes the boom into the gooseneck and bends the lower mast: a little flatter)
    // the backstay bends the mast and flattens the main: more with a mast that bends more (rig.bend)
    depth: 0.145 - 0.05 * c.outhaul - 0.025 * rig.bend * c.backstay - 0.01 * luff - 0.012 * c.vang * sheetT - 0.03 * soft - 0.012 * soft * load,
    draft: clamp(0.5 - 0.1 * luff + 0.004 * (tws - 10) + 0.02 * c.backstay, 0.3, 0.6),
    twist: clamp(19 - 12 * Math.min(1, leech) + 3 * c.backstay + 5 * soft * load, 4, 24) // a bent mast opens the upper leech a little
  }, rig.wear, aws);
}

/** The jib's shape: the car sets its twist and foot depth, the backstay its luff sag. */
export function jibShape(c: Controls, tws: number, tack: Tack, wear: SailWear = SAIL_WEAR.new, aws = tws): Shape {
  const car = loadedCar(c, tack), aft = car.fore / (CAR_FORE_PINS - 1); // 0 forward .. 1 aft
  const sheetT = smooth((0.28 - c.jibsheet) / 0.28);
  return age({
    depth: 0.135 - 0.035 * c.backstay + 0.012 * (0.5 - aft) - 0.01 * c.jibCunningham,
    draft: clamp(0.44 - 0.09 * c.jibCunningham + 0.004 * (tws - 10), 0.28, 0.55),
    twist: clamp(9 + 12 * aft - 6 * sheetT, 3, 24)
  }, wear, aws);
}

/** The fastest shape for a sail in this wind (kt) and apparent wind angle. */
export function targetShape(sail: 'main' | 'jib', tws: number, awa: number): Shape {
  const a = Math.abs(awa), reach = smooth((a - 55) / 45), run = smooth((a - 120) / 40);
  // upwind: power up to the middle of the range, then depower
  const powerUp = smooth((tws - 4) / 6), depower = smooth((tws - 12) / 8);
  const base = sail === 'main'
    ? { depth: lerp(0.14, 0.125, powerUp) - 0.04 * depower, draft: lerp(0.48, 0.46, powerUp) - 0.04 * depower, twist: lerp(13, 7, powerUp) + 8 * depower }
    : { depth: lerp(0.135, 0.12, powerUp) - 0.035 * depower, draft: lerp(0.42, 0.4, powerUp) - 0.03 * depower, twist: lerp(12, 9, powerUp) + 6 * depower };
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
  mainsheet: 0.12, traveller: 0.6, vang: 0.25, outhaul: 0.3, cunningham: 0.3, downhaul: 0.2, backstay: 0.3, jibsheet: 0.16, jibCunningham: 0.3
};

/** Winch: hauling the jib sheet in gets slower as the breeze builds (one hand cranks, the other tails). Easing is quick. */
export const winchFactor = (tws: number, hauling: boolean) => (hauling ? clamp(1.25 - tws / 24, 0.35, 1) : 1.6);

/**
 * What a good crew sets: the control positions whose sail shapes come closest to the fastest shape, for the
 * sheet angles the conditions call for (`mainAngle`, `jibAngle` in deg). A small coordinate search over the
 * controls; the jib car's fore–aft pin is searched too (it's set on the lazy side, before the tack).
 */
export interface CrewSettings { traveller: number; vang: number; outhaul: number; cunningham: number; downhaul: number; backstay: number; jibCunningham: number; carFore: number; carIn: number }
export function crewSolve(tws: number, awa: number, tack: Tack, mainAngle: number, jibAng: number, from?: Partial<CrewSettings>, rig: SailRig = STD_RIG, jibWear: SailWear = SAIL_WEAR.new, aws = tws): CrewSettings {
  const tm = targetShape('main', tws, awa), tj = targetShape('jib', tws, awa);
  // inboard as the sheeting angle allows (points higher), never so far in the jib can't reach its angle
  const carIn = clamp(Math.floor((jibAng - 1 - 8) / 1.25), 0, CAR_IN_PINS - 1);
  const x: CrewSettings = { traveller: 0, vang: 0.3, outhaul: 0.5, cunningham: 0.3, downhaul: 0.3, backstay: 0.3, jibCunningham: 0.3, carFore: 3, carIn, ...from };
  const keys = ['traveller', 'vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham'] as const;
  const score = (v: CrewSettings) => {
    const c: Controls = { mainsheet: mainsheetFor(mainAngle, v.traveller), traveller: v.traveller, vang: v.vang, outhaul: v.outhaul, cunningham: v.cunningham, downhaul: v.downhaul,
      backstay: v.backstay, jibsheet: 0, jibCunningham: v.jibCunningham, car: { S: { fore: v.carFore, ins: v.carIn }, P: { fore: v.carFore, ins: v.carIn } } };
    c.jibsheet = jibsheetFor(jibAng, c, tack);
    // a hair of preference for easy settings, so the crew doesn't haul on lines that make no difference
    let ease = 0; for (const k of keys) ease += (v[k] - (k === 'traveller' ? 0 : 0.2)) ** 2;
    return 0.7 * shapeEfficiency(mainShape(c, tws, rig, aws), tm) + 0.3 * shapeEfficiency(jibShape(c, tws, tack, jibWear, aws), tj) - 0.0005 * ease;
  };
  let best = score(x);
  for (const step of [0.25, 0.1, 0.04]) for (let pass = 0; pass < 3; pass++) {
    for (const k of keys) for (const d of [-step, step]) {
      const v = { ...x, [k]: clamp(x[k] + d, k === 'traveller' ? -1 : 0, 1) }, sc = score(v);
      if (sc > best) { best = sc; Object.assign(x, v); }
    }
    for (const d of [-1, 1]) { const v = { ...x, carFore: clamp(x.carFore + d, 0, CAR_FORE_PINS - 1) }, sc = score(v); if (sc > best) { best = sc; Object.assign(x, v); } }
  }
  return x;
}
