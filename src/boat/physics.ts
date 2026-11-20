import { harborNear, hitsHarbor, hitsMooredBoat, hitsWall } from '../geo/marina';
import { damageOf, impactEnergy, type DamageLevel, type Struck } from './damage';
import { KT, V, clamp, wrap, n360, D2R, type Vec, hypot } from '../core/math';
import { hitsWharf, wharfPartAt, onLand, pierNear } from '../geo/shore';
import { underPier } from '../geo/fortMason';
import type { Emit } from '../sim/events';
import { SETTLE, bow, stern, type Boat, type LineKey, type Tack } from './boat';
import { HANDLING, HULL, airDrag, driveExponent, flogAmount, flowTurnRate, hullResistance, luffDriveFactor, maxTurnRate, speedForDrive, surgeAccel } from './dynamics';
import { driveCurveFor } from './driveCurve';
import { motorForce, motorYaw } from './motor';
import { paddleForce, paddleMoment, paddleYawRate } from './paddle';
import { NO_GO, beatAngle, jibEfficiency, polar, type SailPlan } from './polar';
import orc from './data/nordic-folkboat-orc.json';
const SAIL_AREA = { main: orc.boat.mainArea, jib: orc.boat.jibArea };
import { beatFor, seaDrag, targetFor, waveYaw } from './seaway';
import { FLAT_SEA } from '../environment/sea';
import { CE_ABOVE_WL, CE_HEIGHT, FULL_RUDDER, HELM_MAX, HELM_STALL, LEVER, RUDDER, STALL_TURN, helmFor, clothFill, heelFactor, heelWithCrew, heelingMoment, helmNeeded, hullRighting, netDrive, rollStep, rudderBrake, rudderDrag, rudderTurn, sailForces, sailYaw } from './balance';
import { DEFAULT_CREW, PREPARED, STANDARD_DISP, TURN_V, prepLeft, crewBestHeel, crewEdgeAt, crewMass, crewMoment, crewSkill, hikingMoment, sittingMoment, standardCrewMoment, displacement, displacementFactor, newCrew, placeCrew, specAttr, type CrewState } from './crewPhys';
import { LINE_GAP, LINE_TAU, NEW_COURSE, bodyJob, carCall, courseHeld, crewJobs, mainHand, ownerOf } from './crewWork';
import { BOOM_SEEN, CALL_KEEP, CUE_MAX, TURN_SEEN, boomStrike } from './calls';
/** Swinging: her heading this far (deg) past where it has been over SWING_TAU (s), a turn kept up at over about
 * SWING_DEG / SWING_TAU, 3.2°/s; and settled this long after it (s) before her crew go to the cabin top for a small gain
 * (estimates: past a helm's correction, a key's tap at 5°/s for a fraction of a second; a turn's settling, crewPhys.ts
 * HOLD.settle's 4 s and her speed and heel coming back). */
const SWING_DEG = 8, SWING_TAU = 2.5, SETTLE_S = 5;
/** A new course: her true wind angle NEW_COURSE (crewWork.ts) from where the guide was last read, on either tack, held NEW_HELD s without a swing (an
 * estimate: past a turn's own settling, SETTLE_S, and a helm's first corrections on the new course). */
const NEW_HELD = 10, HELD_DEG = 3;
/** ... and her heading this far (deg) from where it was then: a new course she's steered, not the wind shifting under a
 * held one, which the backlash is for (on the tiller pilot in a light, shifty breeze her apparent angle wandered 39-76° on a
 * beam reach, and each shift read the guide afresh: the vang eased and set again 25 s apart; an estimate). */
const NEW_HEADING = 10;
/** The longest (s) the guide's angle is held through swings (an estimate): a slow penalty circle took 44 s in 6 kt,
 * crewstation's seed 14, so a two-turns penalty and its NEW_HELD after about 98 s. At 60 s the hold let go part way
 * through the light air's slow turns, and seed 15's trips went over the backstop. */
const HOLD_MAX = 120;
/** How many of the car's athwartships holes (half a degree of lead each, controls.ts leadAt) the lazy car's lead must be
 * outboard of the hole for her guide's angle before the crew's own plan brings it in (an estimate): three. Kept, the jib
 * on it sits at most about 1.3° wide of its angle (two holes and the quarter degree carInFor leaves in hand), inside its
 * luffing margin (trim.ts sailTrim, 2°). The track's five holes span only 2° of lead, the apparent wind from about 28° to
 * 30.5° on a beat, inside her guide's own dead band (GUIDE_DEAD): in 12 kt her guide wandered 29.6° to 31.9° on
 * crewstation's seed 2, across holes 2 to 4. A trip forward to the car is a body off the rail for most of a minute. */
const CAR_HOLES = 3;
import { clrShift, heelWettedResistance, trimResistance } from './hullTrim';
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { condition, foulingDrag, mainRig } from './condition';
import { CAR_FORE_PINS, CAR_IN_PINS, CONTROL_RATE, carInFor, HALYARD, boomAngle, depowerLimits, hoistDraw, hoistedShare, crewShapes, crewSolve, GUIDE_BACKLASH, GUIDE_LIGHT, GUIDE_LIGHT_KT, GUIDE_DEAD, GUIDE_FAST, GUIDE_KT, jibAngle, planWorth, worthTogether, guideOnly, jibClew, jibShape, jibsheetFor, mainShape, mainsheetFor, shapeEfficiency, targetShape, travellerRate, winchFactor, type Controls, type CrewSettings, type Shape, jibClewFree } from './controls';

/** Turn rate during penalty turns, deg/s: the crew backs the jib and main to spin her round. The least: she turns at
 * her own hard-over rate when that's faster (dynamics.ts maxTurnRate). An uncited estimate. In the sim's own fleet races
 * (Seaweed Soup course 2, 12 kt, 13 Nov 2026) a two-turns penalty took 96-163 s from the call to done: about 60-80 s
 * turning (turnDrag bleeds her speed through the turns, toward this floor) and 30-40 s sailing clear first. Bay East's
 * audit puts a 720 in a small keelboat at more like 30-45 s in a breeze, also unconfirmed. The owner is to time one. */
export const PENALTY_TURN_RATE = 10;
/** Below this speed (m/s, ~2.5 kt) the AI won't try to tack: she'd stall head to wind. UNCITED AND UNDER REVIEW (the
 * Coordinator, 16 Nov 2026): don't tune around it. Measured in the sim, an AI boat committed to a tack gets through
 * from 0.6 m/s at 2–10 kt, in 11–26 s, so this gybes her round 280° in light air where she'd tack; but lowering it alone
 * slowed light-air races (claude/light-air: more slow tacks and time in irons). Being redone with the AI's irons
 * seamanship (claude/irons) and Deep Physics' measure of how she gathers way after a slow tack. */
export const SLOW_TACK = 1.3;
/** In light air, the way she needs for a tack is a share of the speed the wind can give her close-hauled, not SLOW_TACK:
 * in 1-4 kt she sails close-hauled at 0.4-1.2 m/s, all under it, and every tack became a gybe right round, 100 s at
 * 0.3 m/s (ROADMAP, "AI steering in a dying breeze"). A share is the right form: coasting into the wind on a fixed turning
 * circle against drag that goes as her speed squared, the turn she gains depends on the ratio of her speeds, and the
 * windage head to wind and her hull's drag stay in proportion as the wind changes (the physics review).
 * TACK_WAY 0.6 is an ESTIMATE, the sailor's rule of a good part of her way on before a light-air tack: nothing here
 * measures it. In this sim a committed tack gets round even from a dead stop, as the sculling floor (dynamics.ts
 * HANDLING.minTurnRate, rule 42.3(d)) turns her the last of the way, so the sim has no edge to set it by.
 * The wind it's judged in: the lighter of the wind now and her 20 s mean (Boat.twsSlow), as her speed lags the wind;
 * judged on a fresh puff's, she'd be "too slow" for the wind just arrived and gybe round at the moment a light-air
 * sailor most wants to tack (the physics review). SLOW_TACK still caps it, so from about 9 kt nothing changes.
 * In chop: a seaway stops her head to wind sooner than flat water does, so she needs more way, not less; but her
 * close-hauled speed falls in chop (targetFor), and a share of it fell with it, to nothing at 1 kt in 0.3 m, where a tack
 * then took 201 s (the physics review, 20 Nov 2026). So it's never less than the flat-water share. How much more a
 * seaway asks isn't measured, so nothing is added for it; nor is swell (not in targetFor at all): a follow-up. */
export const TACK_WAY = 0.6;
/** The least speed (m/s) at which the AI takes a turn through the wind as a tack rather than gybing round. */
export const slowTack = (b: { ww: { kt: number }; sea: Boat['sea']; twsSlow?: number }): number => {
  const her = { ww: { kt: Math.min(b.ww.kt, b.twsSlow ?? b.ww.kt) }, sea: b.sea };
  const flat = { ww: her.ww, sea: FLAT_SEA };
  return Math.min(SLOW_TACK, TACK_WAY * Math.max(targetFor(her, beatFor(her)), targetFor(flat, beatFor(flat))));
};

/** Whether bearing away 10° below close-hauled can build her the way for a tack (slowTack × 1.15, as the AI asks) in the
 * wind and chop she has. Not always: the chop is the day's wind's (world.ts seaWind), slowTack the wind at her, so in a
 * deep lull or another boat's shadow on a breezy day her footed speed in the chop can stay under it (0.5 m chop and
 * 2 kt at her), and footing for it she never came round (v213 review). Then she wears round instead. */
export const footReaches = (b: { ww: { kt: number }; sea: Boat['sea']; twsSlow?: number }): boolean => {
  const her = { ww: { kt: Math.min(b.ww.kt, b.twsSlow ?? b.ww.kt) }, sea: b.sea };
  return targetFor(her, beatFor(her) + 10) >= slowTack(b) * 1.15;
};

/** The crew's reaction time to a change in apparent wind angle, s. */
export const CREW_LAG = 0.8;

/**
 * The water's drag on her going astern, over her resistance going ahead at the same speed (dynamics.ts hullResistance:
 * the ITTC friction line and the residuary, as sailing). AN ESTIMATE: no measurement of a small keelboat's resistance
 * stern first was found, nor a timed coast-down (researched 14 Nov 2026: ships' astern trials weren't reachable, and
 * there's nothing for yachts). Stern first she leads with her afterbody and her rudder, which are shaped to leave the
 * water, not to meet it: more drag than ahead, by the factor a streamlined section shows turned end for end, about two
 * (NACA TN 3361, Critzos, Heyson & Boswinkle 1955: the NACA 0012's drag at 180° about twice its drag at 0°; a wing
 * section in two dimensions, not a hull, so still an estimate).
 * It replaces dv/dt = −(0.005 + 0.035·v), which had no source and was 6 to 20 times her hull's own resistance at a
 * walk (48 N against 8 N at 0.4 m/s), with a constant part a hull's drag doesn't have. So she carries her way as a
 * two-tonne keelboat does: shoved off at 0.5 m/s she has lost it (WAY_LOST) after 37 m and four minutes, not 8 m and
 * half a minute. The owner's own observation agrees (16 Nov 2026): shoved off astern at a walking pace in still air a
 * Folkboat "glides a fair bit. Closer to five [boat lengths] than one, for sure", by the wind and the push: five of her
 * lengths is 38 m.
 * Under a tenth of a knot hullResistance is nearly in proportion to her speed (its residuary table runs straight from
 * nothing to its first row), so her last way dies off slowly, halving about every two minutes, over eight
 * meters more: in still water a hull does creep on like that, and any wind or stream soon outweighs it.
 */
export const ASTERN = 2;
/** Going astern faster than this, m/s, a held tiller steers her by the water past her rudder, however little; it is
 * sculling only once she has lost her way (asternCoast's WAY_LOST). Higher, and a helm held over near head to wind
 * turned her one way above it and sculled her the other below it: at 0.2 m/s, 0.9 deg/s one way against 4 the other. */
export const STEERS_ASTERN = 0.05;
/** How fast the water slows her sternway (m/s²) at `v` m/s astern (at her design displacement: her crew's weight isn't in it yet). */
export const asternDrag = (v: number): number => ASTERN * hullResistance(v) / HANDLING.mass;
/** Below this (m/s) she has lost her way, for a coast's length: the water's drag alone takes minutes more to stop her. */
const WAY_LOST = 0.05;
/**
 * How far she coasts astern from `v0` m/s until she has lost her way (m), on the water's drag alone: the distance run
 * while slowing from v0 to WAY_LOST, ∫ m·u/(ASTERN·R(u)) du (tabled once, every 5 mm/s up to 2 m/s).
 */
let coastTable: Float64Array | null = null;
const COAST_STEP = 0.005, COAST_N = 401;
export function asternCoast(v0: number): number {
  if (!coastTable) {
    coastTable = new Float64Array(COAST_N);
    for (let i = 1; i < COAST_N; i++) { const u = (i - 0.5) * COAST_STEP; coastTable[i] = coastTable[i - 1] + (u > WAY_LOST ? u / asternDrag(u) * COAST_STEP : 0); }
  }
  const x = Math.min(COAST_N - 1, Math.max(0, v0 / COAST_STEP)), i = Math.min(COAST_N - 2, Math.floor(x));
  return coastTable[i] + (coastTable[i + 1] - coastTable[i]) * (x - i);
}

/**
 * Her glide stern first under bare poles from `v0` m/s in the wind there is, her heading held: for planning a push-off.
 * The step's own working, a step at a time: the wind on her bare hull and rig from forward of the beam pushes her astern
 * (dynamics.ts airDrag, on the wind she feels: going astern she runs with a wind on her bow), a wind abaft the beam
 * drifts her ahead (the bare-poles drift, a tenth of the wind), and the water slows her sternway (asternDrag). So a
 * wind on her stern shortens the glide and a wind on her bow carries her on, perhaps without stopping. Returns how far
 * she goes astern in `secs` (m), how long from the start she keeps `steerage` m/s of sternway (s: until it first falls
 * under it; way the wind gives her back later doesn't count, she has lain there unsteerable meanwhile), and whether
 * she's still going astern at the end. Her set to leeward across the wind isn't in it.
 * `windAt`, where given, is the wind she meets `dist` m along her line astern `t` s after she's let go (the caller's to
 * say where the wind has set her across it by then), in place of the one wind: let go in the
 * lee of a shore or a harbor wall she glides out of it into more (Corinthian's B16 in a northerly: 0.32 of the open wind
 * at the slip, 0.55 by 20 m out), and a shove gauged to the slip's wind alone carried her a quarter too far.
 */
export function asternGlide(v0: number, heading: number, windFrom: number, windKt: number, secs = 60, steerage = 0.3, windAt?: (dist: number, t: number) => { from: number; kt: number }): { dist: number; steerable: number; going: boolean } {
  const driftIn = (from: number, kt: number) => 0.1 * kt * KT * Math.max(0, Math.min(1, (Math.abs(wrap(from - heading)) - 90) / 60)), dt = 1 / 60;
  let ast = v0, dist = 0, steerable = 0, steers = v0 > steerage, drift = driftIn(windFrom, windKt);
  for (let t = 0; t < secs && ast > 0; t += dt) {
    if (windAt) { const w = windAt(dist, t); windFrom = w.from; windKt = w.kt; drift = driftIn(windFrom, windKt); }
    const ap = sailWind(windFrom, windKt, heading, -ast);
    ast -= surgeAccel(0, drift, airDrag(ap.aws, ap.awa, 1, 0)) * dt; // (what would be headway comes off her sternway: one motion)
    if (ast > 0) { const left = ast - asternDrag(ast) * dt; ast = left > 1e-6 ? left : 0; } // (as travel slows her)
    if (ast > 0) dist += ast * dt;
    if (steers && ast > steerage) steerable += dt; else steers = false;
  }
  return { dist, steerable, going: ast > 0 };
}

/** Crew timings for the whisker pole, s. */
export const POLE = { set: 8, stow: 5, gybe: 8 };

/** How the jib is working right now, from the pole state. */
export function sailPlan(b: Boat): SailPlan {
  if (b.pole === 'set') return b.poleTack === b.tack ? 'wing' : 'main';
  if (b.pole === 'down') return 'jib';
  return 'main'; // crew busy with the pole: jib not drawing
}

/**
 * Hoisting and striking (dropping) the sails at the mast, at a crew's pace: each sail goes up in about 5 s (the owner,
 * aboard Josephine, 14 Nov 2026: "maybe five seconds each sail if nothing goes wrong"); short-handed, longer. Head to
 * wind it goes up easily; off the wind it fills, presses on the spreaders and shrouds and the slides bind, so it goes up
 * far more slowly. Struck, the halyard let run, it comes down in a few seconds (an estimate: the owner's figure asked for).
 */
export const HOIST = { main: 5, jib: 5, strikeMain: 4, strikeJib: 3 };
/** How far up each sail is (0..1 of its luff): hauled up at the mast (b.rig), then its last inches taken up by the halyard
 * at the piano (controls.ts HALYARD). A boat with no b.rig has both hauled up. */
export const sailUp = (b: Boat, k: 'main' | 'jib'): number => (b.rig ? hoistedShare(b.rig[k], (k === 'main' ? b.rig.mainTaut : b.rig.jibTaut) ?? 1, k) : 1);
/**
 * At the dock (and walked or pushed off it): the crew sit centred on the benches, not hiked or to leeward for a heel she
 * isn't sailing at (the owner); their weight still moves only her heel, never her across the water. (placeCrew, placed
 * in the middle for the moment, as you'd place them yourself: your own placing comes back with her under way.)
 */
/** Her tack lying to a dock (in her berth, or on her lines): by the wind's side, but held within 4° of dead ahead or dead
 * astern, so a wind wandering either side of her bow or stern doesn't send the helm across the cockpit each time. */
export function tiedTack(rel: number, was: Tack): Tack { const twa = Math.abs(rel); return twa < 176 && twa > 4 ? (rel >= 0 ? 'S' : 'P') : was; }
/**
 * Made fast in her berth, or held by her lines as they go on (world.ts dockStep, mooringStep): the crew's work there. A
 * pole half set or stowed is stowed (the jib's down or coming down, and nobody poles out at the dock); your own call for
 * a lazy jib car is worked, both cars free with the jib down (crewWork.ts carCall); and the rest of sailing's jobs end.
 * Under way the crew's jobs are finished by crewJobs and carJob, which don't run here, so a job under way as she came in,
 * the lazy jib car or a sheet, was never finished and its hand stood at it for good, at the car on the foredeck: the crew
 * soak, v208. Kept: the hoist (crewRig), the outboard (world.ts motorStow), the paddle (its own, ended by paddleWork).
 */
export function crewTiedUp(b: Boat, dt: number, emit: Emit, ashore: number | null = null): void {
  const cs = b.crew; if (!cs) return;
  // (`ashore`: on her lines, the one on the dock handling them, world.ts mooringStep. The pole, the car and the halyards are
  // the bow hand's, ownerOf: when that's who is ashore, alone or one crew, they wait till her lines are on and the hand's
  // back aboard; the hoist's own wait is the caller's, crewRig not run meanwhile)
  const n = cs.spec.crew.length, away = ashore != null && ashore === ownerOf('car', n, cs.spec, cs.layout ?? 'cockpit');
  if (b.pole !== 'down' && !away) { b.poleWant = false; crewPole(b, dt, emit); }
  if (!away) carCall(b, dt);
  for (const a of cs.people) {
    const j = a.job; if (!j) continue;
    const kept = (j.line === 'hoist' && !away) || j.line === 'outboard' || j.line === 'paddle' || (j.line === 'pole' && b.pole !== 'down' && !away) || (j.line === 'car' && !!b.carCmd && !away);
    if (!kept) a.job = null;
  }
}
export function crewAtDock(b: Boat, dt: number): void {
  const cs = b.crew; if (!cs) return;
  const yours = cs.place;
  // (placed by you, they're where you put them, at the dock as under way; and fore and aft in the cockpit unless you've
  // put them elsewhere: no bow hand off to the mast for the trim of a boat that isn't sailing)
  cs.place = { across: yours?.across ?? 'mid', fore: yours?.fore ?? 'mid' };
  placeCrew(cs, { need: 0, twa: b.twa, tws: b.ww.kt, v: 0, pole: false, tack: b.tack, windward: b.tack === 'S' ? 1 : -1, beat: beatAngle(b.ww.kt), extraMoment: 0, sea: 0, heel: b.heelMag ?? 0, tackComing: false, rmPerDeg: 250 }, dt);
  cs.place = yours;
}
export function crewRig(b: Boat, dt: number, emit: Emit): void {
  const r = b.rig; if (!r) return;
  const say = (msg: string) => { if (b.isUser) emit({ type: 'toast', msg, ms: 3500 }); };
  // (the forward hand on the halyards at the mast, or whoever there is: at their pace)
  const busy = !!r && ((r.mainUp && r.main < 1) || (!r.mainUp && r.main > 0) || (r.jibUp && r.jib < 1) || (!r.jibUp && r.jib > 0));
  const hands0 = bodyJob(b, 'hoist', busy);
  // (worked once the hand is at the mast: kneeling at the jib car still, bodyJob leaves them at it till it's done, and the
  // sail went up at their pace with nobody on the halyard: the physics review of the dock's jobs, 18 Nov 2026)
  const cw = busy ? b.crew : undefined, hand = cw ? cw.people[ownerOf('hoist', cw.spec.crew.length, cw.spec, cw.layout ?? 'cockpit')] : undefined;
  const hands = !hand || hand.job?.line === 'hoist' ? hands0 : 0;
  const twa = Math.abs(wrap(b.ww.from - b.h)), offWind = twa <= 45 ? 1 : twa >= 120 ? 0.3 : 1 - 0.7 * (twa - 45) / 75;
  const step = (k: 'main' | 'jib') => {
    const up = k === 'main' ? r.mainUp : r.jibUp, was = r[k];
    // (one person at the mast: the main first, then the jib, as the owner's "five seconds each sail")
    if (up && was < 1 && k === 'jib' && r.mainUp && r.main < 1) return;
    if (up && was < 1) {
      r[k] = Math.min(1, was + dt * hands * (k === 'main' ? offWind : 1) / HOIST[k]);
      if (k === 'main' && was === 0 && r[k] > 0 && offWind < 0.7) say('Hoisting the main off the wind: it fills and catches on the spreaders. It goes up much more easily head to wind.');
      // up at the mast: the last inches are the piano's (the crew take them up, or you, if the halyard's yours)
      if (r[k] === 1) say(byHand(b, k === 'main' ? 'downhaul' : 'jibHalyard') ? `${k === 'main' ? 'Main' : 'Jib'} up at the mast: take up the ${k === 'main' ? 'main' : 'jib'} halyard at the piano.` : k === 'main' ? 'Main up.' : 'Jib up.');
    } else if (!up && was > 0) {
      r[k] = Math.max(0, was - dt * hands / (k === 'main' ? HOIST.strikeMain : HOIST.strikeJib));
      if (r[k] === 0) say(k === 'main' ? 'Main down and flaked on the boom.' : 'Jib down and bagged on the foredeck.');
    }
  };
  step('main'); step('jib');
  // the last inches: short of the top the halyard's tackle is slack, nothing taken up (the owner, 14 Nov 2026); up at
  // the mast, the crew come back to the piano and take it up (a halyard you hold, you do: trimSails)
  for (const k of ['main', 'jib'] as const) {
    const line = k === 'main' ? 'downhaul' : 'jibHalyard', tk = k === 'main' ? 'mainTaut' : 'jibTaut';
    if (r[k] < 1) { r[tk] = 0; b.ctl[line] = 0; if (b.ctlTarget) delete b.ctlTarget[line]; }
    else if ((r[tk] ?? 1) < 1 && !byHand(b, line)) {
      r[tk] = Math.min(1, (r[tk] ?? 0) + dt / HALYARD.crewS);
      // (and the luff tensioned to their plan as the last of it, as a crew do on every hoist)
      if (r[tk] === 1 && b.crewIdeal?.[line] != null) b.ctl[line] = b.crewIdeal[line]!;
    }
  }
  if (r.jib < 1 && b.poleWant) { b.poleWant = false; say('The pole goes out on the jib: hoist the jib first.'); }
}

