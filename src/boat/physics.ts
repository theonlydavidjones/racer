import { hitsHarbor } from '../geo/marina';
import { KT, V, clamp, wrap, n360, D2R } from '../core/math';
import { onLand } from '../geo/shore';
import type { Emit } from '../sim/events';
import { bow, stern, type Boat, type LineKey } from './boat';
import { HANDLING, HULL, airDrag, flogAmount, hullResistance, luffDriveFactor, maxTurnRate, surgeAccel } from './dynamics';
import { NO_GO, beatAngle, jibEfficiency, polar, type SailPlan } from './polar';
import orc from './data/nordic-folkboat-orc.json';
const SAIL_AREA = { main: orc.boat.mainArea, jib: orc.boat.jibArea };
import { beatFor, seaDrag, waveYaw } from './seaway';
import { CE_ABOVE_WL, CE_HEIGHT, FULL_RUDDER, LEVER, RUDDER, clothFill, heelFactor, heelWithCrew, heelingMoment, helmNeeded, hullRighting, netDrive, rollStep, rudderDrag, sailForces, sailYaw } from './balance';
import { DEFAULT_CREW, STANDARD_DISP, crewBestHeel, crewMass, crewMoment, crewSkill, hikingMoment, sittingMoment, standardCrewMoment, displacement, displacementFactor, newCrew, placeCrew, skillOf, type CrewState } from './crewPhys';
import { bodyJob, crewJobs } from './crewWork';
import { clrShift, heelWettedFactor, trimSpeedFactor } from './hullTrim';
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { condition, foulingDrag } from './condition';
import { CAR_FORE_PINS, CAR_IN_PINS, CONTROL_RATE, boomAngle, crewShapes, crewSolve, jibAngle, planWorth, jibClew, jibShape, jibsheetFor, mainShape, mainsheetFor, shapeEfficiency, targetShape, winchFactor, type Controls, type CrewSettings, type Shape } from './controls';

/** Turn rate during penalty turns, deg/s: the crew backs the jib and main to spin her round. */
export const PENALTY_TURN_RATE = 10;
/** Below this speed (m/s, ~2.5 kt) the AI won't try to tack: she'd stall head to wind. */
export const SLOW_TACK = 1.3;

/** The crew's reaction time to a change in apparent wind angle, s. */
export const CREW_LAG = 0.8;

/** Slowing while she goes astern: dv/dt = −(c0 + c1·v), m/s². */
export const ASTERN_DRAG = { c0: 0.005, c1: 0.035 };
/** How far she coasts astern from `v0` m/s (to a stop) with that drag, m. */
export const asternCoast = (v0: number) => (v0 - (ASTERN_DRAG.c0 / ASTERN_DRAG.c1) * Math.log(1 + ASTERN_DRAG.c1 * v0 / ASTERN_DRAG.c0)) / ASTERN_DRAG.c1;

/** Crew timings for the whisker pole, s. */
export const POLE = { set: 8, stow: 5, gybe: 8 };

/** How the jib is working right now, from the pole state. */
export function sailPlan(b: Boat): SailPlan {
  if (b.pole === 'set') return b.poleTack === b.tack ? 'wing' : 'main';
  if (b.pole === 'down') return 'jib';
  return 'main'; // crew busy with the pole: jib not drawing
}

/**
 * Hoisting and striking (dropping) the sails, at a crew's pace: the main takes about half a minute to hoist and the
 * jib about 15 s; short-handed, longer. The main goes up easily head to wind; off the wind it fills, presses on the
 * spreaders and shrouds and the slides bind, so it goes up far more slowly.
 */