/** Crew work on the pole: set or stow on command, and gybe it end-for-end when the boat gybes. */
function crewPole(b: Boat, dt: number, emit: Emit): void {
  const say = (msg: string) => { if (b.isUser) emit({ type: 'toast', msg }); };
  // the forward hand (or whoever there is) goes to the mast to set, stow or gybe it, at their own pace
  const hands = bodyJob(b, 'pole', b.pole === 'setting' || b.pole === 'stowing' || (b.poleWant && b.pole === 'down') || (!b.poleWant && b.pole === 'set'));
  if (b.poleWant && (b.pole === 'down' || b.pole === 'stowing')) { b.pole = 'setting'; b.poleT = POLE.set / hands; b.poleTack = b.tack; }
  else if (!b.poleWant && (b.pole === 'set' || b.pole === 'setting')) { b.pole = 'stowing'; b.poleT = POLE.stow / hands; }
  else if (b.pole === 'set' && b.tack !== b.poleTack) {
    b.pole = 'setting'; b.poleT = POLE.gybe / hands; b.poleTack = b.tack;
    say('Jibing the pole end-for-end. The jib is down for a few seconds.');
  }
  if (b.pole === 'setting' || b.pole === 'stowing') {
    if (b.pole === 'setting' && b.poleTack !== b.tack) b.poleTack = b.tack; // gybed while setting: set it on the new windward side
    b.poleT -= dt;
    if (b.poleT <= 0) {
      if (b.pole === 'setting') { b.pole = 'set'; say('Pole set: jib out to windward, wing-on-wing.'); }
      else { b.pole = 'down'; say('Pole stowed: jib back to leeward.'); }
      bodyJob(b, 'pole', false);
    }
  }
}

/** Penalty turns count only in one direction, so each full turn includes a tack and a gybe (Rule 44.2). The direction
 * is settled once she has turned 30° one way; nothing counts while she sails clear first. The 30° is the sim's sign that
 * her turns have begun, so rule 21.2 binds her (rightOfWay.ts takingPenalty): "the moment it is obvious to other boats
 * that you are clearly beginning to make a penalty turn" (Perry, Understanding the Racing Rules of Sailing 2025–2028,
 * rule 21). A course change she then comes back from (a duck while getting clear) wasn't the turns: back within 10° of
 * where she began, it's undone. */
/**
 * A tack or jibe made in her turns. Her penalty is done with the last tack or jibe it needs: "each turn including one
 * tack and one gybe" (44.2), and "Once you complete your final tack or gybe, your penalty is complete … This is why it is
 * not called a '360' or '720'" (Perry, Understanding the Racing Rules of Sailing, rule 44.2); WS Case 108: 44.2 "does not
 * require a boat that takes a One-Turn Penalty to complete a full 360° turn, or a turn of any particular number of
 * degrees". Then she's no longer "taking a penalty" (21.2) and Section A applies to her again. A tack or jibe counts
 * only as part of her turns "in the same direction": on new ground, PENALTY_MOVE_APART further round than the last one
 * counted (so falling back across the wind, or a waggle, isn't one), tack and jibe by turns, once begun (not while she
 * sails clear). A final tack is complete when she's close-hauled on the new tack, as rule 13 ends (moveBoat), not at
 * head to wind.
 */
function penaltyManeuver(b: Boat, twa: number, emit: Emit): void {
  if (!(b.penalty > 0) || !b.penaltyDir || b.ai?.clearing) return;
  const kind: 1 | 2 = twa < 90 ? 1 : 2, at = b.penaltyTurned * b.penaltyDir;
  if (kind === b.penaltyLastMove || (b.penaltyLastMove && at < b.penaltyAt + PENALTY_MOVE_APART)) return;
  b.penaltyMoves++; b.penaltyLastMove = kind; b.penaltyAt = at;
  if (b.penaltyMoves < 2 * Math.round(b.penaltyTotal / 360)) return;
  if (kind === 2) penaltyDone(b, emit); else b.penaltyEndOnTack = true; // (the boom across: a jibe's done; a tack, once she's close-hauled)
}
/** How much further round her turns a tack or jibe must come than the last one counted, degrees: in a turn they're about
 * 180° apart (head to wind, dead downwind), less as she starts close-hauled or broad; 90° leaves room for both and
 * none for falling back across the wind. */
const PENALTY_MOVE_APART = 90;
function penaltyDone(b: Boat, emit: Emit): void { b.penalty = 0; b.penaltyEndOnTack = false; if (b.isUser) emit({ type: 'toast', msg: 'Penalty turns done. Back to racing.' }); }

function countPenalty(b: Boat, dh: number, emit: Emit): void {
  if (!(b.penalty > 0)) return;
  if (!b.ai?.clearing) b.penaltyTurned += dh;
  if (!b.penaltyDir && Math.abs(b.penaltyTurned) > 30) b.penaltyDir = Math.sign(b.penaltyTurned);
  else if (b.penaltyDir && b.penaltyTurned * b.penaltyDir < 10) { b.penaltyDir = 0; b.penaltyTurned = 0; b.penalty = b.penaltyTotal; b.penaltyMoves = 0; b.penaltyLastMove = 0; b.penaltyAt = 0; b.penaltyEndOnTack = false; }
  if (b.penaltyDir) b.penalty = Math.max(0, b.penaltyTotal - Math.max(0, b.penaltyTurned * b.penaltyDir));
  if (b.penalty <= 0) penaltyDone(b, emit);
}

/** Her sideways slip to leeward, m/s (hove to). */
export const leeDrift = (b: Boat) => -(b.sway ?? 0) * (wrap(b.ww.from - b.h) >= 0 ? 1 : -1);

export function moveBoat(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  if (b.lashed != null && (b.docked || b.pushing)) b.lashed = null; // made fast in her slip: the lashing comes off
  if (b.isUser && b.lashed != null) { b.tiller = b.lashed; b.steer = 0; b.turnTarget = null; } // lashed: hands off
  // sailing alone, with the helm gone forward to the jib car or the mast, nobody's steering: an unlashed tiller swings free
  // and the rudder trails in the flow (unless the tiller pilot has it), so she goes where her balance takes her, rounding
  // up with weather helm
  const solo = b.crew && b.crew.spec.crew.length === 0, away = !!solo && b.crew!.people[0].z < 0.5;
  if (b.isUser && away && !b.pilotSteers && b.lashed == null) { b.tiller = 0; b.steer = 0; b.turnTarget = null; }
  // jib aback: the polar no longer says how she sails, so the forces on her do (heaving to)
  // (it takes the clew a degree to windward to start, and none at all to stop, so she doesn't flicker between the two)
  const canHeave = b.isUser && !b.docked && !b.pushing && sailPlan(b) === 'jib' && (b.rig?.jib ?? 1) > 0.5; // (in irons, drifting astern, backing the jib is the way out)
  // (not with her motor driving her: the jib backed against its thrust doesn't balance, so she can't lie hove to)
  b.hove = canHeave && !(b.motor?.running && b.motor.down && b.motor.gear !== 'N') && ((b.jibBacked ?? 0) > 0.2 || (!!b.hove && (b.jibBacked ?? 0) > 0));
  if (b.hove) { heaveTo(b, dt, t, emit, groundToast); return; }
  const ww = b.ww;
  // turn rate falls off at low speed: a Folkboat needs water flowing over the rudder, ahead or astern (going astern it
  // works backwards, and less well: HANDLING.asternRudder of it). Nearly stopped, she turns only by sculling, which RRS 2025–2028 rule
  // 42.3(d) allows in one case: "When a boat is above a close-hauled course and either stationary or moving slowly, she
  // may scull to turn to a close-hauled course". World Sailing's rule 42 interpretations: "on either tack" (SCULL 1), so
  // from above close-hauled she may be sculled round onto either tack's close-hauled course, through the wind too; but
  // not back again against her own sculling (SCULL 2: she holds the way she started until she's close-hauled), not to
  // offset a backed sail's steering (SCULL 3: none with the jib aback), and never below close-hauled
  // (42.2(d): sculling "that ... prevents her from moving astern" is banned; she drifts astern while she turns)
  const toWind = wrap(ww.from - b.h) >= 0 ? 1 : -1, astern = b.astern ?? 0, aheadK = b.v + astern > 0 ? b.v / (b.v + astern) : 1;
  const flow = flowTurnRate(b.v) * aheadK + flowTurnRate(astern) * HANDLING.asternRudder * (1 - aheadK); // (with way on both ways at once, by which way the water mostly flows past the rudder)
  const aboveCH = Math.abs(wrap(ww.from - b.h)) < beatAngle(ww.kt) - 2;
  if (!aboveCH) b.scullDir = undefined; // (close-hauled or below: the sculling's done)
  const scullOK = (dir: number) => aboveCH && !((b.jibBacked ?? 0) > 0) && (b.scullDir == null || b.scullDir === dir);
  /** The most she can turn this way (+ to starboard), deg/s. */
  const rateFor = (dir: number) => dir && scullOK(dir) ? Math.max(flow, HANDLING.minTurnRate) : flow;
  const maxRate = Math.max(1e-3, flow);
  // helm balance: with weather helm she turns toward the wind unless the rudder holds her (balance.ts)
  // (her helm's own side: toward the wind. Off the wind that's by her tack, her boom's side, not by which quarter the wind
  // is on: by the lee the drive out on her boom still turns her bow away from the boom, back toward a run)
  const helmSide = Math.abs(wrap(ww.from - b.h)) >= 90 ? (b.tack === 'S' ? 1 : -1) : toWind;
  const balRate = clamp((b.helmNeed ?? 0) / FULL_RUDDER, -0.4, 0.4) * maxRate * helmSide;
  // her outboard, off her centerline on the port quarter, turns her too (motor.ts motorYaw): the rate its moment holds
  // against the water's resistance to her turning (steadyYaw, as the paddle's). Slow, that's more than her rudder can
  // hold, so she swings as she gathers way; at speed it's a touch of helm
  const motRate = b.motor ? steadyYaw(motorYaw(b), b.v - astern) : 0;
  let rate: number, rudder: number; // rudder: fraction of full, in the turn-rate sense (+ turns to starboard)
  // she answers the helm over a moment, not at once: her yaw inertia against the water's damping (yawLag); a helmsman
  // (and the AI) eases the helm before the heading he wants, by what she'll still turn once it's amidships
  const tau = yawLag(b.v + astern), r0 = b.turnRate ?? 0;
  let bladeFlip = astern > b.v && !b.isUser; // (going stern first and steering by the flow: the blade's the other way to the turn)
  let handHelm: number | undefined; // (the helm as your hand holds it, past full helm too: for the blade's drawing and its braking)
  let flowMost = flow; // (the most the flow past her rudder is turning her this step: more than that is sculling)
  if (b.isUser) {
    if (b.turnTarget != null && b.steer === 0) {
      const err = wrap(b.turnTarget - b.h);
      rate = Math.sign(err) === b.turnDir && Math.abs(err) <= Math.max(0, r0 * b.turnDir) * tau ? 0 : b.turnDir * rateFor(b.turnDir);
      if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) { rate = 0; b.turnTarget = null; b.turnCalledT = t; } // (called, and reached: gybeMeant)
    } else {
      // tiller to starboard turns the bow to port; keys add a push of their own
      // (the tiller in your hand swings to hard over, HELM_MAX: the turn grows with it to the rudder's stall and falls
      // off past it, where the blade brakes more than it turns (balance.ts rudderTurn). A steering key asks her
      // helmsman for her quickest turn: the helm at the stall, no farther)
      // (a key held with the tiller already over the same way doesn't push it past the stall: the hand alone does that)
      const hand = -b.tiller, key = b.steer * HELM_STALL;
      const helm = clamp(key !== 0 && Math.sign(hand) === Math.sign(key) ? Math.sign(key) * Math.max(Math.abs(hand), Math.abs(key)) : hand + key, -HELM_MAX, HELM_MAX);
      if (helm !== 0) b.turnTarget = null;
      // going astern the rudder works backwards: the bow goes the way you push the tiller. Sculled (where that turns her
      // faster than the flow does), she turns the way the tiller's pumped, as with way on, whichever way she's drifting
      const sternFirst = astern > b.v, dirFlow = Math.sign(helm) * (sternFirst ? -1 : 1), d = Math.sign(helm);
      // (a tiller held over with sternway turns her by the flow, the bow toward the tiller: sculling is pumping it, and with
      // steerage way astern, STEERS_ASTERN, a held helm is steering, not sculling, whatever her heading to the wind)
      // (that's the tiller in your hand, which is where you put it. A steering key asks for the turn: her helmsman
      // works the helm for it, sculling her round where the rule allows, as before, sternway or none)
      const sculls = b.steer !== 0 || !(sternFirst && astern > STEERS_ASTERN);
      // (never past her hard-over rate, HANDLING.maxTurnRate, however fast she's going)
      const byFlow = dirFlow * Math.min(rudderTurn(Math.abs(helm)) * flow, Math.max(flow, HANDLING.maxTurnRate)), sculled = sculls && d && scullOK(d) ? d * Math.min(1, Math.abs(helm)) * HANDLING.minTurnRate : 0;
      rate = Math.abs(sculled) > Math.abs(byFlow) ? sculled : byFlow;
      if (sternFirst && rate === byFlow) bladeFlip = true;
      // (the blade where your hand has it, the way she's turning: drawn there, at rest too)
      handHelm = (Math.sign(rate) || dirFlow) * Math.abs(helm);
      flowMost = Math.max(flow, Math.abs(byFlow)); // (past full helm the flow turns her faster than `flow`: that isn't sculling)
    }
    rudder = handHelm ?? clamp(rate / Math.max(1e-6, maxRate), -1, 1);
    if (b.turnTarget == null) rate += balRate + motRate; // let go of the tiller and she rounds up (or bears away), or the motor swings her
  } else if (b.penalty > 0 && !b.ai?.clearing) {
    // penalty turns: the crew backs the sails to spin the boat even when slow
    rate = Math.max(maxRate, PENALTY_TURN_RATE); rudder = 1;
  } else {
    let err = wrap(b.desired - b.h);
    const ai = b.ai;
    // in the middle of a tack (within 20° of head to wind, committed to going through it) she finishes it to the course
    // she set out for, whatever else comes up meanwhile: with her turn's inertia, a reversal there would leave her
    // stopped head to wind; once she's through, she answers it (the keep-clear moves among them). But not against a
    // boat she's about to hit (Rule 14, ai.ts urgent): that comes first. (The commitment is left alone meanwhile: ended
    // and re-made on a new heading behind her, it would take her the long way round, through the fleet.)
    const midTack = !!ai && ai.turnCommit !== 0 && !ai.urgent && Math.abs(wrap(b.ww.from - b.h)) < 20 && Math.sign(wrap(ai.commitFor - b.h)) === ai.turnCommit;
    if (midTack) err = wrap(ai!.commitFor - b.h);
    // a commitment ends when the turn is nearly done or she wants to go somewhere else
    if (ai && !midTack && ai.turnCommit !== 0 && (Math.abs(err) < 15 || (!(ai.tackNow && ai.commitHail) && Math.abs(wrap(b.desired - ai.commitFor)) > 45))) ai.turnCommit = 0;
    if (ai && !midTack && ai.turnCommit === 0 && Math.abs(err) > 30) {
      // Starting a big turn: choose once which way to go, and finish it (no bailing out halfway through a
      // tack). Too slow to tack? Going through the wind would leave her stuck in irons, so gybe instead.
      const toWind = wrap(b.ww.from - b.h);
      const throughWind = Math.sign(toWind) === Math.sign(err) && Math.abs(toWind) < Math.abs(err);
      ai.turnCommit = throughWind && b.v < slowTack(b) && !ai.tackNow ? -Math.sign(err) : Math.sign(err);
      ai.commitFor = b.desired; ai.commitHail = !!ai.tackNow; // (a tack for a hail is held to, whatever the plan does meanwhile)
    }
    if (ai && !midTack && ai.turnCommit !== 0 && Math.sign(err) !== ai.turnCommit) {
      const long = err + ai.turnCommit * 360;
      if (Math.abs(long) > 330) ai.turnCommit = 0; else err = long; // target moved: drop the commitment
    }
    // (where her heading's going with the helm amidships; checking a swing is the rudder's work, not sculling's: rule
    // 42.3(d) allows sculling only to turn toward close-hauled)
    // Her helm goes to full helm, 30°, as it always has, for her tacks, gybes and her own steering. Only about to touch
    // another boat (rule 14, ai.ts urgent) does she put it to the rudder's stall, 40°, her quickest turn (balance.ts
    // STALL_TURN, a sixth more than full helm's), as your steering key does; never past it, where the blade brakes and
    // turns her less: no helmsman steering for a turn shoves it hard over. Short of that she holds the helm the turn wants
    // (balance.ts helmFor), the drawn tiller with it. (Full helm for her tacks is a choice made by the fleet's fouls, not
    // by the physics: at the stall in every tack and turn the fleet fouled more round the start, 31 penalties in
    // fouls-start's sixteen starts against 25, 20 against 14 in 22 kt. Real helmsmen tack on a moderate helm, more only
    // slowing her through the turn, but this model charges nothing for the rudder's angle short of the stall (rudderBrake
    // starts there; turnBleed goes by the turn), so your key, which asks for the stall, tacks her a sixth quicker than
    // her AI: the physics review. The rudder's induced drag below the stall is the missing piece.)
    const most = ai?.urgent ? HELM_STALL : 1, quick = ai?.urgent ? Math.min(STALL_TURN * flow, Math.max(flow, HANDLING.maxTurnRate)) : flow;
    const lead = err - r0 * tau, lim = Math.sign(lead) === Math.sign(err) ? Math.max(quick, rateFor(Math.sign(lead))) : quick;
    // (below steerage way, STEERAGE, asked for the same turn rate per degree of error as with way on, any error over a
    // degree took the most turn the flow gives, the helm hard over: her tiller swung from full helm one side to full
    // helm the other four to eight times a minute under a knot in light air. Under STEERAGE she asks only for the turn
    // rate the helm she'd hold at steerage way gives her now, so a small error takes a little helm, a big turn full
    // helm, and the tiller drawn is the turn she makes. (That a helmsman steers so is an ESTIMATE, as STEERAGE is.) About
    // to touch a boat (rule 14, ai.ts urgent), her quickest turn, whatever her speed. Sculling toward close-hauled (rule
    // 42.3(d)) isn't scaled by the flow either: a pumped tiller makes its own, so stopped head to wind in a tack she
    // sculls round as before)
    const steerFlow = STEERAGE_FLOW * (aheadK + HANDLING.asternRudder * (1 - aheadK)); // (astern, the blade works less well: as flow)
    const gain = ai?.urgent ? 1 : Math.min(1, lim / steerFlow); // (lim: the flow's turn, or sculling's where 42.3(d) allows it)
    rate = clamp(lead * 1.6 * gain, -lim, lim);
    const need = (rate - balRate - motRate) / Math.max(1e-6, maxRate); // the AI holds whatever helm the boat needs
    rudder = Math.sign(need) * Math.min(most, helmFor(Math.abs(need)));
    flowMost = Math.max(flow, quick); // (at the stall the flow turns her faster than `flow`: that isn't sculling, as yours)
  }
  // (sculling in use: she's turning faster than the flow alone would turn her; latched to that way until close-hauled)
  if (Math.abs(rate - (b.turnTarget == null && b.isUser ? balRate + motRate : 0)) > flowMost + 1e-6 && b.penalty <= 0) b.scullDir = Math.sign(rate);
  if (bladeFlip && Math.abs(rate) > flowMost + 1e-6) bladeFlip = false; // (sculled: the tiller's pumped the way she turns)
  b.helm = clamp(bladeFlip ? -rudder : rudder, -HELM_MAX, HELM_MAX); // how hard the helm is over (for drawing the rudder and tiller: the blade where it is)
  b.weatherHeld = -helmSide * b.helm * FULL_RUDDER; // deg of weather helm actually held on the rudder
  // (paddling on one side swings her too, against the same inertia and the water's resistance to her turning: paddle.ts)
  rate += paddleYawRate(b, t);
  // (penalty spins too: the crew's backed sails turn her against the same inertia and damping as the rudder does)
  b.turnRate = r0 + (rate - r0) * (1 - Math.exp(-dt / tau)); rate = b.turnRate;
  if (b.v > 0.2) rate += waveYaw(b.sea, b.h, b.v, t, b.id + 1); // the sea knocks her bow about
  const dh = rate * dt;
  b.h = n360(b.h + dh); b.yawRate = rate;
  countPenalty(b, dh, emit);
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel);
  b.rel = rel; b.twa = twa;
  tackStep(b, rel, twa, t, emit, b.isUser);
  if (b.tacking && twa + leeSlip(b) >= Math.min(40, beatAngle(ww.kt) - 3)) { b.tacking = false; if (b.penaltyEndOnTack && b.penalty > 0) penaltyDone(b, emit); } // close-hauled (her course): Rule 13 ends (and a final penalty tack is complete)
  crewRig(b, dt, emit);
  crewPole(b, dt, emit);
  const plan = sailPlan(b);
  // the rig rolling: the sails move through the air sideways at the roll rate times their height (rolling to windward,
  // as a crew flattens her, gives them more wind; heeling to leeward takes some away, which damps the roll)
  // the wind the sails see: at their height, in the plane of the heeled mast (sailWind), as the crew trims to it
  // (going astern head to wind she moves downwind, so she sees less of it; slipping to leeward, the wind comes a little more abeam: leeway)
  const ap = sailWind(ww.from, ww.kt, b.h, b.v - (b.astern ?? 0) + rigSurge(b), (b.sway ?? 0) + rigSway(b), b.heel ?? 0);
  // (the sails, their trim and their forces, in the wind across her course through the water (sailFrame): the frame the
  // sail model was calibrated in before she had leeway, when heading and course were one. A calibration choice, not
  // something ORC's documentation is shown to say: the wind's angle to the hull itself is her leeway less (ap, for the
  // windage on her hull), and a real windex would read that. Recalibrating the trim constants (trim.ts) in the hull's
  // frame is on the ROADMAP)
  stepFrame(b, dt);
  const fr = sailFrame(b), slip = fr.rot;
  const apF = slip ? sailWind(ww.from, ww.kt, b.h + slip, fr.along - (b.astern ?? 0) + rigSurge(b), fr.across + rigSway(b), b.heel ?? 0) : ap;
  trimSails(b, apF.awa, plan, dt);
  // heel and helm balance from the forces on the sails (balance.ts)
  const jibOn = plan === 'jib' && b.trim.jib && b.shape.jib ? { trim: b.trim.jib, shape: b.shape.jib } : null;
  const sf = sailForces(apF.aws, apF.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, jibOn, b.luff);
  const cond = b.spec ? (b.cond ??= condition(b.spec)) : null; // your boat's condition: bottom, sails' age, spars, weight
  // an old sail's extra profile drag (hooked leech) and lost lift: the drive it costs, against the same shape in sound cloth
  let wornDrive = 1;
  if (cond && (b.shape.main.cd0 || b.shape.main.clMul || b.shape.jib?.cd0 || b.shape.jib?.clMul)) {
    const sound = (sh: Shape): Shape => ({ depth: sh.depth, draft: sh.draft, twist: sh.twist, ceAft: sh.ceAft });
    const s0 = sailForces(apF.aws, apF.awa, { trim: b.trim.main, shape: sound(b.shape.main), out: b.sheets.main }, jibOn ? { trim: jibOn.trim, shape: sound(jibOn.shape) } : null, b.luff);
    const d0 = s0.main.drive + s0.jib.drive, d1 = sf.main.drive + sf.jib.drive;
    if (d0 > 5) wornDrive = clamp(d1 / d0, 0.6, 1.05);
  }
  // how much of each sail is up: its force goes with its hoisted area (after the wear is worked out, sail for sail, so
  // a part-hoisted sail isn't counted as worn: the hoist has its own speed term below)
  // (and a part-hoisted sail draws worse than its area: controls.ts hoistDraw)
  const hm = sailUp(b, 'main'), hj = sailUp(b, 'jib'), dm = hm * hoistDraw(hm, 'main'), dj = hj * hoistDraw(hj, 'jib');
  if (hm < 1 || hj < 1) { sf.main.heel *= dm; sf.main.drive *= dm; sf.jib.heel *= dj; sf.jib.drive *= dj; }
  // the crew: where they'd put their weight to hold her at the heel they want (a little heel in light air, about 16°
  // upwind, flat downwind), then where they actually are (they move at a human pace, and go where their jobs are)
  const cs = b.crew ??= newCrew(DEFAULT_CREW, b.tack), disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = sf.main.heel + sf.jib.heel;
  const rmExtra = (h: number) => cond ? cond.rightingDelta(h) : 0; // weight aloft (a wooden rig) or high aft (the outboard on its bracket)
  // (off the wind the heel is the same balance of moments as upwind: the eased sails' smaller side force is what heels her
  // less, so a broad reach in a puff still heels her, and rounds her up, as it does a real boat)
  // (under bare poles, the sails struck, there's no heel worth sailing at: the crew sit her upright, in the middle, not out
  // to windward for a breeze she isn't sailing in nor to leeward for a light-air heel she can't have; as at the dock,
  // crewAtDock. Placed by you, they stay where you put them)
  // (struck, not half-hoisted: a sail half up still heels her, sf.main.heel by the hoist, and they sit up for it)
  const bare = !!b.rig && b.rig.main <= 0.05 && b.rig.jib <= 0.05, yours = cs.place;
  if (bare && !yours?.across) cs.place = { across: 'mid', fore: yours?.fore ?? 'mid' };
  const heelT = crewAndHeel(b, cs, F, sf.ceh, disp, rmExtra, Math.min(180, twa + (b.leeway ?? 0)), ww.kt, rel, cond?.extraMoment ?? 0, dt, bare ? 0 : undefined);
  cs.place = yours;
  rollTo(b, heelT, rel, disp, dt);
  b.helmNeed = helmNeeded(sf, b.heelMag!, b.sheets.main, b.v, sf.ceh, clrShift(cs.trim));
  b.forces = { heel: sf.main.heel + sf.jib.heel, drive: sf.main.drive + sf.jib.drive };
  // heel past her best; the weight aboard (displacement) and where it sits fore and aft (the trim's resistance); in a
  // drifter, the sails' own weight (heeled to leeward, gravity helps hold them in shape)
  // leeway: the polar's angles are the angles of her course through the water (ORC's VPP solves for the leeway), so her
  // speed is the polar's at her heading's angle plus the leeway she makes there: the side force across the water against
  // the keel's lift at the polar's speed, F = ½ρ·πT²·v²·λ (slender-wing lift, Newman §5.12, as HOVE and rollStep take it):
  // 3–6° close-hauled (6 to 20 kt), nothing downwind. Steering to the beat angle means steering that much higher.
  const Fside = F * Math.cos((b.heelMag ?? 0) * D2R), lwAt = (v: number) => twa < 150 ? clamp(Fside / (0.5 * 1025 * Math.PI * orc.boat.draft ** 2 * Math.max(0.8, v) ** 2) / D2R, 0, 12) : 0;
  // (her steady leeway, over a few seconds: what a helmsman allows for, and the polar's frame; the instant slip is b.sway.
  // The polar's speed at her course's angle, by the leeway she had: settled over the seconds, it needs no iterating)
  const vAt = polar(ww.kt, Math.min(180, twa + (b.leeway ?? 0)), plan), lwNow = lwAt(vAt);
  b.leeway = b.leeway == null ? lwNow : b.leeway + (lwNow - b.leeway) * Math.min(1, dt / 3);
  const vPolar = vAt;
  // the hull's side of her speed: heel and weight, as speed factors (calibrated so)
  let target = vPolar * heelFactor(b.heelMag!) * displacementFactor(disp, ww.kt);
  // and the sails' side, as a share of the drive: the cloth filling, the sheets, the sails' shape, worn cloth, how hard
  // they're driven against the polar's crew (powerFactor), how much of the sail plan is up. What a share of the drive is
  // worth in speed is where that drive meets the hull's resistance (dynamics.ts speedForDrive), with the sails' drive
  // changing with her speed as the apparent wind does (driveCurve.ts)
  // (the fore-and-aft trim's and the heeled hull's wetted area's extra resistance r are, against the same drive, a
  // share 1/r of it: exact through the resistance and the drive curve together)
  let K = clothFill(ap.aws, b.heelMag!) / (trimResistance(vPolar, cs.trim, b.seaShare ?? 0) * heelWettedResistance(vPolar, b.heelMag!, crewBestHeel(Math.min(180, twa + b.leeway), ww.kt)));
  if (!b.luff) {
    K *= (b.trimDriveK ?? trimDrive(b.trim.main, b.trim.jib)) * b.shape.eff * wornDrive * powerFactor(b, jibOn, Math.min(180, twa + b.leeway), ww, disp, dt, plan); // (at her course's angle, as the polar: the search's wind triangle is the course's)
    target /= b.powerRefHeel ?? 1; // (the polar has the polar crew's heel in it: her speed is the polar's × heelFactor(hers) / heelFactor(theirs))
  }
  const partUp = hm < 1 || hj < 1;
  if (partUp) {
    // part of the sail plan up: the drive goes with the area hoisted, and how well it's set
    const je = jibEfficiency(plan, twa), full = SAIL_AREA.main + SAIL_AREA.jib * je, up = SAIL_AREA.main * dm + SAIL_AREA.jib * je * dj;
    K *= full > 0 ? up / full : 0;
  }
  const crs = Math.min(180, twa + (b.leeway ?? 0)), vB = target;
  target = speedForDrive(vB, K, driveCurveFor(ww.kt, crs, vB));
  if (b.luff) target *= luffDriveFactor(twa); // (luffing: HANDLING's calibrated slowing, on the speed)
  // under bare poles she still drifts off downwind on the windage of her hull and rig (about a tenth of the wind)
  if (partUp) target = Math.max(target, 0.1 * ww.kt * KT * Math.max(0, Math.min(1, (twa - 90) / 60)));
  if (b.penalty > 0) target *= 0.7;
  const beat = beatAngle(ww.kt);
  // holding a lot of helm to keep her straight is a brake (the steady helm the sails demand; turning has its own cost)
  const helmDrag = Math.abs(rate) < 4 ? rudderDrag(clamp(b.helmNeed ?? 0, -12, 12), b.v) : 0;
  // the rig sweeping through the air as she rolls (a roll tack's flatten, a crew throwing their weight out): the extra
  // wind across the sails is extra push while it lasts, from the same sail forces (quasi-steady; the unsteady flow
  // measured on dinghies (Schutt & Williamson, Cornell) only adds to it), scaled to the hull as the force model scales
  // the sails' push (driveCalibration). Kogure et al. (Japan J. Coaching Studies 27(1), 2013) measured a Laser
  // Radial's roll tacks 5.3% faster than flat ones through the tack in 2–4 m/s, 2.8% in 4–6 m/s.
  // (and as she pitches: the rig swinging fore and aft through the air, seaway.ts waveMotion, rigSurge)
  let sweep = 0;
  const sway = rigSway(b), surge = rigSurge(b);
  if ((Math.abs(sway) > 0.02 || Math.abs(surge) > 0.02) && !b.luff) {
    const ap0 = sailWind(ww.from, ww.kt, b.h + slip, fr.along - (b.astern ?? 0), fr.across, b.heel ?? 0); // (as sf's, without the roll and the pitch: her sternway in both)
    const sf0 = sailForces(ap0.aws, ap0.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, jibOn, b.luff);
    // (each sail as much as is hoisted, as sf is; both already carry the worn cloth through the shape, so no wornDrive here)
    sweep = (sf.main.drive + sf.jib.drive - dm * sf0.main.drive - dj * sf0.jib.drive) * driveCalibration(ww.kt, twa);
  }
  // pinching: the sails flog (their windage, and the hull's and rig's no longer paid for by the polar's drive) as far as
  // they're luffing (trim.ts), and, below the beat angle, as the square of how far below it she is (pinchFlog): nothing
  // to speak of a degree or two low, so the polar's VMG peak stays at ORC's beat angle, rising to all of it in the no-go
  // zone, where she stops (the flogging cloth only as much as is hoisted; struck, the bare rig's windage at any angle
  // forward of the beam)
  const flog = b.luff ? flogAmount(twa, beat, NO_GO, true) : Math.max(sailFlog(b, plan, apF.awa), pinchFlog(Math.min(180, twa + b.leeway), beat)); // (her course's angle, as the polar's beat is)
  const a = surgeAccel(b.v, target, airDrag(ap.aws, ap.awa, flog, (SAIL_AREA.main * hm + SAIL_AREA.jib * hj) / (SAIL_AREA.main + SAIL_AREA.jib)) + seaDrag(b.sea, b.h, b.v) + helmDrag + (cond ? foulingDrag(cond, b.v) : 0) - sweep - motorForce(b) - paddleForce(b, t), disp, b.luff || (b.rig && (b.rig.main < 1 || b.rig.jib < 1)) ? undefined : driveCurveFor(ww.kt, Math.min(180, twa + (b.leeway ?? 0)), target)); // (the sails' push at her speed, from the sail model: driveCurve.ts; eased or struck, none)
  // stopped, the wind still on her bare rig drives her astern: what the surge
  // equation would take below zero becomes sternway, which the water's drag then slows (asternDrag, in travel). Head to
  // wind in 15 kt on bare poles that comes to about 1 m/s (rig windage 2.0 m² against her hull's drag stern first)
  // (with her sails up and flogging, in irons, the same: their windage on top of the rig's, so she gathers sternway
  // faster, and the rudder then works backwards; the way out is to bear away, the tiller pushed the way she's to go)
  const v1 = b.v + a * dt;
  if (v1 >= 0) b.v = v1; else { b.v = 0; b.astern = (b.astern ?? 0) - v1; }
  // (headway and sternway are one motion through the water: netted, so the drag on each doesn't push the other)
  if (b.v > 0 && (b.astern ?? 0) > 0) { const n = b.v - b.astern!; if (n >= 0) { b.v = n; b.astern = 0; } else { b.v = 0; b.astern = -n; } }
  // turning bleeds speed through the rudder's drag: for the rudder angle the turn needs, less what the sails' own turning
  // moment does for it (her helm: heeled to leeward she carries weather helm and comes up toward the wind by herself,
  // which is how a roll tack starts her turning with less rudder), so the same turn costs less or more by her balance
  b.v = Math.max(0, b.v * (1 - turnBleed(rate, b.v, b.h, ww.from, b.helmNeed) * dt));
  // (the rudder held past its stall brakes her: balance.ts rudderBrake. Only your own hand puts it there)
  if (handHelm !== undefined && Math.abs(handHelm) > HELM_STALL) b.v = Math.max(0, b.v - rudderBrake(Math.abs(handHelm), b.v) / HANDLING.mass * dt);
  // leeway, as a motion: her sails' side force across the water and the wind on her topsides and rig (HOVE.windSide) set
  // her bodily to leeward; her keel's lift with way on (slender wing: ½ρ·A·(πAR/2)·u·v = ½ρ·πT²·u·v) and her hull and keel
  // broadside to the water (cross-flow drag, HOVE.crossCd: Hoerner) hold her. At speed the lift does it: a few degrees
  // (b.leeway, above); slow, little holds her and she sags off to leeward (0.5–0.7 kt at 1.5 kt in 12 kt); stopped, only
  // the broadside drag does. With her sails struck, the wind on her rig alone (leaving a berth).
  {
    const awaR = ap.awa * D2R, q = 0.5 * 1.225 * ap.aws * ap.aws, side = ap.arel >= 0 ? -1 : 1; // (wind over the starboard side sets her to port)
    const Fy = side * (q * HOVE.windSide * Math.sin(awaR) ** 2 + (b.luff ? 0 : Fside));
    const sw = b.sway ?? 0, aL = Math.PI * HOVE.aspect / 2, Fw = -0.5 * 1025 * HOVE.latArea * (aL * Math.max(0, b.v) * sw + HOVE.crossCd * sw * Math.abs(sw));
    b.sway = sw + (Fy + Fw) / (disp * (1 + HOVE.swayAdded)) * dt;
    if (Math.abs(b.sway) < 1e-6) b.sway = 0; // (a micron a second: nothing. Not higher: under bare poles in 4 kt the wind's push is less than a tenth of a millimeter a second a step, and she never began to drift)
  }
  travel(b, dt, t, emit, groundToast);
  boomStep(b, apF.arel, apF.aws, dt, t, emit); // (the wind at her sails, as their forces have it: the gradient's and her roll's sweep in it)
  sailVisuals(b, plan, dt);
}

/**
 * Heaving to, and any time the jib is aback. A boat with her jib backed isn't sailing her polar: she's balanced (or
 * not) by the forces on her, so here they're worked out one by one and she moves as they say, forward, sideways and
 * in yaw. Hove to, the backed jib pushes her bow away from the wind and shoves her to leeward; the eased main, and the
 * tiller lashed to leeward, turn her back up as soon as she gathers way. She settles about 50–60° off the wind, creeping
 * forward at around a knot (more as the breeze builds: 0.7 kn in 8 kt, 1.5 in 20) and slipping to leeward at about as much: the keel, stalled at that crawl, holds her only by
 * its broadside drag. (Forum and seamanship-guide figures, none measured: about 1–1.5 kn fore-reaching for Folkboats
 * and IF-boats, bow 40–60° off the wind; tests/heaveto.test.ts.)
 *
 * The forces:
 * - Main: as in balance.ts (lift and drag from its trim and shape); eased, it luffs and pushes little.
 * - Backed jib: a sail with the wind on the wrong side is a stalled plate: its force is square to its chord, Cn ≈ 1.2
 *   sin(angle of attack) (Hoerner, Fluid-Dynamic Drag, flat and cambered plates past the stall), to leeward and a
 *   little aft, acting ahead of the keel.
 * - Hull and keel: forward, their resistance (dynamics.ts). Sideways, slender-wing lift with way on (Cl = π·AR/2 per
 *   radian of leeway; Newman, Marine Hydrodynamics §5.12) and, as she slows, cross-flow drag on the side-on profile
 *   (Cd ≈ 1, Hoerner), taken strip by strip along the keel so that turning is damped as well.
 * - Rudder: lift on the blade at its own angle of attack: where the tiller puts it, less the water coming at it from
 *   leeward as she slides sideways (half straightened by the keel just ahead of it).
 * - Windage of the hull and rig, and the crew's weight for heel, as when sailing.
 */
export const HOVE = {
  /** Side-on area below the waterline, hull and long keel, m²: about half the rectangle LWL × draft (an estimate from the profile drawings). */
  latArea: 0.5 * orc.boat.imsL * orc.boat.draft,
  /** Effective aspect ratio of that profile as a wing: 2·draft²/area (the water's surface mirrors it). */
  get aspect() { return 2 * orc.boat.draft ** 2 / this.latArea; },
  /** Broadside drag coefficient of the hull and keel (Hoerner: flat-sided bodies across the flow, about 1). */
  crossCd: 1.0,
  /**
   * How far aft of the centre of lateral resistance the broadside drag acts, m. With way on, the long keel's lift acts
   * near its quarter chord (the CLR, the origin of balance.ts LEVER); sliding sideways, the cross-flow drag acts nearer
   * the centre of the side-on area, which on a cutaway forefoot and a deep heel lies aft. TUNED, not measured: the drawn
   * profile's centroid (render/hull.ts) is 0.81 m aft of the CLR, but there she wanders 30° hove to in 8 kt and
   * forereaches near 2 kn in 25 kt; 0.3 m keeps her inside the hove-to observations (tests/heaveto.test.ts), which are
   * anecdotal. (With none, the backed jib can't hold her bow off in 8 kt with the sails' levers 1.88 m apart.)
   * A towing-tank or GPS record of a long-keeler drifting would set it.
   */
  dragAft: 0.3,
  /** Sway and yaw: added mass of water as a fraction of the boat's (a deep keel side-on drags a lot with it: ~0.9; in yaw ~0.4, estimates). */
  swayAdded: 0.9, yawAdded: 0.4,
  /**
   * Radius of gyration in yaw, as a fraction of LOA. 0.25 is the usual figure for a yacht, but a Folkboat carries over
   * half her weight in an iron keel under her middle (NFIA Class Rules: ballast 1,000 kg of 1,930), and weight near the
   * middle hardly resists her turning. Worked from that: the keel's 52%, a casting about 2.5 m long, at a radius of about
   * 0.7 m; the other 48% (hull, deck, rig, crew) at about 2.0 m, 0.26 of her length; together √(0.52·0.7² + 0.48·2.0²)
   * = 1.47 m, 0.19 of her 7.68 m. An ESTIMATE (no swing test of a Folkboat was found). It sets how soon her turn
   * answers the helm (yawLag: 0.36 s at 4.7 kt, 0.85 s at 2 kt; with 0.25 it was 0.6 and 1.4 s, and the owner, of his own
   * boat, 15 Nov 2026: "no delay in the turn of the boat and the push of the tiller"; and a seasoned skipper's account,
   * relayed by him the same day: "the boat is promptly responsive to tiller turning IRL (unless she has no momentum
   * obviously)": a practitioner's word, the best evidence short of a logged sea trial).
   */
  gyration: 0.19,
  /** Side-on windage of hull, cabin and rig (CdA, m²; freeboard about 0.65 m over 7.6 m, the cabin and mast) and how far ahead of the keel's centre it acts (the mast is forward), m. */
  windSide: 5.5, windLever: 0.3,
  /** How much of the sideways flow reaches the rudder: the long keel ahead of it straightens half of it (estimate). */
  rudderFlow: 0.5,
  /** Backed sail: normal-force coefficient at 90° (Hoerner: 1.17 for a flat plate, more for a cupped sail). */
  cnBacked: 1.2
};

/**
 * The fraction of her speed a turn bleeds away per second (physics.ts's own step, and src/boat/arcs.ts's prediction):
 * dv/dt = −turnBleed·v. Turning bleeds speed through the rudder's drag: for the rudder angle the turn needs, less what
 * the sails' own turning moment does for it (her helm: heeled to leeward she carries weather helm and comes up toward
 * the wind by herself, which is how a roll tack starts her turning with less rudder), so the same turn costs less or
 * more by her balance. `rate` deg/s (+ to starboard), `h` her heading, `windFrom` the wind she has, `helmNeed` deg.
 */
export function turnBleed(rate: number, v: number, h: number, windFrom: number, helmNeed = 0): number {
  let bleed = 1;
  if (Math.abs(rate) > 0.5) {
    const toWind = rate * Math.sign(wrap(windFrom - h) || 1), turn = FULL_RUDDER * toWind / Math.max(1, maxTurnRate(v));
    bleed = clamp(Math.abs(turn - clamp(helmNeed, -12, 12)) / Math.max(2, Math.abs(turn)), 0.3, 2);
  }
  return HANDLING.turnDrag * bleed * Math.abs(rate) * D2R;
}