export const HOIST = { main: 30, jib: 15, strikeMain: 15, strikeJib: 10 };
export function crewRig(b: Boat, dt: number, emit: Emit): void {
  const r = b.rig; if (!r) return;
  const say = (msg: string) => { if (b.isUser) emit({ type: 'toast', msg, ms: 3500 }); };
  // (the forward hand on the halyards at the mast, or whoever there is: at their pace)
  const busy = !!r && ((r.mainUp && r.main < 1) || (!r.mainUp && r.main > 0) || (r.jibUp && r.jib < 1) || (!r.jibUp && r.jib > 0));
  const hands = bodyJob(b, 'hoist', busy);
  const twa = Math.abs(wrap(b.ww.from - b.h)), offWind = twa <= 45 ? 1 : twa >= 120 ? 0.3 : 1 - 0.7 * (twa - 45) / 75;
  const step = (k: 'main' | 'jib') => {
    const up = k === 'main' ? r.mainUp : r.jibUp, was = r[k];
    if (up && was < 1) {
      r[k] = Math.min(1, was + dt * hands * (k === 'main' ? offWind : 1) / HOIST[k]);
      if (k === 'main' && was === 0 && offWind < 0.7) say('Hoisting the main off the wind: it fills and catches on the spreaders. It goes up much more easily head to wind.');
      if (r[k] === 1) say(k === 'main' ? 'Main up.' : 'Jib up.');
    } else if (!up && was > 0) {
      r[k] = Math.max(0, was - dt * hands / (k === 'main' ? HOIST.strikeMain : HOIST.strikeJib));
      if (r[k] === 0) say(k === 'main' ? 'Main down and flaked on the boom.' : 'Jib down and bagged on the foredeck.');
    }
  };
  step('main'); step('jib');
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
    say('Gybing the pole end-for-end. The jib is down for a few seconds.');
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
 * is settled once she has turned 30° one way; nothing counts while she sails clear first. */
function countPenalty(b: Boat, dh: number, emit: Emit): void {
  if (!(b.penalty > 0)) return;
  if (!b.ai?.clearing) b.penaltyTurned += dh;
  if (!b.penaltyDir && Math.abs(b.penaltyTurned) > 30) b.penaltyDir = Math.sign(b.penaltyTurned);
  if (b.penaltyDir) b.penalty = Math.max(0, b.penaltyTotal - Math.max(0, b.penaltyTurned * b.penaltyDir));
  if (b.penalty <= 0) { b.penalty = 0; if (b.isUser) emit({ type: 'toast', msg: 'Penalty turns done. Back to racing.' }); }
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
  const canHeave = b.isUser && !b.docked && !b.pushing && !(b.astern ?? 0) && sailPlan(b) === 'jib' && (b.rig?.jib ?? 1) > 0.5;
  b.hove = canHeave && ((b.jibBacked ?? 0) > 0.2 || (!!b.hove && (b.jibBacked ?? 0) > 0));
  if (b.hove) { heaveTo(b, dt, t, emit, groundToast); return; }
  const ww = b.ww;
  // turn rate falls off at low speed: a Folkboat needs water flowing over the rudder
  const maxRate = maxTurnRate(b.v);
  // helm balance: with weather helm she turns toward the wind unless the rudder holds her (balance.ts)
  const toWind = wrap(ww.from - b.h) >= 0 ? 1 : -1, balRate = clamp((b.helmNeed ?? 0) / FULL_RUDDER, -0.4, 0.4) * maxRate * toWind;
  let rate: number, rudder: number; // rudder: fraction of full, in the turn-rate sense (+ turns to starboard)
  if (b.isUser) {
    if (b.turnTarget != null && b.steer === 0) {
      const err = wrap(b.turnTarget - b.h);
      rate = b.turnDir * maxRate;
      if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) { rate = 0; b.h = b.turnTarget; b.turnTarget = null; }
    } else {
      // tiller to starboard turns the bow to port; keys add a push of their own
      const helm = clamp(b.steer - b.tiller, -1, 1);
      rate = helm * maxRate; if (helm !== 0) b.turnTarget = null;
      // going astern the rudder works backwards, and less well: the bow goes the way you push the tiller (with way on
      // both ways at once, by which way the water mostly flows past the rudder)
      if (b.astern) { const fwd = b.v / (b.v + b.astern); rate = helm * (maxRate * fwd - maxTurnRate(b.astern) * 0.7 * (1 - fwd)); }
    }
    rudder = rate / Math.max(1e-6, maxRate);
    if (b.turnTarget == null) rate += balRate; // let go of the tiller and she rounds up (or bears away)
  } else if (b.penalty > 0 && !b.ai?.clearing) {
    // penalty turns: the crew backs the sails to spin the boat even when slow
    rate = Math.max(maxRate, PENALTY_TURN_RATE); rudder = 1;
  } else {
    let err = wrap(b.desired - b.h);
    const ai = b.ai;
    // a commitment ends when the turn is nearly done or she wants to go somewhere else
    if (ai && ai.turnCommit !== 0 && (Math.abs(err) < 15 || Math.abs(wrap(b.desired - ai.commitFor)) > 45)) ai.turnCommit = 0;
    if (ai && ai.turnCommit === 0 && Math.abs(err) > 30) {
      // Starting a big turn: choose once which way to go, and finish it (no bailing out halfway through a
      // tack). Too slow to tack? Going through the wind would leave her stuck in irons, so gybe instead.
      const toWind = wrap(b.ww.from - b.h);
      const throughWind = Math.sign(toWind) === Math.sign(err) && Math.abs(toWind) < Math.abs(err);
      ai.turnCommit = throughWind && b.v < SLOW_TACK ? -Math.sign(err) : Math.sign(err);
      ai.commitFor = b.desired;
    }
    if (ai && ai.turnCommit !== 0 && Math.sign(err) !== ai.turnCommit) {
      const long = err + ai.turnCommit * 360;
      if (Math.abs(long) > 330) ai.turnCommit = 0; else err = long; // target moved: drop the commitment
    }
    rate = clamp(err * 1.6, -maxRate, maxRate);
    rudder = (rate - balRate) / Math.max(1e-6, maxRate); // the AI holds whatever helm the boat needs
  }
  b.helm = clamp(rudder, -1, 1); // how hard the helm is over (for drawing the rudder and tiller)
  b.weatherHeld = -toWind * b.helm * FULL_RUDDER; // deg of weather helm actually held on the rudder
  if (b.v > 0.2) rate += waveYaw(b.sea, b.h, b.v, t, b.id + 1); // the sea knocks her bow about
  const dh = rate * dt;
  b.h = n360(b.h + dh); b.yawRate = rate;
  countPenalty(b, dh, emit);
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel);
  b.rel = rel; b.twa = twa;
  let tk: 'S' | 'P' = rel >= 0 ? 'S' : 'P';
  if (twa > 176) tk = b.tack; // dead downwind: keep the tack you had until the boom crosses
  if (tk !== b.tack) { if (twa < 90) b.tacking = true; b.tack = tk; b.lastTackT = t; if (b.isUser) jibSheetsAtTack(b, emit); }
  if (b.tacking && twa >= Math.min(40, beatAngle(ww.kt) - 3)) b.tacking = false; // close-hauled: Rule 13 ends
  crewRig(b, dt, emit);
  crewPole(b, dt, emit);
  const plan = sailPlan(b);
  // the rig rolling: the sails move through the air sideways at the roll rate times their height (rolling to windward,
  // as a crew flattens her, gives them more wind; heeling to leeward takes some away, which damps the roll)
  // the wind the sails see: at their height, in the plane of the heeled mast (sailWind), as the crew trims to it
  const ap = sailWind(ww.from, ww.kt, b.h, b.v, rigSway(b), b.heel ?? 0);
  trimSails(b, ap.awa, plan, dt);
  // heel and helm balance from the forces on the sails (balance.ts)
  const jibOn = plan === 'jib' && b.trim.jib && b.shape.jib ? { trim: b.trim.jib, shape: b.shape.jib } : null;
  const sf = sailForces(ap.aws, ap.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, jibOn, b.luff);
  const cond = b.spec ? (b.cond ??= condition(b.spec)) : null; // your boat's condition: bottom, sails' age, spars, weight
  // an old sail's extra profile drag (hooked leech) and lost lift: the drive it costs, against the same shape in sound cloth
  let wornDrive = 1;
  if (cond && (b.shape.main.cd0 || b.shape.main.clMul || b.shape.jib?.cd0 || b.shape.jib?.clMul)) {
    const sound = (sh: Shape): Shape => ({ depth: sh.depth, draft: sh.draft, twist: sh.twist, ceAft: sh.ceAft });
    const s0 = sailForces(ap.aws, ap.awa, { trim: b.trim.main, shape: sound(b.shape.main), out: b.sheets.main }, jibOn ? { trim: jibOn.trim, shape: sound(jibOn.shape) } : null, b.luff);
    const d0 = s0.main.drive + s0.jib.drive, d1 = sf.main.drive + sf.jib.drive;
    if (d0 > 5) wornDrive = clamp(d1 / d0, 0.6, 1.05);
  }
  // how much of each sail is up: its force goes with its hoisted area (after the wear is worked out, sail for sail, so
  // a part-hoisted sail isn't counted as worn: the hoist has its own speed term below)
  const hm = b.rig?.main ?? 1, hj = b.rig?.jib ?? 1;
  if (hm < 1 || hj < 1) { sf.main.heel *= hm; sf.main.drive *= hm; sf.jib.heel *= hj; sf.jib.drive *= hj; }
  // the crew: where they'd put their weight to hold her at the heel they want (a little heel in light air, about 16°
  // upwind, flat downwind), then where they actually are (they move at a human pace, and go where their jobs are)
  const cs = b.crew ??= newCrew(DEFAULT_CREW, b.tack), disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = sf.main.heel + sf.jib.heel;
  const rmExtra = (h: number) => cond ? cond.rightingDelta(h) : 0; // weight aloft (a wooden rig) or high aft (the outboard on its bracket)
  const heelT = crewAndHeel(b, cs, F, sf.ceh, disp, rmExtra, twa, ww.kt, rel, cond?.extraMoment ?? 0, dt) * (twa > 120 ? 0.6 : 1); // off the wind she rolls less
  rollTo(b, heelT, rel, disp, dt);
  b.helmNeed = helmNeeded(sf, b.heelMag!, b.sheets.main, b.v, sf.ceh, clrShift(cs.trim));
  b.forces = { heel: sf.main.heel + sf.jib.heel, drive: sf.main.drive + sf.jib.drive };
  // heel past her best; the weight aboard (displacement) and where it sits fore and aft (the trim's resistance); in a
  // drifter, the sails' own weight (heeled to leeward, gravity helps hold them in shape)
  const vPolar = polar(ww.kt, twa, plan);
  let target = vPolar * heelFactor(b.heelMag!) * displacementFactor(disp, ww.kt) * trimSpeedFactor(vPolar, cs.trim, b.seaShare ?? 0) * heelWettedFactor(vPolar, b.heelMag!, crewBestHeel(twa, ww.kt)) * Math.sqrt(clothFill(ap.aws, b.heelMag!));
  if (b.luff) target *= luffDriveFactor(twa);
  // Drive scales with trim efficiency; speed with roughly the square root of drive.
  else target *= Math.sqrt((b.trimDriveK ?? trimDrive(b.trim.main, b.trim.jib)) * b.shape.eff * wornDrive) * powerFactor(b, jibOn, twa, ww, disp, dt, plan); // sheet angles, the sails' shape, worn cloth; flattened more (or less) than the polar's crew needs
  if (hm < 1 || hj < 1) {
    // part of the sail plan up: speed with roughly the square root of the drive, which goes with the area hoisted
    const je = jibEfficiency(plan, twa), full = SAIL_AREA.main + SAIL_AREA.jib * je, up = SAIL_AREA.main * hm + SAIL_AREA.jib * je * hj;
    target *= full > 0 ? Math.sqrt(up / full) : 0;
    // under bare poles she still drifts off downwind on the windage of her hull and rig (about a tenth of the wind)
    target = Math.max(target, 0.1 * ww.kt * KT * Math.max(0, Math.min(1, (twa - 90) / 60)));
  }
  if (b.penalty > 0) target *= 0.7;
  const beat = beatAngle(ww.kt);
  // holding a lot of helm to keep her straight is a brake (the steady helm the sails demand; turning has its own cost)
  const helmDrag = Math.abs(rate) < 4 ? rudderDrag(clamp(b.helmNeed ?? 0, -12, 12), b.v) : 0;
  // the rig sweeping through the air as she rolls (a roll tack's flatten, a crew throwing their weight out): the extra
  // wind across the sails is extra push while it lasts, from the same sail forces (quasi-steady; the unsteady flow
  // measured on dinghies (Schutt & Williamson, Cornell) only adds to it), scaled to the hull as the force model scales
  // the sails' push (driveCalibration). Kogure et al. (Japan J. Coaching Studies 27(1), 2013) measured a Laser
  // Radial's roll tacks 5.3% faster than flat ones through the tack in 2–4 m/s, 2.8% in 4–6 m/s.
  let sweep = 0;
  const sway = rigSway(b);
  if (Math.abs(sway) > 0.02 && !b.luff) {
    const ap0 = sailWind(ww.from, ww.kt, b.h, b.v, 0, b.heel ?? 0);
    const sf0 = sailForces(ap0.aws, ap0.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, jibOn, b.luff);
    // (each sail as much as is hoisted, as sf is; both already carry the worn cloth through the shape, so no wornDrive here)
    sweep = (sf.main.drive + sf.jib.drive - hm * sf0.main.drive - hj * sf0.jib.drive) * driveCalibration(ww.kt, twa);
  }
  const a = surgeAccel(b.v, target, airDrag(ap.aws, ap.awa, flogAmount(twa, beat, NO_GO, b.luff)) + seaDrag(b.sea, b.h, b.v) + helmDrag + (cond ? foulingDrag(cond, b.v) : 0) - sweep, disp);
  b.v = Math.max(0, b.v + a * dt);
  // turning bleeds speed through the rudder's drag: for the rudder angle the turn needs, less what the sails' own turning
  // moment does for it (her helm: heeled to leeward she carries weather helm and comes up toward the wind by herself,
  // which is how a roll tack starts her turning with less rudder), so the same turn costs less or more by her balance
  let bleed = 1;
  if (Math.abs(rate) > 0.5) {
    const toWind = rate * Math.sign(wrap(ww.from - b.h) || 1), turn = FULL_RUDDER * toWind / Math.max(1, maxTurnRate(b.v));
    bleed = clamp(Math.abs(turn - clamp(b.helmNeed ?? 0, -12, 12)) / Math.max(2, Math.abs(turn)), 0.3, 2);
  }
  b.v = Math.max(0, b.v * (1 - HANDLING.turnDrag * bleed * Math.abs(rate) * D2R * dt));
  // not hove to: any sideways slip dies away as the keel bites again (a second or two)
  if (b.sway) { b.sway *= Math.exp(-dt / 1.5); if (Math.abs(b.sway) < 0.005) b.sway = 0; }
  travel(b, dt, t, emit, groundToast);
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
  /** Sway and yaw: added mass of water as a fraction of the boat's (a deep keel side-on drags a lot with it: ~0.9; in yaw ~0.4, estimates). */
  swayAdded: 0.9, yawAdded: 0.4,
  /** Radius of gyration in yaw, as a fraction of LOA (0.25, the usual figure for a yacht). */
  gyration: 0.25,
  /** Side-on windage of hull, cabin and rig (CdA, m²; freeboard about 0.65 m over 7.6 m, the cabin and mast) and how far ahead of the keel's centre it acts (the mast is forward), m. */
  windSide: 5.5, windLever: 0.3,
  /** How much of the sideways flow reaches the rudder: the long keel ahead of it straightens half of it (estimate). */
  rudderFlow: 0.5,
  /** Backed sail: normal-force coefficient at 90° (Hoerner: 1.17 for a flat plate, more for a cupped sail). */
  cnBacked: 1.2
};

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
  const ww = b.ww, toWind = wrap(ww.from - b.h) >= 0 ? 1 : -1, D = D2R;
  const RHO = 1025, RHO_A = 1.225;
  // the helm: lashed, or wherever you hold it, or hard over through a tack or gybe you've called for (+ turns her to starboard)
  let helm = clamp(b.steer - b.tiller, -1, 1);
  if (b.turnTarget != null && b.steer === 0) {
    const err = wrap(b.turnTarget - b.h);
    if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) b.turnTarget = null; else helm = b.turnDir;
  }
  b.helm = helm;
  const deltaTw = helm * toWind * FULL_RUDDER * D; // rudder angle, rad, + turning her toward the wind
  // tack and sails, as when sailing
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel); b.rel = rel; b.twa = twa;
  let tk: 'S' | 'P' = rel >= 0 ? 'S' : 'P'; if (twa > 176) tk = b.tack;
  if (tk !== b.tack) { if (twa < 90) b.tacking = true; b.tack = tk; b.lastTackT = t; jibSheetsAtTack(b, emit); }
  if (b.tacking && twa >= Math.min(40, beatAngle(ww.kt) - 3)) b.tacking = false;
  crewRig(b, dt, emit); crewPole(b, dt, emit);
  // sway and yaw are kept in the boat's frame (+ starboard); here they're worked toward the wind and to leeward
  const u0 = b.v, d0 = -toWind * (b.sway ?? 0), r0 = toWind * (b.yawRate ?? 0) * D;
  const ap = sailWind(ww.from, ww.kt, b.h, u0, (b.sway ?? 0) + rigSway(b), b.heel ?? 0);
  trimSails(b, ap.awa, 'jib', dt);
  const q = 0.5 * RHO_A * ap.aws * ap.aws, awaR = ap.awa * D;
  const hm = b.rig?.main ?? 1, hj = b.rig?.jib ?? 1;
  // the main, as in balance.ts
  const smAll = sailForces(ap.aws, ap.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, null, b.luff), sm = smAll.main;
  // (a flogging main's mean force lies along the apparent wind, so its push across the boat dies away as the wind comes
  // ahead: nothing holds her head to wind)
  const across = Math.min(1, Math.sin(awaR) / Math.sin(25 * D));
  const main = { heel: sm.heel * hm * across, drive: sm.drive * hm * driveShare(ww.kt, twa, u0), ceAft: sm.ceAft };
  // the backed jib: a stalled plate, its force square to the chord (clew `sheets.jib` deg to windward)
  const clew = b.sheets.jib * D, alpha = awaR - clew; // angle of the wind to the backed sail's chord
  const fn = q * SAIL_AREA.jib * hj * HOVE.cnBacked * Math.max(0, Math.sin(Math.min(Math.PI, Math.max(0, alpha))));
  // (clew to windward, negative: it pushes aft too) A stalled plate's centre of pressure moves from near the quarter
  // chord toward mid chord as the angle grows (Hoerner, Fluid-Dynamic Lift, ch. 3), so it pushes about a quarter-chord
  // further aft than a drawing jib's does: `ceAft` shortens its lever ahead of the keel by that (balance.ts sailYaw).
  const jib = { heel: fn * Math.cos(clew), drive: fn * Math.sin(clew), ceAft: 0.25 * Math.sin(clamp(alpha, 0, Math.PI / 2)) };
  // windage: along the apparent wind's flow (aft and to leeward)
  const windX = -q * HANDLING.windageCdA * Math.cos(awaR), windY = q * HOVE.windSide * Math.sin(awaR) * Math.abs(Math.sin(awaR));
  // hull and keel: strips along the waterline, each with lift (with way on) and broadside drag
  const L = orc.boat.imsL, A = HOVE.latArea, AR = HOVE.aspect, aL = Math.PI * AR / 2, N = 8;
  let hullY = 0, hullM = 0;
  for (let i = 0; i < N; i++) {
    const x = -L / 2 + (i + 0.5) * L / N, vy = d0 - r0 * x; // sideways water speed at the strip (+: she's moving to leeward there)
    const f = -0.5 * RHO * (A / N) * (aL * Math.max(0, u0) * vy + HOVE.crossCd * vy * Math.abs(vy));
    hullY += f; hullM -= f * x; // a push to windward ahead of the centre turns her toward the wind
  }
  const lift = -0.5 * RHO * A * aL * Math.max(0, u0) * d0; // the keel's lift alone, for its induced drag
  const leeway = Math.atan2(Math.abs(d0), Math.max(0.05, u0));
  const inducedX = -0.5 * Math.abs(lift) * leeway;
  // the rudder, behind the keel
  const vyR = HOVE.rudderFlow * (d0 + r0 * RUDDER.arm), vR2 = u0 * u0 + vyR * vyR;
  const aoaR = deltaTw - Math.atan2(vyR, Math.max(0.01, u0));
  const clR = clamp(RUDDER.slope * aoaR, -1.05, 1.05);
  const rudY = 0.5 * RHO * vR2 * RUDDER.area * clR, rudX = -0.5 * RHO * vR2 * RUDDER.area * (0.02 + clR * clR / (Math.PI * RUDDER.aspect));
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
  const X = main.drive + jib.drive + windX - hullResistance(Math.max(0, u0)) + inducedX + rudX - seaDrag(b.sea, b.h, u0) - (cond ? foulingDrag(cond, u0) : 0);
  const Y = main.heel + jib.heel + windY + hullY + rudY;
  const M = sailYaw(sails, b.heelMag!, b.sheets.main, smAll.ceh) - windY * HOVE.windLever + hullM + rudY * RUDDER.arm + F * clrShift(cs.trim);
  const mx = HANDLING.mass * disp / HULL.displacement, my = disp * (1 + HOVE.swayAdded), I = disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
  b.v = Math.max(0, u0 + X / mx * dt);
  b.sway = -toWind * (d0 + Y / my * dt);
  b.yawRate = toWind * (r0 + M / I * dt) / D;
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
  const n = cs.spec.crew.length, skill = n ? cs.spec.crew.reduce((a, p) => a + skillOf(p), 0) / n : skillOf(cs.spec.helm);
  const bh = bestHeel ?? crewBestHeel(twa, tws, skill);
  const need = heelingMoment(F, ceh, bh) - hullRighting(bh, disp, crewMass(cs.spec)) - rmExtra(bh);
  // (the windward side by her tack, which holds through a moment by the lee until the boom crosses)
  // (a tack coming: turning up toward the wind with a good way still to go, close-hauled; yours or the AI's)
  const aim = b.turnTarget ?? (b.isUser ? null : b.desired), dAim = aim == null ? 0 : wrap(aim - b.h);
  const tackComing = aim != null && twa < 60 && Math.abs(dAim) > 40 && Math.sign(dAim) === Math.sign(wrap(b.ww.from - b.h));
  placeCrew(cs, { need, twa, tws, v: b.v, pole: b.pole === 'set', tack: b.tack, windward: b.tack === 'S' ? 1 : -1, beat: beatAngle(tws), extraMoment, sea: seaNow(b, dt), heel: b.heelMag, tackComing }, dt);
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
 * - the keel's induced drag, growing with the square of the side force and as she heels (ORC eq. 6.37:
 *   DI = FH² / (π·½ρV²·Te²)). The effective draft is the sim's own keel model's (slender-wing lift, Newman §5.12, the
 *   water's surface mirroring the keel: Te² = 2·T²), its depth shortened by cos(heel); ORC works it from the hull's
 *   offsets (MHSD), which aren't published for the Folkboat;
 * - the rudder held over against her weather helm (balance.ts rudderDrag): North Sails' Nordic Folkboat guide eases the
 *   traveller in a breeze "to decrease heel and thus rudder pressure", and pulls the backstay "until the rudder feels
 *   light again";
 * and heeling past her best costs the hull (heelFactor).
 * Done twice a second: for the polar's standard crew (the reference: a boat sailed as the polar sails it), and for her
 * own crew as they are (how many, how heavy, how tired), whose fastest step the crew then works toward (trimSails).
 * (Once a second.)
 * The speed factor is the square root of her push, with her sails as they are, against the polar crew's.
 */
function powerFactor(b: Boat, jibOn: { trim: NonNullable<Boat['trim']['jib']>; shape: Shape } | null, twa: number, ww: { from: number; kt: number }, disp: number, dt: number, plan: SailPlan): number {
  const tws = ww.kt;
  b.powerT = (b.powerT ?? 0) - dt;
  if (b.powerK != null && b.powerT > 0) return b.powerK;
  b.powerT = 1; // (once a second: her sails' power changes slowly)
  // (the search, and her sails against it, in the wind rounded to a knot and 2°: cached, and like for like)
  const twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2);
  const ref = fastestStep(twsR, twaR, plan, STANDARD_DISP, crewMass(DEFAULT_CREW), standardCrewMoment(), crewBestHeel(twaR, twsR), sittingMoment(DEFAULT_CREW));
  b.depowerBest = herFastestStep(b, twa, tws, plan, disp).d;
  // hers: her sails as they are (no fuller than the full-power shape: fuller gains nothing the polar doesn't have, the
  // shape's own cost is shapeEfficiency's), at the crew's intended sheeting (a sheet set wrong, by you or the crew, is
  // counted once, in the step's trimDrive) and her own heel; her heel's cost to the hull is in the target already
  // (heelFactor), and her rudder's drag acts on her as a force in the step
  // (the polar has the polar crew's heel in it already: her speed is the polar's times heelFactor(hers) / heelFactor(theirs))
  const dNow = sailPush(tws, twa, plan, b.shape.main, jibOn ? jibOn.shape : null, b.heelMag ?? 0, b.depower ?? 0), dRef = ref.p * heelFactor(ref.h) ** 2;
  b.powerK = dRef > 1 ? clamp(Math.sqrt(Math.max(0, dNow) / dRef), 0.5, 1.05) : 1;
  return b.powerK;
}
/** The fastest depowering step for her own crew as they are (how many, how heavy, how tired), in this wind. */
function herFastestStep(b: Boat, twa: number, tws: number, plan: SailPlan, disp: number): StepPick {
  const cs = b.crew, spec = cs?.spec ?? DEFAULT_CREW, twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2);
  return fastestStep(twsR, twaR, plan, disp, crewMass(spec), hikingMoment(spec, cs?.people.map(p => p.fatigue)), crewBestHeel(twaR, twsR, crewSkill(cs)), sittingMoment(spec));
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
    return { d, h, p, speed: Math.sqrt(Math.max(0, p - rudderDrag(helm, vP))) * heelFactor(h) };
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