/**
 * How long (s) her turn takes to answer the helm at speed u (m/s) through the water: the time constant of a first-order
 * (Nomoto) yaw response, her yaw inertia over the water's yaw damping, from her own hove-to model (HOVE, heaveTo): the
 * moment of inertia, with the water's added mass, I = m·(HOVE.gyration·LOA)²·1.4, against the damping the hull's strips and the
 * rudder give as she turns, both growing with her speed (the keel's lift ½ρ·A·(πAR/2)·u·L²/12 and the rudder's
 * ½ρ·u·A_R·slope·flow·arm²). 0.36 s at 4.7 kt, 0.85 s at 2 kt, 1.7 s at 1 kt (with HOVE.gyration 0.19). (No measured value for a yacht was found.
 * The broadside cross-flow drag damps her turn too, which this linear figure leaves out: about 20% quicker at 4.7 kt
 * turning hard. At a standstill it's all there is: sculled at 4°/s it gives 7–8 s (4–5 with the lighter inertia), near the 3.4 s the speed's floor,
 * 0.25 m/s, gives.)
 */
let yawK = 0, yawPerU = 0;
export function yawLag(u: number): number {
  if (!yawK) {
    const L = orc.boat.imsL, aL = Math.PI * HOVE.aspect / 2, N = 8, I = HULL.displacement * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
    yawPerU = 0.5 * 1025 * (HOVE.latArea * aL * (L * L / 12) * (1 - 1 / (N * N)) + RUDDER.area * RUDDER.slope * HOVE.rudderFlow * RUDDER.arm ** 2);
    yawK = I / yawPerU;
  }
  return yawK / Math.max(0.25, u);
}
/** The keel's and rudder's lift damping her turn, N·m per rad/s at `u` m/s through the water (the same strips as yawLag's;
 * a steady yaw moment M turns her at M / this, with way on). */
export function yawDamping(u: number): number { if (!yawK) yawLag(1); return yawPerU * Math.max(0, u); }
/**
 * The steady turn a moment `M` (N·m, + her bow to starboard) holds her in at `u` m/s through the water, deg/s: against
 * the keel's and rudder's lift with way on (yawDamping, linear in the turn) and her hull and keel broadside to the water
 * (quadratic, all there is at a standstill; as paddle.ts's): M = N·ω + Q·ω², so ω = (√(N² + 4Q|M|) − N) / 2Q.
 */
export function steadyYaw(M: number, u: number): number {
  if (M === 0) return 0;
  const N = yawDamping(Math.abs(u)), Q = 0.5 * 1025 * HOVE.crossCd * HOVE.latArea * orc.boat.imsL ** 3 / 32;
  return Math.sign(M) * (Math.sqrt(N * N + 4 * Q * Math.abs(M)) - N) / (2 * Q) / D2R;
}

/**
 * The sails' drive in the force model, against the polar. balance.ts's sail coefficients were set for heel and helm,
 * and hullResistance is the calm-water upright hull, so the force model's resistance is complete only at a crawl
 * (where it adds the keel's lift-induced drag and broadside drag itself). Toward the polar speed what it leaves out
 * grows: heeled and yawed hull resistance, waves, and the power a VPP flattens away. So the drive is the raw force at a
 * crawl, easing as she nears the polar speed to the calibration that would hold her exactly there with both sails
 * drawing at their best trim: k = (resistance + windage at polar speed) / drive. She can't beat the polar. (k by whole
 * knot and 5° of wind angle, cached.)
 */
const driveCal = new Map<number, number>();
export function driveCalibration(tws: number, twa: number): number {
  // (between whole knots, a straight line, so the drive doesn't step as the wind changes)
  const t = clamp(tws, 2, 40), w0 = Math.floor(t), f = t - w0;
  return f < 1e-6 ? calAt(w0, twa) : calAt(w0, twa) * (1 - f) + calAt(Math.min(40, w0 + 1), twa) * f;
}
function calAt(w: number, twa: number): number {
  const a = Math.round(clamp(Math.max(twa, beatAngle(w)), 30, 175) / 5) * 5, key = w * 1000 + a;
  const hit = driveCal.get(key); if (hit != null) return hit;
  const vt = polar(w, a, 'jib'), ap = sailWind(0, w, n360(-a), vt), awaR = ap.awa * D2R;
  const sm = optimalSheet('main', ap.awa), sj = optimalSheet('jib', ap.awa);
  const sf = sailForces(ap.aws, ap.awa, { trim: sailTrim('main', ap.awa, sm), shape: targetShape('main', w, ap.awa), out: sm }, { trim: sailTrim('jib', ap.awa, sj), shape: targetShape('jib', w, ap.awa) }, false);
  const windX = -0.5 * 1.225 * ap.aws ** 2 * HANDLING.windageCdA * Math.cos(awaR), drive = sf.main.drive + sf.jib.drive;
  const k = drive > 1 ? clamp((hullResistance(vt) - windX) / drive, 0.02, 1) : 1;
  driveCal.set(key, k);
  return k;
}
/** The share of the raw drive that moves her at speed `u` (m/s): all of it at a crawl, the calibration at the polar speed. */
export function driveShare(tws: number, twa: number, u: number): number {
  const vt = Math.max(0.5, polar(tws, Math.max(twa, beatAngle(tws)), 'jib')), x = clamp((u / vt - 0.2) / 0.8, 0, 1);
  return 1 + (driveCalibration(tws, twa) - 1) * x * x * (3 - 2 * x);
}

function heaveTo(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  b.boomFree = undefined; b.boomFrom = undefined; b.boomFreeT = undefined; b.boomSeenT = undefined; // (hove to, her main's sheeted: the sheet has it)
  const ww = b.ww, toWind = wrap(ww.from - b.h) >= 0 ? 1 : -1, D = D2R;
  const RHO = 1025, RHO_A = 1.225;
  // the helm: lashed, or wherever you hold it, or hard over through a tack or gybe you've called for (+ turns her to starboard)
  // (past full helm the blade's side force is no more than at full helm here, and past the stall it falls off as it does
  // sailing: balance.ts rudderTurn, an estimate. Drawn where it's held)
  const held = clamp(b.steer - b.tiller, -HELM_MAX, HELM_MAX);
  let helm = Math.sign(held) * Math.min(1, rudderTurn(Math.abs(held)));
  if (b.turnTarget != null && b.steer === 0) {
    const err = wrap(b.turnTarget - b.h);
    if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) b.turnTarget = null; else helm = b.turnDir;
  }
  b.helm = Math.abs(held) > 1 && Math.sign(held) === Math.sign(helm) ? held : helm;
  const deltaTw = helm * toWind * FULL_RUDDER * D; // rudder angle, rad, + turning her toward the wind
  // tack and sails, as when sailing
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel); b.rel = rel; b.twa = twa;
  tackStep(b, rel, twa, t, emit, true);
  if (b.tacking && twa + leeSlip(b) >= Math.min(40, beatAngle(ww.kt) - 3)) { b.tacking = false; if (b.penaltyEndOnTack && b.penalty > 0) penaltyDone(b, emit); }
  crewRig(b, dt, emit); crewPole(b, dt, emit);
  // sway and yaw are kept in the boat's frame (+ starboard); here they're worked toward the wind and to leeward
  // (her surge signed: + ahead, − astern. In irons, backing the jib is the way out: she's often going astern as she does)
  const u0 = b.v - (b.astern ?? 0), uf = Math.abs(u0), d0 = -toWind * (b.sway ?? 0), r0 = toWind * (b.yawRate ?? 0) * D;
  const ap = sailWind(ww.from, ww.kt, b.h, u0 + rigSurge(b), (b.sway ?? 0) + rigSway(b), b.heel ?? 0);
  trimSails(b, ap.awa, 'jib', dt);
  const q = 0.5 * RHO_A * ap.aws * ap.aws, awaR = ap.awa * D;
  const hm = sailUp(b, 'main'), hj = sailUp(b, 'jib');
  // the main, as in balance.ts
  const smAll = sailForces(ap.aws, ap.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, null, b.luff), sm = smAll.main;
  // (a flogging main's mean force lies along the apparent wind, so its push across the boat dies away as the wind comes
  // ahead: nothing holds her head to wind)
  const across = Math.min(1, Math.sin(awaR) / Math.sin(25 * D));
  const main = { heel: sm.heel * hm * across, drive: sm.drive * hm * driveShare(ww.kt, twa, Math.max(0, u0)), ceAft: sm.ceAft };
  // the backed jib: a stalled plate, its force square to the chord (clew `sheets.jib` deg to windward)
  const clew = b.sheets.jib * D, alpha = awaR - clew; // angle of the wind to the backed sail's chord
  const fn = q * SAIL_AREA.jib * hj * HOVE.cnBacked * Math.max(0, Math.sin(Math.min(Math.PI, Math.max(0, alpha))));
  // (clew to windward, negative: it pushes aft too) A stalled plate's centre of pressure moves from near the quarter
  // chord toward mid chord as the angle grows (Hoerner, Fluid-Dynamic Lift, ch. 3), so it pushes about a quarter-chord
  // further aft than a drawing jib's does: `ceAft` shortens its lever ahead of the keel by that (balance.ts sailYaw).
  const jib = { heel: fn * Math.cos(clew), drive: fn * Math.sin(clew), ceAft: 0.25 * Math.sin(clamp(alpha, 0, Math.PI / 2)) };
  // windage: along the apparent wind's flow (aft and to leeward)
  const windX = -q * HANDLING.windageCdA * Math.cos(awaR), windY = q * HOVE.windSide * Math.sin(awaR) * Math.abs(Math.sin(awaR));
  // hull and keel: strips along the waterline, each with lift (with way on, either way: a foil's lift opposes the
  // sideways flow whichever end leads; trailing edge first, about half of it: an estimate) and broadside drag
  const L = orc.boat.imsL, A = HOVE.latArea, AR = HOVE.aspect, aL = Math.PI * AR / 2, N = 8;
  // (the broadside drag's share of the area by strip: more aft, so its centre is HOVE.dragAft behind the CLR)
  const x2 = (L * L / 12) * (1 - 1 / (N * N)), kD = -HOVE.dragAft / x2;
  let hullY = 0, hullM = 0;
  const uEff = u0 >= 0 ? u0 : 0.5 * uf;
  for (let i = 0; i < N; i++) {
    const x = -L / 2 + (i + 0.5) * L / N, vy = d0 - r0 * x; // (x + forward) sideways water speed at the strip (+: she's moving to leeward there)
    const f = -0.5 * RHO * (A / N) * (aL * uEff * vy + HOVE.crossCd * (1 + kD * x) * vy * Math.abs(vy));
    hullY += f; hullM -= f * x; // a push to windward ahead of the centre turns her toward the wind
  }
  const lift = -0.5 * RHO * A * aL * uEff * d0; // the keel's lift alone, for its induced drag
  const leeway = Math.atan2(Math.abs(d0), Math.max(0.05, uf));
  const inducedX = -0.5 * Math.abs(lift) * leeway * (u0 >= 0 ? 1 : -1); // (against her motion)
  // the rudder, behind the keel: going astern the water meets it from aft, so the same blade angle pushes the other way
  // (the bow goes the way the tiller's pushed), and less well (HANDLING.asternRudder, as when sailing)
  const back = u0 < 0, vyR = HOVE.rudderFlow * (d0 + r0 * RUDDER.arm), vR2 = u0 * u0 + vyR * vyR;
  // (its push from the blade's angle reverses; its lift against the sideways flow past it opposes that flow either way)
  const aoaR = (back ? -deltaTw : deltaTw) - Math.atan2(vyR, Math.max(0.01, uf));
  const clR = clamp(RUDDER.slope * aoaR, -1.05, 1.05) * (back ? HANDLING.asternRudder : 1);
  const rudY = 0.5 * RHO * vR2 * RUDDER.area * clR, rudX = -0.5 * RHO * vR2 * RUDDER.area * (0.02 + clR * clR / (Math.PI * RUDDER.aspect)) * (back ? -1 : 1);
  // heel, from the side forces, against the hull and the crew (as when sailing)
  const cs = b.crew ??= newCrew(DEFAULT_CREW, b.tack), cond = b.spec ? (b.cond ??= condition(b.spec)) : null;
  const disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = main.heel + jib.heel;
  const rmExtra = (h: number) => cond ? cond.rightingDelta(h) : 0;
  const heelT = crewAndHeel(b, cs, F, smAll.ceh, disp, rmExtra, twa, ww.kt, rel, cond?.extraMoment ?? 0, dt, 6);
  rollTo(b, heelT, rel, disp, dt);
  b.forces = { heel: F, drive: main.drive + jib.drive };
  // the equations of motion: surge, sway, yaw
  const sails = { main, jib };
  // (the seaway's added resistance as when sailing; the turning drag the polar model adds is here in the strips' damping)
  // (going astern, the water's drag on her is travel's, asternDrag, as when she's driven astern sailing)
  const X = main.drive + jib.drive + windX - hullResistance(Math.max(0, u0)) + inducedX + rudX - (u0 > 0 ? seaDrag(b.sea, b.h, u0) + (cond ? foulingDrag(cond, u0) : 0) : 0)
    + paddleForce(b, t); // (paddled with the crutch: its push, and below its moment, which the strips resist: paddle.ts)
  const Y = main.heel + jib.heel + windY + hullY + rudY;
  const M = sailYaw(sails, b.heelMag!, b.sheets.main, smAll.ceh) - windY * HOVE.windLever + hullM + rudY * RUDDER.arm + F * clrShift(cs.trim) + toWind * paddleMoment(b, t);
  const mx = HANDLING.mass * disp / HULL.displacement, my = disp * (1 + HOVE.swayAdded), I = disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
  const u1 = u0 + X / mx * dt; b.v = Math.max(0, u1); b.astern = Math.max(0, -u1);
  b.sway = -toWind * (d0 + Y / my * dt);
  b.yawRate = toWind * (r0 + M / I * dt) / D; b.turnRate = b.yawRate; // (her turn carries on as she lets draw)
  b.helmNeed = undefined; b.weatherHeld = undefined;
  let dh = b.yawRate * dt;
  if (b.v > 0.2) dh += waveYaw(b.sea, b.h, b.v, t, b.id + 1) * dt; // the sea knocks her bow about
  b.h = n360(b.h + dh);
  countPenalty(b, dh, emit);
  void CE_HEIGHT; void LEVER;
  travel(b, dt, t, emit, groundToast);
  sailVisuals(b, 'jib', dt);
}

/** The rig's sideways speed through the air at the sails' centre of effort (m/s, + to starboard) from her rolling: the
 * roll rate times the centre of effort's height above the roll axis, taken at the waterline (balance.ts CE_ABOVE_WL). */
const rigSway = (b: Boat) => -(b.heelRate ?? 0) * D2R * CE_ABOVE_WL * Math.cos((b.heel ?? 0) * D2R);
/** ... and its speed forward through the air from her pitching (m/s, + forward): bow up, the rig swings aft, the pitch rate
 * times the same height (pitching about her centre of flotation, at the waterline: seaway.ts waveMotion). */
const rigSurge = (b: Boat) => -(b.pitchRate ?? 0) * CE_ABOVE_WL * Math.cos((b.heel ?? 0) * D2R);
/** The waves' added resistance at speed v as a share of the calm-water resistance (for the trim: hullTrim.ts). */
const seaShare = (b: Boat, v: number) => { const r = hullResistance(Math.max(0.5, v)); return r > 0 ? seaDrag(b.sea, b.h, Math.max(0.5, v)) / r : 0; };
/** (Worked out twice a second, as the sea is refreshed.) */
const seaNow = (b: Boat, dt: number) => { b.seaShareT = (b.seaShareT ?? 0) - dt; if (b.seaShareT <= 0 || b.seaShare == null) { b.seaShareT = 0.5; b.seaShare = seaShare(b, b.v); } return b.seaShare; };

/**
 * The crew decide where to be (crewPhys.ts placeCrew) for the heel they want, and the heel she'd settle at with them
 * there (deg, + to leeward). `bestHeel`: a fixed heel to aim for (hove to), else the crew's own by the conditions.
 */
function crewAndHeel(b: Boat, cs: CrewState, F: number, ceh: number, disp: number, rmExtra: (h: number) => number, twa: number, tws: number, rel: number, extraMoment: number, dt: number, bestHeel?: number): number {
  void rel;
  const skill = specAttr(cs.spec, 'trim'); // (the heel they sail at: their trim)
  const bh = bestHeel ?? crewBestHeel(twa, tws, skill);
  const need = heelingMoment(F, ceh, bh) - hullRighting(bh, disp, crewMass(cs.spec)) - rmExtra(bh);
  // (the windward side by her tack, which holds through a moment by the lee until the boom crosses)
  // (a tack coming: turning up toward the wind with a good way still to go, close-hauled; yours or the AI's)
  const aim = b.turnTarget ?? (b.isUser ? null : b.desired), dAim = aim == null ? 0 : wrap(aim - b.h);
  const tackComing = aim != null && twa < 60 && Math.abs(dAim) > 40 && Math.sign(dAim) === Math.sign(wrap(b.ww.from - b.h));
  // (and how long a turn has visibly been coming, for the crew getting ready without a call (boat/calls.ts): what she's
  // doing, not where she's aimed: close-hauled and turning up into the wind, or deep and turning her stern through it,
  // faster than TURN_SEEN; yours by hand or the AI's alike. Fading as long again once it's past, so the turn itself still
  // finds it; no more than CUE_MAX, so a long luff doesn't count for a turn much later)
  // (under sail with way on: a boat paddled or motored round isn't a turn the crew work)
  const rate = b.turnRate ?? 0;
  let shows = false;
  if (Math.abs(rate) > TURN_SEEN && b.v >= TURN_V && (b.rig?.mainUp ?? true)) { // (worked only while she's swinging: rarely)
    const toWind = Math.sign(wrap(b.ww.from - b.h));
    shows = (twa < beatAngle(tws) + 5 && Math.sign(rate) === toWind) || (twa > 150 && Math.sign(rate) === -toWind);
  }
  b.comingFor = shows ? Math.min(CUE_MAX, (b.comingFor ?? 0) + dt) : Math.max(0, (b.comingFor ?? 0) - dt);
  placeCrew(cs, { called: b.callOn, coming: b.comingFor, need, twa, tws, v: b.v, pole: b.pole === 'set' || b.pole === 'setting', tack: b.tack, windward: b.tack === 'S' ? 1 : -1, beat: beatAngle(tws), extraMoment, sea: seaNow(b, dt), heel: b.heelMag, bestHeel: bh, tackComing, held: courseHeld_(b), steadyFor: b.settle ? b.settle[SETTLE.since] : undefined, courseTwa: b.settle && b.crewReady ? b.settle[SETTLE.twaGuide] : undefined, rmPerDeg: hullRighting(bh + 1, disp, crewMass(cs.spec)) - hullRighting(bh, disp, crewMass(cs.spec)) }, dt);
  const m0 = crewMoment(cs, 0); // (their moment upright; it goes with the cosine of the heel)
  return b.heelEqLast = heelWithCrew(F, ceh, disp, h => m0 * Math.cos(h * D2R) + rmExtra(h), crewMass(cs.spec), b.heelEqLast);
}
/**
 * How hard to drive her, and what it's worth against the polar. In ORC's VPP the crew holds her up by hiking and by
 * flattening and twisting the sails (VPP Documentation 2025, §5.1.3, eq. 5.48), and the VPP picks the crew position and
 * the depowering that make her fastest (§4.4.3: "searching for the position that maximises the boat velocity ... the
 * solvers looks for each boat at the ideal heel angle"). Here the same search, over the crew's depowering steps
 * (controls.ts targetShape): for each step, her heel where the moments balance with the crew hiking (the wind triangle
 * heeled with her, eqs. 7.2–7.3), and the speed that gives. What pushes her along is the sails' drive less:
 * - the keel's induced drag, growing with the square of the side force square to her centre plane (ORC eq. 6.37:
 *   DI = FH² / (π·½ρV²·Te²); balance.ts netDrive), with Te ORC's effective draft along the keel's own span (MHSD, 0.92 ×
 *   the draft standing in for the deepest reduced draft, which ORC works from the hull's offsets);
 * - the rudder held over against her weather helm (balance.ts rudderDrag): North Sails' Nordic Folkboat guide eases the
 *   traveller in a breeze "to decrease heel and thus rudder pressure", and pulls the backstay "until the rudder feels
 *   light again";
 * and heeling past her best costs the hull (heelFactor).
 * Done twice a second: for the polar's standard crew (the reference: a boat sailed as the polar sails it), and for her
 * own crew as they are (how many, how heavy, how tired), whose fastest step the crew then works toward (trimSails).
 * (Once a second.)
 * Returned as a share of the drive: her push, with her sails as they are, against the polar crew's (the step turns it into speed).
 */
function powerFactor(b: Boat, jibOn: { trim: NonNullable<Boat['trim']['jib']>; shape: Shape } | null, twa: number, ww: { from: number; kt: number }, disp: number, dt: number, plan: SailPlan): number {
  // (the crew set their depowering for the breeze, not for each gust, which they ride out by easing and hiking: the wind
  // speed they judge it by is hers over the last 20 s or so; her heading they know at once. Her sails against the
  // polar's crew are weighed in the wind as it is, as the polar and her heel are)
  b.twsSlow = b.twsSlow == null ? ww.kt : b.twsSlow + (ww.kt - b.twsSlow) * Math.min(1, dt / 20);
  const tws = ww.kt;
  b.powerT = (b.powerT ?? 0) - dt;
  if (b.powerK != null && b.powerT > 0) return b.powerK;
  b.powerT = 1; // (once a second: her sails' power changes slowly)
  // (the search, and her sails against it, in the wind rounded to a knot and 2°: cached, and like for like)
  const twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2);
  const ref = fastestStep(twsR, twaR, plan, STANDARD_DISP, crewMass(DEFAULT_CREW), standardCrewMoment(), crewBestHeel(twaR, twsR), sittingMoment(DEFAULT_CREW));
  b.depowerBest = herFastestStep(b, twa, b.twsSlow, plan, disp).d;
  // hers: her sails as they are (no fuller than the full-power shape: fuller gains nothing the polar doesn't have, the
  // shape's own cost is shapeEfficiency's), at the crew's intended sheeting (a sheet set wrong, by you or the crew, is
  // counted once, in the step's trimDrive) and her own heel; her heel's cost to the hull is in the target already
  // (heelFactor), and her rudder's drag acts on her as a force in the step
  // (the polar has the polar crew's heel in it already: her speed is the polar's times heelFactor(hers) / heelFactor(theirs))
  // (her push against theirs, a share of the drive; their heel's own cost to the hull, a speed factor, the step takes off
  // on the speed side: b.powerRefHeel)
  const dNow = sailPush(tws, twa, plan, b.shape.main, jibOn ? jibOn.shape : null, b.heelMag ?? 0, b.depower ?? 0), dRef = ref.p;
  b.powerRefHeel = heelFactor(ref.h);
  // (bounds as a guard only, against a search answer from another wind: sailing, her push is never a quarter of the polar
  // crew's, nor more than a tenth over theirs, the polar being the boat sailed well; none bind in 4–26 kt with a solo,
  // standard or heavy crew: 0.88–1.06)
  b.powerK = dRef > 1 ? clamp(Math.max(0, dNow) / dRef, 0.25, 1.1) : 1;
  return b.powerK;
}
/** The fastest depowering step for her own crew as they are (how many, how heavy, how tired), in this wind. */
function herFastestStep(b: Boat, twa: number, tws: number, plan: SailPlan, disp: number): StepPick {
  const cs = b.crew, spec = cs?.spec ?? DEFAULT_CREW, twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2);
  // (each where they are: the deck's narrower aft, physics review)
  const edges = cs?.people.map(p => crewEdgeAt(p.z)) ?? [];
  return fastestStep(twsR, twaR, plan, disp, crewMass(spec), hikingMoment(spec, cs?.people.map(p => p.fatigue), edges), crewBestHeel(twaR, twsR, crewSkill(cs)), sittingMoment(spec, edges));
}
/**
 * What her sails push (N, drive less the keel's drag: netDrive) with these shapes at heel `heel` and depowering step
 * `depower`, judged as the speed search judges the polar crew's: in the wind triangle at the polar speed (rounded as the
 * search is) and her heel, the sheets where the crew intends them, no fuller than full power counting for more. So it
 * weighs her sails' shape and her heel, not how fast she's going. (powerFactor; the coach, for a line you might move.)
 */
export function sailPush(tws: number, twa: number, plan: SailPlan, main: Shape, jib: Shape | null, heel: number, depower: number): number {
  const twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2), vP = Math.max(0.3, polar(twsR, twaR, plan));
  const w = sailWind(0, twsR, -twaR, vP, 0, heel), full = crewShapes(twsR, w.awa, 0, stepBoom(w.awa, 0), optimalSheet('jib', w.awa));
  const cap = (s: Shape, f: Shape): Shape => ({ ...s, depth: Math.min(s.depth, f.depth) });
  return netDrive(intendedForces(cap(main, full.main), jib ? cap(jib, full.jib) : null, w.aws, w.awa, stepBoom(w.awa, depower)), heel, vP);
}
/** The boom where the crew wants it at depowering step d: eased down the traveller on the last steps (crewEaseBoom). */
const stepBoom = (awa: number, d: number) => clamp(optimalSheet('main', awa) + (awa < 70 ? 7 * clamp((d - 0.6) / 0.4, 0, 1) : 0), SAILS.main.min, SAILS.main.max);
/** The sails' forces at the crew's intended sheeting: the boom at `mainOut`, the jib (when it's drawing) at its best. */
const intendedForces = (m: Shape, j: Shape | null, aws: number, awa: number, mainOut: number) =>
  sailForces(aws, awa, { trim: sailTrim('main', awa, mainOut), shape: m, out: mainOut }, j ? { trim: sailTrim('jib', awa, optimalSheet('jib', awa)), shape: j } : null, false);

/**
 * The fastest depowering step for a crew (powerFactor): in true wind `tws` kt at `twa`°, with this sail plan, at
 * displacement `dsp` kg with `crewKg` aboard hiking with moment `crewM` (N·m, upright) to hold her at `bestHeel` (deg)
 * where they can, sailing at the polar speed.
 * Returns the step, her heel there, the push and the speed it's worth. (It depends on nothing else about the boat, so
 * it's cached: by a knot, 2°, 20 kg, 10 kg of crew and 100 N·m of hiking.)
 */