/** Roll her toward the heel `heelLee` (deg, + to leeward) as a damped oscillator (balance.ts rollStep). */
function rollTo(b: Boat, heelLee: number, rel: number, disp: number, dt: number): void {
  void rel;
  const side = b.tack === 'S' ? 1 : -1; // b.heel is + to port: to leeward with the wind over the starboard side (by her tack, as the boom)
  const r = rollStep(b.heel ?? 0, b.heelRate ?? 0, heelLee * side, disp, dt, b.v, b.crew ? crewMass(b.crew.spec) : 240);
  b.heel = r.heel; b.heelRate = r.rate; b.heelMag = b.heel * side;
}

/** Move her over the ground (through the water plus the current), and stop her on a dock or the shore. */
function travel(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  const u = V(b.h), ww = b.ww;
  // sternway (pushed off astern): she coasts back, slowing on the water's drag, which is slight at a walking pace (a
  // two-tonne boat glides a long way: from a shove, three or four lengths in most of a minute)
  const ast = b.astern ?? 0;
  if (ast > 0) { b.astern = ast - (ASTERN_DRAG.c0 + ASTERN_DRAG.c1 * ast) * dt; if (b.astern < 0.02) b.astern = 0; }
  // sideways too, while she's slipping (hove to)
  const sw = b.sway ?? 0, stb = V(b.h + 90);
  b.vx = u.x * (b.v - ast) + stb.x * sw + b.cur.x; b.vy = u.y * (b.v - ast) + stb.y * sw + b.cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  const bump = (msg: string) => { if (b.isUser && t - groundToast.t > 4) { groundToast.t = t; emit({ type: 'toast', msg }); } };
  if (b.pushing) { /* being walked out of her own slip by hand: nothing to hit */ }
  else if (onLand(bow(b))) { // (the message by what she hit, a dock or the shore, not by where she is)
    b.x -= u.x * 0.6; b.y -= u.y * 0.6; b.v = 0; b.sway = 0;
    bump(hitsHarbor(bow(b)) ? 'Bump: your bow hit the dock. Steer off and back into the fairway.' : 'Aground! Steer back out to open water.');
  } else if (ast > 0 && onLand(stern(b))) {
    b.x += u.x * 0.4; b.y += u.y * 0.4; b.astern = 0;
    bump(hitsHarbor(stern(b)) ? 'Bump: your stern hit the dock going astern.' : 'Your stern touched bottom going astern.');
  }
  // trim to the apparent wind: wind over the water minus the boat's own motion through it (and the rig's as she rolls,
  // so the flags, the windex and the crew see what the sails see)
  const aw = apparent(ww.from, ww.kt, b.h, b.v, sw + rigSway(b), b.heel ?? 0);
  b.awa = aw.awa; b.arel = aw.arel; b.aws = aw.aws;
}