interface StepPick { d: number; h: number; p: number; speed: number }
const stepCache = new Map<string, StepPick>();
function fastestStep(tws: number, twa: number, plan: SailPlan, dsp: number, crewKg: number, crewM: number, bestHeel: number, sitM: number): StepPick {
  // (worked out from the rounded values themselves, so the answer doesn't depend on which boat asked first)
  dsp = Math.round(dsp / 20) * 20; crewKg = Math.round(crewKg / 10) * 10; crewM = Math.round(crewM / 100) * 100; sitM = Math.round(sitM / 100) * 100;
  bestHeel = Math.round(bestHeel);
  const key = `${tws}|${twa}|${plan}|${dsp}|${crewKg}|${crewM}|${bestHeel}|${sitM}`;
  const hit = stepCache.get(key); if (hit) return hit;
  if (stepCache.size > 20000) stepCache.clear();
  const vP = Math.max(0.3, polar(tws, twa, plan)), jibOn = plan === 'jib';
  // (speed from push where the push meets the hull's resistance: near K = 1 a share K of the drive is worth K^(1/n) in speed)
  const n = driveExponent(vP, driveCurveFor(tws, twa, vP));
  const wind = (heel: number) => sailWind(0, tws, -twa, vP, 0, heel), awa = wind(0).awa;
  // the sails as the crew sets them at each step (controls.ts crewShapes)
  const jibAng = optimalSheet('jib', awa);
  /** Sailed at depowering step d: her heel, push and speed. */
  const sailAt = (d: number): StepPick => {
    const sh = crewShapes(tws, awa, d, stepBoom(awa, d), jibAng);
    // (the heel where the moments balance with the crew hiking, with the sails' force at that heel: heeling takes wind out
    // of them, so a straight iteration rings; bisect on the heel instead. The sheets trimmed for the wind at each heel.)
    const at = (x: number) => { const w = wind(x); return intendedForces(sh.main, jibOn ? sh.jib : null, w.aws, w.awa, stepBoom(w.awa, d)); };
    // (one bisection on the balance of moments at heel m, the sails' force there included)
    const balance = (m0: number) => {
      let lo = 0, hi = 60;
      for (let i = 0; i < 10; i++) { // (to 0.06°)
        const m = (lo + hi) / 2, r = at(m);
        if (heelingMoment(r.main.heel + r.jib.heel, r.ceh, m) - m0 * Math.cos(m * D2R) > hullRighting(m, dsp, crewKg)) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
    // (the crew hike only as far as it takes to hold her at the heel they sail her at, as they do on the water
    // (crewPhys.ts): no further over than she goes with them sitting out on the windward deck, except in light air, where
    // they sit to leeward)
    const hike = balance(crewM), h = hike >= bestHeel ? hike : tws < 7 ? bestHeel : Math.min(bestHeel, balance(sitM));
    const r = at(h), out = stepBoom(wind(h).awa, d);
    // (and the rudder held over against her weather helm: North Sails' Folkboat guide eases the traveller in a breeze "to
    // decrease heel and thus rudder pressure", and pulls the backstay "until the rudder feels light again")
    const helm = clamp(helmNeeded(r, h, out, vP, r.ceh), -12, 12), p = netDrive(r, h, vP);
    return { d, h, p, speed: Math.max(0, p - rudderDrag(helm, vP)) ** (1 / n) * heelFactor(h) };
  };
  const seen: StepPick[] = [], pick = (d: number) => { const t = sailAt(d); seen.push(t); return t; };
  let top = pick(0);
  if (twa < 120) {
    for (let i = 1; i <= 4; i++) { const t = pick(i / 4); if (t.speed > top.speed) top = t; }
    // then the eighths either side, the sixteenths either side of the best of those, and a parabola through the best
    // three for where between them it peaks (so two boats a little different don't land a whole step apart)
    for (const t of [top.d > 0 ? pick(top.d - 1 / 8) : null, top.d < 1 ? pick(top.d + 1 / 8) : null]) if (t && t.speed > top.speed) top = t;
    const h = 1 / 16;
    for (const t of [top.d > 0 ? pick(top.d - h) : null, top.d < 1 ? pick(top.d + h) : null]) if (t && t.speed > top.speed) top = t;
    const a = top.d > 0 ? pick(Math.max(0, top.d - h)) : null, c = top.d < 1 ? pick(Math.min(1, top.d + h)) : null;
    if (a && c) {
      const den = a.speed - 2 * top.speed + c.speed;
      if (den < 0) { const off = clamp(0.5 * (a.speed - c.speed) / den, -0.5, 0.5) * h; if (Math.abs(off) > 1e-4) top = { ...top, d: clamp(top.d + off, 0, 1) }; }
    }
    // (where the speed hardly changes with the step, as on a reach in a gale, the least depowering within 0.05% of the
    // best: so the crew doesn't chase a flat curve as the wind wobbles)
    const floor = top.speed * 0.9995;
    for (const t of seen) if (t.d < top.d - 1e-6 && t.speed >= floor) top = { ...t };
  }
  stepCache.set(key, top);
  return top;
}

/** How much the sails are flogging (0..1), from their trim: each sail's luffing, by its share of the area (a jib that's
 * poled out or down isn't flogging; a sail half hoisted flogs as much of it as is up). */
function sailFlog(b: Boat, plan: SailPlan, awa: number): number {
  const luff = (t: { flow: string; amount: number } | null | undefined) => t && t.flow === 'luffing' ? t.amount : 0;
  // (the main against the boom the crew intends: the last depowering steps ease it down the traveller on purpose, and the
  // speed search prices that ease through the sails' own forces, as trimSails counts the sheet, so it isn't flogging
  // here; the same for a mainsheet you hold, so taking the sheet where the crew had it changes nothing. Pricing the
  // flogging in the search too, and judging the main where it is, is for later: ROADMAP, the audit)
  const main = sailTrim('main', awa, clamp(b.sheets.main - crewEaseBoom(b), SAILS.main.min, SAILS.main.max));
  // (and a luff not all the way up hangs slack and flogs, by how much less it draws: controls.ts hoistDraw)
  const hm = sailUp(b, 'main'), hj = sailUp(b, 'jib'), slack = (h: number, k: 'main' | 'jib') => h >= 1 ? 0 : 1 - hoistDraw(h, k);
  return Math.min(1, SAILS.main.share * hm * Math.max(luff(main), slack(hm, 'main')) + (plan === 'jib' ? SAILS.jib.share * hj * Math.max(luff(b.trim.jib), slack(hj, 'jib')) : 0));
}

/**
 * Pinching below the polar's beat angle (0..1, as flogAmount): the square of how far below it she is, across to the no-go
 * angle. The polar has her speed falling as she pinches (polar.ts, a curve set so that VMG peaks at ORC's beat angle,
 * not measured), and the sails sheeted hard in still draw (trim.ts luffs them only once the apparent wind is inside the
 * sheets' reach), so on its own that leaves a boat ten degrees too high losing little; a real one has her jib's luff
 * lifting and the hull's and rig's windage no longer paid for. Any cost here must be flat at the beat angle, or it moves
 * ORC's optimum (a straight line from the beat cost 10–16 times ORC's curve a degree or two low): a square is the
 * simplest that is. An estimate until the speed below the beat comes from the sails' own forces (ROADMAP, the audit).
 */
export const pinchFlog = (twa: number, beat: number) => twa >= beat ? 0 : twa <= NO_GO ? 1 : ((beat - twa) / (beat - NO_GO)) ** 2;

/** Roll her toward the heel `heelLee` (deg, + to leeward) as a damped oscillator (balance.ts rollStep). */
function rollTo(b: Boat, heelLee: number, rel: number, disp: number, dt: number): void {
  void rel;
  const side = b.tack === 'S' ? 1 : -1; // b.heel is + to port: to leeward with the wind over the starboard side (by her tack, as the boom)
  const r = rollStep(b.heel ?? 0, b.heelRate ?? 0, heelLee * side, disp, dt, b.v, b.crew ? crewMass(b.crew.spec) : 240);
  b.heel = r.heel; b.heelRate = r.rate; b.heelMag = b.heel * side;
}

/** The outward normal of whatever she hit at `p`, pointing back to open water: from which way round it, 1 m off (2 or 4 if she's deeper in), isn't land. */
export function outward(p: Vec): Vec {
  for (const r of [1, 2, 4]) { // (further out if she's deeper in than a metre)
    let x = 0, y = 0;
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, q = { x: p.x + r * Math.sin(a), y: p.y + r * Math.cos(a) }; if (!onLand(q)) { x += Math.sin(a); y += Math.cos(a); } }
    const l = hypot(x, y); if (l > 1e-6) return { x: x / l, y: y / l };
  }
  return { x: 0, y: 0 };
}
/**
 * How fast the part of her at `p` closes on what she hit there (m/s): its velocity over the ground (hers, and her turn's,
 * swinging her ends: turnRate × the lever) into the face, along its outward normal. A glancing touch closes slowly; sliding
 * along is friction, not a blow (boat/damage.ts).
 */
function closingAt(b: Boat, p: Vec): number {
  const w = -(b.turnRate ?? 0) * D2R, rx = p.x - b.x, ry = p.y - b.y; // (clockwise, + to starboard)
  const vx = b.vx - w * ry, vy = b.vy + w * rx, n = outward(p);
  return Math.max(0, -(vx * n.x + vy * n.y));
}
/** What she hit at `hit`, for the harm it does (boat/damage.ts) and for the words. (The open shore, outside the harbors'
 * walls, counts as mud and sand for now, aground with no damage: which stretches are seawall, riprap or beach isn't in the
 * sim's data yet (the NOAA chart's shoreline construction and coastline kinds would say), nor are the charted rocks;
 * ROADMAP's wreck item.) */
/**
 * The boats lying in the other slips are solid to a boat sailing free (8m2, the owner: "i keep getting pushed into other
 * boats"): the slips of the player's own boats aside, which the scene leaves empty (render/scene.ts clearSlips; the World
 * sets them: mooredBoats.empty). The same boats, as drawn (geo/marina.ts hitsMooredBoat), that her lines and fenders keep
 * her off at the dock. One World a thread is assumed (the race's worker, or the page with ?inproc): the last made sets it.
 */
export const mooredBoats: { empty: ReadonlySet<string> } = { empty: new Set() };
/** Land, a dock, or (near a harbor: `nearHarbor`, looked up once a step) a boat lying in a slip: what stops her. */
const solidAt = (p: Vec, nearHarbor: boolean): boolean => onLand(p) || (nearHarbor && hitsMooredBoat(p, mooredBoats.empty));
/** A pier part's name as a sailor says it (OpenStreetMap's names, geo/data/wharf.json and east-piers.json): "Pier 39" and
 * "Pier 41" with no article ("San Francisco Pier 33" is Pier 33; Pier 41's gates are Pier 41's), Pier 39's marina docks by
 * their marina ("Pier 39's A Dock"), "the Berkeley Pier's abandoned outer part", "the Long Wharf", "the Municipal Pier". */
export function wharfName(n: string): string {
  const pier = /^(?:San Francisco )?(Pier \d+)/.exec(n);
  if (pier) return pier[1];
  if (/^[A-Z] Dock$/.test(n)) return `Pier 39's ${n}`;
  if (/ \(abandoned\)$/.test(n)) return `the ${n.replace(/ \(abandoned\)$/, '')}'s abandoned outer part`;
  return `the ${n.replace(/ \(.*\)$/, '')}`;
}
function whatHit(hit: Vec): { kind: Struck; name: string } {
  if (!onLand(hit) && hitsMooredBoat(hit, mooredBoats.empty)) return { kind: 'boat', name: 'the boat in the next slip' };
  const piles = underPier(hit); if (piles) return { kind: 'piles', name: `the piles of ${piles.name}` };
  const pier = pierNear(hit, 6); if (pier) return { kind: 'concrete', name: `the ${pier.name.replace(/^(.*?), (.*)$/, '$1\'s $2')}` };
  if (hitsWall(hit)) return { kind: 'concrete', name: 'the breakwater' };
  if (hitsHarbor(hit)) return { kind: 'dock', name: 'the dock' };
  // (by its name where it has one: off Berkeley, "the wharf" read as Fisherman's; the stability soak, 18 Nov 2026)
  if (hitsWharf(hit)) { const n = wharfPartAt(hit) ?? wharfPartAt({ x: hit.x + 1, y: hit.y }) ?? wharfPartAt({ x: hit.x - 1, y: hit.y }); return { kind: 'concrete', name: n ? wharfName(n) : 'the wharf' }; }
  return { kind: 'mud', name: 'the shore' };
}
const RANK: DamageLevel[] = ['none', 'scrape', 'damage', 'serious', 'wreck'];
/**
 * The harm a blow does her (boat/damage.ts: the energy of her closing speed into it, at her displacement with her crew,
 * graded by what she hit), kept as the worst this outing; a wreck, for your boat only (the owner's answers, WRECK-PROPOSAL
 * section 7), ends it unless you carry on. Returns the grade.
 */
function hurt(b: Boat, what: { kind: Struck; name: string }, closing: number, hit: Vec, emit: Emit): DamageLevel {
  const m = displacement((b.crew ??= newCrew(DEFAULT_CREW, b.tack)).spec), level = damageOf(impactEnergy(closing, m), what.kind, m);
  if (!b.isUser) return level; // (the AI boats aren't wrecked or marked: the Coordinator's call, for now)
  if (RANK.indexOf(level) > RANK.indexOf(b.damage?.level ?? 'none')) b.damage = { level, what: what.name };
  if (level === 'wreck') wreck(b, `hit ${what.name} at ${(closing / KT).toFixed(1)} kn`, hit, emit);
  return level;
}
/** Your boat wrecked: how, and where ("at" the harbor she was at, or "on the Bay"); she's held there (World) until you choose. */
export function wreck(b: Boat, how: string, hit: Vec, emit: Emit): void {
  if (!b.isUser || b.wrecked) return;
  const H = harborNear(hit), where = H ? `at ${H.name}` : 'on the Bay'; // (the harbor she was at; elsewhere, the Bay)
  b.wrecked = { how, where }; b.v = 0; b.sway = 0; b.astern = 0;
  emit({ type: 'wrecked', how, where });
}
/**
 * Fort Mason's piers stand on close-set concrete piles under a deck lower than her masthead (the owner, 13 Nov 2026).
 * Against them she stops (end on: dead; sideways: her way into them, keeping her way along them), the blow graded as any
 * other. Held on them by the stream or the wind (every touch within PINNED_GAP s of the last) for PINNED s: end on, her
 * bow or stern goes in between the piles and she's worked in under the deck, the rig coming down on its edge, a wreck
 * (WRECK-PROPOSAL section 1); beam on she lies across two of them (she's 7.64 m, the bays about 4.5 m: an ESTIMATE, as
 * drawn), grinding her topsides on the concrete: damage.
 */
const pileTouch = new WeakMap<Boat, { last: number; since: number; ends: number; all: number }>(), pileTold = new WeakMap<Boat, number>();
const pileAt = new WeakMap<Boat, { x: number; y: number; kind: number }>(); // (where she was when last told, and what of: 0 against them, 1 set onto them, 2 damage)
/** Back on the piles where she touched within this long, s, it's the same spell (not told again unless it's worse). */
const SAME_SPELL = 120;
/** ESTIMATES: how long pinned on the piles (s) before she's in under the deck, and the longest gap between touches that's
 * still pinned (pushed off a little each touch, the stream and the wind set her straight back on). */
const PINNED = 30, PINNED_GAP = 20;
/**
 * Pinned means a set onto the piles her crew can't fend off: a hand's steady push, 250 N (dockLines.ts HAND_N, an
 * ESTIMATE), against the water's drag on her underbody beam on, ½·ρ·Cd·A·v² with A ≈ 9 m² and Cd ≈ 1 (ESTIMATES), is
 * matched by a stream of about 0.23 m/s. A touch closing slower than that a hand fends off: it doesn't pin her.
 */
export const PIN_V = Math.sqrt(250 / (0.5 * 1025 * 1 * 9));
function onPiles(b: Boat, pier: string, closing: number, endOn: boolean, hit: Vec, emit: Emit, t: number): void {
  if (endOn) { b.v = 0; b.astern = 0; }
  b.sway = 0;
  const level = hurt(b, { kind: 'piles', name: `the piles of ${pier}` }, closing, hit, emit);
  if (b.wrecked) return;
  if (closing >= PIN_V) {
    // (how she lies on them through the pinning: end on for most of it, her bow or stern goes in between the piles)
    const p = pileTouch.get(b), q = !p || t - p.last > PINNED_GAP ? { last: t, since: t, ends: 0, all: 0 } : p;
    q.last = t; q.all++; if (endOn) q.ends++; pileTouch.set(b, q);
    if (t - q.since > PINNED) {
      if (q.ends > q.all / 2) { wreck(b, `set in under ${pier}, among its piles`, hit, emit); return; }
      if (b.isUser && RANK.indexOf(b.damage?.level ?? 'none') < RANK.indexOf('damage')) { b.damage = { level: 'damage', what: `the piles of ${pier}` }; emit({ type: 'toast', ms: 6000, msg: `Grinding on the piles of ${pier}: damage to her topsides. Get way on and steer off.` }); }
    }
  }
  // (said once each spell on them: no touch for PINNED_GAP s ends one, unless she's back where she touched within
  // SAME_SPELL s. Fended a hand's breadth off with next to no wind she takes longer than PINNED_GAP to drift back, and
  // it's the same spell. And told again at once if it has got worse: touching gently, then set on them, then damage)
  const told = pileTold.get(b) ?? -99, at = pileAt.get(b), kind = level === 'damage' ? 2 : closing >= PIN_V ? 1 : 0, worse = !!at && kind > at.kind && t - told < SAME_SPELL;
  const still = !!at && t - told < SAME_SPELL && hypot(b.x - at.x, b.y - at.y) < 2 && !worse;
  const tell = b.isUser && (t - told > PINNED_GAP || worse);
  // (sliding along them untold, the worst she's been told of this spell is kept: not told again every couple of meters)
  pileTold.set(b, t); if (!still) pileAt.set(b, { x: b.x, y: b.y, kind: tell || !at || t - told >= SAME_SPELL ? kind : Math.max(kind, at.kind) });
  if (tell && !still) emit({ type: 'toast', ms: 6000, msg: level === 'damage' ? `Hit the piles of ${pier} hard: damage. Get way on and steer off.` : closing < PIN_V ? `Against the piles of ${pier}: fend off, and get way on to get clear.` : `Set onto the piles of ${pier}: held there, she'll be worked in under it. Get way on and steer off.` });
}
/** Below this speed through the water (m/s), about a knot, her rudder barely bites and she goes where the stream and wind
 * set her (ESTIMATE: no source found for a Folkboat; a long keel's rudder needs some way to answer) */
const STEERAGE = 0.5;
/** Her rudder's turn rate at steerage way, STEERAGE, ahead (deg/s), as dynamics.ts flowTurnRate: with STEERAGE, an ESTIMATE. */
const STEERAGE_FLOW = flowTurnRate(STEERAGE);
/** Her outboard driving her: running, down and in gear (idling in neutral it gives no steerage). */
const motorDrives = (b: Boat) => !!b.motor?.running && b.motor.down && b.motor.gear !== 'N';
/** Move her over the ground (through the water plus the current), and stop her on a dock or the shore. */
function travel(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  const u = V(b.h), ww = b.ww;
  // sternway (pushed off astern): she coasts back, slowing on the water's drag, which is slight at a walking pace (a
  // two-tonne boat glides a long way: from a shove of 0.5 m/s, five lengths in four minutes)
  const ast = b.astern ?? 0;
  // (her hull's resistance going through the water, and twice it stern first: ASTERN, an estimate. It falls away with
  // her speed, so her last way dies slowly; under a micron a second she's taken as stopped. Not higher: head to wind in
  // 3 to 6 kt the wind's push adds less than a tenth of a millimeter a second each step, and at that cutoff she never
  // began to go astern, then made a third of a meter a second from 7.5 kt: the physics review, 17 Nov 2026)
  if (ast > 0) { const left = ast - asternDrag(ast) * dt; b.astern = left > 1e-6 ? left : 0; }
  // sideways too, while she's slipping (hove to)
  const sw = b.sway ?? 0, stb = V(b.h + 90);
  b.vx = u.x * (b.v - ast) + stb.x * sw + b.cur.x; b.vy = u.y * (b.v - ast) + stb.y * sw + b.cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  const bump = (msg: string) => { b.lastHitT = t; if (b.isUser && t - groundToast.t > 4) { groundToast.t = t; emit({ type: 'toast', msg }); } }; // (lastHitT: rule 42.3(h), getting clear after it)
  const x0 = b.x - b.vx * dt, y0 = b.y - b.vy * dt; // (where she was: pushed back off something, she never ends a step on land)
  const nearHarbor = harborNear(b) != null, solid = (p: Vec) => solidAt(p, nearHarbor); // (the moored boats only where there are any: the step's cost)
  const offLand = () => { if (solid(bow(b)) || solid(b)) { b.x = x0; b.y = y0; } };
  // what a blow did, in words: the harm (boat/damage.ts) first, else what she touched
  const say = (level: DamageLevel, what: { kind: Struck; name: string }, closing: number, plain: string) => {
    const kn = (closing / KT).toFixed(1);
    if (level === 'wreck') { if (b.wrecked?.carryOn) bump(`Hit ${what.name} at ${kn} kn: a blow to wreck her, again.`); } // (the first wreck's statement is the page's)
    else if (level === 'damage' || level === 'serious') bump(`Damage: she hit ${what.name} at ${kn} kn. Steer off and give it room.`);
    else bump(plain);
  };
  let touched = false;
  if (b.pushing) { /* being walked out of her own slip by hand: nothing to hit */ }
  else if (solid(bow(b))) { // (the message by what she hit, a dock, a bridge's pier or the shore, not by where she is)
    const hit = bow(b), what = whatHit(hit), closing = closingAt(b, hit), piles = underPier(hit); // (where her bow struck, before she's pushed back off it)
    touched = true; b.x -= u.x * 0.6; b.y -= u.y * 0.6;
    if (piles && b.v < STEERAGE && !motorDrives(b)) onPiles(b, piles.name, closing, true, hit, emit, t);
    else {
      b.v = 0; b.sway = 0;
      say(hurt(b, what, closing, hit, emit), what, closing, what.kind === 'dock' ? 'Bump: your bow hit the dock. Steer off and back into the fairway.' : what.kind === 'mud' ? 'Aground! Steer back out to open water.' : `Collision: you hit ${what.name}. Bear away and give it room.`);
    }
    offLand();
  } else if (solid(stern(b)) && (ast > 0 || b.vx * u.x + b.vy * u.y < -0.02)) { // (going astern, or carried stern first by the stream)
    const hit = stern(b), what = whatHit(hit), closing = closingAt(b, hit), piles = underPier(hit);
    touched = true; b.x += u.x * 0.4; b.y += u.y * 0.4; b.astern = 0;
    if (piles) onPiles(b, piles.name, closing, true, hit, emit, t); // (going astern she has no steerage: on the piles)
    else say(hurt(b, what, closing, hit, emit), what, closing, what.kind === 'dock' ? 'Bump: your stern hit the dock going astern.' : what.kind === 'mud' ? 'Your stern touched bottom going astern.' : `Collision: your stern hit ${what.name} going astern.`);
    offLand();
  }
  // set sideways onto something (the wind on her bare rig across her, at a dock, her leeway, or the stream): her side at
  // the beam, amidships and at the quarters, half her beam (1.1 m) out on the side she's going; she stops going into it,
  // as against a fender, and keeps her way along it
  // (her sideways motion over the ground: her slip through the water and the current's set across her)
  // (her side checked in full while she's going more sideways than ahead; going ahead, only once her side amidships is
  // on something, sliding along a face, so the check costs one look a step: the perf budget; one contact a step: an end
  // that's touched is the blow)
  const side = b.vx * stb.x + b.vy * stb.y, ahead = b.vx * u.x + b.vy * u.y, sgn = Math.sign(side);
  if (!touched && !b.pushing && Math.abs(side) > 0.005 && (Math.abs(side) > 0.5 * Math.abs(ahead) || solid({ x: b.x + stb.x * sgn * 1.1, y: b.y + stb.y * sgn * 1.1 }))) {
    const hit = [0, 2.4, -2.4].map(a => ({ x: b.x + u.x * a + stb.x * sgn * 1.1, y: b.y + u.y * a + stb.y * sgn * 1.1 })).find(q => solid(q));
    if (hit) {
      const what = whatHit(hit), closing = closingAt(b, hit), piles = underPier(hit);
      b.x -= stb.x * sgn * 0.15; b.y -= stb.y * sgn * 0.15; if (Math.sign(b.sway ?? 0) === sgn) b.sway = 0;
      if (piles) onPiles(b, piles.name, closing, false, hit, emit, t);
      else say(hurt(b, what, closing, hit, emit), what, closing, what.kind === 'dock' ? 'Bump: she\'s been set sideways onto the dock.' : what.kind === 'mud' ? 'She\'s been set sideways onto the shore.' : `Collision: she's been set sideways onto ${what.name}.`);
      offLand();
    }
  }
  // trim to the apparent wind: wind over the water minus the boat's own motion through it (and the rig's as she rolls,
  // so the flags, the windex and the crew see what the sails see)
  // (in the frame the sails are trimmed in, the wind across her course through the water: step(), apF)
  const fr = sailFrame(b);
  const aw = apparent(ww.from, ww.kt, b.h + fr.rot, fr.along - (b.astern ?? 0) + rigSurge(b), fr.across + rigSway(b), b.heel ?? 0);
  b.awa = aw.awa; b.arel = aw.arel; b.aws = aw.aws;
}

/**
 * Which tack she's on (b.tack), by the Racing Rules' definitions (RRS 2025–2028, Definitions: Tack, Starboard or Port;
 * Leeward and Windward): "A boat is on the tack, starboard or port, corresponding to her windward side", and her
 * leeward side "is the side that is or, when she is head to wind, was away from the wind. However, when sailing by the
 * lee or directly downwind, her leeward side is the side on which her mainsail lies."
 *  - With the wind forward of dead astern on one side, that side is her windward side. Through head to wind she keeps
 *    the tack she had until the wind is on her other side: a tack.
 *  - Dead downwind and by the lee, her tack is her mainsail's, whatever side the wind is on. The main stays where it
 *    lies until it's gybed: by her crew, when she's being turned through the gybe (gybeMeant), or by the wind, when it
 *    gets behind the leech (boomStep). Her tack changes when the boom has crossed her centerline, not before: until
 *    then b.gybeTo holds the tack she's gybing to and the boom is on its way.
 *  - With no mainsail set there's none to go by: the wind's side.
 * `rel` the wind's bearing off her bow (deg, + over her starboard side), `twa` its size; `sheets`: her jib sheets change
 * over with it (the player's boat, and anyone hove to).
 */
function tackStep(b: Boat, rel: number, twa: number, t: number, emit: Emit, sheets: boolean): void {
  const mainUp = b.rig?.mainUp ?? true;
  if (b.turnTarget != null) b.turnCalledT = t; // (a called turn under way: gybeMeant)
  b.callOn = b.callT != null && t - b.callT < CALL_KEEP; // (her crew warned of the turn: boat/calls.ts)
  if (b.steer === 0) b.steerSince = undefined; else if (b.steerSince == null || b.steer !== b.steerWas) b.steerSince = t; // (how long a steering key has been held)
  b.steerWas = b.steer;
  let tk: 'S' | 'P' = rel >= 0 ? 'S' : 'P';
  // dead downwind: the tack she had, her main where it lies; unless the player has called the jibe, which her crew
  // make as soon as the wind's over the main's own side, however little
  const called = b.isUser && b.turnCalledT != null && t - b.turnCalledT < 3;
  if (twa > 176 && mainUp && !called) tk = b.tack;
  if (twa >= 90 && mainUp && tk !== b.tack) {
    // by the lee: her main's side is her leeward side, so she's on her old tack until the boom has crossed. Her crew
    // gybe it if she's being turned through a gybe; otherwise it lies where it is until the wind gets behind it
    const across = tk === 'S' ? -1 : 1; // (the boom's side on the new tack: to port on starboard)
    if (Math.sign(b.boom) !== across && Math.abs(b.boom) >= 1) {
      if (b.byLeeSince == null) { b.byLeeSince = t; b.byLeeCue = b.comingFor ?? 0; } // (when, and how much of the turn they'd seen: gybeMeant)
      if (b.boomFree == null && gybeMeant(b, tk, t)) b.gybeTo = tk;
      b.byLee = true; return;
    }
  }
  b.byLeeSince = undefined;
  if (tk === b.tack) { if (b.boomFree == null) b.gybeTo = undefined; b.byLee = false; return; } // (the wind back on her main's side before the crew had gybed it)
  // head to wind: a tack. Not if the wind came round her stern and her tack is only now catching up (her boom still
  // uncrossed as she reaches up on the new side, hove to or spun round in light air): that's a gybe, however late
  const tacked = twa < 90 && !b.byLee;
  if (tacked) { b.tacking = true; b.headToWindT = t; }
  b.byLee = false; b.tack = tk; b.gybeTo = undefined; b.lastTackT = t; if (sheets) jibSheetsAtTack(b, emit);
  // (back through the wind while the old sheet is still made fast: it's her leeward sheet again, and the jib fills on it)
  if ((b.jibHold ?? 0) > 0) { b.jibHold = 0; b.ctl.jibsheetW = 1; }
  else if (tacked) jibLetGo(b, emit);
  penaltyManeuver(b, tacked ? twa : 180, emit); // (a tack or a jibe of her penalty turns, rule 44.2)
}

/**
 * Is she being jibed on purpose, onto `to`? Then her crew bring the main across as her stern comes through the wind
 * (the boom handed over on the sheet, sailVisuals). An AI boat never sails by the lee except to jibe. On the player's
 * boat (the owner's ruling, 14 Nov 2026): the jibe key or any called turn (and for 3 s after it ends: a turn called
 * onto the other jibe ends only a few degrees past dead astern); or a steering key HELD down, KEY_HELD s or more, taking
 * her on round as her stern passes the wind. A tap of a key isn't, and the tiller in your hand is literal: steered
 * through by the tiller, or held steady by the lee, nobody touches the main, and it stays until the wind takes it.
 */
export const KEY_HELD = 0.6;
function gybeMeant(b: Boat, to: 'S' | 'P', t: number): boolean {
  // (an AI boat: her crew bring the main across at once if her skipper called the jibe; caught unready, once the one on
  // the mainsheet has got ready, she sailing by the lee meanwhile, and if she's swung on round far enough first, the
  // wind takes it before they do: a crash jibe, boomStep. boat/calls.ts)
  if (!b.isUser) return !!b.callOn || mainHandReady(b, t);
  if (b.turnCalledT != null && t - b.turnCalledT < 3) return true; // (tackStep keeps the time)
  // (onto starboard she's turning to starboard: her stern through the wind, which comes round onto her starboard quarter)
  return b.steer === (to === 'S' ? 1 : -1) && b.steerSince != null && t - b.steerSince >= KEY_HELD;
}

/**
 * The main by the lee, and the gybe the wind makes (the owner, 14 Nov 2026: the main holds 15 to 20° by the lee before
 * the wind gets behind it, as a real boat's does, and the crash across comes from the physics).
 *
 * What holds it: by the lee the wind still blows on the sail's own side as long as it comes from outside the line of
 * the sail, so the boom is pressed out against its sheet. It lets go from the leech: "As soon as the leech of the
 * mainsail starts to flick across, a gybe inevitably follows" (Yachting Monthly, "How to gybe safely and easily").
 * The leech is the edge the wind now meets first, and it stands inside the boom's line by the sail's own fullness
 * (leechHook: the sail's shape as the sim has it; that the leech lets go just there is the model's reading, not a
 * measurement). So the wind gets behind it when the apparent wind at the sail is more than (the boom's angle − that)
 * round her stern: about 40° of apparent wind at the sails with the boom on the shroud at 70°, and sooner with the main
 * not eased right out. In true wind that is 25 to 30° by the lee in flat water (running, the apparent wind swings further round
 * than the true); in a seaway the wind's own shifts take it sooner (at 22 kt in the Bay's chop, held 20° by the lee,
 * within a minute or so three times in four; held 10°, not at all): "Rolling motion, slight changes in the boat heading or wind direction can
 * cause an unexpected and surprising jibe" (Wikipedia, Jibe). No published angle was found for where it goes.
 *
 * Then the boom is free and the wind swings it: the sail's force broadside (a flat plate's, Cn 1.2: Hoerner) at the
 * sail's centre, BOOM_ARM from the mast, against the boom's and the sail's inertia with the air the sail carries
 * (BOOM_I, an estimate: a 9 kg spar 3.3 m long, 33 kg·m²; 5 kg of cloth, 9; the air, a plate's added inertia about
 * its edge (9/128)·π·ρ·c⁴ summed up the triangle, 51), and the air's own damping of a sail moving through it. From
 * the leech backing it is across in 6 s in 6 kt, 3 s in 12 kt and a little over a second in 25 kt, the boom's end at
 * 2 to 11 m/s. Fetched up on its sheet
 * on the new side, its turning momentum goes into her hull: she's slewed toward the wind, and her sails, full on the
 * new side at once, heel her and round her up (the roll and the helm's own models).
 */
const BOOM_ARM = 1.1, BOOM_I = 95, PLATE_CN = 1.2, MAIN_CHORD = 2.4; // (the main's chord at its centre, m: balance.ts CHORD)
/** How far inside the boom's line the main's leech stands, deg: the sail's own fullness as a circular arc, whose ends
 * turn in by 2·atan(2 × its depth). 27° at a depth of 12%; flattened, less, so a flat main holds further by the lee. */
const leechHook = (b: Boat) => 2 * Math.atan(2 * b.shape.main.depth) / D2R;
/** The apparent wind's bearing round her stern, deg, + toward starboard of dead astern (from over her starboard quarter). */
const windAstern = (arel: number) => (arel >= 0 ? 1 : -1) * (180 - Math.abs(arel));
function boomStep(b: Boat, arel: number, aws: number, dt: number, t: number, emit: Emit): boolean {
  const out = Math.abs(b.boom), side = Math.sign(b.boom), mainUp = b.rig?.mainUp ?? true;
  if (b.boomFree == null) {
    // the wind onto the back of the leech: off the wind, the main set and out on one side, not being handed across
    const lee = side * windAstern(arel); // (how far round her stern onto the main's own side the wind comes: by the lee)
    if (!mainUp || b.gybeTo || out < 5 || b.twa < 90 || !(aws > 0.5) || lee <= 0 || lee <= out - leechHook(b)) return false;
    b.boomFree = 0; b.boomFrom = side; b.boomFreeT = t; b.gybeTo = b.tack === 'S' ? 'P' : 'S';
  }
  // free: the wind's moment on the sail about the mast (it streams the boom away from where the wind comes from), less
  // the air's damping, against the inertia; past her centerline the sail fills on its new side
  const q = 0.5 * 1.225 * aws * aws, K = q * SAIL_AREA.main * (b.rig?.main ?? 1) * PLATE_CN * BOOM_ARM;
  // (the leech once backed, the fold runs forward through the sail at the wind's pace, a chord's length in chord/aws
  // seconds, and the backed cloth pushes the boom in: the line the wind must be inside moves from the leech's to as far
  // again beyond it. The model's reading of a sail collapsing from its leech, not a measurement)
  const fold = Math.min(1, (t - (b.boomFreeT ?? t)) * Math.max(1, aws) / MAIN_CHORD);
  const was = b.boomFrom ?? side, hook = Math.sign(b.boom) === was ? was * leechHook(b) * (1 + fold) : 0;
  // (the wind back on the main's own side before it had gone: it fills again, and the sheet has it)
  if (Math.sign(b.boom) === was && was * windAstern(arel) <= 0) { b.boomFree = undefined; b.boomFrom = undefined; b.boomFreeT = undefined; b.boomSeenT = undefined; b.gybeTo = undefined; return false; }
  // (the air's damping: the sail's own swing changes the wind it feels by arm·ω, and its force goes as that wind squared)
  const M = K * Math.sin((b.boom - hook - windAstern(arel)) * D2R) - 2 * K * BOOM_ARM * (b.boomFree * D2R) / Math.max(1, aws);
  b.boomFree += M / BOOM_I / D2R * dt;
  b.boom += b.boomFree * dt;
  if (b.boomSeenT == null && Math.abs(b.boomFree) > BOOM_SEEN) b.boomSeenT = t; // (swinging fast enough to see: the crew's cue to duck)
  // (across her centerline: her mainsail's side is her leeward side from this step, so her tack changes with it)
  if (b.gybeTo && Math.sign(b.boom) === -was) { b.tack = b.gybeTo; b.gybeTo = undefined; b.lastTackT = t; if (b.isUser) jibSheetsAtTack(b, emit); penaltyManeuver(b, 180, emit); boomStrike(b, t, b.boomFree, b.isUser ? emit : undefined); } // (anyone in its way, head up: boat/calls.ts)
  // fetched up on the sheet on the new side (or blown back out on the old one: the wind came back)
  const stop = b.luff ? SAILS.main.max : Math.max(5, b.sheets.main);
  if (Math.abs(b.boom) >= stop && Math.sign(b.boom) === Math.sign(b.boomFree)) {
    const crossed = Math.sign(b.boom) !== was, w = b.boomFree * D2R;
    b.boom = Math.sign(b.boom) * stop;
    if (crossed) {
      // the boom's turning momentum into her hull (about the mast, near enough her middle): a boom swinging to port
      // slews her bow to starboard, toward the wind she's now on
      const I = HULL.displacement * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
      b.turnRate = (b.turnRate ?? 0) - BOOM_I * w / I / D2R; b.yawRate = b.turnRate;
      b.crashT = t;
      if (b.isUser) emit({ type: 'toast', ms: 5000, msg: 'Crash jibe: the wind got behind the main. By the lee, head up sooner or call the jibe.' });
    }
    b.boomFree = undefined; b.boomFrom = undefined; b.boomFreeT = undefined; b.boomSeenT = undefined; if (!crossed) b.gybeTo = undefined;
  }
  return true;
}

/** Where the boom and jib are drawn: easing toward their sheet angles. */
function sailVisuals(b: Boat, plan: SailPlan, dt: number): void {
  // The main goes to leeward for the tack the boat is on (so sailing a little by the lee it stays put), or for the
  // tack she's gybing to: the boom goes across first, and her tack with it (tackStep)
  const jibSide = b.tack === 'S' ? -1 : 1, side = b.gybeTo ? -jibSide : jibSide; // (the jib, and its pole, by her tack: they follow once she has gybed)
  // The sails sit at their sheet angles; easing to luff lets them right out.
  const boomT = b.luff ? SAILS.main.max : b.sheets.main;
  // Jib: to leeward normally (to windward when backed); poled out square to windward when wing-on-wing; hanging
  // centred while the crew works the pole.
  const jibT = plan === 'wing' ? -jibSide * 82 : plan === 'main' ? jibSide * 10 : jibSide * (b.luff && !b.jibBacked ? SAILS.jib.max : b.sheets.jib);
  if (b.boomFree == null) {
    let to = b.boom + (side * boomT - b.boom) * Math.min(1, dt * 4); // (free, the wind has it: boomStep)
    // (handed across in a jibe it can pass her centerline in one step, some 9°: held a moment at it, so her tack changes
    // with it (tackStep, the next step) and never lags the boom by a step, Definitions)
    if (b.gybeTo && Math.sign(to) === side && Math.sign(b.boom) !== side && Math.abs(to) > 0.9) to = side * 0.9;
    b.boom = to;
  }
  b.jib += (jibT - b.jib) * Math.min(1, dt * (plan === 'wing' ? 1.2 : 3));
}

/** How far the crew eases the boom past its best angle to keep her on her feet (the last depowering step: up to about 7°). */
export const crewEaseBoom = (b: Boat) => (Math.abs(b.awaSlow) < 70 ? 7 * clamp(((b.depower ?? 0) - 0.6) / 0.4, 0, 1) : 0);
/** The boom angle the crew is aiming for. */
export const crewMainAngle = (b: Boat) => optimalSheet('main', b.awaSlow) + crewEaseBoom(b);

/** Taking in a slack sheet by hand, full range per second (an arm's length of line a second, no load on it). */
const SLACK_RATE = 0.6;

/* ---------- who has each line ---------- */

/** Every line you can work, in the order they're shown. */
export const LINES: readonly LineKey[] = ['mainsheet', 'traveller', 'backstay', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard', 'jibsheet', 'jibsheetW', 'car'];
/** Whether you have this line (otherwise the crew works it). */
export function byHand(b: Boat, k: LineKey): boolean {
  if (!b.isUser) return false;
  const h = b.hand?.[k]; if (h != null) return h;
  if (k === 'jibsheetW') return false; // the lazy sheet is the crew's until you haul on it
  return k === 'mainsheet' || k === 'jibsheet' ? b.manualTrim : b.trimAll;
}
/**
 * Hove to with the tiller lashed: a crew told "we're hove to" keep her so, the jib's windward sheet made fast with the jib
 * backed and the main left eased where it is, whoever had the lines before (the owner: Auto, crew or trim, while she's
 * hove to should keep her hove to). Only the helm sails her off, by letting the lashing go.
 */
export const keepsHove = (b: Boat) => b.isUser && !!b.hove && b.lashed != null;
/** The lines you have. */
export const linesByHand = (b: Boat): LineKey[] => LINES.filter(k => byHand(b, k));
/** Take a line (you're working it), or give it back to the crew (`mine` false): they carry on from where it is. */
export function takeLine(b: Boat, k: LineKey, mine = true): void {
  (b.hand ??= {})[k] = mine;
  if (!mine && k !== 'car') { delete b.ctlCmd[k]; if (b.ctlTarget) delete b.ctlTarget[k]; }
}
/** Every line back to the crew. */
export function allToCrew(b: Boat): void { b.manualTrim = b.trimAll = false; b.hand = {}; b.ctlCmd = {}; b.ctlTarget = {}; } // (the pole stays yours: your call only, the owner)

/**
 * At a tack (or gybe) the jib sheets stay on their own sides. The crew lets the old sheet fly and tails the new one, so
 * the leeward sheet carries on where it was. But a sheet you hold is yours: hold the windward sheet through the turn and
 * the sheets change roles as they really do, the one you had trimmed becoming the windward sheet with the jib aback
 * (the classic way to heave to: tack and leave the jib sheet made fast).
 */
/**
 * Through the wind, the old leeward jib sheet is the windward one: still made fast, it holds the jib aback until the
 * crew let it fly. Ready (called, or got ready as she turned), they let it go as the jib comes across; caught unready,
 * once they are, the jib backed meanwhile, which costs her way (boat/calls.ts). Yours if you hold it.
 */
function jibLetGo(b: Boat, emit: Emit): void {
  if (byHand(b, 'jibsheetW') || keepsHove(b) || !b.crew || sailPlan(b) !== 'jib' || b.v < TURN_V) return; // (a tack under way: not a drift through the wind in irons, where the jib's own model holds)
  const n = b.crew.spec.crew.length, who = ownerOf('jibsheet', n, b.crew.spec), p = who === 0 ? b.crew.spec.helm : b.crew.spec.crew[who - 1];
  if (!p || who === 0) return; // (the helm's own jib, sailing alone: their own turn, nobody to warn)
  // (ready, they let it fly as the jib comes across, as before; not ready, it's held aback till they are)
  const left = prepLeft(p, !!b.callOn, b.comingFor ?? 0); if (left <= 0) return;
  b.ctl.jibsheetW = Math.min(b.ctl.jibsheetW, b.ctl.jibsheet); // (the old leeward sheet as it was trimmed, now to windward)
  b.jibHold = PREPARED + left;
  if (b.isUser && b.jibHold > 1) emit({ type: 'toast', ms: 4500, msg: 'Uncalled tack: the jib backed.' });
}
/** The one on the mainsheet is ready to bring it across, unwarned: by the lee long enough to finish getting ready, from
 * what of the turn they'd seen (prepLeft, PREPARED). */
function mainHandReady(b: Boat, t: number): boolean {
  const c = b.crew; if (!c) return true;
  const n = c.spec.crew.length, who = mainHand(n, c.spec, (c.layout ?? 'cockpit') !== 'cockpit'), p = who === 0 ? c.spec.helm : c.spec.crew[who - 1];
  if (who === 0) return true; // (the helm has the main: nobody needs warning of their own turn)
  return !p || (b.byLeeSince != null && t - b.byLeeSince >= PREPARED + prepLeft(p, false, b.byLeeCue ?? 0));
}
function jibSheetsAtTack(b: Boat, emit: Emit): void {
  // (the crew holding her hove to, and she's gone through the wind all the same, a shift or the lashed tiller moved: the
  // sheet made fast is the leeward one now, so the jib fills on it and the old leeward sheet, let fly, is the lazy one;
  // the lines stay the crew's, who trim her once she's sailing)
  if (!byHand(b, 'jibsheetW') && keepsHove(b)) { const c = b.ctl; [c.jibsheet, c.jibsheetW] = [c.jibsheetW, c.jibsheet]; return; }
  if (!byHand(b, 'jibsheetW')) return;
  const c = b.ctl, h = b.hand ??= {}, leeMine = byHand(b, 'jibsheet');
  [c.jibsheet, c.jibsheetW] = [c.jibsheetW, c.jibsheet];
  h.jibsheet = true; h.jibsheetW = leeMine;
  if (b.ctlTarget) { const tl = b.ctlTarget.jibsheet, tw = b.ctlTarget.jibsheetW; delete b.ctlTarget.jibsheet; delete b.ctlTarget.jibsheetW; if (tw != null) b.ctlTarget.jibsheet = tw; if (tl != null && leeMine) b.ctlTarget.jibsheetW = tl; }
  if (leeMine && c.jibsheetW < 0.6) emit({ type: 'toast', msg: 'You held the jib sheet through the tack: the jib is aback. Ease the windward sheet (or tap its Auto) to let it across.', ms: 5000 });
  else if (!leeMine) emit({ type: 'toast', msg: 'The jib sheets changed sides: the one you held is now the leeward sheet, and yours to trim (tap its Auto to give it to the crew).', ms: 5000 });
}

/** (crewSettle's imports, read once at load: loaded through a module runner, as perf-pair and perf.test load the sim,
 * each use of an imported name is a lookup in the module's namespace and a call to its getter, about 20 a call here:
 * Capacity, 16 Nov 2026) */
const GUIDE_BACKLASH_ = GUIDE_BACKLASH, GUIDE_LIGHT_ = GUIDE_LIGHT, GUIDE_LIGHT_KT_ = GUIDE_LIGHT_KT, GUIDE_DEAD_ = GUIDE_DEAD, GUIDE_FAST_ = GUIDE_FAST, GUIDE_KT_ = GUIDE_KT, LINE_GAP_ = LINE_GAP, LINE_TAU_ = LINE_TAU;
const clamp_ = clamp, wrap_ = wrap, n360_ = n360, courseHeld_ = courseHeld, NEW_COURSE_ = NEW_COURSE, carInFor_ = carInFor, optimalSheet_ = optimalSheet;

/**
 * What the crew's trim reads its guide by and waits on, each step (trimSails): the apparent angle and the wind the
 * tuning guide's settings are read at (Boat.settle: SETTLE.guideAwa, guideKt), and whether she's swinging or settled (settleLeft). Kept
 * out of trimSails, a function of its own: the step ran 2.6-3.8% slower with it inside for the same work, and trimSails
 * is large enough that what it grows by can cost its own callees their inlining (Capacity, 16 Nov 2026; the irons'
 * and the paddle's work moved out of aiThink the same way).
 */
function crewSettle(b: Boat, dt: number): void {
  const s = b.settle ??= new Float64Array(10); // (the World's boats have it from birth: world.ts makeBoat)
  // (the angle the guide's settings are read at: hers, but past a backlash: controls.ts GUIDE_BACKLASH_)
  // (and once she holds a course it comes to hers, over a gust-lull cycle, LINE_GAP_: the backlash stops a wandering
  // course flipping their settings, but doesn't keep a reach on the beat's settings for the leg, the Deep Physics review)
  // (past a few degrees of it: a couple of degrees' drift inside the guide's 40-60° blend slid the vang's ceiling under
  // its setting and sent them up to ease it)
  // (wider in light air, controls.ts GUIDE_LIGHT_, read for the guide's wind as it was last read)
  { const a = Math.abs(b.awaSlow), bl = GUIDE_BACKLASH_ + GUIDE_LIGHT_ * clamp_((GUIDE_LIGHT_KT_ + 5 - s[SETTLE.guideKt]) / 5, 0, 1);
    // (not while she's swinging, or till she's held a course NEW_HELD after: the angles she turns through aren't a course.
    // Dragged round by a slow penalty circle on the beat, it came back through the backlash and the blend over a minute,
    // and the vang came off in two trips, crewstation's 6 kt seed 14; a new course is read at once when it's held, below)
    // (held only against loosening: coming up through the swing, the beat's settings, the vang's ceiling under 18 kt, come
    // in as she comes up, as before; frozen, they came 10 s after a rounding, the physics review)
    // (for a swing begun in light air only, where the wider backlash is, GUIDE_LIGHT_: the angle coming back through it
    // after a swing is what took a minute there. In a breeze the beat's settings held through each bear-away of a boat
    // lying to off the harbor in 26 kt, and her tacks there nearly doubled, tests/abandon-home.test.ts's northerly. Judged
    // as the swing begins: let go part way as a building breeze crossed 10 kt, the outhaul's ease for a run fell between
    // the crew's waits and its worth, tests/crew.test.ts. And for HOLD_MAX at most: a helm swinging without end doesn't
    // hold it for good, the physics review)
    const held = s[SETTLE.held];
    s[SETTLE.held] = s[SETTLE.since] >= NEW_HELD ? 0 : held === 0 && s[SETTLE.guideKt] >= GUIDE_LIGHT_KT_ + 5 ? HOLD_MAX + 1 : held + dt;
    if (!b.crewReady) s[SETTLE.guideAwa] = a;
    else if (s[SETTLE.since] >= NEW_HELD || s[SETTLE.held] > HOLD_MAX) {
      s[SETTLE.guideAwa] = clamp_(s[SETTLE.guideAwa], a - bl, a + bl);
      const off = a - s[SETTLE.guideAwa]; if (Math.abs(off) > GUIDE_DEAD_) s[SETTLE.guideAwa] += (off - Math.sign(off) * GUIDE_DEAD_) * Math.min(1, dt / LINE_GAP_);
    } else s[SETTLE.guideAwa] = Math.min(s[SETTLE.guideAwa], a + bl); }
  // (and the wind it's read for: the breeze she's sailing in, not each puff. Read again only once it's GUIDE_KT_ from where
  // it was read: up to her wind over a few seconds as it builds, down to her wind over 20 s as it falls. In 4-6 kt, a
  // breeze wandering across the guide's 5 kt step sent them to the outhaul and back, three times in a beat)
  { const kt = b.ww.kt;
    s[SETTLE.twsFast] = !b.crewReady ? kt : s[SETTLE.twsFast] + (kt - s[SETTLE.twsFast]) * Math.min(1, dt / GUIDE_FAST_);
    const slow = b.twsSlow ?? kt;
    if (!b.crewReady) s[SETTLE.guideKt] = kt;
    // (up when her few seconds' wind is a knot past it, or past it and well over her 20 s wind: a build under way, read
    // right up to it, not a knot short; down when both her winds are a knot under it, or under it with her 20 s wind well
    // over her few seconds': a lull settled in. Each only past both, so a build doesn't flip it from one to the other
    // each step, the physics review: 2022 times in 38 s after a step to 12 kt)
    else { const hi = Math.max(slow, s[SETTLE.twsFast]);
      if (s[SETTLE.twsFast] > s[SETTLE.guideKt] + GUIDE_KT_ || (s[SETTLE.twsFast] > s[SETTLE.guideKt] && s[SETTLE.twsFast] - slow > GUIDE_KT_ / 2)) s[SETTLE.guideKt] = s[SETTLE.twsFast];
      else if (hi < s[SETTLE.guideKt] - GUIDE_KT_ || (hi < s[SETTLE.guideKt] && slow - s[SETTLE.twsFast] > GUIDE_KT_ / 2)) s[SETTLE.guideKt] = hi; } }
  // (swinging, her heading running away from where it was a few seconds ago, SWING_DEG past her heading over SWING_TAU:
  // a turn kept up at over about 3°/s, not a helm's correction; then they're on the sheets, and the cabin-top lines that
  // only gain a little wait till she's settled, SETTLE_S after (crewWork.ts): a crew resets them for the course she's on,
  // not the angles she passes through. A failed tack in a drifter falling off and round through a jibe swept her 14 to
  // 100° apparent, and her crew went up to set the vang for the reach and back to ease it for the beat)
  s[SETTLE.hSwing] = !b.crewReady ? b.h : n360_(s[SETTLE.hSwing] + wrap_(b.h - s[SETTLE.hSwing]) * Math.min(1, dt / SWING_TAU));
  const swung = Math.abs(wrap_(b.h - s[SETTLE.hSwing])) > SWING_DEG;
  s[SETTLE.left] = swung ? SETTLE_S : Math.max(0, s[SETTLE.left] - dt);
  s[SETTLE.since] = swung || !b.crewReady ? 0 : s[SETTLE.since] + dt;
  // (on a new course, her true wind angle NEW_COURSE (crewWork.ts) from where they last read the guide, either tack, as
  // the guide is read, and not turning this moment, the
  // guide's settings are read at her angle now, not past the backlash, which is for a course wandering, not a new one:
  // bearing away onto a reach, held 10° short, the vang went on in two trips. New: after a turn, once she's held it
  // NEW_HELD without a swing (her heading's own mean over 20 s took a minute to come to it after a 90° bear-away); after
  // a change too slow to be a swing, once her heading has come to its own mean over LINE_TAU, which a course wandering
  // either side of its mean doesn't do at its ends)
  s[SETTLE.hHeld] = !b.crewReady ? b.h : n360_(s[SETTLE.hHeld] + wrap_(b.h - s[SETTLE.hHeld]) * Math.min(1, dt / LINE_TAU_));
  const twa = Math.abs(b.twa ?? 0);
  if (!b.crewReady) { s[SETTLE.twaGuide] = twa; s[SETTLE.hGuide] = b.h; }
  else if (Math.abs(twa - s[SETTLE.twaGuide]) > NEW_COURSE_ && Math.abs(wrap_(b.h - s[SETTLE.hGuide])) > NEW_HEADING && Math.abs(wrap_(b.h - s[SETTLE.hSwing])) < 1
    && ((s[SETTLE.since] >= NEW_HELD && s[SETTLE.since] < LINE_GAP_) || Math.abs(wrap_(b.h - s[SETTLE.hHeld])) < HELD_DEG)) { s[SETTLE.twaGuide] = twa; s[SETTLE.hGuide] = b.h; s[SETTLE.guideAwa] = Math.abs(b.awaSlow); }
  // (and back on the course it was read for after a swing, held NEW_HELD: read at her angle now, as it was held through
  // the swing, above)
  else if (s[SETTLE.since] >= NEW_HELD && s[SETTLE.since] - dt < NEW_HELD && Math.abs(twa - s[SETTLE.twaGuide]) <= NEW_COURSE_) s[SETTLE.guideAwa] = Math.abs(b.awaSlow);
}

/**
 * Work the sheets and every other control. The crew trims each sail toward its best sheet angle at a human
 * pace, reacting to the apparent wind with a short lag (so a quick luff or bear-away shows on the telltales
 * before they catch up), and sets the other controls for the conditions; or you do it yourself. The jib sheet
 * comes in on a winch, slower as the breeze builds. Then work out each sail's angle of attack and shape.
 */
type Ctl = Exclude<keyof Controls, 'car'>;
// (the lines the crew works, as constants: trimSails runs every step for every boat)
const CREW_LINES = ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard'] as const, FIXABLE_LINES = ['traveller', 'vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard'] as const;
function trimSails(b: Boat, awa: number, plan: SailPlan, dt: number): void {
  if (!b.crewReady) b.awaSlow = awa; // (set up before she sails: for the wind she has)
  b.awaSlow += (awa - b.awaSlow) * Math.min(1, dt / CREW_LAG);
  const c = b.ctl, tws = b.ww.kt;
  // working a line takes that line, and only that line, off the crew
  if (b.isUser) for (const k of [...Object.keys(b.ctlCmd), ...Object.keys(b.ctlTarget ?? {})] as Ctl[]) if (b.ctlCmd[k] || b.ctlTarget?.[k] != null) takeLine(b, k);
  // hove to, the tiller lashed, the crew keep her so (keepsHove); the lashing let go, they let the windward sheet fly and
  // trim for sailing. (Lines you take yourself are yours as ever.)
  const keepHove = keepsHove(b);
  const held = (k: 'jibsheetW' | 'mainsheet') => byHand(b, k) || keepHove;
  // the crew work the lines they have one job at a time, each person at their own pace (crewWork.ts): `on` is filled in
  // below, once the crew's targets are known
  let on: Partial<Record<Ctl, { pace: number; to: number }>> = {};
  const move = (k: Ctl, to: number, rate = CONTROL_RATE[k]) => { const j = on[k], d = (j ? j.to : to) - c[k]; c[k] += Math.sign(d) * Math.min(Math.abs(d), rate * (j?.pace ?? 1) * dt); };
  const hand = (k: Ctl, rate = CONTROL_RATE[k]) => {
    const cmd = b.ctlCmd[k] ?? 0, tg = b.ctlTarget?.[k];
    // a halyard with its last inches not yet taken up (controls.ts HALYARD): a pull takes them up first, then tensions
    const tk = k === 'downhaul' ? 'mainTaut' : k === 'jibHalyard' ? 'jibTaut' : null, r = b.rig;
    if (tk && r && r[tk === 'mainTaut' ? 'main' : 'jib'] >= 1 && (r[tk] ?? 1) < 1 && (cmd > 0 || (cmd === 0 && tg != null && tg > c[k]))) { r[tk] = Math.min(1, (r[tk] ?? 0) + rate * dt / HALYARD.takeUp); return; }
    if (cmd === 0 && tg != null) { // dragged to a setting: work the line there at the usual pace
      const d = tg - c[k];
      if (Math.abs(d) < 0.003) { delete b.ctlTarget![k]; return; }
      c[k] += Math.sign(d) * Math.min(Math.abs(d), rate * dt); return;
    }
    if (cmd !== 0 && b.ctlTarget) delete b.ctlTarget[k];
    c[k] = clamp(c[k] + cmd * rate * dt, k === 'traveller' ? -1 : 0, 1);
  };
  // overpowered upwind: the crew works down the depowering steps (controls.ts depowerLimits) toward the fastest (a
  // half-minute or so end to end); starting out, from the wind
  const up = Math.abs(b.awaSlow) < 70, helmLoad = b.helmNeed ?? 0;
  b.depower ??= up ? clamp((tws - 14) / 10, 0, 1) : 0;
  if (!b.crewReady) { // (set up before she sails: at the fastest step for her crew in this wind)
    const cond = b.spec ? (b.cond ??= condition(b.spec)) : null, spec = b.crew?.spec ?? DEFAULT_CREW;
    b.depower = up ? herFastestStep(b, b.twa, tws, plan, displacement(spec) + (cond?.extraKg ?? 0)).d : 0;
  }
  // (hike first, then depower: the crew adds depowering only once they're out as far as they go, and takes it off
  // first whenever they've room to hike; you placing the crew, they work with where you've put them)
  const cs0 = b.crew, maxed = !cs0 || !!cs0.place?.across || !!cs0.allOut; // (out as far as they can go now, tired or not)
  // the step they work toward: the fastest for this crew in this wind (powerFactor), which a skilled crew follows closely
  // and a novice only once it's well off (the search weighs the rudder's drag already: North Sails' "until the rudder
  // feels light again"); past about 6° of helm they can't steer her, whatever it costs
  // (they add depowering only once they're hiking as far as they can: hike first; while they're getting out they hold
  // what they have)
  const goal = b.depowerBest ?? (up ? clamp((tws - 14) / 10, 0, 1) : 0), slack = 0.03 + 0.07 * (1 - crewSkill(b.crew));
  const over = !up ? -1 : (b.depower < goal - slack || helmLoad > 6) && maxed ? 1 : b.depower > goal + slack && helmLoad < 6 ? -1 : 0;
  b.depower = clamp(b.depower + over * dt / 30, 0, 1);
  // last of the steps, the traveller comes down to leeward: the boom eases out with it (up to about 7°)
  const easeBoom = crewEaseBoom(b);
  const wantMain = optimalSheet('main', b.awaSlow) + easeBoom, wantJib = optimalSheet('jib', b.awaSlow);
  // the crew works out its settings about once a second, for the conditions as they see them
  const cond = b.spec ? (b.cond ??= condition(b.spec)) : null; // the crew knows their sails and mast
  // (when a line changes hands the crew thinks again at once, starting from what it has set: its other lines stay put
  // unless the change calls for moving them)
  const mineNow = b.isUser ? linesByHand(b).join() : '';
  if (mineNow !== (b.crewFixed ?? '')) { b.crewFixed = mineNow; b.crewPlanT = 0; }
  crewSettle(b, dt);
  if (!b.crewPlan || !(b.crewPlanT! > 0)) {
    // the lines you hold stay where you have them, and the crew sets the rest around them (your sheets at their angles)
    const fixed: Partial<CrewSettings> & { mainsheet?: number } = {};
    if (b.isUser) {
      for (const k of FIXABLE_LINES) if (byHand(b, k)) fixed[k] = c[k];
      if (byHand(b, 'car')) { const lazy = c.car[b.tack]; fixed.carFore = lazy.fore; fixed.carIn = lazy.ins; }
    }
    if (b.isUser && held('mainsheet')) fixed.mainsheet = c.mainsheet;
    // with your mainsheet held, the boom is yours: the crew leave the car where it is, set for the wind (North Sails'
    // Folkboat guide sets it by the wind: 15-20 cm up below 6 kt, the middle to 14 kt, eased to leeward above), and don't
    // chase the boom angle they'd want against your sheet (Debrief's review: easing in a 15 kt puff had them haul the car
    // right up to windward; trimming, drop it to leeward: a crew does neither while the helm plays the main)
    // (held there, but inside the band for the wind and their depowering floor, controls.ts depowerLimits, which doesn't
    // depend on your sheet: the car still goes down as the breeze builds, up in a drifter, and from the start when you
    // trim the sheets from the off)
    if (fixed.mainsheet != null && !byHand(b, 'traveller')) { const L = depowerLimits(b.depower ?? 0, b.awaSlow, b.settle![SETTLE.guideKt], b.settle![SETTLE.guideAwa]); fixed.traveller = clamp(c.traveller, L.min.traveller ?? -1, L.max.traveller ?? 1); }
    // heaving to (the windward jib sheet yours, or the jib aback): your eased main is deliberate, the car stays put
    if ((b.hove || byHand(b, 'jibsheetW')) && !byHand(b, 'traveller')) fixed.traveller = c.traveller;
    const mAng = wantMain, jAng = b.isUser && byHand(b, 'jibsheet') ? clamp(jibAngle(c, b.tack), SAILS.jib.min, SAILS.jib.max) : wantJib;
    // (the lazy car is set for the course she holds, at the guide's angle (crewSettle), not for the jib's angle in the wind
    // of the last few seconds: read that way, on a beat in the Bay's gusty westerly the plan hunted across all five
    // athwartships holes every few seconds, the crew's wait for a change that had lasted ran on through the hunting, and the
    // bow hand went forward to move it for nothing, crewstation's 12 kt seed 2. Set up before she sails at the hole for the
    // wind she has; then moved in only when its lead is CAR_HOLES wider than her guide's angle wants, the jib held off its
    // angle, and only once she's held her course NEW_HELD (out of a tack the guide's angle lags 5-10° low as she gathers
    // way). Not out again for their own wish: off a lead inboard of its angle the jib still reaches it, the sheet eased, at
    // a degree of twist more at most, a few hundredths of a percent of her drive (the physics review), not a trip forward.
    // That's this model's truth, not a sailing one: on a real boat a lead left inboard as the breeze builds closes the
    // slot, backwinds the main and heels her, and crews take it out; none of that is priced here, only the twist. If the
    // slot is ever modeled, the move out comes back. With your own jib sheet, the hole for your sheet's angle, the same way)
    const yourJib = b.isUser && byHand(b, 'jibsheet');
    const carIdeal = carInFor_((yourJib ? jAng : optimalSheet_('jib', b.settle![SETTLE.guideAwa])) - 0.25);
    const carLz = c.car[b.tack].ins;
    const carIn = b.crewReady && (b.settle![SETTLE.since] < NEW_HELD || carLz - carIdeal < CAR_HOLES) ? carLz : carIdeal;
    if (fixed.carIn == null) fixed.carIn = carIn;
    b.crewPlan = crewSolve(tws, b.awaSlow, b.tack, mAng, jAng, b.crewPlan ?? undefined, mainRig(b), cond?.jib, b.aws / KT, b.depower, fixed, b.settle![SETTLE.guideAwa], b.settle![SETTLE.guideKt]); b.crewPlanT = 1;
    b.crewWorth = planWorth(c, b.crewPlan, tws, b.awaSlow, b.tack, mAng, jAng, mainRig(b), cond?.jib, b.aws / KT, b.depower, fixed.mainsheet, 0.001 + 0.003 * (1 - crewSkill(b.crew)), b.settle![SETTLE.guideAwa], b.settle![SETTLE.guideKt]);
    b.crewTogether = worthTogether(b.crewWorth); // (worked out with the worth, once a second: not looked up each step)
    b.crewGuide = guideOnly(b.crewWorth);
    // (the band's marks: where the crew would set your lines too; a second solve only while you hold any; nothing reads it)
    if (b.isUser) {
      // (the car's mark by the crew's own rule, above: not one hopping across the holes with each puff)
      const free = mineNow ? crewSolve(tws, b.awaSlow, b.tack, wantMain, wantJib, b.crewIdeal ?? undefined, mainRig(b), cond?.jib, b.aws / KT, b.depower, { carIn }, b.settle![SETTLE.guideAwa], b.settle![SETTLE.guideKt]) : b.crewPlan;
      b.crewIdeal = { ...free, mainsheet: mainsheetFor(wantMain, free.traveller), jibsheet: jibsheetFor(wantJib, c, b.tack) };
    }
  }
  b.crewPlanT = (b.crewPlanT ?? 0) - dt;
  const t = b.crewPlan;
  // what the crew would do with each line they have; then who gets to it, and when (crewWork.ts)
  const backing0 = held('jibsheetW') && jibClewFree(c, b.tack) < jibAngle(c, b.tack);
  const want: Partial<Record<Ctl, number>> = {};
  // (a line is moved only if it's worth the trip: a skilled crew sees smaller gains, ~0.1% of drive; a novice ~0.4%)
  const minGain = 0.001 + 0.003 * (1 - crewSkill(b.crew));
  // (the crew's lines and the traveller, in that order (CREW_LINES, then 'traveller'), written out by name: the same values put in the same order, but each line's
  // reads its own, where a loop over the names made every read look up a different one: about 1% of the step)
  // (and the small ones together when they add up to a trip's worth: controls.ts worthTogether)
  { const W = b.crewWorth, ready = !!b.crewReady, user = b.isUser, also = ready ? b.crewTogether : undefined;
    const pick = (w: number | undefined, k: string) => (w ?? 1) >= minGain || !ready || (also !== undefined && also.has(k));
    if (!user || !byHand(b, 'vang')) want.vang = pick(W?.vang, 'vang') ? t.vang : c.vang;
    if (!user || !byHand(b, 'outhaul')) want.outhaul = pick(W?.outhaul, 'outhaul') ? t.outhaul : c.outhaul;
    if (!user || !byHand(b, 'cunningham')) want.cunningham = pick(W?.cunningham, 'cunningham') ? t.cunningham : c.cunningham;
    if (!user || !byHand(b, 'downhaul')) want.downhaul = pick(W?.downhaul, 'downhaul') ? t.downhaul : c.downhaul;
    if (!user || !byHand(b, 'backstay')) want.backstay = pick(W?.backstay, 'backstay') ? t.backstay : c.backstay;
    if (!user || !byHand(b, 'jibCunningham')) want.jibCunningham = pick(W?.jibCunningham, 'jibCunningham') ? t.jibCunningham : c.jibCunningham;
    if (!user || !byHand(b, 'jibHalyard')) want.jibHalyard = pick(W?.jibHalyard, 'jibHalyard') ? t.jibHalyard : c.jibHalyard;
    if (!user || !byHand(b, 'traveller')) want.traveller = pick(W?.traveller, 'traveller') ? t.traveller : c.traveller; }
  if (!held('mainsheet')) want.mainsheet = mainsheetFor(wantMain, c.traveller);
  if (!held('jibsheetW')) want.jibsheetW = 1;
  if (!byHand(b, 'jibsheet')) want.jibsheet = backing0 ? 1 : jibsheetFor(wantJib, c, b.tack);
  // a sail not up at the top: its halyard at the piano is slack and idle, nobody works it (crewRig)
  if (b.rig && b.rig.main < 1) want.downhaul = c.downhaul;
  if (b.rig && b.rig.jib < 1) want.jibHalyard = c.jibHalyard;
  // the lazy (windward) jib car: the crew's plan for it (they move it only when it's worth it), or yours
  if (byHand(b, 'car')) b.carPlan = null; else if (!b.carPlan || b.carPlan.fore !== t.carFore || b.carPlan.ins !== t.carIn) b.carPlan = { fore: t.carFore, ins: t.carIn };
  // (the first time: she was set up before she sailed, so the crew's lines start where they want them)
  if (!b.crewReady) {
    b.crewReady = true;
    for (const k of Object.keys(want) as Ctl[]) if (k !== 'mainsheet' && k !== 'jibsheet' && k !== 'jibsheetW') c[k] = want[k]!; // (the sheets are trimmed to the wind as she goes)
    if (b.carPlan) { c.car.S = { ...b.carPlan }; c.car.P = { ...b.carPlan }; }
  }
  on = crewJobs(b, want, dt);
  for (const k of CREW_LINES) {
    if (byHand(b, k)) hand(k); else move(k, want[k]!);
  }
  // the main: traveller and mainsheet together, for the boom angle and the leech tension (whichever the crew has)
  // (the traveller: let go to leeward it runs; hauled to windward it's slower, and slower in a breeze: travellerRate)
  { const dir = byHand(b, 'traveller') ? (b.ctlCmd.traveller ?? (b.ctlTarget?.traveller != null ? b.ctlTarget.traveller - c.traveller : 0)) : (on.traveller ? on.traveller.to : want.traveller!) - c.traveller;
    const rate = travellerRate(dir > 0, tws);
    if (byHand(b, 'traveller')) hand('traveller', rate); else move('traveller', want.traveller!, rate); }
  if (held('mainsheet')) hand('mainsheet'); else move('mainsheet', mainsheetFor(wantMain, c.traveller), CONTROL_RATE.mainsheet * 1.5);
  // the jib sheets, one on each winch: hauling in on a winch is slow in a breeze, easing is quick
  const going = (k: 'jibsheet' | 'jibsheetW') => b.ctlCmd[k] ?? (b.ctlTarget?.[k] != null ? b.ctlTarget[k]! - c[k] : 0);
  // a windward sheet you've hauled and then eased right off again is the crew's lazy sheet once more
  if (b.hand?.jibsheetW) {
    if (c.jibsheetW < 0.9) b.wHauled = true;
    else if (b.wHauled && c.jibsheetW > 0.95 && !b.ctlCmd.jibsheetW && b.ctlTarget?.jibsheetW == null) { b.hand.jibsheetW = false; b.wHauled = false; }
  } else b.wHauled = false;
  const wMine = held('jibsheetW');
  // (until it comes tight a lazy sheet is just slack, taken in hand over hand in a second or two; only the last of it
  // needs the winch)
  const wSlack = jibClewFree(c, b.tack) > jibAngle(c, b.tack) + 3;
  if (wMine) hand('jibsheetW', wSlack ? SLACK_RATE : CONTROL_RATE.jibsheetW * winchFactor(tws, going('jibsheetW') < 0));
  else if ((b.jibHold ?? 0) > 0) { b.jibHold = b.jibHold! - dt; if (b.jibHold <= 0) b.jibHold = -1; } // (made fast through the tack, till they let it fly: jibLetGo)
  else if ((b.jibHold ?? 0) < 0) { move('jibsheetW', 1, SLACK_RATE); if (c.jibsheetW >= 0.95) b.jibHold = 0; } // (let fly off the winch: it runs)
  else move('jibsheetW', 1, CONTROL_RATE.jibsheetW * winchFactor(tws, false)); // the crew leaves the lazy sheet slack
  // you're holding the clew to windward with the windward sheet (backing the jib): the crew lets the leeward one fly
  const backing = wMine && jibClewFree(c, b.tack) < jibAngle(c, b.tack);
  if (byHand(b, 'jibsheet')) hand('jibsheet', CONTROL_RATE.jibsheet * winchFactor(tws, going('jibsheet') < 0));
  else if (backing) move('jibsheet', 1, CONTROL_RATE.jibsheet * winchFactor(tws, false));
  else { const je = jibsheetFor(wantJib, c, b.tack); move('jibsheet', je, CONTROL_RATE.jibsheet * winchFactor(tws, je < c.jibsheet)); }
  b.sheets.main = clamp(boomAngle(c), SAILS.main.min, SAILS.main.max);
  // the clew: to leeward on its sheet, or held to windward by the other one (backed)
  const clew = jibClew(c, b.tack);
  b.jibBacked = clamp(-clew / 5, 0, 1);
  b.sheets.jib = clew < 0 ? clew : clamp(clew, SAILS.jib.min, SAILS.jib.max);
  b.trim.main = sailTrim('main', awa, b.sheets.main);
  b.trim.jib = plan === 'jib' ? sailTrim('jib', awa, b.sheets.jib) : null; // poled out or down: the sheet isn't in play
  // the sheets against where they should be: the main against the crew's intended boom (eased down the traveller on the
  // last depowering steps on purpose: that's counted with the sails' power, powerFactor), the jib against its best
  b.trimDriveK = trimDrive(sailTrim('main', awa, clamp(b.sheets.main - easeBoom, SAILS.main.min, SAILS.main.max)), b.trim.jib);
  // shape
  const ms = mainShape(c, tws, mainRig(b), b.aws / KT), js = plan === 'jib' ? jibShape(c, tws, b.tack, cond?.jib, b.aws / KT, mainRig(b)?.tune) : null;
  const em = shapeEfficiency(ms, targetShape('main', tws, awa, b.depower)), ej = js ? shapeEfficiency(js, targetShape('jib', tws, awa, b.depower)) : 1;
  b.shape = { main: ms, jib: js, eff: js ? SAILS.main.share * em + SAILS.jib.share * ej : em };
}

/**
 * Ask for the lazy (windward) jib car one pin further: fore–aft (+1 aft) or athwartships (+1 outboard). The crew goes
 * forward and moves it (crewWork.ts): it takes a while, and their weight goes with them. Nobody can move the loaded one.
 */
export function moveLazyCar(b: Boat, fore: number, ins: number, side: Tack = b.tack): void {
  // (the windward car, or either with the jib down: crewWork.ts carFree; the caller checks)
  const car = b.ctl.car[side], asked = b.carCmd && (b.carCmd.side ?? b.tack) === side ? b.carCmd : null, from = asked ?? { fore: car.fore, ins: car.ins };
  b.carCmd = { fore: clamp(from.fore + fore, 0, CAR_FORE_PINS - 1), ins: clamp(from.ins + ins, 0, CAR_IN_PINS - 1), side };
}

/** Apparent wind: wind over the water minus the boat's motion through it. aws in m/s, arel signed (+ from starboard). */
export function apparent(from: number, windKt: number, h: number, v: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  // (sway: her sideways speed, m/s, + to starboard, when she's slipping hove to, and the rig's as she rolls. Heeled, the
  // masthead's windex and flags lean with the mast and see the wind across the boat shortened by cos(heel), as the sails
  // do: ORC eqs. 7.2–7.3)
  const vt = windKt * KT, rel = wrap(from - h) * D2R;
  const along = vt * Math.cos(rel) + v, across = vt * Math.sin(rel) * Math.cos(heelDeg * D2R) + sway;
  const arel = Math.atan2(across, along) / D2R;
  return { aws: hypot(along, across), arel, awa: Math.abs(arel) };
}

/**
 * The apparent wind the sails see (ORC VPP Documentation 2025, §7.1). The true wind is the 10 m wind (as the polar's
 * and the wind fields'); at the sails' centre of effort it's less, by the log profile over the water VT(z) =
 * VT(10 m)·ln(z/z0)/ln(10/z0) with z0 = 0.005 m (eq. 7.1): 4.3 m up, 89% of it. And heeled, the mast plane leans
 * away from the wind across the boat: only that component is reduced, by cos φ (eqs. 7.2–7.3). `heelDeg` signed, either way.
 */
/** The true wind at `z` m over the water as a share of the 10 m wind: the log profile, z0 = 0.005 m (eq. 7.1). */
export const gradientAt = (z: number) => Math.log(Math.max(z, 0.05) / 0.005) / Math.log(10 / 0.005);
const GRADIENT = gradientAt(CE_ABOVE_WL);
export function sailWind(from: number, windKt: number, h: number, v: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  return windAtZ(from, windKt, h, v, GRADIENT, sway, heelDeg);
}
/** The apparent wind where the true wind is `g` of the 10 m wind (sailWind's working, at any height). */
function windAtZ(from: number, windKt: number, h: number, v: number, g: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  const vt = windKt * KT * g, rel = wrap(from - h) * D2R, c = Math.cos(heelDeg * D2R);
  const along = vt * Math.cos(rel) + v, across = vt * Math.sin(rel) * c + sway; // (+: air coming from ahead / from starboard)
  const arel = Math.atan2(across, along) / D2R;
  return { aws: hypot(along, across), arel, awa: Math.abs(arel) };
}
/**
 * The wind she feels at `z` m above the water (the midair wind indicator, render/windLadder.ts):
 * - tw: the true wind there (the wind over the water, as instruments call true: kt, from the log profile);
 * - air: the apparent wind there as the air actually moves past her, level: true wind less her own motion (her speed
 *   and slip, and the rig's sway at that height: the roll moves the mast faster higher up). True minus her velocity is
 *   this, so the indicator's arrows close the wind triangle;
 * - aw: the apparent wind's speed and angle as the sim measures it for the sails (sailWind in her course's frame, the
 *   heeled mast's plane), so the label's angle is the one on the HUD and the windex.
 * `from`: the bearing each comes from (deg).
 */
export function windAtHeight(b: Boat, z: number): { tw: { kt: number; from: number }; air: { kt: number; from: number }; aw: { kt: number; awa: number } } {
  const ww = b.ww, g = gradientAt(z), fr = sailFrame(b), h = b.h + fr.rot, along = fr.along - (b.astern ?? 0) + rigSurge(b) * z / CE_ABOVE_WL, across = fr.across + rigSway(b) * z / CE_ABOVE_WL;
  const level = windAtZ(ww.from, ww.kt, h, along, g, across, 0), plane = windAtZ(ww.from, ww.kt, h, along, g, across, b.heel ?? 0);
  return { tw: { kt: ww.kt * g, from: ww.from }, air: { kt: level.aws / KT, from: n360(h + level.arel) }, aw: { kt: plane.aws / KT, awa: plane.awa } };
}

/** Her slip to leeward on the tack she's on (deg; her course is that much further off the wind than her heading). Just
 * round from a tack, still sliding toward the old leeward side, none. */
const leeSlip = (b: Boat) => b.v > 0.3 ? Math.max(0, Math.atan2(b.tack === 'S' ? -(b.sway ?? 0) : (b.sway ?? 0), b.v) / D2R) : 0;

/**
 * The frame the sails are trimmed and their forces read in: the wind across her course through the water, the frame the
 * sail model and its trim constants were calibrated in before she had leeway (a calibration choice: physics.ts step()).
 * It turns from her heading by the steady leeway she makes at speed (b.leeway); her slip beyond it (stalled, pinching,
 * slow, or the moment a puff heels her) is the wind drawing forward across her sails, and they luff; short of it (just
 * tacked, not yet sliding), the wind a little more abeam. Through a tack, as the slip changes sides, the frame turns over
 * at up to 10° a second (stepFrame) rather than at once. Her velocity through the water in that frame: along it
 * and across it (+ starboard).
 */
/** The frame's turn, worked toward her steady leeway on the side she's slipping, at up to 10° a second (sailFrame). */
function stepFrame(b: Boat, dt: number): void {
  const slip = b.v > 0.3 ? Math.atan2(b.sway ?? 0, b.v) / D2R : 0, want = Math.abs(slip) > 0.5 ? Math.sign(slip) * (b.leeway ?? 0) : 0;
  const r0 = b.sailRot ?? want; b.sailRot = r0 + clamp(want - r0, -10 * dt, 10 * dt);
}

export function sailFrame(b: Boat): { rot: number; along: number; across: number } {
  const sw = b.sway ?? 0, slip = b.v > 0.3 ? Math.atan2(sw, b.v) / D2R : 0, lw = b.leeway ?? 0;
  const rot = b.sailRot ?? (Math.abs(slip) > 0.5 ? Math.sign(slip) * lw : 0), r = rot * D2R;
  return { rot, along: b.v * Math.cos(r) + sw * Math.sin(r), across: -b.v * Math.sin(r) + sw * Math.cos(r) };
}

/** Heading a user tack/gybe aims for: the matching course on the other side of the wind. */
export function tackTarget(b: Boat): { dir: number; target: number } {
  const rel = b.rel, twa = b.twa, from = b.ww.from;
  // upwind: tack to the same angle on the other side, but at least close-hauled; downwind: gybe to the mirror angle
  // (the beat angle is her course's: her heading is above it by her leeway)
  if (twa < 100) return { dir: rel >= 0 ? 1 : -1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.max(beatFor(b) - (b.leeway ?? 0), Math.min(twa, 60))) };
  // (by the lee, her main still on the side the wind now comes over: the jibe is the main's to make, not hers to turn
  // for. Her heading's held and her crew hand it across; turning to the "mirror" would take her back onto the tack
  // she's on and then jibe her twice)
  if ((b.rig?.mainUp ?? true) && (rel >= 0 ? 'S' : 'P') !== b.tack) return { dir: rel >= 0 ? 1 : -1, target: b.h };
  // (and far enough past dead astern for the wind to be over her main's own side when she gets there: from a dead run
  // the mirror is where she already is)
  return { dir: rel >= 0 ? -1 : 1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.min(twa, 172)) };
}