/** Where the boom and jib are drawn: easing toward their sheet angles. */
function sailVisuals(b: Boat, plan: SailPlan, dt: number): void {
  // The main goes to leeward for the tack the boat is on (so sailing a little by the lee it stays put).
  const side = b.tack === 'S' ? -1 : 1;
  // The sails sit at their sheet angles; easing to luff lets them right out.
  const boomT = b.luff ? SAILS.main.max : b.sheets.main;
  // Jib: to leeward normally (to windward when backed); poled out square to windward when wing-on-wing; hanging
  // centred while the crew works the pole.
  const jibT = plan === 'wing' ? -side * 82 : plan === 'main' ? side * 10 : side * (b.luff && !b.jibBacked ? SAILS.jib.max : b.sheets.jib);
  b.boom += (side * boomT - b.boom) * Math.min(1, dt * 4);
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
export const LINES: readonly LineKey[] = ['mainsheet', 'traveller', 'backstay', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibsheet', 'jibsheetW', 'car'];
/** Whether you have this line (otherwise the crew works it). */
export function byHand(b: Boat, k: LineKey): boolean {
  if (!b.isUser) return false;
  const h = b.hand?.[k]; if (h != null) return h;
  if (k === 'jibsheetW') return false; // the lazy sheet is the crew's until you haul on it
  return k === 'mainsheet' || k === 'jibsheet' ? b.manualTrim : b.trimAll;
}
/** The lines you have. */
export const linesByHand = (b: Boat): LineKey[] => LINES.filter(k => byHand(b, k));
/** Take a line (you're working it), or give it back to the crew (`mine` false): they carry on from where it is. */
export function takeLine(b: Boat, k: LineKey, mine = true): void {
  (b.hand ??= {})[k] = mine;
  if (!mine && k !== 'car') { delete b.ctlCmd[k]; if (b.ctlTarget) delete b.ctlTarget[k]; }
}
/** Every line back to the crew. */
export function allToCrew(b: Boat): void { b.manualTrim = b.trimAll = false; b.hand = {}; b.ctlCmd = {}; b.ctlTarget = {}; }

/**
 * At a tack (or gybe) the jib sheets stay on their own sides. The crew lets the old sheet fly and tails the new one, so
 * the leeward sheet carries on where it was. But a sheet you hold is yours: hold the windward sheet through the turn and
 * the sheets change roles as they really do, the one you had trimmed becoming the windward sheet with the jib aback
 * (the classic way to heave to: tack and leave the jib sheet made fast).
 */
function jibSheetsAtTack(b: Boat, emit: Emit): void {
  if (!byHand(b, 'jibsheetW')) return;
  const c = b.ctl, h = b.hand ??= {}, leeMine = byHand(b, 'jibsheet');
  [c.jibsheet, c.jibsheetW] = [c.jibsheetW, c.jibsheet];
  h.jibsheet = true; h.jibsheetW = leeMine;
  if (b.ctlTarget) { const tl = b.ctlTarget.jibsheet, tw = b.ctlTarget.jibsheetW; delete b.ctlTarget.jibsheet; delete b.ctlTarget.jibsheetW; if (tw != null) b.ctlTarget.jibsheet = tw; if (tl != null && leeMine) b.ctlTarget.jibsheetW = tl; }
  if (leeMine && c.jibsheetW < 0.6) emit({ type: 'toast', msg: 'You held the jib sheet through the tack: the jib is aback. Ease the windward sheet (or tap its Auto) to let it across.', ms: 5000 });
  else if (!leeMine) emit({ type: 'toast', msg: 'The jib sheets changed sides: the one you held is now the leeward sheet, and yours to trim (tap its Auto to give it to the crew).', ms: 5000 });
}

/**
 * Work the sheets and every other control. The crew trims each sail toward its best sheet angle at a human
 * pace, reacting to the apparent wind with a short lag (so a quick luff or bear-away shows on the telltales
 * before they catch up), and sets the other controls for the conditions; or you do it yourself. The jib sheet
 * comes in on a winch, slower as the breeze builds. Then work out each sail's angle of attack and shape.
 */
type Ctl = Exclude<keyof Controls, 'car'>;
function trimSails(b: Boat, awa: number, plan: SailPlan, dt: number): void {
  if (!b.crewReady) b.awaSlow = awa; // (set up before she sails: for the wind she has)
  b.awaSlow += (awa - b.awaSlow) * Math.min(1, dt / CREW_LAG);
  const c = b.ctl, tws = b.ww.kt;
  // working a line takes that line, and only that line, off the crew
  if (b.isUser) for (const k of [...Object.keys(b.ctlCmd), ...Object.keys(b.ctlTarget ?? {})] as Ctl[]) if (b.ctlCmd[k] || b.ctlTarget?.[k] != null) takeLine(b, k);
  // the crew work the lines they have one job at a time, each person at their own pace (crewWork.ts): `on` is filled in
  // below, once the crew's targets are known
  let on: Partial<Record<Ctl, { pace: number; to: number }>> = {};
  const move = (k: Ctl, to: number, rate = CONTROL_RATE[k]) => { const j = on[k], d = (j ? j.to : to) - c[k]; c[k] += Math.sign(d) * Math.min(Math.abs(d), rate * (j?.pace ?? 1) * dt); };
  const hand = (k: Ctl, rate = CONTROL_RATE[k]) => {
    const cmd = b.ctlCmd[k] ?? 0, tg = b.ctlTarget?.[k];
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
  if (!b.crewPlan || !(b.crewPlanT! > 0)) {
    // the lines you hold stay where you have them, and the crew sets the rest around them (your sheets at their angles)
    const fixed: Partial<CrewSettings> & { mainsheet?: number } = {};
    if (b.isUser) {
      for (const k of ['traveller', 'vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham'] as const) if (byHand(b, k)) fixed[k] = c[k];
      if (byHand(b, 'car')) { const lazy = c.car[b.tack]; fixed.carFore = lazy.fore; fixed.carIn = lazy.ins; }
    }
    if (b.isUser && byHand(b, 'mainsheet')) fixed.mainsheet = c.mainsheet;
    // heaving to (the windward jib sheet yours, or the jib aback): your eased main is deliberate, the car stays put
    if ((b.hove || byHand(b, 'jibsheetW')) && !byHand(b, 'traveller')) fixed.traveller = c.traveller;
    const mAng = wantMain, jAng = b.isUser && byHand(b, 'jibsheet') ? clamp(jibAngle(c, b.tack), SAILS.jib.min, SAILS.jib.max) : wantJib;
    b.crewPlan = crewSolve(tws, b.awaSlow, b.tack, mAng, jAng, b.crewPlan ?? undefined, cond?.main, cond?.jib, b.aws / KT, b.depower, fixed); b.crewPlanT = 1;
    b.crewWorth = planWorth(c, b.crewPlan, tws, b.awaSlow, b.tack, mAng, jAng, cond?.main, cond?.jib, b.aws / KT, b.depower, fixed.mainsheet);
  }
  b.crewPlanT = (b.crewPlanT ?? 0) - dt;
  const t = b.crewPlan;
  // what the crew would do with each line they have; then who gets to it, and when (crewWork.ts)
  const backing0 = byHand(b, 'jibsheetW') && jibClew({ ...c, jibsheet: 1 }, b.tack) < jibAngle(c, b.tack);
  const want: Partial<Record<Ctl, number>> = {};
  // (a line is moved only if it's worth the trip: a skilled crew sees smaller gains, ~0.1% of drive; a novice ~0.4%)
  const minGain = 0.001 + 0.003 * (1 - crewSkill(b.crew));
  for (const k of ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'traveller'] as const) if (!byHand(b, k)) want[k] = (b.crewWorth?.[k] ?? 1) >= minGain || !b.crewReady ? t[k] : c[k];
  if (!byHand(b, 'mainsheet')) want.mainsheet = mainsheetFor(wantMain, c.traveller);
  if (!byHand(b, 'jibsheetW')) want.jibsheetW = 1;
  if (!byHand(b, 'jibsheet')) want.jibsheet = backing0 ? 1 : jibsheetFor(wantJib, c, b.tack);
  // the lazy (windward) jib car: the crew's plan for it (they move it only when it's worth it), or yours
  if (byHand(b, 'car')) b.carPlan = null; else if (!b.carPlan || b.carPlan.fore !== t.carFore || b.carPlan.ins !== t.carIn) b.carPlan = { fore: t.carFore, ins: t.carIn };
  // (the first time: she was set up before she sailed, so the crew's lines start where they want them)
  if (!b.crewReady) {
    b.crewReady = true;
    for (const k of Object.keys(want) as Ctl[]) if (k !== 'mainsheet' && k !== 'jibsheet' && k !== 'jibsheetW') c[k] = want[k]!; // (the sheets are trimmed to the wind as she goes)
    if (b.carPlan) { c.car.S = { ...b.carPlan }; c.car.P = { ...b.carPlan }; }
  }
  on = crewJobs(b, want, dt);
  for (const k of ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham'] as const) {
    if (byHand(b, k)) hand(k); else move(k, want[k]!);
  }
  // the main: traveller and mainsheet together, for the boom angle and the leech tension (whichever the crew has)
  if (byHand(b, 'traveller')) hand('traveller'); else move('traveller', want.traveller!);
  if (byHand(b, 'mainsheet')) hand('mainsheet'); else move('mainsheet', mainsheetFor(wantMain, c.traveller), CONTROL_RATE.mainsheet * 1.5);
  // the jib sheets, one on each winch: hauling in on a winch is slow in a breeze, easing is quick
  const going = (k: 'jibsheet' | 'jibsheetW') => b.ctlCmd[k] ?? (b.ctlTarget?.[k] != null ? b.ctlTarget[k]! - c[k] : 0);
  // a windward sheet you've hauled and then eased right off again is the crew's lazy sheet once more
  if (b.hand?.jibsheetW) {
    if (c.jibsheetW < 0.9) b.wHauled = true;
    else if (b.wHauled && c.jibsheetW > 0.95 && !b.ctlCmd.jibsheetW && b.ctlTarget?.jibsheetW == null) { b.hand.jibsheetW = false; b.wHauled = false; }
  } else b.wHauled = false;
  const wMine = byHand(b, 'jibsheetW');
  // (until it comes tight a lazy sheet is just slack, taken in hand over hand in a second or two; only the last of it
  // needs the winch)
  const wSlack = jibClew({ ...c, jibsheet: 1 }, b.tack) > jibAngle(c, b.tack) + 3;
  if (wMine) hand('jibsheetW', wSlack ? SLACK_RATE : CONTROL_RATE.jibsheetW * winchFactor(tws, going('jibsheetW') < 0));
  else move('jibsheetW', 1, CONTROL_RATE.jibsheetW * winchFactor(tws, false)); // the crew leaves the lazy sheet slack
  // you're holding the clew to windward with the windward sheet (backing the jib): the crew lets the leeward one fly
  const backing = wMine && jibClew({ ...c, jibsheet: 1 }, b.tack) < jibAngle(c, b.tack);
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
  const ms = mainShape(c, tws, cond?.main, b.aws / KT), js = plan === 'jib' ? jibShape(c, tws, b.tack, cond?.jib, b.aws / KT) : null;
  const em = shapeEfficiency(ms, targetShape('main', tws, awa, b.depower)), ej = js ? shapeEfficiency(js, targetShape('jib', tws, awa, b.depower)) : 1;
  b.shape = { main: ms, jib: js, eff: js ? SAILS.main.share * em + SAILS.jib.share * ej : em };
}

/**
 * Ask for the lazy (windward) jib car one pin further: fore–aft (+1 aft) or athwartships (+1 outboard). The crew goes
 * forward and moves it (crewWork.ts): it takes a while, and their weight goes with them. Nobody can move the loaded one.
 */
export function moveLazyCar(b: Boat, fore: number, ins: number): void {
  const lazy = b.ctl.car[b.tack], from = b.carCmd ?? { fore: lazy.fore, ins: lazy.ins };
  b.carCmd = { fore: clamp(from.fore + fore, 0, CAR_FORE_PINS - 1), ins: clamp(from.ins + ins, 0, CAR_IN_PINS - 1) };
}

/** Apparent wind: wind over the water minus the boat's motion through it. aws in m/s, arel signed (+ from starboard). */
export function apparent(from: number, windKt: number, h: number, v: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  // (sway: her sideways speed, m/s, + to starboard, when she's slipping hove to, and the rig's as she rolls. Heeled, the
  // masthead's windex and flags lean with the mast and see the wind across the boat shortened by cos(heel), as the sails
  // do: ORC eqs. 7.2–7.3)
  const vt = windKt * KT, rel = wrap(from - h) * D2R;
  const along = vt * Math.cos(rel) + v, across = vt * Math.sin(rel) * Math.cos(heelDeg * D2R) + sway;
  const arel = Math.atan2(across, along) / D2R;
  return { aws: Math.hypot(along, across), arel, awa: Math.abs(arel) };
}

/**
 * The apparent wind the sails see (ORC VPP Documentation 2025, §7.1). The true wind is the 10 m wind (as the polar's
 * and the wind fields'); at the sails' centre of effort it's less, by the log profile over the water VT(z) =
 * VT(10 m)·ln(z/z0)/ln(10/z0) with z0 = 0.005 m (eq. 7.1): 4.3 m up, 89% of it. And heeled, the mast plane leans
 * away from the wind across the boat: only that component is reduced, by cos φ (eqs. 7.2–7.3). `heelDeg` signed, either way.
 */
const GRADIENT = Math.log(CE_ABOVE_WL / 0.005) / Math.log(10 / 0.005);
export function sailWind(from: number, windKt: number, h: number, v: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  const vt = windKt * KT * GRADIENT, rel = wrap(from - h) * D2R, c = Math.cos(heelDeg * D2R);
  const along = vt * Math.cos(rel) + v, across = vt * Math.sin(rel) * c + sway; // (+: air coming from ahead / from starboard)
  const arel = Math.atan2(across, along) / D2R;
  return { aws: Math.hypot(along, across), arel, awa: Math.abs(arel) };
}

/** Heading a user tack/gybe aims for: the matching course on the other side of the wind. */
export function tackTarget(b: Boat): { dir: number; target: number } {
  const rel = b.rel, twa = b.twa, from = b.ww.from;
  // upwind: tack to the same angle on the other side, but at least close-hauled; downwind: gybe to the mirror angle
  if (twa < 100) return { dir: rel >= 0 ? 1 : -1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.max(beatFor(b), Math.min(twa, 60))) };
  return { dir: rel >= 0 ? -1 : 1, target: n360(from + rel) };
}