/**
 * A boat as she's placed on the water, before the first step: on the tack the wind gives her heading, with her crew's
 * sheets already trimmed for the wind there, as a crew sailing about before a start would have them (not sheeted hard
 * in on a broad reach, easing out as the sequence begins). `from`/`windKt`: the wind on the water where she is (the
 * World passes her own, current and puffs included, as the first step will). The sheets are trimmed to the wind the
 * sails see (sailWind: the gradient at their height), the windex shows the masthead's (apparent); the jib sits where
 * its sheet and car put the clew (jibClew), as trimSails has it. The traveller, the crew's depowering ease and the
 * other lines come on the first step, from the crew's plan: a few degrees at most, eased in by the boom's own lag.
 * (Tests that put a boat somewhere new call it too: she arrives trimmed and upright for her new heading.)
 */
export function settleTrim(b: Boat, from: number, windKt: number): void {
  b.boomFree = undefined; b.boomFrom = undefined; b.boomFreeT = undefined; b.boomSeenT = undefined; b.gybeTo = undefined; // (set down somewhere new: her boom where her sheet puts it)
  const rel = wrap(from - b.h), ap = apparent(from, windKt, b.h, b.v), sw = sailWind(from, windKt, b.h, b.v), c = b.ctl;
  b.rel = rel; b.twa = Math.abs(rel); b.tack = rel >= 0 ? 'S' : 'P';
  b.arel = ap.arel; b.awa = ap.awa; b.aws = ap.aws; b.awaSlow = sw.awa;
  const side = b.tack === 'S' ? -1 : 1;
  c.mainsheet = mainsheetFor(optimalSheet('main', sw.awa), c.traveller); c.jibsheet = jibsheetFor(optimalSheet('jib', sw.awa), c, b.tack);
  b.sheets.main = clamp(boomAngle(c), SAILS.main.min, SAILS.main.max);
  const clew = jibClew(c, b.tack); b.sheets.jib = clew < 0 ? clew : clamp(clew, SAILS.jib.min, SAILS.jib.max);
  b.boom = side * b.sheets.main; b.jib = side * b.sheets.jib;
  // upright and steady as she's put there: no heel, roll or helm carried over from where she was before (a boat moved
  // onto the other tack must not keep heeling the old way, with the helm that went with it)
  b.heel = 0; b.heelRate = 0; b.heelMag = 0; b.heelEqLast = 0; b.helmNeed = 0; b.sway = 0;
  // and her crew sitting to windward for this tack (World makes them on starboard: a port-tack boat's crew would
  // otherwise cross the boat in the first seconds; a place you've given them stays)
  if (b.crew && b.crew.side !== b.tack) { const place = b.crew.place; b.crew = newCrew(b.crew.spec, b.tack); if (place) b.crew.place = place; }
}
